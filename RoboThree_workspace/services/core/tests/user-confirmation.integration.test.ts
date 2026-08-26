import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTRACT_VERSION, JsonValueSchema } from "@robothree/contracts";
import type { CapabilitySource, TaskCommand, TaskInitialization, ToolAuthorizationContext } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  AuthorizationEvaluator,
  CapabilityResolver,
  DurableTaskRuntime,
  EffectCoordinator,
  FakeClock,
  FakeIdGenerator,
  FakeScheduler,
  FakeToolExecutionBackend,
  InMemoryTaskPersistence,
  RegistryBuilder,
  RuntimeAdapterHandles,
  RuntimeAdmissionController,
  SqliteTaskPersistence,
  TaskCapabilityLockService,
  ToolEffectExecutor,
  ToolExecutionAgentBridge,
  ToolExecutionService,
  UserConfirmationCoordinator,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  sha256CanonicalJson,
} from "../src/index.js";
import type { TaskPersistence } from "../src/index.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const digest = (value: string) => `sha256:${value.repeat(64)}` as const;
const ids = {
  task: entityId(4201), agent: entityId(4202), run: entityId(4203), step: entityId(4204),
  action: entityId(4205), plan: entityId(4206), planRevision: entityId(4207),
  startRun: entityId(4208), startStep: entityId(4209), user: entityId(4210), grant: entityId(4211),
};
const at = "2026-07-22T11:00:00.000Z";
const source: CapabilitySource = {
  trust: "official",
  packageId: "robothree.official.confirmation-tests",
  packageRevision: digest("c"),
};

const variants: readonly {
  name: string;
  create(): Promise<{ persistence: TaskPersistence; cleanup(): Promise<void> }>;
}[] = [
  {
    name: "InMemory",
    async create() {
      const persistence = new InMemoryTaskPersistence(new FakeClock(at));
      await persistence.start();
      return { persistence, cleanup: () => persistence.stop() };
    },
  },
  {
    name: "SQLite",
    async create() {
      const directory = await mkdtemp(join(tmpdir(), "robothree-kaf41-confirmation-"));
      const persistence = new SqliteTaskPersistence({ databasePath: join(directory, "robothree.sqlite"), clock: new FakeClock(at) });
      await persistence.start();
      return {
        persistence,
        async cleanup() {
          await persistence.stop();
          await rm(directory, { recursive: true, force: true });
        },
      };
    },
  },
];

