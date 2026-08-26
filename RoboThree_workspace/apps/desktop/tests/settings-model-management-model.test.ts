import type { ModelProjection } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  presentDetailedModelStatus,
  presentModelManagement,
  presentModelRow,
} from "../src/renderer/pages/settings/settings-model-management-model.js";

const digest = "a".repeat(64);

describe("DFE-5A.1 settings model management view model", () => {
  it("treats current ModelProjection.name as display name only", () => {
    const row = presentModelRow(model({
      modelId: "model.deepseek",
      name: "DeepSeek-V4",
      source: "enterprise",
    }));

    expect(row.displayName).toBe("DeepSeek-V4");
    expect(row.modelId).toBe("model.deepseek");
    expect(row.statusHelp).toContain("粗粒度可用性");
    expect(JSON.stringify(row)).not.toContain("模型标识");
  });

  it("keeps official source separate from enterprise models", () => {
    const view = presentModelManagement([
      model({ source: "enterprise", name: "企业模型" }),
      model({ source: "personal", name: "个人模型", modelId: "model.personal" }),
      model({ source: "official", name: "平台模型", modelId: "model.official" }),
    ]);

    expect(view.sections.map((section) => section.title)).toEqual([
      "企业模型",
      "个人模型",
      "平台基线模型",
    ]);
    expect(view.sections.flatMap((section) => section.rows.map((row) => row.modelId)))
      .toEqual(["model.test", "model.personal", "model.official"]);
  });

  it("maps detailed fixture states without exposing them as real projection facts", () => {
    expect(presentDetailedModelStatus("network_failed")).toMatchObject({
      label: "网络失败",
      selectable: true,
    });
    expect(presentDetailedModelStatus("authentication_failed")).toMatchObject({
      label: "认证失败",
      selectable: false,
    });
    expect(presentDetailedModelStatus("permission_denied")).toMatchObject({
      label: "权限不足",
      selectable: false,
    });
  });

  it("uses stable empty and gated personal model copy", () => {
    const view = presentModelManagement([]);
    expect(view.empty).toBe(true);
    expect(view.emptyDescription).toContain("企业模型由后台配置");
    expect(view.personalGate.statusLabel).toBe("待接入");
    expect(view.personalGate.description).toContain("不接收真实 API Key");
    expect(view.personalGate.description).not.toMatch(/保存成功|删除成功|测试连接/u);
  });
});

function model(overrides: Partial<ModelProjection> = {}): ModelProjection {
  return {
    modelId: "model.test",
    revision: digest,
    name: "Test Model",
    source: "official",
    capabilities: ["text", "tool_calling"],
    available: true,
    ...overrides,
  };
}
