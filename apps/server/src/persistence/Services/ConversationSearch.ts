/**
 * ConversationSearchRepository - Repository interface for FTS5-based conversation search.
 *
 * Owns search operations over projected thread and message full-text search tables.
 *
 * @module ConversationSearchRepository
 */
import { MessageId, ThreadId, ProjectId, IsoDateTime } from "@t3tools/contracts";
import { Context, Schema } from "effect";
import type { Effect } from "effect";
import type { ProjectionRepositoryError } from "../Errors.ts";

export const ConversationSearchMatchRow = Schema.Struct({
  threadId: ThreadId,
  threadTitle: Schema.String,
  messageId: Schema.NullOr(MessageId),
  snippet: Schema.String,
  relevance: Schema.Number,
  threadCreatedAt: IsoDateTime,
  threadUpdatedAt: IsoDateTime,
});
export type ConversationSearchMatchRow = typeof ConversationSearchMatchRow.Type;

export const SearchAllInput = Schema.Struct({
  query: Schema.String,
  projectId: ProjectId,
  limit: Schema.optional(Schema.Number),
  filter: Schema.optional(Schema.Literals(["all", "active", "archived"])),
});
export type SearchAllInput = typeof SearchAllInput.Type;

/**
 * ConversationSearchRepositoryShape - Service API for FTS5 conversation search.
 */
export interface ConversationSearchRepositoryShape {
  /**
   * Search threads and messages matching the given query within a project.
   *
   * Returns ranked results combining thread title and message body matches.
   */
  readonly searchAll: (
    input: SearchAllInput,
  ) => Effect.Effect<ReadonlyArray<ConversationSearchMatchRow>, ProjectionRepositoryError>;

  /**
   * Index a message for full-text search.
   *
   * Uses DELETE + INSERT pattern since FTS5 doesn't support UPSERT.
   */
  readonly indexMessage: (input: {
    threadId: string;
    messageId: string;
    role: string;
    text: string;
  }) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Update the FTS index for a thread title.
   *
   * Uses DELETE + INSERT pattern since FTS5 doesn't support UPSERT.
   */
  readonly updateThreadTitle: (input: {
    threadId: string;
    title: string;
  }) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Remove all FTS entries for a thread (both messages and title).
   */
  readonly removeThread: (input: {
    threadId: string;
  }) => Effect.Effect<void, ProjectionRepositoryError>;
}

/**
 * ConversationSearchRepository - Service tag for FTS5 conversation search persistence.
 */
export class ConversationSearchRepository extends Context.Service<
  ConversationSearchRepository,
  ConversationSearchRepositoryShape
>()("t3/persistence/Services/ConversationSearch/ConversationSearchRepository") {}
