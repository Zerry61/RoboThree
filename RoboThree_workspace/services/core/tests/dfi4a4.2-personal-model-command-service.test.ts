import { describe, expect, it, vi } from "vitest";

import { FakeClock } from "../src/adapters/fake/fake-clock.js";
import { FakeIdGenerator } from "../src/adapters/fake/fake-id-generator.js";
import { PersonalModelManagementCommandService } from
  "../src/application/personal-model-management-command-service.js";
import type { PersonalModelCredentialCoordinator } from
  "../src/application/personal-model-credential-coordinator.js";
import type { PersonalModelManagementAuthoritySource } from
  "../src/application/personal-model-management-authority.js";
import type { PersonalModelPersistence } from
  "../src/ports/personal-model-persistence.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const deadlineAt = "2026-08-29T10:05:00.000Z";

describe("DFI-4A.4.2 A2 safe Core command split", () => {
  it("executes reuse-existing update through the same Coordinator with zero Secret", async () => {
    const harness = commandHarness();
    const result = await harness.service.update(updateCommand("reuse_existing"));

    expect(result).toMatchObject({ ok: true, value: { state: "completed" } });
    expect(harness.prepare).toHaveBeenCalledTimes(1);
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.execute.mock.calls[0]![0]).toMatchObject({
      commandType: "update",
      personalModelId: "model.personal.existing",
      expectedConfigurationRevision: digest("a"),
    });
    expect(harness.execute.mock.calls[0]![0].secret).toHaveLength(0);
  });

  it("executes delete through the same Coordinator with zero Secret", async () => {
    const harness = commandHarness();
    const result = await harness.service.delete({
      contractVersion: "personal-model-management.v1alpha2",
      type: "delete_personal_model",
      commandId: uuid(2),
      correlationId: uuid(3),
      clientInstanceId: uuid(4),
      deadlineAt,
      personalModelId: "model.personal.existing",
      expectedConfigurationRevision: digest("a"),
      expectedExecutionDefinitionDigest: digest("b"),
    });

    expect(result).toMatchObject({ ok: true, value: { state: "completed" } });
    expect(harness.prepare).toHaveBeenCalledTimes(1);
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.execute.mock.calls[0]![0]).toMatchObject({
      commandType: "delete",
      personalModelId: "model.personal.existing",
    });
    expect(harness.execute.mock.calls[0]![0].secret).toHaveLength(0);
  });

  it("keeps replace-secret update on the prepared STRM path", async () => {
    const harness = commandHarness();
    const result = await harness.service.update(updateCommand("replace_secret"));

    expect(result).toMatchObject({
      ok: true,
      value: {
        state: "transport_prepared",
        transport: { commandType: "update", transportMode: "strm_message_port" },
      },
    });
    expect(harness.prepare).toHaveBeenCalledTimes(1);
    expect(harness.execute).not.toHaveBeenCalled();
  });
});

function commandHarness() {
  const prepare = vi.fn(async (command: { commandId: string; commandType: "create" | "update" | "delete"; personalModelId: string }) => ({
    ok: true as const,
    status: "prepared" as const,
    replayed: false,
    commandId: command.commandId,
    commandType: command.commandType,
    personalModelId: command.personalModelId,
  }));
  const execute = vi.fn(async (command: { commandId: string; commandType: "create" | "update" | "delete"; personalModelId: string; secret: Uint8Array }) => ({
    ok: true as const,
    status: "committed" as const,
    replayed: false,
    commandId: command.commandId,
    commandType: command.commandType,
    personalModelId: command.personalModelId,
    committedConfigurationRevision: digest("c"),
  }));
  const service = new PersonalModelManagementCommandService({
    coordinator: { prepare, executePrepared: execute } as unknown as PersonalModelCredentialCoordinator,
    persistence: {} as PersonalModelPersistence,
    authority: {} as PersonalModelManagementAuthoritySource,
    ids: new FakeIdGenerator([uuid(99)]),
    clock: new FakeClock("2026-08-29T10:00:00.000Z"),
    sensitiveOperationsReady: () => true,
  });
  return { service, prepare, execute };
}

function updateCommand(credentialMutation: "reuse_existing" | "replace_secret") {
  return {
    contractVersion: "personal-model-management.v1alpha2" as const,
    type: "update_personal_model" as const,
    commandId: uuid(1),
    correlationId: uuid(3),
    clientInstanceId: uuid(4),
    deadlineAt,
    personalModelId: "model.personal.existing",
    expectedConfigurationRevision: digest("a"),
    expectedExecutionDefinitionDigest: digest("b"),
    target: {
      providerKind: "custom" as const,
      providerProfileRevision: digest("d"),
      protocol: "openai_compatible" as const,
      endpoint: "https://api.example.com/v1",
      providerModelId: "model-one",
      displayName: "Personal model",
      capabilities: ["text" as const],
    },
    credentialMutation,
  };
}

function uuid(offset: number): string {
  return `00000000-0000-4000-8000-${offset.toString().padStart(12, "0")}`;
}
