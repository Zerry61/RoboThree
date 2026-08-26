import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  AgentProjection,
  ModelProjection,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  catalogSelectionSummary,
  isSendDisabled,
  modelOverrideOptions,
  presentComposer,
  resolveModelName,
} from "../src/renderer/presentation/composer-presentation.js";

const presentationSource = resolve(
  "apps/desktop/src/renderer/presentation/composer-presentation.ts",
);

function model(
  modelId: string,
  name: string,
  available = true,
): ModelProjection {
  return {
    modelId,
    revision: "0".repeat(64),
    name,
    source: "official",
    capabilities: ["text"],
    available,
  };
}

function agent(overrides: Partial<AgentProjection> = {}): AgentProjection {
  return {
    agentId: "agent-1",
    revision: "1".repeat(64),
    name: "Default Agent",
    identity: "Agent identity",
    goal: "Agent goal",
    defaultModelId: "model-default",
    allowModelOverride: true,
    eligibleModels: [
      model("model-default", "Default Model"),
      model("model-override", "Override Model"),
      model("model-unavailable", "Unavailable Model", false),
    ],
    requiredModelCapabilities: ["text"],
    skills: [
      { id: "skill-1", revision: "2".repeat(64), name: "Skill 1", available: true },
      { id: "skill-2", revision: "3".repeat(64), name: "Skill 2", available: false },
    ],
    tools: [
      { id: "tool-1", revision: "4".repeat(64), name: "Tool 1", available: true },
      { id: "tool-2", revision: "5".repeat(64), name: "Tool 2", available: true },
      { id: "tool-3", revision: "6".repeat(64), name: "Tool 3", available: false },
    ],
    knowledge: [],
    runnable: true,
    ...overrides,
  };
}

describe("Composer presentation", () => {
  it("disables send while busy, with empty input, or without an agent", () => {
    expect(isSendDisabled({
      busy: true,
      composerText: "Run task",
      selectedWorkspaceId: "workspace-1",
      selectedAgent: agent(),
    })).toBe(true);
    expect(isSendDisabled({
      busy: false,
      composerText: "   ",
      selectedWorkspaceId: "workspace-1",
      selectedAgent: agent(),
    })).toBe(true);
    expect(isSendDisabled({
      busy: false,
      composerText: "Run task",
      selectedWorkspaceId: "workspace-1",
      selectedAgent: undefined,
    })).toBe(true);
    expect(isSendDisabled({
      busy: false,
      composerText: "Run task",
      selectedWorkspaceId: "workspace-1",
      selectedAgent: agent(),
    })).toBe(false);
  });

  it("uses existing send button labels", () => {
    expect(presentComposer({
      selectedAgent: agent(),
      models: [],
      requestedModelId: "",
      selectedWorkspaceId: "workspace-1",
      composerText: "Run task",
      busy: true,
    }).sendButtonLabel).toBe("处理中…");
    expect(presentComposer({
      selectedAgent: agent(),
      models: [],
      requestedModelId: "",
      selectedWorkspaceId: "workspace-1",
      composerText: "Run task",
      busy: false,
    }).sendButtonLabel).toBe("发送任务 →");
  });

  it("resolves default and requested model display names", () => {
    const selected = agent();
    expect(resolveModelName(selected, [], "")).toBe("Default Model");
    expect(resolveModelName(selected, [], "model-override")).toBe("Override Model");
    expect(resolveModelName(
      { ...selected, eligibleModels: [] },
      [model("model-default", "Global Default")],
      "",
    )).toBe("Global Default");
    expect(resolveModelName(
      { ...selected, eligibleModels: [] },
      [],
      "model-missing",
    )).toBe("model-missing");
    expect(resolveModelName(undefined, [], "")).toBe("未选择");
  });

  it("builds default option and override options without unavailable or default models", () => {
    const selected = agent();
    expect(presentComposer({
      selectedAgent: selected,
      models: [],
      requestedModelId: "",
      selectedWorkspaceId: "workspace-1",
      composerText: "Run task",
      busy: false,
    })).toMatchObject({
      resolvedModelName: "Default Model",
      defaultModelOptionLabel: "默认 · Default Model",
      modelOverrideDisabled: false,
      overrideModelOptions: [
        { modelId: "model-override", name: "Override Model" },
      ],
    });
    expect(modelOverrideOptions({
      ...selected,
      allowModelOverride: false,
    })).toEqual([]);
  });

  it("summarizes available Tool and Skill counts", () => {
    expect(catalogSelectionSummary(agent())).toBe("2 Tools · 1 Skills");
    expect(catalogSelectionSummary(undefined)).toBe("0 Tools · 0 Skills");
  });

  it("requires a workspace before sending with available Document Tools", () => {
    const selected = agent({
      tools: [
        {
          id: ["tool", "document", "pdf", "extract_text"].join("."),
          revision: "7".repeat(64),
          name: "PDF Extract Text",
          available: true,
        },
        {
          id: ["tool", "document", "xlsx", "read"].join("."),
          revision: "8".repeat(64),
          name: "XLSX Read",
          available: true,
        },
        {
          id: ["tool", "document", "docx", "read"].join("."),
          revision: "9".repeat(64),
          name: "DOCX Read",
          available: true,
        },
      ],
    });
    expect(presentComposer({
      selectedAgent: selected,
      models: [],
      requestedModelId: "",
      selectedWorkspaceId: "",
      composerText: "Read a document",
      busy: false,
    })).toMatchObject({
      selectionSummary: "3 Tools · 3 Document · 1 Skills",
      documentToolSummary: "3 Document Tools need workspace",
      documentWorkspaceRequired: true,
      sendDisabled: true,
      sendButtonLabel: "选择工作目录",
    });
    expect(presentComposer({
      selectedAgent: selected,
      models: [],
      requestedModelId: "",
      selectedWorkspaceId: "workspace-1",
      composerText: "Read a document",
      busy: false,
    })).toMatchObject({
      documentToolSummary: "3 Document Tools ready",
      documentWorkspaceRequired: false,
      sendDisabled: false,
      sendButtonLabel: "发送任务 →",
    });
  });

  it("does not expose sensitive fields from wider agent inputs", () => {
    const sensitiveAgent: AgentProjection & {
      Token: string;
      Credential: string;
      CapabilityLock: string;
      Observation: string;
      resultPayload: string;
    } = {
      ...agent(),
      Token: "token-should-not-render",
      Credential: "credential-should-not-render",
      CapabilityLock: "lock-should-not-render",
      Observation: "observation-should-not-render",
      resultPayload: "payload-should-not-render",
    };
    const output = JSON.stringify(presentComposer({
      selectedAgent: sensitiveAgent,
      models: [],
      requestedModelId: "",
      selectedWorkspaceId: "workspace-1",
      composerText: "Run task",
      busy: false,
    }));

    expect(output).not.toContain("token-should-not-render");
    expect(output).not.toContain("credential-should-not-render");
    expect(output).not.toContain("lock-should-not-render");
    expect(output).not.toContain("observation-should-not-render");
    expect(output).not.toContain("payload-should-not-render");
  });

  it("keeps presentation source pure and free of command/runtime internals", async () => {
    const source = await readFile(presentationSource, "utf8");
    expect(source).not.toMatch(/\bh\s*\(/);
    for (const forbidden of [
      "from \"vue\"",
      "document.",
      "window.",
      "robothreeDesktop",
      "submitTurn",
      "Runtime Selection",
      "Core",
      "Token",
      "Credential",
      "CapabilityLock",
      "Observation",
      "resultPayload",
      "executionReceipt",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
