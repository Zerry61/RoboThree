import {
  CompatibilityQueryV1Alpha2Schema,
  DesktopErrorEnvelopeV1Alpha2Schema,
  GetRobotCatalogQuerySchema,
  GetToolCatalogQuerySchema,
  ListWorkspaceEntriesQuerySchema,
  ListRobotCatalogQuerySchema,
  ListToolCatalogQuerySchema,
  OpenTaskWorkspaceLocationCommandSchema,
  TaskWorkspaceOpenReceiptSchema,
  type GetRobotCatalogQuery,
  type GetToolCatalogQuery,
  type ListRobotCatalogQuery,
  type ListToolCatalogQuery,
  type DesktopErrorEnvelopeV1Alpha2,
  type OpenTaskWorkspaceLocationCommand,
} from "@robothree/contracts";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";

import {
  DESKTOP_V1ALPHA2_IPC_CHANNELS,
  type DesktopV1Alpha2InvokeChannel,
  type RendererSafeResultV1Alpha2,
} from "../shared/foundation-api.js";
import type { CorePrivateClient } from "./core-private-client.js";
import type { CorePrivateConnectionLease } from "./core-private-supervisor.js";

const MAX_ATTEMPTS = 256;
const ATTEMPT_TTL_MS = 10 * 60_000;
const MAX_CATALOG_BINDINGS = 16;

export class DesktopV1Alpha2IpcRouter {
  readonly #resolveConnection: () => CorePrivateConnectionLease;
  readonly #isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
  readonly #openTaskWorkspaceDirectory: (rootRealPath: string) => Promise<string>;
  readonly #openDeadlineMs: number;
  readonly #now: () => number;
  readonly #attempts = new Map<string, Attempt>();
  readonly #inflight = new Map<string, InflightAttempt>();
  readonly #catalogContexts = new Map<number, CatalogWindowRegistration>();
  readonly #catalogBindingsByContext = new Map<string, string>();
  readonly #catalogBindingsByClient = new Map<string, string>();
  #unsettledAdapterCommandId: string | undefined;

