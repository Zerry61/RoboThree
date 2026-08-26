import { describe, expect, it } from "vitest";

import {
  PersonalModelProviderProfileRegistry,
  PersonalModelTaskLockMaterializer,
  TaskBackedPersonalModelUsageGuard,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  createPersonalModelDefinition,
  createPersonalModelOwnerNamespace,
  derivePersonalModelOwnerIdentity,
  type PersonalModelPersistence,
  type TaskPersistence,
} from "../src/index.js";

const digest = (value: string) => `sha256:${value.repeat(64)}` as const;
const at = "2026-08-22T06:00:00.000Z";

describe("DFI-4A.3.2 Task-backed personal model usage guard", () => {
  it("blocks delete and Credential cleanup for an exact nonterminal personal lock", async () => {
    const fixture = personalLock();
    const guard = guardFor([fixture.lock], fixture.namespace);
    const identity = {
      ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
      ownerScopeDigest: fixture.owner.ownerScopeDigest,
      personalModelId: fixture.definition.personalModelId,
      configurationRevision: fixture.definition.configurationRevision,
      executionDefinitionDigest: fixture.definition.executionDefinitionDigest,
    };
    expect(await guard.evaluate(identity)).toEqual({
      status: "in_use",
      reasonCode: "personal_model.in_use",
    });
    expect(await guard.evaluate({
      ...identity,
      credentialRef: fixture.definition.credentialRef,
    })).toEqual({
      status: "referenced",
      reasonCode: "personal_model.credential_referenced",
    });
  });

  it("returns unused for another exact revision and unknown for truncated/corrupt facts", async () => {
    const fixture = personalLock();
    expect(await guardFor([fixture.lock], fixture.namespace).evaluate({
      ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
      ownerScopeDigest: fixture.owner.ownerScopeDigest,
      personalModelId: fixture.definition.personalModelId,
      configurationRevision: digest("f"),
      executionDefinitionDigest: digest("e"),
      credentialRef: fixture.definition.credentialRef,
    })).toEqual({ status: "unused" });

    const truncated = guardFor([fixture.lock], fixture.namespace, true);
    expect(await truncated.evaluate({
      ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
      ownerScopeDigest: fixture.owner.ownerScopeDigest,
      personalModelId: fixture.definition.personalModelId,
      configurationRevision: fixture.definition.configurationRevision,
      executionDefinitionDigest: fixture.definition.executionDefinitionDigest,
    })).toEqual({ status: "unknown", reasonCode: "personal_model.usage_unknown" });
  });
});

function guardFor(
  locks: readonly ReturnType<typeof personalLock>["lock"][],
  namespace: ReturnType<typeof personalLock>["namespace"],
  truncated = false,
) {
  const tasks = {
    async listNonTerminalTaskCapabilityLocksByCapabilityId() {
      return { locks, truncated };
    },
  } as unknown as TaskPersistence;
  const personal = {
    async loadActiveOwnerNamespace() { return namespace; },
  } as unknown as PersonalModelPersistence;
  return new TaskBackedPersonalModelUsageGuard({ tasks, personal });
}

function personalLock() {
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
  const definition = createPersonalModelDefinition({
    ownerIdentity: owner,
    personalModelId: "model.personal.deepseek",
    providerKind: "deepseek",
    providerProfileRevision: new PersonalModelProviderProfileRegistry()
      .resolve("deepseek").profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://api.example.com/v1",
    providerModelId: "deepseek-chat",
    displayName: "Personal DeepSeek",
    capabilities: ["text", "streaming"],
    credentialRef,
    credentialRevision: 1,
    credentialBindingDigest: calculateCredentialBindingDigest({
      credentialRef,
      createdByOperationId: "019f7447-a784-77b2-a716-000000000001",
      credentialRevision: 1,
    }),
    createdAt: at,
  });
  const lock = new PersonalModelTaskLockMaterializer().prepare({
    taskId: "019f7447-a784-77b2-a716-000000000002",
    lockId: "019f7447-a784-77b2-a716-000000000003",
    lockedAt: at,
    registryRevision: digest("a"),
    namespace,
    definition,
  });
  return { namespace, owner, definition, lock };
}
