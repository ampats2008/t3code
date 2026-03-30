# Plan: Semantic Search for T3Code Conversations

## Context

**Problem**: When starting a new conversation/thread in T3Code that builds off previous discussions, the agent has no way to retrieve relevant context from past conversations. Currently, the agent only sees the current turn's input—there's no mechanism to search historical thread data.

**Goal**: Enable the T3Code agent to semantically search through past conversations to find relevant information. When a user wants to continue work based on previous discussions, the agent can retrieve that context and use it to inform decisions.

**User Intent**:
- Primary: Agent should find similar past conversations/threads and search messages by meaning/keywords
- Access method: New agent tool/skill that agent can call
- Scope: MVP with simple keyword search first (using SQLite FTS), paving path for future semantic embeddings

---

## Recommended Approach

**Phase 1 (MVP): SQLite Full-Text Search (FTS)**
- Implement SQLite FTS5 on conversation messages for keyword-based search
- Create new agent tool: `search-conversations`
- Tool searches message content + thread titles for keywords/phrases
- Returns matching snippets with thread context
- No embeddings/vectors in MVP—just indexed keyword search

**Phase 2 (Future)**: Semantic embeddings + vector search
- Add embedding generation (Claude API embeddings or similar)
- Store embeddings in SQLite using sqlite-vec or similar
- Replace/supplement FTS with semantic similarity search
- Reuse same agent tool interface

---

## Implementation Steps

### Step 1: Add SQLite FTS5 Schema
**File**: `/d/dev/t3code/apps/server/src/persistence/Migrations/006_ConversationFTS.ts` (new)

Create FTS virtual table:
```sql
CREATE VIRTUAL TABLE projection_messages_fts USING fts5(
  message_id UNINDEXED,
  thread_id UNINDEXED,
  thread_title,
  message_text,
  content='projection_thread_messages',
  content_rowid='rowid'
);
```

Also index thread titles in FTS:
```sql
CREATE VIRTUAL TABLE projection_threads_fts USING fts5(
  thread_id UNINDEXED,
  title,
  content='projection_threads',
  content_rowid='rowid'
);
```

Add triggers to keep FTS tables in sync with source tables (insert/update/delete).

### Step 2: Create Search Query Layer
**File**: `/d/dev/t3code/apps/server/src/persistence/Layers/ConversationSearchRepository.ts` (new)

Implement search functionality:
```typescript
interface SearchResult {
  threadId: string
  threadTitle: string
  messageId?: string
  messageText: string
  matchContext: string  // snippet with highlights
  relevance: number
  createdAt: string
}

class ConversationSearchRepository {
  searchMessages(query: string, limit?: number): Promise<SearchResult[]>
  searchThreads(query: string, limit?: number): Promise<SearchResult[]>
  searchAll(query: string, limit?: number): Promise<SearchResult[]>
}
```

Uses FTS5 BM25 ranking for relevance scoring.

### Step 3: Add Orchestration Command
**File**: `/d/dev/t3code/packages/contracts/src/orchestration.ts` (modify)

Add new command:
```typescript
interface SearchConversationsCommand {
  type: 'conversation.search'
  projectId: string
  query: string
  limit?: number
}
```

Add response type:
```typescript
interface ConversationSearchResult {
  threadId: string
  threadTitle: string
  matches: Array<{
    messageId?: string
    text: string
    snippet: string
  }>
}

interface ConversationSearchResponse extends OrchestrationEvent {
  type: 'conversation.search.completed'
  results: ConversationSearchResult[]
}
```

### Step 4: Implement Orchestration Handler
**File**: `/d/dev/t3code/apps/server/src/orchestration/Layers/OrchestrationEngine.ts` (modify)

Add handler for `conversation.search` command:
- Dispatch to `ConversationSearchRepository`
- Return `conversation.search.completed` event with results
- Integrate into existing command dispatch switch statement

### Step 5: Expose Agent Tool
**File**: `/d/dev/t3code/apps/server/src/provider/Layers/ClaudeAdapter.ts` (modify)

Two options:
- **Option A (Simple)**: If Claude CLI's `search-conversations` command already exists, it will auto-discover
- **Option B (Custom)**: Add custom search tool to SDK that:
  - Agent calls with `toolName: "search-conversations"` and `input: { query: string, limit?: number }`
  - Adapter intercepts in `canUseTool` callback
  - Dispatches `conversation.search` command via orchestration
  - Returns results as tool output

