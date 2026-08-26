import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";
import {
  request as httpsRequest,
  type RequestOptions,
} from "node:https";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import type { TLSSocket } from "node:tls";

import {
  JsonObjectSchema,
  ModelRequestSchema,
  ModelStreamEventSchema,
  type AssistantToolCall,
  type JsonObject,
  type ModelRequest,
  type ModelStreamEvent,
} from "@robothree/contracts";
import type { ReadableModelRequest } from "@robothree/contracts/model-protocol/v1alpha2";

import type { PersonalModelDefinition } from "../../application/personal-model-domain.js";
import { canonicalizePersonalModelEndpoint } from "../../application/personal-model-domain.js";
import { calculateModelRequestDigest } from "../../application/model-message-converter.js";
import {
  createModelInvocationTimeoutMaterial,
  validateModelInvocationTimeoutMaterial,
  type ModelInvocationTimeoutPolicy,
} from "../../application/model-invocation-timeout-policy.js";
import { requireLegacyModelRequestForUnmappedProvider } from
  "../../application/model-reasoning-protocol.js";
import {
  PersonalModelProviderProfileRegistry,
  type PersonalModelProviderProfile,
} from "../../application/personal-model-provider-profile.js";
import type { ModelProvider } from "../../ports/model-provider.js";
import type { ModelProviderInvocation } from "../../ports/model-provider-invocation.js";
import type { PersonalCredentialStore } from "../../ports/personal-credential-store.js";
import type { Clock } from "../../ports/clock.js";
import type { ScheduledTask, Scheduler } from "../../ports/scheduler.js";

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_TOOL_CALLS = 32;
const MAX_TOOL_ARGUMENT_BYTES = 256 * 1024;

type LookupAddress = Readonly<{ address: string; family: 4 | 6 }>;

export type LocalPersonalProviderTransportOptions = Readonly<{
  ca?: string | Buffer;
  testOnlyAllowLoopback?: boolean;
  lookup?: (hostname: string) => Promise<readonly LookupAddress[]>;
}>;

export type LocalPersonalProviderAttemptTelemetry = Readonly<{
  onUsage(rawUsage: unknown): void;
  onTerminal(kind: "success" | LocalPersonalModelProviderError["kind"]): void;
}>;

export interface LocalPersonalModelStreamTransport {
  readonly adapterDescriptorId: string;
  readonly adapterDescriptorRevision: string;
  streamWithTelemetry(
    candidate: ReadableModelRequest,
    signal: AbortSignal,
    invocation: ModelProviderInvocation,
    telemetry: LocalPersonalProviderAttemptTelemetry,
  ): AsyncIterable<ModelStreamEvent>;
}

