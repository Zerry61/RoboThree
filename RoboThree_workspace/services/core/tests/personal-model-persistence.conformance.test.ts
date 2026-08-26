import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryPersonalCredentialStore,
  InMemoryPersonalModelPersistence,
  PersonalModelRuntimeRegistry,
  SqlitePersonalModelPersistence,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  createPersonalModelCommandReceipt,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOperation,
  createPersonalModelOwnerNamespace,
  createPersonalModelPreference,
  createPersonalModelStatusFact,
  derivePersonalModelOwnerIdentity,
} from "../src/index.js";
import type {
  PersonalModelCommandReceipt,
  PersonalModelDefinition,
  PersonalModelHead,
  PersonalModelOperation,
  PersonalModelOwnerIdentity,
  PersonalModelPersistence,
  PersonalModelStatusFact,
} from "../src/index.js";

const at = "2026-08-21T01:00:00.000Z";
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe.each(["memory", "sqlite"] as const)("DFI-4A.1 %s persistence", (kind) => {
  it("atomically commits and replays an exact create outcome", async () => {
    const harness = await createHarness(kind);
    try {
      const fixture = await createCommittedModel(harness.persistence);
      expect(await harness.persistence.loadDefinition(
        fixture.owner,
        fixture.definition.personalModelId,
        fixture.definition.configurationRevision,
      )).toEqual(fixture.definition);
      expect(await harness.persistence.loadHead(fixture.owner, fixture.definition.personalModelId))
        .toEqual(fixture.head);
      expect(await harness.persistence.loadStatus(
        fixture.owner,
        fixture.definition.personalModelId,
        fixture.definition.configurationRevision,
      )).toEqual(fixture.status);
      expect(await harness.persistence.commitCreateOutcome(fixture.commitInput))
        .toMatchObject({ ok: true, replayed: true, value: fixture.receipt });
      expect(await harness.persistence.listActiveHeads(fixture.owner, undefined, 100))
        .toMatchObject({ ok: true, value: { heads: [fixture.head] } });

      const runtime = new PersonalModelRuntimeRegistry(harness.persistence);
      expect(await runtime.resolve({
        ownerIdentity: fixture.owner,
        personalModelId: fixture.definition.personalModelId,
        configurationRevision: fixture.definition.configurationRevision,
        executionDefinitionDigest: fixture.definition.executionDefinitionDigest,
      })).toMatchObject({ authority: "local_personal", definition: fixture.definition });
    } finally {
      await harness.cleanup();
    }
  });

  it("binds opaque cursors to the exact active head set", async () => {
    const harness = await createHarness(kind);
    try {
      const first = await createCommittedModel(harness.persistence, 10, "model.personal.one");
      await createCommittedModel(harness.persistence, 20, "model.personal.two");
      const page = await harness.persistence.listActiveHeads(first.owner, undefined, 1);
      expect(page).toMatchObject({ ok: true, value: { heads: [{ personalModelId: "model.personal.one" }] } });
      if (!page.ok || page.value.nextCursor === undefined) throw new Error("expected cursor");
      const secondPage = await harness.persistence.listActiveHeads(first.owner, page.value.nextCursor, 1);
      expect(secondPage).toMatchObject({ ok: true, value: { heads: [{ personalModelId: "model.personal.two" }] } });
      await createCommittedModel(harness.persistence, 30, "model.personal.three");
      expect(await harness.persistence.listActiveHeads(first.owner, page.value.nextCursor, 1))
        .toMatchObject({ ok: false, error: { code: "personal_model.stale_cursor" } });
    } finally {
      await harness.cleanup();
    }
  });

  it("makes delete intent immediately non-selectable and tombstones only after absent proof", async () => {
    const harness = await createHarness(kind);
    try {
      const fixture = await createCommittedModel(harness.persistence);
      const commandId = uuid(70);
      const requestDigest = digest("7");
      const intent = createPersonalModelOperation({
        ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
        ownerScopeDigest: fixture.owner.ownerScopeDigest,
        commandId,
        operationType: "delete",
        requestDigest,
        targetModelId: fixture.definition.personalModelId,
        expectedConfigurationRevision: fixture.definition.configurationRevision,
        expectedExecutionDefinitionDigest: fixture.definition.executionDefinitionDigest,
        previousCredentialRef: fixture.definition.credentialRef,
        operationPhase: "intent_committed",
        phaseRevision: 1,
        createdAt: at,
        updatedAt: at,
      });
      expect(await harness.persistence.beginCredentialOperation(intent)).toMatchObject({ ok: true });
      expect(await harness.persistence.listActiveHeads(fixture.owner, undefined, 100))
        .toMatchObject({ ok: true, value: { heads: [] } });
      const pendingHead = await harness.persistence.loadHead(fixture.owner, fixture.definition.personalModelId);
      expect(pendingHead?.selectionState).toBe("delete_pending");
      const observation = { state: "absent", credentialRef: fixture.definition.credentialRef } as const;
      const observed = createPersonalModelOperation({
        ...withoutOperationDigests(intent),
        operationPhase: "credential_step_observed",
        phaseRevision: 2,
        credentialObservation: observation,
      });
      expect(await harness.persistence.advanceCredentialObservation({
        ownerIdentity: fixture.owner,
        commandId,
        expectedPhase: "intent_committed",
        operation: observed,
      })).toMatchObject({ ok: true });
      const committedOperation = createPersonalModelOperation({
        ...withoutOperationDigests(observed),
        operationPhase: "committed",
        phaseRevision: 3,
      });
      const tombstone = createPersonalModelHead({
        ...withoutHeadDigest(pendingHead!),
        selectionState: "tombstoned",
        headRevision: pendingHead!.headRevision + 1,
      });
      const receipt = createPersonalModelCommandReceipt({
        ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
        ownerScopeDigest: fixture.owner.ownerScopeDigest,
        commandId,
        commandType: "delete",
        requestDigest,
        modelId: fixture.definition.personalModelId,
        outcome: "delete_committed",
        committedAt: at,
      });
      expect(await harness.persistence.commitDeleteOutcome({
        operation: committedOperation,
        head: tombstone,
        expectedHeadRevision: pendingHead!.headRevision,
        receipt,
      })).toMatchObject({ ok: true });
      expect((await harness.persistence.loadHead(fixture.owner, fixture.definition.personalModelId))?.selectionState)
        .toBe("tombstoned");
    } finally {
      await harness.cleanup();
    }
  });

  it("creates an immutable display-name revision and carries status from exact provenance", async () => {
    const harness = await createHarness(kind);
    try {
      const fixture = await createCommittedModel(harness.persistence);
      const commandId = uuid(60);
      const target = createPersonalModelDefinition({
        ownerIdentity: fixture.owner,
        personalModelId: fixture.definition.personalModelId,
        providerKind: fixture.definition.providerKind,
        providerProfileRevision: fixture.definition.providerProfileRevision,
        protocol: fixture.definition.protocol,
        endpoint: fixture.definition.canonicalEndpoint,
        providerModelId: fixture.definition.providerModelId,
        displayName: "Renamed Personal Model",
        capabilities: fixture.definition.capabilities,
        credentialRef: fixture.definition.credentialRef,
        credentialRevision: fixture.definition.credentialRevision,
        credentialBindingDigest: fixture.definition.credentialBindingDigest,
        createdAt: "2026-08-21T01:01:00.000Z",
      });
      expect(target.executionDefinitionDigest).toBe(fixture.definition.executionDefinitionDigest);
      expect(target.configurationRevision).not.toBe(fixture.definition.configurationRevision);
      const requestDigest = digest("6");
      const intent = createPersonalModelOperation({
        ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
        ownerScopeDigest: fixture.owner.ownerScopeDigest,
        commandId,
        operationType: "update",
        requestDigest,
        targetModelId: target.personalModelId,
        expectedConfigurationRevision: fixture.definition.configurationRevision,
        expectedExecutionDefinitionDigest: fixture.definition.executionDefinitionDigest,
        targetConfigurationRevision: target.configurationRevision,
        targetExecutionDefinitionDigest: target.executionDefinitionDigest,
        targetCredentialRef: target.credentialRef,
        targetDefinition: target,
        operationPhase: "intent_committed",
        phaseRevision: 1,
        createdAt: target.createdAt,
        updatedAt: target.createdAt,
      });
      expect(await harness.persistence.beginCredentialOperation(intent)).toMatchObject({ ok: true });
      const observation = fixture.commitInput.operation.credentialObservation!;
      const observed = createPersonalModelOperation({
        ...withoutOperationDigests(intent),
        operationPhase: "credential_step_observed",
        phaseRevision: 2,
        credentialObservation: observation,
      });
      expect(await harness.persistence.advanceCredentialObservation({
        ownerIdentity: fixture.owner,
        commandId,
        expectedPhase: "intent_committed",
        operation: observed,
      })).toMatchObject({ ok: true });
      const operation = createPersonalModelOperation({
        ...withoutOperationDigests(observed),
        operationPhase: "committed",
        phaseRevision: 3,
      });
      const head = createPersonalModelHead({
        ...withoutHeadDigest(fixture.head),
        currentConfigurationRevision: target.configurationRevision,
        currentExecutionDefinitionDigest: target.executionDefinitionDigest,
        headRevision: 2,
        updatedAt: target.createdAt,
      });
      const status = createPersonalModelStatusFact({
        ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
        ownerScopeDigest: fixture.owner.ownerScopeDigest,
        personalModelId: target.personalModelId,
        configurationRevision: target.configurationRevision,
        executionDefinitionDigest: target.executionDefinitionDigest,
        statusRevision: 1,
        status: fixture.status.status,
        statusOrigin: "carry_forward",
        carriedFromConfigurationRevision: fixture.status.configurationRevision,
        carriedFromStatusRevision: fixture.status.statusRevision,
        carriedFromStatusRecordDigest: fixture.status.recordDigest,
        updatedAt: target.createdAt,
      });
      const receipt = createPersonalModelCommandReceipt({
        ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
        ownerScopeDigest: fixture.owner.ownerScopeDigest,
        commandId,
        commandType: "update",
        requestDigest,
        modelId: target.personalModelId,
        committedConfigurationRevision: target.configurationRevision,
        outcome: "update_committed",
        committedAt: target.createdAt,
      });
      expect(await harness.persistence.commitUpdateOutcome({
        operation,
        definition: target,
        head,
        status,
        receipt,
        expectedHeadRevision: 1,
      })).toMatchObject({ ok: true });
      expect(await harness.persistence.loadDefinition(
        fixture.owner,
        fixture.definition.personalModelId,
        fixture.definition.configurationRevision,
      )).toEqual(fixture.definition);
      expect(await harness.persistence.loadStatus(
        fixture.owner,
        target.personalModelId,
        target.configurationRevision,
      )).toEqual(status);
    } finally {
      await harness.cleanup();
    }
  });

  it("appends status facts and commits an exact personal preference with CAS", async () => {
    const harness = await createHarness(kind);
    try {
      const fixture = await createCommittedModel(harness.persistence);
      const status = createPersonalModelStatusFact({
        ...withoutStatusDigest(fixture.status),
        statusRevision: 2,
        status: "available",
        statusOrigin: "provider_observation",
        updatedAt: "2026-08-21T01:02:00.000Z",
      });
      const statusReceipt = createPersonalModelCommandReceipt({
        ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
        ownerScopeDigest: fixture.owner.ownerScopeDigest,
        commandId: uuid(80),
        commandType: "status",
        requestDigest: digest("8"),
        modelId: fixture.definition.personalModelId,
        committedConfigurationRevision: fixture.definition.configurationRevision,
        outcome: "status_committed",
        committedAt: status.updatedAt,
      });
      expect(await harness.persistence.commitStatusOutcome({
        status,
        expectedStatusRevision: 1,
        receipt: statusReceipt,
      })).toMatchObject({ ok: true });
      const preference = createPersonalModelPreference({
        ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
        ownerScopeDigest: fixture.owner.ownerScopeDigest,
        modelSource: "personal",
        modelId: fixture.definition.personalModelId,
        configurationRevision: fixture.definition.configurationRevision,
        preferenceRevision: 1,
        updatedAt: "2026-08-21T01:03:00.000Z",
      });
      const preferenceReceipt = createPersonalModelCommandReceipt({
        ownerScopeNamespaceRevision: fixture.owner.ownerScopeNamespaceRevision,
        ownerScopeDigest: fixture.owner.ownerScopeDigest,
        commandId: uuid(81),
        commandType: "preference",
        requestDigest: digest("9"),
        outcome: "preference_committed",
        committedAt: preference.updatedAt,
      });
      expect(await harness.persistence.commitPreferenceOutcome({
        preference,
        expectedPreferenceRevision: 0,
        receipt: preferenceReceipt,
      })).toMatchObject({ ok: true });
      expect(await harness.persistence.loadStatus(
        fixture.owner,
        fixture.definition.personalModelId,
        fixture.definition.configurationRevision,
      )).toEqual(status);
      expect(await harness.persistence.loadPreference(fixture.owner)).toEqual(preference);
      expect(await harness.persistence.commitPreferenceOutcome({
        preference,
        expectedPreferenceRevision: 0,
        receipt: createPersonalModelCommandReceipt({
          ...withoutReceiptDigest(preferenceReceipt),
          commandId: uuid(82),
          requestDigest: digest("a"),
        }),
      })).toMatchObject({ ok: false, error: { code: "personal_model.conflict" } });
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects a valid receipt shape from the wrong command family without committing facts", async () => {
    const harness = await createHarness(kind);
    try {
      const prepared = await prepareCreate(harness.persistence, 50, "model.personal.receipt-family");
      expect(await harness.persistence.beginCredentialOperation(prepared.intent)).toMatchObject({ ok: true });
      expect(await harness.persistence.advanceCredentialObservation({
        ownerIdentity: prepared.owner,
        commandId: prepared.intent.commandId,
        expectedPhase: "intent_committed",
        operation: prepared.observed,
      })).toMatchObject({ ok: true });
      const wrongReceipt = createPersonalModelCommandReceipt({
        ...withoutReceiptDigest(prepared.receipt),
        commandType: "update",
        outcome: "update_committed",
      });
      expect(await harness.persistence.commitCreateOutcome({
        ...prepared.commitInput,
        receipt: wrongReceipt,
      })).toMatchObject({ ok: false });
      expect(await harness.persistence.loadHead(prepared.owner, prepared.definition.personalModelId))
        .toBeUndefined();
      expect(await harness.persistence.commitCreateOutcome(prepared.commitInput))
        .toMatchObject({ ok: true, replayed: false });
    } finally {
      await harness.cleanup();
    }
  });
});

it("restores namespace and exact model revision after SQLite close/reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a1-reopen-"));
  const databasePath = join(directory, "core.sqlite");
  const clock = new FakeClock(at);
  try {
    const first = new SqlitePersonalModelPersistence({ databasePath, clock });
    await first.start();
    const fixture = await createCommittedModel(first);
    const namespace = await first.loadActiveOwnerNamespace();
    await first.stop();
    const second = new SqlitePersonalModelPersistence({ databasePath, clock });
    await second.start();
    expect(await second.loadActiveOwnerNamespace()).toEqual(namespace);
    expect(await second.loadDefinition(
      fixture.owner,
      fixture.definition.personalModelId,
      fixture.definition.configurationRevision,
    )).toEqual(fixture.definition);
    await second.stop();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("fails closed when immutable SQLite indexed facts drift from record material", async () => {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a1-integrity-"));
  const databasePath = join(directory, "core.sqlite");
  const clock = new FakeClock(at);
  try {
    const initial = new SqlitePersonalModelPersistence({ databasePath, clock });
    await initial.start();
    const fixture = await createCommittedModel(initial);
    await initial.stop();

    const checks = [
      {
        mutate: "UPDATE personal_model_definitions SET display_name = 'tampered'",
        restore: `UPDATE personal_model_definitions SET display_name = '${fixture.definition.displayName}'`,
        load: (persistence: SqlitePersonalModelPersistence) => persistence.loadDefinition(
          fixture.owner,
          fixture.definition.personalModelId,
          fixture.definition.configurationRevision,
        ),
        column: "display_name",
      },
      {
        mutate: "UPDATE personal_model_heads SET updated_at = '2026-08-21T09:00:00.000Z'",
        restore: `UPDATE personal_model_heads SET updated_at = '${fixture.head.updatedAt}'`,
        load: (persistence: SqlitePersonalModelPersistence) => persistence.loadHead(
          fixture.owner,
          fixture.definition.personalModelId,
        ),
        column: "updated_at",
      },
      {
        mutate: "UPDATE personal_model_status_facts SET detail_code = 'provider.tampered'",
        restore: "UPDATE personal_model_status_facts SET detail_code = NULL",
        load: (persistence: SqlitePersonalModelPersistence) => persistence.loadStatus(
          fixture.owner,
          fixture.definition.personalModelId,
          fixture.definition.configurationRevision,
        ),
        column: "detail_code",
      },
      {
        mutate: "UPDATE personal_model_command_receipts SET committed_at = '2026-08-21T09:00:00.000Z'",
        restore: `UPDATE personal_model_command_receipts SET committed_at = '${fixture.receipt.committedAt}'`,
        load: (persistence: SqlitePersonalModelPersistence) => persistence.loadReceipt(
          fixture.owner,
          fixture.receipt.commandId,
        ),
        column: "committed_at",
      },
    ] as const;

    for (const check of checks) {
      const mutation = new DatabaseSync(databasePath);
      mutation.exec(check.mutate);
      mutation.close();
      const reopened = new SqlitePersonalModelPersistence({ databasePath, clock });
      await reopened.start();
      await expect(check.load(reopened)).rejects.toThrow(
        `indexed column ${check.column} does not match record material`,
      );
      await reopened.stop();
      const restoration = new DatabaseSync(databasePath);
      restoration.exec(check.restore);
      restoration.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("keeps Fake Credential bytes private and binds repeated operations", async () => {
  const store = new InMemoryPersonalCredentialStore();
  await store.start();
  const ref = allocatePersonalCredentialReference(Buffer.alloc(32, 9));
  const secret = new TextEncoder().encode("test-only-not-a-real-key");
  const first = await store.store(uuid(90), ref, secret);
  expect(first).toMatchObject({ ok: true, replayed: false, value: { state: "present", credentialRef: ref } });
  expect(await store.store(uuid(90), ref, Uint8Array.from(secret)))
    .toMatchObject({ ok: true, replayed: true });
  expect(await store.store(uuid(90), ref, new TextEncoder().encode("another-secret")))
    .toMatchObject({ ok: false, error: { code: "credential_input_already_bound" } });
  expect(await store.resolve(ref)).toMatchObject({ ok: true });
  store.makeNextDeleteUncertain();
  expect(await store.delete(uuid(91), ref)).toMatchObject({
    ok: false,
    error: { code: "credential_delete_uncertain" },
  });
  expect(await store.inspect(ref)).toMatchObject({ state: "present", credentialRef: ref });
  expect(await store.delete(uuid(91), ref)).toMatchObject({ ok: true, value: { state: "absent" } });
  await store.stop();
});

it("recovers C2 absent intent as manual attention after SQLite reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a1-c2-"));
  const databasePath = join(directory, "core.sqlite");
  const clock = new FakeClock(at);
  try {
    const first = new SqlitePersonalModelPersistence({ databasePath, clock });
    await first.start();
    const prepared = await prepareCreate(first, 101, "model.personal.c2");
    expect(await first.beginCredentialOperation(prepared.intent)).toMatchObject({ ok: true });
    await first.stop();

    const second = new SqlitePersonalModelPersistence({ databasePath, clock });
    await second.start();
    expect((await second.loadPending(prepared.owner, 10))[0]).toEqual(prepared.intent);
    const manual = createPersonalModelOperation({
      ...withoutOperationDigests(prepared.intent),
      operationPhase: "manual_attention",
      phaseRevision: 2,
      recoveryErrorCode: "personal_model.credential_absent_after_intent",
      recoveryErrorDigest: digest("c"),
    });
    const receipt = createPersonalModelCommandReceipt({
      ownerScopeNamespaceRevision: prepared.owner.ownerScopeNamespaceRevision,
      ownerScopeDigest: prepared.owner.ownerScopeDigest,
      commandId: prepared.intent.commandId,
      commandType: "create",
      requestDigest: prepared.intent.requestDigest,
      outcome: "manual_attention",
      committedAt: at,
    });
    expect(await second.markOperationManualAttention({ operation: manual, receipt }))
      .toMatchObject({ ok: true });
    expect(await second.loadHead(prepared.owner, prepared.definition.personalModelId)).toBeUndefined();
    expect(await second.loadReceipt(prepared.owner, prepared.intent.commandId)).toEqual(receipt);
    await second.stop();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("rolls back Transaction B before commit and replays after response loss", async () => {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a1-c4-"));
  const databasePath = join(directory, "core.sqlite");
  const clock = new FakeClock(at);
  let fault: "before" | "after" | undefined = "before";
  const create = () => new SqlitePersonalModelPersistence({
    databasePath,
    clock,
    faultInjector: (point) => {
      if ((fault === "before" && point === "personal_model.outcome.before_commit")
        || (fault === "after" && point === "personal_model.outcome.after_commit_before_response")) {
        throw new Error(`injected-${fault}`);
      }
    },
  });
  try {
    const first = create();
    await first.start();
    const prepared = await prepareCreate(first, 102, "model.personal.c4");
    expect(await first.beginCredentialOperation(prepared.intent)).toMatchObject({ ok: true });
    expect(await first.advanceCredentialObservation({
      ownerIdentity: prepared.owner,
      commandId: prepared.intent.commandId,
      expectedPhase: "intent_committed",
      operation: prepared.observed,
    })).toMatchObject({ ok: true });
    await expect(first.commitCreateOutcome(prepared.commitInput)).rejects.toThrow("injected-before");
    expect(await first.loadHead(prepared.owner, prepared.definition.personalModelId)).toBeUndefined();
    expect(await first.loadReceipt(prepared.owner, prepared.intent.commandId)).toBeUndefined();

    fault = "after";
    await expect(first.commitCreateOutcome(prepared.commitInput)).rejects.toThrow("injected-after");
    await first.stop();
    fault = undefined;
    const second = create();
    await second.start();
    expect(await second.loadReceipt(prepared.owner, prepared.intent.commandId)).toEqual(prepared.receipt);
    expect(await second.commitCreateOutcome(prepared.commitInput))
      .toMatchObject({ ok: true, replayed: true });
    await second.stop();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("fails C3 closed when inspect binding metadata does not match the target definition", async () => {
  const harness = await createHarness("sqlite");
  try {
    const prepared = await prepareCreate(harness.persistence, 103, "model.personal.c3");
    expect(await harness.persistence.beginCredentialOperation(prepared.intent)).toMatchObject({ ok: true });
    const mismatch = createPersonalModelOperation({
      ...withoutOperationDigests(prepared.intent),
      operationPhase: "credential_step_observed",
      phaseRevision: 2,
      credentialObservation: {
        ...prepared.observation,
        credentialRevision: 2,
        credentialBindingDigest: calculateCredentialBindingDigest({
          credentialRef: prepared.observation.credentialRef,
          createdByOperationId: prepared.observation.createdByOperationId,
          credentialRevision: 2,
        }),
      },
    });
    expect(await harness.persistence.advanceCredentialObservation({
      ownerIdentity: prepared.owner,
      commandId: prepared.intent.commandId,
      expectedPhase: "intent_committed",
      operation: mismatch,
    })).toMatchObject({ ok: true });
    const committedMismatch = createPersonalModelOperation({
      ...withoutOperationDigests(mismatch),
      operationPhase: "committed",
      phaseRevision: 3,
    });
    expect(await harness.persistence.commitCreateOutcome({
      ...prepared.commitInput,
      operation: committedMismatch,
    })).toMatchObject({
      ok: false,
      error: { code: "personal_model.credential_binding_conflict" },
    });
  } finally {
    await harness.cleanup();
  }
});

async function createHarness(kind: "memory" | "sqlite"): Promise<{
  persistence: PersonalModelPersistence;
  cleanup: () => Promise<void>;
}> {
  if (kind === "memory") {
    const persistence = new InMemoryPersonalModelPersistence();
    await persistence.start();
    return { persistence, cleanup: () => persistence.stop() };
  }
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a1-"));
  const persistence = new SqlitePersonalModelPersistence({
    databasePath: join(directory, "core.sqlite"),
    clock: new FakeClock(at),
  });
  await persistence.start();
  return {
    persistence,
    cleanup: async () => {
      await persistence.stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function createCommittedModel(
  persistence: PersonalModelPersistence,
  offset = 1,
  modelId = "model.personal.deepseek",
): Promise<{
  owner: PersonalModelOwnerIdentity;
  definition: PersonalModelDefinition;
  head: PersonalModelHead;
  status: PersonalModelStatusFact;
  receipt: PersonalModelCommandReceipt;
  commitInput: {
    operation: PersonalModelOperation;
    definition: PersonalModelDefinition;
    head: PersonalModelHead;
    status: PersonalModelStatusFact;
    receipt: PersonalModelCommandReceipt;
  };
}> {
  const prepared = await prepareCreate(persistence, offset, modelId);
  expect(await persistence.beginCredentialOperation(prepared.intent)).toMatchObject({ ok: true });
  expect(await persistence.advanceCredentialObservation({
    ownerIdentity: prepared.owner,
    commandId: prepared.intent.commandId,
    expectedPhase: "intent_committed",
    operation: prepared.observed,
  })).toMatchObject({ ok: true });
  expect(await persistence.commitCreateOutcome(prepared.commitInput))
    .toMatchObject({ ok: true, replayed: false });
  return {
    owner: prepared.owner,
    definition: prepared.definition,
    head: prepared.head,
    status: prepared.status,
    receipt: prepared.receipt,
    commitInput: prepared.commitInput,
  };
}

async function prepareCreate(
  persistence: PersonalModelPersistence,
  offset: number,
  modelId: string,
) {
  let namespace = await persistence.loadActiveOwnerNamespace();
  if (namespace === undefined) {
    namespace = createPersonalModelOwnerNamespace({
      namespaceRevision: 1,
      namespaceKey: Buffer.alloc(32, 5),
      createdAt: at,
    });
    expect(await persistence.initializeOwnerNamespace(namespace)).toMatchObject({ ok: true });
  }
  const owner = derivePersonalModelOwnerIdentity(namespace, {
    enterpriseId: "enterprise.one",
    userId: "user.one",
    deviceId: "device.one",
  });
  const commandId = uuid(offset);
  const credentialRef = allocatePersonalCredentialReference(Buffer.alloc(32, offset));
  const credentialBindingDigest = calculateCredentialBindingDigest({
    credentialRef,
    createdByOperationId: commandId,
    credentialRevision: 1,
  });
  const definition = createPersonalModelDefinition({
    ownerIdentity: owner,
    personalModelId: modelId,
    providerKind: "deepseek",
    providerProfileRevision: digest("a"),
    protocol: "openai_compatible",
    endpoint: `https://api${offset}.example.com/v1`,
    providerModelId: `deepseek-${offset}`,
    displayName: `Personal ${offset}`,
    capabilities: ["streaming", "text"],
    credentialRef,
    credentialRevision: 1,
    credentialBindingDigest,
    createdAt: new Date(Date.parse(at) + offset).toISOString(),
  });
  const requestDigest = digest(String(offset % 10));
  const intent = createPersonalModelOperation({
    ownerScopeNamespaceRevision: owner.ownerScopeNamespaceRevision,
    ownerScopeDigest: owner.ownerScopeDigest,
    commandId,
    operationType: "create",
    requestDigest,
    targetModelId: modelId,
    targetConfigurationRevision: definition.configurationRevision,
    targetExecutionDefinitionDigest: definition.executionDefinitionDigest,
    targetCredentialRef: credentialRef,
    targetDefinition: definition,
    operationPhase: "intent_committed",
    phaseRevision: 1,
    createdAt: definition.createdAt,
    updatedAt: definition.createdAt,
  });
  const observation = {
    state: "present",
    credentialRef,
    createdByOperationId: commandId,
    credentialRevision: 1,
    credentialBindingDigest,
  } as const;
  const observed = createPersonalModelOperation({
    ...withoutOperationDigests(intent),
    operationPhase: "credential_step_observed",
    phaseRevision: 2,
    credentialObservation: observation,
  });
  const operation = createPersonalModelOperation({
    ...withoutOperationDigests(observed),
    operationPhase: "committed",
    phaseRevision: 3,
  });
  const head = createPersonalModelHead({
    ownerScopeNamespaceRevision: owner.ownerScopeNamespaceRevision,
    ownerScopeDigest: owner.ownerScopeDigest,
    personalModelId: modelId,
    currentConfigurationRevision: definition.configurationRevision,
    currentExecutionDefinitionDigest: definition.executionDefinitionDigest,
    headRevision: 1,
    selectionState: "active",
    updatedAt: definition.createdAt,
  });
  const status = createPersonalModelStatusFact({
    ownerScopeNamespaceRevision: owner.ownerScopeNamespaceRevision,
    ownerScopeDigest: owner.ownerScopeDigest,
    personalModelId: modelId,
    configurationRevision: definition.configurationRevision,
    executionDefinitionDigest: definition.executionDefinitionDigest,
    statusRevision: 1,
    status: "unverified",
    statusOrigin: "initialized",
    updatedAt: definition.createdAt,
  });
  const receipt = createPersonalModelCommandReceipt({
    ownerScopeNamespaceRevision: owner.ownerScopeNamespaceRevision,
    ownerScopeDigest: owner.ownerScopeDigest,
    commandId,
    commandType: "create",
    requestDigest,
    modelId,
    committedConfigurationRevision: definition.configurationRevision,
    outcome: "create_committed",
    committedAt: definition.createdAt,
  });
  const commitInput = { operation, definition, head, status, receipt };
  return { owner, definition, intent, observation, observed, operation, head, status, receipt, commitInput };
}

function withoutOperationDigests(operation: PersonalModelOperation): Omit<
  PersonalModelOperation,
  "recordDigest" | "credentialObservationDigest"
> {
  const { recordDigest: _record, credentialObservationDigest: _observation, ...material } = operation;
  return material;
}

function withoutHeadDigest(head: PersonalModelHead): Omit<PersonalModelHead, "recordDigest"> {
  const { recordDigest: _record, ...material } = head;
  return material;
}

function withoutStatusDigest(
  status: PersonalModelStatusFact,
): Omit<PersonalModelStatusFact, "recordDigest"> {
  const { recordDigest: _record, ...material } = status;
  return material;
}

function withoutReceiptDigest(
  receipt: PersonalModelCommandReceipt,
): Omit<PersonalModelCommandReceipt, "receiptDigest"> {
  const { receiptDigest: _record, ...material } = receipt;
  return material;
}

function uuid(value: number): string {
  return `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
}
