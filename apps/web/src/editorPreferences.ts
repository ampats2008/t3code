import { EDITORS, EditorId, LocalApi } from "@t3tools/contracts";
import { getLocalStorageItem, setLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";
import { useMemo } from "react";
import { sendInspectorMessage } from "./hooks/useInspectorWs";

const LAST_EDITOR_KEY = "t3code:last-editor";

export function usePreferredEditor(availableEditors: ReadonlyArray<EditorId>) {
  const [lastEditor, setLastEditor] = useLocalStorage(LAST_EDITOR_KEY, null, EditorId);

  const effectiveEditor = useMemo(() => {
    if (lastEditor && availableEditors.includes(lastEditor)) return lastEditor;
    return EDITORS.find((editor) => availableEditors.includes(editor.id))?.id ?? null;
  }, [lastEditor, availableEditors]);

  return [effectiveEditor, setLastEditor] as const;
}

export function resolveAndPersistPreferredEditor(
  availableEditors: readonly EditorId[],
): EditorId | null {
  const availableEditorIds = new Set(availableEditors);
  const stored = getLocalStorageItem(LAST_EDITOR_KEY, EditorId);
  if (stored && availableEditorIds.has(stored)) return stored;
  const editor = EDITORS.find((editor) => availableEditorIds.has(editor.id))?.id ?? null;
  if (editor) setLocalStorageItem(LAST_EDITOR_KEY, editor, EditorId);
  return editor ?? null;
}

export async function openInPreferredEditor(api: LocalApi, targetPath: string): Promise<EditorId> {
  const { availableEditors } = await api.server.getConfig();
  const editor = resolveAndPersistPreferredEditor(availableEditors);
  if (!editor) throw new Error("No available editors found.");

  // Send open-file via inspector WS for instant navigation in connected editors
  // (VS Code extension receives this and opens the file immediately).
  // Parse optional line:column from targetPath (e.g. "file.ts:10:5")
  const match = targetPath.match(/^(.+?)(?::(\d+)(?::(\d+))?)?$/);
  if (match) {
    sendInspectorMessage({
      type: "open-file",
      file: match[1],
      ...(match[2] ? { line: Number(match[2]) } : {}),
      ...(match[3] ? { column: Number(match[3]) } : {}),
    });
  }

  await api.shell.openInEditor(targetPath, editor);
  return editor;
}
