import { memo, useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  HammerIcon,
  SquarePenIcon,
  TerminalIcon,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";
import { type WorkLogEntry } from "../../session-logic";
import { type ToolDisplayMode } from "./toolCallClassification";

interface RichToolCallRowProps {
  workEntry: WorkLogEntry;
  displayMode: ToolDisplayMode;
}

export const RichToolCallRow = memo(function RichToolCallRow(props: RichToolCallRowProps) {
  const { workEntry, displayMode } = props;
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg px-1 py-1">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
          <SummaryLine workEntry={workEntry} displayMode={displayMode} open={open} />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="mt-1 pl-7">
            {displayMode === "rich-agent" && <AgentDetail workEntry={workEntry} />}
            {displayMode === "rich-bash" && <BashDetail workEntry={workEntry} />}
            {displayMode === "rich-edit" && <EditDetail workEntry={workEntry} />}
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  );
});

/* ---------- Summary line (always visible) ---------- */

function SummaryLine(props: {
  workEntry: WorkLogEntry;
  displayMode: ToolDisplayMode;
  open: boolean;
}) {
  const { workEntry, displayMode, open } = props;
  const Icon = displayMode === "rich-agent" ? HammerIcon : displayMode === "rich-bash" ? TerminalIcon : SquarePenIcon;

  return (
    <>
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/70">
        <Icon className="size-3" />
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        {displayMode === "rich-agent" && <AgentSummary workEntry={workEntry} />}
        {displayMode === "rich-bash" && <BashSummary workEntry={workEntry} />}
        {displayMode === "rich-edit" && <EditSummary workEntry={workEntry} />}
      </div>
      <StatusDot status={workEntry.status} />
      <ChevronRightIcon
        className={cn(
          "size-3 shrink-0 text-muted-foreground/40 transition-transform duration-150",
          open && "rotate-90",
        )}
      />
    </>
  );
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

/* ---------- Agent ---------- */

function AgentSummary(props: { workEntry: WorkLogEntry }) {
  const { workEntry } = props;
  const input = workEntry.data?.input;
  const subagentType = (input?.subagent_type as string) ?? (input?.description ? "Agent" : null);
  const description = (input?.description as string) ?? workEntry.label;

  return (
    <p className="truncate text-[11px] leading-5">
      {subagentType && (
        <span className="mr-1.5 inline-flex items-center rounded border border-border/60 bg-muted/50 px-1 py-px text-[10px] font-medium text-muted-foreground">
          {subagentType}
        </span>
      )}
      <span className="text-foreground/80">{description}</span>
    </p>
  );
}

function AgentDetail(props: { workEntry: WorkLogEntry }) {
  const { workEntry } = props;
  const input = workEntry.data?.input;
  const result = workEntry.data?.result;

  const params = [
    ["subagent_type", input?.subagent_type],
    ["description", input?.description],
    ["isolation", input?.isolation],
    ["run_in_background", input?.run_in_background],
  ].filter(([, v]) => v !== undefined && v !== null) as [string, unknown][];

  const prompt = input?.prompt as string | undefined;

  return (
    <div className="space-y-2 pb-1">
      {params.length > 0 && (
        <div className="space-y-0.5">
          {params.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-[11px]">
              <span className="shrink-0 text-muted-foreground/60">{key}:</span>
              <span className="text-foreground/70">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
      {prompt && <TruncatedBlock label="Prompt" text={prompt} />}
      {result !== undefined && (
        <TruncatedBlock label="Result" text={typeof result === "string" ? result : JSON.stringify(result, null, 2)} />
      )}
    </div>
  );
}

/* ---------- Bash ---------- */

function BashSummary(props: { workEntry: WorkLogEntry }) {
  const { workEntry } = props;
  const command = workEntry.command ?? workEntry.detail ?? workEntry.label;

  return (
    <p className="truncate font-mono text-[11px] leading-5 text-foreground/80">
      <span className="text-muted-foreground/60">$ </span>
      {command}
    </p>
  );
}

function BashDetail(props: { workEntry: WorkLogEntry }) {
  const { workEntry } = props;
  const command = workEntry.command ?? "";
  const output = workEntry.detail ?? "";

  return (
    <div className="space-y-2 pb-1">
      {command && (
        <pre className="rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
          {command}
        </pre>
      )}
      {output && (
        <pre className="max-h-[200px] overflow-y-auto rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground/70">
          {output}
        </pre>
      )}
    </div>
  );
}

/* ---------- Edit ---------- */

function EditSummary(props: { workEntry: WorkLogEntry }) {
  const { workEntry } = props;
  const input = workEntry.data?.input;
  const filePath = (input?.file_path as string) ?? workEntry.changedFiles?.[0] ?? workEntry.label;
  const basename = filePath.split(/[\\/]/).pop() ?? filePath;

  return (
    <p className="truncate text-[11px] leading-5 text-foreground/80" title={filePath}>
      {basename}
    </p>
  );
}

function EditDetail(props: { workEntry: WorkLogEntry }) {
  const { workEntry } = props;
  const input = workEntry.data?.input;
  const filePath = (input?.file_path as string) ?? workEntry.changedFiles?.[0] ?? "";
  const oldString = (input?.old_string as string) ?? "";
  const newString = (input?.new_string as string) ?? "";

  return (
    <div className="space-y-2 pb-1">
      {filePath && (
        <p className="font-mono text-[10px] text-muted-foreground/60">{filePath}</p>
      )}
      {(oldString || newString) && (
        <div className="space-y-1">
          {oldString && (
            <DiffBlock prefix="-" text={oldString} className="bg-red-500/8 text-red-400/80" />
          )}
          {newString && (
            <DiffBlock prefix="+" text={newString} className="bg-green-500/8 text-green-400/80" />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Shared ---------- */

function TruncatedBlock(props: { label: string; text: string }) {
  const { label, text } = props;
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 300;
  const displayText = !expanded && isLong ? text.slice(0, 300) + "..." : text;

  return (
    <div>
      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">
        {label}
      </p>
      <pre className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[11px] leading-relaxed text-foreground/70">
        {displayText}
      </pre>
      {isLong && (
        <button
          type="button"
          className="mt-0.5 text-[10px] text-muted-foreground/50 transition-colors hover:text-foreground/60"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function DiffBlock(props: { prefix: string; text: string; className: string }) {
  const { prefix, text, className } = props;
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 300;
  const displayText = !expanded && isLong ? text.slice(0, 300) + "..." : text;

  return (
    <div>
      <pre
        className={cn(
          "whitespace-pre-wrap rounded-md border border-border/50 p-2 font-mono text-[11px] leading-relaxed",
          className,
        )}
      >
        <span className="select-none opacity-50">{prefix} </span>
        {displayText}
      </pre>
      {isLong && (
        <button
          type="button"
          className="mt-0.5 text-[10px] text-muted-foreground/50 transition-colors hover:text-foreground/60"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
