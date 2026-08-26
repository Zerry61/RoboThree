import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  PERSONAL_CREDENTIAL_TRANSPORT_MAX_INFLIGHT,
  PERSONAL_CREDENTIAL_TRANSPORT_MAX_REGISTRY,
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
  PERSONAL_CREDENTIAL_TRANSPORT_TICKET_TTL_MS,
  PERSONAL_CREDENTIAL_TRANSPORT_TOMBSTONE_TTL_MS,
  PersonalCredentialTransportFrameAuthorizationMaterialSchema,
  PersonalCredentialTransportFrameAuthorizationSchema,
  PersonalCredentialTransportFrameHeaderSchema,
  PersonalCredentialTransportTicketMaterialSchema,
  PersonalCredentialTransportTicketSchema,
  canonicalPersonalCredentialTransportFrameAuthorizationMaterial,
  canonicalPersonalCredentialTransportFrameMaterial,
  canonicalPersonalCredentialTransportTicketMaterial,
  parsePersonalCredentialTransportBinaryEnvelope,
  personalCredentialTransportFrameAuthorizationMaterial,
  personalCredentialTransportFrameHeaderMaterial,
  personalCredentialTransportTicketMaterial,
  type PersonalCredentialTransportBinaryEnvelope,
  type PersonalCredentialTransportControlMessage,
  type PersonalCredentialTransportDirection,
  type PersonalCredentialTransportErrorCode,
  type PersonalCredentialTransportFrameAuthorization,
  type PersonalCredentialTransportFrameAuthorizationMaterial,
  type PersonalCredentialTransportFrameHeader,
  type PersonalCredentialTransportOperationType,
  type PersonalCredentialTransportTicket,
  type PersonalCredentialTransportTicketMaterial,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";

const TICKET_HMAC_DOMAIN = "robothree.personal-credential-transport.ticket.v1\n";
const FRAME_AUTHORIZATION_HMAC_DOMAIN =
  "robothree.personal-credential-transport.frame-authorization.v1\n";
const REVEAL_RATE_WINDOW_MS = 60_000;
const REVEAL_RATE_LIMIT = 5;

export type MainDerivedPersonalCredentialTransportIdentity = Readonly<{
  runtimeInstanceId: string;
  clientInstanceId: string;
  commandId: string;
  correlationId: string;
  requestDigest: string;
  webContentsId: number;
  mainFrameRoutingId: number;
  navigationEpoch: number;
}>;

export type CreatePersonalCredentialTransportTicketInput =
  MainDerivedPersonalCredentialTransportIdentity & Readonly<{
    operationType: PersonalCredentialTransportOperationType;
    personalModelId: string;
    expectedConfigurationRevision: string;
  }>;

type ActiveState = "created" | "port_bound" | "ready" | "frame_received";
type TerminalState =
  | "completed"
  | "rejected"
  | "cancelled"
  | "timed_out"
  | "uncertain"
  | "navigation_invalidated"
  | "process_lost";

type RegistryRecord = {
  readonly ticket: PersonalCredentialTransportTicket;
  readonly modelGateKey: string;
  state: ActiveState | TerminalState;
  terminalExpiresAt: number | undefined;
};

export class PersonalCredentialTransportError extends Error {
  public constructor(readonly code: PersonalCredentialTransportErrorCode) {
    super(code);
    this.name = "PersonalCredentialTransportError";
  }
}

/**
 * STRM-1 private Main foundation. It is intentionally not registered from the
 * production Main entry and defaults to disabled. STRM-2 owns Electron port
 * wiring and Broker dispatch.
 */
export class PersonalCredentialTransportMainAdapter {
  readonly #records = new Map<string, RegistryRecord>();
  readonly #modelGates = new Set<string>();
  readonly #revealAdmissions: number[] = [];
  readonly #ticketKey: Uint8Array;
  readonly #frameAuthorizationKey: Uint8Array;
  readonly #now: () => number;
  readonly #foundationEnabled: boolean;
  #closed = false;

