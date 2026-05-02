import WebSocket from "ws";
import { EventEmitter } from "node:events";

const INSPECTOR_WS_URL = "ws://127.0.0.1:27182";
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 8000;

export type ConnectionState = "connected" | "disconnected" | "connecting";

export class T3CodeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private _state: ConnectionState = "disconnected";
  private disposed = false;

  get state(): ConnectionState {
    return this._state;
  }

  private setState(state: ConnectionState) {
    if (this._state !== state) {
      this._state = state;
      this.emit("stateChange", state);
    }
  }

  connect() {
    if (this.disposed || this.ws) return;
    this.setState("connecting");

    try {
      const ws = new WebSocket(INSPECTOR_WS_URL);

      ws.on("open", () => {
        this.reconnectDelay = INITIAL_RECONNECT_DELAY;
        this.setState("connected");
      });

      ws.on("message", (raw) => {
        if (ws !== this.ws) return;
        try {
          const msg = JSON.parse(raw.toString());
          this.emit("message", msg);
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        if (this.ws === ws) {
          this.ws = null;
          this.setState("disconnected");
          if (!this.disposed) {
            this.scheduleReconnect();
          }
        }
      });

      ws.on("error", () => {
        // close event will follow
      });

      this.ws = ws;
    } catch {
      this.setState("disconnected");
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        MAX_RECONNECT_DELAY,
      );
      this.connect();
    }, this.reconnectDelay);
  }

  send(msg: object): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  dispose() {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.removeAllListeners();
  }
}
