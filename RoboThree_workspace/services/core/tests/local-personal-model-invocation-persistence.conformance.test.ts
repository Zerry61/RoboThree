import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryLocalPersonalModelInvocationPersistence,
  LocalPersonalModelInvocationRecoveryCoordinator,
  OPENAI_USAGE_SEMANTICS_REVISION,
  PersonalModelProviderProfileRegistry,
  SqliteLocalPersonalModelInvocationPersistence,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  createPersonalModelCommandReceipt,
  createLocalPersonalModelInvocationLink,
  createLocalPersonalInvocationTimeoutFact,
  createModelInvocationTimeoutMaterial,
  createPersonalModelDefinition,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
  derivePersonalModelOwnerIdentity,
  providerAttemptKey,
  providerUsageDigest,
  withUsageProjectionDigest,
  type LocalPersonalModelInvocationLink,
  type LocalPersonalModelInvocationPersistence,
  type ProviderUsageFact,
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
} from "../src/index.js";

const at = "2026-08-21T09:00:00.000Z";
const later = "2026-08-21T09:00:01.000Z";
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe.each([
  ["InMemory", async () => ({
    persistence: new InMemoryLocalPersonalModelInvocationPersistence(),
    cleanup: async () => {},
  })],
  ["SQLite", sqliteFixture],
] as const)("DFI-4A.3.1 %s local invocation conformance", (_name, factory) => {
  it("provides idempotent prepare, monotonic CAS and bounded pending recovery", async () => {
    const fixture = await factory();
    const { persistence } = fixture;
    await persistence.start();
    const accepted = invocationFixture();
    if (persistence instanceof SqliteLocalPersonalModelInvocationPersistence) {
      seedDefinition(fixture.databasePath!, accepted);
    }
    expect(await prepare(persistence, accepted)).toMatchObject({ ok: true, replayed: false });
    expect(await prepare(persistence, accepted)).toMatchObject({ ok: true, replayed: true });
    expect(await persistence.loadInvocationTimeoutFact(accepted.authorityInvocationId))
      .toMatchObject({ invocationStartedAt: at, invocationDeadlineAt: "2026-08-21T09:15:00.000Z" });
    const driftedTimeout = createModelInvocationTimeoutMaterial({
      policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      invocationStartedAt: later,
    });
    expect(await persistence.prepareInvocation({
      link: accepted,
      timeoutFact: createLocalPersonalInvocationTimeoutFact({
        authorityInvocationId: accepted.authorityInvocationId,
        timeout: driftedTimeout,
        policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      }),
    })).toMatchObject({ ok: false, error: { code: "local_personal.timeout_fact_drift" } });
    const dispatching = createLocalPersonalModelInvocationLink({
      ...withoutDigest(accepted),
      status: "dispatching",
      updatedAt: later,
    });
    expect(await persistence.advanceInvocation({
      expectedRecordDigest: accepted.recordDigest,
      next: dispatching,
    })).toMatchObject({ ok: true, replayed: false });
    expect(await persistence.advanceInvocation({
      expectedRecordDigest: accepted.recordDigest,
      next: dispatching,
    })).toMatchObject({ ok: false, error: { code: "local_personal_invocation.conflict" } });
    expect(await persistence.listPending(10)).toHaveLength(1);

    const regressed = createLocalPersonalModelInvocationLink({
      ...withoutDigest(dispatching),
      status: "accepted",
      updatedAt: "2026-08-21T09:00:02.000Z",
    });
    expect(await persistence.advanceInvocation({
      expectedRecordDigest: dispatching.recordDigest,
      next: regressed,
    })).toMatchObject({ ok: false, error: { code: "local_personal_invocation.conflict" } });
    if (persistence instanceof SqliteLocalPersonalModelInvocationPersistence) {
      const database = new DatabaseSync(fixture.databasePath!);
      database.prepare(`
        UPDATE local_personal_invocation_timeout_facts
        SET invocation_deadline_at = ? WHERE authority_invocation_id = ?
      `).run("2026-08-21T09:14:59.000Z", accepted.authorityInvocationId);
      database.close();
      await expect(persistence.loadInvocationTimeoutFact(accepted.authorityInvocationId))
        .rejects.toThrow("local_personal.timeout_fact_drift");
    }
    await persistence.stop();
    await fixture.cleanup();
  });

  it("requires registered Usage, preserves unknown, and atomically commits known Usage", async () => {
    const fixture = await factory();
    const { persistence } = fixture;
    await persistence.start();
    const accepted = invocationFixture();
    if (persistence instanceof SqliteLocalPersonalModelInvocationPersistence) {
      seedDefinition(fixture.databasePath!, accepted);
    }
    await prepare(persistence, accepted);
    const terminalWithoutUsage = createLocalPersonalModelInvocationLink({
      ...withoutDigest(accepted),
      status: "terminal",
      terminalAt: later,
      terminalClass: "completed",
      updatedAt: later,
    });
    expect(await persistence.commitTerminalOutcome({
      expectedRecordDigest: accepted.recordDigest,
      terminal: terminalWithoutUsage,
    })).toMatchObject({ ok: true });
    expect(await persistence.load({
      authorityInvocationId: accepted.authorityInvocationId,
      providerAttemptKey: providerAttemptKey("local_personal", accepted.authorityInvocationId, 1),
    })).toBeUndefined();
    await expect(persistence.registerAttempt({
      authorityInvocationId: accepted.authorityInvocationId,
      fencingEpoch: 1,
      providerAttemptKey: providerAttemptKey("local_personal", accepted.authorityInvocationId, 1),
    })).rejects.toThrow("no exact invocation link");
    await persistence.stop();
    await fixture.cleanup();

    const second = await factory();
    await second.persistence.start();
    const next = invocationFixture(20);
    if (second.persistence instanceof SqliteLocalPersonalModelInvocationPersistence) {
      seedDefinition(second.databasePath!, next);
    }
    await prepare(second.persistence, next);
    const attempt = providerAttemptKey("local_personal", next.authorityInvocationId, 1);
    const fact = usageFixture(next.authorityInvocationId, attempt);
    const projection = withUsageProjectionDigest({
      invocationKind: next.invocationKind,
      invocationLinkId: next.invocationLinkId,
      sessionId: next.sessionId,
      usageAuthority: "local_personal",
      authorityInvocationId: next.authorityInvocationId,
      usageEventId: "019f7447-a784-77b2-a716-000000000898",
      usageEventDigest: fact.usageDigest,
      inputTokens: fact.providerInputTokens,
      outputTokens: fact.providerOutputTokens,
      usageRecordedAt: later,
    });
    const status = createPersonalModelStatusFact({
      ownerScopeNamespaceRevision: next.ownerScopeNamespaceRevision,
      ownerScopeDigest: next.ownerScopeDigest,
      personalModelId: next.personalModelId,
      configurationRevision: next.configurationRevision,
      executionDefinitionDigest: next.executionDefinitionDigest,
      statusRevision: 2,
      status: "available",
      detailCode: "personal_model.provider_success",
      statusOrigin: "provider_observation",
      updatedAt: later,
    });
    const receipt = createPersonalModelCommandReceipt({
      ownerScopeNamespaceRevision: next.ownerScopeNamespaceRevision,
      ownerScopeDigest: next.ownerScopeDigest,
      commandId: "019f7447-a784-77b2-a716-000000000897",
      commandType: "status",
      requestDigest: digest("9"),
      modelId: next.personalModelId,
      committedConfigurationRevision: next.configurationRevision,
      outcome: "status_committed",
      committedAt: later,
    });
    expect(await second.persistence.record(fact)).toMatchObject({
      ok: false,
      error: { code: "provider_usage.attempt_not_registered" },
    });
    await second.persistence.registerAttempt({
      authorityInvocationId: next.authorityInvocationId,
      fencingEpoch: 1,
      providerAttemptKey: attempt,
    });
    const terminal = createLocalPersonalModelInvocationLink({
      ...withoutDigest(next),
      status: "terminal",
      terminalAt: later,
      terminalClass: "completed",
      updatedAt: later,
    });
    expect(await second.persistence.commitTerminalOutcome({
      expectedRecordDigest: next.recordDigest,
      terminal,
      usageFact: fact,
      usageProjection: projection,
      statusObservation: { status, expectedStatusRevision: 1, receipt },
    })).toMatchObject({ ok: true });
    expect(await second.persistence.load({
      authorityInvocationId: next.authorityInvocationId,
      providerAttemptKey: attempt,
    })).toMatchObject({ providerInputTokens: 10, providerOutputTokens: 2 });
    expect(await second.persistence.listPending(10)).toEqual([]);
    await second.persistence.stop();
    if (second.databasePath !== undefined) {
      const inspection = new DatabaseSync(second.databasePath, { readOnly: true });
      expect(inspection.prepare("SELECT COUNT(*) AS count FROM provider_usage_projections").get())
        .toEqual({ count: 1 });
      expect(inspection.prepare(`
        SELECT status, status_revision FROM personal_model_status_facts
        ORDER BY status_revision DESC LIMIT 1
      `).get()).toEqual({ status: "available", status_revision: 2 });
      inspection.close();
    }
    await second.cleanup();
  });

  it("rolls back Usage and Projection when terminal CAS conflicts", async () => {
    const fixture = await factory();
    const { persistence } = fixture;
    await persistence.start();
    const accepted = invocationFixture(40);
    if (persistence instanceof SqliteLocalPersonalModelInvocationPersistence) {
      seedDefinition(fixture.databasePath!, accepted);
    }
    await prepare(persistence, accepted);
    const attempt = providerAttemptKey("local_personal", accepted.authorityInvocationId, 1);
    await persistence.registerAttempt({
      authorityInvocationId: accepted.authorityInvocationId,
      fencingEpoch: 1,
      providerAttemptKey: attempt,
    });
    const fact = usageFixture(accepted.authorityInvocationId, attempt);
    const projection = withUsageProjectionDigest({
      invocationKind: accepted.invocationKind,
      invocationLinkId: accepted.invocationLinkId,
      sessionId: accepted.sessionId,
      usageAuthority: "local_personal",
      authorityInvocationId: accepted.authorityInvocationId,
      usageEventId: "019f7447-a784-77b2-a716-000000000938",
      usageEventDigest: fact.usageDigest,
      inputTokens: fact.providerInputTokens,
      outputTokens: fact.providerOutputTokens,
      usageRecordedAt: later,
    });
    const terminal = createLocalPersonalModelInvocationLink({
      ...withoutDigest(accepted),
      status: "terminal",
      terminalAt: later,
      terminalClass: "completed",
      updatedAt: later,
    });
    expect(await persistence.commitTerminalOutcome({
      expectedRecordDigest: digest("0"),
      terminal,
      usageFact: fact,
      usageProjection: projection,
    })).toMatchObject({ ok: false, error: { code: "local_personal_invocation.conflict" } });
    expect(await persistence.load({
      authorityInvocationId: accepted.authorityInvocationId,
      providerAttemptKey: attempt,
    })).toBeUndefined();
    expect(await persistence.loadInvocation({
      invocationKind: accepted.invocationKind,
      invocationLinkId: accepted.invocationLinkId,
    })).toMatchObject({ status: "accepted" });
    if (fixture.databasePath !== undefined) {
      const inspection = new DatabaseSync(fixture.databasePath, { readOnly: true });
      expect(inspection.prepare("SELECT COUNT(*) AS count FROM provider_usage_projections").get())
        .toEqual({ count: 0 });
      inspection.close();
    }
    await persistence.stop();
    await fixture.cleanup();
  });
});

