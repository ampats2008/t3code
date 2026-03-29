import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RichToolCallRow } from "./RichToolCallRow";
import { type WorkLogEntry } from "../../session-logic";

function makeWorkEntry(overrides: Partial<WorkLogEntry>): WorkLogEntry {
  return {
    id: "test-entry",
    createdAt: "2026-02-23T00:00:00.000Z",
    label: "Test Tool",
    tone: "tool",
    ...overrides,
  };
}

describe("RichToolCallRow - Skill Display", () => {
  describe("SkillSummary", () => {
    it("displays skill name with 'Skill -' prefix", () => {
      const workEntry = makeWorkEntry({
        label: "Skill - simplify",
        data: {
          toolName: "Skill",
          input: {
            skill: "simplify",
            args: "Review code for quality",
          },
        },
      });

      render(<RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />);

      expect(screen.getByText(/Skill/i)).toBeInTheDocument();
      expect(screen.getByText(/simplify/)).toBeInTheDocument();
    });

    it("displays arguments when present", () => {
      const workEntry = makeWorkEntry({
        data: {
          toolName: "Skill",
          input: {
            skill: "keybindings-help",
            args: "Add ctrl+s shortcut",
          },
        },
      });

      render(<RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />);

      expect(screen.getByText(/Add ctrl\+s shortcut/)).toBeInTheDocument();
    });

    it("handles empty skill name gracefully", () => {
      const workEntry = makeWorkEntry({
        data: {
          toolName: "Skill",
          input: {
            skill: "",
            args: "some args",
          },
        },
      });

      const { container } = render(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      // Should render without errors
      expect(container).toBeInTheDocument();
    });
  });

  describe("SkillDetail (expanded)", () => {
    it("displays skill name in expanded view", () => {
      const workEntry = makeWorkEntry({
        data: {
          toolName: "Skill",
          input: {
            skill: "claude-api",
            args: "Build with Anthropic SDK",
          },
          result: '{"type": "success"}',
        },
      });

      render(<RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />);

      // Should render without errors with all data present
      expect(screen.getByText(/claude-api/)).toBeInTheDocument();
    });

    it("displays result when present", () => {
      const workEntry = makeWorkEntry({
        data: {
          toolName: "Skill",
          input: {
            skill: "simplify",
            args: "Review changes",
          },
          result: "Code looks good",
        },
      });

      render(<RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />);

      // Result section should be present
      expect(screen.getByText(/Result/)).toBeInTheDocument();
    });

    it("omits skill name when empty", () => {
      const workEntry = makeWorkEntry({
        data: {
          toolName: "Skill",
          input: {
            skill: "",
            args: "Some arguments",
          },
          result: "Success",
        },
      });

      const { container } = render(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      // Should render without the "name:" field when skill is empty
      expect(container.textContent).not.toContain("name:");
    });
  });

  describe("SkillInput type safety", () => {
    it("handles missing input data", () => {
      const workEntry = makeWorkEntry({
        data: {
          toolName: "Skill",
        },
      });

      const { container } = render(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      // Should render without errors
      expect(container).toBeInTheDocument();
    });

    it("handles undefined data object", () => {
      const workEntry = makeWorkEntry({
        // No data field
      });

      const { container } = render(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      // Should render without errors
      expect(container).toBeInTheDocument();
    });
  });
});
