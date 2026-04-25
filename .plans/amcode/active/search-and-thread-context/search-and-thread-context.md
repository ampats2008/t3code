# Plan: Conversation Search + Cross-Thread Context

## Overview

Two tightly coupled features shipped as one vertical slice:

1. **Search infrastructure** — SQLite FTS5 index on thread messages and titles, with a repository layer for querying.
2. **Cross-thread context** — An `@Threads` mention in the composer that lets users attach summarized context from old conversations, and a `search-conversations` agent tool for explicit retrieval.

The search infra serves both the `@Threads` UI and the agent tool. Build once, expose twice.

---

## UX Spec

### @Threads Mention (User-Facing)

1. User types `@` in the composer → existing mention menu appears.
2. A new "Threads" category appears in the menu alongside existing path mentions.
3. Selecting "Threads" opens a sub-menu with:
   - **Search input** — real-time FTS search across all thread titles and message content.
   - **Thread list** — results show thread title, last activity date, and a snippet of the matching content.
   - **Filter toggle** — All / Active / Archived.
4. User selects a thread → an inline `@Thread:title` chip is inserted in the composer (similar to existing `@path` mentions).
5. **On submission**: The server generates an **LLM summary** of the referenced thread (using the model configured in settings as the "text-generation model") and injects it into the conversation context as a system message preceding the user's turn.
   - Summary format: `"Context from thread '[title]' (created [date]):\n[LLM-generated summary]"`
   - Multiple @Thread references = multiple summaries, each injected.

### Agent Tool — `search-conversations` (Agent-Facing)

- **Explicit only** — agent calls this tool only when the user asks it to search past conversations. No proactive searching.
- Tool schema:
  ```
  search-conversations({ query: string, limit?: number })
  → { results: [{ threadId, title, matches: [{ messageSnippet, relevance }] }] }
  ```
- Returns FTS5 BM25-ranked results with highlighted snippets.
- Agent can use these results to inform its response or suggest threads to the user.

### Global Search UI
- **Out of scope** for this plan. Tabled as future nice-to-have. The FTS infrastructure built here will support it when needed.

---

## Data Model Changes

### Migration 020: FTS5 Tables

**New file**: `apps/server/src/persistence/Migrations/020_ConversationFTS.ts`

```sql
-- FTS index on message content
CREATE VIRTUAL TABLE projection_messages_fts USING fts5(
  thread_id UNINDEXED,
  message_id UNINDEXED,
  role UNINDEXED,
  message_text,
  content='projection_thread_messages',
  content_rowid='rowid'
);

-- FTS index on thread titles
CREATE VIRTUAL TABLE projection_threads_fts USING fts5(
  thread_id UNINDEXED,
  title,
  content='projection_threads',
  content_rowid='rowid'
);
```

**FTS sync strategy**: Rather than SQLite triggers (fragile with the event-sourcing projector), the projector will update FTS tables inline whenever it writes to the source projection tables. This keeps sync logic co-located with projection logic.

### Backfill

The migration includes a one-time backfill:
```sql
INSERT INTO projection_messages_fts(thread_id, message_id, role, message_text)
  SELECT threadId, id, role, text FROM projection_thread_messages;

INSERT INTO projection_threads_fts(thread_id, title)
  SELECT id, title FROM projection_threads WHERE deletedAt IS NULL;
```

---

## Contracts Changes

**File**: `packages/contracts/src/orchestration.ts`

### New WS Method

```typescript
export const ORCHESTRATION_WS_METHODS = {
  // ...existing
  searchConversations: "orchestration.searchConversations",
} as const;
```

### New Request/Response Types

```typescript
export const ConversationSearchRequest = Schema.Struct({
  projectId: ProjectId,
  query: Schema.String,
  limit: Schema.optional(Schema.Number),
  filter: Schema.optional(Schema.Literals(["all", "active", "archived"])),
});

export const ConversationSearchMatch = Schema.Struct({
  messageId: Schema.optional(MessageId),
  snippet: Schema.String,
  relevance: Schema.Number,
});

export const ConversationSearchResult = Schema.Struct({
  threadId: ThreadId,
  threadTitle: Schema.String,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  matches: Schema.Array(ConversationSearchMatch),
});

export const ConversationSearchResponse = Schema.Struct({
  results: Schema.Array(ConversationSearchResult),
});
```

### @Thread Mention Schema

Extend the existing mention/attachment system:

```typescript
export const ThreadMentionAttachment = Schema.Struct({
  type: Schema.Literal("thread-reference"),
  threadId: ThreadId,
  threadTitle: Schema.String,
});
```

Add to the `ChatAttachment` union so it flows through existing attachment plumbing.

---

## Implementation Steps

### Step 1: Migration 020 — FTS Schema + Backfill

**New file**: `apps/server/src/persistence/Migrations/020_ConversationFTS.ts`

- Create both FTS5 virtual tables.
- Backfill from existing projection data.
- Register in `Migrations.ts` as entry `[20, "ConversationFTS", Migration0020]`.

### Step 2: Search Repository

**New file**: `apps/server/src/persistence/Layers/ConversationSearchRepository.ts`

```typescript
class ConversationSearchRepository {
  // Full-text search across messages and thread titles
  searchAll(query: string, options?: {
    projectId?: string;
    limit?: number;
    filter?: "all" | "active" | "archived";
  }): Promise<ConversationSearchResult[]>

  // FTS maintenance: called by projector
  indexMessage(threadId: string, messageId: string, role: string, text: string): Promise<void>
  updateThreadTitle(threadId: string, title: string): Promise<void>
  removeThread(threadId: string): Promise<void>
}
```

Uses FTS5 BM25 ranking. Snippet extraction via `snippet()` function. Groups results by thread.

Follow the repository pattern from `ProjectionThreadRepository`.

### Step 3: Projector — FTS Sync

**Modify**: `apps/server/src/orchestration/projector.ts`

Inject `ConversationSearchRepository` into the projector. At each projection point:

- **On message insert** → call `indexMessage()`.
- **On thread title update** → call `updateThreadTitle()`.
- **On thread delete** → call `removeThread()`.

This replaces the trigger-based approach from the earlier plan — more reliable, co-located with projection logic.

### Step 4: WebSocket Handler — Search Endpoint

**Modify**: `apps/server/src/wsServer.ts`

Add handler for `orchestration.searchConversations`:
1. Validate `ConversationSearchRequest`.
2. Dispatch to `ConversationSearchRepository.searchAll()`.
3. Return `ConversationSearchResponse`.

### Step 5: Client API — Search Method

**Modify**: `apps/web/src/wsNativeApi.ts` (or equivalent native API layer)

```typescript
searchConversations(request: {
  projectId: string;
  query: string;
  limit?: number;
  filter?: "all" | "active" | "archived";
}): Promise<ConversationSearchResponse>
```

### Step 6: @Threads Mention — Composer Integration

#### 6a: Mention Type

**Modify**: `apps/web/src/composer-editor-mentions.ts` (or equivalent)

Add `"thread"` as a new mention type alongside existing `"path"` mentions. Thread mentions render as `@Thread:title` chips in the composer.

#### 6b: Command Menu — Thread Search Sub-Menu

**Modify**: `apps/web/src/components/chat/ComposerCommandMenu.tsx`

Add a new `item.type === "thread"` category:
- When the user types `@` and selects "Threads" (or types `@Threads`), switch the menu to thread search mode.
- Render a search input at the top of the menu.
- On keystroke, debounce (200ms) and call `searchConversations()`.
- Display results: thread title, date, snippet.
- Filter toggle: All / Active / Archived.
- On selection, insert a thread mention chip into the composer.

#### 6c: Trigger Detection

**Modify**: `apps/web/src/composer-logic.ts`

Extend `detectComposerTrigger()` to recognize `@Threads` as a trigger that opens the thread search sub-menu. Could reuse the existing `"path"` trigger kind or add a new `"thread-mention"` trigger kind.

### Step 7: Thread Summary Generation

**New file**: `apps/server/src/orchestration/Layers/ThreadSummarizer.ts`

When a turn is submitted with `thread-reference` attachments:

1. Load the full message history of the referenced thread.
2. Call the configured text-generation model with a summarization prompt:
   ```
   Summarize the following conversation thread concisely. Focus on key decisions,
   outcomes, and context that would be useful for someone continuing related work.

   Thread: "[title]"
   [messages...]
   ```
3. Return the summary text.

**Integration point**: Hook into the turn start flow in `OrchestrationEngine` or `ProviderCommandReactor`. Before the provider processes the turn, resolve all `thread-reference` attachments into summary text and inject as system context.

### Step 8: Agent Tool — `search-conversations`

