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
  FakeToolExecutionBackend,
  InMemoryTaskPersistence,
  RuntimeAdapterHandles,
  RuntimeAdmissionController,
  TaskCapabilityLockService,
  ToolEffectExecutor,
  ToolExecutionAgentBridge,
  ToolExecutionService,
  UserConfirmationCoordinator,
} from "../src/index.js";
import { capabilityIds, capabilityRegistry } from "./capability.fixtures.js";
import type { ToolExecutionRequest } from "../src/index.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const ids = {
  task: capabilityIds.task,
  missingTask: entityId(3299),
  agent: entityId(3202),
  run: entityId(3203),
  step: entityId(3204),
  action: entityId(3205),
  plan: entityId(3206),
  planRevision: entityId(3207),
  startRun: entityId(3208),
  startStep: entityId(3209),
};
const at = "2026-07-21T01:20:00.000Z";

describe("Fake Tool capability execution", () => {
  it("persists lock then records Effect, exact Observation, Event, and Checkpoint", async () => {
    const harness = await createHarness();
    try {
      const result = await harness.service.execute({
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
        action: toolAction(),
        idempotencyKey: `tool:${ids.task}:${ids.action}`,
      });
      expect(result).toMatchObject({ accepted: true, state: { revision: 3 } });
      const [lock] = await harness.persistence.listTaskCapabilityLocks(ids.task);
      expect(lock).toMatchObject({
        definitionSnapshot: { capabilityId: "tool.echo" },
        bindingSnapshot: { bindingId: "binding.tool.echo" },
        adapterDescriptorSnapshot: { adapterDescriptorId: harness.records.descriptor.adapterDescriptorId },
      });
      expect(harness.backend.calls).toHaveLength(1);
      expect(harness.backend.calls[0]?.lock.lockId).toBe(lock?.lockId);
      expect((await harness.runtime.snapshot(ids.task))?.runs[0]?.steps[0]).toMatchObject({
        status: "succeeded",
        observation: { actionId: ids.action, outcome: "succeeded", output: { value: "hello" } },
      });
      const events = await harness.persistence.loadEventsAfter(ids.task, 0);
      expect(events.map((event) => event.type)).toEqual([
        "runtime.command_applied",
        "runtime.command_applied",
        "authorization.allowed",
        "runtime.effect_intent_recorded",
        "runtime.effect_dispatched",
        "runtime.command_applied",
        "runtime.effect_result_recorded",
      ]);
      expect(events.find((event) => event.type === "authorization.allowed")?.payload).toMatchObject({
        subjectUserId: entityId(3297),
        activeConfigRevision: "test-config-v1",
        lockId: lock?.lockId,
        capabilityId: "tool.echo",
        toolCapabilityRevision: lock?.definitionSnapshot.revision,
        bindingId: lock?.bindingSnapshot.bindingId,
        bindingRevision: lock?.bindingSnapshot.revision,
        adapterDescriptorId: lock?.adapterDescriptorSnapshot.adapterDescriptorId,
        adapterDescriptorRevision: lock?.adapterDescriptorSnapshot.revision,
      });
      const attempts = await harness.persistence.listRecoverableEffectAttempts();
      expect(attempts).toEqual([]);
      expect(await harness.persistence.findEffectAttemptByIdempotencyKey(`tool:${ids.task}:${ids.action}`))
        .toMatchObject({ status: "succeeded", requestRef: lock?.lockId });
    } finally {
      await harness.persistence.stop();
    }
  });

  it("never creates an Effect Intent when TaskCapabilityLock persistence cannot succeed", async () => {
    const harness = await createHarness();
    try {
      await expect(harness.service.execute({
        taskId: ids.missingTask,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
        action: toolAction(),
        idempotencyKey: "tool:missing-task",
      })).rejects.toThrow("persistence.task_not_found");
      expect(await harness.persistence.findEffectAttemptByIdempotencyKey("tool:missing-task")).toBeUndefined();
      expect((await harness.persistence.loadTask(ids.task))?.head.lastEventSequence).toBe(2);
    } finally {
      await harness.persistence.stop();
    }
  });

  it("fails closed before Effect PREPARED when the allowed Authorization audit cannot persist", async () => {
    const harness = await createHarness();
    try {
      harness.persistence.commitAuthorizationAudit = async () => ({
        ok: false,
        error: {
          code: "persistence.injected_authorization_audit_failure",
          category: "persistence",
          message: "injected allowed audit failure",
          retryable: false,
        },
      });
      expect(await harness.service.execute({
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
        action: toolAction(),
        idempotencyKey: "tool:audit-failure",
      })).toMatchObject({
        status: "denied",
        decision: { reasonCode: "authorization.audit_not_persisted" },
        error: { code: "persistence.injected_authorization_audit_failure" },
      });
      expect(harness.backend.calls).toHaveLength(0);
      expect(await harness.persistence.findEffectAttemptByIdempotencyKey("tool:audit-failure")).toBeUndefined();
    } finally {
      await harness.persistence.stop();
    }
  });

  it("rejects an already-expired Tool deadline before Effect PREPARED", async () => {
    const harness = await createHarness();
    try {
      expect(await harness.service.execute({
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
        action: toolAction(),
        idempotencyKey: "tool:deadline",
        deadlineAt: at,
      })).toMatchObject({
        status: "not_admitted",
        error: { code: "admission.deadline_expired", category: "timeout" },
      });
      expect(await harness.persistence.findEffectAttemptByIdempotencyKey("tool:deadline")).toBeUndefined();
      expect(harness.backend.calls).toHaveLength(0);
      expect(await harness.persistence.listRecoverableEffectAttempts()).toEqual([]);
    } finally {
      await harness.persistence.stop();
    }
  });

  it("keeps the Effect dispatched when a Backend result cannot prove the external outcome", async () => {
    const harness = await createHarness(true);
    try {
      await expect(harness.service.execute({
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
        action: toolAction(),
        idempotencyKey: "tool:mismatched-observation",
      })).rejects.toThrow("tool.invalid_observation");
      expect(await harness.persistence.findEffectAttemptByIdempotencyKey("tool:mismatched-observation"))
        .toMatchObject({ status: "dispatched" });
      expect((await harness.runtime.snapshot(ids.task))?.runs[0]?.steps[0]).toMatchObject({
        status: "running",
      });
      expect((await harness.runtime.snapshot(ids.task))?.runs[0]?.steps[0]?.observation).toBeUndefined();
    } finally {
      await harness.persistence.stop();
    }
  });

  it("applies Tool backpressure after Authorization but before Effect PREPARED", async () => {
    const admission = new RuntimeAdmissionController({
      clock: new FakeClock(at),
      scheduler: new FakeScheduler(),
      maxActiveTools: 1,
      maxQueued: 1,
    });
    const active = await admission.acquire({ requestId: "occupied", kind: "tool" });
    const queued = admission.acquire({ requestId: "queued", kind: "tool" });
    const harness = await createHarness(false, admission);
    try {
      expect(await harness.service.execute({
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.echo",
        action: toolAction(),
        idempotencyKey: "tool:queue-full",
      })).toMatchObject({
        status: "not_admitted",
        error: { code: "admission.queue_full" },
      });
      expect(harness.backend.calls).toHaveLength(0);
      expect(await harness.persistence.findEffectAttemptByIdempotencyKey("tool:queue-full")).toBeUndefined();
      expect((await harness.persistence.loadEventsAfter(ids.task, 0)).map((event) => event.type))
        .toContain("authorization.allowed");
    } finally {
      if (active.ok) {
        active.lease.release();
      }
      const queuedResult = await queued;
      if (queuedResult.ok) {
        queuedResult.lease.release();
      }
      await harness.persistence.stop();
    }
  });

  it("bridges a model Tool Call through ToolExecutionService to the durable Observation", async () => {
    const harness = await createHarness();
    try {
      const call = {
        toolCallId: entityId(3296),
        taskId: ids.task,
        actionId: ids.action,
        capabilityId: "tool.echo",
        arguments: { value: "hello" },
      };
      const bridge = new ToolExecutionAgentBridge({
        service: harness.service,
        persistence: harness.persistence,
        buildExecution: (_call, signal) => ({
          taskId: ids.task,
          runId: ids.run,
          stepId: ids.step,
          registryRevision: harness.snapshot.registryRevision,
          capabilityId: "tool.echo",
          action: toolAction(),
          idempotencyKey: `agent:${call.toolCallId}`,
          authorization: { context: trustedAuthorizationContext() },
          signal,
        }),
      });
      const result = await bridge.execute(call, new AbortController().signal);
      expect(result).toMatchObject({
        role: "tool",
        toolCallId: call.toolCallId,
        taskId: ids.task,
        actionId: ids.action,
        outcome: "succeeded",
        content: [{ text: "{\"value\":\"hello\"}" }],
      });
      expect(await harness.persistence.findEffectAttemptByIdempotencyKey(`agent:${call.toolCallId}`))
        .toMatchObject({ status: "succeeded" });
    } finally {
      await harness.persistence.stop();
    }
  });

  it("links only a durable PREPARED Effect before Backend dispatch", async () => {
    const harness = await createHarness();
    try {
      const call = {
        toolCallId: entityId(3296),
        taskId: ids.task,
        actionId: ids.action,
        capabilityId: "tool.echo",
        arguments: { value: "hello" },
      };
      const bridge = new ToolExecutionAgentBridge({
        service: harness.service,
        persistence: harness.persistence,
        buildExecution: (_call, signal) => ({
          taskId: ids.task,
          runId: ids.run,
          stepId: ids.step,
          registryRevision: harness.snapshot.registryRevision,
          capabilityId: "tool.echo",
          action: toolAction(),
          idempotencyKey: `agent-link:${call.toolCallId}`,
          authorization: { context: trustedAuthorizationContext() },
          signal,
        }),
      });
      let linkedEffectAttemptId: string | undefined;
      await expect(bridge.execute(call, new AbortController().signal, {
        onEffectPrepared: async (effectAttemptId) => {
          linkedEffectAttemptId = effectAttemptId;
          expect(harness.backend.calls).toHaveLength(0);
          expect(await harness.persistence.loadEffectAttempt(effectAttemptId))
            .toMatchObject({ status: "prepared", actionId: call.actionId });
        },
      })).resolves.toMatchObject({ role: "tool", outcome: "succeeded" });
      expect(linkedEffectAttemptId).toBeDefined();
      expect(harness.backend.calls).toHaveLength(1);
      expect(await harness.persistence.loadEffectAttempt(linkedEffectAttemptId!))
        .toMatchObject({ status: "succeeded" });
    } finally {
      await harness.persistence.stop();
    }
  });

  it("does not call Backend when Effect linkage fails and resumes the same prepared Effect", async () => {
    const harness = await createHarness();
    try {
      const call = {
        toolCallId: entityId(3296),
        taskId: ids.task,
        actionId: ids.action,
        capabilityId: "tool.echo",
        arguments: { value: "hello" },
      };
      const idempotencyKey = `agent-link-failure:${call.toolCallId}`;
      const bridge = new ToolExecutionAgentBridge({
        service: harness.service,
        persistence: harness.persistence,
        buildExecution: (_call, signal) => ({
          taskId: ids.task,
          runId: ids.run,
          stepId: ids.step,
          registryRevision: harness.snapshot.registryRevision,
          capabilityId: "tool.echo",
          action: toolAction(),
          idempotencyKey,
          authorization: { context: trustedAuthorizationContext() },
          signal,
        }),
      });
      await expect(bridge.execute(call, new AbortController().signal, {
        onEffectPrepared: async () => {
          throw new Error("conversation disposition unavailable");
        },
      })).rejects.toThrow("conversation disposition unavailable");
      expect(harness.backend.calls).toHaveLength(0);
      const prepared = await harness.persistence.findEffectAttemptByIdempotencyKey(idempotencyKey);
      expect(prepared).toMatchObject({ status: "prepared" });

      let replayedEffectAttemptId: string | undefined;
      await expect(bridge.execute(call, new AbortController().signal, {
        onEffectPrepared: async (effectAttemptId) => {
          replayedEffectAttemptId = effectAttemptId;
        },
      })).resolves.toMatchObject({ role: "tool", outcome: "succeeded" });
      expect(replayedEffectAttemptId).toBe(prepared?.effectAttemptId);
      expect(harness.backend.calls).toHaveLength(1);
    } finally {
      await harness.persistence.stop();
    }
  });
});

