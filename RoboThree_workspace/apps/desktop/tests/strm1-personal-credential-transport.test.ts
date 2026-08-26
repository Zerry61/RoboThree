import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  PERSONAL_CREDENTIAL_TRANSPORT_MAX_INFLIGHT,
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
  PersonalCredentialTransportFrameHeaderSchema,
  canonicalPersonalCredentialTransportFrameMaterial,
  type PersonalCredentialTransportTicket,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";
import { describe, expect, it } from "vitest";

import {
  PersonalCredentialTransportError,
  PersonalCredentialTransportMainAdapter,
  type CreatePersonalCredentialTransportTicketInput,
  type MainDerivedPersonalCredentialTransportIdentity,
} from "../src/main/personal-credential-transport.js";
import {
  PersonalCredentialTransportPreloadAdapter,
  PersonalCredentialTransportPreloadError,
  type PersonalCredentialTransportPrivatePort,
} from "../src/preload/personal-credential-transport.js";

const initialNow = Date.parse("2026-08-22T12:00:00.000Z");
const ticketKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

describe("STRM-1 Main sensitive transport registry", () => {
  it("is production-disabled by default and keeps the blocker open", () => {
    const adapter = new PersonalCredentialTransportMainAdapter();
    expect(() => adapter.createTicket(ticketInput())).toThrowError(
      new PersonalCredentialTransportError("personal_credential_transport_unavailable"),
    );
    expect(adapter.snapshot()).toMatchObject({
      foundationEnabled: false,
      productionFeatureEnabled: false,
      transportBlockerClosed: false,
      activeCount: 0,
    });
    const rejectedBody = Uint8Array.from([5, 4, 3]);
    expect(() => adapter.acceptMutationEnvelope(
      {} as PersonalCredentialTransportTicket,
      identity(ticketInput()),
      { header: {}, body: rejectedBody },
    )).toThrow("personal_credential_transport_unavailable");
    expect(rejectedBody.every((value) => value === 0)).toBe(true);
    adapter.close();
  });

  it("binds a signed ticket to exact Main-derived identity and one frame", async () => {
    const adapter = enabledMain();
    const input = ticketInput();
    const ticket = adapter.createTicket(input);
    adapter.bindPort(ticket, identity(input));
    const body = Uint8Array.from([8, 7, 6, 5]);
    const envelope = await mutationEnvelope(ticket, body);
    expect(adapter.acceptMutationEnvelope(ticket, identity(input), envelope).body).toBe(body);
    expect(() => adapter.acceptMutationEnvelope(ticket, identity(input), envelope)).toThrow(
      "personal_credential_transport_duplicate",
    );
    expect(body.every((value) => value === 0)).toBe(true);
    adapter.complete(ticket, "completed");
    expect(() => adapter.bindPort(ticket, identity(input))).toThrow(
      "personal_credential_transport_replay_forbidden",
    );
    expect(adapter.snapshot()).toMatchObject({ activeCount: 0, tombstoneCount: 1 });
    adapter.close();
    expect(adapter.snapshot().registryCount).toBe(0);
  });

  it("rejects foreign frame/navigation/runtime identity before accepting bytes", async () => {
    const adapter = enabledMain();
    const input = ticketInput();
    const ticket = adapter.createTicket(input);
    expect(() => adapter.bindPort(ticket, { ...identity(input), webContentsId: 99 }))
      .toThrow("personal_credential_transport_identity_mismatch");
    adapter.bindPort(ticket, identity(input));
    const body = Uint8Array.from([1, 2, 3]);
    const envelope = await mutationEnvelope(ticket, body);
    expect(adapter.invalidateNavigation(input.webContentsId, input.navigationEpoch + 1)).toBe(1);
    expect(() => adapter.acceptMutationEnvelope(ticket, identity(input), envelope)).toThrow(
      "personal_credential_transport_replay_forbidden",
    );
    expect(body.every((value) => value === 0)).toBe(true);
    adapter.close();
  });

  it("enforces ticket expiry, global concurrency and per-model gates", () => {
    let now = initialNow;
    const adapter = enabledMain(() => now);
    const first = ticketInput("1", "model.personal.one");
    adapter.createTicket(first);
    expect(() => adapter.createTicket(ticketInput("2", "model.personal.one")))
      .toThrow("personal_credential_transport_busy");
    for (let index = 2; index <= PERSONAL_CREDENTIAL_TRANSPORT_MAX_INFLIGHT; index += 1) {
      adapter.createTicket(ticketInput(String(index), `model.personal.${index}`));
    }
    expect(() => adapter.createTicket(ticketInput("9", "model.personal.nine")))
      .toThrow("personal_credential_transport_busy");
    now += 5_001;
    expect(adapter.snapshot()).toMatchObject({ activeCount: 0, tombstoneCount: 4 });
    adapter.close();
  });

  it("rate-limits reveal admission without merging requests", () => {
    const adapter = enabledMain();
    for (let index = 1; index <= 5; index += 1) {
      const ticket = adapter.createTicket({
        ...ticketInput(String(index), `model.personal.reveal${index}`),
        operationType: "reveal",
      });
      adapter.complete(ticket, "cancelled");
    }
    expect(() => adapter.createTicket({
      ...ticketInput("8", "model.personal.reveal8"),
      operationType: "reveal",
    })).toThrow("personal_credential_transport_busy");
    adapter.close();
  });
});