  public constructor(options: Readonly<{
    foundationEnabled?: boolean;
    ticketKey?: Uint8Array;
    frameAuthorizationKey?: Uint8Array;
    now?: () => number;
  }> = {}) {
    this.#foundationEnabled = options.foundationEnabled === true;
    this.#ticketKey = options.ticketKey === undefined
      ? randomBytes(32)
      : Uint8Array.from(options.ticketKey);
    if (this.#ticketKey.byteLength !== 32) {
      this.#ticketKey.fill(0);
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_ticket",
      );
    }
    this.#frameAuthorizationKey = options.frameAuthorizationKey === undefined
      ? randomBytes(32)
      : Uint8Array.from(options.frameAuthorizationKey);
    if (this.#frameAuthorizationKey.byteLength !== 32) {
      this.#ticketKey.fill(0);
      this.#frameAuthorizationKey.fill(0);
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_ticket",
      );
    }
    this.#now = options.now ?? Date.now;
  }

  public createTicket(
    input: CreatePersonalCredentialTransportTicketInput,
  ): PersonalCredentialTransportTicket {
    this.#assertAvailable();
    this.#prune();
    if (this.#activeCount() >= PERSONAL_CREDENTIAL_TRANSPORT_MAX_INFLIGHT
      || this.#records.size >= PERSONAL_CREDENTIAL_TRANSPORT_MAX_REGISTRY) {
      throw new PersonalCredentialTransportError("personal_credential_transport_busy");
    }
    const existing = this.#findByCommandId(input.commandId);
    if (existing !== undefined) {
      throw new PersonalCredentialTransportError(
        existing.state === "created" || existing.state === "port_bound"
          || existing.state === "ready" || existing.state === "frame_received"
          ? "personal_credential_transport_duplicate"
          : "personal_credential_transport_replay_forbidden",
      );
    }
    // The Desktop runtime has one active owner authority. Do not scope this
    // gate to a transient client instance or a reconnect could bypass it.
    const modelGateKey = input.personalModelId;
    if (this.#modelGates.has(modelGateKey)) {
      throw new PersonalCredentialTransportError("personal_credential_transport_busy");
    }
    if (input.operationType === "reveal") this.#admitReveal();

    const material = PersonalCredentialTransportTicketMaterialSchema.parse({
      schemaVersion: "personal-credential-transport-ticket.v1",
      transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
      runtimeInstanceId: input.runtimeInstanceId,
      clientInstanceId: input.clientInstanceId,
      commandId: input.commandId,
      correlationId: input.correlationId,
      operationType: input.operationType,
      personalModelId: input.personalModelId,
      expectedConfigurationRevision: input.expectedConfigurationRevision,
      requestDigest: input.requestDigest,
      webContentsId: input.webContentsId,
      mainFrameRoutingId: input.mainFrameRoutingId,
      navigationEpoch: input.navigationEpoch,
      expiresAt: new Date(this.#now() + PERSONAL_CREDENTIAL_TRANSPORT_TICKET_TTL_MS)
        .toISOString(),
    });
    const ticket = PersonalCredentialTransportTicketSchema.parse({
      ...material,
      ticketDigest: this.#ticketDigest(material),
    });
    this.#records.set(this.#recordKey(ticket), {
      ticket,
      modelGateKey,
      state: "created",
      terminalExpiresAt: undefined,
    });
    this.#modelGates.add(modelGateKey);
    return ticket;
  }

  public bindPort(
    ticketInput: PersonalCredentialTransportTicket,
    actualIdentity: MainDerivedPersonalCredentialTransportIdentity,
  ): void {
    this.#assertAvailable();
    this.#prune();
    const ticket = this.#verifyTicket(ticketInput);
    this.#assertIdentity(ticket, actualIdentity);
    const record = this.#requireRecord(ticket);
    if (record.state !== "created") {
      throw new PersonalCredentialTransportError(
        isTerminal(record.state)
          ? "personal_credential_transport_replay_forbidden"
          : "personal_credential_transport_duplicate",
      );
    }
    record.state = "port_bound";
  }

  public acceptMutationEnvelope(
    ticketInput: PersonalCredentialTransportTicket,
    actualIdentity: MainDerivedPersonalCredentialTransportIdentity,
    input: unknown,
  ): PersonalCredentialTransportBinaryEnvelope {
    try {
      this.#assertAvailable();
      this.#prune();
      const ticket = this.#verifyTicket(ticketInput);
      this.#assertIdentity(ticket, actualIdentity);
      const record = this.#requireRecord(ticket);
      if (ticket.operationType !== "create" && ticket.operationType !== "update") {
        throw new PersonalCredentialTransportError(
          "personal_credential_transport_identity_mismatch",
        );
      }
      if (record.state !== "port_bound" && record.state !== "ready") {
        throw new PersonalCredentialTransportError(
          isTerminal(record.state)
            ? "personal_credential_transport_replay_forbidden"
            : "personal_credential_transport_duplicate",
        );
      }
      const envelope = parsePersonalCredentialTransportBinaryEnvelope(input);
      if (envelope.header.commandId !== ticket.commandId
        || envelope.header.correlationId !== ticket.correlationId
        || envelope.header.transportProfileRevision !== ticket.transportProfileRevision
        || envelope.header.frameType !== "mutation_secret") {
        throw new PersonalCredentialTransportError(
          "personal_credential_transport_identity_mismatch",
        );
      }
      const expectedDigest = frameDigest(envelope.header);
      if (!safeDigestEqual(envelope.header.frameDigest, expectedDigest)) {
        throw new PersonalCredentialTransportError(
          "personal_credential_transport_invalid_frame",
        );
      }
      record.state = "frame_received";
      return envelope;
    } catch (error) {
      scrubUnknownBody(input);
      if (error instanceof PersonalCredentialTransportError) throw error;
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_frame",
      );
    }
  }

  public createRevealEnvelope(
    ticketInput: PersonalCredentialTransportTicket,
    actualIdentity: MainDerivedPersonalCredentialTransportIdentity,
    body: Uint8Array,
  ): PersonalCredentialTransportBinaryEnvelope {
    try {
      this.#assertAvailable();
      this.#prune();
      const ticket = this.#verifyTicket(ticketInput);
      this.#assertIdentity(ticket, actualIdentity);
      const record = this.#requireRecord(ticket);
      if (ticket.operationType !== "reveal") {
        throw new PersonalCredentialTransportError(
          "personal_credential_transport_identity_mismatch",
        );
      }
      if (record.state !== "port_bound" && record.state !== "ready") {
        throw new PersonalCredentialTransportError(
          isTerminal(record.state)
            ? "personal_credential_transport_replay_forbidden"
            : "personal_credential_transport_duplicate",
        );
      }
      const material = {
        protocolVersion: "personal-credential-transport.v1",
        transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
        commandId: ticket.commandId,
        correlationId: ticket.correlationId,
        frameType: "reveal_secret",
        bodyLength: body.byteLength,
      } as const;
      const header = {
        ...material,
        frameDigest: `sha256:${createHash("sha256")
          .update(canonicalPersonalCredentialTransportFrameMaterial(material), "utf8")
          .digest("hex")}`,
      } satisfies PersonalCredentialTransportFrameHeader;
      const envelope = parsePersonalCredentialTransportBinaryEnvelope({ header, body });
      record.state = "frame_received";
      return envelope;
    } catch (error) {
      body.fill(0);
      if (error instanceof PersonalCredentialTransportError) throw error;
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_frame",
      );
    }
  }

  public complete(
    ticketInput: PersonalCredentialTransportTicket,
    terminal: "completed" | "rejected" | "cancelled" | "timed_out" | "uncertain",
  ): void {
    this.#assertAvailable();
    const ticket = this.#verifyTicket(ticketInput, true);
    const record = this.#requireRecord(ticket);
    if (isTerminal(record.state)) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_replay_forbidden",
      );
    }
    if (terminal === "completed" && record.state !== "frame_received") {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_frame",
      );
    }
    this.#toTerminal(record, terminal);
  }

  public markReady(
    ticketInput: PersonalCredentialTransportTicket,
    actualIdentity: MainDerivedPersonalCredentialTransportIdentity,
  ): void {
    this.#assertAvailable();
    this.#prune();
    const ticket = this.#verifyTicket(ticketInput);
    this.#assertIdentity(ticket, actualIdentity);
    const record = this.#requireRecord(ticket);
    if (record.state !== "port_bound") {
      throw new PersonalCredentialTransportError(
        isTerminal(record.state)
          ? "personal_credential_transport_replay_forbidden"
          : "personal_credential_transport_duplicate",
      );
    }
    record.state = "ready";
  }

  public createFrameAuthorization(
    ticketInput: PersonalCredentialTransportTicket,
    actualIdentity: MainDerivedPersonalCredentialTransportIdentity,
    input: Readonly<{
      direction: PersonalCredentialTransportDirection;
      frameType: "mutation_secret" | "reveal_secret";
      bodyLength: number;
      expiresAt: string;
      revealCompletedAck?: PersonalCredentialTransportControlMessage;
      revealUncertainAck?: PersonalCredentialTransportControlMessage;
    }>,
  ): PersonalCredentialTransportFrameAuthorization {
    this.#assertAvailable();
    this.#prune();
    const ticket = this.#verifyTicket(ticketInput);
    this.#assertIdentity(ticket, actualIdentity);
    const record = this.#requireRecord(ticket);
    if (record.state !== "ready") {
      throw new PersonalCredentialTransportError(
        isTerminal(record.state)
          ? "personal_credential_transport_replay_forbidden"
          : "personal_credential_transport_duplicate",
      );
    }
    const frameMaterial = {
      protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
      transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
      commandId: ticket.commandId,
      correlationId: ticket.correlationId,
      frameType: input.frameType,
      bodyLength: input.bodyLength,
    } as const;
    const header = PersonalCredentialTransportFrameHeaderSchema.parse({
      ...frameMaterial,
      frameDigest: `sha256:${createHash("sha256")
        .update(canonicalPersonalCredentialTransportFrameMaterial(frameMaterial), "utf8")
        .digest("hex")}`,
    });
    const completedDigest = input.revealCompletedAck?.controlDigest;
    const uncertainDigest = input.revealUncertainAck?.controlDigest;
    const material = PersonalCredentialTransportFrameAuthorizationMaterialSchema.parse({
      schemaVersion: "personal-credential-transport-frame-authorization.v1",
      authorizationId: randomUUID(),
      protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
      transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
      commandId: ticket.commandId,
      correlationId: ticket.correlationId,
      direction: input.direction,
      frameType: input.frameType,
      bodyLength: input.bodyLength,
      frameDigest: header.frameDigest,
      ticketDigest: ticket.ticketDigest,
      runtimeInstanceId: ticket.runtimeInstanceId,
      clientInstanceId: ticket.clientInstanceId,
      webContentsId: ticket.webContentsId,
      mainFrameRoutingId: ticket.mainFrameRoutingId,
      navigationEpoch: ticket.navigationEpoch,
      expiresAt: input.expiresAt,
      ...(completedDigest === undefined
        ? {}
        : { revealCompletedAckDigest: completedDigest }),
      ...(uncertainDigest === undefined
        ? {}
        : { revealUncertainAckDigest: uncertainDigest }),
    });
    return PersonalCredentialTransportFrameAuthorizationSchema.parse({
      ...material,
      frameHeader: header,
      authorizationDigest: this.#frameAuthorizationDigest(material),
      ...(input.revealCompletedAck === undefined
        ? {}
        : { revealCompletedAck: input.revealCompletedAck }),
      ...(input.revealUncertainAck === undefined
        ? {}
        : { revealUncertainAck: input.revealUncertainAck }),
    });
  }

  public verifyFrameAuthorization(
    ticketInput: PersonalCredentialTransportTicket,
    actualIdentity: MainDerivedPersonalCredentialTransportIdentity,
    input: PersonalCredentialTransportFrameAuthorization,
  ): PersonalCredentialTransportFrameAuthorization {
    this.#assertAvailable();
    const ticket = this.#verifyTicket(ticketInput);
    this.#assertIdentity(ticket, actualIdentity);
    let authorization: PersonalCredentialTransportFrameAuthorization;
    try {
      authorization = PersonalCredentialTransportFrameAuthorizationSchema.parse(input);
    } catch {
      throw new PersonalCredentialTransportError(
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
      || Date.parse(authorization.expiresAt) <= this.#now()
      || !safeDigestEqual(
        authorization.authorizationDigest,
        this.#frameAuthorizationDigest(
          personalCredentialTransportFrameAuthorizationMaterial(authorization),
        ),
      )) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_frame",
      );
    }
    return authorization;
  }

  public invalidateNavigation(webContentsId: number, nextNavigationEpoch: number): number {
    let count = 0;
    for (const record of this.#records.values()) {
      if (!isTerminal(record.state)
        && record.ticket.webContentsId === webContentsId
        && record.ticket.navigationEpoch !== nextNavigationEpoch) {
        this.#toTerminal(record, "navigation_invalidated");
        count += 1;
      }
    }
    return count;
  }

  public snapshot(): Readonly<{
    foundationEnabled: boolean;
    productionFeatureEnabled: false;
    transportBlockerClosed: false;
    activeCount: number;
    registryCount: number;
    tombstoneCount: number;
    modelGateCount: number;
    closed: boolean;
  }> {
    this.#prune();
    return Object.freeze({
      foundationEnabled: this.#foundationEnabled,
      productionFeatureEnabled: false,
      transportBlockerClosed: false,
      activeCount: this.#activeCount(),
      registryCount: this.#records.size,
      tombstoneCount: [...this.#records.values()].filter((item) => isTerminal(item.state)).length,
      modelGateCount: this.#modelGates.size,
      closed: this.#closed,
    });
  }

  public close(): void {
    if (this.#closed) return;
    for (const record of this.#records.values()) {
      if (!isTerminal(record.state)) record.state = "process_lost";
    }
    this.#records.clear();
    this.#modelGates.clear();
    this.#revealAdmissions.splice(0);
    this.#ticketKey.fill(0);
    this.#frameAuthorizationKey.fill(0);
    this.#closed = true;
  }

  #assertAvailable(): void {
    if (!this.#foundationEnabled || this.#closed) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_unavailable",
      );
    }
  }

  #verifyTicket(
    input: PersonalCredentialTransportTicket,
    allowExpired = false,
  ): PersonalCredentialTransportTicket {
    let ticket: PersonalCredentialTransportTicket;
    try {
      ticket = PersonalCredentialTransportTicketSchema.parse(input);
    } catch {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_ticket",
      );
    }
    if (ticket.transportProfileRevision !== PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_profile_mismatch",
      );
    }
    if (!safeDigestEqual(
      ticket.ticketDigest,
      this.#ticketDigest(personalCredentialTransportTicketMaterial(ticket)),
    )) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_ticket",
      );
    }
    if (!allowExpired && Date.parse(ticket.expiresAt) <= this.#now()) {
      throw new PersonalCredentialTransportError("personal_credential_transport_expired");
    }
    return ticket;
  }

  #assertIdentity(
    ticket: PersonalCredentialTransportTicket,
    actual: MainDerivedPersonalCredentialTransportIdentity,
  ): void {
    if (ticket.runtimeInstanceId !== actual.runtimeInstanceId
      || ticket.clientInstanceId !== actual.clientInstanceId
      || ticket.commandId !== actual.commandId
      || ticket.correlationId !== actual.correlationId
      || ticket.requestDigest !== actual.requestDigest
      || ticket.webContentsId !== actual.webContentsId
      || ticket.mainFrameRoutingId !== actual.mainFrameRoutingId
      || ticket.navigationEpoch !== actual.navigationEpoch) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_identity_mismatch",
      );
    }
  }

  #requireRecord(ticket: PersonalCredentialTransportTicket): RegistryRecord {
    const record = this.#records.get(this.#recordKey(ticket));
    if (record === undefined || record.ticket.ticketDigest !== ticket.ticketDigest) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_ticket",
      );
    }
    return record;
  }

  #ticketDigest(material: PersonalCredentialTransportTicketMaterial): string {
    return `sha256:${createHmac("sha256", this.#ticketKey)
      .update(TICKET_HMAC_DOMAIN, "utf8")
      .update(canonicalPersonalCredentialTransportTicketMaterial(material), "utf8")
      .digest("hex")}`;
  }

  #frameAuthorizationDigest(
    material: PersonalCredentialTransportFrameAuthorizationMaterial,
  ): string {
    return `sha256:${createHmac("sha256", this.#frameAuthorizationKey)
      .update(FRAME_AUTHORIZATION_HMAC_DOMAIN, "utf8")
      .update(
        canonicalPersonalCredentialTransportFrameAuthorizationMaterial(material),
        "utf8",
      )
      .digest("hex")}`;
  }

  #recordKey(ticket: PersonalCredentialTransportTicket): string {
    return `${ticket.commandId}:${ticket.correlationId}`;
  }

  #findByCommandId(commandId: string): RegistryRecord | undefined {
    return [...this.#records.values()].find((record) => record.ticket.commandId === commandId);
  }

  #activeCount(): number {
    return [...this.#records.values()].filter((record) => !isTerminal(record.state)).length;
  }

  #toTerminal(record: RegistryRecord, state: TerminalState): void {
    record.state = state;
    record.terminalExpiresAt = this.#now() + PERSONAL_CREDENTIAL_TRANSPORT_TOMBSTONE_TTL_MS;
    this.#modelGates.delete(record.modelGateKey);
  }

  #prune(): void {
    const now = this.#now();
    for (const [key, record] of this.#records) {
      if (!isTerminal(record.state) && Date.parse(record.ticket.expiresAt) <= now) {
        this.#toTerminal(record, "timed_out");
      }
      if (isTerminal(record.state)
        && record.terminalExpiresAt !== undefined
        && record.terminalExpiresAt <= now) {
        this.#records.delete(key);
      }
    }
    while (this.#revealAdmissions.length > 0
      && this.#revealAdmissions[0]! <= now - REVEAL_RATE_WINDOW_MS) {
      this.#revealAdmissions.shift();
    }
  }

  #admitReveal(): void {
    this.#prune();
    if (this.#revealAdmissions.length >= REVEAL_RATE_LIMIT) {
      throw new PersonalCredentialTransportError("personal_credential_transport_busy");
    }
    this.#revealAdmissions.push(this.#now());
  }
}

function frameDigest(header: PersonalCredentialTransportFrameHeader): string {
  return `sha256:${createHash("sha256")
    .update(canonicalPersonalCredentialTransportFrameMaterial(
      personalCredentialTransportFrameHeaderMaterial(header),
    ), "utf8")
    .digest("hex")}`;
}

function safeDigestEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength
    && timingSafeEqual(leftBytes, rightBytes);
}

function isTerminal(state: ActiveState | TerminalState): state is TerminalState {
  return state !== "created"
    && state !== "port_bound"
    && state !== "ready"
    && state !== "frame_received";
}

function scrubUnknownBody(input: unknown): void {
  if (typeof input !== "object" || input === null) return;
  const body = Reflect.get(input, "body");
  if (body instanceof Uint8Array) body.fill(0);
}
