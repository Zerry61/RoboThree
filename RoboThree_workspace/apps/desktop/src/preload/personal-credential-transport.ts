import {
  PERSONAL_CREDENTIAL_TRANSPORT_MAX_REGISTRY,
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
  PersonalCredentialTransportFrameAuthorizationSchema,
  PersonalCredentialTransportFrameHeaderSchema,
  PersonalCredentialTransportTicketSchema,
  canonicalPersonalCredentialTransportFrameMaterial,
  parsePersonalCredentialTransportBinaryEnvelope,
  personalCredentialTransportFrameHeaderMaterial,
  type PersonalCredentialTransportBinaryEnvelope,
  type PersonalCredentialTransportErrorCode,
  type PersonalCredentialTransportFrameAuthorization,
  type PersonalCredentialTransportFrameHeader,
  type PersonalCredentialTransportTicket,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";

export interface PersonalCredentialTransportPrivatePort {
  postMessage(message: unknown): void;
  close(): void;
}

export class PersonalCredentialTransportPreloadError extends Error {
  public constructor(readonly code: PersonalCredentialTransportErrorCode) {
    super(code);
    this.name = "PersonalCredentialTransportPreloadError";
  }
}

/**
 * STRM-1 private Preload foundation. The production preload entry does not
 * import or expose this adapter. STRM-2 owns the one-shot Electron port wiring.
 */
export class PersonalCredentialTransportPreloadAdapter {
  readonly #foundationEnabled: boolean;
  readonly #usedCommands = new Map<string, number>();
  readonly #now: () => number;
  #closed = false;

  public constructor(options: Readonly<{
    foundationEnabled?: boolean;
    now?: () => number;
  }> = {}) {
    this.#foundationEnabled = options.foundationEnabled === true;
    this.#now = options.now ?? Date.now;
  }

  /**
   * @deprecated STRM-1 conformance-only path. Production wiring must use
   * sendAuthorizedMutation so sandboxed Preload never depends on WebCrypto.
   */
  public async sendMutation(
    ticketInput: PersonalCredentialTransportTicket,
    secret: Uint8Array,
    port: PersonalCredentialTransportPrivatePort,
  ): Promise<void> {
    try {
      this.#assertAvailable();
      const ticket = this.#parseTicket(ticketInput);
      if (ticket.operationType !== "create" && ticket.operationType !== "update") {
        throw new PersonalCredentialTransportPreloadError(
          "personal_credential_transport_identity_mismatch",
        );
      }
      this.#admitOnce(ticket.commandId);
      const envelope = await createEnvelope(ticket, "mutation_secret", secret);
      port.postMessage(envelope);
    } finally {
      secret.fill(0);
    }
  }

  /**
   * STRM-2.2 production path. The exact header is issued by Main over the
   * one-shot capability port; sandboxed Preload does not invent crypto.
   */
  public async sendAuthorizedMutation(
    ticketInput: PersonalCredentialTransportTicket,
    authorizationInput: PersonalCredentialTransportFrameAuthorization,
    secret: Uint8Array,
    port: PersonalCredentialTransportPrivatePort,
  ): Promise<void> {
    try {
      this.#assertAvailable();
      const ticket = this.#parseTicket(ticketInput);
      if (ticket.operationType !== "create" && ticket.operationType !== "update") {
        throw new PersonalCredentialTransportPreloadError(
          "personal_credential_transport_identity_mismatch",
        );
      }
      const authorization = this.#assertAuthorization(
        ticket,
        authorizationInput,
        "mutation_to_main",
        "mutation_secret",
      );
      if (secret.byteLength !== authorization.bodyLength) {
        throw new PersonalCredentialTransportPreloadError(
          "personal_credential_transport_invalid_frame",
        );
      }
      this.#admitOnce(ticket.commandId);
      port.postMessage(parsePersonalCredentialTransportBinaryEnvelope({
        header: authorization.frameHeader,
        body: secret,
      }));
    } finally {
      secret.fill(0);
    }
  }

  /**
   * @deprecated STRM-1 conformance-only path. Production wiring must use
   * consumeAuthorizedReveal with a Main-issued authorization.
   */
  public async consumeReveal(
    ticketInput: PersonalCredentialTransportTicket,
    input: unknown,
    consumer: (secret: Uint8Array) => void | Promise<void>,
  ): Promise<void> {
    try {
      this.#assertAvailable();
      const ticket = this.#parseTicket(ticketInput);
      if (ticket.operationType !== "reveal") {
        throw new PersonalCredentialTransportPreloadError(
          "personal_credential_transport_identity_mismatch",
        );
      }
      this.#admitOnce(ticket.commandId);
      const envelope = parsePersonalCredentialTransportBinaryEnvelope(input);
      await assertEnvelope(ticket, envelope, "reveal_secret");
      await consumer(envelope.body);
    } catch (error) {
      if (error instanceof PersonalCredentialTransportPreloadError) throw error;
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_invalid_frame",
      );
    } finally {
      scrubUnknownBody(input);
    }
  }

  public async consumeAuthorizedReveal(
    ticketInput: PersonalCredentialTransportTicket,
    authorizationInput: PersonalCredentialTransportFrameAuthorization,
    input: unknown,
    consumer: (secret: Uint8Array) => void | Promise<void>,
  ): Promise<void> {
    try {
      this.#assertAvailable();
      const ticket = this.#parseTicket(ticketInput);
      if (ticket.operationType !== "reveal") {
        throw new PersonalCredentialTransportPreloadError(
          "personal_credential_transport_identity_mismatch",
        );
      }
      const authorization = this.#assertAuthorization(
        ticket,
        authorizationInput,
        "reveal_to_preload",
        "reveal_secret",
      );
      this.#admitOnce(ticket.commandId);
      const envelope = parsePersonalCredentialTransportBinaryEnvelope(input);
      if (envelope.header.commandId !== authorization.frameHeader.commandId
        || envelope.header.correlationId !== authorization.frameHeader.correlationId
        || envelope.header.frameType !== authorization.frameHeader.frameType
        || envelope.header.bodyLength !== authorization.frameHeader.bodyLength
        || envelope.header.frameDigest !== authorization.frameHeader.frameDigest) {
        throw new PersonalCredentialTransportPreloadError(
          "personal_credential_transport_invalid_frame",
        );
      }
      await consumer(envelope.body);
    } catch (error) {
      if (error instanceof PersonalCredentialTransportPreloadError) throw error;
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_invalid_frame",
      );
    } finally {
      scrubUnknownBody(input);
    }
  }

  public snapshot(): Readonly<{
    foundationEnabled: boolean;
    productionFeatureEnabled: false;
    transportBlockerClosed: false;
    usedCommandCount: number;
    closed: boolean;
  }> {
    return Object.freeze({
      foundationEnabled: this.#foundationEnabled,
      productionFeatureEnabled: false,
      transportBlockerClosed: false,
      usedCommandCount: this.#usedCommands.size,
      closed: this.#closed,
    });
  }

  public close(): void {
    this.#usedCommands.clear();
    this.#closed = true;
  }

  #assertAvailable(): void {
    if (!this.#foundationEnabled || this.#closed) {
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_unavailable",
      );
    }
  }

  #admitOnce(commandId: string): void {
    for (const [key, expiresAt] of this.#usedCommands) {
      if (expiresAt <= this.#now()) this.#usedCommands.delete(key);
    }
    if (this.#usedCommands.has(commandId)) {
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_replay_forbidden",
      );
    }
    if (this.#usedCommands.size >= PERSONAL_CREDENTIAL_TRANSPORT_MAX_REGISTRY) {
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_busy",
      );
    }
    this.#usedCommands.set(commandId, this.#now() + 10 * 60_000);
  }

  #parseTicket(input: PersonalCredentialTransportTicket): PersonalCredentialTransportTicket {
    let ticket: PersonalCredentialTransportTicket;
    try {
      ticket = PersonalCredentialTransportTicketSchema.parse(input);
    } catch {
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_invalid_ticket",
      );
    }
    if (Date.parse(ticket.expiresAt) <= this.#now()) {
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_expired",
      );
    }
    return ticket;
  }

  #assertAuthorization(
    ticket: PersonalCredentialTransportTicket,
    input: PersonalCredentialTransportFrameAuthorization,
    direction: "mutation_to_main" | "reveal_to_preload",
    frameType: "mutation_secret" | "reveal_secret",
  ): PersonalCredentialTransportFrameAuthorization {
    let authorization: PersonalCredentialTransportFrameAuthorization;
    try {
      authorization = PersonalCredentialTransportFrameAuthorizationSchema.parse(input);
    } catch {
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_invalid_frame",
      );
    }
    if (authorization.ticketDigest !== ticket.ticketDigest
      || authorization.commandId !== ticket.commandId
      || authorization.correlationId !== ticket.correlationId
      || authorization.runtimeInstanceId !== ticket.runtimeInstanceId
      || authorization.clientInstanceId !== ticket.clientInstanceId
      || authorization.webContentsId !== ticket.webContentsId
      || authorization.mainFrameRoutingId !== ticket.mainFrameRoutingId
      || authorization.navigationEpoch !== ticket.navigationEpoch
      || authorization.direction !== direction
      || authorization.frameType !== frameType
      || Date.parse(authorization.expiresAt) <= this.#now()) {
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_identity_mismatch",
      );
    }
    return authorization;
  }
}

