import { describe, expect, it } from "vitest";

import {
  DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_ENABLED,
  ExactSubjectBoundProviderReleaseMaterializer,
  FailClosedModelProvider,
  LocalPersonalAdmittedReasoningProfileSource,
  OPENAI_GPT_5_2_CONFORMANCE_MANIFEST,
  OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY,
  PersonalModelProviderProfileRegistry,
  PersonalModelTaskLockMaterializer,
  calculateCredentialBindingDigest,
  createDesktopPrivateRuntime,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
  deriveExactSubjectProviderReleaseMaterial,
  deriveLocalDesktopSubjectAuthority,
  deriveLocalPersonalReasoningProfileSubject,
  isDfi543aRuntimeReady,
} from "../src/index.js";

const createdAt = "2026-08-28T00:00:00.000Z";

describe("DFI-5.4.3A Local Personal production graph", () => {
  it("keeps structural activation code-owned while runtime readiness remains separate", () => {
    expect(DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_ENABLED).toBe(true);
    expect(isDfi543aRuntimeReady({
      structuralGraphReady: true,
      personalModelPersistenceReady: true,
      credentialRuntimeReady: false,
    })).toBe(false);
    expect(isDfi543aRuntimeReady({
      structuralGraphReady: true,
      personalModelPersistenceReady: true,
      credentialRuntimeReady: true,
    })).toBe(true);
  });

  it("reports the normal Desktop graph unavailable instead of falling back to scripted runtime", () => {
    const runtime = createDesktopPrivateRuntime({
      databasePath: ":memory:",
      authorizationToken: "dfi543a-test-token-with-sufficient-length",
    });
    expect(runtime.facade.compatibilityV1Alpha5({
      contractVersion: "v1alpha5",
      queryId: "019f7447-a784-77b2-a716-000000000801",
      correlationId: "019f7447-a784-77b2-a716-000000000802",
      clientInstanceId: "019f7447-a784-77b2-a716-000000000803",
      supportedContractVersions: ["v1alpha5"],
    })).toMatchObject({ ok: true, value: { features: [{
      feature: "max_reasoning_mode_core",
      state: "unavailable",
      reasonCode: "runtime_dependencies_unavailable",
    }] } });
  });

  it("derives the planner Profile and admitted release from one exact subject formula", () => {
    const fixture = exactSubjectFixture();
    const materialized = new ExactSubjectBoundProviderReleaseMaterializer().materialize(fixture);
    expect(materialized.state).toBe("production_admitted_materialized");
    const derived = deriveExactSubjectProviderReleaseMaterial({
      subject: fixture.subject,
      policy: OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY,
    });
    if (materialized.state !== "production_admitted_materialized") return;
    expect(derived.release).toEqual(materialized.release);
    expect(derived.materializationId).toBe(materialized.envelope.materializationId);
  });

  it("loads only the exact active Personal Model subject for Max planning", async () => {
    const fixture = exactSubjectFixture();
    const source = new LocalPersonalAdmittedReasoningProfileSource({
      personal: {
        async loadActiveOwnerNamespace() {
          return { ...fixture.namespace,
            namespaceKey: Uint8Array.from(fixture.namespace.namespaceKey) };
        },
        async loadHead() { return fixture.head; },
        async loadDefinition() { return fixture.definition; },
      } as never,
    });
    const expected = deriveExactSubjectProviderReleaseMaterial({
      subject: fixture.subject,
      policy: OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY,
    }).release.profile;
    await expect(source.loadExact(fixture.subject)).resolves.toEqual(expected);
    await expect(source.loadExact({
      ...fixture.subject,
      personalExecutionDefinitionDigest: `sha256:${"0".repeat(64)}`,
    })).resolves.toBeUndefined();
  });

  it("uses a fail-closed default provider when no exact Task lock resolves", async () => {
    const stream = new FailClosedModelProvider().stream(
      {} as never,
      new AbortController().signal,
    );
    await expect(stream[Symbol.asyncIterator]().next())
      .rejects.toThrow("task_locked_resolution_required");
  });
});

function exactSubjectFixture() {
  const namespace = createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: new Uint8Array(32).fill(7),
    createdAt,
  });
  const authority = deriveLocalDesktopSubjectAuthority(namespace);
  const providerProfile = new PersonalModelProviderProfileRegistry().resolve("custom");
  const operationId = "019f7447-a784-77b2-a716-000000000811";
  const credentialRef = `pmcr1.${"C".repeat(43)}`;
  const credentialBindingDigest = calculateCredentialBindingDigest({
    credentialRef,
    createdByOperationId: operationId,
    credentialRevision: 1,
  });
  const definition = createPersonalModelDefinition({
    ownerIdentity: {
      ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
      ownerScopeDigest: authority.ownerScopeDigest,
    },
    personalModelId: "model.personal.dfi543a-openai",
    providerKind: "custom",
    providerProfileRevision: providerProfile.profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://api.openai.com/v1",
    providerModelId: "gpt-5.2-2025-12-11",
    displayName: "DFI-5.4.3A exact OpenAI snapshot",
    capabilities: ["text", "streaming", "tool_calling"],
    credentialRef,
    credentialRevision: 1,
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
    taskId: "019f7447-a784-77b2-a716-000000000812",
    lockId: "019f7447-a784-77b2-a716-000000000813",
    lockedAt: createdAt,
    registryRevision: `sha256:${"8".repeat(64)}`,
    namespace,
    definition,
  });
  const subject = deriveLocalPersonalReasoningProfileSubject({
    definition,
    modelLock,
    adapterDescriptorId: modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
    adapterDescriptorRevision: modelLock.adapterDescriptorSnapshot.revision,
  });
  return {
    namespace,
    authority,
    definition,
    head,
    status,
    modelLock,
    subject,
    profile: providerProfile,
    credentialObservation: {
      state: "present" as const,
      credentialRef,
      createdByOperationId: operationId,
      credentialRevision: 1,
      credentialBindingDigest,
    },
    policy: OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY,
    conformanceManifest: OPENAI_GPT_5_2_CONFORMANCE_MANIFEST,
  };
}
