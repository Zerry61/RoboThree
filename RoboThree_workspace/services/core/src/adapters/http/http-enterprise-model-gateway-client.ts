import {
  JsonObjectSchema,
  JsonValueSchema,
  canonicalJsonStringify,
} from "@robothree/contracts";
import { z } from "zod";

import {
  EnterpriseConfigurationTokenSession,
  EnterpriseConfigurationTokenError,
} from "../../application/enterprise-configuration-token-session.js";
import type {
  EnterpriseAccessTokenLease,
  EnterpriseAccessTokenProvider,
  EnterpriseIdentityScope,
} from "../../ports/enterprise-access-token-provider.js";
import type {
  EnterpriseModelAccepted,
  EnterpriseModelEvent,
  EnterpriseModelGatewayClient,
  EnterpriseModelGatewayOperation,
  EnterpriseModelStatus,
} from "../../ports/enterprise-model-gateway-client.js";

const UuidSchema = z.uuid();
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const TimestampSchema = z.iso.datetime({ offset: true });
const ContractVersionSchema = z.enum(["v1alpha1", "v1alpha2", "v1alpha3"]);
type GatewayContractVersion = z.infer<typeof ContractVersionSchema>;
const StatusSchema = z.enum([
  "accepted",
  "running",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "uncertain",
]);
const AcceptedSchema = z.object({
  contractVersion: ContractVersionSchema,
  invocationId: UuidSchema,
  clientRequestId: UuidSchema,
  requestDigest: DigestSchema,
  status: z.literal("accepted"),
  statusRevision: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  lastDurableEventSequence: z.number().int().nonnegative(),
  durableCursor: z.string().min(1).max(512),
}).strict();
const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
}).strict();
const StatusResponseSchema = z.object({
  contractVersion: ContractVersionSchema,
  invocationId: UuidSchema,
  clientRequestId: UuidSchema,
  requestDigest: DigestSchema,
  modelId: z.string().min(3).max(160),
  modelRevision: DigestSchema,
  configurationRevision: DigestSchema,
  runtimeRegistryGeneration: DigestSchema,
  status: StatusSchema,
  statusRevision: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  startedAt: TimestampSchema.optional(),
  endedAt: TimestampSchema.optional(),
  usage: UsageSchema.optional(),
  finishReason: z.string().min(1).max(128).optional(),
  safeErrorCode: z.string().min(3).max(128).optional(),
  safeSummary: z.string().max(4096).optional(),
  lastDurableEventSequence: z.number().int().nonnegative(),
  durableEventStreamDigest: DigestSchema.optional(),
  durableCursor: z.string().min(1).max(512),
}).strict();
const ToolCallSchema = z.object({
  toolCallId: UuidSchema,
  name: z.string().min(1).max(120),
  arguments: JsonObjectSchema,
  argumentsDigest: DigestSchema,
}).strict();
const EphemeralSchema = z.discriminatedUnion("eventType", [
  z.object({
    contractVersion: ContractVersionSchema,
    invocationId: UuidSchema,
    eventId: UuidSchema,
    eventClass: z.literal("ephemeral"),
    streamSequence: z.number().int().positive(),
    eventType: z.literal("started"),
    eventPayload: z.object({}).strict(),
    eventDigest: DigestSchema,
    occurredAt: TimestampSchema,
  }).strict(),
  z.object({
    contractVersion: ContractVersionSchema,
    invocationId: UuidSchema,
    eventId: UuidSchema,
    eventClass: z.literal("ephemeral"),
    streamSequence: z.number().int().positive(),
    eventType: z.literal("text_delta"),
    eventPayload: z.object({ delta: z.string().min(1).max(65_536) }).strict(),
    eventDigest: DigestSchema,
    occurredAt: TimestampSchema,
  }).strict(),
  z.object({
    contractVersion: ContractVersionSchema,
    invocationId: UuidSchema,
    eventId: UuidSchema,
    eventClass: z.literal("ephemeral"),
    streamSequence: z.number().int().positive(),
    eventType: z.literal("tool_call"),
    eventPayload: z.object({ call: ToolCallSchema }).strict(),
    eventDigest: DigestSchema,
    occurredAt: TimestampSchema,
  }).strict(),
]);
const DurableSchema = z.object({
  contractVersion: ContractVersionSchema,
  invocationId: UuidSchema,
  eventId: UuidSchema,
  eventClass: z.literal("durable"),
  durableSequence: z.number().int().positive(),
  eventType: z.enum([
    "accepted",
    "dispatch_decided",
    "completed",
    "failed",
    "cancelled",
    "timed_out",
    "uncertain",
    "usage_recorded",
  ]),
  eventPayload: JsonObjectSchema,
  eventDigest: DigestSchema,
  durableCursor: z.string().min(1).max(512),
  occurredAt: TimestampSchema,
}).strict();

