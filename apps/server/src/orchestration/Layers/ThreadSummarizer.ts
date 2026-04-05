/**
 * ThreadSummarizerLive - Extractive thread summarizer implementation.
 *
 * Loads thread messages and metadata from the projection repositories
 * and generates a condensed transcript summary for cross-thread context.
 *
 * @module ThreadSummarizerLive
 */
import { type ThreadId } from "@t3tools/contracts";
import { Effect, Layer, Option } from "effect";

import { ProjectionThreadMessageRepository } from "../../persistence/Services/ProjectionThreadMessages.ts";
import { ProjectionThreadRepository } from "../../persistence/Services/ProjectionThreads.ts";
import { ThreadSummarizer, type ThreadSummarizerShape } from "../Services/ThreadSummarizer.ts";

const truncate = (text: string, max: number) =>
  text.length > max ? text.slice(0, max) + "..." : text;

const makeThreadSummarizer = Effect.gen(function* () {
  const messageRepo = yield* ProjectionThreadMessageRepository;
  const threadRepo = yield* ProjectionThreadRepository;

  const summarizeThread: ThreadSummarizerShape["summarizeThread"] = (input) =>
    Effect.gen(function* () {
      const threadId = input.threadId as ThreadId;
      const threadOption = yield* threadRepo.getById({ threadId });
      const createdAt = Option.isSome(threadOption) ? threadOption.value.createdAt : "unknown";

      const messages = yield* messageRepo.listByThreadId({ threadId });

      // Extract key messages — first 5 user and first 5 assistant messages
      const userMessages = messages.filter((m) => m.role === "user").slice(0, 5);
      const assistantMessages = messages.filter((m) => m.role === "assistant").slice(0, 5);

      // Interleave user and assistant messages in chronological order
      const allSelected = [...userMessages, ...assistantMessages].toSorted((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );

      const lines: string[] = [];
      for (const msg of allSelected) {
        lines.push(`[${msg.role}]: ${truncate(msg.text, 500)}`);
      }

      const summary = lines.join("\n\n");
      return `Context from thread '${input.threadTitle}' (created ${createdAt}):\n${summary}`;
    }).pipe(
      Effect.mapError((e) => new Error(`Failed to summarize thread: ${String(e)}`)),
    );

  return { summarizeThread } satisfies ThreadSummarizerShape;
});

export const ThreadSummarizerLive = Layer.effect(ThreadSummarizer, makeThreadSummarizer);
