import {
  CONTRACT_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  EnterpriseModelRequestConverter,
  DurableEnterpriseModelProvider,
  FakeClock,
  FakeIdGenerator,
  InMemoryModelInvocationLinkPersistence,
  ReleasePinnedReasoningMappingRegistry,
  TaskLockedReasoningProviderMapper,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  createModelRequestV1Alpha2,
  createReasoningModeLock,
  createTaskRuntimeSelectionV1Alpha2,
  deriveEnterpriseReasoningProfileSubject,
  projectEnterpriseReasoningSidecar,
  sha256CanonicalJson,
  type ModelProviderInvocation,
  type EnterpriseModelGatewayClient,
  type EnterpriseModelGatewayOperation,
} from "../src/index.js";
import { createProviderReasoningMappingRelease } from
  "../src/application/provider-reasoning-mapping-domain.js";
import { commitmentFixture } from "./support/dfi531-private-mapping-fixture.js";

const id = (suffix: string) => `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const at = "2026-08-27T08:00:00.000Z";

describe("DFI-5.3.3 Core enterprise reasoning mapping", () => {
  it("recomputes the same v1alpha3 request digests as the Java Contract fixtures", () => {
    for (const [name, expected] of [
      ["model-invocation-accept-default.json",
        "11f42aa2e3e4243c51d80b16537752a74cbafc82c1d0d4db5fef4787c7cbaa6f"],
      ["model-invocation-accept-max-cache.json",
        "1e6539c375d63b650848d64912883f8f6b16f5d81004a23fa7d1e4814931ab8b"],
    ] as const) {
      const document = JSON.parse(readFileSync(new URL(
        `../../../contracts/enterprise-gateway/v1alpha3/fixtures/valid/${name}`,
        import.meta.url,
      ), "utf8")) as Record<string, unknown>;
      const material = {
        modelRequest: document.modelRequest,
        admission: document.admission,
        timeoutPolicy: document.timeoutPolicy,
        ...(document.cacheContextDigest === undefined
          ? {} : { cacheContextDigest: document.cacheContextDigest }),
      };
      expect(sha256CanonicalJson(JsonValueSchema.parse(material)))
        .toBe(`sha256:${expected}`);
      expect(document.requestDigest).toBe(expected);
    }
  });

  it("builds a content-free max sidecar from one exact immutable release", async () => {
    const fixture = invocationFixture("max");
    const registry = new ReleasePinnedReasoningMappingRegistry([fixture.release]);
    const mapper = new TaskLockedReasoningProviderMapper({
      profiles: {
        loadExact: async (subject) => registry.loadExactProfile(
          subject,
          fixture.release.mapping.profileRef,
        ),
      },
      mappings: { loadExact: async (query) => registry.loadExact(query) },
    });
    const subject = deriveEnterpriseReasoningProfileSubject({
      modelLock: fixture.invocation.modelLock,
      adapterDescriptorId:
        fixture.invocation.modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision:
        fixture.invocation.modelLock.adapterDescriptorSnapshot.revision,
    });
    const mapping = await mapper.map({
      invocation: fixture.invocation,
      providerFamily: "enterprise_openai",
      exactSubject: subject,
      timeoutPolicyIdentity: fixture.release.mapping.timeoutPolicyIdentity,
    });
    const sidecar = projectEnterpriseReasoningSidecar({
      request: fixture.invocation.modelRequest,
      invocation: fixture.invocation,
      mapping,
    });
    expect(sidecar).toMatchObject({
      mode: "locked_max_strategy",
      mappingRevision: fixture.release.mapping.mappingRevision,
      mappingDigest: fixture.release.mapping.mappingDigest,
    });
    const wire = new EnterpriseModelRequestConverter().convert({
      invocation: fixture.invocation,
      clientRequestId: id("30"),
      transportRequestId: id("31"),
      providerStreamIdleTimeoutMillis: 30_000,
      reasoning: sidecar,
    }).document.modelRequest as Record<string, unknown>;
    expect(wire.reasoning).toEqual({
      mode: "locked_max_strategy",
      reasoningModeLockId: sidecar.reasoningModeLockId,
      reasoningModeLockDigest: sidecar.reasoningModeLockDigest.slice("sha256:".length),
      profileId: sidecar.profileId,
      profileRevision: sidecar.profileRevision.slice("sha256:".length),
      profileDigest: sidecar.profileDigest.slice("sha256:".length),
      strategyId: sidecar.strategyId,
      strategyRevision: sidecar.strategyRevision.slice("sha256:".length),
      strategyDigest: sidecar.strategyDigest.slice("sha256:".length),
      mappingRevision: sidecar.mappingRevision.slice("sha256:".length),
      mappingDigest: sidecar.mappingDigest.slice("sha256:".length),
      timeoutPolicyRef: sidecar.timeoutPolicyRef,
    });
    expect(JSON.stringify(sidecar)).not.toMatch(
      /reasoning_effort|budgetTokens|budget_tokens|endpoint|credential/u,
    );
  });

  it("emits Gateway v1alpha3 and includes cache digest in only the v3 request digest", () => {
    const fixture = invocationFixture("default");
    const lock = fixture.invocation.runtimeSelection.reasoningModeLock;
    const reasoning = projectEnterpriseReasoningSidecar({
      request: fixture.invocation.modelRequest,
      invocation: fixture.invocation,
      mapping: { disposition: "omit" },
    });
    const converter = new EnterpriseModelRequestConverter();
    const common = {
      invocation: fixture.invocation,
      clientRequestId: id("30"),
      transportRequestId: id("31"),
      providerStreamIdleTimeoutMillis: 30_000,
      reasoning,
    } as const;
    const withoutCache = converter.convert(common);
    const cacheContext = {
      invocationKind: "assistant_message" as const,
      invocationLinkId: id("30"),
      cacheExecutionAuthority: "central_enterprise" as const,
      sessionScopeDigest: digest("1"),
      scopeNamespaceRevision: id("32"),
      cacheContextDigest: sha256CanonicalJson(JsonValueSchema.parse({
        sessionScopeDigest: digest("1").slice("sha256:".length),
      })),
      gatewayContractVersion: "v1alpha2" as const,
      createdAt: at,
      recordDigest: digest("2"),
    };
    const withCache = converter.convert({ ...common, cacheContext });
    expect(withoutCache.gatewayContractVersion).toBe("v1alpha3");
    expect(withoutCache.document).toMatchObject({
      contractVersion: "v1alpha3",
      modelRequest: {
        reasoning: {
          mode: "default_passthrough",
          reasoningModeLockId: lock.reasoningModeLockId,
          reasoningModeLockDigest:
            lock.reasoningModeLockDigest.slice("sha256:".length),
        },
      },
    });
    expect(withCache.requestDigest).not.toBe(withoutCache.requestDigest);
    expect(withCache.document).toHaveProperty("cacheContextDigest");
  });

  it("maps before durable prepare and dispatches v1alpha3 only when the exact graph is installed", async () => {
    const fixture = invocationFixture("default");
    const links = new InMemoryModelInvocationLinkPersistence();
    await links.start();
    const gateway = new CapturingGateway();
    const mapper = new TaskLockedReasoningProviderMapper({
      profiles: { loadExact: async () => { throw new Error("default must not load Profile"); } },
      mappings: { loadExact: async () => { throw new Error("default must not load mapping"); } },
    });
    const provider = new DurableEnterpriseModelProvider({
      adapterDescriptorId:
        fixture.invocation.modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision:
        fixture.invocation.modelLock.adapterDescriptorSnapshot.revision,
      gateway,
      links,
      identityScope: {
        enterpriseId: "enterprise.one",
        userId: "user.one",
        deviceId: "device.one",
        clientInstanceId: "client.one",
      },
      clock: new FakeClock(at),
      ids: new FakeIdGenerator([id("40")]),
      reasoning: {
        mapper,
        providerFamily: "enterprise_openai",
        timeoutPolicyIdentity: fixture.release.mapping.timeoutPolicyIdentity,
      },
    });
    const events = [];
    for await (const event of provider.stream(
      fixture.invocation.modelRequest,
      new AbortController().signal,
      fixture.invocation,
    )) events.push(event);
    expect(events).toEqual([
      { type: "started" },
      {
        type: "failed",
        error: expect.objectContaining({ code: "model_gateway.fixture_failed" }),
      },
    ]);
    expect(gateway.version).toBe("v1alpha3");
    expect(gateway.document).toMatchObject({
      modelRequest: { reasoning: { mode: "default_passthrough" } },
    });
    expect(JSON.stringify(gateway.document)).not.toMatch(
      /reasoning_effort|thinking|budget_tokens/u,
    );
    expect(await links.listIncomplete(10)).toHaveLength(1);
  });
});

class CapturingGateway implements EnterpriseModelGatewayClient {
  version: "v1alpha1" | "v1alpha2" | "v1alpha3" | undefined;
  document: unknown;
  begin(
    _scope: Parameters<EnterpriseModelGatewayClient["begin"]>[0],
    version: "v1alpha1" | "v1alpha2" | "v1alpha3" = "v1alpha1",
  ): EnterpriseModelGatewayOperation {
    this.version = version;
    return {
      scope: _scope,
      accept: async (document) => {
        this.document = document;
        return {
          invocationId: id("41"),
          clientRequestId: String(document.clientRequestId),
          requestDigest: String(document.requestDigest),
          statusRevision: 0,
          lastDurableEventSequence: 0,
          durableCursor: "cursor:0:root",
          createdAt: at,
        };
      },
      status: async () => ({
        invocationId: id("41"),
        clientRequestId: String((this.document as Record<string, unknown>).clientRequestId),
        requestDigest: String((this.document as Record<string, unknown>).requestDigest),
        status: "failed",
        statusRevision: 1,
        lastDurableEventSequence: 0,
        durableCursor: "cursor:0:root",
        safeErrorCode: "model_gateway.fixture_failed",
        safeSummary: "Fixture failure",
      }),
      cancel: async () => { throw new Error("not used"); },
      events: async function* () { yield* []; },
    };
  }
}

function invocationFixture(mode: "default" | "max") {
  const seed = commitmentFixture();
  const source = {
    trust: "official" as const,
    packageId: "robothree.official.dfi5.3.3",
    packageRevision: digest("a"),
  };
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: seed.exactSubject.modelCapabilityId,
    kind: "model",
    name: "DFI-5.3.3 fixture",
    description: "Enterprise exact mapping fixture",
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
    implementationRef: "core:dfi533-fixture",
    runtimeBoundary: "in_process",
    protocol: { name: "fixture-model", version: "v1alpha1" },
  });
  const release = createProviderReasoningMappingRelease({
    mappingId: "reasoning.mapping.fixture-enterprise",
    commitment: {
      ...seed,
      exactSubject: {
        ...seed.exactSubject,
        modelCapabilityRevision: definition.revision,
        adapterDescriptorRevision: descriptor.revision,
      },
    },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.dfi533-fixture",
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
    agent: {
      agentDefinitionId: "agent.general",
      revision: digest("d"),
      digest: digest("d"),
    },
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
    enterpriseConfigRevision: digest("6"),
    registryRevision: modelLock.registryRevision,
    createdAt: at,
    reasoningModeLock,
  });
  const request = createModelRequestV1Alpha2({
    schemaVersion: "v1alpha2",
    requestId: id("10"),
    snapshotId: id("11"),
    contextSourceDigest: digest("f"),
    model: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    messages: [{
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user",
      content: [{ type: "text", text: "Use the locked mode." }],
    }],
    tools: [],
    artifacts: [],
    maxOutputTokens: 8_192,
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
