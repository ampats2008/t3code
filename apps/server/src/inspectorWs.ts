/**
 * Inspector WebSocket server for Chrome extension element inspector.
 *
 * Lightweight standalone server running on fixed port 27182 (localhost only).
 * Accepts element-ref messages from the extension and broadcasts them to
 * connected t3code renderer clients.
 *
 * @module inspectorWs
 */

import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";

interface InspectorMessage {
  type: string;
  [key: string]: unknown;
}

const KNOWN_TYPES = new Set(["element-ref", "code-ref", "open-file"]);

interface AckMessage {
  type: "ack";
}

const INSPECTOR_PORT = 27182;
const INSPECTOR_HOST = "127.0.0.1";

/**
 * Start the inspector WebSocket server.
 *
 * Returns a cleanup function that should be called on shutdown.
 */
export function startInspectorWs(): () => void {
  const clients = new Set<WebSocket>();
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ server: httpServer });

  let isShuttingDown = false;

  wss.on("connection", (ws) => {
    clients.add(ws);

    ws.on("message", (raw: unknown) => {
      try {
        const messageText = typeof raw === "string" ? raw : Buffer.from(raw as any).toString("utf8");
        const message = JSON.parse(messageText) as InspectorMessage;

        if (KNOWN_TYPES.has(message.type)) {
          const otherClients = [...clients].filter(c => c !== ws && c.readyState === WebSocket.OPEN);

          // Send ack to sender
          try {
            ws.send(JSON.stringify({ type: "ack" } satisfies AckMessage));
          } catch {
            // Ignore send errors
          }

          // Broadcast to all OTHER clients (the renderer)
          for (const client of otherClients) {
            try {
              client.send(JSON.stringify(message));
            } catch {
              // Ignore send errors
            }
          }
        }
      } catch {
        // Ignore malformed messages silently
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", () => {
      clients.delete(ws);
    });
  });

  httpServer.listen(
    { port: INSPECTOR_PORT, host: INSPECTOR_HOST },
    () => {
      console.log(`[inspector-ws] Running on ws://${INSPECTOR_HOST}:${INSPECTOR_PORT}`);
    },
  );

  wss.on("error", (error: Error) => {
    console.warn(`[inspector-ws] WebSocket server error: ${error.message}`);
  });

  httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.warn(
        `[inspector-ws] Port ${INSPECTOR_PORT} already in use — inspector WebSocket unavailable`,
      );
    } else {
      console.warn(`[inspector-ws] Server error: ${error.message}`);
    }
  });

  // Return cleanup function
  return () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    for (const client of clients) {
      client.close();
    }
    clients.clear();

    wss.close(() => {
      httpServer.close();
    });
  };
}
