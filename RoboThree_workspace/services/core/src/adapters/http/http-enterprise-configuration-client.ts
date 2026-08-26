import {
  ENTERPRISE_CONFIGURATION_LIMITS,
} from "../../application/configuration-validator.js";
import {
  EnterpriseConfigurationTokenError,
  EnterpriseConfigurationTokenSession,
} from "../../application/enterprise-configuration-token-session.js";
import type {
  EnterpriseAccessTokenLease,
  EnterpriseAccessTokenProvider,
  EnterpriseIdentityScope,
} from "../../ports/enterprise-access-token-provider.js";
import {
  EnterpriseConfigurationClientError,
  type EnterpriseConfigurationClient,
  type EnterpriseConfigurationDocumentResult,
  type EnterpriseConfigurationPackageReadRequest,
  type EnterpriseConfigurationReadOperation,
} from "../../ports/enterprise-configuration-client.js";

export type HttpEnterpriseConfigurationClientOptions = Readonly<{
  baseUrl: string;
  audience: string;
  tokenProvider: EnterpriseAccessTokenProvider;
  requestTimeoutMs?: number;
  minimumTokenTtlMs?: number;
  allowInsecureLoopbackForTest?: boolean;
}>;

export class HttpEnterpriseConfigurationClient
implements EnterpriseConfigurationClient {
  readonly #origin: URL;
  readonly #audience: string;
  readonly #tokenProvider: EnterpriseAccessTokenProvider;
  readonly #requestTimeoutMs: number;
  readonly #minimumTokenTtlMs: number;

  constructor(options: HttpEnterpriseConfigurationClientOptions) {
    this.#origin = validateOrigin(
      options.baseUrl,
      options.allowInsecureLoopbackForTest ?? false,
    );
    this.#audience = options.audience;
    this.#tokenProvider = options.tokenProvider;
    this.#requestTimeoutMs = boundedPositiveInteger(
      options.requestTimeoutMs ?? 15_000,
      60_000,
      "requestTimeoutMs",
    );
    this.#minimumTokenTtlMs = boundedPositiveInteger(
      options.minimumTokenTtlMs ?? 30_000,
      300_000,
      "minimumTokenTtlMs",
    );
  }

  beginRead(scope: EnterpriseIdentityScope): EnterpriseConfigurationReadOperation {
    const tokenSession = new EnterpriseConfigurationTokenSession(
      this.#tokenProvider,
      {
        audience: this.#audience,
        requiredPermission: "configuration.read",
        minimumRemainingTtlMs: this.#minimumTokenTtlMs,
        expectedScope: scope,
      },
    );
    return new HttpEnterpriseConfigurationReadOperation({
      origin: this.#origin,
      tokenSession,
      requestTimeoutMs: this.#requestTimeoutMs,
      scope,
    });
  }
}

class HttpEnterpriseConfigurationReadOperation
implements EnterpriseConfigurationReadOperation {
  readonly scope: EnterpriseIdentityScope;
  readonly #origin: URL;
  readonly #tokenSession: EnterpriseConfigurationTokenSession;
  readonly #requestTimeoutMs: number;

  constructor(input: {
    origin: URL;
    tokenSession: EnterpriseConfigurationTokenSession;
    requestTimeoutMs: number;
    scope: EnterpriseIdentityScope;
  }) {
    this.#origin = input.origin;
    this.#tokenSession = input.tokenSession;
    this.#requestTimeoutMs = input.requestTimeoutMs;
    this.scope = input.scope;
  }

  async readSnapshot(input: Readonly<{
    ifNoneMatch?: string;
    signal?: AbortSignal;
  }> = {}): Promise<EnterpriseConfigurationDocumentResult> {
    return this.#request(
      new URL("/v1alpha1/configuration", this.#origin),
      ENTERPRISE_CONFIGURATION_LIMITS.snapshotBytes,
      input,
    );
  }

  async readPackage(
    input: EnterpriseConfigurationPackageReadRequest,
  ): Promise<EnterpriseConfigurationDocumentResult> {
    const path = [
      "/v1alpha1/configuration/",
      encodeURIComponent(input.snapshotId),
      "/revisions/",
      encodeURIComponent(input.snapshotRevision),
      "/packages/",
      encodeURIComponent(input.reference.kind),
      "/",
      encodeURIComponent(input.reference.packageId),
      "/revisions/",
      encodeURIComponent(input.reference.revision),
    ].join("");
    const url = new URL(path, this.#origin);
    url.searchParams.set("snapshotDigest", input.snapshotDigest);
    url.searchParams.set("packageDigest", input.reference.digest);
    return this.#request(
      url,
      ENTERPRISE_CONFIGURATION_LIMITS.packageDocumentBytes,
      input,
    );
  }

  async assertReadyToSeal(): Promise<void> {
    await this.#tokenSession.assertReadyToSeal();
  }

  async #request(
    url: URL,
    maxBytes: number,
    input: Readonly<{
      ifNoneMatch?: string;
      signal?: AbortSignal;
    }>,
  ): Promise<EnterpriseConfigurationDocumentResult> {
    let lease = await this.#tokenSession.acquire();
    let renewed = false;
    for (;;) {
      const response = await fetchBounded({
        url,
        origin: this.#origin.origin,
        lease,
        maxBytes,
        timeoutMs: this.#requestTimeoutMs,
        ...input,
      });
      if (response.kind !== "token_expired") return response.value;
      if (renewed) {
        throw new EnterpriseConfigurationClientError(
          "configuration.client_unauthorized",
          "enterprise configuration token renewal was exhausted",
        );
      }
      renewed = true;
      try {
        lease = await this.#tokenSession.renewAfterTokenExpired();
      } catch (error) {
        if (error instanceof EnterpriseConfigurationTokenError) {
          throw new EnterpriseConfigurationClientError(
            "configuration.client_unauthorized",
            "enterprise configuration session could not renew authorization",
          );
        }
        throw error;
      }
    }
  }
}

