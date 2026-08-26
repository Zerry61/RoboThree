import {
  JsonValueSchema,
  ListWorkspaceEntriesQuerySchema,
  WorkspaceDirectoryProjectionSchema,
  type ListWorkspaceEntriesQuery,
  type WorkspaceDirectoryProjection,
} from "@robothree/contracts";

import type { WorkspaceGrantPersistence } from "../ports/desktop-foundation-persistence.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import {
  WorkspaceBrowserPortError,
  type WorkspaceBrowser,
  type WorkspaceBrowserProofCodec,
  type WorkspaceDirectoryReader,
} from "../ports/workspace-browser.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { hasValidTaskRuntimeSelection } from "./runtime-selection-revisions.js";
import { WorkspaceEntryVisibilityPolicy } from "./workspace-entry-visibility-policy.js";

const DEFAULT_LIMIT = 100;
const MAX_RESPONSE_BYTES = 256 * 1024;

export class WorkspaceBrowserService implements WorkspaceBrowser {
  readonly #tasks: Pick<TaskPersistence, "loadTaskRuntimeSelection">;
  readonly #workspaces: Pick<WorkspaceGrantPersistence, "loadWorkspaceGrant">;
  readonly #reader: WorkspaceDirectoryReader;
  readonly #proofs: WorkspaceBrowserProofCodec;
  readonly #visibility: WorkspaceEntryVisibilityPolicy;

  constructor(input: Readonly<{
    tasks: Pick<TaskPersistence, "loadTaskRuntimeSelection">;
    workspaces: Pick<WorkspaceGrantPersistence, "loadWorkspaceGrant">;
    reader: WorkspaceDirectoryReader;
    proofs: WorkspaceBrowserProofCodec;
    visibility?: WorkspaceEntryVisibilityPolicy;
  }>) {
    this.#tasks = input.tasks;
    this.#workspaces = input.workspaces;
    this.#reader = input.reader;
    this.#proofs = input.proofs;
    this.#visibility = input.visibility ?? new WorkspaceEntryVisibilityPolicy();
  }

  async listEntries(
    input: ListWorkspaceEntriesQuery,
    signal?: AbortSignal,
  ): Promise<WorkspaceDirectoryProjection> {
    const parsed = ListWorkspaceEntriesQuerySchema.safeParse(input);
    if (!parsed.success) throw browserError("workspace.browser_invalid_query", "workspace query is invalid");
    const query = parsed.data;
    const internalTaskId = parseDesktopTaskId(query.taskId);
    const selection = await this.#tasks.loadTaskRuntimeSelection(internalTaskId);
    if (
      selection === undefined
      || selection.taskId !== internalTaskId
      || !hasValidTaskRuntimeSelection(selection)
    ) {
      throw browserError(
        "workspace.browser_task_selection_unavailable",
        "task runtime selection is unavailable or invalid",
      );
    }
    if (selection.workspaceGrantId === undefined) {
      throw browserError(
        "workspace.browser_task_workspace_unlocked",
        "task does not have a locked workspace",
      );
    }
    const grant = await this.#workspaces.loadWorkspaceGrant(selection.workspaceGrantId);
    if (grant === undefined) {
      throw browserError("workspace.browser_grant_missing", "locked workspace grant is missing");
    }
    if (grant.status !== "active") {
      throw browserError("workspace.browser_grant_revoked", "locked workspace grant is revoked");
    }

    let directoryRelativePath = "";
    if (query.parentEntryId !== undefined) {
      const parent = this.#proofs.openEntry(query.parentEntryId);
      if (
        parent.taskId !== query.taskId
        || parent.selectionDigest !== selection.selectionDigest
        || parent.workspaceGrantId !== grant.workspaceGrantId
        || parent.entryKind !== "directory"
      ) throw browserError("workspace.browser_proof_scope_mismatch", "workspace proof scope does not match the task");
      directoryRelativePath = parent.relativePath;
    }

    const visibleEntries = this.#visibility.filterAndSort(await this.#reader.readDirectory({
      rootRealPath: grant.rootRealPath,
      directoryRelativePath,
      ...(signal === undefined ? {} : { signal }),
    }));
    const snapshotDigest = sha256CanonicalJson(JsonValueSchema.parse(visibleEntries));
    let offset = 0;
    if (query.cursor !== undefined) {
      const cursor = this.#proofs.openCursor(query.cursor);
      if (
        cursor.taskId !== query.taskId
        || cursor.selectionDigest !== selection.selectionDigest
        || cursor.workspaceGrantId !== grant.workspaceGrantId
        || cursor.directoryRelativePath !== directoryRelativePath
        || cursor.snapshotDigest !== snapshotDigest
        || !Number.isSafeInteger(cursor.offset)
        || cursor.offset <= 0
        || cursor.offset >= visibleEntries.length
      ) throw browserError("workspace.browser_cursor_stale", "workspace cursor is stale or belongs to another view");
      offset = cursor.offset;
    }

    const limit = query.limit ?? DEFAULT_LIMIT;
    const page = visibleEntries.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const truncated = nextOffset < visibleEntries.length;
    const projection = WorkspaceDirectoryProjectionSchema.parse({
      contractVersion: "v1alpha2",
      workspaceGrantId: grant.workspaceGrantId,
      ...(query.parentEntryId === undefined ? {} : { parentEntryId: query.parentEntryId }),
      breadcrumbDisplayNames: directoryRelativePath === ""
        ? []
        : directoryRelativePath.split("/"),
      entries: page.map((entry) => ({
        entryId: this.#proofs.sealEntry({
          kind: "entry",
          taskId: query.taskId,
          selectionDigest: selection.selectionDigest,
          workspaceGrantId: grant.workspaceGrantId,
          relativePath: entry.relativePath,
          entryKind: entry.kind,
        }),
        displayName: entry.displayName,
        kind: entry.kind,
        navigable: entry.kind === "directory",
        ...(entry.sizeBytes === undefined ? {} : { sizeBytes: entry.sizeBytes }),
        ...(entry.modifiedAt === undefined ? {} : { modifiedAt: entry.modifiedAt }),
        ...(entry.kind === "symlink"
          ? { unavailableReason: "workspace.symlink_navigation_disabled" }
          : {}),
      })),
      ...(truncated
        ? {
          nextCursor: this.#proofs.sealCursor({
            kind: "cursor",
            taskId: query.taskId,
            selectionDigest: selection.selectionDigest,
            workspaceGrantId: grant.workspaceGrantId,
            directoryRelativePath,
            snapshotDigest,
            offset: nextOffset,
          }),
        }
        : {}),
      truncated,
      snapshotDigest,
    });
    if (Buffer.byteLength(JSON.stringify(projection), "utf8") > MAX_RESPONSE_BYTES) {
      throw browserError(
        "workspace.browser_response_too_large",
        "workspace response exceeds the bounded size limit",
      );
    }
    return projection;
  }
}

function parseDesktopTaskId(taskId: string): string {
  const internal = taskId.startsWith("task:") ? taskId.slice("task:".length) : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(internal)) {
    throw browserError("workspace.browser_invalid_task_id", "Desktop task ID is invalid");
  }
  return internal;
}

function browserError(code: string, message: string): WorkspaceBrowserPortError {
  return new WorkspaceBrowserPortError(code, message);
}
