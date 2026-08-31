import {
  CONTRACT_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../src/registry/capability-revision.js";
import { createModelRequestV1Alpha2 } from "../src/application/model-request-revisions.js";
import { createReasoningModeLock } from "../src/application/reasoning-mode-lock-domain.js";
import { createTaskRuntimeSelectionV1Alpha2 } from
  "../src/application/runtime-selection-revisions.js";
import {
  ProviderReasoningMappingIntegrityError,
  createProviderReasoningMappingRelease,
} from "../src/application/provider-reasoning-mapping-domain.js";
import { ReleasePinnedReasoningMappingRegistry } from
  "../src/application/release-pinned-reasoning-mapping-registry.js";
import { TaskLockedReasoningProviderMapper } from
  "../src/application/task-locked-reasoning-provider-mapper.js";
import { sha256CanonicalJson } from "../src/persistence/digest.js";
import type { ModelProviderInvocation } from "../src/ports/model-provider-invocation.js";
import { commitmentFixture } from "./support/dfi531-private-mapping-fixture.js";

const id = (suffix: string) => `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const at = "2026-08-27T08:00:00.000Z";

describe("DFI-5.3.1 Task-locked Provider mapping preflight", () => {
  it("omits every private mapping lookup for default passthrough", async () => {
    const fixture = invocationFixture("default");
    let profileLoads = 0;
    let mappingLoads = 0;
    const mapper = new TaskLockedReasoningProviderMapper({
      profiles: { loadExact: async () => { profileLoads += 1; return undefined; } },
      mappings: { loadExact: async () => { mappingLoads += 1; return []; } },
    });

    await expect(mapper.map({ invocation: fixture.invocation }))
      .resolves.toEqual({ disposition: "omit" });
    expect({ profileLoads, mappingLoads }).toEqual({ profileLoads: 0, mappingLoads: 0 });
  });

  it("loads the exact Profile and private mapping once for Max", async () => {
    const fixture = invocationFixture("max");
    let profileLoads = 0;
    let mappingLoads = 0;
    const registry = new ReleasePinnedReasoningMappingRegistry([fixture.release]);
    const mapper = new TaskLockedReasoningProviderMapper({
      profiles: {
        loadExact: async (subject) => {
          profileLoads += 1;
          return registry.loadExactProfile(subject, fixture.release.mapping.profileRef);
        },
      },
      mappings: {
        loadExact: async (query) => {
          mappingLoads += 1;
          return registry.loadExact(query);
        },
      },
    });

    await expect(mapper.map({
      invocation: fixture.invocation,
      providerFamily: fixture.release.mapping.providerFamily,
      exactSubject: fixture.release.mapping.exactSubject,
      timeoutPolicyIdentity: fixture.release.mapping.timeoutPolicyIdentity,
    })).resolves.toEqual({
      disposition: "apply",
      providerFamily: "enterprise_openai",
      mappingRevision: fixture.release.mapping.mappingRevision,
      mappingDigest: fixture.release.mapping.mappingDigest,
      directive: { kind: "openai_reasoning_effort", effort: "xhigh" },
    });
    expect({ profileLoads, mappingLoads }).toEqual({ profileLoads: 1, mappingLoads: 1 });
  });

  it("returns typed unavailable for missing material without any upstream side effect", async () => {
    const fixture = invocationFixture("max");
    const upstream = zeroSideEffects();
    const mapper = new TaskLockedReasoningProviderMapper({
      profiles: { loadExact: async () => fixture.release.profile },
      mappings: { loadExact: async () => [] },
    });
    const promise = mapper.map({
      invocation: fixture.invocation,
      providerFamily: fixture.release.mapping.providerFamily,
      exactSubject: fixture.release.mapping.exactSubject,
      timeoutPolicyIdentity: fixture.release.mapping.timeoutPolicyIdentity,
    });

    await expect(promise).rejects.toMatchObject({ code: "reasoning_mapping_unavailable" });
    expect(upstream).toEqual(zeroSideEffects());
  });

  it("returns typed conflict for duplicate or drifted exact mappings", async () => {
    const fixture = invocationFixture("max");
    const common = {
      invocation: fixture.invocation,
      providerFamily: fixture.release.mapping.providerFamily,
      exactSubject: fixture.release.mapping.exactSubject,
      timeoutPolicyIdentity: fixture.release.mapping.timeoutPolicyIdentity,
    } as const;
    const duplicate = new TaskLockedReasoningProviderMapper({
      profiles: { loadExact: async () => fixture.release.profile },
      mappings: { loadExact: async () => [fixture.release.mapping, fixture.release.mapping] },
    });
    await expect(duplicate.map(common)).rejects.toMatchObject({
      code: "reasoning_mapping_conflict",
    });
    const drifted = new TaskLockedReasoningProviderMapper({
      profiles: { loadExact: async () => fixture.release.profile },
      mappings: { loadExact: async () => [{
        ...fixture.release.mapping,
        evidenceRevision: digest("8"),
      }] },
    });
    await expect(drifted.map(common)).rejects.toMatchObject({
      code: "reasoning_mapping_conflict",
    });
  });

  it("rejects request, selection, lock, subject, and timeout drift before apply", async () => {
    const fixture = invocationFixture("max");
    const registry = new ReleasePinnedReasoningMappingRegistry([fixture.release]);
    const mapper = new TaskLockedReasoningProviderMapper({
      profiles: registry.pinnedProfileSource([{
        subject: fixture.release.profile.subject,
        profileRef: fixture.release.mapping.profileRef,
      }]),
      mappings: registry,
    });
    const common = {
      providerFamily: fixture.release.mapping.providerFamily,
      exactSubject: fixture.release.mapping.exactSubject,
      timeoutPolicyIdentity: fixture.release.mapping.timeoutPolicyIdentity,
    } as const;

    await expect(mapper.map({
      ...common,
      invocation: { ...fixture.invocation, taskId: id("99") },
    })).rejects.toBeInstanceOf(ProviderReasoningMappingIntegrityError);
    await expect(mapper.map({
      ...common,
      invocation: fixture.invocation,
      exactSubject: { ...common.exactSubject, modelCapabilityRevision: digest("9") },
    })).rejects.toMatchObject({ code: "reasoning_mapping_conflict" });
    await expect(mapper.map({
      ...common,
      invocation: fixture.invocation,
      timeoutPolicyIdentity: { ...common.timeoutPolicyIdentity, timeoutPolicyDigest: digest("9") },
    })).rejects.toMatchObject({ code: "reasoning_mapping_conflict" });
  });
});

function invocationFixture(mode: "default" | "max") {
  const seed = commitmentFixture();
  const source = {
    trust: "official" as const,
    packageId: "robothree.official.dfi5.3.1",
    packageRevision: digest("a"),
  };
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: seed.exactSubject.modelCapabilityId,
    kind: "model",
    name: "DFI-5.3.1 fixture",
    description: "Exact private mapping fixture",
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
    adapterDescriptorId: seed.exactSubject.adapterDescriptorId,
    adapterKind: "model_provider",
    source,
    implementationRef: "core:dfi531-fixture",
    runtimeBoundary: "in_process",
    protocol: { name: "fixture-model", version: "v1alpha1" },
  });
  const commitment = {
    ...seed,
    exactSubject: {
      ...seed.exactSubject,
      modelCapabilityRevision: definition.revision,
      adapterDescriptorRevision: descriptor.revision,
    },
  };
  const release = createProviderReasoningMappingRelease({
    mappingId: "reasoning.mapping.fixture-openai",
    commitment,
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.dfi531-fixture",
    capability: { capabilityId: definition.capabilityId, capabilityRevision: definition.revision },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
  });
  const modelLock: TaskCapabilityLock = {
    schemaVersion: CONTRACT_VERSION,
    lockId: id("3"),
    taskId: id("2"),
    registryRevision: digest("b"),
    definitionSnapshot: definition,
    bindingSnapshot: binding,
    adapterDescriptorSnapshot: descriptor,
    lockedAt: at,
  };
  const modelLockDigest = sha256CanonicalJson(JsonValueSchema.parse(modelLock));
  const reasoningModeLock = createReasoningModeLock(mode === "max" ? {
    schemaVersion: "v1alpha1",
    reasoningModeLockId: id("4"),
    taskId: modelLock.taskId,
    modelLockRef: { lockId: modelLock.lockId, lockDigest: modelLockDigest },
    lockedAt: at,
    requestedMode: "max",
    observedMaxSupport: "supported",
    observedMaxSupportRevision: digest("c"),
    resolution: "max_applied",
    profileRef: release.mapping.profileRef,
    strategyRef: release.mapping.strategyRef,
  } : {
    schemaVersion: "v1alpha1",
    reasoningModeLockId: id("4"),
    taskId: modelLock.taskId,
    modelLockRef: { lockId: modelLock.lockId, lockDigest: modelLockDigest },
    lockedAt: at,
    requestedMode: "default",
    resolution: "default_passthrough",
  });
  const selection = createTaskRuntimeSelectionV1Alpha2({
    schemaVersion: "v1alpha2",
    runtimeSelectionId: id("5"),
    taskId: modelLock.taskId,
    agent: { agentDefinitionId: "agent.general", revision: digest("d"), digest: digest("d") },
    agentDefaultModelId: definition.capabilityId,
    resolvedModelLock: {
      lockId: modelLock.lockId,
      capabilityId: definition.capabilityId,
      lockDigest: modelLockDigest,
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: digest("e"),
    registryRevision: modelLock.registryRevision,
    createdAt: at,
    reasoningModeLock,
  });
  const request = createModelRequestV1Alpha2({
    schemaVersion: "v1alpha2",
    requestId: id("10"),
    snapshotId: id("11"),
    contextSourceDigest: digest("f"),
    model: { capabilityId: definition.capabilityId, capabilityRevision: definition.revision },
    messages: [{
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user",
      content: [{ type: "text", text: "Use the locked mode." }],
    }],
    tools: [],
    artifacts: [],
    maxOutputTokens: 1_024,
    reasoning: mode === "max" ? {
      mode: "locked_max_strategy",
      reasoningModeLockId: reasoningModeLock.reasoningModeLockId,
      reasoningModeLockDigest: reasoningModeLock.reasoningModeLockDigest,
      strategyId: release.mapping.strategyRef.strategyId,
      strategyRevision: release.mapping.strategyRef.strategyRevision,
      strategyDigest: release.mapping.strategyRef.strategyDigest,
      timeoutPolicyRef: release.mapping.strategyRef.timeoutPolicyRef,
    } : {
      mode: "default_passthrough",
      reasoningModeLockId: reasoningModeLock.reasoningModeLockId,
      reasoningModeLockDigest: reasoningModeLock.reasoningModeLockDigest,
    },
  });
  const invocation: ModelProviderInvocation = {
    sessionId: id("20"),
    taskId: modelLock.taskId,
    runId: id("21"),
    stepId: id("22"),
    actionId: id("23"),
    round: 1,
    runtimeSelection: selection,
    modelLock,
    modelRequest: request,
    deadlineAt: "2026-08-27T08:15:00.000Z",
    externalTarget: "fixture://provider",
    dataCategories: [],
    dataScopeDigest: digest("7"),
    admission: {
      type: "user_confirmed",
      confirmationId: id("24"),
      scopeDigest: digest("8"),
      confirmationDigest: digest("9"),
    },
    assistantMessageId: id("25"),
  };
  return { release, invocation };
}

function zeroSideEffects() {
  return {
    credentialResolve: 0,
    dnsLookup: 0,
    socketConnect: 0,
    tlsHandshake: 0,
    httpRequestBodyWrite: 0,
    gatewayAccept: 0,
    durableInvocationPrepare: 0,
    usageProjection: 0,
  };
}
