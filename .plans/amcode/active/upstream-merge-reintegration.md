# Upstream Merge & Feature Re-integration

## Goal
Merge 255 commits from `pingdotgg/t3code:main` into `feature/main/2am-code` while preserving all fork features (forking, @Threads mentions, element inspector, diff/plan review, skills menu).

**searchConversations feature has been dropped** — no longer needed.

## Status: Phase 1 COMPLETE, Phase 2 IN PROGRESS

### What's Done
- [x] **Merge commit** — 255 upstream commits merged, ~60 conflicts resolved
- [x] **Typecheck passes** — 0 errors across all 10 packages
- [x] **2AM branding preserved** — icons, app name, theme colors, boot splash
- [x] **Fork thread schema preserved** — `forkSource`/`forks` on OrchestrationThread, migrations renumbered to 027/028
- [x] **maxTurns/maxBudgetUsd** Claude guardrails preserved
- [x] **DiffDefaultView/diffDefaultCollapsed** settings preserved
- [x] **threadGenerateTitle** RPC wired into contracts and server ws.ts
- [x] **Database migrations patched** — upstream migrations 19-26 applied to dev DB, fork migrations renumbered

### What's Broken (current blockers)
- [ ] **Thread loading fails** — "Failed to load thread" on existing threads. Root cause: data decode errors in `ProjectionSnapshotQuery.getThreadDetailById`. Migration 026 (CanonicalizeModelSelectionOptions) SQL was run manually but threads still fail. Need to investigate further — may be additional decode issues beyond model_selection_json (e.g., event replay, message attachments, or other schema changes).
- [ ] **Inspector WS** — `ws://127.0.0.1:27182/` connection refused. Expected — `startInspectorWs()` was in old `main.ts` which was deleted. Phase 2 item.

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

### 2a. ~~searchConversations~~ — DROPPED (user decision)

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

### 3a. Debug thread loading failure (CURRENT BLOCKER)
The `subscribeThread` RPC stream fails with "Failed to load thread". Steps to debug:
1. Add temporary logging to `ProjectionSnapshotQuery.getThreadDetailById` to surface the actual decode error
2. Check if the issue is in thread row decode, message decode, activity decode, or event replay
3. May need to run additional data migrations (024 backfill SQL was skipped, 025 cleanup was skipped)
4. The `model_selection_json` was fixed (migration 026 run manually) but there may be other schema mismatches

### 3b. Auth pairing flow
- Upstream added auth pairing (migrations 020-022). Dev mode now requires opening a pairing URL on each server restart. This is working but annoying for dev.

### 3c. Route changes
- Routes changed from `/$threadId` to `/$environmentId/$threadId`
- `useHandleForkThread.ts` and `ChatView.tsx` updated with `@ts-expect-error` — need proper fix

### 3d. Run full test suite
- `bun run test` not yet run
- Expect some failures from architecture changes

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

## Risk Factors
- Thread loading failure may require deeper investigation into how the new subscription-based architecture replays events from the old format
- Some `@ts-expect-error` comments were added to unblock typecheck — these are tech debt that need proper fixes
- `useHandleForkThread.ts` needs refactoring for new environment-based routing and store shape
- `PlanReviewPanel.tsx` needs refactoring for new RPC API (was using old `nativeApi`)

## Success Criteria
- [x] All upstream commits merged
- [x] TypeScript compiles cleanly
- [ ] Dev server starts and threads load correctly
- [ ] All existing tests pass
- [ ] Fork thread feature works end-to-end
- [ ] @Threads mention works
- [ ] Element inspector connects
- [ ] Diff/plan review panels render
- [ ] New prompts can be submitted and fulfilled
