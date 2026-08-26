import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTRACT_VERSION } from "@robothree/contracts";
import type { TaskCommand, TaskInitialization, ToolAuthorizationContext } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  CapabilityResolver,
  AuthorizationEvaluator,
  DurableTaskRuntime,
  EffectCoordinator,
  FakeClock,
  FakeIdGenerator,
  FakeScheduler,
  InMemoryTaskPersistence,
  ProcessEchoBackendError,
  ProcessEchoToolBackend,
  RuntimeAdapterHandles,
  RuntimeAdmissionController,
  SqliteTaskPersistence,
  TaskCapabilityLockService,
  TaskRecoveryCoordinator,
  ToolEffectExecutor,
  ToolExecutionService,
  UserConfirmationCoordinator,
} from "../src/index.js";
import type { TaskPersistence } from "../src/index.js";
import { NdjsonFrameDecoder } from "../src/adapters/process-echo/ndjson-frame-decoder.js";
import { processEchoCapabilityRegistry } from "./capability.fixtures.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const ids = {
  task: entityId(3601),
  agent: entityId(3602),
  run: entityId(3603),
  step: entityId(3604),
  action: entityId(3605),
  plan: entityId(3606),
  planRevision: entityId(3607),
  startRun: entityId(3608),
  startStep: entityId(3609),
};
const at = "2026-07-21T06:00:00.000Z";

describe("Process Echo internal NDJSON framing", () => {
  it("decodes split frames and multiple frames without losing boundaries", () => {
    const decoder = new NdjsonFrameDecoder(128);
    expect(decoder.push(Buffer.from('{"one":'))).toEqual([]);
    expect(decoder.push(Buffer.from('1}\n{"two":2}\n{"three":'))).toEqual([
      '{"one":1}',
      '{"two":2}',
    ]);
    expect(decoder.push(Buffer.from('3}\n'))).toEqual(['{"three":3}']);
    expect(() => decoder.finish()).not.toThrow();
  });

  it("rejects oversized and incomplete frames", () => {
    expect(() => new NdjsonFrameDecoder(4).push(Buffer.from("12345"))).toThrow("exceeds 4 bytes");
    const decoder = new NdjsonFrameDecoder(8);
    decoder.push(Buffer.from("partial"));
    expect(() => decoder.finish()).toThrow("incomplete NDJSON frame");
  });
});

