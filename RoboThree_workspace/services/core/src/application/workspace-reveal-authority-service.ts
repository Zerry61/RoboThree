import {
  OpenTaskWorkspaceLocationCommandSchema,
  type OpenTaskWorkspaceLocationCommand,
} from "@robothree/contracts";

import type { WorkspaceGrantPersistence } from "../ports/desktop-foundation-persistence.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import {
  WorkspaceBrowserPortError,
  type WorkspaceBrowserProofCodec,
  type WorkspaceDirectoryReader,
  type WorkspaceRevealAuthorityServicePort,
  type WorkspaceRootIdentity,
} from "../ports/workspace-browser.js";
import { hasValidTaskRuntimeSelection } from "./runtime-selection-revisions.js";

const AUTHORITY_TTL_MS = 5_000;

export class WorkspaceRevealAuthorityService implements WorkspaceRevealAuthorityServicePort {
  readonly #tasks: Pick<TaskPersistence, "loadTaskRuntimeSelection">;
  readonly #workspaces: Pick<WorkspaceGrantPersistence, "loadWorkspaceGrant">;
  readonly #reader: Pick<WorkspaceDirectoryReader, "readRootIdentity">;
  readonly #proofs: WorkspaceBrowserProofCodec;
  readonly #runtimeInstanceId: string;
  readonly #now: () => number;

  constructor(input: Readonly<{
    tasks: Pick<TaskPersistence, "loadTaskRuntimeSelection">;
    workspaces: Pick<WorkspaceGrantPersistence, "loadWorkspaceGrant">;
    reader: Pick<WorkspaceDirectoryReader, "readRootIdentity">;
    proofs: WorkspaceBrowserProofCodec;
    runtimeInstanceId: string;
    now?: () => number;
  }>) {
    this.#tasks = input.tasks;
    this.#workspaces = input.workspaces;
    this.#reader = input.reader;
    this.#proofs = input.proofs;
    this.#runtimeInstanceId = input.runtimeInstanceId;
    this.#now = input.now ?? Date.now;
  }

  async prepare(command: OpenTaskWorkspaceLocationCommand, signal?: AbortSignal) {
    const parsed = parseCommand(command);
    const authority = await this.#resolveAuthority(parsed, signal);
    return Object.freeze({
      authorityToken: this.#proofs.sealRevealAuthority({
        kind: "reveal_authority",
        taskId: parsed.taskId,
        selectionDigest: authority.selectionDigest,
        workspaceGrantId: authority.workspaceGrantId,
        root: authority.root,
        runtimeInstanceId: this.#runtimeInstanceId,
        commandId: parsed.commandId,
        expiresAtEpochMs: this.#now() + AUTHORITY_TTL_MS,
      }),
    });
  }

  async consume(input: Readonly<{
    command: OpenTaskWorkspaceLocationCommand;
    authorityToken: string;
  }>, signal?: AbortSignal) {
    const command = parseCommand(input.command);
    const proof = this.#proofs.openRevealAuthority(input.authorityToken);
    if (
      proof.runtimeInstanceId !== this.#runtimeInstanceId
      || proof.commandId !== command.commandId
      || proof.taskId !== command.taskId
      || !Number.isSafeInteger(proof.expiresAtEpochMs)
      || proof.expiresAtEpochMs <= this.#now()
    ) {
      throw revealError(
        "workspace.reveal_authority_invalid",
        "workspace reveal authority is invalid or expired",
      );
    }
    const current = await this.#resolveAuthority(command, signal);
    if (
      proof.selectionDigest !== current.selectionDigest
      || proof.workspaceGrantId !== current.workspaceGrantId
      || !sameIdentity(proof.root, current.root)
    ) {
      throw revealError(
        "workspace.reveal_authority_stale",
        "workspace reveal authority is stale",
      );
    }
    return Object.freeze({
      commandId: command.commandId,
      taskId: command.taskId,
      workspaceGrantId: current.workspaceGrantId,
      root: current.root,
    });
  }

  async #resolveAuthority(command: OpenTaskWorkspaceLocationCommand, signal?: AbortSignal) {
    const taskId = parseDesktopTaskId(command.taskId);
    const selection = await this.#tasks.loadTaskRuntimeSelection(taskId);
    if (selection === undefined || selection.taskId !== taskId || !hasValidTaskRuntimeSelection(selection)) {
      throw revealError(
        "workspace.reveal_task_selection_unavailable",
        "task runtime selection is unavailable",
      );
    }
    if (selection.workspaceGrantId === undefined) {
      throw revealError(
        "workspace.reveal_task_workspace_unlocked",
        "task does not have a locked workspace",
      );
    }
    const grant = await this.#workspaces.loadWorkspaceGrant(selection.workspaceGrantId);
    if (grant === undefined || grant.status !== "active") {
      throw revealError(
        "workspace.reveal_grant_unavailable",
        "locked workspace grant is unavailable",
      );
    }
    const root = await this.#reader.readRootIdentity({
      rootRealPath: grant.rootRealPath,
      ...(signal === undefined ? {} : { signal }),
    });
    if (root.rootRealPath !== grant.rootRealPath) {
      throw revealError(
        "workspace.reveal_root_identity_changed",
        "workspace root identity changed",
      );
    }
    return Object.freeze({
      selectionDigest: selection.selectionDigest,
      workspaceGrantId: grant.workspaceGrantId,
      root,
    });
  }
}

function parseCommand(input: OpenTaskWorkspaceLocationCommand): OpenTaskWorkspaceLocationCommand {
  const parsed = OpenTaskWorkspaceLocationCommandSchema.safeParse(input);
  if (!parsed.success) {
    throw revealError("workspace.reveal_invalid_command", "workspace reveal command is invalid");
  }
  return parsed.data;
}

function parseDesktopTaskId(taskId: string): string {
  const internal = taskId.startsWith("task:") ? taskId.slice(5) : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(internal)) {
    throw revealError("workspace.reveal_invalid_task_id", "Desktop task ID is invalid");
  }
  return internal;
}

function sameIdentity(left: WorkspaceRootIdentity, right: WorkspaceRootIdentity): boolean {
  return left.rootRealPath === right.rootRealPath
    && left.device === right.device
    && left.inode === right.inode
    && left.mode === right.mode;
}

function revealError(code: string, message: string): WorkspaceBrowserPortError {
  return new WorkspaceBrowserPortError(code, message);
}
