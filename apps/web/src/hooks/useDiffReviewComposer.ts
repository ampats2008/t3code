import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useDiffReviewStore,
  selectNonOrphanedAnnotations,
} from "../diffReviewStore";
import { buildDiffReviewSubmissionPrompt } from "../diffReview";

interface UseDiffReviewComposerOptions {
  activeThreadId: string | null;
  latestTurnSettled: boolean;
  pendingUserInputsCount: number;
  isComposerApprovalState: boolean;
}

interface DiffReviewComposerResult {
  /** Whether the review banner and submit button should be visible */
  showDiffReviewPrompt: boolean;
  /** Count of non-orphaned annotations (for banner display) */
  nonOrphanedAnnotationCount: number;
  /** Placeholder text for the composer when review mode is active */
  reviewComposerPlaceholder: string;
  /** Build the review submission message from annotations + optional draft text */
  buildReviewMessage: (draftText: string) => string;
  /** Clear all annotations for the active thread (call after successful submit) */
  clearAfterSubmit: () => void;
}

export function useDiffReviewComposer(
  options: UseDiffReviewComposerOptions,
): DiffReviewComposerResult {
  const {
    activeThreadId,
    latestTurnSettled,
    pendingUserInputsCount,
    isComposerApprovalState,
  } = options;

  const nonOrphanedAnnotations = useDiffReviewStore(
    useShallow((state) => selectNonOrphanedAnnotations(state, activeThreadId)),
  );
  const clearAnnotations = useDiffReviewStore((state) => state.clearAnnotations);

  const hasReviewAnnotations = nonOrphanedAnnotations.length > 0;

  const showDiffReviewPrompt =
    hasReviewAnnotations &&
    latestTurnSettled &&
    pendingUserInputsCount === 0 &&
    !isComposerApprovalState;

  const nonOrphanedAnnotationCount = nonOrphanedAnnotations.length;

  const reviewComposerPlaceholder =
    "Add general feedback with your review, or leave blank to submit annotations only";

  const buildReviewMessage = useCallback(
    (draftText: string): string => {
      return buildDiffReviewSubmissionPrompt(nonOrphanedAnnotations, draftText);
    },
    [nonOrphanedAnnotations],
  );

  const clearAfterSubmit = useCallback(() => {
    if (activeThreadId) {
      clearAnnotations(activeThreadId);
    }
  }, [activeThreadId, clearAnnotations]);

  return useMemo(
    () => ({
      showDiffReviewPrompt,
      nonOrphanedAnnotationCount,
      reviewComposerPlaceholder,
      buildReviewMessage,
      clearAfterSubmit,
    }),
    [
      showDiffReviewPrompt,
      nonOrphanedAnnotationCount,
      reviewComposerPlaceholder,
      buildReviewMessage,
      clearAfterSubmit,
    ],
  );
}
