import { describe, expect, it } from "vitest";

import {
  GetPersonalModelQueryV1Alpha1Schema,
  ListPersonalModelsQueryV1Alpha1Schema,
  PersonalModelManagementCompatibilityProjectionV1Alpha1Schema,
  PersonalModelManagementCompatibilityQueryV1Alpha1Schema,
  PersonalModelSafeProjectionV1Alpha1Schema,
} from "../src/desktop-local/personal-model-management/v1alpha1/index.js";

const id = "00000000-0000-4000-8000-000000000001";
const digest = `sha256:${"a".repeat(64)}`;

describe("DFI-4A.4.1 Personal Model management Contract", () => {
  it("strictly parses compatibility, list, and detail queries", () => {
    expect(PersonalModelManagementCompatibilityQueryV1Alpha1Schema.parse({
      contractVersion: "personal-model-management.v1alpha1",
      type: "personal_model_management_compatibility",
      queryId: id,
      correlationId: id,
      clientInstanceId: id,
      supportedContractVersions: ["personal-model-management.v1alpha1"],
    }).type).toBe("personal_model_management_compatibility");
    expect(ListPersonalModelsQueryV1Alpha1Schema.parse({
      contractVersion: "personal-model-management.v1alpha1",
      type: "list_personal_models",
      queryId: id,
      correlationId: id,
      clientInstanceId: id,
      limit: 100,
    }).limit).toBe(100);
    expect(GetPersonalModelQueryV1Alpha1Schema.parse({
      contractVersion: "personal-model-management.v1alpha1",
      type: "get_personal_model",
      queryId: id,
      correlationId: id,
      clientInstanceId: id,
      personalModelId: "model.personal-example",
    }).personalModelId).toBe("model.personal-example");
  });

  it("keeps catalog readiness independent from sensitive capabilities", () => {
    expect(PersonalModelManagementCompatibilityProjectionV1Alpha1Schema.parse({
      contractVersion: "personal-model-management.v1alpha1",
      runtimeInstanceId: "runtime.instance-1",
      catalogAvailable: true,
      mutationAvailable: false,
      revealAvailable: false,
      authorityKind: "standalone_local_owner",
      helperState: "unavailable",
      transportState: "unavailable",
      productionIdentityReady: true,
      testIdentityUsed: false,
      reasonCode: "personal_model.credential_store_unavailable",
    }).catalogAvailable).toBe(true);
  });

  it("rejects private Personal Model material from the safe projection", () => {
    const safe = {
      contractVersion: "personal-model-management.v1alpha1",
      personalModelId: "model.personal-example",
      configurationRevision: digest,
      displayName: "Personal Example",
      provider: "custom",
      protocol: "openai_compatible",
      providerModelId: "example-model",
      endpointDisplayHost: "example.invalid",
      capabilities: ["text", "streaming"],
      status: "unverified",
      available: true,
      credentialState: "present_masked",
      preferenceSelected: false,
      permissions: {
        canConfigure: false,
        canUse: true,
        canReveal: false,
        canDelete: false,
        safeReason: "personal_model.transport_unavailable",
      },
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    } as const;
    expect(PersonalModelSafeProjectionV1Alpha1Schema.parse(safe).available).toBe(true);
    for (const privateField of [
      "canonicalEndpoint",
      "credentialRef",
      "ownerScopeDigest",
      "recordDigest",
      "helperPath",
    ]) {
      expect(PersonalModelSafeProjectionV1Alpha1Schema.safeParse({
        ...safe,
        [privateField]: "secret",
      }).success).toBe(false);
    }
  });

  it("enforces the bounded page size and strict fields", () => {
    for (const limit of [0, 101]) {
      expect(ListPersonalModelsQueryV1Alpha1Schema.safeParse({
        contractVersion: "personal-model-management.v1alpha1",
        type: "list_personal_models",
        queryId: id,
        correlationId: id,
        clientInstanceId: id,
        limit,
      }).success).toBe(false);
    }
  });
});
