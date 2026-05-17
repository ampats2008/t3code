import { describe, expect, it } from "vitest";
import { MessageId, ThreadId } from "@t3tools/contracts";
import type { ThreadShell } from "../types";
import { buildThreadAncestry } from "./useThreadAncestry";

function makeShell(id: string, title: string): ThreadShell {
  return {
    id: ThreadId.make(id),
    environmentId: "env-1" as any,
    projectId: "proj-1" as any,
    codexThreadId: null,
    title,
    interactionMode: "default" as any,
    runtimeMode: "default" as any,
    modelSelection: { provider: "anthropic" as any, model: "claude-sonnet-4-20250514" },
    error: null,
    createdAt: new Date().toISOString(),
    archivedAt: null,
    branch: null,
    worktreePath: null,
  };
}

describe("buildThreadAncestry", () => {
  it("returns chain of 3 threads (root → fork1 → fork2)", () => {
    const forkSourceByThreadId: Record<
      string,
      { threadId: string; messageId: string } | undefined
    > = {
      fork2: { threadId: "fork1", messageId: "msg-b" },
      fork1: { threadId: "root", messageId: "msg-a" },
    } as any;
    const threadShellById = {
      root: makeShell("root", "Root Thread"),
      fork1: makeShell("fork1", "Fork 1"),
      fork2: makeShell("fork2", "Fork 2"),
    } as any;

    const ancestry = buildThreadAncestry(
      ThreadId.make("fork2"),
      forkSourceByThreadId as any,
      threadShellById,
    );

    expect(ancestry).toEqual([
      { threadId: "root", title: "Root Thread" },
      { threadId: "fork1", title: "Fork 1" },
      { threadId: "fork2", title: "Fork 2" },
    ]);
  });

  it("handles broken chain (missing intermediate)", () => {
    const forkSourceByThreadId: Record<
      string,
      { threadId: string; messageId: string } | undefined
    > = {
      fork2: { threadId: "missing", messageId: "msg-b" },
    } as any;
    const threadShellById = {
      fork2: makeShell("fork2", "Fork 2"),
      // "missing" has no shell - chain breaks but we still show what we can
    } as any;

    const ancestry = buildThreadAncestry(
      ThreadId.make("fork2"),
      forkSourceByThreadId as any,
      threadShellById,
    );

    // Should still include the missing node with fallback title, then stop
    expect(ancestry).toEqual([
      { threadId: "missing", title: "Unknown thread" },
      { threadId: "fork2", title: "Fork 2" },
    ]);
  });

  it("returns single-entry array for root thread with no forkSource", () => {
    const ancestry = buildThreadAncestry(
      ThreadId.make("root"),
      {} as any,
      { root: makeShell("root", "Root") } as any,
    );
    expect(ancestry).toEqual([{ threadId: "root", title: "Root" }]);
  });

  it("handles circular reference gracefully", () => {
    const forkSourceByThreadId: Record<
      string,
      { threadId: string; messageId: string } | undefined
    > = {
      a: { threadId: "b", messageId: "msg-1" },
      b: { threadId: "a", messageId: "msg-2" },
    } as any;
    const threadShellById = {
      a: makeShell("a", "Thread A"),
      b: makeShell("b", "Thread B"),
    } as any;

    const ancestry = buildThreadAncestry(
      ThreadId.make("a"),
      forkSourceByThreadId as any,
      threadShellById,
    );

    // Should not infinite loop - visited set breaks the cycle
    expect(ancestry.length).toBeLessThanOrEqual(20);
    expect(ancestry[ancestry.length - 1]!.threadId).toBe("a");
  });
});
