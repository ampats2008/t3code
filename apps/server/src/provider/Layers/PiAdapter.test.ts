/**
 * PiAdapter tests.
 *
 * All Pi SDK imports are mocked so tests run without a globally installed Pi CLI
 * or live Pi credentials. A FakePiSession provides full control over prompt
 * resolution and event emission.
 */
import assert from "node:assert/strict";

import { it } from "@effect/vitest";
import { Effect, Fiber, Layer, Stream } from "effect";
import { vi } from "vitest";

import { type ProviderRuntimeEvent, ThreadId } from "@t3tools/contracts";

import { ServerSettingsService } from "../../serverSettings.ts";
import { PiAdapter } from "../Services/PiAdapter.ts";
import { makePiAdapterLive } from "./PiAdapter.ts";

// ===== Fake AgentSession =====

class FakePiSession {
  private readonly _subscribers: Array<(event: unknown) => void> = [];
  private readonly _promptQueue: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

  public readonly promptInputs: string[] = [];
  public abortCalled = false;
  public disposeCalled = false;
  public messages: unknown[] = [];
  public model: { provider: string; id: string } | undefined = undefined;

  public readonly sessionManager = {
    getLeafId: vi.fn<() => string | null>(() => null),
    branch: vi.fn<(id: string) => void>(),
    resetLeaf: vi.fn<() => void>(),
    buildSessionContext: vi.fn(() => ({ messages: [] as unknown[] })),
  };

  public readonly agent = { state: { messages: [] as unknown[] } };

  subscribe(fn: (event: unknown) => void): () => void {
    this._subscribers.push(fn);
    return () => {
      const idx = this._subscribers.indexOf(fn);
      if (idx >= 0) this._subscribers.splice(idx, 1);
    };
  }

  async prompt(input: string): Promise<void> {
    this.promptInputs.push(input);
    return new Promise<void>((resolve, reject) => {
      this._promptQueue.push({ resolve, reject });
    });
  }

  async abort(): Promise<void> {
    this.abortCalled = true;
    for (const { resolve } of this._promptQueue.splice(0)) {
      resolve();
    }
  }

  dispose(): void {
    this.disposeCalled = true;
  }

  /** Fire a Pi AgentSessionEvent at all current subscribers. */
  emit(event: unknown): void {
    for (const sub of [...this._subscribers]) sub(event);
  }

  /** Resolve the oldest pending prompt() call. */
  resolveCurrentPrompt(): void {
    this._promptQueue.shift()?.resolve();
  }

  /** Reject the oldest pending prompt() call. */
  rejectCurrentPrompt(err: Error): void {
    this._promptQueue.shift()?.reject(err);
  }
}

// Tracks the most recent fake session created by the mock.
let currentFakeSession!: FakePiSession;

// ===== Tool definition stub factory =====
// piTools.ts calls createXxxToolDefinition(cwd) from @mariozechner/pi-coding-agent.
// Return minimal stubs so the adapter can construct tools without the real SDK.
function makeStubToolDef(name: string) {
  return () => ({
    name,
    label: name,
    description: `stub ${name}`,
    parameters: {},
    execute: vi.fn().mockResolvedValue({ content: [], details: undefined }),
  });
}

// ===== Module mocks (hoisted by vitest) =====

vi.mock("../piSdk.ts", () => ({
  createPiServices: vi.fn().mockResolvedValue({}),
  parsePiModelSlug: vi.fn((slug: string) => {
    const slash = slug.indexOf("/");
    if (slash <= 0 || slash === slug.length - 1) return undefined;
    return { provider: slug.slice(0, slash), modelId: slug.slice(slash + 1) };
  }),
  getAvailablePiModels: vi.fn().mockReturnValue([]),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  createAgentSessionFromServices: vi.fn(async () => {
    currentFakeSession = new FakePiSession();
    return { session: currentFakeSession, modelFallbackMessage: undefined };
  }),
  SessionManager: { inMemory: vi.fn().mockReturnValue({}) },
  createReadToolDefinition: makeStubToolDef("read"),
  createGrepToolDefinition: makeStubToolDef("grep"),
  createFindToolDefinition: makeStubToolDef("find"),
  createLsToolDefinition: makeStubToolDef("ls"),
  createBashToolDefinition: makeStubToolDef("bash"),
  createEditToolDefinition: makeStubToolDef("edit"),
  createWriteToolDefinition: makeStubToolDef("write"),
}));

// ===== Helpers =====

const asThreadId = (value: string): ThreadId => ThreadId.make(value);

const PiAdapterTestLayer = makePiAdapterLive().pipe(
  Layer.provide(
    ServerSettingsService.layerTest({
      providers: { pi: { enabled: true } },
    }),
  ),
);

