import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  IpcMainEvent,
  MessageChannelMain,
  MessagePortMain,
  WebContents,
} from "electron";

import { describe, expect, it } from "vitest";

import {
  PersonalCredentialTransportProductionController,
} from "../src/main/personal-credential-transport-controller.js";
import {
  PersonalCredentialTransportMainAdapter,
} from "../src/main/personal-credential-transport.js";
import {
  PersonalCredentialTransportPreloadReceiver,
  type PersonalCredentialTransportDomPort,
  type PersonalCredentialTransportPortOfferEvent,
  type PersonalCredentialTransportPortSubscription,
} from "../src/preload/personal-credential-transport-receiver.js";

const initialNow = Date.parse("2026-08-22T12:00:00.000Z");
const ticketKey = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);

describe("STRM-2.1 production lifecycle foundation", () => {
  it("installs production Main wiring while keeping activation and feature false", () => {
    const webContents = new FakeWebContents(17, 3);
    const controller = new PersonalCredentialTransportProductionController({
      foundationEnabled: false,
      createMessageChannel: () => fakeChannel().channel,
      now: () => initialNow,
    });
    controller.attachWebContents(webContents as unknown as WebContents);
    expect(controller.snapshot()).toMatchObject({
      foundationEnabled: false,
      mainWiringInstalled: true,
      productionFeatureEnabled: false,
      productionSensitiveTransportReady: false,
      transportBlockerClosed: false,
      windowCount: 1,
      sessionCount: 0,
    });
    expect(() => controller.openPreparedCommand(
      prepared(),
      ipcEvent(webContents),
    )).toThrow("personal_credential_transport_unavailable");
    controller.close();
    expect(controller.snapshot()).toMatchObject({
      windowCount: 0,
      navigationListenerCount: 0,
      closed: true,
    });
  });

  it("completes an exact one-shot ready and cancel lifecycle without public IPC", async () => {
    const harness = lifecycleHarness();
    const ticket = harness.controller.openPreparedCommand(
      prepared(),
      ipcEvent(harness.webContents),
    );
    await nextTurns();
    expect(ticket).toMatchObject({
      webContentsId: 17,
      mainFrameRoutingId: 3,
      navigationEpoch: 1,
    });
    expect(harness.controller.snapshot()).toMatchObject({
      sessionCount: 1,
      messagePortCount: 1,
      timerCount: 1,
    });
    expect(harness.receiver.snapshot()).toMatchObject({
      sessionCount: 1,
      tombstoneCount: 0,
      productionFeatureEnabled: false,
    });

    await harness.receiver.cancel(ticket.commandId);
    await nextTurns();
    expect(harness.controller.snapshot()).toMatchObject({
      sessionCount: 0,
      messagePortCount: 0,
      timerCount: 0,
    });
    expect(harness.receiver.snapshot()).toMatchObject({
      sessionCount: 0,
      tombstoneCount: 1,
    });
    expect(harness.adapter.snapshot()).toMatchObject({ activeCount: 0, tombstoneCount: 1 });
    harness.close();
  });

  it("derives exact Main identity and rejects foreign or subframe events", () => {
    const harness = lifecycleHarness();
    const foreign = new FakeWebContents(99, 9);
    expect(() => harness.controller.openPreparedCommand(
      prepared(),
      ipcEvent(foreign),
    )).toThrow("personal_credential_transport_identity_mismatch");
    expect(() => harness.controller.openPreparedCommand(
      prepared(),
      ipcEvent(harness.webContents, new FakeFrame(44)),
    )).toThrow("personal_credential_transport_identity_mismatch");
    expect(harness.channels).toHaveLength(0);
    harness.close();
  });

  it("invalidates only main-frame in-page navigation and advances the epoch", async () => {
    const harness = lifecycleHarness();
    harness.controller.openPreparedCommand(prepared("1"), ipcEvent(harness.webContents));
    await nextTurns();
    harness.webContents.emit(
      "did-navigate-in-page",
      {},
      "file:///renderer/index.html#subframe",
      false,
      1,
      8,
    );
    expect(harness.controller.snapshot().sessionCount).toBe(1);
    harness.webContents.emit(
      "did-navigate-in-page",
      {},
      "file:///renderer/index.html#next",
      true,
      1,
      3,
    );
    await nextTurns();
    expect(harness.controller.snapshot().sessionCount).toBe(0);
    expect(harness.receiver.snapshot().sessionCount).toBe(0);

    const next = harness.controller.openPreparedCommand(
      prepared("2"),
      ipcEvent(harness.webContents),
    );
    expect(next.navigationEpoch).toBe(2);
    harness.close();
  });

  it("fails closed on malformed control and clears an attached byte body", async () => {
    const harness = lifecycleHarness();
    harness.controller.openPreparedCommand(prepared(), ipcEvent(harness.webContents));
    await nextTurns();
    const body = Uint8Array.from([9, 8, 7]);
    harness.channels[0]!.renderer.postMessage({
      controlType: "ready",
      controlDigest: "sha256:invalid",
      body,
    });
    await nextTurns();
    expect(body.every((value) => value === 0)).toBe(false);
    // structured clone produces another application copy; the sender-owned copy
    // remains caller responsibility and is not falsely claimed as zeroized.
    expect(harness.controller.snapshot().sessionCount).toBe(0);
    expect(harness.adapter.snapshot()).toMatchObject({ activeCount: 0, tombstoneCount: 1 });
    harness.close();
  });

  it("closes duplicate or multi-port offers without creating receiver state", async () => {
    const subscription = captureSubscription();
    const receiver = new PersonalCredentialTransportPreloadReceiver({
      foundationEnabled: true,
      subscribe: subscription.subscribe,
      now: () => initialNow,
    });
    receiver.start();
    const first = fakeChannel();
    const second = fakeChannel();
    subscription.listener?.(
      { ports: [first.renderer, second.renderer] },
      { unexpected: true },
    );
    await nextTurns();
    expect(first.renderer.closed).toBe(true);
    expect(second.renderer.closed).toBe(true);
    expect(receiver.snapshot().sessionCount).toBe(0);
    receiver.close();
  });

  it("keeps the production Preload receiver private and default-disabled", async () => {
    const [mainEntry, preloadEntry, rendererBoundary] = await Promise.all([
      readFile(resolve("apps/desktop/src/main/index.ts"), "utf8"),
      readFile(resolve("apps/desktop/src/preload/index.ts"), "utf8"),
      readFile(resolve("apps/desktop/tests/renderer-workbench-boundary.test.ts"), "utf8"),
    ]);
    expect(mainEntry).toContain("PersonalCredentialTransportProductionController");
    expect(mainEntry).toContain("foundationEnabled: false");
    expect(preloadEntry).toContain("PersonalCredentialTransportPreloadReceiver");
    expect(preloadEntry).toContain("foundationEnabled: false");
    expect(preloadEntry).not.toContain("exposeInMainWorld(\"robothreeCredential\"");
    expect(preloadEntry).not.toContain("exposeInMainWorld(\"robothreePersonalModel\"");
    expect(rendererBoundary).not.toContain("personal-credential-transport-receiver");
  });
});

