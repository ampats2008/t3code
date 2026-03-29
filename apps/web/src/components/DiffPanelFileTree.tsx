import { type ReactNode, memo, useCallback, useMemo, useState } from "react";
import { ChevronRightIcon, ExternalLinkIcon, FolderIcon, FolderClosedIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { VscodeEntryIcon } from "./chat/VscodeEntryIcon";
import { DiffStatLabel, hasNonZeroStat } from "./chat/DiffStatLabel";
import {
  buildTurnDiffTree,
  type TurnDiffTreeNode,
} from "../lib/turnDiffTree";

interface FileEntry {
  path: string;
  additions: number;
  deletions: number;
}

interface DiffPanelFileTreeProps {
  files: readonly FileEntry[];
  collapsedFiles: ReadonlySet<string>;
  resolvedTheme: "light" | "dark";
  onToggleFile: (filePath: string) => void;
  /**
   * When provided, file nodes become expandable: clicking a file toggles its
   * diff inline below the tree row.  The callback receives the file path and
   * must return the rendered diff content (e.g. a `<FileDiff>`).
   */
  renderFileDiff?: (filePath: string) => ReactNode;
  /** When provided, a hover-visible "open in editor" button appears on each file row. */
  onOpenFile?: (filePath: string) => void;
}

export const DiffPanelFileTree = memo(function DiffPanelFileTree(
  props: DiffPanelFileTreeProps,
) {
  const {
    files,
    collapsedFiles,
    resolvedTheme,
    onToggleFile,
    renderFileDiff,
    onOpenFile,
  } = props;

  const treeNodes = useMemo(
    () =>
      buildTurnDiffTree(
        files as { path: string; additions?: number; deletions?: number }[],
      ),
    [files],
  );

  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>(
    {},
  );

  const toggleDir = useCallback((dirPath: string) => {
    setExpandedDirs((prev) => ({
      ...prev,
      [dirPath]: !(prev[dirPath] ?? true),
    }));
  }, []);

  const renderNode = (
    node: TurnDiffTreeNode,
    depth: number,
  ): ReactNode => {
    const indent = 6 + depth * 14;

    if (node.kind === "directory") {
      const isExpanded = expandedDirs[node.path] ?? true;
      return (
        <div key={`dir:${node.path}`}>
          <button
            type="button"
            className="group flex w-full items-center gap-1.5 rounded-sm py-[3px] pr-2 text-left hover:bg-accent/50"
            style={{ paddingLeft: `${indent}px` }}
            onClick={() => toggleDir(node.path)}
          >
            <ChevronRightIcon
              className={cn(
                "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                isExpanded && "rotate-90",
              )}
            />
            {isExpanded ? (
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
            ) : (
              <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
            )}
            <span className="truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground/90">
              {node.name}
            </span>
            {hasNonZeroStat(node.stat) && (
              <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
                <DiffStatLabel
                  additions={node.stat.additions}
                  deletions={node.stat.deletions}
                />
              </span>
            )}
          </button>
          {isExpanded &&
            node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      );
    }

    // ---- file node ----
    const isCollapsed = collapsedFiles.has(node.path);
    const hasInlineDiff = !!renderFileDiff;

    return (
      <div key={`file:${node.path}`} data-diff-file-path={node.path}>
        <div
          className={cn(
            "group flex w-full items-center rounded-sm hover:bg-accent/50",
            hasInlineDiff && !isCollapsed && "bg-accent/30",
          )}
        >
          <button
            type="button"
            className="flex min-w-0 overflow-hidden items-center gap-1.5 py-[3px] text-left"
            style={{ paddingLeft: `${hasInlineDiff ? indent : indent + 17}px`, paddingRight: "4px" }}
            onClick={() => onToggleFile(node.path)}
            title={node.path}
          >
            {hasInlineDiff && (
              <ChevronRightIcon
                className={cn(
                  "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                  !isCollapsed && "rotate-90",
                )}
              />
            )}
            <VscodeEntryIcon
              pathValue={node.path}
              kind="file"
              theme={resolvedTheme}
              className="size-3.5 shrink-0"
            />
            <span
              className={cn(
                "truncate font-mono text-[11px]",
                isCollapsed
                  ? "text-muted-foreground/60"
                  : "text-muted-foreground/90 group-hover:text-foreground/90",
              )}
            >
              {node.name}
            </span>
          </button>
          {onOpenFile && (
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 opacity-0 transition-[opacity,colors] group-hover:opacity-100 hover:bg-foreground/10"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFile(node.path);
              }}
              title="Open in editor"
              aria-label="Open in editor"
            >
              <ExternalLinkIcon className="size-3 text-muted-foreground/60" />
            </button>
          )}
          {node.stat && hasNonZeroStat(node.stat) && (
            <span className="ml-auto shrink-0 pl-1 pr-2 font-mono text-[10px] tabular-nums">
              <DiffStatLabel
                additions={node.stat.additions}
                deletions={node.stat.deletions}
              />
            </span>
          )}
        </div>
        {hasInlineDiff && !isCollapsed && (
          <div className="mt-1 mb-2 rounded-md">
            {renderFileDiff(node.path)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="py-0.5">
      {treeNodes.map((node) => renderNode(node, 0))}
    </div>
  );
});
