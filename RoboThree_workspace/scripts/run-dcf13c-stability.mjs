import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DesktopEventReconnectController } from "../apps/desktop/dist/main/desktop-event-reconnect-controller.js";
import { CorePrivateSupervisor } from "../apps/desktop/dist/main/core-private-supervisor.js";
import { SseBackpressureWriter } from "../services/core/dist/adapters/http/sse-backpressure-writer.js";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const coreEntryPath = fileURLToPath(new URL(
  "../services/core/dist/desktop-private-main.js",
  import.meta.url,
));

const CLI_MODES = Object.freeze({
  "30m": 30 * 60 * 1_000,
  "60m": 60 * 60 * 1_000,
});

const DEFAULT_INTERVALS = Object.freeze({
  turnIntervalMs: 10_000,
  reconnectIntervalMs: 90_000,
  restartIntervalMs: 180_000,
  resetIntervalMs: 150_000,
  gracefulCycleIntervalMs: 300_000,
  slowProbeIntervalMs: 120_000,
  sampleIntervalMs: 30_000,
});

const REPORT_SCHEMA = "robothree.dcf13c.stability-report.v1";

export async function runDcf13cStabilityHarness(input) {
  const configuration = normalizeConfiguration(input);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "robothree-dcf13c-"));
  const databasePath = join(temporaryRoot, "robothree.sqlite");
  const workspacePath = join(temporaryRoot, "workspace");
  await mkdir(workspacePath);

  const supervisor = new CorePrivateSupervisor({
    entryPath: coreEntryPath,
    databasePath,
    demoMode: "legacy_test",
    maxUnexpectedRestarts: 1,
  });
  const counters = createCounters();
  const resources = createResourceMetrics();
  const digest = createHash("sha256");
  const runtimeInstances = new Set();
  const observedDurableEvents = new Set();
  const errorCodes = [];
  let sessionId;
  let workspaceGrantId;
  let latestAssistantMessageId;
  let eventController;
  let eventAbort;
  let activeEventControllers = 0;
  let lastEventMetrics = {
    dedupeSetSize: 0,
    maxDedupeSize: 0,
    cleanupCount: 0,
  };
  let startedAt;

  const sampleResources = () => {
    const memory = process.memoryUsage();
    resources.samples += 1;
    resources.peakRssBytes = Math.max(resources.peakRssBytes, memory.rss);
    resources.peakHeapUsedBytes = Math.max(
      resources.peakHeapUsedBytes,
      memory.heapUsed,
    );
    if (resources.previousRssBytes !== undefined && memory.rss > resources.previousRssBytes) {
      resources.currentRssGrowthStreak += 1;
    } else {
      resources.currentRssGrowthStreak = 0;
    }
    resources.maxRssGrowthStreak = Math.max(
      resources.maxRssGrowthStreak,
      resources.currentRssGrowthStreak,
    );
    resources.previousRssBytes = memory.rss;
    resources.finalRssBytes = memory.rss;
    resources.finalHeapUsedBytes = memory.heapUsed;
    const activeResourceCount = typeof process.getActiveResourcesInfo === "function"
      ? process.getActiveResourcesInfo().length
      : 0;
    resources.peakActiveResourceCount = Math.max(
      resources.peakActiveResourceCount,
      activeResourceCount,
    );
    resources.finalActiveResourceCount = activeResourceCount;
  };

  const stopEvents = async () => {
    if (eventAbort === undefined) return;
    const controller = eventController;
    eventAbort.abort();
    eventAbort = undefined;
    activeEventControllers -= 1;
    await delay(configuration.settleDelayMs);
    if (controller !== undefined) {
      const metrics = controller.snapshotMetrics();
      lastEventMetrics = metrics;
      resources.maxDedupeSize = Math.max(
        resources.maxDedupeSize,
        metrics.maxDedupeSize,
      );
      resources.dedupeCleanupCount += metrics.cleanupCount;
    }
    eventController = undefined;
  };

  const startEvents = () => {
    if (activeEventControllers !== 0) {
      throw new HarnessAssertionError("harness.multiple_event_controllers");
    }
    eventController = new DesktopEventReconnectController({
      resolveConnection: () => ({
        client: supervisor.client,
        clientInstanceId: supervisor.clientInstanceId,
      }),
      canReconnect: () => supervisor.snapshot().runtimeState === "ready",
    });
    eventAbort = eventController.start((value) => {
      if (value.type === "replay_reset_required") {
        counters.replayResetCount += 1;
        return;
      }
      if (value.deliveryKind === "ephemeral") {
        counters.ephemeralEventCount += 1;
        return;
      }
      counters.durableEventCount += 1;
      if (observedDurableEvents.has(value.eventId)) {
        counters.duplicateDurableEventCount += 1;
      } else {
        if (observedDurableEvents.size >= 4_096) {
          observedDurableEvents.delete(observedDurableEvents.values().next().value);
        }
        observedDurableEvents.add(value.eventId);
      }
      digest.update(value.eventId);
      digest.update(value.durableCursor);
      digest.update(value.payload.type);
    });
    activeEventControllers += 1;
    resources.peakActiveEventControllers = Math.max(
      resources.peakActiveEventControllers,
      activeEventControllers,
    );
  };

  const recordRuntimeInstance = async () => {
    const status = await supervisor.client.runtimeStatus(query(
      "runtime_status_query",
      supervisor.clientInstanceId,
    ));
    if (!status.ok) throw new HarnessAssertionError("runtime.status_unavailable");
    runtimeInstances.add(status.value.runtimeInstanceId);
    digest.update(status.value.runtimeInstanceId);
    counters.coreStartCount += 1;
  };

  try {
    await supervisor.start();
    await recordRuntimeInstance();
    counters.peakActiveChildren = 1;

    const workspaceCorrelationId = randomUUID();
    const selection = await supervisor.client.registerWorkspaceSelection({
      selectedPath: workspacePath,
      clientInstanceId: supervisor.clientInstanceId,
      correlationId: workspaceCorrelationId,
    });
    if (!selection.ok) {
      throw new HarnessAssertionError("workspace.selection_failed");
    }
    const grant = await supervisor.client.createWorkspaceGrant({
      contractVersion: "v1alpha1",
      type: "create_workspace_grant",
      commandId: randomUUID(),
      correlationId: workspaceCorrelationId,
      clientInstanceId: supervisor.clientInstanceId,
      selectionHandle: selection.value.selectionHandle,
      displayName: "DCF-1.3C Stability Workspace",
      accessMode: "read_write",
    });
    if (!grant.ok) throw new HarnessAssertionError("workspace.grant_failed");
    workspaceGrantId = grant.value.workspaceGrantId;

    const session = await supervisor.client.createSession({
      contractVersion: "v1alpha1",
      type: "create_session",
      commandId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: supervisor.clientInstanceId,
      title: "DCF-1.3C Stability Session",
    });
    if (!session.ok) throw new HarnessAssertionError("session.create_failed");
    sessionId = session.value.sessionId;
    startEvents();
    sampleResources();

    startedAt = performance.now();
    let nextTurn = startedAt;
    let nextReconnect = startedAt + configuration.reconnectIntervalMs;
    let nextRestart = startedAt + configuration.restartIntervalMs;
    let nextReset = startedAt + configuration.resetIntervalMs;
    let nextGracefulCycle = startedAt + configuration.gracefulCycleIntervalMs;
    let nextSlowProbe = startedAt + configuration.slowProbeIntervalMs;
    let nextSample = startedAt + configuration.sampleIntervalMs;

    while (performance.now() - startedAt < configuration.durationMs) {
      const now = performance.now();
      if (now >= nextTurn) {
        latestAssistantMessageId = await submitAndConverge({
          supervisor,
          sessionId,
          workspaceGrantId,
          previousAssistantMessageId: latestAssistantMessageId,
        });
        counters.turnCount += 1;
        nextTurn = performance.now() + configuration.turnIntervalMs;
      }
      if (performance.now() >= nextReconnect) {
        await stopEvents();
        startEvents();
        counters.reconnectCount += 1;
        nextReconnect = performance.now() + configuration.reconnectIntervalMs;
      }
      if (performance.now() >= nextReset) {
        await stopEvents();
        await probeUnknownCursorReset(supervisor);
        counters.injectedResetCount += 1;
        startEvents();
        nextReset = performance.now() + configuration.resetIntervalMs;
      }
      if (performance.now() >= nextRestart) {
        await stopEvents();
        await supervisor.restart();
        counters.coreRestartCount += 1;
        await recordRuntimeInstance();
        startEvents();
        nextRestart = performance.now() + configuration.restartIntervalMs;
      }
      if (performance.now() >= nextGracefulCycle) {
        await stopEvents();
        await supervisor.stop();
        counters.coreExitCount += 1;
        await supervisor.start();
        await recordRuntimeInstance();
        startEvents();
        counters.gracefulCycleCount += 1;
        nextGracefulCycle = performance.now()
          + configuration.gracefulCycleIntervalMs;
      }
      if (performance.now() >= nextSlowProbe) {
        const probe = await runBackpressureProbe();
        counters.slowConsumerDrainRecoveryCount += probe.drainRecoveries;
        counters.slowConsumerTimeoutCount += probe.timeouts;
        nextSlowProbe = performance.now() + configuration.slowProbeIntervalMs;
      }
      if (performance.now() >= nextSample) {
        sampleResources();
        nextSample = performance.now() + configuration.sampleIntervalMs;
      }
      await delay(Math.min(
        configuration.loopDelayMs,
        Math.max(1, configuration.durationMs - (performance.now() - startedAt)),
      ));
    }

    await stopEvents();
    const finalSnapshot = await loadSnapshot(
      supervisor,
      sessionId,
      configuration.snapshotTimeoutMs,
    );
    const finalAssistant = [...finalSnapshot.messages]
      .reverse()
      .find((message) =>
        message.role === "assistant" && message.status === "completed");
    if (
      finalAssistant === undefined
      || finalAssistant.messageId !== latestAssistantMessageId
    ) {
      throw new HarnessAssertionError("snapshot.final_convergence_failed");
    }
    digest.update(finalSnapshot.latestDurableCursor);
    digest.update(String(finalSnapshot.messages.length));

    await supervisor.stop();
    counters.coreExitCount += 1;
    await supervisor.start();
    await recordRuntimeInstance();
    const reopened = await supervisor.client.openSession({
      contractVersion: "v1alpha1",
      type: "open_session",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: supervisor.clientInstanceId,
      sessionId,
    });
    if (!reopened.ok) {
      throw new HarnessAssertionError("sqlite.reopen_failed");
    }
    counters.sqliteReopenCount += 1;
  } catch (error) {
    errorCodes.push(error instanceof HarnessAssertionError
      ? error.code
      : "harness.unexpected_failure");
  } finally {
    await stopEvents().catch(() => undefined);
    await supervisor.stop().catch(() => undefined);
    sampleResources();
    resources.finalActiveChildren = 0;
    resources.finalActiveEventControllers = activeEventControllers;
    resources.finalDedupeSetSize = lastEventMetrics.dedupeSetSize;
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const durationMs = Math.round(
    startedAt === undefined ? 0 : performance.now() - startedAt,
  );
  const report = createSafeReport({
    configuration,
    durationMs,
    counters,
    resources,
    runtimeInstanceCount: runtimeInstances.size,
    finalDigest: digest.digest("hex"),
    errorCodes,
  });
  assertSafeHarnessReport(report);
  return report;
}

