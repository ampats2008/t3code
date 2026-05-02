# VS Code / Cursor Extension for T3Code (V1)

**Branch:** `feature/main/vscode-t3code-extension`
**Status:** Active

## Goal

A minimal VS Code extension that connects to T3Code over the existing inspector WebSocket, providing three features:

1. **Send selection to T3Code** — Select code, right-click, "Send to T3Code" -> appears as a chip in the composer
2. **Open file in VS Code via WS** — T3Code sends an `open-file` message over WS instead of shelling out to a protocol handler (instant)
3. **Status bar indicator** — Shows T3Code connection state

## Architecture

```
+---------------------------------+          +------------------------------+
|  VS Code Extension              |          |  T3Code (Electron/Web)       |
|                                 |    WS    |                              |
|  extension.ts                   |<-------->|  Inspector WS server         |
|   - activation / commands       | :27182   |  (apps/server/inspectorWs.ts)|
|                                 |          |   |                          |
|  wsClient.ts                    |          |   v                          |
|   - singleton WS to t3code      |          |  broadcast to renderer       |
|   - reconnect w/ backoff        |          |   |                          |
|                                 |          |   v                          |
|  statusBar.ts                   |          |  composer chip insertion     |
|   - connection indicator        |          |                              |
+---------------------------------+          +------------------------------+
```

Reuses the existing inspector WS server on port 27182. No new server needed.

## Protocol

### Existing (unchanged)

```jsonc
// Chrome ext -> T3Code
{ "type": "element-ref", "chip": "[<button> ... ]" }
// T3Code -> sender
{ "type": "ack" }
```

### New message types

```jsonc
// VS Code -> T3Code: code selection
{
  "type": "code-ref",
  "file": "/absolute/path/to/file.ts",
  "startLine": 10,
  "endLine": 25,
  "text": "function foo() { ... }",
  "language": "typescript"
}

// T3Code -> VS Code: open file at location
{
  "type": "open-file",
  "file": "/absolute/path/to/file.ts",
  "line": 42,
  "column": 10
}
```

## Tasks

### Task 1: Extend inspector WS to relay new message types

**Files:**
- `apps/server/src/inspectorWs.ts`
- `apps/web/src/hooks/useInspectorWs.ts`

The server currently only recognizes `element-ref`. Extend it to forward any message with a known type.

```typescript
// inspectorWs.ts — replace hard-coded element-ref check
const KNOWN_TYPES = new Set(["element-ref", "code-ref", "open-file"]);

// In message handler:
if (KNOWN_TYPES.has(message.type)) {
  // ack + broadcast (same logic as current element-ref)
}
```

In `useInspectorWs.ts`, dispatch a new CustomEvent for `code-ref`:

```typescript
if (message.type === "code-ref") {
  window.dispatchEvent(
    new CustomEvent("vscode:code-ref", { detail: message })
  );
}
```

### Task 2: Renderer — insert code-ref chips into composer

**Files:**
- `apps/web/src/components/ChatView.tsx` or `ChatComposer.tsx`

Listen for `vscode:code-ref` CustomEvent. Format as a chip and insert into the composer, same pattern as the existing `element-inspector:insert` handler.

Chip format: `[file.ts:10-25]` with the selected text as attached context.

### Task 3: T3Code sends `open-file` over WS

**Files:**
- Wherever the existing "open in editor" logic lives

When a user clicks "open in editor" in T3Code:
1. Send `{ type: "open-file", file, line, column }` over the inspector WS
2. Fall back to existing deeplink/protocol handler if WS not available

The renderer already holds a WS connection via `useInspectorWs`. Add a `send` capability (currently it only receives).

### Task 4: VS Code extension scaffold

**Directory:** `extensions/vscode-t3code/`

```
extensions/vscode-t3code/
├── package.json            # Extension manifest
├── tsconfig.json
├── src/
│   ├── extension.ts        # activate/deactivate
│   ├── wsClient.ts         # WS singleton
│   └── statusBar.ts        # Status bar item
├── .vscodeignore
└── README.md
```

#### package.json contributes

```jsonc
{
  "name": "t3code-bridge",
  "displayName": "T3Code Bridge",
  "description": "Connect VS Code / Cursor to T3Code",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "t3code.sendSelection",
        "title": "Send to T3Code"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "command": "t3code.sendSelection",
          "when": "editorHasSelection",
          "group": "t3code"
        }
      ]
    }
  }
}
```

### Task 5: VS Code extension — WS client + status bar

**File:** `extensions/vscode-t3code/src/wsClient.ts`

