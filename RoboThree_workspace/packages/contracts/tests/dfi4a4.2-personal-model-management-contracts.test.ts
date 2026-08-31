import { describe, expect, it } from "vitest";

import {
  CreatePersonalModelCommandV1Alpha2Schema,
  DeletePersonalModelCommandV1Alpha2Schema,
  PersonalModelCommandPreparationV1Alpha2Schema,
  PersonalModelManagementCompatibilityProjectionV1Alpha2Schema,
  PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA2,
  UpdatePersonalModelCommandV1Alpha2Schema,
} from "../src/desktop-local/personal-model-management/v1alpha2/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe("DFI-4A.4.2 additive Personal Model management Contract", () => {
  it("keeps the exact version and strict eight-method command materials", () => {
    expect(PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA2)
      .toBe("personal-model-management.v1alpha2");
    expect(() => CreatePersonalModelCommandV1Alpha2Schema.parse({
      ...createCommand(),
      secret: "must-not-enter-json",
    })).toThrow();
    expect(() => DeletePersonalModelCommandV1Alpha2Schema.parse({
      ...deleteCommand(),
      secret: new Uint8Array(),
    })).toThrow();
  });

  it("represents reuse-existing update without Secret or a fake transport command", () => {
    expect(UpdatePersonalModelCommandV1Alpha2Schema.parse(updateCommand("reuse_existing")))
      .toMatchObject({ credentialMutation: "reuse_existing" });
    expect(PersonalModelCommandPreparationV1Alpha2Schema.parse({
      state: "completed",
      receipt: receipt("update"),
    })).toMatchObject({ state: "completed" });
  });

  it("requires the complete production graph before mutation/reveal become available", () => {
    const base = {
      contractVersion: "personal-model-management.v1alpha2",
      runtimeInstanceId: "runtime.one",
      catalogAvailable: true,
      mutationAvailable: true,
      revealAvailable: true,
      authorityKind: "standalone_local_owner",
      helperState: "production_verified",
      transportState: "ready",
      productionIdentityReady: true,
      testIdentityUsed: false,
    };
    expect(PersonalModelManagementCompatibilityProjectionV1Alpha2Schema.parse(base))
      .toMatchObject({ mutationAvailable: true, revealAvailable: true });
    expect(() => PersonalModelManagementCompatibilityProjectionV1Alpha2Schema.parse({
      ...base,
      helperState: "unavailable",
    })).toThrow();
  });
});

function createCommand() {
  return {
    ...metadata("create_personal_model", 1),
    target: target(),
  };
}

function updateCommand(credentialMutation: "reuse_existing" | "replace_secret") {
  return {
    ...metadata("update_personal_model", 2),
    personalModelId: "model.personal.existing",
    expectedConfigurationRevision: digest("a"),
    expectedExecutionDefinitionDigest: digest("b"),
    target: target(),
    credentialMutation,
  };
}

function deleteCommand() {
  return {
    ...metadata("delete_personal_model", 3),
    personalModelId: "model.personal.existing",
    expectedConfigurationRevision: digest("a"),
    expectedExecutionDefinitionDigest: digest("b"),
  };
}

function metadata(type: string, offset: number) {
  return {
    contractVersion: "personal-model-management.v1alpha2",
    type,
    commandId: uuid(offset),
    correlationId: uuid(20),
    clientInstanceId: uuid(21),
    deadlineAt: "2026-08-29T10:05:00.000Z",
  };
}

function target() {
  return {
    providerKind: "custom",
    providerProfileRevision: digest("d"),
    protocol: "openai_compatible",
    endpoint: "https://api.example.com/v1",
    providerModelId: "model-one",
    displayName: "Personal model",
    capabilities: ["text"],
  };
}

function receipt(commandType: "update") {
  return {
    contractVersion: "personal-model-management.v1alpha2",
    commandId: uuid(2),
    commandType,
    personalModelId: "model.personal.existing",
    state: "committed",
    replayed: false,
    committedConfigurationRevision: digest("c"),
  };
}

function uuid(offset: number): string {
  return `00000000-0000-4000-8000-${offset.toString().padStart(12, "0")}`;
}
