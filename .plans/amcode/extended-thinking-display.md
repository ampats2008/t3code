# Feature Plan: Enhanced Metrics & Extended Thinking Display

**Date:** 2026-03-28
**Status:** Planned
**Priority:** Medium

## Overview

Add UI support for four high-value metrics in T3Code:

1. **Extended Thinking Display** — Show Claude's actual chain-of-thought reasoning blocks
2. **Cost Tracking** — Display running cost per session/turn (especially for API-key users)
3. **Cache Hit Rate** — Show prompt caching efficiency
4. **Rate Limit Warnings** — Alert users when approaching subscription/rate limits

All features should support all available model providers (Claude, and future providers).

## Current State

### What's Already Implemented (Backend)
- Claude API returns thinking blocks as part of message responses
- `ClaudeAdapter` extracts thinking content and tags it as `"reasoning_text"` (vs `"assistant_text"`)
- Runtime emits thinking blocks as streaming `content.delta` events with `streamKind: "reasoning_text"`
- Extended thinking can be toggled per-model via `alwaysThinkingEnabled` setting
- Test coverage exists for thinking delta streaming (`ClaudeAdapter.test.ts` lines 786-917)

### What's Missing (Frontend)
- No UI component renders `reasoning_text` stream kind
- Thinking blocks are extracted but discarded on the display side
- No collapsible/expandable UI for reasoning content

**Key Files:**
- Backend: `/d/dev/t3code/apps/server/src/provider/Layers/ClaudeAdapter.ts` (lines 652-654, 1524-1575, 2711-2718)
- Runtime types: `/d/dev/t3code/packages/contracts/src/providerRuntime.ts` (lines 77-85)
- Frontend: `/d/dev/t3code/apps/web/src/components/chat/Message*.tsx` (to be identified)

## Requirements

### User-Facing
- [ ] Display thinking blocks in chat messages when extended thinking is enabled
- [ ] Show thinking content visually distinct from final response (different styling, collapsed by default)
- [ ] Support collapsible/expandable reasoning section
- [ ] Stream reasoning content in real-time as it arrives
- [ ] Per-message toggle to expand/collapse reasoning
- [ ] Optional: Show reasoning token count and duration for the thinking block

### Technical
- [ ] Identify message rendering components in web UI
- [ ] Extend message component to handle `reasoning_text` stream kind
- [ ] Add CSS styling for reasoning block (e.g., lighter background, indentation, monospace font)
- [ ] Ensure streaming pipeline properly feeds thinking deltas to UI
- [ ] Handle edge cases (empty thinking, very long reasoning, partial blocks)

## Implementation Approach

### Phase 1: Discovery
1. Locate message rendering components (`apps/web/src/components/chat/Message*.tsx`)
2. Map how `assistant_text` stream kind currently flows to the UI
3. Identify where `reasoning_text` would need to be handled
4. Check for existing collapsible/expandable patterns in codebase

### Phase 2: Core Implementation
1. Extend message content rendering to accept `reasoning_text` blocks
2. Create collapsible reasoning block UI component
3. Add styling (CSS classes or Tailwind)
4. Wire up streaming of `reasoning_text` deltas to the UI
5. Ensure proper state management (expanded/collapsed per message)

### Phase 3: Polish
1. Add thinking token count display (extract from `reasoningOutputTokens`)
2. Test with models that support extended thinking (claude-opus, etc.)
3. Test streaming behavior (thinking arrives before/during final response)
4. Add visual indicators when thinking is in progress

## Files to Modify/Create

| File | Action | Notes |
|------|--------|-------|
| `apps/web/src/components/chat/Message*.tsx` | Modify | Extend to render `reasoning_text` |
| `apps/web/src/components/chat/ReasoningBlock.tsx` | Create | New component for collapsible reasoning |
| `apps/web/src/lib/contextWindow.ts` | Modify | Optional: display reasoning tokens separately |
| `apps/web/src/styles/*.css` | Modify/Create | Styling for reasoning blocks |

## Acceptance Criteria

- [ ] Thinking blocks display in chat messages when extended thinking is enabled
- [ ] Reasoning is collapsible and expandable
- [ ] Streaming of thinking content works in real-time
- [ ] Styling is distinct but not jarring (complements message display)
- [ ] No regression in regular message display
- [ ] Works with multiple concurrent tool uses and responses
- [ ] Handles edge cases gracefully (no thinking, very long reasoning, etc.)

## Design Notes

### Visual Style Options
1. **Collapsible panel** (recommended): Light gray background, small arrow indicator, "Reasoning" label
2. **Indented section**: Slightly indented with left border accent
3. **Nested expansion**: Reasoning inside a details/summary element
4. **Separate card**: Thinking as a separate visual card above the response

