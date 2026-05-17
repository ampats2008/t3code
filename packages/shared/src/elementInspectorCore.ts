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

const FIBER_SKIP_NAMES = new Set(["forwardRef", "memo", "Anonymous", ""]);

/** Names that indicate the React tree root — not useful as ancestor context. */
const APP_ROOT_NAMES = new Set([
  "App",
  "Root",
  "Application",
  "Provider",
  "StrictMode",
  "Suspense",
  "ErrorBoundary",
  "BrowserRouter",
  "Router",
  "Routes",
  "Route",
  "ThemeProvider",
  "StoreProvider",
  "QueryClientProvider",
  "ReactBoot",
]);

function isAppRoot(name: string): boolean {
  if (APP_ROOT_NAMES.has(name)) return true;
  // Catch generic wrappers: FooProvider, FooRoot, FooContext, SegmentViewNode, etc.
  if (
    name.endsWith("Provider") ||
    name.endsWith("Root") ||
    name.endsWith("Context") ||
    name.endsWith("Boundary")
  )
    return true;
  return false;
}

/**
 * Resolve a display name from a React fiber type.
 * Handles plain function/class components, forwardRef wrappers, and memo wrappers.
 * Prefers `displayName` over `name` (works with HOCs, styled-components, etc.).
 */
function resolveComponentName(type: unknown): string | undefined {
  if (!type) return undefined;
  const t = type as Record<string, any>;

  if (typeof t === "function") {
    const name = ((t as any).displayName as string | undefined) || t.name;
    return name && !FIBER_SKIP_NAMES.has(name) ? name : undefined;
  }

  // forwardRef wrapper: { render: fn, displayName?: string }
  if (t.render) {
    const outer = t.displayName as string | undefined;
    if (outer && !FIBER_SKIP_NAMES.has(outer)) return outer;
    const inner = (t.render.displayName as string | undefined) || t.render.name;
    return inner && !FIBER_SKIP_NAMES.has(inner) ? inner : undefined;
  }

  // memo wrapper: { type: fn | object }
  if (t.type) return resolveComponentName(t.type as unknown);

  return undefined;
}

/**
 * Walk the fiber tree upward, skipping `skip` named components and returning
 * the name of the next one. Returns null and advances `fiber` past any app-root
 * components (which are filtered out). Mutates `state.fiber` and `state.depth`.
 */
function skipAndCollect(
  state: { fiber: any; depth: number },
  skip: number,
  prevNames: Set<string>,
): string | null {
  let skipped = 0;
  while (state.fiber && state.depth < 200) {
    state.depth++;
    const name = resolveComponentName(state.fiber.type);
    if (name && !prevNames.has(name)) {
      if (isAppRoot(name)) {
        // Hit app root — stop collecting landmarks entirely
        return null;
      }
      skipped++;
      if (skipped >= skip) {
        const result = name;
        state.fiber = state.fiber.return ?? null;
        return result;
      }
    }
    state.fiber = state.fiber.return ?? null;
  }
  return null;
}

export function getReactFiberInfo(el: Element): {
  componentName?: string;
  ancestors: string[];
  sourceFile?: string;
} {
  const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  if (!fiberKey) return { ancestors: [] };

  let fiber = (el as any)[fiberKey];
  let depth = 0;
  let componentName: string | undefined;
  let sourceFile: string | undefined;
  const immediateAncestors: string[] = [];

  // Phase 1: collect componentName + up to 3 immediate ancestors
  while (fiber && depth < 80) {
    depth++;
    const name = resolveComponentName(fiber.type);
    if (name) {
      if (!componentName) {
        componentName = name;
        const src = fiber._debugSource as { fileName?: string } | null;
        const fileName = src?.fileName;
        sourceFile = fileName
          ? (() => {
              const i = fileName.lastIndexOf("/src/");
              return i >= 0 ? fileName.slice(i + 5) : fileName.split("/").slice(-2).join("/");
            })()
          : undefined;
      } else {
        if (immediateAncestors.length < 3 && name !== componentName && !isAppRoot(name)) {
          immediateAncestors.push(name);
        }
        if (immediateAncestors.length >= 3) {
          fiber = fiber.return ?? null;
          break;
        }
      }
    }
    fiber = fiber.return ?? null;
  }

  // Collect names we've already shown so landmarks don't duplicate them
  const seen = new Set<string>(immediateAncestors);
  if (componentName) seen.add(componentName);

  const state = { fiber, depth };

  // Phase 2: +3 named components above the top immediate ancestor
  const midAncestor = skipAndCollect(state, 3, seen);
  if (midAncestor) seen.add(midAncestor);

  // Phase 3: +5 named components above the mid landmark
  const farAncestor = midAncestor ? skipAndCollect(state, 5, seen) : null;

  // Assemble ancestors: immediate … mid … far
  const ancestors = [...immediateAncestors];
  if (midAncestor) {
    ancestors.push("…", midAncestor);
  }
  if (farAncestor) {
    ancestors.push("…", farAncestor);
  }

  const result: { componentName?: string; ancestors: string[]; sourceFile?: string } = {
    ancestors,
  };
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
  const hasReactFiber = Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
  return hasReactFiber ? "react" : "unknown";
}
