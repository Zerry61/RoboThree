import {
  DesktopErrorEnvelopeSchema,
  DesktopHeartbeatSchema,
  type DesktopErrorEnvelope,
} from "@robothree/contracts";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type { DesktopApplicationFacade } from "../../application/desktop-application-facade.js";
import type { DesktopEphemeralEventBus } from "../../application/desktop-ephemeral-event-bus.js";
import type { RuntimeComponent } from "../../ports/runtime-component.js";
import {
  SseBackpressureWriter,
  SLOW_CONSUMER_DEADLINE_MS,
  type SseBackpressureMetrics,
} from "./sse-backpressure-writer.js";

export const CORE_PRIVATE_ORIGIN = "robothree://desktop-main";

export const CORE_PRIVATE_ROUTES = Object.freeze({
  compatibilityV1Alpha2: "/v1alpha2/control/compatibility",
  listRobotCatalogV1Alpha2: "/v1alpha2/catalog/robots/list",
  getRobotCatalogV1Alpha2: "/v1alpha2/catalog/robots/detail",
  listToolCatalogV1Alpha2: "/v1alpha2/catalog/tools/list",
  getToolCatalogV1Alpha2: "/v1alpha2/catalog/tools/detail",
  workspaceEntriesV1Alpha2: "/v1alpha2/workspaces/entries",
  workspaceRevealAuthorityV1Alpha2: "/v1alpha2/workspaces/reveal-authority",
  compatibility: "/v1alpha1/control/compatibility",
  runtimeStatus: "/v1alpha1/control/runtime-status",
  registerWorkspaceSelection: "/v1alpha1/workspaces/register-selection",
  discardWorkspaceSelection: "/v1alpha1/workspaces/discard-selection",
  createWorkspaceGrant: "/v1alpha1/workspaces/create",
  revokeWorkspaceGrant: "/v1alpha1/workspaces/revoke",
  listWorkspaceGrants: "/v1alpha1/workspaces/list",
  listWorkspaceGrantAuthorities: "/v1alpha1/workspaces/private-authorities",
  createSession: "/v1alpha1/sessions/create",
  renameSession: "/v1alpha1/sessions/rename",
  deleteSession: "/v1alpha1/sessions/delete",
  listSessions: "/v1alpha1/sessions/list",
  openSession: "/v1alpha1/sessions/open",
  listAgents: "/v1alpha1/catalog/agents",
  listModels: "/v1alpha1/catalog/models",
  conversationSnapshot: "/v1alpha1/conversations/snapshot",
  listTasks: "/v1alpha1/tasks/list",
  taskDetail: "/v1alpha1/tasks/detail",
  artifactList: "/v1alpha1/artifacts/list",
  artifactRegister: "/v1alpha1/artifacts/register",
  artifactPreview: "/v1alpha1/artifacts/preview",
  artifactLifecycle: "/v1alpha1/artifacts/lifecycle",
  artifactRecordDelete: "/v1alpha1/artifacts/record/delete",
  artifactRecordRestore: "/v1alpha1/artifacts/record/restore",
  artifactSourceDeletePrepare: "/v1alpha1/artifacts/source/delete/prepare",
  artifactSourceDeleteCommit: "/v1alpha1/artifacts/source/delete/commit",
  artifactFileSource: "/v1alpha1/artifacts/file-source",
  listPendingUserConfirmations: "/v1alpha1/confirmations/pending",
  taskControl: "/v1alpha1/tasks/control",
  submitTurn: "/v1alpha1/turns/submit",
  submitTurnStatus: "/v1alpha1/turns/status",
  events: "/v1alpha1/events",
});

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_V1ALPHA2_WORKSPACE_REQUEST_BYTES = 16 * 1024;
const MAX_V1ALPHA2_CATALOG_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type CorePrivateHttpResourceSnapshot = Readonly<{
  activeServers: number;
  activeEventStreams: number;
  activePollTimers: number;
  activeHeartbeatTimers: number;
  activeEphemeralSubscriptions: number;
  cleanupCount: number;
  slowConsumerTimeoutCount: number;
  backpressureCount: number;
  drainRecoveryCount: number;
  ephemeralFramesDropped: number;
  heartbeatFramesSkipped: number;
}>;

