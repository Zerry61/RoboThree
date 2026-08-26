import { lstat, realpath, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  WorkspaceSelectionError,
  type WorkspacePathResolver,
} from "../../ports/workspace-selection.js";

export class NodeWorkspacePathResolver implements WorkspacePathResolver {
  async resolveDirectory(selectedPath: string): Promise<{
    rootRealPath: string;
    rootDisplayPath: string;
  }> {
    if (!isAbsolute(selectedPath)) {
      throw new WorkspaceSelectionError(
        "workspace.path_not_absolute",
        "workspace selection must resolve to an absolute path",
      );
    }
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(selectedPath);
    } catch {
      throw new WorkspaceSelectionError(
        "workspace.path_not_found",
        "workspace selection does not exist",
      );
    }
    try {
      if (!(await stat(canonicalPath)).isDirectory()) {
        throw new WorkspaceSelectionError(
          "workspace.path_not_directory",
          "workspace selection must resolve to a directory",
        );
      }
    } catch (error) {
      if (error instanceof WorkspaceSelectionError) throw error;
      throw new WorkspaceSelectionError(
        "workspace.path_unresolvable",
        "workspace selection metadata cannot be resolved",
      );
    }
    return {
      rootRealPath: canonicalPath,
      rootDisplayPath: canonicalPath,
    };
  }

  async resolveWithinDirectory(input: {
    rootRealPath: string;
    relativePath: string;
    allowMissingLeaf?: boolean;
  }): Promise<string> {
    validateRelativePath(input.relativePath);
    const canonicalRoot = await resolveExisting(input.rootRealPath);
    const candidate = resolve(join(canonicalRoot, input.relativePath));
    let canonicalTarget: string;
    try {
      canonicalTarget = await realpath(candidate);
    } catch {
      if (!input.allowMissingLeaf) {
        throw new WorkspaceSelectionError(
          "workspace.path_not_found",
          "workspace target does not exist",
        );
      }
      try {
        await lstat(candidate);
        throw new WorkspaceSelectionError(
          "workspace.path_unresolvable",
          "workspace target exists but cannot be resolved safely",
        );
      } catch (error) {
        if (error instanceof WorkspaceSelectionError) throw error;
        if (
          typeof error !== "object"
          || error === null
          || !("code" in error)
          || error.code !== "ENOENT"
        ) {
          throw new WorkspaceSelectionError(
            "workspace.path_unresolvable",
            "workspace target metadata cannot be resolved safely",
          );
        }
      }
      const canonicalParent = await resolveExisting(dirname(candidate));
      canonicalTarget = join(canonicalParent, basename(candidate));
    }
    if (!isWithin(canonicalRoot, canonicalTarget)) {
      throw new WorkspaceSelectionError(
        "workspace.path_outside_grant",
        "workspace target resolves outside the granted directory",
      );
    }
    return canonicalTarget;
  }
}

function validateRelativePath(value: string): void {
  if (
    value.length === 0
    || value.length > 4096
    || isAbsolute(value)
    || value.includes("\0")
  ) {
    throw new WorkspaceSelectionError(
      "workspace.path_invalid_relative",
      "workspace target must be a non-empty relative path",
    );
  }
  const segments = value.split(/[\\/]/u);
  if (
    segments.some((segment) =>
      segment.length === 0
      || segment === "."
      || segment === ".."
      || segment.normalize("NFC") !== segment)
  ) {
    throw new WorkspaceSelectionError(
      "workspace.path_invalid_relative",
      "workspace target contains an invalid path segment",
    );
  }
}

async function resolveExisting(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    throw new WorkspaceSelectionError(
      "workspace.path_unresolvable",
      "workspace path cannot be resolved",
    );
  }
}

function isWithin(root: string, target: string): boolean {
  const offset = relative(root, target);
  return offset === "" || (!offset.startsWith(`..${sep}`) && offset !== ".." && !isAbsolute(offset));
}
