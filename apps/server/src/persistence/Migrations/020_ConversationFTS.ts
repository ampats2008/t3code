import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS projection_messages_fts USING fts5(
      thread_id UNINDEXED,
      message_id UNINDEXED,
      role UNINDEXED,
      message_text
    )
  `;

  yield* sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS projection_threads_fts USING fts5(
      thread_id UNINDEXED,
      title
    )
  `;

  yield* sql`
    INSERT INTO projection_messages_fts(thread_id, message_id, role, message_text)
      SELECT thread_id, message_id, role, text FROM projection_thread_messages
  `;

  yield* sql`
    INSERT INTO projection_threads_fts(thread_id, title)
      SELECT thread_id, title FROM projection_threads WHERE deleted_at IS NULL
  `;
});
