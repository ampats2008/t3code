import * as vscode from "vscode";
import type { T3CodeClient } from "./wsClient";

/**
 * Register a CodeActionProvider that offers "Fix with T3Code" on any diagnostic.
 * Collects diagnostic message, severity, source, file, line range, and surrounding
 * code context, then sends as a diagnostic-ref message over WS.
 */
export function registerDiagnosticAction(
  context: vscode.ExtensionContext,
  client: T3CodeClient,
) {
  const provider: vscode.CodeActionProvider = {
    provideCodeActions(document, range, context) {
      const diagnostics = context.diagnostics;
      if (diagnostics.length === 0) return [];

      const action = new vscode.CodeAction(
        "Fix with T3Code",
        vscode.CodeActionKind.QuickFix,
      );
      action.command = {
        command: "t3code.fixDiagnostic",
        title: "Fix with T3Code",
        arguments: [document, range, diagnostics],
      };
      action.diagnostics = [...diagnostics];
      action.isPreferred = false;
      return [action];
    },
  };

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider("*", provider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "t3code.fixDiagnostic",
      (
        document: vscode.TextDocument,
        range: vscode.Range,
        diagnostics: readonly vscode.Diagnostic[],
      ) => {
        const startLine = range.start.line;
        const endLine = range.end.line;

        const severityMap: Record<number, string> = {
          [vscode.DiagnosticSeverity.Error]: "error",
          [vscode.DiagnosticSeverity.Warning]: "warning",
          [vscode.DiagnosticSeverity.Information]: "info",
          [vscode.DiagnosticSeverity.Hint]: "hint",
        };

        const sent = client.send({
          type: "diagnostic-ref",
          file: document.uri.fsPath,
          startLine: startLine + 1,
          endLine: endLine + 1,
          diagnostics: diagnostics.map((d) => ({
            message: d.message,
            severity: severityMap[d.severity] ?? "error",
            source: d.source ? `${d.source}${d.code ? `(${typeof d.code === "object" ? d.code.value : d.code})` : ""}` : "",
          })),
        });

        if (!sent) {
          vscode.window.showWarningMessage(
            "Not connected to T3Code. Make sure T3Code is running.",
          );
        }
      },
    ),
  );
}
