import {
  type ProjectEntry,
  type ProviderKind,
  type ConversationSearchResult,
  type ProjectId,
} from "@t3tools/contracts";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type ComposerSlashCommand, type ComposerTriggerKind } from "../../composer-logic";
import { BotIcon, MessagesSquareIcon, ZapIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Command, CommandItem, CommandList } from "../ui/command";
import { VscodeEntryIcon } from "./VscodeEntryIcon";
import { readNativeApi } from "../../nativeApi";

export type ComposerCommandItem =
  | {
      id: string;
      type: "path";
      path: string;
      pathKind: ProjectEntry["kind"];
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "slash-command";
      command: ComposerSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "skill";
      name: string;
      label: string;
      description: string;
      argumentHint: string;
    }
  | {
      id: string;
      type: "model";
      provider: ProviderKind;
      model: string;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "thread-result";
      threadId: string;
      threadTitle: string;
      updatedAt: string;
      snippet: string;
    };

type ThreadSearchFilter = "all" | "active" | "archived";

function formatRelativeDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  } catch {
    return "";
  }
}

const FILTER_LABELS: Record<ThreadSearchFilter, string> = {
  all: "All",
  active: "Active",
  archived: "Archived",
};

const ThreadSearchMenu = memo(function ThreadSearchMenu(props: {
  projectId: ProjectId | null;
  initialQuery: string;
  onSelect: (item: Extract<ComposerCommandItem, { type: "thread-result" }>) => void;
}) {
  const [query, setQuery] = useState(props.initialQuery);
  const [filter, setFilter] = useState<ThreadSearchFilter>("all");
  const [results, setResults] = useState<ConversationSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = useCallback(
    (q: string, f: ThreadSearchFilter) => {
      const api = readNativeApi();
      if (!api || !props.projectId) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      api.orchestration
        .searchConversations({
          projectId: props.projectId,
          query: q,
          limit: 20,
          filter: f === "all" ? undefined : f,
        })
        .then((response) => {
          setResults([...response.results]);
          setActiveItemIndex(0);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setIsSearching(false);
        });
    },
    [props.projectId],
  );

  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      runSearch(query, filter);
    }, 200);
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, filter, runSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveItemIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveItemIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const result = results[activeItemIndex];
        if (result) {
          props.onSelect({
            id: `thread:${result.threadId}`,
            type: "thread-result",
            threadId: result.threadId,
            threadTitle: result.threadTitle,
            updatedAt: result.updatedAt,
            snippet: result.matches[0]?.snippet ?? "",
          });
        }
      }
    },
    [results, activeItemIndex, props],
  );

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/80 bg-popover/96 shadow-lg/8 backdrop-blur-xs">
      {/* Search input */}
      <div className="flex items-center border-b border-border/50 px-3 py-2">
        <MessagesSquareIcon className="mr-2 size-4 shrink-0 text-muted-foreground/70" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search threads..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border/50 px-2 py-1">
        {(["all", "active", "archived"] as ThreadSearchFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors",
              filter === f
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="max-h-64 overflow-y-auto">
        {results.length === 0 ? (
          <p className="px-3 py-2 text-muted-foreground/70 text-xs">
            {isSearching ? "Searching threads..." : query ? "No matching threads." : "Type to search threads..."}
          </p>
        ) : (
          results.map((result, index) => (
            <div
              key={result.threadId}
              className={cn(
                "cursor-pointer px-3 py-2 transition-colors",
                index === activeItemIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveItemIndex(index)}
              onClick={() =>
                props.onSelect({
                  id: `thread:${result.threadId}`,
                  type: "thread-result",
                  threadId: result.threadId,
                  threadTitle: result.threadTitle,
                  updatedAt: result.updatedAt,
                  snippet: result.matches[0]?.snippet ?? "",
                })
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">{result.threadTitle}</span>
                <span className="shrink-0 text-muted-foreground/60 text-xs">
                  {formatRelativeDate(result.updatedAt)}
                </span>
              </div>
              {result.matches[0]?.snippet ? (
                <p className="mt-0.5 truncate text-muted-foreground/70 text-xs">
                  {result.matches[0].snippet}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

export const ComposerCommandMenu = memo(function ComposerCommandMenu(props: {
  items: ComposerCommandItem[];
  resolvedTheme: "light" | "dark";
  isLoading: boolean;
  triggerKind: ComposerTriggerKind | null;
  triggerQuery: string;
  projectId: ProjectId | null;
  activeItemId: string | null;
  onHighlightedItemChange: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  if (props.triggerKind === "thread-mention") {
    return (
      <ThreadSearchMenu
        projectId={props.projectId}
        initialQuery={props.triggerQuery}
        onSelect={props.onSelect}
      />
    );
  }

  return (
    <Command
      mode="none"
      onItemHighlighted={(highlightedValue) => {
        props.onHighlightedItemChange(
          typeof highlightedValue === "string" ? highlightedValue : null,
        );
      }}
    >
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-popover/96 shadow-lg/8 backdrop-blur-xs">
        <CommandList className="max-h-64">
          {props.items.map((item) => (
            <ComposerCommandMenuItem
              key={item.id}
              item={item}
              resolvedTheme={props.resolvedTheme}
              isActive={props.activeItemId === item.id}
              onSelect={props.onSelect}
            />
          ))}
        </CommandList>
        {props.items.length === 0 && (
          <p className="px-3 py-2 text-muted-foreground/70 text-xs">
            {props.isLoading
              ? "Searching workspace files..."
              : props.triggerKind === "path"
                ? "No matching files or folders."
                : "No matching command."}
          </p>
        )}
      </div>
    </Command>
  );
});

const ComposerCommandMenuItem = memo(function ComposerCommandMenuItem(props: {
  item: ComposerCommandItem;
  resolvedTheme: "light" | "dark";
  isActive: boolean;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  return (
    <CommandItem
      value={props.item.id}
      className={cn(
        "cursor-pointer select-none gap-2",
        props.isActive && "bg-accent text-accent-foreground",
      )}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        props.onSelect(props.item);
      }}
    >
      {props.item.type === "path" ? (
        <VscodeEntryIcon
          pathValue={props.item.path}
          kind={props.item.pathKind}
          theme={props.resolvedTheme}
        />
      ) : null}
      {props.item.type === "slash-command" ? (
        <BotIcon className="size-4 shrink-0 text-muted-foreground/80" />
      ) : null}
      {props.item.type === "skill" ? (
        <ZapIcon className="size-4 shrink-0 text-muted-foreground/80" />
      ) : null}
      {props.item.type === "model" ? (
        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
          model
        </Badge>
      ) : null}
      {props.item.type === "thread-result" ? (
        <MessagesSquareIcon className="size-4 shrink-0 text-muted-foreground/80" />
      ) : null}
      {"label" in props.item ? (
        <span className="shrink-0 items-center gap-1.5 whitespace-nowrap">{props.item.label}</span>
      ) : (
        <span className="shrink-0 items-center gap-1.5 whitespace-nowrap">{props.item.threadTitle}</span>
      )}
      {"description" in props.item ? (
        <span className="min-w-0 truncate text-muted-foreground/70 text-xs">{props.item.description}</span>
      ) : null}
    </CommandItem>
  );
});
