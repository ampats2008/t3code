import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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

      const markup = renderToStaticMarkup(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      expect(markup).toContain("Skill");
      expect(markup).toContain("simplify");
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

      const markup = renderToStaticMarkup(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      expect(markup).toContain("Add ctrl+s shortcut");
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

      const markup = renderToStaticMarkup(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      // Should render without errors
      expect(markup).toBeTruthy();
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

      const markup = renderToStaticMarkup(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      // Should render without errors with all data present
      expect(markup).toContain("claude-api");
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

      const markup = renderToStaticMarkup(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      // Verify the component renders with result data (SSR can't test expansion)
      expect(markup).toContain("simplify");
      expect(markup).toContain("Review changes");
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

      const markup = renderToStaticMarkup(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      // Should render without the "name:" field when skill is empty
      expect(markup).not.toContain("name:");
    });
  });

  describe("SkillInput type safety", () => {
    it("handles missing input data", () => {
      const workEntry = makeWorkEntry({
        data: {
          toolName: "Skill",
        },
      });

      const markup = renderToStaticMarkup(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      // Should render without errors
      expect(markup).toBeTruthy();
    });

    it("handles undefined data object", () => {
      const workEntry = makeWorkEntry({
        // No data field
      });

      const markup = renderToStaticMarkup(
        <RichToolCallRow workEntry={workEntry} displayMode="rich-skill" />,
      );

      // Should render without errors
      expect(markup).toBeTruthy();
    });
  });
});
