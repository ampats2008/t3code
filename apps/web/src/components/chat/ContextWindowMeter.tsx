import { cn } from "~/lib/utils";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

function formatPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

function formatCost(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value < 0.01) {
    return "<$0.01";
  }
  if (value < 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(2)}`;
}

export function ContextWindowMeter(props: { usage: ContextWindowSnapshot }) {
  const { usage } = props;
  const usedPercentage = formatPercentage(usage.usedPercentage);
  const normalizedPercentage = Math.max(0, Math.min(100, usage.usedPercentage ?? 0));
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (normalizedPercentage / 100) * circumference;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className="group inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-85"
            aria-label={
              usage.maxTokens !== null && usedPercentage
                ? `Context window ${usedPercentage} used`
                : `Context window ${formatContextWindowTokens(usage.usedTokens)} tokens used`
            }
          >
            <span className="relative flex h-6 w-6 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="-rotate-90 absolute inset-0 h-full w-full transform-gpu"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="color-mix(in oklab, var(--color-muted) 70%, transparent)"
                  strokeWidth="3"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="var(--color-muted-foreground)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>
              <span
                className={cn(
                  "relative flex h-[15px] w-[15px] items-center justify-center rounded-full bg-background text-[8px] font-medium",
                  "text-muted-foreground",
                )}
              >
                {usage.usedPercentage !== null
                  ? Math.round(usage.usedPercentage)
                  : formatContextWindowTokens(usage.usedTokens)}
              </span>
            </span>
          </button>
        }
      />
      <PopoverPopup tooltipStyle side="top" align="end" className="w-max max-w-none px-3 py-2">
        <div className="space-y-3 leading-tight">
          {/* ── Context window ── */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Context window
            </div>
            {usage.maxTokens !== null && usedPercentage ? (
              <div className="whitespace-nowrap text-xs font-medium text-foreground">
                <span>{usedPercentage}</span>
                <span className="mx-1">⋅</span>
                <span>{formatContextWindowTokens(usage.usedTokens)}</span>
                <span>/</span>
                <span>{formatContextWindowTokens(usage.maxTokens ?? null)} context used</span>
              </div>
            ) : (
              <div className="text-sm text-foreground">
                {formatContextWindowTokens(usage.usedTokens)} tokens used so far
              </div>
            )}
            {(usage.totalProcessedTokens ?? null) !== null &&
            (usage.totalProcessedTokens ?? 0) > usage.usedTokens ? (
              <div className="text-xs text-muted-foreground">
                Total processed: {formatContextWindowTokens(usage.totalProcessedTokens ?? null)}{" "}
                tokens
              </div>
            ) : null}
            {usage.compactsAutomatically ? (
              <div className="text-xs text-muted-foreground">
                Automatically compacts its context when needed.
              </div>
            ) : null}
          </div>

          {/* ── Session cost ── */}
          {formatCost(usage.totalCostUsd) !== null ? (
            <div className="space-y-1.5 border-t border-border pt-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Session cost
              </div>
              <div className="whitespace-nowrap text-xs font-medium text-foreground">
                {formatCost(usage.totalCostUsd)} total
              </div>
              {usage.lastUsedTokens !== null && (
                <div className="flex justify-between gap-6 text-xs text-muted-foreground">
                  <span>This turn</span>
                  <span>{formatContextWindowTokens(usage.lastUsedTokens ?? null)} tokens</span>
                </div>
              )}
            </div>
          ) : null}

          {/* ── Prompt cache ── */}
          {usage.cacheHitPercentage !== null ? (
            <div className="space-y-1.5 border-t border-border pt-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Prompt cache
              </div>
              <div className="whitespace-nowrap text-xs font-medium text-foreground">
                {formatPercentage(usage.cacheHitPercentage)} cached
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.min(100, usage.cacheHitPercentage ?? 0)}%` }}
                />
              </div>
              {usage.cachedInputTokens !== null && usage.inputTokens !== null ? (
                <div className="flex justify-between gap-6 text-xs text-muted-foreground">
                  <span>{formatContextWindowTokens(usage.cachedInputTokens ?? null)} cached</span>
                  <span>
                    {formatContextWindowTokens(
                      ((usage.inputTokens ?? 0) as number) - ((usage.cachedInputTokens ?? 0) as number),
                    )}{" "}
                    fresh
                  </span>
                </div>
              ) : null}
              {(usage.cacheHitPercentage ?? 100) < 10 ? (
                <div className="text-xs text-yellow-500">
                  Low cache rate — responses may be slower &amp; costlier.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
