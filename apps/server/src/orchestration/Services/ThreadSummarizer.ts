/**
 * ThreadSummarizer - Service interface for generating extractive thread summaries.
 *
 * Provides a summary of a referenced thread's content for use as
 * cross-thread context injection.
 *
 * @module ThreadSummarizer
 */
import { Context } from "effect";
import type { Effect } from "effect";

export interface ThreadSummarizerShape {
  readonly summarizeThread: (input: {
    threadId: string;
    threadTitle: string;
  }) => Effect.Effect<string, Error>;
}

export class ThreadSummarizer extends Context.Service<
  ThreadSummarizer,
  ThreadSummarizerShape
>()("t3/orchestration/ThreadSummarizer") {}