export class LocalPersonalOpenAiCompatibleModelProvider
implements ModelProvider, LocalPersonalModelStreamTransport {
  public readonly adapterDescriptorId: string;
  public readonly adapterDescriptorRevision: string;
  public readonly adapterKind = "model_provider" as const;

  readonly #definition: PersonalModelDefinition;
  readonly #credentialStore: PersonalCredentialStore;
  readonly #profile: PersonalModelProviderProfile;
  readonly #transport: LocalPersonalProviderTransportOptions;
  readonly #lockedCapabilityRevision: string;
  readonly #clock: Clock;
  readonly #scheduler: Scheduler;
  readonly #timeoutPolicy: ModelInvocationTimeoutPolicy;

  public constructor(input: Readonly<{
    definition: PersonalModelDefinition;
    credentialStore: PersonalCredentialStore;
    profileRegistry?: PersonalModelProviderProfileRegistry;
    transport?: LocalPersonalProviderTransportOptions;
    clock: Clock;
    scheduler: Scheduler;
    timeoutPolicy: ModelInvocationTimeoutPolicy;
    lockedCapabilityRevision?: string;
    lockedAdapterDescriptorId?: string;
    lockedAdapterDescriptorRevision?: string;
  }>) {
    this.#definition = input.definition;
    this.#credentialStore = input.credentialStore;
    this.#profile = (input.profileRegistry ?? new PersonalModelProviderProfileRegistry()).resolve(
      input.definition.providerKind,
      input.definition.providerProfileRevision,
    );
    this.adapterDescriptorId = input.lockedAdapterDescriptorId
      ?? "adapter.model.local-personal-openai-compatible";
    this.adapterDescriptorRevision = input.lockedAdapterDescriptorRevision
      ?? this.#profile.responseProjectionRevision;
    this.#lockedCapabilityRevision = input.lockedCapabilityRevision
      ?? input.definition.executionDefinitionDigest;
    this.#transport = input.transport ?? {};
    this.#clock = input.clock;
    this.#scheduler = input.scheduler;
    this.#timeoutPolicy = input.timeoutPolicy;
    if (this.#transport.testOnlyAllowLoopback === true && process.env.NODE_ENV !== "test") {
      throw new LocalPersonalModelProviderError(
        "personal_model.test_transport_forbidden",
        "protocol",
        false,
      );
    }
  }

  public async *stream(
    candidate: ReadableModelRequest,
    signal: AbortSignal,
    invocation?: ModelProviderInvocation,
  ): AsyncIterable<ModelStreamEvent> {
    yield* this.#stream(candidate, signal, invocation);
  }

  public async *streamWithTelemetry(
    candidate: ReadableModelRequest,
    signal: AbortSignal,
    invocation: ModelProviderInvocation,
    telemetry: LocalPersonalProviderAttemptTelemetry,
  ): AsyncIterable<ModelStreamEvent> {
    yield* this.#stream(candidate, signal, invocation, telemetry);
  }

  async *#stream(
    candidate: ReadableModelRequest,
    signal: AbortSignal,
    invocation?: ModelProviderInvocation,
    telemetry?: LocalPersonalProviderAttemptTelemetry,
  ): AsyncIterable<ModelStreamEvent> {
    // Keep the raw Adapter independently fail-closed when used without the
    // durable wrapper. No started event, credential read, DNS or socket may
    // occur before the DFI-5.3 mapping exists.
    const request = requireLegacyModelRequestForUnmappedProvider(candidate);
    yield ModelStreamEventSchema.parse({ type: "started" });
    const timeoutMaterial = invocation?.timeout === undefined
      ? testOnlyTimeoutMaterial(this.#timeoutPolicy, this.#clock)
      : validateModelInvocationTimeoutMaterial(invocation.timeout, this.#timeoutPolicy);
    if (invocation !== undefined
      && invocation.deadlineAt !== timeoutMaterial.invocationDeadlineAt) {
      throw new Error("local_personal.timeout_fact_drift");
    }
    const timeout = new LocalPersonalProviderTimeoutController({
      policy: this.#timeoutPolicy,
      clock: this.#clock,
      scheduler: this.#scheduler,
      invocationDeadlineAt: timeoutMaterial.invocationDeadlineAt,
    });
    timeout.bind(signal);
    try {
      if (calculateModelRequestDigest(request) !== request.requestDigest) {
        throw failure("personal_model.request_digest_invalid", "protocol", false);
      }
      if (request.model.capabilityId !== this.#definition.personalModelId
        || request.model.capabilityRevision !== this.#lockedCapabilityRevision) {
        throw failure("personal_model.execution_identity_conflict", "permission_denied", false);
      }
      const endpoint = createChatCompletionsUrl(this.#definition.canonicalEndpoint, this.#profile);
      const credential = await this.#credentialStore.resolve(this.#definition.credentialRef);
      timeout.throwIfTerminated(signal);
      if (!credential.ok) {
        throw failure("personal_model.credential_unavailable", "runtime_unavailable", false);
      }
      const secretBytes = credential.value;
      try {
        const secret = decodeCredential(secretBytes);
        timeout.startConnect();
        const response = await openSecureStream({
          endpoint,
          authorization: `Bearer ${secret}`,
          body: projectRequest(request, this.#definition.providerModelId),
          signal,
          options: this.#transport,
          timeout,
        });
        for await (const event of projectOpenAiCompatibleSse(
          response,
          request,
          signal,
          timeout,
          (rawUsage) => telemetry?.onUsage(rawUsage),
        )) {
          if (event.type === "completed") telemetry?.onTerminal("success");
          yield event;
        }
      } finally {
        secretBytes.fill(0);
      }
    } catch (error) {
      const mapped = resolveLocalPersonalProviderFailure(
        error,
        signal,
        timeout.terminationCause,
      );
      telemetry?.onTerminal(mapped.kind);
      yield ModelStreamEventSchema.parse({
        type: "failed",
        error: {
          code: mapped.code,
          category: mapped.kind === "authentication" ? "authentication"
            : mapped.kind === "permission_denied" ? "authorization"
              : mapped.kind === "deadline" ? "timeout"
                : mapped.kind === "cancelled" ? "cancelled"
                  : mapped.kind === "protocol" ? "validation"
                    : "provider",
          message: safeMessage(mapped.kind),
          retryable: mapped.retryable,
        },
      });
    } finally {
      timeout.dispose();
    }
  }
}

export class LocalPersonalModelProviderError extends Error {
  public constructor(
    public readonly code: string,
    public readonly kind:
      | "authentication"
      | "model_not_found"
      | "network"
      | "protocol"
      | "runtime_unavailable"
      | "permission_denied"
      | "provider_transient"
      | "cancelled"
      | "deadline",
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "LocalPersonalModelProviderError";
  }
}

export class LocalPersonalProviderTimeoutController {
  readonly #policy: ModelInvocationTimeoutPolicy;
  readonly #clock: Clock;
  readonly #scheduler: Scheduler;
  readonly #controller = new AbortController();
  #overall: ScheduledTask | undefined;
  #connect: ScheduledTask | undefined;
  #firstProgress: ScheduledTask | undefined;
  #idle: ScheduledTask | undefined;
  #cause: LocalPersonalModelProviderError | undefined;
  #parentSignal: AbortSignal | undefined;
  #parentAbort: (() => void) | undefined;
  #connected = false;
  #progressObserved = false;
  #disposed = false;

  public constructor(input: Readonly<{
    policy: ModelInvocationTimeoutPolicy;
    clock: Clock;
    scheduler: Scheduler;
    invocationDeadlineAt: string;
  }>) {
    this.#policy = input.policy;
    this.#clock = input.clock;
    this.#scheduler = input.scheduler;
    const delay = Date.parse(input.invocationDeadlineAt) - Date.parse(this.#clock.now());
    if (!Number.isFinite(delay)) throw new Error("local_personal.timeout_fact_drift");
    this.#overall = this.#schedule(Math.max(0, delay), () => this.#terminate(
      "personal_model.invocation_deadline_exceeded",
      false,
    ));
  }

  public get signal(): AbortSignal { return this.#controller.signal; }
  public get terminationCause(): LocalPersonalModelProviderError | undefined {
    return this.#cause;
  }

  public bind(parent: AbortSignal): void {
    if (this.#parentSignal !== undefined && this.#parentSignal !== parent) {
      throw new Error("Provider timeout controller already has a parent signal");
    }
    if (this.#parentSignal === parent) return;
    this.#parentSignal = parent;
    this.#parentAbort = () => this.#lockCause(terminationFailure(parent, undefined));
    if (parent.aborted) this.#parentAbort();
    else parent.addEventListener("abort", this.#parentAbort, { once: true });
  }

  public startConnect(): void {
    if (this.#disposed || this.#connected || this.#connect !== undefined) return;
    this.#connect = this.#schedule(this.#policy.connectTimeoutMs, () => this.#terminate(
      "personal_model.connect_timeout",
      true,
    ));
  }

  public connected(): void {
    if (this.#disposed || this.#connected) return;
    this.#connected = true;
    this.#cancel("connect");
    this.#firstProgress = this.#schedule(
      this.#policy.firstProgressTimeoutMs,
      () => this.#terminate("personal_model.first_response_timeout", true),
    );
  }

  public progress(): void {
    if (this.#disposed || this.#cause !== undefined) return;
    if (!this.#connected) throw new Error("Provider progress preceded secure connection");
    this.#progressObserved = true;
    this.#cancel("firstProgress");
    this.#cancel("idle");
    if (this.#parentSignal !== undefined && this.#parentAbort !== undefined) {
      this.#parentSignal.removeEventListener("abort", this.#parentAbort);
    }
    this.#parentSignal = undefined;
    this.#parentAbort = undefined;
    this.#idle = this.#schedule(
      this.#policy.streamIdleTimeoutMs,
      () => this.#terminate("personal_model.stream_idle_timeout", true),
    );
  }

  public terminal(): void {
    this.dispose();
  }

  public throwIfTerminated(parent: AbortSignal): void {
    if (this.#cause !== undefined) throw this.#cause;
    if (parent.aborted) throw terminationFailure(parent, undefined);
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancel("overall");
    this.#cancel("connect");
    this.#cancel("firstProgress");
    this.#cancel("idle");
  }

  public snapshot(): Readonly<{
    connected: boolean;
    progressObserved: boolean;
    terminationCode?: string;
    activeTimerCount: number;
  }> {
    return {
      connected: this.#connected,
      progressObserved: this.#progressObserved,
      ...(this.#cause === undefined ? {} : { terminationCode: this.#cause.code }),
      activeTimerCount: [this.#overall, this.#connect, this.#firstProgress, this.#idle]
        .filter((value) => value !== undefined).length,
    };
  }

  #schedule(delayMs: number, callback: () => void): ScheduledTask {
    return this.#scheduler.schedule(Math.min(2_147_483_647, delayMs), callback);
  }

  #terminate(code: string, retryable: boolean): void {
    this.#lockCause(failure(code, "deadline", retryable));
  }

  #lockCause(cause: LocalPersonalModelProviderError): void {
    if (this.#disposed || this.#cause !== undefined) return;
    this.#cause = cause;
    this.#cancel("overall");
    this.#cancel("connect");
    this.#cancel("firstProgress");
    this.#cancel("idle");
    this.#controller.abort(this.#cause);
  }

  #cancel(name: "overall" | "connect" | "firstProgress" | "idle"): void {
    if (name === "overall") {
      this.#overall?.cancel();
      this.#overall = undefined;
    } else if (name === "connect") {
      this.#connect?.cancel();
      this.#connect = undefined;
    } else if (name === "firstProgress") {
      this.#firstProgress?.cancel();
      this.#firstProgress = undefined;
    } else {
      this.#idle?.cancel();
      this.#idle = undefined;
    }
  }
}

export function createChatCompletionsUrl(
  endpoint: string,
  profile: PersonalModelProviderProfile,
): URL {
  const canonical = canonicalizePersonalModelEndpoint(endpoint).canonicalEndpoint;
  const base = new URL(canonical);
  const normalizedPath = base.pathname.replace(/\/+$/u, "");
  if (normalizedPath.toLowerCase().endsWith("/chat/completions")) {
    throw failure("personal_model.endpoint_must_be_api_base", "protocol", false);
  }
  base.pathname = `${normalizedPath}/${profile.chatCompletionsRelativePath}`.replace(/^\/+/u, "/");
  return base;
}

export function projectOpenAiCompatibleRequest(
  request: ModelRequest,
  providerModelId: string,
): JsonObject {
  return projectRequest(ModelRequestSchema.parse(request), providerModelId);
}

async function openSecureStream(input: Readonly<{
  endpoint: URL;
  authorization: string;
  body: JsonObject;
  signal: AbortSignal;
  options: LocalPersonalProviderTransportOptions;
  timeout: LocalPersonalProviderTimeoutController;
}>): Promise<IncomingMessage & AsyncIterable<Buffer>> {
  input.timeout.throwIfTerminated(input.signal);
  if (input.endpoint.protocol !== "https:") {
    throw failure("personal_model.transport_https_required", "protocol", false);
  }
  const hostname = input.endpoint.hostname;
  if (hostname.toLowerCase() === "metadata.google.internal") {
    throw failure("personal_model.transport_target_denied", "permission_denied", false);
  }
  const lookup = input.options.lookup ?? (async (host: string) => {
    const rows = await dns.lookup(host, { all: true, verbatim: true });
    return rows.map((row) => ({ address: row.address, family: row.family as 4 | 6 }));
  });
  const addresses = await raceWithTermination(
    lookup(hostname),
    input.signal,
    input.timeout,
  );
  if (addresses.length === 0) throw failure("personal_model.dns_empty", "network", true);
  for (const address of addresses) {
    if (!isAllowedAddress(address.address, input.options.testOnlyAllowLoopback === true)) {
      throw failure("personal_model.transport_target_denied", "permission_denied", false);
    }
  }
  const body = Buffer.from(JSON.stringify(input.body), "utf8");
  if (body.byteLength > MAX_REQUEST_BYTES) {
    body.fill(0);
    throw failure("personal_model.request_too_large", "protocol", false);
  }
  const pinned = addresses[0]!;
  const requestOptions: RequestOptions = {
    protocol: "https:",
    hostname,
    port: input.endpoint.port === "" ? 443 : Number(input.endpoint.port),
    path: `${input.endpoint.pathname}${input.endpoint.search}`,
    method: "POST",
    servername: hostname,
    headers: {
      Host: input.endpoint.host,
      Authorization: input.authorization,
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      "Content-Length": body.byteLength,
    },
    ca: input.options.ca,
    rejectUnauthorized: true,
    family: pinned.family,
    lookup: ((_host: string, options: unknown, callback: (...args: unknown[]) => void) => {
      if (typeof options === "object" && options !== null
        && "all" in options && options.all === true) {
        callback(null, [{ address: pinned.address, family: pinned.family }]);
        return;
      }
      callback(null, pinned.address, pinned.family);
    }) as RequestOptions["lookup"],
  };
  return await new Promise((resolve, reject) => {
    let settled = false;
    let secureConnectionEstablished = false;
    const onAbort = () => {
      request.destroy(terminationFailure(input.signal, input.timeout.terminationCause));
    };
    const onTimeout = () => request.destroy(input.timeout.terminationCause);
    const cleanup = () => {
      input.signal.removeEventListener("abort", onAbort);
      input.timeout.signal.removeEventListener("abort", onTimeout);
      body.fill(0);
    };
    const request = httpsRequest(requestOptions, (response) => {
      if (!secureConnectionEstablished) {
        settled = true;
        const error = failure("personal_model.secure_connection_unverified", "network", true);
        response.destroy(error);
        cleanup();
        reject(error);
        return;
      }
      const remoteAddress = response.socket.remoteAddress;
      if (remoteAddress === undefined
        || !addresses.some((item) => normalizeAddress(item.address) === normalizeAddress(remoteAddress))
        || !isAllowedAddress(remoteAddress, input.options.testOnlyAllowLoopback === true)) {
        response.destroy(failure("personal_model.remote_address_mismatch", "permission_denied", false));
        return;
      }
      if (response.statusCode !== 200) {
        settled = true;
        const error = statusFailure(response.statusCode ?? 0);
        response.destroy();
        cleanup();
        reject(error);
        return;
      }
      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      if (!contentType.startsWith("text/event-stream")) {
        settled = true;
        const error = failure("personal_model.content_type_invalid", "protocol", false);
        response.destroy();
        cleanup();
        reject(error);
        return;
      }
      settled = true;
      response.once("close", cleanup);
      resolve(response as IncomingMessage & AsyncIterable<Buffer>);
    });
    request.once("socket", (socket) => {
      const tlsSocket = socket as TLSSocket;
      tlsSocket.once("secureConnect", () => {
        const remoteAddress = tlsSocket.remoteAddress;
        if (remoteAddress === undefined
          || !addresses.some((item) => normalizeAddress(item.address) === normalizeAddress(remoteAddress))
          || !isAllowedAddress(remoteAddress, input.options.testOnlyAllowLoopback === true)) {
          request.destroy(failure(
            "personal_model.remote_address_mismatch",
            "permission_denied",
            false,
          ));
          return;
        }
        secureConnectionEstablished = true;
        input.timeout.connected();
      });
    });
    request.once("error", (error) => {
      cleanup();
      if (!settled) reject(input.timeout.terminationCause ?? error);
    });
    input.signal.addEventListener("abort", onAbort, { once: true });
    input.timeout.signal.addEventListener("abort", onTimeout, { once: true });
    if (input.timeout.signal.aborted) onTimeout();
    request.end(body);
  });
}

async function* projectOpenAiCompatibleSse(
  response: IncomingMessage & AsyncIterable<Buffer>,
  request: ModelRequest,
  signal: AbortSignal,
  timeout: LocalPersonalProviderTimeoutController,
  onRawUsage?: (rawUsage: unknown) => void,
): AsyncIterable<ModelStreamEvent> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let totalBytes = 0;
  let done = false;
  let finishReason: string | undefined;
  let usage: Readonly<{ inputTokens: number; outputTokens: number }> | undefined;
  const calls = new Map<number, ToolCallFragments>();
  try {
  for await (const chunk of response) {
    timeout.throwIfTerminated(signal);
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) throw failure("personal_model.response_too_large", "protocol", false);
    text = normalizeSseNewlines(text + decoder.decode(chunk, { stream: true }), false);
    let boundary: number;
    while ((boundary = text.indexOf("\n\n")) >= 0) {
      const block = text.slice(0, boundary);
      text = text.slice(boundary + 2);
      if (Buffer.byteLength(block, "utf8") > MAX_EVENT_BYTES) {
        throw failure("personal_model.sse_event_too_large", "protocol", false);
      }
      const data = block.split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data === "") continue;
      if (data === "[DONE]") {
        if (done) throw failure("personal_model.stream_terminal_duplicate", "protocol", false);
        done = true;
        timeout.progress();
        timeout.terminal();
        continue;
      }
      if (done) throw failure("personal_model.event_after_terminal", "protocol", false);
      const projected = projectChunk(data, request, calls);
      if (projected.progress) timeout.progress();
      for (const delta of projected.textDeltas) {
        if (delta.trim().length !== 0) {
          yield ModelStreamEventSchema.parse({ type: "text_delta", delta });
        }
      }
      if (projected.finishReason !== undefined) {
        if (finishReason !== undefined && finishReason !== projected.finishReason) {
          throw failure("personal_model.finish_reason_conflict", "protocol", false);
        }
        finishReason = projected.finishReason;
      }
      if (projected.usage !== undefined) {
        usage = projected.usage;
        onRawUsage?.(projected.rawUsage);
      }
    }
    if (done) break;
  }
  } catch (error) {
    throw timeout.terminationCause ?? error;
  }
  if (timeout.terminationCause !== undefined) throw timeout.terminationCause;
  text = normalizeSseNewlines(text + decoder.decode(), true);
  const terminalFinishReason = assertOpenAiCompatibleStreamTerminal({
    httpComplete: response.complete,
    responseAborted: response.aborted,
    done,
    ...(finishReason === undefined ? {} : { finishReason }),
    trailingText: text,
  });
  for (const [index, fragments] of [...calls.entries()].sort(([left], [right]) => left - right)) {
    if (index >= MAX_TOOL_CALLS) throw failure("personal_model.tool_call_limit_exceeded", "protocol", false);
    yield ModelStreamEventSchema.parse({ type: "tool_call", call: finalizeToolCall(fragments, request) });
  }
  if (usage !== undefined) {
    yield ModelStreamEventSchema.parse({ type: "usage", ...usage });
  }
  yield ModelStreamEventSchema.parse({ type: "completed", finishReason: terminalFinishReason });
}

export function assertOpenAiCompatibleStreamTerminal(input: Readonly<{
  httpComplete: boolean;
  responseAborted: boolean;
  done: boolean;
  finishReason?: string;
  trailingText: string;
}>): string {
  if (!input.done && (!input.httpComplete || input.responseAborted)) {
    throw failure("personal_model.network_failure", "network", true);
  }
  if (input.trailingText.trim().length !== 0) {
    throw failure("personal_model.sse_incomplete_event", "protocol", false);
  }
  if (!input.done || input.finishReason === undefined) {
    throw failure("personal_model.stream_terminal_missing", "protocol", false);
  }
  return input.finishReason;
}

type ToolCallFragments = {
  providerId?: string;
  name?: string;
  arguments: string;
};

function projectChunk(
  raw: string,
  request: ModelRequest,
  calls: Map<number, ToolCallFragments>,
): Readonly<{
  textDeltas: readonly string[];
  finishReason?: string;
  usage?: Readonly<{ inputTokens: number; outputTokens: number }>;
  rawUsage?: unknown;
  progress: boolean;
}> {
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    throw failure("personal_model.sse_json_invalid", "protocol", false);
  }
  if (!isObject(value)) throw failure("personal_model.sse_payload_invalid", "protocol", false);
  const progress = classifyParsedProgress(value);
  const choices = Array.isArray(value.choices) ? value.choices : [];
  if (choices.length > 1) {
    throw failure("personal_model.multiple_choices_unsupported", "protocol", false);
  }
  const textDeltas: string[] = [];
  let finishReason: string | undefined;
  for (const choice of choices) {
    if (!isObject(choice)) throw failure("personal_model.sse_choice_invalid", "protocol", false);
    if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
      if (typeof choice.finish_reason !== "string" || choice.finish_reason.trim() === "") {
        throw failure("personal_model.finish_reason_invalid", "protocol", false);
      }
      finishReason = choice.finish_reason;
    }
    if (!isObject(choice.delta)) continue;
    if (typeof choice.delta.content === "string") {
      if (choice.delta.content.trim().length !== 0) textDeltas.push(choice.delta.content);
    }
    if (Array.isArray(choice.delta.tool_calls) && choice.delta.tool_calls.length !== 0) {
      for (const candidate of choice.delta.tool_calls) {
        appendToolFragment(candidate, calls, request);
      }
    }
  }
  return {
    textDeltas,
    progress,
    ...(finishReason === undefined ? {} : { finishReason }),
    ...(value.usage === undefined || value.usage === null ? {} : {
      usage: mapUsage(value.usage),
      rawUsage: structuredClone(value.usage),
    }),
  };
}

