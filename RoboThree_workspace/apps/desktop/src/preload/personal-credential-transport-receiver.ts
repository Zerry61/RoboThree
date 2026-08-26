import {
  PERSONAL_CREDENTIAL_TRANSPORT_MAX_REGISTRY,
  PERSONAL_CREDENTIAL_TRANSPORT_PORT_CHANNEL,
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
  PERSONAL_CREDENTIAL_TRANSPORT_TOMBSTONE_TTL_MS,
  PersonalCredentialTransportControlMessageSchema,
  PersonalCredentialTransportFrameAuthorizationRequestSchema,
  PersonalCredentialTransportFrameAuthorizationSchema,
  PersonalCredentialTransportPortOfferSchema,
  type PersonalCredentialTransportControlMessage,
  type PersonalCredentialTransportFrameAuthorization,
  type PersonalCredentialTransportPortOffer,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";

import {
  PersonalCredentialTransportPreloadAdapter,
  PersonalCredentialTransportPreloadError,
} from "./personal-credential-transport.js";

export type PersonalCredentialTransportDomPort = {
  postMessage(message: unknown): void;
  close(): void;
  start(): void;
  onmessage: ((event: Readonly<{
    data: unknown;
    ports?: ReadonlyArray<PersonalCredentialTransportDomPort>;
  }>) => void) | null;
  onclose: (() => void) | null;
};

export type PersonalCredentialTransportPortOfferEvent = Readonly<{
  ports: ReadonlyArray<unknown>;
}>;

export type PersonalCredentialTransportPortSubscription = (
  channel: typeof PERSONAL_CREDENTIAL_TRANSPORT_PORT_CHANNEL,
  listener: (
    event: PersonalCredentialTransportPortOfferEvent,
    input: unknown,
  ) => void,
) => () => void;

export type PersonalCredentialTransportProcessDiagnostics = Readonly<{
  onPhase(input: Readonly<{
    phase: "mutation_frame_posted" | "receiver_message_rejected";
    typedErrorCode: string;
  }>): void;
}>;

type ReceiverState =
  | "ready"
  | "mutation_authorization_requested"
  | "mutation_frame_sent"
  | "reveal_authorization_received"
  | "cancelling";

type ReceiverSession = {
  readonly offer: PersonalCredentialTransportPortOffer;
  readonly port: PersonalCredentialTransportDomPort;
  readonly deadline: ReturnType<typeof setTimeout>;
  state: ReceiverState;
  mutationSecret: Uint8Array | undefined;
  mutationResolve:
    | ((control: PersonalCredentialTransportControlMessage) => void)
    | undefined;
  mutationReject: ((error: PersonalCredentialTransportPreloadError) => void) | undefined;
  revealAuthorization: PersonalCredentialTransportFrameAuthorization | undefined;
};

export class PersonalCredentialTransportPreloadReceiver {
  readonly #foundationEnabled: boolean;
  readonly #subscribe: PersonalCredentialTransportPortSubscription;
  readonly #now: () => number;
  readonly #adapter: PersonalCredentialTransportPreloadAdapter;
  readonly #revealConsumer:
    | ((secret: Uint8Array) => void | Promise<void>)
    | undefined;
  readonly #processDiagnostics: PersonalCredentialTransportProcessDiagnostics | undefined;
  readonly #sessions = new Map<string, ReceiverSession>();
  readonly #tombstones = new Map<string, number>();
  #unsubscribe: (() => void) | undefined;
  #closed = false;

  public constructor(input: Readonly<{
    foundationEnabled?: boolean;
    subscribe: PersonalCredentialTransportPortSubscription;
    now?: () => number;
    adapter?: PersonalCredentialTransportPreloadAdapter;
    revealConsumer?: (secret: Uint8Array) => void | Promise<void>;
    processDiagnostics?: PersonalCredentialTransportProcessDiagnostics;
  }>) {
    this.#foundationEnabled = input.foundationEnabled === true;
    this.#subscribe = input.subscribe;
    this.#now = input.now ?? Date.now;
    this.#adapter = input.adapter ?? new PersonalCredentialTransportPreloadAdapter({
      foundationEnabled: this.#foundationEnabled,
      now: this.#now,
    });
    this.#revealConsumer = input.revealConsumer;
    this.#processDiagnostics = input.processDiagnostics;
  }

  public start(): void {
    if (this.#closed) throw unavailable();
    if (this.#unsubscribe !== undefined) throw duplicate();
    this.#unsubscribe = this.#subscribe(
      PERSONAL_CREDENTIAL_TRANSPORT_PORT_CHANNEL,
      (event, input) => {
        void this.#acceptOffer(event, input);
      },
    );
  }

  /** Internal-only mutation seam. It is never exposed through contextBridge. */
  public async submitMutationSecret(
    commandId: string,
    secret: Uint8Array,
  ): Promise<PersonalCredentialTransportControlMessage> {
    this.#assertEnabled();
    const session = this.#sessions.get(commandId);
    if (session === undefined
      || session.state !== "ready"
      || (session.offer.ticket.operationType !== "create"
        && session.offer.ticket.operationType !== "update")) {
      secret.fill(0);
      throw duplicate();
    }
    const working = Uint8Array.from(secret);
    secret.fill(0);
    session.mutationSecret = working;
    session.state = "mutation_authorization_requested";
    const result = new Promise<PersonalCredentialTransportControlMessage>((resolve, reject) => {
      session.mutationResolve = resolve;
      session.mutationReject = reject;
    });
    try {
      session.port.postMessage(
        PersonalCredentialTransportFrameAuthorizationRequestSchema.parse({
          schemaVersion:
            "personal-credential-transport-frame-authorization-request.v1",
          protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
          transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
          commandId: session.offer.ticket.commandId,
          correlationId: session.offer.ticket.correlationId,
          direction: "mutation_to_main",
          frameType: "mutation_secret",
          bodyLength: working.byteLength,
        }),
      );
    } catch (error) {
      working.fill(0);
      this.#closeSession(session, true);
      throw error;
    }
    return result;
  }

  /** Internal-only lifecycle seam. It is not exposed through contextBridge. */
  public async cancel(commandId: string): Promise<void> {
    this.#assertEnabled();
    const session = this.#sessions.get(commandId);
    if (session === undefined || session.state === "cancelling") throw duplicate();
    session.state = "cancelling";
    try {
      session.port.postMessage(session.offer.cancelControl);
    } catch (error) {
      this.#closeSession(session, true);
      throw error;
    }
  }

  public snapshot(): Readonly<{
    foundationEnabled: boolean;
    preloadWiringInstalled: boolean;
    productionFeatureEnabled: false;
    productionSensitiveTransportReady: false;
    transportBlockerClosed: false;
    brokerDirectionalClosureImplemented: true;
    sessionCount: number;
    messagePortCount: number;
    timerCount: number;
    tombstoneCount: number;
    mutationSecretCount: number;
    revealAuthorizationCount: number;
    closed: boolean;
  }> {
    this.#prune();
    return Object.freeze({
      foundationEnabled: this.#foundationEnabled,
      preloadWiringInstalled: this.#unsubscribe !== undefined,
      productionFeatureEnabled: false,
      productionSensitiveTransportReady: false,
      transportBlockerClosed: false,
      brokerDirectionalClosureImplemented: true,
      sessionCount: this.#sessions.size,
      messagePortCount: this.#sessions.size,
      timerCount: this.#sessions.size,
      tombstoneCount: this.#tombstones.size,
      mutationSecretCount: [...this.#sessions.values()]
        .filter((item) => item.mutationSecret !== undefined).length,
      revealAuthorizationCount: [...this.#sessions.values()]
        .filter((item) => item.revealAuthorization !== undefined).length,
      closed: this.#closed,
    });
  }

  public close(): void {
    if (this.#closed) return;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    for (const session of [...this.#sessions.values()]) {
      this.#closeSession(session, false);
    }
    this.#tombstones.clear();
    this.#adapter.close();
    this.#closed = true;
  }

  async #acceptOffer(
    event: PersonalCredentialTransportPortOfferEvent,
    input: unknown,
  ): Promise<void> {
    const ports = event.ports.map(asPort).filter(
      (value): value is PersonalCredentialTransportDomPort => value !== undefined,
    );
    if (!this.#foundationEnabled || this.#closed || event.ports.length !== 1
      || ports.length !== 1) {
      closeUnknownPorts(event.ports);
      return;
    }
    const port = ports[0]!;
    let acceptedSession: ReceiverSession | undefined;
    try {
      this.#prune();
      const offer = PersonalCredentialTransportPortOfferSchema.parse(input);
      const commandId = offer.ticket.commandId;
      if (Date.parse(offer.ticket.expiresAt) <= this.#now()) {
        throw new PersonalCredentialTransportPreloadError(
          "personal_credential_transport_expired",
        );
      }
      if (this.#sessions.has(commandId) || this.#tombstones.has(commandId)) {
        throw new PersonalCredentialTransportPreloadError(
          "personal_credential_transport_replay_forbidden",
        );
      }
      if (this.#sessions.size + this.#tombstones.size
        >= PERSONAL_CREDENTIAL_TRANSPORT_MAX_REGISTRY) {
        throw new PersonalCredentialTransportPreloadError(
          "personal_credential_transport_busy",
        );
      }
      const timeoutMs = Math.max(0, Date.parse(offer.ticket.expiresAt) - this.#now());
      const deadline = setTimeout(() => {
        const current = this.#sessions.get(commandId);
        if (current !== undefined) this.#closeSession(current, true);
      }, timeoutMs);
      const session: ReceiverSession = {
        offer,
        port,
        deadline,
        state: "ready",
        mutationSecret: undefined,
        mutationResolve: undefined,
        mutationReject: undefined,
        revealAuthorization: undefined,
      };
      acceptedSession = session;
      this.#sessions.set(commandId, session);
      port.onmessage = (messageEvent) => {
        void this.#handleMessage(session, messageEvent);
      };
      port.onclose = () => this.#closeSession(session, true);
      port.start();
      port.postMessage(offer.readyControl);
    } catch {
      if (acceptedSession === undefined) {
        port.onmessage = null;
        port.onclose = null;
        port.close();
      } else {
        this.#closeSession(acceptedSession, true);
      }
    }
  }

  async #handleMessage(
    session: ReceiverSession,
    event: Readonly<{
      data: unknown;
      ports?: ReadonlyArray<PersonalCredentialTransportDomPort>;
    }>,
  ): Promise<void> {
    const nestedPorts = event.ports ?? [];
    if (nestedPorts.length > 0) {
      for (const nested of nestedPorts) nested.close();
      scrubUnknownBody(event.data);
      this.#closeSession(session, true);
      return;
    }
    try {
      const control = PersonalCredentialTransportControlMessageSchema.safeParse(event.data);
      if (control.success) {
        this.#handleControl(session, control.data);
        return;
      }
      const authorization = PersonalCredentialTransportFrameAuthorizationSchema.safeParse(
        event.data,
      );
      if (authorization.success) {
        await this.#handleAuthorization(session, authorization.data);
        return;
      }
      if (session.state === "reveal_authorization_received"
        && session.revealAuthorization !== undefined) {
        await this.#handleRevealEnvelope(session, event.data);
        return;
      }
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_invalid_frame",
      );
    } catch (error) {
      this.#processDiagnostics?.onPhase({
        phase: "receiver_message_rejected",
        typedErrorCode: safeDiagnosticCode(error),
      });
      scrubUnknownBody(event.data);
      this.#closeSession(session, true);
    }
  }

  #handleControl(
    session: ReceiverSession,
    control: PersonalCredentialTransportControlMessage,
  ): void {
    if (control.commandId !== session.offer.ticket.commandId
      || control.correlationId !== session.offer.ticket.correlationId
      || control.controlType !== "terminal_ack") {
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_identity_mismatch",
      );
    }
    const mutation = session.offer.ticket.operationType === "create"
      || session.offer.ticket.operationType === "update";
    if ((mutation && session.state !== "mutation_frame_sent")
      || (!mutation && session.state !== "ready")) {
      throw duplicate();
    }
    session.mutationResolve?.(control);
    session.mutationResolve = undefined;
    session.mutationReject = undefined;
    this.#closeSession(session, true);
  }

  async #handleAuthorization(
    session: ReceiverSession,
    authorization: PersonalCredentialTransportFrameAuthorization,
  ): Promise<void> {
    const ticket = session.offer.ticket;
    if (authorization.commandId !== ticket.commandId
      || authorization.correlationId !== ticket.correlationId) {
      throw new PersonalCredentialTransportPreloadError(
        "personal_credential_transport_identity_mismatch",
      );
    }
    if (authorization.direction === "mutation_to_main") {
      const secret = session.mutationSecret;
      if (session.state !== "mutation_authorization_requested" || secret === undefined) {
        throw duplicate();
      }
      session.mutationSecret = undefined;
      await this.#adapter.sendAuthorizedMutation(
        ticket,
        authorization,
        secret,
        session.port,
      );
      this.#processDiagnostics?.onPhase({
        phase: "mutation_frame_posted",
        typedErrorCode: "none",
      });
      session.state = "mutation_frame_sent";
      return;
    }
    if (ticket.operationType !== "reveal" || session.state !== "ready") {
      throw duplicate();
    }
    session.revealAuthorization = authorization;
    session.state = "reveal_authorization_received";
  }

  async #handleRevealEnvelope(session: ReceiverSession, input: unknown): Promise<void> {
    const authorization = session.revealAuthorization;
    if (authorization === undefined) throw duplicate();
    let completed = false;
    try {
      if (this.#revealConsumer === undefined) {
        throw new PersonalCredentialTransportPreloadError(
          "personal_credential_transport_unavailable",
        );
      }
      await this.#adapter.consumeAuthorizedReveal(
        session.offer.ticket,
        authorization,
        input,
        this.#revealConsumer,
      );
      completed = true;
    } finally {
      const acknowledgement = completed
        ? authorization.revealCompletedAck
        : authorization.revealUncertainAck;
      if (acknowledgement !== undefined) session.port.postMessage(acknowledgement);
      this.#closeSession(session, true);
    }
  }

  #closeSession(session: ReceiverSession, tombstone: boolean): void {
    if (!this.#sessions.delete(session.offer.ticket.commandId)) return;
    clearTimeout(session.deadline);
    session.mutationSecret?.fill(0);
    session.mutationSecret = undefined;
    session.revealAuthorization = undefined;
    session.mutationReject?.(new PersonalCredentialTransportPreloadError(
      "personal_credential_transport_uncertain",
    ));
    session.mutationResolve = undefined;
    session.mutationReject = undefined;
    session.port.onmessage = null;
    session.port.onclose = null;
    session.port.close();
    if (tombstone) {
      this.#tombstones.set(
        session.offer.ticket.commandId,
        this.#now() + PERSONAL_CREDENTIAL_TRANSPORT_TOMBSTONE_TTL_MS,
      );
    }
  }

  #prune(): void {
    const now = this.#now();
    for (const [commandId, expiresAt] of this.#tombstones) {
      if (expiresAt <= now) this.#tombstones.delete(commandId);
    }
  }

  #assertEnabled(): void {
    if (!this.#foundationEnabled || this.#closed) throw unavailable();
  }
}

function asPort(value: unknown): PersonalCredentialTransportDomPort | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const item = value as Partial<PersonalCredentialTransportDomPort>;
  return typeof item.postMessage === "function"
    && typeof item.close === "function"
    && typeof item.start === "function"
    ? item as PersonalCredentialTransportDomPort
    : undefined;
}

function closeUnknownPorts(values: ReadonlyArray<unknown>): void {
  for (const value of values) asPort(value)?.close();
}

function scrubUnknownBody(input: unknown): void {
  if (typeof input !== "object" || input === null) return;
  const body = Reflect.get(input, "body");
  if (body instanceof Uint8Array) body.fill(0);
}

function unavailable(): PersonalCredentialTransportPreloadError {
  return new PersonalCredentialTransportPreloadError(
    "personal_credential_transport_unavailable",
  );
}

function duplicate(): PersonalCredentialTransportPreloadError {
  return new PersonalCredentialTransportPreloadError(
    "personal_credential_transport_duplicate",
  );
}

function safeDiagnosticCode(error: unknown): string {
  if (error instanceof PersonalCredentialTransportPreloadError) return error.code;
  return "personal_credential_transport_invalid_frame";
}
