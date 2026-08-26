import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  IpcMainEvent,
  MessageChannelMain,
  MessagePortMain,
  WebContents,
} from "electron";

import {
  PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
  PersonalCredentialBrokerResponseHeaderSchema,
} from "@robothree/contracts/desktop-private/personal-credential-broker-v1";
import { describe, expect, it } from "vitest";

import type {
  PersonalCredentialBrokerClient,
  PersonalCredentialBrokerCommand,
  PersonalCredentialBrokerResult,
} from "../src/main/personal-credential-broker-client.js";
import {
  PersonalCredentialTransportProductionController,
  type PersonalCredentialBrokerLease,
} from "../src/main/personal-credential-transport-controller.js";
import {
  PersonalCredentialTransportMainAdapter,
  type CreatePersonalCredentialTransportTicketInput,
  type MainDerivedPersonalCredentialTransportIdentity,
} from "../src/main/personal-credential-transport.js";
import {
  PersonalCredentialTransportPreloadReceiver,
  type PersonalCredentialTransportDomPort,
  type PersonalCredentialTransportPortOfferEvent,
  type PersonalCredentialTransportPortSubscription,
} from "../src/preload/personal-credential-transport-receiver.js";

const initialNow = Date.now();
const ticketKey = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
const authorizationKey = Uint8Array.from(
  { length: 32 },
  (_value, index) => 32 - index,
);