export function classifyOpenAiCompatibleProgressFrame(raw: string): boolean {
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    throw failure("personal_model.sse_json_invalid", "protocol", false);
  }
  if (!isObject(value)) throw failure("personal_model.sse_payload_invalid", "protocol", false);
  return classifyParsedProgress(value);
}

function classifyParsedProgress(value: Record<string, unknown>): boolean {
  if (value.usage !== undefined && value.usage !== null) {
    mapUsage(value.usage);
    return true;
  }
  if (!Array.isArray(value.choices)) return false;
  return value.choices.some((choice) => {
    if (!isObject(choice)) return false;
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) return true;
    if (!isObject(choice.delta)) return false;
    return choice.delta.role === "assistant"
      || typeof choice.delta.content === "string"
      || typeof choice.delta.reasoning_content === "string"
      || typeof choice.delta.reasoning === "string"
      || (Array.isArray(choice.delta.tool_calls) && choice.delta.tool_calls.length !== 0);
  });
}

function appendToolFragment(
  candidate: unknown,
  calls: Map<number, ToolCallFragments>,
  request: ModelRequest,
): void {
  if (!isObject(candidate) || !Number.isInteger(candidate.index) || Number(candidate.index) < 0) {
    throw failure("personal_model.tool_call_fragment_invalid", "protocol", false);
  }
  const index = Number(candidate.index);
  if (index >= MAX_TOOL_CALLS) throw failure("personal_model.tool_call_limit_exceeded", "protocol", false);
  const current = calls.get(index) ?? { arguments: "" };
  if (typeof candidate.id === "string") {
    if (current.providerId !== undefined && current.providerId !== candidate.id) {
      throw failure("personal_model.tool_call_identity_conflict", "protocol", false);
    }
    current.providerId = candidate.id;
  }
  if (isObject(candidate.function)) {
    if (typeof candidate.function.name === "string") {
      if (current.name !== undefined && current.name !== candidate.function.name) {
        throw failure("personal_model.tool_call_identity_conflict", "protocol", false);
      }
      current.name = candidate.function.name;
    }
    if (typeof candidate.function.arguments === "string") {
      current.arguments += candidate.function.arguments;
      if (Buffer.byteLength(current.arguments, "utf8") > MAX_TOOL_ARGUMENT_BYTES) {
        throw failure("personal_model.tool_arguments_too_large", "protocol", false);
      }
    }
  }
  if (current.name !== undefined
    && !request.tools.some((tool) => tool.name === current.name)) {
    throw failure("personal_model.tool_call_not_locked", "permission_denied", false);
  }
  calls.set(index, current);
}

