import { create } from "zustand";

// Re-export the annotation side type to match @pierre/diffs
export type AnnotationSide = "deletions" | "additions";

export interface DiffReviewAnnotation {
  id: string;
  threadId: string;
  filePath: string;
  lineNumber: number;
  side: AnnotationSide;
  text: string;
  createdAt: string;
  orphaned: boolean;
}

interface DiffReviewState {
  /** All annotations indexed by threadId */
  annotationsByThreadId: Record<string, DiffReviewAnnotation[]>;
  /** Which annotation input is currently open — "threadId:filePath:lineNumber:side", or null */
  activeInputKey: string | null;
}

interface DiffReviewActions {
  addAnnotation(
    threadId: string,
    annotation: Omit<DiffReviewAnnotation, "id" | "createdAt" | "orphaned" | "threadId">,
  ): void;
  updateAnnotationText(threadId: string, annotationId: string, text: string): void;
  removeAnnotation(threadId: string, annotationId: string): void;
  clearAnnotations(threadId: string): void;
  setActiveInputKey(key: string | null): void;
  markOrphaned(threadId: string, annotationIds: string[]): void;
  removeOrphaned(threadId: string): void;
}

export type DiffReviewStore = DiffReviewState & DiffReviewActions;

export const useDiffReviewStore = create<DiffReviewStore>((set) => ({
  annotationsByThreadId: {},
  activeInputKey: null,

  addAnnotation: (threadId, annotation) =>
    set((state) => {
      const existing = state.annotationsByThreadId[threadId] ?? [];
      const newAnnotation: DiffReviewAnnotation = {
        ...annotation,
        threadId,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        orphaned: false,
      };
      return {
        annotationsByThreadId: {
          ...state.annotationsByThreadId,
          [threadId]: [...existing, newAnnotation],
        },
        activeInputKey: null,
      };
    }),

  updateAnnotationText: (threadId, annotationId, text) =>
    set((state) => {
      const existing = state.annotationsByThreadId[threadId];
      if (!existing) return state;
      // oxlint-disable-next-line no-map-spread
      const updated = existing.map((a) => {
        if (a.id === annotationId) {
          return { ...a, text };
        }
        return a;
      });
      return {
        annotationsByThreadId: {
          ...state.annotationsByThreadId,
          [threadId]: updated,
        },
      };
    }),

  removeAnnotation: (threadId, annotationId) =>
    set((state) => {
      const existing = state.annotationsByThreadId[threadId];
      if (!existing) return state;
      const filtered = existing.filter((a) => a.id !== annotationId);
      return {
        annotationsByThreadId: {
          ...state.annotationsByThreadId,
          [threadId]: filtered,
        },
      };
    }),

  clearAnnotations: (threadId) =>
    set((state) => {
      const { [threadId]: _, ...rest } = state.annotationsByThreadId;
      return {
        annotationsByThreadId: rest,
        activeInputKey: null,
      };
    }),

  setActiveInputKey: (key) => set({ activeInputKey: key }),

  markOrphaned: (threadId, annotationIds) =>
    set((state) => {
      const existing = state.annotationsByThreadId[threadId];
      if (!existing) return state;
      const idSet = new Set(annotationIds);
      // oxlint-disable-next-line no-map-spread
      const updated = existing.map((a) => {
        if (idSet.has(a.id)) {
          return { ...a, orphaned: true };
        }
        return a;
      });
      return {
        annotationsByThreadId: {
          ...state.annotationsByThreadId,
          [threadId]: updated,
        },
      };
    }),

  removeOrphaned: (threadId) =>
    set((state) => {
      const existing = state.annotationsByThreadId[threadId];
      if (!existing) return state;
      return {
        annotationsByThreadId: {
          ...state.annotationsByThreadId,
          [threadId]: existing.filter((a) => !a.orphaned),
        },
      };
    }),
}));

// -- Selectors --

export function selectAnnotationsForThread(
  state: DiffReviewState,
  threadId: string | null,
): DiffReviewAnnotation[] {
  if (!threadId) return [];
  return state.annotationsByThreadId[threadId] ?? [];
}

export function selectNonOrphanedAnnotations(
  state: DiffReviewState,
  threadId: string | null,
): DiffReviewAnnotation[] {
  return selectAnnotationsForThread(state, threadId).filter((a) => !a.orphaned);
}

export function buildActiveInputKey(
  threadId: string,
  filePath: string,
  lineNumber: number,
  side: AnnotationSide,
): string {
  return `${threadId}:${filePath}:${lineNumber}:${side}`;
}