export class CorePrivateHttpServer implements RuntimeComponent {
  readonly componentId = "transport.desktop-private-http";
  readonly #authorizationToken: string;
  readonly #facade: DesktopApplicationFacade;
  readonly #heartbeatIntervalMs: number;
  readonly #pollIntervalMs: number;
  readonly #slowConsumerDeadlineMs: number;
  readonly #ephemeralEvents: DesktopEphemeralEventBus | undefined;
  #server: Server | undefined;
  #port: number | undefined;
  #activeEventStream: ServerResponse | undefined;
  #activeStreamWriter: SseBackpressureWriter | undefined;
  #streamCleanup: (() => void) | undefined;
  #activePollTimers = 0;
  #activeHeartbeatTimers = 0;
  #activeEphemeralSubscriptions = 0;
  #cleanupCount = 0;
  #slowConsumerTimeoutCount = 0;
  #backpressureCount = 0;
  #drainRecoveryCount = 0;
  #ephemeralFramesDropped = 0;
  #heartbeatFramesSkipped = 0;

  constructor(input: {
    authorizationToken: string;
    facade: DesktopApplicationFacade;
    heartbeatIntervalMs?: number;
    pollIntervalMs?: number;
    slowConsumerDeadlineMs?: number;
    ephemeralEvents?: DesktopEphemeralEventBus;
  }) {
    if (input.authorizationToken.length < 32) {
      throw new Error("Core private authorization token is too short");
    }
    this.#authorizationToken = input.authorizationToken;
    this.#facade = input.facade;
    this.#heartbeatIntervalMs = input.heartbeatIntervalMs ?? 15_000;
    this.#pollIntervalMs = input.pollIntervalMs ?? 200;
    this.#slowConsumerDeadlineMs = input.slowConsumerDeadlineMs
      ?? SLOW_CONSUMER_DEADLINE_MS;
    this.#ephemeralEvents = input.ephemeralEvents;
  }

