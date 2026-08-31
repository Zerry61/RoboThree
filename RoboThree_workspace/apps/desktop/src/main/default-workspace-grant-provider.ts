import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";

import type { CorePrivateClient } from "./core-private-client.js";

const DEFAULT_WORKSPACE_DISPLAY_NAME = "RoboThree 默认工作区";

type WorkspaceClient = Pick<
  CorePrivateClient,
  | "createWorkspaceGrant"
  | "discardWorkspaceSelection"
  | "listWorkspaceGrantAuthorities"
  | "registerWorkspaceSelection"
>;

/**
 * Privileged Main-only composition for the default local workspace.
 * The real path never crosses the Preload/Renderer boundary.
 */
export class DefaultWorkspaceGrantProvider {
  readonly #resolveClient: () => WorkspaceClient;
  readonly #rootPath: string;
  #inflight: Promise<string> | undefined;

  constructor(input: Readonly<{
    resolveClient: () => WorkspaceClient;
    rootPath: string;
  }>) {
    this.#resolveClient = input.resolveClient;
    this.#rootPath = input.rootPath;
  }

  ensure(input: Readonly<{
    clientInstanceId: string;
    correlationId: string;
  }>): Promise<string> {
    const active = this.#inflight ?? this.#ensure(input);
    this.#inflight = active;
    void active.finally(() => {
      if (this.#inflight === active) this.#inflight = undefined;
    }).catch(() => undefined);
    return active;
  }

  async #ensure(input: Readonly<{
    clientInstanceId: string;
    correlationId: string;
  }>): Promise<string> {
    await mkdir(this.#rootPath, { recursive: true, mode: 0o700 });
    const canonicalRoot = await realpath(this.#rootPath);
    const client = this.#resolveClient();
    const authorities = await client.listWorkspaceGrantAuthorities({
      correlationId: input.correlationId,
    });
    if (!authorities.ok) throw new Error("Default workspace authority is unavailable");
    const existing = authorities.value.find((authority) =>
      authority.status === "active"
      && authority.accessMode === "read_write"
      && authority.rootRealPath === canonicalRoot);
    if (existing !== undefined) return existing.workspaceGrantId;

    const selection = await client.registerWorkspaceSelection({
      selectedPath: canonicalRoot,
      clientInstanceId: input.clientInstanceId,
      correlationId: input.correlationId,
    });
    if (!selection.ok) throw new Error("Default workspace selection is unavailable");
    try {
      const created = await client.createWorkspaceGrant({
        contractVersion: "v1alpha1",
        type: "create_workspace_grant",
        commandId: randomUUID(),
        correlationId: input.correlationId,
        clientInstanceId: input.clientInstanceId,
        selectionHandle: selection.value.selectionHandle,
        displayName: DEFAULT_WORKSPACE_DISPLAY_NAME,
        accessMode: "read_write",
      });
      if (!created.ok) throw new Error("Default workspace grant is unavailable");
      return created.value.workspaceGrantId;
    } finally {
      await client.discardWorkspaceSelection(selection.value.selectionHandle)
        .catch(() => undefined);
    }
  }
}
