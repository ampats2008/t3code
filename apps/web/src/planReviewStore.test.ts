import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type PlanAnnotation, usePlanReviewStore } from "./planReviewStore";

function makeAnnotation(input: {
  selectedText: string;
  occurrenceIndex: number;
  comment: string;
}): Omit<PlanAnnotation, "id" | "createdAt" | "updatedAt"> {
  return {
    selectedText: input.selectedText,
    occurrenceIndex: input.occurrenceIndex,
    comment: input.comment,
  };
}

function resetPlanReviewStore() {
  usePlanReviewStore.setState({
    annotations: {},
    editedMarkdown: {},
    activeAnnotationId: null,
  });
}

describe("planReviewStore addAnnotation", () => {
  beforeEach(() => {
    resetPlanReviewStore();
  });

  it("adds to empty plan", () => {
    const planId = "plan-1";
    const annotation = makeAnnotation({
      selectedText: "test text",
      occurrenceIndex: 0,
      comment: "this is a comment",
    });

    usePlanReviewStore.getState().addAnnotation(planId, annotation);

    const state = usePlanReviewStore.getState();
    expect(state.annotations[planId]).toHaveLength(1);
    expect(state.annotations[planId]?.[0]).toMatchObject({
      selectedText: "test text",
      occurrenceIndex: 0,
      comment: "this is a comment",
    });
  });

  it("adds multiple to same plan", () => {
    const planId = "plan-1";
    const ann1 = makeAnnotation({
      selectedText: "text 1",
      occurrenceIndex: 0,
      comment: "comment 1",
    });
    const ann2 = makeAnnotation({
      selectedText: "text 2",
      occurrenceIndex: 1,
      comment: "comment 2",
    });

    usePlanReviewStore.getState().addAnnotation(planId, ann1);
    usePlanReviewStore.getState().addAnnotation(planId, ann2);

    const state = usePlanReviewStore.getState();
    expect(state.annotations[planId]).toHaveLength(2);
    expect(state.annotations[planId]?.[0]?.selectedText).toBe("text 1");
    expect(state.annotations[planId]?.[1]?.selectedText).toBe("text 2");
  });

  it("generates unique ids", () => {
    const planId = "plan-1";
    const annotation = makeAnnotation({
      selectedText: "test",
      occurrenceIndex: 0,
      comment: "comment",
    });

    usePlanReviewStore.getState().addAnnotation(planId, annotation);
    usePlanReviewStore.getState().addAnnotation(planId, annotation);

    const state = usePlanReviewStore.getState();
    const id1 = state.annotations[planId]?.[0]?.id;
    const id2 = state.annotations[planId]?.[1]?.id;
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  it("sets timestamps", () => {
    const planId = "plan-1";
    const annotation = makeAnnotation({
      selectedText: "test",
      occurrenceIndex: 0,
      comment: "comment",
    });

    const beforeAdd = new Date();
    usePlanReviewStore.getState().addAnnotation(planId, annotation);
    const afterAdd = new Date();

    const state = usePlanReviewStore.getState();
    const added = state.annotations[planId]?.[0];
    expect(added?.createdAt).toBeDefined();
    expect(added?.updatedAt).toBeDefined();

    const createdMs = new Date(added?.createdAt ?? "").getTime();
    const updatedMs = new Date(added?.updatedAt ?? "").getTime();
    expect(createdMs).toBeGreaterThanOrEqual(beforeAdd.getTime());
    expect(createdMs).toBeLessThanOrEqual(afterAdd.getTime());
    expect(updatedMs).toBe(createdMs);
  });
});

describe("planReviewStore updateAnnotationComment", () => {
  beforeEach(() => {
    resetPlanReviewStore();
  });

  it("updates comment", () => {
    const planId = "plan-1";
    const annotation = makeAnnotation({
      selectedText: "test",
      occurrenceIndex: 0,
      comment: "old comment",
    });

    usePlanReviewStore.getState().addAnnotation(planId, annotation);
    const annotationId = usePlanReviewStore.getState().annotations[planId]?.[0]?.id;

    usePlanReviewStore.getState().updateAnnotationComment(planId, annotationId!, "new comment");

    const state = usePlanReviewStore.getState();
    expect(state.annotations[planId]?.[0]?.comment).toBe("new comment");
  });

  it("updates updatedAt", () => {
    vi.useFakeTimers();
    try {
      const planId = "plan-1";
      const annotation = makeAnnotation({
        selectedText: "test",
        occurrenceIndex: 0,
        comment: "comment",
      });

      usePlanReviewStore.getState().addAnnotation(planId, annotation);
      const annotationId = usePlanReviewStore.getState().annotations[planId]?.[0]?.id;
      const originalUpdatedAt = usePlanReviewStore.getState().annotations[planId]?.[0]?.updatedAt;

      // Advance the clock to ensure timestamps differ
      vi.advanceTimersByTime(100);

      usePlanReviewStore.getState().updateAnnotationComment(planId, annotationId!, "new comment");

      const state = usePlanReviewStore.getState();
      const newUpdatedAt = state.annotations[planId]?.[0]?.updatedAt;
      expect(newUpdatedAt).not.toBe(originalUpdatedAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no-ops for nonexistent id", () => {
    const planId = "plan-1";
    const annotation = makeAnnotation({
      selectedText: "test",
      occurrenceIndex: 0,
      comment: "comment",
    });

    usePlanReviewStore.getState().addAnnotation(planId, annotation);
    const originalState = usePlanReviewStore.getState().annotations[planId];

    usePlanReviewStore.getState().updateAnnotationComment(planId, "nonexistent-id", "new");

    const state = usePlanReviewStore.getState();
    expect(state.annotations[planId]).toEqual(originalState);
  });
});

describe("planReviewStore deleteAnnotation", () => {
  beforeEach(() => {
    resetPlanReviewStore();
  });

  it("removes by id", () => {
    const planId = "plan-1";
    const annotation = makeAnnotation({
      selectedText: "test",
      occurrenceIndex: 0,
      comment: "comment",
    });

    usePlanReviewStore.getState().addAnnotation(planId, annotation);
    const annotationId = usePlanReviewStore.getState().annotations[planId]?.[0]?.id;

    usePlanReviewStore.getState().deleteAnnotation(planId, annotationId!);

    const state = usePlanReviewStore.getState();
    expect(state.annotations[planId]).toHaveLength(0);
  });

  it("no-ops for nonexistent", () => {
    const planId = "plan-1";
    const annotation = makeAnnotation({
      selectedText: "test",
      occurrenceIndex: 0,
      comment: "comment",
    });

    usePlanReviewStore.getState().addAnnotation(planId, annotation);
    const originalState = usePlanReviewStore.getState().annotations[planId];

    usePlanReviewStore.getState().deleteAnnotation(planId, "nonexistent-id");

    const state = usePlanReviewStore.getState();
    expect(state.annotations[planId]).toEqual(originalState);
  });

  it("leaves others intact", () => {
    const planId = "plan-1";
    const ann1 = makeAnnotation({
      selectedText: "text 1",
      occurrenceIndex: 0,
      comment: "comment 1",
    });
    const ann2 = makeAnnotation({
      selectedText: "text 2",
      occurrenceIndex: 1,
      comment: "comment 2",
    });

    usePlanReviewStore.getState().addAnnotation(planId, ann1);
    usePlanReviewStore.getState().addAnnotation(planId, ann2);
    const id1 = usePlanReviewStore.getState().annotations[planId]?.[0]?.id;

    usePlanReviewStore.getState().deleteAnnotation(planId, id1!);

    const state = usePlanReviewStore.getState();
    expect(state.annotations[planId]).toHaveLength(1);
    expect(state.annotations[planId]?.[0]?.selectedText).toBe("text 2");
  });
});

describe("planReviewStore clearAnnotations", () => {
  beforeEach(() => {
    resetPlanReviewStore();
  });

  it("clears for planId", () => {
    const planId = "plan-1";
    const annotation = makeAnnotation({
      selectedText: "test",
      occurrenceIndex: 0,
      comment: "comment",
    });

    usePlanReviewStore.getState().addAnnotation(planId, annotation);
    usePlanReviewStore.getState().clearAnnotations(planId);

    const state = usePlanReviewStore.getState();
    expect(state.annotations[planId]).toBeUndefined();
  });

  it("doesn't affect other planIds", () => {
    const planId1 = "plan-1";
    const planId2 = "plan-2";
    const annotation = makeAnnotation({
      selectedText: "test",
      occurrenceIndex: 0,
      comment: "comment",
    });

    usePlanReviewStore.getState().addAnnotation(planId1, annotation);
    usePlanReviewStore.getState().addAnnotation(planId2, annotation);
    usePlanReviewStore.getState().clearAnnotations(planId1);

    const state = usePlanReviewStore.getState();
    expect(state.annotations[planId1]).toBeUndefined();
    expect(state.annotations[planId2]).toHaveLength(1);
  });
});

describe("planReviewStore setEditedMarkdown", () => {
  beforeEach(() => {
    resetPlanReviewStore();
  });

  it("stores keyed by planId", () => {
    const planId = "plan-1";
    const markdown = "# Edited Plan\n\nSome changes";

    usePlanReviewStore.getState().setEditedMarkdown(planId, markdown);

    const state = usePlanReviewStore.getState();
    expect(state.editedMarkdown[planId]).toBe(markdown);
  });

  it("overwrites previous", () => {
    const planId = "plan-1";
    const markdown1 = "# First";
    const markdown2 = "# Second";

    usePlanReviewStore.getState().setEditedMarkdown(planId, markdown1);
    usePlanReviewStore.getState().setEditedMarkdown(planId, markdown2);

    const state = usePlanReviewStore.getState();
    expect(state.editedMarkdown[planId]).toBe(markdown2);
  });
});

describe("planReviewStore clearEditedMarkdown", () => {
  beforeEach(() => {
    resetPlanReviewStore();
  });

  it("removes for planId", () => {
    const planId = "plan-1";
    const markdown = "# Plan";

    usePlanReviewStore.getState().setEditedMarkdown(planId, markdown);
    usePlanReviewStore.getState().clearEditedMarkdown(planId);

    const state = usePlanReviewStore.getState();
    expect(state.editedMarkdown[planId]).toBeUndefined();
  });
});

describe("planReviewStore setActiveAnnotationId", () => {
  beforeEach(() => {
    resetPlanReviewStore();
  });

  it("sets id", () => {
    const id = "annotation-123";

    usePlanReviewStore.getState().setActiveAnnotationId(id);

    const state = usePlanReviewStore.getState();
    expect(state.activeAnnotationId).toBe(id);
  });

  it("sets null", () => {
    usePlanReviewStore.getState().setActiveAnnotationId("annotation-123");
    usePlanReviewStore.getState().setActiveAnnotationId(null);

    const state = usePlanReviewStore.getState();
    expect(state.activeAnnotationId).toBeNull();
  });
});
