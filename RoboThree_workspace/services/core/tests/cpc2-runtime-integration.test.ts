import {
  CONTEXT_SCHEMA_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type AgentDefinitionRevision,
  type ConversationMessage,
  type ProviderNeutralMessage,
  type TaskRuntimeSelection,
  type TurnContextSnapshot,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  ConservativeTokenEstimator,
  ContextBudgetPolicy,
  ContextPipeline,
  CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED,
  INSTRUCTION_BUNDLE_MESSAGE_SOURCE_ID,
  LEGACY_DESKTOP_PROMPT_REVISION,
  PLATFORM_PROMPT_V1_REVISION,
  TaskInstructionBundleMaterializer,
  TaskLockedInstructionRuntimeResolver,
  calculateModelRequestDigest,
  createAgentDefinitionRevision,
  createTaskRuntimeSelection,
  platformPromptRevisionForNewTask,
  sha256CanonicalJson,
  type LockedSkillInstructionResolver,
  type TaskLockedInstructionRuntimeMaterial,
} from "../src/index.js";

const id = (value: number) =>
  `019f8d00-0000-7000-8000-${String(value).padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const at = "2026-08-26T08:00:00.000Z";
const ids = Object.freeze({
  task: id(1),
  selection: id(2),
  modelLock: id(3),
  session: id(4),
  snapshot: id(5),
  message: id(6),
  checkpoint: id(7),
});

describe("CPC-2 task-locked instruction runtime", () => {
  it("keeps production disabled by default and preserves the exact legacy marker", () => {
    expect(CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED).toBe(false);
    expect(LEGACY_DESKTOP_PROMPT_REVISION).toBe(
      "sha256:9999999999999999999999999999999999999999999999999999999999999999",
    );
    expect(platformPromptRevisionForNewTask()).toBe(LEGACY_DESKTOP_PROMPT_REVISION);
    expect(platformPromptRevisionForNewTask(false)).toBe(LEGACY_DESKTOP_PROMPT_REVISION);
    expect(platformPromptRevisionForNewTask(true)).toBe(PLATFORM_PROMPT_V1_REVISION);
  });

  it("uses the legacy instruction bytes for an exact legacy Task regardless of the CPC gate", async () => {
    const agent = agentFixture();
    for (const enabled of [false, true]) {
      const runtime = await resolver(enabled).resolve({
        runtimeSelection: selectionFixture(LEGACY_DESKTOP_PROMPT_REVISION),
        submitTurnBundleDigest: digest("7"),
        agent,
      });
      expect(runtime).toEqual({
        mode: "legacy",
        instruction: "Identity: 负责可信任务\n\nGoal: 给出可验证结果\n\n不要伪造成功",
        instructionDigest: sha256CanonicalJson(JsonValueSchema.parse(
          "Identity: 负责可信任务\n\nGoal: 给出可验证结果\n\n不要伪造成功",
        )),
      });
    }
  });

  it("fails a CPC Task closed while production activation is disabled", async () => {
    await expect(resolver(false).resolve({
      runtimeSelection: selectionFixture(PLATFORM_PROMPT_V1_REVISION),
      submitTurnBundleDigest: digest("7"),
      agent: agentFixture(),
    })).rejects.toMatchObject({ code: "context.instruction_runtime_unavailable" });
  });

  it("materializes one exact CPC bundle when the test activation is enabled", async () => {
    const runtime = await cpcRuntime();
    expect(runtime.mode).toBe("cpc_v1");
    if (runtime.mode !== "cpc_v1") throw new Error("expected CPC runtime");
    expect(runtime.bundle.message).toMatchObject({
      role: "system",
      sourceId: INSTRUCTION_BUNDLE_MESSAGE_SOURCE_ID,
      sourceDigest: runtime.bundle.descriptor.instructionBundleDigest,
    });
    expect(runtime.bundle.sources.map((source) => source.sourceKind)).toEqual([
      "platform",
      "task_boundary",
      "agent",
    ]);
  });

  it("maps malformed and unknown durable revisions to typed fail-closed errors", async () => {
    const malformed = {
      ...selectionFixture(PLATFORM_PROMPT_V1_REVISION),
      platformPromptRevision: digest("e"),
    };
    await expect(resolver(true).resolve({
      runtimeSelection: malformed,
      submitTurnBundleDigest: digest("7"),
      agent: agentFixture(),
    })).rejects.toMatchObject({ code: "context.instruction_binding_invalid" });
    await expect(resolver(true).resolve({
      runtimeSelection: selectionFixture(digest("e")),
      submitTurnBundleDigest: digest("7"),
      agent: agentFixture(),
    })).rejects.toMatchObject({ code: "context.platform_prompt_unavailable" });
  });

  it("does not skip a locked Skill when no trusted production resolver exists", async () => {
    const skill = {
      id: "skill.cpc-review",
      revision: digest("3"),
      contentDigest: digest("4"),
      materializedRef: "skill://skill.cpc-review",
    };
    await expect(resolver(true).resolve({
      runtimeSelection: selectionFixture(PLATFORM_PROMPT_V1_REVISION, [skill]),
      submitTurnBundleDigest: digest("7"),
      agent: agentFixture([skill]),
    })).rejects.toMatchObject({ code: "context.skill_material_unavailable" });
  });
});

describe("CPC-2 Context Pipeline integration", () => {
  it("preserves the compiler message byte-for-byte and records content-free evidence", async () => {
    const runtime = await cpcRuntime();
    if (runtime.mode !== "cpc_v1") throw new Error("expected CPC runtime");
    const fixture = snapshotFixture();
    const result = pipeline().run({
      phase: "pre_call",
      requestId: id(20),
      snapshot: fixture.snapshot,
      conversationMessages: fixture.messages,
      model: { capabilityId: "model.cpc-test", capabilityRevision: digest("5") },
      lockedInstructionBundle: lockedContext(runtime, fixture.snapshot.snapshotId),
    });
    const system = result.request.messages.filter((message) => message.role === "system");
    expect(system).toEqual([runtime.bundle.message]);
    expect(result.receipt.instructionBundleEvidence).toEqual({
      schemaVersion: "v1",
      taskInstructionBindingDigest: runtime.bundle.binding.bindingDigest,
      assemblyRevision: runtime.bundle.descriptor.assemblyRevision,
      instructionBundleDigest: runtime.bundle.descriptor.instructionBundleDigest,
      orderedSources: runtime.bundle.descriptor.orderedSources,
    });
    expect(JSON.stringify(result.receipt.instructionBundleEvidence)).not.toContain(
      "不要伪造成功",
    );
    expect(result.receipt.modelRequestDigest).toBe(result.request.requestDigest);
    expect(calculateModelRequestDigest(result.request)).toBe(result.request.requestDigest);
  });

  it("keeps a Compaction summary as data and still emits exactly one System message", async () => {
    const runtime = await cpcRuntime();
    if (runtime.mode !== "cpc_v1") throw new Error("expected CPC runtime");
    const fixture = compactedSnapshotFixture();
    const result = pipeline().run({
      phase: "mid_turn",
      requestId: id(21),
      snapshot: fixture.snapshot,
      conversationMessages: fixture.messages,
      compactionSummary: fixture.compactionSummary,
      model: { capabilityId: "model.cpc-test", capabilityRevision: digest("5") },
      lockedInstructionBundle: lockedContext(runtime, fixture.snapshot.snapshotId),
    });
    expect(result.request.messages.filter((message) => message.role === "system"))
      .toEqual([runtime.bundle.message]);
    expect(result.request.messages.filter((message) => message.role === "user"))
      .toHaveLength(2);
    expect(result.request.messages[1]?.content[0]?.text).toContain(
      "derived and non-authoritative",
    );
    expect(result.receipt.instructionBundleEvidence?.instructionBundleDigest)
      .toBe(runtime.bundle.descriptor.instructionBundleDigest);
  });

  it("rejects legacy and CPC instruction inputs mixed in one request", async () => {
    const runtime = await cpcRuntime();
    if (runtime.mode !== "cpc_v1") throw new Error("expected CPC runtime");
    const fixture = snapshotFixture();
    expect(() => pipeline().run({
      phase: "pre_call",
      requestId: id(22),
      snapshot: fixture.snapshot,
      conversationMessages: fixture.messages,
      model: { capabilityId: "model.cpc-test", capabilityRevision: digest("5") },
      lockedInstructionBundle: lockedContext(runtime, fixture.snapshot.snapshotId),
      instructions: [{
        snapshotId: fixture.snapshot.snapshotId,
        sourceId: "legacy.agent",
        revision: digest("6"),
        contentDigest: sha256CanonicalJson(JsonValueSchema.parse("legacy")),
        content: "legacy",
        selected: true,
        authorized: true,
      }],
    })).toThrow("cannot be combined");
  });

  it("fails when materialization and Context Pipeline use different budget policies", async () => {
    const runtime = await cpcRuntime();
    if (runtime.mode !== "cpc_v1") throw new Error("expected CPC runtime");
    const fixture = snapshotFixture();
    const changed = new ContextPipeline({
      budgetPolicy: new ContextBudgetPolicy({
        modelContextWindow: 32_769,
        reservedOutputTokens: 4_096,
        safetyMarginTokens: 1_024,
        compactionThresholdRatio: 0.8,
        maxPreviewBytes: 4_096,
      }),
      estimator: new ConservativeTokenEstimator(),
    });
    expect(() => changed.run({
      phase: "pre_call",
      requestId: id(23),
      snapshot: fixture.snapshot,
      conversationMessages: fixture.messages,
      model: { capabilityId: "model.cpc-test", capabilityRevision: digest("5") },
      lockedInstructionBundle: lockedContext(runtime, fixture.snapshot.snapshotId),
    })).toThrow("does not match");
  });
});

function policy(): ContextBudgetPolicy {
  return new ContextBudgetPolicy({
    modelContextWindow: 32_768,
    reservedOutputTokens: 4_096,
    safetyMarginTokens: 1_024,
    compactionThresholdRatio: 0.8,
    maxPreviewBytes: 4_096,
  });
}

function pipeline(): ContextPipeline {
  return new ContextPipeline({
    budgetPolicy: policy(),
    estimator: new ConservativeTokenEstimator(),
  });
}

function resolver(
  enabled: boolean,
  skills?: LockedSkillInstructionResolver,
): TaskLockedInstructionRuntimeResolver {
  return new TaskLockedInstructionRuntimeResolver({
    enabled,
    materializer: new TaskInstructionBundleMaterializer({
      tokenEstimator: new ConservativeTokenEstimator(),
      budgetPolicy: policy(),
      ...(skills === undefined ? {} : { lockedSkillInstructionResolver: skills }),
    }),
  });
}

async function cpcRuntime(): Promise<TaskLockedInstructionRuntimeMaterial> {
  return resolver(true).resolve({
    runtimeSelection: selectionFixture(PLATFORM_PROMPT_V1_REVISION),
    submitTurnBundleDigest: digest("7"),
    agent: agentFixture(),
  });
}

function agentFixture(
  skillReferences: AgentDefinitionRevision["skillReferences"] = [],
): AgentDefinitionRevision {
  return createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: "agent.cpc-runtime",
    name: "CPC Runtime Agent",
    identity: "负责可信任务",
    goal: "给出可验证结果",
    instructions: "不要伪造成功",
    defaultModelId: "model.cpc-test",
    allowModelOverride: false,
    skillReferences: [...skillReferences],
    toolReferences: [],
    knowledgeReferences: [],
    requiredModelCapabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: false,
      supportsStreaming: true,
    },
    createdAt: at,
  });
}

function selectionFixture(
  platformPromptRevision: string,
  activeSkillRevisions: AgentDefinitionRevision["skillReferences"] = [],
): TaskRuntimeSelection {
  const agent = agentFixture(activeSkillRevisions);
  return createTaskRuntimeSelection({
    schemaVersion: "v1alpha1",
    runtimeSelectionId: ids.selection,
    taskId: ids.task,
    agent: {
      agentDefinitionId: agent.agentDefinitionId,
      revision: agent.revision,
      digest: agent.digest,
    },
    agentDefaultModelId: "model.cpc-test",
    resolvedModelLock: {
      lockId: ids.modelLock,
      capabilityId: "model.cpc-test",
      lockDigest: digest("1"),
    },
    activeSkillRevisions: [...activeSkillRevisions],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision,
    registryRevision: digest("2"),
    createdAt: at,
  });
}

function lockedContext(
  runtime: Extract<TaskLockedInstructionRuntimeMaterial, { mode: "cpc_v1" }>,
  snapshotId: string,
) {
  return {
    schemaVersion: "v1" as const,
    snapshotId,
    binding: runtime.bundle.binding,
    descriptor: runtime.bundle.descriptor,
    message: runtime.bundle.message,
    estimatedInputTokens: runtime.bundle.estimatedInputTokens,
    availableInputTokens: runtime.bundle.availableInputTokens,
    budgetPolicyDigest: runtime.bundle.budgetPolicyDigest,
  };
}

function snapshotFixture(): Readonly<{
  snapshot: TurnContextSnapshot;
  messages: readonly ConversationMessage[];
}> {
  const message: ProviderNeutralMessage = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user",
    content: [{ type: "text", text: "完成当前任务" }],
  };
  return buildSnapshot(message, 1, 0);
}

function compactedSnapshotFixture() {
  const base = buildSnapshot({
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user",
    content: [{ type: "text", text: "继续执行" }],
  }, 3, 1);
  const compactionId = id(30);
  const compactionJobId = id(31);
  const summary = "此前用户要求保留真实边界。";
  const snapshot = withSnapshotDigest({
    ...base.snapshot,
    conversation: {
      ...base.snapshot.conversation,
      activeCompactionId: compactionId,
      messageStartSequence: 3,
      messageEndSequence: 3,
    },
  });
  return {
    snapshot,
    messages: base.messages,
    compactionSummary: {
      snapshotId: snapshot.snapshotId,
      contextRevision: 1,
      summaryDigest: sha256CanonicalJson(JsonValueSchema.parse(summary)),
      record: {
        schemaVersion: "v1alpha1" as const,
        compactionId,
        compactionJobId,
        sessionId: ids.session,
        sourceStartSequence: 1,
        sourceEndSequence: 2,
        sourceDigest: digest("8"),
        baseContextRevision: 0,
        summary,
        summarySchemaVersion: "v1alpha1" as const,
        summarizerModelRef: "model.cpc-test",
        summarizerPromptRevision: digest("9"),
        estimatedTokensBefore: 100,
        estimatedTokensAfter: 20,
        createdAt: at,
      },
    },
  };
}

function buildSnapshot(
  message: ProviderNeutralMessage,
  sequence: number,
  contextRevision: number,
): Readonly<{ snapshot: TurnContextSnapshot; messages: readonly ConversationMessage[] }> {
  const record: ConversationMessage = {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: ids.message,
      sessionId: ids.session,
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      createdAt: at,
    },
    message,
  };
  const conversation = {
    sessionId: ids.session,
    messageSequence: sequence,
    contextRevision,
    messageStartSequence: sequence,
    messageEndSequence: sequence,
    messageDigest: sha256CanonicalJson(JsonValueSchema.parse([record])),
  };
  const tasks = [{
    taskId: ids.task,
    stateRevision: 0,
    lastEventSequence: 0,
    checkpointId: ids.checkpoint,
    stateDigest: digest("a"),
    capabilityLocks: [],
  }];
  const projection = [{
    type: "conversation_message" as const,
    order: 0,
    sessionId: ids.session,
    messageId: ids.message,
    messageSequence: sequence,
    messageDigest: record.envelope.messageDigest,
  }];
  return {
    messages: [record],
    snapshot: withSnapshotDigest({
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      snapshotId: ids.snapshot,
      sessionId: ids.session,
      conversation,
      tasks,
      projection,
      sourceDigest: digest("0"),
      createdAt: at,
    }),
  };
}

function withSnapshotDigest(snapshot: TurnContextSnapshot): TurnContextSnapshot {
  return {
    ...snapshot,
    sourceDigest: sha256CanonicalJson(JsonValueSchema.parse({
      conversation: snapshot.conversation,
      tasks: snapshot.tasks,
      projection: snapshot.projection,
    })),
  };
}
