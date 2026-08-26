// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import {
  desktopSettingsAdapter,
} from "../src/renderer/adapters/settings-adapter.js";

const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });
const digest = "a".repeat(64);

describe("DFE-5A.1 Desktop settings adapter", () => {
  it("loads model projections through the existing listModels API only", async () => {
    const api = installDesktopApi();
    const data = await desktopSettingsAdapter.loadSettingsModels();

    expect(api.listModels).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "v1alpha1",
      type: "list_models",
    }));
    expect(data.models).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/workspaceRoot|rootRealPath|Credential Reference|credentialReference/u);
  });
});

function installDesktopApi() {
  const api = {
    listModels: vi.fn(() => ok([{
      modelId: "model.gpt",
      revision: digest,
      name: "GPT Test",
      source: "official",
      capabilities: ["text", "tool_calling"],
      available: true,
    }])),
  };
  Object.defineProperty(window, "robothreeDesktop", {
    configurable: true,
    value: api,
  });
  return api;
}
