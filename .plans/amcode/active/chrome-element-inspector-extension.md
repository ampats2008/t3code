# Chrome Element Inspector Extension

**Branch:** `feature/main/chrome-element-inspector`
**Status:** Active

## Goal

A Chrome extension that provides the same Dev Element Inspector experience on **any web page** (e.g., a project you're building with t3code), sending captured element context back to t3code's chat composer via WebSocket.

## Architecture

```
┌──────────────────────────┐          ┌────────────────────────────┐
│  Chrome Extension        │          │  t3code (Electron/Web)     │
│                          │    WS    │                            │
│  content-script.ts       │─────────▶│  Inspector WS server       │
│   • overlay + tooltip    │  :27182  │  (apps/server/)            │
│   • element extraction   │          │   ↓                        │
│   • React fiber walk     │          │  WS push → renderer        │
│   • DOM-only fallback    │          │   ↓                        │
│                          │          │  element-inspector:insert   │
│  background.ts           │          │   ↓                        │
│   • WS client to t3code  │          │  chat composer chip         │
│   • connection mgmt      │          │                            │
│                          │          │                            │
│  popup.html/popup.ts     │          │                            │
│   • toggle inspect mode  │          │                            │
│   • connection status    │          │                            │
└──────────────────────────┘          └────────────────────────────┘
```

## Shared Core

Extract pure-logic functions from `DevElementInspector.tsx` into `packages/shared/src/elementInspectorCore.ts`:

- `TooltipData`, `NearestAncestor` interfaces
- `getDirectText(el)` — direct child text nodes
- `getNearestLabeledAncestor(el)` — nearest ancestor with identity
- `getReactFiberInfo(el)` — React fiber component walk
- `extractTooltipData(el)` — compose all the above
- `formatText(data)` — chip string format

Both `DevElementInspector.tsx` and the Chrome extension content script will import from this shared core.

**Note:** The content script will bundle this at build time (esbuild). The existing `DevElementInspector.tsx` can import it directly since packages/shared uses raw TypeScript exports.

## Tasks

### Task 1: Extract shared core
**File:** `packages/shared/src/elementInspectorCore.ts`
**Also update:** `packages/shared/package.json` (add `"./elementInspectorCore"` export)

Extract the 5 functions + 2 interfaces from `DevElementInspector.tsx`. Add framework detection:

```typescript
export function detectFramework(el: Element): "react" | "unknown" {
  const hasReactFiber = Object.keys(el).some(k => k.startsWith("__reactFiber$"));
  return hasReactFiber ? "react" : "unknown";
}
```

Update `DevElementInspector.tsx` to import from `@t3tools/shared/elementInspectorCore`.

### Task 2: Inspector WebSocket server in t3code
**File:** `apps/server/src/inspectorWs.ts`
**Also update:** `apps/server/src/wsServer.ts` (mount alongside existing server)

Lightweight WS server on a **fixed port** (`27182`) dedicated to inspector messages. Separate from the main authenticated WS server — no auth needed since it's localhost-only and only accepts element-ref insert messages.

**Protocol:**
```jsonc
// Extension → t3code
{ "type": "element-ref", "chip": "[<button> ↑ form · SubmitButton ← FormPanel \"Save\"]" }

// t3code → Extension (optional, for status)
{ "type": "ack" }
```

On receiving `element-ref`, the server forwards it via the existing WS push bus to the renderer, which dispatches the `element-inspector:insert` CustomEvent. Alternatively, if simpler, add a dedicated push message type that the renderer listens for.

**Integration with existing server lifecycle:**
- Start the inspector WS server in `apps/server/src/main.ts` alongside the main server
- Shut down when the main server shuts down
- Bind to `127.0.0.1` only (security: localhost-only)

### Task 3: Renderer-side WS message handler
**File:** `apps/web/src/components/ChatView.tsx` (extend existing listener)

The existing `element-inspector:insert` event bridge already works. We just need to make sure the inspector WS messages reach the renderer and dispatch this event.

**Option A (simplest):** Inspector WS server sends a push message through the existing WS transport → renderer handles it like any other push.

**Option B:** Inspector WS server is a separate connection that the renderer also listens to. Less ideal — adds another WS connection.

Go with Option A — add a new push message type `InspectorElementRef` to the contracts, handle it in the renderer's push handler to dispatch the `element-inspector:insert` CustomEvent.

### Task 4: Chrome extension
**Directory:** `extensions/chrome-element-inspector/`

Structure:
```
extensions/chrome-element-inspector/
├── manifest.json          # Manifest V3
├── package.json           # For build tooling (esbuild)
├── tsconfig.json
├── build.mjs              # esbuild script
├── src/
│   ├── background.ts      # Service worker — WS client
│   ├── content-script.ts  # Injected into pages — overlay + extraction
│   ├── popup.html         # Extension popup UI
│   └── popup.ts           # Popup logic (toggle, status)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── dist/                  # Built output (gitignored)
```

#### manifest.json (Manifest V3)
```jsonc
{
  "manifest_version": 3,
  "name": "t3code Element Inspector",
  "version": "0.1.0",
  "description": "Inspect UI elements and send context to t3code",
  "permissions": ["activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "dist/background.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["dist/content-script.js"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png" }
  },
  "commands": {
    "toggle-inspect": {
      "suggested_key": { "default": "Ctrl+Shift+X" },
      "description": "Toggle element inspector"
    }
  }
}
```

#### content-script.ts
- Imports shared core (bundled at build time)
- On activation: injects overlay div + tooltip div into page (shadow DOM to avoid style conflicts)
- Hover: `elementFromPoint` → `extractTooltipData()` → render tooltip (vanilla JS, inline styles)
- Click: `formatText()` → `chrome.runtime.sendMessage({ type: "element-ref", chip })` → deactivate
- Framework detection: if `detectFramework()` returns `"unknown"`, log warning: `"t3code Inspector: Only React is supported for component detection. Falling back to DOM-only info."`
- Keyboard: listen for the `toggle-inspect` command via `chrome.runtime.onMessage`

#### background.ts (Service Worker)
- Maintains WS connection to `ws://127.0.0.1:27182`
- Reconnects with exponential backoff (1s → 8s)
- On message from content script (`element-ref`): forward to WS
- Track connection state, respond to popup queries
- On `toggle-inspect` command: send message to active tab's content script

#### popup.html / popup.ts
- Shows connection status (🟢 Connected / 🔴 Disconnected)
- "Inspect Element" button to toggle inspect mode on active tab
- Minimal UI — small popup

### Task 5: Build configuration
**File:** `extensions/chrome-element-inspector/build.mjs`

esbuild script that:
- Bundles `background.ts` → `dist/background.js`
- Bundles `content-script.ts` → `dist/content-script.js` (includes shared core inline)
- Bundles `popup.ts` → `dist/popup.js`
- Resolves `@t3tools/shared/elementInspectorCore` to the actual file path

Add npm scripts to `extensions/chrome-element-inspector/package.json`:
- `build` — one-shot build
- `dev` — watch mode

## Key Design Decisions

### Fixed port (27182) vs dynamic port
Fixed port is simpler for the Chrome extension — no discovery protocol needed. `27182` is arbitrary but memorable (first 5 digits of e). If port is taken, log a warning and skip inspector server startup.

### Separate WS server vs extending existing
Separate keeps concerns clean. The main WS has auth + Effect Schema encoding. The inspector WS is intentionally simple (JSON, no auth, localhost-only). No risk of breaking existing functionality.

### Shadow DOM for content script UI
The overlay and tooltip are injected into a Shadow DOM root to prevent the inspected page's CSS from interfering with inspector styling (and vice versa).

### No auth on inspector WS
Acceptable because: bound to 127.0.0.1 only, only accepts `element-ref` messages (insert text into composer — low risk), and requiring auth would mean the extension needs to discover/store the token.

## Execution Order

1. **Task 1** (shared core extraction) — unblocks Tasks 2-4
2. **Task 2** (WS server) + **Task 4** (Chrome extension) — can run in parallel after Task 1
3. **Task 3** (renderer handler) — depends on Task 2's message format
4. **Task 5** (build config) — part of Task 4, done together

## Testing

- Load unpacked extension in Chrome
- Start t3code (Electron or `pnpm dev`)
- Open any React app in Chrome (e.g., localhost:3000)
- Activate inspector (Ctrl+Shift+X or popup button)
- Hover elements — should see overlay + tooltip
- Click element — chip should appear in t3code's chat composer
- Test on non-React page — should see DOM-only info + console warning