describe("DFI-4A.3.1 repair.2 legacy timeout recovery", () => {
  it("fails a pending migration-24 invocation closed when its timeout fact is absent", async () => {
    const fixture = await sqliteFixture();
    const link = invocationFixture(60);
    await fixture.persistence.start();
    seedDefinition(fixture.databasePath!, link);
    await prepare(fixture.persistence, link);
    const database = new DatabaseSync(fixture.databasePath!);
    database.prepare(
      "DELETE FROM local_personal_invocation_timeout_facts WHERE authority_invocation_id = ?",
    ).run(link.authorityInvocationId);
    database.close();
    const evidence = await new LocalPersonalModelInvocationRecoveryCoordinator({
      persistence: fixture.persistence,
      clock: new FakeClock(later),
      timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    }).classify();
    expect(evidence).toMatchObject({ recoveryExhaustedCount: 1 });
    expect(await fixture.persistence.loadInvocation({
      invocationKind: link.invocationKind,
      invocationLinkId: link.invocationLinkId,
    })).toMatchObject({
      status: "recovery_exhausted",
      typedErrorCode: "local_personal.timeout_fact_legacy_missing",
    });
    await fixture.persistence.stop();
    await fixture.cleanup();
  });
});

function invocationFixture(offset = 0): LocalPersonalModelInvocationLink {
  const definition = definitionFixture();
  const uuid = (value: number) => `019f7447-a784-77b2-a716-${String(value + offset).padStart(12, "0")}`;
  return createLocalPersonalModelInvocationLink({
    schemaVersion: "v1alpha1",
    invocationKind: "assistant_message",
    invocationLinkId: uuid(801),
    authorityInvocationId: uuid(802),
    sessionId: uuid(803),
    taskId: uuid(804),
    runId: uuid(805),
    round: 0,
    taskRuntimeSelectionId: uuid(806),
    taskRuntimeSelectionDigest: digest("1"),
    modelLockId: uuid(807),
    modelLockDigest: digest("2"),
    ownerScopeNamespaceRevision: definition.ownerScopeNamespaceRevision,
    ownerScopeDigest: definition.ownerScopeDigest,
    personalModelId: definition.personalModelId,
    configurationRevision: definition.configurationRevision,
    executionDefinitionDigest: definition.executionDefinitionDigest,
    providerProfileRevision: definition.providerProfileRevision,
    endpointIdentityDigest: definition.endpointIdentityDigest,
    credentialBindingDigest: definition.credentialBindingDigest,
    modelRequestDigest: digest("3"),
    admissionScopeDigest: digest("4"),
    status: "accepted",
    fencingEpoch: 1,
    createdAt: at,
    updatedAt: at,
  });
}