function finalizeToolCall(fragments: ToolCallFragments, request: ModelRequest): AssistantToolCall {
  const matching = request.tools.filter((tool) => tool.name === fragments.name);
  if (fragments.providerId === undefined || fragments.name === undefined || matching.length !== 1) {
    throw failure("personal_model.tool_call_identity_invalid", "protocol", false);
  }
  let argumentsValue: unknown;
  try { argumentsValue = JSON.parse(fragments.arguments); } catch {
    throw failure("personal_model.tool_arguments_invalid", "protocol", false);
  }
  const tool = matching[0]!;
  const argumentsObject = JsonObjectSchema.parse(argumentsValue);
  return {
    toolCallId: deterministicUuid(`tool-call\u0000${request.requestId}\u0000${fragments.providerId}`),
    taskId: tool.taskId,
    actionId: deterministicUuid(`action\u0000${request.requestId}\u0000${fragments.providerId}`),
    capabilityId: tool.capabilityId,
    arguments: argumentsObject,
  };
}

function projectRequest(request: ModelRequest, providerModelId: string): JsonObject {
  const toolsByCall = new Map(request.messages.flatMap((message) =>
    message.role === "assistant" ? message.toolCalls.map((call) => [call.toolCallId, call]) : []));
  const messages = request.messages.map((message): JsonObject => {
    if (message.role === "system" || message.role === "user") {
      return { role: message.role, content: message.content.map((part) => part.text).join("\n") };
    }
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content.map((part) => part.text).join("\n"),
        ...(message.toolCalls.length === 0 ? {} : {
          tool_calls: message.toolCalls.map((call) => {
            const tool = request.tools.find((candidate) => candidate.capabilityId === call.capabilityId);
            if (tool === undefined) throw failure("personal_model.tool_call_not_locked", "permission_denied", false);
            return {
              id: call.toolCallId,
              type: "function",
              function: { name: tool.name, arguments: JSON.stringify(call.arguments) },
            };
          }),
        }),
      };
    }
    if (!toolsByCall.has(message.toolCallId)) {
      throw failure("personal_model.tool_result_identity_invalid", "protocol", false);
    }
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content.map((part) => part.text).join("\n"),
    };
  });
  const tools = request.tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));
  return JsonObjectSchema.parse({
    model: providerModelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: request.maxOutputTokens,
    ...(tools.length === 0 ? {} : { tools }),
  });
}

