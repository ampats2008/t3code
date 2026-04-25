# Pi Coding Agent Integration for T3Code

**Status:** Not started
**Created:** 2026-04-20
**Goal:** Add Pi coding agent as a provider backend in T3Code via the Pi SDK, enabling model-agnostic coding with full Pi extension ecosystem support.

---

## Motivation

T3Code currently supports two provider backends: Claude (via `@anthropic-ai/claude-agent-sdk`) and Codex. Adding Pi as a third provider enables:

- **Model-agnostic coding** — Use any LLM provider (OpenRouter, Ollama, Anthropic, OpenAI, Google, etc.) through Pi's unified provider layer
- **Local model support** — Run Ollama on a work machine with zero data leaving the device (security/compliance friendly)
- **Pi extension ecosystem** — Access the growing library of Pi extensions, skills, packages, and custom tools
- **Agent Skills standard** — Skills compatible with agentskills.io work across Pi, Claude Code, and other agents

---

## Architecture Overview

```
T3Code (Electron)
  ├── React 19 Frontend
  │     ├── Provider dropdown: Claude | Codex | Pi
  │     ├── Chat panel (messages, streaming, tool calls)
  │     ├── Diff review (file changes)
  │     ├── Terminal output display
  │     └── Extension UI rendering (Phase 3)
  │
  ├── WebSocket transport (unchanged)
  │
  └── Node.js Backend Server
        ├── OrchestrationEngine (unchanged)
        ├── ProviderService (unchanged)
        └── ProviderAdapterRegistry
              ├── ClaudeAdapter   (existing, unchanged)
              ├── CodexAdapter    (existing, unchanged)
              └── PiAdapter       (NEW — wraps Pi SDK)
```

---

## Existing T3Code Integration Points

### Provider Adapter Interface

Location: `apps/server/src/provider/Services/ProviderAdapter.ts`

```typescript
ProviderAdapterShape {
  provider: ProviderKind
  startSession(threadId, input) → Effect<ProviderSession>
  sendTurn(input) → Effect<ProviderTurnStartResult>
  interruptTurn(input) → Effect<void>
  respondToRequest(input) → Effect<void>
  respondToUserInput(input) → Effect<void>
  stopSession(input) → Effect<void>
  streamEvents → Stream<ProviderRuntimeEvent>
}
```

### Provider Registration

Location: `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts`
Currently registers: `[CodexAdapter, ClaudeAdapter]` (line 30)

### Provider Kind Enum

Location: `packages/contracts/src/orchestration.ts`
Currently: `ProviderKind = "codex" | "claudeAgent"`

### Event Types

Location: `packages/contracts/src/providerRuntime.ts`
Canonical events: assistant text, reasoning, file changes, tool calls, approval requests, errors, session state.

---

## Pi SDK Integration Points

### SDK API Surface

```typescript
import { createAgentSession, createAgentSessionRuntime } from "@mariozechner/pi-coding-agent";

const { session, extensionsResult } = await createAgentSession({
  sessionManager: SessionManager.create(),  // file-backed at ~/.pi/agent/sessions/
  authStorage: AuthStorage.create(),
  modelRegistry: ModelRegistry.create(authStorage),
  cwd: workspaceDir,
  // additionalExtensionPaths: [],
  // customTools: [],
  // skillsOverride: [],
  // systemPromptOverride: "",
});

session.subscribe((event) => { /* map to ProviderRuntimeEvent */ });
session.prompt(userMessage);
session.abort();
```

Key methods:
- `session.prompt(text, options?)` — send a turn
- `session.steer(text)` / `session.followUp(text)` — mid-stream messages
- `session.abort()` — cancel current operation
- `session.subscribe(listener)` — event stream
- `session.agent.state` — messages, model, tools, isStreaming
- `session.setModel(model)` / `session.setThinkingLevel(level)`
- `session.compact(instructions?)` — manual compaction
- `session.navigateTree(targetId)` — session tree branching

Multi-session lifecycle:
- `createAgentSessionRuntime(factory, options)` — manages new, switch, fork, clone operations
- Sessions persist as JSONL files with tree structure (branching/forking built in)

### SDK Events

