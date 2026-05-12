/**
 * PiAdapterLive - In-process Pi SDK adapter for the provider adapter contract.
 *
 * Wraps `@mariozechner/pi-coding-agent` AgentSession behind the generic provider
 * adapter interface and emits canonical runtime events.
 *
 * @module PiAdapterLive
 */
import { randomUUID } from "node:crypto";

import {
  EventId,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSession,
  RuntimeItemId,
  RuntimeRequestId,
  ThreadId,
  type ToolLifecycleItemType,
  TurnId,
} from "@t3tools/contracts";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import {
  type AgentSession,
  SessionManager,
  createAgentSessionFromServices,
} from "@mariozechner/pi-coding-agent";
import { Effect, Exit, Layer, Queue, Ref, Scope, Stream } from "effect";

import { ServerSettingsService } from "../../serverSettings.ts";
import { type EventNdjsonLogger, makeEventNdjsonLogger } from "./EventNdjsonLogger.ts";
import {
  ProviderAdapterSessionClosedError,
  ProviderAdapterSessionNotFoundError,
} from "../Errors.ts";
import { PiAdapter, type PiAdapterShape } from "../Services/PiAdapter.ts";
import { createPiServices, parsePiModelSlug } from "../piSdk.ts";
import { createT3PiTools } from "../piTools.ts";

const PROVIDER = "pi" as const;

interface PiResumeState {
  readonly schemaVersion?: number;
  readonly messages?: AgentMessage[];
  readonly modelSlug?: string;
  readonly turnCount?: number;
}

interface PiTurnSnapshot {
  readonly id: TurnId;
  readonly items: Array<unknown>;
  /** SessionManager leaf entry id after this turn completed. Used for rollback via branch(). */
  readonly leafId: string | null;
}

interface PendingApproval {
  readonly toolName: string;
  readonly args: unknown;
  readonly resolve: (decision: ProviderApprovalDecision) => void;
  readonly promise: Promise<ProviderApprovalDecision>;
}