function mapUsage(value: unknown): Readonly<{ inputTokens: number; outputTokens: number }> {
  if (!isObject(value)) throw failure("personal_model.usage_invalid", "protocol", false);
  const inputTokens = value.prompt_tokens;
  const outputTokens = value.completion_tokens;
  if (!Number.isSafeInteger(inputTokens) || Number(inputTokens) < 0
    || !Number.isSafeInteger(outputTokens) || Number(outputTokens) < 0) {
    throw failure("personal_model.usage_invalid", "protocol", false);
  }
  if (value.total_tokens !== undefined
    && (!Number.isSafeInteger(value.total_tokens)
      || Number(value.total_tokens) !== Number(inputTokens) + Number(outputTokens))) {
    throw failure("personal_model.usage_total_invalid", "protocol", false);
  }
  return { inputTokens: Number(inputTokens), outputTokens: Number(outputTokens) };
}

function decodeCredential(bytes: Uint8Array): string {
  if (bytes.byteLength < 8 || bytes.byteLength > 8192 || bytes.includes(0)) {
    throw failure("personal_model.credential_invalid", "runtime_unavailable", false);
  }
  let secret: string;
  try { secret = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch {
    throw failure("personal_model.credential_invalid", "runtime_unavailable", false);
  }
  if (secret.trim() !== secret || [...secret].some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || code === 0x7f;
  })) {
    throw failure("personal_model.credential_invalid", "runtime_unavailable", false);
  }
  return secret;
}

