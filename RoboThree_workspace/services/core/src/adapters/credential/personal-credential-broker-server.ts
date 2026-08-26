import type { Readable, Writable } from "node:stream";

import {
  PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
  PersonalCredentialBrokerRequestHeaderSchema,
  PersonalCredentialBrokerResponseHeaderSchema,
  SensitiveFrameDecoder,
  encodeSensitiveFrame,
  type PersonalCredentialBrokerErrorCode,
  type PersonalCredentialBrokerRequestHeader,
  type PersonalCredentialBrokerResponseHeader,
} from "@robothree/contracts/desktop-private/personal-credential-broker-v1";

export type PersonalCredentialBrokerHandlerResult = Readonly<{
  status: "completed" | "rejected" | "cancelled" | "timed_out" | "uncertain";
  typedErrorCode?: PersonalCredentialBrokerErrorCode;
  secret?: Uint8Array;
}>;

export type PersonalCredentialBrokerHandler = (
  header: PersonalCredentialBrokerRequestHeader,
  secret: Uint8Array,
) => Promise<PersonalCredentialBrokerHandlerResult>;

export class PersonalCredentialBrokerServer {
  readonly #request: Readable;
  readonly #response: Writable;
  readonly #channelInstanceId: string;
  readonly #clientInstanceId: string;
  readonly #handler: PersonalCredentialBrokerHandler;
  readonly #decoder = new SensitiveFrameDecoder(PersonalCredentialBrokerRequestHeaderSchema);
  readonly #inflight = new Set<string>();
  readonly #mutations = new Set<string>();
  #closed = false;

  public constructor(input: {
    request: Readable;
    response: Writable;
    channelInstanceId: string;
    clientInstanceId: string;
    handler: PersonalCredentialBrokerHandler;
  }) {
    this.#request = input.request;
    this.#response = input.response;
    this.#channelInstanceId = input.channelInstanceId;
    this.#clientInstanceId = input.clientInstanceId;
    this.#handler = input.handler;
  }

  public start(): void {
    if (this.#closed) throw new Error("Credential broker server is closed");
    this.#request.on("data", this.#onData);
    this.#request.once("end", this.#onDisconnect);
    this.#request.once("error", this.#onDisconnect);
    this.#response.once("error", this.#onDisconnect);
  }

  public resourceSnapshot(): Readonly<{
    inflight: number;
    mutations: number;
    closed: boolean;
  }> {
    return Object.freeze({
      inflight: this.#inflight.size,
      mutations: this.#mutations.size,
      closed: this.#closed,
    });
  }

  public close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#request.off("data", this.#onData);
    this.#request.off("end", this.#onDisconnect);
    this.#request.off("error", this.#onDisconnect);
    this.#response.off("error", this.#onDisconnect);
    this.#decoder.reset();
    this.#request.destroy();
    this.#response.destroy();
    this.#inflight.clear();
    this.#mutations.clear();
  }

  readonly #onData = (chunk: Uint8Array): void => {
    try {
      for (const frame of this.#decoder.push(chunk)) void this.#handle(frame.header, frame.body);
    } catch {
      this.close();
    }
  };

  readonly #onDisconnect = (): void => this.close();

  async #handle(header: PersonalCredentialBrokerRequestHeader, body: Uint8Array): Promise<void> {
    const mutationKey = `${header.clientInstanceId}:${header.personalModelId}`;
    try {
      if (header.channelInstanceId !== this.#channelInstanceId
        || header.clientInstanceId !== this.#clientInstanceId) {
        await this.#writeFailure(header, "credential_transport_invalid_request", "rejected");
        return;
      }
      if (Date.parse(header.deadlineAt) <= Date.now()) {
        await this.#writeFailure(header, "credential_transport_unavailable", "timed_out");
        return;
      }
      if (this.#inflight.size >= 4 || this.#inflight.has(header.transportRequestId)
        || (mutationKey !== undefined && this.#mutations.has(mutationKey))) {
        await this.#writeFailure(header, "credential_transport_busy", "rejected");
        return;
      }
      this.#inflight.add(header.transportRequestId);
      if (mutationKey !== undefined) this.#mutations.add(mutationKey);
      let result: PersonalCredentialBrokerHandlerResult;
      try {
        result = await this.#handler(header, body);
      } catch {
        result = {
          status: "rejected",
          typedErrorCode: "credential_store_internal",
        };
      }
      const responseBody = result.secret === undefined
        ? new Uint8Array(0)
        : Uint8Array.from(result.secret);
      result.secret?.fill(0);
      if ((header.commandType === "reveal") !== (responseBody.byteLength > 0)
        && result.status === "completed") {
        responseBody.fill(0);
        await this.#writeFailure(header, "credential_store_internal", "rejected");
        return;
      }
      const response = PersonalCredentialBrokerResponseHeaderSchema.parse({
        protocolVersion: PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
        channelInstanceId: this.#channelInstanceId,
        commandId: header.commandId,
        transportRequestId: header.transportRequestId,
        status: result.status,
        ...(result.typedErrorCode === undefined ? {} : { typedErrorCode: result.typedErrorCode }),
        secretByteLength: responseBody.byteLength,
      });
      await this.#write(response, responseBody);
    } finally {
      body.fill(0);
      this.#inflight.delete(header.transportRequestId);
      if (mutationKey !== undefined) this.#mutations.delete(mutationKey);
    }
  }

  async #writeFailure(
    request: PersonalCredentialBrokerRequestHeader,
    code: PersonalCredentialBrokerErrorCode,
    status: "rejected" | "timed_out",
  ): Promise<void> {
    await this.#write(PersonalCredentialBrokerResponseHeaderSchema.parse({
      protocolVersion: PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
      channelInstanceId: this.#channelInstanceId,
      commandId: request.commandId,
      transportRequestId: request.transportRequestId,
      status,
      typedErrorCode: code,
      secretByteLength: 0,
    }), new Uint8Array(0));
  }

  async #write(header: PersonalCredentialBrokerResponseHeader, body: Uint8Array): Promise<void> {
    if (this.#closed) {
      body.fill(0);
      return;
    }
    const frame = encodeSensitiveFrame(header, body);
    body.fill(0);
    await new Promise<void>((resolve) => {
      this.#response.write(frame, () => {
        frame.fill(0);
        resolve();
      });
    });
  }
}
