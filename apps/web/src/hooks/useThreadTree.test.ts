import { describe, expect, it } from "vitest";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import type { ThreadForkInfo } from "@t3tools/contracts";
import type { SidebarThreadSummary } from "../types";
import { buildThreadTree, flattenThreadTree, collectAncestorIds } from "./useThreadTree";

const envId = EnvironmentId.make("env-1");
const projectId = ProjectId.make("proj-1");

function makeSidebarThread(id: string, title: string): SidebarThreadSummary {
  return {
    id: ThreadId.make(id),
    environmentId: envId,
    projectId,
    title,
    interactionMode: "default",
    session: null,
    createdAt: new Date().toISOString(),
    archivedAt: null,
    latestTurn: null,
    branch: null,
    worktreePath: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

describe("buildThreadTree", () => {
  it("returns flat roots when no forks exist", () => {
    const threads = [
      makeSidebarThread("t1", "Thread 1"),
      makeSidebarThread("t2", "Thread 2"),
    ];
    const tree = buildThreadTree(threads, {});
    expect(tree).toHaveLength(2);
    expect(tree[0]!.thread.id).toBe("t1");
    expect(tree[0]!.children).toHaveLength(0);
    expect(tree[0]!.depth).toBe(0);
    expect(tree[1]!.thread.id).toBe("t2");
    expect(tree[1]!.depth).toBe(0);
  });

  it("nests forks under parent with correct depth", () => {
    const threads = [
      makeSidebarThread("parent", "Parent thread"),
      makeSidebarThread("fork1", "Fork 1"),
      makeSidebarThread("fork2", "Fork 2"),
    ];
    const forksByThreadId: Record<string, ThreadForkInfo[]> = {
      parent: [
        { sourceMessageId: "msg-1" as any, forkedThreadId: ThreadId.make("fork1"), forkedThreadTitle: "Fork 1", forkNumber: 1 },
        { sourceMessageId: "msg-1" as any, forkedThreadId: ThreadId.make("fork2"), forkedThreadTitle: "Fork 2", forkNumber: 2 },
      ],
    };
    const tree = buildThreadTree(threads, forksByThreadId);
    expect(tree).toHaveLength(1); // only parent is root
    expect(tree[0]!.thread.id).toBe("parent");
    expect(tree[0]!.depth).toBe(0);
    expect(tree[0]!.children).toHaveLength(2);
    expect(tree[0]!.children[0]!.thread.id).toBe("fork1");
    expect(tree[0]!.children[0]!.depth).toBe(1);
    expect(tree[0]!.children[1]!.thread.id).toBe("fork2");
    expect(tree[0]!.children[1]!.depth).toBe(1);
  });

  it("handles multi-level nesting (grandchild forks)", () => {
    const threads = [
      makeSidebarThread("root", "Root"),
      makeSidebarThread("child", "Child"),
      makeSidebarThread("grandchild", "Grandchild"),
    ];
    const forksByThreadId: Record<string, ThreadForkInfo[]> = {
      root: [
        { sourceMessageId: "msg-1" as any, forkedThreadId: ThreadId.make("child"), forkedThreadTitle: "Child", forkNumber: 1 },
      ],
      child: [
        { sourceMessageId: "msg-2" as any, forkedThreadId: ThreadId.make("grandchild"), forkedThreadTitle: "Grandchild", forkNumber: 1 },
      ],
    };
    const tree = buildThreadTree(threads, forksByThreadId);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.children[0]!.thread.id).toBe("grandchild");
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2);
  });

  it("handles fork referencing a thread not in the list", () => {
    const threads = [
      makeSidebarThread("parent", "Parent"),
    ];
    const forksByThreadId: Record<string, ThreadForkInfo[]> = {
      parent: [
        { sourceMessageId: "msg-1" as any, forkedThreadId: ThreadId.make("missing"), forkedThreadTitle: "Missing", forkNumber: 1 },
      ],
    };
    const tree = buildThreadTree(threads, forksByThreadId);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(0); // missing child excluded
  });
});

describe("flattenThreadTree", () => {
  it("flattens expanded tree in depth-first order", () => {
    const threads = [
      makeSidebarThread("root", "Root"),
      makeSidebarThread("child", "Child"),
      makeSidebarThread("other", "Other"),
    ];
    const forksByThreadId: Record<string, ThreadForkInfo[]> = {
      root: [
        { sourceMessageId: "msg-1" as any, forkedThreadId: ThreadId.make("child"), forkedThreadTitle: "Child", forkNumber: 1 },
      ],
    };
    const tree = buildThreadTree(threads, forksByThreadId);
    const expanded = new Set([ThreadId.make("root")]);
    const flat = flattenThreadTree(tree, expanded);
    expect(flat.map((n) => n.thread.id)).toEqual(["root", "child", "other"]);
  });

  it("hides children when parent is collapsed", () => {
    const threads = [
      makeSidebarThread("root", "Root"),
      makeSidebarThread("child", "Child"),
    ];
    const forksByThreadId: Record<string, ThreadForkInfo[]> = {
      root: [
        { sourceMessageId: "msg-1" as any, forkedThreadId: ThreadId.make("child"), forkedThreadTitle: "Child", forkNumber: 1 },
      ],
    };
    const tree = buildThreadTree(threads, forksByThreadId);
    const flat = flattenThreadTree(tree, new Set());
    expect(flat.map((n) => n.thread.id)).toEqual(["root"]); // child hidden
  });
});

describe("collectAncestorIds", () => {
  it("returns ancestor chain for nested node", () => {
    const threads = [
      makeSidebarThread("root", "Root"),
      makeSidebarThread("child", "Child"),
      makeSidebarThread("grandchild", "Grandchild"),
    ];
    const forksByThreadId: Record<string, ThreadForkInfo[]> = {
      root: [
        { sourceMessageId: "msg-1" as any, forkedThreadId: ThreadId.make("child"), forkedThreadTitle: "Child", forkNumber: 1 },
      ],
      child: [
        { sourceMessageId: "msg-2" as any, forkedThreadId: ThreadId.make("grandchild"), forkedThreadTitle: "Grandchild", forkNumber: 1 },
      ],
    };
    const tree = buildThreadTree(threads, forksByThreadId);
    const ancestors = collectAncestorIds(tree, ThreadId.make("grandchild"));
    expect(ancestors).toEqual(["root", "child"]);
  });
});
