import assert from "node:assert/strict";

import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { ThreadId } from "@t3tools/contracts";

import { ServerSettingsService } from "../../serverSettings.ts";
import { PiAdapter } from "../Services/PiAdapter.ts";
import { makePiAdapterLive } from "./PiAdapter.ts";

const asThreadId = (value: string): ThreadId => ThreadId.make(value);

const PiAdapterTestLayer = makePiAdapterLive().pipe(
  Layer.provide(
    ServerSettingsService.layerTest({
      providers: { pi: { enabled: true } },
    }),
  ),
);

it.layer(PiAdapterTestLayer)("PiAdapterLive", (it) => {
  it.effect("startSession creates a session with correct fields", () =>
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

  it.effect("hasSession returns true for started sessions", () =>
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const threadId = asThreadId("test-has-session");

      assert.equal(yield* adapter.hasSession(threadId), false);
      yield* adapter.startSession({ threadId, runtimeMode: "approval-required" });
      assert.equal(yield* adapter.hasSession(threadId), true);
    }),
  );

  it.effect("listSessions includes started sessions", () =>
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
      const threadIds = sessions.map((s) => s.threadId);
      assert.ok(threadIds.includes(asThreadId("list-a")));
      assert.ok(threadIds.includes(asThreadId("list-b")));
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

  it.effect("stopAll clears sessions", () =>
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

      assert.equal(yield* adapter.hasSession(asThreadId("stopall-1")), true);
      assert.equal(yield* adapter.hasSession(asThreadId("stopall-2")), true);

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

  it.effect("reports pi provider and in-session model switch capability", () =>
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
      yield* adapter.respondToUserInput(threadId, "req-1" as any, {});
    }),
  );
});
