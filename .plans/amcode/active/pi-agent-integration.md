# Pi Coding Agent Integration for T3Code

**Status:** Not started
**Created:** 2026-04-20
**Updated:** 2026-05-03
**Goal:** Add Pi coding agent as a provider backend in T3Code via the Pi SDK, enabling model-agnostic coding with full Pi extension ecosystem support.

---

## Motivation

T3Code currently supports four provider backends: Claude (via `@anthropic-ai/claude-agent-sdk`), Codex, OpenCode (via `@opencode-ai/sdk/v2`), and Cursor (via ACP/JSON-RPC). Adding Pi as a fifth provider enables:

- **Model-agnostic coding** — Use any LLM provider (OpenRouter, Ollama, Anthropic, OpenAI, Google, etc.) through Pi's unified provider layer
- **Local model support** — Run Ollama on a work machine with zero data leaving the device (security/compliance friendly)
- **Pi extension ecosystem** — Access the growing library of Pi extensions, skills, packages, and custom tools
- **Agent Skills standard** — Skills compatible with agentskills.io work across Pi, Claude Code, and other agents

---

## Architecture Overview

```
T3Code (Electron)
  +-- React 19 Frontend
  |     +-- Provider dropdown: Claude | Codex | OpenCode | Cursor | Pi
  |     +-- Chat panel (messages, streaming, tool calls)
  |     +-- Diff review (file changes)
  |     +-- Terminal output display
  |     +-- Extension UI rendering (Phase 3)
  |
  +-- WebSocket transport (unchanged)
  |
  +-- Node.js Backend Server
        +-- OrchestrationEngine (unchanged)
        +-- ProviderService (unchanged)
        +-- ProviderAdapterRegistry
        |     +-- ClaudeAdapter   (existing, unchanged)
        |     +-- CodexAdapter    (existing, unchanged)
        |     +-- OpenCodeAdapter (existing, unchanged)
        |     +-- CursorAdapter   (existing, optional, unchanged)
        |     +-- PiAdapter       (NEW -- optional, wraps Pi SDK in-process)
        |
        +-- builtInProviderCatalog.ts
              +-- BuiltInAdapterMap (add optional `pi` field)
              +-- BUILT_IN_PROVIDER_ORDER (append "pi")
```

**Key architectural difference from OpenCode:** OpenCode spawns a local server process and communicates via HTTP/SSE (`OpenCodeRuntime` + `ChildProcessSpawner`). Pi runs **in-process** via its SDK — no child process, no HTTP transport. This simplifies networking but means Pi's SDK lifecycle (memory, cleanup, tool execution) lives in the Electron main process. An external CLI process approach is not viable because Pi's CLI is a TUI app with no headless server mode (unlike OpenCode's `opencode server` or Cursor's ACP-over-stdio). If in-process memory/crash isolation becomes a concern, the SDK can be migrated to a **Node.js worker thread** — events flow via `MessagePort`/structured clone, preserving the full SDK API surface without requiring process boundaries.

---

## Existing T3Code Integration Points

### Provider Adapter Interface

Location: `apps/server/src/provider/Services/ProviderAdapter.ts`

```typescript
ProviderAdapterShape<TError> {
  provider: ProviderKind
  capabilities: ProviderAdapterCapabilities  // { sessionModelSwitch: "in-session" | "unsupported" }

  // Session lifecycle
  startSession(input: ProviderSessionStartInput) -> Effect<ProviderSession, TError>
  stopSession(threadId: ThreadId) -> Effect<void, TError>
  stopAll() -> Effect<void, TError>
  listSessions() -> Effect<ReadonlyArray<ProviderSession>>
  hasSession(threadId: ThreadId) -> Effect<boolean>

  // Turn operations
  sendTurn(input: ProviderSendTurnInput) -> Effect<ProviderTurnStartResult, TError>
  interruptTurn(threadId: ThreadId, turnId?: TurnId) -> Effect<void, TError>

  // Interactive responses
  respondToRequest(threadId, requestId, decision) -> Effect<void, TError>
  respondToUserInput(threadId, requestId, answers) -> Effect<void, TError>

  // Thread inspection
  readThread(threadId: ThreadId) -> Effect<ProviderThreadSnapshot, TError>
  rollbackThread(threadId: ThreadId, numTurns: number) -> Effect<ProviderThreadSnapshot, TError>

  // Events
  streamEvents: Stream<ProviderRuntimeEvent>
}
```

### Provider Registration

Location: `apps/server/src/provider/builtInProviderCatalog.ts`

```typescript
type BuiltInAdapterMap = {
  readonly codex: ProviderAdapterShape<ProviderAdapterError>;
  readonly claudeAgent: ProviderAdapterShape<ProviderAdapterError>;
  readonly opencode: ProviderAdapterShape<ProviderAdapterError>;
  readonly cursor?: ProviderAdapterShape<ProviderAdapterError>;  // optional
};

const BUILT_IN_PROVIDER_ORDER = ["codex", "claudeAgent", "opencode", "cursor"] as const;
```

Location: `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts`

Cursor is conditionally registered via `Effect.serviceOption(CursorAdapter)`. Pi should follow the same pattern.

### Provider Kind Enum

Location: `packages/contracts/src/orchestration.ts`
Currently: `ProviderKind = "codex" | "claudeAgent" | "cursor" | "opencode"`