describe("STRM-2.2 Broker dispatch and directional closure", () => {
  it("verifies the independent frame authorization HMAC and rejects tampering", () => {
    let now = initialNow;
    const adapter = new PersonalCredentialTransportMainAdapter({
      foundationEnabled: true,
      ticketKey,
      frameAuthorizationKey: authorizationKey,
      now: () => now,
    });
    const input = ticketInput();
    const ticket = adapter.createTicket(input);
    const actualIdentity = identity(input);
    adapter.bindPort(ticket, actualIdentity);
    adapter.markReady(ticket, actualIdentity);
    const authorization = adapter.createFrameAuthorization(ticket, actualIdentity, {
      direction: "mutation_to_main",
      frameType: "mutation_secret",
      bodyLength: 4,
      expiresAt: new Date(now + 3_000).toISOString(),
    });
    expect(adapter.verifyFrameAuthorization(ticket, actualIdentity, authorization))
      .toEqual(authorization);
    expect(() => adapter.verifyFrameAuthorization(ticket, actualIdentity, {
      ...authorization,
      authorizationDigest: `sha256:${"0".repeat(64)}`,
    })).toThrow("personal_credential_transport_invalid_frame");
    now += 3_001;
    expect(() => adapter.verifyFrameAuthorization(ticket, actualIdentity, authorization))
      .toThrow("personal_credential_transport_invalid_frame");
    adapter.close();
  });

  it("dispatches one authorized mutation and returns one terminal", async () => {
    const broker = new FakeBroker();
    const harness = directionalHarness(broker);
    const command = prepared("1", "create");
    harness.controller.openPreparedCommand(command, ipcEvent(harness.webContents));
    await nextTurns();

    const callerBytes = Uint8Array.from([115, 101, 99, 114, 101, 116]);
    const terminal = await harness.receiver.submitMutationSecret(
      command.commandId,
      callerBytes,
    );
    expect(terminal).toMatchObject({ controlType: "terminal_ack", terminal: "completed" });
    expect(callerBytes.every((value) => value === 0)).toBe(true);
    expect(broker.executeCount).toBe(1);
    expect(broker.seenSecrets).toEqual([[115, 101, 99, 114, 101, 116]]);
    expect(harness.controller.snapshot()).toMatchObject({
      sessionCount: 0,
      frameAuthorizationCount: 0,
      brokerLeaseCount: 0,
      abortControllerCount: 0,
      productionFeatureEnabled: false,
      productionBusinessHandlerReady: false,
      transportBlockerClosed: false,
    });
    expect(harness.receiver.snapshot()).toMatchObject({
      sessionCount: 0,
      mutationSecretCount: 0,
      tombstoneCount: 1,
    });
    harness.close();
  });

  it("delivers reveal bytes to exactly one private consumer and acknowledges once", async () => {
    const broker = new FakeBroker({ revealSecret: [9, 8, 7, 6] });
    const revealed: number[][] = [];
    const harness = directionalHarness(broker, (secret) => {
      revealed.push([...secret]);
    });
    const command = prepared("1", "reveal");
    harness.controller.openPreparedCommand(command, ipcEvent(harness.webContents));
    await nextTurns(5);

    expect(broker.executeCount).toBe(1);
    expect(revealed).toEqual([[9, 8, 7, 6]]);
    expect(harness.controller.snapshot()).toMatchObject({
      sessionCount: 0,
      lateCallbackCount: 0,
    });
    expect(harness.receiver.snapshot()).toMatchObject({
      sessionCount: 0,
      revealAuthorizationCount: 0,
      tombstoneCount: 1,
    });
    harness.close();
  });

  it("does not dispatch when the Broker lease runtime identity mismatches", async () => {
    const broker = new FakeBroker();
    const harness = directionalHarness(broker, undefined, {
      runtimeInstanceId: id("999"),
    });
    const command = prepared("1", "create");
    harness.controller.openPreparedCommand(command, ipcEvent(harness.webContents));
    await nextTurns();
    const terminal = await harness.receiver.submitMutationSecret(
      command.commandId,
      Uint8Array.from([1, 2, 3]),
    );
    expect(terminal.terminal).toBe("uncertain");
    expect(broker.executeCount).toBe(0);
    expect(harness.controller.snapshot().sessionCount).toBe(0);
    harness.close();
  });

  it("does not reuse Broker coalescing as its exactly-once proof", async () => {
    const broker = new FakeBroker({ deferred: true });
    const harness = directionalHarness(broker);
    const command = prepared("1", "update");
    harness.controller.openPreparedCommand(command, ipcEvent(harness.webContents));
    await nextTurns();
    const terminalPromise = harness.receiver.submitMutationSecret(
      command.commandId,
      Uint8Array.from([4, 4, 4]),
    );
    await nextTurns();
    expect(broker.executeCount).toBe(1);
    broker.completeDeferred();
    await expect(terminalPromise).resolves.toMatchObject({ terminal: "completed" });
    expect(broker.executeCount).toBe(1);
    harness.close();
  });

  it("drops and scrubs a late Broker result after navigation", async () => {
    const broker = new FakeBroker({ deferred: true });
    const harness = directionalHarness(broker);
    const command = prepared("1", "create");
    harness.controller.openPreparedCommand(command, ipcEvent(harness.webContents));
    await nextTurns();
    const pending = harness.receiver.submitMutationSecret(
      command.commandId,
      Uint8Array.from([5, 5, 5]),
    );
    await nextTurns();
    harness.webContents.emit(
      "did-navigate-in-page",
      {},
      "file:///renderer/index.html#next",
      true,
      1,
      3,
    );
    await expect(pending).rejects.toThrow("personal_credential_transport_uncertain");
    broker.completeDeferred();
    await nextTurns();
    expect(broker.executeCount).toBe(1);
    expect(harness.controller.snapshot()).toMatchObject({
      sessionCount: 0,
      lateCallbackCount: 1,
    });
    harness.close();
  });

  it("maps a reveal consumer failure to uncertain without replay", async () => {
    const broker = new FakeBroker({ revealSecret: [6, 6, 6] });
    const harness = directionalHarness(broker, () => {
      throw new Error("consumer_failed");
    });
    const command = prepared("1", "reveal");
    harness.controller.openPreparedCommand(command, ipcEvent(harness.webContents));
    await nextTurns(5);
    expect(broker.executeCount).toBe(1);
    expect(harness.controller.snapshot().sessionCount).toBe(0);
    expect(harness.receiver.snapshot().tombstoneCount).toBe(1);
    harness.close();
  });

  it("keeps production activation, public IPC, and Renderer API disabled", async () => {
    const [mainEntry, preloadEntry, controller, receiver] = await Promise.all([
      readFile(resolve("apps/desktop/src/main/index.ts"), "utf8"),
      readFile(resolve("apps/desktop/src/preload/index.ts"), "utf8"),
      readFile(resolve(
        "apps/desktop/src/main/personal-credential-transport-controller.ts",
      ), "utf8"),
      readFile(resolve(
        "apps/desktop/src/preload/personal-credential-transport-receiver.ts",
      ), "utf8"),
    ]);
    expect(mainEntry).toContain("foundationEnabled: false");
    expect(preloadEntry).toContain("foundationEnabled: false");
    expect(mainEntry).not.toContain("ipcMain.handle(\"personal-credential");
    expect(preloadEntry).not.toContain("exposeInMainWorld(\"robothreePersonalModel");
    expect(controller).toContain("productionBusinessHandlerReady: false");
    expect(receiver).toContain("Internal-only mutation seam");
  });
});

