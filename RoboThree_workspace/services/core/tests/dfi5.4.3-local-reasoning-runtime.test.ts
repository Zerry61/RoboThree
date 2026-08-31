import { describe, expect, it } from "vitest";

import {
  LocalDesktopReasoningModeOwnerAuthorityProvider,
  LocalPersonalEffectiveReasoningModelResolver,
  PersonalModelProviderProfileRegistry,
  calculateCredentialBindingDigest,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
  deriveLocalDesktopSubjectAuthority,
  materializePersonalModelRegistryFacts,
} from "../src/index.js";

const createdAt = "2026-08-28T00:00:00.000Z";
const clientInstanceId = "019f7447-a784-77b2-a716-000000000543";

describe("DFI-5.4.3 Local Desktop reasoning runtime", () => {
  it("derives production preference authority from the exact Local Desktop owner", async () => {
    const fixture = createFixture();
    const source = new LocalDesktopReasoningModeOwnerAuthorityProvider({
      personal: fixture.persistence,
      clientInstanceId,
    });
    await expect(source.resolve()).resolves.toMatchObject({
      state: "available",
      authoritySource: "local_desktop_owner",
      currentClientInstanceId: clientInstanceId,
      testIdentityUsed: false,
      productionIdentityReady: true,
    });
  });

  it("projects the exact active Personal Model subject without a current alias", async () => {
    const fixture = createFixture();
    const resolved = await new LocalPersonalEffectiveReasoningModelResolver(
      fixture.persistence,
    ).resolve({
      contractVersion: "v1alpha3",
      queryId: "019f7447-a784-77b2-a716-000000000544",
      correlationId: "019f7447-a784-77b2-a716-000000000545",
      clientInstanceId,
      agentId: "agent.general",
      requestedModelId: fixture.definition.personalModelId,
    });
    const facts = materializePersonalModelRegistryFacts(fixture.definition);
    expect(resolved).toMatchObject({
      modelId: facts.capability.capabilityId,
      modelRevision: facts.capability.revision,
      subject: {
        authority: "local_personal",
        modelCapabilityRevision: facts.capability.revision,
        adapterDescriptorRevision: facts.descriptor.revision,
        personalExecutionDefinitionDigest: fixture.definition.executionDefinitionDigest,
      },
    });
  });

  it("fails closed when no exact requested model is available", async () => {
    const fixture = createFixture();
    const resolver = new LocalPersonalEffectiveReasoningModelResolver(fixture.persistence);
    await expect(resolver.resolve({
      contractVersion: "v1alpha3",
      queryId: "019f7447-a784-77b2-a716-000000000546",
      correlationId: "019f7447-a784-77b2-a716-000000000547",
      clientInstanceId,
      agentId: "agent.general",
      requestedModelId: "model.personal.missing",
    })).rejects.toThrow("reasoning.runtime_dependencies_unavailable");
  });
});

function createFixture() {
  const namespace = createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: new Uint8Array(32).fill(9),
    createdAt,
  });
  const authority = deriveLocalDesktopSubjectAuthority(namespace);
  const providerProfile = new PersonalModelProviderProfileRegistry().resolve("custom");
  const operationId = "019f7447-a784-77b2-a716-000000000548";
  const credentialRef = `pmcr1.${"D".repeat(43)}`;
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
    personalModelId: "model.personal.dfi543-preview",
    providerKind: "custom",
    providerProfileRevision: providerProfile.profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://127.0.0.1:45433/v1",
    providerModelId: "gpt-5.2-2025-12-11",
    displayName: "DFI-5.4.3 Preview Model",
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
  const persistence = {
    async loadActiveOwnerNamespace() {
      return { ...namespace, namespaceKey: Uint8Array.from(namespace.namespaceKey) };
    },
    async loadHead(_owner: unknown, modelId: string) {
      return modelId === definition.personalModelId ? head : undefined;
    },
    async loadDefinition() { return definition; },
    async loadStatus() { return status; },
  } as never;
  return { definition, persistence };
}
