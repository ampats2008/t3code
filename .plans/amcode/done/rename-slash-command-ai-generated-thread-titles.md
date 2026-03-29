# /rename Slash Command — AI-Generated Thread Titles

## Context

Claude Code has a `/rename` command that uses a lightweight model to generate a descriptive thread title from conversation context. We want to replicate this in T3Code. Currently, thread titles are set from a truncation of the first user message — never re-generated with AI. The `/rename` command will allow users to get a better, AI-generated title at any point in the conversation.

## Implementation Plan

### 1. Add prompt builder — `Prompts.ts`

**File:** `D:\dev\t3code\apps\server\src\git\Prompts.ts`

Add a new `buildThreadTitlePrompt` function following the exact pattern of `buildBranchNamePrompt`:

```ts
export interface ThreadTitlePromptInput {
  messages: ReadonlyArray<{ role: string; text: string }>;
}

export function buildThreadTitlePrompt(input: ThreadTitlePromptInput) {
  const conversation = input.messages
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n");

  const prompt = [
    "You generate concise thread titles for coding assistant conversations.",
    "Return a JSON object with key: title.",
    "Rules:",
    "- Title should be 3-8 words summarizing the conversation topic.",
    "- Use sentence case (capitalize only the first word).",
    "- Focus on the user's primary intent or task.",
    "- Do not use quotes or trailing punctuation.",
    "",
    "Conversation:",
    limitSection(conversation, 12_000),
  ].join("\n");

  const outputSchema = Schema.Struct({ title: Schema.String });
  return { prompt, outputSchema };
}
```

### 2. Extend TextGeneration service interface

**File:** `D:\dev\t3code\apps\server\src\git\Services\TextGeneration.ts`

- Add `ThreadTitleGenerationInput` and `ThreadTitleGenerationResult` interfaces (following existing pattern of `BranchNameGenerationInput`/`Result`)
- Add `generateThreadTitle` method to both `TextGenerationService` (Promise-based) and `TextGenerationShape` (Effect-based)

### 3. Implement in both text generation layers

**File:** `D:\dev\t3code\apps\server\src\git\Layers\ClaudeTextGeneration.ts`
- Expand `runClaudeJson` operation type union to include `"generateThreadTitle"`
- Add `generateThreadTitle` method following the `generateBranchName` pattern exactly

**File:** `D:\dev\t3code\apps\server\src\git\Layers\CodexTextGeneration.ts`
- Same changes — expand operation type, add method following existing pattern

### 4. Add `generateThreadTitle` to GitManager

**File:** `D:\dev\t3code\apps\server\src\git\Services\GitManager.ts` (service interface)
**File:** `D:\dev\t3code\apps\server\src\git\Layers\GitManager.ts` (implementation)

Add a `generateThreadTitle` method that delegates to `textGeneration.generateThreadTitle()`. This keeps the wsServer plumbing simple since `GitManager` is already available there. Resolve model selection using `DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER` (same as commit messages).

### 5. Add WS method contract

**File:** `D:\dev\t3code\packages\contracts\src\ws.ts`

- Add to `WS_METHODS`: `threadGenerateTitle: "thread.generateTitle"`
- Define input schema `ThreadGenerateTitleInput = Schema.Struct({ messages: Schema.Array(Schema.Struct({ role: Schema.String, text: Schema.String })) })`
- Add `tagRequestBody(WS_METHODS.threadGenerateTitle, ThreadGenerateTitleInput)` to the `WebSocketRequestBody` union

### 6. Add to NativeApi interface

**File:** `D:\dev\t3code\packages\contracts\src\ipc.ts`

- Add import for input/result types
- Add `thread` namespace to `NativeApi`:
  ```ts
  thread: {
    generateTitle: (input: { messages: Array<{ role: string; text: string }> }) => Promise<{ title: string }>;
  };
  ```

### 7. Add server WS route handler

**File:** `D:\dev\t3code\apps\server\src\wsServer.ts`

