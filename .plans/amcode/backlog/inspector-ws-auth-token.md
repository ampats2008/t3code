# Inspector WebSocket Auth Token

**Status:** Backlog (tech debt)
**Priority:** Low
**Depends on:** vscode-t3code-extension V1

## Problem

The inspector WS server (`ws://127.0.0.1:27182`) has no authentication. Any local process can connect and:
- Insert arbitrary text into the chat composer (chips)
- Tell VS Code to open files
- Receive broadcasted messages from other clients

Localhost-only binding mitigates remote attacks, but doesn't protect against malicious local processes.

## Solution

Shared secret token generated at T3Code startup, required by all WS clients.

### Flow

1. T3Code server generates a random token on startup (e.g. `crypto.randomBytes(32).toString('hex')`)
2. Token is written to a well-known file: `~/.t3code/inspector-token`
3. File permissions set to user-only (`0600`)
4. WS server rejects connections that don't include the token
5. Clients read the token from the file and send it on connect

### Protocol

```jsonc
// Client sends as first message after WS open:
{ "type": "auth", "token": "abc123..." }

// Server responds:
{ "type": "auth-ok" }
// or closes the connection with 4001 code
```

Alternatively, pass token as a query param: `ws://127.0.0.1:27182?token=abc123` — simpler, one fewer round-trip.

### Changes

| File | Change |
|---|---|
| `apps/server/src/inspectorWs.ts` | Generate token, write to file, validate on connection |
| `apps/web/src/hooks/useInspectorWs.ts` | Read token from Electron IPC or injected env var |
| `extensions/vscode-t3code/src/wsClient.ts` | Read token from `~/.t3code/inspector-token` |
| `extensions/chrome-element-inspector/src/background.ts` | Read token (needs native messaging or manual config) |

### Chrome extension complication

Chrome extensions can't read local files. Options:
- Native messaging host that reads the token file
- User pastes token into extension popup (bad UX)
- T3Code exposes a localhost HTTP endpoint that returns the token (chicken-and-egg, but simpler than native messaging)

This is the main reason to defer — the Chrome extension path is awkward. The VS Code extension (Node.js) can just `fs.readFile` it.
