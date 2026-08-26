import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  FixedPersonalCredentialReferenceUsage,
  FixedPersonalModelDeletionGuard,
  FixedPersonalModelOwnerAuthorityContextProvider,
  InMemoryPersonalCredentialStore,
  InMemoryPersonalModelPersistence,
  PersonalModelCredentialCoordinator,
  SqlitePersonalModelPersistence,
  createPersonalModelCredentialBrokerHandler,
  createPersonalModelCredentialCommand,
  derivePersonalModelOwnerIdentity,
  type PersonalModelCredentialCommandMaterial,
  type PersonalModelOwnerAuthorityContext,
  type PersonalModelOwnerIdentity,
  type PersonalModelPersistence,
  type PreparePersonalModelCredentialMutationCommand,
} from "../src/index.js";

const now = "2026-08-21T09:00:00.000Z";
const deadline = "2026-08-21T09:05:00.000Z";
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe.each(["memory", "sqlite"] as const)("DFI-4A.2.2 %s coordinator", (kind) => {
  it("commits create exactly once and never puts Secret material in durable facts", async () => {
    const harness = await createHarness(kind);
    try {
      const command = createCommand(1);
      expect(await harness.coordinator.prepare(command)).toMatchObject({
        ok: true,
        status: "prepared",
        replayed: false,
      });
      const secret = bytes("sk-test-placeholder-not-real");
      expect(await execute(harness.coordinator, command, secret)).toMatchObject({
        ok: true,
        status: "committed",
        replayed: false,
      });
      expect([...secret]).toEqual(new Array(secret.byteLength).fill(0));
      expect(await harness.coordinator.prepare(command)).toMatchObject({
        ok: true,
        status: "committed",
        replayed: true,
      });

      const owner = await ownerFor(harness);
      const operation = await harness.persistence.loadByCommand(owner, command.commandId);
      const receipt = await harness.persistence.loadReceipt(owner, command.commandId);
      const head = await harness.persistence.loadHead(owner, command.personalModelId);
      expect(operation?.operationPhase).toBe("committed");
      expect(receipt?.outcome).toBe("create_committed");
      expect(head?.selectionState).toBe("active");
      const durable = JSON.stringify({ operation, receipt, head });
      expect(durable).not.toContain("sk-test-placeholder-not-real");
      expect(durable).not.toContain("secret");
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects command identity conflict before a second external mutation", async () => {
    const harness = await createHarness(kind);
    try {
      const command = createCommand(2);
      expect(await harness.coordinator.prepare(command)).toMatchObject({ ok: true });
      const conflicting = createPersonalModelCredentialCommand({
        ...createMaterial(2),
        target: { ...createMaterial(2).target, displayName: "Conflicting name" },
      });
      expect(await harness.coordinator.prepare(conflicting)).toMatchObject({
        ok: false,
        error: { code: "personal_model.conflict" },
      });
      expect(await harness.credentials.inspect("pmcr1.definitely-not-prepared-reference-0000"))
        .toMatchObject({ state: "absent" });
    } finally {
      await harness.cleanup();
    }
  });

  it("uses inspect-only for a display-name update and carries forward compatible status", async () => {
    const harness = await createHarness(kind);
    try {
      const created = await commitCreate(harness, 3);
      const owner = await ownerFor(harness);
      const oldDefinition = await harness.persistence.loadDefinition(
        owner,
        created.personalModelId,
        created.committedConfigurationRevision!,
      );
      if (oldDefinition === undefined) throw new Error("expected definition");
      const update = createPersonalModelCredentialCommand({
        commandId: uuid(103),
        commandType: "update",
        personalModelId: created.personalModelId,
        expectedConfigurationRevision: oldDefinition.configurationRevision,
        expectedExecutionDefinitionDigest: oldDefinition.executionDefinitionDigest,
        target: {
          providerKind: oldDefinition.providerKind,
          providerProfileRevision: oldDefinition.providerProfileRevision,
          protocol: oldDefinition.protocol,
          endpoint: oldDefinition.canonicalEndpoint,
          providerModelId: oldDefinition.providerModelId,
          displayName: "Renamed personal model",
          capabilities: oldDefinition.capabilities,
        },
        credentialMutation: "reuse_existing",
        credentialInputExpected: false,
      });
      expect(await harness.coordinator.prepare(update)).toMatchObject({ ok: true, status: "prepared" });
      expect(await execute(harness.coordinator, update, new Uint8Array(0))).toMatchObject({
        ok: true,
        status: "committed",
      });
      const head = await harness.persistence.loadHead(owner, created.personalModelId);
      const next = await harness.persistence.loadDefinition(
        owner,
        created.personalModelId,
        head!.currentConfigurationRevision,
      );
      const status = await harness.persistence.loadStatus(
        owner,
        created.personalModelId,
        head!.currentConfigurationRevision,
      );
      expect(next).toMatchObject({
        displayName: "Renamed personal model",
        credentialRef: oldDefinition.credentialRef,
        credentialRevision: oldDefinition.credentialRevision,
      });
      expect(status).toMatchObject({ status: "unverified", statusOrigin: "carry_forward" });
    } finally {
      await harness.cleanup();
    }
  });

  it("requires a new Credential for an upstream boundary change", async () => {
    const harness = await createHarness(kind);
    try {
      const created = await commitCreate(harness, 4);
      const owner = await ownerFor(harness);
      const current = await harness.persistence.loadDefinition(
        owner,
        created.personalModelId,
        created.committedConfigurationRevision!,
      );
      if (current === undefined) throw new Error("expected definition");
      const update = createPersonalModelCredentialCommand({
        commandId: uuid(104),
        commandType: "update",
        personalModelId: created.personalModelId,
        expectedConfigurationRevision: current.configurationRevision,
        expectedExecutionDefinitionDigest: current.executionDefinitionDigest,
        target: {
          providerKind: current.providerKind,
          providerProfileRevision: current.providerProfileRevision,
          protocol: current.protocol,
          endpoint: "https://relay.example.com/v1",
          providerModelId: current.providerModelId,
          displayName: current.displayName,
          capabilities: current.capabilities,
        },
        credentialMutation: "reuse_existing",
        credentialInputExpected: false,
      });
      expect(await harness.coordinator.prepare(update)).toMatchObject({
        ok: false,
        error: { code: "personal_model.conflict" },
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("commits a replacement revision but conservatively retains the old Credential", async () => {
    const harness = await createHarness(kind);
    try {
      const created = await commitCreate(harness, 5);
      const owner = await ownerFor(harness);
      const current = await harness.persistence.loadDefinition(
        owner,
        created.personalModelId,
        created.committedConfigurationRevision!,
      );
      if (current === undefined) throw new Error("expected definition");
      const update = replaceCommand(current, 105);
      expect(await harness.coordinator.prepare(update)).toMatchObject({ ok: true });
      expect(await execute(harness.coordinator, update, bytes("replacement-test-key"))).toMatchObject({
        ok: true,
        status: "cleanup_pending",
      });
      expect(await harness.credentials.inspect(current.credentialRef)).toMatchObject({ state: "present" });

      harness.usage.setDecision({ status: "unused" });
      expect(await harness.coordinator.recoverOnce()).toEqual([
        expect.objectContaining({ ok: true, status: "committed" }),
      ]);
      expect(await harness.credentials.inspect(current.credentialRef)).toMatchObject({ state: "absent" });
      expect(await harness.coordinator.prepare(update)).toMatchObject({
        ok: true,
        status: "committed",
        replayed: true,
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("moves delete to delete_pending and never deletes while usage is unknown", async () => {
    const harness = await createHarness(kind);
    try {
      const created = await commitCreate(harness, 6);
      const owner = await ownerFor(harness);
      const current = await harness.persistence.loadDefinition(
        owner,
        created.personalModelId,
        created.committedConfigurationRevision!,
      );
      if (current === undefined) throw new Error("expected definition");
      const command = deleteCommand(current, 106);
      expect(await harness.coordinator.prepare(command)).toMatchObject({ ok: true, status: "prepared" });
      expect(await harness.persistence.loadHead(owner, current.personalModelId))
        .toMatchObject({ selectionState: "delete_pending" });
      expect(await execute(harness.coordinator, command, new Uint8Array(0))).toMatchObject({
        ok: false,
        error: { code: "personal_model.in_use_or_usage_unknown" },
      });
      expect(await harness.credentials.inspect(current.credentialRef)).toMatchObject({ state: "present" });

      harness.deletion.setDecision({ status: "clear" });
      expect(await execute(harness.coordinator, command, new Uint8Array(0))).toMatchObject({
        ok: true,
        status: "committed",
      });
      expect(await harness.persistence.loadHead(owner, current.personalModelId))
        .toMatchObject({ selectionState: "tombstoned" });
    } finally {
      await harness.cleanup();
    }
  });

  it("denies configure recovery under an invalid enterprise session but keeps delete sovereignty", async () => {
    const harness = await createHarness(kind);
    try {
      const committed = await commitCreate(harness, 9);
      const owner = await ownerFor(harness);
      const current = await harness.persistence.loadDefinition(
        owner,
        committed.personalModelId,
        committed.committedConfigurationRevision!,
      );
      if (current === undefined) throw new Error("expected definition");
      const create = createCommand(7);
      expect(await harness.coordinator.prepare(create)).toMatchObject({ ok: true });
      harness.authority.setContext(authority("enterprise_session_invalid"));
      expect(await harness.coordinator.recoverOnce()).toMatchObject([
        { ok: false, error: { code: "personal_model.permission_denied" } },
      ]);
      const second = createCommand(8);
      expect(await harness.coordinator.prepare(second)).toMatchObject({
        ok: false,
        error: { code: "personal_model.permission_denied" },
      });
      const deletion = deleteCommand(current, 109);
      harness.deletion.setDecision({ status: "clear" });
      expect(await harness.coordinator.prepare(deletion)).toMatchObject({ ok: true });
      expect(await execute(harness.coordinator, deletion, new Uint8Array(0))).toMatchObject({
        ok: true,
        status: "committed",
      });
    } finally {
      await harness.cleanup();
    }
  });
});

describe("DFI-4A.2.2 durable recovery and broker mapping", () => {
  it("recovers matching Keychain state after SQLite close/reopen", async () => {
    const harness = await createHarness("sqlite");
    try {
      const command = createCommand(20);
      expect(await harness.coordinator.prepare(command)).toMatchObject({ ok: true });
      const owner = await ownerFor(harness);
      const operation = await harness.persistence.loadByCommand(owner, command.commandId);
      if (operation?.targetCredentialRef === undefined) throw new Error("expected target ref");
      expect(await harness.credentials.store(
        command.commandId,
        operation.targetCredentialRef,
        bytes("crash-window-key"),
      )).toMatchObject({ ok: true });

      await harness.persistence.stop();
      const reopened = new SqlitePersonalModelPersistence({
        databasePath: harness.databasePath!,
        clock: harness.clock,
      });
      await reopened.start();
      harness.persistence = reopened;
      harness.coordinator = coordinatorFor(harness);
      expect(await harness.coordinator.recoverOnce()).toEqual([
        expect.objectContaining({ ok: true, status: "committed" }),
      ]);
      expect(await reopened.loadReceipt(owner, command.commandId))
        .toMatchObject({ outcome: "create_committed" });
    } finally {
      await harness.cleanup();
    }
  });

  it("marks an absent post-intent create as durable manual attention", async () => {
    const harness = await createHarness("sqlite");
    try {
      const command = createCommand(21);
      expect(await harness.coordinator.prepare(command)).toMatchObject({ ok: true });
      expect(await harness.coordinator.recoverOnce()).toEqual([
        expect.objectContaining({ ok: true, status: "manual_attention" }),
      ]);
      expect(await harness.coordinator.recoverOnce()).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  it("maps only durable prepared mutations through the private broker adapter", async () => {
    const harness = await createHarness("memory");
    try {
      const handler = createPersonalModelCredentialBrokerHandler(harness.coordinator);
      const command = createCommand(22);
      const unpreparedSecret = bytes("unprepared-test-key");
      expect(await handler(headerFor(command), unpreparedSecret)).toEqual({
        status: "rejected",
        typedErrorCode: "credential_transport_invalid_request",
      });
      expect([...unpreparedSecret]).toEqual(new Array(unpreparedSecret.byteLength).fill(0));

      expect(await harness.coordinator.prepare(command)).toMatchObject({ ok: true });
      const preparedSecret = bytes("prepared-test-key");
      expect(await handler(headerFor(command), preparedSecret)).toEqual({ status: "completed" });
      expect([...preparedSecret]).toEqual(new Array(preparedSecret.byteLength).fill(0));
    } finally {
      await harness.cleanup();
    }
  });
});

type Harness = {
  persistence: PersonalModelPersistence;
  credentials: InMemoryPersonalCredentialStore;
  authority: FixedPersonalModelOwnerAuthorityContextProvider;
  deletion: FixedPersonalModelDeletionGuard;
  usage: FixedPersonalCredentialReferenceUsage;
  clock: FakeClock;
  coordinator: PersonalModelCredentialCoordinator;
  databasePath?: string;
  cleanup: () => Promise<void>;
};

async function createHarness(kind: "memory" | "sqlite"): Promise<Harness> {
  const clock = new FakeClock(now);
  const directory = kind === "sqlite"
    ? await mkdtemp(join(tmpdir(), "robothree-dfi4a22-"))
    : undefined;
  const databasePath = directory === undefined ? undefined : join(directory, "core.sqlite");
  const persistence: PersonalModelPersistence = kind === "memory"
    ? new InMemoryPersonalModelPersistence()
    : new SqlitePersonalModelPersistence({ databasePath: databasePath!, clock });
  const credentials = new InMemoryPersonalCredentialStore();
  const authorityProvider = new FixedPersonalModelOwnerAuthorityContextProvider(authority("online"));
  const deletion = new FixedPersonalModelDeletionGuard({
    status: "unknown",
    reasonCode: "personal_model.usage_unknown",
  });
  const usage = new FixedPersonalCredentialReferenceUsage({
    status: "unknown",
    reasonCode: "personal_model.usage_unknown",
  });
  await persistence.start();
  await credentials.start();
  const harness = {
    persistence,
    credentials,
    authority: authorityProvider,
    deletion,
    usage,
    clock,
    coordinator: undefined as unknown as PersonalModelCredentialCoordinator,
    ...(databasePath === undefined ? {} : { databasePath }),
    cleanup: async () => {
      await harness.persistence.stop();
      await credentials.stop();
      if (directory !== undefined) await rm(directory, { recursive: true, force: true });
    },
  } satisfies Harness;
  harness.coordinator = coordinatorFor(harness);
  return harness;
}

function coordinatorFor(harness: Omit<Harness, "coordinator" | "cleanup">): PersonalModelCredentialCoordinator {
  return new PersonalModelCredentialCoordinator({
    persistence: harness.persistence,
    credentials: harness.credentials,
    authorityContexts: harness.authority,
    deletionGuard: harness.deletion,
    credentialUsage: harness.usage,
    clock: harness.clock,
  });
}

async function ownerFor(harness: Harness): Promise<PersonalModelOwnerIdentity> {
  const namespace = await harness.persistence.loadActiveOwnerNamespace();
  if (namespace === undefined) throw new Error("expected owner namespace");
  try {
    return derivePersonalModelOwnerIdentity(namespace, authority("online"));
  } finally {
    namespace.namespaceKey.fill(0);
  }
}

function authority(
  offlineState: PersonalModelOwnerAuthorityContext["offlineState"],
): PersonalModelOwnerAuthorityContext {
  return {
    enterpriseId: "enterprise.one",
    userId: "user.one",
    deviceId: "device.one",
    entitlementGranted: true,
    entitlementRevision: digest("e"),
    offlineState,
  };
}

function createCommand(offset: number): PreparePersonalModelCredentialMutationCommand {
  return createPersonalModelCredentialCommand(createMaterial(offset));
}

function createMaterial(offset: number): Extract<
  PersonalModelCredentialCommandMaterial,
  { commandType: "create" }
> {
  return {
    commandId: uuid(offset),
    commandType: "create",
    personalModelId: `model.personal.test-${offset}`,
    target: {
      providerKind: "deepseek",
      providerProfileRevision: digest("a"),
      protocol: "openai_compatible",
      endpoint: `https://api${offset}.example.com/v1`,
      providerModelId: `deepseek-test-${offset}`,
      displayName: `Personal Model ${offset}`,
      capabilities: ["streaming", "text"],
    },
    credentialInputExpected: true,
  };
}

function replaceCommand(
  current: Awaited<ReturnType<PersonalModelPersistence["loadDefinition"]>> & {},
  offset: number,
): PreparePersonalModelCredentialMutationCommand {
  return createPersonalModelCredentialCommand({
    commandId: uuid(offset),
    commandType: "update",
    personalModelId: current.personalModelId,
    expectedConfigurationRevision: current.configurationRevision,
    expectedExecutionDefinitionDigest: current.executionDefinitionDigest,
    target: {
      providerKind: current.providerKind,
      providerProfileRevision: current.providerProfileRevision,
      protocol: current.protocol,
      endpoint: current.canonicalEndpoint,
      providerModelId: current.providerModelId,
      displayName: current.displayName,
      capabilities: current.capabilities,
    },
    credentialMutation: "replace_secret",
    credentialInputExpected: true,
  });
}

function deleteCommand(
  current: Awaited<ReturnType<PersonalModelPersistence["loadDefinition"]>> & {},
  offset: number,
): PreparePersonalModelCredentialMutationCommand {
  return createPersonalModelCredentialCommand({
    commandId: uuid(offset),
    commandType: "delete",
    personalModelId: current.personalModelId,
    expectedConfigurationRevision: current.configurationRevision,
    expectedExecutionDefinitionDigest: current.executionDefinitionDigest,
    credentialInputExpected: false,
  });
}

async function commitCreate(harness: Harness, offset: number) {
  const command = createCommand(offset);
  expect(await harness.coordinator.prepare(command)).toMatchObject({ ok: true });
  const result = await execute(harness.coordinator, command, bytes(`test-key-${offset}`));
  expect(result).toMatchObject({ ok: true, status: "committed" });
  if (!result.ok) throw new Error("expected committed create");
  return result;
}

function execute(
  coordinator: PersonalModelCredentialCoordinator,
  command: PreparePersonalModelCredentialMutationCommand,
  secret: Uint8Array,
) {
  return coordinator.executePrepared({
    commandId: command.commandId,
    commandType: command.commandType,
    personalModelId: command.personalModelId,
    ...(command.commandType === "create"
      ? {}
      : { expectedConfigurationRevision: command.expectedConfigurationRevision }),
    requestDigest: command.requestDigest,
    deadlineAt: deadline,
    secret,
  });
}

function headerFor(command: Extract<
  PreparePersonalModelCredentialMutationCommand,
  { commandType: "create" }
>) {
  return {
    protocolVersion: "personal-credential-broker.v1" as const,
    channelInstanceId: uuid(900),
    commandId: command.commandId,
    commandType: command.commandType,
    transportRequestId: uuid(901),
    clientInstanceId: uuid(902),
    personalModelId: command.personalModelId,
    commandRequestDigest: command.requestDigest,
    deadlineAt: deadline,
    secretByteLength: 17,
  };
}

function uuid(offset: number): string {
  return `00000000-0000-4000-8000-${offset.toString().padStart(12, "0")}`;
}

function bytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "utf8"));
}
