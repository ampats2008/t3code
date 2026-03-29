# Surface Claude Code Skills in T3Code "/" Menu

## Context

The T3Code "/" command menu currently shows only 3 hardcoded items: `/model`, `/plan`, `/default`. Claude Code exposes a rich set of skills (slash commands like `/commit`, `/review-pr`, `/fix-ci`, etc.) through the Agent SDK's `supportedCommands()` API. The `initialize` RPC response already includes a `commands: SlashCommand[]` array, but T3Code discards this response. This plan pipes those skills through the server → web app and displays them in the existing "/" menu.

## Changes

### 1. Add `ServerSkill` schema to contracts
**File:** `packages/contracts/src/server.ts`

- Add `ServerSkill` schema (`name`, `description`, `argumentHint` — all strings)
- Add `skills: Schema.optionalWith(Schema.Array(ServerSkill), { default: () => [] })` to `ServerConfig`

Using `optionalWith` + default ensures backward compatibility (older servers without `skills` won't break the web app).

### 2. Capture skills from `initialize` RPC response
**File:** `apps/server/src/codexAppServerManager.ts` (~line 584)

- Store the `initialize` response instead of discarding it
- Extract `commands` array and store on the manager instance (skills are static per codex binary)
- Add a `getSkills()` accessor method

```typescript
const initResponse = await this.sendRequest(context, "initialize", buildCodexInitializeParams());
// Store skills (static across all sessions)
if (Array.isArray((initResponse as any)?.commands)) {
  this.skills = (initResponse as any).commands;
}
```

### 3. Include skills in `server.getConfig` response
**File:** `apps/server/src/wsServer.ts` (~line 904)

- In the `serverGetConfig` handler, get skills from the codex adapter/manager and include in the returned config object
- Add `skills` field to the response alongside existing `providers`, `keybindings`, etc.

### 4. Add `"skill"` variant to `ComposerCommandItem`
**File:** `apps/web/src/components/chat/ComposerCommandMenu.tsx`

- Add to the union type:
  ```typescript
  | { id: string; type: "skill"; name: string; label: string; description: string; argumentHint: string; }
  ```
- Add icon rendering for `type === "skill"` (use `ZapIcon` from lucide-react to differentiate from built-in commands)

### 5. Broaden slash trigger detection
**File:** `apps/web/src/composer-logic.ts` (~line 204)

- Remove the `SLASH_COMMANDS.some(...)` gate that currently filters unknown commands
- Any `/word` pattern should return a `"slash-command"` trigger so the menu can show and filter dynamically (including skill names)
- `/model` special handling stays as-is
- `parseStandaloneComposerSlashCommand` stays as-is (only intercepts `/plan` and `/default`)

### 6. Merge skills into composer menu items
**File:** `apps/web/src/components/ChatView.tsx` (~line 1083)

- Read skills from `serverConfigQuery.data?.skills ?? []`
- Map each to `ComposerCommandItem` with `type: "skill"`
- Concatenate after the 3 built-in slash command items
- Apply the same text query filtering
- Add `skills` to the `useMemo` dependency array

### 7. Handle skill selection
**File:** `apps/web/src/components/ChatView.tsx` (~line 3370, in `onSelectComposerItem`)

- Add a `type === "skill"` branch:
  - If `argumentHint` is non-empty: replace trigger text with `/<name> ` (trailing space) so user can type arguments
  - If `argumentHint` is empty: replace trigger text with `/<name>`, then auto-send via `queueMicrotask(() => void onSend())`
- This sends `/<skillName>` as regular message text to the Claude turn, which is how skills are invoked

### 8. Update tests
**File:** `apps/server/src/wsServer.test.ts`

- Add `skills: []` to the expected `server.getConfig` response objects in existing tests

## Critical Files
- `packages/contracts/src/server.ts` — schema
- `apps/server/src/codexAppServerManager.ts` — capture init response
- `apps/server/src/wsServer.ts` — serve skills in config
- `apps/server/src/wsServer.test.ts` — test expectations
- `apps/web/src/composer-logic.ts` — trigger detection
- `apps/web/src/components/chat/ComposerCommandMenu.tsx` — UI type + rendering
- `apps/web/src/components/ChatView.tsx` — menu items + selection handler

## Verification
1. Build: `pnpm build` from repo root
2. Run existing tests: `pnpm test` — confirm wsServer tests pass with updated expectations
3. Manual test: Launch T3Code, type "/" in the composer — should see built-in commands AND Claude Code skills (e.g., `/commit`, `/review-pr`)
4. Select a no-arg skill → auto-sends as message
5. Select a skill with arguments → places `/<name> ` in composer, user types args and sends
6. Existing `/model`, `/plan`, `/default` behavior unchanged
