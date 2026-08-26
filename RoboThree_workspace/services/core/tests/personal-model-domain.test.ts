import { describe, expect, it } from "vitest";

import {
  PersonalCredentialObservationSchema,
  StrictPersonalModelOwnerAuthorityResolver,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  canonicalizePersonalModelEndpoint,
  createPersonalModelDefinition,
  createPersonalModelOwnerNamespace,
  derivePersonalModelOwnerIdentity,
  validatePersonalModelDefinition,
  validatePersonalModelOwnerNamespace,
} from "../src/index.js";

const at = "2026-08-21T02:00:00.000Z";
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const commandId = "019f7447-a784-77b2-a716-000000000001";

describe("DFI-4A.1 Personal Model domain", () => {
  it("canonicalizes HTTPS endpoints without erasing repeated slash semantics", () => {
    expect(canonicalizePersonalModelEndpoint("https://EXAMPLE.com:443/v1//chat/%7euser"))
      .toMatchObject({
        canonicalEndpoint: "https://example.com/v1//chat/~user",
        endpointDisplayHost: "example.com",
      });
    expect(canonicalizePersonalModelEndpoint("https://例子.测试/v1").canonicalEndpoint)
      .toMatch(/^https:\/\/xn--/u);
  });

  it.each([
    "http://example.com/v1",
    "https://user@example.com/v1",
    "https://example.com/v1?x=1",
    "https://example.com/v1#fragment",
    "https://example.com./v1",
    "https://example.com/v1%2fadmin",
    "https://example.com/v1%2Fadmin",
    "https://example.com/v1%5cadmin",
    "https://example.com/v1%00admin",
    "https://example.com/v1%00%2fadmin",
    " https://example.com/v1",
  ])("rejects unsafe endpoint %s", (endpoint) => {
    expect(() => canonicalizePersonalModelEndpoint(endpoint)).toThrow("personal_model.endpoint_invalid");
  });

  it("keeps display-only edits out of execution identity", () => {
    const owner = ownerFixture();
    const input = definitionInput(owner);
    const before = createPersonalModelDefinition(input);
    const renamed = createPersonalModelDefinition({ ...input, displayName: "Renamed" });
    expect(renamed.configurationRevision).not.toBe(before.configurationRevision);
    expect(renamed.executionDefinitionDigest).toBe(before.executionDefinitionDigest);
    const changedEndpoint = createPersonalModelDefinition({
      ...input,
      endpoint: "https://other.example.com/v1",
    });
    expect(changedEndpoint.executionDefinitionDigest).not.toBe(before.executionDefinitionDigest);
  });

  it("normalizes Unicode and capability order before hashing", () => {
    const owner = ownerFixture();
    const input = definitionInput(owner);
    const left = createPersonalModelDefinition({
      ...input,
      displayName: "Cafe\u0301",
      capabilities: ["streaming", "text", "streaming"],
    });
    const right = createPersonalModelDefinition({
      ...input,
      displayName: "Café",
      capabilities: ["text", "streaming"],
    });
    expect(left).toEqual(right);
  });

  it("detects definition and namespace corruption without exposing namespace key", () => {
    const owner = ownerFixture();
    const definition = createPersonalModelDefinition(definitionInput(owner));
    expect(() => validatePersonalModelDefinition({
      ...definition,
      displayName: "tampered",
    })).toThrow("personal_model.definition_integrity_invalid");
    const namespace = namespaceFixture();
    expect(() => validatePersonalModelOwnerNamespace({
      ...namespace,
      namespaceKey: Uint8Array.from(namespace.namespaceKey, (value, index) => index === 0 ? value ^ 1 : value),
    })).toThrow("personal_model.owner_namespace_key_check_invalid");
    expect(JSON.stringify({
      namespaceRevision: namespace.namespaceRevision,
      namespaceKeyCheckDigest: namespace.namespaceKeyCheckDigest,
      recordDigest: namespace.recordDigest,
    })).not.toContain(Buffer.from(namespace.namespaceKey).toString("base64"));
  });

  it("enforces the strict Credential inspect discriminated union", () => {
    expect(PersonalCredentialObservationSchema.safeParse({
      state: "present",
      credentialRef: allocatePersonalCredentialReference(Buffer.alloc(32, 1)),
    }).success).toBe(false);
    expect(PersonalCredentialObservationSchema.safeParse({
      state: "absent",
      credentialRef: allocatePersonalCredentialReference(Buffer.alloc(32, 1)),
      credentialRevision: 1,
    }).success).toBe(false);
    expect(PersonalCredentialObservationSchema.safeParse({
      state: "unavailable",
      credentialRef: allocatePersonalCredentialReference(Buffer.alloc(32, 1)),
      errorCode: "credential_store_locked",
    }).success).toBe(true);
  });

  it("derives owner identity from enterprise/user/device but not client instance", () => {
    const namespace = namespaceFixture();
    const left = derivePersonalModelOwnerIdentity(namespace, {
      enterpriseId: "enterprise.one",
      userId: "user.one",
      deviceId: "device.one",
    });
    const right = derivePersonalModelOwnerIdentity(namespace, {
      enterpriseId: "enterprise.one",
      userId: "user.one",
      deviceId: "device.two",
    });
    expect(left).not.toEqual(right);
  });
});

