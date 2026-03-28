import { type WorkLogEntry } from "../../session-logic";

export type ToolDisplayMode = "rich-agent" | "rich-bash" | "rich-edit" | "simple";

export function classifyToolDisplayMode(entry: WorkLogEntry): ToolDisplayMode {
  if (entry.itemType === "collab_agent_tool_call") return "rich-agent";
  if (entry.itemType === "command_execution") return "rich-bash";
  if (entry.requestKind === "command" && !entry.itemType) return "rich-bash";
  if (entry.itemType === "file_change" && entry.requestKind === "file-change") return "rich-edit";
  return "simple";
}
