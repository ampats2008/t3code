import { useMemo } from "react";
import type { MessageId, ThreadId } from "@t3tools/contracts";
import type { ThreadShell } from "../types";
import type { BreadcrumbSegment } from "../components/chat/BranchBreadcrumbs";
import { forkDebugLog } from "../debugLog";

/**
 * Walks the forkSourceByThreadId chain from the given thread up to the root,
 * resolving real titles from threadShellById. Returns ancestry from root to current.
 *
 * Handles missing links gracefully — stops if an intermediate thread has no
 * shell data or no forkSource entry (the detail stream may not have loaded yet).
 */
export function buildThreadAncestry(
  threadId: ThreadId,
  forkSourceByThreadId: Record<ThreadId, { threadId: ThreadId; messageId: MessageId } | undefined>,
  threadShellById: Record<ThreadId, ThreadShell>,
): BreadcrumbSegment[] {
  const MAX_DEPTH = 20; // prevent infinite loops on circular references
  const chain: BreadcrumbSegment[] = [];
  let currentId: ThreadId | undefined = threadId;
  const visited = new Set<ThreadId>();

  while (currentId && chain.length < MAX_DEPTH) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const shell = threadShellById[currentId];
    chain.unshift({
      threadId: currentId,
      title: shell?.title ?? "Unknown thread",
    });

    const src: { threadId: ThreadId; messageId: MessageId } | undefined = forkSourceByThreadId[currentId];
    if (!src) break;
    currentId = src.threadId;
  }

  return chain;
}

/**
 * Hook that returns the fork ancestry chain (root → ... → current) for breadcrumbs.
 * Returns an empty array for non-forked threads.
 */
export function useThreadAncestry(
  threadId: ThreadId | null | undefined,
  forkSourceByThreadId: Record<ThreadId, { threadId: ThreadId; messageId: MessageId } | undefined>,
  threadShellById: Record<ThreadId, ThreadShell>,
): BreadcrumbSegment[] {
  return useMemo(() => {
    if (!threadId) return [];
    const forkSource = forkSourceByThreadId[threadId];
    if (!forkSource) {
      forkDebugLog("useThreadAncestry", "no forkSource for thread", threadId, "forkSourceMap keys:", Object.keys(forkSourceByThreadId));
      return [];
    }
    forkDebugLog("useThreadAncestry", "found forkSource for thread", threadId, "→", forkSource, "shellMap keys:", Object.keys(threadShellById));
    const result = buildThreadAncestry(threadId, forkSourceByThreadId, threadShellById);
    forkDebugLog("useThreadAncestry", "ancestry result:", result);
    return result;
  }, [threadId, forkSourceByThreadId, threadShellById]);
}
