# Rich Tool-Call Display in Chat Timeline

## Context

Tool calls in the chat thread currently render as `SimpleWorkEntryRow` — a single truncated line showing raw JSON:
`[hammer] Subagent task – Agent: {"subagent_type":"Explore","description":"Find diff view...`

We want richer, collapsible UI with structured formatting for qualifying tool types, while keeping simple tools compact.

**Limitation**: The Claude SDK does not stream internal subagent activity, so we can only show input params, progress state, and final result — not a live nested activity log.

**Design reference**: The approved mockup component at `apps/web/src/components/chat/RichToolCallMockup.tsx` is the source of truth for the final UI. The real `RichToolCallRow` component should match its structure, styling, and behavior (collapsible layout, badge usage, truncated text, inline diff, status indicators). Remove the mockup + its import in `MessagesTimeline.tsx` once the real component is wired up.

---

## Phase 1: Extend Data Pipeline

### 1a. Add `data` and `status` to `WorkLogEntry`

**File**: `apps/web/src/session-logic.ts` (line 35)

```typescript
export interface WorkLogEntry {
  // ... existing fields ...
  data?: { toolName?: string; input?: Record<string, unknown>; result?: unknown };
  status?: "inProgress" | "completed" | "failed";
}
```

### 1b. Extract `data` and `status` in `toDerivedWorkLogEntry`

**File**: `apps/web/src/session-logic.ts` (line 487, inside `toDerivedWorkLogEntry`)

After existing field extractions, add:
- Extract `payload.data` → `entry.data` (with `toolName`, `input`, `result` sub-fields)
- Extract `payload.status` → `entry.status`
- Truncate `result` text to ~10KB to avoid memory bloat

### 1c. Merge `data` and `status` in `mergeDerivedWorkLogEntries`

**File**: `apps/web/src/session-logic.ts` (line 563)

Add merge logic: prefer `next.data` but deep-merge with `previous.data` (so `result` from a later `item.completed` merges with `input` from an earlier `item.updated`). Take latest `status`.

### 1d. Ensure server passes `data` through for `item.completed`

**File**: `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` (~line 454)

The `item.completed` handler should include `data` in the activity payload (same as `item.updated` already does).

---

## Phase 2: Classification Helper

**New file**: `apps/web/src/components/chat/toolCallClassification.ts`

```typescript
type ToolDisplayMode = "rich-agent" | "rich-bash" | "rich-edit" | "simple";

function classifyToolDisplayMode(entry: WorkLogEntry): ToolDisplayMode {
  if (entry.itemType === "collab_agent_tool_call") return "rich-agent";
  if (entry.itemType === "command_execution") return "rich-bash";
  if (entry.itemType === "file_change" && entry.requestKind === "file-change") return "rich-edit";
  return "simple";
}
```

### Tool display decisions:
| Tool Type | Mode | Rationale |
|---|---|---|
| Agent/subagent | `rich-agent` | Complex inputs (type, description, prompt), most value from expansion |
| Bash | `rich-bash` | Show command clearly + output |
| Edit | `rich-edit` | Show file path + old/new strings as mini-diff |
| Read, Glob, Grep, Write, MCP | `simple` | Already clear enough as one-liners |

---

## Phase 3: `RichToolCallRow` Component

**New file**: `apps/web/src/components/chat/RichToolCallRow.tsx`

### Structure
```
RichToolCallRow
  └─ Collapsible (local useState for open/closed)
       ├─ CollapsibleTrigger (rich summary line — always visible)
       │    ├─ Icon (from existing workEntryIcon)
       │    ├─ Summary (varies by displayMode — see below)
       │    ├─ Status dot (pulse=inProgress, check=completed, alert=failed)
       │    └─ ChevronRight/Down toggle indicator
       │
       └─ CollapsiblePanel (expanded detail — hidden by default)
            ├─ Input params section
            └─ Result section (when available)
```