type FetchBoundedResult =
  | Readonly<{
    kind: "result";
    value: EnterpriseConfigurationDocumentResult;
  }>
  | Readonly<{ kind: "token_expired" }>;

async function fetchBounded(input: {
  url: URL;
  origin: string;
  lease: EnterpriseAccessTokenLease;
  maxBytes: number;
  timeoutMs: number;
  ifNoneMatch?: string;
  signal?: AbortSignal;
}): Promise<FetchBoundedResult> {
  if (input.url.origin !== input.origin) {
    throw new EnterpriseConfigurationClientError(
      "configuration.client_redirect_rejected",
      "enterprise configuration request attempted to leave the trusted origin",
    );
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);
  const onAbort = (): void => controller.abort();
  input.signal?.addEventListener("abort", onAbort, { once: true });
  if (input.signal?.aborted === true) controller.abort();
  try {
    let response: Response;
    try {
      response = await fetch(input.url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${input.lease.compactToken}`,
          accept: "application/json",
          ...(input.ifNoneMatch === undefined
            ? {}
            : { "if-none-match": input.ifNoneMatch }),
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new EnterpriseConfigurationClientError(
          timedOut
            ? "configuration.client_timeout"
            : "configuration.client_cancelled",
          timedOut
            ? "enterprise configuration request timed out"
            : "enterprise configuration request was cancelled",
        );
      }
      throw new EnterpriseConfigurationClientError(
        "configuration.client_offline",
        "enterprise configuration service is unavailable",
      );
    }
    if (response.status >= 300 && response.status < 400
      && response.status !== 304) {
      throw new EnterpriseConfigurationClientError(
        "configuration.client_redirect_rejected",
        "enterprise configuration redirects are not accepted",
      );
    }
    const etag = response.headers.get("etag");
    if (response.status === 304) {
      if (etag === null || etag.length === 0) throw protocolError();
      return { kind: "result", value: { status: "not_modified", etag } };
    }
    if (response.status === 401) {
      const code = await readSafeErrorCode(response, 16_384);
      if (code === "access_token_expired") return { kind: "token_expired" };
      throw new EnterpriseConfigurationClientError(
        "configuration.client_unauthorized",
        "enterprise configuration authorization was rejected",
      );
    }
    if (!response.ok) {
      await discardBounded(response, 16_384);
      throw new EnterpriseConfigurationClientError(
        "configuration.client_http_error",
        "enterprise configuration service returned an error",
      );
    }
    if (etag === null || etag.length === 0) throw protocolError();
    const declared = response.headers.get("content-length");
    if (declared !== null) {
      const value = Number(declared);
      if (!Number.isSafeInteger(value) || value < 0) throw protocolError();
      if (value > input.maxBytes) throw tooLarge();
    }
    const bytes = await readBoundedBytes(response, input.maxBytes);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw protocolError();
    }
    let rawJson: string;
    try {
      rawJson = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw protocolError();
    }
    return {
      kind: "result",
      value: {
        status: "modified",
        rawJson,
        etag,
        byteLength: bytes.byteLength,
      },
    };
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onAbort);
  }
}

async function readBoundedBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (response.body === null) throw protocolError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function readSafeErrorCode(
  response: Response,
  maxBytes: number,
): Promise<string | undefined> {
  try {
    const bytes = await readBoundedBytes(response, maxBytes);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const code = (parsed as Record<string, unknown>).code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

async function discardBounded(
  response: Response,
  maxBytes: number,
): Promise<void> {
  try {
    await readBoundedBytes(response, maxBytes);
  } catch {
    // Error bodies never influence domain behavior.
  }
}

function validateOrigin(baseUrl: string, allowLoopback: boolean): URL {
  const parsed = new URL(baseUrl);
  if (parsed.username !== "" || parsed.password !== ""
    || parsed.search !== "" || parsed.hash !== "") {
    throw new Error("enterprise configuration base URL contains forbidden components");
  }
  const loopback = parsed.hostname === "127.0.0.1"
    || parsed.hostname === "[::1]"
    || parsed.hostname === "localhost";
  if (parsed.protocol !== "https:" && !(allowLoopback
    && loopback && parsed.protocol === "http:")) {
    throw new Error("enterprise configuration requires HTTPS");
  }
  parsed.pathname = "/";
  return parsed;
}

function boundedPositiveInteger(
  value: number,
  maximum: number,
  name: string,
): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} is outside the supported bound`);
  }
  return value;
}

function tooLarge(): EnterpriseConfigurationClientError {
  return new EnterpriseConfigurationClientError(
    "configuration.client_response_too_large",
    "enterprise configuration response exceeds the byte limit",
  );
}

function protocolError(): EnterpriseConfigurationClientError {
  return new EnterpriseConfigurationClientError(
    "configuration.client_protocol_invalid",
    "enterprise configuration response violates the transport contract",
  );
}

