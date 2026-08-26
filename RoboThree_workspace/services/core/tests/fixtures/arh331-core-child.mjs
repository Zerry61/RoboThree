import { Buffer } from "node:buffer";
import process from "node:process";

import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
} from "../../../../packages/contracts/dist/index.js";
import {
  FakeClock,
  FakeIdGenerator,
  InMemoryLocalPersonalUsageAuthority,
  OPENAI_USAGE_SEMANTICS_REVISION,
  PersistentSessionScopeDigestProvider,
  SqliteConversationPersistence,
  SqlitePromptCacheContextPersistence,
  SqliteProviderUsageProjectionPersistence,
  providerAttemptKey,
  providerUsageDigest,
  sessionUsageProjection,
  sha256CanonicalJson,
} from "../../dist/index.js";

const [role, databasePath] = process.argv.slice(2);
if ((role !== "core-a" && role !== "core-b") || databasePath === undefined) {
  throw new Error("ARH-3.3.1 Core child requires role and database path");
}

const now = "2026-08-15T02:00:00.000Z";
const canary = process.env.ROBOTHREE_ARH331_CANARY ?? "arh331-private-seed";
const clock = new FakeClock(now);
const conversation = new SqliteConversationPersistence({ databasePath, clock });
const cachePersistence = new SqlitePromptCacheContextPersistence({ databasePath, clock });
const usagePersistence = new SqliteProviderUsageProjectionPersistence({ databasePath, clock });
const sessions = role === "core-a"
  ? [session("A1", 101, 2), session("A2", 102, 1)]
  : [session("B1", 201, 1)];
const namespaceKey = Buffer.alloc(32, role === "core-a" ? 0x31 : 0x42)
  .toString("base64url");
const scopeProvider = new PersistentSessionScopeDigestProvider({
  persistence: cachePersistence,
  ids: new FakeIdGenerator(Array.from(
    { length: 8 },
    (_, index) => uuid((role === "core-a" ? 8_000 : 9_000) + index),
  )),
  namespaceKeyFactory: () => namespaceKey,
});

let stopped = false;

try {
  await conversation.start();
  await cachePersistence.start();
  await usagePersistence.start();

  const reports = [];
  for (const definition of sessions) {
    reports.push(await seedSession(definition));
  }

  const localPersonal = role === "core-b"
    ? await seedLocalPersonalAuthority()
    : undefined;
  const result = Object.freeze({
    role,
    sessionCount: reports.length,
    sessions: reports,
    ...(localPersonal === undefined ? {} : { localPersonal }),
    databaseIdentityDigest: sha256CanonicalJson(JsonValueSchema.parse({
      role,
      schema: "core-sqlite-arh331",
    })),
  });
  process.send?.({ type: "ready", result });
} catch (error) {
  process.send?.({
    type: "fatal",
    errorCode: "arh331.core_child_start_failed",
    safeSummary: error instanceof Error ? error.name : "UnknownError",
  });
  await stop();
  process.exitCode = 1;
}

process.on("message", (message) => {
  if (message?.type !== "stop") return;
  void stop().then(() => {
    process.send?.({
      type: "stopped",
      resourceMetrics: { openAdapterCount: 0, pendingTimerCount: 0 },
    });
    process.disconnect?.();
  });
});
process.once("disconnect", () => void stop());
process.once("SIGTERM", () => void stop().finally(() => process.exit(0)));
process.once("SIGINT", () => void stop().finally(() => process.exit(0)));