/**
 * Fork a fiber that drains the event stream into a plain array.
 * Interrupt the returned fiber after assertions to stop draining.
 * Uses Effect.forkChild (Effect.fork is not available in this Effect version).
 */
function startDraining(adapter: {
  streamEvents: Stream.Stream<ProviderRuntimeEvent>;
}): Effect.Effect<{
  fiber: Fiber.Fiber<void, never>;
  events: ProviderRuntimeEvent[];
}> {
  return Effect.gen(function* () {
    const events: ProviderRuntimeEvent[] = [];
    const drain = Stream.runDrain(
      Stream.tap(adapter.streamEvents, (e) => Effect.sync(() => events.push(e))),
    );
    const fiber = yield* Effect.forkChild(drain);
    return { fiber, events };
  });
}

/**
 * Yield the current fiber to let forked fibers (prompt, drain) run, then wait
 * for async Effect.runPromise callbacks to flush.
 */
const letAsyncFlush = Effect.gen(function* () {
  yield* Effect.yieldNow;
  yield* Effect.promise(() => new Promise<void>((r) => setTimeout(r, 30)));
});

// ===== Tests =====

it.layer(PiAdapterTestLayer)("PiAdapterLive — structural", (it) => {
  // Case 1: startSession creates a session with correct fields
  it.effect("startSession creates a session with correct provider/thread/status fields", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("test-start-session");

      const session = yield* adapter.startSession({
        threadId,
        runtimeMode: "approval-required",
      });

      assert.equal(session.provider, "pi");
      assert.equal(session.threadId, threadId);
      assert.equal(session.status, "ready");
      assert.equal(session.runtimeMode, "approval-required");
    }),
  );

  it.effect("startSession stores schemaVersion 2 in resumeCursor", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const session = yield* adapter.startSession({
        threadId: asThreadId("cursor-v2"),
        runtimeMode: "full-access",
      });
      assert.equal((session.resumeCursor as Record<string, unknown>)?.schemaVersion, 2);
    }),
  );

  it.effect("hasSession returns false before start and true after", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("test-has-session");

      assert.equal(yield* adapter.hasSession(threadId), false);
      yield* adapter.startSession({ threadId, runtimeMode: "approval-required" });
      assert.equal(yield* adapter.hasSession(threadId), true);
    }),
  );

  it.effect("listSessions includes all started sessions", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;

      yield* adapter.startSession({
        threadId: asThreadId("list-a"),
        runtimeMode: "approval-required",
      });
      yield* adapter.startSession({
        threadId: asThreadId("list-b"),
        runtimeMode: "approval-required",
      });

      const sessions = yield* adapter.listSessions();
      const ids = sessions.map((s) => s.threadId);
      assert.ok(ids.includes(asThreadId("list-a")));
      assert.ok(ids.includes(asThreadId("list-b")));
    }),
  );

  it.effect("stopSession removes the session", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("test-stop-session");

      yield* adapter.startSession({ threadId, runtimeMode: "approval-required" });
      assert.equal(yield* adapter.hasSession(threadId), true);

      yield* adapter.stopSession(threadId);
      assert.equal(yield* adapter.hasSession(threadId), false);
    }),
  );

  it.effect("stopAll clears all sessions", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;

      yield* adapter.startSession({
        threadId: asThreadId("stopall-1"),
        runtimeMode: "approval-required",
      });
      yield* adapter.startSession({
        threadId: asThreadId("stopall-2"),
        runtimeMode: "approval-required",
      });

      yield* adapter.stopAll();

      assert.equal(yield* adapter.hasSession(asThreadId("stopall-1")), false);
      assert.equal(yield* adapter.hasSession(asThreadId("stopall-2")), false);
    }),
  );

  it.effect("starting a duplicate session stops the old one", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("test-duplicate");

      yield* adapter.startSession({ threadId, runtimeMode: "approval-required" });
      const session2 = yield* adapter.startSession({
        threadId,
        runtimeMode: "full-access",
      });

      assert.equal(session2.runtimeMode, "full-access");
      assert.equal(yield* adapter.hasSession(threadId), true);
    }),
  );

  it.effect("reports pi provider and in-session model-switch capability", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      assert.equal(adapter.provider, "pi");
      assert.equal(adapter.capabilities.sessionModelSwitch, "in-session");
    }),
  );

  it.effect("readThread returns an empty thread for a fresh session", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("test-read-thread");

      yield* adapter.startSession({ threadId, runtimeMode: "approval-required" });
      const thread = yield* adapter.readThread(threadId);

      assert.equal(thread.threadId, threadId);
      assert.equal(thread.turns.length, 0);
    }),
  );

  it.effect("rollbackThread on an empty thread is a no-op", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("test-rollback-noop");

      yield* adapter.startSession({ threadId, runtimeMode: "approval-required" });
      const thread = yield* adapter.rollbackThread(threadId, 5);

      assert.equal(thread.threadId, threadId);
      assert.equal(thread.turns.length, 0);
    }),
  );

  it.effect("respondToUserInput is a no-op", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("test-user-input");

      yield* adapter.startSession({ threadId, runtimeMode: "approval-required" });
      yield* adapter.respondToUserInput(threadId, "req-1" as never, {});
    }),
  );
});