| Event | Description |
|-------|-------------|
| `agent_start` / `agent_end` | Session lifecycle |
| `turn_start` / `turn_end` | Per-turn lifecycle (includes token usage) |
| `message_start` / `message_update` / `message_end` | Streaming assistant responses (text_delta, thinking_delta) |
| `tool_execution_start` / `tool_execution_update` / `tool_execution_end` | Tool calls with streaming output |
| `queue_update` | Queued steer/follow-up messages |
| `compaction_start` / `compaction_end` | Context compaction |
| `auto_retry_start` / `auto_retry_end` | Automatic retry on failure |

### Extension UI Capabilities

| UI Method | Type | SDK Support | T3Code Rendering |
|-----------|------|-------------|------------------|
| `ctx.ui.select(options)` | Dialog (blocking) | Yes | Electron dialog or inline dropdown |
| `ctx.ui.confirm(message)` | Dialog (blocking) | Yes | Electron confirm or inline button |
| `ctx.ui.input(prompt)` | Dialog (blocking) | Yes | Inline text input |
| `ctx.ui.editor(content)` | Dialog (blocking) | Yes | Inline editor panel |
| `ctx.ui.notify(msg, type)` | Fire-and-forget | Yes | Toast notification |
| `ctx.ui.setStatus(key, text)` | Fire-and-forget | Yes | Status bar segment |
| `ctx.ui.setWidget(key, lines)` | Fire-and-forget | Yes | Sidebar widget or panel |
| `ctx.ui.setTitle(text)` | Fire-and-forget | Yes | Window/tab title |
| `ctx.ui.custom(factory)` | TUI-exclusive | Returns undefined | Not supported (see Phase 3) |
| `ctx.ui.setEditorComponent(f)` | TUI-exclusive | No-op | Not supported |
| `ctx.ui.setFooter(factory)` | TUI-exclusive | No-op | Not supported |

When using the SDK in-process, extension UI methods need a custom `UiProvider` implementation that bridges to T3Code's frontend instead of a terminal.

---

## Implementation Plan

### Phase 1: SDK-Based PiAdapter (MVP)

**Goal:** Pi appears as a provider option in T3Code. User can select Pi, pick a model, and have a coding session. All standard coding agent features work (file edits, terminal, streaming, tool approval).

#### Step 1.1: Add Pi SDK Dependency

```bash
pnpm add @mariozechner/pi-coding-agent
```

Verify compatibility:
- Node.js version: Pi requires >= 20.6.0, Electron 40 ships Node 22+ (should be fine)
- ESM compatibility with T3Code's build setup
- No conflicting transitive dependencies

#### Step 1.2: Contracts Update

**File:** `packages/contracts/src/orchestration.ts`

- Add `"pi"` to `ProviderKind` union type
- Add Pi-specific configuration types (thinking level, auto-compaction preference)

**File:** `packages/contracts/src/provider.ts`

- Verify `ProviderSession` schema accommodates Pi's session metadata (session file path, tree structure, compaction state)
- Add optional Pi-specific fields if needed

#### Step 1.3: PiAdapter Implementation

**New file:** `apps/server/src/provider/Layers/PiAdapter.ts`

Implements `ProviderAdapterShape` by wrapping the Pi SDK directly.

**Session management — matching T3Code's hybrid pattern:**

T3Code uses a hybrid model for Claude/Codex: T3Code owns session metadata + resume cursors in SQLite (`provider_session_runtime` table), the provider SDK owns live state in memory. PiAdapter must follow the same pattern.

**Pi Resume State:**

```typescript
interface PiResumeState {
  threadId?: ThreadId;           // T3Code canonical thread ID
  piSessionFile?: string;        // Path to Pi's JSONL session file
  piSessionId?: string;          // Pi session UUID for resumption
  lastMessageId?: string;        // Last message ID in Pi's tree (for mid-turn recovery)
  turnCount?: number;            // Number of completed turns
}
```

**Session lifecycle:**

- **Cold start (no resume cursor):** Call `createAgentSession()` with CWD set to workspace directory. After session is created, persist a `PiResumeState` with the session file path and UUID via `ProviderSessionDirectory.upsert()`.
- **Warm start (resume cursor exists):** Read `PiResumeState` from `binding.resumeCursor`. Use `runtime.switchSession()` to load the existing Pi session file. Pi's JSONL tree structure enables resumption from any point.
- **During turns:** Update `lastMessageId` and `turnCount` in the resume cursor after each completed turn, matching how ClaudeAdapter updates `lastAssistantUuid`.
- **Stop session:** Clear in-memory session context. Resume cursor persists in SQLite for future cold-start recovery.
- **Provider switch:** If threadId exists but bound to a different provider, start fresh (providers are incompatible). Old binding is replaced.

