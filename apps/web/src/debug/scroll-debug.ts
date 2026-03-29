/**
 * Scroll-jitter debug instrumentation.
 *
 * Captures every scrollTop / scrollHeight mutation with its source tag so we
 * can replay exactly what moved the scrollbar and when.
 *
 * Usage (browser console):
 *   __scrollDebug.dump()        — print the last N events
 *   __scrollDebug.dumpJSON()    — copy-pasteable JSON
 *   __scrollDebug.clear()       — reset the ring buffer
 *   __scrollDebug.overlay(true) — toggle live on-screen overlay
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScrollSource =
  | "user-scroll" // passive onScroll handler fired
  | "wheel-up" // user scrolled wheel upward
  | "auto-scroll-to-bottom" // scrollMessagesToBottom()
  | "stick-to-bottom-raf" // scheduleStickToBottom rAF callback
  | "force-stick-to-bottom" // forceStickToBottom()
  | "anchor-preserve" // interaction anchor adjustment
  | "composer-resize" // ResizeObserver on composer form
  | "message-count" // useEffect on messageCount
  | "phase-running" // useEffect on phase/timelineEntries
  | "thread-change" // useLayoutEffect on activeThread.id
  | "virtualizer-adjust" // shouldAdjustScrollPositionOnItemSizeChange
  | "virtualizer-measure" // rowVirtualizer.measure() (width change / image load)
  | "image-load-measure" // onTimelineImageLoad rAF
  | "scrollHeight-change"; // detected scrollHeight mutation

export interface ScrollEvent {
  ts: number; // performance.now()
  source: ScrollSource;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  delta: number; // scrollTop change since previous event
  scrollHeightDelta: number; // scrollHeight change since previous event
  extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Ring buffer
// ---------------------------------------------------------------------------

const MAX_EVENTS = 500;
const events: ScrollEvent[] = [];
let prevScrollTop = 0;
let prevScrollHeight = 0;
let enabled = true;

// ---------------------------------------------------------------------------
// Core logging
// ---------------------------------------------------------------------------

export function logScroll(
  source: ScrollSource,
  container: { scrollTop: number; scrollHeight: number; clientHeight: number },
  extra?: Record<string, unknown>,
): void {
  if (!enabled) return;

  const delta = container.scrollTop - prevScrollTop;
  const scrollHeightDelta = container.scrollHeight - prevScrollHeight;

  const entry: ScrollEvent = {
    ts: performance.now(),
    source,
    scrollTop: Math.round(container.scrollTop * 100) / 100,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
    delta: Math.round(delta * 100) / 100,
    scrollHeightDelta,
    ...(extra ? { extra } : {}),
  };

  events.push(entry);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  prevScrollTop = container.scrollTop;
  prevScrollHeight = container.scrollHeight;

  // Highlight suspicious events in the console
  if (Math.abs(delta) > 2 && source !== "user-scroll" && source !== "wheel-up") {
    console.warn(
      `[scroll-debug] JUMP  ${source}  Δ=${delta.toFixed(1)}px  scrollHeightΔ=${scrollHeightDelta}`,
      extra ?? "",
    );
  }

  updateOverlay(entry);
}

/**
 * Log a virtualizer item-size-change decision without needing the scroll
 * container (called from inside the shouldAdjust callback).
 */
export function logVirtualizerAdjust(
  decision: boolean,
  extra: Record<string, unknown>,
  container?: { scrollTop: number; scrollHeight: number; clientHeight: number } | null,
): void {
  if (!enabled) return;
  if (container) {
    logScroll("virtualizer-adjust", container, { decision, ...extra });
  } else {
    // Fallback: log without container metrics
    const entry: ScrollEvent = {
      ts: performance.now(),
      source: "virtualizer-adjust",
      scrollTop: prevScrollTop,
      scrollHeight: prevScrollHeight,
      clientHeight: 0,
      delta: 0,
      scrollHeightDelta: 0,
      extra: { decision, ...extra },
    };
    events.push(entry);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    if (decision) {
      console.warn("[scroll-debug] virtualizer-adjust decision=true", extra);
    }
    updateOverlay(entry);
  }
}

