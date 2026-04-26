# Upstream Merge & Feature Re-integration

## Goal
Merge 255 commits from `pingdotgg/t3code:main` into `feature/main/2am-code` while preserving all fork features (forking, @Threads mentions, element inspector, diff/plan review, skills menu).

**searchConversations feature has been dropped** — no longer needed.

## Status: Phase 3 — CORE FUNCTIONALITY RESTORED, polishing remaining features

### What's Done
- [x] **Merge commit** — 255 upstream commits merged, ~60 conflicts resolved
- [x] **Typecheck passes** — 0 errors across all 10 packages
- [x] **2AM branding preserved** — icons, app name, theme colors, boot splash
- [x] **Fork thread schema preserved** — `forkSource`/`forks` on OrchestrationThread, migrations renumbered to 027/028
- [x] **maxTurns/maxBudgetUsd** Claude guardrails preserved
- [x] **DiffDefaultView/diffDefaultCollapsed** settings preserved
- [x] **threadGenerateTitle** RPC wired into contracts and server ws.ts
- [x] **Database migrations patched** — upstream migrations 19-26 applied to dev DB, fork migrations renumbered
- [x] **Thread loading fixed** — missing `fork_source_thread_id`/`fork_source_message_id` columns in `getActiveThreadRowById` SQL query
- [x] **Provider turn start fixed** — removed dropped searchConversations MCP tool (fake Zod schema rejected by updated SDK)
- [x] **autoGenerateThreadTitle setting** — new client setting with toggle in General settings panel
- [x] **Conversations load and prompts work** — confirmed working end-to-end

### Remaining Issues
- [ ] **Inspector WS** — `ws://127.0.0.1:27182/` connection refused. `startInspectorWs()` was in old `main.ts` which was deleted.
- [x] **`@ts-expect-error` tech debt** — RESOLVED: `useHandleForkThread.ts` and `ChatView.tsx` are clean
- [x] **PlanReviewPanel.tsx** — RESOLVED: already uses `readEnvironmentApi()` not old `nativeApi`
- [x] **Test suite** — all tests pass (2 fixed: appBranding expected "2AM Code", clientPersistence missing autoGenerateThreadTitle)

## Key Architecture Changes (Upstream)

| Old File (deleted) | New Replacement |
|--------------------|-----------------|
| `apps/server/src/main.ts` | `bin.ts` + `server.ts` |
| `apps/server/src/wsServer.ts` | `ws.ts` (Effect RPC via `WsRpcLayer`) |
| `apps/server/src/serverLayers.ts` | `server.ts` + `serverRuntimeStartup.ts` + `serverLifecycleEvents.ts` + `serverRuntimeState.ts` + `http.ts` |
| `packages/contracts/src/ws.ts` | `packages/contracts/src/rpc.ts` + `server.ts` |
| `apps/web/src/wsNativeApi.ts` | `apps/web/src/rpc/` directory (AtomRpc client) |
| `apps/server/src/codexAppServerManager.ts` | `packages/effect-codex-app-server/` package |

## Phase 2: Re-integrate Features into Effect RPC

### 2a. ~~searchConversations~~ — DROPPED (removed fake Zod tool from ClaudeAdapter)

### 2b. `threadGenerateTitle` endpoint — DONE (wired in contracts + ws.ts)

### 2c. Inspector WS startup
- Move `startInspectorWs()` call from old `main.ts` into new `bin.ts` or `server.ts`
- Low priority — only affects Chrome extension

### 2d. Skills cache push notification
- Wire `onSkillsCacheChange` into new server push mechanism

### 2e. Thread attachment passthrough
- Find equivalent attachment handling in new RPC request flow
- Add the `if (attachment.type !== "image")` passthrough for @Threads mentions

### 2f. Service layer composition
- Add `ThreadSummarizerLive`, `ConversationSearchRepositoryLive` to the new layer tree in `server.ts`
- These services are imported but may not be wired into the new Effect layer composition

## Phase 3: Fix & Verify

### 3a. ~~Debug thread loading failure~~ — FIXED
Root cause: `getActiveThreadRowById` SQL was missing `fork_source_thread_id`/`fork_source_message_id` columns that `ProjectionThreadDbRowSchema` requires. Also removed the dropped searchConversations MCP tool whose fake Zod schema was rejected by the updated SDK, causing "Provider turn start failed".

### 3b. Auth pairing flow
- Upstream added auth pairing (migrations 020-022). Dev mode now requires opening a pairing URL on each server restart. This is working but annoying for dev.

### 3c. Route changes — DONE
- Routes changed from `/$threadId` to `/$environmentId/$threadId`
- `useHandleForkThread.ts` and `ChatView.tsx` are clean — no `@ts-expect-error` remaining

### 3d. Run full test suite — DONE
- All tests pass after fixing appBranding test (2AM Code branding) and clientPersistence test (autoGenerateThreadTitle)

### 3e. Smoke test features
- [ ] Fork thread feature works end-to-end
- [ ] @Threads mention works
- [ ] Element inspector connects
- [ ] Diff/plan review panels render
- [ ] New thread creation works
- [ ] Prompt submission works

## Our Feature Files (reference)
- `apps/server/src/orchestration/Layers/ThreadSummarizer.ts`
- `apps/server/src/orchestration/Services/ThreadSummarizer.ts`
- `apps/server/src/persistence/Layers/ConversationSearch.ts`
- `apps/server/src/persistence/Services/ConversationSearch.ts`
- `apps/server/src/persistence/Migrations/027_ThreadForks.ts` (renumbered from 019)
- `apps/server/src/persistence/Migrations/028_ConversationFTS.ts` (renumbered from 020)
- `apps/server/src/orchestration/commandInvariants.ts` (fork command)
- `apps/server/src/orchestration/decider.ts` (fork event)
- `apps/server/src/orchestration/projector.ts` (FTS sync)
- `apps/web/src/components/chat/ForkBadge.tsx`
- `apps/web/src/hooks/useHandleForkThread.ts`
- `apps/web/src/components/plan-review/` (all files)
- `apps/web/src/components/diff-review/` (all files)
- `apps/web/src/diffReview.ts`, `apps/web/src/diffReviewStore.ts`
- `apps/web/src/planReview.ts`, `apps/web/src/planReviewStore.ts`
- `extensions/chrome-element-inspector/` (independent, no conflicts)

## Commits So Far
1. `881e9bde` — merge upstream/main (255 commits)
2. `83cc7889` — fix: resolve post-merge type errors across web, server, contracts
3. `fe3a960d` — fix: resolve thread loading, provider turn start, and add title generation setting

## Risk Factors
- ~~Some `@ts-expect-error` comments were added to unblock typecheck~~ — RESOLVED, no ts-expect-error remaining
- ~~`useHandleForkThread.ts` needs refactoring~~ — RESOLVED, properly uses environment-based routing
- ~~`PlanReviewPanel.tsx` needs refactoring~~ — RESOLVED, already uses `readEnvironmentApi()`

## Success Criteria
- [x] All upstream commits merged
- [x] TypeScript compiles cleanly
- [x] Dev server starts and threads load correctly
- [x] New prompts can be submitted and fulfilled
- [x] All existing tests pass
- [ ] Fork thread feature works end-to-end
- [ ] @Threads mention works
- [ ] Element inspector connects
- [ ] Diff/plan review panels render
