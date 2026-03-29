/**
 * Compute the set of file paths that should start collapsed in the diff panel.
 * When `diffDefaultCollapsed` is true, all files are collapsed **except** the
 * `selectedFilePath` (if any) so the user immediately sees the file they clicked.
 */
export function computeDefaultCollapsedFiles(
  filePaths: readonly string[],
  diffDefaultCollapsed: boolean,
  selectedFilePath: string | null,
): Set<string> {
  if (!diffDefaultCollapsed || filePaths.length === 0) {
    return new Set();
  }
  const collapsed = new Set(filePaths);
  if (selectedFilePath) {
    collapsed.delete(selectedFilePath);
  }
  return collapsed;
}
