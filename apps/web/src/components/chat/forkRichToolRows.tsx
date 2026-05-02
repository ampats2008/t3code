/**
 * 2AM-Code fork: Rich expandable row components for Grep, Glob, Write, and TodoWrite.
 * Also enhances the Edit summary with an inline diff snippet.
 * Kept in a separate file to minimize upstream merge conflicts.
 */

import { memo, useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  FileTextIcon,
  FolderSearchIcon,
  ListTodoIcon,
  SearchIcon,
  SquarePenIcon,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";
import { type WorkLogEntry } from "../../session-logic";
import { type ForkToolDisplayMode } from "./forkToolCallClassification";

interface ForkRichToolRowProps {
  workEntry: WorkLogEntry;
  displayMode: ForkToolDisplayMode;
  workspaceRoot: string | undefined;
}

export const ForkRichToolRow = memo(function ForkRichToolRow(props: ForkRichToolRowProps) {
  const { workEntry, displayMode, workspaceRoot } = props;
  const [open, setOpen] = useState(false);

  const Icon = displayModeIcon(displayMode);
  const summary = renderSummary(workEntry, displayMode, workspaceRoot);
  const hasDetail = hasDetailContent(workEntry, displayMode);

  if (!hasDetail) {
    // Non-expandable: just show the summary
    return (
      <div className="rounded-lg px-1 py-1">
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/70">
            <Icon className="size-3" />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">{summary}</div>
          <StatusDot status={workEntry.status} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg px-1 py-1">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/40">
          <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/70">
            <Icon className="size-3" />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">{summary}</div>
          <StatusDot status={workEntry.status} />
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground/40 transition-transform duration-150",
              open && "rotate-90",
            )}
          />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="mt-1 pl-7">
            {displayMode === "rich-grep" && <GrepDetail workEntry={workEntry} />}
            {displayMode === "rich-glob" && <GlobDetail workEntry={workEntry} />}
            {displayMode === "rich-write" && <WriteDetail workEntry={workEntry} />}
            {displayMode === "rich-todo" && <TodoDetail workEntry={workEntry} />}
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  );
});

/* ---------- Icons ---------- */

function displayModeIcon(mode: ForkToolDisplayMode) {
  switch (mode) {
    case "rich-grep":
      return SearchIcon;
    case "rich-glob":
      return FolderSearchIcon;
    case "rich-write":
      return FileTextIcon;
    case "rich-todo":
      return ListTodoIcon;
    default:
      return SquarePenIcon;
  }
}

/* ---------- Status indicator ---------- */

function StatusDot(props: { status?: WorkLogEntry["status"] }) {
  const { status } = props;
  if (status === "inProgress") {
    return <span className="size-2 shrink-0 animate-pulse rounded-full bg-blue-400" />;
  }
  if (status === "completed") {
    return <CheckIcon className="size-3 shrink-0 text-green-500/70" />;
  }
  if (status === "failed") {
    return <CircleAlertIcon className="size-3 shrink-0 text-red-500/70" />;
  }
  return null;
}

/* ---------- Has detail content check ---------- */

function hasDetailContent(workEntry: WorkLogEntry, displayMode: ForkToolDisplayMode): boolean {
  const result = extractResultText(workEntry.data?.result);
  switch (displayMode) {
    case "rich-grep":
    case "rich-glob":
    case "rich-write":
      return result !== undefined;
    case "rich-todo":
      return Array.isArray(workEntry.data?.input?.todos);
    default:
      return false;
  }
}

/* ---------- Summaries ---------- */

function renderSummary(
  workEntry: WorkLogEntry,
  displayMode: ForkToolDisplayMode,
  workspaceRoot: string | undefined,
) {
  switch (displayMode) {
    case "rich-grep":
      return <GrepSummary workEntry={workEntry} workspaceRoot={workspaceRoot} />;
    case "rich-glob":
      return <GlobSummary workEntry={workEntry} workspaceRoot={workspaceRoot} />;
    case "rich-write":
      return <WriteSummary workEntry={workEntry} workspaceRoot={workspaceRoot} />;
    case "rich-todo":
      return <TodoSummary workEntry={workEntry} />;
    default:
      return null;
  }
}

/* ---------- Grep ---------- */

function GrepSummary(props: { workEntry: WorkLogEntry; workspaceRoot: string | undefined }) {
  const input = props.workEntry.data?.input;
  const pattern = asString(input?.pattern) ?? "";
  const searchPath = asString(input?.path);
  const glob = asString(input?.glob);

  return (
    <p className="truncate text-[11px] leading-5">
      <span className="text-foreground/80">Grep</span>
      <span className="ml-1.5 font-mono text-muted-foreground/70">
        /{truncate(pattern, 40)}/
      </span>
      {(searchPath || glob) && (
        <span className="text-muted-foreground/50">
          {" "}
          in {truncate(toRelative(searchPath ?? glob ?? "", props.workspaceRoot), 40)}
        </span>
      )}
    </p>
  );
}

