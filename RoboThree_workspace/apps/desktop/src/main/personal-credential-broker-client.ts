import { randomUUID } from "node:crypto";
import type { Readable, Writable } from "node:stream";

import {
  PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
  PersonalCredentialBrokerRequestHeaderSchema,
  PersonalCredentialBrokerResponseHeaderSchema,
  SensitiveFrameDecoder,
  encodeSensitiveFrame,
  type PersonalCredentialBrokerCommandType,
  type PersonalCredentialBrokerErrorCode,
  type PersonalCredentialBrokerRequestHeader,
  type PersonalCredentialBrokerResponseHeader,
} from "@robothree/contracts/desktop-private/personal-credential-broker-v1";

const MAX_INFLIGHT = 4;
const MAX_REGISTRY = 256;
const REGISTRY_TTL_MS = 10 * 60_000;

export type PersonalCredentialBrokerResult = Readonly<{
  header: PersonalCredentialBrokerResponseHeader;
  secret?: Uint8Array;
}>;

export type PersonalCredentialBrokerCommand = Readonly<{
  commandId: string;
  commandType: PersonalCredentialBrokerCommandType;
  personalModelId: string;
  expectedConfigurationRevision?: string;
  expectedExecutionDefinitionDigest?: string;
  commandRequestDigest: string;
  deadlineAt: string;
  secret?: Uint8Array;
}>;

type Pending = {
  readonly header: PersonalCredentialBrokerRequestHeader;
  readonly mutationKey: string | undefined;
  readonly resolvers: Array<(result: PersonalCredentialBrokerResult) => void>;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly abortSignal: AbortSignal | undefined;
  abortListener: (() => void) | undefined;
  settled: boolean;
};

type Completed = Readonly<{
  commandRequestDigest: string;
  expiresAt: number;
  result: PersonalCredentialBrokerResult;
}>;

type RevealTombstone = Readonly<{
  commandRequestDigest: string;
  expiresAt: number;
}>;

export class PersonalCredentialBrokerClient {
  readonly #request: Writable;
  readonly #response: Readable;
  readonly #channelInstanceId: string;
  readonly #clientInstanceId: string;
  readonly #decoder = new SensitiveFrameDecoder(PersonalCredentialBrokerResponseHeaderSchema);
  readonly #pending = new Map<string, Pending>();
  readonly #completed = new Map<string, Completed>();
  readonly #revealTombstones = new Map<string, RevealTombstone>();
  readonly #mutations = new Set<string>();
  #closed = false;

  public constructor(input: {
    request: Writable;
    response: Readable;
    channelInstanceId: string;
    clientInstanceId: string;
  }) {
    this.#request = input.request;
    this.#response = input.response;
    this.#channelInstanceId = input.channelInstanceId;
    this.#clientInstanceId = input.clientInstanceId;
    this.#response.on("data", this.#onData);
    this.#response.once("end", this.#onDisconnect);
    this.#response.once("error", this.#onDisconnect);
    this.#request.once("error", this.#onDisconnect);
  }

  public get channelInstanceId(): string {
    return this.#channelInstanceId;
  }

  public get clientInstanceId(): string {
    return this.#clientInstanceId;
  }

  public get inflightCount(): number {
    return this.#pending.size;
  }

  public resourceSnapshot(): Readonly<{
    inflight: number;
    completed: number;
    revealTombstones: number;
    mutations: number;
    closed: boolean;
  }> {
    return Object.freeze({
      inflight: this.#pending.size,
      completed: this.#completed.size,
      revealTombstones: this.#revealTombstones.size,
      mutations: this.#mutations.size,
      closed: this.#closed,
    });
  }

