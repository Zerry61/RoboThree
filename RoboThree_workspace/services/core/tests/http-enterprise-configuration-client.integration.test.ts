import { randomBytes } from "node:crypto";
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import {
  EnterpriseConfigurationClientError,
  HttpEnterpriseConfigurationClient,
  type EnterpriseAccessTokenLease,
  type EnterpriseAccessTokenProvider,
  type EnterpriseAccessTokenRenewalRequest,
  type EnterpriseAccessTokenRequest,
} from "../src/index.js";
import { enterpriseScope } from "./enterprise-configuration.fixtures.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    })));
});

describe("CGF-1.2C HTTP enterprise configuration client", () => {
  it("sends bearer authorization only to the trusted origin and supports ETag", async () => {
    const token = randomBytes(32).toString("base64url");
    let receivedAuthorization: string | undefined;
    let receivedEtag: string | undefined;
    const origin = await listen((request, response) => {
      receivedAuthorization = request.headers.authorization;
      receivedEtag = request.headers["if-none-match"];
      response.writeHead(304, { etag: "\"snapshot-one\"" }).end();
    });
    const operation = createClient(origin, new TestTokenProvider(token))
      .beginRead(enterpriseScope);

    await expect(operation.readSnapshot({
      ifNoneMatch: "\"snapshot-one\"",
    })).resolves.toEqual({
      status: "not_modified",
      etag: "\"snapshot-one\"",
    });
    expect(receivedAuthorization).toBe(`Bearer ${token}`);
    expect(receivedEtag).toBe("\"snapshot-one\"");
  });

  it("renews an expired token once for the whole read operation", async () => {
    const first = randomBytes(32).toString("base64url");
    const second = randomBytes(32).toString("base64url");
    const provider = new TestTokenProvider(first, second);
    let requests = 0;
    const origin = await listen((request, response) => {
      requests += 1;
      if (request.headers.authorization === `Bearer ${first}`) {
        json(response, 401, { code: "access_token_expired" });
        return;
      }
      json(response, 200, { ok: true }, "\"snapshot-renewed\"");
    });
    const operation = createClient(origin, provider).beginRead(enterpriseScope);

    await expect(operation.readSnapshot()).resolves.toMatchObject({
      status: "modified",
      etag: "\"snapshot-renewed\"",
    });
    expect(requests).toBe(2);
    expect(provider.renewals).toBe(1);
  });

  it("fails closed on redirects and responses above the declared bound", async () => {
    const token = randomBytes(32).toString("base64url");
    const redirectOrigin = await listen((_request, response) => {
      response.writeHead(302, { location: "https://outside.invalid/config" })
        .end();
    });
    const redirected = createClient(
      redirectOrigin,
      new TestTokenProvider(token),
    ).beginRead(enterpriseScope);
    await expect(redirected.readSnapshot()).rejects.toMatchObject({
      code: "configuration.client_redirect_rejected",
    });

    const oversizedOrigin = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
        "content-length": String(2 * 1024 * 1024 + 1),
        etag: "\"oversized\"",
      }).end();
    });
    const oversized = createClient(
      oversizedOrigin,
      new TestTokenProvider(token),
    ).beginRead(enterpriseScope);
    await expect(oversized.readSnapshot()).rejects.toMatchObject({
      code: "configuration.client_response_too_large",
    });
  });

  it("maps timeout and caller cancellation to distinct typed failures", async () => {
    const token = randomBytes(32).toString("base64url");
    const origin = await listen(() => {
      // Deliberately leave the response open until the client aborts.
    });
    const timed = createClient(
      origin,
      new TestTokenProvider(token),
      25,
    ).beginRead(enterpriseScope);
    await expect(timed.readSnapshot()).rejects.toMatchObject({
      code: "configuration.client_timeout",
    });

    const controller = new AbortController();
    const cancelled = createClient(
      origin,
      new TestTokenProvider(token),
      1_000,
    ).beginRead(enterpriseScope);
    const pending = cancelled.readSnapshot({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "configuration.client_cancelled",
    });
  });

  it("rejects malformed transport metadata without exposing token material", async () => {
    const token = randomBytes(32).toString("base64url");
    const origin = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "text/plain",
        etag: "\"wrong-media-type\"",
      }).end("{}");
    });
    const operation = createClient(origin, new TestTokenProvider(token))
      .beginRead(enterpriseScope);

    let failure: unknown;
    try {
      await operation.readSnapshot();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(EnterpriseConfigurationClientError);
    expect(failure).toMatchObject({
      code: "configuration.client_protocol_invalid",
    });
    expect(String(failure)).not.toContain(token);
  });
});

class TestTokenProvider implements EnterpriseAccessTokenProvider {
  renewals = 0;
  readonly #initialToken: string;
  readonly #renewedToken: string;

  constructor(initialToken: string, renewedToken = initialToken) {
    this.#initialToken = initialToken;
    this.#renewedToken = renewedToken;
  }

  acquire(_request: EnterpriseAccessTokenRequest): Promise<EnterpriseAccessTokenLease> {
    return Promise.resolve(lease(this.#initialToken, "token.initial"));
  }

  renew(_request: EnterpriseAccessTokenRenewalRequest): Promise<EnterpriseAccessTokenLease> {
    this.renewals += 1;
    return Promise.resolve(lease(this.#renewedToken, "token.renewed"));
  }

  assertCurrentSession(): Promise<void> {
    return Promise.resolve();
  }
}

function lease(
  compactToken: string,
  tokenId: string,
): EnterpriseAccessTokenLease {
  return {
    compactToken,
    tokenId,
    audience: "robothree-central",
    permissions: ["configuration.read"],
    issuedAt: "2026-07-26T00:00:00.000Z",
    expiresAt: "2099-07-26T00:00:00.000Z",
    scope: enterpriseScope,
  };
}

function createClient(
  origin: string,
  tokenProvider: EnterpriseAccessTokenProvider,
  requestTimeoutMs = 1_000,
): HttpEnterpriseConfigurationClient {
  return new HttpEnterpriseConfigurationClient({
    baseUrl: origin,
    audience: "robothree-central",
    tokenProvider,
    requestTimeoutMs,
    allowInsecureLoopbackForTest: true,
  });
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
  if (address === null || typeof address === "string") {
    throw new Error("test server did not expose a TCP address");
  }
  return `http://127.0.0.1:${address.port}`;
}

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  etag?: string,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    ...(etag === undefined ? {} : { etag }),
  }).end(payload);
}
