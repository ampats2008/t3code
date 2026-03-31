'use client';

import {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {
  MessageSquareIcon,
  PencilIcon,
  Trash2Icon,
  AlertTriangleIcon,
} from 'lucide-react';
import {
  useDiffReviewStore,
  buildActiveInputKey,
  type AnnotationSide,
} from '../../diffReviewStore';
import { cn } from '~/lib/utils';

interface DiffReviewAnnotationRowProps {
  threadId: string;
  filePath: string;
  lineNumber: number;
  side: AnnotationSide;
  annotationId: string | null;
}

export const DiffReviewAnnotationRow = memo(
  function DiffReviewAnnotationRow({
    threadId,
    filePath,
    lineNumber,
    side,
    annotationId,
  }: DiffReviewAnnotationRowProps) {
    // Local state for input mode
    const [inputValue, setInputValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Store selectors
    const activeInputKey = useDiffReviewStore((state) => state.activeInputKey);
    const annotationsByThreadId = useDiffReviewStore(
      (state) => state.annotationsByThreadId,
    );
    const addAnnotation = useDiffReviewStore((state) => state.addAnnotation);
    const updateAnnotationText = useDiffReviewStore(
      (state) => state.updateAnnotationText,
    );
    const removeAnnotation = useDiffReviewStore(
      (state) => state.removeAnnotation,
    );
    const setActiveInputKey = useDiffReviewStore(
      (state) => state.setActiveInputKey,
    );

    // Compute the key for this annotation location
    const currentKey = buildActiveInputKey(threadId, filePath, lineNumber, side);

    // Look up the annotation if it exists
    const annotation = annotationId
      ? annotationsByThreadId[threadId]?.find((a) => a.id === annotationId)
      : null;

    // Determine which mode we're in
    const isInputMode = activeInputKey === currentKey && !annotation;
    const isDisplayMode = annotation !== null && activeInputKey !== currentKey;
    const isEditingExisting =
      activeInputKey === currentKey && annotation !== null;

    // Initialize input when entering input mode
    useEffect(() => {
      if (isInputMode || isEditingExisting) {
        setInputValue(isEditingExisting && annotation ? annotation.text : '');
        // Small delay to ensure ref is mounted
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 0);
      }
    }, [isInputMode, isEditingExisting, annotation]);

    // Handle save
    const handleSave = useCallback(() => {
      const trimmedText = inputValue.trim();
      if (!trimmedText) {
        // Don't save empty annotations
        setActiveInputKey(null);
        return;
      }

      if (isEditingExisting && annotation) {
        updateAnnotationText(threadId, annotation.id, trimmedText);
      } else {
        addAnnotation(threadId, {
          filePath,
          lineNumber,
          side,
          text: trimmedText,
        });
      }
    }, [
      inputValue,
      isEditingExisting,
      annotation,
      threadId,
      filePath,
      lineNumber,
      side,
      updateAnnotationText,
      addAnnotation,
      setActiveInputKey,
    ]);

    // Handle cancel
    const handleCancel = useCallback(() => {
      setActiveInputKey(null);
      setInputValue('');
    }, [setActiveInputKey]);

    // Handle delete
    const handleDelete = useCallback(() => {
      if (annotation) {
        removeAnnotation(threadId, annotation.id);
      }
    }, [annotation, threadId, removeAnnotation]);

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const isMac = /mac|iphone|ipad|ipod/i.test(navigator.platform);
        const isSubmitKey = isMac ? e.metaKey : e.ctrlKey;

        if (isSubmitKey && e.key === 'Enter') {
          e.preventDefault();
          handleSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      },
      [handleSave, handleCancel],
    );

    // Input mode: render textarea + buttons
    if (isInputMode || isEditingExisting) {
      return (
        <div className="border-l-2 border-l-primary/50 bg-muted/30 px-3 py-2.5 text-xs">
          <div className="mb-2 flex items-center gap-1.5 text-muted-foreground">
            <MessageSquareIcon className="size-3.5" />
            <span className="font-medium">
              {isEditingExisting ? 'Edit annotation' : 'Add annotation'}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write your comment here..."
            className={cn(
              'mb-2 w-full rounded-md border border-border bg-background px-2 py-1.5',
              'font-mono text-xs leading-relaxed placeholder-muted-foreground/50',
              'focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40',
              'resize-none',
            )}
            rows={3}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                'border border-border bg-background text-foreground hover:bg-muted',
              )}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    // Display mode: render comment + action buttons
    if (isDisplayMode && annotation) {
      return (
        <div
          className={cn(
            'border-l-2 px-3 py-2.5 text-xs',
            annotation.orphaned
              ? 'border-l-destructive/50 bg-destructive/5'
              : 'border-l-primary/50 bg-muted/30',
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MessageSquareIcon className="size-3.5" />
              {annotation.orphaned && (
                <span className="flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-destructive">
                  <AlertTriangleIcon className="size-3" />
                  <span className="font-medium">Line changed</span>
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  setActiveInputKey(currentKey);
                }}
                className={cn(
                  'rounded-md p-1 transition-colors',
                  'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                title="Edit annotation"
                aria-label="Edit annotation"
              >
                <PencilIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className={cn(
                  'rounded-md p-1 transition-colors',
                  'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                )}
                title="Delete annotation"
                aria-label="Delete annotation"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="whitespace-pre-wrap break-words leading-relaxed text-foreground">
            {annotation.text}
          </div>
        </div>
      );
    }

    // Not active, not in input mode, no annotation
    return null;
  },
);
