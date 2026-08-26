import type {
  ListWorkspaceEntriesQuery,
  OpenTaskWorkspaceLocationCommand,
  WorkspaceDirectoryProjection,
  WorkspaceEntryKind,
} from "@robothree/contracts";

export type RawWorkspaceEntry = Readonly<{
  relativePath: string;
  displayName: string;
  kind: WorkspaceEntryKind;
  sizeBytes?: number;
  modifiedAt?: string;
}>;

export interface WorkspaceDirectoryReader {
  readDirectory(input: Readonly<{
    rootRealPath: string;
    directoryRelativePath: string;
    signal?: AbortSignal;
  }>): Promise<readonly RawWorkspaceEntry[]>;
  readRootIdentity(input: Readonly<{
    rootRealPath: string;
    signal?: AbortSignal;
  }>): Promise<WorkspaceRootIdentity>;
}

export type WorkspaceRootIdentity = Readonly<{
  rootRealPath: string;
  device: string;
  inode: string;
  mode: number;
}>;

export type WorkspaceEntryProof = Readonly<{
  kind: "entry";
  taskId: string;
  selectionDigest: string;
  workspaceGrantId: string;
  relativePath: string;
  entryKind: WorkspaceEntryKind;
}>;

export type WorkspaceCursorProof = Readonly<{
  kind: "cursor";
  taskId: string;
  selectionDigest: string;
  workspaceGrantId: string;
  directoryRelativePath: string;
  snapshotDigest: string;
  offset: number;
}>;

export type WorkspaceRevealAuthorityProof = Readonly<{
  kind: "reveal_authority";
  taskId: string;
  selectionDigest: string;
  workspaceGrantId: string;
  root: WorkspaceRootIdentity;
  runtimeInstanceId: string;
  commandId: string;
  expiresAtEpochMs: number;
}>;

export interface WorkspaceBrowserProofCodec {
  sealEntry(proof: WorkspaceEntryProof): string;
  openEntry(token: string): WorkspaceEntryProof;
  sealCursor(proof: WorkspaceCursorProof): string;
  openCursor(token: string): WorkspaceCursorProof;
  sealRevealAuthority(proof: WorkspaceRevealAuthorityProof): string;
  openRevealAuthority(token: string): WorkspaceRevealAuthorityProof;
}

export interface WorkspaceBrowser {
  listEntries(
    query: ListWorkspaceEntriesQuery,
    signal?: AbortSignal,
  ): Promise<WorkspaceDirectoryProjection>;
}

export interface WorkspaceRevealAuthorityServicePort {
  prepare(
    command: OpenTaskWorkspaceLocationCommand,
    signal?: AbortSignal,
  ): Promise<Readonly<{ authorityToken: string }>>;
  consume(
    input: Readonly<{
      command: OpenTaskWorkspaceLocationCommand;
      authorityToken: string;
    }>,
    signal?: AbortSignal,
  ): Promise<Readonly<{
    commandId: string;
    taskId: string;
    workspaceGrantId: string;
    root: WorkspaceRootIdentity;
  }>>;
}

export class WorkspaceBrowserPortError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkspaceBrowserPortError";
    this.code = code;
  }
}