export class EnterpriseModelGatewayClientError extends Error {
  public constructor(
    public readonly code:
      | "model_gateway.client_offline"
      | "model_gateway.client_timeout"
      | "model_gateway.client_cancelled"
      | "model_gateway.client_unauthorized"
      | "model_gateway.client_redirect_rejected"
      | "model_gateway.client_response_too_large"
      | "model_gateway.client_protocol_invalid"
      | "model_gateway.client_http_error",
    message: string,
  ) {
    super(message);
    this.name = "EnterpriseModelGatewayClientError";
  }
}

export class HttpEnterpriseModelGatewayClient implements EnterpriseModelGatewayClient {
  readonly #origin: URL;
  readonly #tokenProvider: EnterpriseAccessTokenProvider;
  readonly #timeoutMs: number;
  readonly #minimumTokenTtlMs: number;

  public constructor(input: {
    baseUrl: string;
    tokenProvider: EnterpriseAccessTokenProvider;
    requestTimeoutMs?: number;
    minimumTokenTtlMs?: number;
    allowInsecureLoopbackForTest?: boolean;
  }) {
    this.#origin = validateOrigin(input.baseUrl, input.allowInsecureLoopbackForTest ?? false);
    this.#tokenProvider = input.tokenProvider;
    this.#timeoutMs = bounded(input.requestTimeoutMs ?? 30_000, 300_000, "requestTimeoutMs");
    this.#minimumTokenTtlMs = bounded(
      input.minimumTokenTtlMs ?? 30_000,
      300_000,
      "minimumTokenTtlMs",
    );
  }

  begin(
    scope: EnterpriseIdentityScope,
    contractVersion: GatewayContractVersion = "v1alpha1",
  ): EnterpriseModelGatewayOperation {
    return new HttpEnterpriseModelGatewayOperation({
      origin: this.#origin,
      tokenSession: new EnterpriseConfigurationTokenSession(this.#tokenProvider, {
        audience: "enterprise-model-gateway",
        requiredPermission: "model.use",
        minimumRemainingTtlMs: this.#minimumTokenTtlMs,
        expectedScope: scope,
      }),
      timeoutMs: this.#timeoutMs,
      scope,
      contractVersion,
    });
  }
}

class HttpEnterpriseModelGatewayOperation implements EnterpriseModelGatewayOperation {
  readonly scope: EnterpriseIdentityScope;
  readonly #origin: URL;
  readonly #tokenSession: EnterpriseConfigurationTokenSession;
  readonly #timeoutMs: number;
  readonly #contractVersion: GatewayContractVersion;

  constructor(input: {
    origin: URL;
    tokenSession: EnterpriseConfigurationTokenSession;
    timeoutMs: number;
    scope: EnterpriseIdentityScope;
    contractVersion: GatewayContractVersion;
  }) {
    this.#origin = input.origin;
    this.#tokenSession = input.tokenSession;
    this.#timeoutMs = input.timeoutMs;
    this.#contractVersion = input.contractVersion;
    this.scope = input.scope;
  }

  async accept(document: ReturnType<typeof JsonObjectSchema.parse>, signal: AbortSignal): Promise<EnterpriseModelAccepted> {
    const response = await this.#jsonRequest({
      method: "POST",
      url: new URL(`/${this.#contractVersion}/model-invocations`, this.#origin),
      document,
      signal,
      expectedStatus: 202,
    });
    const accepted = AcceptedSchema.parse(response);
    assertContractVersion(accepted.contractVersion, this.#contractVersion);
    return accepted;
  }

  async status(invocationId: string, signal: AbortSignal): Promise<EnterpriseModelStatus> {
    const response = await this.#jsonRequest({
      method: "GET",
      url: invocationUrl(this.#origin, invocationId, this.#contractVersion),
      signal,
      expectedStatus: 200,
    });
    const parsed = StatusResponseSchema.parse(response);
    assertContractVersion(parsed.contractVersion, this.#contractVersion);
    return toModelStatus(parsed);
  }

