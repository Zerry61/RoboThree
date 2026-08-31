import { describe, expect, it, vi } from "vitest";

import { createPersonalModelApiV1Alpha2 } from
  "../src/preload/create-desktop-api.js";
import { PersonalModelV1Alpha2IpcRouter } from
  "../src/main/personal-model-v1alpha2-ipc-router.js";
import { PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS } from
  "../src/shared/foundation-api.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe("DFI-4A.4.2 Personal Model v1alpha2 safe Preload API", () => {
  it("exposes exactly eight frozen methods", () => {
    const api = createPersonalModelApiV1Alpha2(vi.fn(), transport());
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.keys(api).sort()).toEqual([
      "contractVersion", "getCompatibility", "listPersonalModels", "getPersonalModel",
      "createPersonalModel", "updatePersonalModel", "deletePersonalModel",
      "revealPersonalModelKey", "queryPersonalModelOperation",
    ].sort());
  });

  it("routes create and replace-secret update through the sensitive transport", async () => {
    const sensitive = transport();
    const invoke = operationInvoke();
    const api = createPersonalModelApiV1Alpha2(invoke, sensitive);
    const createSecret = bytes("create-secret");
    await expect(api.createPersonalModel(createCommand(), createSecret)).resolves.toMatchObject({
      ok: true,
      value: { state: "committed" },
    });
    expect([...createSecret]).toEqual(new Array(createSecret.byteLength).fill(0));
    expect(sensitive.submitMutationSecret).toHaveBeenCalledWith(uuid(1), expect.any(Uint8Array));

    const replacement = bytes("replacement-secret");
    await expect(api.updatePersonalModel(updateCommand("replace_secret"), replacement))
      .resolves.toMatchObject({ ok: true, value: { state: "committed" } });
    expect([...replacement]).toEqual(new Array(replacement.byteLength).fill(0));
    expect(sensitive.submitMutationSecret).toHaveBeenCalledTimes(2);
  });

  it("keeps reuse-existing update and delete on the zero-Secret Core command path", async () => {
    const sensitive = transport();
    const invoke = operationInvoke({ completedUpdate: true, completedDelete: true });
    const api = createPersonalModelApiV1Alpha2(invoke, sensitive);

    await expect(api.updatePersonalModel(updateCommand("reuse_existing")))
      .resolves.toMatchObject({ ok: true, value: { commandType: "update" } });
    await expect(api.deletePersonalModel(deleteCommand()))
      .resolves.toMatchObject({ ok: true, value: { commandType: "delete" } });
    expect(sensitive.submitMutationSecret).not.toHaveBeenCalled();
  });

  it("returns reveal bytes from the one-shot transport and rejects update Secret mismatch", async () => {
    const sensitive = transport();
    sensitive.receiveRevealSecret.mockResolvedValueOnce(bytes("revealed-secret"));
    const api = createPersonalModelApiV1Alpha2(operationInvoke(), sensitive);

    await expect(api.revealPersonalModelKey(revealCommand())).resolves.toMatchObject({
      ok: true,
      value: { personalModelId: "model.personal.existing", secret: expect.any(Uint8Array) },
    });
    await expect(api.updatePersonalModel(updateCommand("reuse_existing"), bytes("not-allowed")))
      .rejects.toThrow("Secret presence is invalid");
  });

  it("opens STRM only for prepared Secret-bearing commands after runtime negotiation", async () => {
    const openPreparedCommand = vi.fn();
    const client = {
      personalModelManagementCompatibilityV1Alpha2: vi.fn(async () => ({
        ok: true,
        value: {
          contractVersion: "personal-model-management.v1alpha2",
          runtimeInstanceId: "runtime.placeholder",
          catalogAvailable: true,
          mutationAvailable: true,
          revealAvailable: true,
          authorityKind: "standalone_local_owner",
          helperState: "production_verified",
          transportState: "ready",
          productionIdentityReady: true,
          testIdentityUsed: false,
        },
      })),
      updatePersonalModelV1Alpha2: vi.fn(async () => ({
        ok: true,
        value: { state: "completed", receipt: receipt("update", uuid(2)) },
      })),
      createPersonalModelV1Alpha2: vi.fn(async () => (await operationInvoke()(
        PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.createPersonalModel,
        createCommand(),
      ))),
    };
    const router = new PersonalModelV1Alpha2IpcRouter({
      resolveConnection: () => ({
        client,
        runtimeInstanceId: "runtime.instance-one",
        transportClientInstanceId: uuid(12),
      } as never),
      isCurrentConnection: () => true,
      transport: { openPreparedCommand } as never,
      isAuthorizedWebContents: () => true,
    });
    const mainFrame = {};
    const event = { sender: { id: 7, mainFrame }, senderFrame: mainFrame } as never;

    await expect(router.dispatch(
      PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.compatibility,
      compatibilityQuery(),
      event,
    )).resolves.toMatchObject({ ok: true });
    await expect(router.dispatch(
      PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.updatePersonalModel,
      updateCommand("reuse_existing"),
      event,
    )).resolves.toMatchObject({ ok: true, value: { state: "completed" } });
    expect(openPreparedCommand).not.toHaveBeenCalled();

    await expect(router.dispatch(
      PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.createPersonalModel,
      createCommand(),
      event,
    )).resolves.toMatchObject({ ok: true, value: { state: "transport_prepared" } });
    expect(openPreparedCommand).toHaveBeenCalledTimes(1);
  });
});

