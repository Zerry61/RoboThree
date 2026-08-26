import { lstat, opendir, realpath } from "node:fs/promises";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";

import {
  WorkspaceBrowserPortError,
  type RawWorkspaceEntry,
  type WorkspaceDirectoryReader,
  type WorkspaceRootIdentity,
} from "../../ports/workspace-browser.js";

const MAX_INTERNAL_ENTRIES = 10_000;

export class NodeWorkspaceDirectoryReader implements WorkspaceDirectoryReader {
  async readRootIdentity(input: Readonly<{
    rootRealPath: string;
    signal?: AbortSignal;
  }>): Promise<WorkspaceRootIdentity> {
    assertNotAborted(input.signal);
    const rootRealPath = await safeRealpath(
      input.rootRealPath,
      "workspace.browser_root_unavailable",
    );
    const metadata = await safeLstat(rootRealPath);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new WorkspaceBrowserPortError(
        "workspace.reveal_root_unavailable",
        "workspace root is not a readable directory",
      );
    }
    return Object.freeze({
      rootRealPath,
      device: String(metadata.dev),
      inode: String(metadata.ino),
      mode: metadata.mode,
    });
  }

  async readDirectory(input: Readonly<{
    rootRealPath: string;
    directoryRelativePath: string;
    signal?: AbortSignal;
  }>): Promise<readonly RawWorkspaceEntry[]> {
    validateRelativeDirectory(input.directoryRelativePath);
    assertNotAborted(input.signal);
    const root = await safeRealpath(input.rootRealPath, "workspace.browser_root_unavailable");
    const candidate = input.directoryRelativePath === ""
      ? root
      : resolve(join(root, input.directoryRelativePath));
    const directory = await safeRealpath(candidate, "workspace.browser_directory_unavailable");
    if (!isWithin(root, directory)) throw outsideGrant();
    const before = await safeLstat(directory);
    if (!before.isDirectory() || before.isSymbolicLink()) {
      throw new WorkspaceBrowserPortError(
        "workspace.browser_not_directory",
        "workspace entry is not a readable directory",
      );
    }

    let handle;
    try {
      handle = await opendir(directory);
      const entries: RawWorkspaceEntry[] = [];
      for await (const entry of handle) {
        assertNotAborted(input.signal);
        if (entries.length >= MAX_INTERNAL_ENTRIES) {
          throw new WorkspaceBrowserPortError(
            "workspace.browser_directory_too_large",
            "workspace directory exceeds the bounded listing limit",
          );
        }
        if (entry.name.length === 0 || entry.name.length > 512 || entry.name.includes("\0")) {
          continue;
        }
        const relativePath = input.directoryRelativePath === ""
          ? entry.name
          : posix.join(input.directoryRelativePath, entry.name);
        if (entry.isSymbolicLink()) {
          entries.push({ relativePath, displayName: entry.name, kind: "symlink" });
          continue;
        }
        const childPath = join(directory, entry.name);
        const childRealPath = await safeRealpath(
          childPath,
          "workspace.browser_entry_unavailable",
        );
        if (!isWithin(root, childRealPath)) throw outsideGrant();
        const metadata = await safeLstat(childPath);
        if (metadata.isSymbolicLink()) throw outsideGrant();
        const modifiedAt = metadata.mtime.toISOString();
        if (metadata.isDirectory()) {
          entries.push({
            relativePath,
            displayName: entry.name,
            kind: "directory",
            modifiedAt,
          });
        } else if (metadata.isFile()) {
          entries.push({
            relativePath,
            displayName: entry.name,
            kind: "file",
            sizeBytes: metadata.size,
            modifiedAt,
          });
        }
      }
      const after = await safeLstat(directory);
      if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode) {
        throw new WorkspaceBrowserPortError(
          "workspace.browser_identity_changed",
          "workspace directory identity changed during listing",
        );
      }
      return entries;
    } catch (error) {
      if (error instanceof WorkspaceBrowserPortError) throw error;
      if (isAbortError(error)) throw aborted();
      throw new WorkspaceBrowserPortError(
        "workspace.browser_read_failed",
        "workspace directory could not be read safely",
      );
    } finally {
      if (handle !== undefined) await handle.close().catch(() => undefined);
    }
  }
}

function validateRelativeDirectory(value: string): void {
  if (
    value.includes("\0")
    || isAbsolute(value)
    || /^[A-Za-z]:[\\/]/u.test(value)
    || value.startsWith("\\\\")
    || value.startsWith("//")
    || value.length > 4096
  ) throw invalidRelative();
  if (value === "") return;
  const parts = value.split(/[\\/]/u);
  if (parts.length > 64 || parts.some((part) => part === "" || part === "." || part === "..")) {
    throw invalidRelative();
  }
}

async function safeRealpath(path: string, code: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    throw new WorkspaceBrowserPortError(code, "workspace path is unavailable");
  }
}

async function safeLstat(path: string) {
  try {
    return await lstat(path);
  } catch {
    throw new WorkspaceBrowserPortError(
      "workspace.browser_metadata_unavailable",
      "workspace metadata is unavailable",
    );
  }
}

function isWithin(root: string, target: string): boolean {
  const offset = relative(root, target);
  return offset === "" || (!offset.startsWith(`..${sep}`) && offset !== ".." && !isAbsolute(offset));
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw aborted();
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function aborted(): WorkspaceBrowserPortError {
  return new WorkspaceBrowserPortError(
    "workspace.browser_cancelled",
    "workspace directory query was cancelled",
  );
}

function invalidRelative(): WorkspaceBrowserPortError {
  return new WorkspaceBrowserPortError(
    "workspace.browser_invalid_relative_path",
    "workspace directory proof contains an invalid relative path",
  );
}

function outsideGrant(): WorkspaceBrowserPortError {
  return new WorkspaceBrowserPortError(
    "workspace.browser_outside_grant",
    "workspace entry resolves outside the locked workspace",
  );
}
