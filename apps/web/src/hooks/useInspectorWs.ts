/**
 * useInspectorWs - Connect to inspector WebSocket server and relay element refs.
 *
 * Only activates in dev mode. Connects to ws://127.0.0.1:27182 and forwards
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
 * - Dev-mode only
 */

import { useEffect } from "react";

interface InspectorMessage {
  type: "element-ref";
  chip: string;
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
      try {
        const message = JSON.parse(event.data as string) as InspectorMessage;
        if (message.type === "element-ref") {
          window.dispatchEvent(
            new CustomEvent("element-inspector:insert", {
              detail: { text: message.chip },
            }),
          );
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.addEventListener("close", () => {
      singletonWs = null;
      if (!shuttingDown && refCount > 0) {
        scheduleReconnect();
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
    if (!import.meta.env.DEV) return;

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
