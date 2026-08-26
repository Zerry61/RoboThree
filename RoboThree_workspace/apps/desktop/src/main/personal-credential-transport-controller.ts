import { createHash, timingSafeEqual } from "node:crypto";
import type {
  IpcMainEvent,
  IpcMainInvokeEvent,
  MessageChannelMain,
  MessagePortMain,
  WebContents,
} from "electron";

import {
  PERSONAL_CREDENTIAL_TRANSPORT_PORT_CHANNEL,
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
  PersonalCredentialTransportControlMessageSchema,
  PersonalCredentialTransportControlMaterialSchema,
  PersonalCredentialTransportFrameAuthorizationRequestSchema,
  PersonalCredentialTransportPortOfferSchema,
  PersonalCredentialTransportPreparedCommandSchema,
  canonicalPersonalCredentialTransportControlMaterial,
  personalCredentialTransportControlMaterial,
  type PersonalCredentialTransportBinaryEnvelope,
  type PersonalCredentialTransportControlMaterial,
  type PersonalCredentialTransportControlMessage,
  type PersonalCredentialTransportErrorCode,
  type PersonalCredentialTransportFrameAuthorization,
  type PersonalCredentialTransportPreparedCommand,
  type PersonalCredentialTransportTerminal,
  type PersonalCredentialTransportTicket,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";

import {
  type PersonalCredentialBrokerClient,
  type PersonalCredentialBrokerCommand,
  type PersonalCredentialBrokerResult,
} from "./personal-credential-broker-client.js";
import {
  PersonalCredentialRevealDelivery,
  type PersonalCredentialRevealConsumer,
} from "./personal-credential-reveal-delivery.js";
import {
  PersonalCredentialTransportError,
  PersonalCredentialTransportMainAdapter,
  type MainDerivedPersonalCredentialTransportIdentity,
} from "./personal-credential-transport.js";

type CreateMessageChannel = () => MessageChannelMain;
type MainIpcEvent = IpcMainEvent | IpcMainInvokeEvent;
type SessionState =
  | "port_bound"
  | "ready"
  | "mutation_authorization_issued"
  | "mutation_frame_received"
  | "broker_dispatched"
  | "reveal_authorization_issued"
  | "reveal_frame_sent"
  | "reveal_acknowledged";

export type PersonalCredentialBrokerLease = Readonly<{
  runtimeInstanceId: string;
  channelInstanceId: string;
  clientInstanceId: string;
  client: PersonalCredentialBrokerClient;
}>;

export interface PersonalCredentialBrokerLeaseProvider {
  current(): PersonalCredentialBrokerLease;
}

type Session = {
  readonly preparedCommand: PersonalCredentialTransportPreparedCommand;
  readonly ticket: PersonalCredentialTransportTicket;
  readonly identity: MainDerivedPersonalCredentialTransportIdentity;
  readonly port: MessagePortMain;
  readonly deadline: ReturnType<typeof setTimeout>;
  readonly onMessage: (event: Electron.MessageEvent) => void;
  readonly onClose: () => void;
  state: SessionState;
  authorization: PersonalCredentialTransportFrameAuthorization | undefined;
  authorizationConsumed: boolean;
  brokerLease: PersonalCredentialBrokerLease | undefined;
  dispatchOrdinal: number;
  abortController: AbortController | undefined;
  revealAckResolve: (() => void) | undefined;
  revealAckReject: (() => void) | undefined;
};

type WindowRegistration = {
  epoch: number;
  readonly webContents: WebContents;
  readonly removeListeners: ReadonlyArray<() => void>;
};

export class PersonalCredentialTransportProductionController {
  readonly #adapter: PersonalCredentialTransportMainAdapter;
  readonly #createMessageChannel: CreateMessageChannel;
  readonly #foundationEnabled: boolean;
  readonly #brokerLeaseProvider: PersonalCredentialBrokerLeaseProvider | undefined;
  readonly #now: () => number;
  readonly #sessions = new Map<string, Session>();
  readonly #windows = new Map<number, WindowRegistration>();
  #lateCallbackCount = 0;
  #closed = false;

  public constructor(input: Readonly<{
    foundationEnabled?: boolean;
    adapter?: PersonalCredentialTransportMainAdapter;
    createMessageChannel: CreateMessageChannel;
    brokerLeaseProvider?: PersonalCredentialBrokerLeaseProvider;
    now?: () => number;
  }>) {
    this.#foundationEnabled = input.foundationEnabled === true;
    this.#now = input.now ?? Date.now;
    this.#adapter = input.adapter ?? new PersonalCredentialTransportMainAdapter({
      foundationEnabled: this.#foundationEnabled,
      now: this.#now,
    });
    this.#createMessageChannel = input.createMessageChannel;
    this.#brokerLeaseProvider = input.brokerLeaseProvider;
  }

  public attachWebContents(webContents: WebContents): () => void {
    if (this.#closed) throw unavailable();
    if (this.#windows.has(webContents.id)) throw duplicate();
    const advance = (): void => this.#advanceNavigation(webContents.id);
    const inPage = (
      _event: Electron.Event,
      _url: string,
      isMainFrame: boolean,
    ): void => {
      if (isMainFrame) advance();
    };
    const processGone = (): void => this.#advanceNavigation(webContents.id);
    const destroyed = (): void => this.#removeWebContents(webContents.id);
    webContents.on("will-navigate", advance);
    webContents.on("did-navigate", advance);
    webContents.on("did-navigate-in-page", inPage);
    webContents.on("render-process-gone", processGone);
    webContents.on("destroyed", destroyed);
    const removeListeners = [
      () => webContents.off("will-navigate", advance),
      () => webContents.off("did-navigate", advance),
      () => webContents.off("did-navigate-in-page", inPage),
      () => webContents.off("render-process-gone", processGone),
      () => webContents.off("destroyed", destroyed),
    ];
    this.#windows.set(webContents.id, { epoch: 1, webContents, removeListeners });
    return () => this.#removeWebContents(webContents.id);
  }

  /** Internal composition seam. No public IPC handler may call it in STRM-2.2. */
  public openPreparedCommand(
    commandInput: PersonalCredentialTransportPreparedCommand,
    event: MainIpcEvent,
  ): PersonalCredentialTransportTicket {
    this.#assertEnabled();
    const command = PersonalCredentialTransportPreparedCommandSchema.parse(commandInput);
    if (Date.parse(command.deadlineAt) <= this.#now()) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_timed_out",
      );
    }
    const senderFrame = event.senderFrame;
    const registration = this.#windows.get(event.sender.id);
    if (registration === undefined
      || registration.webContents !== event.sender
      || event.sender.isDestroyed()
      || senderFrame === null
      || senderFrame.isDestroyed()
      || senderFrame !== event.sender.mainFrame) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_identity_mismatch",
      );
    }
    const identity = Object.freeze({
      runtimeInstanceId: command.runtimeInstanceId,
      clientInstanceId: command.clientInstanceId,
      commandId: command.commandId,
      correlationId: command.correlationId,
      requestDigest: command.requestDigest,
      webContentsId: event.sender.id,
      mainFrameRoutingId: senderFrame.routingId,
      navigationEpoch: registration.epoch,
    }) satisfies MainDerivedPersonalCredentialTransportIdentity;
    const ticket = this.#adapter.createTicket({
      ...identity,
      operationType: command.operationType,
      personalModelId: command.personalModelId,
      expectedConfigurationRevision: command.expectedConfigurationRevision,
    });
    const channel = this.#createMessageChannel();
    try {
      this.#adapter.bindPort(ticket, identity);
      const session = this.#createSession(ticket, identity, channel.port2, command);
      this.#sessions.set(sessionKey(ticket), session);
      const offer = PersonalCredentialTransportPortOfferSchema.parse({
        protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
        transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
        ticket,
        readyControl: createControl({
          protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
          transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
          commandId: ticket.commandId,
          correlationId: ticket.correlationId,
          controlType: "ready",
        }),
        cancelControl: createControl({
          protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
          transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
          commandId: ticket.commandId,
          correlationId: ticket.correlationId,
          controlType: "cancel",
        }),
      });
      senderFrame.postMessage(
        PERSONAL_CREDENTIAL_TRANSPORT_PORT_CHANNEL,
        offer,
        [channel.port1],
      );
      return ticket;
    } catch (error) {
      channel.port1.close();
      channel.port2.close();
      this.#settle(
        ticket,
        "uncertain",
        "personal_credential_transport_uncertain",
        false,
      );
      throw error;
    }
  }

  public snapshot(): Readonly<{
    foundationEnabled: boolean;
    mainWiringInstalled: boolean;
    productionFeatureEnabled: false;
    productionSensitiveTransportReady: false;
    productionBusinessHandlerReady: false;
    transportBlockerClosed: false;
    brokerDirectionalClosureImplemented: true;
    windowCount: number;
    sessionCount: number;
    messagePortCount: number;
    navigationListenerCount: number;
    timerCount: number;
    frameAuthorizationCount: number;
    brokerLeaseCount: number;
    abortControllerCount: number;
    lateCallbackCount: number;
    closed: boolean;
  }> {
    return Object.freeze({
      foundationEnabled: this.#foundationEnabled,
      mainWiringInstalled: this.#windows.size > 0,
      productionFeatureEnabled: false,
      productionSensitiveTransportReady: false,
      productionBusinessHandlerReady: false,
      transportBlockerClosed: false,
      brokerDirectionalClosureImplemented: true,
      windowCount: this.#windows.size,
      sessionCount: this.#sessions.size,
      messagePortCount: this.#sessions.size,
      navigationListenerCount: [...this.#windows.values()]
        .reduce((total, item) => total + item.removeListeners.length, 0),
      timerCount: this.#sessions.size,
      frameAuthorizationCount: [...this.#sessions.values()]
        .filter((item) => item.authorization !== undefined).length,
      brokerLeaseCount: [...this.#sessions.values()]
        .filter((item) => item.brokerLease !== undefined).length,
      abortControllerCount: [...this.#sessions.values()]
        .filter((item) => item.abortController !== undefined).length,
      lateCallbackCount: this.#lateCallbackCount,
      closed: this.#closed,
    });
  }

  public close(): void {
    if (this.#closed) return;
    for (const id of [...this.#windows.keys()]) this.#removeWebContents(id);
    for (const session of [...this.#sessions.values()]) this.#closeSession(session);
    this.#adapter.close();
    this.#closed = true;
  }

  #createSession(
    ticket: PersonalCredentialTransportTicket,
    identity: MainDerivedPersonalCredentialTransportIdentity,
    port: MessagePortMain,
    preparedCommand: PersonalCredentialTransportPreparedCommand,
  ): Session {
    const timeoutAt = Math.min(
      Date.parse(ticket.expiresAt),
      Date.parse(preparedCommand.deadlineAt),
    );
    const timeoutMs = Math.max(0, timeoutAt - this.#now());
    const onMessage = (event: Electron.MessageEvent): void => {
      if (event.ports.length > 0) {
        for (const nested of event.ports) nested.close();
        scrubUnknownBody(event.data);
        this.#settle(
          ticket,
          "rejected",
          "personal_credential_transport_invalid_frame",
          true,
        );
        return;
      }
      void this.#handleMessage(ticket, event.data);
    };
    const onClose = (): void => {
      const current = this.#sessions.get(sessionKey(ticket));
      if (current?.state === "reveal_acknowledged") return;
      this.#settle(
        ticket,
        "uncertain",
        "personal_credential_transport_uncertain",
        false,
      );
    };
    const deadline = setTimeout(() => {
      this.#settle(
        ticket,
        "timed_out",
        "personal_credential_transport_timed_out",
        false,
      );
    }, timeoutMs);
    const session: Session = {
      preparedCommand,
      ticket,
      identity,
      port,
      deadline,
      onMessage,
      onClose,
      state: "port_bound",
      authorization: undefined,
      authorizationConsumed: false,
      brokerLease: undefined,
      dispatchOrdinal: 0,
      abortController: undefined,
      revealAckResolve: undefined,
      revealAckReject: undefined,
    };
    port.on("message", onMessage);
    port.once("close", onClose);
    port.start();
    return session;
  }

  async #handleMessage(ticket: PersonalCredentialTransportTicket, input: unknown): Promise<void> {
    const session = this.#sessions.get(sessionKey(ticket));
    if (session === undefined) {
      scrubUnknownBody(input);
      return;
    }
    try {
      const control = PersonalCredentialTransportControlMessageSchema.safeParse(input);
      if (control.success) {
        this.#handleControl(session, control.data);
        return;
      }
      const request = PersonalCredentialTransportFrameAuthorizationRequestSchema.safeParse(input);
      if (request.success) {
        this.#handleAuthorizationRequest(session, request.data);
        return;
      }
      if (session.state === "mutation_authorization_issued") {
        const authorization = session.authorization;
        if (authorization === undefined || session.authorizationConsumed) throw duplicate();
        this.#adapter.verifyFrameAuthorization(ticket, session.identity, authorization);
        if (!envelopeMatchesAuthorization(input, authorization)) {
          throw new PersonalCredentialTransportError(
            "personal_credential_transport_invalid_frame",
          );
        }
        session.authorizationConsumed = true;
        const envelope = this.#adapter.acceptMutationEnvelope(
          ticket,
          session.identity,
          input,
        );
        session.state = "mutation_frame_received";
        void this.#dispatchMutation(session, envelope);
        return;
      }
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_frame",
      );
    } catch (error) {
      scrubUnknownBody(input);
      const code = error instanceof PersonalCredentialTransportError
        ? error.code
        : "personal_credential_transport_invalid_frame";
      this.#settle(session.ticket, "rejected", code, true);
    }
  }

  #handleControl(
    session: Session,
    controlInput: PersonalCredentialTransportControlMessage,
  ): void {
    const control = parseControl(controlInput);
    if (control.commandId !== session.ticket.commandId
      || control.correlationId !== session.ticket.correlationId) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_identity_mismatch",
      );
    }
    if (control.controlType === "ready") {
      if (session.state !== "port_bound") throw duplicate();
      this.#adapter.markReady(session.ticket, session.identity);
      session.state = "ready";
      if (session.ticket.operationType === "reveal") void this.#dispatchReveal(session);
      return;
    }
    if (control.controlType === "cancel") {
      session.abortController?.abort();
      this.#settle(
        session.ticket,
        "cancelled",
        "personal_credential_transport_cancelled",
        true,
      );
      return;
    }
    if (session.ticket.operationType !== "reveal"
      || session.state !== "reveal_frame_sent"
      || session.authorization === undefined) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_frame",
      );
    }
    const expected = control.terminal === "completed"
      ? session.authorization.revealCompletedAck
      : session.authorization.revealUncertainAck;
    if (expected === undefined || expected.controlDigest !== control.controlDigest) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_invalid_frame",
      );
    }
    session.state = "reveal_acknowledged";
    const resolve = session.revealAckResolve;
    const reject = session.revealAckReject;
    session.revealAckResolve = undefined;
    session.revealAckReject = undefined;
    if (control.terminal === "completed") resolve?.();
    else reject?.();
  }

  #handleAuthorizationRequest(
    session: Session,
    request: ReturnType<typeof PersonalCredentialTransportFrameAuthorizationRequestSchema.parse>,
  ): void {
    if (session.state !== "ready"
      || (session.ticket.operationType !== "create"
        && session.ticket.operationType !== "update")
      || request.commandId !== session.ticket.commandId
      || request.correlationId !== session.ticket.correlationId
      || session.authorization !== undefined) {
      throw duplicate();
    }
    const authorization = this.#adapter.createFrameAuthorization(
      session.ticket,
      session.identity,
      {
        direction: "mutation_to_main",
        frameType: "mutation_secret",
        bodyLength: request.bodyLength,
        expiresAt: effectiveExpiry(session),
      },
    );
    session.authorization = authorization;
    session.state = "mutation_authorization_issued";
    session.port.postMessage(authorization);
  }

  async #dispatchMutation(
    session: Session,
    envelope: PersonalCredentialTransportBinaryEnvelope,
  ): Promise<void> {
    try {
      const lease = this.#bindBrokerLease(session);
      session.state = "broker_dispatched";
      session.dispatchOrdinal = 1;
      let resultPromise: Promise<PersonalCredentialBrokerResult>;
      try {
        resultPromise = lease.client.execute(
          brokerCommand(session.preparedCommand, envelope.body),
          session.abortController === undefined
            ? {}
            : { signal: session.abortController.signal },
        );
      } finally {
        // PersonalCredentialBrokerClient synchronously copies the request body
        // before returning its Promise. Do not retain the accepted MessagePort
        // application copy for the duration of the Keychain operation.
        envelope.body.fill(0);
      }
      const result = await resultPromise;
      if (!this.#isCurrentDispatch(session, lease, 1)) {
        result.secret?.fill(0);
        this.#lateCallbackCount += 1;
        return;
      }
      if (result.secret !== undefined) {
        result.secret.fill(0);
        this.#settle(
          session.ticket,
          "rejected",
          "personal_credential_transport_invalid_frame",
          true,
        );
        return;
      }
      const mapped = mapBrokerResult(result, true);
      this.#settle(session.ticket, mapped.terminal, mapped.code, true);
    } catch {
      if (this.#sessions.get(sessionKey(session.ticket)) === session) {
        this.#settle(
          session.ticket,
          "uncertain",
          "personal_credential_transport_uncertain",
          true,
        );
      }
    } finally {
      envelope.body.fill(0);
    }
  }

  async #dispatchReveal(session: Session): Promise<void> {
    try {
      const lease = this.#bindBrokerLease(session);
      session.state = "broker_dispatched";
      session.dispatchOrdinal = 1;
      const delivery = new PersonalCredentialRevealDelivery(lease.client);
      const response = await delivery.deliver(
        brokerCommand(session.preparedCommand) as PersonalCredentialBrokerCommand & {
          commandType: "reveal";
          expectedConfigurationRevision: string;
          expectedExecutionDefinitionDigest: string;
          secret?: never;
        },
        this.#revealPortConsumer(session),
        session.abortController === undefined
          ? {}
          : { signal: session.abortController.signal },
      );
      if (!this.#isCurrentDispatch(session, lease, 1)) {
        this.#lateCallbackCount += 1;
        return;
      }
      if (response.status === "completed" && !this.#hasRevealAcknowledgement(session)) {
        this.#settle(
          session.ticket,
          "rejected",
          "personal_credential_transport_invalid_frame",
          true,
        );
        return;
      }
      const revealAcknowledged = this.#hasRevealAcknowledgement(session);
      const mapped = mapBrokerHeader(response.status, response.typedErrorCode, true);
      this.#settle(session.ticket, mapped.terminal, mapped.code, !revealAcknowledged);
    } catch {
      if (this.#sessions.get(sessionKey(session.ticket)) === session) {
        this.#settle(
          session.ticket,
          "uncertain",
          "personal_credential_transport_uncertain",
          true,
        );
      }
    }
  }

  #revealPortConsumer(session: Session): PersonalCredentialRevealConsumer {
    return {
      consume: async (secret) => {
        if (this.#sessions.get(sessionKey(session.ticket)) !== session
          || session.state !== "broker_dispatched") {
          throw new Error("reveal_session_stale");
        }
        const completedAck = createControl({
          protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
          transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
          commandId: session.ticket.commandId,
          correlationId: session.ticket.correlationId,
          controlType: "terminal_ack",
          terminal: "completed",
        });
        const uncertainAck = createControl({
          protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
          transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
          commandId: session.ticket.commandId,
          correlationId: session.ticket.correlationId,
          controlType: "terminal_ack",
          terminal: "uncertain",
          typedErrorCode: "personal_credential_transport_uncertain",
        });
        const authorization = this.#adapter.createFrameAuthorization(
          session.ticket,
          session.identity,
          {
            direction: "reveal_to_preload",
            frameType: "reveal_secret",
            bodyLength: secret.byteLength,
            expiresAt: effectiveExpiry(session),
            revealCompletedAck: completedAck,
            revealUncertainAck: uncertainAck,
          },
        );
        const envelope = this.#adapter.createRevealEnvelope(
          session.ticket,
          session.identity,
          secret,
        );
        session.authorization = authorization;
        session.state = "reveal_authorization_issued";
        const acknowledgement = new Promise<void>((resolve, reject) => {
          session.revealAckResolve = resolve;
          session.revealAckReject = reject;
        });
        try {
          session.port.postMessage(authorization);
          session.state = "reveal_frame_sent";
          session.port.postMessage(envelope);
          return await acknowledgement;
        } finally {
          envelope.body.fill(0);
        }
      },
    };
  }

  #hasRevealAcknowledgement(session: Session): boolean {
    return session.state === "reveal_acknowledged";
  }

  #bindBrokerLease(session: Session): PersonalCredentialBrokerLease {
    if (this.#brokerLeaseProvider === undefined) throw unavailable();
    const lease = this.#brokerLeaseProvider.current();
    if (lease.runtimeInstanceId !== session.preparedCommand.runtimeInstanceId
      || lease.clientInstanceId !== session.preparedCommand.clientInstanceId
      || lease.channelInstanceId !== lease.client.channelInstanceId) {
      throw new PersonalCredentialTransportError(
        "personal_credential_transport_process_lost",
      );
    }
    session.brokerLease = lease;
    session.abortController = new AbortController();
    return lease;
  }

  #isCurrentDispatch(
    session: Session,
    lease: PersonalCredentialBrokerLease,
    ordinal: number,
  ): boolean {
    const registration = this.#windows.get(session.ticket.webContentsId);
    return this.#sessions.get(sessionKey(session.ticket)) === session
      && session.dispatchOrdinal === ordinal
      && session.brokerLease?.channelInstanceId === lease.channelInstanceId
      && session.ticket.navigationEpoch === registration?.epoch
      && session.abortController?.signal.aborted !== true;
  }

  #settle(
    ticket: PersonalCredentialTransportTicket,
    terminalInput: PersonalCredentialTransportTerminal,
    errorCode: PersonalCredentialTransportErrorCode | undefined,
    acknowledge: boolean,
  ): void {
    const session = this.#sessions.get(sessionKey(ticket));
    if (session === undefined) return;
    let terminal = terminalInput;
    if (acknowledge) {
      try {
        session.port.postMessage(createControl({
          protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
          transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
          commandId: ticket.commandId,
          correlationId: ticket.correlationId,
          controlType: "terminal_ack",
          terminal,
          ...(terminal === "completed" ? {} : { typedErrorCode: errorCode }),
        }));
      } catch {
        terminal = "uncertain";
      }
    }
    try {
      this.#adapter.complete(ticket, terminal);
    } catch {
      // Navigation may already have invalidated the signed registry record.
    }
    this.#closeSession(session);
  }

  #advanceNavigation(webContentsId: number): void {
    const registration = this.#windows.get(webContentsId);
    if (registration === undefined) return;
    registration.epoch += 1;
    this.#adapter.invalidateNavigation(webContentsId, registration.epoch);
    for (const session of [...this.#sessions.values()]) {
      if (session.ticket.webContentsId === webContentsId) this.#closeSession(session);
    }
  }

  #removeWebContents(webContentsId: number): void {
    const registration = this.#windows.get(webContentsId);
    if (registration === undefined) return;
    this.#windows.delete(webContentsId);
    for (const removeListener of registration.removeListeners) removeListener();
    this.#adapter.invalidateNavigation(webContentsId, registration.epoch + 1);
    for (const session of [...this.#sessions.values()]) {
      if (session.ticket.webContentsId === webContentsId) this.#closeSession(session);
    }
  }

  #closeSession(session: Session): void {
    if (!this.#sessions.delete(sessionKey(session.ticket))) return;
    clearTimeout(session.deadline);
    session.abortController?.abort();
    session.abortController = undefined;
    session.authorization = undefined;
    session.brokerLease = undefined;
    session.revealAckReject?.();
    session.revealAckResolve = undefined;
    session.revealAckReject = undefined;
    session.port.off("message", session.onMessage);
    session.port.off("close", session.onClose);
    session.port.close();
  }

  #assertEnabled(): void {
    if (!this.#foundationEnabled || this.#closed) throw unavailable();
  }
}

