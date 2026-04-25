# Thoughts

## integration

- **Cross-task issue**: `onForkAtMessage` declared as optional in `MessagesTimelineProps` but called without optional-chaining guard at lines 462 and 589 of `MessagesTimeline.tsx`; fixed with `?.` operator.
- **Cross-task issue**: `forks` field added to `OrchestrationThread` schema by `contracts-fork-schemas` worker with `withDecodingDefault(() => [])`, making it required in static TypeScript types. Six test fixtures across `ChatView.browser.tsx`, `KeybindingsToast.browser.tsx`, `store.test.ts`, `commandInvariants.test.ts`, `CheckpointDiffQuery.test.ts`, and `ProjectionSnapshotQuery.test.ts` were missing `forks: []`.
- **Cross-task issue**: `ProjectionSnapshotQuery.ts` thread mapping did not include `forks` field; added `forks: []` as default since the DB layer does not yet query `projection_thread_forks` table. Fork persistence across server restarts is incomplete — forks only survive in the in-memory projector read model.
- **Cross-task issue**: `store.ts` attachment mapping in `syncServerReadModel` assumed all attachments are images, but `search-and-thread-context` feature added `thread-reference` attachment type without updating this mapping; fixed with `flatMap` type narrowing.
- **Worker pattern**: Multiple workers made `Thread.forks` optional to avoid breaking existing fixtures, but the contracts schema type still requires `forks` in raw read model objects, creating a widespread fixture gap.

## web-fork-hook

- **Out-of-scope file**: `apps/web/src/types.ts` — Added `forks?: ThreadForkInfo[]` and `forkSource?` to the `Thread` interface; required for the hook to compile since it accesses `sourceThread.forks`. Made optional (not required) to avoid breaking test fixtures that predated the forks field.
- **Out-of-scope file**: `apps/web/src/store.ts` — Added `forks` and `forkSource` mapping in `syncServerReadModel` so the read model data flows correctly to the client store.
- **Autonomous decision**: Used `forks?: ThreadForkInfo[]` (optional) rather than required, and `(sourceThread.forks ?? []).filter(...)` in the hook for safe access. This avoids breaking existing tests while still providing full functionality once the projector task populates the forks field.