describe("DFI-4A.1 Personal Model owner authority", () => {
  const resolver = new StrictPersonalModelOwnerAuthorityResolver();
  const base = {
    namespace: namespaceFixture(),
    enterpriseId: "enterprise.one",
    userId: "user.one",
    deviceId: "device.one",
    entitlementGranted: true,
    entitlementRevision: digest("e"),
  } as const;

  it.each(["online", "enterprise_temporarily_unavailable"] as const)(
    "allows configure in existing offline state %s",
    (offlineState) => {
      expect(resolver.resolve({ ...base, offlineState, action: "configure" }))
        .toMatchObject({ entitlement: "personal_model.configure", offlineState });
    },
  );

  it("fails closed when session or entitlement is invalid, while preserving same-owner delete", () => {
    expect(() => resolver.resolve({
      ...base,
      offlineState: "enterprise_session_invalid",
      action: "use",
    })).toThrow("personal_model.permission_denied");
    expect(() => resolver.resolve({
      ...base,
      entitlementGranted: false,
      offlineState: "online",
      action: "reveal",
    })).toThrow("personal_model.permission_denied");
    expect(resolver.resolve({
      ...base,
      entitlementGranted: false,
      offlineState: "enterprise_session_invalid",
      action: "delete",
    })).toMatchObject({ authoritySource: "runtime_active_enterprise_identity" });
  });
});

function namespaceFixture() {
  return createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: Buffer.alloc(32, 7),
    createdAt: at,
  });
}

function ownerFixture() {
  return derivePersonalModelOwnerIdentity(namespaceFixture(), {
    enterpriseId: "enterprise.one",
    userId: "user.one",
    deviceId: "device.one",
  });
}

function definitionInput(owner: ReturnType<typeof ownerFixture>) {
  const credentialRef = allocatePersonalCredentialReference(Buffer.alloc(32, 8));
  return {
    ownerIdentity: owner,
    personalModelId: "model.personal.deepseek",
    providerKind: "deepseek" as const,
    providerProfileRevision: digest("a"),
    protocol: "openai_compatible" as const,
    endpoint: "https://api.example.com/v1",
    providerModelId: "deepseek-chat",
    displayName: "Personal DeepSeek",
    capabilities: ["text", "streaming"] as const,
    credentialRef,
    credentialRevision: 1,
    credentialBindingDigest: calculateCredentialBindingDigest({
      credentialRef,
      createdByOperationId: commandId,
      credentialRevision: 1,
    }),
    createdAt: at,
  };
}
