// Temporary debug logger — writes to localStorage and can be dumped to console/file.
// Call `window.__dumpForkDebugLog()` in the browser console to get the full log,
// or `window.__clearForkDebugLog()` to reset.

const LOG_KEY = "fork-debug-log";
const MAX_LOG_LINES = 500;
const MAX_LOG_CHARS = 200_000;

function trimLog(log: string[]): string[] {
  let trimmed = log.slice(-MAX_LOG_LINES);
  while (JSON.stringify(trimmed).length > MAX_LOG_CHARS && trimmed.length > 0) {
    trimmed = trimmed.slice(Math.max(1, Math.floor(trimmed.length / 10)));
  }
  return trimmed;
}

function getLog(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

export function forkDebugLog(tag: string, ...args: unknown[]): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${tag}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`;
  console.log(line);
  try {
    const log = trimLog([...getLog(), line]);
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // ignore storage errors
  }
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__dumpForkDebugLog = () => {
    const log = getLog();
    const text = log.join("\n");
    console.log(text);
    // Also create a downloadable blob
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fork-debug-log.txt";
    a.click();
    URL.revokeObjectURL(url);
    return `${log.length} lines dumped & downloaded`;
  };
  (window as unknown as Record<string, unknown>).__clearForkDebugLog = () => {
    localStorage.removeItem(LOG_KEY);
    return "cleared";
  };
}
