import { describe, expect, it } from "vitest";

import { buildPlanReviewMessage, findOccurrenceIndex, getAnnotationRanges } from "./planReview";
import { PlanAnnotation } from "./planReviewStore";

describe("buildPlanReviewMessage", () => {
  it("formats a single annotation with proper structure", () => {
    const annotations: PlanAnnotation[] = [
      {
        id: "ann-1",
        selectedText: "step 1",
        occurrenceIndex: 0,
        comment: "This needs clarification",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const result = buildPlanReviewMessage(annotations);
    expect(result).toContain("PLAN REVIEW FEEDBACK:");
    expect(result).toContain("**[1]**");
    expect(result).toContain('"step 1"');
    expect(result).toContain("Comment: This needs clarification");
    expect(result).toContain("Please revise the plan incorporating this feedback.");
  });

  it("formats multiple annotations with sequential numbering", () => {
    const annotations: PlanAnnotation[] = [
      {
        id: "ann-1",
        selectedText: "step 1",
        occurrenceIndex: 0,
        comment: "Clarify this",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "ann-2",
        selectedText: "step 2",
        occurrenceIndex: 0,
        comment: "More detail needed",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const result = buildPlanReviewMessage(annotations);
    expect(result).toContain("**[1]**");
    expect(result).toContain("**[2]**");
    expect(result).toContain('"step 1"');
    expect(result).toContain('"step 2"');
    expect(result).toContain("Comment: Clarify this");
    expect(result).toContain("Comment: More detail needed");
  });

  it("includes edited plan when editedMarkdown differs from originalMarkdown", () => {
    const annotations: PlanAnnotation[] = [
      {
        id: "ann-1",
        selectedText: "step 1",
        occurrenceIndex: 0,
        comment: "Fix this",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const original = "## Plan\n- step 1\n- step 2";
    const edited = "## Plan\n- STEP 1 REVISED\n- step 2";

    const result = buildPlanReviewMessage(annotations, edited, original);
    expect(result).toContain("PLAN REVIEW FEEDBACK:");
    expect(result).toContain("EDITED PLAN (the user has directly modified the plan text):");
    expect(result).toContain("<proposed_plan>");
    expect(result).toContain("STEP 1 REVISED");
    expect(result).toContain("Please use this edited plan as the new baseline");
  });

  it("omits edited section when editedMarkdown equals originalMarkdown", () => {
    const annotations: PlanAnnotation[] = [
      {
        id: "ann-1",
        selectedText: "step 1",
        occurrenceIndex: 0,
        comment: "Clarify",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const same = "## Plan\n- step 1\n- step 2";

    const result = buildPlanReviewMessage(annotations, same, same);
    expect(result).toContain("PLAN REVIEW FEEDBACK:");
    expect(result).not.toContain("EDITED PLAN (the user has directly modified");
  });

  it("handles empty annotations array", () => {
    const result = buildPlanReviewMessage([]);
    expect(result).toBe("");
  });

  it("returns only edited plan section when annotations are empty but markdown edited", () => {
    const original = "## Plan\n- step 1";
    const edited = "## Plan\n- step 1 (revised)";

    const result = buildPlanReviewMessage([], edited, original);
    expect(result).toContain("EDITED PLAN (the user has directly modified the plan text):");
    expect(result).toContain("<proposed_plan>");
    expect(result).toContain("step 1 (revised)");
    expect(result).not.toContain("PLAN REVIEW FEEDBACK:");
  });

  it("escapes special characters in selectedText", () => {
    const annotations: PlanAnnotation[] = [
      {
        id: "ann-1",
        selectedText: 'step "1" with <special> chars',
        occurrenceIndex: 0,
        comment: "Note the special chars",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const result = buildPlanReviewMessage(annotations);
    // The text should be preserved as-is in quotes
    expect(result).toContain('> "step "1" with <special> chars"');
  });
});

describe("findOccurrenceIndex", () => {
  it("returns 0 when text is found (first occurrence)", () => {
    const markdown = "This has hello in it";
    expect(findOccurrenceIndex(markdown, "hello")).toBe(0);
  });

  it("returns 0 for a single occurrence of text", () => {
    const markdown = "Just one hello here";
    expect(findOccurrenceIndex(markdown, "hello")).toBe(0);
  });

  it("returns -1 when text is not found", () => {
    const markdown = "This has no missing text";
    expect(findOccurrenceIndex(markdown, "notfound")).toBe(-1);
  });

  it("returns -1 for empty search text", () => {
    const markdown = "Some text";
    expect(findOccurrenceIndex(markdown, "")).toBe(-1);
  });
});

describe("getAnnotationRanges", () => {
  it("returns empty array for no annotations", () => {
    const markdown = "Some markdown text";
    const result = getAnnotationRanges(markdown, []);
    expect(result).toEqual([]);
  });

  it("returns correct character offsets for a single annotation", () => {
    const markdown = "This is a test string";
    const annotations: PlanAnnotation[] = [
      {
        id: "ann-1",
        selectedText: "test",
        occurrenceIndex: 0,
        comment: "Test this",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const result = getAnnotationRanges(markdown, annotations);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      start: 10,
      end: 14,
      annotationId: "ann-1",
    });
  });

  it("returns multiple non-overlapping ranges sorted by start offset", () => {
    const markdown = "The quick brown fox";
    const annotations: PlanAnnotation[] = [
      {
        id: "ann-1",
        selectedText: "quick",
        occurrenceIndex: 0,
        comment: "First",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "ann-2",
        selectedText: "brown",
        occurrenceIndex: 0,
        comment: "Second",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const result = getAnnotationRanges(markdown, annotations);
    expect(result).toHaveLength(2);
    // Should be sorted by start offset
    expect(result[0]!.annotationId).toBe("ann-1"); // "quick" starts at 4
    expect(result[1]!.annotationId).toBe("ann-2"); // "brown" starts at 10
    expect(result[0]!.start).toBeLessThan(result[1]!.start);
  });

  it("handles duplicate text using occurrenceIndex", () => {
    const markdown = "apple is good. apple is healthy.";
    const annotations: PlanAnnotation[] = [
      {
        id: "ann-1",
        selectedText: "apple",
        occurrenceIndex: 0,
        comment: "First apple",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "ann-2",
        selectedText: "apple",
        occurrenceIndex: 1,
        comment: "Second apple",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const result = getAnnotationRanges(markdown, annotations);
    expect(result).toHaveLength(2);
    // First apple is at position 0-5
    expect(result[0]).toEqual({
      start: 0,
      end: 5,
      annotationId: "ann-1",
    });
    // Second apple is at position 15-20 (after "apple is good. ")
    expect(result[1]).toEqual({
      start: 15,
      end: 20,
      annotationId: "ann-2",
    });
  });

  it("skips annotations whose text is no longer found", () => {
    const markdown = "The quick brown fox";
    const annotations: PlanAnnotation[] = [
      {
        id: "ann-1",
        selectedText: "quick",
        occurrenceIndex: 0,
        comment: "Present",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "ann-2",
        selectedText: "missing",
        occurrenceIndex: 0,
        comment: "Not present",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const result = getAnnotationRanges(markdown, annotations);
    expect(result).toHaveLength(1);
    expect(result[0]!.annotationId).toBe("ann-1");
  });
});
