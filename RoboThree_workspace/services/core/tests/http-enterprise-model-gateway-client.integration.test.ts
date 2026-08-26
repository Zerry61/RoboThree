import { randomBytes, randomUUID } from "node:crypto";
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import {
  EnterpriseModelGatewayClientError,
  HttpEnterpriseModelGatewayClient,
  type EnterpriseAccessTokenLease,
  type EnterpriseAccessTokenProvider,
  type EnterpriseAccessTokenRenewalRequest,
  type EnterpriseAccessTokenRequest,
} from "../src/index.js";

const scope = {
  enterpriseId: "enterprise-cgf2c1",
  userId: "user-cgf2c1",
  deviceId: "device-cgf2c1",
  clientInstanceId: "client-cgf2c1",
};
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error === undefined ? resolve() : reject(error));
    })));
});

describe("CGF-2C.1 HTTP Enterprise Model Gateway client", () => {
  it("locks all four HTTP operations to the selected v1alpha2 wire version", async () => {
    const token = randomBytes(32).toString("base64url");
    const ids = identities();
    const paths: string[] = [];
    const origin = await listen((request, response) => {
      paths.push(`${request.method} ${request.url}`);
      if (request.method === "POST" && request.url?.endsWith("/cancel")) {
        json(response, 200, status(ids, "cancelled", 2, 3, "v1alpha2"));
        return;
      }
      if (request.method === "POST") {
        json(response, 202, accepted(ids, "v1alpha2"));
        return;
      }
      if (request.url?.includes("/events")) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        for (const event of events(ids, "v1alpha2")) {
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        response.end();
        return;
      }
      json(response, 200, status(ids, "running", 1, 2, "v1alpha2"));
    });
    const operation = client(origin, new TokenProvider(token)).begin(scope, "v1alpha2");
    const signal = new AbortController().signal;
    await operation.accept({}, signal);
    await operation.status(ids.invocationId, signal);
    await operation.cancel({
      invocationId: ids.invocationId,
      requestId: randomUUID(),
      expectedStatusRevision: 1,
      reason: "user_requested",
      signal,
    });
    await collect(operation, ids.invocationId);
    expect(paths).toEqual([
      "POST /v1alpha2/model-invocations",
      `GET /v1alpha2/model-invocations/${ids.invocationId}`,
      `POST /v1alpha2/model-invocations/${ids.invocationId}/cancel`,
      `GET /v1alpha2/model-invocations/${ids.invocationId}/events`,
    ]);
  });

  it("strictly consumes started/text/tool/usage/terminal with an opaque durable cursor", async () => {
    const token = randomBytes(32).toString("base64url");
    const ids = identities();
    const origin = await listen((request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${token}`);
      if (request.method === "POST") {
        json(response, 202, accepted(ids));
        return;
      }
      if (request.url?.includes("/events")) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(":heartbeat\n\n");
        for (const event of events(ids)) response.write(`data: ${JSON.stringify(event)}\n\n`);
        response.end();
        return;
      }
      json(response, 200, status(ids, "running", 1, 2));
    });
    const operation = client(origin, new TokenProvider(token)).begin(scope);
    const abort = new AbortController();
    const acceptedResult = await operation.accept({}, abort.signal);
    const collected = [];
    for await (const event of operation.events({
      invocationId: acceptedResult.invocationId,
      durableCursor: acceptedResult.durableCursor,
      signal: abort.signal,
    })) collected.push(event);
    expect(collected.map((event) => event.eventType)).toEqual([
      "started",
      "text_delta",
      "tool_call",
      "usage_recorded",
      "completed",
    ]);
    expect(collected[2]).toMatchObject({
      eventType: "tool_call",
      call: { name: "tool.echo", arguments: { value: "hello" } },
    });
  });

  it("renews an expired token at most once and keeps the same logical request", async () => {
    const first = randomBytes(32).toString("base64url");
    const second = randomBytes(32).toString("base64url");
    const provider = new TokenProvider(first, second);
    const ids = identities();
    let requests = 0;
    const origin = await listen((request, response) => {
      requests += 1;
      if (request.headers.authorization === `Bearer ${first}`) {
        json(response, 401, { code: "access_token_expired" });
        return;
      }
      json(response, 202, accepted(ids));
    });
    const operation = client(origin, provider).begin(scope);
    await expect(operation.accept({}, new AbortController().signal)).resolves.toMatchObject({
      invocationId: ids.invocationId,
      clientRequestId: ids.clientRequestId,
    });
    expect(requests).toBe(2);
    expect(provider.renewals).toBe(1);
  });

  it("fails closed on redirect, wrong identity, sequence gaps and inactivity", async () => {
    const token = randomBytes(32).toString("base64url");
    const ids = identities();
    const redirected = await listen((_request, response) => {
      response.writeHead(302, { location: "https://outside.invalid/steal" }).end();
    });
    await expect(client(redirected, new TokenProvider(token)).begin(scope)
      .accept({}, new AbortController().signal)).rejects.toMatchObject({
        code: "model_gateway.client_redirect_rejected",
      });

    const wrong = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const event = events(ids)[0]!;
      response.end(`data: ${JSON.stringify({ ...event, invocationId: randomUUID() })}\n\n`);
    });
    await expect(collect(client(wrong, new TokenProvider(token)).begin(scope), ids.invocationId))
      .rejects.toBeInstanceOf(EnterpriseModelGatewayClientError);

    const gap = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const event = events(ids)[1]!;
      response.end(`data: ${JSON.stringify({ ...event, streamSequence: 2 })}\n\n`);
    });
    await expect(collect(client(gap, new TokenProvider(token)).begin(scope), ids.invocationId))
      .rejects.toMatchObject({ code: "model_gateway.client_protocol_invalid" });

    const idle = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(":connected\n\n");
    });
    await expect(collect(client(idle, new TokenProvider(token), 25).begin(scope), ids.invocationId))
      .rejects.toMatchObject({ code: "model_gateway.client_timeout" });
  });
});

class TokenProvider implements EnterpriseAccessTokenProvider {
  public renewals = 0;
  readonly #initial: string;
  readonly #renewed: string;

  constructor(initial: string, renewed = initial) {
    this.#initial = initial;
    this.#renewed = renewed;
  }

  acquire(_request: EnterpriseAccessTokenRequest): Promise<EnterpriseAccessTokenLease> {
    return Promise.resolve(lease(this.#initial, "token.initial"));
  }

  renew(_request: EnterpriseAccessTokenRenewalRequest): Promise<EnterpriseAccessTokenLease> {
    this.renewals += 1;
    return Promise.resolve(lease(this.#renewed, "token.renewed"));
  }

  assertCurrentSession(): Promise<void> { return Promise.resolve(); }
}

function client(origin: string, tokenProvider: EnterpriseAccessTokenProvider, timeout = 1_000) {
  return new HttpEnterpriseModelGatewayClient({
    baseUrl: origin,
    tokenProvider,
    requestTimeoutMs: timeout,
    allowInsecureLoopbackForTest: true,
  });
}

async function collect(operation: ReturnType<HttpEnterpriseModelGatewayClient["begin"]>, invocationId: string) {
  const output = [];
  for await (const event of operation.events({
    invocationId,
    signal: new AbortController().signal,
  })) output.push(event);
  return output;
}

function lease(compactToken: string, tokenId: string): EnterpriseAccessTokenLease {
  return {
    compactToken,
    tokenId,
    audience: "enterprise-model-gateway",
    permissions: ["model.use"],
    issuedAt: "2026-08-03T00:00:00.000Z",
    expiresAt: "2099-08-03T00:00:00.000Z",
    scope,
  };
}

function identities() {
  return {
    invocationId: randomUUID(),
    clientRequestId: randomUUID(),
    toolCallId: randomUUID(),
  };
}

function accepted(
  ids: ReturnType<typeof identities>,
  contractVersion: "v1alpha1" | "v1alpha2" = "v1alpha1",
) {
  return {
    contractVersion,
    invocationId: ids.invocationId,
    clientRequestId: ids.clientRequestId,
    requestDigest: "a".repeat(64),
    status: "accepted",
    statusRevision: 0,
    createdAt: "2026-08-03T00:00:00.000Z",
    lastDurableEventSequence: 1,
    durableCursor: `cursor:1:${"a".repeat(16)}`,
  };
}

function status(
  ids: ReturnType<typeof identities>,
  state: string,
  revision: number,
  sequence: number,
  contractVersion: "v1alpha1" | "v1alpha2" = "v1alpha1",
) {
  return {
    contractVersion,
    invocationId: ids.invocationId,
    clientRequestId: ids.clientRequestId,
    requestDigest: "a".repeat(64),
    modelId: "model.enterprise",
    modelRevision: "b".repeat(64),
    configurationRevision: "c".repeat(64),
    runtimeRegistryGeneration: "d".repeat(64),
    status: state,
    statusRevision: revision,
    createdAt: "2026-08-03T00:00:00.000Z",
    lastDurableEventSequence: sequence,
    durableCursor: `cursor:${sequence}:${"d".repeat(16)}`,
  };
}

function events(
  ids: ReturnType<typeof identities>,
  contractVersion: "v1alpha1" | "v1alpha2" = "v1alpha1",
) {
  const common = { contractVersion, invocationId: ids.invocationId };
  const ephemeral = (sequence: number, eventType: string, eventPayload: unknown) => ({
    ...common,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: sequence,
    eventType,
    eventPayload,
    eventDigest: String(sequence).repeat(64),
    occurredAt: "2026-08-03T00:00:01.000Z",
  });
  const durable = (sequence: number, eventType: string, eventPayload: unknown) => ({
    ...common,
    eventId: randomUUID(),
    eventClass: "durable",
    durableSequence: sequence,
    eventType,
    eventPayload,
    eventDigest: String(sequence).repeat(64),
    durableCursor: `cursor:${sequence}:${String(sequence).repeat(16)}`,
    occurredAt: "2026-08-03T00:00:02.000Z",
  });
  return [
    ephemeral(1, "started", {}),
    ephemeral(2, "text_delta", { delta: "hello" }),
    ephemeral(3, "tool_call", { call: {
      toolCallId: ids.toolCallId,
      name: "tool.echo",
      arguments: { value: "hello" },
      argumentsDigest: "e".repeat(64),
    } }),
    durable(2, "usage_recorded", { usage: { inputTokens: 2, outputTokens: 3 } }),
    durable(3, "completed", { status: "completed", statusRevision: 2 }),
  ];
}

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("missing test address");
  return `http://127.0.0.1:${address.port}`;
}

function json(response: ServerResponse, statusCode: number, value: unknown): void {
  const payload = JSON.stringify(value);
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  }).end(payload);
}
