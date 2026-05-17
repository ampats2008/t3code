"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import React from "react";
import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs";
import { ThreadId } from "@t3tools/contracts";
import type { AnnotationSide, DiffReviewAnnotation } from "../diffReviewStore";
import { useDiffReviewStore } from "../diffReviewStore";
import { DiffReviewGutterButton } from "../components/diff-review/DiffReviewGutterButton";
import { DiffReviewAnnotationRow } from "../components/diff-review/DiffReviewAnnotationRow";
import { toastManager } from "../components/ui/toast";

interface DiffReviewPanelProps {
  activeThreadId: string | null;
  renderableFiles: FileDiffMetadata[];
  fileDiffByPath: Map<string, FileDiffMetadata>;
}

interface SelectedLineRange {
  start: number;
  side?: "deletions" | "additions";
  end: number;
  endSide?: "deletions" | "additions";
}

interface FileDiffReviewProps {
  lineAnnotations: DiffLineAnnotation<string>[];
  renderAnnotation: (annotation: DiffLineAnnotation<string>) => ReactNode;
  renderGutterUtility: () => ReactNode;
  /** Merge into FileDiff options — handles the click from @pierre/diffs' own gutter button */
  onGutterUtilityClick: (range: SelectedLineRange) => void;
}

/**
 * Resolve a file path by stripping "a/" or "b/" prefix if present.
 */
function resolveFileDiffPath(fileDiff: FileDiffMetadata): string {
  const raw = fileDiff.name ?? fileDiff.prevName ?? "";
  if (raw.startsWith("a/") || raw.startsWith("b/")) {
    return raw.slice(2);
  }
  return raw;
}

/**
 * Hook that encapsulates all diff review logic for DiffPanel.
 *
 * Uses React state (not Zustand) for `activeInputKey` because the gutter
 * button is rendered inside @pierre/diffs' Shadow DOM via slots. The Shadow
 * DOM boundary causes Zustand module duplication — the store instance used
 * by slotted components can differ from the one used by the parent hook.
 * React state propagated via callback props works reliably across slots.
 */
export function useDiffReviewPanel({
  activeThreadId,
  renderableFiles,
  fileDiffByPath,
}: DiffReviewPanelProps) {
  // Local React state for tracking which annotation input is open.
  // Format: "filePath\0lineNumber\0side" or null. Uses \0 as delimiter
  // to avoid conflicts with characters in file paths (like colons).
  const [activeInputKey, setActiveInputKey] = useState<string | null>(null);

  // Zustand store — only for persisted annotations (not ephemeral UI state)
  const annotationsByThreadId = useDiffReviewStore((s) => s.annotationsByThreadId);
  const markOrphaned = useDiffReviewStore((s) => s.markOrphaned);

  // Non-orphaned annotations for the active thread
  const annotations: DiffReviewAnnotation[] = useMemo(() => {
    if (!activeThreadId) return [];
    const threadAnnotations = annotationsByThreadId[activeThreadId] ?? [];
    return threadAnnotations.filter((a) => !a.orphaned);
  }, [annotationsByThreadId, activeThreadId]);

  // Clear active input when thread changes
  useEffect(() => {
    setActiveInputKey(null);
  }, [activeThreadId]);

  // Invalidate annotations when renderableFiles change
  useEffect(() => {
    if (!activeThreadId || annotations.length === 0) return;

    const validFiles = new Set<string>();
    for (const fileDiff of renderableFiles) {
      validFiles.add(resolveFileDiffPath(fileDiff));
    }

    const orphanedIds: string[] = [];
    for (const annotation of annotations) {
      if (!validFiles.has(annotation.filePath) || !fileDiffByPath.has(annotation.filePath)) {
        orphanedIds.push(annotation.id);
      }
    }

    if (orphanedIds.length > 0) {
      markOrphaned(activeThreadId, orphanedIds);
      toastManager.add({
        title: "Review comments invalidated",
        description: `${orphanedIds.length} comment(s) are no longer valid due to code changes.`,
        type: "warning",
        data: {
          threadId: ThreadId.make(activeThreadId),
          dismissAfterVisibleMs: 5000,
        },
      });
    }
  }, [renderableFiles, activeThreadId, annotations, fileDiffByPath, markOrphaned]);

  // Callback for gutter button — sets React state directly
  const onGutterButtonClick = useCallback(
    (filePath: string, lineNumber: number, side: AnnotationSide) => {
      const key = `${filePath}\0${lineNumber}\0${side}`;
      setActiveInputKey(key);
    },
    [],
  );

  // Callback for annotation row to close input
  const onCloseInput = useCallback(() => {
    setActiveInputKey(null);
  }, []);

  // Parse activeInputKey
  const parsedInputKey = useMemo(() => {
    if (!activeInputKey) return null;
    const parts = activeInputKey.split("\0");
    if (parts.length !== 3) return null;
    const [filePath, lineStr, side] = parts;
    const lineNumber = parseInt(lineStr!, 10);
    if (Number.isNaN(lineNumber)) return null;
    if (side !== "deletions" && side !== "additions") return null;
    return { filePath: filePath!, lineNumber, side: side as AnnotationSide };
  }, [activeInputKey]);

  /**
   * Return props to spread onto a <FileDiff> for a given file path.
   */
  const getFileDiffReviewProps = useCallback(
    (filePath: string): FileDiffReviewProps => {
      const lineAnnotations: DiffLineAnnotation<string>[] = [];

      // Existing annotations for this file
      for (const annotation of annotations) {
        if (annotation.filePath === filePath) {
          lineAnnotations.push({
            side: annotation.side,
            lineNumber: annotation.lineNumber,
            metadata: annotation.id,
          });
        }
      }

      // Active input position (if for this file)
      if (parsedInputKey && parsedInputKey.filePath === filePath) {
        const hasExisting = lineAnnotations.some(
          (a) => a.side === parsedInputKey.side && a.lineNumber === parsedInputKey.lineNumber,
        );
        if (!hasExisting) {
          lineAnnotations.push({
            side: parsedInputKey.side,
            lineNumber: parsedInputKey.lineNumber,
            metadata: "__new__",
          });
        }
      }

      const renderAnnotation = (annotation: DiffLineAnnotation<string>): ReactNode => {
        const isNew = annotation.metadata === "__new__";
        return React.createElement(DiffReviewAnnotationRow, {
          key: isNew ? `new-${annotation.lineNumber}-${annotation.side}` : annotation.metadata,
          threadId: activeThreadId!,
          filePath,
          lineNumber: annotation.lineNumber,
          side: annotation.side,
          annotationId: isNew ? null : annotation.metadata,
          onClose: onCloseInput,
        });
      };

      // Visual-only gutter button — click is handled by onGutterUtilityClick
      const renderGutterUtility = (): ReactNode => {
        return React.createElement(DiffReviewGutterButton);
      };

      // Click handler — called by @pierre/diffs when the gutter utility is clicked
      const onGutterUtilityClick = (range: SelectedLineRange) => {
        const side = range.side;
        if (side !== "deletions" && side !== "additions") return;
        onGutterButtonClick(filePath, range.start, side);
      };

      return { lineAnnotations, renderAnnotation, renderGutterUtility, onGutterUtilityClick };
    },
    [annotations, parsedInputKey, activeThreadId, onGutterButtonClick, onCloseInput],
  );

  return { getFileDiffReviewProps };
}