async function createHarness(
  returnMismatchedObservation = false,
  admission?: RuntimeAdmissionController,
) {
  const clock = new FakeClock(at);
  const persistence = new InMemoryTaskPersistence(clock);
  await persistence.start();
  const idGenerator = new FakeIdGenerator(
    Array.from({ length: 100 }, (_, index) => entityId(3300 + index)),
  );
  const runtime = new DurableTaskRuntime({ persistence, idGenerator });
  const created = await runtime.createTask(initialization());
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  await requireAccepted(runtime.dispatch(startRun()));
  await requireAccepted(runtime.dispatch(startStep()));

  const { records, snapshot } = capabilityRegistry();
  const backend = new FakeToolExecutionBackend({
    adapterDescriptorId: records.descriptor.adapterDescriptorId,
    adapterDescriptorRevision: records.descriptor.revision,
    ...(returnMismatchedObservation ? {
      handler: (request: ToolExecutionRequest) => ({
        observationId: entityId(3298),
        actionId: ids.missingTask,
        observedAt: request.requestedAt,
        outcome: "succeeded" as const,
        output: request.action.payload,
      }),
    } : {}),
  });
  const handles = new RuntimeAdapterHandles([backend]);
  const toolExecutor = new ToolEffectExecutor({
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
    executors: [toolExecutor],
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
    service: new ToolExecutionService({
      lockService,
      effects,
      authorization: new AuthorizationEvaluator(),
      confirmations: new UserConfirmationCoordinator({ runtime, persistence, clock, idGenerator }),
      persistence,
      clock,
      idGenerator,
      admission: admission ?? new RuntimeAdmissionController({
        clock,
        scheduler: new FakeScheduler(),
      }),
      defaultAuthorization: { context: trustedAuthorizationContext() },
    }),
  };
}

function trustedAuthorizationContext(): ToolAuthorizationContext {
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId: entityId(3297),
      activeConfigRevision: "test-config-v1",
      canUseTools: true,
      assignedToolCapabilityIds: ["tool.echo"],
      grants: [],
    },
    resourceAccesses: [],
    availability: { enabled: true, healthy: true, credentialAvailable: true, revision: "test-health-v1" },
  };
}

function initialization(): TaskInitialization {
  return {
    taskId: ids.task,
    agentDefinition: { agentDefinitionId: ids.agent, version: "1.0.0" },
    goal: "Execute a locked Fake Tool",
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
    action: toolAction(),
  };
}

function toolAction() {
  return { actionId: ids.action, kind: "tool.echo", payload: { value: "hello" } };
}

async function requireAccepted(resultPromise: ReturnType<DurableTaskRuntime["dispatch"]>): Promise<void> {
  const result = await resultPromise;
  if (!result.accepted) {
    throw new Error(result.error.code);
  }
}