Uses existing: `Collapsible`/`CollapsibleTrigger`/`CollapsiblePanel` from `~/components/ui/collapsible`

### 3a. Agent (`rich-agent`)

**Collapsed summary**: `[HammerIcon] [Badge: subagentType] description text`
- Badge for `subagent_type` (e.g., "Explore", "Plan", "worker") using small outlined badge
- `description` field as readable text (not JSON)

**Expanded view**:
- Key-value list of params: `subagent_type`, `description`, `isolation`, `run_in_background`
- **Prompt**: Truncated to ~3 lines with "Show more" toggle (secondary local state). Rendered in `font-mono text-[11px]` with bordered container.
- **Result**: When `status === "completed"`, show result text in similar container, also truncated with "Show more".

### 3b. Bash (`rich-bash`)

**Collapsed summary**: `[TerminalIcon] $ command_preview` (truncated, monospace)

**Expanded view**:
- Full command in monospace code block
- Output (`detail`) in scrollable pre block with `max-h-[200px] overflow-y-auto`

### 3c. Edit (`rich-edit`)

**Collapsed summary**: `[SquarePenIcon] filename` (just the basename, full path in title attr)

**Expanded view**:
- Full file path
- `old_string` / `new_string` shown with red/green background tinting (simple inline diff)
- Both truncated with "Show more" for long strings

### 3d. Status Indicators (all modes)

- `inProgress`: Animated pulse dot (reuse existing `animate-pulse` pattern)
- `completed`: Small `CheckIcon` in muted green
- `failed`: Small `CircleAlertIcon` in muted red

### 3e. State Management

Each `RichToolCallRow` uses local `useState(false)` for expansion. No need to lift state — expansion doesn't need to persist or coordinate across rows.

---

## Phase 4: Integration

**File**: `apps/web/src/components/chat/MessagesTimeline.tsx` (line 346-349)

Replace:
```tsx
{visibleEntries.map((workEntry) => (
  <SimpleWorkEntryRow key={`work-row:${workEntry.id}`} workEntry={workEntry} />
))}
```

With:
```tsx
{visibleEntries.map((workEntry) => {
  const displayMode = classifyToolDisplayMode(workEntry);
  return displayMode === "simple" ? (
    <SimpleWorkEntryRow key={`work-row:${workEntry.id}`} workEntry={workEntry} />
  ) : (
    <RichToolCallRow key={`work-row:${workEntry.id}`} workEntry={workEntry} displayMode={displayMode} />
  );
})}
```

Virtual list height changes on expand are already handled by the existing `measureElement` + `ResizeObserver` setup.

---

## Files Summary

| File | Action | What |
|---|---|---|
| `apps/web/src/session-logic.ts` | Modify | Add `data`+`status` to WorkLogEntry, extract & merge them |
| `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` | Modify | Pass `data` through in `item.completed` activities |
| `apps/web/src/components/chat/toolCallClassification.ts` | **New** | `classifyToolDisplayMode` helper |
| `apps/web/src/components/chat/RichToolCallRow.tsx` | **New** | Rich expandable tool call component |
| `apps/web/src/components/chat/MessagesTimeline.tsx` | Modify | Conditional render of Rich vs Simple rows |
| `apps/web/src/session-logic.test.ts` | Modify | Tests for data/status extraction + merge |

---

## Verification

1. Run `pnpm build` in `apps/web` to confirm no type errors
2. Run `pnpm test` in `apps/web` to confirm existing + new tests pass
3. Manual test: start a chat session that triggers Agent, Bash, Edit, and Read tool calls
   - Agent calls should show badge + description collapsed, expand to show prompt + result
   - Bash calls should show `$ command` collapsed, expand to show output
   - Edit calls should show filename collapsed, expand to show diff
   - Read/Grep/Glob calls should remain as compact one-liners
4. Verify expand/collapse animation works smoothly (Collapsible panel height transition)
5. Verify virtual list doesn't jump when expanding rows (ResizeObserver integration)
