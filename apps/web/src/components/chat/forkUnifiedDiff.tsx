/**
 * 2AM-Code fork: Unified diff viewer for Edit tool calls.
 * Reuses the existing @pierre/diffs FileDiff component for consistent rendering
 * with the DiffPanel. Generates a unified diff patch from old_string/new_string
 * and renders it inline.
 */

import { useMemo } from "react";
import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { resolveDiffThemeName } from "../../lib/diffRendering";
import { useTheme } from "../../hooks/useTheme";
import { buildPatchCacheKey } from "../../lib/diffRendering";

const INLINE_DIFF_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;

  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));

  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--success));

  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--destructive));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--destructive));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: color-mix(
    in srgb,
    var(--background) 80%,
    var(--destructive)
  );

  background-color: var(--diffs-bg) !important;
}

[data-file-info] {
  display: none !important;
}
`;

interface InlineEditDiffProps {
  oldString: string;
  newString: string;
  filePath?: string | undefined;
}

export function InlineEditDiff(props: InlineEditDiffProps) {
  const { oldString, newString, filePath } = props;
  const { resolvedTheme } = useTheme();

  const fileDiff = useMemo(() => {
    if (!oldString && !newString) return null;
    const patch = buildUnifiedPatch(oldString, newString, filePath ?? "file");
    try {
      const parsed = parsePatchFiles(patch, buildPatchCacheKey(patch, "inline-edit-diff"));
      const files = parsed.flatMap((p) => p.files);
      return files[0] ?? null;
    } catch {
      return null;
    }
  }, [oldString, newString, filePath]);

  if (!fileDiff) return null;

  return (
    <div className="overflow-hidden rounded-md">
      <FileDiff
        fileDiff={fileDiff}
        options={{
          diffStyle: "unified",
          lineDiffType: "none",
          overflow: "wrap",
          theme: resolveDiffThemeName(resolvedTheme),
          themeType: resolvedTheme as "light" | "dark",
          unsafeCSS: INLINE_DIFF_CSS,
          disableFileHeader: true,
        }}
      />
    </div>
  );
}

/**
 * Build a minimal unified diff patch string from two text blocks.
 * Uses a simple LCS-based diff to produce proper context/addition/deletion lines.
 */
function buildUnifiedPatch(oldStr: string, newStr: string, fileName: string): string {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  // Remove trailing empty line from split if the string ends with \n
  if (oldLines.length > 1 && oldLines[oldLines.length - 1] === "") oldLines.pop();
  if (newLines.length > 1 && newLines[newLines.length - 1] === "") newLines.pop();

  const lcs = computeLCS(oldLines, newLines);
  const hunks: string[] = [];

  let oldIdx = 0;
  let newIdx = 0;

  for (const [lcsOldIdx, lcsNewIdx] of lcs) {
    while (oldIdx < lcsOldIdx) {
      hunks.push(`-${oldLines[oldIdx]}`);
      oldIdx++;
    }
    while (newIdx < lcsNewIdx) {
      hunks.push(`+${newLines[newIdx]}`);
      newIdx++;
    }
    hunks.push(` ${oldLines[oldIdx]}`);
    oldIdx++;
    newIdx++;
  }

  while (oldIdx < oldLines.length) {
    hunks.push(`-${oldLines[oldIdx]}`);
    oldIdx++;
  }
  while (newIdx < newLines.length) {
    hunks.push(`+${newLines[newIdx]}`);
    newIdx++;
  }

  const header = [
    `--- a/${fileName}`,
    `+++ b/${fileName}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
  ];

  return [...header, ...hunks].join("\n") + "\n";
}

function computeLCS(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  const result: [number, number][] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  result.reverse();
  return result;
}
