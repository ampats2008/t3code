/**
 * 2AM-Code fork: Extended tool call classification.
 * Promotes additional tools (Edit, Grep, Glob, Write, TodoWrite) to rich
 * expandable rows. Kept separate to minimize upstream merge conflicts.
 */

import { type WorkLogEntry } from "../../session-logic";
import { type ToolDisplayMode, classifyToolDisplayMode } from "./toolCallClassification";

export type ForkToolDisplayMode =
  | ToolDisplayMode
  | "rich-grep"
  | "rich-glob"
  | "rich-write"
  | "rich-todo";

export function forkClassifyToolDisplayMode(entry: WorkLogEntry): ForkToolDisplayMode {
  // Let upstream classification handle its known rich modes first
  const upstream = classifyToolDisplayMode(entry);
  if (upstream !== "simple") return upstream;

  const toolName = entry.data?.toolName;

  // Promote Edit tool calls that upstream missed (no itemType/requestKind set)
  if (toolName === "Edit" || toolName === "Write") {
    const hasInput = entry.data?.input?.file_path;
    if (toolName === "Edit" && hasInput) return "rich-edit";
    if (toolName === "Write" && hasInput) return "rich-write";
  }

  switch (toolName) {
    case "Grep":
      return "rich-grep";
    case "Glob":
      return "rich-glob";
    case "TodoWrite":
      return "rich-todo";
    default:
      return "simple";
  }
}
