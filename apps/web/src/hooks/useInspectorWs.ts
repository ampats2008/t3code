/**
 * useInspectorWs - Connect to inspector WebSocket server and relay element refs.
 *
 * Connects to ws://127.0.0.1:27182 and forwards
 * incoming element-ref messages as CustomEvents to the document.
 *
 * Uses a module-level singleton pattern: only ONE WebSocket connection is ever
 * active, regardless of how many times the hook mounts (React strict mode,
 * multiple component instances, etc.). This prevents duplicate event dispatches.
 *
 * Features:
 * - Singleton connection (no duplicates from strict mode)
 * - Auto-reconnect with exponential backoff (1s, 2s, 4s, max 8s)
 * - Graceful cleanup when all consumers unmount
 * - Works in both dev and production builds
 */

import { useEffect } from "react";

interface InspectorMessage {
  type: string;
  [key: string]: unknown;
}

const INSPECTOR_WS_URL = "ws://127.0.0.1:27182";
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 8000;

// ── Module-level singleton state ──────────────────────────────────────────
let singletonWs: WebSocket | null = null;
let refCount = 0; // number of mounted hook instances
let reconnectDelay = INITIAL_RECONNECT_DELAY;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shuttingDown = false;

function connectSingleton() {
  if (shuttingDown || singletonWs) return;

  try {
    const ws = new WebSocket(INSPECTOR_WS_URL);

    ws.addEventListener("open", () => {
      reconnectDelay = INITIAL_RECONNECT_DELAY;
    });

    ws.addEventListener("message", (event) => {
      // Ignore messages from stale connections (React strict mode can leave
      // an old WS alive briefly while a new one is already assigned).
      if (ws !== singletonWs) return;
      try {
        const message = JSON.parse(event.data as string) as InspectorMessage;
        if (message.type === "element-ref") {
          window.dispatchEvent(
            new CustomEvent("element-inspector:insert", {
              detail: { text: message.chip },
            }),
          );
        } else if (message.type === "code-ref") {
          window.dispatchEvent(
            new CustomEvent("vscode:code-ref", { detail: message }),
          );
        } else if (message.type === "review-comments") {
          window.dispatchEvent(
            new CustomEvent("vscode:review-comments", { detail: message }),
          );
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.addEventListener("close", () => {
      // Only handle close for the current connection
      if (singletonWs === ws) {
        singletonWs = null;
        if (!shuttingDown && refCount > 0) {
          scheduleReconnect();
        }
      }
    });

    ws.addEventListener("error", () => {
      // close event will follow
    });

    singletonWs = ws;
  } catch {
    if (!shuttingDown && refCount > 0) {
      scheduleReconnect();
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connectSingleton();
  }, reconnectDelay);
}

function disconnectSingleton() {
  shuttingDown = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (singletonWs) {
    singletonWs.close();
    singletonWs = null;
  }
  reconnectDelay = INITIAL_RECONNECT_DELAY;
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useInspectorWs() {
  useEffect(() => {
    refCount++;
    shuttingDown = false;

    // Only connect if this is the first consumer
    if (refCount === 1) {
      connectSingleton();
    }

    return () => {
      refCount--;
      if (refCount <= 0) {
        refCount = 0;
        disconnectSingleton();
      }
    };
  }, []);
}

/**
 * Send a message to all other inspector WS clients (e.g. VS Code extension).
 * Returns true if the message was sent, false if not connected.
 */
export function sendInspectorMessage(msg: object): boolean {
  if (singletonWs && singletonWs.readyState === WebSocket.OPEN) {
    singletonWs.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

// ── HMR cleanup ──────────────────────────────────────────────────────────
// When Vite hot-reloads this module the old module scope is discarded, but
// the old WebSocket connection stays open on the server. Without cleanup
// the server sees two web clients and broadcasts the element-ref twice,
// causing double chip insertion.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (singletonWs) {
      singletonWs.close();
      singletonWs = null;
    }
    refCount = 0;
    shuttingDown = false;
    reconnectDelay = INITIAL_RECONNECT_DELAY;
  });
}
