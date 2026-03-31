'use client';

import { useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import React from 'react';
import type { DiffLineAnnotation, FileDiffMetadata } from '@pierre/diffs';
import { ThreadId } from '@t3tools/contracts';
import type { AnnotationSide } from '../diffReviewStore';
import {
  useDiffReviewStore,
  selectNonOrphanedAnnotations,
} from '../diffReviewStore';
import { DiffReviewGutterButton } from '../components/diff-review/DiffReviewGutterButton';
import { DiffReviewAnnotationRow } from '../components/diff-review/DiffReviewAnnotationRow';
import { toastManager } from '../components/ui/toast';

interface DiffReviewPanelProps {
  activeThreadId: string | null;
  renderableFiles: FileDiffMetadata[];
  fileDiffByPath: Map<string, FileDiffMetadata>;
}

interface FileDiffReviewProps {
  lineAnnotations: DiffLineAnnotation<string>[];
  renderAnnotation: (
    annotation: DiffLineAnnotation<string>,
  ) => ReactNode;
  renderGutterUtility: (
    getHoveredLine: () =>
      | {
          lineNumber: number;
          side: AnnotationSide;
        }
      | undefined,
  ) => ReactNode;
}

/**
 * Resolve a file path by stripping "a/" or "b/" prefix if present.
 */
function resolveFileDiffPath(fileDiff: FileDiffMetadata): string {
  const raw = fileDiff.name ?? fileDiff.prevName ?? '';
  if (raw.startsWith('a/') || raw.startsWith('b/')) {
    return raw.slice(2);
  }
  return raw;
}

/**
 * Hook that encapsulates all diff review logic for DiffPanel.
 * Returns a function to get review props for a specific file path.
 */
export function useDiffReviewPanel({
  activeThreadId,
  renderableFiles,
  fileDiffByPath,
}: DiffReviewPanelProps) {
  const store = useDiffReviewStore();
  const activeInputKey = store.activeInputKey;

  // Get non-orphaned annotations for the active thread
  const annotations = useMemo(() => {
    return selectNonOrphanedAnnotations(store, activeThreadId);
  }, [store, activeThreadId]);

  /**
   * Invalidate annotations when renderableFiles change.
   * Check if any annotations now reference files/lines that no longer exist.
   */
  useEffect(() => {
    if (!activeThreadId || annotations.length === 0) {
      return;
    }

    // Build a set of valid file paths
    const validFiles = new Set<string>();
    for (const fileDiff of renderableFiles) {
      const resolvedPath = resolveFileDiffPath(fileDiff);
      validFiles.add(resolvedPath);
    }

    // Check for orphaned annotations
    const orphanedIds: string[] = [];
    for (const annotation of annotations) {
      const isFileValid = validFiles.has(annotation.filePath);
      const isDiffValid = fileDiffByPath.has(annotation.filePath);

      if (!isFileValid || !isDiffValid) {
        orphanedIds.push(annotation.id);
      }
    }

    // If we found orphaned annotations, mark them and show a toast
    if (orphanedIds.length > 0) {
      store.markOrphaned(activeThreadId, orphanedIds);
      toastManager.add({
        title: 'Review comments invalidated',
        description: `${orphanedIds.length} comment(s) are no longer valid due to code changes.`,
        type: 'warning',
        data: {
          threadId: ThreadId.makeUnsafe(activeThreadId),
          dismissAfterVisibleMs: 5000,
        },
      });
    }
  }, [renderableFiles, activeThreadId, annotations, fileDiffByPath, store]);

  /**
   * Return props to spread onto a <FileDiff> component for a given file path.
   */
  const getFileDiffReviewProps = useCallback(
    (filePath: string): FileDiffReviewProps => {
      // Build lineAnnotations array
      const lineAnnotations: DiffLineAnnotation<string>[] = [];

      // Add existing annotations for this file
      for (const annotation of annotations) {
        if (annotation.filePath === filePath) {
          lineAnnotations.push({
            side: annotation.side,
            lineNumber: annotation.lineNumber,
            metadata: annotation.id,
          });
        }
      }

      // Add the active input position if it's for this file
      if (activeInputKey) {
        const parts = activeInputKey.split(':');
        if (parts.length === 4) {
          const [threadId, keyFilePath, lineNumberStr, side] = parts as [string, string, string, string];
          if (
            threadId === activeThreadId &&
            keyFilePath === filePath &&
            (side === 'deletions' || side === 'additions')
          ) {
            const lineNumber = parseInt(lineNumberStr, 10);
            if (!Number.isNaN(lineNumber)) {
              // Check if we already have an annotation at this position
              const hasExisting = lineAnnotations.some(
                (a) =>
                  a.side === side &&
                  a.lineNumber === lineNumber,
              );
              if (!hasExisting) {
                lineAnnotations.push({
                  side: side as AnnotationSide,
                  lineNumber,
                  metadata: '__new__',
                });
              }
            }
          }
        }
      }

      // Callback to render annotations
      const renderAnnotation = (
        annotation: DiffLineAnnotation<string>,
      ): ReactNode => {
        if (annotation.metadata === '__new__') {
          // Render input mode for new annotation
          return React.createElement(DiffReviewAnnotationRow, {
            threadId: activeThreadId!,
            filePath,
            lineNumber: annotation.lineNumber,
            side: annotation.side,
            annotationId: null,
          });
        }

        // Render existing annotation
        return React.createElement(DiffReviewAnnotationRow, {
          threadId: activeThreadId!,
          filePath,
          lineNumber: annotation.lineNumber,
          side: annotation.side,
          annotationId: annotation.metadata,
        });
      };

      // Callback to render the gutter utility button
      const renderGutterUtility = (
        getHoveredLine: () =>
          | {
              lineNumber: number;
              side: AnnotationSide;
            }
          | undefined,
      ): ReactNode => {
        return React.createElement(DiffReviewGutterButton, {
          getHoveredLine,
          threadId: activeThreadId!,
          filePath,
        });
      };

      return {
        lineAnnotations,
        renderAnnotation,
        renderGutterUtility,
      };
    },
    [annotations, activeInputKey, activeThreadId],
  );

  return { getFileDiffReviewProps };
}
