import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { PersonalCredentialBrokerClient } from "../../apps/desktop/src/main/personal-credential-broker-client.js";
import {
  PersonalCredentialRevealDelivery,
  type PersonalCredentialRevealConsumer,
} from "../../apps/desktop/src/main/personal-credential-reveal-delivery.js";
import {
  ConservativePersonalCredentialReferenceUsage,
  ConservativePersonalModelDeletionGuard,
  FixedPersonalModelOwnerAuthorityContextProvider,
  InMemoryPersonalCredentialStore,
  InMemoryPersonalModelOperationGate,
  InMemoryPersonalModelPersistence,
  PersonalModelCredentialCoordinator,
  PersonalModelCredentialRevealService,
  PersonalModelRevealAttemptRegistry,
  SystemClock,
  createPersonalModelCredentialBrokerHandler,
  createPersonalModelCredentialCommand,
  createPersonalModelRevealCommand,
  derivePersonalModelOwnerIdentity,
  type PersonalCredentialStore,
  type PersonalModelOwnerAuthorityContext,
} from "../../services/core/src/index.js";
import { PersonalCredentialBrokerServer } from "../../services/core/src/adapters/credential/personal-credential-broker-server.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe("DFI-4A.2.3 owner reveal private E2E", () => {
  it("delivers to exactly one Main consumer, clears its retained Buffer and forbids replay", async () => {
    const harness = await createHarness();
    try {
      let calls = 0;
      let retained: Uint8Array | undefined;
      const consumer: PersonalCredentialRevealConsumer = {
        consume: async (secret) => {
          calls += 1;
          retained = secret;
          expect([...secret]).toEqual([...harness.expectedSecret]);
        },
      };
      const command = harness.revealCommand(1);
      expect(await harness.delivery.deliver(command, consumer)).toMatchObject({
        status: "completed",
        secretByteLength: 0,
      });
      expect(calls).toBe(1);
      expect(retained).toEqual(new Uint8Array(harness.expectedSecret.byteLength));
      expect(await harness.delivery.deliver(command, consumer)).toMatchObject({
        status: "rejected",
        typedErrorCode: "credential_reveal_replay_forbidden",
        secretByteLength: 0,
      });
      expect(calls).toBe(1);
      expect(harness.client.resourceSnapshot()).toMatchObject({
        inflight: 0,
        mutations: 0,
        revealTombstones: 1,
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("does not merge a pending reveal into a second Secret consumer", async () => {
    const store = new ControlledResolveStore(new InMemoryPersonalCredentialStore());
    const harness = await createHarness(store);
    try {
      store.pauseResolve = true;
      let firstCalls = 0;
      let secondCalls = 0;
      const command = harness.revealCommand(2);
      const first = harness.delivery.deliver(command, {
        consume: async () => { firstCalls += 1; },
      });
      await store.entered;
      expect(await harness.delivery.deliver(command, {
        consume: async () => { secondCalls += 1; },
      })).toMatchObject({
        status: "rejected",
        typedErrorCode: "credential_transport_busy",
      });
      store.release();
      expect(await first).toMatchObject({ status: "completed" });
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(0);
    } finally {
      store.release();
      await harness.cleanup();
    }
  });

  it("drops and clears V2 bytes after transport disconnect without invoking the consumer", async () => {
    const store = new ControlledResolveStore(new InMemoryPersonalCredentialStore());
    const harness = await createHarness(store);
    try {
      store.pauseResolve = true;
      let calls = 0;
      const pending = harness.delivery.deliver(harness.revealCommand(3), {
        consume: async () => { calls += 1; },
      });
      await store.entered;
      harness.client.close();
      expect(await pending).toMatchObject({
        status: "uncertain",
        typedErrorCode: "credential_transport_unavailable",
      });
      store.release();
      await waitUntil(() => store.lastResolved !== undefined
        && store.lastResolved.every((value) => value === 0));
      expect(calls).toBe(0);
      expect(store.lastResolved).toEqual(new Uint8Array(harness.expectedSecret.byteLength));
    } finally {
      store.release();
      await harness.cleanup();
    }
  });

  it("does not report V2c success when the consumer is cancelled before completion", async () => {
    const harness = await createHarness();
    try {
      const abort = new AbortController();
      let retained: Uint8Array | undefined;
      let release: (() => void) | undefined;
      const consumerDone = new Promise<void>((resolve) => { release = resolve; });
      let markEntered: (() => void) | undefined;
      const entered = new Promise<void>((resolveEntered) => { markEntered = resolveEntered; });
      const delivery = harness.delivery.deliver(harness.revealCommand(4), {
        consume: async (secret) => {
          retained = secret;
          markEntered?.();
          await consumerDone;
        },
      }, { signal: abort.signal });
      await entered;
      abort.abort();
      expect(await delivery).toMatchObject({
        status: "cancelled",
        typedErrorCode: "credential_store_cancelled",
        secretByteLength: 0,
      });
      await waitUntil(() => retained !== undefined
        && retained.every((value) => value === 0));
      release?.();
    } finally {
      await harness.cleanup();
    }
  });
});

class ControlledResolveStore implements PersonalCredentialStore {
  public pauseResolve = false;
  public lastResolved: Uint8Array | undefined;
  #enteredResolve: (() => void) | undefined;
  #releaseResolve: (() => void) | undefined;
  #entered = new Promise<void>((resolve) => { this.#enteredResolve = resolve; });
  #release = new Promise<void>((resolve) => { this.#releaseResolve = resolve; });

  public constructor(private readonly delegate: InMemoryPersonalCredentialStore) {}

  public get entered(): Promise<void> { return this.#entered; }
  public release(): void { this.#releaseResolve?.(); }
  public start() { return this.delegate.start(); }
  public stop() { return this.delegate.stop(); }
  public store(operationId: string, credentialRef: string, secret: Uint8Array) {
    return this.delegate.store(operationId, credentialRef, secret);
  }
  public replace(operationId: string, oldRef: string, newRef: string, secret: Uint8Array) {
    return this.delegate.replace(operationId, oldRef, newRef, secret);
  }
  public inspect(credentialRef: string) { return this.delegate.inspect(credentialRef); }
  public async resolve(credentialRef: string) {
    const result = await this.delegate.resolve(credentialRef);
    if (result.ok) this.lastResolved = result.value;
    if (this.pauseResolve) {
      this.#enteredResolve?.();
      await this.#release;
    }
    return result;
  }
  public delete(operationId: string, credentialRef: string) {
    return this.delegate.delete(operationId, credentialRef);
  }
}

async function createHarness(
  store: ControlledResolveStore = new ControlledResolveStore(new InMemoryPersonalCredentialStore()),
) {
  const persistence = new InMemoryPersonalModelPersistence();
  const authority = new FixedPersonalModelOwnerAuthorityContextProvider(authorityContext());
  const operationGate = new InMemoryPersonalModelOperationGate();
  const clock = new SystemClock();
  await persistence.start();
  await store.start();
  const coordinator = new PersonalModelCredentialCoordinator({
    persistence,
    credentials: store,
    authorityContexts: authority,
    deletionGuard: new ConservativePersonalModelDeletionGuard(),
    credentialUsage: new ConservativePersonalCredentialReferenceUsage(),
    operationGate,
    clock,
  });
  const create = createPersonalModelCredentialCommand({
    commandId: uuid(900),
    commandType: "create",
    personalModelId: "model.personal.reveal-e2e",
    target: {
      providerKind: "deepseek",
      providerProfileRevision: digest("a"),
      protocol: "openai_compatible",
      endpoint: "https://example.com/v1",
      providerModelId: "deepseek-test",
      displayName: "Reveal E2E",
      capabilities: ["text", "streaming"],
    },
    credentialInputExpected: true,
  });
  expect(await coordinator.prepare(create)).toMatchObject({ ok: true, status: "prepared" });
  const expectedSecret = new TextEncoder().encode("test-reveal-e2e-secret");
  expect(await coordinator.executePrepared({
    commandId: create.commandId,
    commandType: "create",
    personalModelId: create.personalModelId,
    requestDigest: create.requestDigest,
    deadlineAt: new Date(Date.now() + 30_000).toISOString(),
    secret: Uint8Array.from(expectedSecret),
  })).toMatchObject({ ok: true, status: "committed" });
  const namespace = await persistence.loadActiveOwnerNamespace();
  if (namespace === undefined) throw new Error("expected owner namespace");
  const owner = derivePersonalModelOwnerIdentity(namespace, authorityContext());
  namespace.namespaceKey.fill(0);
  const head = await persistence.loadHead(owner, create.personalModelId);
  if (head === undefined) throw new Error("expected Personal Model head");
  const reveal = new PersonalModelCredentialRevealService({
    persistence,
    credentials: store,
    authorityContexts: authority,
    operationGate,
    attempts: new PersonalModelRevealAttemptRegistry(),
    clock,
  });
  const mainToCore = new PassThrough();
  const coreToMain = new PassThrough();
  const channelInstanceId = randomUUID();
  const clientInstanceId = randomUUID();
  const server = new PersonalCredentialBrokerServer({
    request: mainToCore,
    response: coreToMain,
    channelInstanceId,
    clientInstanceId,
    handler: createPersonalModelCredentialBrokerHandler(coordinator, reveal),
  });
  server.start();
  const client = new PersonalCredentialBrokerClient({
    request: mainToCore,
    response: coreToMain,
    channelInstanceId,
    clientInstanceId,
  });
  const delivery = new PersonalCredentialRevealDelivery(client);
  return {
    persistence,
    expectedSecret,
    client,
    delivery,
    revealCommand: (offset: number) => {
      const command = createPersonalModelRevealCommand({
        commandId: uuid(offset),
        commandType: "reveal",
        personalModelId: create.personalModelId,
        expectedConfigurationRevision: head.currentConfigurationRevision,
        expectedExecutionDefinitionDigest: head.currentExecutionDefinitionDigest,
        deadlineAt: new Date(Date.now() + 7_000).toISOString(),
      });
      return {
        commandId: command.commandId,
        commandType: command.commandType,
        personalModelId: command.personalModelId,
        expectedConfigurationRevision: command.expectedConfigurationRevision,
        expectedExecutionDefinitionDigest: command.expectedExecutionDefinitionDigest,
        commandRequestDigest: command.requestDigest,
        deadlineAt: command.deadlineAt,
      } as const;
    },
    cleanup: async () => {
      client.close();
      server.close();
      reveal.close();
      expectedSecret.fill(0);
      await store.stop();
      await persistence.stop();
    },
  };
}

function authorityContext(): PersonalModelOwnerAuthorityContext {
  return {
    enterpriseId: "enterprise.test",
    userId: "user.test",
    deviceId: "device.test",
    entitlementGranted: true,
    entitlementRevision: digest("9"),
    offlineState: "online",
  };
}

function uuid(offset: number): string {
  return `30000000-0000-4000-8000-${offset.toString().padStart(12, "0")}`;
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("condition was not reached");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