describe("STRM-1 private Preload adapter", () => {
  it("is disabled by default and clears caller-owned bytes on rejection", async () => {
    const main = enabledMain();
    const ticket = main.createTicket(ticketInput());
    const secret = Uint8Array.from([9, 8, 7]);
    const preload = new PersonalCredentialTransportPreloadAdapter();
    await expect(preload.sendMutation(ticket, secret, fakePort())).rejects.toThrowError(
      new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_unavailable",
      ),
    );
    expect(secret.every((value) => value === 0)).toBe(true);
    expect(preload.snapshot()).toMatchObject({
      productionFeatureEnabled: false,
      transportBlockerClosed: false,
    });
    const revealBody = Uint8Array.from([6, 5, 4]);
    await expect(preload.consumeReveal(
      ticket,
      { header: {}, body: revealBody },
      () => undefined,
    )).rejects.toThrow("personal_credential_transport_unavailable");
    expect(revealBody.every((value) => value === 0)).toBe(true);
    main.close();
  });

  it("posts one structured-clone Uint8Array envelope and clears its local bytes", async () => {
    const main = enabledMain();
    const input = ticketInput();
    const ticket = main.createTicket(input);
    main.bindPort(ticket, identity(input));
    const captured: unknown[] = [];
    const secret = Uint8Array.from([4, 3, 2, 1]);
    const preload = new PersonalCredentialTransportPreloadAdapter({
      foundationEnabled: true,
      now: () => initialNow,
    });
    await preload.sendMutation(ticket, secret, fakePort(captured));
    expect(secret.every((value) => value === 0)).toBe(true);
    expect(captured).toHaveLength(1);
    const accepted = main.acceptMutationEnvelope(ticket, identity(input), captured[0]);
    expect([...accepted.body]).toEqual([4, 3, 2, 1]);
    accepted.body.fill(0);
    main.complete(ticket, "completed");
    await expect(preload.sendMutation(ticket, Uint8Array.from([1]), fakePort()))
      .rejects.toThrow("personal_credential_transport_replay_forbidden");
    preload.close();
    main.close();
  });

  it("consumes reveal bytes once and clears the received application copy", async () => {
    const main = enabledMain();
    const revealInput = { ...ticketInput(), operationType: "reveal" as const };
    const ticket = main.createTicket(revealInput);
    const injectedBody = Uint8Array.from([99]);
    const injected = await envelope(ticket, "reveal_secret", injectedBody);
    expect(() => main.acceptMutationEnvelope(ticket, identity(revealInput), injected))
      .toThrow("personal_credential_transport_identity_mismatch");
    expect(injectedBody.every((value) => value === 0)).toBe(true);
    main.bindPort(ticket, identity(revealInput));
    const body = Uint8Array.from([11, 22, 33]);
    const revealFrame = main.createRevealEnvelope(
      ticket,
      identity(revealInput),
      body,
    );
    const seen: number[][] = [];
    const preload = new PersonalCredentialTransportPreloadAdapter({
      foundationEnabled: true,
      now: () => initialNow,
    });
    await preload.consumeReveal(ticket, revealFrame, (value) => {
      seen.push([...value]);
    });
    expect(seen).toEqual([[11, 22, 33]]);
    expect(body.every((value) => value === 0)).toBe(true);
    await expect(preload.consumeReveal(ticket, revealFrame, () => undefined))
      .rejects.toThrow("personal_credential_transport_replay_forbidden");
    preload.close();
    main.close();
  });
});

describe("STRM-1 boundary", () => {
  it("does not register the private adapter or expose it through production Preload", async () => {
    const [mainEntry, preloadEntry, contractRoot] = await Promise.all([
      readFile(resolve("apps/desktop/src/main/index.ts"), "utf8"),
      readFile(resolve("apps/desktop/src/preload/index.ts"), "utf8"),
      readFile(resolve("packages/contracts/src/index.ts"), "utf8"),
    ]);
    for (const source of [mainEntry, preloadEntry, contractRoot]) {
      expect(source).not.toContain("personal-credential-transport-v1");
      expect(source).not.toContain("PersonalCredentialTransportMainAdapter");
      expect(source).not.toContain("PersonalCredentialTransportPreloadAdapter");
    }
  });
});

function enabledMain(now: () => number = () => initialNow) {
  return new PersonalCredentialTransportMainAdapter({
    foundationEnabled: true,
    ticketKey,
    now,
  });
}

function ticketInput(
  suffix = "1",
  personalModelId = "model.personal.test",
): CreatePersonalCredentialTransportTicketInput {
  const base = Number.parseInt(suffix, 10) * 20;
  return {
    runtimeInstanceId: id(String(base + 1)),
    clientInstanceId: id(String(base + 2)),
    commandId: id(String(base + 3)),
    correlationId: id(String(base + 4)),
    operationType: "create",
    personalModelId,
    expectedConfigurationRevision: `sha256:${"a".repeat(64)}`,
    requestDigest: `sha256:${"b".repeat(64)}`,
    webContentsId: base + 5,
    mainFrameRoutingId: base + 6,
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

async function mutationEnvelope(ticket: PersonalCredentialTransportTicket, body: Uint8Array) {
  return envelope(ticket, "mutation_secret", body);
}

async function envelope(
  ticket: PersonalCredentialTransportTicket,
  frameType: "mutation_secret" | "reveal_secret",
  body: Uint8Array,
) {
  const material = {
    protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
    transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
    commandId: ticket.commandId,
    correlationId: ticket.correlationId,
    frameType,
    bodyLength: body.byteLength,
  } as const;
  const frameDigest = `sha256:${createHash("sha256")
    .update(canonicalPersonalCredentialTransportFrameMaterial(material), "utf8")
    .digest("hex")}`;
  return {
    header: PersonalCredentialTransportFrameHeaderSchema.parse({ ...material, frameDigest }),
    body,
  };
}

function fakePort(captured: unknown[] = []): PersonalCredentialTransportPrivatePort {
  return {
    postMessage(message) {
      captured.push(structuredClone(message));
    },
    close() {},
  };
}

function id(suffix: string): string {
  return `019f9b00-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
