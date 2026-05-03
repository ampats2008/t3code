/**
 * PiAdapterLive - In-process Pi SDK adapter for the provider adapter contract.
 *
 * Wraps `@mariozechner/pi-agent-core` Agent class behind the generic provider
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
import type { KnownProvider } from "@mariozechner/pi-ai";
import { Effect, Exit, Layer, Queue, Ref, Scope, Stream } from "effect";

import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { type EventNdjsonLogger, makeEventNdjsonLogger } from "./EventNdjsonLogger.ts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionClosedError,
  ProviderAdapterSessionNotFoundError,
} from "../Errors.ts";
import { PiAdapter, type PiAdapterShape } from "../Services/PiAdapter.ts";

const PROVIDER = "pi" as const;

interface PiResumeState {
  readonly messages?: AgentMessage[];
  readonly modelSlug?: string;
  readonly turnCount?: number;
}

interface PiTurnSnapshot {
  readonly id: TurnId;
  readonly items: Array<unknown>;
}

interface PendingApproval {
  readonly toolName: string;
  readonly args: unknown;
  readonly resolve: (decision: ProviderApprovalDecision) => void;
  readonly promise: Promise<ProviderApprovalDecision>;
}

interface PiSessionContext {
  session: ProviderSession;
  agent: any;
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
  if (normalized.includes("bash") || normalized.includes("command") || normalized.includes("shell")) {
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
  if (context.agent) {
    try {
      context.agent.abort();
    } catch {
      // best-effort
    }
  }
  if (context.unsubscribe) {
    context.unsubscribe();
    context.unsubscribe = undefined;
  }
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
      const serverSettings = yield* ServerSettingsService;
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
          yield* Effect.forEach(
            contexts,
            (context) => Effect.ignoreCause(stopPiContext(context)),
            { concurrency: "unbounded", discard: true },
          );
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

          const modelSlug =
            input.modelSelection?.provider === "pi" ? input.modelSelection.model : undefined;
          const resumeState = readPiResumeState(input.resumeCursor);
          const sessionScope = yield* Scope.make();

          // Dynamically import Pi SDK
          const { Agent } = yield* Effect.promise(() => import("@mariozechner/pi-agent-core"));
          const { getModels, getProviders } = yield* Effect.promise(() => import("@mariozechner/pi-ai"));

          // Resolve model from slug (format: "provider/modelId")
          const resolvedModelSlug = modelSlug ?? resumeState?.modelSlug;
          let model: import("@mariozechner/pi-ai").Model<import("@mariozechner/pi-ai").Api> | undefined;
          if (resolvedModelSlug) {
            const slashIndex = resolvedModelSlug.indexOf("/");
            if (slashIndex > 0) {
              const providerName = resolvedModelSlug.slice(0, slashIndex);
              const modelId = resolvedModelSlug.slice(slashIndex + 1);
              const knownProviders: readonly string[] = getProviders();
              if (knownProviders.includes(providerName)) {
                const providerModels = getModels(providerName as KnownProvider);
                model = providerModels.find((m) => m.id === modelId);
              }
            }
          }

          const pendingApprovals = new Map<string, PendingApproval>();
          const stoppedRef = yield* Ref.make(false);

          const agent = new Agent({
            initialState: {
              ...(model ? { model } : {}),
              ...(resumeState?.messages ? { messages: resumeState.messages } : {}),
              systemPrompt: "You are a coding assistant working in a development environment.",
            },
            beforeToolCall: async (context: any, signal?: AbortSignal) => {
              // Auto-approve read-only tools
              const toolName = context.toolCall?.name ?? "";
              const normalizedTool = toolName.toLowerCase();
              if (
                normalizedTool.includes("read") ||
                normalizedTool.includes("grep") ||
                normalizedTool.includes("glob") ||
                normalizedTool.includes("search") ||
                normalizedTool.includes("ls")
              ) {
                return undefined;
              }

              // Check runtime mode
              if (input.runtimeMode === "full-access") {
                return undefined;
              }

              // Emit permission request and await decision
              const requestId = randomUUID();
              let resolveDecision!: (decision: ProviderApprovalDecision) => void;
              const decisionPromise = new Promise<ProviderApprovalDecision>(
                (resolve) => { resolveDecision = resolve; },
              );
              pendingApprovals.set(requestId, {
                toolName,
                args: context.args,
                resolve: resolveDecision,
                promise: decisionPromise,
              });

              // Emit the approval request event
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
                    detail: JSON.stringify(context.args ?? {}).slice(0, 400),
                  },
                }),
              );

              // Wait for the decision
              const decision = await decisionPromise;
              pendingApprovals.delete(requestId);

              if (decision === "decline" || decision === "cancel") {
                return { block: true, reason: "User denied" };
              }
              return undefined;
            },
          });

          const session: ProviderSession = {
            provider: PROVIDER,
            status: "ready",
            runtimeMode: input.runtimeMode,
            ...(modelSlug ? { model: modelSlug } : {}),
            threadId,
            resumeCursor: {
              modelSlug: resolvedModelSlug,
              turnCount: resumeState?.turnCount ?? 0,
            },
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };

          const context: PiSessionContext = {
            session,
            agent,
            unsubscribe: undefined,
            pendingApprovals,
            turns: [],
            activeTurnId: undefined,
            stopped: stoppedRef,
            sessionScope: sessionScope,
          };

          // Subscribe to agent events
          const unsub = agent.subscribe((event: any) => {
            if (Ref.getUnsafe(context.stopped)) return;

            Effect.runPromise(
              Effect.gen(function* () {
                const turnId = context.activeTurnId;
                switch (event.type) {
                  case "message_update": {
                    const ame = event.assistantMessageEvent;
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
                    const itemType = toToolLifecycleItemType(event.toolName);
                    yield* emit({
                      ...buildEventBase({
                        threadId,
                        turnId,
                        itemId: event.toolCallId,
                      }),
                      type: "item.started",
                      payload: {
                        itemType,
                        title: event.toolName,
                        detail: JSON.stringify(event.args ?? {}).slice(0, 400),
                      },
                    });
                    break;
                  }
                  case "tool_execution_end": {
                    const itemType = toToolLifecycleItemType(event.toolName);
                    yield* emit({
                      ...buildEventBase({
                        threadId,
                        turnId,
                        itemId: event.toolCallId,
                      }),
                      type: "item.completed",
                      payload: {
                        itemType,
                        status: event.isError ? "failed" : "completed",
                        title: event.toolName,
                        detail:
                          typeof event.result === "string"
                            ? event.result.slice(0, 1000)
                            : JSON.stringify(event.result ?? "").slice(0, 1000),
                      },
                    });
                    break;
                  }
                  case "turn_end": {
                    if (turnId) {
                      context.turns.push({
                        id: turnId,
                        items: event.toolResults ?? [],
                      });
                    }
                    break;
                  }
                  case "agent_end": {
                    // Update resume state with final messages
                    updateProviderSession(context, {
                      status: "ready",
                      resumeCursor: {
                        messages: event.messages,
                        modelSlug: resolvedModelSlug,
                        turnCount: context.turns.length,
                      },
                    });
                    break;
                  }
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
              await context.agent.prompt(input.input?.trim() ?? "");
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
          if (context.agent) {
            context.agent.abort();
          }
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
        Effect.gen(function* () {
          const context = ensureSession(threadId);
          const pending = context.pendingApprovals.get(requestId);
          if (!pending) {
            return;
          }
          pending.resolve(decision);
          context.pendingApprovals.delete(requestId);
        });

      const respondToUserInput: PiAdapterShape["respondToUserInput"] = (
        threadId,
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
          context.turns.splice(context.turns.length - removedCount, removedCount);

          // Also truncate agent messages if accessible
          if (context.agent?.state?.messages && numTurns > 0) {
            const messages = context.agent.state.messages;
            // Remove last N user+assistant pairs (each turn is roughly 2 messages)
            const removeMessages = numTurns * 2;
            if (removeMessages < messages.length) {
              context.agent.state.messages = messages.slice(0, messages.length - removeMessages);
            }
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
          yield* Effect.forEach(
            contexts,
            (context) => Effect.ignoreCause(stopPiContext(context)),
            { concurrency: "unbounded", discard: true },
          );
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
