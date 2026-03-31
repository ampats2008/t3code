import { describe, expect, it } from "vitest";

import { buildDiffReviewSubmissionPrompt } from "./diffReview";
import type { DiffReviewAnnotation } from "./diffReviewStore";

function makeAnnotation(
  overrides: Partial<DiffReviewAnnotation> & {
    filePath: string;
    lineNumber: number;
    side: "deletions" | "additions";
    text: string;
  },
): DiffReviewAnnotation {
  return {
    id: "test-id",
    threadId: "thread-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    orphaned: false,
    ...overrides,
  };
}

describe("buildDiffReviewSubmissionPrompt", () => {
  it("formats a single annotation with correct file path, line number, and side", () => {
    const annotations = [
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 42,
        side: "additions",
        text: "This function needs better error handling",
      }),
    ];

    expect(buildDiffReviewSubmissionPrompt(annotations, "")).toBe(
      "DIFF REVIEW ANNOTATIONS:\nFile: src/app.ts\n  Line 42 (additions): This function needs better error handling",
    );
  });

  it("groups multiple annotations by file path", () => {
    const annotations = [
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 10,
        side: "additions",
        text: "Comment 1",
      }),
      makeAnnotation({
        filePath: "src/utils.ts",
        lineNumber: 20,
        side: "deletions",
        text: "Comment 2",
      }),
    ];

    const result = buildDiffReviewSubmissionPrompt(annotations, "");

    expect(result).toContain("File: src/app.ts");
    expect(result).toContain("File: src/utils.ts");
  });

  it("sorts annotations within a file by line number", () => {
    const annotations = [
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 100,
        side: "additions",
        text: "Comment at line 100",
      }),
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 10,
        side: "additions",
        text: "Comment at line 10",
      }),
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 50,
        side: "additions",
        text: "Comment at line 50",
      }),
    ];

    const result = buildDiffReviewSubmissionPrompt(annotations, "");

    const lines = result.split("\n");
    const lineIndex10 = lines.findIndex((l) => l.includes("Comment at line 10"));
    const lineIndex50 = lines.findIndex((l) => l.includes("Comment at line 50"));
    const lineIndex100 = lines.findIndex((l) => l.includes("Comment at line 100"));

    expect(lineIndex10).toBeLessThan(lineIndex50);
    expect(lineIndex50).toBeLessThan(lineIndex100);
  });

  it("handles annotations on different files", () => {
    const annotations = [
      makeAnnotation({
        filePath: "src/module-a.ts",
        lineNumber: 5,
        side: "additions",
        text: "Comment A",
      }),
      makeAnnotation({
        filePath: "src/module-b.ts",
        lineNumber: 15,
        side: "deletions",
        text: "Comment B",
      }),
      makeAnnotation({
        filePath: "src/module-c.ts",
        lineNumber: 25,
        side: "additions",
        text: "Comment C",
      }),
    ];

    const result = buildDiffReviewSubmissionPrompt(annotations, "");

    expect(result).toContain("File: src/module-a.ts");
    expect(result).toContain("File: src/module-b.ts");
    expect(result).toContain("File: src/module-c.ts");
    expect(result).toContain("Comment A");
    expect(result).toContain("Comment B");
    expect(result).toContain("Comment C");
  });

  it("prepends user draft text when provided", () => {
    const annotations = [
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 42,
        side: "additions",
        text: "Fix this",
      }),
    ];
    const draftText = "Please address these review comments:";

    const result = buildDiffReviewSubmissionPrompt(annotations, draftText);

    expect(result.startsWith("Please address these review comments:")).toBe(true);
    expect(result).toContain("DIFF REVIEW ANNOTATIONS:");
    expect(result).toContain("Fix this");
  });

  it("returns only annotation block when draft text is empty", () => {
    const annotations = [
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 42,
        side: "additions",
        text: "Fix this",
      }),
    ];

    const result = buildDiffReviewSubmissionPrompt(annotations, "");

    expect(result).toBe(
      "DIFF REVIEW ANNOTATIONS:\nFile: src/app.ts\n  Line 42 (additions): Fix this",
    );
    expect(result).not.toContain("\n\n");
  });

  it("returns only annotation block when draft text is whitespace-only", () => {
    const annotations = [
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 42,
        side: "additions",
        text: "Fix this",
      }),
    ];

    const result = buildDiffReviewSubmissionPrompt(annotations, "   \n  \t  ");

    expect(result).toBe(
      "DIFF REVIEW ANNOTATIONS:\nFile: src/app.ts\n  Line 42 (additions): Fix this",
    );
    expect(result).not.toContain("\n\n");
  });

  it("handles additions side correctly", () => {
    const annotations = [
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 42,
        side: "additions",
        text: "New code looks good",
      }),
    ];

    const result = buildDiffReviewSubmissionPrompt(annotations, "");

    expect(result).toContain("Line 42 (additions):");
  });

  it("handles deletions side correctly", () => {
    const annotations = [
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 42,
        side: "deletions",
        text: "Removed code was problematic",
      }),
    ];

    const result = buildDiffReviewSubmissionPrompt(annotations, "");

    expect(result).toContain("Line 42 (deletions):");
  });

  it("handles multiple annotations on the same file", () => {
    const annotations = [
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 10,
        side: "additions",
        text: "First comment",
      }),
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 20,
        side: "additions",
        text: "Second comment",
      }),
      makeAnnotation({
        filePath: "src/app.ts",
        lineNumber: 15,
        side: "deletions",
        text: "Third comment",
      }),
    ];

    const result = buildDiffReviewSubmissionPrompt(annotations, "");

    expect(result).toContain("File: src/app.ts");
    expect(result).toContain("Line 10 (additions): First comment");
    expect(result).toContain("Line 15 (deletions): Third comment");
    expect(result).toContain("Line 20 (additions): Second comment");

    const lines = result.split("\n");
    const line10Index = lines.findIndex((l) => l.includes("Line 10"));
    const line15Index = lines.findIndex((l) => l.includes("Line 15"));
    const line20Index = lines.findIndex((l) => l.includes("Line 20"));

    expect(line10Index).toBeLessThan(line15Index);
    expect(line15Index).toBeLessThan(line20Index);
  });
});
