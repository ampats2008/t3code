import { type MessageId, type ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { newCommandId, newThreadId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";

export function useHandleForkThread() {
  const threads = useStore((store) => store.threads);
  const navigate = useNavigate();

  const handleForkThread = useCallback(
    async (sourceThreadId: ThreadId, forkAtMessageId?: MessageId) => {
      const sourceThread = threads.find((t) => t.id === sourceThreadId);
      if (!sourceThread) return;

      // If no messageId specified, use the last message
      const targetMessageId =
        forkAtMessageId ?? sourceThread.messages[sourceThread.messages.length - 1]?.id;
      if (!targetMessageId) return;

      // Count existing forks at this message for title numbering
      const existingForksAtMessage = (sourceThread.forks ?? []).filter(
        (f) => f.sourceMessageId === targetMessageId,
      );
      const forkNumber = existingForksAtMessage.length + 1;
      const titleSuffix = forkNumber === 1 ? "" : ` (${forkNumber})`;
      const title = `Fork: ${sourceThread.title}${titleSuffix}`;

      const forkedThreadId = newThreadId();
      const api = readNativeApi();
      if (!api) return;

      await api.orchestration.dispatchCommand({
        type: "thread.fork",
        commandId: newCommandId(),
        sourceThreadId,
        forkAtMessageId: targetMessageId,
        threadId: forkedThreadId,
        projectId: sourceThread.projectId,
        title,
        modelSelection: sourceThread.modelSelection,
        runtimeMode: sourceThread.runtimeMode,
        interactionMode: sourceThread.interactionMode,
        branch: sourceThread.branch,
        worktreePath: sourceThread.worktreePath,
        createdAt: new Date().toISOString(),
      });

      await navigate({
        to: "/$threadId",
        params: { threadId: forkedThreadId },
      });
    },
    [threads, navigate],
  );

  return { handleForkThread };
}
