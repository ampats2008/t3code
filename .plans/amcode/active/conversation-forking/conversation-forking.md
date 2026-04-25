# Plan: Conversation Forking

## Overview

Allow users to fork a thread at any message, creating a new thread that inherits all context up to that point and continues independently. Two entry points: a `/fork` slash command (forks from latest message) and a per-message `...` menu with "Fork here" action.

---

## UX Spec

### Entry Points

1. **`/fork` slash command** — forks from the most recent message in the current thread. Auto-navigates to the new thread.
2. **`...` overflow menu on each message row** — appears right-aligned in the timestamp/action row (same row as the copy button and revert button). Clicking opens a dropdown with "Fork here" option. Forks from that specific message.

### After Forking
- Auto-navigate to the newly created thread.
- New thread title: `"Fork: [original title]"` if first fork at that message, `"Fork: [original title] (2)"` etc. for subsequent forks at the same message.

### Fork Visibility on Source Thread
- A "Forked" badge appears on any message that has been forked from.
- Clicking the badge opens a small popover/dropdown listing all threads forked from that message, each as a clickable link that navigates to that thread.

---

## Data Model Changes

### New Fields on `projection_threads` (Migration 019)

```sql
ALTER TABLE projection_threads ADD COLUMN fork_source_thread_id TEXT DEFAULT NULL;
ALTER TABLE projection_threads ADD COLUMN fork_source_message_id TEXT DEFAULT NULL;
```

These track the lineage of a forked thread back to its source.

### New Projection Table: `projection_thread_forks` (Migration 019)

```sql
CREATE TABLE projection_thread_forks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_thread_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  forked_thread_id TEXT NOT NULL,
  fork_number INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(source_thread_id, source_message_id, forked_thread_id)
);
CREATE INDEX idx_thread_forks_source ON projection_thread_forks(source_thread_id, source_message_id);
```

This enables the "Forked" badge query: given a thread, find all messages that have forks, and list the forked threads.

---

## Contracts Changes

**File**: `packages/contracts/src/orchestration.ts`

### New Command Schema

```typescript
const ThreadForkCommand = Schema.Struct({
  type: Schema.Literal("thread.fork"),
  commandId: CommandId,
  sourceThreadId: ThreadId,
  forkAtMessageId: MessageId,
  threadId: ThreadId,            // ID for the new forked thread
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE)),
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
});
```

### New Event Schema

```typescript
const ThreadForkedPayload = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  sourceThreadId: ThreadId,
  forkAtMessageId: MessageId,
  title: TrimmedNonEmptyString,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  copiedMessageIds: Schema.Array(MessageId),   // IDs of messages copied into the new thread
  forkNumber: Schema.Number,
  createdAt: IsoDateTime,
});
```

Add `"thread.fork"` to `OrchestrationCommandType` union.
Add `"thread.forked"` to `OrchestrationEventType` literals and the `OrchestrationEvent` union.

### Read Model Extension

```typescript
// Add to OrchestrationThread schema
forkSource: Schema.optional(Schema.Struct({
  threadId: ThreadId,
  messageId: MessageId,
})),

// New query response type for fork badges
ThreadForkInfo = Schema.Struct({
  sourceMessageId: MessageId,
  forkedThreadId: ThreadId,
  forkedThreadTitle: TrimmedNonEmptyString,
  forkNumber: Schema.Number,
});
```

---

## Implementation Steps

### Step 1: Migration 019 — Fork Schema

**New file**: `apps/server/src/persistence/Migrations/019_ThreadForks.ts`

- Add `fork_source_thread_id` and `fork_source_message_id` columns to `projection_threads`.
- Create `projection_thread_forks` table with index.
- Register in `Migrations.ts` as entry `[19, "ThreadForks", Migration0019]`.

### Step 2: Contracts — Command + Event Schemas

**Modify**: `packages/contracts/src/orchestration.ts`

- Add `ThreadForkCommand` to the command union.
- Add `ThreadForkedPayload` and its event entry to the event union.
- Add `forkSource` optional field to `OrchestrationThread`.
- Export `ThreadForkInfo` for the fork badge query.

### Step 3: Orchestration Engine — Fork Handler

**Modify**: `apps/server/src/orchestration/Layers/OrchestrationEngine.ts`

Handle `thread.fork` command:
1. Load source thread from projections.
2. Validate `forkAtMessageId` exists in source thread.
3. Collect all messages up to and including `forkAtMessageId` (ordered by creation).
4. Count existing forks at that message (query `projection_thread_forks`) to determine `forkNumber`.
5. Emit `thread.forked` event containing:
   - All fields from the command.
   - `copiedMessageIds` — the IDs of source messages that will be cloned.
   - `forkNumber`.

### Step 4: Projector — Handle `thread.forked` Event

**Modify**: `apps/server/src/orchestration/projector.ts`

On `thread.forked`:
1. Insert new row into `projection_threads` with `fork_source_thread_id` and `fork_source_message_id`.
2. Copy matching messages from `projection_thread_messages` into the new thread (new message IDs, same content, preserving order and `turnId` references).
3. Insert row into `projection_thread_forks`.

### Step 5: Command Invariants

**Modify**: `apps/server/src/orchestration/commandInvariants.ts`

