import * as vscode from "vscode";
import { T3CodeClient } from "./wsClient";
import { createStatusBar, update as updateStatusBar } from "./statusBar";

let client: T3CodeClient;

export function activate(context: vscode.ExtensionContext) {
  // WS client
  client = new T3CodeClient();
  context.subscriptions.push({ dispose: () => client.dispose() });

  // Status bar
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  client.on("stateChange", updateStatusBar);
  client.connect();

  // Send selection command
  context.subscriptions.push(
    vscode.commands.registerCommand("t3code.sendSelection", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor");
        return;
      }
      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showWarningMessage("No text selected");
        return;
      }
      const sent = client.send({
        type: "code-ref",
        file: editor.document.uri.fsPath,
        startLine: selection.start.line + 1,
        endLine: selection.end.line + 1,
        text: editor.document.getText(selection),
        language: editor.document.languageId,
      });
      if (!sent) {
        vscode.window.showWarningMessage(
          "Not connected to T3Code. Make sure T3Code is running.",
        );
      }
    }),
  );

  // Handle open-file messages from T3Code
  client.on("message", async (msg: { type: string; file?: string; line?: number; column?: number }) => {
    if (msg.type === "open-file" && msg.file) {
      try {
        const uri = vscode.Uri.file(msg.file);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        if (msg.line) {
          const pos = new vscode.Position(
            (msg.line ?? 1) - 1,
            (msg.column ?? 1) - 1,
          );
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenter,
          );
        }
      } catch (err) {
        vscode.window.showWarningMessage(
          `Failed to open file: ${msg.file}`,
        );
      }
    }
  });
}

export function deactivate() {
  client?.dispose();
}