function GrepDetail(props: { workEntry: WorkLogEntry }) {
  const output = extractResultText(props.workEntry.data?.result);
  return (
    <div className="pb-1">
      {output ? (
        <pre className="max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed text-foreground/75">
          {output}
        </pre>
      ) : (
        <p className="text-[10px] italic text-muted-foreground/40">No matches</p>
      )}
    </div>
  );
}

/* ---------- Glob ---------- */

function GlobSummary(props: { workEntry: WorkLogEntry; workspaceRoot: string | undefined }) {
  const input = props.workEntry.data?.input;
  const pattern = asString(input?.pattern) ?? "";
  const searchPath = asString(input?.path);

  return (
    <p className="truncate text-[11px] leading-5">
      <span className="text-foreground/80">Glob</span>
      <span className="ml-1.5 font-mono text-muted-foreground/70">
        {truncate(pattern, 50)}
      </span>
      {searchPath && (
        <span className="text-muted-foreground/50">
          {" "}
          in {truncate(toRelative(searchPath, props.workspaceRoot), 40)}
        </span>
      )}
    </p>
  );
}

function GlobDetail(props: { workEntry: WorkLogEntry }) {
  const output = extractResultText(props.workEntry.data?.result);
  return (
    <div className="pb-1">
      {output ? (
        <pre className="max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed text-foreground/75">
          {output}
        </pre>
      ) : (
        <p className="text-[10px] italic text-muted-foreground/40">No matches</p>
      )}
    </div>
  );
}

/* ---------- Write ---------- */

function WriteSummary(props: { workEntry: WorkLogEntry; workspaceRoot: string | undefined }) {
  const input = props.workEntry.data?.input;
  const filePath = asString(input?.file_path) ?? "";
  const rel = toRelative(filePath, props.workspaceRoot);

  return (
    <p className="truncate text-[11px] leading-5">
      <span className="text-foreground/80">Write</span>
      <span className="ml-1.5 font-mono text-muted-foreground/70">{rel}</span>
    </p>
  );
}

function WriteDetail(props: { workEntry: WorkLogEntry }) {
  const output = extractResultText(props.workEntry.data?.result);
  return (
    <div className="pb-1">
      {output ? (
        <pre className="max-h-[200px] overflow-y-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed text-foreground/75">
          {output}
        </pre>
      ) : (
        <p className="text-[10px] italic text-muted-foreground/40">No output</p>
      )}
    </div>
  );
}

/* ---------- TodoWrite ---------- */

function TodoSummary(props: { workEntry: WorkLogEntry }) {
  const todos = props.workEntry.data?.input?.todos;
  const count = Array.isArray(todos) ? todos.length : 0;

  return (
    <p className="truncate text-[11px] leading-5">
      <span className="text-foreground/80">TodoWrite</span>
      <span className="ml-1.5 text-muted-foreground/70">
        {count} item{count === 1 ? "" : "s"}
      </span>
    </p>
  );
}

interface TodoItem {
  content?: string;
  status?: string;
}

function TodoDetail(props: { workEntry: WorkLogEntry }) {
  const todos = props.workEntry.data?.input?.todos as TodoItem[] | undefined;
  if (!todos || !Array.isArray(todos)) return null;

  return (
    <div className="space-y-0.5 pb-1">
      {todos.map((todo, i) => {
        const status = todo.status ?? "pending";
        return (
          <div key={i} className="flex items-start gap-1.5 text-[11px]">
            <span
              className={cn(
                "mt-0.5 size-3 shrink-0 rounded-sm border text-center text-[8px] leading-3",
                status === "completed"
                  ? "border-green-500/50 bg-green-500/15 text-green-400"
                  : status === "in_progress"
                    ? "border-blue-400/50 bg-blue-400/15 text-blue-400"
                    : "border-border/60 bg-muted/30 text-muted-foreground/40",
              )}
            >
              {status === "completed" ? "✓" : status === "in_progress" ? "›" : " "}
            </span>
            <span
              className={cn(
                "text-foreground/70",
                status === "completed" && "line-through text-muted-foreground/50",
              )}
            >
              {todo.content ?? ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Shared utilities ---------- */

function extractResultText(result: unknown): string | undefined {
  if (result === undefined || result === null) return undefined;
  if (typeof result === "string") return result;
  if (typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    const content = r.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter(
          (block): block is { type: string; text: string } =>
            typeof block === "object" &&
            block !== null &&
            (block as Record<string, unknown>).type === "text",
        )
        .map((block) => block.text)
        .join("\n\n");
    }
  }
  return JSON.stringify(result, null, 2);
}

function toRelative(filePath: string, workspaceRoot: string | undefined): string {
  const normFile = filePath.replace(/\\/g, "/");
  if (!workspaceRoot) {
    const last = normFile.lastIndexOf("/");
    return last >= 0 ? normFile.slice(last + 1) : normFile;
  }
  const normRoot = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  if (normFile.startsWith(normRoot + "/")) {
    return normFile.slice(normRoot.length + 1);
  }
  const last = normFile.lastIndexOf("/");
  return last >= 0 ? normFile.slice(last + 1) : normFile;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1) + "…";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
