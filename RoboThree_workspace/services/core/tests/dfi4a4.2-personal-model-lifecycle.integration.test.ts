import { describe, expect, it } from "vitest";

import { FakeClock } from "../src/adapters/fake/fake-clock.js";
import { FakeIdGenerator } from "../src/adapters/fake/fake-id-generator.js";
import { InMemoryPersonalCredentialStore } from
  "../src/adapters/memory/in-memory-personal-credential-store.js";
import {
  FixedPersonalCredentialReferenceUsage,
  FixedPersonalModelDeletionGuard,
} from "../src/adapters/memory/fixed-personal-model-credential-coordination.js";
import { InMemoryPersonalModelPersistence } from
  "../src/adapters/memory/in-memory-personal-model-persistence.js";
import { createPersonalModelCredentialBrokerHandler } from
  "../src/adapters/credential/personal-model-credential-broker-handler.js";
import { PersonalModelCredentialCoordinator } from
  "../src/application/personal-model-credential-coordinator.js";
import { PersonalModelCredentialRevealService } from
  "../src/application/personal-model-credential-reveal-service.js";
import { createPersonalModelOwnerNamespace } from
  "../src/application/personal-model-domain.js";
import { PersonalModelManagementCommandService } from
  "../src/application/personal-model-management-command-service.js";
import { ProductionPersonalModelManagementAuthoritySource } from
  "../src/application/personal-model-management-authority.js";
import { InMemoryPersonalModelOperationGate } from
  "../src/application/personal-model-operation-gate.js";

