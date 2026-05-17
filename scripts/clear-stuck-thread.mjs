#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const threadId = process.argv[2] ?? '754dce8f-aa4a-4a85-a85a-21113b236e4f';
const explicitDbPath = process.argv[3];
const candidates = [
  explicitDbPath,
  join(process.env.HOME ?? '', '.t3/dev/state.sqlite'),
  '/c/Users/ampat/.t3/dev/state.sqlite',
  '/mnt/c/Users/ampat/.t3/dev/state.sqlite',
  'C:/Users/ampat/.t3/dev/state.sqlite',
  join(process.env.HOME ?? '', '.t3/userdata/state.sqlite'),
  '/c/Users/ampat/.t3/userdata/state.sqlite',
  '/mnt/c/Users/ampat/.t3/userdata/state.sqlite',
  'C:/Users/ampat/.t3/userdata/state.sqlite',
].filter(Boolean);
const dbPath = candidates.find((candidate) => existsSync(candidate));

if (!dbPath) {
  console.error('Could not find state.sqlite. Pass path as second arg. Tried:');
  for (const candidate of candidates) console.error(`  ${candidate}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
try {
  db.exec('BEGIN IMMEDIATE');
  const session = db.prepare(`
    UPDATE projection_thread_sessions
    SET status = 'stopped',
        active_turn_id = NULL,
        last_error = 'Manually cleared stuck Pi session',
        updated_at = datetime('now')
    WHERE thread_id = ?
  `).run(threadId);

  const turns = db.prepare(`
    UPDATE projection_turns
    SET state = 'error',
        completed_at = COALESCE(completed_at, datetime('now'))
    WHERE thread_id = ?
      AND completed_at IS NULL
  `).run(threadId);

  const runtime = db.prepare(`
    UPDATE provider_session_runtime
    SET status = 'stopped',
        last_seen_at = datetime('now')
    WHERE thread_id = ?
  `).run(threadId);

  db.exec('COMMIT');
  console.log(JSON.stringify({ dbPath, threadId, changed: {
    projection_thread_sessions: session.changes,
    projection_turns: turns.changes,
    provider_session_runtime: runtime.changes,
  }}, null, 2));
} catch (error) {
  try { db.exec('ROLLBACK'); } catch {}
  console.error(error);
  process.exitCode = 1;
} finally {
  db.close();
}
