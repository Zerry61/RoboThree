import { describe, expect, it } from "vitest";

import {
  CompositeModelProviderResolver,
  DurableCompositeTaskModelProviderResolver,
  DurableLocalPersonalModelProvider,
  FakeClock,
  FakeScheduler,
  InMemoryPersonalCredentialStore,
  InMemoryLocalPersonalModelInvocationPersistence,
  PersonalModelConfigurationRefCodec,
  PersonalModelProviderProfileRegistry,
  PersonalModelRuntimeRegistry,
  PersonalModelTaskLockMaterializer,
  RuntimeAdapterHandles,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  createPersonalModelDefinition,
  createPersonalModelStatusFact,
  createPersonalModelOwnerNamespace,
  derivePersonalModelOwnerIdentity,
  validateTaskCapabilityLockRevisions,
  type PersonalModelPersistence,
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
} from "../src/index.js";

const digest = (value: string) => `sha256:${value.repeat(64)}` as const;
const at = "2026-08-22T06:00:00.000Z";
const operationId = "019f7447-a784-77b2-a716-000000000001";
const lockId = "019f7447-a784-77b2-a716-000000000002";
const taskId = "019f7447-a784-77b2-a716-000000000003";

describe("DFI-4A.3.2 personal model exact Task lock", () => {
  it("materializes a standard lock with shared Task registry revision", () => {
    const fixture = personalFixture();
    const lock = new PersonalModelTaskLockMaterializer().prepare({
      taskId,
      lockId,
      lockedAt: at,
      registryRevision: digest("a"),
      namespace: fixture.namespace,
      definition: fixture.definition,
    });
    expect(validateTaskCapabilityLockRevisions(lock)).toEqual(lock);
    expect(lock.registryRevision).toBe(digest("a"));
    expect(lock.definitionSnapshot.capabilityId).toBe("model.personal.deepseek");
    expect(lock.definitionSnapshot.model.contextWindow).toBeUndefined();
    expect(lock.adapterDescriptorSnapshot).toMatchObject({
      adapterDescriptorId: "adapter.model.local-personal-openai-compatible",
      runtimeBoundary: "in_process",
      protocol: { name: "openai_compatible", version: "v1" },
    });
    expect(lock.bindingSnapshot.configurationRef).toMatch(/^pmcfg1:/u);
    const serialized = JSON.stringify(lock);
    expect(serialized).not.toContain(fixture.definition.canonicalEndpoint);
    expect(serialized).not.toContain(fixture.definition.credentialRef);
    expect(serialized).not.toContain(fixture.owner.ownerScopeDigest);
  });

  it("round-trips pmcfg1 and rejects capability, tuple and key tampering", () => {
    const fixture = personalFixture();
    const codec = new PersonalModelConfigurationRefCodec();
    const reference = codec.encode({
      namespace: fixture.namespace,
      personalModelId: fixture.definition.personalModelId,
      ownerIdentity: fixture.owner,
      configurationRevision: fixture.definition.configurationRevision,
      executionDefinitionDigest: fixture.definition.executionDefinitionDigest,
    });
    expect(reference.length).toBeLessThan(512);
    expect(codec.decode({
      reference,
      namespace: fixture.namespace,
      personalModelId: fixture.definition.personalModelId,
    })).toEqual({
      ownerIdentity: fixture.owner,
      configurationRevision: fixture.definition.configurationRevision,
      executionDefinitionDigest: fixture.definition.executionDefinitionDigest,
    });
    expect(() => codec.decode({
      reference,
      namespace: fixture.namespace,
      personalModelId: "model.personal.other",
    })).toThrow("personal_model.configuration_ref_invalid");
    expect(() => codec.decode({
      reference: `${reference.slice(0, 8)}${reference[8] === "A" ? "B" : "A"}${reference.slice(9)}`,
      namespace: fixture.namespace,
      personalModelId: fixture.definition.personalModelId,
    })).toThrow("personal_model.configuration_ref_invalid");
    const wrongNamespace = createPersonalModelOwnerNamespace({
      namespaceRevision: 1,
      namespaceKey: Buffer.alloc(32, 8),
      createdAt: at,
    });
    expect(() => codec.decode({
      reference,
      namespace: wrongNamespace,
      personalModelId: fixture.definition.personalModelId,
    })).toThrow("personal_model.configuration_ref_invalid");
  });

  it("keeps old lock material stable after a display-only new configuration", () => {
    const fixture = personalFixture();
    const materializer = new PersonalModelTaskLockMaterializer();
    const before = materializer.prepare({
      taskId,
      lockId,
      lockedAt: at,
      registryRevision: digest("a"),
      namespace: fixture.namespace,
      definition: fixture.definition,
    });
    const renamed = createPersonalModelDefinition({
      ...fixture.input,
      displayName: "Renamed Personal Model",
    });
    expect(renamed.configurationRevision).not.toBe(fixture.definition.configurationRevision);
    expect(materializer.verify({ lock: before, namespace: fixture.namespace }))
      .toMatchObject({ configurationRevision: fixture.definition.configurationRevision });
  });

  it("rejects a historical personal ID that is not a model Capability ID", () => {
    const fixture = personalFixture("personal.deepseek");
    expect(() => new PersonalModelTaskLockMaterializer().prepare({
      taskId,
      lockId,
      lockedAt: at,
      registryRevision: digest("a"),
      namespace: fixture.namespace,
      definition: fixture.definition,
    })).toThrow("model.personal_id_not_capability_id");
  });

  it("resolves a personal lock to a provider bound to the exact standard revisions", async () => {
    const fixture = personalFixture();
    const lock = new PersonalModelTaskLockMaterializer().prepare({
      taskId,
      lockId,
      lockedAt: at,
      registryRevision: digest("a"),
      namespace: fixture.namespace,
      definition: fixture.definition,
    });
    const status = createPersonalModelStatusFact({
      ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
      ownerScopeDigest: fixture.owner.ownerScopeDigest,
      personalModelId: fixture.definition.personalModelId,
      configurationRevision: fixture.definition.configurationRevision,
      executionDefinitionDigest: fixture.definition.executionDefinitionDigest,
      statusRevision: 1,
      status: "available",
      statusOrigin: "provider_observation",
      updatedAt: at,
    });
    const persistence = {
      async loadActiveOwnerNamespace() { return fixture.namespace; },
      async loadDefinition() { return fixture.definition; },
      async loadStatus() { return status; },
    } as unknown as PersonalModelPersistence;
    const credentials = new InMemoryPersonalCredentialStore();
    await credentials.start();
    const secret = new TextEncoder().encode("test-only-personal-provider-key");
    try {
      expect(await credentials.store(operationId, fixture.definition.credentialRef, secret))
        .toMatchObject({ ok: true });
      const resolver = new CompositeModelProviderResolver({
        enterprise: new RuntimeAdapterHandles([]),
        personal: persistence,
        runtime: new PersonalModelRuntimeRegistry(persistence),
        credentials,
        clock: new FakeClock(at),
        scheduler: new FakeScheduler(),
        timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      });
      const provider = await resolver.resolve({
        lock,
        ownerAuthority: {
          ownerIdentity: fixture.owner,
          authoritySource: "runtime_active_enterprise_identity",
          entitlement: "personal_model.configure",
          entitlementRevision: digest("b"),
          offlineState: "enterprise_temporarily_unavailable",
        },
      });
      expect(provider).toMatchObject({
        adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
        adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
      });
      await expect(resolver.resolve({
        lock: {
          ...lock,
          adapterDescriptorSnapshot: {
            ...lock.adapterDescriptorSnapshot,
            implementationRef: "core:tampered",
          },
        },
        ownerAuthority: {
          ownerIdentity: fixture.owner,
          authoritySource: "runtime_active_enterprise_identity",
          entitlement: "personal_model.configure",
          entitlementRevision: digest("b"),
          offlineState: "online",
        },
      })).rejects.toThrow();
    } finally {
      secret.fill(0);
      await credentials.stop();
    }
  });

  it("wraps the exact personal provider in the shared Task-locked durable resolver", async () => {
    const fixture = personalFixture();
    const lock = new PersonalModelTaskLockMaterializer().prepare({
      taskId,
      lockId,
      lockedAt: at,
      registryRevision: digest("a"),
      namespace: fixture.namespace,
      definition: fixture.definition,
    });
    const status = createPersonalModelStatusFact({
      ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
      ownerScopeDigest: fixture.owner.ownerScopeDigest,
      personalModelId: fixture.definition.personalModelId,
      configurationRevision: fixture.definition.configurationRevision,
      executionDefinitionDigest: fixture.definition.executionDefinitionDigest,
      statusRevision: 1,
      status: "available",
      statusOrigin: "provider_observation",
      updatedAt: at,
    });
    const persistence = {
      async loadActiveOwnerNamespace() { return fixture.namespace; },
      async loadDefinition() { return fixture.definition; },
      async loadStatus() { return status; },
    } as unknown as PersonalModelPersistence;
    const credentials = new InMemoryPersonalCredentialStore();
    await credentials.start();
    const secret = new TextEncoder().encode("test-only-personal-provider-key");
    try {
      await credentials.store(operationId, fixture.definition.credentialRef, secret);
      const authority = {
        ownerIdentity: fixture.owner,
        authoritySource: "runtime_active_enterprise_identity" as const,
        entitlement: "personal_model.configure" as const,
        entitlementRevision: digest("b"),
        offlineState: "enterprise_temporarily_unavailable" as const,
      };
      const composite = new CompositeModelProviderResolver({
        enterprise: new RuntimeAdapterHandles([]),
        personal: persistence,
        runtime: new PersonalModelRuntimeRegistry(persistence),
        credentials,
        clock: new FakeClock(at),
        scheduler: new FakeScheduler(),
        timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      });
      const resolved = await new DurableCompositeTaskModelProviderResolver({
        enterprise: new RuntimeAdapterHandles([]),
        composite,
        authorities: { async load() { return authority; } },
        invocations: new InMemoryLocalPersonalModelInvocationPersistence(),
        personal: persistence,
        clock: new FakeClock(at),
        timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      }).resolve({
        taskId,
        runtimeSelection: { runtimeSelectionId: operationId } as never,
        modelLock: lock,
        purpose: "assistant_message",
      });
      expect(resolved).toMatchObject({
        authority: "local_personal",
        externalTarget: lock.adapterDescriptorSnapshot.implementationRef,
      });
      expect(resolved.provider).toBeInstanceOf(DurableLocalPersonalModelProvider);
      expect(resolved.exactLockDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    } finally {
      secret.fill(0);
      await credentials.stop();
    }
  });
});

function personalFixture(personalModelId = "model.personal.deepseek") {
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
  const input = {
    ownerIdentity: owner,
    personalModelId,
    providerKind: "deepseek" as const,
    providerProfileRevision: new PersonalModelProviderProfileRegistry()
      .resolve("deepseek").profileRevision,
    protocol: "openai_compatible" as const,
    endpoint: "https://api.example.com/v1",
    providerModelId: "deepseek-chat",
    displayName: "Personal DeepSeek",
    capabilities: ["text", "streaming", "tool_calling"] as const,
    credentialRef,
    credentialRevision: 1,
    credentialBindingDigest: calculateCredentialBindingDigest({
      credentialRef,
      createdByOperationId: operationId,
      credentialRevision: 1,
    }),
    createdAt: at,
  };
  return { namespace, owner, input, definition: createPersonalModelDefinition(input) };
}