export function createSafeReport(input) {
  const safeResources = {
    samples: input.resources.samples,
    peakRssBytes: input.resources.peakRssBytes,
    finalRssBytes: input.resources.finalRssBytes,
    peakHeapUsedBytes: input.resources.peakHeapUsedBytes,
    finalHeapUsedBytes: input.resources.finalHeapUsedBytes,
    peakActiveResourceCount: input.resources.peakActiveResourceCount,
    finalActiveResourceCount: input.resources.finalActiveResourceCount,
    peakActiveEventControllers: input.resources.peakActiveEventControllers,
    finalActiveEventControllers: input.resources.finalActiveEventControllers,
    maxDedupeSize: input.resources.maxDedupeSize,
    finalDedupeSetSize: input.resources.finalDedupeSetSize,
    dedupeCleanupCount: input.resources.dedupeCleanupCount,
    maxRssGrowthStreak: input.resources.maxRssGrowthStreak,
    finalActiveChildren: input.resources.finalActiveChildren,
  };
  return Object.freeze({
    schema: REPORT_SCHEMA,
    status: input.errorCodes.length === 0 ? "pass" : "fail",
    mode: input.configuration.mode,
    seed: input.configuration.seed,
    configuredDurationMs: input.configuration.durationMs,
    actualDurationMs: input.durationMs,
    counters: Object.freeze({
      ...input.counters,
      runtimeInstanceCount: input.runtimeInstanceCount,
    }),
    resources: Object.freeze(safeResources),
    finalDigest: input.finalDigest,
    errorCodes: Object.freeze([...input.errorCodes]),
  });
}