function brokerCommand(
  command: PersonalCredentialTransportPreparedCommand,
  secret?: Uint8Array,
): PersonalCredentialBrokerCommand {
  return {
    commandId: command.commandId,
    commandType: command.operationType,
    personalModelId: command.personalModelId,
    expectedConfigurationRevision: command.expectedConfigurationRevision,
    ...(command.expectedExecutionDefinitionDigest === undefined
      ? {}
      : { expectedExecutionDefinitionDigest: command.expectedExecutionDefinitionDigest }),
    commandRequestDigest: command.requestDigest,
    deadlineAt: command.deadlineAt,
    ...(secret === undefined ? {} : { secret }),
  };
}

function mapBrokerResult(
  result: PersonalCredentialBrokerResult,
  dispatched: boolean,
): Readonly<{
  terminal: PersonalCredentialTransportTerminal;
  code: PersonalCredentialTransportErrorCode | undefined;
}> {
  return mapBrokerHeader(result.header.status, result.header.typedErrorCode, dispatched);
}

function mapBrokerHeader(
  status: "completed" | "rejected" | "cancelled" | "timed_out" | "uncertain",
  _brokerCode: string | undefined,
  dispatched: boolean,
): Readonly<{
  terminal: PersonalCredentialTransportTerminal;
  code: PersonalCredentialTransportErrorCode | undefined;
}> {
  switch (status) {
    case "completed": return { terminal: "completed", code: undefined };
    case "cancelled": return {
      terminal: "cancelled",
      code: "personal_credential_transport_cancelled",
    };
    case "timed_out": return dispatched
      ? { terminal: "uncertain", code: "personal_credential_transport_uncertain" }
      : { terminal: "timed_out", code: "personal_credential_transport_timed_out" };
    case "uncertain": return {
      terminal: "uncertain",
      code: "personal_credential_transport_uncertain",
    };
    case "rejected": return {
      terminal: "rejected",
      code: "personal_credential_transport_rejected",
    };
  }
}

