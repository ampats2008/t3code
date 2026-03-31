import { create } from "zustand";

// ── Interfaces ────────────────────────────────────────────────────────────

export interface PlanAnnotation {
  id: string;
  selectedText: string;
  occurrenceIndex: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanReviewState {
  annotations: Record<string, PlanAnnotation[]>;
  editedMarkdown: Record<string, string>;
  activeAnnotationId: string | null;

  // Actions
  addAnnotation: (
    planId: string,
    annotation: Omit<PlanAnnotation, "id" | "createdAt" | "updatedAt">,
  ) => void;
  updateAnnotationComment: (planId: string, annotationId: string, comment: string) => void;
  deleteAnnotation: (planId: string, annotationId: string) => void;
  clearAnnotations: (planId: string) => void;
  setEditedMarkdown: (planId: string, markdown: string) => void;
  clearEditedMarkdown: (planId: string) => void;
  setActiveAnnotationId: (id: string | null) => void;
}

// ── Store ─────────────────────────────────────────────────────────────────

export const usePlanReviewStore = create<PlanReviewState>((set) => ({
  annotations: {},
  editedMarkdown: {},
  activeAnnotationId: null,

  addAnnotation: (planId, annotation) =>
    set((state) => {
      const now = new Date().toISOString();
      const newAnnotation: PlanAnnotation = {
        ...annotation,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };

      return {
        annotations: {
          ...state.annotations,
          [planId]: [...(state.annotations[planId] ?? []), newAnnotation],
        },
      };
    }),

  updateAnnotationComment: (planId, annotationId, comment) =>
    set((state) => {
      const planAnnotations = state.annotations[planId];
      if (!planAnnotations) return state;

      const found = planAnnotations.some((ann) => ann.id === annotationId);
      if (!found) return state;

      return {
        annotations: {
          ...state.annotations,
          [planId]: planAnnotations.map((ann) =>
            ann.id === annotationId
              ? { ...ann, comment, updatedAt: new Date().toISOString() }
              : ann,
          ),
        },
      };
    }),

  deleteAnnotation: (planId, annotationId) =>
    set((state) => {
      const planAnnotations = state.annotations[planId];
      if (!planAnnotations) return state;

      const filtered = planAnnotations.filter((ann) => ann.id !== annotationId);
      if (filtered.length === planAnnotations.length) return state; // No change

      return {
        annotations: {
          ...state.annotations,
          [planId]: filtered,
        },
      };
    }),

  clearAnnotations: (planId) =>
    set((state) => {
      if (!(planId in state.annotations)) return state;

      const { [planId]: _, ...rest } = state.annotations;
      return {
        annotations: rest,
      };
    }),

  setEditedMarkdown: (planId, markdown) =>
    set((state) => ({
      editedMarkdown: {
        ...state.editedMarkdown,
        [planId]: markdown,
      },
    })),

  clearEditedMarkdown: (planId) =>
    set((state) => {
      if (!(planId in state.editedMarkdown)) return state;

      const { [planId]: _, ...rest } = state.editedMarkdown;
      return {
        editedMarkdown: rest,
      };
    }),

  setActiveAnnotationId: (id) =>
    set(() => ({
      activeAnnotationId: id,
    })),
}));