  constructor(input: Readonly<{
    resolveClient?: () => CorePrivateClient;
    resolveConnection?: () => CorePrivateConnectionLease;
    isCurrentConnection?: (lease: CorePrivateConnectionLease) => boolean;
    openTaskWorkspaceDirectory: (rootRealPath: string) => Promise<string>;
    openDeadlineMs?: number;
    now?: () => number;
  }>) {
    if (input.resolveConnection !== undefined) {
      this.#resolveConnection = input.resolveConnection;
      this.#isCurrentConnection = input.isCurrentConnection ?? (() => true);
    } else if (input.resolveClient !== undefined) {
      this.#resolveConnection = () => {
        const client = input.resolveClient!();
        return Object.freeze({
          client,
          runtimeInstanceId: "runtime.instance-test-fallback",
          transportClientInstanceId: "00000000-0000-4000-8000-000000000000",
        });
      };
      this.#isCurrentConnection = () => true;
    } else {
      throw new Error("Desktop v1alpha2 router requires a Core connection resolver");
    }
    this.#openTaskWorkspaceDirectory = input.openTaskWorkspaceDirectory;
    this.#openDeadlineMs = input.openDeadlineMs ?? 5_000;
    this.#now = input.now ?? Date.now;
  }

  registerCatalogWebContents(webContents: WebContents): () => void {
    const id = webContents.id;
    const existing = this.#catalogContexts.get(id);
    if (existing !== undefined) {
      for (const remove of existing.removeListeners) remove();
      this.#removeCatalogContext(id);
    }
    const advance = (): void => {
      const current = this.#catalogContexts.get(id);
      if (current === undefined) return;
      current.epoch += 1;
      this.#dropCatalogBindingsForWebContents(id);
    };
    const destroyed = (): void => this.#removeCatalogContext(id);
    webContents.on("will-navigate", advance);
    webContents.on("did-navigate", advance);
    webContents.on("did-navigate-in-page", advance);
    webContents.on("render-process-gone", destroyed);
    webContents.on("destroyed", destroyed);
    this.#catalogContexts.set(id, {
      epoch: 1,
      webContents,
      removeListeners: [
        () => webContents.off("will-navigate", advance),
        () => webContents.off("did-navigate", advance),
        () => webContents.off("did-navigate-in-page", advance),
        () => webContents.off("render-process-gone", destroyed),
        () => webContents.off("destroyed", destroyed),
      ],
    });
    return () => this.#removeCatalogContext(id);
  }

  async dispatch(
    channel: DesktopV1Alpha2InvokeChannel,
    input: unknown,
    event?: IpcMainInvokeEvent,
  ): Promise<RendererSafeResultV1Alpha2<unknown>> {
    try {
      switch (channel) {
        case DESKTOP_V1ALPHA2_IPC_CHANNELS.compatibility:
          return await this.#resolveConnection().client.compatibilityV1Alpha2(
            CompatibilityQueryV1Alpha2Schema.parse(input),
          );
        case DESKTOP_V1ALPHA2_IPC_CHANNELS.listRobotCatalog:
          return await this.#catalog(
            ListRobotCatalogQuerySchema.parse(input),
            event,
            (client, query) => client.listRobotCatalogV1Alpha2(query),
          );
        case DESKTOP_V1ALPHA2_IPC_CHANNELS.getRobotCatalog:
          return await this.#catalog(
            GetRobotCatalogQuerySchema.parse(input),
            event,
            (client, query) => client.getRobotCatalogV1Alpha2(query),
          );
        case DESKTOP_V1ALPHA2_IPC_CHANNELS.listToolCatalog:
          return await this.#catalog(
            ListToolCatalogQuerySchema.parse(input),
            event,
            (client, query) => client.listToolCatalogV1Alpha2(query),
          );
        case DESKTOP_V1ALPHA2_IPC_CHANNELS.getToolCatalog:
          return await this.#catalog(
            GetToolCatalogQuerySchema.parse(input),
            event,
            (client, query) => client.getToolCatalogV1Alpha2(query),
          );
        case DESKTOP_V1ALPHA2_IPC_CHANNELS.listWorkspaceEntries: {
          const query = ListWorkspaceEntriesQuerySchema.parse(input);
          const feature = await this.#requireFeature(
            "task_workspace_browser",
            query.clientInstanceId,
            query.correlationId,
          );
          return feature ?? await this.#resolveConnection().client.listWorkspaceEntriesV1Alpha2(query);
        }
        case DESKTOP_V1ALPHA2_IPC_CHANNELS.openTaskWorkspaceLocation: {
          const command = OpenTaskWorkspaceLocationCommandSchema.parse(input);
          const feature = await this.#requireFeature(
            "task_workspace_reveal",
            command.clientInstanceId,
            command.correlationId,
          );
          return feature ?? await this.#openWorkspace(command);
        }
      }
    } catch {
      return fail(
        "contract.invalid",
        "The Desktop v1alpha2 request is invalid.",
        correlationIdOf(input),
        "validation",
      );
    }
  }

  clear(): void {
    this.#attempts.clear();
    this.#inflight.clear();
    this.#catalogBindingsByClient.clear();
    this.#catalogBindingsByContext.clear();
    this.#unsettledAdapterCommandId = undefined;
  }

  resourceSnapshot(): Readonly<{ attemptCount: number; unsettledAdapterCount: number }> {
    this.#cleanup();
    return Object.freeze({
      attemptCount: this.#attempts.size,
      unsettledAdapterCount: this.#unsettledAdapterCommandId === undefined ? 0 : 1,
    });
  }

  async #requireFeature(
    feature: "task_workspace_browser" | "task_workspace_reveal",
    clientInstanceId: string,
    correlationId: string,
  ): Promise<RendererSafeResultV1Alpha2<never> | undefined> {
    const result = await this.#resolveConnection().client.compatibilityV1Alpha2({
      contractVersion: "v1alpha2",
      queryId: randomUUID(),
      correlationId,
      clientInstanceId,
      supportedContractVersions: ["v1alpha2", "v1alpha1"],
    });
    if (!result.ok) return result;
    if (!result.value.features.includes(feature)) {
      return fail(
        "contract.feature_unavailable",
        "This Desktop capability is unavailable in the current runtime.",
        correlationId,
        "compatibility",
        true,
      );
    }
    return undefined;
  }

  async #catalog<Query extends CatalogQuery>(
    query: Query,
    event: IpcMainInvokeEvent | undefined,
    operation: (
      client: CorePrivateClient,
      query: Query,
    ) => Promise<RendererSafeResultV1Alpha2<unknown>>,
  ): Promise<RendererSafeResultV1Alpha2<unknown>> {
    const context = this.#catalogCallerContext(event);
    if (context === undefined || !this.#bindCatalogClient(context, query.clientInstanceId)) {
      return fail(
        "catalog.client_mismatch",
        "The current catalog client identity does not match this window.",
        query.correlationId,
        "authorization",
      );
    }
    const lease = this.#resolveConnection();
    const feature = await lease.client.compatibilityV1Alpha2({
      contractVersion: "v1alpha2",
      queryId: randomUUID(),
      correlationId: query.correlationId,
      clientInstanceId: query.clientInstanceId,
      supportedContractVersions: ["v1alpha2", "v1alpha1"],
    });
    if (!feature.ok) return feature;
    if (feature.value.runtimeInstanceId !== lease.runtimeInstanceId
      || !feature.value.features.includes("robot_tool_catalog")) {
      return fail(
        "contract.feature_unavailable",
        "Robot and Tool catalog is unavailable in the current runtime.",
        query.correlationId,
        "compatibility",
        true,
      );
    }
    const result = await operation(lease.client, query);
    if (!this.#isCurrentConnection(lease)) {
      return fail(
        "catalog.runtime_changed",
        "Local Core changed runtime while handling this catalog request. Refresh and try again.",
        query.correlationId,
        "conflict",
        true,
      );
    }
    return result;
  }

  #catalogCallerContext(event: IpcMainInvokeEvent | undefined): CatalogCallerContext | undefined {
    if (event === undefined) {
      return Object.freeze({
        webContentsId: 0,
        mainFrameRoutingId: 0,
        navigationEpoch: 1,
      });
    }
    const registration = this.#catalogContexts.get(event.sender.id);
    const senderFrame = event.senderFrame;
    if (registration === undefined
      || registration.webContents !== event.sender
      || event.sender.isDestroyed()
      || senderFrame === null
      || senderFrame.isDestroyed()
      || senderFrame !== event.sender.mainFrame) {
      return undefined;
    }
    return Object.freeze({
      webContentsId: event.sender.id,
      mainFrameRoutingId: senderFrame.routingId,
      navigationEpoch: registration.epoch,
    });
  }

  #bindCatalogClient(context: CatalogCallerContext, clientInstanceId: string): boolean {
    const contextKey = catalogContextKey(context);
    const existingContextClient = this.#catalogBindingsByContext.get(contextKey);
    if (existingContextClient !== undefined) {
      return existingContextClient === clientInstanceId;
    }
    const existingClientContext = this.#catalogBindingsByClient.get(clientInstanceId);
    if (existingClientContext !== undefined && existingClientContext !== contextKey) {
      return false;
    }
    if (this.#catalogBindingsByContext.size >= MAX_CATALOG_BINDINGS) return false;
    this.#catalogBindingsByContext.set(contextKey, clientInstanceId);
    this.#catalogBindingsByClient.set(clientInstanceId, contextKey);
    return true;
  }

  #dropCatalogBindingsForWebContents(webContentsId: number): void {
    for (const [contextKey, clientInstanceId] of this.#catalogBindingsByContext) {
      if (contextKey.startsWith(`${webContentsId}:`)) {
        this.#catalogBindingsByContext.delete(contextKey);
        this.#catalogBindingsByClient.delete(clientInstanceId);
      }
    }
  }

  #removeCatalogContext(webContentsId: number): void {
    const registration = this.#catalogContexts.get(webContentsId);
    if (registration === undefined) return;
    this.#catalogContexts.delete(webContentsId);
    for (const remove of registration.removeListeners) remove();
    this.#dropCatalogBindingsForWebContents(webContentsId);
  }

  async #openWorkspace(
    command: OpenTaskWorkspaceLocationCommand,
  ): Promise<RendererSafeResultV1Alpha2<unknown>> {
    this.#cleanup();
    const digest = createHash("sha256").update(JSON.stringify({
      contractVersion: command.contractVersion,
      commandId: command.commandId,
      correlationId: command.correlationId,
      clientInstanceId: command.clientInstanceId,
      type: command.type,
      taskId: command.taskId,
    })).digest("hex");
    const existing = this.#attempts.get(command.commandId);
    if (existing !== undefined) {
      if (existing.digest !== digest) {
        return fail(
          "command.idempotency_conflict",
          "This command conflicts with an earlier request.",
          command.correlationId,
          "conflict",
        );
      }
      return existing.result;
    }
    const inflight = this.#inflight.get(command.commandId);
    if (inflight !== undefined) {
      if (inflight.digest !== digest) {
        return fail(
          "command.idempotency_conflict",
          "This command conflicts with an earlier request.",
          command.correlationId,
          "conflict",
        );
      }
      return inflight.promise;
    }
    const promise = this.#performOpen(command, digest);
    this.#inflight.set(command.commandId, { digest, promise });
    try {
      return await promise;
    } finally {
      this.#inflight.delete(command.commandId);
    }
  }

  async #performOpen(
    command: OpenTaskWorkspaceLocationCommand,
    digest: string,
  ): Promise<RendererSafeResultV1Alpha2<unknown>> {
    if (this.#unsettledAdapterCommandId !== undefined) {
      return fail(
        "workspace.reveal_busy",
        "Another workspace open operation is still settling.",
        command.correlationId,
        "availability",
        false,
      );
    }

    const client = this.#resolveConnection().client;
    const prepared = await client.prepareWorkspaceRevealV1Alpha2(command);
    if (!prepared.ok) return this.#remember(command.commandId, digest, prepared);
    const consumed = await client.consumeWorkspaceRevealV1Alpha2({
      command,
      authorityToken: prepared.value.authorityToken,
    });
    if (!consumed.ok) return this.#remember(command.commandId, digest, consumed);
    const root = await verifyRootIdentity(consumed.value.root);
    if (root === undefined) {
      return this.#remember(command.commandId, digest, fail(
        "workspace.reveal_unavailable",
        "The workspace location is unavailable.",
        command.correlationId,
        "availability",
      ));
    }
    this.#unsettledAdapterCommandId = command.commandId;
    const adapterPromise = this.#openTaskWorkspaceDirectory(root)
      .then((message) => message === ""
        ? ({ kind: "opened" } as const)
        : ({ kind: "error" } as const))
      .catch(() => ({ kind: "error" } as const))
      .finally(() => {
        if (this.#unsettledAdapterCommandId === command.commandId) {
          this.#unsettledAdapterCommandId = undefined;
        }
      });
    const outcome = await raceDeadline(adapterPromise, this.#openDeadlineMs);
    const result: RendererSafeResultV1Alpha2<unknown> = outcome.kind === "opened"
      ? {
        ok: true,
        value: TaskWorkspaceOpenReceiptSchema.parse({
          contractVersion: "v1alpha2",
          commandId: command.commandId,
          taskId: command.taskId,
          workspaceGrantId: consumed.value.workspaceGrantId,
          openedAt: new Date(this.#now()).toISOString(),
        }),
      }
      : outcome.kind === "timeout"
        ? fail(
          "workspace.reveal_outcome_uncertain",
          "The system response timed out. The workspace may still open; do not repeat the action.",
          command.correlationId,
          "uncertain",
          false,
        )
        : fail(
          "workspace.reveal_unavailable",
          "The workspace location could not be opened.",
          command.correlationId,
          "availability",
          false,
        );
    return this.#remember(command.commandId, digest, result);
  }

  #remember<T>(
    commandId: string,
    digest: string,
    result: RendererSafeResultV1Alpha2<T>,
  ): RendererSafeResultV1Alpha2<T> {
    this.#attempts.set(commandId, {
      digest,
      result,
      expiresAt: this.#now() + ATTEMPT_TTL_MS,
    });
    this.#trim();
    return result;
  }

  #cleanup(): void {
    const now = this.#now();
    for (const [commandId, attempt] of this.#attempts) {
      if (attempt.expiresAt <= now) this.#attempts.delete(commandId);
    }
  }

  #trim(): void {
    while (this.#attempts.size > MAX_ATTEMPTS) {
      const oldest = this.#attempts.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      this.#attempts.delete(oldest);
    }
  }
}