async function createEnvelope(
  ticket: PersonalCredentialTransportTicket,
  frameType: "mutation_secret",
  body: Uint8Array,
): Promise<PersonalCredentialTransportBinaryEnvelope> {
  if (!(body instanceof Uint8Array)
    || Object.prototype.toString.call(body) !== "[object Uint8Array]"
    || (typeof SharedArrayBuffer !== "undefined"
      && body.buffer instanceof SharedArrayBuffer)
    || Reflect.get(body.buffer, "detached") === true) {
    throw new PersonalCredentialTransportPreloadError(
      "personal_credential_transport_invalid_frame",
    );
  }
  const material = {
    protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
    transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
    commandId: ticket.commandId,
    correlationId: ticket.correlationId,
    frameType,
    bodyLength: body.byteLength,
  } as const;
  const header = PersonalCredentialTransportFrameHeaderSchema.parse({
    ...material,
    frameDigest: await sha256Digest(
      canonicalPersonalCredentialTransportFrameMaterial(material),
    ),
  });
  return parsePersonalCredentialTransportBinaryEnvelope({ header, body });
}

async function assertEnvelope(
  ticket: PersonalCredentialTransportTicket,
  envelope: PersonalCredentialTransportBinaryEnvelope,
  expectedFrameType: "reveal_secret",
): Promise<void> {
  const header = envelope.header;
  if (header.commandId !== ticket.commandId
    || header.correlationId !== ticket.correlationId
    || header.transportProfileRevision !== ticket.transportProfileRevision
    || header.frameType !== expectedFrameType) {
    throw new PersonalCredentialTransportPreloadError(
      "personal_credential_transport_identity_mismatch",
    );
  }
  const expected = await sha256Digest(
    canonicalPersonalCredentialTransportFrameMaterial(
      personalCredentialTransportFrameHeaderMaterial(header),
    ),
  );
  if (expected !== header.frameDigest) {
    throw new PersonalCredentialTransportPreloadError(
      "personal_credential_transport_invalid_frame",
    );
  }
}

async function sha256Digest(value: string): Promise<string> {
  const input = new TextEncoder().encode(value);
  try {
    const result = await globalThis.crypto.subtle.digest("SHA-256", input);
    return `sha256:${bytesToHex(new Uint8Array(result))}`;
  } finally {
    input.fill(0);
  }
}

function bytesToHex(value: Uint8Array): string {
  let output = "";
  for (const byte of value) output += byte.toString(16).padStart(2, "0");
  return output;
}

function scrubUnknownBody(input: unknown): void {
  if (typeof input !== "object" || input === null) return;
  const body = Reflect.get(input, "body");
  if (body instanceof Uint8Array) body.fill(0);
}

export type { PersonalCredentialTransportFrameHeader };
