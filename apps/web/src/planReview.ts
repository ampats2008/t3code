import { PlanAnnotation } from "./planReviewStore";

/**
 * Builds a structured plan review feedback message from annotations.
 * If editedMarkdown differs from originalMarkdown, appends an edited plan section.
 */
export function buildPlanReviewMessage(
  annotations: PlanAnnotation[],
  editedMarkdown?: string,
  originalMarkdown?: string,
): string {
  const hasEdits = editedMarkdown != null && editedMarkdown !== originalMarkdown;

  // If no annotations but has edited markdown, just return the edited plan section
  if (annotations.length === 0) {
    if (hasEdits && editedMarkdown != null) {
      return `EDITED PLAN (the user has directly modified the plan text):\n\n<proposed_plan>\n${editedMarkdown}\n</proposed_plan>\n\nPlease use this edited plan as the new baseline.`;
    }
    return "";
  }

  // Build the feedback message with annotations
  const feedbackLines: string[] = ["PLAN REVIEW FEEDBACK:", "", "---"];

  annotations.forEach((annotation, index) => {
    feedbackLines.push("");
    feedbackLines.push(`**[${index + 1}]**`);
    feedbackLines.push(`> "${annotation.selectedText}"`);
    feedbackLines.push("");
    feedbackLines.push(`Comment: ${annotation.comment}`);
    feedbackLines.push("");
    feedbackLines.push("---");
  });

  feedbackLines.push("");
  feedbackLines.push("Please revise the plan incorporating this feedback.");

  const message = feedbackLines.join("\n");

  // Append edited plan section if it differs
  if (hasEdits && editedMarkdown != null) {
    return `${message}\n\nEDITED PLAN (the user has directly modified the plan text):\n\n<proposed_plan>\n${editedMarkdown}\n</proposed_plan>\n\nPlease use this edited plan as the new baseline and incorporate the annotation feedback above.`;
  }

  return message;
}

/**
 * Finds the 0-based occurrence index of selectedText in markdown.
 * Returns 0 if found (first occurrence), -1 if not found.
 * Uses indexOf in a loop to count occurrences from the beginning.
 */
export function findOccurrenceIndex(markdown: string, selectedText: string): number {
  if (!selectedText) return -1;

  const index = markdown.indexOf(selectedText);
  return index === -1 ? -1 : 0;
}

/**
 * Gets the character offset ranges for each annotation in the markdown.
 * For each annotation, finds the Nth occurrence (using occurrenceIndex) of selectedText.
 * Returns sorted array of {start, end, annotationId} or empty array if annotations is empty.
 * Skips annotations whose text is no longer found.
 */
export function getAnnotationRanges(
  markdown: string,
  annotations: PlanAnnotation[],
): Array<{ start: number; end: number; annotationId: string }> {
  const ranges: Array<{ start: number; end: number; annotationId: string }> = [];

  for (const annotation of annotations) {
    const { selectedText, occurrenceIndex, id } = annotation;

    // Find the Nth occurrence of selectedText in markdown
    let searchPos = 0;
    let currentOccurrence = 0;
    let foundStart = -1;

    while ((searchPos = markdown.indexOf(selectedText, searchPos)) !== -1) {
      if (currentOccurrence === occurrenceIndex) {
        foundStart = searchPos;
        break;
      }
      currentOccurrence++;
      searchPos += selectedText.length;
    }

    // Skip if text not found at this occurrence
    if (foundStart === -1) {
      continue;
    }

    ranges.push({
      start: foundStart,
      end: foundStart + selectedText.length,
      annotationId: id,
    });
  }

  // Sort by start offset ascending
  ranges.sort((a, b) => a.start - b.start);

  return ranges;
}
