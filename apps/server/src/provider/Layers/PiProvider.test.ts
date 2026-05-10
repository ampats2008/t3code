import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";

import { ServerSettingsService } from "../../serverSettings.ts";
import { checkPiProviderStatus } from "./PiProvider.ts";

const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (ORIGINAL_OPENAI_API_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
  }
});

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

  it("returns warning status when Pi is enabled without sub-provider credentials", async () => {
    delete process.env.OPENAI_API_KEY;
    const settingsLayer = ServerSettingsService.layerTest({
      providers: { pi: { enabled: true } },
    });

    const provider = await Effect.runPromise(
      checkPiProviderStatus().pipe(Effect.provide(settingsLayer)),
    );

    expect(provider.provider).toBe("pi");
    expect(provider.enabled).toBe(true);
    expect(provider.status).toBe("warning");
    expect(provider.auth).toEqual({ status: "unknown" });
    expect(provider.models).toEqual([]);
    expect(provider.message).toContain("no supported Pi sub-provider credentials");
  }, 30_000);

  it("includes credential-backed Pi SDK models when enabled", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const settingsLayer = ServerSettingsService.layerTest({
      providers: { pi: { enabled: true } },
    });

    const provider = await Effect.runPromise(
      checkPiProviderStatus().pipe(Effect.provide(settingsLayer)),
    );

    expect(provider.status).toBe("ready");
    expect(provider.models.length).toBeGreaterThan(0);
    expect(provider.models.every((model) => model.slug.startsWith("openai/"))).toBe(true);

    for (const model of provider.models) {
      expect(model.slug).toContain("/");
      expect(model.isCustom).toBe(false);
    }
  }, 30_000);

  it("merges custom models with built-in models", async () => {
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
  }, 30_000);

  it("has displayName and installed fields", async () => {
    const settingsLayer = ServerSettingsService.layerTest({
      providers: { pi: { enabled: true } },
    });

    const provider = await Effect.runPromise(
      checkPiProviderStatus().pipe(Effect.provide(settingsLayer)),
    );

    expect(provider.displayName).toBe("Pi");
    expect(provider.installed).toBe(true);
  }, 30_000);
});