**Modify**: `apps/server/src/provider/Layers/ClaudeAdapter.ts`

Register a custom tool:
```typescript
{
  name: "search-conversations",
  description: "Search past conversation threads by keyword. Use when the user asks you to find or reference previous conversations.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search keywords" },
      limit: { type: "number", description: "Max results (default 5)" },
    },
    required: ["query"],
  },
}
```

Intercept in the tool execution callback (`canUseTool` / tool handler):
1. Parse input.
2. Call `ConversationSearchRepository.searchAll()`.
3. Format results as structured text for the agent.
4. Return as tool result.

Tool auto-classifies as `dynamic_tool_call` per existing patterns.

---

## File Summary

| File | Action | Purpose |
|---|---|---|
| `apps/server/src/persistence/Migrations/020_ConversationFTS.ts` | **New** | FTS5 tables + backfill |
| `apps/server/src/persistence/Migrations.ts` | Modify | Register migration 020 |
| `apps/server/src/persistence/Layers/ConversationSearchRepository.ts` | **New** | Search query layer |
| `packages/contracts/src/orchestration.ts` | Modify | Search request/response types, `ThreadMentionAttachment`, WS method |
| `apps/server/src/orchestration/projector.ts` | Modify | FTS sync on message/thread projection |
| `apps/server/src/wsServer.ts` | Modify | Search WS endpoint |
| `apps/web/src/wsNativeApi.ts` | Modify | Client search method |
| `apps/web/src/composer-logic.ts` | Modify | `@Threads` trigger detection |
| `apps/web/src/composer-editor-mentions.ts` | Modify | Thread mention type |
| `apps/web/src/components/chat/ComposerCommandMenu.tsx` | Modify | Thread search sub-menu UI |
| `apps/server/src/orchestration/Layers/ThreadSummarizer.ts` | **New** | LLM-powered thread summarization |
| `apps/server/src/orchestration/Layers/OrchestrationEngine.ts` | Modify | Resolve thread-reference attachments on turn start |
| `apps/server/src/provider/Layers/ClaudeAdapter.ts` | Modify | `search-conversations` agent tool |

---

## Dependency Graph

```
Migration 020 (FTS tables)
    │
    ▼
ConversationSearchRepository
    │
    ├──────────────────────┐
    ▼                      ▼
WS search endpoint    Projector FTS sync
    │
    ├──────────────────────┐
    ▼                      ▼
@Threads mention UI    Agent tool (search-conversations)
    │
    ▼
ThreadSummarizer (LLM summary on turn start)
```

Steps 1–3 are foundation. Steps 4–5 wire up the API. Steps 6–8 are the two consumer UIs and can be built in parallel.

---

## Risks & Edge Cases

| Risk | Mitigation |
|---|---|
| FTS index grows large with many threads/messages | FTS5 is efficient for text search. Run `INSERT INTO projection_messages_fts(projection_messages_fts) VALUES('optimize')` periodically if needed. |
| Summarization latency on turn start | Summary generation adds latency before the agent sees the turn. Mitigate: cache summaries per thread (invalidate on new message). Show a "Loading context..." indicator in UI. |
| Summarization cost (LLM call per referenced thread) | Cache aggressively. Use the user's configured text-gen model (likely a cheaper/faster model). Limit to 1-3 thread references per message. |
| FTS sync drift from projections | Sync is inline in the projector, not trigger-based — no drift possible unless projector code has bugs. Test with integration tests. |
| Thread mention for deleted/archived thread | Graceful handling: if thread is deleted, show "Thread not found" in summary injection. Archived threads should be searchable and summarizable. |
| Agent floods search tool | Explicit-only (no proactive search). Add a reasonable rate limit or per-turn call limit if needed. |
| Backfill on large existing databases | Backfill runs inside the migration transaction. For very large DBs, this could be slow — but it's a one-time cost at startup. Log progress. |

---

## Supersedes

This plan supersedes and consolidates:
- `.plans/amcode/semantic-search-conversations.md` (search infrastructure)
- `.plans/amcode/thread-linking-command.md` (@Threads mention UX)

Key changes from those earlier plans:
- **Migration number**: 020 (not 006 — we're at 018 now, and 019 is reserved for fork schema).
- **FTS sync via projector** instead of SQL triggers.
- **Summary injection** instead of full thread content injection — per UX decision.
- **Explicit agent search only** — no proactive search.
- **Global search UI tabled** — future nice-to-have.