function lifecycleHarness() {
  const webContents = new FakeWebContents(17, 3);
  const subscription = captureSubscription();
  const receiver = new PersonalCredentialTransportPreloadReceiver({
    foundationEnabled: true,
    subscribe: subscription.subscribe,
    now: () => initialNow,
  });
  receiver.start();
  webContents.mainFrame.onOffer = (channel, input, ports) => {
    if (channel !== "robothree:personal-credential-transport:port-v1") {
      throw new Error("unexpected_private_channel");
    }
    subscription.listener?.({ ports }, input);
  };
  const channels: FakeChannel[] = [];
  const adapter = new PersonalCredentialTransportMainAdapter({
    foundationEnabled: true,
    ticketKey,
    now: () => initialNow,
  });
  const controller = new PersonalCredentialTransportProductionController({
    foundationEnabled: true,
    adapter,
    createMessageChannel: () => {
      const item = fakeChannel();
      channels.push(item);
      return item.channel;
    },
    now: () => initialNow,
  });
  controller.attachWebContents(webContents as unknown as WebContents);
  return {
    webContents,
    receiver,
    adapter,
    controller,
    channels,
    close: () => {
      receiver.close();
      controller.close();
    },
  };
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
  #destroyed = false;

  public constructor(public readonly id: number, routingId: number) {
    super();
    this.mainFrame = new FakeFrame(routingId);
  }

  public isDestroyed(): boolean {
    return this.#destroyed;
  }

  public destroyForTest(): void {
    this.#destroyed = true;
    this.emit("destroyed");
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

type FakeChannel = {
  channel: MessageChannelMain;
  main: FakePort;
  renderer: FakePort;
};

function fakeChannel(): FakeChannel {
  const main = new FakePort();
  const renderer = new FakePort();
  main.peer = renderer;
  renderer.peer = main;
  return {
    channel: {
      port1: renderer as unknown as MessagePortMain,
      port2: main as unknown as MessagePortMain,
    } as MessageChannelMain,
    main,
    renderer,
  };
}

function ipcEvent(
  sender: FakeWebContents,
  senderFrame: FakeFrame = sender.mainFrame,
): IpcMainEvent {
  return { sender, senderFrame } as unknown as IpcMainEvent;
}

function prepared(suffix = "1") {
  const base = Number.parseInt(suffix, 10) * 20;
  return {
    schemaVersion: "personal-credential-transport-prepared-command.v1" as const,
    runtimeInstanceId: id(String(base + 1)),
    clientInstanceId: id(String(base + 2)),
    commandId: id(String(base + 3)),
    correlationId: id(String(base + 4)),
    operationType: "create" as const,
    personalModelId: `model.personal.test${suffix}`,
    expectedConfigurationRevision: `sha256:${"a".repeat(64)}`,
    requestDigest: `sha256:${"b".repeat(64)}`,
    deadlineAt: new Date(initialNow + 4_000).toISOString(),
  };
}

async function nextTurns(): Promise<void> {
  await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
  await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
}

function id(suffix: string): string {
  return `019f9a00-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
