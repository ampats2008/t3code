// apps/web/src/components/DevElementInspector.tsx
// Dev-only element inspector — activated with Ctrl+Shift+X.
// Hover to see element info; click to inject a reference into the chat composer.
// Entirely tree-shaken out of production builds via the import.meta.env.DEV guard.

import { useCallback, useEffect, useRef, useState } from "react";

interface TooltipData {
  tag: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
  dataSlot?: string; // data-slot (shadcn semantic key)
  otherDataAttrs: [string, string][];
  directText?: string; // visible text from direct text nodes only, capped at 40 chars
  componentName?: string;
  ancestors: string[]; // 2-3 named ancestor component names above componentName
  sourceFile?: string; // shortened to components/Foo.tsx
  nearestLabeledAncestor?: NearestAncestor; // closest DOM ancestor with meaningful identity
}

interface NearestAncestor {
  tag: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
  dataSlot?: string;
  directText?: string;
}

/** Extract text from direct child text nodes only — skips deeply nested content. */
function getDirectText(el: Element): string | undefined {
  let text = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
    }
  }
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 40 ? trimmed.slice(0, 37) + "…" : trimmed;
}

/**
 * Walk up the DOM from `el` to find the nearest ancestor that has at least one
 * meaningful identity signal. Only emitted when the element itself has none
 * (no aria-label, no data-slot, no id) — i.e. decorative/structural elements.
 */
function getNearestLabeledAncestor(el: Element): NearestAncestor | undefined {
  let current = el.parentElement;
  let steps = 0;
  while (current && steps < 10) {
    steps++;
    const id = current.id || undefined;
    const role = current.getAttribute("role") ?? undefined;
    const ariaLabel = current.getAttribute("aria-label") ?? undefined;
    const dataSlot = current.getAttribute("data-slot") ?? undefined;
    const directText = getDirectText(current);
    if (id || role || ariaLabel || dataSlot || directText) {
      return { tag: current.tagName.toLowerCase(), id, role, ariaLabel, dataSlot, directText };
    }
    current = current.parentElement;
  }
  return undefined;
}

function getReactFiberInfo(el: Element): {
  componentName?: string;
  ancestors: string[];
  sourceFile?: string;
} {
  const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  if (!fiberKey) return { ancestors: [] };

  const SKIP_NAMES = new Set(["forwardRef", "memo", "Anonymous", ""]);
  let fiber = (el as any)[fiberKey];
  let depth = 0;
  let componentName: string | undefined;
  let sourceFile: string | undefined;
  const ancestors: string[] = [];

  while (fiber && depth < 80) {
    depth++;
    const type = fiber.type;
    if (typeof type === "function" && type.name && !SKIP_NAMES.has(type.name)) {
      if (!componentName) {
        // First named hit — this is the direct component
        componentName = type.name;
        const src = fiber._debugSource as { fileName?: string } | null;
        const fileName = src?.fileName;
        sourceFile = fileName
          ? (() => {
              const i = fileName.lastIndexOf("/src/");
              return i >= 0 ? fileName.slice(i + 5) : fileName.split("/").slice(-2).join("/");
            })()
          : undefined;
      } else {
        // Subsequent hits — ancestor breadcrumb (collect up to 3)
        if (ancestors.length < 3 && type.name !== componentName) {
          ancestors.push(type.name);
        }
        if (ancestors.length >= 3) break;
      }
    }
    fiber = fiber.return ?? null;
  }

  return { componentName, ancestors, sourceFile };
}

function extractTooltipData(el: Element): TooltipData {
  const tag = el.tagName.toLowerCase();
  const id = el.id || undefined;
  const role = el.getAttribute("role") ?? undefined;
  const ariaLabel = el.getAttribute("aria-label") ?? undefined;
  const dataSlot = el.getAttribute("data-slot") ?? undefined;
  const otherDataAttrs: [string, string][] = [];
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("data-") && attr.name !== "data-slot" && attr.value) {
      otherDataAttrs.push([attr.name, attr.value]);
    }
  }
  const directText = getDirectText(el);
  const { componentName, ancestors, sourceFile } = getReactFiberInfo(el);
  // Only surface a labeled ancestor when the element itself has no identity signals
  const hasOwnIdentity = !!(id || ariaLabel || dataSlot || directText);
  const nearestLabeledAncestor = hasOwnIdentity ? undefined : getNearestLabeledAncestor(el);
  return { tag, id, role, ariaLabel, dataSlot, otherDataAttrs, directText, componentName, ancestors, sourceFile, nearestLabeledAncestor };
}

function formatText(d: TooltipData): string {
  const attrs: string[] = [];
  if (d.id) attrs.push(`id="${d.id}"`);
  if (d.role) attrs.push(`role="${d.role}"`);
  if (d.ariaLabel) attrs.push(`aria-label="${d.ariaLabel}"`);
  if (d.dataSlot) attrs.push(`data-slot="${d.dataSlot}"`);
  d.otherDataAttrs.slice(0, 3).forEach(([k, v]) => attrs.push(`${k}="${v}"`));
  const attrStr = attrs.length ? " " + attrs.join(" ") : "";
  const tagPart = `<${d.tag}${attrStr}>`;

  // Component + breadcrumb: ComponentName ← Parent ← Grandparent
  let compPart = "";
  if (d.componentName) {
    const crumb = d.ancestors.length > 0 ? ` ← ${d.ancestors.join(" ← ")}` : "";
    compPart = ` · ${d.componentName}${crumb}${d.sourceFile ? ` @ ${d.sourceFile}` : ""}`;
  }

  // Direct text label
  const textPart = d.directText ? ` "${d.directText}"` : "";

  // Nearest labeled ancestor
  let ancestorPart = "";
  if (d.nearestLabeledAncestor) {
    const a = d.nearestLabeledAncestor;
    const aAttrs: string[] = [];
    if (a.id) aAttrs.push(`id="${a.id}"`);
    if (a.role) aAttrs.push(`role="${a.role}"`);
    if (a.ariaLabel) aAttrs.push(`aria-label="${a.ariaLabel}"`);
    if (a.dataSlot) aAttrs.push(`data-slot="${a.dataSlot}"`);
    const aAttrStr = aAttrs.length ? " " + aAttrs.join(" ") : "";
    const aText = a.directText ? ` "${a.directText}"` : "";
    ancestorPart = ` ↑ <${a.tag}${aAttrStr}>${aText}`;
  }

  return `[${tagPart}${ancestorPart}${compPart}${textPart}]`;
}

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
