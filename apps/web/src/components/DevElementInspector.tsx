// apps/web/src/components/DevElementInspector.tsx
// Dev-only element inspector — activated with Ctrl+Shift+X.
// Hover to see element info; click to inject a reference into the chat composer.
// Entirely tree-shaken out of production builds via the import.meta.env.DEV guard.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type TooltipData,
  type NearestAncestor,
  extractTooltipData,
  formatText,
} from "@t3tools/shared/elementInspectorCore";

export function DevElementInspector() {
  // No-op in production — entire component body is dead code and tree-shaken.
  if (!import.meta.env.DEV) return null;

  const [isActive, setIsActive] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut: Ctrl+Shift+X to toggle, Escape to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "X") {
        // uppercase X — Shift is held
        e.preventDefault();
        setIsActive((prev) => !prev);
      } else if (e.key === "Escape" && isActive) {
        setIsActive(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive]);

  // pointer-events trick: hide overlay briefly to hit-test the real element beneath
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.style.pointerEvents = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "all";
    if (!el || el === document.body || el === document.documentElement) {
      setTooltipData(null);
      setHighlightRect(null);
      return;
    }
    setTooltipData(extractTooltipData(el));
    setHighlightRect(el.getBoundingClientRect());
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (tooltipData) {
        window.dispatchEvent(
          new CustomEvent("element-inspector:insert", {
            detail: { text: formatText(tooltipData) },
          }),
        );
      }
      setIsActive(false);
      setTooltipData(null);
      setHighlightRect(null);
    },
    [tooltipData],
  );

  return (
    <>
      {isActive && (
        <div
          ref={overlayRef}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          style={{ position: "fixed", inset: 0, zIndex: 10001, cursor: "crosshair" }}
        >
          {/* Highlight box — pointer-events:none so mousemove still reaches overlay */}
          {highlightRect && (
            <div
              style={{
                position: "fixed",
                top: highlightRect.top,
                left: highlightRect.left,
                width: highlightRect.width,
                height: highlightRect.height,
                outline: "2px solid #60a5fa",
                backgroundColor: "rgba(96,165,250,0.08)",
                pointerEvents: "none",
              }}
            />
          )}
        </div>
      )}
      {/* Tooltip — sibling to overlay so it's not inside the click target */}
      {isActive && tooltipData && (
        <div
          style={{
            position: "fixed",
            top: Math.min(mousePos.y + 14, window.innerHeight - 150),
            left: Math.min(mousePos.x + 14, window.innerWidth - 360),
            zIndex: 10002,
            pointerEvents: "none",
          }}
          className="bg-popover text-popover-foreground border border-border rounded-md px-3 py-2 text-xs shadow-lg max-w-sm font-mono"
        >
          {/* Tag + role */}
          <div className="font-semibold text-blue-400">
            {`<${tooltipData.tag}>`}
            {tooltipData.role && (
              <span className="text-purple-400 ml-1.5">{tooltipData.role}</span>
            )}
          </div>
          {/* Nearest labeled ancestor — shown for decorative/unlabeled elements */}
          {tooltipData.nearestLabeledAncestor && (
            <div className="text-emerald-400/80 mt-0.5 truncate">
              ↑&nbsp;
              {`<${tooltipData.nearestLabeledAncestor.tag}>`}
              {tooltipData.nearestLabeledAncestor.ariaLabel && (
                <span className="opacity-70"> &ldquo;{tooltipData.nearestLabeledAncestor.ariaLabel}&rdquo;</span>
              )}
              {!tooltipData.nearestLabeledAncestor.ariaLabel && tooltipData.nearestLabeledAncestor.dataSlot && (
                <span className="opacity-70"> {tooltipData.nearestLabeledAncestor.dataSlot}</span>
              )}
              {!tooltipData.nearestLabeledAncestor.ariaLabel && !tooltipData.nearestLabeledAncestor.dataSlot && tooltipData.nearestLabeledAncestor.directText && (
                <span className="opacity-70"> &ldquo;{tooltipData.nearestLabeledAncestor.directText}&rdquo;</span>
              )}
            </div>
          )}
          {/* Component breadcrumb */}
          {tooltipData.componentName && (
            <div className="text-muted-foreground mt-0.5">
              {tooltipData.componentName}
              {tooltipData.ancestors.length > 0 && (
                <span className="opacity-50"> ← {tooltipData.ancestors.join(" ← ")}</span>
              )}
              {tooltipData.sourceFile && (
                <span className="opacity-50"> @ {tooltipData.sourceFile}</span>
              )}
            </div>
          )}
          {/* Direct text content */}
          {tooltipData.directText && (
            <div className="text-amber-400/80 mt-0.5 truncate">
              &ldquo;{tooltipData.directText}&rdquo;
            </div>
          )}
          <div className="text-muted-foreground/70 mt-0.5 text-[10px]">
            Click to insert · Esc to cancel
          </div>
        </div>
      )}
    </>
  );
}