for (const variant of variants) {
  describe(`${variant.name} user confirmation`, () => {
    it("persists waiting and a typed user_rejected Observation without creating an Effect", async () => {
      const storage = await variant.create();
      try {
        const harness = await createHarness(storage.persistence);
        const waiting = await harness.service.execute(executionInput(harness.snapshot.registryRevision));
        expect(waiting).toMatchObject({ status: "waiting_user_confirmation" });
        if (!("request" in waiting)) {
          throw new Error("expected a confirmation request");
        }
        expect(await storage.persistence.findEffectAttemptByIdempotencyKey("secure:delete:1")).toBeUndefined();
        expect(await storage.persistence.loadUserConfirmation(waiting.request.confirmationId)).toMatchObject({
          request: { scopeDigest: waiting.request.scopeDigest },
        });
        expect((await storage.persistence.loadTask(ids.task))?.checkpoint.state.status).toBe("waiting");
        const requestedEvent = (await storage.persistence.loadEventsAfter(ids.task, 0))
          .find((event) => event.type === "authorization.user_confirmation_requested");
        expect(requestedEvent?.payload).toMatchObject({
          request: { displaySummary: "Confirm this exact Tool Action" },
        });
        expect(JSON.stringify(requestedEvent)).not.toContain("qa-only-fake-secret");
        expect(JSON.stringify(await storage.persistence.listPendingOutbox(100))).not.toContain("qa-only-fake-secret");

        const rejected = await harness.service.submitDecision({
          execution: executionInput(harness.snapshot.registryRevision),
          confirmationId: waiting.request.confirmationId,
          decision: "rejected",
          decidedByUserId: ids.user,
          decidedAt: at,
        });
        expect(rejected).toMatchObject({
          status: "user_rejected",
          state: { status: "running", runs: [{ steps: [{ status: "user_rejected" }] }] },
        });
        expect(harness.backend.calls).toHaveLength(0);
        expect(await storage.persistence.findEffectAttemptByIdempotencyKey("secure:delete:1")).toBeUndefined();
        expect((await storage.persistence.loadEventsAfter(ids.task, 0)).map((event) => event.type)).toContain(
          "authorization.user_confirmation_decided",
        );
      } finally {
        await storage.cleanup();
      }
    });

    it("resumes an exact confirmed Action and only then creates and dispatches its Effect", async () => {
      const storage = await variant.create();
      try {
        const harness = await createHarness(storage.persistence);
        const execution = executionInput(harness.snapshot.registryRevision);
        const waiting = await harness.service.execute(execution);
        if (!("request" in waiting)) {
          throw new Error("expected a confirmation request");
        }
        const completed = await harness.service.submitDecision({
          execution,
          confirmationId: waiting.request.confirmationId,
          decision: "confirmed",
          decidedByUserId: ids.user,
          decidedAt: at,
        });
        expect(completed).toMatchObject({
          accepted: true,
          state: { runs: [{ steps: [{ status: "succeeded" }] }] },
        });
        expect(harness.backend.calls).toHaveLength(1);
        expect(await storage.persistence.findEffectAttemptByIdempotencyKey("secure:delete:1")).toMatchObject({
          status: "succeeded",
          metadata: { confirmationId: waiting.request.confirmationId },
        });
        expect((await storage.persistence.loadEventsAfter(ids.task, 0))
          .find((event) => event.type === "authorization.allowed")?.payload).toMatchObject({
          subjectUserId: ids.user,
          activeConfigRevision: "config-v1",
          capabilityId: "tool.secure-delete",
        });
      } finally {
        await storage.cleanup();
      }
    });
  });
}

describe("Agent Tool confirmation bridge", () => {
  it("returns an explicit waiting state and resumes the exact durable Tool call", async () => {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    try {
      const harness = await createHarness(persistence, 6600);
      const call = {
        toolCallId: entityId(6599),
        taskId: ids.task,
        actionId: ids.action,
        capabilityId: "tool.secure-delete",
        arguments: { path: "/workspace/report.md" },
      };
      const bridge = new ToolExecutionAgentBridge({
        service: harness.service,
        persistence,
        buildExecution: (_call, signal) => ({
          ...executionInput(harness.snapshot.registryRevision),
          signal,
        }),
      });
      const waiting = await bridge.execute(call, new AbortController().signal);
      expect(waiting).toMatchObject({ status: "waiting_user_confirmation" });
      if (!("status" in waiting)) throw new Error("expected waiting confirmation");

      const completed = await bridge.submitDecision({
        call,
        confirmationId: waiting.request.confirmationId,
        decision: "confirmed",
        decidedByUserId: ids.user,
        decidedAt: at,
      });
      expect(completed).toMatchObject({
        role: "tool",
        toolCallId: call.toolCallId,
        outcome: "succeeded",
      });
      expect(harness.backend.calls).toHaveLength(1);
    } finally {
      await persistence.stop();
    }
  });
});