export function assertSafeHarnessReport(report) {
  const serialized = JSON.stringify(report);
  if (Buffer.byteLength(serialized) > 64 * 1_024) {
    throw new Error("DCF-1.3C report exceeds the safe byte limit");
  }
  for (const forbidden of [
    "authorization",
    "credential",
    "privatekey",
    "selectedpath",
    "databasepath",
    "workspacepath",
    "userinput",
    "messagecontent",
    "assistantcontent",
    "toolargument",
    "skilloutput",
    "knowledgecontent",
    "promptcontent",
  ]) {
    if (serialized.toLowerCase().includes(forbidden)) {
      throw new Error("DCF-1.3C report contains a forbidden field");
    }
  }
  for (const value of collectStrings(report)) {
    if (
      value.startsWith("/")
      || value.includes("\\Users\\")
      || value.includes("Bearer ")
      || value.includes("://")
    ) {
      throw new Error("DCF-1.3C report contains a forbidden value");
    }
  }
}

function normalizeConfiguration(input) {
  const positiveInteger = (value, name) => {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer`);
    }
    return value;
  };
  return Object.freeze({
    mode: input.mode,
    seed: positiveInteger(input.seed, "seed"),
    durationMs: positiveInteger(input.durationMs, "durationMs"),
    turnIntervalMs: positiveInteger(input.turnIntervalMs, "turnIntervalMs"),
    reconnectIntervalMs: positiveInteger(
      input.reconnectIntervalMs,
      "reconnectIntervalMs",
    ),
    restartIntervalMs: positiveInteger(
      input.restartIntervalMs,
      "restartIntervalMs",
    ),
    resetIntervalMs: positiveInteger(input.resetIntervalMs, "resetIntervalMs"),
    gracefulCycleIntervalMs: positiveInteger(
      input.gracefulCycleIntervalMs,
      "gracefulCycleIntervalMs",
    ),
    slowProbeIntervalMs: positiveInteger(
      input.slowProbeIntervalMs,
      "slowProbeIntervalMs",
    ),
    sampleIntervalMs: positiveInteger(
      input.sampleIntervalMs,
      "sampleIntervalMs",
    ),
    snapshotTimeoutMs: positiveInteger(
      input.snapshotTimeoutMs ?? 5_000,
      "snapshotTimeoutMs",
    ),
    settleDelayMs: positiveInteger(input.settleDelayMs ?? 100, "settleDelayMs"),
    loopDelayMs: positiveInteger(input.loopDelayMs ?? 100, "loopDelayMs"),
  });
}

function createCounters() {
  return {
    turnCount: 0,
    durableEventCount: 0,
    ephemeralEventCount: 0,
    duplicateDurableEventCount: 0,
    replayResetCount: 0,
    injectedResetCount: 0,
    reconnectCount: 0,
    coreStartCount: 0,
    coreExitCount: 0,
    coreRestartCount: 0,
    gracefulCycleCount: 0,
    sqliteReopenCount: 0,
    slowConsumerDrainRecoveryCount: 0,
    slowConsumerTimeoutCount: 0,
    peakActiveChildren: 0,
  };
}

function createResourceMetrics() {
  return {
    samples: 0,
    peakRssBytes: 0,
    finalRssBytes: 0,
    peakHeapUsedBytes: 0,
    finalHeapUsedBytes: 0,
    peakActiveResourceCount: 0,
    finalActiveResourceCount: 0,
    peakActiveEventControllers: 0,
    finalActiveEventControllers: 0,
    maxDedupeSize: 0,
    finalDedupeSetSize: 0,
    dedupeCleanupCount: 0,
    maxRssGrowthStreak: 0,
    currentRssGrowthStreak: 0,
    previousRssBytes: undefined,
  };
}

async function submitAndConverge(input) {
  const command = {
    contractVersion: "v1alpha1",
    type: "submit_turn",
    commandId: randomUUID(),
    correlationId: randomUUID(),
    clientInstanceId: input.supervisor.clientInstanceId,
    clientTurnId: `dcf13c:${randomUUID()}`,
    sessionId: input.sessionId,
    userInput: "Execute the DCF-1.3C stability turn.",
    selectionRequest: {
      agentId: "agent.fixture.desktop-scripted",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      workspaceGrantId: input.workspaceGrantId,
    },
  };
  const receipt = await input.supervisor.client.submitTurn(command);
  if (!receipt.ok || receipt.value.status !== "accepted") {
    throw new HarnessAssertionError("turn.submit_failed");
  }
  const replay = await input.supervisor.client.submitTurn(command);
  if (!replay.ok || replay.value.status !== "replayed") {
    throw new HarnessAssertionError("turn.idempotency_failed");
  }
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const snapshot = await loadSnapshot(input.supervisor, input.sessionId, 5_000);
    const assistant = [...snapshot.messages]
      .reverse()
      .find((message) =>
        message.role === "assistant"
        && message.status === "completed"
        && message.messageId !== input.previousAssistantMessageId);
    if (assistant !== undefined) return assistant.messageId;
    await delay(25);
  }
  throw new HarnessAssertionError("snapshot.turn_convergence_failed");
}

async function loadSnapshot(supervisor, sessionId, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const snapshot = await supervisor.client.loadConversationSnapshot({
      ...query("conversation_snapshot", supervisor.clientInstanceId),
      sessionId,
      limit: 100,
    });
    if (snapshot.ok) return snapshot.value;
    await delay(25);
  }
  throw new HarnessAssertionError("snapshot.unavailable");
}

async function probeUnknownCursorReset(supervisor) {
  const controller = new globalThis.AbortController();
  let observed = false;
  const timeout = globalThis.setTimeout(() => controller.abort(), 5_000);
  try {
    await supervisor.client.subscribe({
      query: {
        ...query("desktop_event_subscription", supervisor.clientInstanceId),
        durableCursor: "delivery:9007199254740991",
      },
      signal: controller.signal,
      onEvent: () => undefined,
      onReplayReset: (reset) => {
        observed = reset.reason === "unknown_cursor";
        controller.abort();
      },
    });
  } catch (error) {
    if (!isAbortError(error)) {
      throw new HarnessAssertionError("cursor.reset_probe_failed");
    }
  } finally {
    globalThis.clearTimeout(timeout);
  }
  if (!observed) throw new HarnessAssertionError("cursor.reset_not_observed");
}

async function runBackpressureProbe() {
  const recoveredResponse = createBackpressuredResponse();
  const recoveredWriter = new SseBackpressureWriter({
    response: recoveredResponse,
    slowConsumerDeadlineMs: 10,
    waitForDrain: async () => {
      await delay(1);
      recoveredResponse.writableNeedDrain = false;
      return "drain";
    },
  });
  const recovered = await recoveredWriter.writeDurable("desktop_event", {
    type: "stability_probe",
  });
  recoveredWriter.dispose();
  if (recovered !== "written") {
    throw new HarnessAssertionError("slow_consumer.drain_failed");
  }

  const timedOutResponse = createBackpressuredResponse();
  const timedOutWriter = new SseBackpressureWriter({
    response: timedOutResponse,
    slowConsumerDeadlineMs: 10,
    waitForDrain: async () => {
      await delay(1);
      return "timeout";
    },
  });
  const timedOut = await timedOutWriter.writeDurable("desktop_event", {
    type: "stability_probe",
  });
  timedOutWriter.dispose();
  if (timedOut !== "slow_consumer" || !timedOutResponse.destroyed) {
    throw new HarnessAssertionError("slow_consumer.timeout_failed");
  }
  return { drainRecoveries: 1, timeouts: 1 };
}

function createBackpressuredResponse() {
  return {
    destroyed: false,
    writableEnded: false,
    writableNeedDrain: true,
    write: () => false,
    destroy() {
      this.destroyed = true;
    },
  };
}

function query(type, clientInstanceId) {
  return {
    contractVersion: "v1alpha1",
    type,
    queryId: randomUUID(),
    correlationId: randomUUID(),
    clientInstanceId,
  };
}

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(collectStrings);
}

function isAbortError(error) {
  return error instanceof globalThis.DOMException && error.name === "AbortError";
}

function delay(milliseconds) {
  return new Promise((resolveDelay) =>
    globalThis.setTimeout(resolveDelay, milliseconds));
}

class HarnessAssertionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function parseCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item?.startsWith("--")) throw new Error("Unknown DCF-1.3C argument");
    const equals = item.indexOf("=");
    if (equals >= 0) {
      values.set(item.slice(2, equals), item.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Missing value for ${item}`);
    }
    values.set(item.slice(2), next);
    index += 1;
  }
  const mode = values.get("mode");
  if (!(mode in CLI_MODES)) {
    throw new Error("DCF-1.3C CLI mode must be 30m or 60m");
  }
  const seed = Number(values.get("seed") ?? (mode === "30m" ? 13030 : 13060));
  const output = values.get("output")
    ?? join(workspaceRoot, "qa-reports", `dcf13c-stability-${mode}.json`);
  const outputPath = isAbsolute(output) ? output : resolve(workspaceRoot, output);
  return {
    configuration: {
      mode,
      seed,
      durationMs: CLI_MODES[mode],
      ...DEFAULT_INTERVALS,
    },
    outputPath,
  };
}

async function main() {
  const { configuration, outputPath } = parseCli(process.argv.slice(2));
  const report = await runDcf13cStabilityHarness(configuration);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    mode: report.mode,
    actualDurationMs: report.actualDurationMs,
    turnCount: report.counters.turnCount,
    runtimeInstanceCount: report.counters.runtimeInstanceCount,
    finalDigest: report.finalDigest,
    errorCodes: report.errorCodes,
  })}\n`);
  if (report.status !== "pass") process.exitCode = 1;
}

const isDirect = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirect) {
  await main();
}
