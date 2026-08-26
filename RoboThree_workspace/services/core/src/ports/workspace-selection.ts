export type WorkspaceSelectionErrorCode =
  | "workspace.selection_not_found"
  | "workspace.selection_expired"
  | "workspace.selection_consumed"
  | "workspace.selection_context_mismatch"
  | "workspace.path_not_absolute"
  | "workspace.path_not_found"
  | "workspace.path_not_directory"
  | "workspace.path_unresolvable"
  | "workspace.path_invalid_relative"
  | "workspace.path_outside_grant";

export class WorkspaceSelectionError extends Error {
  readonly code: WorkspaceSelectionErrorCode;

  constructor(code: WorkspaceSelectionErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceSelectionError";
    this.code = code;
  }
}

/**
 * Resolves an opaque, short-lived handle issued by the trusted Desktop Main
 * process. The handle itself must never be persisted as a WorkspaceGrant.
 */
export interface WorkspaceSelectionResolver {
  resolve(
    selectionHandle: string,
    context?: WorkspaceSelectionContext,
  ): Promise<string>;
}

export type WorkspaceSelectionContext = Readonly<{
  clientInstanceId: string;
  correlationId: string;
}>;

export interface WorkspaceSelectionIssuer {
  issue(input: WorkspaceSelectionContext & {
    selectedPath: string;
    ttlMs?: number;
  }): string;
  discard(selectionHandle: string): void;
  clear(): void;
}

export interface WorkspacePathResolver {
  resolveDirectory(selectedPath: string): Promise<{
    rootRealPath: string;
    rootDisplayPath: string;
  }>;
  resolveWithinDirectory(input: {
    rootRealPath: string;
    relativePath: string;
    allowMissingLeaf?: boolean;
  }): Promise<string>;
}
