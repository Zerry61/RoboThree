import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CONTRACT_VERSION,
  JsonValueSchema,
  SubmitTurnRecordSchema,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  CapabilityResolver,
  DesktopApplicationFacade,
  DesktopConversationProjectionService,
  DesktopSessionService,
  EphemeralWorkspaceSelectionStore,
  FakeAgentLoopStarter,
  FakeClock,
  FakeRuntimeSelectionContextProvider,
  HeadlessDesktopRuntime,
  InMemoryConversationPersistence,
  InMemoryDesktopFoundationPersistence,
  InMemorySubmitTurnPersistence,
  InMemoryReasoningProfileSource,
  InMemoryTaskPersistence,
  InMemoryTrustedRuntimeCatalog,
  ModelEligibilityEvaluator,
  NodeWorkspacePathResolver,
  RegistryBuilder,
  RuntimeSelectionService,
  ReasoningModeLockPlanner,
  TaskLockedReasoningProfileSubjectResolver,
  RuntimeCatalogProjectionService,
  SqliteConversationPersistence,
  SqliteDesktopFoundationPersistence,
  SqliteSubmitTurnPersistence,
  SqliteTaskPersistence,
  SubmitTurnCoordinator,
  SubmitTurnRecoveryCoordinator,
  SystemIdGenerator,
  TaskCapabilityLockService,
  WorkspaceGrantService,
  createAdapterDescriptor,
  createAgentDefinitionRevision,
  createCapabilityBinding,
  createCapabilityDefinition,
  createModelDefinition,
  createReasoningProfile,
  calculateReasoningSupportRevision,
} from "../src/index.js";
import { sha256CanonicalJson } from "../src/persistence/digest.js";
import type {
  ConversationPersistence,
  Scheduler,
  SubmitTurnCoordinatorFaultInjector,
  SubmitTurnPersistence,
  SubmitTurnPersistenceFaultInjector,
  TaskPersistence,
  ReasoningProfileSource,
} from "../src/index.js";

const at = "2026-07-26T16:20:00.000Z";
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const sessionId = "019f9200-0000-7000-8000-000000000001";
const desktopSessionId = `session:${sessionId}`;
const commandId = "019f9200-0000-7000-8000-000000000010";
const source = {
  trust: "official" as const,
  packageId: "robothree.official.dcf11c",
  packageRevision: digest("a"),
};

