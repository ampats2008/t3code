import { describe, expect, it } from "vitest";
import { Effect } from "effect";

import { ServerSettingsService } from "../../serverSettings.ts";
import { checkPiProviderStatus } from "./PiProvider.ts";

describe("checkPiProviderStatus", () => {
  it("returns disabled status when Pi is not enabled", async () => {
    const settingsLayer = ServerSettingsService.layerTest({
      providers: { pi: { enabled: false } },
    });

    const provider = await Effect.runPromise(
      checkPiProviderStatus().pipe(Effect.provide(settingsLayer)),
    );

    expect(provider.provider).toBe("pi");
    expect(provider.enabled).toBe(false);
    expect(provider.status).toBe("disabled");
    expect(provider.message).toContain("disabled");
  });

  it(
    "returns ready status when Pi is enabled",
    async () => {
      const settingsLayer = ServerSettingsService.layerTest({
        providers: { pi: { enabled: true } },
      });

      const provider = await Effect.runPromise(
        checkPiProviderStatus().pipe(Effect.provide(settingsLayer)),
      );

      expect(provider.provider).toBe("pi");
      expect(provider.enabled).toBe(true);
      expect(provider.status).toBe("ready");
      expect(provider.auth).toEqual({
        status: "authenticated",
        type: "sdk",
        label: "In-process SDK",
      });
    },
    30_000,
  );

  it(
    "includes Pi SDK models when enabled",
    async () => {
      const settingsLayer = ServerSettingsService.layerTest({
        providers: { pi: { enabled: true } },
      });

      const provider = await Effect.runPromise(
        checkPiProviderStatus().pipe(Effect.provide(settingsLayer)),
      );

      // Pi SDK should enumerate models across multiple providers
      expect(provider.models.length).toBeGreaterThan(0);

      // Models should have the "provider/modelId" slug format
      for (const model of provider.models) {
        expect(model.slug).toContain("/");
        expect(model.isCustom).toBe(false);
      }
    },
    30_000,
  );

  it(
    "merges custom models with built-in models",
    async () => {
      const settingsLayer = ServerSettingsService.layerTest({
        providers: {
          pi: { enabled: true, customModels: ["custom/my-model"] },
        },
      });

      const provider = await Effect.runPromise(
        checkPiProviderStatus().pipe(Effect.provide(settingsLayer)),
      );

      const customModel = provider.models.find((m) => m.slug === "custom/my-model");
      expect(customModel).toBeDefined();
      expect(customModel!.isCustom).toBe(true);
    },
    30_000,
  );

  it(
    "has displayName and installed fields",
    async () => {
      const settingsLayer = ServerSettingsService.layerTest({
        providers: { pi: { enabled: true } },
      });

      const provider = await Effect.runPromise(
        checkPiProviderStatus().pipe(Effect.provide(settingsLayer)),
      );

      expect(provider.displayName).toBe("Pi");
      expect(provider.installed).toBe(true);
    },
    30_000,
  );
});
