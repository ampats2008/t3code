# Upstream Merge & Feature Re-integration

## Goal
Merge 239 commits from `pingdotgg/t3code:main` into `feature/main/2am-code` while preserving all fork features (forking, thread search, conversation search, @Threads mentions, element inspector, diff/plan review, skills menu).

## Context
- Upstream did a major architecture migration from promise-based WS to **Effect RPC** (commit `d8aa2f85`)
- 65 conflicting files, 9 modify/delete conflicts (files we modified that upstream deleted)
- Our WS plumbing (~124 lines across 6 deleted files) needs rewriting for the new architecture
- Estimated effort: **3-4 days**

## Key Architecture Changes (Upstream)

| Old File (deleted) | New Replacement |
|--------------------|-----------------|
| `apps/server/src/main.ts` | `bin.ts` + `server.ts` |
| `apps/server/src/wsServer.ts` | `ws.ts` (Effect RPC via `WsRpcLayer`) |
| `apps/server/src/serverLayers.ts` | `server.ts` + `serverRuntimeStartup.ts` + `serverLifecycleEvents.ts` + `serverRuntimeState.ts` + `http.ts` |
| `packages/contracts/src/ws.ts` | `packages/contracts/src/rpc.ts` + `server.ts` |
| `apps/web/src/wsNativeApi.ts` | `apps/web/src/rpc/` directory (AtomRpc client) |
| `apps/server/src/codexAppServerManager.ts` | `packages/effect-codex-app-server/` package |

## Strategy: Merge Then Fix

### Phase 1: Mechanical Merge Resolution (~4-6 hours)
1. Create a fresh branch off `feature/main/2am-code`
2. Run `git merge upstream/main`
3. Resolve the ~50 "both sides edited" conflicts (mostly accept both, fix imports)
4. For modify/delete conflicts: delete the files (upstream removed them) and note our additions that need re-integration
5. For binary conflicts (icons): accept upstream versions
6. Commit the merge

### Phase 2: Re-integrate WS Plumbing into Effect RPC (~1-2 days)
These are the features that lived in now-deleted files:

#### 2a. `searchConversations` endpoint
- Add RPC method definition to `packages/contracts/src/rpc.ts`
- Implement handler in `apps/server/src/ws.ts` (Effect RPC style)
- Add client call in `apps/web/src/rpc/client.ts`

#### 2b. `threadGenerateTitle` endpoint
- Add RPC method to contracts
- Implement in server `ws.ts`
- Add client call in rpc client

#### 2c. Inspector WS startup
- Move `startInspectorWs()` call from old `main.ts` into new `bin.ts` or `server.ts`

#### 2d. Skills cache push notification
- Wire `onSkillsCacheChange` into new server push mechanism

#### 2e. Thread attachment passthrough
- Find equivalent attachment handling in new RPC request flow
- Add the `if (attachment.type !== "image")` passthrough

#### 2f. Service layer composition
- Add `ThreadSummarizerLive`, `ConversationSearchRepositoryLive`, `ProjectionThreadRepositoryLive`, `ProjectionThreadMessageRepositoryLive` to the new layer tree in `server.ts`

### Phase 3: Fix Imports & Verify (~half day)
1. Fix broken imports across all our feature files that reference moved modules
2. Run `bun run typecheck` — fix type errors
3. Run `bun run test` — fix test failures
4. Manual smoke test of fork, search, and thread features

## Our Feature Files (no architecture mismatch, just need import fixes)
- `apps/server/src/orchestration/Layers/ThreadSummarizer.ts`
- `apps/server/src/orchestration/Services/ThreadSummarizer.ts`
- `apps/server/src/persistence/Layers/ConversationSearch.ts`
- `apps/server/src/persistence/Services/ConversationSearch.ts`
- `apps/server/src/persistence/Migrations/019_ThreadForks.ts`
- `apps/server/src/persistence/Migrations/020_ConversationFTS.ts`
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

## Risk Factors
- Effect RPC patterns may have changed significantly — need to study 2-3 existing handlers as templates before writing ours
- Upstream may have changed orchestration event/command schemas that our fork/search features depend on
- `bun.lock` merge could produce broken dependency resolution — may need `bun install` regeneration

## Success Criteria
- [ ] All upstream commits merged
- [ ] TypeScript compiles cleanly
- [ ] All existing tests pass
- [ ] Fork thread feature works end-to-end
- [ ] Conversation search works end-to-end
- [ ] @Threads mention works
- [ ] Element inspector connects
- [ ] Diff/plan review panels render
