## integration

- **Cross-task coherence**: Server type check passes with only a pre-existing `runEffectInsideEffect` warning in wsServer.ts (line 662, unrelated to this feature). Web type check is fully clean.
- **Lint**: 9 warnings, 0 errors — all warnings are pre-existing (react-hooks, consistent-function-scoping, unsafe-optional-chaining in unrelated files).
- **Import graph**: `ConversationSearchRepository` is wired through `serverLayers.ts`, `wsServer.ts`, `ProjectionPipeline.ts`, and `ClaudeAdapter.ts` consistently. `searchConversations` is present in both the contracts `NativeApi` type and `wsNativeApi.ts` implementation. `ThreadMentionAttachment` flows correctly from contracts → wsServer passthrough → composer attachment extraction.
- **Worker pattern**: Workers consistently used out-of-scope file edits (`serverLayers.ts`, `ClaudeAdapter.test.ts`) to wire DI — valid approach, noted in thoughts.

## agent-search-tool

- **Autonomous decision**: Used `as unknown as Parameters<typeof tool>[2]` type cast to avoid declaring `zod` as a direct server package dependency — zod is only a peer dep of `@anthropic-ai/claude-agent-sdk`. The runtime behavior is correct since the MCP layer handles validation before calling the handler.
- **Autonomous decision**: Resolved `projectId` best-effort at session start (via `ProjectionThreadRepository.getById`) rather than lazily in the handler, because the threadId is always available at `startSession` call time and the Effect context (`services`) is captured once.
- **Out-of-scope file**: `apps/server/src/serverLayers.ts` — required to provide `ConversationSearchRepository` and `ProjectionThreadRepository` to `claudeAdapterLayer` so the new dependencies resolve at runtime.
- **Out-of-scope file**: `apps/server/src/provider/Layers/ClaudeAdapter.test.ts` — required to add noop mock implementations of the two new repositories so existing tests compile and pass with the updated adapter signature.
