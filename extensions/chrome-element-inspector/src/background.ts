// Service worker — manages WS connection to t3code and coordinates with content scripts

const INSPECTOR_WS_URL = "ws://127.0.0.1:27182";

let ws: WebSocket | null = null;
let wsState: "connected" | "disconnected" | "connecting" = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;

function connectWs() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  wsState = "connecting";

  ws = new WebSocket(INSPECTOR_WS_URL);

  ws.addEventListener("open", () => {
    wsState = "connected";
    reconnectDelay = 1000;
    console.log("[t3code Inspector] Connected to t3code");
  });

  ws.addEventListener("close", () => {
    wsState = "disconnected";
    ws = null;
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    // onclose will fire after this
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 8000);
    connectWs();
  }, reconnectDelay);
}

function sendToT3Code(chip: string) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "element-ref", chip }));
    return true;
  }
  return false;
}

// Start connection on load
connectWs();

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "element-ref") {
    const sent = sendToT3Code(message.chip);
    sendResponse({ sent, wsState });
    return true;
  }

  if (message.type === "get-status") {
    sendResponse({ wsState });
    return true;
  }
});

// Handle keyboard shortcut command
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-inspect") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      // 1. Inject MAIN world fiber reader (reads React __reactFiber$ expandos
      //    that are invisible from the default isolated world).
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["dist/fiber-reader.js"],
          world: "MAIN",
        });
      } catch {
        // May already be injected
      }
      // 2. Inject isolated world content script (overlay UI + chrome API comms).
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["dist/content-script.js"],
        });
      } catch {
        // May already be injected
      }
      // 3. Toggle via normal extension messaging.
      chrome.tabs.sendMessage(tab.id, { type: "toggle-inspect" });
    }
  }
});