**Method mapping:**

| ProviderAdapterShape | Pi SDK Call | Notes |
|----------------------|------------|-------|
| `startSession(threadId, input)` | `createAgentSession()` or `runtime.switchSession()` | Check `input.resumeCursor` for existing Pi session. Set CWD to workspace. Upsert binding after creation. |
| `sendTurn(input)` | `session.prompt(text)` | Extract user message. Update resume cursor after turn completes. |
| `interruptTurn(input)` | `session.abort()` | Cancel current operation |
| `respondToRequest(input)` | Custom UiProvider callback | Resolve pending approval/dialog promise |
| `respondToUserInput(input)` | `session.steer(text)` or `session.followUp(text)` | Depends on `session.agent.state.isStreaming` |
| `stopSession(input)` | Dispose session, clean up event subscriptions | Resume cursor persists in DB for later recovery |
| `streamEvents` | `session.subscribe()` → map to `ProviderRuntimeEvent` | See event mapping table |

**Event mapping (Pi SDK → T3Code):**

| Pi SDK Event | T3Code ProviderRuntimeEvent | Mapping Notes |
|--------------|----------------------------|---------------|
| `message_start` (role: assistant) | `assistantMessageStart` | |
| `message_update` (text_delta) | `assistantTextDelta` | Stream text chunks |
| `message_update` (thinking_delta) | `reasoningDelta` | If thinking enabled |
| `message_end` | `assistantMessageEnd` | Include usage stats from event |
| `tool_execution_start` | `toolCallStart` | Map tool name + args |
| `tool_execution_update` | `toolCallProgress` | Stream tool output |
| `tool_execution_end` | `toolCallEnd` | Map result; extract file diffs for write/patch tools |
| `agent_start` | `sessionStart` | |
| `agent_end` | `sessionEnd` | |
| `turn_start` | `turnStart` | |
| `turn_end` | `turnEnd` | Include token usage |
| `compaction_start/end` | `statusUpdate` | Informational |

**Tool call rendering:**

Pi's tool calls include structured data for file operations:
- `write_file` / `patch` → Extract file path, old content, new content → Map to T3Code's file diff display. Pi uses V4A patch format — will need a parser to convert to T3Code's diff components.
- `bash` → Extract command, stdout, stderr, exit code → Map to T3Code's terminal output display
- `read_file` / `grep` / `find` / `ls` → Map to appropriate T3Code content display

**Tool approval flow:**

Pi's SDK uses a permission callback for dangerous operations (bash commands, file writes). Implement a custom approval handler that:
1. Emits a `permissionRequest` event to T3Code's frontend
2. Returns a Promise that resolves when the user approves/denies via T3Code's existing approval UI
3. Maps T3Code's allow-once/allow-always/deny back to Pi's approval response

#### Step 1.4: Pi Provider Configuration

**New file:** `apps/server/src/provider/Layers/PiProvider.ts`

Responsibilities:
- List available Pi models by reading Pi's `ModelRegistry` (queries `~/.pi/agent/models.json` + built-in provider catalog)
- Report Pi capabilities (available tools, thinking levels, context window per model)
- Handle Pi-specific settings (auto-compaction, auto-retry, thinking level)

#### Step 1.5: Adapter Registration

**File:** `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts`

- Import `PiAdapter`
- Add to registration array: `[CodexAdapter, ClaudeAdapter, PiAdapter]`

#### Step 1.6: Frontend Provider Picker

**File:** Provider selection UI in `apps/web/src/`

- Pi appears in the provider dropdown alongside Claude and Codex
- Model sub-picker shows Pi's available models (Ollama locals, OpenRouter, API providers)
- No other frontend changes needed — existing chat UI, diff review, terminal display all work through the canonical `ProviderRuntimeEvent` stream

#### Step 1.7: Testing