Same pattern as Chrome extension's `background.ts`:
- Connect to `ws://127.0.0.1:27182`
- Reconnect with exponential backoff (1s -> 8s)
- Expose: `send(msg)`, `onMessage(handler)`, `state`, `dispose()`

**File:** `extensions/vscode-t3code/src/statusBar.ts`

```typescript
// connected:    "$(plug) T3Code"
// disconnected: "$(debug-disconnect) T3Code" (warning color)
```

### Task 6: VS Code extension — sendSelection command + open-file handler

**File:** `extensions/vscode-t3code/src/extension.ts`

#### sendSelection
```typescript
const editor = vscode.window.activeTextEditor;
const selection = editor.selection;
client.send({
  type: "code-ref",
  file: editor.document.uri.fsPath,
  startLine: selection.start.line + 1,
  endLine: selection.end.line + 1,
  text: editor.document.getText(selection),
  language: editor.document.languageId,
});
```

#### open-file handler
```typescript
client.onMessage(async (msg) => {
  if (msg.type === "open-file") {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.file));
    const editor = await vscode.window.showTextDocument(doc);
    if (msg.line) {
      const pos = new vscode.Position(msg.line - 1, (msg.column ?? 1) - 1);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }
  }
});
```

### Task 7: Auto-install extension via symlink on T3Code startup

**File:** `apps/server/src/installVscodeExtension.ts` (new)
**Also:** call from `apps/server/src/serverRuntimeStartup.ts`

On T3Code startup, automatically symlink the VS Code extension into the editor's extensions directory if not already present.

```typescript
import { symlink, readlink, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform } from "node:os";

const EXTENSION_NAME = "t3code-bridge";

async function installExtensionLink(extensionSourceDir: string) {
  const editorExtDirs = [
    join(homedir(), ".vscode", "extensions"),
    join(homedir(), ".cursor", "extensions"),
  ];

  for (const dir of editorExtDirs) {
    // Skip if the editor isn't installed (dir doesn't exist)
    try { await access(dir); } catch { continue; }

    const linkPath = join(dir, EXTENSION_NAME);

    // Check if already linked
    try {
      const existing = await readlink(linkPath);
      if (existing === extensionSourceDir) continue; // already correct
    } catch {
      // doesn't exist yet — proceed
    }

    // Windows: use "junction" (no admin required). macOS/Linux: regular symlink.
    const type = platform() === "win32" ? "junction" : "dir";
    await symlink(extensionSourceDir, linkPath, type);
  }
}
```

- Runs once at startup, silently skips if editors aren't installed
- Uses junctions on Windows (no admin privileges needed), regular symlinks on macOS
- Idempotent — checks if link already exists and points to the right place

### Task 8: Build config

esbuild, same as Chrome extension:

```jsonc
{
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node",
    "dev": "npm run build -- --watch",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.20.0",
    "ws": "^8.16.0",
    "@types/ws": "^8.5.10"
  }
}
```

## Key Design Decisions

### Reuse inspector WS (port 27182)
The existing server is a dumb broadcast relay. Multiple client types (Chrome ext, VS Code ext, renderer) coexist fine. No new server needed.

### Node `ws` package
VS Code extensions run in Node.js. Use the `ws` npm package (same as T3Code server). Chrome extension uses browser-native WebSocket.

### activationEvents: onStartupFinished
Always running so it can receive `open-file` commands from T3Code at any time. WS client idles when T3Code isn't running.

### Cursor compatibility
Cursor is a VS Code fork — standard extensions work out of the box.

## Execution Order

1. **Task 1** (extend WS protocol) — unblocks T3Code side
2. **Task 4 + 5** (extension scaffold + WS client + status bar) — can start in parallel with Task 1
3. **Task 6** (sendSelection + open-file handler) — depends on Task 5
4. **Task 2** (renderer chip insertion) — depends on Task 1
5. **Task 3** (T3Code sends open-file via WS) — depends on Task 1
6. **Task 7** (auto-install symlink) — depends on Task 4 (needs the built extension to exist)
7. **Task 8** (build config) — done alongside Task 4

## Testing

- Build extension: `cd extensions/vscode-t3code && npm run build`
- Start T3Code — extension should be auto-symlinked into `~/.vscode/extensions/` and `~/.cursor/extensions/`
- Restart VS Code/Cursor — extension loads, status bar shows connection state
- Select code -> right-click -> "Send to T3Code" -> chip appears in composer
- Click "open in editor" in T3Code -> file opens in VS Code at correct line
- Kill T3Code -> status bar updates to disconnected, reconnects when T3Code restarts
- Test on both Windows and macOS