  get port(): number {
    if (this.#port === undefined) throw new Error("Core private server is not ready");
    return this.#port;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async health() {
    return {
      componentId: this.componentId,
      status: this.#server === undefined ? "unavailable" as const : "ready" as const,
      checkedAt: this.#facade.now(),
    };
  }

  async start(): Promise<void> {
    if (this.#server !== undefined) throw new Error("Core private server already started");
    const server = createServer((request, response) => {
      void this.#handle(request, response);
    });
    this.#server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      await this.stop();
      throw new Error("Core private server did not bind a TCP port");
    }
    this.#port = address.port;
  }

  async stop(): Promise<void> {
    const activeEventStream = this.#activeEventStream;
    this.#streamCleanup?.();
    this.#streamCleanup = undefined;
    activeEventStream?.end();
    this.#activeEventStream = undefined;
    const server = this.#server;
    this.#server = undefined;
    this.#port = undefined;
    if (server === undefined) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
      server.closeAllConnections();
    });
  }

  resourceSnapshot(): CorePrivateHttpResourceSnapshot {
    const current = this.#activeStreamWriter?.snapshot();
    return Object.freeze({
      activeServers: this.#server === undefined ? 0 : 1,
      activeEventStreams: this.#activeEventStream === undefined ? 0 : 1,
      activePollTimers: this.#activePollTimers,
      activeHeartbeatTimers: this.#activeHeartbeatTimers,
      activeEphemeralSubscriptions: this.#activeEphemeralSubscriptions,
      cleanupCount: this.#cleanupCount,
      slowConsumerTimeoutCount: this.#slowConsumerTimeoutCount,
      backpressureCount: this.#backpressureCount
        + (current?.backpressureCount ?? 0),
      drainRecoveryCount: this.#drainRecoveryCount
        + (current?.drainRecoveryCount ?? 0),
      ephemeralFramesDropped: this.#ephemeralFramesDropped
        + (current?.ephemeralFramesDropped ?? 0),
      heartbeatFramesSkipped: this.#heartbeatFramesSkipped
        + (current?.heartbeatFramesSkipped ?? 0),
    });
  }

  async #handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      if (!this.#authorized(request)) {
        writeJson(response, 401, {
          ok: false,
          error: safeError(
            "runtime.unavailable",
            "The local runtime request is unauthorized.",
          ),
        });
        return;
      }
      const url = new URL(request.url ?? "/", this.baseUrl);
      if (request.method === "GET" && url.pathname === CORE_PRIVATE_ROUTES.events) {
        await this.#openEventStream(request, response, url);
        return;
      }
      if (request.method !== "POST") {
        writeJson(response, 405, {
          ok: false,
          error: safeError("contract.invalid", "Unsupported private request method."),
        });
        return;
      }
      const isWorkspaceV1Alpha2 = url.pathname === CORE_PRIVATE_ROUTES.workspaceEntriesV1Alpha2
        || url.pathname === CORE_PRIVATE_ROUTES.workspaceRevealAuthorityV1Alpha2;
      const isCatalogV1Alpha2 = url.pathname === CORE_PRIVATE_ROUTES.listRobotCatalogV1Alpha2
        || url.pathname === CORE_PRIVATE_ROUTES.getRobotCatalogV1Alpha2
        || url.pathname === CORE_PRIVATE_ROUTES.listToolCatalogV1Alpha2
        || url.pathname === CORE_PRIVATE_ROUTES.getToolCatalogV1Alpha2;
      const input = await readJsonBody(
        request,
        isCatalogV1Alpha2
          ? MAX_V1ALPHA2_CATALOG_REQUEST_BYTES
          : isWorkspaceV1Alpha2
            ? MAX_V1ALPHA2_WORKSPACE_REQUEST_BYTES
            : MAX_REQUEST_BYTES,
      );
      const controller = new AbortController();
      const deadlineMs = isCatalogV1Alpha2
        ? 5_000
        : url.pathname === CORE_PRIVATE_ROUTES.workspaceEntriesV1Alpha2
          ? 5_000
          : url.pathname === CORE_PRIVATE_ROUTES.workspaceRevealAuthorityV1Alpha2
            ? 3_000
            : undefined;
      const timeout = deadlineMs === undefined
        ? undefined
        : setTimeout(() => controller.abort(), deadlineMs);
      const onClose = (): void => controller.abort();
      request.once("aborted", onClose);
      try {
        const result = await this.#dispatch(url.pathname, input, controller.signal);
        writeJson(response, result === undefined || result.ok ? 200 : 400, result ?? {
          ok: false,
          error: safeError("contract.invalid", "Unknown private request route."),
        });
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
        request.off("aborted", onClose);
      }
    } catch (error) {
      const tooLarge = error instanceof RequestBodyTooLargeError;
      writeJson(response, tooLarge ? 413 : 400, {
        ok: false,
        error: safeError(
          "contract.invalid",
          tooLarge ? "Private request body is too large." : "Private request is invalid.",
        ),
      });
    }
  }

  #authorized(request: IncomingMessage): boolean {
    const expectedHost = `127.0.0.1:${this.port}`;
    return request.headers.host === expectedHost
      && request.headers.origin === CORE_PRIVATE_ORIGIN
      && request.headers.authorization === `Bearer ${this.#authorizationToken}`;
  }

  async #dispatch(
    path: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; value?: unknown; error?: unknown } | undefined> {
    switch (path) {
      case CORE_PRIVATE_ROUTES.compatibilityV1Alpha2:
        return this.#facade.compatibilityV1Alpha2(input as never);
      case CORE_PRIVATE_ROUTES.listRobotCatalogV1Alpha2:
        return this.#facade.listRobotCatalogV1Alpha2(input as never, signal);
      case CORE_PRIVATE_ROUTES.getRobotCatalogV1Alpha2:
        return this.#facade.getRobotCatalogV1Alpha2(input as never, signal);
      case CORE_PRIVATE_ROUTES.listToolCatalogV1Alpha2:
        return this.#facade.listToolCatalogV1Alpha2(input as never, signal);
      case CORE_PRIVATE_ROUTES.getToolCatalogV1Alpha2:
        return this.#facade.getToolCatalogV1Alpha2(input as never, signal);
      case CORE_PRIVATE_ROUTES.workspaceEntriesV1Alpha2:
        return this.#facade.listWorkspaceEntriesV1Alpha2(input as never, signal);
      case CORE_PRIVATE_ROUTES.workspaceRevealAuthorityV1Alpha2: {
        if (!isRecord(input) || (input.phase !== "prepare" && input.phase !== "consume")) {
          return undefined;
        }
        if (input.phase === "prepare") {
          if (Object.keys(input).some((key) => key !== "phase" && key !== "command")) {
            return undefined;
          }
          return this.#facade.prepareWorkspaceRevealV1Alpha2(input.command as never, signal);
        }
        if (
          Object.keys(input).some((key) => !["phase", "command", "authorityToken"].includes(key))
          || typeof input.authorityToken !== "string"
        ) return undefined;
        return this.#facade.consumeWorkspaceRevealV1Alpha2({
          command: input.command as never,
          authorityToken: input.authorityToken,
        }, signal);
      }
      case CORE_PRIVATE_ROUTES.compatibility:
        return this.#facade.compatibility(input as never);
      case CORE_PRIVATE_ROUTES.runtimeStatus:
        return this.#facade.runtimeStatus(input as never);
      case CORE_PRIVATE_ROUTES.registerWorkspaceSelection: {
        const parsed = parseSelectionRegistration(input);
        if (parsed === undefined) {
          return {
            ok: false,
            error: safeError("contract.invalid", "Workspace selection registration is invalid."),
          };
        }
        return {
          ok: true,
          value: {
            selectionHandle: this.#facade.registerWorkspaceSelection(parsed),
          },
        };
      }
      case CORE_PRIVATE_ROUTES.discardWorkspaceSelection: {
        const selectionHandle = parseSelectionDiscard(input);
        if (selectionHandle === undefined) {
          return {
            ok: false,
            error: safeError("contract.invalid", "Workspace selection discard is invalid."),
          };
        }
        this.#facade.discardWorkspaceSelection(selectionHandle);
        return { ok: true, value: { discarded: true } };
      }
      case CORE_PRIVATE_ROUTES.createWorkspaceGrant:
        return this.#facade.createWorkspaceGrant(input as never);
      case CORE_PRIVATE_ROUTES.revokeWorkspaceGrant:
        return this.#facade.revokeWorkspaceGrant(input as never);
      case CORE_PRIVATE_ROUTES.listWorkspaceGrants:
        return this.#facade.listWorkspaceGrants(input as never);
      case CORE_PRIVATE_ROUTES.listWorkspaceGrantAuthorities:
        return this.#facade.listWorkspaceGrantAuthorities(input as never);
      case CORE_PRIVATE_ROUTES.createSession:
        return this.#facade.createSession(input as never);
      case CORE_PRIVATE_ROUTES.renameSession:
        return this.#facade.renameSession(input as never);
      case CORE_PRIVATE_ROUTES.deleteSession:
        return this.#facade.deleteSession(input as never);
      case CORE_PRIVATE_ROUTES.listSessions:
        return this.#facade.listSessions(input as never);
      case CORE_PRIVATE_ROUTES.openSession:
        return this.#facade.openSession(input as never);
      case CORE_PRIVATE_ROUTES.listAgents:
        return this.#facade.listAgents(input as never);
      case CORE_PRIVATE_ROUTES.listModels:
        return this.#facade.listModels(input as never);
      case CORE_PRIVATE_ROUTES.conversationSnapshot:
        return this.#facade.loadConversationSnapshot(input as never);
      case CORE_PRIVATE_ROUTES.listTasks:
        return this.#facade.listTasks(input as never);
      case CORE_PRIVATE_ROUTES.taskDetail:
        return this.#facade.loadTaskDetail(input as never);
      case CORE_PRIVATE_ROUTES.artifactList:
        return this.#facade.listArtifacts(input as never);
      case CORE_PRIVATE_ROUTES.artifactRegister:
        return this.#facade.registerWorkspaceArtifact(input);
      case CORE_PRIVATE_ROUTES.artifactPreview:
        return this.#facade.previewArtifact(input as never);
      case CORE_PRIVATE_ROUTES.artifactLifecycle:
        return this.#facade.setArtifactLifecycle(input as never);
      case CORE_PRIVATE_ROUTES.artifactRecordDelete:
        return this.#facade.deleteArtifactRecord(input as never);
      case CORE_PRIVATE_ROUTES.artifactRecordRestore:
        return this.#facade.restoreArtifactRecord(input as never);
      case CORE_PRIVATE_ROUTES.artifactSourceDeletePrepare:
        return this.#facade.prepareArtifactSourceFileDeletion(input as never);
      case CORE_PRIVATE_ROUTES.artifactSourceDeleteCommit:
        return this.#facade.commitArtifactSourceFileDeletion(input as never);
      case CORE_PRIVATE_ROUTES.artifactFileSource:
        return this.#facade.resolveArtifactFileSource(input as never);
      case CORE_PRIVATE_ROUTES.listPendingUserConfirmations:
        return this.#facade.listPendingUserConfirmations(input as never);
      case CORE_PRIVATE_ROUTES.taskControl:
        return this.#facade.controlTask(input as never);
      case CORE_PRIVATE_ROUTES.submitTurn:
        return this.#facade.submitTurn(input as never);
      case CORE_PRIVATE_ROUTES.submitTurnStatus:
        return this.#facade.querySubmitTurn(input as never);
      default:
        return undefined;
    }
  }

  async #openEventStream(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> {
    if (this.#activeEventStream !== undefined) {
      writeJson(response, 409, {
        ok: false,
        error: safeError(
          "command.idempotency_conflict",
          "Only one Desktop event stream is allowed.",
        ),
      });
      return;
    }
    const cursor = url.searchParams.get("cursor") ?? "delivery:0";
    if (!/^delivery:(0|[1-9][0-9]*)$/u.test(cursor)) {
      writeJson(response, 400, {
        ok: false,
        error: safeError("contract.invalid", "Durable cursor is invalid."),
      });
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    });
    response.flushHeaders();
    this.#activeEventStream = response;
    const writer = new SseBackpressureWriter({
      response,
      slowConsumerDeadlineMs: this.#slowConsumerDeadlineMs,
      onSlowConsumer: () => {
        this.#slowConsumerTimeoutCount += 1;
      },
    });
    this.#activeStreamWriter = writer;
    let currentCursor = cursor;
    let writing = false;
    let cleaned = false;
    let poll: NodeJS.Timeout | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let unsubscribeEphemeral: (() => void) | undefined;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      if (poll !== undefined) {
        clearInterval(poll);
        poll = undefined;
        this.#activePollTimers -= 1;
      }
      if (heartbeat !== undefined) {
        clearInterval(heartbeat);
        heartbeat = undefined;
        this.#activeHeartbeatTimers -= 1;
      }
      if (unsubscribeEphemeral !== undefined) {
        unsubscribeEphemeral();
        unsubscribeEphemeral = undefined;
        this.#activeEphemeralSubscriptions -= 1;
      }
      writer.dispose();
      this.#accumulateWriterMetrics(writer.snapshot());
      this.#cleanupCount += 1;
      if (this.#activeEventStream === response) {
        this.#activeEventStream = undefined;
        this.#activeStreamWriter = undefined;
        this.#streamCleanup = undefined;
      }
    };
    const flush = async (): Promise<void> => {
      if (writing || response.destroyed) return;
      writing = true;
      try {
        const page = await this.#facade.listDurableEvents(currentCursor, 100);
        if (page.reset !== undefined) {
          const outcome = await writer.writeDurable("replay_reset", page.reset);
          if (outcome === "written") {
            currentCursor = page.reset.replacementCursor;
          }
          return;
        }
        for (const event of page.events) {
          const outcome = await writer.writeDurable("desktop_event", event);
          if (outcome !== "written") return;
          currentCursor = event.durableCursor;
        }
        if (page.events.length === 0) currentCursor = page.durableCursor;
      } catch {
        if (!response.destroyed) response.destroy();
        cleanup();
      } finally {
        writing = false;
      }
    };
    poll = setInterval(() => void flush(), this.#pollIntervalMs);
    this.#activePollTimers += 1;
    heartbeat = setInterval(() => {
      writer.writeHeartbeat("heartbeat", DesktopHeartbeatSchema.parse({
        type: "heartbeat",
        runtimeInstanceId: this.#facade.runtimeInstanceId,
        sentAt: this.#facade.now(),
      }));
    }, this.#heartbeatIntervalMs);
    this.#activeHeartbeatTimers += 1;
    unsubscribeEphemeral = this.#ephemeralEvents?.subscribe((event) => {
      writer.writeEphemeral("desktop_event", event);
    });
    if (unsubscribeEphemeral !== undefined) {
      this.#activeEphemeralSubscriptions += 1;
    }
    this.#streamCleanup = cleanup;
    request.once("close", cleanup);
    response.once("close", cleanup);
    await flush();
  }

  #accumulateWriterMetrics(metrics: SseBackpressureMetrics): void {
    this.#backpressureCount += metrics.backpressureCount;
    this.#drainRecoveryCount += metrics.drainRecoveryCount;
    this.#ephemeralFramesDropped += metrics.ephemeralFramesDropped;
    this.#heartbeatFramesSkipped += metrics.heartbeatFramesSkipped;
  }
}