  async cancel(input: Parameters<EnterpriseModelGatewayOperation["cancel"]>[0]): Promise<EnterpriseModelStatus> {
    const response = await this.#jsonRequest({
      method: "POST",
      url: new URL(`${invocationUrl(this.#origin, input.invocationId, this.#contractVersion).pathname}/cancel`, this.#origin),
      document: JsonObjectSchema.parse({
        contractVersion: this.#contractVersion,
        requestId: input.requestId,
        expectedStatusRevision: input.expectedStatusRevision,
        reason: input.reason,
      }),
      signal: input.signal,
      expectedStatus: 200,
    });
    const parsed = StatusResponseSchema.parse(response);
    assertContractVersion(parsed.contractVersion, this.#contractVersion);
    return toModelStatus(parsed);
  }

  async *events(input: Parameters<EnterpriseModelGatewayOperation["events"]>[0]): AsyncIterable<EnterpriseModelEvent> {
    const url = new URL(`${invocationUrl(this.#origin, input.invocationId, this.#contractVersion).pathname}/events`, this.#origin);
    if (input.durableCursor !== undefined) url.searchParams.set("cursor", input.durableCursor);
    const response = await this.#authorizedFetch({ method: "GET", url, signal: input.signal });
    if (!response.ok || !(response.headers.get("content-type") ?? "").toLowerCase().includes("text/event-stream")) {
      await discard(response, 16_384);
      throw protocol();
    }
    assertContentLength(response, 67_108_864);
    if (response.body === null) throw protocol();
    let ephemeralSequence = 0;
    let durableSequence = 0;
    const eventIdentities = new Map<string, string>();
    for await (const frame of readSseFrames(response, input.signal, this.#timeoutMs)) {
      if (frame === undefined) continue;
      const raw = parseJson(frame);
      const eventClass = typeof raw === "object" && raw !== null
        ? (raw as Record<string, unknown>).eventClass
        : undefined;
      if (eventClass === "ephemeral") {
        const event = EphemeralSchema.parse(raw);
        assertContractVersion(event.contractVersion, this.#contractVersion);
        assertIdentity(eventIdentities, event.eventId, event.eventDigest);
        if (event.invocationId !== input.invocationId || event.streamSequence !== ephemeralSequence + 1) {
          throw protocol();
        }
        ephemeralSequence = event.streamSequence;
        if (event.eventType === "text_delta") {
          yield { ...commonEphemeral(event), eventType: "text_delta", delta: event.eventPayload.delta };
        } else if (event.eventType === "tool_call") {
          yield { ...commonEphemeral(event), eventType: "tool_call", call: event.eventPayload.call };
        } else {
          yield { ...commonEphemeral(event), eventType: "started" };
        }
      } else if (eventClass === "durable") {
        const event = DurableSchema.parse(raw);
        assertContractVersion(event.contractVersion, this.#contractVersion);
        assertIdentity(eventIdentities, event.eventId, event.eventDigest);
        if (event.invocationId !== input.invocationId
          || (durableSequence !== 0 && event.durableSequence !== durableSequence + 1)) {
          throw protocol();
        }
        durableSequence = event.durableSequence;
        if (event.eventType === "usage_recorded") {
          const usage = UsageSchema.parse(event.eventPayload.usage);
          yield { ...commonDurable(event), eventType: "usage_recorded", ...usage };
        } else {
          const payload = z.object({
            status: StatusSchema,
            statusRevision: z.number().int().nonnegative(),
            finishReason: z.string().min(1).max(128).optional(),
            safeErrorCode: z.string().min(3).max(128).optional(),
            safeSummary: z.string().max(4096).optional(),
          }).strict().parse(event.eventPayload);
          yield {
            ...commonDurable(event),
            eventType: event.eventType,
            status: payload.status,
            statusRevision: payload.statusRevision,
          };
        }
      } else {
        throw protocol();
      }
    }
  }

  async #jsonRequest(input: {
    method: "GET" | "POST";
    url: URL;
    document?: ReturnType<typeof JsonObjectSchema.parse>;
    signal: AbortSignal;
    expectedStatus: number;
  }): Promise<unknown> {
    const response = await this.#authorizedFetch(input);
    if (response.status !== input.expectedStatus) {
      await discard(response, 16_384);
      throw new EnterpriseModelGatewayClientError(
        "model_gateway.client_http_error",
        "Enterprise Model Gateway returned an unexpected status",
      );
    }
    assertContentLength(response, 4_194_304);
    const bytes = await readBounded(response, 4_194_304);
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      throw protocol();
    }
    return parseJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }

  async #authorizedFetch(input: {
    method: "GET" | "POST";
    url: URL;
    document?: ReturnType<typeof JsonObjectSchema.parse>;
    signal: AbortSignal;
  }): Promise<Response> {
    let lease = await this.#tokenSession.acquire();
    let renewed = false;
    for (;;) {
      const response = await fetchOnce({
        ...input,
        origin: this.#origin.origin,
        lease,
        timeoutMs: this.#timeoutMs,
      });
      if (response.status !== 401) return response;
      const code = await safeErrorCode(response);
      if (code !== "access_token_expired" || renewed) {
        throw new EnterpriseModelGatewayClientError(
          "model_gateway.client_unauthorized",
          "Enterprise Model Gateway authorization was rejected",
        );
      }
      renewed = true;
      try {
        lease = await this.#tokenSession.renewAfterTokenExpired();
      } catch (error) {
        if (error instanceof EnterpriseConfigurationTokenError) {
          throw new EnterpriseModelGatewayClientError(
            "model_gateway.client_unauthorized",
            "Enterprise Model Gateway authorization could not be renewed",
          );
        }
        throw error;
      }
    }
  }
}