function prepare(
  persistence: LocalPersonalModelInvocationPersistence,
  link: LocalPersonalModelInvocationLink,
) {
  const timeout = createModelInvocationTimeoutMaterial({
    policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    invocationStartedAt: link.createdAt,
  });
  return persistence.prepareInvocation({
    link,
    timeoutFact: createLocalPersonalInvocationTimeoutFact({
      authorityInvocationId: link.authorityInvocationId,
      timeout,
      policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    }),
  });
}

function definitionFixture() {
  const namespace = createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: Buffer.alloc(32, 6),
    createdAt: at,
  });
  const owner = derivePersonalModelOwnerIdentity(namespace, {
    enterpriseId: "enterprise", userId: "user", deviceId: "device",
  });
  const credentialRef = allocatePersonalCredentialReference(Buffer.alloc(32, 8));
  const operationId = "019f7447-a784-77b2-a716-000000000799";
  return createPersonalModelDefinition({
    ownerIdentity: owner,
    personalModelId: "model.personal.one",
    providerKind: "deepseek",
    providerProfileRevision: new PersonalModelProviderProfileRegistry().resolve("deepseek").profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://api.example.com/v1",
    providerModelId: "provider-model",
    displayName: "Personal One",
    capabilities: ["text", "streaming"],
    credentialRef,
    credentialRevision: 1,
    credentialBindingDigest: calculateCredentialBindingDigest({
      credentialRef, createdByOperationId: operationId, credentialRevision: 1,
    }),
    createdAt: at,
  });
}

