import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ExactSubjectBoundProviderReleaseMaterializer,
  OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE,
  PersonalModelProviderProfileRegistry,
  PersonalModelTaskLockMaterializer,
  calculateCredentialBindingDigest,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
  deriveLocalDesktopSubjectAuthority,
  type PendingConformanceProviderReleaseMaterialization,
  type ProductionAdmittedProviderReleaseMaterialization,
} from "../src/index.js";

const createdAt = "2026-08-28T00:00:00.000Z";
const taskId = "019f7447-a784-77b2-a716-000000000101";
const operationId = "019f7447-a784-77b2-a716-000000000102";

function fixture() {
  const namespace = createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: new Uint8Array(32).fill(7),
    createdAt,
  });
  const authority = deriveLocalDesktopSubjectAuthority(namespace);
  const profile = new PersonalModelProviderProfileRegistry().resolve("custom");
  const credentialRef = `pmcr1.${"A".repeat(43)}`;
  const credentialRevision = 1;
  const credentialBindingDigest = calculateCredentialBindingDigest({
    credentialRef,
    createdByOperationId: operationId,
    credentialRevision,
  });
  const definition = createPersonalModelDefinition({
    ownerIdentity: {
      ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
      ownerScopeDigest: authority.ownerScopeDigest,
    },
    personalModelId: "model.personal.openai-gpt-5-2-snapshot",
    providerKind: "custom",
    providerProfileRevision: profile.profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://api.openai.com/v1",
    providerModelId: "gpt-5.2-2025-12-11",
    displayName: "OpenAI GPT-5.2 exact snapshot",
    capabilities: ["text", "streaming", "tool_calling"],
    credentialRef,
    credentialRevision,
    credentialBindingDigest,
    createdAt,
  });
  const head = createPersonalModelHead({
    ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
    ownerScopeDigest: authority.ownerScopeDigest,
    personalModelId: definition.personalModelId,
    currentConfigurationRevision: definition.configurationRevision,
    currentExecutionDefinitionDigest: definition.executionDefinitionDigest,
    headRevision: 1,
    selectionState: "active",
    updatedAt: createdAt,
  });
  const status = createPersonalModelStatusFact({
    ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
    ownerScopeDigest: authority.ownerScopeDigest,
    personalModelId: definition.personalModelId,
    configurationRevision: definition.configurationRevision,
    executionDefinitionDigest: definition.executionDefinitionDigest,
    statusRevision: 1,
    status: "available",
    statusOrigin: "initialized",
    updatedAt: createdAt,
  });
  const modelLock = new PersonalModelTaskLockMaterializer().prepare({
    taskId,
    lockId: "019f7447-a784-77b2-a716-000000000103",
    lockedAt: createdAt,
    registryRevision: `sha256:${"8".repeat(64)}`,
    namespace,
    definition,
  });
  return {
    namespace,
    authority,
    definition,
    head,
    status,
    profile,
    modelLock,
    credentialObservation: {
      state: "present" as const,
      credentialRef,
      createdByOperationId: operationId,
      credentialRevision,
      credentialBindingDigest,
    },
    policy: OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE,
  };
}