Recommend option 1 for consistency with existing UI patterns (likely collapse/expand patterns already in codebase).

## Related Work

- **Metrics to add alongside**: Cost tracking, cache hit rate, rate limit warnings
- **Dependencies**: None (all backend infrastructure exists)
- **Conflicts**: None (additive feature)

## Open Questions

1. Should reasoning be collapsed by default or expanded?
2. Should very long reasoning (1000+ tokens) be truncated with "Show more" button?
3. Should thinking token count be displayed in reasoning header?
4. Should there be a toggle to hide reasoning blocks globally (for cleaner UI)?

## Effort Estimate

- **Discovery**: 1-2 hours (identify components and patterns)
- **Core implementation**: 3-4 hours (rendering, streaming, state)
- **Polish & styling**: 2-3 hours (CSS, edge cases, testing)
- **Total**: 6-9 hours

## Priority Rationale

**Medium priority** because:
- ✅ Full backend infrastructure already exists
- ✅ Users with extended thinking enabled would find this valuable
- ⚠️ Not blocking any core functionality
- ⚠️ Nice-to-have (cost tracking and rate limits may be higher priority)

---

# Feature 2: Cost Tracking & Display

## Overview

Display the running cost of API calls in USD per turn and per session. This is especially valuable for API-key users paying per token and for understanding expensive operations.

## Current State

### What's Already Implemented
- `totalCostUsd` field is extracted from Claude API responses in ClaudeAdapter (lines 1410-1411, 1494-1495)
- Cost data is stored in turn completion event payloads
- Calculations are based on: `(inputTokens * inputCost + outputTokens * outputCost) / 1M`

### What's Missing
- No UI display of cost information
- No per-turn cost breakdown
- No session total cost accumulation
- No cost-per-provider abstraction (only Claude implemented)

**Key Files:**
- Backend: `/d/dev/t3code/apps/server/src/provider/Layers/ClaudeAdapter.ts` (lines 1410-1411, 1494-1495)
- Runtime types: `/d/dev/t3code/packages/contracts/src/providerRuntime.ts` (ThreadTokenUsageSnapshot)
- Frontend: Message and session components (to be identified)

## Requirements

### User-Facing
- [ ] Display cost per turn in message UI (e.g., "$0.12" next to token count)
- [ ] Show cumulative session cost in status bar or session header
- [ ] Cost should be visible but not distracting (small text, muted color)
- [ ] Hover tooltip with cost breakdown (input tokens cost + output tokens cost)
- [ ] Session total cost persists in thread history

### Technical
- [ ] Abstract cost calculation to provider interface (not Claude-specific)
- [ ] Support per-provider pricing configurations
- [ ] Handle missing cost data gracefully (show "—" or hide)
- [ ] Accumulate costs across conversation history
- [ ] Store session total cost in thread metadata

## Implementation Approach

### Phase 1: Data Layer
1. Define provider-agnostic cost interface
2. Create pricing config system (per provider, per model)
3. Ensure cost data flows through ThreadTokenUsageSnapshot to UI
4. Add session cost accumulator logic

### Phase 2: UI Display
1. Add cost display to ContextWindowMeter or create CostMeter component
2. Show per-turn cost in message metadata
3. Add cost column to token usage tooltip
4. Display session total in appropriate location (header, sidebar, stats)

### Phase 3: Provider Support
1. Implement cost calculation for all supported providers
2. Handle providers without cost data (show "N/A")
3. Test with multiple providers

## Files to Modify/Create

| File | Action | Notes |
|------|--------|-------|
| `apps/server/src/provider/Layers/ProviderBase.ts` | Modify | Add cost calculation interface |
| `packages/contracts/src/model.ts` | Modify | Add pricing config |
| `apps/web/src/components/chat/CostMeter.tsx` | Create | Display session/turn costs |
| `apps/web/src/lib/costCalculator.ts` | Create | Cost calculation logic |
| `apps/web/src/components/chat/Message*.tsx` | Modify | Show per-turn cost |

## Acceptance Criteria

- [ ] Cost displays per-turn in message UI
- [ ] Session total cost accumulates and displays
- [ ] Cost data persists in thread history
- [ ] Works with all supported model providers
- [ ] Gracefully handles missing cost data
- [ ] Cost calculation matches API pricing
- [ ] No performance impact on message rendering

## Design Notes

### Display Options
1. **Next to token meter** (recommended): "3,456 tokens ($0.12)"
2. **Separate cost meter**: Parallel to context window meter
3. **In message footer**: Small text below message content
4. **Tooltip on hover**: Only show on interactive element

