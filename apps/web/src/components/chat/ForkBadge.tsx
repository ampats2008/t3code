import { GitForkIcon } from "lucide-react";
import type { ThreadForkInfo, ThreadId } from "@t3tools/contracts";
import { Badge } from "../ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

interface ForkBadgeProps {
  forks: ThreadForkInfo[];
  onNavigate: (threadId: ThreadId) => void;
}

export function ForkBadge({ forks, onNavigate }: ForkBadgeProps) {
  if (forks.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger className="inline-flex">
        <Badge variant="outline" className="cursor-pointer gap-1 text-[10px] hover:bg-accent">
          <GitForkIcon className="size-3" />
          Forked{forks.length > 1 ? ` (${forks.length})` : ""}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          <p className="px-1 text-xs font-medium text-muted-foreground">Forked threads</p>
          {forks
            .toSorted((a, b) => a.forkNumber - b.forkNumber)
            .map((fork) => (
              <button
                key={fork.forkedThreadId}
                type="button"
                className="w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                onClick={() => onNavigate(fork.forkedThreadId)}
              >
                {fork.forkedThreadTitle}
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
