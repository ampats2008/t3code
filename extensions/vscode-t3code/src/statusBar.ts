import * as vscode from "vscode";
import type { ConnectionState } from "./wsClient";

let item: vscode.StatusBarItem;

export function createStatusBar(): vscode.StatusBarItem {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  update("disconnected");
  item.show();
  return item;
}

export function update(state: ConnectionState) {
  if (!item) return;
  if (state === "connected") {
    item.text = "$(plug) T3Code";
    item.tooltip = "Connected to T3Code";
    item.color = undefined;
  } else if (state === "connecting") {
    item.text = "$(sync~spin) T3Code";
    item.tooltip = "Connecting to T3Code...";
    item.color = undefined;
  } else {
    item.text = "$(debug-disconnect) T3Code";
    item.tooltip = "Disconnected from T3Code";
    item.color = new vscode.ThemeColor("statusBarItem.warningForeground");
  }
}
