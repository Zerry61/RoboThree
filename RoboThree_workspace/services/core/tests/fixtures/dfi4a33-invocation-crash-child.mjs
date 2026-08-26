import { Buffer } from "node:buffer";
import { DatabaseSync } from "node:sqlite";

import {
  FakeClock,
  SqliteLocalPersonalModelInvocationPersistence,
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
  createLocalPersonalModelInvocationLink,
  createLocalPersonalInvocationTimeoutFact,
  createModelInvocationTimeoutMaterial,
} from "../../dist/index.js";

const databasePath = process.env.ROBOTHREE_DFI4A33_DATABASE_PATH;
const windowName = process.env.ROBOTHREE_DFI4A33_WINDOW;
if (databasePath === undefined || windowName === undefined) process.exit(64);

const at = "2026-08-22T10:00:00.000Z";
const digest = (marker) => `sha256:${marker.repeat(64)}`;
const persistence = new SqliteLocalPersonalModelInvocationPersistence({
  databasePath,
  clock: new FakeClock(at),
});
await persistence.start();

let link = createLocalPersonalModelInvocationLink({
  schemaVersion: "v1alpha1",
  invocationKind: "compaction_summary",
  invocationLinkId: "019f7447-a784-77b2-a716-000000000301",
  authorityInvocationId: "019f7447-a784-77b2-a716-000000000302",
  sessionId: "019f7447-a784-77b2-a716-000000000303",
  taskId: "019f7447-a784-77b2-a716-000000000304",
  runId: "019f7447-a784-77b2-a716-000000000305",
  round: 1,
  taskRuntimeSelectionId: "019f7447-a784-77b2-a716-000000000306",
  taskRuntimeSelectionDigest: digest("a"),
  modelLockId: "019f7447-a784-77b2-a716-000000000307",
  modelLockDigest: digest("b"),
  ownerScopeNamespaceRevision: 1,
  ownerScopeDigest: digest("c"),
  personalModelId: "model.personal.crash",
  configurationRevision: digest("d"),
  executionDefinitionDigest: digest("e"),
  providerProfileRevision: digest("f"),
  endpointIdentityDigest: digest("1"),
  credentialBindingDigest: digest("2"),
  modelRequestDigest: digest("3"),
  admissionScopeDigest: digest("4"),
  status: "accepted",
  fencingEpoch: 1,
  createdAt: at,
  updatedAt: at,
});
seedForeignKeys(databasePath, link);
const timeout = createModelInvocationTimeoutMaterial({
  policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
  invocationStartedAt: at,
});
link = requireWrite(await persistence.prepareInvocation({
  link,
  timeoutFact: createLocalPersonalInvocationTimeoutFact({
    authorityInvocationId: link.authorityInvocationId,
    timeout,
    policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
  }),
}));

if (windowName !== "I1") {
  link = requireWrite(await persistence.advanceInvocation({
    expectedRecordDigest: link.recordDigest,
    next: createLocalPersonalModelInvocationLink({
      ...withoutDigest(link),
      status: "dispatching",
      updatedAt: at,
    }),
  }));
}
if (windowName === "I3" || windowName === "I4") {
  link = requireWrite(await persistence.advanceInvocation({
    expectedRecordDigest: link.recordDigest,
    next: createLocalPersonalModelInvocationLink({
      ...withoutDigest(link),
      status: "output_started",
      outputStartedAt: at,
      updatedAt: at,
    }),
  }));
}
if (windowName === "I5") {
  link = requireWrite(await persistence.commitTerminalOutcome({
    expectedRecordDigest: link.recordDigest,
    terminal: createLocalPersonalModelInvocationLink({
      ...withoutDigest(link),
      status: "terminal",
      terminalAt: at,
      terminalClass: "completed",
      updatedAt: at,
    }),
  }));
}

process.send?.({ type: "barrier", windowName, status: link.status }, () => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
});

function seedForeignKeys(path, value) {
  const database = new DatabaseSync(path);
  try {
    database.prepare(`
      INSERT OR IGNORE INTO session_heads (
        session_id, schema_version, message_sequence, session_event_sequence,
        context_revision, active_compaction_id, created_at, updated_at, head_json
      ) VALUES (?, 'v1alpha1', 0, 0, 0, NULL, ?, ?, '{}')
    `).run(value.sessionId, at, at);
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
      ) VALUES (?, ?, ?, ?, ?, 'custom', ?, 'openai_compatible',
        'https://example.com/v1', ?, 'provider-model', 'Crash Fixture', '["text","streaming"]',
        'pmcred1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 1, ?, '{}', ?, ?)
    `).run(
      value.ownerScopeNamespaceRevision,
      value.ownerScopeDigest,
      value.personalModelId,
      value.configurationRevision,
      value.executionDefinitionDigest,
      value.providerProfileRevision,
      value.endpointIdentityDigest,
      value.credentialBindingDigest,
      digest("7"),
      at,
    );
  } finally {
    database.close();
  }
}

function withoutDigest(value) {
  const material = { ...value };
  delete material.recordDigest;
  return material;
}

function requireWrite(result) {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
