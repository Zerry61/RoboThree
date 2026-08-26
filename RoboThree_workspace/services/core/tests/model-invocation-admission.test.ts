import {
  CONTRACT_VERSION,
  JsonValueSchema,
  TaskCapabilityLockSchema,
  type CapabilitySource,
  type PersistedUserConfirmation,
  type TaskRuntimeSelection,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  FakeClock,
  FakeIdGenerator,
  ModelInvocationAdmission,
  ModelInvocationAdmissionPending,
  ModelInvocationAdmissionRejected,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  sha256CanonicalJson,
} from "../src/index.js";
import type {
  TaskPersistence,
  UserConfirmationCoordinator,
} from "../src/index.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const digest = (value: string) => `sha256:${value.repeat(64)}` as const;
const now = "2026-08-03T02:30:00.000Z";
const source: CapabilitySource = {
  trust: "official",
  packageId: "robothree.official.cgf2c1-tests",
  packageRevision: digest("a"),
};

describe("ModelInvocationAdmission", () => {
  it("waits before dispatch, reuses the exact confirmed scope, and rechecks live state", async () => {
    const fixture = modelSelection();
    let persisted: PersistedUserConfirmation | undefined;
    let requested = 0;
    let liveChecks = 0;
    const admission = new ModelInvocationAdmission({
      persistence: {
        findUserConfirmationByScopeDigest: async () => persisted,
      } as unknown as TaskPersistence,
      confirmations: {
        request: async (request) => {
          requested += 1;
          persisted = { request };
          return { accepted: true, replayed: false, state: {} } as never;
        },
      } as unknown as UserConfirmationCoordinator,
      clock: new FakeClock(now),
      ids: new FakeIdGenerator([entityId(9001)]),
      liveAuthorizer: {
        async assertAllowed() {
          liveChecks += 1;
        },
      },
    });

    await expect(admission.authorize(input(fixture))).rejects.toMatchObject({
      code: "model.user_confirmation_required",
      confirmationId: entityId(9001),
    });
    expect(requested).toBe(1);
    expect(liveChecks).toBe(0);
    expect(persisted?.request.scope).toMatchObject({
      type: "task_model_external_scope",
      runtimeSelectionDigest: fixture.selection.selectionDigest,
      modelCapabilityRevision: fixture.lock.definitionSnapshot.revision,
      bindingRevision: fixture.lock.bindingSnapshot.revision,
      adapterDescriptorRevision: fixture.lock.adapterDescriptorSnapshot.revision,
      externalTarget: "enterprise:model-gateway",
      dataCategories: ["user_text", "tool_schema"],
    });

    persisted = {
      request: persisted!.request,
      decision: {
        schemaVersion: CONTRACT_VERSION,
        decisionId: entityId(9002),
        confirmationId: entityId(9001),
        scopeDigest: persisted!.request.scopeDigest,
        decision: "confirmed",
        decidedByUserId: entityId(9003),
        decidedAt: now,
      },
    };
    const allowed = await admission.authorize(input(fixture));
    expect(allowed).toMatchObject({
      type: "user_confirmed",
      confirmationId: entityId(9001),
      scopeDigest: persisted.request.scopeDigest,
    });
    expect(allowed.confirmationDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(requested).toBe(1);
    expect(liveChecks).toBe(1);
  });

  it("fails closed for rejection and exact-lock drift", async () => {
    const fixture = modelSelection();
    const pending = await pendingRecord(fixture);
    const rejected: PersistedUserConfirmation = {
      request: pending,
      decision: {
        schemaVersion: CONTRACT_VERSION,
        decisionId: entityId(9010),
        confirmationId: pending.confirmationId,
        scopeDigest: pending.scopeDigest,
        decision: "rejected",
        decidedByUserId: entityId(9011),
        decidedAt: now,
      },
    };
    const create = (record: PersistedUserConfirmation | undefined) => new ModelInvocationAdmission({
      persistence: { findUserConfirmationByScopeDigest: async () => record } as unknown as TaskPersistence,
      confirmations: { request: async () => { throw new Error("unexpected"); } } as unknown as UserConfirmationCoordinator,
      clock: new FakeClock(now),
      ids: new FakeIdGenerator([entityId(9012)]),
      liveAuthorizer: { assertAllowed: async () => undefined },
    });
    await expect(create(rejected).authorize(input(fixture))).rejects.toBeInstanceOf(
      ModelInvocationAdmissionRejected,
    );
    await expect(create(undefined).authorize(input({
      ...fixture,
      selection: { ...fixture.selection, resolvedModelLock: {
        ...fixture.selection.resolvedModelLock,
        lockDigest: digest("f"),
      } },
    }))).rejects.toThrow("exact Task runtime selection");
  });
});

async function pendingRecord(fixture: ReturnType<typeof modelSelection>) {
  let request;
  const admission = new ModelInvocationAdmission({
    persistence: { findUserConfirmationByScopeDigest: async () => undefined } as unknown as TaskPersistence,
    confirmations: {
      request: async (value) => {
        request = value;
        return { accepted: true, replayed: false, state: {} } as never;
      },
    } as unknown as UserConfirmationCoordinator,
    clock: new FakeClock(now),
    ids: new FakeIdGenerator([entityId(9009)]),
    liveAuthorizer: { assertAllowed: async () => undefined },
  });
  await expect(admission.authorize(input(fixture))).rejects.toBeInstanceOf(
    ModelInvocationAdmissionPending,
  );
  if (request === undefined) throw new Error("confirmation request was not captured");
  return request;
}

function input(fixture: ReturnType<typeof modelSelection>) {
  return {
    taskId: fixture.selection.taskId,
    runId: entityId(9050),
    stepId: entityId(9051),
    actionId: entityId(9052),
    runtimeSelection: fixture.selection,
    modelLock: fixture.lock,
    externalTarget: "enterprise:model-gateway",
    dataCategories: ["user_text", "tool_schema"] as const,
    dataScopeDigest: digest("d"),
  };
}

function modelSelection() {
  const taskId = entityId(9020);
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.enterprise",
    kind: "model",
    name: "Enterprise Model",
    description: "CGF-2C.1 exact Model",
    source,
    model: {
      family: "enterprise",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 16_384,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.enterprise",
    adapterKind: "model_provider",
    source,
    implementationRef: "enterprise:model-gateway",
    runtimeBoundary: "remote",
    protocol: { name: "robothree-enterprise-model", version: "v1alpha1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.enterprise",
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
  });
  const lock = TaskCapabilityLockSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    lockId: entityId(9021),
    taskId,
    registryRevision: digest("b"),
    definitionSnapshot: definition,
    bindingSnapshot: binding,
    adapterDescriptorSnapshot: descriptor,
    lockedAt: now,
  });
  const lockDigest = sha256CanonicalJson(JsonValueSchema.parse(lock));
  const selection = {
    schemaVersion: "v1alpha1",
    runtimeSelectionId: entityId(9022),
    taskId,
    agent: {
      agentDefinitionId: "agent.general",
      revision: digest("c"),
      digest: digest("c"),
    },
    agentDefaultModelId: definition.capabilityId,
    resolvedModelLock: {
      lockId: lock.lockId,
      capabilityId: definition.capabilityId,
      lockDigest,
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: digest("e"),
    registryRevision: lock.registryRevision,
    createdAt: now,
    selectionDigest: digest("9"),
  } as TaskRuntimeSelection;
  return { lock, selection };
}