  public execute(
    command: PersonalCredentialBrokerCommand,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ): Promise<PersonalCredentialBrokerResult> {
    this.#pruneCompleted();
    if (this.#closed) return Promise.resolve(failure(command, this.#channelInstanceId,
      "credential_transport_unavailable", "rejected"));
    const existingPending = [...this.#pending.values()]
      .find((item) => item.header.commandId === command.commandId);
    if (existingPending !== undefined) {
      if (existingPending.header.commandRequestDigest !== command.commandRequestDigest) {
        return Promise.resolve(failure(command, this.#channelInstanceId,
          "credential_transport_conflict", "rejected"));
      }
      if (command.commandType === "reveal" || existingPending.header.commandType === "reveal") {
        return Promise.resolve(failure(command, this.#channelInstanceId,
          "credential_transport_busy", "rejected"));
      }
      return new Promise((resolve) => existingPending.resolvers.push(resolve));
    }
    const revealTombstone = this.#revealTombstones.get(command.commandId);
    if (revealTombstone !== undefined) {
      return Promise.resolve(failure(command, this.#channelInstanceId,
        revealTombstone.commandRequestDigest === command.commandRequestDigest
          ? "credential_reveal_replay_forbidden"
          : "credential_transport_conflict",
        "rejected"));
    }
    const completed = this.#completed.get(command.commandId);
    if (completed !== undefined) {
      return Promise.resolve(completed.commandRequestDigest === command.commandRequestDigest
        ? cloneResult(completed.result)
        : failure(command, this.#channelInstanceId, "credential_transport_conflict", "rejected"));
    }
    if (this.#pending.size >= MAX_INFLIGHT || this.#pending.size + this.#completed.size >= MAX_REGISTRY) {
      return Promise.resolve(failure(command, this.#channelInstanceId,
        "credential_transport_busy", "rejected"));
    }
    const mutationKey = `${this.#clientInstanceId}:${command.personalModelId}`;
    if (mutationKey !== undefined && this.#mutations.has(mutationKey)) {
      return Promise.resolve(failure(command, this.#channelInstanceId,
        "credential_transport_busy", "rejected"));
    }
    const deadline = Date.parse(command.deadlineAt);
    if (!Number.isFinite(deadline) || deadline <= Date.now()) {
      return Promise.resolve(failure(command, this.#channelInstanceId,
        "credential_transport_unavailable", "timed_out"));
    }
    const body = command.secret === undefined ? new Uint8Array(0) : Uint8Array.from(command.secret);
    const header = PersonalCredentialBrokerRequestHeaderSchema.parse({
      protocolVersion: PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
      channelInstanceId: this.#channelInstanceId,
      commandId: command.commandId,
      commandType: command.commandType,
      transportRequestId: randomUUID(),
      clientInstanceId: this.#clientInstanceId,
      personalModelId: command.personalModelId,
      ...(command.expectedConfigurationRevision === undefined
        ? {}
        : { expectedConfigurationRevision: command.expectedConfigurationRevision }),
      ...(command.expectedExecutionDefinitionDigest === undefined
        ? {}
        : { expectedExecutionDefinitionDigest: command.expectedExecutionDefinitionDigest }),
      commandRequestDigest: command.commandRequestDigest,
      deadlineAt: command.deadlineAt,
      secretByteLength: body.byteLength,
    });

    return new Promise((resolve) => {
      const transportRequestId = header.transportRequestId;
      let abortListener: (() => void) | undefined;
      const timer = setTimeout(() => {
        this.#settle(transportRequestId, failureFromHeader(
          header,
          "credential_transport_unavailable",
          "timed_out",
        ));
      }, Math.max(1, deadline - Date.now()));
      const pending: Pending = {
        header,
        mutationKey,
        resolvers: [resolve],
        timer,
        abortSignal: options.signal,
        abortListener,
        settled: false,
      };
      if (options.signal !== undefined) {
        abortListener = () => this.#settle(transportRequestId, failureFromHeader(
          header,
          "credential_store_cancelled",
          "cancelled",
        ));
        pending.abortListener = abortListener;
        options.signal.addEventListener("abort", abortListener, { once: true });
      }
      this.#pending.set(transportRequestId, pending);
      if (mutationKey !== undefined) this.#mutations.add(mutationKey);
      if (options.signal?.aborted === true) {
        abortListener?.();
        body.fill(0);
        return;
      }
      let frame: Uint8Array;
      try {
        frame = encodeSensitiveFrame(header, body);
      } catch {
        body.fill(0);
        this.#settle(transportRequestId, failureFromHeader(
          header,
          "credential_transport_invalid_request",
          "rejected",
        ));
        return;
      }
      body.fill(0);
      this.#request.write(frame, (error?: Error | null) => {
        frame.fill(0);
        if (error !== undefined && error !== null) {
          this.#settle(transportRequestId, failureFromHeader(
            header,
            "credential_transport_unavailable",
            "uncertain",
          ));
        }
      });
    });
  }

  public close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#response.off("data", this.#onData);
    this.#response.off("end", this.#onDisconnect);
    this.#response.off("error", this.#onDisconnect);
    this.#request.off("error", this.#onDisconnect);
    this.#decoder.reset();
    this.#request.destroy();
    this.#response.destroy();
    for (const [transportRequestId, pending] of this.#pending) {
      this.#settle(transportRequestId, failureFromHeader(
        pending.header,
        "credential_transport_unavailable",
        "uncertain",
      ));
    }
    for (const entry of this.#completed.values()) entry.result.secret?.fill(0);
    this.#completed.clear();
    this.#revealTombstones.clear();
    this.#mutations.clear();
  }

  readonly #onData = (chunk: Uint8Array): void => {
    try {
      for (const frame of this.#decoder.push(chunk)) {
        const pending = this.#pending.get(frame.header.transportRequestId);
        if (pending === undefined
          || frame.header.channelInstanceId !== this.#channelInstanceId
          || frame.header.commandId !== pending.header.commandId
          || (frame.header.status === "completed"
            && (pending.header.commandType === "reveal") !== (frame.body.byteLength > 0))) {
          frame.body.fill(0);
          continue;
        }
        this.#settle(frame.header.transportRequestId, {
          header: frame.header,
          ...(frame.body.byteLength === 0 ? {} : { secret: frame.body }),
        });
      }
    } catch {
      this.close();
    }
  };

  readonly #onDisconnect = (): void => this.close();

  #settle(transportRequestId: string, result: PersonalCredentialBrokerResult): void {
    const pending = this.#pending.get(transportRequestId);
    if (pending === undefined || pending.settled) {
      result.secret?.fill(0);
      return;
    }
    pending.settled = true;
    this.#pending.delete(transportRequestId);
    clearTimeout(pending.timer);
    if (pending.abortListener !== undefined) {
      pending.abortSignal?.removeEventListener("abort", pending.abortListener);
    }
    if (pending.mutationKey !== undefined) this.#mutations.delete(pending.mutationKey);
    if (pending.header.commandType === "reveal") {
      this.#revealTombstones.set(pending.header.commandId, {
        commandRequestDigest: pending.header.commandRequestDigest,
        expiresAt: Date.now() + REGISTRY_TTL_MS,
      });
    } else if (result.secret === undefined) {
      this.#completed.set(pending.header.commandId, {
        commandRequestDigest: pending.header.commandRequestDigest,
        expiresAt: Date.now() + REGISTRY_TTL_MS,
        result,
      });
      this.#pruneCompleted();
    }
    for (const resolve of pending.resolvers) resolve(cloneResult(result));
    result.secret?.fill(0);
  }

  #pruneCompleted(): void {
    const now = Date.now();
    for (const [commandId, item] of this.#completed) {
      if (item.expiresAt <= now) this.#completed.delete(commandId);
    }
    for (const [commandId, item] of this.#revealTombstones) {
      if (item.expiresAt <= now) this.#revealTombstones.delete(commandId);
    }
    while (this.#completed.size > MAX_REGISTRY) {
      const first = this.#completed.keys().next().value as string | undefined;
      if (first === undefined) break;
      this.#completed.delete(first);
    }
    while (this.#revealTombstones.size > MAX_REGISTRY) {
      const first = this.#revealTombstones.keys().next().value as string | undefined;
      if (first === undefined) break;
      this.#revealTombstones.delete(first);
    }
  }
}

