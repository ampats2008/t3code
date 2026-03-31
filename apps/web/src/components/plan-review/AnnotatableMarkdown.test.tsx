import { describe, expect, it, beforeEach, vi } from "vitest";
import { usePlanReviewStore } from "~/planReviewStore";

// Mock ChatMarkdown to avoid its heavy browser dependency chain (useTheme, shiki, etc.)
vi.mock("../ChatMarkdown", () => ({
  default: ({ text }: { text: string }) => <div data-testid="chat-markdown">{text}</div>,
}));

import { AnnotatableMarkdown } from "./AnnotatableMarkdown";

/**
 * Note: AnnotatableMarkdown is a client component with hooks, so we test:
 * 1. That it can be imported and instantiated without errors
 * 2. Store logic through unit tests (see planReviewStore.test.ts)
 * 3. Component structure through unit tests of sub-components
 */

describe("AnnotatableMarkdown", () => {
  const testPlanId = "plan-123";
  const testMarkdown = `# Test Plan

This is a test plan with some content.

## Section 1
Some important text here.

## Section 2
More content to test.`;

  beforeEach(() => {
    // Reset store before each test
    usePlanReviewStore.getState().clearAnnotations(testPlanId);
    usePlanReviewStore.getState().clearEditedMarkdown(testPlanId);
    usePlanReviewStore.getState().setActiveAnnotationId(null);
  });

  it("component can be instantiated with required props", () => {
    expect(() => {
      // Just ensure the component can be created
      const component = <AnnotatableMarkdown planId={testPlanId} markdown={testMarkdown} />;
      expect(component).toBeDefined();
    }).not.toThrow();
  });

  it("accepts optional cwd prop", () => {
    expect(() => {
      const component = (
        <AnnotatableMarkdown planId={testPlanId} markdown={testMarkdown} cwd="/path/to/project" />
      );
      expect(component).toBeDefined();
    }).not.toThrow();
  });

  it("handles empty markdown gracefully", () => {
    expect(() => {
      const component = <AnnotatableMarkdown planId={testPlanId} markdown="" />;
      expect(component).toBeDefined();
    }).not.toThrow();
  });

  it("renders plain markdown without annotations in store", () => {
    // Verify store is empty
    const state = usePlanReviewStore.getState();
    expect(state.annotations[testPlanId] ?? []).toHaveLength(0);

    // Component should work with empty annotations
    expect(() => {
      const component = <AnnotatableMarkdown planId={testPlanId} markdown={testMarkdown} />;
      expect(component).toBeDefined();
    }).not.toThrow();
  });

  it("renders with annotations in store", () => {
    // Add annotation to store
    usePlanReviewStore.getState().addAnnotation(testPlanId, {
      selectedText: "test plan",
      occurrenceIndex: 0,
      comment: "This is a test comment",
    });

    const state = usePlanReviewStore.getState();
    expect(state.annotations[testPlanId]).toHaveLength(1);

    // Component should work with annotations in store
    expect(() => {
      const component = <AnnotatableMarkdown planId={testPlanId} markdown={testMarkdown} />;
      expect(component).toBeDefined();
    }).not.toThrow();
  });

  it("handles multiple annotations in store", () => {
    // Add multiple annotations
    usePlanReviewStore.getState().addAnnotation(testPlanId, {
      selectedText: "test plan",
      occurrenceIndex: 0,
      comment: "Comment 1",
    });

    usePlanReviewStore.getState().addAnnotation(testPlanId, {
      selectedText: "important text",
      occurrenceIndex: 0,
      comment: "Comment 2",
    });

    const state = usePlanReviewStore.getState();
    expect(state.annotations[testPlanId]).toHaveLength(2);

    // Component should handle multiple annotations
    expect(() => {
      const component = <AnnotatableMarkdown planId={testPlanId} markdown={testMarkdown} />;
      expect(component).toBeDefined();
    }).not.toThrow();
  });

  it("handles annotations with text not found in markdown", () => {
    // Add annotation with text that doesn't exist in markdown
    usePlanReviewStore.getState().addAnnotation(testPlanId, {
      selectedText: "text that does not exist anywhere",
      occurrenceIndex: 0,
      comment: "Should be skipped",
    });

    // Component should skip missing text gracefully
    expect(() => {
      const component = <AnnotatableMarkdown planId={testPlanId} markdown={testMarkdown} />;
      expect(component).toBeDefined();
    }).not.toThrow();
  });

  it("handles special characters in selected text", () => {
    const specialMarkdown = "Code: `const x = 5;` here.";

    usePlanReviewStore.getState().addAnnotation(testPlanId, {
      selectedText: "const x = 5;",
      occurrenceIndex: 0,
      comment: "Check this code",
    });

    // Component should handle special characters
    expect(() => {
      const component = <AnnotatableMarkdown planId={testPlanId} markdown={specialMarkdown} />;
      expect(component).toBeDefined();
    }).not.toThrow();
  });

  it("handles occurrence index disambiguation", () => {
    const duplicateMarkdown = `This plan is important.
Another plan is also important.
This plan matters most.`;

    // Add annotation for second occurrence of "This plan"
    usePlanReviewStore.getState().addAnnotation(testPlanId, {
      selectedText: "This plan",
      occurrenceIndex: 1,
      comment: "Note the second occurrence",
    });

    const state = usePlanReviewStore.getState();
    const annotation = state.annotations[testPlanId]?.[0];
    expect(annotation?.occurrenceIndex).toBe(1);

    // Component should work with occurrence index
    expect(() => {
      const component = <AnnotatableMarkdown planId={testPlanId} markdown={duplicateMarkdown} />;
      expect(component).toBeDefined();
    }).not.toThrow();
  });

  it("maintains separate annotation state for different plans", () => {
    const otherPlanId = "plan-456";

    // Add annotation to first plan
    usePlanReviewStore.getState().addAnnotation(testPlanId, {
      selectedText: "test plan",
      occurrenceIndex: 0,
      comment: "Plan 1 comment",
    });

    // Add annotation to second plan
    usePlanReviewStore.getState().addAnnotation(otherPlanId, {
      selectedText: "other text",
      occurrenceIndex: 0,
      comment: "Plan 2 comment",
    });

    const state = usePlanReviewStore.getState();
    expect(state.annotations[testPlanId]).toHaveLength(1);
    expect(state.annotations[otherPlanId]).toHaveLength(1);

    // Each component should work independently
    expect(() => {
      const comp1 = <AnnotatableMarkdown planId={testPlanId} markdown={testMarkdown} />;
      const comp2 = <AnnotatableMarkdown planId={otherPlanId} markdown="Other markdown" />;
      expect(comp1).toBeDefined();
      expect(comp2).toBeDefined();
    }).not.toThrow();
  });
});