const at = "2026-08-29T10:00:00.000Z";
const deadlineAt = "2026-08-29T10:05:00.000Z";
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe("DFI-4A.4.2 Personal Model durable lifecycle", () => {
  it("creates through STRM, updates with zero Secret, reveals once and deletes durably", async () => {
    const persistence = new InMemoryPersonalModelPersistence();
    const credentials = new InMemoryPersonalCredentialStore();
    await persistence.start();
    await credentials.start();
    try {
      const namespace = createPersonalModelOwnerNamespace({
        namespaceRevision: 1,
        namespaceKey: new Uint8Array(32).fill(42),
        createdAt: at,
      });
      expect(await persistence.initializeOwnerNamespace(namespace)).toMatchObject({ ok: true });
      namespace.namespaceKey.fill(0);
      const authority = new ProductionPersonalModelManagementAuthoritySource({
        deploymentMode: "standalone_local",
        persistence,
      });
      const operationGate = new InMemoryPersonalModelOperationGate();
      const coordinator = new PersonalModelCredentialCoordinator({
        persistence,
        credentials,
        managementAuthority: authority,
        operationGate,
        deletionGuard: new FixedPersonalModelDeletionGuard({ status: "clear" }),
        credentialUsage: new FixedPersonalCredentialReferenceUsage({ status: "unused" }),
        clock: new FakeClock(at),
      });
      const reveal = new PersonalModelCredentialRevealService({
        persistence,
        credentials,
        managementAuthority: authority,
        operationGate,
        clock: new FakeClock(at),
      });
      const service = new PersonalModelManagementCommandService({
        coordinator,
        persistence,
        authority,
        ids: new FakeIdGenerator([uuid(900)]),
        clock: new FakeClock(at),
        sensitiveOperationsReady: () => true,
      });
      const broker = createPersonalModelCredentialBrokerHandler(coordinator, reveal);

      const create = await service.create(createCommand());
      expect(create).toMatchObject({ ok: true, value: { state: "transport_prepared" } });
      if (!create.ok || create.value.state !== "transport_prepared") return;
      const secret = bytes("test-personal-key");
      const createResult = await broker({
        protocolVersion: "personal-credential-broker.v1",
        channelInstanceId: uuid(40),
        commandId: create.value.transport.commandId,
        commandType: "create",
        transportRequestId: uuid(41),
        clientInstanceId: uuid(42),
        personalModelId: create.value.transport.personalModelId,
        expectedConfigurationRevision:
          create.value.transport.expectedConfigurationRevision,
        commandRequestDigest: create.value.transport.requestDigest,
        deadlineAt,
        secretByteLength: secret.byteLength,
      }, secret);
      expect(createResult).toMatchObject({ status: "completed" });
      expect(secret.every((value) => value === 0)).toBe(true);

      const ownerAuthority = await authority.resolve();
      if (ownerAuthority === undefined) throw new Error("authority unavailable");
      const owner = {
        ownerScopeNamespaceRevision: ownerAuthority.ownerScopeNamespaceRevision,
        ownerScopeDigest: ownerAuthority.ownerScopeDigest,
      };
      const head = await persistence.loadHead(owner, create.value.transport.personalModelId);
      if (head === undefined) throw new Error("created head unavailable");
      const update = await service.update({
        ...metadata("update_personal_model", 2),
        personalModelId: head.personalModelId,
        expectedConfigurationRevision: head.currentConfigurationRevision,
        expectedExecutionDefinitionDigest: head.currentExecutionDefinitionDigest,
        target: { ...target(), displayName: "Renamed Personal Model" },
        credentialMutation: "reuse_existing",
      });
      expect(update).toMatchObject({ ok: true, value: { state: "completed" } });

      const updatedHead = await persistence.loadHead(owner, head.personalModelId);
      if (updatedHead === undefined) throw new Error("updated head unavailable");
      const preparedReveal = await service.reveal({
        ...metadata("reveal_personal_model_key", 3),
        personalModelId: updatedHead.personalModelId,
        expectedConfigurationRevision: updatedHead.currentConfigurationRevision,
        expectedExecutionDefinitionDigest: updatedHead.currentExecutionDefinitionDigest,
      });
      expect(preparedReveal).toMatchObject({ ok: true, value: { state: "transport_prepared" } });
      if (!preparedReveal.ok || preparedReveal.value.state !== "transport_prepared") return;
      const revealed = await broker({
        protocolVersion: "personal-credential-broker.v1",
        channelInstanceId: uuid(40),
        commandId: preparedReveal.value.transport.commandId,
        commandType: "reveal",
        transportRequestId: uuid(43),
        clientInstanceId: uuid(42),
        personalModelId: updatedHead.personalModelId,
        expectedConfigurationRevision: updatedHead.currentConfigurationRevision,
        expectedExecutionDefinitionDigest: updatedHead.currentExecutionDefinitionDigest,
        commandRequestDigest: preparedReveal.value.transport.requestDigest,
        deadlineAt,
        secretByteLength: 0,
      }, new Uint8Array(0));
      expect(revealed).toMatchObject({ status: "completed", secret: expect.any(Uint8Array) });
      if (revealed.status === "completed" && revealed.secret !== undefined) {
        expect(new TextDecoder().decode(revealed.secret)).toBe("test-personal-key");
        revealed.secret.fill(0);
      }

      const deleted = await service.delete({
        ...metadata("delete_personal_model", 4),
        personalModelId: updatedHead.personalModelId,
        expectedConfigurationRevision: updatedHead.currentConfigurationRevision,
        expectedExecutionDefinitionDigest: updatedHead.currentExecutionDefinitionDigest,
      });
      expect(deleted).toMatchObject({ ok: true, value: { state: "completed" } });
      expect(await persistence.loadHead(owner, updatedHead.personalModelId))
        .toMatchObject({ selectionState: "tombstoned" });
      expect(await service.query({
        contractVersion: "personal-model-management.v1alpha2",
        type: "query_personal_model_operation",
        queryId: uuid(50), correlationId: uuid(51), clientInstanceId: uuid(52),
        commandId: uuid(4),
      })).toMatchObject({ ok: true, value: { commandType: "delete", replayed: true } });
      reveal.close();
      const resourceEvidence = {
        revealAttemptCount: reveal.resourceSnapshot().active,
        operationLeaseCount: operationGate.activeCount(),
      };
      expect(resourceEvidence).toEqual({ revealAttemptCount: 0, operationLeaseCount: 0 });
      if (process.env.DFI4A42_RESOURCE_EVIDENCE === "1") {
        process.stdout.write(`DFI4A42_RESOURCE_EVIDENCE=${JSON.stringify(resourceEvidence)}\n`);
      }
    } finally {
      await credentials.stop();
      await persistence.stop();
    }
  });
});

function createCommand() {
  return { ...metadata("create_personal_model", 1), target: target() };
}

function metadata<T extends string>(type: T, offset: number) {
  return {
    contractVersion: "personal-model-management.v1alpha2" as const,
    type,
    commandId: uuid(offset),
    correlationId: uuid(20),
    clientInstanceId: uuid(21),
    deadlineAt,
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
