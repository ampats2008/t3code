import { describe, expect, it } from "vitest";
import { classifyToolDisplayMode } from "./toolCallClassification";
import { type WorkLogEntry } from "../../session-logic";

function makeWorkEntry(overrides: Partial<WorkLogEntry>): WorkLogEntry {
  return {
    id: "test-entry",
    createdAt: "2026-02-23T00:00:00.000Z",
    label: "Tool call",
    tone: "tool",
    ...overrides,
  };
}

describe("classifyToolDisplayMode", () => {
  it("returns rich-agent for collab_agent_tool_call", () => {
    expect(
      classifyToolDisplayMode(makeWorkEntry({ itemType: "collab_agent_tool_call" })),
    ).toBe("rich-agent");
  });

  it("returns rich-bash for command_execution", () => {
    expect(
      classifyToolDisplayMode(makeWorkEntry({ itemType: "command_execution" })),
    ).toBe("rich-bash");
  });

  it("returns rich-bash for requestKind command without itemType", () => {
    expect(
      classifyToolDisplayMode(makeWorkEntry({ requestKind: "command" })),
    ).toBe("rich-bash");
  });

  it("returns rich-edit for file_change with file-change requestKind", () => {
    expect(
      classifyToolDisplayMode(
        makeWorkEntry({ itemType: "file_change", requestKind: "file-change" }),
      ),
    ).toBe("rich-edit");
  });

  it("returns simple for file_change without matching requestKind", () => {
    expect(
      classifyToolDisplayMode(makeWorkEntry({ itemType: "file_change" })),
    ).toBe("simple");
  });

  it("returns simple for mcp_tool_call", () => {
    expect(
      classifyToolDisplayMode(makeWorkEntry({ itemType: "mcp_tool_call" })),
    ).toBe("simple");
  });

  it("returns simple for dynamic_tool_call", () => {
    expect(
      classifyToolDisplayMode(makeWorkEntry({ itemType: "dynamic_tool_call" })),
    ).toBe("simple");
  });

  it("returns simple for web_search", () => {
    expect(
      classifyToolDisplayMode(makeWorkEntry({ itemType: "web_search" })),
    ).toBe("simple");
  });

  it("returns simple for entries with no itemType or requestKind", () => {
    expect(classifyToolDisplayMode(makeWorkEntry({}))).toBe("simple");
  });
});
