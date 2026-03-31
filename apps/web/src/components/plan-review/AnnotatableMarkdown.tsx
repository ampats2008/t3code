"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { usePlanReviewStore, type PlanAnnotation } from "~/planReviewStore";
import { getAnnotationRanges, findOccurrenceIndex } from "~/planReview";
import { Button } from "../ui/button";
import { MessageSquareIcon, Trash2Icon } from "lucide-react";
import ChatMarkdown from "../ChatMarkdown";

export interface AnnotatableMarkdownProps {
  planId: string;
  markdown: string;
  cwd?: string;
}

/**
 * Floating toolbar shown near the text selection — step 1 of the two-step flow.
 * Just an "Add Comment" button. No focus trapping, no popover.
 */
function SelectionToolbar({
  position,
  onAddComment,
}: {
  position: { top: number; left: number };
  onAddComment: () => void;
}) {
  return (
    <div
      className="fixed z-50"
      style={{ top: position.top + 4, left: position.left }}
      onMouseDown={(e) => e.preventDefault()} // Prevent stealing focus / clearing selection
    >
      <button
        type="button"
        title="Add comment"
        className="flex items-center justify-center size-7 rounded-md border border-border/70 bg-card text-foreground/70 shadow-lg hover:bg-muted/60 hover:text-foreground transition-colors"
        onMouseDown={(e) => {
          e.preventDefault(); // Keep selection alive
          e.stopPropagation();
          onAddComment();
        }}
      >
        <MessageSquareIcon className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Inline comment form — step 2. A plain positioned div, not a Popover.
 * Rendered in a portal-free way to avoid focus management issues.
 */
function CommentForm({
  position,
  selectedText,
  initialComment,
  isEditing,
  onSave,
  onDelete,
  onCancel,
}: {
  position: { top: number; left: number };
  selectedText: string;
  initialComment: string;
  isEditing: boolean;
  onSave: (comment: string) => void;
  onDelete?: (() => void) | undefined;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState(initialComment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Auto-focus textarea after a tick (avoid interfering with selection clear)
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const truncated =
    selectedText.length > 80 ? selectedText.slice(0, 80) + "\u2026" : selectedText;

  return (
    <div
      className="fixed z-50 w-80 rounded-lg border border-border/70 bg-card p-4 shadow-xl"
      style={{ top: position.top + 4, left: position.left }}
      onMouseDown={(e) => e.stopPropagation()} // Don't let clicks bubble to container
    >
      {/* Selected text preview */}
      <div className="mb-3 text-sm text-muted-foreground">
        <span className="italic">&ldquo;{truncated}&rdquo;</span>
      </div>

      {/* Comment textarea */}
      <textarea
        ref={textareaRef}
        className="mb-3 w-full min-h-20 rounded border border-border/70 bg-input/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary/50 focus:bg-input"
        placeholder="Add your feedback..."
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && comment.trim()) {
            e.preventDefault();
            onSave(comment);
          }
        }}
      />

      {/* Action buttons */}
      <div className="flex justify-between">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSave(comment)} disabled={!comment.trim()}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {isEditing && onDelete && (
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive">
            <Trash2Icon className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

const EMPTY_ANNOTATIONS: PlanAnnotation[] = [];

// --- DOM highlight helpers ---

function highlightTextInDom(
  container: HTMLElement,
  text: string,
  occurrenceIndex: number,
  annotationId: string,
): HTMLElement | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: { node: Text; start: number }[] = [];
  let totalLength = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    textNodes.push({ node: textNode, start: totalLength });
    totalLength += textNode.textContent?.length ?? 0;
  }

  const fullText = textNodes.map((tn) => tn.node.textContent ?? "").join("");
  let searchFrom = 0;
  let matchStart = -1;

  for (let i = 0; i <= occurrenceIndex; i++) {
    matchStart = fullText.indexOf(text, searchFrom);
    if (matchStart === -1) return null;
    if (i < occurrenceIndex) searchFrom = matchStart + 1;
  }

  const matchEnd = matchStart + text.length;
  const range = document.createRange();
  let rangeSet = false;

  for (const tn of textNodes) {
    const nodeEnd = tn.start + (tn.node.textContent?.length ?? 0);
    if (!rangeSet && matchStart >= tn.start && matchStart < nodeEnd) {
      range.setStart(tn.node, matchStart - tn.start);
      rangeSet = true;
    }
    if (rangeSet && matchEnd <= nodeEnd) {
      range.setEnd(tn.node, matchEnd - tn.start);
      break;
    }
  }
  if (!rangeSet) return null;

  const mark = document.createElement("mark");
  mark.className =
    "bg-amber-500/20 rounded-sm cursor-pointer hover:bg-amber-500/30 transition-colors";
  mark.dataset.annotationId = annotationId;
  mark.setAttribute("role", "button");
  mark.setAttribute("tabindex", "0");

  try {
    range.surroundContents(mark);
  } catch {
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
  }
  return mark;
}

function clearHighlights(container: HTMLElement) {
  const marks = container.querySelectorAll("mark[data-annotation-id]");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

// --- Interaction state types ---

type InteractionState =
  | null
  | {
      mode: "toolbar";
      position: { top: number; left: number };
      selectedText: string;
      occurrenceIndex: number;
    }
  | {
      mode: "new-comment";
      position: { top: number; left: number };
      selectedText: string;
      occurrenceIndex: number;
    }
  | {
      mode: "edit-comment";
      position: { top: number; left: number };
      annotationId: string;
    };

// --- Main component ---

export function AnnotatableMarkdown({ planId, markdown, cwd }: AnnotatableMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<InteractionState>(null);

  const annotations = usePlanReviewStore(
    (state) => state.annotations[planId] ?? EMPTY_ANNOTATIONS,
  );
  const addAnnotation = usePlanReviewStore((state) => state.addAnnotation);
  const updateAnnotationComment = usePlanReviewStore((state) => state.updateAnnotationComment);
  const deleteAnnotation = usePlanReviewStore((state) => state.deleteAnnotation);
  const setActiveAnnotationId = usePlanReviewStore((state) => state.setActiveAnnotationId);

  // Apply annotation highlights to the rendered ChatMarkdown DOM
  useEffect(() => {
    const container = containerRef.current;
    if (!container || annotations.length === 0) return;

    const timeoutId = setTimeout(() => {
      clearHighlights(container);
      const ranges = getAnnotationRanges(markdown, annotations);

      for (const annotation of annotations) {
        const range = ranges.find((r) => r.annotationId === annotation.id);
        if (!range) continue;

        const mark = highlightTextInDom(
          container,
          annotation.selectedText,
          annotation.occurrenceIndex,
          annotation.id,
        );
        if (mark) {
          mark.title = annotation.comment;
          mark.setAttribute("aria-label", annotation.comment);
        }
      }
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      if (container) clearHighlights(container);
    };
  }, [annotations, markdown]);

  // Dismiss toolbar/form on outside click or Escape
  useEffect(() => {
    if (!interaction) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInteraction(null);
        setActiveAnnotationId(null);
        window.getSelection()?.removeAllRanges();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [interaction, setActiveAnnotationId]);

  // Handle text selection → show floating toolbar
  const handleMouseUp = useCallback(() => {
    // Small delay to let the selection settle
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

      const selectedText = selection.toString();
      if (!containerRef.current?.contains(selection.anchorNode)) return;

      // Don't show toolbar if clicking on an existing annotation mark
      const anchorEl = selection.anchorNode?.parentElement;
      if (anchorEl?.closest("mark[data-annotation-id]")) return;

      // Check if the selected text exists in the source markdown
      const occurrenceIndex = findOccurrenceIndex(markdown, selectedText);
      if (occurrenceIndex === -1) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setInteraction({
        mode: "toolbar",
        position: { top: rect.bottom, left: rect.left },
        selectedText,
        occurrenceIndex,
      });
    });
  }, [markdown]);

  // Handle click on annotation highlight → show edit form
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const mark = target.closest("mark[data-annotation-id]");
      if (!mark) return;

      const annotationId = (mark as HTMLElement).dataset.annotationId;
      if (!annotationId) return;

      const annotation = annotations.find((ann) => ann.id === annotationId);
      if (!annotation) return;

      const rect = mark.getBoundingClientRect();
      setActiveAnnotationId(annotationId);
      setInteraction({
        mode: "edit-comment",
        position: { top: rect.bottom, left: rect.left },
        annotationId,
      });
    },
    [annotations, setActiveAnnotationId],
  );

  // Toolbar → "Add Comment" clicked → transition to comment form
  const handleToolbarAddComment = useCallback(() => {
    if (interaction?.mode !== "toolbar") return;

    // Clear the text selection now (we've captured the text)
    window.getSelection()?.removeAllRanges();

    setInteraction({
      mode: "new-comment",
      position: interaction.position,
      selectedText: interaction.selectedText,
      occurrenceIndex: interaction.occurrenceIndex,
    });
  }, [interaction]);

  // Save new annotation
  const handleSaveNew = useCallback(
    (comment: string) => {
      if (interaction?.mode !== "new-comment") return;
      addAnnotation(planId, {
        selectedText: interaction.selectedText,
        occurrenceIndex: interaction.occurrenceIndex,
        comment,
      });
      setInteraction(null);
    },
    [interaction, planId, addAnnotation],
  );

  // Save edited annotation
  const handleSaveEdit = useCallback(
    (comment: string) => {
      if (interaction?.mode !== "edit-comment") return;
      updateAnnotationComment(planId, interaction.annotationId, comment);
      setInteraction(null);
      setActiveAnnotationId(null);
    },
    [interaction, planId, updateAnnotationComment, setActiveAnnotationId],
  );

  // Delete annotation
  const handleDelete = useCallback(() => {
    if (interaction?.mode !== "edit-comment") return;
    deleteAnnotation(planId, interaction.annotationId);
    setInteraction(null);
    setActiveAnnotationId(null);
  }, [interaction, planId, deleteAnnotation, setActiveAnnotationId]);

  // Cancel / dismiss
  const handleCancel = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setInteraction(null);
    setActiveAnnotationId(null);
  }, [setActiveAnnotationId]);

  // Get annotation for edit mode
  const editingAnnotation =
    interaction?.mode === "edit-comment"
      ? annotations.find((ann) => ann.id === interaction.annotationId)
      : null;

  return (
    <>
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        className="plan-review-content"
      >
        <ChatMarkdown text={markdown} cwd={cwd} isStreaming={false} />
      </div>

      {/* Step 1: Floating toolbar after text selection */}
      {interaction?.mode === "toolbar" && (
        <SelectionToolbar
          position={interaction.position}
          onAddComment={handleToolbarAddComment}
        />
      )}

      {/* Step 2a: Comment form for new annotation */}
      {interaction?.mode === "new-comment" && (
        <CommentForm
          position={interaction.position}
          selectedText={interaction.selectedText}
          initialComment=""
          isEditing={false}
          onSave={handleSaveNew}
          onCancel={handleCancel}
        />
      )}

      {/* Step 2b: Comment form for editing existing annotation */}
      {interaction?.mode === "edit-comment" && editingAnnotation && (
        <CommentForm
          position={interaction.position}
          selectedText={editingAnnotation.selectedText}
          initialComment={editingAnnotation.comment}
          isEditing={true}
          onSave={handleSaveEdit}
          onDelete={handleDelete}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
