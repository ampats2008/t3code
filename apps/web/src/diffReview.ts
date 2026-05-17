import type { DiffReviewAnnotation } from "./diffReviewStore";

/**
 * Build a structured prompt from diff review annotations that gives the agent
 * clear file paths, line numbers, sides, and comment text to act on.
 *
 * If the user also typed general feedback in the composer, it is prepended.
 */
export function buildDiffReviewSubmissionPrompt(
  annotations: DiffReviewAnnotation[],
  draftText: string,
): string {
  const trimmedDraft = draftText.trim();

  // Group annotations by file path
  const byFile = new Map<string, DiffReviewAnnotation[]>();
  for (const annotation of annotations) {
    const list = byFile.get(annotation.filePath) ?? [];
    list.push(annotation);
    byFile.set(annotation.filePath, list);
  }

  // Build the structured annotation block
  const sections: string[] = [];
  for (const [filePath, fileAnnotations] of byFile) {
    const sorted = fileAnnotations.toSorted((a, b) => a.lineNumber - b.lineNumber);
    const lines = sorted.map((a) => `  Line ${a.lineNumber} (${a.side}): ${a.text}`);
    sections.push(`File: ${filePath}\n${lines.join("\n")}`);
  }

  const annotationBlock = `DIFF REVIEW ANNOTATIONS:\n${sections.join("\n\n")}`;

  if (trimmedDraft.length > 0) {
    return `${trimmedDraft}\n\n${annotationBlock}`;
  }

  return annotationBlock;
}
