// Content script — injected into inspected pages
// Uses shared element inspector core for extraction logic

import {
  extractTooltipData,
  formatText,
  detectFramework,
  type TooltipData,
} from "@t3tools/shared/elementInspectorCore";

// Guard against double-injection (chrome.scripting.executeScript re-runs the whole file)
const GUARD_KEY = "__t3codeInspectorLoaded";
if ((window as any)[GUARD_KEY]) {
  // Already loaded — skip re-initialization. The existing message listener
  // will handle toggle-inspect messages from the background script.
} else {
(window as any)[GUARD_KEY] = true;

let isActive = false;
let hostEl: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let overlayEl: HTMLDivElement | null = null;
let highlightEl: HTMLDivElement | null = null;
let tooltipEl: HTMLDivElement | null = null;
let currentTooltipData: TooltipData | null = null;
let hasWarnedFramework = false;

function createOverlay() {
  // Create shadow DOM host
  hostEl = document.createElement("div");
  hostEl.id = "__t3code-inspector-host";
  hostEl.style.cssText =
    "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
  document.documentElement.appendChild(hostEl);

  shadowRoot = hostEl.attachShadow({ mode: "closed" });

  // Overlay — captures all mouse events
  overlayEl = document.createElement("div");
  overlayEl.style.cssText =
    "position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair;";

  // Highlight box
  highlightEl = document.createElement("div");
  highlightEl.style.cssText =
    "position: fixed; pointer-events: none; outline: 2px solid #60a5fa; background: rgba(96,165,250,0.08); display: none;";

  // Tooltip
  tooltipEl = document.createElement("div");
  tooltipEl.style.cssText = `
    position: fixed; pointer-events: none; display: none;
    background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a;
    border-radius: 6px; padding: 8px 12px; font-size: 12px;
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4); max-width: 360px; z-index: 2147483647;
    line-height: 1.5;
  `;

  overlayEl.addEventListener("mousemove", handleMouseMove);
  overlayEl.addEventListener("click", handleClick);

  shadowRoot.appendChild(highlightEl);
  shadowRoot.appendChild(tooltipEl);
  shadowRoot.appendChild(overlayEl);
}

function destroyOverlay() {
  if (hostEl) {
    hostEl.remove();
    hostEl = null;
    shadowRoot = null;
    overlayEl = null;
    highlightEl = null;
    tooltipEl = null;
  }
  currentTooltipData = null;
}

function activate() {
  if (isActive) return;
  isActive = true;
  createOverlay();
}

function deactivate() {
  if (!isActive) return;
  isActive = false;
  destroyOverlay();
}

function handleMouseMove(e: MouseEvent) {
  if (!overlayEl || !highlightEl || !tooltipEl) return;

  // Hide overlay AND host briefly to hit-test real element beneath.
  // document.elementFromPoint can't pierce shadow DOM — it returns the shadow
  // host (hostEl) if we only hide the overlay inside the shadow. So we must
  // also hide the host element from hit-testing.
  overlayEl.style.pointerEvents = "none";
  if (hostEl) hostEl.style.display = "none";
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (hostEl) hostEl.style.display = "";
  overlayEl.style.pointerEvents = "all";

  if (
    !el ||
    el === document.body ||
    el === document.documentElement ||
    el === hostEl
  ) {
    highlightEl.style.display = "none";
    tooltipEl.style.display = "none";
    currentTooltipData = null;
    return;
  }

  // Framework detection warning (once per session)
  if (!hasWarnedFramework) {
    const framework = detectFramework(el);
    if (framework === "unknown") {
      console.warn(
        "[t3code Inspector] Only React is supported for component detection. Falling back to DOM-only info."
      );
    }
    hasWarnedFramework = true;
  }

  currentTooltipData = extractTooltipData(el);
  const rect = el.getBoundingClientRect();

  // Update highlight
  highlightEl.style.display = "block";
  highlightEl.style.top = rect.top + "px";
  highlightEl.style.left = rect.left + "px";
  highlightEl.style.width = rect.width + "px";
  highlightEl.style.height = rect.height + "px";

  // Update tooltip
  tooltipEl.style.display = "block";
  tooltipEl.style.top = Math.min(e.clientY + 14, window.innerHeight - 150) + "px";
  tooltipEl.style.left =
    Math.min(e.clientX + 14, window.innerWidth - 360) + "px";

  // Render tooltip content
  renderTooltip(currentTooltipData);
}

function renderTooltip(data: TooltipData) {
  if (!tooltipEl) return;

  let html = "";

  // Tag + role
  html += `<div style="font-weight:600;color:#89b4fa;">&lt;${data.tag}&gt;`;
  if (data.role)
    html += `<span style="color:#cba6f7;margin-left:6px;">${data.role}</span>`;
  html += "</div>";

  // Nearest labeled ancestor
  if (data.nearestLabeledAncestor) {
    const a = data.nearestLabeledAncestor;
    let aLabel = "";
    if (a.ariaLabel) aLabel = ` "${a.ariaLabel}"`;
    else if (a.dataSlot) aLabel = ` ${a.dataSlot}`;
    else if (a.directText) aLabel = ` "${a.directText}"`;
    html += `<div style="color:rgba(52,211,153,0.8);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">↑ &lt;${a.tag}&gt;${aLabel}</div>`;
  }

  // Component breadcrumb
  if (data.componentName) {
    let crumb = data.componentName;
    if (data.ancestors.length > 0)
      crumb += ` <span style="opacity:0.5;">← ${data.ancestors.join(" ← ")}</span>`;
    if (data.sourceFile)
      crumb += ` <span style="opacity:0.5;">@ ${data.sourceFile}</span>`;
    html += `<div style="color:#a6adc8;margin-top:2px;">${crumb}</div>`;
  }

  // Direct text
  if (data.directText) {
    html += `<div style="color:rgba(249,226,175,0.8);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">"${data.directText}"</div>`;
  }

  html += `<div style="color:rgba(166,173,200,0.5);margin-top:4px;font-size:10px;">Click to insert · Esc to cancel</div>`;

  tooltipEl.innerHTML = html;
}

function handleClick(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();

  if (currentTooltipData) {
    const chip = formatText(currentTooltipData);
    // Send to background script → WS → t3code
    chrome.runtime.sendMessage(
      { type: "element-ref", chip },
      (response) => {
        if (response && !response.sent) {
          console.warn(
            "[t3code Inspector] Not connected to t3code. Make sure t3code is running."
          );
        }
      }
    );
  }

  deactivate();
}

// Listen for keyboard shortcut and toggle messages
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isActive) {
    deactivate();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "toggle-inspect") {
    if (isActive) {
      deactivate();
    } else {
      activate();
    }
  }
});

} // end double-injection guard