### Event Types

Location: `packages/contracts/src/providerRuntime.ts`
Canonical events: assistant text, reasoning, file changes, tool calls, approval requests, errors, session state.

### Reference Adapter: OpenCodeAdapter

Location: `apps/server/src/provider/Layers/OpenCodeAdapter.ts` (~1200 lines)

OpenCode is the closest precedent for Pi integration. It handles:
- SDK client session lifecycle with resume state
- Event mapping from SDK events to `ProviderRuntimeEvent`
- Tool approval flow bridging (permission requests + question requests)
- NDJSON event logging via `EventNdjsonLogger`
- Thread snapshots and rollback

**Use OpenCodeAdapter as the primary template for PiAdapter.** Key differences:
- OpenCode communicates over HTTP/SSE to a child process; Pi runs in-process via SDK
- OpenCode uses `@opencode-ai/sdk/v2` client; Pi uses `@mariozechner/pi-agent-core` `Agent` class directly
- Pi has richer session tree structure (built-in branching/forking)

---

## Pi SDK Integration Points

> **SDK Exploration (2026-05-03):** Installed and verified `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, and `@mariozechner/pi-web-ui` v0.72.1. All packages are ESM-only (`"type": "module"`, Node >= 20). T3Code's server already uses ESM — confirmed compatible.

### Packages

| Package | Role | Key Exports |
|---------|------|-------------|
| `@mariozechner/pi-agent-core` | Agent runtime | `Agent` class, `AgentEvent`, `AgentTool`, `BeforeToolCallContext` |
| `@mariozechner/pi-ai` | Model registry + streaming | `getProviders()`, `getModels()`, `getModel()`, `Model`, `streamSimple()`, 956 models across 28 providers |
| `@mariozechner/pi-web-ui` | Web UI components (Lit) | `ChatPanel`, `AgentInterface`, `ModelSelector`, tool renderers — Lit-based, not directly usable in React |

### SDK API Surface

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, getProviders, getModels } from "@mariozechner/pi-ai";

// Get a model from Pi's built-in registry (956 models, 28 providers)
const model = getModel("anthropic", "claude-sonnet-4-20250514");

// Create an agent
const agent = new Agent({
  initialState: {
    model,
    systemPrompt: "You are a coding assistant.",
  },
  // Approval mechanism: return { block: true } to deny a tool call
  beforeToolCall: async (context, signal) => {
    // Emit permission request to T3Code frontend, await decision
    const approved = await waitForUserApproval(context.toolCall);
    if (!approved) return { block: true, reason: "User denied" };
    return undefined; // allow
  },
  // Optional: intercept tool results
  afterToolCall: async (context) => {
    // Extract file diffs, terminal output, etc. for T3Code rendering
    return undefined;
  },
});

// Subscribe to events (returns unsubscribe function)
const unsub = agent.subscribe((event, signal) => {
  // Map AgentEvent to ProviderRuntimeEvent
});

// Send a prompt (returns Promise that resolves when agent is idle)
await agent.prompt("Fix the bug in auth.ts");

// Mid-stream interaction
agent.steer(message);     // inject message after current turn
agent.followUp(message);  // queue for after agent stops

// Cancel
agent.abort();

// State inspection
agent.state.messages;       // AgentMessage[]
agent.state.model;          // current Model
agent.state.thinkingLevel;  // ThinkingLevel
agent.state.isStreaming;    // boolean
agent.state.tools;          // AgentTool[]
agent.state.pendingToolCalls; // ReadonlySet<string>
```

Key differences from the original plan's `createAgentSession()` API:
- **No session manager / auth storage / factory needed** — `Agent` is used directly
- **No `createAgentSessionRuntime()`** — T3Code manages its own session lifecycle
- **Approval via `beforeToolCall` hook**, not a separate permission callback
- **Model registry via `getProviders()` / `getModels()`**, not `ModelRegistry.create()`
- **`getApiKey` callback** for dynamic API key resolution per provider

### Agent Events (verified from types)

```typescript
type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
```

The `message_update` event carries an `AssistantMessageEvent` with subtypes: `text_delta`, `thinking_delta`, `toolcall_delta`, `text_start/end`, `thinking_start/end`, `toolcall_start/end`, `done`, `error`.

### Model Type (verified from types)

```typescript
interface Model<TApi> {
  id: string;          // e.g. "claude-sonnet-4-20250514"
  name: string;        // e.g. "Claude Sonnet 4"
  api: TApi;           // e.g. "anthropic-messages"
  provider: Provider;  // e.g. "anthropic"
  baseUrl: string;
  reasoning: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}
```

Maps cleanly to T3Code's `ServerProviderModel` via:
- `slug` = `"${model.provider}/${model.id}"`
- `name` = `model.name`
- `subProvider` = `model.provider`
- `capabilities` = `{ contextWindow: model.contextWindow, reasoning: model.reasoning, ... }`

### pi-web-ui Assessment

The web-ui package provides **Lit web components** (not React). Cannot be directly embedded in T3Code's React component tree. However:

- **Tool renderer registry** (`registerToolRenderer`, `renderTool`, `BashRenderer`, `DefaultRenderer`) — could be useful for rendering Pi-specific tool results, though T3Code already has its own tool rendering pipeline
- **`ModelSelector` dialog** — Pi's model picker shows all 956 models with search/filter. Not directly usable (Lit), but confirms Pi's model registry is self-contained
- **`ChatPanel` / `AgentInterface`** — full chat UI with streaming, tool calls, cost display. Not usable in T3Code, but good reference for event handling patterns
- **`SessionsStore`, `SettingsStore`** — IndexedDB-backed storage. T3Code uses SQLite, so these aren't needed

**For Phase 3 Extension UI:** The `pi-web-ui` components don't directly help with the extension UI bridge. The extension UI (dialogs, widgets, notifications) is a separate concern from the chat UI. T3Code will implement its own React components for these.

### pi-tui Assessment

`@mariozechner/pi-tui` (transitive dep via pi-web-ui, v0.72.1) exports `TUI`, `Terminal`, `ProcessTerminal`, `Container`, `Input`, `Editor`, `Markdown`, `SelectList`, etc. Targets a `Terminal` abstraction (stdin/stdout based). For Phase 3's `ctx.ui.custom()` terminal pane approach, the `TUI` class would need a custom `Terminal` implementation that bridges to xterm.js PTY — feasible but non-trivial.

---

## Implementation Plan

### Phase 1: SDK-Based PiAdapter (MVP)

**Goal:** Pi appears as an optional provider in T3Code. User can select Pi, pick a model, and have a coding session. All standard coding agent features work (file edits, terminal, streaming, tool approval).

#### Step 1.1: Add Pi SDK Dependency

> **Done (2026-05-03).** Installed via `bun add`. All packages verified working.

```bash
bun add @mariozechner/pi-agent-core @mariozechner/pi-ai
# Optional, for Phase 3 exploration:
bun add @mariozechner/pi-web-ui
```

Installed v0.72.1. Verified:
- ESM-only packages (`"type": "module"`, Node >= 20) — compatible with T3Code's ESM server build
- `Agent` class instantiates and subscribes to events correctly
- `getProviders()` / `getModels()` return 956 models across 28 providers
- No conflicting transitive dependencies observed
- Notable transitive deps: `@anthropic-ai/sdk`, `openai`, `@google/genai`, `@aws-sdk/client-bedrock-runtime` (via pi-ai)

#### Step 1.2: Contracts Update

**File:** `packages/contracts/src/orchestration.ts`

- Add `"pi"` to `ProviderKind` union type: `Schema.Literals(["codex", "claudeAgent", "cursor", "opencode", "pi"])`

**File:** `packages/contracts/src/settings.ts`

Add Pi settings schema following the established pattern (see `OpenCodeSettings`, `CursorSettings`):

```typescript
export const PiSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),  // optional provider, disabled by default
  customModels: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  // No binaryPath -- Pi runs in-process via SDK, not as an external CLI
  // Model setup (Ollama endpoints, API keys) is configured externally via ~/.pi/agent/models.json
});
export type PiSettings = typeof PiSettings.Type;
```

Add `PiSettingsPatch`:

```typescript
const PiSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});
```

Register in `ServerSettings.providers`:

```typescript
providers: Schema.Struct({
  codex: CodexSettings.pipe(...),
  claudeAgent: ClaudeSettings.pipe(...),
  cursor: CursorSettings.pipe(...),
  opencode: OpenCodeSettings.pipe(...),
  pi: PiSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),  // NEW
})
```

And in `ServerSettingsPatch.providers`:

```typescript
pi: Schema.optionalKey(PiSettingsPatch),
```

**File:** `packages/contracts/src/provider.ts`

- Verify `ProviderSession` schema accommodates Pi's session metadata (session file path, tree structure, compaction state)
- Add optional Pi-specific fields if needed

#### Step 1.2b: Settings UI

**File:** `apps/web/src/components/settings/SettingsPanels.tsx`

Add a Pi provider card in the settings panel, following the existing pattern for other providers. Includes:
- Enable/disable toggle
- Custom model slug input (same `customModelInputByProvider` pattern used by all providers)
- No binary path field (Pi is in-process SDK, not a CLI)
- Status indicator showing whether Pi SDK loaded successfully and models are available

The settings panel iterates provider cards generically — Pi just needs to be added to the provider card list with the appropriate fields.

#### Step 1.3: PiAdapter Service Definition

**New file:** `apps/server/src/provider/Services/PiAdapter.ts`

Follow the Cursor/OpenCode pattern — thin service definition:

```typescript
import { Context } from "effect";
import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface PiAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "pi";
}

export class PiAdapter extends Context.Service<PiAdapter, PiAdapterShape>()(
  "t3/provider/Services/PiAdapter",
) {}
```

#### Step 1.4: PiAdapter Implementation

**New file:** `apps/server/src/provider/Layers/PiAdapter.ts`

Implements `PiAdapterShape` by wrapping Pi's `Agent` class in-process. **Use `OpenCodeAdapter` as the primary template.**

**Capabilities:**

```typescript
capabilities: {
  sessionModelSwitch: "in-session",  // Pi supports mid-session model switching via agent.state.model = newModel
}
```

**Session management — matching T3Code's hybrid pattern:**

T3Code uses a hybrid model: T3Code owns session metadata + resume cursors in SQLite (`provider_session_runtime` table), the provider SDK owns live state in memory. PiAdapter must follow the same pattern.

