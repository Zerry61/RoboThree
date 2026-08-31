import { describe, expect, it } from "vitest";

import {
  ExactSubjectBoundProviderReleaseMaterializer,
  OPENAI_GPT_5_2_CONFORMANCE_MANIFEST,
  OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY,
  PersonalModelProviderProfileRegistry,
  PersonalModelTaskLockMaterializer,
  calculateCredentialBindingDigest,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
  deriveLocalDesktopSubjectAuthority,
} from "../src/index.js";

const createdAt = "2026-08-28T00:00:00.000Z";
const taskId = "019f7447-a784-77b2-a716-000000000501";
const operationId = "019f7447-a784-77b2-a716-000000000502";

describe("PRA-3 production-admitted exact subject materializer", () => {
  it("materializes the admitted branch only with exact V2 policy and manifest", () => {
    const input = fixture();
    const materializer = new ExactSubjectBoundProviderReleaseMaterializer();
    const first = materializer.materialize(input);
    const second = materializer.materialize(input);
    expect(first).toEqual(second);
    expect(first.state).toBe("production_admitted_materialized");
    if (first.state !== "production_admitted_materialized") return;
    expect(first.envelope.admissionState).toBe("production_admitted_materialized");
    expect(first.envelope.conformanceManifestRef.manifestDigest)
      .toBe(OPENAI_GPT_5_2_CONFORMANCE_MANIFEST.manifestDigest);
    expect(first.release.mapping.typedPrivateDirective).toEqual({
      kind: "openai_reasoning_effort",
      effort: "xhigh",
    });
  });

  it("rejects a manifest drift without leaking a partial release", () => {
    const input = fixture();
    const result = new ExactSubjectBoundProviderReleaseMaterializer().materialize({
      ...input,
      conformanceManifest: {
        ...input.conformanceManifest,
        manifestDigest: `sha256:${"0".repeat(64)}`,
      },
    });
    expect(result).toEqual({
      state: "rejected",
      code: "provider_release.conformance_manifest_invalid",
      safeSummary: "Max 准入验证材料不完整",
    });
    expect(result).not.toHaveProperty("release");
  });
});

function fixture() {
  const namespace = createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: new Uint8Array(32).fill(9),
    createdAt,
  });
  const authority = deriveLocalDesktopSubjectAuthority(namespace);
  const profile = new PersonalModelProviderProfileRegistry().resolve("custom");
  const credentialRef = `pmcr1.${"B".repeat(43)}`;
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
    personalModelId: "model.personal.openai-gpt-5-2-admitted",
    providerKind: "custom",
    providerProfileRevision: profile.profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://api.openai.com/v1",
    providerModelId: "gpt-5.2-2025-12-11",
    displayName: "OpenAI GPT-5.2 exact admitted snapshot",
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
    lockId: "019f7447-a784-77b2-a716-000000000503",
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
    policy: OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY,
    conformanceManifest: OPENAI_GPT_5_2_CONFORMANCE_MANIFEST,
  };
}
