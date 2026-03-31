const statusDot = document.getElementById("statusDot")!;
const statusText = document.getElementById("statusText")!;
const inspectBtn = document.getElementById("inspectBtn")!;

// Get connection status from background
chrome.runtime.sendMessage({ type: "get-status" }, (response) => {
  if (response?.wsState === "connected") {
    statusDot.classList.add("connected");
    statusText.textContent = "Connected to t3code";
  } else {
    statusText.textContent = "Not connected to t3code";
  }
});

// Inspect button — inject content script and toggle
inspectBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["dist/fiber-reader.js"],
        world: "MAIN",
      });
    } catch {
      // May already be injected
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["dist/content-script.js"],
      });
    } catch {
      // May already be injected
    }
    chrome.tabs.sendMessage(tab.id, { type: "toggle-inspect" });
    window.close();
  }
});
