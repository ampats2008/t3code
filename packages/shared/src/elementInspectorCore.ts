// packages/shared/src/elementInspectorCore.ts
// Pure DOM/TypeScript functions for element inspection — no React imports.
// Used by both the web dev-only inspector and potentially other tools.

export interface TooltipData {
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

export interface NearestAncestor {
  tag: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
  dataSlot?: string;
  directText?: string;
}

/** Extract text from direct child text nodes only — skips deeply nested content. */
export function getDirectText(el: Element): string | undefined {
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
export function getNearestLabeledAncestor(el: Element): NearestAncestor | undefined {
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
      const result: NearestAncestor = { tag: current.tagName.toLowerCase() };
      if (id) result.id = id;
      if (role) result.role = role;
      if (ariaLabel) result.ariaLabel = ariaLabel;
      if (dataSlot) result.dataSlot = dataSlot;
      if (directText) result.directText = directText;
      return result;
    }
    current = current.parentElement;
  }
  return undefined;
}

export function getReactFiberInfo(el: Element): {
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

  const result: { componentName?: string; ancestors: string[]; sourceFile?: string } = { ancestors };
  if (componentName) result.componentName = componentName;
  if (sourceFile) result.sourceFile = sourceFile;
  return result;
}

export function extractTooltipData(el: Element): TooltipData {
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

  const result: TooltipData = { tag, otherDataAttrs, ancestors };
  if (id) result.id = id;
  if (role) result.role = role;
  if (ariaLabel) result.ariaLabel = ariaLabel;
  if (dataSlot) result.dataSlot = dataSlot;
  if (directText) result.directText = directText;
  if (componentName) result.componentName = componentName;
  if (sourceFile) result.sourceFile = sourceFile;
  if (nearestLabeledAncestor) result.nearestLabeledAncestor = nearestLabeledAncestor;

  return result;
}

export function formatText(d: TooltipData): string {
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

export function detectFramework(el: Element): "react" | "unknown" {
  const hasReactFiber = Object.keys(el).some(k => k.startsWith("__reactFiber$"));
  return hasReactFiber ? "react" : "unknown";
}
