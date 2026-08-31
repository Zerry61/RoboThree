import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { verifyPersonalCredentialHelperDescriptor } from
  "../src/adapters/credential/personal-credential-helper-trust.js";

import {
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
} from "../src/application/personal-model-domain.js";
import {
  ProductionPersonalModelManagementAuthoritySource,
} from "../src/application/personal-model-management-authority.js";
import { PersonalModelManagementReadService } from
  "../src/application/personal-model-management-read-service.js";
import { PersonalModelProviderProfileRegistry } from
  "../src/application/personal-model-provider-profile.js";
import type { PersonalCredentialStore } from
  "../src/ports/personal-credential-store.js";
import type { PersonalModelPersistence } from
  "../src/ports/personal-model-persistence.js";

const at = "2026-08-28T00:00:00.000Z";
const operationId = "019f7447-a784-77b2-a716-000000004401";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("DFI-4A.4.1 Personal Model management authority and safe reads", () => {
  it("derives standalone management authority without enterprise identity", async () => {
    const namespace = localNamespace();
    const source = new ProductionPersonalModelManagementAuthoritySource({
      deploymentMode: "standalone_local",
      persistence: namespacePersistence(namespace),
    });

    await expect(source.resolve()).resolves.toMatchObject({
      schemaVersion: "v2",
      authorityKind: "standalone_local_owner",
      policy: "local_personal_model_management",
      permissions: { configure: true, use: true, reveal: true, delete: true },
      productionLocalAuthorityReady: true,
      productionEnterpriseIdentityReady: false,
      testIdentityUsed: false,
    });
  });

  it("does not fall back to standalone authority in enterprise-managed mode", async () => {
    let namespaceReads = 0;
    const source = new ProductionPersonalModelManagementAuthoritySource({
      deploymentMode: "enterprise_managed",
      persistence: {
        async loadActiveOwnerNamespace() {
          namespaceReads += 1;
          return localNamespace();
        },
      } as unknown as PersonalModelPersistence,
    });

    await expect(source.resolve()).resolves.toBeUndefined();
    expect(namespaceReads).toBe(0);
  });

  it("keeps the safe catalog readable when the production Helper is unavailable", async () => {
    const fixture = await modelFixture();
    const service = new PersonalModelManagementReadService({
      persistence: fixture.persistence,
      credentials: fixture.credentials,
      authority: fixture.authority,
      helperProductionReady: () => false,
      transportProductionReady: () => false,
    });

    await expect(service.compatibility("runtime.instance-dfi4a41")).resolves.toMatchObject({
      catalogAvailable: true,
      mutationAvailable: false,
      revealAvailable: false,
      helperState: "unavailable",
      reasonCode: "personal_model.credential_store_unavailable",
    });
    const page = await service.list({ limit: 20 });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.value.items).toHaveLength(1);
    expect(page.value.items[0]).toMatchObject({
      personalModelId: fixture.definition.personalModelId,
      endpointDisplayHost: "api.openai.com",
      credentialState: "present_masked",
      available: true,
      permissions: {
        canConfigure: false,
        canUse: true,
        canReveal: false,
        canDelete: false,
        safeReason: "personal_model.transport_unavailable",
      },
    });
    expect(JSON.stringify(page.value)).not.toContain("https://api.openai.com/v1");
    expect(JSON.stringify(page.value)).not.toContain(fixture.definition.credentialRef);
    expect(JSON.stringify(page.value)).not.toContain(fixture.definition.ownerScopeDigest);
  });

  it("returns typed not-found instead of an empty detail projection", async () => {
    const fixture = await modelFixture();
    const service = new PersonalModelManagementReadService({
      persistence: {
        ...fixture.persistence,
        async loadHead() { return undefined; },
      } as PersonalModelPersistence,
      credentials: fixture.credentials,
      authority: fixture.authority,
      helperProductionReady: () => false,
    });

    await expect(service.get("model.personal.missing"))
      .resolves.toEqual({ ok: false, code: "personal_model.not_found" });
  });

  it("accepts a production Helper only after Core digest and signature revalidation", async () => {
    const fixture = await productionHelperFixture();
    await expect(verifyPersonalCredentialHelperDescriptor(fixture.descriptor, {
      verifyProductionSignature: async (input) => input.helperPath === fixture.helperPath
        && input.teamIdentifier === "ROBOTHREE1",
    })).resolves.toEqual({
      helperPath: fixture.helperPath,
      protocolVersion: "personal-keychain-helper.v1",
      productionReady: true,
    });
  });

  it("rejects Helper byte drift and a failed designated-requirement check", async () => {
    const fixture = await productionHelperFixture();
    await writeFile(fixture.helperPath, "signed-helper-byte-drift");
    await expect(verifyPersonalCredentialHelperDescriptor(fixture.descriptor, {
      verifyProductionSignature: async () => true,
    })).resolves.toBeUndefined();

    const second = await productionHelperFixture();
    await expect(verifyPersonalCredentialHelperDescriptor(second.descriptor, {
      verifyProductionSignature: async () => false,
    })).resolves.toBeUndefined();
  });
});

