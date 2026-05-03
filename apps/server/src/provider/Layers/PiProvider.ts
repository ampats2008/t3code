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

let cachedModels: ReadonlyArray<ServerProviderModel> | null = null;

async function loadPiModels(): Promise<ReadonlyArray<ServerProviderModel>> {
  if (cachedModels) return cachedModels;
  try {
    const { getModels, getProviders } = await import("@mariozechner/pi-ai");
    const allModels: ServerProviderModel[] = [];
    for (const provider of getProviders()) {
      for (const model of getModels(provider)) {
        allModels.push({
          slug: `${model.provider}/${model.id}`,
          name: model.name,
          isCustom: false,
          capabilities: null,
        });
      }
    }
    cachedModels = allModels;
    return cachedModels;
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
      return buildServerProvider({
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
        status: "ready",
        auth: { status: "authenticated", type: "sdk", label: "In-process SDK" },
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
      initialSnapshot: () =>
        buildServerProvider({
          provider: PROVIDER,
          presentation: PI_PRESENTATION,
          enabled: false,
          checkedAt: new Date().toISOString(),
          models: BUILT_IN_MODELS,
          probe: {
            installed: false,
            version: null,
            status: "warning",
            auth: { status: "unknown" },
            message: "Pi status not yet checked.",
          },
        }),
      checkProvider,
    });
  }),
);