describe("Process Echo Tool Backend", () => {
  it("starts a fixed trusted child, handshakes, and echoes Unicode/nested JSON", async () => {
    const harness = await createHarness("split_observation");
    try {
      await harness.backend.start();
      await expect(harness.backend.health()).resolves.toMatchObject({ status: "ready" });
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
      });
      await expect(harness.backend.execute({
        lock: lock.lock,
        action: toolAction({ text: "你好，RoboThree", nested: { ok: true } }),
        effectAttemptId: entityId(3610),
        idempotencyKey: "process-echo:direct:1",
        requestedAt: at,
      }, new AbortController().signal)).resolves.toMatchObject({
        outcome: "succeeded",
        output: { text: "你好，RoboThree", nested: { ok: true } },
      });
      expect(harness.backend.transmissions()).toHaveLength(1);
    } finally {
      await harness.stop();
    }
  });

  it("fails closed on a protocol-version mismatch before accepting work", async () => {
    const harness = await createHarness("protocol_mismatch", false);
    try {
      await expect(harness.backend.start()).rejects.toMatchObject({
        name: "ProcessEchoBackendError",
        code: "process_echo.protocol_error",
      });
      await expect(harness.backend.health()).resolves.toMatchObject({ status: "unavailable" });
      expect(harness.backend.transmissions()).toEqual([]);
    } finally {
      await harness.stop();
    }
  });

  it("bounds stderr and never interprets child output as a command", async () => {
    const harness = await createHarness("stderr_flood", true, { maxStderrBytes: 128 });
    try {
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
      });
      await expect(harness.backend.execute({
        lock: lock.lock,
        action: toolAction({ value: "safe" }),
        effectAttemptId: entityId(3611),
        idempotencyKey: "process-echo:stderr",
        requestedAt: at,
      }, new AbortController().signal)).resolves.toMatchObject({ outcome: "succeeded" });
      expect(harness.backend.diagnosticStderrBytes()).toBeLessThanOrEqual(128);
    } finally {
      await harness.stop();
    }
  });

  it("propagates cancellation after DISPATCHED and converges Echo to a cancelled Observation", async () => {
    const harness = await createHarness("hang_after_request");
    try {
      await harness.backend.start();
      const controller = new AbortController();
      const resultPromise = harness.service.execute({
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
        action: toolAction({ value: "cancel me" }),
        idempotencyKey: "process-echo:cancel",
        signal: controller.signal,
      });
      await waitUntil(() => harness.backend.transmissions().length === 1);
      const [transmission] = harness.backend.transmissions();
      expect(await harness.persistence.loadEffectAttempt(transmission!.effectAttemptId))
        .toMatchObject({ status: "dispatched" });
      controller.abort();
      await expect(resultPromise).resolves.toMatchObject({
        accepted: true,
        state: { runs: [{ steps: [{ status: "cancelled", observation: { outcome: "cancelled" } }] }] },
      });
      expect(await harness.persistence.loadEffectAttempt(transmission!.effectAttemptId))
        .toMatchObject({ status: "cancelled" });
    } finally {
      await harness.stop();
    }
  });

  it("rejects direct concurrent calls instead of building an unbounded Adapter queue", async () => {
    const harness = await createHarness("hang_after_request");
    try {
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
      });
      const firstController = new AbortController();
      const first = harness.backend.execute({
        lock: lock.lock,
        action: toolAction({ value: "first" }),
        effectAttemptId: entityId(3620),
        idempotencyKey: "process-echo:single-flight:first",
        requestedAt: at,
      }, firstController.signal);
      await waitUntil(() => harness.backend.transmissions().length === 1);
      await expect(harness.backend.execute({
        lock: lock.lock,
        action: toolAction({ value: "second" }),
        effectAttemptId: entityId(3621),
        idempotencyKey: "process-echo:single-flight:second",
        requestedAt: at,
      }, new AbortController().signal)).rejects.toMatchObject({
        code: "process_echo.concurrent_execution",
        deliveryMayHaveOccurred: false,
      });
      firstController.abort();
      await expect(first).resolves.toMatchObject({ outcome: "cancelled" });
      expect(harness.backend.transmissions()).toHaveLength(1);
    } finally {
      await harness.stop();
    }
  });

  it("maps an Echo timeout to a typed terminal result without inventing a new Effect state", async () => {
    const harness = await createHarness("hang_after_request", true, { requestTimeoutMs: 40 });
    try {
      await expect(harness.service.execute({
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
        action: toolAction({ value: "timeout" }),
        idempotencyKey: "process-echo:timeout",
      })).resolves.toMatchObject({
        accepted: true,
        state: { runs: [{ steps: [{ status: "timed_out", observation: { outcome: "timed_out" } }] }] },
      });
      expect(await harness.persistence.findEffectAttemptByIdempotencyKey("process-echo:timeout"))
        .toMatchObject({ status: "failed", terminalError: { category: "timeout" } });
    } finally {
      await harness.stop();
    }
  });

  it("keeps a crash-after-request Effect dispatched, then retries with stable Effect identity", async () => {
    const harness = await createHarness("crash_after_request");
    try {
      await expect(harness.service.execute({
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
        action: toolAction({ value: "recover" }),
        idempotencyKey: "process-echo:recover",
      })).rejects.toBeInstanceOf(ProcessEchoBackendError);
      const attempt = await harness.persistence.findEffectAttemptByIdempotencyKey("process-echo:recover");
      expect(attempt).toMatchObject({ status: "dispatched" });

      const recoveryDecisions = await harness.recovery.recoverEffects();
      expect(recoveryDecisions).toMatchObject([
        { action: "recover_dispatched", result: { accepted: true } },
      ]);
      const transmissions = harness.backend.transmissions();
      expect(transmissions).toHaveLength(2);
      expect(new Set(transmissions.map((item) => item.requestId)).size).toBe(2);
      expect(new Set(transmissions.map((item) => item.effectAttemptId))).toEqual(new Set([attempt!.effectAttemptId]));
      expect(new Set(transmissions.map((item) => item.idempotencyKey))).toEqual(new Set(["process-echo:recover"]));
      expect(await harness.persistence.loadEffectAttempt(attempt!.effectAttemptId))
        .toMatchObject({ status: "succeeded" });
    } finally {
      await harness.stop();
    }
  });

  it.each(["malformed_observation", "wrong_request_id"] as const)(
    "does not turn an untrusted %s response into a deterministic failure",
    async (scenario) => {
      const harness = await createHarness(scenario);
      try {
        const idempotencyKey = `process-echo:${scenario}`;
        await expect(harness.service.execute({
          taskId: ids.task,
          runId: ids.run,
          stepId: ids.step,
          registryRevision: harness.snapshot.registryRevision,
          capabilityId: "tool.echo",
          action: toolAction({ value: scenario }),
          idempotencyKey,
        })).rejects.toBeInstanceOf(ProcessEchoBackendError);
        const attempt = await harness.persistence.findEffectAttemptByIdempotencyKey(idempotencyKey);
        expect(attempt).toMatchObject({ status: "dispatched" });
        expect((await harness.runtime.snapshot(ids.task))?.runs[0]?.steps[0]).toMatchObject({
          status: "running",
        });
        expect((await harness.runtime.snapshot(ids.task))?.runs[0]?.steps[0]?.observation).toBeUndefined();
        await expect(harness.recovery.recoverEffects()).resolves.toMatchObject([
          { action: "recover_dispatched", result: { accepted: true } },
        ]);
        expect(await harness.persistence.loadEffectAttempt(attempt!.effectAttemptId))
          .toMatchObject({ status: "succeeded" });
      } finally {
        await harness.stop();
      }
    },
  );

  it("recovers the same dispatched Effect after SQLite close/reopen and process replacement", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-process-echo-"));
    const databasePath = join(directory, "runtime.sqlite");
    const clock = new FakeClock(at);
    const firstPersistence = new SqliteTaskPersistence({ databasePath, clock });
    await firstPersistence.start();
    const first = await createHarnessWithPersistence(firstPersistence, "crash_after_request");
    let attemptId: string | undefined;
    try {
      await expect(first.service.execute({
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: first.snapshot.registryRevision,
        capabilityId: "tool.echo",
        action: toolAction({ value: "sqlite-recovery" }),
        idempotencyKey: "process-echo:sqlite-recover",
      })).rejects.toBeInstanceOf(ProcessEchoBackendError);
      attemptId = (await firstPersistence.findEffectAttemptByIdempotencyKey("process-echo:sqlite-recover"))?.effectAttemptId;
      expect(attemptId).toBeDefined();
    } finally {
      await first.backend.stop();
      await firstPersistence.stop();
    }

    const secondPersistence = new SqliteTaskPersistence({ databasePath, clock });
    await secondPersistence.start();
    const second = await createRecoveryHarness(secondPersistence, clock);
    try {
      const recoveryDecisions = await second.recovery.recoverEffects();
      expect(recoveryDecisions).toMatchObject([
        { action: "recover_dispatched", result: { accepted: true } },
      ]);
      expect(await secondPersistence.loadEffectAttempt(attemptId!)).toMatchObject({ status: "succeeded" });
      expect((await second.runtime.snapshot(ids.task))?.runs[0]?.steps[0]).toMatchObject({
        status: "succeeded",
        observation: { output: { value: "sqlite-recovery" } },
      });
    } finally {
      await second.backend.stop();
      await secondPersistence.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function createHarness(
  scenario: ConstructorParameters<typeof ProcessEchoToolBackend>[0]["diagnosticScenario"] = "normal",
  initializeTask = true,
  backendOptions: Partial<ConstructorParameters<typeof ProcessEchoToolBackend>[0]> = {},
) {
  const clock = new FakeClock(at);
  const persistence = new InMemoryTaskPersistence(clock);
  await persistence.start();
  const harness = await createHarnessWithPersistence(persistence, scenario, initializeTask, backendOptions);
  return {
    ...harness,
    async stop() {
      await harness.backend.stop();
      await persistence.stop();
    },
  };
}

async function createHarnessWithPersistence(
  persistence: TaskPersistence,
  scenario: ConstructorParameters<typeof ProcessEchoToolBackend>[0]["diagnosticScenario"] = "normal",
  initializeTask = true,
  backendOptions: Partial<ConstructorParameters<typeof ProcessEchoToolBackend>[0]> = {},
) {
  const clock = new FakeClock(at);
  const idGenerator = new FakeIdGenerator(Array.from({ length: 120 }, (_, index) => entityId(3700 + index)));
  const runtime = new DurableTaskRuntime({ persistence, idGenerator });
  if (initializeTask) {
    const created = await runtime.createTask(initialization());
    if (!created.ok) {
      throw new Error(created.error.code);
    }
    await requireAccepted(runtime.dispatch(startRun()));
    await requireAccepted(runtime.dispatch(startStep()));
  }
  const { records, snapshot } = processEchoCapabilityRegistry();
  const backend = new ProcessEchoToolBackend({
    adapterDescriptorId: records.descriptor.adapterDescriptorId,
    adapterDescriptorRevision: records.descriptor.revision,
    clock,
    ...(scenario === undefined ? {} : { diagnosticScenario: scenario }),
    ...backendOptions,
  });
  const handles = new RuntimeAdapterHandles([backend]);
  const executor = new ToolEffectExecutor({
    adapterDescriptorId: records.descriptor.adapterDescriptorId,
    persistence,
    handles,
    clock,
  });
  const effects = new EffectCoordinator({
    runtime,
    persistence,
    clock,
    idGenerator,
    executors: [executor],
  });
  const lockService = new TaskCapabilityLockService({
    resolver: new CapabilityResolver(snapshot),
    persistence,
    clock,
    idGenerator,
  });
  return {
    persistence,
    runtime,
    records,
    snapshot,
    backend,
    lockService,
    service: new ToolExecutionService({
      lockService,
      effects,
      authorization: new AuthorizationEvaluator(),
      confirmations: new UserConfirmationCoordinator({ runtime, persistence, clock, idGenerator }),
      persistence,
      clock,
      idGenerator,
      admission: new RuntimeAdmissionController({ clock, scheduler: new FakeScheduler() }),
      defaultAuthorization: { context: trustedAuthorizationContext() },
    }),
    recovery: new TaskRecoveryCoordinator({ persistence, effects }),
  };
}

function trustedAuthorizationContext(): ToolAuthorizationContext {
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId: entityId(3697),
      activeConfigRevision: "test-config-v1",
      canUseTools: true,
      assignedToolCapabilityIds: ["tool.echo"],
      grants: [],
    },
    resourceAccesses: [],
    availability: { enabled: true, healthy: true, credentialAvailable: true, revision: "test-health-v1" },
  };
}

