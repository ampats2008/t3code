import * as vscode from "vscode";
import type { T3CodeClient } from "./wsClient";

/**
 * Watch for failed terminal shell executions and offer to send
 * the error output to T3Code.
 *
 * Requires VS Code 1.93+ Shell Integration API.
 *
 * We must start capturing output when the execution *starts*
 * (onDidStartTerminalShellExecution), because by the time the
 * execution ends the read() stream is already drained. The buffered
 * output is then used in onDidEndTerminalShellExecution.
 */
export function registerTerminalWatcher(context: vscode.ExtensionContext, client: T3CodeClient) {
  if (
    !vscode.window.onDidStartTerminalShellExecution ||
    !vscode.window.onDidEndTerminalShellExecution
  ) {
    return;
  }

  // Strip ANSI escape sequences and leftover control fragments
  // eslint-disable-next-line no-control-regex
  const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b\(B/g;
  const LEFTOVER_RE = /^\d*[a-z]$/i;
  function stripAnsi(text: string): string {
    const cleaned = text.replace(ANSI_RE, "");
    // Remove lines that are just leftover escape fragments (e.g. "25l", "2026h")
    return cleaned
      .split("\n")
      .filter((line) => !LEFTOVER_RE.test(line.trim()))
      .join("\n");
  }

  // Buffer output keyed by execution object identity
  const outputBuffers = new Map<vscode.TerminalShellExecution, string[]>();

  // Start capturing output as soon as the execution begins
  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution((event) => {
      const execution = event.execution;
      const lines: string[] = [];
      outputBuffers.set(execution, lines);

      // Read the stream in the background — it yields data as the
      // command produces output and closes when it finishes.
      (async () => {
        try {
          const stream = execution.read();
          for await (const chunk of stream) {
            lines.push(chunk);
          }
        } catch {
          // Stream may error if terminal is disposed early
        }
      })();
    }),
  );

  // When the execution ends, check exit code and offer to send
  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution(async (event) => {
      const execution = event.execution;
      const lines = outputBuffers.get(execution);
      outputBuffers.delete(execution);

      if (event.exitCode === undefined || event.exitCode === 0) return;

      let output = stripAnsi((lines ?? []).join(""));

      // Truncate to last 100 lines
      const outputLines = output.split("\n");
      if (outputLines.length > 100) {
        output = outputLines.slice(-100).join("\n");
      }

      const commandLine = execution.commandLine.value || "(unknown command)";

      const action = await vscode.window.showInformationMessage(
        `Command failed (exit ${event.exitCode}) — Send to T3Code?`,
        "Send to T3Code",
        "Dismiss",
      );

      if (action !== "Send to T3Code") return;

      const cwd = event.terminal.shellIntegration?.cwd?.fsPath ?? "";

      const sent = client.send({
        type: "terminal-error",
        command: commandLine,
        exitCode: event.exitCode,
        output,
        cwd,
      });

      if (!sent) {
        vscode.window.showWarningMessage("Not connected to T3Code. Make sure T3Code is running.");
      }
    }),
  );
}