function failure(
  command: PersonalCredentialBrokerCommand,
  channelInstanceId: string,
  code: PersonalCredentialBrokerErrorCode,
  status: "rejected" | "timed_out",
): PersonalCredentialBrokerResult {
  return {
    header: PersonalCredentialBrokerResponseHeaderSchema.parse({
      protocolVersion: PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
      channelInstanceId,
      commandId: command.commandId,
      transportRequestId: randomUUID(),
      status,
      typedErrorCode: code,
      secretByteLength: 0,
    }),
  };
}

function failureFromHeader(
  request: PersonalCredentialBrokerRequestHeader,
  code: PersonalCredentialBrokerErrorCode,
  status: "rejected" | "cancelled" | "timed_out" | "uncertain",
): PersonalCredentialBrokerResult {
  return {
    header: PersonalCredentialBrokerResponseHeaderSchema.parse({
      protocolVersion: PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
      channelInstanceId: request.channelInstanceId,
      commandId: request.commandId,
      transportRequestId: request.transportRequestId,
      status,
      typedErrorCode: code,
      secretByteLength: 0,
    }),
  };
}

function cloneResult(result: PersonalCredentialBrokerResult): PersonalCredentialBrokerResult {
  return {
    header: result.header,
    ...(result.secret === undefined ? {} : { secret: Uint8Array.from(result.secret) }),
  };
}
