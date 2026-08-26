import {
  CreateWorkspaceGrantCommandSchema,
  JsonValueSchema,
  RevokeWorkspaceGrantCommandSchema,
} from "@robothree/contracts";
import type {
  CreateWorkspaceGrantCommand,
  RevokeWorkspaceGrantCommand,
  RuntimeError,
  WorkspaceGrantProjection,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type {
  DesktopFoundationWriteResult,
  WorkspaceGrantRecord,
  WorkspaceGrantPersistence,
} from "../ports/desktop-foundation-persistence.js";
import {
  WorkspaceSelectionError,
  type WorkspacePathResolver,
  type WorkspaceSelectionResolver,
} from "../ports/workspace-selection.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { desktopFoundationError } from "./desktop-foundation-errors.js";

export class WorkspaceGrantService {
  readonly #clock: Clock;
  readonly #persistence: WorkspaceGrantPersistence;
  readonly #selectionResolver: WorkspaceSelectionResolver;
  readonly #pathResolver: WorkspacePathResolver;

  constructor(input: {
    clock: Clock;
    persistence: WorkspaceGrantPersistence;
    selectionResolver: WorkspaceSelectionResolver;
    pathResolver: WorkspacePathResolver;
  }) {
    this.#clock = input.clock;
    this.#persistence = input.persistence;
    this.#selectionResolver = input.selectionResolver;
    this.#pathResolver = input.pathResolver;
  }

  async create(
    input: CreateWorkspaceGrantCommand,
  ): Promise<DesktopFoundationWriteResult<WorkspaceGrantProjection>> {
    const parsed = CreateWorkspaceGrantCommandSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
    const command = parsed.data;
    const {
      selectionHandle: _selectionHandle,
      ...durableCommandMaterial
    } = command;
    const requestDigest = digestCommand(durableCommandMaterial);
    const replay = await this.#persistence.findWorkspaceCommandReceipt(
      command.commandId,
    );
    if (replay !== undefined) {
      if (
        replay.commandType !== command.type
        || replay.requestDigest !== requestDigest
        || !("projection" in replay)
      ) return idempotencyConflict();
      return { ok: true, replayed: true, value: replay.projection };
    }

    try {
      const selectedPath = await this.#selectionResolver.resolve(
        command.selectionHandle,
        {
          clientInstanceId: command.clientInstanceId,
          correlationId: command.correlationId,
        },
      );
      const resolved = await this.#pathResolver.resolveDirectory(selectedPath);
      const createdAt = this.#clock.now();
      return this.#persistence.commitWorkspaceGrantCreation({
        commandId: command.commandId,
        requestDigest,
        committedAt: createdAt,
        record: {
          workspaceGrantId: `workspace:${command.commandId}`,
          displayName: command.displayName,
          rootDisplayPath: resolved.rootDisplayPath,
          rootRealPath: resolved.rootRealPath,
          accessMode: command.accessMode,
          status: "active",
          createdAt,
        },
      });
    } catch (error) {
      if (error instanceof WorkspaceSelectionError) {
        return {
          ok: false,
          error: desktopFoundationError(
            error.code,
            error.message,
            "validation",
          ),
        };
      }
      throw error;
    }
  }

  async revoke(
    input: RevokeWorkspaceGrantCommand,
  ): Promise<DesktopFoundationWriteResult<WorkspaceGrantProjection>> {
    const parsed = RevokeWorkspaceGrantCommandSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
    const command = parsed.data;
    return this.#persistence.commitWorkspaceGrantRevocation({
      workspaceGrantId: command.workspaceGrantId,
      commandId: command.commandId,
      requestDigest: digestCommand(command),
      revokedAt: this.#clock.now(),
    });
  }

  async load(workspaceGrantId: string): Promise<WorkspaceGrantProjection | undefined> {
    const record = await this.#persistence.loadWorkspaceGrant(workspaceGrantId);
    return record === undefined ? undefined : toProjection(record);
  }

  async list(): Promise<readonly WorkspaceGrantProjection[]> {
    return (await this.#persistence.listWorkspaceGrants()).map(toProjection);
  }

  async listPrivateAuthorities(): Promise<readonly WorkspaceGrantRecord[]> {
    return (await this.#persistence.listWorkspaceGrants())
      .filter((record) => record.status === "active");
  }

  async resolveAuthorizedPath(input: {
    workspaceGrantId: string;
    relativePath: string;
    operation: "read" | "write";
    allowMissingLeaf?: boolean;
  }): Promise<
    | { ok: true; value: { workspaceGrantId: string; absolutePath: string } }
    | { ok: false; error: RuntimeError }
  > {
    const grant = await this.#persistence.loadWorkspaceGrant(
      input.workspaceGrantId,
    );
    if (grant === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.workspace_not_found",
          "workspace grant does not exist",
          "authorization",
        ),
      };
    }
    if (grant.status !== "active") {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.workspace_revoked",
          "workspace grant is revoked",
          "authorization",
        ),
      };
    }
    if (input.operation === "write" && grant.accessMode !== "read_write") {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.workspace_write_denied",
          "workspace grant is read-only",
          "authorization",
        ),
      };
    }
    try {
      return {
        ok: true,
        value: {
          workspaceGrantId: grant.workspaceGrantId,
          absolutePath: await this.#pathResolver.resolveWithinDirectory({
            rootRealPath: grant.rootRealPath,
            relativePath: input.relativePath,
            ...(input.allowMissingLeaf === undefined
              ? {}
              : { allowMissingLeaf: input.allowMissingLeaf }),
          }),
        },
      };
    } catch (error) {
      if (error instanceof WorkspaceSelectionError) {
        return {
          ok: false,
          error: desktopFoundationError(
            error.code,
            error.message,
            "authorization",
          ),
        };
      }
      throw error;
    }
  }
}

function toProjection(
  record: Awaited<ReturnType<WorkspaceGrantPersistence["loadWorkspaceGrant"]>>
    & object,
): WorkspaceGrantProjection {
  const { rootRealPath: _rootRealPath, ...projection } = record;
  return projection;
}

function digestCommand(command: unknown): string {
  return sha256CanonicalJson(JsonValueSchema.parse(command));
}

function validationFailure(message?: string): DesktopFoundationWriteResult<never> {
  return {
    ok: false,
    error: desktopFoundationError(
      "desktop.invalid_command",
      message ?? "invalid Desktop command",
      "validation",
    ),
  };
}

function idempotencyConflict(): DesktopFoundationWriteResult<never> {
  return {
    ok: false,
    error: desktopFoundationError(
      "desktop.command_idempotency_conflict",
      "commandId was already used with another command digest",
    ),
  };
}

export type WorkspaceGrantServiceError = RuntimeError;