function directionalHarness(
  broker: FakeBroker,
  revealConsumer?: (secret: Uint8Array) => void | Promise<void>,
  leaseOverride: Partial<PersonalCredentialBrokerLease> = {},
) {
  const webContents = new FakeWebContents(17, 3);
  const subscription = captureSubscription();
  const receiver = new PersonalCredentialTransportPreloadReceiver({
    foundationEnabled: true,
    subscribe: subscription.subscribe,
    now: () => initialNow,
    ...(revealConsumer === undefined ? {} : { revealConsumer }),
  });
  receiver.start();
  webContents.mainFrame.onOffer = (channel, input, ports) => {
    if (channel !== "robothree:personal-credential-transport:port-v1") {
      throw new Error("unexpected_private_channel");
    }
    subscription.listener?.({ ports }, input);
  };
  const adapter = new PersonalCredentialTransportMainAdapter({
    foundationEnabled: true,
    ticketKey,
    frameAuthorizationKey: authorizationKey,
    now: () => initialNow,
  });
  const controller = new PersonalCredentialTransportProductionController({
    foundationEnabled: true,
    adapter,
    createMessageChannel: () => fakeChannel().channel,
    brokerLeaseProvider: {
      current: () => ({
        runtimeInstanceId: broker.runtimeInstanceId,
        channelInstanceId: broker.channelInstanceId,
        clientInstanceId: broker.clientInstanceId,
        client: broker as unknown as PersonalCredentialBrokerClient,
        ...leaseOverride,
      }),
    },
    now: () => initialNow,
  });
  controller.attachWebContents(webContents as unknown as WebContents);
  return {
    webContents,
    receiver,
    controller,
    close: () => {
      receiver.close();
      controller.close();
    },
  };
}

class FakeBroker {
  public readonly runtimeInstanceId = id("21");
  public readonly channelInstanceId = id("31");
  public readonly clientInstanceId = id("22");
  public executeCount = 0;
  public readonly seenSecrets: number[][] = [];
  readonly #revealSecret: number[];
  readonly #deferred: boolean;
  #pending:
    | Readonly<{
      command: PersonalCredentialBrokerCommand;
      resolve: (result: PersonalCredentialBrokerResult) => void;
    }>
    | undefined;

  public constructor(input: Readonly<{
    revealSecret?: number[];
    deferred?: boolean;
  }> = {}) {
    this.#revealSecret = input.revealSecret ?? [];
    this.#deferred = input.deferred === true;
  }