function isAllowedAddress(address: string, allowLoopback: boolean): boolean {
  const normalized = normalizeAddress(address);
  const family = isIP(normalized);
  if (family === 4) {
    const octets = normalized.split(".").map(Number);
    const [a, b] = octets;
    if (a === 127) return allowLoopback;
    return !(a === 0 || a === 10 || (a === 100 && b! >= 64 && b! <= 127)
      || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31)
      || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19))
      || a! >= 224);
  }
  if (family === 6) {
    const lower = normalized.toLowerCase();
    if (lower === "::1") return allowLoopback;
    if (lower === "::" || lower.startsWith("fe8") || lower.startsWith("fe9")
      || lower.startsWith("fea") || lower.startsWith("feb")
      || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("ff")) return false;
    if (lower.startsWith("::ffff:")) return isAllowedAddress(lower.slice(7), allowLoopback);
    return true;
  }
  return false;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/^::ffff:/u, "");
}

function normalizeSseNewlines(value: string, final: boolean): string {
  const crlf = value.replaceAll("\r\n", "\n");
  return final ? crlf.replaceAll("\r", "\n") : crlf.replace(/\r(?!$)/gu, "\n");
}

function statusFailure(status: number): LocalPersonalModelProviderError {
  if (status === 401) {
    return failure("personal_model.authentication_failed", "authentication", false);
  }
  if (status === 403) {
    return failure("personal_model.permission_denied", "permission_denied", false);
  }
  if (status === 404) return failure("personal_model.model_not_found", "model_not_found", false);
  if (status === 429 || status >= 500) {
    return failure("personal_model.provider_unavailable", "provider_transient", true);
  }
  if (status >= 300 && status < 400) {
    return failure("personal_model.redirect_forbidden", "protocol", false);
  }
  return failure("personal_model.provider_rejected", "protocol", false);
}