function createControl(
  materialInput: PersonalCredentialTransportControlMaterial,
): PersonalCredentialTransportControlMessage {
  const material = PersonalCredentialTransportControlMaterialSchema.parse(materialInput);
  return PersonalCredentialTransportControlMessageSchema.parse({
    ...material,
    controlDigest: digestControl(material),
  });
}

function parseControl(input: unknown): PersonalCredentialTransportControlMessage {
  let control: PersonalCredentialTransportControlMessage;
  try {
    control = PersonalCredentialTransportControlMessageSchema.parse(input);
  } catch {
    throw new PersonalCredentialTransportError(
      "personal_credential_transport_invalid_frame",
    );
  }
  const expected = digestControl(personalCredentialTransportControlMaterial(control));
  const left = Buffer.from(control.controlDigest, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.byteLength !== right.byteLength || !timingSafeEqual(left, right)) {
    throw new PersonalCredentialTransportError(
      "personal_credential_transport_invalid_frame",
    );
  }
  return control;
}

function digestControl(material: PersonalCredentialTransportControlMaterial): string {
  return `sha256:${createHash("sha256")
    .update(canonicalPersonalCredentialTransportControlMaterial(material), "utf8")
    .digest("hex")}`;
}

function envelopeMatchesAuthorization(
  input: unknown,
  authorization: PersonalCredentialTransportFrameAuthorization,
): boolean {
  if (typeof input !== "object" || input === null) return false;
  const header = Reflect.get(input, "header");
  if (typeof header !== "object" || header === null) return false;
  return Reflect.get(header, "commandId") === authorization.frameHeader.commandId
    && Reflect.get(header, "correlationId") === authorization.frameHeader.correlationId
    && Reflect.get(header, "frameType") === authorization.frameHeader.frameType
    && Reflect.get(header, "bodyLength") === authorization.frameHeader.bodyLength
    && Reflect.get(header, "frameDigest") === authorization.frameHeader.frameDigest;
}

function effectiveExpiry(session: Session): string {
  const expiresAt = Math.min(
    Date.parse(session.ticket.expiresAt),
    Date.parse(session.preparedCommand.deadlineAt),
  );
  return new Date(expiresAt).toISOString();
}

function sessionKey(ticket: PersonalCredentialTransportTicket): string {
  return `${ticket.commandId}:${ticket.correlationId}`;
}

function scrubUnknownBody(input: unknown): void {
  if (typeof input !== "object" || input === null) return;
  const body = Reflect.get(input, "body");
  if (body instanceof Uint8Array) body.fill(0);
}

function unavailable(): PersonalCredentialTransportError {
  return new PersonalCredentialTransportError(
    "personal_credential_transport_unavailable",
  );
}

function duplicate(): PersonalCredentialTransportError {
  return new PersonalCredentialTransportError(
    "personal_credential_transport_duplicate",
  );
}