Add validation for `thread.fork`:
- Source thread must exist and not be deleted.
- `forkAtMessageId` must exist in source thread.
- Target `threadId` must not already exist.

### Step 6: WebSocket Query — Fork Info

**Modify**: `apps/server/src/wsServer.ts` (or appropriate query layer)

Add a new query method (or extend the snapshot):
```typescript
// Query: given a threadId, return all fork info for badge rendering
getThreadForks(threadId: ThreadId): Promise<ThreadForkInfo[]>
```

Alternatively, include fork info in the `OrchestrationReadModel` snapshot so it's available client-side without extra queries.

**Recommended**: Include in the read model. Add a `forks: ThreadForkInfo[]` array to `OrchestrationThread` in the snapshot, populated by the projector from `projection_thread_forks`. This keeps the client simple — no separate fetch needed.

### Step 7: Slash Command — `/fork`

**Modify**: `apps/web/src/composer-logic.ts`

- Add `"fork"` to `ComposerSlashCommand` type and `_SLASH_COMMANDS` array.
- Add `"fork"` case to `parseStandaloneComposerSlashCommand`.

**Modify**: `apps/web/src/components/chat/ComposerCommandMenu.tsx`

- Add `/fork` entry with description: "Fork this conversation".

**New hook**: `apps/web/src/hooks/useHandleForkThread.ts`

```typescript
function useHandleForkThread() {
  // Given a source threadId and optional messageId (defaults to latest):
  // 1. Read current thread from store
  // 2. Generate new threadId
  // 3. Compute title: "Fork: [title]" or "Fork: [title] (n)"
  // 4. Dispatch thread.fork command via nativeApi
  // 5. Navigate to new thread
}
```

Wire into ChatView's slash command handler so `/fork` dispatches via this hook.

### Step 8: Message Overflow Menu — "Fork here"

**Modify**: `apps/web/src/components/chat/MessagesTimeline.tsx`

In the user message row (the `<div className="mt-1.5 flex items-center justify-end gap-2">` area around line 425):

- Add an `EllipsisIcon` (`...`) button next to the existing copy/revert buttons, inside the same `group-hover:opacity-100` container.
- On click, show a `DropdownMenu` (shadcn/ui) with:
  - **"Fork here"** — calls `useHandleForkThread` with this message's ID.
  - (Future: other per-message actions can go here.)

Do the same for assistant message rows — fork should work from any message, not just user messages.

### Step 9: Fork Badge on Source Messages

**Modify**: `apps/web/src/components/chat/MessagesTimeline.tsx`

- For each message row, check if the current thread has any forks originating from that message (from the `forks` array on the thread read model).
- If yes, render a small "Forked" badge (`Badge` component, variant outline, with `GitForkIcon` from lucide).
- On click, open a `Popover` listing forked threads:
  - Each entry: thread title (clickable, navigates via `useNavigate`).
  - Sorted by fork number.

**New component**: `apps/web/src/components/chat/ForkBadge.tsx`

```typescript
interface ForkBadgeProps {
  forks: ThreadForkInfo[];   // forks from this specific message
  onNavigate: (threadId: ThreadId) => void;
}
```

---

## File Summary

| File | Action | Purpose |
|---|---|---|
| `apps/server/src/persistence/Migrations/019_ThreadForks.ts` | **New** | Schema for fork tracking |
| `apps/server/src/persistence/Migrations.ts` | Modify | Register migration 019 |
| `packages/contracts/src/orchestration.ts` | Modify | `thread.fork` command, `thread.forked` event, `forkSource` on thread, `ThreadForkInfo` |
| `apps/server/src/orchestration/Layers/OrchestrationEngine.ts` | Modify | Handle `thread.fork` command |
| `apps/server/src/orchestration/projector.ts` | Modify | Project `thread.forked` event → tables |
| `apps/server/src/orchestration/commandInvariants.ts` | Modify | Validate fork command |
| `apps/web/src/composer-logic.ts` | Modify | Add `/fork` slash command |
| `apps/web/src/components/chat/ComposerCommandMenu.tsx` | Modify | `/fork` menu entry |
| `apps/web/src/hooks/useHandleForkThread.ts` | **New** | Fork dispatch + navigation logic |
| `apps/web/src/components/chat/MessagesTimeline.tsx` | Modify | `...` overflow menu, fork badge |
| `apps/web/src/components/chat/ForkBadge.tsx` | **New** | Badge + popover component |

---

## Risks & Edge Cases

| Risk | Mitigation |
|---|---|
| Large threads = many messages to copy | Copy is a single INSERT...SELECT in SQLite — fast even for hundreds of messages. No client-side data transfer. |
| Fork of a fork (nested forks) | Works naturally — the forked thread is just a thread. Its `forkSource` points to the immediate parent. No recursion needed. |
| Source thread deleted after fork | Forked thread is fully independent (messages are copied). `forkSource` becomes a dead reference — UI should handle gracefully (show "Source thread deleted"). |
| Race condition: two forks at same message simultaneously | `fork_number` computed at command time. UNIQUE constraint on `(source_thread_id, source_message_id, forked_thread_id)` prevents duplicates. Worst case: two forks get the same number — cosmetic only. |
| Message IDs in forked thread | Generate new MessageIds for copied messages. Do NOT reuse source message IDs — that would break the projector's uniqueness assumptions. |
