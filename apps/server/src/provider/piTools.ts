/**
 * piTools.ts - T3 approval-gated Pi tool definitions.
 *
 * Wraps the Pi SDK built-in coding tool definitions and gates mutating tools
 * (bash, edit, write) through a T3 approval callback when not in full-access
 * mode. Read-only tools (read, grep, find, ls) always execute without approval.
 *
 * Pass the result as `customTools` to `createAgentSessionFromServices` alongside
 * `noTools: "builtin"` to replace Pi's default tool set entirely.
 *
 * @module piTools
 */
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type { ProviderApprovalDecision } from "@t3tools/contracts";

/** Tool names that require user approval in supervised mode. */
const MUTATING_TOOLS = new Set(["bash", "edit", "write"]);

// biome-ignore lint/suspicious/noExplicitAny: wrapping generic ToolDefinition across all tool types
type AnyToolDef = ToolDefinition<any, any, any>;

/**
 * Wrap a Pi ToolDefinition so that mutating tools request approval before
 * executing. If approval is denied or cancelled the underlying `execute` is
 * never called and an error AgentToolResult is returned instead.
 *
 * Exported for unit testing.
 */
export function withApprovalGate(
  base: AnyToolDef,
  requiresApproval: (toolName: string) => boolean,
  requestApproval: (toolName: string, args: unknown) => Promise<ProviderApprovalDecision>,
): AnyToolDef {
  return {
    ...base,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      if (requiresApproval(base.name)) {
        const decision = await requestApproval(base.name, params);
        if (decision === "decline" || decision === "cancel") {
          return {
            content: [{ type: "text", text: `Tool '${base.name}' was denied by the user.` }],
            details: undefined,
          };
        }
      }
      return base.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  };
}

/**
 * Create T3 Code Pi tool definitions for all seven built-in coding tools.
 *
 * @param cwd        Working directory passed to each Pi tool definition.
 * @param runtimeMode  Provider runtime mode. When "full-access", mutating tools
 *                   skip the approval gate entirely.
 * @param requestApproval  Callback invoked for mutating tools in supervised mode.
 *                   Should emit `request.opened`, await a user decision, and
 *                   resolve with the `ProviderApprovalDecision`.
 */
export function createT3PiTools(
  cwd: string,
  runtimeMode: string,
  requestApproval: (toolName: string, args: unknown) => Promise<ProviderApprovalDecision>,
): AnyToolDef[] {
  const requiresApproval = (name: string): boolean =>
    runtimeMode !== "full-access" && MUTATING_TOOLS.has(name);

  const baseDefs: AnyToolDef[] = [
    createReadToolDefinition(cwd),
    createGrepToolDefinition(cwd),
    createFindToolDefinition(cwd),
    createLsToolDefinition(cwd),
    createBashToolDefinition(cwd),
    createEditToolDefinition(cwd),
    createWriteToolDefinition(cwd),
  ];

  return baseDefs.map((def) => withApprovalGate(def, requiresApproval, requestApproval));
}