- Unit tests for event mapping (Pi SDK events → ProviderRuntimeEvent)
- Unit tests for tool approval flow bridging
- Integration test: create Pi session via SDK, send prompt, verify streamed events
- Manual test: full coding session in T3Code using Pi with Ollama backend
- Manual test: full coding session using Pi with OpenRouter backend
- Edge cases: long-running tool calls, abort mid-stream, session persistence across T3Code restart, model switching mid-session

---

### Phase 2: Session Management + Pi Features

**Goal:** Expose Pi-specific features that T3Code doesn't get from Claude/Codex: session tree branching, compaction controls, model/thinking switching.

**Prerequisite:** Phase 1 complete and stable.

#### Step 2.1: Session Tree Navigation

Pi sessions are tree-structured (not linear). Each message has `id`/`parentId` fields, enabling branching.

**Frontend additions:**
- Session tree visualization (branch points visible in conversation)
- "Fork from here" action on any message
- Navigation between branches via `session.navigateTree(targetId)`

**Backend:** Expose `session.navigateTree()` and `runtime.forkSession()` through a new WebSocket method or extend existing session management.

#### Step 2.2: Compaction Controls

- Manual compact button → `session.compact(instructions?)`
- Compaction status indicator (context window utilization from `session.agent.state`)
- Auto-compaction toggle per session

#### Step 2.3: Model + Thinking Controls

- Mid-session model switching → `session.setModel(model)` (no need to restart session)
- Thinking level control → `session.setThinkingLevel(level)`
- Display current model and thinking level in session header

#### Step 2.4: Session Stats

- Token usage, cost, context window utilization via SDK state access
- Display in session footer or stats panel

#### Step 2.5: Extension Loading + Custom Tools

Load Pi extensions in-process via the SDK:

```typescript
const { session, extensionsResult } = await createAgentSession({
  // Auto-discovers from ~/.pi/agent/extensions/ and .pi/extensions/
  additionalExtensionPaths: ["/path/to/custom/extensions"],
});
```

Extensions register tools, commands, shortcuts, and event hooks. Expose extension-registered commands in T3Code's command palette.

