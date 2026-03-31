"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup } from "~/components/ui/popover";

export interface AnnotationPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: Element | null;
  selectedText: string;
  initialComment?: string;
  isEditing: boolean;
  onSave: (comment: string) => void;
  onDelete?: (() => void) | undefined;
  onCancel: () => void;
}

// Truncate selected text preview to ~80 chars with ellipsis
function truncateText(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "…";
}

/**
 * Internal content component for testing purposes.
 * This can be rendered with renderToStaticMarkup for SSR tests.
 */
export function AnnotationPopoverContent({
  selectedText,
  comment,
  isEditing,
  isSaveDisabled,
  onCommentChange,
  onSave,
  onCancel,
  onDelete,
}: {
  selectedText: string;
  comment: string;
  isEditing: boolean;
  isSaveDisabled: boolean;
  onCommentChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: (() => void) | undefined;
}) {

  return (
    <div className="flex flex-col gap-3">
      {/* Selected text preview */}
      <div className="text-sm text-muted-foreground">
        <span className="italic">"{truncateText(selectedText)}"</span>
      </div>

      {/* Textarea for comment input */}
      <textarea
        className="min-h-24 rounded border border-border/70 bg-input/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary/50 focus:bg-input"
        placeholder="Add your feedback..."
        rows={3}
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
      />

      {/* Footer with buttons */}
      <div className="flex gap-2 justify-between">
        <div className="flex gap-2">
          <Button size="sm" variant="default" onClick={onSave} disabled={isSaveDisabled}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        {isEditing && onDelete && (
          <Button size="sm" variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

export function AnnotationPopover({
  open,
  onOpenChange,
  anchor,
  selectedText,
  initialComment = "",
  isEditing,
  onSave,
  onDelete,
  onCancel,
}: AnnotationPopoverProps) {
  const [comment, setComment] = useState(initialComment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update comment when initialComment changes (e.g., switching between edit modes)
  useEffect(() => {
    setComment(initialComment);
  }, [initialComment]);

  // Auto-focus textarea when popover opens
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  const handleSave = () => {
    onSave(comment);
  };

  const isSaveDisabled = !comment.trim();

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverPopup
        anchor={anchor}
        side="bottom"
        align="start"
        className="w-80 rounded-lg border border-border/70 bg-card/95 p-4 shadow-lg"
      >
        <AnnotationPopoverContent
          selectedText={selectedText}
          comment={comment}
          isEditing={isEditing}
          isSaveDisabled={isSaveDisabled}
          onCommentChange={setComment}
          onSave={handleSave}
          onCancel={onCancel}
          onDelete={onDelete ?? undefined}
        />
      </PopoverPopup>
    </Popover>
  );
}
