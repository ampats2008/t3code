/**
 * PiProviderLive - Provider snapshot layer for the Pi coding agent.
 *
 * Pi runs in-process via SDK — no CLI binary to probe. Status is always "ready"
 * when enabled. Models are sourced from Pi's built-in registry.
 *
 * @module PiProviderLive
 */
import {
  type PiSettings,
  type ServerProvider,
  type ServerProviderModel,
  ServerSettingsError,
} from "@t3tools/contracts";
import { Effect, Equal, Layer, Stream } from "effect";

import {
  buildServerProvider,
  providerModelsFromSettings,
  type ServerProviderPresentation,
} from "../providerSnapshot.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import { PiProvider } from "../Services/PiProvider.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

const PROVIDER = "pi" as const;
const PI_PRESENTATION: ServerProviderPresentation = {
  displayName: "Pi",
  badgeLabel: "Preview",
};

const BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [];

let cachedModelsByProvider: ReadonlyMap<string, ReadonlyArray<ServerProviderModel>> | null = null;

// Pre-warm the Pi AI SDK as soon as this module is imported (server startup)
// so that the heavy transitive deps (anthropic-ai/sdk, openai, etc.) are
// resolved in the background rather than blocking the event loop the first
// time the user enables Pi in settings.
const _piAiModulePromise: Promise<typeof import("@mariozechner/pi-ai") | null> =
  import("@mariozechner/pi-ai").catch(() => null);

async function loadPiModels(): Promise<ReadonlyArray<ServerProviderModel>> {
  try {
    const piAi = await _piAiModulePromise;
    if (!piAi) return BUILT_IN_MODELS;
    const { getEnvApiKey, getModels, getProviders } = piAi;
    if (!cachedModelsByProvider) {
      const nextModelsByProvider = new Map<string, ReadonlyArray<ServerProviderModel>>();
      for (const provider of getProviders()) {
        nextModelsByProvider.set(
          provider,
          getModels(provider).map((model) => ({
            slug: `${model.provider}/${model.id}`,
            name: model.name,
            isCustom: false,
            capabilities: null,
          })),
        );
      }
      cachedModelsByProvider = nextModelsByProvider;
    }

    return [...cachedModelsByProvider.entries()].flatMap(([provider, models]) =>
      getEnvApiKey(provider) ? models : [],
    );
  } catch {
    return BUILT_IN_MODELS;
  }
}

export const checkPiProviderStatus = Effect.fn("checkPiProviderStatus")(
  function* (): Effect.fn.Return<ServerProvider, ServerSettingsError, ServerSettingsService> {
    const piSettings = yield* Effect.service(ServerSettingsService).pipe(
      Effect.flatMap((service) => service.getSettings),
      Effect.map((settings) => settings.providers.pi),
    );
    const checkedAt = new Date().toISOString();

    if (!piSettings.enabled) {
      const result = buildServerProvider({
        provider: PROVIDER,
        presentation: PI_PRESENTATION,
        enabled: false,
        checkedAt,
        models: BUILT_IN_MODELS,
        probe: {
          installed: true,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Pi is disabled in T3 Code settings.",
        },
      });
      return result;
    }

    const piModels = yield* Effect.promise(loadPiModels);
    const models = providerModelsFromSettings(piModels, PROVIDER, piSettings.customModels, {});

    return buildServerProvider({
      provider: PROVIDER,
      presentation: PI_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: models.length > 0 ? "ready" : "warning",
        auth:
          models.length > 0
            ? { status: "authenticated", type: "sdk", label: "In-process SDK" }
            : { status: "unknown" },
        ...(models.length === 0
          ? {
              message:
                "Pi is enabled, but no supported Pi sub-provider credentials were found in the server environment.",
            }
          : {}),
      },
    });
  },
);

export const PiProviderLive = Layer.effect(
  PiProvider,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;

    const checkProvider = checkPiProviderStatus().pipe(
      Effect.provideService(ServerSettingsService, serverSettings),
    );

    return yield* makeManagedServerProvider<PiSettings>({
      getSettings: serverSettings.getSettings.pipe(
        Effect.map((settings) => settings.providers.pi),
        Effect.orDie,
      ),
      streamSettings: serverSettings.streamChanges.pipe(
        Stream.map((settings) => settings.providers.pi),
      ),
      haveSettingsChanged: (previous, next) => !Equal.equals(previous, next),
      initialSnapshot: (settings) =>
        settings.enabled
          ? buildServerProvider({
              provider: PROVIDER,
              presentation: PI_PRESENTATION,
              enabled: true,
              checkedAt: new Date().toISOString(),
              models: BUILT_IN_MODELS,
              probe: {
                installed: true,
                version: null,
                status: "warning",
                auth: { status: "unknown" },
                message: "Pi status not yet checked.",
              },
            })
          : buildServerProvider({
              provider: PROVIDER,
              presentation: PI_PRESENTATION,
              enabled: false,
              checkedAt: new Date().toISOString(),
              models: BUILT_IN_MODELS,
              probe: {
                installed: true,
                version: null,
                status: "warning",
                auth: { status: "unknown" },
                message: "Pi is disabled in T3 Code settings.",
              },
            }),
      checkProvider,
    });
  }),
);
