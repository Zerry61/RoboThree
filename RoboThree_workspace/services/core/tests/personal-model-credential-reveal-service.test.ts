import { describe, expect, it } from "vitest";

import {
  ConservativePersonalCredentialReferenceUsage,
  ConservativePersonalModelDeletionGuard,
  FakeClock,
  FixedPersonalModelOwnerAuthorityContextProvider,
  InMemoryPersonalCredentialStore,
  InMemoryPersonalModelOperationGate,
  InMemoryPersonalModelPersistence,
  PersonalModelCredentialCoordinator,
  PersonalModelCredentialRevealService,
  PersonalModelRevealAttemptRegistry,
  RevealPersonalModelCredentialCommandSchema,
  calculatePersonalModelRevealCommandDigest,
  createPersonalModelCredentialCommand,
  createPersonalModelRevealCommand,
  derivePersonalModelOwnerIdentity,
  type PersonalCredentialStore,
  type PersonalModelCredentialRevealMaterial,
  type PersonalModelOwnerAuthorityContext,
} from "../src/index.js";

const now = "2026-08-21T10:00:00.000Z";
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe("DFI-4A.2.3 Personal Model Credential reveal", () => {
  it("creates a strict stable command digest that excludes transport facts", () => {
    const material = revealMaterial(1);
    const first = createPersonalModelRevealCommand({
      ...material,
      deadlineAt: "2026-08-21T10:00:05.000Z",
    });
    const second = createPersonalModelRevealCommand({
      ...material,
      deadlineAt: "2026-08-21T10:00:04.000Z",
    });
    expect(first.requestDigest).toBe(second.requestDigest);
    expect(calculatePersonalModelRevealCommandDigest(first)).toBe(first.requestDigest);
    expect(RevealPersonalModelCredentialCommandSchema.safeParse({
      ...first,
      credentialRef: "pmcr1.forbidden",
    }).success).toBe(false);
    expect(JSON.stringify(first)).not.toMatch(/credentialRef|ownerScope|clientInstance|transportRequest/iu);
  });

  it("reveals the exact active Credential once without durable reveal facts", async () => {
    const harness = await createHarness();
    try {
      const command = harness.revealCommand(10);
      const result = await harness.reveal.reveal(command);
      expect(result).toMatchObject({
        ok: true,
        status: "completed",
        commandId: command.commandId,
      });
      if (!result.ok) throw new Error("expected reveal success");
      expect([...result.secret]).toEqual([...harness.expectedSecret]);
      result.secret.fill(0);
      expect(await harness.persistence.loadReceipt(harness.owner, command.commandId)).toBeUndefined();
      expect(await harness.persistence.loadByCommand(harness.owner, command.commandId)).toBeUndefined();

      expect(await harness.reveal.reveal(command)).toMatchObject({
        ok: false,
        error: { code: "personal_model.reveal_replay_forbidden" },
      });
      expect(harness.credentials.resolveCount).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });

  it("allows enterprise temporary unavailability but denies an invalid session", async () => {
    const harness = await createHarness();
    try {
      harness.authority.setContext(authority("enterprise_temporarily_unavailable"));
      const allowed = await harness.reveal.reveal(harness.revealCommand(20));
      expect(allowed.ok).toBe(true);
      if (allowed.ok) allowed.secret.fill(0);

      harness.authority.setContext(authority("enterprise_session_invalid"));
      expect(await harness.reveal.reveal(harness.revealCommand(21))).toMatchObject({
        ok: false,
        error: { code: "personal_model.permission_denied" },
      });
      expect(harness.credentials.resolveCount).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects stale revision and digest tampering before Keychain resolve", async () => {
    const harness = await createHarness();
    try {
      const stale = harness.revealCommand(30);
      expect(await harness.reveal.reveal({
        ...stale,
        expectedConfigurationRevision: digest("f"),
        requestDigest: calculatePersonalModelRevealCommandDigest({
          ...stale,
          expectedConfigurationRevision: digest("f"),
        }),
      })).toMatchObject({ ok: false, error: { code: "personal_model.conflict" } });
      expect(await harness.reveal.reveal({
        ...harness.revealCommand(31),
        requestDigest: digest("e"),
      })).toMatchObject({ ok: false, error: { code: "personal_model.conflict" } });
      expect(harness.credentials.resolveCount).toBe(0);
    } finally {
      await harness.cleanup();
    }
  });

  it("enforces a shared operation gate across mutation and reveal", async () => {
    const harness = await createHarness();
    try {
      const lease = harness.gate.tryAcquire(harness.owner, harness.modelId, "mutation");
      expect(lease).toBeDefined();
      expect(await harness.reveal.reveal(harness.revealCommand(40))).toMatchObject({
        ok: false,
        error: { code: "personal_model.reveal_busy" },
      });
      lease?.release();
      const result = await harness.reveal.reveal(harness.revealCommand(41));
      expect(result.ok).toBe(true);
      if (result.ok) result.secret.fill(0);
      expect(harness.gate.activeCount()).toBe(0);
    } finally {
      await harness.cleanup();
    }
  });

  it("rate limits the sixth reveal in a deterministic sixty-second window", async () => {
    const harness = await createHarness();
    try {
      for (let index = 0; index < 5; index += 1) {
        const result = await harness.reveal.reveal(harness.revealCommand(50 + index));
        expect(result.ok).toBe(true);
        if (result.ok) result.secret.fill(0);
      }
      expect(await harness.reveal.reveal(harness.revealCommand(55))).toMatchObject({
        ok: false,
        error: { code: "personal_model.reveal_rate_limited" },
      });
      harness.clock.set("2026-08-21T10:01:01.000Z");
      const afterWindow = await harness.reveal.reveal(harness.revealCommand(56));
      expect(afterWindow.ok).toBe(true);
      if (afterWindow.ok) afterWindow.secret.fill(0);
    } finally {
      await harness.cleanup();
    }
  });

  it("clears late Secret bytes when the Core deadline expires", async () => {
    const harness = await createHarness();
    try {
      harness.credentials.afterResolve = () => harness.clock.set("2026-08-21T10:00:06.000Z");
      expect(await harness.reveal.reveal(harness.revealCommand(60))).toMatchObject({
        ok: false,
        error: { code: "personal_model.deadline_exceeded" },
      });
      expect(harness.credentials.lastResolved).toEqual(
        new Uint8Array(harness.expectedSecret.byteLength),
      );
      expect(harness.reveal.resourceSnapshot()).toMatchObject({ active: 0, ownerModels: 0 });
    } finally {
      await harness.cleanup();
    }
  });

  it("fails closed on mismatched Credential binding metadata", async () => {
    const harness = await createHarness();
    try {
      harness.credentials.overrideInspectionDigest = digest("d");
      expect(await harness.reveal.reveal(harness.revealCommand(70))).toMatchObject({
        ok: false,
        error: { code: "personal_model.conflict" },
      });
      expect(harness.credentials.resolveCount).toBe(0);
    } finally {
      await harness.cleanup();
    }
  });
});

class ObservedCredentialStore implements PersonalCredentialStore {
  public resolveCount = 0;
  public lastResolved: Uint8Array | undefined;
  public afterResolve: (() => void) | undefined;
  public overrideInspectionDigest: string | undefined;

  public constructor(private readonly delegate: InMemoryPersonalCredentialStore) {}

  public start() { return this.delegate.start(); }
  public stop() { return this.delegate.stop(); }
  public store(operationId: string, credentialRef: string, secret: Uint8Array) {
    return this.delegate.store(operationId, credentialRef, secret);
  }
  public replace(operationId: string, oldRef: string, newRef: string, secret: Uint8Array) {
    return this.delegate.replace(operationId, oldRef, newRef, secret);
  }
  public async inspect(credentialRef: string) {
    const value = await this.delegate.inspect(credentialRef);
    return value.state === "present" && this.overrideInspectionDigest !== undefined
      ? { ...value, credentialBindingDigest: this.overrideInspectionDigest as `sha256:${string}` }
      : value;
  }
  public async resolve(credentialRef: string) {
    this.resolveCount += 1;
    const result = await this.delegate.resolve(credentialRef);
    if (result.ok) this.lastResolved = result.value;
    this.afterResolve?.();
    return result;
  }
  public delete(operationId: string, credentialRef: string) {
    return this.delegate.delete(operationId, credentialRef);
  }
}

async function createHarness() {
  const persistence = new InMemoryPersonalModelPersistence();
  const delegate = new InMemoryPersonalCredentialStore();
  const credentials = new ObservedCredentialStore(delegate);
  const authorityProvider = new FixedPersonalModelOwnerAuthorityContextProvider(authority("online"));
  const clock = new FakeClock(now);
  const gate = new InMemoryPersonalModelOperationGate();
  await persistence.start();
  await credentials.start();
  const coordinator = new PersonalModelCredentialCoordinator({
    persistence,
    credentials,
    authorityContexts: authorityProvider,
    deletionGuard: new ConservativePersonalModelDeletionGuard(),
    credentialUsage: new ConservativePersonalCredentialReferenceUsage(),
    clock,
    operationGate: gate,
  });
  const expectedSecret = bytes("test-personal-key-material");
  const create = createPersonalModelCredentialCommand({
    commandId: uuid(900),
    commandType: "create",
    personalModelId: "model.personal.reveal-test",
    target: {
      providerKind: "deepseek",
      providerProfileRevision: digest("a"),
      protocol: "openai_compatible",
      endpoint: "https://example.com/v1",
      providerModelId: "deepseek-test",
      displayName: "Reveal Test",
      capabilities: ["text", "streaming"],
    },
    credentialInputExpected: true,
  });
  expect(await coordinator.prepare(create)).toMatchObject({ ok: true, status: "prepared" });
  const storedInput = Uint8Array.from(expectedSecret);
  expect(await coordinator.executePrepared({
    commandId: create.commandId,
    commandType: "create",
    personalModelId: create.personalModelId,
    requestDigest: create.requestDigest,
    deadlineAt: "2026-08-21T10:05:00.000Z",
    secret: storedInput,
  })).toMatchObject({ ok: true, status: "committed" });
  storedInput.fill(0);
  const namespace = await persistence.loadActiveOwnerNamespace();
  if (namespace === undefined) throw new Error("expected owner namespace");
  const owner = derivePersonalModelOwnerIdentity(namespace, authority("online"));
  namespace.namespaceKey.fill(0);
  const head = await persistence.loadHead(owner, create.personalModelId);
  if (head === undefined) throw new Error("expected Personal Model head");
  const attempts = new PersonalModelRevealAttemptRegistry();
  const reveal = new PersonalModelCredentialRevealService({
    persistence,
    credentials,
    authorityContexts: authorityProvider,
    clock,
    attempts,
    operationGate: gate,
  });
  return {
    persistence,
    credentials,
    authority: authorityProvider,
    clock,
    gate,
    reveal,
    owner,
    modelId: create.personalModelId,
    expectedSecret,
    revealCommand: (offset: number) => createPersonalModelRevealCommand({
      commandId: uuid(offset),
      commandType: "reveal",
      personalModelId: create.personalModelId,
      expectedConfigurationRevision: head.currentConfigurationRevision,
      expectedExecutionDefinitionDigest: head.currentExecutionDefinitionDigest,
      deadlineAt: new Date(Date.parse(clock.now()) + 10_000).toISOString(),
    }),
    cleanup: async () => {
      reveal.close();
      expectedSecret.fill(0);
      await credentials.stop();
      await persistence.stop();
    },
  };
}

function revealMaterial(offset: number): PersonalModelCredentialRevealMaterial {
  return {
    commandId: uuid(offset),
    commandType: "reveal",
    personalModelId: "model.personal.reveal-test",
    expectedConfigurationRevision: digest("a"),
    expectedExecutionDefinitionDigest: digest("b"),
  };
}

function authority(
  offlineState: PersonalModelOwnerAuthorityContext["offlineState"],
): PersonalModelOwnerAuthorityContext {
  return {
    enterpriseId: "enterprise.test",
    userId: "user.test",
    deviceId: "device.test",
    entitlementGranted: true,
    entitlementRevision: digest("9"),
    offlineState,
  };
}

function uuid(offset: number): string {
  return `20000000-0000-4000-8000-${offset.toString().padStart(12, "0")}`;
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
