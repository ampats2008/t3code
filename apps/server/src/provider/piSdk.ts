/**
 * piSdk.ts - Pi SDK helper module for T3 Code provider integration.
 *
 * Provides cwd-scoped Pi services, model slug parsing, model conversion,
 * and auth-filtered model listing. All Pi SDK access is centralised here
 * so PiProvider and PiAdapter import from one place.
 *
 * @module piSdk
 */
import {
  createAgentSessionServices,
  type AgentSessionServices,
} from "@mariozechner/pi-coding-agent";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ServerProviderModel } from "@t3tools/contracts";

/**
 * Create Pi SDK services for a given working directory.
 *
 * Extensions are disabled via `noExtensions: true` to prevent arbitrary user
 * extensions from executing inside the T3 Code server process.
 * Auth, model registry, and settings are inherited from the user's Pi profile
 * (~/.pi/agent/) as usual.
 */
export async function createPiServices(cwd: string): Promise<AgentSessionServices> {
  return createAgentSessionServices({
    cwd,
    resourceLoaderOptions: { noExtensions: true },
  });
}

/**
 * Parse a T3 Code Pi model slug (format: "provider/modelId") into its parts.
 * Returns undefined if the slug is not in the expected "provider/modelId" format.
 */
export function parsePiModelSlug(slug: string): { provider: string; modelId: string } | undefined {
  const slashIndex = slug.indexOf("/");
  if (slashIndex <= 0 || slashIndex === slug.length - 1) {
    return undefined;
  }
  return {
    provider: slug.slice(0, slashIndex),
    modelId: slug.slice(slashIndex + 1),
  };
}

/**
 * Convert a Pi SDK Model into a T3 Code ServerProviderModel.
 */
export function toServerProviderModel(model: Model<Api>): ServerProviderModel {
  return {
    slug: `${model.provider}/${model.id}`,
    name: model.name,
    subProvider: model.provider,
    isCustom: false,
    capabilities: null,
  };
}

/**
 * Return auth-filtered models from the Pi ModelRegistry as ServerProviderModels.
 *
 * Surfaces any diagnostic warnings collected during service creation via
 * console.warn so they are visible in server logs without crashing.
 */
export function getAvailablePiModels(
  services: AgentSessionServices,
): ReadonlyArray<ServerProviderModel> {
  for (const diag of services.diagnostics) {
    if (diag.type === "warning" || diag.type === "error") {
      console.warn(`[pi-sdk] ${diag.type}: ${diag.message}`);
    }
  }

  return services.modelRegistry.getAvailable().map(toServerProviderModel);
}