Recommend option 1 for simplicity and consistency.

## Effort Estimate

- **Discovery & data layer**: 2-3 hours
- **UI implementation**: 2-3 hours
- **Provider support**: 1-2 hours
- **Testing & polish**: 1-2 hours
- **Total**: 6-10 hours

---

# Feature 3: Cache Hit Rate Display

## Overview

Show prompt caching efficiency to help users understand if their workflow is optimized and to quantify cost savings from caching.

## Current State

### What's Already Implemented
- `cachedInputTokens` is extracted from Claude API responses
- Cache data is part of ThreadTokenUsageSnapshot
- Per-turn breakdown is available (lastCachedInputTokens)

### What's Missing
- No UI display of cache hit rates
- No calculation of cache efficiency percentage
- No provider abstraction (may not all providers support caching)
- No actionable guidance based on cache performance

**Key Files:**
- Backend: `/d/dev/t3code/packages/contracts/src/providerRuntime.ts` (ThreadTokenUsageSnapshot)
- Frontend: Message and metrics components (to be identified)

## Requirements

### User-Facing
- [ ] Display cache hit rate as percentage (e.g., "45% cached")
- [ ] Show cache hit rate per turn and session total
- [ ] Visualize with progress bar or small chart
- [ ] Tooltip explaining cache benefits (cost savings, speed)
- [ ] Only display if provider supports caching
- [ ] Include cache stats in session summary

### Technical
- [ ] Calculate: `(cachedInputTokens / totalInputTokens) * 100`
- [ ] Handle providers that don't support caching
- [ ] Accumulate cache stats across session
- [ ] Distinguish between no-cache-available vs zero-cache-hit

## Implementation Approach

### Phase 1: Calculation
1. Add cache hit rate calculation to metrics service
2. Store per-turn cache stats
3. Accumulate session-wide cache metrics
4. Define provider capabilities (supports caching: yes/no)

### Phase 2: UI Display
1. Add cache hit rate to metrics dashboard
2. Show per-turn cache stats (expandable)
3. Create simple visualization (progress bar or percentage)
4. Add to ContextWindowMeter or separate CacheMeter

### Phase 3: Guidance
1. Add tooltip explaining cache benefits
2. Optional: warn if cache hit rate is very low (<5%)
3. Optional: suggest strategies to improve cache utilization

## Files to Modify/Create

| File | Action | Notes |
|------|--------|-------|
| `apps/web/src/lib/contextWindow.ts` | Modify | Add cache rate calculation |
| `apps/web/src/components/chat/CacheMeter.tsx` | Create | Display cache hit rate |
| `apps/web/src/components/chat/ContextWindowMeter.tsx` | Modify | Add cache info to tooltip |
| `packages/contracts/src/model.ts` | Modify | Add caching capability flag |

## Acceptance Criteria

- [ ] Cache hit rate displays as percentage per turn and session
- [ ] Visualization is clear and not cluttered
- [ ] Only shows for providers that support caching
- [ ] Tooltip explains cache benefits
- [ ] Cache stats persist in thread history
- [ ] Actionable (users can see if they should adjust workflow)

## Design Notes

### Display Options
1. **Meter with ContextWindow** (recommended): Add cache row to context window tooltip
2. **Separate cache meter**: Next to cost meter
3. **Inline with token count**: "3,456 tokens (45% cached)"
4. **Only on hover**: Hidden by default, shown in tooltip

Recommend option 1 for consistency with existing metrics display.

## Effort Estimate

- **Calculation logic**: 1-2 hours
- **UI implementation**: 2-3 hours
- **Provider support**: 1 hour
- **Testing & polish**: 1-2 hours
- **Total**: 5-8 hours

---

# Feature 4: Rate Limit Warnings

## Overview

Alert users when they're approaching API rate limits or subscription quotas, preventing unexpected throttling or service interruptions.

## Current State

### What's Already Implemented
- Claude SDK emits `rate_limit_event` messages
- Events are converted to `account.rate-limits.updated` orchestration events
- Rate limit data includes remaining quota, reset times
- Per-provider rate limit information available in API headers

### What's Missing
- No UI component displays rate limit status
- No warnings when approaching limits
- No visual indicator of remaining quota
- No provider abstraction for different limit types

