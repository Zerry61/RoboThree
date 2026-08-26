import type { Clock } from "../../ports/clock.js";
import type { IdGenerator } from "../../ports/id-generator.js";
import {
  WorkspaceSelectionError,
  type WorkspaceSelectionContext,
  type WorkspaceSelectionIssuer,
  type WorkspaceSelectionResolver,
} from "../../ports/workspace-selection.js";

type SelectionRecord = Readonly<{
  selectedPath: string;
  clientInstanceId: string;
  correlationId: string;
  expiresAtMs: number;
}>;

const MAX_SELECTION_TTL_MS = 30_000;

/**
 * Process-local bridge between Electron Main's native directory picker and the
 * Core WorkspaceGrant command. Handles are opaque, single-use and intentionally
 * disappear when the Core process restarts.
 */
export class EphemeralWorkspaceSelectionStore
implements WorkspaceSelectionIssuer, WorkspaceSelectionResolver {
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #records = new Map<string, SelectionRecord>();

  constructor(input: { clock: Clock; ids: IdGenerator }) {
    this.#clock = input.clock;
    this.#ids = input.ids;
  }

  issue(input: WorkspaceSelectionContext & {
    selectedPath: string;
    ttlMs?: number;
  }): string {
    const ttlMs = Math.min(
      Math.max(Math.trunc(input.ttlMs ?? MAX_SELECTION_TTL_MS), 1),
      MAX_SELECTION_TTL_MS,
    );
    const nowMs = parseClock(this.#clock.now());
    const selectionHandle = this.#ids.next();
    this.#records.set(selectionHandle, {
      selectedPath: input.selectedPath,
      clientInstanceId: input.clientInstanceId,
      correlationId: input.correlationId,
      expiresAtMs: nowMs + ttlMs,
    });
    return selectionHandle;
  }

  async resolve(
    selectionHandle: string,
    context?: WorkspaceSelectionContext,
  ): Promise<string> {
    const record = this.#records.get(selectionHandle);
    if (record === undefined) {
      throw new WorkspaceSelectionError(
        "workspace.selection_not_found",
        "workspace selection handle is unknown",
      );
    }
    if (parseClock(this.#clock.now()) >= record.expiresAtMs) {
      this.#records.delete(selectionHandle);
      throw new WorkspaceSelectionError(
        "workspace.selection_expired",
        "workspace selection handle has expired",
      );
    }
    if (
      context === undefined
      || context.clientInstanceId !== record.clientInstanceId
      || context.correlationId !== record.correlationId
    ) {
      throw new WorkspaceSelectionError(
        "workspace.selection_context_mismatch",
        "workspace selection handle does not belong to this request",
      );
    }
    this.#records.delete(selectionHandle);
    return record.selectedPath;
  }

  discard(selectionHandle: string): void {
    this.#records.delete(selectionHandle);
  }

  clear(): void {
    this.#records.clear();
  }
}

function parseClock(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Clock returned an invalid timestamp");
  }
  return parsed;
}