type Attempt = Readonly<{
  digest: string;
  result: RendererSafeResultV1Alpha2<unknown>;
  expiresAt: number;
}>;

type InflightAttempt = Readonly<{
  digest: string;
  promise: Promise<RendererSafeResultV1Alpha2<unknown>>;
}>;

type CatalogQuery =
  | ListRobotCatalogQuery
  | GetRobotCatalogQuery
  | ListToolCatalogQuery
  | GetToolCatalogQuery;

type CatalogCallerContext = Readonly<{
  webContentsId: number;
  mainFrameRoutingId: number;
  navigationEpoch: number;
}>;

type CatalogWindowRegistration = {
  epoch: number;
  webContents: WebContents;
  removeListeners: readonly (() => void)[];
};

function catalogContextKey(context: CatalogCallerContext): string {
  return `${context.webContentsId}:${context.mainFrameRoutingId}:${context.navigationEpoch}`;
}

async function verifyRootIdentity(input: Readonly<{
  rootRealPath: string;
  device: string;
  inode: string;
  mode: number;
}>): Promise<string | undefined> {
  try {
    const canonical = await realpath(input.rootRealPath);
    if (canonical !== input.rootRealPath) return undefined;
    const metadata = await lstat(canonical);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) return undefined;
    if (
      String(metadata.dev) !== input.device
      || String(metadata.ino) !== input.inode
      || metadata.mode !== input.mode
    ) return undefined;
    return canonical;
  } catch {
    return undefined;
  }
}

async function raceDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | Readonly<{ kind: "timeout" }>> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<Readonly<{ kind: "timeout" }>>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function fail<T>(
  code: string,
  safeSummary: string,
  correlationId: string,
  category: DesktopErrorEnvelopeV1Alpha2["category"],
  retryable = false,
): RendererSafeResultV1Alpha2<T> {
  return {
    ok: false,
    error: DesktopErrorEnvelopeV1Alpha2Schema.parse({
      contractVersion: "v1alpha2",
      code,
      category,
      safeSummary,
      retryable,
      correlationId,
    }),
  };
}

function correlationIdOf(value: unknown): string {
  if (
    typeof value === "object"
    && value !== null
    && "correlationId" in value
    && typeof value.correlationId === "string"
    && /^[0-9a-f-]{36}$/iu.test(value.correlationId)
  ) return value.correlationId;
  return "00000000-0000-4000-8000-000000000000";
}
