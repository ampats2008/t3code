import { beforeEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import type { AgentSessionServices } from "@mariozechner/pi-coding-agent";

import { ServerSettingsService } from "../../serverSettings.ts";
import { checkPiProviderStatus } from "./PiProvider.ts";

vi.mock("../piSdk.ts", () => ({
  createPiServices: vi.fn(),
  getAvailablePiModels: vi.fn(),
}));

import { createPiServices, getAvailablePiModels } from "../piSdk.ts";

const mockCreatePiServices = vi.mocked(createPiServices);
const mockGetAvailablePiModels = vi.mocked(getAvailablePiModels);

const FAKE_SERVICES = {} as AgentSessionServices;

beforeEach(() => {
  mockCreatePiServices.mockResolvedValue(FAKE_SERVICES);
  mockGetAvailablePiModels.mockReturnValue([]);
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
    mockGetAvailablePiModels.mockReturnValue([]);

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
  });

  it("includes credential-backed Pi SDK models when enabled", async () => {
    mockGetAvailablePiModels.mockReturnValue([
      {
        slug: "openai/gpt-4o",
        name: "GPT-4o",
        subProvider: "openai",
        isCustom: false,
        capabilities: null,
      },
      {
        slug: "openai/gpt-4o-mini",
        name: "GPT-4o mini",
        subProvider: "openai",
        isCustom: false,
        capabilities: null,
      },
    ]);

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
  });

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
  });

  it("has displayName and installed fields", async () => {
    const settingsLayer = ServerSettingsService.layerTest({
      providers: { pi: { enabled: true } },
    });

    const provider = await Effect.runPromise(
      checkPiProviderStatus().pipe(Effect.provide(settingsLayer)),
    );

    expect(provider.displayName).toBe("Pi");
    expect(provider.installed).toBe(true);
  });

  it("returns warning status when createPiServices throws", async () => {
    mockCreatePiServices.mockRejectedValue(new Error("Pi SDK unavailable"));

    const settingsLayer = ServerSettingsService.layerTest({
      providers: { pi: { enabled: true } },
    });

    const provider = await Effect.runPromise(
      checkPiProviderStatus().pipe(Effect.provide(settingsLayer)),
    );

    expect(provider.status).toBe("warning");
    expect(provider.models).toEqual([]);
  });
});