function failure(
  code: string,
  kind: LocalPersonalModelProviderError["kind"],
  retryable: boolean,
): LocalPersonalModelProviderError {
  return new LocalPersonalModelProviderError(code, kind, retryable);
}

export function resolveLocalPersonalProviderFailure(
  error: unknown,
  signal: AbortSignal,
  lockedCause: LocalPersonalModelProviderError | undefined,
): LocalPersonalModelProviderError {
  if (lockedCause !== undefined) return lockedCause;
  if (error instanceof LocalPersonalModelProviderError) return error;
  if (signal.aborted) return terminationFailure(signal, undefined);
  return failure("personal_model.network_failure", "network", true);
}

function safeMessage(kind: LocalPersonalModelProviderError["kind"]): string {
  return kind === "authentication" ? "Personal model authentication failed"
    : kind === "model_not_found" ? "Personal model is unavailable"
      : kind === "permission_denied" ? "Personal model request is not authorized"
        : kind === "cancelled" ? "Personal model request was cancelled"
          : kind === "deadline" ? "Personal model request timed out"
            : kind === "protocol" ? "Personal model response was incompatible"
              : "Personal model provider is unavailable";
}

function terminationFailure(
  signal: AbortSignal,
  lockedCause: LocalPersonalModelProviderError | undefined,
): LocalPersonalModelProviderError {
  if (lockedCause !== undefined) return lockedCause;
  return signal.reason instanceof LocalPersonalModelProviderError
    ? signal.reason
    : failure("personal_model.cancelled", "cancelled", false);
}

async function raceWithTermination<T>(
  work: Promise<T>,
  signal: AbortSignal,
  timeout: LocalPersonalProviderTimeoutController,
): Promise<T> {
  timeout.throwIfTerminated(signal);
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      timeout.signal.removeEventListener("abort", onTimeout);
      callback();
    };
    const onAbort = () => finish(() => reject(terminationFailure(
      signal,
      timeout.terminationCause,
    )));
    const onTimeout = () => finish(() => reject(timeout.terminationCause));
    signal.addEventListener("abort", onAbort, { once: true });
    timeout.signal.addEventListener("abort", onTimeout, { once: true });
    work.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(timeout.terminationCause ?? error)),
    );
  });
}

function testOnlyTimeoutMaterial(
  policy: ModelInvocationTimeoutPolicy,
  clock: Clock,
) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Local Personal Provider requires a durable invocation timeout");
  }
  return createModelInvocationTimeoutMaterial({
    policy,
    invocationStartedAt: clock.now(),
  });
}

function deterministicUuid(material: string): string {
  const bytes = createHash("sha256").update(material, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
