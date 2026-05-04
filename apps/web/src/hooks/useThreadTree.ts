import { useMemo } from "react";
import type { ThreadId, ThreadForkInfo } from "@t3tools/contracts";
import type { SidebarThreadSummary } from "../types";

export interface ThreadTreeNode {
  thread: SidebarThreadSummary;
  children: ThreadTreeNode[];
  depth: number;
}

/**
 * Builds a tree from a flat list of threads using forksByThreadId (parent→child direction).
 * Returns root-level nodes with fork children nested underneath.
 */
export function buildThreadTree(
  threads: readonly SidebarThreadSummary[],
  forksByThreadId: Record<ThreadId, ThreadForkInfo[]>,
): ThreadTreeNode[] {
  const threadById = new Map<ThreadId, SidebarThreadSummary>();
  for (const thread of threads) {
    threadById.set(thread.id, thread);
  }

  // Collect all thread IDs that are children (forked threads)
  const childThreadIds = new Set<ThreadId>();
  for (const thread of threads) {
    const forks = forksByThreadId[thread.id];
    if (forks) {
      for (const fork of forks) {
        if (threadById.has(fork.forkedThreadId)) {
          childThreadIds.add(fork.forkedThreadId);
        }
      }
    }
  }

  function buildChildren(parentId: ThreadId, depth: number): ThreadTreeNode[] {
    const forks = forksByThreadId[parentId];
    if (!forks || forks.length === 0) return [];
    return forks
      .toSorted((a, b) => a.forkNumber - b.forkNumber)
      .flatMap((fork) => {
        const child = threadById.get(fork.forkedThreadId);
        if (!child) return [];
        return [
          {
            thread: child,
            children: buildChildren(fork.forkedThreadId, depth + 1),
            depth,
          },
        ];
      });
  }

  // Root threads are those not appearing as children
  const roots: ThreadTreeNode[] = [];
  for (const thread of threads) {
    if (childThreadIds.has(thread.id)) continue;
    roots.push({
      thread,
      children: buildChildren(thread.id, 1),
      depth: 0,
    });
  }

  return roots;
}

/**
 * Flatten a tree into a display-order list for rendering.
 * expandedIds controls which parent nodes show their children.
 */
export function flattenThreadTree(
  roots: ThreadTreeNode[],
  expandedIds: ReadonlySet<ThreadId>,
): ThreadTreeNode[] {
  const result: ThreadTreeNode[] = [];
  function walk(nodes: ThreadTreeNode[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0 && expandedIds.has(node.thread.id)) {
        walk(node.children);
      }
    }
  }
  walk(roots);
  return result;
}

/**
 * Collect all ancestor IDs for a given thread by walking up the tree.
 * Used to auto-expand the subtree containing the active thread.
 */
export function collectAncestorIds(
  roots: ThreadTreeNode[],
  targetId: ThreadId,
): ThreadId[] {
  const path: ThreadId[] = [];
  function find(nodes: ThreadTreeNode[]): boolean {
    for (const node of nodes) {
      if (node.thread.id === targetId) return true;
      if (node.children.length > 0) {
        path.push(node.thread.id);
        if (find(node.children)) return true;
        path.pop();
      }
    }
    return false;
  }
  find(roots);
  return path;
}

/**
 * Hook that builds a thread tree from flat sidebar threads and fork metadata.
 */
export function useThreadTree(
  threads: readonly SidebarThreadSummary[],
  forksByThreadId: Record<ThreadId, ThreadForkInfo[]>,
): ThreadTreeNode[] {
  return useMemo(
    () => buildThreadTree(threads, forksByThreadId),
    [threads, forksByThreadId],
  );
}
