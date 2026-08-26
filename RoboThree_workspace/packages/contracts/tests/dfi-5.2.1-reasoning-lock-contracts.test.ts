import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as rootContracts from "../src/index.js";
import {
  SubmitTurnCommandV1Alpha3Schema,
  SubmitTurnReceiptV1Alpha3Schema,
} from "../src/desktop-local/v1alpha3/index.js";
import {
  ReasoningModeLockMaterialSchema,
  ReasoningModeLockSchema,
} from "../src/reasoning-mode/index.js";
import {
  ReadableTaskRuntimeSelectionSchema,
  TaskRuntimeSelectionV1Alpha2Schema,
} from "../src/runtime-selection/v1alpha2.js";
import {
  ReadableSubmitTurnRecordSchema,
  SubmitTurnRecordV1Alpha3Schema,
} from "../src/submit-turn-coordination/v1alpha3.js";

const id = (suffix: string) =>
  `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const at = "2026-08-25T08:00:00.000Z";

function defaultLock() {
  return {
    schemaVersion: "v1alpha1",
    reasoningModeLockId: id("1"),
    taskId: id("2"),
    modelLockRef: { lockId: id("3"), lockDigest: digest("a") },
    lockedAt: at,
    requestedMode: "default",
    resolution: "default_passthrough",
    reasoningModeLockDigest: digest("b"),
  } as const;
}

function maxLock() {
  return {
    ...defaultLock(),
    requestedMode: "max",
    observedMaxSupport: "supported",
    observedMaxSupportRevision: digest("c"),
    resolution: "max_applied",
    profileRef: {
      profileId: "reasoning.profile.fixture",
      profileRevision: digest("d"),
      profileDigest: digest("d"),
    },
    strategyRef: {
      strategyId: "reasoning.strategy.fixture",
      strategyRevision: digest("e"),
      strategyDigest: digest("f"),
      timeoutPolicyRef: "timeout.policy.fixture",
    },
  } as const;
}

function runtimeSelection(reasoningModeLock = defaultLock()) {
  return {
    schemaVersion: "v1alpha2",
    runtimeSelectionId: id("4"),
    taskId: id("2"),
    agent: {
      agentDefinitionId: "agent.general",
      revision: digest("1"),
      digest: digest("1"),
    },
    agentDefaultModelId: "model.default",
    resolvedModelLock: {
      lockId: id("3"),
      capabilityId: "model.default",
      lockDigest: digest("a"),
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: digest("2"),
    registryRevision: digest("3"),
    createdAt: at,
    reasoningModeLock,
    selectionDigest: digest("4"),
  } as const;
}

function submitCommand(reasoningPreference: Record<string, unknown>) {
  return {
    contractVersion: "v1alpha3",
    commandId: id("5"),
    correlationId: id("6"),
    clientInstanceId: id("7"),
    type: "submit_turn",
    clientTurnId: "client-turn-dfi-5.2.1",
    sessionId: `session:${id("8")}`,
    userInput: "Create a task using the selected reasoning mode.",
    selectionRequest: {
      agentId: "agent.general",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      authorizationPreference: {
        schemaVersion: "v1alpha1",
        requestedMode: "task_scoped",
      },
      reasoningPreference,
    },
  };
}

function coordinationRecord(reasoningModeLock = maxLock()) {
  return {
    schemaVersion: "v1alpha3",
    transportContractVersion: "v1alpha3",
    submitTurnCommandId: id("5"),
    clientTurnId: "client-turn-dfi-5.2.1",
    desktopSessionId: `session:${id("8")}`,
    internalSessionId: id("8"),
    requestDigest: digest("5"),
    selectionRequest: submitCommand({
      requestedMode: "max",
      observedMaxSupport: "supported",
      observedMaxSupportRevision: digest("c"),
    }).selectionRequest,
    lockedAgent: {
      agentDefinitionId: "agent.general",
      revision: digest("1"),
      digest: digest("1"),
    },
    registryRevision: digest("3"),
    platformPromptRevision: digest("2"),
    plannedSelectionDigest: digest("4"),
    authorizationPlan: {
      requestedMode: "task_scoped",
      resolvedMode: "task_scoped",
      policyRevision: digest("6"),
      source: "user_selected",
      authorizationSelectionDigest: digest("7"),
      executionSelectionDigest: digest("8"),
    },
    reasoningPlan: {
      reasoningModeLock,
      plannedRuntimeSelectionDigest: digest("4"),
    },
    capabilityLockIds: [id("3")],
    internalUserMessageId: id("9"),
    internalTaskId: id("2"),
    internalRuntimeSelectionId: id("4"),
    initialCheckpointId: id("10"),
    status: "accepted",
    createdAt: at,
    updatedAt: at,
  } as const;
}

describe("DFI-5.2.1 Reasoning lock contracts", () => {
  it("accepts the four strict lock variants", () => {
    const fallbackBase = {
      ...defaultLock(),
      requestedMode: "max",
      observedMaxSupportRevision: digest("c"),
    } as const;
    for (const lock of [
      defaultLock(),
      maxLock(),
      {
        ...fallbackBase,
        observedMaxSupport: "unsupported",
        resolution: "max_unsupported_default",
      },
      {
        ...fallbackBase,
        observedMaxSupport: "unknown",
        resolution: "max_capability_unknown_default",
      },
    ]) expect(ReasoningModeLockSchema.safeParse(lock).success).toBe(true);
  });

  it("rejects nullable-union imitations and strategy leakage into fallback locks", () => {
    expect(ReasoningModeLockSchema.safeParse({
      ...defaultLock(),
      observedMaxSupport: null,
      profileRef: null,
    }).success).toBe(false);
    expect(ReasoningModeLockSchema.safeParse({
      ...defaultLock(),
      requestedMode: "max",
      observedMaxSupport: "unsupported",
      observedMaxSupportRevision: digest("c"),
      resolution: "max_unsupported_default",
      strategyRef: maxLock().strategyRef,
    }).success).toBe(false);
    expect(ReasoningModeLockMaterialSchema.safeParse(maxLock()).success).toBe(false);
  });

  it("requires an exact Profile revision/digest for max_applied", () => {
    expect(ReasoningModeLockSchema.safeParse({
      ...maxLock(),
      profileRef: { ...maxLock().profileRef, profileRevision: digest("9") },
    }).success).toBe(false);
  });

  it("binds Runtime Selection v1alpha2 to the same Task and Model lock", () => {
    expect(TaskRuntimeSelectionV1Alpha2Schema.safeParse(runtimeSelection()).success)
      .toBe(true);
    expect(TaskRuntimeSelectionV1Alpha2Schema.safeParse(runtimeSelection({
      ...defaultLock(),
      taskId: id("99"),
    })).success).toBe(false);
    expect(TaskRuntimeSelectionV1Alpha2Schema.safeParse(runtimeSelection({
      ...defaultLock(),
      modelLockRef: { ...defaultLock().modelLockRef, lockDigest: digest("9") },
    })).success).toBe(false);
  });

  it("keeps the Reasoning lock identity outside capability lock IDs", () => {
    const selection = runtimeSelection({
      ...defaultLock(),
      reasoningModeLockId: id("3"),
    });
    expect(TaskRuntimeSelectionV1Alpha2Schema.safeParse(selection).success).toBe(false);
  });

  it("reads legacy and v1alpha2 Runtime Selections without changing the root schema", () => {
    const legacy = { ...runtimeSelection() } as Record<string, unknown>;
    legacy.schemaVersion = "v1alpha1";
    delete legacy.reasoningModeLock;
    expect(ReadableTaskRuntimeSelectionSchema.safeParse(legacy).success).toBe(true);
    expect(ReadableTaskRuntimeSelectionSchema.safeParse(runtimeSelection()).success).toBe(true);
    expect(rootContracts.TaskRuntimeSelectionSchema.safeParse(runtimeSelection()).success)
      .toBe(false);
  });

  it("requires strict default or fully observed max SubmitTurn intent", () => {
    expect(SubmitTurnCommandV1Alpha3Schema.safeParse(
      submitCommand({ requestedMode: "default" }),
    ).success).toBe(true);
    expect(SubmitTurnCommandV1Alpha3Schema.safeParse(submitCommand({
      requestedMode: "max",
      observedMaxSupport: "supported",
      observedMaxSupportRevision: digest("c"),
    })).success).toBe(true);
    expect(SubmitTurnCommandV1Alpha3Schema.safeParse(submitCommand({
      requestedMode: "default",
      observedMaxSupport: "supported",
      observedMaxSupportRevision: digest("c"),
    })).success).toBe(false);
    expect(SubmitTurnCommandV1Alpha3Schema.safeParse(
      submitCommand({ requestedMode: "max" }),
    ).success).toBe(false);
  });

  it("keeps public Receipt reasoning data safe and cross-field consistent", () => {
    const receipt = {
      contractVersion: "v1alpha3",
      submitTurnCommandId: id("5"),
      clientTurnId: "client-turn-dfi-5.2.1",
      userMessageId: `message:${id("9")}`,
      taskId: `task:${id("2")}`,
      runtimeSelectionId: `runtime-selection:${id("4")}`,
      status: "accepted",
      runtimeSelectionSummary: {
        runtimeSelectionId: `runtime-selection:${id("4")}`,
        digest: digest("4"),
        agent: { id: "agent.general", revision: digest("1") },
        defaultModelId: "model.default",
        resolvedModel: { id: "model.default", revision: digest("a") },
        activeSkills: [],
        allowedTools: [],
        knowledge: [],
        resolvedAuthorization: {
          requestedMode: "task_scoped",
          resolvedMode: "task_scoped",
          policyRevision: digest("6"),
          source: "user_selected",
          authorizationSelectionDigest: digest("7"),
        },
        executionSelectionDigest: digest("8"),
        reasoning: {
          requestedMode: "max",
          resolvedMode: "max",
          resolutionReason: "applied",
          reasoningModeLockId: id("1"),
          reasoningModeLockDigest: digest("b"),
        },
      },
      acceptedAt: at,
    } as const;
    expect(SubmitTurnReceiptV1Alpha3Schema.safeParse(receipt).success).toBe(true);
    expect(SubmitTurnReceiptV1Alpha3Schema.safeParse({
      ...receipt,
      runtimeSelectionSummary: {
        ...receipt.runtimeSelectionSummary,
        reasoning: {
          ...receipt.runtimeSelectionSummary.reasoning,
          resolvedMode: "model_default",
        },
      },
    }).success).toBe(false);
    expect(SubmitTurnReceiptV1Alpha3Schema.safeParse({
      ...receipt,
      runtimeSelectionSummary: {
        ...receipt.runtimeSelectionSummary,
        reasoning: {
          ...receipt.runtimeSelectionSummary.reasoning,
          strategyId: "reasoning.strategy.fixture",
        },
      },
    }).success).toBe(false);
  });

  it("binds coordination v1alpha3 to the exact reasoning plan", () => {
    expect(SubmitTurnRecordV1Alpha3Schema.safeParse(coordinationRecord()).success)
      .toBe(true);
    expect(SubmitTurnRecordV1Alpha3Schema.safeParse({
      ...coordinationRecord(),
      plannedSelectionDigest: digest("9"),
    }).success).toBe(false);
    expect(SubmitTurnRecordV1Alpha3Schema.safeParse({
      ...coordinationRecord(),
      capabilityLockIds: [id("3"), id("1")],
    }).success).toBe(false);
  });

  it("rejects coordination drift from the observed support fact", () => {
    expect(SubmitTurnRecordV1Alpha3Schema.safeParse({
      ...coordinationRecord(),
      selectionRequest: submitCommand({
        requestedMode: "max",
        observedMaxSupport: "supported",
        observedMaxSupportRevision: digest("9"),
      }).selectionRequest,
    }).success).toBe(false);
  });

  it("keeps the root coordination readable union at v1alpha1/v1alpha2", () => {
    expect(ReadableSubmitTurnRecordSchema.safeParse(coordinationRecord()).success).toBe(true);
    expect(rootContracts.ReadableSubmitTurnRecordSchema.safeParse(coordinationRecord()).success)
      .toBe(false);
  });

  it("exports private complete schemas only through explicit package subpaths", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { exports?: Record<string, unknown> };
    expect(packageJson.exports?.["./reasoning-mode/v1alpha1"]).toBeDefined();
    expect(packageJson.exports?.["./model-protocol/v1alpha2"]).toBeDefined();
    expect(packageJson.exports?.["./runtime-selection/v1alpha2"]).toBeDefined();
    expect(packageJson.exports?.["./submit-turn-coordination/v1alpha3"]).toBeDefined();
    expect("ReasoningModeLockSchema" in rootContracts).toBe(false);
    expect("ModelRequestV1Alpha2Schema" in rootContracts).toBe(false);
    expect("TaskRuntimeSelectionV1Alpha2Schema" in rootContracts).toBe(false);
    expect("SubmitTurnRecordV1Alpha3Schema" in rootContracts).toBe(false);
  });

  it("keeps private lock and plan imports out of Preload, Renderer and Admin", async () => {
    const roots = [
      "apps/desktop/src/preload",
      "apps/desktop/src/renderer",
      "apps/admin-console/src",
    ];
    const forbidden = [
      "@robothree/contracts/reasoning-mode/v1alpha1",
      "@robothree/contracts/model-protocol/v1alpha2",
      "@robothree/contracts/runtime-selection/v1alpha2",
      "@robothree/contracts/submit-turn-coordination/v1alpha3",
    ];
    for (const root of roots) {
      for (const file of await sourceFiles(root)) {
        const source = await readFile(file, "utf8");
        for (const specifier of forbidden) expect(source).not.toContain(specifier);
      }
    }
  });
});

async function sourceFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx|vue)$/u.test(entry.name)) result.push(path);
  }
  return result;
}