Pi's `Agent` class is stateful and holds the full transcript in memory (`agent.state.messages`). Unlike OpenCode (which has a persistent server process), Pi's Agent is created fresh and must be rehydrated from saved state on resume.

**Pi Resume State:**

```typescript
interface PiResumeState {
  threadId?: ThreadId;           // T3Code canonical thread ID
  messages?: AgentMessage[];     // Serialized transcript for rehydration
  modelSlug?: string;            // "provider/modelId" for model restoration
  thinkingLevel?: ThinkingLevel; // Saved thinking level
  turnCount?: number;            // Number of completed turns
}
```

**Session lifecycle:**

- **Cold start (no resume cursor):** Create `new Agent({ initialState: { model, systemPrompt }, beforeToolCall, ... })`. Subscribe to events. Persist initial `PiResumeState` via `ProviderSessionDirectory.upsert()`.
- **Warm start (resume cursor exists):** Read `PiResumeState` from `binding.resumeCursor`. Create `new Agent()` with `initialState.messages` set to the saved transcript. This restores the full conversation context.
- **During turns:** Update `messages` and `turnCount` in the resume cursor after each completed turn (on `agent_end` event), matching how ClaudeAdapter updates `lastAssistantUuid`.
- **Stop session:** Call `agent.abort()` if streaming. Clear in-memory Agent reference. Resume cursor persists in SQLite for future cold-start recovery.
- **Provider switch:** If threadId exists but bound to a different provider, start fresh (providers are incompatible). Old binding is replaced.

**Method mapping:**

| ProviderAdapterShape | Pi SDK Call | Notes |
|----------------------|------------|-------|
| `startSession(input)` | `new Agent({ initialState, beforeToolCall, ... })` | Create Agent with model from input. If resuming, set `initialState.messages` from saved state. Call `agent.subscribe()`. |
| `sendTurn(input)` | `agent.prompt(text)` | Extract user message. Returns Promise that resolves when agent is idle. Update resume cursor on `agent_end`. |
| `interruptTurn(threadId, turnId?)` | `agent.abort()` | Cancel current run |
| `respondToRequest(threadId, requestId, decision)` | Resolve pending `beforeToolCall` Promise | The `beforeToolCall` hook emits a permission request and awaits resolution. `respondToRequest` resolves that deferred. |
| `respondToUserInput(threadId, requestId, answers)` | `agent.steer(msg)` or `agent.followUp(msg)` | Use `steer` if `agent.state.isStreaming`, otherwise `followUp` |
| `stopSession(threadId)` | `agent.abort()`, unsubscribe, clear reference | Resume cursor persists in DB for later recovery |
| `stopAll()` | Iterate all active agents, abort and dispose each | Called on server shutdown |
| `listSessions()` | Return in-memory agent map | |
| `hasSession(threadId)` | Check in-memory agent map | |
| `readThread(threadId)` | Read `agent.state.messages` | Map to `ProviderThreadSnapshot` |
| `rollbackThread(threadId, numTurns)` | Truncate `agent.state.messages` | Assign truncated array: `agent.state.messages = messages.slice(0, -N)` |
| `streamEvents` | `agent.subscribe((event) => ...)` -> map to `ProviderRuntimeEvent` | See event mapping table |

**Event mapping (Pi `AgentEvent` -> T3Code `ProviderRuntimeEvent`):**

| Pi AgentEvent | T3Code ProviderRuntimeEvent | Mapping Notes |
|---------------|----------------------------|---------------|
| `message_start` | `assistantMessageStart` | |
| `message_update` (where `assistantMessageEvent.type === "text_delta"`) | `assistantTextDelta` | Stream `event.assistantMessageEvent.delta` |
| `message_update` (where `assistantMessageEvent.type === "thinking_delta"`) | `reasoningDelta` | Stream `event.assistantMessageEvent.delta` |
| `message_end` | `assistantMessageEnd` | Extract usage from `event.message.usage` (input, output, cacheRead, cost) |
| `tool_execution_start` | `toolCallStart` | Map `toolCallId`, `toolName`, `args` |
| `tool_execution_update` | `toolCallProgress` | Stream `partialResult` |
| `tool_execution_end` | `toolCallEnd` | Map `result`, `isError`; extract file diffs for write/patch tools |
| `agent_start` | `sessionStart` | |
| `agent_end` | `sessionEnd` | `event.messages` contains full transcript for resume state |
| `turn_start` | `turnStart` | |
| `turn_end` | `turnEnd` | `event.message.usage` has token counts; `event.toolResults` has all tool results |

**Tool call rendering:**

Pi's tool calls include structured data for file operations:
- `write_file` / `patch` -> Extract file path, old content, new content -> Map to T3Code's file diff display. Pi uses V4A patch format -- will need a parser to convert to T3Code's diff components. Check if OpenCodeAdapter already handles a similar format.
- `bash` -> Extract command, stdout, stderr, exit code -> Map to T3Code's terminal output display
- `read_file` / `grep` / `find` / `ls` -> Map to appropriate T3Code content display

**Tool approval flow:**

Pi's `Agent` uses a `beforeToolCall` hook (not a separate permission callback). The hook receives a `BeforeToolCallContext` with the tool name, args, and assistant message. Return `{ block: true, reason: "..." }` to deny.

Implementation pattern:

```typescript
const agent = new Agent({
  beforeToolCall: async (context, signal) => {
    // 1. Check if this tool/args combo is auto-approved (allow-always rules)
    if (isAutoApproved(context.toolCall.name, context.args)) return undefined;

    // 2. Emit permissionRequest event to T3Code frontend
    const requestId = emitPermissionRequest(context);

    // 3. Await user decision via Deferred/Promise (resolved by respondToRequest)
    const decision = await waitForApproval(requestId, signal);

    // 4. Map decision
    if (decision === "decline") return { block: true, reason: "User denied" };
    if (decision === "acceptForSession") addAutoApproval(context.toolCall.name);
    return undefined; // allow
  },
});
```

This maps cleanly to T3Code's existing approval UI — same UX as Claude/OpenCode/Cursor permission requests.

**NDJSON logging:** Reuse `EventNdjsonLogger` (same as OpenCode/Claude adapters) for Pi session event logging.

#### Step 1.5: Pi Provider Configuration

**New file:** `apps/server/src/provider/Services/PiProvider.ts` (service definition)
**New file:** `apps/server/src/provider/Layers/PiProvider.ts` (implementation)

Follows the existing `ServerProviderShape` pattern (see `OpenCodeProvider` as template). Returns a `ServerProvider` snapshot consumed by T3Code's generic model picker UI (`ModelPickerContent` / `ProviderModelPicker`).

Responsibilities:
- Implement `getSnapshot()` / `refresh()` / `streamChanges` per `ServerProviderShape`
- Use Pi's built-in model registry (`getProviders()` / `getModels()` from `@mariozechner/pi-ai`) — returns 956 models across 28 providers out of the box, no external config needed
- Map Pi `Model` objects to `ServerProviderModel[]`:
  - `slug` = `"${model.provider}/${model.id}"` (e.g., `"anthropic/claude-sonnet-4-20250514"`)
  - `name` = `model.name`
  - `subProvider` = `model.provider` (e.g., `"anthropic"`, `"openrouter"`, `"groq"`)
  - `capabilities` from `model.contextWindow`, `model.reasoning`, `model.cost`, `getSupportedThinkingLevels(model)`
