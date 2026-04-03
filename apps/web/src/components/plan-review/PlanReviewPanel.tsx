"use client";

import { memo, useState, useCallback, useRef } from "react";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import { usePlanReviewStore, type PlanAnnotation } from "../../planReviewStore";
import { buildPlanReviewMessage } from "../../planReview";
import { AnnotatableMarkdown } from "./AnnotatableMarkdown";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import {
  proposedPlanTitle,
  buildProposedPlanMarkdownFilename,
  normalizePlanMarkdownForExport,
  downloadPlanAsTextFile,
  stripDisplayedPlanMarkdown,
} from "../../proposedPlan";
import { readNativeApi } from "~/nativeApi";
import { toastManager } from "../ui/toast";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { EllipsisIcon, PanelRightCloseIcon, PencilIcon, MessageSquareIcon } from "lucide-react";
import type { ActivePlanState, LatestProposedPlanState } from "../../session-logic";

const EMPTY_ANNOTATIONS: PlanAnnotation[] = [];
const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 360;
const MAX_WIDTH = 900;

export interface PlanReviewPanelProps {
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
  markdownCwd: string | undefined;
  workspaceRoot: string | undefined;
  timestampFormat: TimestampFormat;
  onSubmitReview: (text: string, interactionMode: "plan") => void;
  onClose: () => void;
}

