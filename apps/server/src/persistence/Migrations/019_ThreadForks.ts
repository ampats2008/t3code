import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!columns.some((column) => column.name === "fork_source_thread_id")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN fork_source_thread_id TEXT DEFAULT NULL
    `;
  }

  if (!columns.some((column) => column.name === "fork_source_message_id")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN fork_source_message_id TEXT DEFAULT NULL
    `;
  }

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_forks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_thread_id TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      forked_thread_id TEXT NOT NULL,
      fork_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(source_thread_id, source_message_id, forked_thread_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_thread_forks_source
    ON projection_thread_forks(source_thread_id, source_message_id)
  `;
});