function parseSelectionRegistration(input: unknown): {
  selectedPath: string;
  clientInstanceId: string;
  correlationId: string;
  ttlMs?: number;
} | undefined {
  if (!isRecord(input)) return undefined;
  const keys = Object.keys(input);
  if (
    keys.some((key) =>
      !["selectedPath", "clientInstanceId", "correlationId", "ttlMs"].includes(key))
    || typeof input.selectedPath !== "string"
    || input.selectedPath.length < 1
    || input.selectedPath.length > 4096
    || !isUuid(input.clientInstanceId)
    || !isUuid(input.correlationId)
    || (input.ttlMs !== undefined
      && (!Number.isSafeInteger(input.ttlMs)
        || (input.ttlMs as number) < 1
        || (input.ttlMs as number) > 30_000))
  ) return undefined;
  return {
    selectedPath: input.selectedPath,
    clientInstanceId: input.clientInstanceId,
    correlationId: input.correlationId,
    ...(input.ttlMs === undefined ? {} : { ttlMs: input.ttlMs as number }),
  };
}

function parseSelectionDiscard(input: unknown): string | undefined {
  if (
    !isRecord(input)
    || Object.keys(input).length !== 1
    || typeof input.selectionHandle !== "string"
    || input.selectionHandle.length < 16
    || input.selectionHandle.length > 512
  ) return undefined;
  return input.selectionHandle;
}

async function readJsonBody(
  request: IncomingMessage,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("Content-Type must be application/json");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new RequestBodyTooLargeError();
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
    const fallback = JSON.stringify({
      ok: false,
      error: safeError("runtime.unavailable", "Private response is too large."),
    });
    response.writeHead(500, secureJsonHeaders(fallback));
    response.end(fallback);
    return;
  }
  response.writeHead(status, secureJsonHeaders(body));
  response.end(body);
}

function secureJsonHeaders(body: string): Record<string, string | number> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function safeError(
  code: DesktopErrorEnvelope["code"],
  safeSummary: string,
): DesktopErrorEnvelope {
  return DesktopErrorEnvelopeSchema.parse({
    contractVersion: "v1alpha1",
    code,
    category: code === "command.idempotency_conflict"
      ? "conflict"
      : code === "contract.invalid"
        ? "validation"
        : "availability",
    safeSummary,
    retryable: false,
    correlationId: "00000000-0000-4000-8000-000000000000",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(value);
}

class RequestBodyTooLargeError extends Error {}
