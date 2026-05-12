import assert from "node:assert/strict";

import { describe, it, vi } from "vitest";

import type { AgentSessionServices } from "@mariozechner/pi-coding-agent";

import { getAvailablePiModels, parsePiModelSlug, toServerProviderModel } from "./piSdk.ts";

describe("parsePiModelSlug", () => {
  it("returns provider and modelId for a valid slug", () => {
    const result = parsePiModelSlug("openai/gpt-4o");
    assert.deepEqual(result, { provider: "openai", modelId: "gpt-4o" });
  });

  it("handles slug with hyphenated modelId", () => {
    const result = parsePiModelSlug("openai/gpt-4o-mini");
    assert.deepEqual(result, { provider: "openai", modelId: "gpt-4o-mini" });
  });

  it("handles slug where provider and model are separated by first slash only", () => {
    const result = parsePiModelSlug("anthropic/claude-opus-4-5");
    assert.deepEqual(result, { provider: "anthropic", modelId: "claude-opus-4-5" });
  });

  it("returns undefined for a slug with no slash", () => {
    assert.equal(parsePiModelSlug("openai"), undefined);
  });

  it("returns undefined for a slug with a leading slash", () => {
    assert.equal(parsePiModelSlug("/gpt-4o"), undefined);
  });

  it("returns undefined for a slug with a trailing slash", () => {
    assert.equal(parsePiModelSlug("openai/"), undefined);
  });

  it("returns undefined for an empty string", () => {
    assert.equal(parsePiModelSlug(""), undefined);
  });

  it("returns undefined for a slash-only string", () => {
    assert.equal(parsePiModelSlug("/"), undefined);
  });
});

describe("toServerProviderModel", () => {
  it("converts a Pi Model object to a ServerProviderModel", () => {
    const model = { provider: "openai", id: "gpt-4o", name: "GPT-4o" };
    const result = toServerProviderModel(model as never);

    assert.equal(result.slug, "openai/gpt-4o");
    assert.equal(result.name, "GPT-4o");
    assert.equal(result.subProvider, "openai");
    assert.equal(result.isCustom, false);
    assert.equal(result.capabilities, null);
  });

  it("uses provider and id to form the slug", () => {
    const model = { provider: "google", id: "gemini-2-flash", name: "Gemini 2 Flash" };
    const result = toServerProviderModel(model as never);
    assert.equal(result.slug, "google/gemini-2-flash");
  });
});

describe("getAvailablePiModels", () => {
  it("returns models from modelRegistry.getAvailable()", () => {
    const mockServices = {
      diagnostics: [],
      modelRegistry: {
        getAvailable: vi.fn().mockReturnValue([
          { provider: "openai", id: "gpt-4o", name: "GPT-4o" },
          { provider: "anthropic", id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
        ]),
      },
    } as unknown as AgentSessionServices;

    const models = getAvailablePiModels(mockServices);

    assert.equal(models.length, 2);
    assert.equal(models[0]!.slug, "openai/gpt-4o");
    assert.equal(models[1]!.slug, "anthropic/claude-3-5-sonnet");
    assert.ok(models.every((m) => m.isCustom === false));
  });

  it("returns an empty array when no models are available", () => {
    const mockServices = {
      diagnostics: [],
      modelRegistry: { getAvailable: vi.fn().mockReturnValue([]) },
    } as unknown as AgentSessionServices;

    assert.equal(getAvailablePiModels(mockServices).length, 0);
  });

  it("logs diagnostic warnings and errors without crashing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockServices = {
      diagnostics: [
        { type: "warning", message: "auth.json not found" },
        { type: "error", message: "model registry unreachable" },
      ],
      modelRegistry: { getAvailable: vi.fn().mockReturnValue([]) },
    } as unknown as AgentSessionServices;

    getAvailablePiModels(mockServices);

    assert.equal(warnSpy.mock.calls.length, 2);
    assert.ok(String(warnSpy.mock.calls[0]?.[0]).includes("auth.json not found"));
    warnSpy.mockRestore();
  });

  it("does not log info-level diagnostics", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockServices = {
      diagnostics: [{ type: "info", message: "loaded 3 models" }],
      modelRegistry: { getAvailable: vi.fn().mockReturnValue([]) },
    } as unknown as AgentSessionServices;

    getAvailablePiModels(mockServices);

    assert.equal(warnSpy.mock.calls.length, 0);
    warnSpy.mockRestore();
  });
});
