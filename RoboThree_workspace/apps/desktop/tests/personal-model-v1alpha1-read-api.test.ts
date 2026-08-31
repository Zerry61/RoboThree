import { describe, expect, it, vi } from "vitest";

import { PersonalModelV1Alpha1IpcRouter } from
  "../src/main/personal-model-v1alpha1-ipc-router.js";
import type { CorePrivateClient } from "../src/main/core-private-client.js";
import { createPersonalModelReadApiV1Alpha1 } from
  "../src/preload/create-desktop-api.js";
import { PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS } from
  "../src/shared/foundation-api.js";

const clientInstanceId = "11111111-1111-4111-8111-111111111111";
const queryId = "22222222-2222-4222-8222-222222222222";
const correlationId = "33333333-3333-4333-8333-333333333333";
const transportClientInstanceId = "44444444-4444-4444-8444-444444444444";

describe("DFI-4A.4.1 Personal Model Main and Preload read API", () => {
  it("exposes exactly three frozen read methods", () => {
    const api = createPersonalModelReadApiV1Alpha1(vi.fn());
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.keys(api).sort()).toEqual([
      "contractVersion",
      "getCompatibility",
      "listPersonalModels",
      "getPersonalModel",
    ].sort());
  });

  it("strictly parses safe compatibility results", async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      value: compatibilityProjection("runtime.instance-one"),
    }));
    const api = createPersonalModelReadApiV1Alpha1(invoke);
    await expect(api.getCompatibility(compatibilityQuery())).resolves.toMatchObject({
      ok: true,
      value: { catalogAvailable: true, mutationAvailable: false, revealAvailable: false },
    });
    expect(invoke).toHaveBeenCalledWith(
      PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility,
      compatibilityQuery(),
    );
  });

  it("requires compatibility and re-negotiation after a Core restart", async () => {
    const core = coreClient();
    let runtimeInstanceId = "runtime.instance-one";
    const router = new PersonalModelV1Alpha1IpcRouter({
      resolveConnection: () => ({ core: undefined, client: core,
        runtimeInstanceId, transportClientInstanceId } as never),
      isCurrentConnection: (lease) => lease.runtimeInstanceId === runtimeInstanceId,
    });
    const beforeCompatibility = await router.dispatch(
      PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.listPersonalModels,
      listQuery(),
    );
    expect(beforeCompatibility).toMatchObject({
      ok: false,
      error: { code: "personal_model.runtime_changed" },
    });

    await expect(router.dispatch(
      PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility,
      compatibilityQuery(),
    )).resolves.toMatchObject({ ok: true, value: { runtimeInstanceId } });
    expect(core.personalModelManagementCompatibilityV1Alpha1).toHaveBeenCalledWith(
      expect.objectContaining({ clientInstanceId: transportClientInstanceId }),
    );

    runtimeInstanceId = "runtime.instance-two";
    await expect(router.dispatch(
      PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.listPersonalModels,
      listQuery(),
    )).resolves.toMatchObject({
      ok: false,
      error: { code: "personal_model.runtime_changed" },
    });
  });

  it("rejects subframes and foreign webContents before Core dispatch", async () => {
    const core = coreClient();
    const router = new PersonalModelV1Alpha1IpcRouter({
      resolveConnection: () => ({ client: core,
        runtimeInstanceId: "runtime.instance-one", transportClientInstanceId } as never),
      isCurrentConnection: () => true,
      isAuthorizedWebContents: (id) => id === 7,
    });
    const result = await router.dispatch(
      PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility,
      compatibilityQuery(),
      { sender: { id: 8, mainFrame: {} }, senderFrame: {} } as never,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "personal_model.permission_denied" },
    });
    expect(core.personalModelManagementCompatibilityV1Alpha1).not.toHaveBeenCalled();
  });
});

function compatibilityQuery() {
  return {
    contractVersion: "personal-model-management.v1alpha1" as const,
    type: "personal_model_management_compatibility" as const,
    queryId,
    correlationId,
    clientInstanceId,
    supportedContractVersions: ["personal-model-management.v1alpha1" as const],
  };
}

function listQuery() {
  return {
    contractVersion: "personal-model-management.v1alpha1" as const,
    type: "list_personal_models" as const,
    queryId,
    correlationId,
    clientInstanceId,
    limit: 20,
  };
}

function compatibilityProjection(runtimeInstanceId: string) {
  return {
    contractVersion: "personal-model-management.v1alpha1" as const,
    runtimeInstanceId,
    catalogAvailable: true,
    mutationAvailable: false,
    revealAvailable: false,
    authorityKind: "standalone_local_owner" as const,
    helperState: "unavailable" as const,
    transportState: "unavailable" as const,
    productionIdentityReady: true,
    testIdentityUsed: false,
    reasonCode: "personal_model.credential_store_unavailable" as const,
  };
}

function coreClient() {
  return {
    personalModelManagementCompatibilityV1Alpha1: vi.fn(async () => ({
      ok: true as const,
      value: compatibilityProjection("runtime.placeholder"),
    })),
    listPersonalModelsV1Alpha1: vi.fn(async () => ({
      ok: true as const,
      value: {
        contractVersion: "personal-model-management.v1alpha1" as const,
        queryRevision: "catalog-revision-1",
        items: [],
      },
    })),
    getPersonalModelV1Alpha1: vi.fn(),
  } as unknown as CorePrivateClient;
}
