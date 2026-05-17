import { ChevronRightIcon, GitBranchIcon } from "lucide-react";

export interface BreadcrumbSegment {
  threadId: string;
  title: string;
}

interface BranchBreadcrumbsProps {
  /** Ancestry chain from root to current thread */
  segments: BreadcrumbSegment[];
  onNavigate: (threadId: string) => void;
}

/**
 * Shows fork ancestry as clickable breadcrumbs in the header area.
 * Only renders when the current thread is a fork (segments.length > 1).
 */
export function BranchBreadcrumbs({ segments, onNavigate }: BranchBreadcrumbsProps) {
  if (segments.length <= 1) return null;

  return (
    <div className="flex items-center gap-0.5 overflow-hidden text-[11px]">
      <GitBranchIcon className="size-3 shrink-0 text-muted-foreground/50" />
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        // For long chains, show ellipsis for middle segments
        const isHidden = segments.length > 3 && i > 0 && i < segments.length - 2;
        const showEllipsis = segments.length > 3 && i === 1;

        if (isHidden && !showEllipsis) return null;

        return (
          <span key={segment.threadId} className="flex items-center gap-0.5">
            {i > 0 && <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/30" />}
            {showEllipsis && isHidden ? (
              <span className="text-muted-foreground/40">...</span>
            ) : isLast ? (
              <span className="truncate font-medium text-foreground/80" title={segment.title}>
                {segment.title}
              </span>
            ) : (
              <button
                type="button"
                className="max-w-28 truncate text-muted-foreground/60 transition-colors hover:text-foreground/80"
                onClick={() => onNavigate(segment.threadId)}
                title={segment.title}
              >
                {segment.title}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
