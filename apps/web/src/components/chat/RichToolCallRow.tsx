import { memo, useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  HammerIcon,
  SquarePenIcon,
  TerminalIcon,
  ZapIcon,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";
import { type WorkLogEntry } from "../../session-logic";
import { type ToolDisplayMode } from "./toolCallClassification";

interface RichToolCallRowProps {
  workEntry: WorkLogEntry;
  displayMode: ToolDisplayMode;
}

interface SkillInput {
  skill?: string; // Used by Claude provider
  args?: string;
  [key: string]: unknown; // For future providers
}

export const RichToolCallRow = memo(function RichToolCallRow(props: RichToolCallRowProps) {
  const { workEntry, displayMode } = props;
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg px-1 py-1">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/40 text-left">
          <SummaryLine workEntry={workEntry} displayMode={displayMode} open={open} />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="mt-1 pl-7">
            {displayMode === "rich-agent" && <AgentDetail workEntry={workEntry} />}
            {displayMode === "rich-bash" && <BashDetail workEntry={workEntry} />}
            {displayMode === "rich-edit" && <EditDetail workEntry={workEntry} />}
            {displayMode === "rich-skill" && <SkillDetail workEntry={workEntry} />}
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
  let Icon = SquarePenIcon;
  if (displayMode === "rich-agent") Icon = HammerIcon;
  else if (displayMode === "rich-bash") Icon = TerminalIcon;
  else if (displayMode === "rich-skill") Icon = ZapIcon;

  return (
    <>
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/70">
        <Icon className="size-3" />
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        {displayMode === "rich-agent" && <AgentSummary workEntry={workEntry} />}
        {displayMode === "rich-bash" && <BashSummary workEntry={workEntry} />}
        {displayMode === "rich-edit" && <EditSummary workEntry={workEntry} />}
        {displayMode === "rich-skill" && <SkillSummary workEntry={workEntry} />}
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
  const output = extractToolResultText(result);

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
      {output !== undefined && (
        <div>
          <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">Result</p>
          <pre className="max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed text-foreground/75">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ---------- Shared result extractor ---------- */

/**
 * Unwraps a tool_result envelope into a plain display string.
 * Handles: plain string, { content: string }, { content: [{type,text},...] }
 */
function extractToolResultText(result: unknown): string | undefined {
  if (result === undefined || result === null) return undefined;
  if (typeof result === "string") return result;
  if (typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    const content = r.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((block): block is { type: string; text: string } =>
          typeof block === "object" && block !== null && (block as Record<string, unknown>).type === "text",
        )
        .map((block) => block.text)
        .join("\n\n");
    }
  }
  return JSON.stringify(result, null, 2);
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
  const output = extractToolResultText(workEntry.data?.result);

  return (
    <div className="pb-1">
      {output ? (
        <pre className="max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed text-foreground/75">
          {output}
        </pre>
      ) : (
        <p className="text-[10px] text-muted-foreground/40 italic">No output</p>
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

/* ---------- Skill ---------- */

function SkillSummary(props: { workEntry: WorkLogEntry }) {
  const { workEntry } = props;
  const input = workEntry.data?.input as SkillInput | undefined;
  const skillName = input?.skill ?? "";
  const args = input?.args ?? "";

  return (
    <div className="flex flex-col gap-0.5">
      <p className="truncate text-[11px] leading-5 text-foreground/80">
        <span className="text-foreground/60">Skill</span>
        <span className="text-foreground/50"> - </span>
        <span>{skillName}</span>
      </p>
      {args && <p className="truncate text-[10px] text-foreground/50">{args}</p>}
    </div>
  );
}

function SkillDetail(props: { workEntry: WorkLogEntry }) {
  const { workEntry } = props;
  const input = workEntry.data?.input as SkillInput | undefined;
  const result = workEntry.data?.result;
  const skillName = input?.skill ?? "";
  const args = input?.args ?? "";

  return (
    <div className="space-y-2 pb-1">
      {skillName && (
        <div className="flex gap-2 text-[11px]">
          <span className="shrink-0 text-muted-foreground/60">name:</span>
          <span className="text-foreground/70">{skillName}</span>
        </div>
      )}
      {args && <TruncatedBlock label="Arguments" text={args} />}
      {result !== undefined && (
        <TruncatedBlock
          label="Result"
          text={typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        />
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
