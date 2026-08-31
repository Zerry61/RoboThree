import {
  MODEL_PROTOCOL_VERSION,
  JsonValueSchema,
  type ModelStreamEvent,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  DurableLocalPersonalModelProvider,
  FakeClock,
  InMemoryLocalPersonalModelInvocationPersistence,
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
  LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF,
  PersonalModelProviderProfileRegistry,
  PersonalModelTaskLockMaterializer,
  ReleasePinnedReasoningMappingRegistry,
  TaskLockedReasoningProviderMapper,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  createModelInvocationTimeoutMaterial,
  createModelRequestV1Alpha2,
  createPersonalModelDefinition,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
  createProviderReasoningMappingRelease,
  createReasoningModeLock,
  createTaskRuntimeSelectionV1Alpha2,
  deriveLocalPersonalReasoningProfileSubject,
  derivePersonalModelOwnerIdentity,
  localPersonalReasoningTimeoutPolicyIdentity,
  projectLocalPersonalReasoningRequest,
  sha256CanonicalJson,
  type LocalPersonalModelStreamTransport,
  type LocalPersonalProviderAttemptTelemetry,
  type LocalPersonalReasoningProjection,
  type ModelProviderInvocation,
  type PersonalModelPersistence,
} from "../src/index.js";

const at = "2026-08-27T08:00:00.000Z";
const id = (n: number) => `019f7447-a784-77b2-a716-${String(n).padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe("DFI-5.3.2 Local Personal exact reasoning mapping", () => {
  it("keeps Capability, Personal configuration, execution and Adapter digest domains separate", () => {
    const fixture = createFixture("max");
    const subject = deriveLocalPersonalReasoningProfileSubject({
      definition: fixture.definition,
      modelLock: fixture.modelLock,
      adapterDescriptorId: fixture.modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision: fixture.modelLock.adapterDescriptorSnapshot.revision,
    });
    expect(subject).toEqual({
      authority: "local_personal",
      modelCapabilityId: fixture.definition.personalModelId,
      modelCapabilityRevision: fixture.modelLock.definitionSnapshot.revision,
      adapterDescriptorId: fixture.modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision: fixture.modelLock.adapterDescriptorSnapshot.revision,
      personalExecutionDefinitionDigest: fixture.definition.executionDefinitionDigest,
    });
    expect(subject.modelCapabilityRevision).not.toBe(fixture.definition.configurationRevision);
    expect(localPersonalReasoningTimeoutPolicyIdentity(
      LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    )).toEqual({
      timeoutPolicyRef: LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF,
      timeoutPolicyRevision: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyRevision,
      timeoutPolicyDigest: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyDigest,
    });
  });

  it("builds default/fallback bodies by omission and applies only the sealed effort field", () => {
    const fixture = createFixture("max");
    const omitted = projectLocalPersonalReasoningRequest(
      fixture.request,
      fixture.definition.providerModelId,
      { mode: "omit" },
    );
    const applied = projectLocalPersonalReasoningRequest(
      fixture.request,
      fixture.definition.providerModelId,
      {
        mode: "apply",
        providerFamily: "local_openai",
        mappingRevision: fixture.release.mapping.mappingRevision,
        mappingDigest: fixture.release.mapping.mappingDigest,
        directive: { kind: "openai_reasoning_effort", effort: "xhigh" },
      },
    );
    expect(omitted).not.toHaveProperty("reasoning_effort");
    expect(JSON.stringify(omitted)).not.toMatch(/reasoning|effort|thinking|budget|enable_thinking/u);
    expect(applied).toMatchObject({ reasoning_effort: "xhigh" });
    expect(Object.keys(applied).filter((key) => key.includes("reasoning"))).toEqual([
      "reasoning_effort",
    ]);
    expect(() => projectLocalPersonalReasoningRequest(
      fixture.request,
      fixture.definition.providerModelId,
      {
        mode: "apply",
        providerFamily: "local_openai",
        mappingRevision: digest("8"),
        mappingDigest: digest("9"),
        directive: { kind: "openai_reasoning_effort", effort: "xhigh" },
      },
    )).toThrow();
  });

  it("maps max exactly once before durable prepare and dispatches a sealed projection", async () => {
    const value = createFixture("max");
    const events: ModelStreamEvent[] = [];
    for await (const event of value.provider.stream(
      value.request,
      new AbortController().signal,
      value.invocation,
    )) events.push(event);
    expect(events).toEqual([
      { type: "started" },
      { type: "text_delta", delta: "ok" },
      { type: "completed", finishReason: "stop" },
    ]);
    expect(value.loads()).toEqual({ profile: 1, mapping: 1 });
    expect(value.raw.projections).toEqual([{
      mode: "apply",
      providerFamily: "local_openai",
      mappingRevision: value.release.mapping.mappingRevision,
      mappingDigest: value.release.mapping.mappingDigest,
      directive: { kind: "openai_reasoning_effort", effort: "xhigh" },
    }]);
    expect((await value.invocations.listPending(10))).toEqual([]);
    await expect(value.provider.stream(
      value.request,
      new AbortController().signal,
      value.invocation,
    )[Symbol.asyncIterator]().next()).rejects.toThrow("no longer available");
    expect(value.loads()).toEqual({ profile: 1, mapping: 1 });
    expect(value.raw.attemptCount).toBe(1);
  });

  it("keeps default lookup-free and fails missing max mapping before durable or raw side effects", async () => {
    const defaultValue = createFixture("default");
    await consume(defaultValue);
    expect(defaultValue.loads()).toEqual({ profile: 0, mapping: 0 });
    expect(defaultValue.raw.projections).toEqual([{ mode: "omit" }]);

    const missing = createFixture("max", false);
    await expect(missing.provider.stream(
      missing.request,
      new AbortController().signal,
      missing.invocation,
    )[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: "reasoning_mapping_unavailable",
    });
    expect(missing.raw.attemptCount).toBe(0);
    expect(await missing.invocations.listPending(10)).toEqual([]);
  });
});

function createFixture(mode: "default" | "max", installRelease = true) {
  const namespace = createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: Buffer.alloc(32, 7),
    createdAt: at,
  });
  const owner = derivePersonalModelOwnerIdentity(namespace, {
    enterpriseId: "enterprise.one",
    userId: "user.one",
    deviceId: "device.one",
  });
  const credentialRef = allocatePersonalCredentialReference(Buffer.alloc(32, 9));
  const profileRegistry = new PersonalModelProviderProfileRegistry();
  const definition = createPersonalModelDefinition({
    ownerIdentity: owner,
    personalModelId: "model.personal.dfi532",
    providerKind: "custom",
    providerProfileRevision: profileRegistry.resolve("custom").profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://provider.invalid/v1",
    providerModelId: "fixture-model",
    displayName: "DFI-5.3.2 Fixture",
    capabilities: ["text", "streaming"],
    credentialRef,
    credentialRevision: 1,
    credentialBindingDigest: calculateCredentialBindingDigest({
      credentialRef,
      createdByOperationId: id(1),
      credentialRevision: 1,
    }),
    createdAt: at,
  });
  const modelLock = new PersonalModelTaskLockMaterializer().prepare({
    taskId: id(2),
    lockId: id(3),
    lockedAt: at,
    registryRevision: digest("a"),
    namespace,
    definition,
  });
  const subject = deriveLocalPersonalReasoningProfileSubject({
    definition,
    modelLock,
    adapterDescriptorId: modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
    adapterDescriptorRevision: modelLock.adapterDescriptorSnapshot.revision,
  });
  const timeoutIdentity = localPersonalReasoningTimeoutPolicyIdentity(
    LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
  );
  const release = createProviderReasoningMappingRelease({
    mappingId: "reasoning.mapping.local-personal-dfi532",
    commitment: {
      authority: "local_personal",
      providerFamily: "local_openai",
      exactSubject: subject,
      profileId: "reasoning.profile.local-personal-dfi532",
      strategyId: "reasoning.strategy.local-personal-dfi532",
      strategyRevision: digest("b"),
      mappingKind: "effort_level",
      timeoutPolicyIdentity: timeoutIdentity,
      requestProjectionRevision: digest("c"),
      evidenceRevision: digest("d"),
      typedPrivateDirective: { kind: "openai_reasoning_effort", effort: "xhigh" },
    },
  });
  const lockDigest = sha256CanonicalJson(JsonValueSchema.parse(modelLock));
  const reasoningModeLock = createReasoningModeLock(mode === "max" ? {
    schemaVersion: "v1alpha1",
    reasoningModeLockId: id(4),
    taskId: modelLock.taskId,
    modelLockRef: { lockId: modelLock.lockId, lockDigest },
    lockedAt: at,
    requestedMode: "max",
    observedMaxSupport: "supported",
    observedMaxSupportRevision: digest("e"),
    resolution: "max_applied",
    profileRef: release.mapping.profileRef,
    strategyRef: release.mapping.strategyRef,
  } : {
    schemaVersion: "v1alpha1",
    reasoningModeLockId: id(4),
    taskId: modelLock.taskId,
    modelLockRef: { lockId: modelLock.lockId, lockDigest },
    lockedAt: at,
    requestedMode: "default",
    resolution: "default_passthrough",
  });
  const selection = createTaskRuntimeSelectionV1Alpha2({
    schemaVersion: "v1alpha2",
    runtimeSelectionId: id(5),
    taskId: modelLock.taskId,
    agent: { agentDefinitionId: "agent.general", revision: digest("f"), digest: digest("f") },
    agentDefaultModelId: definition.personalModelId,
    resolvedModelLock: {
      lockId: modelLock.lockId,
      capabilityId: modelLock.definitionSnapshot.capabilityId,
      lockDigest,
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: digest("1"),
    registryRevision: modelLock.registryRevision,
    createdAt: at,
    reasoningModeLock,
  });
  const request = createModelRequestV1Alpha2({
    schemaVersion: "v1alpha2",
    requestId: id(6),
    snapshotId: id(7),
    contextSourceDigest: digest("2"),
    model: {
      capabilityId: modelLock.definitionSnapshot.capabilityId,
      capabilityRevision: modelLock.definitionSnapshot.revision,
    },
    messages: [{
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user",
      content: [{ type: "text", text: "hello" }],
    }],
    tools: [],
    artifacts: [],
    maxOutputTokens: 128,
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
  const timeout = createModelInvocationTimeoutMaterial({
    policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    invocationStartedAt: at,
  });
  const invocation: ModelProviderInvocation = {
    sessionId: id(8),
    taskId: modelLock.taskId,
    runId: id(9),
    stepId: id(10),
    actionId: id(11),
    round: 1,
    runtimeSelection: selection,
    modelLock,
    modelRequest: request,
    deadlineAt: timeout.invocationDeadlineAt,
    timeout,
    externalTarget: modelLock.adapterDescriptorSnapshot.implementationRef,
    dataCategories: [],
    dataScopeDigest: digest("3"),
    admission: {
      type: "user_confirmed",
      confirmationId: id(12),
      scopeDigest: digest("4"),
      confirmationDigest: digest("5"),
    },
    assistantMessageId: id(13),
  };
  const registry = new ReleasePinnedReasoningMappingRegistry(
    installRelease ? [release] : [],
  );
  let profileLoads = 0;
  let mappingLoads = 0;
  const mapper = new TaskLockedReasoningProviderMapper({
    profiles: {
      loadExact: async (requestedSubject) => {
        profileLoads += 1;
        return registry.loadExactProfile(requestedSubject, release.mapping.profileRef);
      },
    },
    mappings: {
      loadExact: async (query) => {
        mappingLoads += 1;
        return registry.loadExact(query);
      },
    },
  });
  const raw = new ScriptedRawProvider(
    modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
    modelLock.adapterDescriptorSnapshot.revision,
  );
  const invocations = new InMemoryLocalPersonalModelInvocationPersistence();
  const status = createPersonalModelStatusFact({
    ownerScopeNamespaceRevision: owner.ownerScopeNamespaceRevision,
    ownerScopeDigest: owner.ownerScopeDigest,
    personalModelId: definition.personalModelId,
    configurationRevision: definition.configurationRevision,
    executionDefinitionDigest: definition.executionDefinitionDigest,
    statusRevision: 1,
    status: "unverified",
    statusOrigin: "initialized",
    updatedAt: at,
  });
  const personal = { async loadStatus() { return status; } } as unknown as PersonalModelPersistence;
  return {
    definition,
    modelLock,
    release,
    request,
    invocation,
    raw,
    invocations,
    loads: () => ({ profile: profileLoads, mapping: mappingLoads }),
    provider: new DurableLocalPersonalModelProvider({
      raw,
      invocations,
      personal,
      ownerIdentity: owner,
      definition,
      clock: new FakeClock(at),
      timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      reasoningMapper: mapper,
    }),
  };
}

class ScriptedRawProvider implements LocalPersonalModelStreamTransport {
  public attemptCount = 0;
  public readonly projections: LocalPersonalReasoningProjection[] = [];

  public constructor(
    public readonly adapterDescriptorId: string,
    public readonly adapterDescriptorRevision: string,
  ) {}

  public async *streamWithTelemetry(
    _request: Parameters<LocalPersonalModelStreamTransport["streamWithTelemetry"]>[0],
    _signal: AbortSignal,
    _invocation: ModelProviderInvocation,
    telemetry: LocalPersonalProviderAttemptTelemetry,
    projection?: LocalPersonalReasoningProjection,
  ): AsyncIterable<ModelStreamEvent> {
    this.attemptCount += 1;
    if (projection === undefined) throw new Error("projection required");
    this.projections.push(structuredClone(projection));
    yield { type: "started" };
    yield { type: "text_delta", delta: "ok" };
    telemetry.onTerminal("success");
    yield { type: "completed", finishReason: "stop" };
  }
}

async function consume(value: ReturnType<typeof createFixture>): Promise<void> {
  for await (const _event of value.provider.stream(
    value.request,
    new AbortController().signal,
    value.invocation,
  )) { /* consume */ }
}
