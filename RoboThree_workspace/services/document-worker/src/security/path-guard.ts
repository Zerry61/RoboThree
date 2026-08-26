import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep, win32 } from "node:path";

export class PathGuardError extends Error {
  public readonly code:
    | "path_guard.absolute_path"
    | "path_guard.traversal"
    | "path_guard.symlink_escape"
    | "path_guard.not_found"
    | "path_guard.not_readable"
    | "path_guard.not_file";

  public constructor(code: PathGuardError["code"], message: string) {
    super(message);
    this.name = "PathGuardError";
    this.code = code;
  }
}

export async function resolveSafePath(
  workspaceRoot: string,
  relativePath: string,
): Promise<string> {
  validateInputPath(relativePath);

  const rootRealPath = await canonicalWorkspaceRoot(workspaceRoot);
  const lexicalTarget = resolve(rootRealPath, relativePath);
  if (!isContained(rootRealPath, lexicalTarget)) {
    throw new PathGuardError(
      "path_guard.traversal",
      "Path traversal detected",
    );
  }

  let targetRealPath: string;
  try {
    targetRealPath = await realpath(lexicalTarget);
  } catch {
    throw new PathGuardError(
      "path_guard.not_found",
      "Target file was not found",
    );
  }

  if (!isContained(rootRealPath, targetRealPath)) {
    throw new PathGuardError(
      "path_guard.symlink_escape",
      "Path resolves outside the workspace",
    );
  }

  let targetStat;
  try {
    targetStat = await stat(targetRealPath);
  } catch {
    throw new PathGuardError(
      "path_guard.not_found",
      "Target file was not found",
    );
  }

  if (!targetStat.isFile()) {
    throw new PathGuardError(
      "path_guard.not_file",
      "Target must be a regular file",
    );
  }

  try {
    await access(targetRealPath, constants.R_OK);
  } catch {
    throw new PathGuardError(
      "path_guard.not_readable",
      "Target file is not readable",
    );
  }

  return targetRealPath;
}

function validateInputPath(relativePath: string): void {
  if (relativePath.length === 0) {
    throw new PathGuardError(
      "path_guard.not_found",
      "Relative path must not be empty",
    );
  }

  if (relativePath.includes("\0")) {
    throw new PathGuardError(
      "path_guard.traversal",
      "Path contains null bytes",
    );
  }

  if (
    isAbsolute(relativePath) ||
    win32.isAbsolute(relativePath) ||
    relativePath.startsWith("\\\\")
  ) {
    throw new PathGuardError(
      "path_guard.absolute_path",
      "Absolute paths are not allowed",
    );
  }

  if (relativePath.includes("\\")) {
    throw new PathGuardError(
      "path_guard.traversal",
      "Windows path separators are not allowed",
    );
  }
}

async function canonicalWorkspaceRoot(workspaceRoot: string): Promise<string> {
  let rootRealPath: string;
  try {
    rootRealPath = await realpath(workspaceRoot);
  } catch {
    throw new PathGuardError(
      "path_guard.not_found",
      "Workspace root was not found",
    );
  }

  if (rootRealPath.length === 0 || rootRealPath === sep) {
    throw new PathGuardError(
      "path_guard.traversal",
      "Invalid workspace root",
    );
  }

  return rootRealPath;
}

function isContained(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}
