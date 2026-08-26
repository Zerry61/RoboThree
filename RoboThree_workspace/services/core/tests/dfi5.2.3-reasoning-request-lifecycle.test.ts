import {
  CONTRACT_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  ModelRequestSchema,
  type ModelRequest,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import type { ModelProvider } from "../src/index.js";
import { describe, expect, it } from "vitest";

import {
  AgentLoopCoordinator,
  FakeAgentToolCallExecutor,
  ReasoningAwareContextRequestFinalizer,
  ReasoningProtocolUnavailableError,
  TaskReasoningRequestMaterializer,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  createCompactionExecutionBindingV1Alpha2,
  createReasoningModeLock,
  createTaskRuntimeSelectionV1Alpha2,
  parseReadableCompactionExecutionBinding,
  requireLegacyModelRequestForUnmappedProvider,
  sha256CanonicalJson,
} from "../src/index.js";

const id = (suffix: string) =>
  `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const at = "2026-08-25T09:00:00.000Z";

describe("DFI-5.2.3 reasoning request lifecycle", () => {
  it("materializes one v1alpha2 request and atomically rebinds its Context receipt", () => {
    const fixture = runtimeFixture();
    const base = requestFixture(fixture.lock.definitionSnapshot.revision);
    const finalized = new ReasoningAwareContextRequestFinalizer().finalize({
      request: base,
      receipt: receipt(base.requestDigest),
      runtimeSelection: fixture.selection,
      modelLock: fixture.lock,
    });

    expect(finalized.request).toMatchObject({
      schemaVersion: "v1alpha2",
      reasoning: {
        mode: "locked_max_strategy",
        reasoningModeLockId: fixture.selection.reasoningModeLock.reasoningModeLockId,
        reasoningModeLockDigest: fixture.selection.reasoningModeLock.reasoningModeLockDigest,
      },
    });
    expect(finalized.request.requestDigest).not.toBe(base.requestDigest);
    expect(finalized.receipt.modelRequestDigest).toBe(finalized.request.requestDigest);
  });

  it("fails closed when the exact Model lock is not the selection lock", () => {
    const fixture = runtimeFixture();
    expect(() => new TaskReasoningRequestMaterializer().materialize({
      baseRequest: requestFixture(fixture.lock.definitionSnapshot.revision),
      runtimeSelection: fixture.selection,
      modelLock: { ...fixture.lock, lockId: id("99") },
    })).toThrow("Model lock does not match");
  });

  it("persists a strict v1alpha2 Compaction binding and rejects digest tamper", () => {
    const fixture = runtimeFixture();
    const binding = createCompactionExecutionBindingV1Alpha2({
      schemaVersion: "v1alpha2",
      compactionJobId: id("20"),
      sessionId: id("21"),
      taskId: fixture.lock.taskId,
      runtimeSelectionId: fixture.selection.runtimeSelectionId,
      runtimeSelectionDigest: fixture.selection.selectionDigest,
      modelLockId: fixture.lock.lockId,
      modelCapabilityId: fixture.lock.definitionSnapshot.capabilityId,
      modelLockDigest: fixture.selection.resolvedModelLock.lockDigest,
      registryRevision: fixture.selection.registryRevision,
      adapterDescriptorId: fixture.lock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision: fixture.lock.adapterDescriptorSnapshot.revision,
      externalTargetDigest: digest("7"),
      summarizerPromptRevision: digest("8"),
      createdAt: at,
      reasoningModeLockId: fixture.selection.reasoningModeLock.reasoningModeLockId,
      reasoningModeLockDigest: fixture.selection.reasoningModeLock.reasoningModeLockDigest,
      modelRequestProtocolVersion: "v1alpha2",
    });
    expect(parseReadableCompactionExecutionBinding(binding)).toEqual(binding);
    expect(() => parseReadableCompactionExecutionBinding({
      ...binding,
      reasoningModeLockDigest: digest("9"),
    })).toThrow("digest mismatch");
  });

  it("rejects v1alpha2 before a v1-only Provider can perform upstream work", () => {
    const fixture = runtimeFixture();
    const request = new TaskReasoningRequestMaterializer().materialize({
      baseRequest: requestFixture(fixture.lock.definitionSnapshot.revision),
      runtimeSelection: fixture.selection,
      modelLock: fixture.lock,
    });
    expect(() => requireLegacyModelRequestForUnmappedProvider(request))
      .toThrow(ReasoningProtocolUnavailableError);
  });

  it("projects the typed unavailable result through Agent Loop without retry", async () => {
    const fixture = runtimeFixture();
    const request = new TaskReasoningRequestMaterializer().materialize({
      baseRequest: requestFixture(fixture.lock.definitionSnapshot.revision),
      runtimeSelection: fixture.selection,
      modelLock: fixture.lock,
    });
    let upstreamRequestCount = 0;
    const provider: ModelProvider = {
      adapterKind: "model_provider",
      adapterDescriptorId: "adapter.model.unmapped",
      adapterDescriptorRevision: digest("6"),
      async *stream(candidate) {
        requireLegacyModelRequestForUnmappedProvider(candidate);
        upstreamRequestCount += 1;
        yield { type: "started" };
      },
    };
    const result = await new AgentLoopCoordinator({
      model: provider,
      tools: new FakeAgentToolCallExecutor(),
    }).run({ buildRequest: () => request });
    expect(result).toMatchObject({
      status: "failed",
      error: { code: "reasoning_protocol_unavailable", retryable: false },
    });
    expect(upstreamRequestCount).toBe(0);
  });
});

function runtimeFixture() {
  const source = {
    trust: "official" as const,
    packageId: "robothree.official.dfi5.2.3",
    packageRevision: digest("a"),
  };
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.dfi5-lifecycle",
    kind: "model",
    name: "DFI-5 lifecycle model",
    description: "Fixture for exact reasoning request materialization",
    source,
    model: {
      family: "fixture",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 16_384,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.dfi5-lifecycle",
    adapterKind: "model_provider",
    source,
    implementationRef: "core:dfi5-lifecycle-fixture",
    runtimeBoundary: "in_process",
    protocol: { name: "fixture-model", version: "v1alpha1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.dfi5-lifecycle",
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
  });
  const lock: TaskCapabilityLock = {
    schemaVersion: CONTRACT_VERSION,
    lockId: id("3"),
    taskId: id("2"),
    registryRevision: digest("b"),
    definitionSnapshot: definition,
    bindingSnapshot: binding,
    adapterDescriptorSnapshot: descriptor,
    lockedAt: at,
  };
  const modelLockDigest = sha256CanonicalJson(JsonValueSchema.parse(lock));
  const reasoningModeLock = createReasoningModeLock({
    schemaVersion: "v1alpha1",
    reasoningModeLockId: id("4"),
    taskId: lock.taskId,
    modelLockRef: { lockId: lock.lockId, lockDigest: modelLockDigest },
    lockedAt: at,
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
      strategyId: "reasoning.strategy.fixture-max",
      strategyRevision: digest("e"),
      strategyDigest: digest("f"),
      timeoutPolicyRef: "timeout.policy.fixture-max",
    },
  });
  const selection = createTaskRuntimeSelectionV1Alpha2({
    schemaVersion: "v1alpha2",
    runtimeSelectionId: id("5"),
    taskId: lock.taskId,
    agent: {
      agentDefinitionId: "agent.general",
      revision: digest("1"),
      digest: digest("1"),
    },
    agentDefaultModelId: definition.capabilityId,
    resolvedModelLock: {
      lockId: lock.lockId,
      capabilityId: definition.capabilityId,
      lockDigest: modelLockDigest,
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: digest("2"),
    registryRevision: lock.registryRevision,
    createdAt: at,
    reasoningModeLock,
  });
  return { lock, selection };
}

function requestFixture(capabilityRevision: `sha256:${string}`): ModelRequest {
  const material = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    requestId: id("10"),
    snapshotId: id("11"),
    contextSourceDigest: digest("3"),
    model: { capabilityId: "model.dfi5-lifecycle", capabilityRevision },
    messages: [{
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user" as const,
      content: [{ type: "text" as const, text: "Use the locked mode." }],
    }],
    tools: [],
    artifacts: [],
    maxOutputTokens: 1_024,
  };
  return ModelRequestSchema.parse({
    ...material,
    requestDigest: sha256CanonicalJson(JsonValueSchema.parse(material)),
  });
}

function receipt(modelRequestDigest: string) {
  return {
    phase: "pre_call" as const,
    snapshotId: id("11"),
    snapshotSourceDigest: digest("4"),
    contextSourceDigest: digest("3"),
    policyDigest: digest("5"),
    includedSegments: [],
    excludedSources: [],
    reducedSegmentIds: [],
    initialEstimatedInputTokens: 10,
    finalEstimatedInputTokens: 10,
    availableInputTokens: 1_024,
    compactionThresholdTokens: 900,
    reductionApplied: false,
    modelRequestDigest,
  };
}
