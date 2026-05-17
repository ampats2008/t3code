import { type EnvironmentId, type MessageId, type ThreadId } from "@t3tools/contracts";
import { forkDebugLog } from "../debugLog";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { newCommandId, newThreadId } from "../lib/utils";
import { readEnvironmentApi } from "../environmentApi";
import { selectThreadByRef, useStore } from "../store";
import { scopeThreadRef } from "@t3tools/client-runtime";

export function useHandleForkThread() {
  const navigate = useNavigate();

  const handleForkThread = useCallback(
    async (
      environmentId: EnvironmentId,
      sourceThreadId: ThreadId,
      forkAtMessageId?: MessageId,
    ): Promise<ThreadId | undefined> => {
      const sourceThread = selectThreadByRef(
        useStore.getState(),
        scopeThreadRef(environmentId, sourceThreadId),
      );
      if (!sourceThread) return undefined;

      // If no messageId specified, use the last message
      const targetMessageId =
        forkAtMessageId ?? sourceThread.messages[sourceThread.messages.length - 1]?.id;
      if (!targetMessageId) return undefined;

      // Count existing forks at this message for title numbering
      const existingForksAtMessage = (sourceThread.forks ?? []).filter(
        (f: { sourceMessageId: MessageId }) => f.sourceMessageId === targetMessageId,
      );
      const forkNumber = existingForksAtMessage.length + 1;
      const titleSuffix = forkNumber === 1 ? "" : ` (${forkNumber})`;
      const title = `Fork: ${sourceThread.title}${titleSuffix}`;

      const forkedThreadId = newThreadId();
      const api = readEnvironmentApi(environmentId);
      if (!api) return undefined;

      try {
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

        forkDebugLog(
          "useHandleForkThread",
          "fork created, forkedThreadId:",
          forkedThreadId,
          "sourceThreadId:",
          sourceThreadId,
          "forkAtMessageId:",
          targetMessageId,
        );
        // Optimistically update the source thread's forks in the client store.
        // The server projector does this too, but the detail stream for the
        // source thread won't receive the event (aggregateId is the new
        // thread, not the source).
        useStore.setState((prevState) => {
          const envState = prevState.environmentStateById[environmentId];
          if (!envState) return prevState;
          const existingForks = envState.forksByThreadId[sourceThreadId] ?? [];
          return {
            ...prevState,
            environmentStateById: {
              ...prevState.environmentStateById,
              [environmentId]: {
                ...envState,
                forksByThreadId: {
                  ...envState.forksByThreadId,
                  [sourceThreadId]: [
                    ...existingForks,
                    {
                      sourceMessageId: targetMessageId,
                      forkedThreadId,
                      forkedThreadTitle: title,
                      forkNumber,
                    },
                  ],
                },
                forkSourceByThreadId: {
                  ...envState.forkSourceByThreadId,
                  [forkedThreadId]: {
                    threadId: sourceThreadId,
                    messageId: targetMessageId,
                  },
                },
              },
            },
          };
        });

        await navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId, threadId: forkedThreadId },
        });

        return forkedThreadId;
      } catch (error) {
        console.error("[useHandleForkThread] Fork command failed:", error);
        return undefined;
      }
    },
    [navigate],
  );

  return { handleForkThread };
}
