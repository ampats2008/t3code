import * as SqlClient from "effect/unstable/sql/SqlClient";
import { Effect, Layer } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  ConversationSearchRepository,
  type ConversationSearchRepositoryShape,
  type ConversationSearchMatchRow,
} from "../Services/ConversationSearch.ts";

/**
 * Escape an FTS5 query string by wrapping each whitespace-delimited term in
 * double quotes. Double-quote characters inside terms are escaped by doubling.
 * Returns null if the query contains no usable terms.
 */
function buildFtsQuery(rawQuery: string): string | null {
  const terms = rawQuery
    .replace(/"/g, '""')
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"`);

  return terms.length > 0 ? terms.join(" ") : null;
}

const makeConversationSearchRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const searchAll: ConversationSearchRepositoryShape["searchAll"] = (input) => {
    const ftsQuery = buildFtsQuery(input.query);

    if (ftsQuery === null) {
      return Effect.succeed([]);
    }

    const limit = input.limit ?? 20;
    const filter = input.filter ?? "all";

    const filterClause =
      filter === "active"
        ? "AND t.archived_at IS NULL"
        : filter === "archived"
          ? "AND t.archived_at IS NOT NULL"
          : "";

    // Use sql.unsafe for FTS5 MATCH queries since parameterized values cannot
    // be used as the right-hand operand of MATCH in SQLite FTS5.
    const rawQuery = `
      SELECT
        t.thread_id   AS threadId,
        t.title       AS threadTitle,
        mf.message_id AS messageId,
        snippet(projection_messages_fts, 3, '<mark>', '</mark>', '…', 16) AS snippet,
        -bm25(projection_messages_fts) AS relevance,
        t.created_at  AS threadCreatedAt,
        t.updated_at  AS threadUpdatedAt
      FROM projection_messages_fts mf
      JOIN projection_threads t
        ON t.thread_id = mf.thread_id
      WHERE projection_messages_fts MATCH '${ftsQuery}'
        AND t.project_id = '${input.projectId}'
        AND t.deleted_at IS NULL
        ${filterClause}

      UNION ALL

      SELECT
        t.thread_id AS threadId,
        t.title     AS threadTitle,
        NULL        AS messageId,
        snippet(projection_threads_fts, 1, '<mark>', '</mark>', '…', 16) AS snippet,
        -bm25(projection_threads_fts) AS relevance,
        t.created_at AS threadCreatedAt,
        t.updated_at AS threadUpdatedAt
      FROM projection_threads_fts tf
      JOIN projection_threads t
        ON t.thread_id = tf.thread_id
      WHERE projection_threads_fts MATCH '${ftsQuery}'
        AND t.project_id = '${input.projectId}'
        AND t.deleted_at IS NULL
        ${filterClause}

      ORDER BY relevance DESC
      LIMIT ${limit}
    `;

    type RawRow = {
      threadId: string;
      threadTitle: string;
      messageId: string | null;
      snippet: string;
      relevance: number;
      threadCreatedAt: string;
      threadUpdatedAt: string;
    };

    return sql
      .unsafe<RawRow>(rawQuery)
      .pipe(
        Effect.mapError(
          toPersistenceSqlError("ConversationSearchRepository.searchAll:query"),
        ),
        Effect.map((rows) =>
          rows.map(
            (row): ConversationSearchMatchRow => ({
              threadId: row.threadId as ConversationSearchMatchRow["threadId"],
              threadTitle: row.threadTitle,
              messageId: (row.messageId as ConversationSearchMatchRow["messageId"]) ?? null,
              snippet: row.snippet,
              relevance: row.relevance,
              threadCreatedAt: row.threadCreatedAt as ConversationSearchMatchRow["threadCreatedAt"],
              threadUpdatedAt: row.threadUpdatedAt as ConversationSearchMatchRow["threadUpdatedAt"],
            }),
          ),
        ),
      );
  };

  const indexMessage: ConversationSearchRepositoryShape["indexMessage"] = (input) =>
    sql`DELETE FROM projection_messages_fts WHERE message_id = ${input.messageId}`.pipe(
      Effect.flatMap(() =>
        sql`
          INSERT INTO projection_messages_fts(thread_id, message_id, role, message_text)
          VALUES (${input.threadId}, ${input.messageId}, ${input.role}, ${input.text})
        `,
      ),
      Effect.mapError(
        toPersistenceSqlError("ConversationSearchRepository.indexMessage:query"),
      ),
    );

  const updateThreadTitle: ConversationSearchRepositoryShape["updateThreadTitle"] = (input) =>
    sql`DELETE FROM projection_threads_fts WHERE thread_id = ${input.threadId}`.pipe(
      Effect.flatMap(() =>
        sql`
          INSERT INTO projection_threads_fts(thread_id, title)
          VALUES (${input.threadId}, ${input.title})
        `,
      ),
      Effect.mapError(
        toPersistenceSqlError("ConversationSearchRepository.updateThreadTitle:query"),
      ),
    );

  const removeThread: ConversationSearchRepositoryShape["removeThread"] = (input) =>
    sql`DELETE FROM projection_messages_fts WHERE thread_id = ${input.threadId}`.pipe(
      Effect.flatMap(() =>
        sql`DELETE FROM projection_threads_fts WHERE thread_id = ${input.threadId}`,
      ),
      Effect.mapError(
        toPersistenceSqlError("ConversationSearchRepository.removeThread:query"),
      ),
    );

  return {
    searchAll,
    indexMessage,
    updateThreadTitle,
    removeThread,
  } satisfies ConversationSearchRepositoryShape;
});

export const ConversationSearchRepositoryLive = Layer.effect(
  ConversationSearchRepository,
  makeConversationSearchRepository,
);