async function createRecoveryHarness(persistence: TaskPersistence, clock: FakeClock) {
  const idGenerator = new FakeIdGenerator(Array.from({ length: 80 }, (_, index) => entityId(3900 + index)));
  const runtime = new DurableTaskRuntime({ persistence, idGenerator });
  const { records } = processEchoCapabilityRegistry();
  const backend = new ProcessEchoToolBackend({
    adapterDescriptorId: records.descriptor.adapterDescriptorId,
    adapterDescriptorRevision: records.descriptor.revision,
    clock,
  });
  const executor = new ToolEffectExecutor({
    adapterDescriptorId: records.descriptor.adapterDescriptorId,
    persistence,
    handles: new RuntimeAdapterHandles([backend]),
    clock,
  });
  const effects = new EffectCoordinator({ runtime, persistence, clock, idGenerator, executors: [executor] });
  return { runtime, backend, recovery: new TaskRecoveryCoordinator({ persistence, effects }) };
}

function initialization(): TaskInitialization {
  return {
    taskId: ids.task,
    agentDefinition: { agentDefinitionId: ids.agent, version: "1.0.0" },
    goal: "Verify the trusted Process Echo execution boundary",
    createdAt: at,
  };
}

function startRun(): TaskCommand {
  return {
    commandId: ids.startRun,
    taskId: ids.task,
    type: "start_run",
    issuedAt: at,
    runId: ids.run,
  };
}

function startStep(): TaskCommand {
  return {
    commandId: ids.startStep,
    taskId: ids.task,
    type: "start_step",
    issuedAt: at,
    runId: ids.run,
    stepId: ids.step,
    planRevision: { executionPlanId: ids.plan, planRevisionId: ids.planRevision, revision: 1 },
    action: toolAction({ value: "hello" }),
  };
}

function toolAction(payload: Record<string, unknown>) {
  return { actionId: ids.action, kind: "tool.echo", payload };
}

async function requireAccepted(resultPromise: ReturnType<DurableTaskRuntime["dispatch"]>): Promise<void> {
  const result = await resultPromise;
  if (!result.accepted) {
    throw new Error(result.error.code);
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("condition was not met before timeout");
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  }
}