  public execute(command: PersonalCredentialBrokerCommand): Promise<PersonalCredentialBrokerResult> {
    this.executeCount += 1;
    if (command.secret !== undefined) this.seenSecrets.push([...command.secret]);
    if (this.#deferred) {
      return new Promise((resolvePromise) => {
        this.#pending = { command, resolve: resolvePromise };
      });
    }
    return Promise.resolve(this.#result(command));
  }

  public completeDeferred(): void {
    const pending = this.#pending;
    if (pending === undefined) throw new Error("no_deferred_broker_call");
    this.#pending = undefined;
    pending.resolve(this.#result(pending.command));
  }

  #result(command: PersonalCredentialBrokerCommand): PersonalCredentialBrokerResult {
    const reveal = command.commandType === "reveal";
    const secret = reveal ? Uint8Array.from(this.#revealSecret) : undefined;
    return {
      header: PersonalCredentialBrokerResponseHeaderSchema.parse({
        protocolVersion: PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
        channelInstanceId: this.channelInstanceId,
        commandId: command.commandId,
        transportRequestId: id(String(500 + this.executeCount)),
        status: "completed",
        secretByteLength: secret?.byteLength ?? 0,
      }),
      ...(secret === undefined ? {} : { secret }),
    };
  }
}

function captureSubscription(): {
  subscribe: PersonalCredentialTransportPortSubscription;
  listener: ((event: PersonalCredentialTransportPortOfferEvent, input: unknown) => void)
    | undefined;
} {
  const state: {
    listener: ((event: PersonalCredentialTransportPortOfferEvent, input: unknown) => void)
      | undefined;
  } = { listener: undefined };
  return {
    subscribe: (_channel, listener) => {
      state.listener = listener;
      return () => {
        state.listener = undefined;
      };
    },
    get listener() {
      return state.listener;
    },
  };
}

class FakeWebContents extends EventEmitter {
  public readonly mainFrame: FakeFrame;

  public constructor(public readonly id: number, routingId: number) {
    super();
    this.mainFrame = new FakeFrame(routingId);
  }

  public isDestroyed(): boolean {
    return false;
  }
}

class FakeFrame {
  public onOffer: ((channel: string, input: unknown, ports: unknown[]) => void) | undefined;

  public constructor(public readonly routingId: number) {}

  public isDestroyed(): boolean {
    return false;
  }

  public postMessage(channel: string, input: unknown, ports: unknown[]): void {
    this.onOffer?.(channel, input, ports);
  }
}

class FakePort extends EventEmitter implements PersonalCredentialTransportDomPort {
  public peer: FakePort | undefined;
  public onmessage: PersonalCredentialTransportDomPort["onmessage"] = null;
  public onclose: PersonalCredentialTransportDomPort["onclose"] = null;
  public closed = false;

  public postMessage(message: unknown): void {
    if (this.closed) throw new Error("port_closed");
    const peer = this.peer;
    if (peer === undefined || peer.closed) throw new Error("peer_closed");
    const cloned = structuredClone(message);
    queueMicrotask(() => {
      if (peer.closed) return;
      const event = { data: cloned, ports: [] };
      peer.emit("message", event);
      peer.onmessage?.(event);
    });
  }

  public start(): void {}

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit("close");
    const peer = this.peer;
    queueMicrotask(() => {
      peer?.emit("close");
      peer?.onclose?.();
    });
  }
}

function fakeChannel(): { channel: MessageChannelMain } {
  const main = new FakePort();
  const renderer = new FakePort();
  main.peer = renderer;
  renderer.peer = main;
  return {
    channel: {
      port1: renderer as unknown as MessagePortMain,
      port2: main as unknown as MessagePortMain,
    } as MessageChannelMain,
  };
}

function ipcEvent(sender: FakeWebContents): IpcMainEvent {
  return { sender, senderFrame: sender.mainFrame } as unknown as IpcMainEvent;
}

function prepared(
  suffix: string,
  operationType: "create" | "update" | "reveal",
) {
  const base = Number.parseInt(suffix, 10) * 20;
  return {
    schemaVersion: "personal-credential-transport-prepared-command.v1" as const,
    runtimeInstanceId: id(String(base + 1)),
    clientInstanceId: id(String(base + 2)),
    commandId: id(String(base + 3)),
    correlationId: id(String(base + 4)),
    operationType,
    personalModelId: `model.personal.directional${suffix}`,
    expectedConfigurationRevision: `sha256:${"a".repeat(64)}`,
    ...(operationType === "reveal"
      ? { expectedExecutionDefinitionDigest: `sha256:${"c".repeat(64)}` }
      : {}),
    requestDigest: `sha256:${"b".repeat(64)}`,
    deadlineAt: new Date(initialNow + 4_000).toISOString(),
  };
}

function ticketInput(): CreatePersonalCredentialTransportTicketInput {
  return {
    runtimeInstanceId: id("21"),
    clientInstanceId: id("22"),
    commandId: id("23"),
    correlationId: id("24"),
    operationType: "create",
    personalModelId: "model.personal.authorization",
    expectedConfigurationRevision: `sha256:${"a".repeat(64)}`,
    requestDigest: `sha256:${"b".repeat(64)}`,
    webContentsId: 17,
    mainFrameRoutingId: 3,
    navigationEpoch: 1,
  };
}

function identity(
  input: CreatePersonalCredentialTransportTicketInput,
): MainDerivedPersonalCredentialTransportIdentity {
  return {
    runtimeInstanceId: input.runtimeInstanceId,
    clientInstanceId: input.clientInstanceId,
    commandId: input.commandId,
    correlationId: input.correlationId,
    requestDigest: input.requestDigest,
    webContentsId: input.webContentsId,
    mainFrameRoutingId: input.mainFrameRoutingId,
    navigationEpoch: input.navigationEpoch,
  };
}

async function nextTurns(count = 2): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
  }
}

function id(suffix: string): string {
  return `019f9c00-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