describe("PRA-2 exact subject-bound release materializer", () => {
  it("keeps pending and production-admitted outcomes structurally non-interchangeable", () => {
    expectTypeOf<PendingConformanceProviderReleaseMaterialization>()
      .not.toMatchTypeOf<ProductionAdmittedProviderReleaseMaterialization>();
    expectTypeOf<ProductionAdmittedProviderReleaseMaterialization>()
      .not.toMatchTypeOf<PendingConformanceProviderReleaseMaterialization>();
  });

  it("deterministically materializes only a pending-conformance candidate", () => {
    const materializer = new ExactSubjectBoundProviderReleaseMaterializer();
    const input = fixture();
    const first = materializer.materialize(input);
    const second = materializer.materialize(input);
    expect(first).toEqual(second);
    expect(first.state).toBe("pending_conformance_materialized");
    if (first.state !== "pending_conformance_materialized") return;
    expect(first.envelope.admissionState).toBe("pending_conformance_materialized");
    expect(first.release.mapping.typedPrivateDirective).toEqual({
      kind: "openai_reasoning_effort",
      effort: "xhigh",
    });
    expect(JSON.stringify(first.envelope)).not.toMatch(
      /api\.openai|gpt-5\.2|pmcr1|reasoning_effort|xhigh/iu,
    );
  });

  it("rejects model aliases without falling back to the exact snapshot", () => {
    const input = fixture();
    const definition = createPersonalModelDefinition({
      ownerIdentity: {
        ownerScopeNamespaceRevision: input.authority.ownerScopeNamespaceRevision,
        ownerScopeDigest: input.authority.ownerScopeDigest,
      },
      personalModelId: input.definition.personalModelId,
      providerKind: input.definition.providerKind,
      providerProfileRevision: input.definition.providerProfileRevision,
      protocol: input.definition.protocol,
      endpoint: input.definition.canonicalEndpoint,
      providerModelId: "gpt-5.2",
      displayName: input.definition.displayName,
      capabilities: input.definition.capabilities,
      credentialRef: input.definition.credentialRef,
      credentialRevision: input.definition.credentialRevision,
      credentialBindingDigest: input.definition.credentialBindingDigest,
      createdAt,
    });
    const head = createPersonalModelHead({
      ...withoutDigest(input.head),
      currentConfigurationRevision: definition.configurationRevision,
      currentExecutionDefinitionDigest: definition.executionDefinitionDigest,
    });
    const status = createPersonalModelStatusFact({
      ...withoutDigest(input.status),
      configurationRevision: definition.configurationRevision,
      executionDefinitionDigest: definition.executionDefinitionDigest,
    });
    const modelLock = new PersonalModelTaskLockMaterializer().prepare({
      taskId,
      lockId: "019f7447-a784-77b2-a716-000000000105",
      lockedAt: createdAt,
      registryRevision: `sha256:${"8".repeat(64)}`,
      namespace: input.namespace,
      definition,
    });
    const result = new ExactSubjectBoundProviderReleaseMaterializer().materialize({
      ...input, definition, head, status, modelLock,
    });
    expect(result).toEqual({
      state: "rejected",
      code: "provider_release.model_snapshot_mismatch",
      safeSummary: "当前模型版本未通过 Max 准入",
    });
  });

  it("rejects a non-exact endpoint before producing any release", () => {
    const input = fixture();
    const definition = createPersonalModelDefinition({
      ownerIdentity: {
        ownerScopeNamespaceRevision: input.authority.ownerScopeNamespaceRevision,
        ownerScopeDigest: input.authority.ownerScopeDigest,
      },
      personalModelId: input.definition.personalModelId,
      providerKind: input.definition.providerKind,
      providerProfileRevision: input.definition.providerProfileRevision,
      protocol: input.definition.protocol,
      endpoint: "https://example.invalid/v1",
      providerModelId: input.definition.providerModelId,
      displayName: input.definition.displayName,
      capabilities: input.definition.capabilities,
      credentialRef: input.definition.credentialRef,
      credentialRevision: input.definition.credentialRevision,
      credentialBindingDigest: input.definition.credentialBindingDigest,
      createdAt,
    });
    const head = createPersonalModelHead({
      ...withoutDigest(input.head),
      currentConfigurationRevision: definition.configurationRevision,
      currentExecutionDefinitionDigest: definition.executionDefinitionDigest,
    });
    const status = createPersonalModelStatusFact({
      ...withoutDigest(input.status),
      configurationRevision: definition.configurationRevision,
      executionDefinitionDigest: definition.executionDefinitionDigest,
    });
    const modelLock = new PersonalModelTaskLockMaterializer().prepare({
      taskId,
      lockId: "019f7447-a784-77b2-a716-000000000104",
      lockedAt: createdAt,
      registryRevision: `sha256:${"8".repeat(64)}`,
      namespace: input.namespace,
      definition,
    });
    const result = new ExactSubjectBoundProviderReleaseMaterializer().materialize({
      ...input,
      definition,
      head,
      status,
      modelLock,
    });
    expect(result).toMatchObject({
      state: "rejected",
      code: "provider_release.endpoint_mismatch",
    });
  });

  it("rejects absent credential observation with a fixed safe summary", () => {
    const input = fixture();
    const result = new ExactSubjectBoundProviderReleaseMaterializer().materialize({
      ...input,
      credentialObservation: {
        state: "absent",
        credentialRef: input.definition.credentialRef,
      },
    });
    expect(result).toEqual({
      state: "rejected",
      code: "provider_release.credential_observation_invalid",
      safeSummary: "模型凭据状态不可用",
    });
  });
});

function withoutDigest<T extends { recordDigest: string }>(value: T): Omit<T, "recordDigest"> {
  const { recordDigest: _recordDigest, ...material } = value;
  return material;
}
