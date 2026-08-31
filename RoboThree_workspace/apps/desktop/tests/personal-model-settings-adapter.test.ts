// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { desktopPersonalModelSettingsAdapter } from "../src/renderer/adapters/personal-model-settings-adapter.js";

const digest = "a".repeat(64);
const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });

describe("DFE-8B personal model settings adapter", () => {
  it("negotiates and reads the existing v1alpha1 catalog without mutation calls", async () => {
    const api = installApi();
    const result = await desktopPersonalModelSettingsAdapter.loadPersonalModels();
    expect(api.getCompatibility).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "personal-model-management.v1alpha1",
      type: "personal_model_management_compatibility",
    }));
    expect(api.listPersonalModels).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "personal-model-management.v1alpha1",
      type: "list_personal_models",
      limit: 100,
    }));
    expect(result.catalogAvailable).toBe(true);
    expect(result.models[0]?.providerModelId).toBe("deepseek-chat");
    expect(JSON.stringify(result)).not.toMatch(/apiKey|credentialReference|workspaceRoot|rootRealPath/u);
  });

  it("does not list models when compatibility says the catalog is unavailable", async () => {
    const api = installApi(false);
    const result = await desktopPersonalModelSettingsAdapter.loadPersonalModels();
    expect(result).toEqual({
      catalogAvailable: false,
      models: [],
      unavailableMessage: "个人模型目录尚未开放。",
    });
    expect(api.listPersonalModels).not.toHaveBeenCalled();
  });
});

function installApi(catalogAvailable = true) {
  const api = {
    contractVersion: "personal-model-management.v1alpha1",
    getCompatibility: vi.fn(() => ok({
      contractVersion: "personal-model-management.v1alpha1",
      runtimeInstanceId: "runtime.test",
      catalogAvailable,
      mutationAvailable: false,
      revealAvailable: false,
      authorityKind: catalogAvailable ? "standalone_local_owner" : "unavailable",
      helperState: "unavailable",
      transportState: "ready",
      productionIdentityReady: false,
      testIdentityUsed: false,
      reasonCode: "personal_model.feature_unavailable",
    })),
    listPersonalModels: vi.fn(() => ok({
      contractVersion: "personal-model-management.v1alpha1",
      queryRevision: "query.revision",
      items: [{
        contractVersion: "personal-model-management.v1alpha1",
        personalModelId: "personal.model",
        configurationRevision: digest,
        displayName: "我的 DeepSeek",
        provider: "deepseek",
        protocol: "openai_compatible",
        providerModelId: "deepseek-chat",
        endpointDisplayHost: "api.deepseek.com",
        capabilities: ["text"],
        status: "available",
        available: true,
        credentialState: "present_masked",
        preferenceSelected: false,
        permissions: { canConfigure: true, canUse: true, canReveal: true, canDelete: true },
        createdAt: "2026-08-30T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
      }],
    })),
    getPersonalModel: vi.fn(),
  };
  Object.defineProperty(window, "robothreePersonalModelV1Alpha1", { configurable: true, value: api });
  return api;
}