async function fetchOnce(input: {
  method: "GET" | "POST";
  url: URL;
  origin: string;
  lease: EnterpriseAccessTokenLease;
  document?: ReturnType<typeof JsonObjectSchema.parse>;
  signal: AbortSignal;
  timeoutMs: number;
}): Promise<Response> {
  if (input.url.origin !== input.origin) throw redirectError();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, input.timeoutMs);
  const abort = (): void => controller.abort();
  input.signal.addEventListener("abort", abort, { once: true });
  if (input.signal.aborted) controller.abort();
  try {
    let response: Response;
    try {
      const body = input.document === undefined
        ? undefined
        : canonicalJsonStringify(JsonValueSchema.parse(input.document));
      if (body !== undefined && Buffer.byteLength(body, "utf8") > 4_194_304) {
        throw tooLarge();
      }
      response = await fetch(input.url, {
        method: input.method,
        headers: {
          authorization: `Bearer ${input.lease.compactToken}`,
          accept: input.url.pathname.endsWith("/events") ? "text/event-stream" : "application/json",
          ...(input.document === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body }),
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof EnterpriseModelGatewayClientError) throw error;
      if (controller.signal.aborted) {
        throw new EnterpriseModelGatewayClientError(
          timedOut ? "model_gateway.client_timeout" : "model_gateway.client_cancelled",
          timedOut ? "Enterprise Model Gateway request timed out" : "Enterprise Model Gateway request was cancelled",
        );
      }
      throw new EnterpriseModelGatewayClientError(
        "model_gateway.client_offline",
        "Enterprise Model Gateway is unavailable",
      );
    }
    if (response.status >= 300 && response.status < 400) throw redirectError();
    return response;
  } finally {
    clearTimeout(timeout);
    input.signal.removeEventListener("abort", abort);
  }
}

async function* readSseFrames(
  response: Response,
  signal: AbortSignal,
  inactivityTimeoutMs: number,
): AsyncIterable<string | undefined> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new EnterpriseModelGatewayClientError(
        "model_gateway.client_cancelled",
        "Enterprise Model stream was cancelled",
      );
      const { done, value } = await readWithInactivityTimeout(
        reader,
        inactivityTimeoutMs,
        signal,
      );
      if (done) break;
      if (value === undefined) throw protocol();
      total += value.byteLength;
      if (total > 67_108_864) throw tooLarge();
      buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
      if (Buffer.byteLength(buffer, "utf8") > 1_048_576) throw tooLarge();
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (frame.split("\n").every((line) => line.startsWith(":"))) {
          yield undefined;
          continue;
        }
        const lines = frame.split("\n");
        if (lines.some((line) => line.length > 0 && !line.startsWith("data:") && !line.startsWith("id:") && !line.startsWith("event:"))) {
          throw protocol();
        }
        const data = lines.filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /u, ""));
        if (data.length === 0) throw protocol();
        yield data.join("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0) throw protocol();
  } finally {
    try { await reader.cancel(); } catch { /* transport cleanup is best effort */ }
    reader.releaseLock();
  }
}

