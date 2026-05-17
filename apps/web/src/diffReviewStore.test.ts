import { beforeEach, describe, expect, it } from "vitest";

import {
  useDiffReviewStore,
  buildActiveInputKey,
  selectAnnotationsForThread,
  selectNonOrphanedAnnotations,
} from "./diffReviewStore";

describe("diffReviewStore", () => {
  beforeEach(() => {
    useDiffReviewStore.getState().clearAnnotations("thread-1");
    useDiffReviewStore.getState().clearAnnotations("thread-2");
    useDiffReviewStore.getState().clearAnnotations("thread-3");
  });

  describe("addAnnotation", () => {
    it("adds an annotation to an empty thread", () => {
      useDiffReviewStore.getState().addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "This is a comment",
      });

      const state = useDiffReviewStore.getState();
      const annotations = state.annotationsByThreadId["thread-1"];
      expect(annotations).toBeDefined();
      expect(annotations).toHaveLength(1);
      expect(annotations![0]!.text).toBe("This is a comment");
      expect(annotations![0]!.filePath).toBe("src/index.ts");
      expect(annotations![0]!.lineNumber).toBe(42);
      expect(annotations![0]!.side).toBe("additions");
      expect(annotations![0]!.threadId).toBe("thread-1");
    });

    it("adds multiple annotations to the same thread", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "First comment",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Second comment",
      });

      const state = useDiffReviewStore.getState();
      const annotations = state.annotationsByThreadId["thread-1"];
      expect(annotations).toBeDefined();
      expect(annotations).toHaveLength(2);
      expect(annotations![0]!.text).toBe("First comment");
      expect(annotations![1]!.text).toBe("Second comment");
    });

    it("auto-generates id and createdAt", () => {
      useDiffReviewStore.getState().addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Comment",
      });

      const state = useDiffReviewStore.getState();
      const annotation = state.annotationsByThreadId["thread-1"]?.[0];
      expect(annotation).toBeDefined();
      expect(annotation!.id).toBeTruthy();
      expect(typeof annotation!.id).toBe("string");
      expect(annotation!.id.length).toBeGreaterThan(0);
      expect(annotation!.createdAt).toBeTruthy();
      expect(typeof annotation!.createdAt).toBe("string");
      // Check that createdAt is a valid ISO string
      expect(new Date(annotation!.createdAt).toISOString()).toBe(annotation!.createdAt);
    });

    it("sets orphaned to false", () => {
      useDiffReviewStore.getState().addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Comment",
      });

      const state = useDiffReviewStore.getState();
      const annotation = state.annotationsByThreadId["thread-1"]?.[0];
      expect(annotation).toBeDefined();
      expect(annotation!.orphaned).toBe(false);
    });

    it("clears activeInputKey after adding", () => {
      const store = useDiffReviewStore.getState();
      store.setActiveInputKey("thread-1:src/index.ts:42:additions");
      expect(useDiffReviewStore.getState().activeInputKey).toBe(
        "thread-1:src/index.ts:42:additions",
      );

      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Comment",
      });

      expect(useDiffReviewStore.getState().activeInputKey).toBeNull();
    });
  });

  describe("updateAnnotationText", () => {
    it("updates text of an existing annotation", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Original text",
      });

      const annotationId = useDiffReviewStore.getState().annotationsByThreadId["thread-1"]?.[0]?.id;
      expect(annotationId).toBeDefined();
      store.updateAnnotationText("thread-1", annotationId!, "Updated text");

      const state = useDiffReviewStore.getState();
      const annotation = state.annotationsByThreadId["thread-1"]?.[0];
      expect(annotation).toBeDefined();
      expect(annotation!.text).toBe("Updated text");
    });

    it("is a no-op when threadId does not exist", () => {
      const stateBefore = useDiffReviewStore.getState();
      stateBefore.updateAnnotationText("nonexistent-thread", "some-id", "New text");
      const stateAfter = useDiffReviewStore.getState();

      expect(stateAfter.annotationsByThreadId).toEqual(stateBefore.annotationsByThreadId);
    });

    it("is a no-op when annotationId does not exist", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Original text",
      });

      const stateBefore = useDiffReviewStore.getState();
      store.updateAnnotationText("thread-1", "nonexistent-id", "New text");
      const stateAfter = useDiffReviewStore.getState();

      // The annotation text should not change
      expect(stateAfter.annotationsByThreadId["thread-1"]?.[0]?.text).toBe("Original text");
    });

    it("does not affect other annotations", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "First annotation",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Second annotation",
      });

      const firstId = useDiffReviewStore.getState().annotationsByThreadId["thread-1"]?.[0]?.id;
      expect(firstId).toBeDefined();
      store.updateAnnotationText("thread-1", firstId!, "Updated first");

      const state = useDiffReviewStore.getState();
      expect(state.annotationsByThreadId["thread-1"]?.[0]?.text).toBe("Updated first");
      expect(state.annotationsByThreadId["thread-1"]?.[1]?.text).toBe("Second annotation");
    });
  });

  describe("removeAnnotation", () => {
    it("removes a specific annotation", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Annotation to remove",
      });

      const annotationId = useDiffReviewStore.getState().annotationsByThreadId["thread-1"]?.[0]?.id;
      expect(annotationId).toBeDefined();
      store.removeAnnotation("thread-1", annotationId!);

      const state = useDiffReviewStore.getState();
      expect(state.annotationsByThreadId["thread-1"]).toHaveLength(0);
    });

    it("does not affect other annotations in the same thread", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "First annotation",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Second annotation",
      });

      const firstId = useDiffReviewStore.getState().annotationsByThreadId["thread-1"]?.[0]?.id;
      expect(firstId).toBeDefined();
      store.removeAnnotation("thread-1", firstId!);

      const state = useDiffReviewStore.getState();
      expect(state.annotationsByThreadId["thread-1"]).toHaveLength(1);
      expect(state.annotationsByThreadId["thread-1"]?.[0]?.text).toBe("Second annotation");
    });

    it("is a no-op when threadId does not exist", () => {
      const stateBefore = useDiffReviewStore.getState();
      stateBefore.removeAnnotation("nonexistent-thread", "some-id");
      const stateAfter = useDiffReviewStore.getState();

      expect(stateAfter.annotationsByThreadId).toEqual(stateBefore.annotationsByThreadId);
    });
  });

  describe("clearAnnotations", () => {
    it("clears all annotations for a thread", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "First annotation",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Second annotation",
      });

      store.clearAnnotations("thread-1");

      const state = useDiffReviewStore.getState();
      expect(state.annotationsByThreadId["thread-1"]).toBeUndefined();
    });

    it("does not affect other threads", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Annotation in thread-1",
      });
      store.addAnnotation("thread-2", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Annotation in thread-2",
      });

      store.clearAnnotations("thread-1");

      const state = useDiffReviewStore.getState();
      expect(state.annotationsByThreadId["thread-1"]).toBeUndefined();
      expect(state.annotationsByThreadId["thread-2"]).toHaveLength(1);
      expect(state.annotationsByThreadId["thread-2"]?.[0]?.text).toBe("Annotation in thread-2");
    });

    it("resets activeInputKey to null", () => {
      const store = useDiffReviewStore.getState();
      store.setActiveInputKey("thread-1:src/index.ts:42:additions");
      expect(useDiffReviewStore.getState().activeInputKey).toBe(
        "thread-1:src/index.ts:42:additions",
      );

      store.clearAnnotations("thread-1");

      expect(useDiffReviewStore.getState().activeInputKey).toBeNull();
    });
  });

  describe("setActiveInputKey", () => {
    it("sets the active input key", () => {
      const store = useDiffReviewStore.getState();
      store.setActiveInputKey("thread-1:src/index.ts:42:additions");

      expect(useDiffReviewStore.getState().activeInputKey).toBe(
        "thread-1:src/index.ts:42:additions",
      );
    });

    it("can be set to null", () => {
      const store = useDiffReviewStore.getState();
      store.setActiveInputKey("thread-1:src/index.ts:42:additions");
      store.setActiveInputKey(null);

      expect(useDiffReviewStore.getState().activeInputKey).toBeNull();
    });
  });

  describe("markOrphaned", () => {
    it("marks specified annotations as orphaned", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Annotation 1",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Annotation 2",
      });

      const annotations = useDiffReviewStore.getState().annotationsByThreadId["thread-1"];
      expect(annotations).toBeDefined();
      const ids = annotations!.map((a) => a.id);

      store.markOrphaned("thread-1", [ids[0]!]);

      const state = useDiffReviewStore.getState();
      expect(state.annotationsByThreadId["thread-1"]?.[0]?.orphaned).toBe(true);
      expect(state.annotationsByThreadId["thread-1"]?.[1]?.orphaned).toBe(false);
    });

    it("does not affect non-specified annotations", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Annotation 1",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Annotation 2",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 60,
        side: "additions",
        text: "Annotation 3",
      });

      const annotations = useDiffReviewStore.getState().annotationsByThreadId["thread-1"];
      expect(annotations).toBeDefined();
      const ids = annotations!.map((a) => a.id);

      store.markOrphaned("thread-1", [ids[0]!]);

      const state = useDiffReviewStore.getState();
      expect(state.annotationsByThreadId["thread-1"]?.[0]?.orphaned).toBe(true);
      expect(state.annotationsByThreadId["thread-1"]?.[1]?.orphaned).toBe(false);
      expect(state.annotationsByThreadId["thread-1"]?.[2]?.orphaned).toBe(false);
    });

    it("is a no-op when threadId does not exist", () => {
      const stateBefore = useDiffReviewStore.getState();
      stateBefore.markOrphaned("nonexistent-thread", ["some-id"]);
      const stateAfter = useDiffReviewStore.getState();

      expect(stateAfter.annotationsByThreadId).toEqual(stateBefore.annotationsByThreadId);
    });
  });

  describe("removeOrphaned", () => {
    it("removes only orphaned annotations", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Annotation 1",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Annotation 2",
      });

      const annotations = useDiffReviewStore.getState().annotationsByThreadId["thread-1"];
      expect(annotations).toBeDefined();
      const ids = annotations!.map((a) => a.id);

      store.markOrphaned("thread-1", [ids[0]!]);
      store.removeOrphaned("thread-1");

      const state = useDiffReviewStore.getState();
      expect(state.annotationsByThreadId["thread-1"]).toHaveLength(1);
      expect(state.annotationsByThreadId["thread-1"]?.[0]?.text).toBe("Annotation 2");
    });

    it("keeps non-orphaned annotations", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Keep this",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Remove this",
      });

      const annotations = useDiffReviewStore.getState().annotationsByThreadId["thread-1"];
      expect(annotations).toBeDefined();
      const ids = annotations!.map((a) => a.id);

      store.markOrphaned("thread-1", [ids[1]!]);
      store.removeOrphaned("thread-1");

      const state = useDiffReviewStore.getState();
      expect(state.annotationsByThreadId["thread-1"]).toHaveLength(1);
      expect(state.annotationsByThreadId["thread-1"]?.[0]?.text).toBe("Keep this");
      expect(state.annotationsByThreadId["thread-1"]?.[0]?.orphaned).toBe(false);
    });

    it("is a no-op when threadId does not exist", () => {
      const stateBefore = useDiffReviewStore.getState();
      stateBefore.removeOrphaned("nonexistent-thread");
      const stateAfter = useDiffReviewStore.getState();

      expect(stateAfter.annotationsByThreadId).toEqual(stateBefore.annotationsByThreadId);
    });
  });

  describe("selectAnnotationsForThread", () => {
    it("returns empty array for null threadId", () => {
      const state = useDiffReviewStore.getState();
      const result = selectAnnotationsForThread(state, null);

      expect(result).toEqual([]);
    });

    it("returns empty array for missing threadId", () => {
      const state = useDiffReviewStore.getState();
      const result = selectAnnotationsForThread(state, "nonexistent-thread");

      expect(result).toEqual([]);
    });

    it("returns annotations for valid threadId", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Annotation 1",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Annotation 2",
      });

      const state = useDiffReviewStore.getState();
      const result = selectAnnotationsForThread(state, "thread-1");

      expect(result).toHaveLength(2);
      expect(result[0]?.text).toBe("Annotation 1");
      expect(result[1]?.text).toBe("Annotation 2");
    });
  });

  describe("selectNonOrphanedAnnotations", () => {
    it("filters out orphaned annotations", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Keep this",
      });
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 50,
        side: "deletions",
        text: "Mark as orphaned",
      });

      const annotations = useDiffReviewStore.getState().annotationsByThreadId["thread-1"];
      expect(annotations).toBeDefined();
      const ids = annotations!.map((a) => a.id);

      store.markOrphaned("thread-1", [ids[1]!]);

      const state = useDiffReviewStore.getState();
      const result = selectNonOrphanedAnnotations(state, "thread-1");

      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe("Keep this");
      expect(result[0]?.orphaned).toBe(false);
    });

    it("returns empty array for null threadId", () => {
      const state = useDiffReviewStore.getState();
      const result = selectNonOrphanedAnnotations(state, null);

      expect(result).toEqual([]);
    });

    it("returns empty array when all annotations are orphaned", () => {
      const store = useDiffReviewStore.getState();
      store.addAnnotation("thread-1", {
        filePath: "src/index.ts",
        lineNumber: 42,
        side: "additions",
        text: "Annotation",
      });

      const annotations = useDiffReviewStore.getState().annotationsByThreadId["thread-1"];
      expect(annotations).toBeDefined();
      const ids = annotations!.map((a) => a.id);

      store.markOrphaned("thread-1", [ids[0]!]);

      const state = useDiffReviewStore.getState();
      const result = selectNonOrphanedAnnotations(state, "thread-1");

      expect(result).toEqual([]);
    });
  });

  describe("buildActiveInputKey", () => {
    it("builds the expected key format", () => {
      const key = buildActiveInputKey("thread-1", "src/index.ts", 42, "additions");

      expect(key).toBe("thread-1:src/index.ts:42:additions");
    });

    it("works with different side values", () => {
      const keyAdditions = buildActiveInputKey("thread-1", "src/file.ts", 10, "additions");
      const keyDeletions = buildActiveInputKey("thread-1", "src/file.ts", 10, "deletions");

      expect(keyAdditions).toBe("thread-1:src/file.ts:10:additions");
      expect(keyDeletions).toBe("thread-1:src/file.ts:10:deletions");
    });

    it("works with different file paths", () => {
      const key1 = buildActiveInputKey("thread-1", "src/utils/helper.ts", 5, "additions");
      const key2 = buildActiveInputKey("thread-1", "packages/core/index.ts", 20, "deletions");

      expect(key1).toBe("thread-1:src/utils/helper.ts:5:additions");
      expect(key2).toBe("thread-1:packages/core/index.ts:20:deletions");
    });
  });
});
