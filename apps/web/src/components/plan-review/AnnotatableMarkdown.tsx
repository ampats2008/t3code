"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { usePlanReviewStore, type PlanAnnotation } from "~/planReviewStore";
import { getAnnotationRanges, findOccurrenceIndex } from "~/planReview";
import { AnnotationPopover } from "./AnnotationPopover";
import ChatMarkdown from "../ChatMarkdown";

export interface AnnotatableMarkdownProps {
  planId: string;
  markdown: string;
  cwd?: string;
}

interface PopoverState {
  mode: "new" | "edit";
  anchor: Element | null;
  selectedText?: string;
  occurrenceIndex?: number;
  annotationId?: string;
}

const EMPTY_ANNOTATIONS: PlanAnnotation[] = [];

/**
 * Find a text occurrence in the DOM using TreeWalker and wrap it with a <mark> element.
 * Returns the created mark element, or null if not found.
 */
function highlightTextInDom(
  container: HTMLElement,
  text: string,
  occurrenceIndex: number,
  annotationId: string,
): HTMLElement | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentOccurrence = 0;
  let node: Node | null;

  // Build a concatenated text representation to find the occurrence
  const textNodes: { node: Text; start: number }[] = [];
  let totalLength = 0;

  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    textNodes.push({ node: textNode, start: totalLength });
    totalLength += textNode.textContent?.length ?? 0;
  }

  // Find the Nth occurrence in the concatenated text
  const fullText = textNodes.map((tn) => tn.node.textContent ?? "").join("");
  let searchFrom = 0;
  let matchStart = -1;

  for (let i = 0; i <= occurrenceIndex; i++) {
    matchStart = fullText.indexOf(text, searchFrom);
    if (matchStart === -1) return null;
    if (i < occurrenceIndex) {
      searchFrom = matchStart + 1;
    }
  }

  const matchEnd = matchStart + text.length;

  // Find which text nodes the match spans
  const range = document.createRange();
  let rangeSet = false;

  for (let i = 0; i < textNodes.length; i++) {
    const tn = textNodes[i]!;
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

  // Wrap the range with a <mark> element
  const mark = document.createElement("mark");
  mark.className =
    "bg-amber-500/20 rounded-sm cursor-pointer hover:bg-amber-500/30 transition-colors";
  mark.dataset.annotationId = annotationId;
  mark.setAttribute("role", "button");
  mark.setAttribute("tabindex", "0");

  try {
    range.surroundContents(mark);
  } catch {
    // surroundContents fails if the range spans multiple elements.
    // Fall back to extracting and re-inserting.
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
  }

  return mark;
}

/**
 * Remove all annotation highlight marks from the container, unwrapping their content.
 */
function clearHighlights(container: HTMLElement) {
  const marks = container.querySelectorAll("mark[data-annotation-id]");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize(); // Merge adjacent text nodes
  });
}