interface PiSessionContext {
  session: ProviderSession;
  piSession: AgentSession;
  unsubscribe: (() => void) | undefined;
  readonly pendingApprovals: Map<string, PendingApproval>;
  readonly turns: Array<PiTurnSnapshot>;
  activeTurnId: TurnId | undefined;
  readonly stopped: Ref.Ref<boolean>;
  readonly sessionScope: Scope.Closeable;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildEventBase(input: {
  readonly threadId: ThreadId;
  readonly turnId?: TurnId | undefined;
  readonly itemId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly createdAt?: string | undefined;
}): Pick<
  ProviderRuntimeEvent,
  "eventId" | "provider" | "threadId" | "createdAt" | "turnId" | "itemId" | "requestId"
> {
  return {
    eventId: EventId.make(randomUUID()),
    provider: PROVIDER,
    threadId: input.threadId,
    createdAt: input.createdAt ?? nowIso(),
    ...(input.turnId ? { turnId: input.turnId } : {}),
    ...(input.itemId ? { itemId: RuntimeItemId.make(input.itemId) } : {}),
    ...(input.requestId ? { requestId: RuntimeRequestId.make(input.requestId) } : {}),
  };
}

function toToolLifecycleItemType(toolName: string): ToolLifecycleItemType {
  const normalized = toolName.toLowerCase();
  if (
    normalized.includes("bash") ||
    normalized.includes("command") ||
    normalized.includes("shell")
  ) {
    return "command_execution";
  }
  if (
    normalized.includes("edit") ||
    normalized.includes("write") ||
    normalized.includes("patch") ||
    normalized.includes("file")
  ) {
    return "file_change";
  }
  if (normalized.includes("web")) {
    return "web_search";
  }
  if (normalized.includes("mcp")) {
    return "mcp_tool_call";
  }
  if (normalized.includes("agent") || normalized.includes("task")) {
    return "collab_agent_tool_call";
  }
  return "dynamic_tool_call";
}

function readPiResumeState(resumeCursor: unknown): PiResumeState | undefined {
  if (!resumeCursor || typeof resumeCursor !== "object") {
    return undefined;
  }
  const cursor = resumeCursor as Record<string, unknown>;
  return {
    ...(typeof cursor.schemaVersion === "number" ? { schemaVersion: cursor.schemaVersion } : {}),
    ...(Array.isArray(cursor.messages) ? { messages: cursor.messages as AgentMessage[] } : {}),
    ...(typeof cursor.modelSlug === "string" ? { modelSlug: cursor.modelSlug } : {}),
    ...(typeof cursor.turnCount === "number" ? { turnCount: cursor.turnCount } : {}),
  };
}

function updateProviderSession(
  context: PiSessionContext,
  patch: Partial<ProviderSession>,
): ProviderSession {
  const nextSession = {
    ...context.session,
    ...patch,
    updatedAt: nowIso(),
  } as ProviderSession;
  context.session = nextSession;
  return nextSession;
}

const stopPiContext = Effect.fn("stopPiContext")(function* (context: PiSessionContext) {
  if (yield* Ref.getAndSet(context.stopped, true)) {
    return;
  }
  if (context.unsubscribe) {
    context.unsubscribe();
    context.unsubscribe = undefined;
  }
  context.piSession.dispose();
  yield* Scope.close(context.sessionScope, Exit.void);
});

export interface PiAdapterLiveOptions {
  readonly nativeEventLogPath?: string;
  readonly nativeEventLogger?: EventNdjsonLogger;
}

export function makePiAdapterLive(options?: PiAdapterLiveOptions) {
  return Layer.effect(
    PiAdapter,
    Effect.gen(function* () {
      const _serverSettings = yield* ServerSettingsService;
      const nativeEventLogger =
        options?.nativeEventLogger ??
        (options?.nativeEventLogPath !== undefined
          ? yield* makeEventNdjsonLogger(options.nativeEventLogPath, { stream: "native" })
          : undefined);
      const managedNativeEventLogger =
        options?.nativeEventLogger === undefined ? nativeEventLogger : undefined;
      const runtimeEvents = yield* Queue.unbounded<ProviderRuntimeEvent>();
      const sessions = new Map<ThreadId, PiSessionContext>();

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          const contexts = [...sessions.values()];
          sessions.clear();
          yield* Effect.forEach(contexts, (context) => Effect.ignoreCause(stopPiContext(context)), {
            concurrency: "unbounded",
            discard: true,
          });
          if (managedNativeEventLogger !== undefined) {
            yield* managedNativeEventLogger.close();
          }
        }),
      );

      const emit = (event: ProviderRuntimeEvent) =>
        Queue.offer(runtimeEvents, event).pipe(Effect.asVoid);

      const ensureSession = (threadId: ThreadId): PiSessionContext => {
        const session = sessions.get(threadId);
        if (!session) {
          throw new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId });
        }
        if (Ref.getUnsafe(session.stopped)) {
          throw new ProviderAdapterSessionClosedError({ provider: PROVIDER, threadId });
        }
        return session;
      };

      const startSession: PiAdapterShape["startSession"] = (input) =>
        Effect.gen(function* () {
          const threadId = input.threadId;
          const existingContext = sessions.get(threadId);
          if (existingContext) {
            yield* stopPiContext(existingContext);
            sessions.delete(threadId);
          }

          const cwd = input.cwd?.trim() || process.cwd();
          const modelSlug =
            input.modelSelection?.provider === "pi" ? input.modelSelection.model : undefined;
          const resumeState = readPiResumeState(input.resumeCursor);

          // Resolve model slug from selection or resume cursor
          const resolvedModelSlug = modelSlug ?? resumeState?.modelSlug;

          // Create Pi SDK services for this working directory (handles auth/models/settings)
          const services = yield* Effect.promise(() => createPiServices(cwd));

          // Resolve model from registry using provider/modelId slug
          let model: ReturnType<typeof services.modelRegistry.find> | undefined;
          if (resolvedModelSlug) {
            const parsed = parsePiModelSlug(resolvedModelSlug);
            if (parsed) {
              model = services.modelRegistry.find(parsed.provider, parsed.modelId);
            }
          }

          const pendingApprovals = new Map<string, PendingApproval>();
          const stoppedRef = yield* Ref.make(false);
          const sessionScope = yield* Scope.make();

          // Build requestApproval callback for the T3 approval gate.
          // Uses sessions.get(threadId) for late-bound activeTurnId access.
          const requestApproval = async (
            toolName: string,
            args: unknown,
          ): Promise<ProviderApprovalDecision> => {
            const requestId = randomUUID();
            let resolveDecision!: (decision: ProviderApprovalDecision) => void;
            const decisionPromise = new Promise<ProviderApprovalDecision>((resolve) => {
              resolveDecision = resolve;
            });
            pendingApprovals.set(requestId, {
              toolName,
              args,
              resolve: resolveDecision,
              promise: decisionPromise,
            });

            const normalizedTool = toolName.toLowerCase();
            await Effect.runPromise(
              emit({
                ...buildEventBase({
                  threadId,
                  turnId: sessions.get(threadId)?.activeTurnId,
                  requestId,
                }),
                type: "request.opened",
                payload: {
                  requestType:
                    normalizedTool.includes("bash") || normalizedTool.includes("command")
                      ? "command_execution_approval"
                      : "file_change_approval",
                  detail: JSON.stringify(args ?? {}).slice(0, 400),
                },
              }),
            );

            const decision = await decisionPromise;
            pendingApprovals.delete(requestId);
            return decision;
          };

          // Create T3-approval-gated Pi tools replacing Pi's built-in tool set
          const t3PiTools = createT3PiTools(cwd, input.runtimeMode, requestApproval);

          // Create AgentSession via SDK (in-memory session manager — T3 owns persistence)
          const { session: piSession } = yield* Effect.promise(() =>
            createAgentSessionFromServices({
              services,
              sessionManager: SessionManager.inMemory(),
              ...(model ? { model } : {}),
              noTools: "builtin",
              customTools: t3PiTools,
            }),
          );

          const session: ProviderSession = {
            provider: PROVIDER,
            status: "ready",
            runtimeMode: input.runtimeMode,
            ...(modelSlug ? { model: modelSlug } : {}),
            threadId,
            resumeCursor: {
              schemaVersion: 2,
              modelSlug: resolvedModelSlug,
              turnCount: resumeState?.turnCount ?? 0,
            },
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };

          const context: PiSessionContext = {
            session,
            piSession,
            unsubscribe: undefined,
            pendingApprovals,
            turns: [],
            activeTurnId: undefined,
            stopped: stoppedRef,
            sessionScope,
          };

          // Subscribe to AgentSession events and map to T3 runtime events
          const unsub = piSession.subscribe((event) => {
            if (Ref.getUnsafe(context.stopped)) return;

            Effect.runPromise(
              Effect.gen(function* () {
                const turnId = context.activeTurnId;
                switch (event.type) {
                  case "message_update": {
                    const ame = (event as any).assistantMessageEvent;
                    if (ame?.type === "text_delta" && ame.delta) {
                      yield* emit({
                        ...buildEventBase({ threadId, turnId }),
                        type: "content.delta",
                        payload: {
                          streamKind: "assistant_text",
                          delta: ame.delta,
                        },
                      });
                    } else if (ame?.type === "thinking_delta" && ame.delta) {
                      yield* emit({
                        ...buildEventBase({ threadId, turnId }),
                        type: "content.delta",
                        payload: {
                          streamKind: "reasoning_text",
                          delta: ame.delta,
                        },
                      });
                    }
                    break;
                  }
                  case "tool_execution_start": {
                    const ev = event as any;
                    const itemType = toToolLifecycleItemType(ev.toolName);
                    yield* emit({
                      ...buildEventBase({
                        threadId,
                        turnId,
                        itemId: ev.toolCallId,
                      }),
                      type: "item.started",
                      payload: {
                        itemType,
                        title: ev.toolName,
                        detail: JSON.stringify(ev.args ?? {}).slice(0, 400),
                      },
                    });
                    break;
                  }
                  case "tool_execution_end": {
                    const ev = event as any;
                    const itemType = toToolLifecycleItemType(ev.toolName);
                    yield* emit({
                      ...buildEventBase({
                        threadId,
                        turnId,
                        itemId: ev.toolCallId,
                      }),
                      type: "item.completed",
                      payload: {
                        itemType,
                        status: ev.isError ? "failed" : "completed",
                        title: ev.toolName,
                        detail:
                          typeof ev.result === "string"
                            ? ev.result.slice(0, 1000)
                            : JSON.stringify(ev.result ?? "").slice(0, 1000),
                      },
                    });
                    break;
                  }
                  case "turn_end": {
                    if (turnId) {
                      const ev = event as any;
                      context.turns.push({
                        id: turnId,
                        items: ev.toolResults ?? [],
                        leafId: context.piSession.sessionManager.getLeafId(),
                      });
                    }
                    break;
                  }
                  case "agent_end": {
                    // Save messages and model into resume cursor for future sessions
                    const currentModel = context.piSession.model;
                    const currentModelSlug = currentModel
                      ? `${currentModel.provider}/${currentModel.id}`
                      : resolvedModelSlug;
                    updateProviderSession(context, {
                      status: "ready",
                      resumeCursor: {
                        schemaVersion: 2,
                        messages: context.piSession.messages,
                        modelSlug: currentModelSlug,
                        turnCount: context.turns.length,
                      },
                    });
                    break;
                  }
                  default:
                    // queue_update, compaction_*, auto_retry_*, session_info_changed,
                    // thinking_level_changed — ignored in v2
                    break;
                }
              }).pipe(Effect.ignore),
            );
          });
          context.unsubscribe = unsub;

          sessions.set(threadId, context);

          yield* emit({
            ...buildEventBase({ threadId }),
            type: "session.started",
            payload: {},
          });

          return session;
        });

      const sendTurn: PiAdapterShape["sendTurn"] = (input) =>
        Effect.gen(function* () {
          const context = ensureSession(input.threadId);
          const turnId = TurnId.make(randomUUID());
          context.activeTurnId = turnId;

          updateProviderSession(context, {
            status: "running",
            activeTurnId: turnId,
          });

          yield* emit({
            ...buildEventBase({ threadId: input.threadId, turnId }),
            type: "turn.started",
            payload: {},
          });

          // Run the prompt in a forked fiber
          yield* Effect.promise(async () => {
            try {
              await context.piSession.prompt(input.input?.trim() ?? "");
            } catch (err: any) {
              if (!Ref.getUnsafe(context.stopped)) {
                await Effect.runPromise(
                  emit({
                    ...buildEventBase({ threadId: input.threadId, turnId }),
                    type: "turn.completed",
                    payload: { state: "failed", errorMessage: err?.message ?? "Pi agent failed" },
                  }),
                );
              }
              return;
            }

            if (!Ref.getUnsafe(context.stopped)) {
              await Effect.runPromise(
                emit({
                  ...buildEventBase({ threadId: input.threadId, turnId }),
                  type: "turn.completed",
                  payload: { state: "completed" },
                }),
              );
              context.activeTurnId = undefined;
              updateProviderSession(context, { status: "ready" });
            }
          }).pipe(Effect.forkIn(context.sessionScope));

          return {
            threadId: input.threadId,
            turnId,
            resumeCursor: context.session.resumeCursor,
          };
        });

      const interruptTurn: PiAdapterShape["interruptTurn"] = (threadId) =>
        Effect.gen(function* () {
          const context = ensureSession(threadId);
          yield* Effect.promise(() => context.piSession.abort().catch(() => {}));
          const turnId = context.activeTurnId;
          context.activeTurnId = undefined;
          updateProviderSession(context, { status: "ready" });

          if (turnId) {
            yield* emit({
              ...buildEventBase({ threadId, turnId }),
              type: "turn.completed",
              payload: { state: "interrupted" },
            });
          }
        });

      const respondToRequest: PiAdapterShape["respondToRequest"] = (
        threadId,
        requestId,
        decision,
      ) =>
        Effect.sync(() => {
          const context = ensureSession(threadId);
          const pending = context.pendingApprovals.get(requestId);
          if (!pending) {
            return;
          }
          pending.resolve(decision);
          context.pendingApprovals.delete(requestId);
        });

      const respondToUserInput: PiAdapterShape["respondToUserInput"] = (
        _threadId,
        _requestId,
        _answers,
      ) => Effect.void;

      const stopSession: PiAdapterShape["stopSession"] = (threadId) =>
        Effect.gen(function* () {
          const context = sessions.get(threadId);
          if (!context) {
            return;
          }
          yield* stopPiContext(context);
          sessions.delete(threadId);

          yield* emit({
            ...buildEventBase({ threadId }),
            type: "session.exited",
            payload: { reason: "stopped", recoverable: true, exitKind: "graceful" },
          });
        });

      const listSessions: PiAdapterShape["listSessions"] = () =>
        Effect.sync(() => [...sessions.values()].map((context) => context.session));

      const hasSession: PiAdapterShape["hasSession"] = (threadId) =>
        Effect.sync(() => sessions.has(threadId));

      const readThread: PiAdapterShape["readThread"] = (threadId) =>
        Effect.sync(() => {
          const context = ensureSession(threadId);
          return {
            threadId,
            turns: context.turns,
          };
        });

      const rollbackThread: PiAdapterShape["rollbackThread"] = (threadId, numTurns) =>
        Effect.sync(() => {
          const context = ensureSession(threadId);
          const removedCount = Math.min(numTurns, context.turns.length);
          const targetIndex = context.turns.length - removedCount - 1;
          const targetSnapshot = targetIndex >= 0 ? context.turns[targetIndex] : undefined;
          context.turns.splice(context.turns.length - removedCount, removedCount);

          // Move the session leaf pointer back to restore prior conversation state
          if (removedCount > 0) {
            if (targetSnapshot?.leafId) {
              context.piSession.sessionManager.branch(targetSnapshot.leafId);
            } else {
              context.piSession.sessionManager.resetLeaf();
            }
            // Sync agent messages from the restored session context
            const sessionCtx = context.piSession.sessionManager.buildSessionContext();
            context.piSession.agent.state.messages = sessionCtx.messages;
          }

          return {
            threadId,
            turns: context.turns,
          };
        });

      const stopAll: PiAdapterShape["stopAll"] = () =>
        Effect.gen(function* () {
          const contexts = [...sessions.values()];
          sessions.clear();
          yield* Effect.forEach(contexts, (context) => Effect.ignoreCause(stopPiContext(context)), {
            concurrency: "unbounded",
            discard: true,
          });
        });

      return {
        provider: PROVIDER,
        capabilities: { sessionModelSwitch: "in-session" },
        startSession,
        sendTurn,
        interruptTurn,
        respondToRequest,
        respondToUserInput,
        stopSession,
        listSessions,
        hasSession,
        readThread,
        rollbackThread,
        stopAll,
        streamEvents: Stream.fromQueue(runtimeEvents),
      } satisfies PiAdapterShape;
    }),
  );
}

export const PiAdapterLive = makePiAdapterLive();