function seedDefinition(databasePath: string, link: LocalPersonalModelInvocationLink): void {
  const definition = definitionFixture();
  const database = new DatabaseSync(databasePath);
  try {
    database.prepare(`
      INSERT OR IGNORE INTO session_heads (
        session_id, schema_version, message_sequence, session_event_sequence,
        context_revision, active_compaction_id, created_at, updated_at, head_json
      ) VALUES (?, 'v1alpha1', 0, 0, 0, NULL, ?, ?, '{}')
    `).run(link.sessionId, at, at);
    database.prepare(`
      INSERT OR IGNORE INTO personal_model_owner_scope_namespaces (
        namespace_revision, namespace_key, namespace_key_check_digest, status,
        created_at, record_json, record_digest
      ) VALUES (1, ?, ?, 'active', ?, '{}', ?)
    `).run(Buffer.alloc(32, 6), digest("5"), at, digest("6"));
    database.prepare(`
      INSERT OR IGNORE INTO personal_model_definitions (
        owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
        configuration_revision, execution_definition_digest, provider_kind,
        provider_profile_revision, protocol, canonical_endpoint, endpoint_identity_digest,
        provider_model_id, display_name, capabilities_json, credential_ref,
        credential_revision, credential_binding_digest, record_json, record_digest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      link.ownerScopeNamespaceRevision, link.ownerScopeDigest, link.personalModelId,
      link.configurationRevision, link.executionDefinitionDigest, definition.providerKind,
      link.providerProfileRevision, definition.protocol, definition.canonicalEndpoint,
      link.endpointIdentityDigest, definition.providerModelId, definition.displayName,
      JSON.stringify(definition.capabilities), definition.credentialRef,
      definition.credentialRevision, link.credentialBindingDigest,
      JSON.stringify({ ...definition,
        ownerScopeDigest: link.ownerScopeDigest,
        configurationRevision: link.configurationRevision,
        executionDefinitionDigest: link.executionDefinitionDigest,
        providerProfileRevision: link.providerProfileRevision,
        endpointIdentityDigest: link.endpointIdentityDigest,
        credentialBindingDigest: link.credentialBindingDigest,
      }), definition.recordDigest, definition.createdAt,
    );
    const initialStatus = createPersonalModelStatusFact({
      ownerScopeNamespaceRevision: link.ownerScopeNamespaceRevision,
      ownerScopeDigest: link.ownerScopeDigest,
      personalModelId: link.personalModelId,
      configurationRevision: link.configurationRevision,
      executionDefinitionDigest: link.executionDefinitionDigest,
      statusRevision: 1,
      status: "unverified",
      statusOrigin: "initialized",
      updatedAt: at,
    });
    database.prepare(`
      INSERT OR IGNORE INTO personal_model_status_facts (
        owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
        configuration_revision, execution_definition_digest, status_revision, status,
        detail_code, detail_digest, status_origin, carried_from_configuration_revision,
        carried_from_status_revision, carried_from_status_record_digest, updated_at,
        record_json, record_digest
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, ?, ?, ?)
    `).run(
      initialStatus.ownerScopeNamespaceRevision, initialStatus.ownerScopeDigest,
      initialStatus.personalModelId, initialStatus.configurationRevision,
      initialStatus.executionDefinitionDigest, initialStatus.statusRevision, initialStatus.status,
      initialStatus.statusOrigin, initialStatus.updatedAt, JSON.stringify(initialStatus),
      initialStatus.recordDigest,
    );
  } finally {
    database.close();
  }
}

function usageFixture(authorityInvocationId: string, attempt: string): ProviderUsageFact {
  const material = {
    usageAuthority: "local_personal" as const,
    authorityInvocationId,
    providerAttemptKey: attempt,
    fencingEpoch: 1,
    sourceProtocol: "openai_compatible" as const,
    reportingSemanticsRevision: OPENAI_USAGE_SEMANTICS_REVISION,
    providerInputTokens: 10,
    providerOutputTokens: 2,
    normalizedTotalInputTokens: 10,
    attemptDisposition: "terminal_winner" as const,
  };
  return {
    usageFactId: "019f7447-a784-77b2-a716-000000000899",
    ...material,
    usageDigest: providerUsageDigest(material),
    recordedAt: later,
  };
}

function withoutDigest(link: LocalPersonalModelInvocationLink) {
  const { recordDigest: _recordDigest, ...material } = link;
  return material;
}

async function sqliteFixture(): Promise<{
  persistence: LocalPersonalModelInvocationPersistence;
  databasePath: string;
  cleanup: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a31-sqlite-"));
  const databasePath = join(directory, "core.sqlite");
  return {
    persistence: new SqliteLocalPersonalModelInvocationPersistence({
      databasePath,
      clock: new FakeClock(at),
    }),
    databasePath,
    cleanup: async () => rm(directory, { recursive: true, force: true }),
  };
}
