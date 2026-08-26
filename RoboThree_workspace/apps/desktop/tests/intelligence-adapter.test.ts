// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import {
  desktopIntelligenceAdapter,
} from "../src/renderer/adapters/intelligence-adapter.js";
import type { DesktopIntelligenceAdapterError } from "../src/renderer/adapters/intelligence-adapter.js";

const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });
const fail = () => Promise.resolve({
  ok: false as const,
  error: {
    contractVersion: "v1alpha2" as const,
    code: "catalog.cursor_invalid",
    category: "conflict" as const,
    safeSummary: "The catalog page position does not belong to the current runtime.",
    retryable: true,
    correlationId: uuid("900"),
  },
});
const digest = "a".repeat(64);

describe("DFE-7A Desktop intelligence catalog adapter", () => {
  it("negotiates v1alpha2 robot_tool_catalog with raw UUID client identity", async () => {
    const api = installDesktopApi();
    const compatibility = await desktopIntelligenceAdapter.negotiateCatalog();

    expect(compatibility.available).toBe(true);
    expect(api.getCompatibility).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "v1alpha2",
      supportedContractVersions: ["v1alpha2", "v1alpha1"],
    }));
    const query = api.getCompatibility.mock.calls[0]?.[0];
    expect(query.clientInstanceId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(query.clientInstanceId).not.toContain("renderer:");
  });

  it("uses the five v1alpha2 catalog methods with precise query shapes", async () => {
    const api = installDesktopApi();
    await desktopIntelligenceAdapter.listRobots({ limit: 50 });
    await desktopIntelligenceAdapter.getRobot({ robotId: "agent.general" });
    await desktopIntelligenceAdapter.listTools({ cursor: cursor(), limit: 25 });
    await desktopIntelligenceAdapter.getTool({ toolId: "tool.document.xlsx.write" });

    expect(api.listRobotCatalog).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "v1alpha2",
      type: "list_robot_catalog",
      limit: 50,
    }));
    expect(api.listRobotCatalog.mock.calls[0]?.[0]).not.toHaveProperty("cursor");
    expect(api.getRobotCatalog).toHaveBeenCalledWith(expect.objectContaining({
      type: "get_robot_catalog",
      robotId: "agent.general",
    }));
    expect(api.listToolCatalog).toHaveBeenCalledWith(expect.objectContaining({
      type: "list_tool_catalog",
      cursor: cursor(),
      limit: 25,
    }));
    expect(api.getToolCatalog).toHaveBeenCalledWith(expect.objectContaining({
      type: "get_tool_catalog",
      toolId: "tool.document.xlsx.write",
    }));
  });

  it("preserves catalog error code, category, retryable and safe summary", async () => {
    const api = installDesktopApi();
    api.listToolCatalog.mockImplementationOnce(fail);

    await expect(desktopIntelligenceAdapter.listTools({ cursor: cursor() }))
      .rejects.toMatchObject({
        code: "catalog.cursor_invalid",
        category: "conflict",
        retryable: true,
        safeSummary: "The catalog page position does not belong to the current runtime.",
      } satisfies Partial<DesktopIntelligenceAdapterError>);
  });
});

function installDesktopApi() {
  const api = {
    contractVersion: "v1alpha2" as const,
    getCompatibility: vi.fn(() => ok({
      contractVersion: "v1alpha2" as const,
      coreVersion: "0.0.0-test",
      supportedContractVersions: ["v1alpha1", "v1alpha2"],
      selectedContractVersion: "v1alpha2" as const,
      features: ["enterprise_configuration_status", "robot_tool_catalog"],
      runtimeInstanceId: "runtime.instance-dfe-7a",
      activationState: "active" as const,
      pendingRuntimeActivation: false,
      enterpriseConfigurationStatusQueryRef: "query.enterprise",
    })),
    listRobotCatalog: vi.fn(() => ok({
      contractVersion: "v1alpha2" as const,
      queryRevision: digest,
      items: [robotSummary()],
    })),
    getRobotCatalog: vi.fn(() => ok(robotDetail())),
    listToolCatalog: vi.fn(() => ok({
      contractVersion: "v1alpha2" as const,
      queryRevision: digest,
      items: [toolSummary()],
    })),
    getToolCatalog: vi.fn(() => ok(toolDetail())),
    listWorkspaceEntries: vi.fn(),
    openTaskWorkspaceLocation: vi.fn(),
  };
  Object.defineProperty(window, "robothreeDesktopV1Alpha2", {
    configurable: true,
    value: api,
  });
  return api;
}

function robotSummary() {
  return {
    robotId: "agent.general",
    configurationRevision: digest,
    displayName: "通用机器人",
    description: "处理本地优先任务。",
    source: "local_trusted" as const,
    restrictionSummary: {
      models: "unrestricted" as const,
      skills: "restricted_nonempty" as const,
      tools: "restricted_empty" as const,
      knowledge: "unrestricted" as const,
    },
    runnable: true,
  };
}

function robotDetail() {
  return {
    ...robotSummary(),
    defaultModel: resource("model.gpt", "GPT Test"),
    allowModelOverride: true,
    eligibleModels: [resource("model.gpt", "GPT Test")],
    skills: [resource("skill.document.review", "文档审阅")],
    tools: [resource("tool.document.xlsx.write", "XLSX 写入")],
    knowledge: [],
  };
}

function toolSummary() {
  return {
    toolId: "tool.document.xlsx.write",
    capabilityRevision: digest,
    registryRevision: digest,
    displayName: "XLSX 写入",
    description: "创建或覆盖 XLSX。",
    source: "enterprise_package" as const,
    readOnly: false,
    riskSummary: ["routine_file", "destructive_file"] as const,
    availability: "available" as const,
  };
}

function toolDetail() {
  return {
    ...toolSummary(),
    inputShape: "structured_object" as const,
    outputShape: "structured_object" as const,
  };
}

function resource(resourceId: string, displayName: string) {
  return {
    resourceId,
    revision: digest,
    displayName,
    availability: "available" as const,
  };
}

function cursor(): string {
  return `r3cat1.${"a".repeat(48)}.${"b".repeat(48)}`;
}

function uuid(suffix: string): string {
  return `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