- Merge user's `customModels` from `PiSettings` (custom slugs added via settings UI)
- Use `providerModelsFromSettings()` helper (same as OpenCode) to combine built-in + custom models
- Report Pi capabilities per model (thinking levels, context window, vision support from `model.input`) via `ModelCapabilities`
- Return provider state: `"ready"` (Pi SDK always available since it's in-process — no CLI probe needed, unlike OpenCode/Claude)
- API key resolution: Pi's `Agent` accepts a `getApiKey` callback. For V1, keys are resolved from environment variables or `~/.pi/agent/` config. T3Code settings UI can add key management later.

#### Step 1.6: Adapter Registration (Optional, like Cursor)

**File:** `apps/server/src/provider/builtInProviderCatalog.ts`

```typescript
type BuiltInAdapterMap = {
  readonly codex: ProviderAdapterShape<ProviderAdapterError>;
  readonly claudeAgent: ProviderAdapterShape<ProviderAdapterError>;
  readonly opencode: ProviderAdapterShape<ProviderAdapterError>;
  readonly cursor?: ProviderAdapterShape<ProviderAdapterError>;
  readonly pi?: ProviderAdapterShape<ProviderAdapterError>;  // optional
};

const BUILT_IN_PROVIDER_ORDER = [
  "codex", "claudeAgent", "opencode", "cursor", "pi",
] as const satisfies ReadonlyArray<ProviderKind>;
```

Update `createBuiltInAdapterList` to conditionally include Pi:

```typescript
export function createBuiltInAdapterList(adapters: BuiltInAdapterMap) {
  return [
    adapters.codex,
    adapters.claudeAgent,
    adapters.opencode,
    ...(adapters.cursor ? [adapters.cursor] : []),
    ...(adapters.pi ? [adapters.pi] : []),
  ];
}
```

**File:** `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts`

Register Pi conditionally, same pattern as Cursor:

```typescript
const piAdapterOption = yield* Effect.serviceOption(PiAdapter);

createBuiltInAdapterList({
  codex: yield* CodexAdapter,
  claudeAgent: yield* ClaudeAdapter,
  opencode: yield* OpenCodeAdapter,
  ...(cursorAdapterOption._tag === "Some" ? { cursor: cursorAdapterOption.value } : {}),
  ...(piAdapterOption._tag === "Some" ? { pi: piAdapterOption.value } : {}),
});
```

#### Step 1.7: Frontend Provider Picker

No frontend changes needed. T3Code's existing `ModelPickerContent` / `ProviderModelPicker` UI consumes `ServerProvider` snapshots generically. Once `PiProvider` is registered in `builtInProviderCatalog.ts`, Pi automatically appears in the provider dropdown with its models listed. The chat UI, diff review, and terminal display all work through the canonical `ProviderRuntimeEvent` stream.

#### Step 1.8: Testing

- Unit tests for event mapping (Pi SDK events -> ProviderRuntimeEvent)
- Unit tests for tool approval flow bridging
- Integration test: create Pi session via SDK, send prompt, verify streamed events
- Manual test: full coding session in T3Code using Pi with Ollama backend
- Manual test: full coding session using Pi with OpenRouter backend
- Edge cases: long-running tool calls, abort mid-stream, session persistence across T3Code restart, model switching mid-session
- Test optional registration: Pi adapter not provided -> provider doesn't appear, no errors

---

### Phase 2: Session Management + Pi Features

**Goal:** Expose Pi-specific features that T3Code doesn't get from other providers: session tree branching, compaction controls, model/thinking switching.

**Prerequisite:** Phase 1 complete and stable.

**Note:** T3Code is actively building fork/branch navigation UI (BranchBreadcrumbs, BranchPoint components, useThreadTree hook). Pi's built-in tree structure could integrate with or inform that work.

#### Step 2.1: Session Tree Navigation

Pi's `Agent` holds a linear transcript (`agent.state.messages`), but T3Code is already building fork/branch navigation (BranchBreadcrumbs, BranchPoint, useThreadTree). For Pi, branching is implemented at the T3Code layer:
- Fork = create a new Agent with a prefix of the current transcript
- Navigate = swap the active Agent instance (or reload from saved resume state)

**Frontend additions:**
- Session tree visualization (branch points visible in conversation)
- "Fork from here" action on any message
- Navigation between branches via T3Code's thread tree

**Backend:** Manage multiple saved `PiResumeState` entries per thread, each representing a branch point. Load the appropriate transcript when navigating.

#### Step 2.2: Compaction Controls

Pi's `Agent` supports `transformContext` for context management. Implement compaction via:
- `transformContext` callback that prunes old messages when context exceeds a threshold
- Manual compact button that triggers a summary-and-prune cycle
- Context window utilization indicator (estimate tokens from `agent.state.messages`)
- Auto-compaction toggle per session

#### Step 2.3: Model + Thinking Controls

- Mid-session model switching -> `agent.state.model = getModel(provider, modelId)` (direct assignment, no restart)
- Thinking level control -> `agent.state.thinkingLevel = level` (supports: "off", "minimal", "low", "medium", "high", "xhigh")
- Available thinking levels per model via `getSupportedThinkingLevels(model)` from `@mariozechner/pi-ai`
- Display current model and thinking level in session header

#### Step 2.4: Session Stats

- Token usage from `AssistantMessage.usage`: `{ input, output, cacheRead, cacheWrite, totalTokens, cost: { input, output, total } }`
- Cost calculation via `calculateCost(model, usage)` from `@mariozechner/pi-ai`
- Context window utilization estimate from message count / token estimation
- Display in session footer or stats panel

#### Step 2.5: Custom Tools

Register T3Code-specific tools via Pi's `AgentTool` interface:

```typescript
const customTool: AgentTool = {
  name: "t3code_read_file",
  label: "Read File",
  description: "Read a file from the workspace",
  parameters: Type.Object({ path: Type.String() }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    const content = await readFile(params.path);
    return { content: [{ type: "text", text: content }], details: { path: params.path } };
  },
};
agent.state.tools = [...agent.state.tools, customTool];
```

Tools can be added/removed dynamically via `agent.state.tools` assignment. No extension loading system needed for V1 — just register tools directly.

#### Step 2.6: Testing

- Unit tests for session tree navigation
- Integration tests for extension loading and tool registration
- Manual test: fork session, navigate branches, compact, switch models
- Manual test: Pi extension loads and its tools appear in T3Code

---

### Phase 3: Extension UI Bridge

**Goal:** Pi extensions that emit UI updates render natively in T3Code's Electron frontend.

**Prerequisite:** Phase 2 complete.

#### Step 3.1: Custom UiProvider

When embedding Pi via SDK, extension UI methods (`ctx.ui.*`) need a custom `UiProvider` implementation instead of the terminal TUI.

**New file:** `apps/server/src/provider/Layers/PiUiProvider.ts`

Implements Pi's UI interface, bridging each method to T3Code's frontend:

```typescript
// Pseudocode
class T3CodeUiProvider implements UiProvider {
  async select(options) {
    // Emit extensionUiDialog event to frontend
    // Wait for user response via WebSocket
    return selectedValue;
  }
  async confirm(message) { /* same pattern */ }
  async input(prompt) { /* same pattern */ }
  notify(msg, type) { /* emit notification event, fire-and-forget */ }
  setStatus(key, text) { /* emit status event */ }
  setWidget(key, content) { /* emit widget event */ }
  setTitle(text) { /* emit title event */ }
  custom(factory) { /* delegate to terminal pane -- see Step 3.6 */ }
}
```

#### Step 3.2: Extension UI Event Types

**File:** `packages/contracts/src/providerRuntime.ts`

Add new event types:

```typescript
type ExtensionUiDialogRequest = {
  type: "extensionUiDialog"
  id: string
  dialogType: "select" | "confirm" | "input" | "editor"
  title?: string
  message?: string
  options?: Array<{ label: string; value: string }>
  defaultValue?: string
  timeout?: number
}

type ExtensionUiNotification = {
  type: "extensionUiNotification"
  message: string
  level: "info" | "warn" | "error" | "success"
}

type ExtensionUiWidget = {
  type: "extensionUiWidget"
  key: string
  position: "above" | "below"
  content: string[]
}

type ExtensionUiStatus = {
  type: "extensionUiStatus"
  key: string
  text: string
}
```

#### Step 3.3: Frontend UI Components

**New file(s) in:** `apps/web/src/components/extensions/`

- `ExtensionDialog.tsx` — Render select/confirm/input/editor dialogs inline or as modals
- `ExtensionNotification.tsx` — Toast notifications
- `ExtensionWidget.tsx` — Render widget content in designated panel areas
- `ExtensionStatusBar.tsx` — Status line segments in footer

Wire to WebSocket event stream: `extensionUiDialog` -> render dialog -> user responds -> `respondToRequest` back through adapter -> UiProvider promise resolves.

#### Step 3.4: Approval Flow Unification

Pi's tool approval and T3Code's existing approval UI need to work together:

- Pi's bash tool approval -> T3Code's existing terminal approval UI
- Pi's write_file/patch approval -> T3Code's existing diff review UI
- Extension-specific approvals -> New extension dialog UI

#### Step 3.5: Widget Rendering

Pi extensions can set widgets above/below the editor. In T3Code:

- **Above editor:** Collapsible panel above the chat input
- **Below editor:** Panel below the chat messages
- **Status line:** T3Code's existing status bar area

Widget content is text-based. For richer rendering:
- Parse markdown
- Support ANSI color codes (extensions often use chalk)
- Later: structured content (JSON -> React component mapping)

#### Step 3.6: `ctx.ui.custom()` via Terminal Pane

Pi's `ctx.ui.custom()` renders arbitrary TUI components. In Pi's own terminal, it takes over the screen temporarily, then returns control when the extension calls `done()`. T3Code can replicate this pattern by delegating to the **existing per-conversation terminal pane**.

**How it works:**

T3Code already provides a terminal pane per conversation (xterm.js + PTY). When `ctx.ui.custom(factory)` is called:

1. **UiProvider receives the factory call** within the in-process Pi session
2. **Acquires the conversation's terminal PTY handle** from T3Code's terminal manager
3. **Guards against conflicts** — if a bash tool is actively running in the terminal, queues the custom UI until the terminal is idle (or rejects with `undefined` if timeout exceeded)
4. **Instantiates pi-tui targeting the existing PTY** — pi-tui writes to the PTY's output stream, reads from its input stream
5. **Emits a `terminalTakeover` event** to the frontend — T3Code brings the terminal pane to focus and shows an indicator (e.g., "Extension controlling terminal")
6. **Calls the factory** with the pi-tui instance, theme, keybindings, and done callback
7. **User interacts normally** — keypresses in xterm.js -> PTY -> pi-tui -> TUI component
8. **Extension calls `done(result)`** — pi-tui detaches from PTY, terminal pane returns to normal bash state
9. **Emits a `terminalRelease` event** — indicator clears, terminal returns to normal mode
10. **UiProvider returns the result**, Pi session continues

```
Pi session (in-process)
  -> Extension hook fires
    -> ctx.ui.custom(factory)
      -> T3CodeUiProvider.custom(factory)
        -> Acquire terminal PTY for this conversation
        -> Guard: wait if bash tool is running
        -> Create pi-tui instance targeting PTY
        -> Emit terminalTakeover event -> frontend focuses terminal pane
        -> factory(piTui, theme, keybindings, done)
        -> User interacts via xterm.js <-> PTY <-> pi-tui <-> TUI component
        -> Extension calls done(result)
        -> Detach pi-tui from PTY
        -> Emit terminalRelease event -> frontend clears indicator
      -> Return result
    -> Extension continues
  -> Pi session continues streaming events to T3Code
```

**Key implementation details:**

- **No new terminal infrastructure needed** — reuses the existing xterm.js + PTY per conversation
- **Session continuity preserved** — `custom()` is a synchronous UI detour within the Pi session. The session, conversation history, and tool state remain in memory throughout.
- **pi-tui dependency** — `@mariozechner/pi-tui` must be added as a dependency. It's already a transitive dep of the Pi SDK, but may need explicit import for the PTY targeting API.
- **Conflict guard** — Pi's own TUI serializes tool execution and custom UI, so `custom()` should never fire during an active bash tool. But since T3Code's terminal pane is shared with Pi's bash tool output, add a defensive guard: check terminal idle state, queue with timeout, reject if busy.
- **Overlay mode** — Pi's `custom()` supports an `overlay` option that renders on top of existing content rather than replacing it. The terminal pane approach handles this naturally — pi-tui manages the screen buffer within the PTY.

**Fallback:** If the terminal pane is unavailable (e.g., terminal panel is disabled in T3Code settings), return `undefined`. Extensions that use `custom()` are expected to handle this gracefully.

#### Step 3.7: Testing

- Unit tests for each extension UI component
- Integration test: extension emits dialog -> T3Code renders -> user responds -> extension receives response
- Integration test: `custom()` acquires terminal PTY, renders TUI component, user interacts, done() returns control
- Test terminal conflict guard: `custom()` called while bash tool is running -> queues or rejects gracefully
- Test with real Pi extensions (identify 3-5 popular extensions that use UI, including any that use `custom()`)
- Test fallback: terminal pane disabled -> `custom()` returns undefined without crashing

---

## Files to Create/Modify

| File | Action | Phase |
|------|--------|-------|
| `packages/contracts/src/orchestration.ts` | Add `"pi"` to `ProviderKind` | 1 |
| `packages/contracts/src/settings.ts` | Add `PiSettings`, `PiSettingsPatch`, register in `ServerSettings.providers` | 1 |
| `packages/contracts/src/provider.ts` | Add optional Pi session fields | 1 |
| `apps/web/src/components/settings/SettingsPanels.tsx` | Add Pi provider card (enable toggle, custom models) | 1 |
| `apps/server/src/provider/Services/PiAdapter.ts` | **New** -- service definition | 1 |
| `apps/server/src/provider/Layers/PiAdapter.ts` | **New** -- SDK-based adapter impl | 1 |
| `apps/server/src/provider/Services/PiProvider.ts` | **New** -- provider service definition | 1 |
| `apps/server/src/provider/Layers/PiProvider.ts` | **New** -- model listing + capabilities | 1 |
| `apps/server/src/provider/builtInProviderCatalog.ts` | Add optional `pi` to adapter map + order | 1 |
| `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts` | Register PiAdapter conditionally (like Cursor) | 1 |
| Frontend provider picker | Pi appears when adapter is registered | 1 |
| `apps/server/src/provider/Layers/PiUiProvider.ts` | **New** -- extension UI bridge | 3 |
| `packages/contracts/src/providerRuntime.ts` | Add extension UI event types | 3 |
| `apps/web/src/components/extensions/ExtensionDialog.tsx` | **New** | 3 |
| `apps/web/src/components/extensions/ExtensionNotification.tsx` | **New** | 3 |
| `apps/web/src/components/extensions/ExtensionWidget.tsx` | **New** | 3 |
| `apps/web/src/components/extensions/ExtensionStatusBar.tsx` | **New** | 3 |

---

## Dependency Graph

```
Phase 1 (SDK MVP)
  +-- 1.1 Add Pi SDK dependency
  +-- 1.2 Contracts update
  +-- 1.3 PiAdapter service definition (depends on 1.2)
  +-- 1.4 PiAdapter implementation (depends on 1.1, 1.3; template: OpenCodeAdapter)
  +-- 1.5 PiProvider service + impl (parallel with 1.4)
  +-- 1.6 Registration in catalog + registry (depends on 1.3, 1.5; optional like Cursor)
  +-- 1.7 Frontend picker (depends on 1.2)
  +-- 1.8 Testing (depends on all above)

Phase 2 (Pi features, depends on Phase 1)
  +-- 2.1 Session tree navigation (synergy with T3Code's fork/branch UI work)
  +-- 2.2 Compaction controls
  +-- 2.3 Model + thinking controls
  +-- 2.4 Session stats
  +-- 2.5 Extension loading + custom tools
  +-- 2.6 Testing

Phase 3 (Extension UI, depends on Phase 2)
  +-- 3.1 Custom UiProvider
  +-- 3.2 Extension UI event types (parallel with 3.1)
  +-- 3.3 Frontend components (depends on 3.2)
  +-- 3.4 Approval flow unification (depends on 3.3)
  +-- 3.5 Widget rendering (depends on 3.3)
  +-- 3.6 custom() via terminal pane (depends on 3.1, needs terminal manager access)
  +-- 3.7 Testing
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pi SDK API changes between versions | Medium | High | Pin version, test on upgrade. Track Pi releases. |
| Event mapping gaps (Pi events missing from T3Code's event types) | Medium | Medium | Add new ProviderRuntimeEvent variants as needed. Start with core events. |
| Extension UI rendering fidelity | Medium | Low | Most extensions use simple dialogs. `custom()` delegates to terminal pane for full TUI fidelity. |
| Pi's V4A patch format differs from T3Code's diff display | Medium | Medium | Build a V4A -> T3Code diff mapper. Check OpenCodeAdapter for precedent. |
| Pi SDK in-process memory/thread impact | Low | Medium | Monitor. SDK runs tool execution in-process. Profile with large sessions. If isolation becomes necessary, migrate to a Node.js worker thread (structured clone for events, MessagePort for IPC) — straightforward refactor that preserves the SDK API without requiring an external process. |
| Breaking changes in T3Code's ProviderAdapterShape | Low | High | T3Code is under our control. Coordinate changes. |
| Optional registration complexity | Low | Low | Follow exact Cursor pattern -- already proven. |

---

## Open Questions

1. ~~**Model configuration UX**~~ — Resolved: T3Code already has a generic model picker (`ModelPickerContent` / `ProviderModelPicker`) that consumes `ServerProviderModel[]` from each provider's `ServerProviderShape.getSnapshot()`. PiProvider uses `getProviders()` / `getModels()` from `@mariozechner/pi-ai` (956 models, 28 providers built-in) and returns them in the `ServerProviderModel` shape. Custom model slugs can be added via settings UI. API key configuration remains external for V1.
2. ~~**Which Pi version to target?**~~ — Resolved: v0.72.1 installed and verified. Pin to `^0.72.1`.
3. **T3Code licensing** — Verify license permits adding alternative agent backends.
4. ~~**Node.js version conflict**~~ — Resolved: Electron ships Node 22+, Pi requires >= 20.0.0.
5. ~~**SDK API shape**~~ — Resolved via exploration: `Agent` class from `@mariozechner/pi-agent-core` (not `createAgentSession` from `pi-coding-agent`). Approval via `beforeToolCall` hook. Models via `@mariozechner/pi-ai` registry.
