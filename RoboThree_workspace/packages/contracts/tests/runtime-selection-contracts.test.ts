import {
  AgentDefinitionRevisionSchema,
  ModelDefinitionSchema,
  TaskRuntimeSelectionSchema,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

const digest = (value: string) => `sha256:${value.repeat(64)}`;

describe("DCF-1.1B Runtime Selection Contract", () => {
  it("keeps Agent, Model and Task selection ownership separate and strict", () => {
    expect(AgentDefinitionRevisionSchema.parse({
      schemaVersion: "v1alpha1",
      agentDefinitionId: "agent.general",
      name: "General",
      identity: "Enterprise assistant",
      goal: "Complete authorized work",
      instructions: "Use only selected and locked capabilities.",
      defaultModelId: "model.default",
      allowModelOverride: true,
      skillReferences: [],
      toolReferences: [],
      knowledgeReferences: [],
      requiredModelCapabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportsToolCalling: true,
        supportsStreaming: true,
      },
      createdAt: "2026-07-26T15:00:00.000Z",
      revision: digest("a"),
      digest: digest("a"),
    })).toBeDefined();
    expect(ModelDefinitionSchema.parse({
      schemaVersion: "v1alpha1",
      modelId: "model.default",
      name: "Default",
      source: "official",
      capability: {
        capabilityId: "model.default",
        capabilityRevision: digest("b"),
      },
      capabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportsToolCalling: true,
        supportsStreaming: true,
        contextWindow: 16_384,
      },
      createdAt: "2026-07-26T15:00:00.000Z",
      revision: digest("c"),
      digest: digest("c"),
    })).toBeDefined();
  });

  it("rejects runtime handles, credentials, context revision and duplicate lock IDs", () => {
    const base = {
      schemaVersion: "v1alpha1",
      runtimeSelectionId: "019f8f00-0000-7000-8000-000000000001",
      taskId: "019f8f00-0000-7000-8000-000000000002",
      agent: {
        agentDefinitionId: "agent.general",
        revision: digest("a"),
        digest: digest("a"),
      },
      agentDefaultModelId: "model.default",
      resolvedModelLock: {
        lockId: "019f8f00-0000-7000-8000-000000000003",
        capabilityId: "model.default",
        lockDigest: digest("d"),
      },
      activeSkillRevisions: [],
      toolLocks: [],
      knowledgeRevisions: [],
      platformPromptRevision: digest("e"),
      registryRevision: digest("f"),
      createdAt: "2026-07-26T15:00:00.000Z",
      selectionDigest: digest("0"),
    };
    expect(TaskRuntimeSelectionSchema.parse(base)).toBeDefined();
    for (const forbidden of [
      { runtimeHandle: {} },
      { credentialRef: "secret:key" },
      { contextRevision: 1 },
      { pid: 1 },
    ]) expect(() => TaskRuntimeSelectionSchema.parse({ ...base, ...forbidden })).toThrow();
    expect(() => TaskRuntimeSelectionSchema.parse({
      ...base,
      toolLocks: [base.resolvedModelLock],
    })).toThrow("lock IDs must be unique");
    expect(() => TaskRuntimeSelectionSchema.parse({
      ...base,
      resolvedModelLock: {
        ...base.resolvedModelLock,
        capabilityId: "model.unrequested",
      },
    })).toThrow("default model");
    expect(() => TaskRuntimeSelectionSchema.parse({
      ...base,
      toolLocks: [{
        lockId: "019f8f00-0000-7000-8000-000000000004",
        capabilityId: "model.not-a-tool",
        lockDigest: digest("1"),
      }],
    })).toThrow("Tool capabilities");
  });
});