function localNamespace() {
  return createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: new Uint8Array(32).fill(41),
    createdAt: at,
  });
}

function cloneNamespace(namespace: ReturnType<typeof localNamespace>) {
  return { ...namespace, namespaceKey: Uint8Array.from(namespace.namespaceKey) };
}

function namespacePersistence(namespace: ReturnType<typeof localNamespace>) {
  return {
    async loadActiveOwnerNamespace() { return cloneNamespace(namespace); },
  } as unknown as PersonalModelPersistence;
}

async function modelFixture() {
  const namespace = localNamespace();
  const authority = new ProductionPersonalModelManagementAuthoritySource({
    deploymentMode: "standalone_local",
    persistence: namespacePersistence(namespace),
  });
  const resolved = await authority.resolve();
  if (resolved === undefined) throw new Error("authority fixture unavailable");
  const owner = {
    ownerScopeNamespaceRevision: resolved.ownerScopeNamespaceRevision,
    ownerScopeDigest: resolved.ownerScopeDigest,
  };
  const credentialRef = allocatePersonalCredentialReference(new Uint8Array(32).fill(42));
  const credentialBindingDigest = calculateCredentialBindingDigest({
    credentialRef,
    createdByOperationId: operationId,
    credentialRevision: 1,
  });
  const profile = new PersonalModelProviderProfileRegistry().resolve("custom");
  const definition = createPersonalModelDefinition({
    ownerIdentity: owner,
    personalModelId: "model.personal.openai",
    providerKind: "custom",
    providerProfileRevision: profile.profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://api.openai.com/v1",
    providerModelId: "gpt-5.2-2025-12-11",
    displayName: "OpenAI Personal",
    capabilities: ["text", "streaming", "tool_calling"],
    credentialRef,
    credentialRevision: 1,
    credentialBindingDigest,
    createdAt: at,
  });
  const head = createPersonalModelHead({
    ...owner,
    personalModelId: definition.personalModelId,
    currentConfigurationRevision: definition.configurationRevision,
    currentExecutionDefinitionDigest: definition.executionDefinitionDigest,
    headRevision: 1,
    selectionState: "active",
    updatedAt: at,
  });
  const status = createPersonalModelStatusFact({
    ...owner,
    personalModelId: definition.personalModelId,
    configurationRevision: definition.configurationRevision,
    executionDefinitionDigest: definition.executionDefinitionDigest,
    statusRevision: 1,
    status: "available",
    statusOrigin: "initialized",
    updatedAt: at,
  });
  const persistence = {
    async loadActiveOwnerNamespace() { return cloneNamespace(namespace); },
    async listActiveHeads() {
      return { ok: true, replayed: false, value: {
        heads: [head], queryRevision: "catalog-revision-1",
      } };
    },
    async loadHead(_owner: unknown, modelId: string) {
      return modelId === definition.personalModelId ? head : undefined;
    },
    async loadDefinition() { return definition; },
    async loadStatus() { return status; },
    async loadPreference() { return undefined; },
  } as unknown as PersonalModelPersistence;
  const credentials = {
    async inspect() {
      return {
        state: "present" as const,
        credentialRef,
        createdByOperationId: operationId,
        credentialRevision: 1,
        credentialBindingDigest,
      };
    },
  } as unknown as PersonalCredentialStore;
  return { authority, persistence, credentials, definition };
}

async function productionHelperFixture() {
  const packageRootPath = await mkdtemp(join(tmpdir(), "robothree-dfi4a41-core-helper-"));
  temporaryDirectories.push(packageRootPath);
  const resourceDirectory = join(packageRootPath, "personal-credential-helper");
  await mkdir(resourceDirectory, { recursive: true });
  const helperPath = join(resourceDirectory, "robothree-personal-credential-helper");
  const bytes = Buffer.from("signed-helper-fixture", "utf8");
  await writeFile(helperPath, bytes);
  await chmod(helperPath, 0o755);
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
  const canonicalPackageRootPath = await realpath(packageRootPath);
  const canonicalHelperPath = await realpath(helperPath);
  return {
    helperPath: canonicalHelperPath,
    descriptor: {
      helperPath: canonicalHelperPath,
      packageRootPath: canonicalPackageRootPath,
      manifestSha256: digest,
      protocolVersion: "personal-keychain-helper.v1" as const,
      activation: "production_verified" as const,
      designatedRequirement: "identifier org.robothree.personal-credential-helper",
      teamIdentifier: "ROBOTHREE1",
    },
  };
}