// ---------------------------------------------------------------------------
// Scroll-height watcher (detect layout shifts)
// ---------------------------------------------------------------------------

let watcherInterval: ReturnType<typeof setInterval> | null = null;

export function watchScrollHeight(
  getContainer: () => HTMLElement | null,
  intervalMs = 100,
): () => void {
  if (watcherInterval !== null) clearInterval(watcherInterval);
  watcherInterval = setInterval(() => {
    const el = getContainer();
    if (!el) return;
    if (el.scrollHeight !== prevScrollHeight) {
      logScroll("scrollHeight-change", el, {
        prevScrollHeight,
        newScrollHeight: el.scrollHeight,
      });
    }
  }, intervalMs);
  return () => {
    if (watcherInterval !== null) {
      clearInterval(watcherInterval);
      watcherInterval = null;
    }
  };
}

// ---------------------------------------------------------------------------
// On-screen overlay
// ---------------------------------------------------------------------------

let overlayEl: HTMLDivElement | null = null;
let overlayVisible = false;
const OVERLAY_MAX_LINES = 12;

function ensureOverlay(): HTMLDivElement {
  if (overlayEl) return overlayEl;
  const el = document.createElement("div");
  el.id = "__scroll-debug-overlay";
  Object.assign(el.style, {
    position: "fixed",
    bottom: "8px",
    right: "8px",
    width: "480px",
    maxHeight: "320px",
    overflow: "auto",
    background: "rgba(0,0,0,0.85)",
    color: "#0f0",
    fontFamily: "monospace",
    fontSize: "11px",
    lineHeight: "1.4",
    padding: "6px 8px",
    borderRadius: "6px",
    zIndex: "999999",
    pointerEvents: "none",
    whiteSpace: "pre",
  });
  document.body.appendChild(el);
  overlayEl = el;
  return el;
}

function updateOverlay(entry: ScrollEvent): void {
  if (!overlayVisible) return;
  const ol = ensureOverlay();
  const line = formatEvent(entry);
  // Append, trim old lines
  ol.textContent = (ol.textContent ?? "")
    .split("\n")
    .slice(-(OVERLAY_MAX_LINES - 1))
    .concat(line)
    .join("\n");
  ol.scrollTop = ol.scrollHeight;
}

function formatEvent(e: ScrollEvent): string {
  const tag = e.source.padEnd(22);
  const delta = (e.delta >= 0 ? "+" : "") + e.delta.toFixed(1);
  const shDelta =
    e.scrollHeightDelta !== 0 ? `  shΔ=${e.scrollHeightDelta > 0 ? "+" : ""}${e.scrollHeightDelta}` : "";
  const extraStr = e.extra ? `  ${JSON.stringify(e.extra)}` : "";
  return `${tag} top=${e.scrollTop.toFixed(0).padStart(6)}  Δ=${delta.padStart(7)}${shDelta}${extraStr}`;
}

// ---------------------------------------------------------------------------
// Console API
// ---------------------------------------------------------------------------

function dump(last = 60): void {
  const slice = events.slice(-last);
  console.group(`[scroll-debug] last ${slice.length} events`);
  for (const e of slice) {
    const style =
      Math.abs(e.delta) > 2 && e.source !== "user-scroll" ? "color: red; font-weight: bold" : "";
    console.log(`%c${formatEvent(e)}`, style);
  }
  console.groupEnd();
}

function dumpJSON(last = 200): string {
  const json = JSON.stringify(events.slice(-last), null, 2);
  console.log(json);
  return json;
}

function clear(): void {
  events.length = 0;
  prevScrollTop = 0;
  prevScrollHeight = 0;
}

function overlay(show?: boolean): void {
  overlayVisible = show ?? !overlayVisible;
  if (overlayVisible) {
    ensureOverlay();
    ensureOverlay().style.display = "block";
  } else if (overlayEl) {
    overlayEl.style.display = "none";
  }
}

function setEnabled(on: boolean): void {
  enabled = on;
}

// ---------------------------------------------------------------------------
// Expose on window for console access
// ---------------------------------------------------------------------------

const api = { dump, dumpJSON, clear, overlay, setEnabled, events };

if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__scrollDebug = api;
}

export default api;