async function readWithInactivityTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  inactivityTimeoutMs: number,
  signal: AbortSignal,
): Promise<Readonly<{ done: boolean; value: Uint8Array | undefined }>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const inactivity = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new EnterpriseModelGatewayClientError(
        "model_gateway.client_timeout",
        "Enterprise Model stream became inactive",
      ));
    }, inactivityTimeoutMs);
  });
  try {
    if (signal.aborted) {
      throw new EnterpriseModelGatewayClientError(
        "model_gateway.client_cancelled",
        "Enterprise Model stream was cancelled",
      );
    }
    return await Promise.race([reader.read(), inactivity]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (response.body === null) throw protocol();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw tooLarge();
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

async function discard(response: Response, maxBytes: number): Promise<void> {
  try { await readBounded(response, maxBytes); } catch { /* safe bounded discard */ }
}
async function safeErrorCode(response: Response): Promise<string | undefined> {
  try {
    const parsed = parseJson(new TextDecoder().decode(await readBounded(response, 16_384))) as Record<string, unknown>;
    return typeof parsed.code === "string" ? parsed.code : undefined;
  } catch { return undefined; }
}
function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { throw protocol(); }
}
function assertContentLength(response: Response, maximum: number): void {
  const value = response.headers.get("content-length");
  if (value === null) return;
  if (!/^[0-9]+$/u.test(value) || Number(value) > maximum) throw tooLarge();
}
function commonEphemeral(event: z.infer<typeof EphemeralSchema>) {
  return {
    eventClass: "ephemeral" as const,
    invocationId: event.invocationId,
    eventId: event.eventId,
    streamSequence: event.streamSequence,
    occurredAt: event.occurredAt,
  };
}
function commonDurable(event: z.infer<typeof DurableSchema>) {
  return {
    eventClass: "durable" as const,
    invocationId: event.invocationId,
    eventId: event.eventId,
    durableSequence: event.durableSequence,
    durableCursor: event.durableCursor,
    eventDigest: event.eventDigest,
    occurredAt: event.occurredAt,
  };
}

function toModelStatus(value: z.infer<typeof StatusResponseSchema>): EnterpriseModelStatus {
  return Object.freeze({
    invocationId: value.invocationId,
    clientRequestId: value.clientRequestId,
    requestDigest: value.requestDigest,
    status: value.status,
    statusRevision: value.statusRevision,
    lastDurableEventSequence: value.lastDurableEventSequence,
    durableCursor: value.durableCursor,
    ...(value.finishReason === undefined ? {} : { finishReason: value.finishReason }),
    ...(value.safeErrorCode === undefined ? {} : { safeErrorCode: value.safeErrorCode }),
    ...(value.safeSummary === undefined ? {} : { safeSummary: value.safeSummary }),
  });
}
function assertIdentity(seen: Map<string, string>, eventId: string, digest: string): void {
  const existing = seen.get(eventId);
  if (existing !== undefined && existing !== digest) throw protocol();
  seen.set(eventId, digest);
}
function invocationUrl(
  origin: URL,
  invocationId: string,
  contractVersion: GatewayContractVersion,
): URL {
  if (!UuidSchema.safeParse(invocationId).success) throw protocol();
  return new URL(`/${contractVersion}/model-invocations/${encodeURIComponent(invocationId)}`, origin);
}
function assertContractVersion(
  received: GatewayContractVersion,
  expected: GatewayContractVersion,
): void {
  if (received !== expected) throw protocol();
}
function validateOrigin(value: string, allowLoopback: boolean): URL {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "localhost";
  if (url.username || url.password || (url.protocol !== "https:" && !(allowLoopback && loopback && url.protocol === "http:"))) {
    throw new Error("Enterprise Model Gateway origin is not trusted");
  }
  return url;
}
function bounded(value: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${name} is outside its limit`);
  return value;
}
function redirectError(): EnterpriseModelGatewayClientError {
  return new EnterpriseModelGatewayClientError("model_gateway.client_redirect_rejected", "Enterprise Model Gateway redirect was rejected");
}
function tooLarge(): EnterpriseModelGatewayClientError {
  return new EnterpriseModelGatewayClientError("model_gateway.client_response_too_large", "Enterprise Model Gateway response exceeded its limit");
}
function protocol(): EnterpriseModelGatewayClientError {
  return new EnterpriseModelGatewayClientError("model_gateway.client_protocol_invalid", "Enterprise Model Gateway response violated the Contract");
}