describe("user confirmation conflicts and concurrency", () => {
  it("fails closed when another request id claims an existing exact scope", async () => {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    try {
      const harness = await createHarness(persistence, 4250);
      const waiting = await harness.service.execute(executionInput(harness.snapshot.registryRevision));
      if (!("request" in waiting)) throw new Error("expected a confirmation request");
      expect(await harness.confirmations.request({
        ...waiting.request,
        confirmationId: entityId(4299),
      })).toMatchObject({
        accepted: false,
        error: { code: "authorization.confirmation_scope_conflict" },
      });
    } finally {
      await persistence.stop();
    }
  });

  it("serializes concurrent identical confirmations, replays the winner, and calls the Backend once", async () => {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    try {
      const harness = await createHarness(persistence, 4350);
      const execution = executionInput(harness.snapshot.registryRevision);
      const waiting = await harness.service.execute(execution);
      if (!("request" in waiting)) throw new Error("expected a confirmation request");
      const [left, right] = await Promise.all([
        harness.service.submitDecision({
          execution,
          confirmationId: waiting.request.confirmationId,
          decisionId: entityId(4398),
          decision: "confirmed",
          decidedByUserId: ids.user,
          decidedAt: at,
        }),
        harness.service.submitDecision({
          execution,
          confirmationId: waiting.request.confirmationId,
          decisionId: entityId(4399),
          decision: "confirmed",
          decidedByUserId: ids.user,
          decidedAt: at,
        }),
      ]);
      expect([left, right].every((result) => !("status" in result) || result.status !== "denied")).toBe(true);
      expect(harness.backend.calls).toHaveLength(1);
      expect((await persistence.loadUserConfirmation(waiting.request.confirmationId))?.decision).toMatchObject({
        decision: "confirmed",
        decidedByUserId: ids.user,
      });
      expect(await harness.service.submitDecision({
        execution,
        confirmationId: waiting.request.confirmationId,
        decision: "rejected",
        decidedByUserId: ids.user,
        decidedAt: at,
      })).toMatchObject({
        status: "denied",
        error: { code: "authorization.confirmation_already_decided" },
      });
    } finally {
      await persistence.stop();
    }
  });
});