Add a case in `routeRequest`:
```ts
case WS_METHODS.threadGenerateTitle: {
  const body = stripRequestTag(request.body);
  return yield* gitManager.generateThreadTitle(body);
}
```

### 8. Add client WS API method

**File:** `D:\dev\t3code\apps\web\src\wsNativeApi.ts`

Add `thread` namespace to the api object:
```ts
thread: {
  generateTitle: (input) => transport.request(WS_METHODS.threadGenerateTitle, input),
},
```

### 9. Register `/rename` slash command

**File:** `D:\dev\t3code\apps\web\src\composer-logic.ts`

- Update type: `export type ComposerSlashCommand = "model" | "plan" | "default" | "rename";`
- Update array: `const SLASH_COMMANDS = ["model", "plan", "default", "rename"] as const;`
- Update `parseStandaloneComposerSlashCommand`: change regex to `/^\/(plan|default|rename)\s*$/i` and add `if (command === "rename") return "rename";`
- Update return type to `Exclude<ComposerSlashCommand, "model"> | null`

### 10. Add menu item and handler in ChatView

**File:** `D:\dev\t3code\apps\web\src\components\ChatView.tsx`

**Menu item** (in `onGetComposerMenuItems`, ~line 1084):
```ts
{
  id: "slash:rename",
  type: "slash-command",
  command: "rename",
  label: "/rename",
  description: "Generate a title for this thread using AI",
},
```

**Handler function** (new `handleRenameThread` callback):
- Collect messages from the active thread (limit to first ~20 messages, truncate each to ~2000 chars)
- Call `api.thread.generateTitle({ messages })`
- Dispatch `thread.meta.update` with the returned title
- Show a toast on error

**Selection handler** (in `onSelectComposerItem`, ~line 3343):
- Add an `if (item.command === "rename")` branch before the existing plan/default handling
- Clear the slash command text from composer
- Call `handleRenameThread()` (fire-and-forget with `void`)

**Standalone handler** (~line 2470):
- In the `if (standaloneSlashCommand)` block, check if it's `"rename"` and call `handleRenameThread()` instead of `handleInteractionModeChange()`

## Files to Modify (in order)

1. `D:\dev\t3code\apps\server\src\git\Prompts.ts` — add `buildThreadTitlePrompt`
2. `D:\dev\t3code\apps\server\src\git\Services\TextGeneration.ts` — add interface + method
3. `D:\dev\t3code\apps\server\src\git\Layers\ClaudeTextGeneration.ts` — implement method
4. `D:\dev\t3code\apps\server\src\git\Layers\CodexTextGeneration.ts` — implement method
5. `D:\dev\t3code\apps\server\src\git\Services\GitManager.ts` — add method to service interface
6. `D:\dev\t3code\apps\server\src\git\Layers\GitManager.ts` — implement method
7. `D:\dev\t3code\packages\contracts\src\ws.ts` — add WS method + input schema
8. `D:\dev\t3code\packages\contracts\src\ipc.ts` — add to NativeApi
9. `D:\dev\t3code\apps\server\src\wsServer.ts` — add route handler
10. `D:\dev\t3code\apps\web\src\wsNativeApi.ts` — add client API method
11. `D:\dev\t3code\apps\web\src\composer-logic.ts` — register slash command
12. `D:\dev\t3code\apps\web\src\components\ChatView.tsx` — menu item + handler

## Verification

1. **Type check:** Run `pnpm typecheck` across the monorepo to verify all contracts are satisfied
2. **Unit tests:** Update `D:\dev\t3code\apps\web\src\composer-logic.test.ts` to cover `/rename` in detection and standalone parsing
3. **Manual test:** Launch T3Code, type `/rename` in the composer — verify the menu item appears, select it, and confirm the thread title updates in the header and sidebar
4. **Edge cases:** Test with empty thread (should gracefully no-op or show a toast), test with a long conversation
