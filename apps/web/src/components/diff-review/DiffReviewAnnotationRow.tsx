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
  type AnnotationSide,
} from '../../diffReviewStore';
import { cn } from '~/lib/utils';

interface DiffReviewAnnotationRowProps {
  threadId: string;
  filePath: string;
  lineNumber: number;
  side: AnnotationSide;
  /** null = new annotation input mode; string = existing annotation ID */
  annotationId: string | null;
  /** Called to close the annotation input (uses parent React state) */
  onClose: () => void;
}

export const DiffReviewAnnotationRow = memo(
  function DiffReviewAnnotationRow({
    threadId,
    filePath,
    lineNumber,
    side,
    annotationId,
    onClose,
  }: DiffReviewAnnotationRowProps) {
    const [inputValue, setInputValue] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Store actions
    const annotationsByThreadId = useDiffReviewStore((s) => s.annotationsByThreadId);
    const addAnnotation = useDiffReviewStore((s) => s.addAnnotation);
    const updateAnnotationText = useDiffReviewStore((s) => s.updateAnnotationText);
    const removeAnnotation = useDiffReviewStore((s) => s.removeAnnotation);

    // Look up the annotation
    const annotation = annotationId
      ? annotationsByThreadId[threadId]?.find((a) => a.id === annotationId) ?? null
      : null;

    const isNewInput = annotationId === null;
    const isInputMode = isNewInput || isEditing;

    // Auto-focus when entering input mode
    useEffect(() => {
      if (isInputMode) {
        setInputValue(isEditing && annotation ? annotation.text : '');
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    }, [isInputMode, isEditing, annotation]);

    const handleSave = useCallback(() => {
      const trimmedText = inputValue.trim();
      if (!trimmedText) {
        if (isEditing) setIsEditing(false);
        else onClose();
        return;
      }
      if (isEditing && annotation) {
        updateAnnotationText(threadId, annotation.id, trimmedText);
        setIsEditing(false);
      } else {
        addAnnotation(threadId, { filePath, lineNumber, side, text: trimmedText });
        onClose();
      }
    }, [inputValue, isEditing, annotation, threadId, filePath, lineNumber, side, updateAnnotationText, addAnnotation, onClose]);

    const handleCancel = useCallback(() => {
      if (isEditing) setIsEditing(false);
      else onClose();
      setInputValue('');
    }, [isEditing, onClose]);

    const handleDelete = useCallback(() => {
      if (annotation) removeAnnotation(threadId, annotation.id);
    }, [annotation, threadId, removeAnnotation]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const isMac = /mac|iphone|ipad|ipod/i.test(navigator.platform);
        if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          handleSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      },
      [handleSave, handleCancel],
    );

    if (isInputMode) {
      return (
        <div className="border-l-2 border-l-primary/50 bg-muted/30 px-3 py-2.5 text-xs">
          <div className="mb-2 flex items-center gap-1.5 text-muted-foreground">
            <MessageSquareIcon className="size-3.5" />
            <span className="font-medium">
              {isEditing ? 'Edit annotation' : 'Add annotation'}
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

    if (annotation) {
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
                onClick={() => setIsEditing(true)}
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

    return null;
  },
);