export function AnnotatableMarkdown({ planId, markdown, cwd }: AnnotatableMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popoverState, setPopoverState] = useState<PopoverState | null>(null);

  // Get store state — use stable empty array reference to avoid infinite re-render loop
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

    // Small delay to let ChatMarkdown finish rendering
    const timeoutId = setTimeout(() => {
      clearHighlights(container);

      // Get annotation ranges in the source markdown to know occurrence indices
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

  // Handle clicks on annotation marks (delegated event)
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const mark = target.closest("mark[data-annotation-id]");
      if (!mark) return;

      const annotationId = (mark as HTMLElement).dataset.annotationId;
      if (!annotationId) return;

      const annotation = annotations.find((ann) => ann.id === annotationId);
      if (!annotation) return;

      setActiveAnnotationId(annotationId);
      setPopoverState({
        mode: "edit",
        anchor: mark as HTMLElement,
        annotationId,
      });
    },
    [annotations, setActiveAnnotationId],
  );

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();

    // Check if selection is valid
    if (!selection || selection.isCollapsed || selection.toString().length === 0) {
      return;
    }

    const selectedText = selection.toString();

    // Skip if just whitespace
    if (!selectedText.trim()) {
      return;
    }

    // Verify selection is within container
    if (containerRef.current && !containerRef.current.contains(selection.anchorNode)) {
      return;
    }

    // Don't open a new popover if clicking an existing annotation
    const anchorElement = selection.anchorNode?.parentElement;
    if (anchorElement?.closest("mark[data-annotation-id]")) {
      return;
    }

    // Find occurrence index in the source markdown
    const occurrenceIndex = findOccurrenceIndex(markdown, selectedText);
    if (occurrenceIndex === -1) {
      return;
    }

    // Create a virtual anchor element at the selection range
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const tempAnchor = document.createElement("div");
    tempAnchor.style.position = "fixed";
    tempAnchor.style.left = `${rect.left}px`;
    tempAnchor.style.top = `${rect.bottom}px`;
    tempAnchor.style.width = `${rect.width}px`;
    tempAnchor.style.height = "0px";
    tempAnchor.style.pointerEvents = "none";
    document.body.appendChild(tempAnchor);

    // Show popover
    setPopoverState({
      mode: "new",
      anchor: tempAnchor,
      selectedText,
      occurrenceIndex,
    });
  }, [markdown]);

  // Handle popover save (new annotation)
  const handleSaveNewAnnotation = useCallback(
    (comment: string) => {
      if (popoverState?.mode === "new" && popoverState.selectedText != null) {
        addAnnotation(planId, {
          selectedText: popoverState.selectedText,
          occurrenceIndex: popoverState.occurrenceIndex ?? 0,
          comment,
        });

        // Clear selection
        window.getSelection()?.removeAllRanges();

        // Clean up temp anchor
        if (popoverState.anchor?.parentNode) {
          popoverState.anchor.parentNode.removeChild(popoverState.anchor);
        }

        setPopoverState(null);
      }
    },
    [popoverState, planId, addAnnotation],
  );

  // Handle popover save (edit annotation)
  const handleSaveEditAnnotation = useCallback(
    (comment: string) => {
      if (popoverState?.mode === "edit" && popoverState.annotationId) {
        updateAnnotationComment(planId, popoverState.annotationId, comment);
        setPopoverState(null);
        setActiveAnnotationId(null);
      }
    },
    [popoverState, planId, updateAnnotationComment, setActiveAnnotationId],
  );

  // Handle popover delete
  const handleDeleteAnnotation = useCallback(() => {
    if (popoverState?.mode === "edit" && popoverState.annotationId) {
      deleteAnnotation(planId, popoverState.annotationId);
      setPopoverState(null);
      setActiveAnnotationId(null);
    }
  }, [popoverState, planId, deleteAnnotation, setActiveAnnotationId]);

  // Handle popover cancel
  const handleCancel = useCallback(() => {
    // Clean up temp anchor if in new mode
    if (popoverState?.mode === "new" && popoverState.anchor?.parentNode) {
      popoverState.anchor.parentNode.removeChild(popoverState.anchor);
    }

    window.getSelection()?.removeAllRanges();
    setPopoverState(null);
    setActiveAnnotationId(null);
  }, [popoverState, setActiveAnnotationId]);

  // Get the current annotation for popover
  const currentAnnotation =
    popoverState?.mode === "edit" && popoverState.annotationId
      ? annotations.find((ann) => ann.id === popoverState.annotationId)
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

      <AnnotationPopover
        open={popoverState !== null}
        onOpenChange={(open) => {
          if (!open) {
            handleCancel();
          }
        }}
        anchor={popoverState?.anchor ?? null}
        selectedText={popoverState?.selectedText ?? ""}
        initialComment={currentAnnotation?.comment ?? ""}
        isEditing={popoverState?.mode === "edit"}
        onSave={(comment) => {
          if (popoverState?.mode === "new") {
            handleSaveNewAnnotation(comment);
          } else if (popoverState?.mode === "edit") {
            handleSaveEditAnnotation(comment);
          }
        }}
        {...(popoverState?.mode === "edit" && { onDelete: handleDeleteAnnotation })}
        onCancel={handleCancel}
      />
    </>
  );
}