describe("DCF-1.1C SubmitTurnCoordinator", () => {
  it("runs the high-level Headless command and replays without duplicate facts", async () => {
    const harness = await createMemoryHarness();
    try {
      const first = await harness.headless.submitTurn(command());
      expect(first).toMatchObject({
        ok: true,
        value: {
          status: "accepted",
          clientTurnId: "client-turn-0001",
          runtimeSelectionSummary: {
            agent: { id: "agent.general" },
            resolvedModel: { id: "model.default" },
          },
        },
      });
      const replay = await harness.headless.submitTurn(command());
      expect(replay).toMatchObject({
        ok: true,
        value: { status: "replayed" },
      });
      expect(await harness.conversation.loadMessageRange(
        sessionId,
        1,
        10,
      )).toHaveLength(1);
      expect(await harness.tasks.listTasksBySession(sessionId)).toHaveLength(1);
      expect(harness.loop.startedCount()).toBe(1);
      expect((await harness.headless.listDeliveries()).events).toHaveLength(1);
      expect(await harness.headless.querySubmitTurn({
        contractVersion: "v1alpha1",
        type: "submit_turn_status",
        queryId: "019f9200-0000-7000-8000-000000000090",
        correlationId: "019f9200-0000-7000-8000-000000000091",
        clientInstanceId: "019f9200-0000-7000-8000-000000000092",
        submitTurnCommandId: commandId,
      })).toMatchObject({ ok: true, value: { status: "accepted" } });
      const coordinationRecord = await harness.coordination.loadRecord(commandId);
      expect(coordinationRecord).toMatchObject({
        schemaVersion: "v1alpha2",
        transportContractVersion: "v1alpha1",
        authorizationPlan: {
          requestedMode: "smart_confirm",
          resolvedMode: "smart_confirm",
          source: "legacy_default",
        },
      });
      expect(await harness.tasks.loadAuthorizationAwareSubmitTurnTaskBundle(
        commandId,
      )).toMatchObject({
        selection: {
          requestedMode: "smart_confirm",
          source: "legacy_default",
        },
      });
      expect(JSON.stringify(coordinationRecord)).not.toContain(
        "Create a durable task",
      );
      expect(coordinationRecord).not.toHaveProperty("runtimeHandle");
      expect(coordinationRecord).not.toHaveProperty("credentialRef");
    } finally {
      await harness.cleanup();
    }
  });

  it("submits v1alpha2 with an explicit authorization plan and exact receipt", async () => {
    const harness = await createMemoryHarness();
    try {
      const first = await harness.facade.submitTurnV1Alpha2(commandV1Alpha2());
      expect(first).toMatchObject({
        ok: true,
        value: {
          contractVersion: "v1alpha2",
          status: "accepted",
          runtimeSelectionSummary: {
            resolvedAuthorization: {
              requestedMode: "task_scoped",
              resolvedMode: "task_scoped",
              source: "user_selected",
            },
          },
        },
      });
      const record = await harness.coordination.loadRecord(commandId);
      expect(record).toMatchObject({
        schemaVersion: "v1alpha2",
        transportContractVersion: "v1alpha2",
        authorizationPlan: {
          requestedMode: "task_scoped",
          source: "user_selected",
        },
      });
      expect(await harness.tasks.loadAuthorizationAwareSubmitTurnTaskBundle(
        commandId,
      )).toMatchObject({
        selection: { resolvedMode: "task_scoped" },
      });
      expect(await harness.facade.querySubmitTurnV1Alpha2({
        contractVersion: "v1alpha2",
        queryId: "019f9200-0000-7000-8000-000000000093",
        correlationId: "019f9200-0000-7000-8000-000000000094",
        clientInstanceId: "019f9200-0000-7000-8000-000000000095",
        type: "submit_turn_status",
        submitTurnCommandId: commandId,
      })).toMatchObject({
        ok: true,
        value: { contractVersion: "v1alpha2", status: "accepted" },
      });
      expect(await harness.coordinator.submit(command())).toMatchObject({
        ok: false,
        error: { code: "submit_turn.idempotency_conflict" },
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("materializes SubmitTurn v1alpha3 with one exact Max Profile load and starts its locked loop", async () => {
    let profileLoadCount = 0;
    const profileBox: {
      value?: Awaited<ReturnType<ReasoningProfileSource["loadExact"]>>;
    } = {};
    const profiles: ReasoningProfileSource = {
      async loadExact(subject) {
        profileLoadCount += 1;
        const loaded = profileBox.value;
        return loaded?.subject.modelCapabilityId === subject.modelCapabilityId
          ? loaded
          : undefined;
      },
    };
    const harness = await createMemoryHarness({ reasoningProfiles: profiles });
    profileBox.value = harness.reasoningProfile;
    try {
      const result = await harness.coordinator.submitV1Alpha3(
        commandV1Alpha3(harness.reasoningSupportRevision),
      );
      expect(result).toMatchObject({
        ok: true,
        receipt: {
          contractVersion: "v1alpha3",
          status: "accepted",
          runtimeSelectionSummary: {
            reasoning: {
              requestedMode: "max",
              resolvedMode: "max",
              resolutionReason: "applied",
            },
          },
        },
      });
      expect(profileLoadCount).toBe(1);
      expect(harness.loop.startedCount()).toBe(1);
      expect(await harness.coordination.listRecoverable(10)).toEqual([]);
      expect(await harness.tasks.loadReasoningAwareSubmitTurnTaskBundle(commandId))
        .toMatchObject({
          runtimeSelection: {
            schemaVersion: "v1alpha2",
            reasoningModeLock: { resolution: "max_applied" },
          },
        });
      expect(await harness.tasks.loadAuthorizationAwareSubmitTurnTaskBundle(commandId))
        .toBeUndefined();
    } finally {
      await harness.cleanup();
    }
  });

  it("plans default without loading a Reasoning Profile", async () => {
    const profiles: ReasoningProfileSource = {
      async loadExact() {
        throw new Error("default must not load a Reasoning Profile");
      },
    };
    const harness = await createMemoryHarness({ reasoningProfiles: profiles });
    try {
      expect(await harness.coordinator.submitV1Alpha3(
        commandV1Alpha3Default(),
      )).toMatchObject({
        ok: true,
        receipt: {
          runtimeSelectionSummary: {
            reasoning: {
              requestedMode: "default",
              resolvedMode: "model_default",
              resolutionReason: "requested_default",
            },
          },
        },
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("returns stale before any durable Task, Message, coordination, Receipt or Loop side effect", async () => {
    const harness = await createMemoryHarness();
    try {
      expect(await harness.coordinator.submitV1Alpha3(
        commandV1Alpha3(digest("f")),
      )).toMatchObject({
        ok: false,
        error: { code: "reasoning_selection_stale" },
      });
      expect(await harness.coordination.loadRecord(commandId)).toBeUndefined();
      expect(await harness.coordination.loadReceipt(commandId)).toBeUndefined();
      expect(await harness.conversation.loadMessageRange(sessionId, 1, 10)).toEqual([]);
      expect(await harness.tasks.listTasksBySession(sessionId)).toEqual([]);
      expect(harness.loop.startedCount()).toBe(0);
    } finally {
      await harness.cleanup();
    }
  });

  it("materializes unsupported and unknown Max fallbacks without private strategy refs", async () => {
    for (const expected of ["unsupported", "unknown"] as const) {
      let profile: ReturnType<typeof createReasoningProfile> | undefined;
      const profiles: ReasoningProfileSource = {
        async loadExact() { return profile; },
      };
      const harness = await createMemoryHarness({ reasoningProfiles: profiles });
      try {
        profile = expected === "unsupported"
          ? createReasoningProfile({
            schemaVersion: "v1alpha1",
            profileId: "reasoning.profile.model-default-unsupported",
            subject: harness.reasoningProfile.subject,
            support: "unsupported",
            safeUnavailableReasonCode: "reasoning.max.unsupported",
          })
          : undefined;
        const revision = calculateReasoningSupportRevision({
          subject: harness.reasoningProfile.subject,
          ...(profile === undefined ? {} : { profile }),
        });
        const result = await harness.coordinator.submitV1Alpha3({
          ...commandV1Alpha3(revision),
          commandId: expected === "unsupported"
            ? commandId
            : "019f9200-0000-7000-8000-000000000019",
          clientTurnId: `client-turn-${expected}`,
          selectionRequest: {
            ...commandV1Alpha3(revision).selectionRequest,
            reasoningPreference: {
              requestedMode: "max",
              observedMaxSupport: expected,
              observedMaxSupportRevision: revision,
            },
          },
        });
        expect(result).toMatchObject({
          ok: true,
          receipt: {
            runtimeSelectionSummary: {
              reasoning: {
                requestedMode: "max",
                resolvedMode: "model_default",
                resolutionReason: expected === "unsupported"
                  ? "unsupported"
                  : "capability_unknown",
              },
            },
          },
        });
        const serialized = JSON.stringify(result);
        expect(serialized).not.toMatch(/strategyRef|timeoutPolicyRef|mappingKind/u);
      } finally {
        await harness.cleanup();
      }
    }
  });

  it("fails unavailable before durable side effects when Profile loading cannot be proven", async () => {
    const harness = await createMemoryHarness({
      reasoningProfiles: {
        async loadExact() { throw new Error("profile source unavailable"); },
      },
    });
    try {
      expect(await harness.coordinator.submitV1Alpha3(
        commandV1Alpha3(harness.reasoningSupportRevision),
      )).toMatchObject({
        ok: false,
        error: { code: "reasoning_profile_unavailable" },
      });
      expect(await harness.coordination.loadRecord(commandId)).toBeUndefined();
      expect(await harness.coordination.loadReceipt(commandId)).toBeUndefined();
      expect(await harness.conversation.loadMessageRange(sessionId, 1, 10)).toEqual([]);
      expect(await harness.tasks.listTasksBySession(sessionId)).toEqual([]);
      expect(harness.loop.startedCount()).toBe(0);
    } finally {
      await harness.cleanup();
    }
  });

  it("recovers the accepted v1alpha3 plan without reloading current Profile", async () => {
    let profileLoadCount = 0;
    let exactProfile: Awaited<ReturnType<ReasoningProfileSource["loadExact"]>>;
    const profiles: ReasoningProfileSource = {
      async loadExact() {
        profileLoadCount += 1;
        return exactProfile;
      },
    };
    let fail = true;
    const harness = await createMemoryHarness({
      reasoningProfiles: profiles,
      coordinatorFault(point) {
        if (fail && point === "submit_turn.coordinator.after_message_append") {
          fail = false;
          throw new Error("simulated v1alpha3 process loss");
        }
      },
    });
    exactProfile = harness.reasoningProfile;
    try {
      await expect(harness.coordinator.submitV1Alpha3(
        commandV1Alpha3(harness.reasoningSupportRevision),
      )).rejects.toThrow("simulated v1alpha3 process loss");
      expect(profileLoadCount).toBe(1);
      exactProfile = undefined;
      expect(await harness.coordinator.resume(commandId)).toMatchObject({
        ok: true,
        receipt: { contractVersion: "v1alpha3", status: "accepted" },
      });
      expect(profileLoadCount).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });

  it("normalizes an accepted legacy record before recovery side effects", async () => {
    const oracle = await createMemoryHarness();
    const target = await createMemoryHarness();
    try {
      expect(await oracle.coordinator.submit(command())).toMatchObject({ ok: true });
      const planned = await oracle.coordination.loadRecord(commandId);
      expect(planned?.schemaVersion).toBe("v1alpha2");
      const {
        authorizationPlan: _authorizationPlan,
        transportContractVersion: _transportContractVersion,
        loopStartedAt: _loopStartedAt,
        selectionRequest,
        ...base
      } = planned as Extract<typeof planned, { schemaVersion: "v1alpha2" }>;
      const {
        authorizationPreference: _authorizationPreference,
        ...legacySelectionRequest
      } = selectionRequest;
      const legacy = SubmitTurnRecordSchema.parse({
        ...base,
        schemaVersion: "v1alpha1",
        selectionRequest: legacySelectionRequest,
        status: "accepted",
        updatedAt: base.createdAt,
      });
      const userMessage = {
        schemaVersion: "v1alpha1" as const,
        role: "user" as const,
        content: [{ type: "text" as const, text: command().userInput }],
      };
      expect(await target.conversation.prepareMessage({
        messageId: legacy.internalUserMessageId,
        sessionId: legacy.internalSessionId,
        taskId: legacy.internalTaskId,
        messageDigest: sha256CanonicalJson(JsonValueSchema.parse(userMessage)),
        message: userMessage,
        createdAt: legacy.createdAt,
      })).toMatchObject({ ok: true });
      expect(await target.coordination.prepareAccepted(legacy))
        .toMatchObject({ ok: true });

      expect(await target.coordinator.resume(commandId)).toMatchObject({
        ok: true,
        receipt: { status: "accepted" },
      });
      expect(await target.coordination.loadRecord(commandId)).toMatchObject({
        schemaVersion: "v1alpha2",
        transportContractVersion: "v1alpha1",
        authorizationPlan: {
          resolvedMode: "smart_confirm",
          source: "legacy_default",
        },
      });
      expect(await target.tasks.loadAuthorizationAwareSubmitTurnTaskBundle(
        commandId,
      )).toMatchObject({
        selection: { source: "legacy_default" },
      });
    } finally {
      await target.cleanup();
      await oracle.cleanup();
    }
  });

  it("serializes concurrent duplicates and rejects clientTurn identity drift", async () => {
    const harness = await createMemoryHarness();
    try {
      const results = await Promise.all([
        harness.coordinator.submit(command()),
        harness.coordinator.submit(command()),
        harness.coordinator.submit(command()),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(3);
      expect(await harness.conversation.loadMessageRange(
        sessionId,
        1,
        10,
      )).toHaveLength(1);
      expect(await harness.coordinator.submit({
        ...command(),
        commandId: "019f9200-0000-7000-8000-000000000011",
      })).toMatchObject({
        ok: false,
        error: { code: "submit_turn.idempotency_conflict" },
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("A1 leaves no durable side effect before accepted-plan commit", async () => {
    let fail = true;
    const harness = await createMemoryHarness({
      coordinatorFault(point) {
        if (fail && point === "submit_turn.coordinator.after_plan_before_accept") {
          fail = false;
          throw new Error("simulated A1 process loss");
        }
      },
    });
    try {
      await expect(harness.coordinator.submitV1Alpha2(commandV1Alpha2()))
        .rejects.toThrow("simulated A1 process loss");
      expect(await harness.coordination.loadRecord(commandId)).toBeUndefined();
      expect(await harness.conversation.loadMessageRange(sessionId, 1, 10))
        .toEqual([]);
      expect(await harness.tasks.listTasksBySession(sessionId)).toEqual([]);
      expect(await harness.coordinator.submitV1Alpha2(commandV1Alpha2()))
        .toMatchObject({
          ok: true,
          receipt: {
            contractVersion: "v1alpha2",
            runtimeSelectionSummary: {
              resolvedAuthorization: { resolvedMode: "task_scoped" },
            },
          },
        });
    } finally {
      await harness.cleanup();
    }
  });

  it("recovers an exact Task bundle after a post-commit coordinator fault", async () => {
    let fail = true;
    const harness = await createMemoryHarness({
      coordinatorFault(point) {
        if (fail && point === "submit_turn.coordinator.after_task_bundle") {
          fail = false;
          throw new Error("simulated process loss");
        }
      },
    });
    try {
      await expect(harness.coordinator.submit(command()))
        .rejects.toThrow("simulated process loss");
      expect((await harness.coordination.listRecoverable(10))[0])
        .toMatchObject({ status: "message_appended" });
      expect(await harness.coordinator.resume(commandId))
        .toMatchObject({ ok: true, receipt: { status: "accepted" } });
      expect(await harness.tasks.listTasksBySession(sessionId)).toHaveLength(1);
      expect(await harness.conversation.loadMessageRange(
        sessionId,
        1,
        10,
      )).toHaveLength(1);
    } finally {
      await harness.cleanup();
    }
  });

  it("uses bounded Scheduler-driven recovery", async () => {
    let fail = true;
    const harness = await createMemoryHarness({
      coordinatorFault(point) {
        if (fail && point === "submit_turn.coordinator.after_message_append") {
          fail = false;
          throw new Error("simulated process loss");
        }
      },
    });
    try {
      await expect(harness.coordinator.submit(command())).rejects.toThrow();
      const scheduler = new ImmediateScheduler();
      const recovery = new SubmitTurnRecoveryCoordinator({
        coordination: harness.coordination,
        submitTurns: harness.coordinator,
        scheduler,
        batchSize: 1,
        retryDelayMs: 10,
      });
      const report = await recovery.recoverOnce();
      expect(report).toMatchObject({
        scanned: 1,
        recovered: 1,
        pending: 0,
        failures: [],
      });
      expect(scheduler.maximumScheduledDelay).toBe(0);
    } finally {
      await harness.cleanup();
    }
  });

  it("writes failed_terminal only when a recovered pre-Task selection is deterministically disabled", async () => {
    let fail = true;
    const harness = await createMemoryHarness({
      coordinatorFault(point) {
        if (fail && point === "submit_turn.coordinator.after_message_append") {
          fail = false;
          throw new Error("simulated process loss");
        }
      },
    });
    try {
      await expect(harness.coordinator.submit(command())).rejects.toThrow();
      harness.selectionContexts.register({
        registryRevision: harness.registryRevision,
        platformPromptRevision: digest("9"),
        liveModels: [{
          modelId: "model.default",
          userAllowed: true,
          enabled: false,
          credentialAvailable: true,
          callable: true,
        }],
      });
      expect(await harness.coordinator.resume(commandId)).toMatchObject({
        ok: true,
        receipt: { status: "rejected" },
      });
      expect(await harness.coordination.loadRecord(commandId)).toMatchObject({
        status: "failed_terminal",
        lastFailure: { code: "selection.model_ineligible" },
      });
      expect(await harness.tasks.listTasksBySession(sessionId)).toEqual([]);
      expect(await harness.coordination.listDeliveriesAfter(0, 10))
        .toMatchObject([{ type: "turn.rejected" }]);
    } finally {
      await harness.cleanup();
    }
  });
});

describe("DCF-1.1C SQLite close/reopen recovery matrix", () => {
  it("reopens the exact reasoning-aware Task bundle without Profile reread", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dfi522-"));
    const databasePath = join(directory, "core.sqlite");
    let profileLoadCount = 0;
    const first = await createSqliteHarness(databasePath, {
      reasoningProfiles: {
        async loadExact(subject) {
          profileLoadCount += 1;
          return subject.modelCapabilityId === "model.default"
            ? first.reasoningProfile
            : undefined;
        },
      },
    });
    try {
      expect(await first.coordinator.submitV1Alpha3(
        commandV1Alpha3(first.reasoningSupportRevision),
      )).toMatchObject({ ok: true });
      expect(profileLoadCount).toBe(1);
      expect(await first.tasks.loadReasoningAwareSubmitTurnTaskBundle(commandId))
        .toMatchObject({
          runtimeSelection: {
            schemaVersion: "v1alpha2",
            reasoningModeLock: { resolution: "max_applied" },
          },
        });
    } finally {
      await first.cleanup();
    }
    const second = await createSqliteHarness(databasePath, {
      seedSession: false,
      reasoningProfiles: {
        async loadExact() {
          throw new Error("completed replay must not reload Profile");
        },
      },
    });
    try {
      expect(await second.coordinator.submitV1Alpha3(
        commandV1Alpha3(second.reasoningSupportRevision),
      )).toMatchObject({
        ok: true,
        receipt: { contractVersion: "v1alpha3", status: "replayed" },
      });
      expect(await second.tasks.loadReasoningAwareSubmitTurnTaskBundle(commandId))
        .toMatchObject({ runtimeSelection: { schemaVersion: "v1alpha2" } });
      expect(profileLoadCount).toBe(1);
    } finally {
      await second.cleanup();
      await rm(directory, { recursive: true, force: true });
    }
  });

  const scenarios: readonly {
    name: string;
    submitFault?: Parameters<typeof onceSubmitFault>[0];
    coordinatorFault?: Parameters<typeof onceCoordinatorFault>[0];
    submitReturns?: boolean;
  }[] = [
    {
      name: "accepted record committed before response loss",
      submitFault: "submit_turn.accepted.after_commit",
    },
    {
      name: "user message appended before stage transition",
      coordinatorFault: "submit_turn.coordinator.after_message_append",
    },
    {
      name: "message_appended stage committed before response loss",
      submitFault: "submit_turn.message_appended.after_commit",
    },
    {
      name: "Task bundle committed before stage transition",
      coordinatorFault: "submit_turn.coordinator.after_task_bundle",
    },
    {
      name: "task_committed stage committed before response loss",
      submitFault: "submit_turn.task_committed.after_commit",
    },
    {
      name: "receipt and delivery committed before response loss",
      submitFault: "submit_turn.completed.after_commit",
    },
    {
      name: "Agent Loop started before start marker",
      coordinatorFault: "submit_turn.coordinator.after_loop_start",
      submitReturns: true,
    },
  ];

  for (const scenario of scenarios) {
    it(scenario.name, async () => {
      const directory = await mkdtemp(join(tmpdir(), "robothree-dcf11c-e2e-"));
      const databasePath = join(directory, "robothree.sqlite");
      const loop = new FakeAgentLoopStarter();
      const first = await createSqliteHarness(databasePath, {
        loop,
        ...(scenario.submitFault === undefined
          ? {}
          : { submitFault: onceSubmitFault(scenario.submitFault) }),
        ...(scenario.coordinatorFault === undefined
          ? {}
          : { coordinatorFault: onceCoordinatorFault(scenario.coordinatorFault) }),
      });
      try {
        if (scenario.submitReturns === true) {
          expect(await first.coordinator.submit(command())).toMatchObject({
            ok: true,
          });
        } else if (scenario.submitFault !== undefined) {
          expect(await first.coordinator.submit(command())).toMatchObject({
            ok: false,
            error: { retryable: true },
          });
        } else {
          await expect(first.coordinator.submit(command())).rejects.toThrow();
        }
      } finally {
        await first.cleanup();
      }

      const second = await createSqliteHarness(databasePath, {
        loop,
        seedSession: false,
      });
      try {
        const report = await new SubmitTurnRecoveryCoordinator({
          coordination: second.coordination,
          submitTurns: second.coordinator,
          scheduler: new ImmediateScheduler(),
          batchSize: 4,
        }).recoverOnce();
        expect(report.failures).toEqual([]);
        expect(await second.coordinator.submit(command())).toMatchObject({
          ok: true,
          receipt: { status: "replayed" },
        });
        expect(await second.coordinator.submit({
          ...command(),
          userInput: "conflicting retry body",
        })).toMatchObject({
          ok: false,
          error: { code: "submit_turn.idempotency_conflict" },
        });
        expect(await second.conversation.loadMessageRange(
          sessionId,
          1,
          10,
        )).toHaveLength(1);
        expect(await second.tasks.listTasksBySession(sessionId)).toHaveLength(1);
        const bundle = await second.tasks.loadSubmitTurnTaskBundle(commandId);
        expect(bundle).toMatchObject({
          binding: { submitTurnCommandId: commandId },
          capabilityLocks: [{ definitionSnapshot: { capabilityId: "model.default" } }],
          runtimeSelection: {
            resolvedModelLock: { capabilityId: "model.default" },
          },
        });
        expect(bundle?.capabilityLocks).toHaveLength(1);
        expect(await second.tasks.loadEventsAfter(
          bundle!.task.head.taskId,
          0,
        )).toEqual([]);
        expect(await second.coordination.listDeliveriesAfter(0, 10))
          .toHaveLength(1);
        expect(await second.coordination.listRecoverable(10)).toEqual([]);
        expect(loop.startedCount()).toBe(1);
      } finally {
        await second.cleanup();
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

describe("DFI-2A.3 explicit v1alpha2 A2-A7 recovery", () => {
  const scenarios: readonly {
    name: string;
    submitFault?: Parameters<typeof onceSubmitFault>[0];
    coordinatorFault?: Parameters<typeof onceCoordinatorFault>[0];
    submitReturns?: boolean;
  }[] = [
    {
      name: "A2 accepted plan committed",
      submitFault: "submit_turn.accepted.after_commit",
    },
    {
      name: "A3 Message append before transition",
      coordinatorFault: "submit_turn.coordinator.after_message_append",
    },
    {
      name: "A4 authorization-aware bundle transaction replay",
      submitFault: "submit_turn.message_appended.after_commit",
    },
    {
      name: "A5 bundle commit before coordination transition",
      coordinatorFault: "submit_turn.coordinator.after_task_bundle",
    },
    {
      name: "A6 Receipt and Delivery committed",
      submitFault: "submit_turn.completed.after_commit",
    },
    {
      name: "A7 Loop start before marker",
      coordinatorFault: "submit_turn.coordinator.after_loop_start",
      submitReturns: true,
    },
  ];

  for (const scenario of scenarios) {
    it(scenario.name, async () => {
      const directory = await mkdtemp(join(tmpdir(), "robothree-dfi2a3-e2e-"));
      const databasePath = join(directory, "robothree.sqlite");
      const loop = new FakeAgentLoopStarter();
      const first = await createSqliteHarness(databasePath, {
        loop,
        ...(scenario.submitFault === undefined
          ? {}
          : { submitFault: onceSubmitFault(scenario.submitFault) }),
        ...(scenario.coordinatorFault === undefined
          ? {}
          : { coordinatorFault: onceCoordinatorFault(scenario.coordinatorFault) }),
      });
      try {
        const submission = first.coordinator.submitV1Alpha2(commandV1Alpha2());
        if (scenario.submitReturns === true) {
          expect(await submission).toMatchObject({ ok: true });
        } else if (scenario.submitFault !== undefined) {
          expect(await submission).toMatchObject({
            ok: false,
            error: { retryable: true },
          });
        } else {
          await expect(submission).rejects.toThrow();
        }
      } finally {
        await first.cleanup();
      }

      const second = await createSqliteHarness(databasePath, {
        loop,
        seedSession: false,
      });
      try {
        const report = await new SubmitTurnRecoveryCoordinator({
          coordination: second.coordination,
          submitTurns: second.coordinator,
          scheduler: new ImmediateScheduler(),
          batchSize: 4,
        }).recoverOnce();
        expect(report.failures).toEqual([]);
        expect(await second.coordinator.submitV1Alpha2(commandV1Alpha2()))
          .toMatchObject({
            ok: true,
            receipt: {
              contractVersion: "v1alpha2",
              status: "replayed",
              runtimeSelectionSummary: {
                resolvedAuthorization: { resolvedMode: "task_scoped" },
              },
            },
          });
        expect(await second.tasks.loadAuthorizationAwareSubmitTurnTaskBundle(
          commandId,
        )).toMatchObject({
          selection: { resolvedMode: "task_scoped" },
        });
        expect(await second.coordination.listDeliveriesAfter(0, 10))
          .toHaveLength(1);
        expect(loop.startedCount()).toBe(1);
      } finally {
        await second.cleanup();
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

type HarnessOptions = {
  submitFault?: SubmitTurnPersistenceFaultInjector;
  coordinatorFault?: SubmitTurnCoordinatorFaultInjector;
  loop?: FakeAgentLoopStarter;
  seedSession?: boolean;
  reasoningProfiles?: ReasoningProfileSource;
};

type Harness = {
  coordinator: SubmitTurnCoordinator;
  facade: DesktopApplicationFacade;
  headless: HeadlessDesktopRuntime;
  coordination: SubmitTurnPersistence;
  conversation: ConversationPersistence;
  tasks: TaskPersistence;
  loop: FakeAgentLoopStarter;
  selectionContexts: FakeRuntimeSelectionContextProvider;
  registryRevision: string;
  reasoningProfile: ReturnType<typeof createReasoningProfile>;
  reasoningSupportRevision: string;
  cleanup(): Promise<void>;
};

async function createMemoryHarness(
  options: HarnessOptions = {},
): Promise<Harness> {
  const clock = new FakeClock(at);
  const conversation = new InMemoryConversationPersistence({ clock });
  const foundation = new InMemoryDesktopFoundationPersistence({ clock });
  const tasks = new InMemoryTaskPersistence(clock);
  const coordination = new InMemorySubmitTurnPersistence({
    clock,
    ...(options.submitFault === undefined
      ? {}
      : { faultInjector: options.submitFault }),
  });
  await conversation.start();
  await foundation.start();
  await tasks.start();
  await coordination.start();
  return assembleHarness({
    clock,
    conversation,
    foundation,
    tasks,
    coordination,
    options,
    async cleanup() {
      await coordination.stop();
      await tasks.stop();
      await foundation.stop();
      await conversation.stop();
    },
  });
}

async function createSqliteHarness(
  databasePath: string,
  options: HarnessOptions = {},
): Promise<Harness> {
  const clock = new FakeClock(at);
  const conversation = new SqliteConversationPersistence({
    databasePath,
    clock,
  });
  const foundation = new SqliteDesktopFoundationPersistence({
    databasePath,
    clock,
  });
  const tasks = new SqliteTaskPersistence({ databasePath, clock });
  const coordination = new SqliteSubmitTurnPersistence({
    databasePath,
    clock,
    ...(options.submitFault === undefined
      ? {}
      : { faultInjector: options.submitFault }),
  });
  await conversation.start();
  await foundation.start();
  await tasks.start();
  await coordination.start();
  return assembleHarness({
    clock,
    conversation,
    foundation,
    tasks,
    coordination,
    options,
    async cleanup() {
      await coordination.stop();
      await tasks.stop();
      await foundation.stop();
      await conversation.stop();
    },
  });
}

async function assembleHarness(input: {
  clock: FakeClock;
  conversation: ConversationPersistence;
  foundation: InMemoryDesktopFoundationPersistence
    | SqliteDesktopFoundationPersistence;
  tasks: TaskPersistence;
  coordination: SubmitTurnPersistence;
  options: HarnessOptions;
  cleanup(): Promise<void>;
}): Promise<Harness> {
  if (input.options.seedSession !== false) {
    expect(await input.conversation.createSession({
      schemaVersion: "v1alpha1",
      sessionId,
      messageSequence: 0,
      sessionEventSequence: 0,
      contextRevision: 0,
      createdAt: at,
      updatedAt: at,
    })).toMatchObject({ ok: true });
    expect(await input.foundation.prepareDesktopSessionCreation({
      commandId: "019f9200-0000-7000-8000-000000000002",
      requestDigest: digest("8"),
      internalSessionId: sessionId,
      desktopSessionId,
      preparedAt: at,
    })).toMatchObject({ ok: true });
    expect(await input.foundation.commitDesktopSessionCreation({
      record: {
        internalSessionId: sessionId,
        summary: {
          sessionId: desktopSessionId,
          revision: 0,
          title: "DCF-1.1C",
          tombstoned: false,
          createdAt: at,
          updatedAt: at,
        },
      },
      commandId: "019f9200-0000-7000-8000-000000000002",
      requestDigest: digest("8"),
      committedAt: at,
    })).toMatchObject({ ok: true });
  }

  const runtime = runtimeFixture();
  const reasoningProfile = createReasoningProfile({
    schemaVersion: "v1alpha1",
    profileId: "reasoning.profile.model-default",
    subject: {
      modelCapabilityId: runtime.model.modelId,
      modelCapabilityRevision: runtime.model.capability.capabilityRevision,
      adapterDescriptorId: runtime.descriptor.adapterDescriptorId,
      adapterDescriptorRevision: runtime.descriptor.revision,
      authority: "central_enterprise",
    },
    support: "supported",
    maxStrategy: {
      strategyId: "reasoning.strategy.model-default-max",
      strategyRevision: digest("b"),
      strategyDigest: digest("c"),
      mappingKind: "effort_level",
      timeoutPolicyRef: "timeout.policy.local-personal.v1",
    },
  });
  const reasoningSupportRevision = calculateReasoningSupportRevision({
    subject: reasoningProfile.subject,
    profile: reasoningProfile,
  });
  const catalog = new InMemoryTrustedRuntimeCatalog()
    .registerAgent(runtime.agent)
    .registerModel(runtime.model);
  const selection = new RuntimeSelectionService({
    agents: catalog,
    models: catalog,
    tasks: input.tasks,
    workspaces: input.foundation,
    locks: new TaskCapabilityLockService({
      resolver: new CapabilityResolver(runtime.registry),
      persistence: input.tasks,
      clock: input.clock,
      idGenerator: new SystemIdGenerator(),
    }),
    eligibility: new ModelEligibilityEvaluator(),
    clock: input.clock,
    ids: new SystemIdGenerator(),
    reasoningModeLockPlanner: new ReasoningModeLockPlanner({
      profiles: input.options.reasoningProfiles
        ?? new InMemoryReasoningProfileSource([reasoningProfile]),
      subjects: new TaskLockedReasoningProfileSubjectResolver(),
    }),
  });
  const selectionContexts = new FakeRuntimeSelectionContextProvider([{
    registryRevision: runtime.registry.registryRevision,
    platformPromptRevision: digest("9"),
    liveModels: [{
      modelId: "model.default",
      userAllowed: true,
      enabled: true,
      credentialAvailable: true,
      callable: true,
    }],
  }]);
  const loop = input.options.loop ?? new FakeAgentLoopStarter();
  const coordinator = new SubmitTurnCoordinator({
    clock: input.clock,
    ids: new SystemIdGenerator(),
    conversation: input.conversation,
    sessions: input.foundation,
    tasks: input.tasks,
    selection,
    selectionContexts,
    coordination: input.coordination,
    loopStarter: loop,
    ...(input.options.coordinatorFault === undefined
      ? {}
      : { faultInjector: input.options.coordinatorFault }),
  });
  const workspaceSelections = new EphemeralWorkspaceSelectionStore({
    clock: input.clock,
    ids: new SystemIdGenerator(),
  });
  const facade = new DesktopApplicationFacade({
    clock: input.clock,
    runtimeInstanceId: "runtime.instance-019f9200-0000-7000-8000-000000000099",
    coreVersion: "0.0.0-dcf.1.2a-test",
    runtimeStatus: () => "ready",
    workspaceSelections,
    workspaces: new WorkspaceGrantService({
      clock: input.clock,
      persistence: input.foundation,
      selectionResolver: workspaceSelections,
      pathResolver: new NodeWorkspacePathResolver(),
    }),
    sessions: new DesktopSessionService({
      clock: input.clock,
      conversation: input.conversation,
      metadata: input.foundation,
    }),
    conversations: new DesktopConversationProjectionService({
      conversation: input.conversation,
      metadata: input.foundation,
    }),
    catalog: new RuntimeCatalogProjectionService({
      agents: catalog,
      models: catalog,
      eligibility: new ModelEligibilityEvaluator(),
    }),
    selectionContexts,
    submitTurns: coordinator,
    coordination: input.coordination,
  });
  return {
    coordinator,
    facade,
    headless: new HeadlessDesktopRuntime({
      facade,
    }),
    coordination: input.coordination,
    conversation: input.conversation,
    tasks: input.tasks,
    loop,
    selectionContexts,
    registryRevision: runtime.registry.registryRevision,
    reasoningProfile,
    reasoningSupportRevision,
    cleanup: input.cleanup,
  };
}

function runtimeFixture() {
  const capability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.default",
    kind: "model",
    name: "Default",
    description: "DCF-1.1C fake Model",
    source,
    model: {
      family: "fake",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 16_384,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.fake",
    adapterKind: "model_provider",
    source,
    implementationRef: "core:fake-model",
    runtimeBoundary: "in_process",
    protocol: { name: "fake-model", version: "v1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.default",
    capability: {
      capabilityId: capability.capabilityId,
      capabilityRevision: capability.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
  });
  const registry = new RegistryBuilder({ trustedSources: [source] })
    .registerCapability(capability)
    .registerAdapterDescriptor(descriptor)
    .registerBinding(binding)
    .finalize();
  const model = createModelDefinition({
    schemaVersion: "v1alpha1",
    modelId: "model.default",
    name: "Default",
    source: "official",
    capability: {
      capabilityId: capability.capabilityId,
      capabilityRevision: capability.revision,
    },
    capabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: false,
      supportsStreaming: true,
      contextWindow: 16_384,
    },
    createdAt: at,
  });
  const agent = createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: "agent.general",
    name: "General",
    identity: "RoboThree",
    goal: "Complete user tasks",
    instructions: "Use only locked capabilities.",
    defaultModelId: model.modelId,
    allowModelOverride: false,
    skillReferences: [],
    toolReferences: [],
    knowledgeReferences: [],
    requiredModelCapabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: false,
      supportsStreaming: true,
      minimumContextWindow: 8_192,
    },
    createdAt: at,
  });
  return { registry, model, agent, descriptor };
}

function command() {
  return {
    contractVersion: "v1alpha1" as const,
    commandId,
    correlationId: "019f9200-0000-7000-8000-000000000020",
    clientInstanceId: "019f9200-0000-7000-8000-000000000021",
    type: "submit_turn" as const,
    clientTurnId: "client-turn-0001",
    sessionId: desktopSessionId,
    userInput: "Create a durable task",
    selectionRequest: {
      agentId: "agent.general",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
    },
  };
}

function commandV1Alpha2() {
  return {
    ...command(),
    contractVersion: "v1alpha2" as const,
    selectionRequest: {
      ...command().selectionRequest,
      authorizationPreference: {
        schemaVersion: "v1alpha1" as const,
        requestedMode: "task_scoped" as const,
      },
    },
  };
}

function commandV1Alpha3(observedMaxSupportRevision: string) {
  return {
    ...commandV1Alpha2(),
    contractVersion: "v1alpha3" as const,
    selectionRequest: {
      ...commandV1Alpha2().selectionRequest,
      reasoningPreference: {
        requestedMode: "max" as const,
        observedMaxSupport: "supported" as const,
        observedMaxSupportRevision,
      },
    },
  };
}

function commandV1Alpha3Default() {
  return {
    ...commandV1Alpha2(),
    contractVersion: "v1alpha3" as const,
    selectionRequest: {
      ...commandV1Alpha2().selectionRequest,
      reasoningPreference: { requestedMode: "default" as const },
    },
  };
}

function onceSubmitFault(
  target: Parameters<SubmitTurnPersistenceFaultInjector>[0],
): SubmitTurnPersistenceFaultInjector {
  let pending = true;
  return (point) => {
    if (pending && point === target) {
      pending = false;
      throw new Error(`injected ${target}`);
    }
  };
}

function onceCoordinatorFault(
  target: Parameters<SubmitTurnCoordinatorFaultInjector>[0],
): SubmitTurnCoordinatorFaultInjector {
  let pending = true;
  return (point) => {
    if (pending && point === target) {
      pending = false;
      throw new Error(`injected ${target}`);
    }
  };
}

class ImmediateScheduler implements Scheduler {
  maximumScheduledDelay = 0;

  schedule(delayMs: number, callback: () => void) {
    this.maximumScheduledDelay = Math.max(this.maximumScheduledDelay, delayMs);
    return { cancel: () => undefined, callback };
  }

  async sleep(): Promise<"elapsed"> {
    return "elapsed";
  }
}