function transport() {
  return {
    submitMutationSecret: vi.fn(async (_commandId: string, secret: Uint8Array) => {
      secret.fill(0);
      return { controlType: "terminal_ack" };
    }),
    receiveRevealSecret: vi.fn(async () => bytes("revealed-secret")),
  };
}

function operationInvoke(options: { completedUpdate?: boolean; completedDelete?: boolean } = {}) {
  return vi.fn(async (channel: string, input: unknown) => {
    const command = input as { commandId?: string; personalModelId?: string };
    if (channel === PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.queryPersonalModelOperation) {
      return { ok: true, value: receipt("create", command.commandId ?? uuid(1)) };
    }
    if (channel === PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.updatePersonalModel
      && options.completedUpdate) {
      return { ok: true, value: { state: "completed", receipt: receipt("update", command.commandId ?? uuid(2)) } };
    }
    if (channel === PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.deletePersonalModel
      && options.completedDelete) {
      return { ok: true, value: { state: "completed", receipt: receipt("delete", command.commandId ?? uuid(3)) } };
    }
    const commandType = channel === PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.createPersonalModel
      ? "create" : channel === PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.revealPersonalModelKey
        ? "reveal" : "update";
    return {
      ok: true,
      value: {
        state: "transport_prepared",
        receipt: receipt(commandType, command.commandId ?? uuid(1)),
        transport: {
          schemaVersion: "personal-model-transport-preparation.v1alpha2",
          commandId: command.commandId ?? uuid(1),
          commandType,
          personalModelId: command.personalModelId ?? "model.personal.generated",
          expectedConfigurationRevision: digest("a"),
          ...(commandType === "reveal" ? {
            expectedExecutionDefinitionDigest: digest("b"),
          } : {}),
          requestDigest: digest("e"),
          deadlineAt: "2026-08-29T10:05:00.000Z",
          transportMode: "strm_message_port",
        },
      },
    };
  });
}

function receipt(commandType: "create" | "update" | "delete" | "reveal", commandId: string) {
  return {
    contractVersion: "personal-model-management.v1alpha2",
    commandId,
    commandType,
    personalModelId: commandType === "create" ? "model.personal.generated" : "model.personal.existing",
    state: "committed",
    replayed: false,
    ...(commandType === "delete" || commandType === "reveal" ? {} : {
      committedConfigurationRevision: digest("c"),
    }),
  };
}

function createCommand() {
  return {
    contractVersion: "personal-model-management.v1alpha2" as const,
    type: "create_personal_model" as const,
    commandId: uuid(1), correlationId: uuid(10), clientInstanceId: uuid(11),
    deadlineAt: "2026-08-29T10:05:00.000Z",
    target: target(),
  };
}

function compatibilityQuery() {
  return {
    contractVersion: "personal-model-management.v1alpha2" as const,
    type: "personal_model_management_compatibility" as const,
    queryId: uuid(9), correlationId: uuid(10), clientInstanceId: uuid(11),
    supportedContractVersions: ["personal-model-management.v1alpha2" as const],
  };
}

function updateCommand(credentialMutation: "reuse_existing" | "replace_secret") {
  return {
    contractVersion: "personal-model-management.v1alpha2" as const,
    type: "update_personal_model" as const,
    commandId: uuid(2), correlationId: uuid(10), clientInstanceId: uuid(11),
    deadlineAt: "2026-08-29T10:05:00.000Z",
    personalModelId: "model.personal.existing",
    expectedConfigurationRevision: digest("a"),
    expectedExecutionDefinitionDigest: digest("b"),
    target: target(), credentialMutation,
  };
}

function deleteCommand() {
  return {
    contractVersion: "personal-model-management.v1alpha2" as const,
    type: "delete_personal_model" as const,
    commandId: uuid(3), correlationId: uuid(10), clientInstanceId: uuid(11),
    deadlineAt: "2026-08-29T10:05:00.000Z",
    personalModelId: "model.personal.existing",
    expectedConfigurationRevision: digest("a"),
    expectedExecutionDefinitionDigest: digest("b"),
  };
}

function revealCommand() {
  return {
    ...deleteCommand(),
    type: "reveal_personal_model_key" as const,
    commandId: uuid(4),
  };
}

function target() {
  return {
    providerKind: "custom" as const,
    providerProfileRevision: digest("d"),
    protocol: "openai_compatible" as const,
    endpoint: "https://api.example.com/v1",
    providerModelId: "model-one",
    displayName: "Personal model",
    capabilities: ["text" as const],
  };
}

function uuid(offset: number): string {
  return `00000000-0000-4000-8000-${offset.toString().padStart(12, "0")}`;
}

function bytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "utf8"));
}