**Recommended**: Option B for custom control. Implement in `canUseTool` callback or via custom SDK tool registration.

### Step 6: Add Orchestration Query for Retrieval
**File**: `/d/dev/t3code/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` (modify)

Handle `conversation.search.completed` response:
- Emit as runtime event for UI logging (optional)
- Return structured results to agent via tool result mechanism

### Step 7: Wire Up WebSocket/Command Dispatch
**File**: `/d/dev/t3code/apps/web/src/wsNativeApi.ts` (modify - optional)

Expose search command to web client if needed:
- Add `searchConversations(query: string)` method
- Calls `dispatchCommand({ type: 'conversation.search', ... })`

---

## Critical Files to Modify

1. **New Migration**: `/d/dev/t3code/apps/server/src/persistence/Migrations/006_ConversationFTS.ts`
2. **New Repository**: `/d/dev/t3code/apps/server/src/persistence/Layers/ConversationSearchRepository.ts`
3. **Contracts**: `/d/dev/t3code/packages/contracts/src/orchestration.ts` (add command + response types)
4. **Orchestration Engine**: `/d/dev/t3code/apps/server/src/orchestration/Layers/OrchestrationEngine.ts` (add handler)
5. **Claude Adapter**: `/d/dev/t3code/apps/server/src/provider/Layers/ClaudeAdapter.ts` (expose tool)
6. **Optional**: `/d/dev/t3code/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` (event handling)

---

## Existing Patterns to Follow

1. **Repository Pattern**: Mirror `ProjectionThreadRepository` structure
   - File: `/d/dev/t3code/apps/server/src/persistence/Layers/ProjectionThreadRepository.ts`

2. **Command Dispatch**: Follow existing command handlers
   - File: `/d/dev/t3code/apps/server/src/orchestration/Layers/OrchestrationEngine.ts`
   - Match switch statement pattern for new command type

3. **Event Emission**: Use `ProviderRuntimeEvent` pattern
   - File: `/d/dev/t3code/packages/contracts/src/providerRuntime.ts`

4. **Tool Classification**: Will auto-classify as `dynamic_tool_call`
   - Existing: `/d/dev/t3code/apps/server/src/provider/Layers/ClaudeAdapter.ts` lines 398-440

---

## MVP Verification & Testing

1. **Database Migration Test**:
   - Run migration script
   - Verify FTS tables created
   - Verify triggers work (insert message → FTS updated)

2. **Search Repository Test**:
   - Insert test data into projection tables
   - Call `searchMessages("test query")`
   - Verify results returned with correct ranking

3. **Agent Tool Integration Test**:
   - Start new turn with agent
   - Agent calls `search-conversations` tool with query
   - Verify tool call is intercepted and routed to orchestration
   - Verify results returned to agent as tool output

4. **End-to-End Flow**:
   - Create thread with several messages
   - Start new thread
   - Agent searches for relevant info from old thread
   - Agent uses results in response

---

## Future Enhancements

1. **Semantic Embeddings**: Replace FTS with vector similarity
   - Store Claude API embeddings for messages
   - Use sqlite-vec for vector operations
   - Reuse same `search-conversations` tool interface

2. **Advanced Filtering**:
   - Search by date range, thread, project
   - Filter by message role (user/assistant)
   - Combine keyword + semantic search

3. **Caching**: Cache frequently searched queries

4. **Incremental Indexing**: Update FTS on new messages in real-time

---

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| FTS index grows large with many messages | Use sqlite-optimize periodically; implement retention policy |
| Search on large projects is slow | Add pagination; optimize BM25 query; consider async search |
| Agent misuses search tool (queries unrelated data) | Add rate limiting; require explicit search in agent prompt |
| Migration breaks existing DB | Test migration on dev DB first; add rollback script |

---

## Summary

This plan implements a **keyword-based conversation search** as an agent tool using SQLite FTS5. It follows T3Code's existing patterns (Repository layer, Command dispatch, Runtime events) and provides a clear path to semantic embeddings in the future. The MVP is focused and achievable, with minimal surface area changes.
