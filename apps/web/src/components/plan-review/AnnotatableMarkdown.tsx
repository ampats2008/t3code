"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { usePlanReviewStore, type PlanAnnotation } from "~/planReviewStore";
import { getAnnotationRanges } from "~/planReview";
import { MessageSquareIcon, Trash2Icon } from "lucide-react";
import ChatMarkdown from "../ChatMarkdown";

export interface AnnotatableMarkdownProps {
  planId: string;
  markdown: string;
  cwd?: string;
}

/**
 * Floating toolbar shown centered above the text selection — step 1 of the two-step flow.
 * Shows "Add Comment" button with icon. No focus trapping, no popover.
 */
function SelectionToolbar({
  position,
  onAddComment,
}: {
  position: { top: number; left: number; centerX: number };
  onAddComment: () => void;
}) {
  return (
    <div
      className="fixed z-50 -translate-x-1/2"
      style={{ top: position.top - 36, left: position.centerX }}
      onMouseDown={(e) => e.preventDefault()} // Prevent stealing focus / clearing selection
    >
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onMouseDown={(e) => {
          e.preventDefault(); // Keep selection alive
          e.stopPropagation();
          onAddComment();
        }}
      >
        <MessageSquareIcon className="size-3.5" />
        Add Comment
      </button>
    </div>
  );
}

/**
 * Inline comment form — step 2. A plain positioned div, not a Popover.
 * No quote banner — the selected text stays highlighted in the plan panel instead.
 */
function CommentForm({
  position,
  initialComment,
  isEditing,
  onSave,
  onDelete,
  onCancel,
}: {
  position: { top: number; left: number };
  initialComment: string;
  isEditing: boolean;
  onSave: (comment: string) => void;
  onDelete?: (() => void) | undefined;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState(initialComment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="fixed z-50 w-[340px]"
      style={{ top: position.top + 8, left: position.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="rounded-2xl border border-border bg-card shadow-xl">
        {/* Textarea — borderless, like the chatbox input area */}
        <div className="px-1">
          <textarea
            ref={textareaRef}
            className="w-full resize-none rounded-t-2xl bg-transparent px-3 py-3 text-sm text-foreground placeholder-muted-foreground/50 outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
            placeholder="Add your feedback..."
            rows={2}
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/40 px-3 py-2">
          <div className="flex items-center gap-1.5">
            {isEditing && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                title="Delete annotation"
                className="flex cursor-pointer items-center justify-center size-7 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer rounded-md px-2.5 py-1 text-xs text-muted-foreground/60 hover:text-foreground/80 hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Cancel
            </button>
          </div>
          <button
            type="button"
            onClick={() => onSave(comment)}
            disabled={!comment.trim()}
            className="flex cursor-pointer items-center justify-center size-7 rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            title={`Save (${navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+Enter)`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
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
    "bg-amber-500/20 rounded-sm cursor-pointer hover:bg-amber-500/30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/50";
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

function clearPendingHighlight(container: HTMLElement) {
  const pending = container.querySelectorAll('mark[data-annotation-id="__pending__"]');
  pending.forEach((mark) => {
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
      position: { top: number; left: number; centerX: number };
      selectedText: string;
      occurrenceIndex: number;
    }
  | {
      mode: "new-comment";
      position: { top: number; left: number; centerX: number };
      selectedText: string;
      occurrenceIndex: number;
    }
  | {
      mode: "edit-comment";
      position: { top: number; left: number; centerX: number };
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

      // Compute occurrence index by searching the DOM's rendered text (not the markdown source).
      // This handles selections that span rendered headings, bold text, etc. where the
      // selection text won't match the raw markdown (e.g., "Section 1" vs "## Section 1").
      const container = containerRef.current;
      let occurrenceIndex = 0;
      if (container) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let domText = "";
        let node: Node | null;
        while ((node = walker.nextNode())) {
          domText += node.textContent ?? "";
        }
        // Count how many times selectedText appears before the current selection position
        let searchFrom = 0;
        let found = false;
        while (true) {
          const idx = domText.indexOf(selectedText, searchFrom);
          if (idx === -1) break;
          found = true;
          occurrenceIndex = 0; // We only need to know it exists; highlightTextInDom uses DOM text
          searchFrom = idx + 1;
        }
        if (!found) return; // Text somehow not in DOM — bail
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setInteraction({
        mode: "toolbar",
        position: {
          top: rect.top,
          left: rect.left,
          centerX: rect.left + rect.width / 2,
        },
        selectedText,
        occurrenceIndex,
      });
    });
  }, []);

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
        position: {
          top: rect.bottom,
          left: rect.left,
          centerX: rect.left + rect.width / 2,
        },
        annotationId,
      });
    },
    [annotations, setActiveAnnotationId],
  );

  // Toolbar → "Add Comment" clicked → transition to comment form
  const handleToolbarAddComment = useCallback(() => {
    if (interaction?.mode !== "toolbar") return;

    // Apply a pending highlight so the selected text stays visually marked
    // even after the browser selection clears (when user clicks into textarea)
    const container = containerRef.current;
    if (container) {
      clearPendingHighlight(container);
      highlightTextInDom(container, interaction.selectedText, interaction.occurrenceIndex, "__pending__");
      // Style the pending highlight differently (brighter)
      const pending = container.querySelector('mark[data-annotation-id="__pending__"]');
      if (pending) {
        (pending as HTMLElement).className = "bg-amber-500/30 rounded-sm";
      }
    }

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
      if (containerRef.current) clearPendingHighlight(containerRef.current);
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
    if (containerRef.current) clearPendingHighlight(containerRef.current);
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
