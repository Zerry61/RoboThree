import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { PersonalCredentialBrokerClient } from "../../apps/desktop/src/main/personal-credential-broker-client.js";
import { PersonalCredentialBrokerServer } from "../../services/core/src/adapters/credential/personal-credential-broker-server.js";

const digest = `sha256:${"b".repeat(64)}`;

describe("DFI-4A.2.1 Main/Core sensitive broker", () => {
  it("uses independent binary pipes and returns a typed result", async () => {
    const request = new PassThrough();
    const response = new PassThrough();
    const channelInstanceId = randomUUID();
    const clientInstanceId = randomUUID();
    let observed = new Uint8Array(0);
    const server = new PersonalCredentialBrokerServer({
      request,
      response,
      channelInstanceId,
      clientInstanceId,
      handler: async (_header, secret) => {
        observed = Uint8Array.from(secret);
        return { status: "completed" };
      },
    });
    server.start();
    const client = new PersonalCredentialBrokerClient({
      request,
      response,
      channelInstanceId,
      clientInstanceId,
    });
    const secret = Uint8Array.from([1, 0, 255, 4]);
    const result = await client.execute(command("create", secret));
    expect(result.header).toMatchObject({ status: "completed", secretByteLength: 0 });
    expect([...observed]).toEqual([...secret]);
    client.close();
    server.close();
    expect(client.resourceSnapshot()).toEqual({
      inflight: 0, completed: 0, revealTombstones: 0, mutations: 0, closed: true,
    });
    expect(server.resourceSnapshot()).toEqual({ inflight: 0, mutations: 0, closed: true });
    secret.fill(0);
    observed.fill(0);
  });

  it("rejects concurrent mutation and closes pending work once on disconnect", async () => {
    const request = new PassThrough();
    const response = new PassThrough();
    const channelInstanceId = randomUUID();
    const clientInstanceId = randomUUID();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const server = new PersonalCredentialBrokerServer({
      request,
      response,
      channelInstanceId,
      clientInstanceId,
      handler: async () => {
        await gate;
        return { status: "completed" };
      },
    });
    server.start();
    const client = new PersonalCredentialBrokerClient({
      request,
      response,
      channelInstanceId,
      clientInstanceId,
    });
    const first = client.execute(command("create", Uint8Array.from([1])));
    const second = await client.execute(command("update", Uint8Array.from([2])));
    expect(second.header).toMatchObject({
      status: "rejected",
      typedErrorCode: "credential_transport_busy",
    });
    response.end();
    expect((await first).header.status).toBe("uncertain");
    release?.();
    server.close();
  });

  it("coalesces exact command replay and ignores a late response after cancel", async () => {
    const request = new PassThrough();
    const response = new PassThrough();
    const channelInstanceId = randomUUID();
    const clientInstanceId = randomUUID();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const server = new PersonalCredentialBrokerServer({
      request,
      response,
      channelInstanceId,
      clientInstanceId,
      handler: async () => {
        calls += 1;
        await gate;
        return { status: "completed" };
      },
    });
    server.start();
    const client = new PersonalCredentialBrokerClient({
      request,
      response,
      channelInstanceId,
      clientInstanceId,
    });
    const input = command("create", Uint8Array.from([4, 5, 6]));
    const first = client.execute(input);
    const replay = client.execute(input);
    release?.();
    expect((await first).header.status).toBe("completed");
    expect((await replay).header.status).toBe("completed");
    expect(calls).toBe(1);

    let releaseLate: (() => void) | undefined;
    const lateGate = new Promise<void>((resolve) => { releaseLate = resolve; });
    const lateRequest = new PassThrough();
    const lateResponse = new PassThrough();
    const lateServer = new PersonalCredentialBrokerServer({
      request: lateRequest,
      response: lateResponse,
      channelInstanceId,
      clientInstanceId,
      handler: async () => {
        await lateGate;
        return { status: "completed" };
      },
    });
    lateServer.start();
    const lateClient = new PersonalCredentialBrokerClient({
      request: lateRequest,
      response: lateResponse,
      channelInstanceId,
      clientInstanceId,
    });
    const abort = new AbortController();
    const cancelled = lateClient.execute(
      command("create", Uint8Array.from([7, 8, 9])),
      { signal: abort.signal },
    );
    abort.abort();
    expect((await cancelled).header).toMatchObject({
      status: "cancelled",
      typedErrorCode: "credential_store_cancelled",
    });
    releaseLate?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lateClient.resourceSnapshot().inflight).toBe(0);
    client.close();
    server.close();
    lateClient.close();
    lateServer.close();
  });

  it("invalidates old channel identity after restart", async () => {
    const first = channel();
    first.client.close();
    first.server.close();
    const second = channel();
    expect(second.client.channelInstanceId).not.toBe(first.client.channelInstanceId);
    const rejectedReveal = await second.client.execute(command("reveal"));
    expect(rejectedReveal).toMatchObject({
      header: {
        status: "rejected",
        typedErrorCode: "credential_store_unavailable",
        secretByteLength: 0,
      },
    });
    expect(rejectedReveal.secret).toBeUndefined();
    expect(second.client.resourceSnapshot().closed).toBe(false);
    await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
    const rejectedDelete = await second.client.execute(command("delete"));
    expect(rejectedDelete.header).toMatchObject({
      status: "rejected",
      typedErrorCode: "credential_store_unavailable",
    });
    second.client.close();
    second.server.close();
  });
});

function channel() {
  const request = new PassThrough();
  const response = new PassThrough();
  const channelInstanceId = randomUUID();
  const clientInstanceId = randomUUID();
  const server = new PersonalCredentialBrokerServer({
    request,
    response,
    channelInstanceId,
    clientInstanceId,
    handler: async () => ({
      status: "rejected",
      typedErrorCode: "credential_store_unavailable",
    }),
  });
  server.start();
  return {
    server,
    client: new PersonalCredentialBrokerClient({
      request,
      response,
      channelInstanceId,
      clientInstanceId,
    }),
  };
}

function command(
  commandType: "create" | "update" | "delete" | "reveal",
  secret?: Uint8Array,
) {
  return {
    commandId: randomUUID(),
    commandType,
    personalModelId: "model.personal.test",
    ...(commandType === "reveal" ? {
      expectedConfigurationRevision: digest,
      expectedExecutionDefinitionDigest: digest,
    } : {}),
    commandRequestDigest: digest,
    deadlineAt: new Date(Date.now() + 5_000).toISOString(),
    ...(secret === undefined ? {} : { secret }),
  } as const;
}