async function seedSession(definition) {
  const head = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    sessionId: definition.sessionId,
    messageSequence: 0,
    sessionEventSequence: 0,
    contextRevision: 0,
    createdAt: now,
    updatedAt: now,
  };
  const created = await conversation.createSession(head);
  if (!created.ok) throw new Error(created.error.code);

  const messageDigests = [];
  for (let turn = 1; turn <= definition.turnCount; turn += 1) {
    for (const messageRole of ["user", "assistant"]) {
      const sequence = messageDigests.length + 1;
      const message = messageRole === "user"
        ? {
          schemaVersion: MODEL_PROTOCOL_VERSION,
          role: messageRole,
          content: [{
            type: "text",
            text: `${canary}:${definition.label}:turn-${turn}:user`,
          }],
        }
        : {
          schemaVersion: MODEL_PROTOCOL_VERSION,
          role: messageRole,
          content: [{
            type: "text",
            text: `${canary}:${definition.label}:turn-${turn}:assistant`,
          }],
          toolCalls: [],
        };
      const messageDigest = sha256CanonicalJson(JsonValueSchema.parse(message));
      const appended = await conversation.appendMessage({
        expectedMessageSequence: sequence - 1,
        message: {
          envelope: {
            schemaVersion: CONVERSATION_SCHEMA_VERSION,
            messageId: uuid(definition.idBase + 10 + sequence),
            sessionId: definition.sessionId,
            sequence,
            messageSchemaVersion: MODEL_PROTOCOL_VERSION,
            messageDigest,
            createdAt: now,
          },
          message,
        },
        updatedAt: now,
      });
      if (!appended.ok) throw new Error(appended.error.code);
      messageDigests.push(messageDigest);
    }
  }

  const cacheContexts = [];
  for (let turn = 1; turn <= definition.turnCount; turn += 1) {
    cacheContexts.push(await scopeProvider.resolve({
      authority: "central_enterprise",
      sessionId: definition.sessionId,
      invocationKind: "assistant_message",
      invocationLinkId: uuid(definition.idBase + 100 + turn),
      createdAt: now,
    }));
    const projection = {
      invocationKind: "assistant_message",
      invocationLinkId: uuid(definition.idBase + 100 + turn),
      sessionId: definition.sessionId,
      usageAuthority: "central_enterprise",
      authorityInvocationId: uuid(definition.idBase + 200 + turn),
      usageEventId: uuid(definition.idBase + 300 + turn),
      usageEventDigest: rawDigest(`${definition.label}:usage:${turn}`),
      inputTokens: 8 + turn,
      outputTokens: 3 + turn,
      usageRecordedAt: now,
    };
    const recorded = await usagePersistence.record(projection);
    if (!recorded.ok) throw new Error(recorded.error.code);
  }

  const usageRecords = await usagePersistence.listBySession(definition.sessionId);
  const usage = sessionUsageProjection(definition.sessionId, usageRecords);
  return Object.freeze({
    label: definition.label,
    turnCount: definition.turnCount,
    messageCount: messageDigests.length,
    conversationDigest: sha256CanonicalJson(JsonValueSchema.parse(messageDigests)),
    sessionScopeDigest: cacheContexts[0].sessionScopeDigest,
    sameSessionScopeStable: cacheContexts.every(
      (context) => context.sessionScopeDigest === cacheContexts[0].sessionScopeDigest,
    ),
    cacheContextCount: cacheContexts.length,
    usageProjectionCount: usage.invocationCount,
    usageProjectionDigest: usage.recordDigest,
  });
}

async function seedLocalPersonalAuthority() {
  const authority = new InMemoryLocalPersonalUsageAuthority();
  const sharedInvocationId = uuid(5_001);
  const fencingEpoch = 1;
  const personalAttemptKey = providerAttemptKey(
    "local_personal",
    sharedInvocationId,
    fencingEpoch,
  );
  const enterpriseAttemptKey = providerAttemptKey(
    "central_enterprise",
    sharedInvocationId,
    fencingEpoch,
  );
  await authority.registerAttempt({
    authorityInvocationId: sharedInvocationId,
    fencingEpoch,
    providerAttemptKey: personalAttemptKey,
  });
  const material = {
    usageAuthority: "local_personal",
    authorityInvocationId: sharedInvocationId,
    providerAttemptKey: personalAttemptKey,
    fencingEpoch,
    sourceProtocol: "openai_compatible",
    reportingSemanticsRevision: OPENAI_USAGE_SEMANTICS_REVISION,
    providerInputTokens: 9,
    providerOutputTokens: 4,
    cacheReadInputTokens: 2,
    normalizedTotalInputTokens: 9,
    attemptDisposition: "terminal_winner",
  };
  const recorded = await authority.record({
    usageFactId: uuid(5_002),
    ...material,
    usageDigest: providerUsageDigest(material),
    recordedAt: now,
  });
  if (!recorded.ok) throw new Error(recorded.error.code);
  const loaded = await authority.load({
    authorityInvocationId: sharedInvocationId,
    providerAttemptKey: personalAttemptKey,
  });
  return Object.freeze({
    usageFactCount: loaded === undefined ? 0 : 1,
    attemptIdentitySeparated: personalAttemptKey !== enterpriseAttemptKey,
    gatewaySidecarCount: 0,
    centralProjectionCount: 0,
    authorityIsolationDigest: sha256CanonicalJson(JsonValueSchema.parse({
      personalAttemptKey,
      enterpriseAttemptKey,
    })),
  });
}

async function stop() {
  if (stopped) return;
  stopped = true;
  await usagePersistence.stop();
  await cachePersistence.stop();
  await conversation.stop();
}

function session(label, value, turnCount) {
  return Object.freeze({
    label,
    idBase: value * 1_000,
    sessionId: uuid(value),
    turnCount,
  });
}

function rawDigest(value) {
  return sha256CanonicalJson(JsonValueSchema.parse(value)).slice("sha256:".length);
}

function uuid(value) {
  return `019f8e00-0000-7000-8000-${String(value).padStart(12, "0")}`;
}
