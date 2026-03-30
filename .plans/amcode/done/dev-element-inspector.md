# Dev Element Inspector

**Commit:** `1e294ff7`
**Branch:** `feature/main/2am-code`
**Status:** Done

## What was built

A dev-only DOM element inspector activated via `Ctrl+Shift+X`. Hovering elements highlights them with an overlay; clicking one captures its context and inserts an inline chip into the chat composer.

### Chip format
```
[<tag> ↑ <nearest-named-parent-tag> · ComponentName ← ParentComponent ← ... "visible text"]
```

- `<tag>` — HTML element tag
- `↑ <parent>` — nearest named non-div/span ancestor tag (for SVGs: nearest interactive parent)
- `· ComponentName` — innermost named React component (skips anonymous/context/provider noise)
- `← ...` — up to 3 ancestor component names
- `"visible text"` — trimmed direct text content of the element (max ~40 chars)

## Files

| File | Change |
|---|---|
| `apps/web/src/components/DevElementInspector.tsx` | New — full inspector overlay |
| `apps/web/src/components/ComposerPromptEditor.tsx` | `ComposerElementRefNode` + `insertElementRef` |
| `apps/web/src/components/ChatView.tsx` | `element-inspector:insert` event bridge |
| `apps/web/src/routes/__root.tsx` | Mounts `<DevElementInspector />` |

## Key design decisions

### ComposerElementRefNode: DecoratorNode not TextNode
Initially implemented as `TextNode` subclass. Two bugs appeared: chip never showed in chat, typing blocked after insertion. Root cause: Lexical's text-reconciler normalization passes silently strip unexpected `TextNode` subtypes that are inserted outside the entity-transform machinery. Switching to `DecoratorNode<ReactElement>` (same base as `ComposerTerminalContextNode`) fixed both issues — `DecoratorNode`s bypass text normalization entirely.

Also removed `isTextEntity(): true` in an intermediate attempt — that was a contributing factor but not sufficient alone.

### ComposerElementRefNode added to ComposerInlineTokenNode union
Required for correct cursor math, arrow-key navigation, selection normalization, and backspace handling — all of which gate on `isComposerInlineTokenNode()`.

Updated:
- `ComposerInlineTokenNode` type
- `isComposerInlineTokenNode()` guard
- `getAbsoluteOffsetForPoint`
- `getExpandedAbsoluteOffsetForPoint`
- `findSelectionPointAtOffset`

### Chip rendering
`decorate()` returns a `<ComposerElementRefDecorator>` React component (crosshair SVG + label). The label is extracted from the full chip text via `elementRefChipLabel()`.

### Event bridge
`DevElementInspector` dispatches `element-inspector:insert` CustomEvent on `window`. `ChatView` listens with a `useEffect([], [])` and calls `composerEditorRef.current?.insertElementRef(text)`.

### insertElementRef
Imperative handle on `ComposerPromptEditor`. Focuses editor, sets selection to current cursor, inserts optional leading space, inserts chip node, inserts trailing space so cursor lands after the chip.
