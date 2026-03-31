"use client";

import { useRef, useState } from "react";
import { usePlanReviewStore } from "~/planReviewStore";
import { getAnnotationRanges, findOccurrenceIndex } from "~/planReview";
import { AnnotationHighlight } from "./AnnotationHighlight";
import { AnnotationPopover } from "./AnnotationPopover";

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

export function AnnotatableMarkdown({ planId, markdown, cwd: _cwd }: AnnotatableMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popoverState, setPopoverState] = useState<PopoverState | null>(null);

  // Get store state
  const annotations = usePlanReviewStore((state) => state.annotations[planId] ?? []);
  const addAnnotation = usePlanReviewStore((state) => state.addAnnotation);
  const updateAnnotationComment = usePlanReviewStore((state) => state.updateAnnotationComment);
  const deleteAnnotation = usePlanReviewStore((state) => state.deleteAnnotation);
  const setActiveAnnotationId = usePlanReviewStore((state) => state.setActiveAnnotationId);

  // Get annotation ranges for highlighting
  const ranges = getAnnotationRanges(markdown, annotations);

  // Split markdown into segments (plain text and annotated ranges)
  const segments: Array<{
    type: "text" | "annotated";
    content: string;
    annotationId?: string;
    start?: number;
    end?: number;
  }> = [];

  let lastEnd = 0;
  for (const range of ranges) {
    // Add plain text before this range
    if (range.start > lastEnd) {
      segments.push({
        type: "text",
        content: markdown.substring(lastEnd, range.start),
      });
    }

    // Add annotated range
    segments.push({
      type: "annotated",
      content: markdown.substring(range.start, range.end),
      annotationId: range.annotationId,
      start: range.start,
      end: range.end,
    });

    lastEnd = range.end;
  }

  // Add remaining plain text
  if (lastEnd < markdown.length) {
    segments.push({
      type: "text",
      content: markdown.substring(lastEnd),
    });
  }

  // Handle text selection
  const handleMouseUp = () => {
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

    // Find occurrence index
    const occurrenceIndex = findOccurrenceIndex(markdown, selectedText);
    if (occurrenceIndex === -1) {
      return;
    }

    // Create a virtual anchor element at the selection range
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Create a temporary anchor element at the selection position
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

    // Clean up temp anchor when popover closes
    return () => {
      document.body.removeChild(tempAnchor);
    };
  };

  // Handle annotation highlight click
  const handleAnnotationClick = (annotationId: string, element: HTMLElement) => {
    const annotation = annotations.find((ann) => ann.id === annotationId);
    if (!annotation) return;

    setActiveAnnotationId(annotationId);
    setPopoverState({
      mode: "edit",
      anchor: element,
      annotationId,
    });
  };

  // Handle popover save (new annotation)
  const handleSaveNewAnnotation = (comment: string) => {
    if (popoverState?.mode === "new" && popoverState.selectedText != null) {
      addAnnotation(planId, {
        selectedText: popoverState.selectedText,
        occurrenceIndex: popoverState.occurrenceIndex ?? 0,
        comment,
      });

      // Clear selection
      if (window.getSelection) {
        window.getSelection()?.removeAllRanges();
      }

      // Clean up temp anchor
      if (popoverState.anchor && popoverState.anchor.parentNode) {
        popoverState.anchor.parentNode.removeChild(popoverState.anchor);
      }

      setPopoverState(null);
    }
  };

  // Handle popover save (edit annotation)
  const handleSaveEditAnnotation = (comment: string) => {
    if (popoverState?.mode === "edit" && popoverState.annotationId) {
      updateAnnotationComment(planId, popoverState.annotationId, comment);
      setPopoverState(null);
      setActiveAnnotationId(null);
    }
  };

  // Handle popover delete
  const handleDeleteAnnotation = () => {
    if (popoverState?.mode === "edit" && popoverState.annotationId) {
      deleteAnnotation(planId, popoverState.annotationId);
      setPopoverState(null);
      setActiveAnnotationId(null);
    }
  };

  // Handle popover cancel
  const handleCancel = () => {
    // Clean up temp anchor if in new mode
    if (popoverState?.mode === "new" && popoverState.anchor?.parentNode) {
      popoverState.anchor.parentNode.removeChild(popoverState.anchor);
    }

    // Clear selection
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }

    setPopoverState(null);
    setActiveAnnotationId(null);
  };

  // Get the current annotation for popover
  const currentAnnotation =
    popoverState?.mode === "edit" && popoverState.annotationId
      ? annotations.find((ann) => ann.id === popoverState.annotationId)
      : null;

  return (
    <>
      <div
        ref={containerRef}
        className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed p-4 text-foreground/90 overflow-auto flex-1"
        onMouseUp={handleMouseUp}
      >
        {segments.length === 0
          ? markdown
          : segments.map((segment) =>
              segment.type === "text" ? (
                <span key={`text-${segment.content.substring(0, 10)}`}>
                  {segment.content}
                </span>
              ) : (
                <AnnotationHighlight
                  key={segment.annotationId}
                  annotationId={segment.annotationId!}
                  comment={
                    annotations.find((ann) => ann.id === segment.annotationId)?.comment ?? ""
                  }
                  onClick={handleAnnotationClick}
                >
                  {segment.content}
                </AnnotationHighlight>
              ),
            )}
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
