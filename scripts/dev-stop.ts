/**
 * dev-stop — Kill all processes on t3code dev ports.
 *
 * Covers: server ports (13773-13783), web ports (5733-5743), inspector (27182).
 * Usage: node scripts/dev-stop.ts
 */
import { execSync } from "node:child_process";

const SERVER_PORTS = Array.from({ length: 11 }, (_, i) => 13773 + i);
const WEB_PORTS = Array.from({ length: 11 }, (_, i) => 5733 + i);
const INSPECTOR_PORT = 27182;
const ALL_PORTS = [...SERVER_PORTS, ...WEB_PORTS, INSPECTOR_PORT];

function killPortWindows(port: number): boolean {
  try {
    const output = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`,
      { encoding: "utf-8", timeout: 5000 },
    ).trim();
    if (!output) return false;
    for (const pid of new Set(
      output
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    )) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { timeout: 5000, stdio: "ignore" });
        console.log(`  killed PID ${pid} on port ${port}`);
      } catch {
        // already dead
      }
    }
    return true;
  } catch {
    return false;
  }
}

function killPortUnix(port: number): boolean {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (!output) return false;
    for (const pid of new Set(output.split(/\s+/).filter(Boolean))) {
      try {
        execSync(`kill -9 ${pid}`, { timeout: 5000, stdio: "ignore" });
        console.log(`  killed PID ${pid} on port ${port}`);
      } catch {
        // already dead
      }
    }
    return true;
  } catch {
    return false;
  }
}

const killPort = process.platform === "win32" ? killPortWindows : killPortUnix;

console.log("Stopping t3code dev processes...");
let killed = 0;
for (const port of ALL_PORTS) {
  if (killPort(port)) killed++;
}
if (killed === 0) {
  console.log("No dev processes found.");
} else {
  console.log(`Done. Cleaned up processes on ${killed} port(s).`);
}
