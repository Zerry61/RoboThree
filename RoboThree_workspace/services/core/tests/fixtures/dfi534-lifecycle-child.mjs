import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import process from "node:process";

import {
  DurableTaskRuntime,
  FakeClock,
  FakeIdGenerator,
  SqliteModelInvocationLinkPersistence,
  SqliteTaskPersistence,
} from "../../dist/index.js";

const [command, databasePath, providerPath, barrier = "none"] = process.argv.slice(2);
const at = "2026-08-27T08:00:00.000Z";
const deadlineAt = "2026-08-27T08:15:00.000Z";
const taskId = entityId(1);
const clientRequestId = entityId(8);
const diagnostics = {
  listeningPorts: new Set(),
  openSqliteHandles: new Set(),
  providerFixtureServers: new Set(),
  inFlightInvocationLinkClaims: new Set(),
  providerStreams: new Set(),
  sseSubscriptions: new Set(),
  timersSchedulers: new Set(),
  abortControllers: new Set(),
  mappingLookupLeases: new Set(),
  pendingUsageProjections: new Set(),
  lateCallbacks: new Set(),
  temporaryFixtureFileHandles: new Set(),
};

let tasks;
let links;
let fixture;

try {
  const mapping = mappingFor(providerPath);
  if (command === "prepare" && barrier === "reasoning_mapping_validated") {
    await signalBarrier(mapping);
  }

  tasks = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
  diagnostics.openSqliteHandles.add(tasks);
  await tasks.start();
  await ensureTask();
  links = new SqliteModelInvocationLinkPersistence({
    databasePath,
    clock: new FakeClock(at),
  });
  diagnostics.openSqliteHandles.add(links);
  await links.start();

  let link = await links.loadByClientRequestId(clientRequestId);
  let mappingLoadCount = 0;
  if (link === undefined) {
    mappingLoadCount = 1;
    diagnostics.mappingLookupLeases.add(mapping.mappingDigest);
    diagnostics.mappingLookupLeases.delete(mapping.mappingDigest);
    diagnostics.inFlightInvocationLinkClaims.add(clientRequestId);
    const prepared = await links.prepare(prepareInput(mapping));
    diagnostics.inFlightInvocationLinkClaims.delete(clientRequestId);
    if (!prepared.ok) throw new Error(prepared.error.code);
    link = prepared.value;
  }

  if (command === "prepare" && barrier === "invocation_link_committed") {
    await signalBarrier(mapping, link);
  }

  let upstreamRequestCount = 0;
  let usageProjectionCount = 0;
  if (link.messageCommittedAt === undefined) {
    fixture = await startProviderFixture();
    upstreamRequestCount = 1;
    const response = await globalThis.fetch(`http://127.0.0.1:${fixture.port}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mapping.body),
    });
    if (!response.ok) throw new Error("dfi534_provider_fixture_failed");
    diagnostics.providerStreams.add(clientRequestId);
    const providerResult = await response.json();
    diagnostics.providerStreams.delete(clientRequestId);
    await fixture.close();
    fixture = undefined;

    const accepted = await links.recordAccepted({
      clientRequestId,
      expectedRecordDigest: link.recordDigest,
      invocationId: entityId(30),
      statusRevision: 0,
      durableCursor: "cursor:dfi534:0",
      acceptedAt: at,
    });
    if (!accepted.ok) throw new Error(accepted.error.code);
    const streamed = await links.recordStreamProgress({
      clientRequestId,
      expectedRecordDigest: accepted.value.recordDigest,
      statusRevision: 1,
      durableCursor: "cursor:dfi534:1",
      outputStartedAt: at,
      updatedAt: at,
    });
    if (!streamed.ok) throw new Error(streamed.error.code);
    diagnostics.pendingUsageProjections.add(clientRequestId);
    usageProjectionCount = 1;
    diagnostics.pendingUsageProjections.delete(clientRequestId);
    const committed = await links.recordMessageCommitted({
      clientRequestId,
      expectedRecordDigest: streamed.value.recordDigest,
      messageCommittedAt: at,
    });
    if (!committed.ok) throw new Error(committed.error.code);
    link = committed.value;
    mapping.providerResult = providerResult;
  }

  const result = {
    providerPath,
    processId: process.pid,
    databasePath,
    reasoningModeLockDigest: digest("a"),
    modelLockDigest: digest("b"),
    requestDigest: link.modelRequestDigest,
    mappingDigest: mapping.mappingDigest,
    deadlineAt,
    bodyMode: mapping.bodyMode,
    bodyKeys: Object.keys(mapping.body).sort(),
    usageDigest: digest("f"),
    terminal: "completed",
    mappingLoadCount,
    upstreamRequestCount,
    usageProjectionCount,
    messageCommittedAt: link.messageCommittedAt,
  };
  await closeResources();
  process.send?.({ type: "result", result: { ...result, resourceCounts: resourceCounts() } });
} catch (error) {
  await closeResources();
  process.send?.({
    type: "failure",
    errorCode: error instanceof Error ? error.message : "dfi534_child_failed",
    resourceCounts: resourceCounts(),
  });
  process.exitCode = 1;
}

async function ensureTask() {
  const runtime = new DurableTaskRuntime({
    persistence: tasks,
    idGenerator: new FakeIdGenerator([entityId(10)]),
  });
  const loaded = await runtime.snapshot(taskId);
  if (loaded !== undefined) return;
  const created = await runtime.createTask({
    taskId,
    agentDefinition: { agentDefinitionId: entityId(11), version: "1.0.0" },
    goal: "DFI-5.3.4 lifecycle fixture",
    createdAt: at,
  });
  if (!created.ok) throw new Error(created.error.code);
}

function prepareInput(mapping) {
  return {
    taskId,
    runId: entityId(2),
    stepId: entityId(3),
    actionId: entityId(4),
    round: 1,
    runtimeSelectionDigest: digest("1"),
    assistantMessageId: entityId(5),
    modelRequestId: entityId(6),
    modelRequestDigest: sha256({ providerPath, mappingDigest: mapping.mappingDigest, deadlineAt }),
    confirmationId: entityId(7),
    scopeDigest: digest("3"),
    dataScopeDigest: digest("4"),
    clientRequestId,
    centralAcceptRequestDigest: sha256({ providerPath, bodyMode: mapping.bodyMode }),
    createdAt: at,
  };
}

function mappingFor(path) {
  if (path === "local_personal_openai") return {
    mappingDigest: digest("c"),
    bodyMode: "max",
    body: { model: "fixture", messages: [], reasoning_effort: "xhigh", stream: true },
  };
  if (path === "enterprise_openai") return {
    mappingDigest: digest("d"),
    bodyMode: "max",
    body: { model: "fixture", messages: [], reasoning_effort: "high", stream: true },
  };
  if (path === "enterprise_anthropic") return {
    mappingDigest: digest("e"),
    bodyMode: "max",
    body: { model: "fixture", messages: [], thinking: { type: "enabled", budget_tokens: 8192 }, stream: true },
  };
  throw new Error("dfi534_provider_path_invalid");
}

async function startProviderFixture() {
  let capturedBody;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    capturedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ usage: { inputTokens: 10, outputTokens: 20 }, capturedBody }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("dfi534_fixture_port_missing");
  diagnostics.providerFixtureServers.add(server);
  diagnostics.listeningPorts.add(address.port);
  return {
    port: address.port,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      diagnostics.providerFixtureServers.delete(server);
      diagnostics.listeningPorts.delete(address.port);
    },
  };
}

async function signalBarrier(mapping, link) {
  process.send?.({
    type: "barrier",
    barrier,
    providerPath,
    processId: process.pid,
    mappingDigest: mapping.mappingDigest,
    invocationLinkCommitted: link !== undefined,
  });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}

async function closeResources() {
  if (fixture !== undefined) await fixture.close();
  if (links !== undefined) {
    await links.stop();
    diagnostics.openSqliteHandles.delete(links);
  }
  if (tasks !== undefined) {
    await tasks.stop();
    diagnostics.openSqliteHandles.delete(tasks);
  }
}

function resourceCounts() {
  return Object.fromEntries(Object.entries(diagnostics).map(([key, value]) => [key, value.size]));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function digest(marker) {
  return `sha256:${marker.repeat(64)}`;
}

function entityId(value) {
  return `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
}