it.layer(PiAdapterTestLayer)("PiAdapterLive — event mapping", (it) => {
  // Case 2: sendTurn calls piSession.prompt() and emits turn lifecycle events
  it.effect("sendTurn emits turn.started and turn.completed(completed) events", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("send-turn-lifecycle");

      const { fiber, events } = yield* startDraining(adapter);

      yield* adapter.startSession({ threadId, runtimeMode: "full-access" });
      yield* adapter.sendTurn({ threadId, input: "  hello world  " });

      // Yield so the forked prompt fiber can start and enqueue the prompt() call
      yield* Effect.yieldNow;

      // Resolve prompt so the forked fiber emits turn.completed
      currentFakeSession.resolveCurrentPrompt();
      yield* letAsyncFlush;
      yield* Fiber.interrupt(fiber);

      // prompt input should be trimmed
      assert.equal(currentFakeSession.promptInputs[0], "hello world");

      const types = events.map((e) => e.type);
      assert.ok(types.includes("session.started"), "missing session.started");
      assert.ok(types.includes("turn.started"), "missing turn.started");
      assert.ok(types.includes("turn.completed"), "missing turn.completed");

      const completed = events.find(
        (e) =>
          e.type === "turn.completed" &&
          (e as never as { payload: { state: string } }).payload.state === "completed",
      );
      assert.ok(completed, "turn.completed should have state=completed");
    }),
  );

  it.effect("sendTurn emits turn.completed with state=failed when prompt throws", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("send-turn-failed");

      const { fiber, events } = yield* startDraining(adapter);

      yield* adapter.startSession({ threadId, runtimeMode: "full-access" });
      yield* adapter.sendTurn({ threadId, input: "crash" });

      yield* Effect.yieldNow;

      // Reject the prompt to trigger the error path
      currentFakeSession.rejectCurrentPrompt(new Error("Pi exploded"));
      yield* letAsyncFlush;
      yield* Fiber.interrupt(fiber);

      const failed = events.find(
        (e) =>
          e.type === "turn.completed" &&
          (e as never as { payload: { state: string } }).payload.state === "failed",
      );
      assert.ok(failed, "turn.completed should have state=failed on prompt rejection");
    }),
  );

  // Case 3: Pi text delta maps to content.delta with streamKind=assistant_text
  it.effect("message_update text_delta maps to content.delta with assistant_text", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("text-delta");

      const { fiber, events } = yield* startDraining(adapter);

      yield* adapter.startSession({ threadId, runtimeMode: "full-access" });
      yield* adapter.sendTurn({ threadId, input: "tell me something" });

      yield* Effect.yieldNow;

      // Fire a text delta event before resolving the prompt
      currentFakeSession.emit({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "Hello from Pi!" },
      });
      currentFakeSession.resolveCurrentPrompt();
      yield* letAsyncFlush;
      yield* Fiber.interrupt(fiber);

      const deltaEvent = events.find((e) => e.type === "content.delta") as
        | (ProviderRuntimeEvent & { payload: { streamKind: string; delta: string } })
        | undefined;
      assert.ok(deltaEvent, "missing content.delta event");
      assert.equal(deltaEvent.payload.streamKind, "assistant_text");
      assert.equal(deltaEvent.payload.delta, "Hello from Pi!");
    }),
  );

  // Case 4: Pi thinking delta maps to content.delta with streamKind=reasoning_text
  it.effect("message_update thinking_delta maps to content.delta with reasoning_text", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("thinking-delta");

      const { fiber, events } = yield* startDraining(adapter);

      yield* adapter.startSession({ threadId, runtimeMode: "full-access" });
      yield* adapter.sendTurn({ threadId, input: "think about this" });

      yield* Effect.yieldNow;

      currentFakeSession.emit({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_delta", delta: "Hmm..." },
      });
      currentFakeSession.resolveCurrentPrompt();
      yield* letAsyncFlush;
      yield* Fiber.interrupt(fiber);

      const deltaEvent = events.find((e) => e.type === "content.delta") as
        | (ProviderRuntimeEvent & { payload: { streamKind: string; delta: string } })
        | undefined;
      assert.ok(deltaEvent, "missing content.delta event for thinking");
      assert.equal(deltaEvent.payload.streamKind, "reasoning_text");
      assert.equal(deltaEvent.payload.delta, "Hmm...");
    }),
  );

  // Case 5: Tool execution events map to item lifecycle events
  it.effect("tool_execution_start maps to item.started", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("tool-start");

      const { fiber, events } = yield* startDraining(adapter);

      yield* adapter.startSession({ threadId, runtimeMode: "full-access" });
      yield* adapter.sendTurn({ threadId, input: "run something" });

      yield* Effect.yieldNow;

      currentFakeSession.emit({
        type: "tool_execution_start",
        toolName: "bash",
        toolCallId: "tc-001",
        args: { command: "ls -la" },
      });
      currentFakeSession.resolveCurrentPrompt();
      yield* letAsyncFlush;
      yield* Fiber.interrupt(fiber);

      const started = events.find((e) => e.type === "item.started") as
        | (ProviderRuntimeEvent & { payload: { title: string; itemType: string } })
        | undefined;
      assert.ok(started, "missing item.started event");
      assert.equal(started.payload.title, "bash");
      assert.equal(started.payload.itemType, "command_execution");
    }),
  );

  it.effect("tool_execution_end maps to item.completed with status=completed", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("tool-end");

      const { fiber, events } = yield* startDraining(adapter);

      yield* adapter.startSession({ threadId, runtimeMode: "full-access" });
      yield* adapter.sendTurn({ threadId, input: "run something" });

      yield* Effect.yieldNow;

      currentFakeSession.emit({
        type: "tool_execution_end",
        toolName: "bash",
        toolCallId: "tc-002",
        result: "file1.ts\nfile2.ts",
        isError: false,
      });
      currentFakeSession.resolveCurrentPrompt();
      yield* letAsyncFlush;
      yield* Fiber.interrupt(fiber);

      const completed = events.find((e) => e.type === "item.completed") as
        | (ProviderRuntimeEvent & { payload: { status: string; title: string } })
        | undefined;
      assert.ok(completed, "missing item.completed event");
      assert.equal(completed.payload.title, "bash");
      assert.equal(completed.payload.status, "completed");
    }),
  );

  it.effect("tool_execution_end with isError maps to item.completed with status=failed", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("tool-end-error");

      const { fiber, events } = yield* startDraining(adapter);

      yield* adapter.startSession({ threadId, runtimeMode: "full-access" });
      yield* adapter.sendTurn({ threadId, input: "run something" });

      yield* Effect.yieldNow;

      currentFakeSession.emit({
        type: "tool_execution_end",
        toolName: "edit",
        toolCallId: "tc-003",
        result: "permission denied",
        isError: true,
      });
      currentFakeSession.resolveCurrentPrompt();
      yield* letAsyncFlush;
      yield* Fiber.interrupt(fiber);

      const completed = events.find((e) => e.type === "item.completed") as
        | (ProviderRuntimeEvent & { payload: { status: string } })
        | undefined;
      assert.ok(completed, "missing item.completed event");
      assert.equal(completed.payload.status, "failed");
    }),
  );

  // Case 6: interruptTurn calls piSession.abort() and emits turn.completed(interrupted)
  it.effect("interruptTurn calls abort and emits turn.completed with state=interrupted", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("interrupt-test");

      const { fiber, events } = yield* startDraining(adapter);

      yield* adapter.startSession({ threadId, runtimeMode: "approval-required" });
      yield* adapter.sendTurn({ threadId, input: "long running task" });

      yield* Effect.yieldNow;

      // Interrupt before prompt resolves — abort() will resolve the prompt internally
      yield* adapter.interruptTurn(threadId);
      yield* letAsyncFlush;
      yield* Fiber.interrupt(fiber);

      assert.ok(currentFakeSession.abortCalled, "piSession.abort() should have been called");

      const interrupted = events.find(
        (e) =>
          e.type === "turn.completed" &&
          (e as never as { payload: { state: string } }).payload.state === "interrupted",
      );
      assert.ok(interrupted, "should emit turn.completed with state=interrupted");
    }),
  );

  // Case 7: stopSession calls piSession.dispose() and emits session.exited
  it.effect("stopSession calls piSession.dispose and emits session.exited", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("stop-dispose");

      const { fiber, events } = yield* startDraining(adapter);

      yield* adapter.startSession({ threadId, runtimeMode: "approval-required" });
      yield* adapter.stopSession(threadId);
      yield* letAsyncFlush;
      yield* Fiber.interrupt(fiber);

      assert.ok(currentFakeSession.disposeCalled, "piSession.dispose() should have been called");

      const exited = events.find((e) => e.type === "session.exited");
      assert.ok(exited, "should emit session.exited on stop");
    }),
  );
});