const PlanReviewPanel = memo(function PlanReviewPanel({
  activeProposedPlan,
  markdownCwd,
  workspaceRoot,
  onSubmitReview,
  onClose,
}: PlanReviewPanelProps) {
  const [mode, setMode] = useState<"annotate" | "edit">("annotate");
  const [isSavingToWorkspace, setIsSavingToWorkspace] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const resizingRef = useRef(false);

  const planId = activeProposedPlan?.id;
  const planMarkdown = activeProposedPlan?.planMarkdown ?? null;
  const planTitle = planMarkdown ? proposedPlanTitle(planMarkdown) : null;

  // Get store state — use stable empty array reference to avoid infinite re-render loop
  const annotations = usePlanReviewStore(
    (state) => state.annotations[planId ?? ""] ?? EMPTY_ANNOTATIONS,
  );
  const editedMarkdownMap = usePlanReviewStore((state) => state.editedMarkdown);
  const editedMarkdown = planId ? editedMarkdownMap[planId] : undefined;
  const clearAnnotations = usePlanReviewStore((state) => state.clearAnnotations);
  const clearEditedMarkdown = usePlanReviewStore((state) => state.clearEditedMarkdown);
  const setEditedMarkdown = usePlanReviewStore((state) => state.setEditedMarkdown);

  // Determine if we have changes to submit
  const hasAnnotations = annotations.length > 0;
  const hasMarkdownChanges = editedMarkdown != null && editedMarkdown !== planMarkdown;
  const hasChanges = hasAnnotations || hasMarkdownChanges;

  const displayedPlanMarkdown = planMarkdown ? stripDisplayedPlanMarkdown(planMarkdown) : null;
  // Use editedMarkdown if the user has made edits, otherwise fall back to the stripped display markdown
  const effectiveMarkdown = editedMarkdown ?? displayedPlanMarkdown ?? "";

  // Resize handle drag logic
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      const startX = e.clientX;
      const startWidth = panelWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizingRef.current) return;
        // Panel is on the right, so dragging left increases width
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
        setPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        resizingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [panelWidth],
  );

  // Copy to clipboard
  const handleCopyPlan = useCallback(() => {
    if (!planMarkdown) return;
    copyToClipboard(planMarkdown);
  }, [planMarkdown, copyToClipboard]);

  // Download as markdown
  const handleDownload = useCallback(() => {
    if (!planMarkdown) return;
    const filename = buildProposedPlanMarkdownFilename(planMarkdown);
    downloadPlanAsTextFile(filename, normalizePlanMarkdownForExport(planMarkdown));
  }, [planMarkdown]);

  // Save to workspace
  const handleSaveToWorkspace = useCallback(() => {
    const api = readNativeApi();
    if (!api || !workspaceRoot || !planMarkdown) return;
    const filename = buildProposedPlanMarkdownFilename(planMarkdown);
    setIsSavingToWorkspace(true);
    void api.projects
      .writeFile({
        cwd: workspaceRoot,
        relativePath: filename,
        contents: normalizePlanMarkdownForExport(planMarkdown),
      })
      .then((result) => {
        toastManager.add({
          type: "success",
          title: "Plan saved",
          description: result.relativePath,
        });
      })
      .catch((error) => {
        toastManager.add({
          type: "error",
          title: "Could not save plan",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      })
      .then(
        () => setIsSavingToWorkspace(false),
        () => setIsSavingToWorkspace(false),
      );
  }, [planMarkdown, workspaceRoot]);

  // Handle submit review
  const handleSubmitReview = useCallback(() => {
    if (!planId || !planMarkdown) return;

    const message = buildPlanReviewMessage(annotations, editedMarkdown, planMarkdown);
    onSubmitReview(message, "plan");

    // Clear store state
    clearAnnotations(planId);
    clearEditedMarkdown(planId);
  }, [
    planId,
    planMarkdown,
    annotations,
    editedMarkdown,
    onSubmitReview,
    clearAnnotations,
    clearEditedMarkdown,
  ]);

  if (!planMarkdown) {
    return null;
  }

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-l border-border/70 bg-card/50"
      style={{ width: panelWidth }}
    >
      {/* Resize handle — left edge drag (wider hit area, narrow visible line) */}
      <div
        className="absolute -left-1 top-0 z-10 h-full w-3 cursor-col-resize group"
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize plan review panel"
      >
        <div className="absolute left-1 top-0 h-full w-px bg-transparent transition-colors group-hover:bg-primary/40 group-active:bg-primary/60" />
      </div>

      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="rounded-md bg-blue-500/10 px-1.5 py-0 text-[10px] font-semibold tracking-wide text-blue-400 uppercase"
          >
            Plan Review
          </Badge>
          {planTitle && (
            <span className="text-xs text-muted-foreground/70 truncate">{planTitle}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {planMarkdown ? (
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-muted-foreground/50 hover:text-foreground/70"
                    aria-label="Plan actions"
                  />
                }
              >
                <EllipsisIcon className="size-3.5" />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={handleCopyPlan}>
                  {isCopied ? "Copied!" : "Copy to clipboard"}
                </MenuItem>
                <MenuItem onClick={handleDownload}>Download as markdown</MenuItem>
                <MenuItem
                  onClick={handleSaveToWorkspace}
                  disabled={!workspaceRoot || isSavingToWorkspace}
                >
                  Save to workspace
                </MenuItem>
              </MenuPopup>
            </Menu>
          ) : null}
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setMode(mode === "annotate" ? "edit" : "annotate")}
            aria-label={mode === "annotate" ? "Switch to edit mode" : "Switch to annotate mode"}
            className="text-muted-foreground/50 hover:text-foreground/70"
            title={mode === "annotate" ? "Switch to edit mode" : "Switch to annotate mode"}
          >
            {mode === "annotate" ? (
              <PencilIcon className="size-3.5" />
            ) : (
              <MessageSquareIcon className="size-3.5" />
            )}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            aria-label="Close plan review"
            className="text-muted-foreground/50 hover:text-foreground/70"
          >
            <PanelRightCloseIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="min-h-0 flex-1">
        {mode === "annotate" ? (
          <div className="p-3">
            {planId && (
              <AnnotatableMarkdown
                planId={planId}
                markdown={effectiveMarkdown}
                {...(markdownCwd ? { cwd: markdownCwd } : {})}
              />
            )}
          </div>
        ) : (
          <textarea
            className="w-full h-full min-h-[400px] resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed text-foreground/90 outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
            value={editedMarkdown ?? planMarkdown}
            onChange={(e) => planId && setEditedMarkdown(planId, e.target.value)}
          />
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-3 py-2">
        <div>
          {annotations.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {annotations.length} {annotations.length === 1 ? "comment" : "comments"}
            </span>
          )}
        </div>
        <Button size="sm" onClick={handleSubmitReview} disabled={!hasChanges}>
          Submit Review
        </Button>
      </div>
    </div>
  );
});

export default PlanReviewPanel;