**Key Files:**
- Backend: `/d/dev/t3code/packages/contracts/src/providerRuntime.ts` (lines 528-531)
- Backend: `/d/dev/t3code/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- Frontend: No components yet

## Requirements

### User-Facing
- [ ] Display rate limit status (requests remaining, reset time)
- [ ] Show warning when approaching limits (e.g., <10% remaining)
- [ ] Display limit type clearly (requests-per-minute, tokens-per-day, etc.)
- [ ] Non-intrusive by default, prominent when at risk
- [ ] Clear guidance on when limits reset
- [ ] Support multiple limit types per provider

### Technical
- [ ] Listen to `account.rate-limits.updated` events
- [ ] Calculate percentage of quota used
- [ ] Determine warning threshold (provider-specific)
- [ ] Handle different limit types (request count, token count, etc.)
- [ ] Support multiple concurrent providers with different limits
- [ ] Cache limit info to avoid excessive updates

## Implementation Approach

### Phase 1: Event Handling
1. Create rate limit state store
2. Listen to orchestration `account.rate-limits.updated` events
3. Parse rate limit data from all providers
4. Determine warning status per limit

### Phase 2: UI Display
1. Create RateLimitIndicator component
2. Add to status bar (small icon + tooltip)
3. Show warning banner when approaching limits
4. Display reset time countdown if needed

### Phase 3: Provider Support
1. Handle Claude rate limits (requests/min, tokens/day)
2. Abstract for future providers
3. Handle rate limits that don't apply to free tier
4. Show "unlimited" or "N/A" when not applicable

## Files to Modify/Create

| File | Action | Notes |
|------|--------|-------|
| `apps/web/src/stores/rateLimitStore.ts` | Create | Rate limit state management |
| `apps/web/src/components/RateLimitIndicator.tsx` | Create | Status bar indicator |
| `apps/web/src/components/RateLimitWarning.tsx` | Create | Warning banner (when <10%) |
| `apps/web/src/lib/rateLimitUtils.ts` | Create | Calculation and formatting helpers |
| `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` | Modify | Ensure events reach client |

## Acceptance Criteria

- [ ] Rate limit status displays in status bar
- [ ] Warning appears when approaching limits (<10% remaining)
- [ ] Shows reset time clearly
- [ ] Works with multiple providers simultaneously
- [ ] Gracefully handles missing rate limit data
- [ ] Non-intrusive design (not noisy)
- [ ] Updates in real-time as quotas are consumed

## Design Notes

### Display Options
1. **Status bar icon** (recommended): Small indicator with tooltip showing details
2. **Header badge**: "Rate: 9,850/10,000 requests"
3. **Warning banner**: Only appears when <10% remaining
4. **Dropdown menu**: Expandable rate limit details

Recommend combination: Always show icon in status bar (green/yellow/red) + tooltip, with banner when critical.

## Effort Estimate

- **Event handling & store**: 2-3 hours
- **UI components**: 2-3 hours
- **Provider support**: 1-2 hours
- **Testing & polish**: 1-2 hours
- **Total**: 6-10 hours

---

# Implementation Order & Cross-Feature Considerations

## Recommended Sequence

1. **Cost Tracking** (highest ROI, broadest appeal)
2. **Cache Hit Rate** (pairs well with cost, adds actionability)
3. **Rate Limit Warnings** (prevents user pain, lower frequency updates)
4. **Extended Thinking Display** (nice-to-have, depends on model features)

## Cross-Feature Architecture

### Shared Components
- **MetricsPanel/Dashboard**: Central location for all metrics
- **ProviderCapabilities**: Define what each provider supports
- **TokenUsageSnapshot**: Extend to include all metric data

### Provider Abstraction
All features must respect provider capabilities:
- Extended thinking: Only Claude (claude-opus)
- Caching: Supported by Claude, query in provider capabilities
- Cost: All providers, but pricing varies
- Rate limits: All providers, but format varies

### Event Flows
1. Provider emits raw events (token usage, cache hits, rate limits, thinking)
2. Orchestration layer normalizes to common format
3. Runtime types define schema
4. UI subscribes to relevant events and updates displays

## Testing Strategy

- Unit tests for each calculation (cost, cache rate, quota percentage)
- Integration tests for multi-provider scenarios
- UI tests for warning thresholds and visual states
- End-to-end with real API calls (staging)

## Total Effort Estimate

- **Extended Thinking Display**: 6-9 hours
- **Cost Tracking**: 6-10 hours
- **Cache Hit Rate**: 5-8 hours
- **Rate Limit Warnings**: 6-10 hours
- **Shared infrastructure & polish**: 5-8 hours
- **Total**: 28-45 hours (~1 week at 5 days/week, 5-8 hrs/day)

## Success Metrics

- Users can see why their API calls cost what they cost
- Users understand cache efficiency of their workflows
- Users are never surprised by rate limiting
- Extended thinking users can learn from model's reasoning
- All features work with current and future providers