Register T3Code-specific custom tools via `defineTool()` if needed (e.g., tools that interact with T3Code's file tree, git panel, etc.).

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
  custom(factory) { /* delegate to terminal pane — see Step 3.6 */ }
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

Wire to WebSocket event stream: `extensionUiDialog` → render dialog → user responds → `respondToRequest` back through adapter → UiProvider promise resolves.

#### Step 3.4: Approval Flow Unification

Pi's tool approval and T3Code's existing approval UI need to work together:

- Pi's bash tool approval → T3Code's existing terminal approval UI
- Pi's write_file/patch approval → T3Code's existing diff review UI
- Extension-specific approvals → New extension dialog UI

#### Step 3.5: Widget Rendering

Pi extensions can set widgets above/below the editor. In T3Code:

- **Above editor:** Collapsible panel above the chat input
- **Below editor:** Panel below the chat messages
- **Status line:** T3Code's existing status bar area

Widget content is text-based. For richer rendering:
- Parse markdown
- Support ANSI color codes (extensions often use chalk)
- Later: structured content (JSON → React component mapping)

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
7. **User interacts normally** — keypresses in xterm.js → PTY → pi-tui → TUI component
8. **Extension calls `done(result)`** — pi-tui detaches from PTY, terminal pane returns to normal bash state
9. **Emits a `terminalRelease` event** — indicator clears, terminal returns to normal mode
10. **UiProvider returns the result**, Pi session continues

```
Pi session (in-process)
  → Extension hook fires
    → ctx.ui.custom(factory)
      → T3CodeUiProvider.custom(factory)
        → Acquire terminal PTY for this conversation
        → Guard: wait if bash tool is running
        → Create pi-tui instance targeting PTY
        → Emit terminalTakeover event → frontend focuses terminal pane
        → factory(piTui, theme, keybindings, done)
        → User interacts via xterm.js ↔ PTY ↔ pi-tui ↔ TUI component
        → Extension calls done(result)
        → Detach pi-tui from PTY
        → Emit terminalRelease event → frontend clears indicator
      → Return result
    → Extension continues
  → Pi session continues streaming events to T3Code
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
- Integration test: extension emits dialog → T3Code renders → user responds → extension receives response
- Integration test: `custom()` acquires terminal PTY, renders TUI component, user interacts, done() returns control
- Test terminal conflict guard: `custom()` called while bash tool is running → queues or rejects gracefully
- Test with real Pi extensions (identify 3-5 popular extensions that use UI, including any that use `custom()`)
- Test fallback: terminal pane disabled → `custom()` returns undefined without crashing

---

## Files to Create/Modify

| File | Action | Phase |
|------|--------|-------|
| `packages/contracts/src/orchestration.ts` | Add `"pi"` to `ProviderKind` | 1 |
| `packages/contracts/src/provider.ts` | Add optional Pi session fields | 1 |
| `apps/server/src/provider/Layers/PiAdapter.ts` | **New** — SDK-based adapter | 1 |
| `apps/server/src/provider/Layers/PiProvider.ts` | **New** — model listing + capabilities | 1 |
| `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts` | Register PiAdapter | 1 |
| Frontend provider picker (location TBD) | Add Pi to dropdown | 1 |
| `apps/server/src/provider/Layers/PiUiProvider.ts` | **New** — extension UI bridge | 3 |
| `packages/contracts/src/providerRuntime.ts` | Add extension UI event types | 3 |
| `apps/web/src/components/extensions/ExtensionDialog.tsx` | **New** | 3 |
| `apps/web/src/components/extensions/ExtensionNotification.tsx` | **New** | 3 |
| `apps/web/src/components/extensions/ExtensionWidget.tsx` | **New** | 3 |
| `apps/web/src/components/extensions/ExtensionStatusBar.tsx` | **New** | 3 |

---

## Dependency Graph

```
Phase 1 (SDK MVP)
  ├── 1.1 Add Pi SDK dependency
  ├── 1.2 Contracts update
  ├── 1.3 PiAdapter (depends on 1.1, 1.2)
  ├── 1.4 PiProvider (parallel with 1.3)
  ├── 1.5 Registration (depends on 1.3)
  ├── 1.6 Frontend picker (depends on 1.2)
  └── 1.7 Testing (depends on all above)

Phase 2 (Pi features, depends on Phase 1)
  ├── 2.1 Session tree navigation
  ├── 2.2 Compaction controls
  ├── 2.3 Model + thinking controls
  ├── 2.4 Session stats
  ├── 2.5 Extension loading + custom tools
  └── 2.6 Testing

Phase 3 (Extension UI, depends on Phase 2)
  ├── 3.1 Custom UiProvider
  ├── 3.2 Extension UI event types (parallel with 3.1)
  ├── 3.3 Frontend components (depends on 3.2)
  ├── 3.4 Approval flow unification (depends on 3.3)
  ├── 3.5 Widget rendering (depends on 3.3)
  ├── 3.6 custom() via terminal pane (depends on 3.1, needs terminal manager access)
  └── 3.7 Testing
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pi SDK API changes between versions | Medium | High | Pin version, test on upgrade. Track Pi releases. |
| Event mapping gaps (Pi events missing from T3Code's event types) | Medium | Medium | Add new ProviderRuntimeEvent variants as needed. Start with core events. |
| Pi SDK Node.js version conflict with Electron | Low | High | Check early. Pi requires >= 20.6.0, Electron 40 ships Node 22+. Should be fine. |
| Extension UI rendering fidelity | Medium | Low | Most extensions use simple dialogs. `custom()` delegates to terminal pane for full TUI fidelity. |
| Pi's V4A patch format differs from T3Code's diff display | Medium | Medium | Build a V4A → T3Code diff mapper. Inspect existing CodexAdapter for precedent. |
| Pi SDK in-process memory/thread impact | Low | Medium | Monitor. SDK runs tool execution in-process. Profile with large sessions. |
| Breaking changes in T3Code's ProviderAdapterShape | Low | High | T3Code is under our control. Coordinate changes. |

---

## Open Questions

1. **Model configuration UX** — Should Pi model setup (adding Ollama endpoints, API keys) happen in T3Code's settings UI, or should users configure `~/.pi/agent/models.json` externally? Initial recommendation: external config, add T3Code UI later.
2. **Which Pi version to target?** — Current is v0.67.68. Pin to a specific version or track latest?
4. **T3Code licensing** — Verify license permits adding alternative agent backends.