describe("SQLite user confirmation recovery", () => {
  it("replays waiting_user_confirmation after crash and resumes the exact call in 5 fresh databases", async () => {
    const durableDigests: string[] = [];
    for (let round = 0; round < 5; round += 1) {
      const directory = await mkdtemp(join(tmpdir(), `robothree-kaf53-confirmation-crash-${round}-`));
      const databasePath = join(directory, "robothree.sqlite");
      const call = {
        toolCallId: entityId(7000),
        taskId: ids.task,
        actionId: ids.action,
        capabilityId: "tool.secure-delete",
        arguments: { path: "/workspace/report.md" },
      };
      let confirmationId: string;
      const firstPersistence = new SqliteTaskPersistence({
        databasePath,
        clock: new FakeClock(at),
      });
      await firstPersistence.start();
      try {
        const first = await createHarness(firstPersistence, 7100);
        const bridge = new ToolExecutionAgentBridge({
          service: first.service,
          persistence: firstPersistence,
          buildExecution: (_call, signal) => ({
            ...executionInput(first.snapshot.registryRevision),
            idempotencyKey: "secure:delete:crash",
            signal,
          }),
        });
        const waiting = await bridge.execute(call, new AbortController().signal);
        if (!("status" in waiting)) throw new Error("expected waiting confirmation");
        confirmationId = waiting.request.confirmationId;
      } finally {
        await firstPersistence.stop();
      }

      const reopened = new SqliteTaskPersistence({
        databasePath,
        clock: new FakeClock(at),
      });
      await reopened.start();
      try {
        expect(await reopened.loadUserConfirmation(confirmationId!)).toMatchObject({
          request: { confirmationId: confirmationId! },
        });
        const second = await createHarness(reopened, 7300);
        const bridge = new ToolExecutionAgentBridge({
          service: second.service,
          persistence: reopened,
          buildExecution: (_call, signal) => ({
            ...executionInput(second.snapshot.registryRevision),
            idempotencyKey: "secure:delete:crash",
            signal,
          }),
        });
        await expect(bridge.submitDecision({
          call,
          confirmationId: confirmationId!,
          decisionId: entityId(7500),
          decision: "confirmed",
          decidedByUserId: ids.user,
          decidedAt: at,
        })).resolves.toMatchObject({
          role: "tool",
          outcome: "succeeded",
          toolCallId: call.toolCallId,
        });
        expect(second.backend.calls).toHaveLength(1);
        durableDigests.push(sha256CanonicalJson(JsonValueSchema.parse({
          task: await reopened.loadTask(ids.task),
          events: await reopened.loadEventsAfter(ids.task, 0),
          confirmation: await reopened.loadUserConfirmation(confirmationId!),
          effect: await reopened.findEffectAttemptByIdempotencyKey("secure:delete:crash"),
        })));
      } finally {
        await reopened.stop();
        await rm(directory, { recursive: true, force: true });
      }
    }
    expect(new Set(durableDigests).size).toBe(1);
  });

  it("restores a pending request after close/reopen and decides it exactly once", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf41-confirmation-reopen-"));
    const databasePath = join(directory, "robothree.sqlite");
    const firstPersistence = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
    await firstPersistence.start();
    let confirmationId: string;
    try {
      const first = await createHarness(firstPersistence, 4300);
      const waiting = await first.service.execute(executionInput(first.snapshot.registryRevision));
      if (!("request" in waiting)) throw new Error("expected a confirmation request");
      confirmationId = waiting.request.confirmationId;
    } finally {
      await firstPersistence.stop();
    }

    const secondPersistence = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
    await secondPersistence.start();
    try {
      expect(await secondPersistence.loadUserConfirmation(confirmationId!)).toMatchObject({
        request: { confirmationId: confirmationId! },
      });
      const second = await createHarness(secondPersistence, 4600);
      const rejected = await second.service.submitDecision({
        execution: executionInput(second.snapshot.registryRevision),
        confirmationId: confirmationId!,
        decision: "rejected",
        decidedByUserId: ids.user,
        decidedAt: at,
      });
      expect(rejected).toMatchObject({ status: "user_rejected" });
      expect((await secondPersistence.loadUserConfirmation(confirmationId!))?.decision).toMatchObject({
        decision: "rejected",
      });
    } finally {
      await secondPersistence.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reuses an exact confirmed scope after close/reopen without a second Backend call", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf41-confirmed-reopen-"));
    const databasePath = join(directory, "robothree.sqlite");
    const firstPersistence = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
    await firstPersistence.start();
    let confirmationId: string;
    try {
      const first = await createHarness(firstPersistence, 5200);
      const execution = executionInput(first.snapshot.registryRevision);
      const waiting = await first.service.execute(execution);
      if (!("request" in waiting)) throw new Error("expected a confirmation request");
      confirmationId = waiting.request.confirmationId;
      expect(await first.service.submitDecision({
        execution,
        confirmationId,
        decision: "confirmed",
        decidedByUserId: ids.user,
        decidedAt: at,
      })).toMatchObject({ accepted: true });
      expect(first.backend.calls).toHaveLength(1);
    } finally {
      await firstPersistence.stop();
    }

    const secondPersistence = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
    await secondPersistence.start();
    try {
      const second = await createHarness(secondPersistence, 5500);
      expect((await secondPersistence.loadUserConfirmation(confirmationId!))?.decision).toMatchObject({
        decision: "confirmed",
      });
      expect(await second.service.execute(executionInput(second.snapshot.registryRevision))).toMatchObject({
        ok: true,
        replayed: true,
        attempt: { status: "succeeded" },
      });
      expect(second.backend.calls).toHaveLength(0);
    } finally {
      await secondPersistence.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retains an exact rejection after close/reopen and does not show another request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf41-rejected-reopen-"));
    const databasePath = join(directory, "robothree.sqlite");
    const firstPersistence = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
    await firstPersistence.start();
    let confirmationId: string;
    try {
      const first = await createHarness(firstPersistence, 5800);
      const execution = executionInput(first.snapshot.registryRevision);
      const waiting = await first.service.execute(execution);
      if (!("request" in waiting)) throw new Error("expected a confirmation request");
      confirmationId = waiting.request.confirmationId;
      expect(await first.service.submitDecision({
        execution,
        confirmationId,
        decision: "rejected",
        decidedByUserId: ids.user,
        decidedAt: at,
      })).toMatchObject({ status: "user_rejected" });
    } finally {
      await firstPersistence.stop();
    }

    const secondPersistence = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
    await secondPersistence.start();
    try {
      const second = await createHarness(secondPersistence, 6100);
      expect(await second.service.execute(executionInput(second.snapshot.registryRevision))).toMatchObject({
        status: "denied",
        error: { code: "authorization.user_rejected" },
      });
      expect(second.backend.calls).toHaveLength(0);
      expect(await secondPersistence.findEffectAttemptByIdempotencyKey("secure:delete:1")).toBeUndefined();
      expect((await secondPersistence.loadUserConfirmation(confirmationId!))?.decision).toMatchObject({
        decision: "rejected",
      });
    } finally {
      await secondPersistence.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("authorization revalidation", () => {
  it("does not resume or prepare an Effect when the confirmation decision transaction fails", async () => {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    try {
      const harness = await createHarness(persistence, 4750);
      const execution = executionInput(harness.snapshot.registryRevision);
      const waiting = await harness.service.execute(execution);
      if (!("request" in waiting)) throw new Error("expected a confirmation request");
      const commit = persistence.commitAcceptedCommand.bind(persistence);
      persistence.commitAcceptedCommand = async (input) => input.confirmationTransition?.type === "decision"
        ? {
          ok: false,
          error: {
            code: "persistence.injected_confirmation_failure",
            category: "persistence",
            message: "injected confirmation transaction failure",
            retryable: false,
          },
        }
        : commit(input);
      expect(await harness.service.submitDecision({
        execution,
        confirmationId: waiting.request.confirmationId,
        decision: "confirmed",
        decidedByUserId: ids.user,
        decidedAt: at,
      })).toMatchObject({
        status: "denied",
        error: { code: "persistence.injected_confirmation_failure" },
      });
      expect((await persistence.loadTask(ids.task))?.checkpoint.state.status).toBe("waiting");
      expect(await persistence.findEffectAttemptByIdempotencyKey("secure:delete:1")).toBeUndefined();
      expect((await persistence.loadUserConfirmation(waiting.request.confirmationId))?.decision).toBeUndefined();
    } finally {
      await persistence.stop();
    }
  });

  it("persists a typed denied Event without creating an Effect", async () => {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    try {
      const harness = await createHarness(persistence, 4800);
      const execution = executionInput(harness.snapshot.registryRevision);
      execution.authorization.context = {
        ...execution.authorization.context,
        subject: { ...execution.authorization.context.subject, canUseTools: false },
      };
      expect(await harness.service.execute(execution)).toMatchObject({
        status: "denied",
        error: { code: "authorization.tool_permission_missing" },
      });
      expect(await persistence.findEffectAttemptByIdempotencyKey("secure:delete:1")).toBeUndefined();
      const deniedEvent = (await persistence.loadEventsAfter(ids.task, 0))
        .find((event) => event.type === "authorization.denied");
      expect(deniedEvent?.payload).toMatchObject({
        subjectUserId: ids.user,
        activeConfigRevision: "config-v1",
        capabilityId: "tool.secure-delete",
      });
    } finally {
      await persistence.stop();
    }
  });

  it("retries a denial audit sequence conflict and persists the exact Event before returning", async () => {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    try {
      const harness = await createHarness(persistence, 4850);
      const execution = executionInput(harness.snapshot.registryRevision);
      execution.authorization.context = {
        ...execution.authorization.context,
        subject: { ...execution.authorization.context.subject, canUseTools: false },
      };
      const commit = persistence.commitAuthorizationAudit.bind(persistence);
      let auditCalls = 0;
      persistence.commitAuthorizationAudit = async (input) => {
        auditCalls += 1;
        return auditCalls === 1
          ? {
            ok: false,
            error: {
              code: "persistence.sequence_conflict",
              category: "persistence",
              message: "injected competing Task Event",
              retryable: true,
            },
          }
          : commit(input);
      };

      expect(await harness.service.execute(execution)).toMatchObject({
        status: "denied",
        error: { code: "authorization.tool_permission_missing" },
      });
      expect(auditCalls).toBe(2);
      expect((await persistence.loadEventsAfter(ids.task, 0)).map((event) => event.type))
        .toContain("authorization.denied");
    } finally {
      await persistence.stop();
    }
  });

  it("fails closed and exposes a persistent denial-audit failure without creating an Effect", async () => {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    try {
      const harness = await createHarness(persistence, 4875);
      const execution = executionInput(harness.snapshot.registryRevision);
      execution.authorization.context = {
        ...execution.authorization.context,
        subject: { ...execution.authorization.context.subject, canUseTools: false },
      };
      let auditCalls = 0;
      persistence.commitAuthorizationAudit = async () => {
        auditCalls += 1;
        return {
          ok: false,
          error: {
            code: "persistence.sequence_conflict",
            category: "persistence",
            message: "injected persistent competing Task Event",
            retryable: true,
          },
        };
      };

      expect(await harness.service.execute(execution)).toMatchObject({
        status: "denied",
        decision: { reasonCode: "authorization.tool_permission_missing" },
        error: { code: "persistence.sequence_conflict" },
      });
      expect(auditCalls).toBe(3);
      expect(await persistence.findEffectAttemptByIdempotencyKey("secure:delete:1")).toBeUndefined();
      expect((await persistence.loadEventsAfter(ids.task, 0)).map((event) => event.type))
        .not.toContain("authorization.denied");
    } finally {
      await persistence.stop();
    }
  });

  it("cancels a prepared Effect and never calls the Backend when availability narrows before DISPATCHED", async () => {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    try {
      const harness = await createHarness(persistence, 4900);
      let recheck = 0;
      const execution = executionInput(harness.snapshot.registryRevision);
      execution.authorization.currentContext = async () => {
        recheck += 1;
        const current = authorizationContext();
        return recheck <= 2
          ? current
          : { ...current, availability: { ...current.availability, enabled: false, revision: "health-v2" } };
      };
      const waiting = await harness.service.execute(execution);
      if (!("request" in waiting)) throw new Error("expected a confirmation request");
      const invalidated = await harness.service.submitDecision({
        execution,
        confirmationId: waiting.request.confirmationId,
        decision: "confirmed",
        decidedByUserId: ids.user,
        decidedAt: at,
      });
      expect(invalidated).toMatchObject({
        accepted: true,
        state: { status: "failed", terminalError: { code: "authorization.invalidated_before_dispatch" } },
      });
      expect(harness.backend.calls).toHaveLength(0);
      expect(await persistence.findEffectAttemptByIdempotencyKey("secure:delete:1")).toMatchObject({
        status: "cancelled",
        terminalError: { code: "authorization.invalidated_before_dispatch" },
      });
      expect((await persistence.loadEventsAfter(ids.task, 0)).map((event) => event.type)).toContain(
        "authorization.invalidated_before_dispatch",
      );
    } finally {
      await persistence.stop();
    }
  });

  it("does not prepare an Effect when authorization narrows after resume and before PREPARED", async () => {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    try {
      const harness = await createHarness(persistence, 4950);
      let recheck = 0;
      const execution = executionInput(harness.snapshot.registryRevision);
      execution.authorization.currentContext = async () => {
        recheck += 1;
        const current = authorizationContext();
        return recheck === 1
          ? current
          : { ...current, availability: { ...current.availability, enabled: false, revision: "health-v2" } };
      };
      const waiting = await harness.service.execute(execution);
      if (!("request" in waiting)) throw new Error("expected a confirmation request");
      expect(await harness.service.submitDecision({
        execution,
        confirmationId: waiting.request.confirmationId,
        decision: "confirmed",
        decidedByUserId: ids.user,
        decidedAt: at,
      })).toMatchObject({
        status: "denied",
        error: { code: "authorization.capability_unavailable" },
      });
      expect(harness.backend.calls).toHaveLength(0);
      expect(await persistence.findEffectAttemptByIdempotencyKey("secure:delete:1")).toBeUndefined();
    } finally {
      await persistence.stop();
    }
  });
});

async function createHarness(persistence: TaskPersistence, idBase = 4300) {
  const clock = new FakeClock(at);
  const idGenerator = new FakeIdGenerator(Array.from({ length: 160 }, (_, index) => entityId(idBase + index)));
  const runtime = new DurableTaskRuntime({ persistence, idGenerator });
  const created = await runtime.createTask(initialization());
  if (!created.ok) throw new Error(created.error.code);
  await accepted(runtime.dispatch(startRun()));
  await accepted(runtime.dispatch(startStep()));

  const { records, snapshot } = registry();
  const backend = new FakeToolExecutionBackend({
    adapterDescriptorId: records.descriptor.adapterDescriptorId,
    adapterDescriptorRevision: records.descriptor.revision,
  });
  const effects = new EffectCoordinator({
    runtime,
    persistence,
    clock,
    idGenerator,
    executors: [new ToolEffectExecutor({
      adapterDescriptorId: records.descriptor.adapterDescriptorId,
      persistence,
      handles: new RuntimeAdapterHandles([backend]),
      clock,
    })],
  });
  const lockService = new TaskCapabilityLockService({
    resolver: new CapabilityResolver(snapshot), persistence, clock, idGenerator,
  });
  const confirmations = new UserConfirmationCoordinator({ runtime, persistence, clock, idGenerator });
  const service = new ToolExecutionService({
    lockService,
    effects,
    authorization: new AuthorizationEvaluator(),
    confirmations,
    persistence,
    clock,
    idGenerator,
    admission: new RuntimeAdmissionController({ clock, scheduler: new FakeScheduler() }),
  });
  return { service, confirmations, backend, snapshot, persistence };
}

function registry() {
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "tool.secure-delete",
    kind: "tool",
    name: "Secure delete",
    description: "Deletes one granted file after user confirmation.",
    source,
    tool: {
      inputSchema: { type: "object" },
      readOnlyHint: false,
      risk: { schemaVersion: CONTRACT_VERSION, sourceRevision: "secure-delete-v1", staticFacts: ["destructive_file"] },
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.tool.secure-delete",
    adapterKind: "tool_execution_backend",
    source,
    implementationRef: "core:secure-delete-test",
    runtimeBoundary: "in_process",
    protocol: { name: "robothree-tool", version: "v1alpha1" },
    effectRecoveryMode: "idempotent_retry",
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.tool.secure-delete",
    capability: { capabilityId: definition.capabilityId, capabilityRevision: definition.revision },
    adapterDescriptor: { adapterDescriptorId: descriptor.adapterDescriptorId, adapterDescriptorRevision: descriptor.revision },
    port: "tool_execution_backend",
    source,
  });
  const snapshot = new RegistryBuilder({ trustedSources: [source] })
    .registerCapability(definition)
    .registerBinding(binding)
    .registerAdapterDescriptor(descriptor)
    .finalize();
  return { records: { definition, descriptor, binding }, snapshot };
}

function executionInput(registryRevision: string) {
  return {
    taskId: ids.task,
    runId: ids.run,
    stepId: ids.step,
    registryRevision,
    capabilityId: "tool.secure-delete",
    action: secureAction(),
    idempotencyKey: "secure:delete:1",
    authorization: { context: authorizationContext() },
  };
}

function authorizationContext(): ToolAuthorizationContext {
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId: ids.user,
      activeConfigRevision: "config-v1",
      canUseTools: true,
      assignedToolCapabilityIds: ["tool.secure-delete"],
      grants: [{
        schemaVersion: CONTRACT_VERSION,
        grantId: ids.grant,
        kind: "workspace",
        rootRealPath: "/workspace",
        operations: ["delete"],
      }],
    },
    resourceAccesses: [{
      grantId: ids.grant,
      targetRealPath: "/workspace/report.md",
      operation: "delete",
      protectedResource: false,
    }],
    availability: { enabled: true, healthy: true, credentialAvailable: true, revision: "health-v1" },
  };
}

function initialization(): TaskInitialization {
  return {
    taskId: ids.task,
    agentDefinition: { agentDefinitionId: ids.agent, version: "1.0.0" },
    goal: "Verify durable user confirmation",
    createdAt: at,
  };
}

function startRun(): TaskCommand {
  return { commandId: ids.startRun, taskId: ids.task, type: "start_run", issuedAt: at, runId: ids.run };
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
    action: secureAction(),
  };
}

function secureAction() {
  return { actionId: ids.action, kind: "tool.secure-delete", payload: { path: "/workspace/report.md" } };
}

async function accepted(resultPromise: ReturnType<DurableTaskRuntime["dispatch"]>) {
  const result = await resultPromise;
  if (!result.accepted) throw new Error(result.error.code);
}
