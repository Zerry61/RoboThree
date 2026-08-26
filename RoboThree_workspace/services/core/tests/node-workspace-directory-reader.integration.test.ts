import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeWorkspaceDirectoryReader } from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DFI-1A NodeWorkspaceDirectoryReader", () => {
  it("reads one layer and never follows internal or escaping symlinks", async () => {
    const root = await temporary("robothree-dfi1a-root-");
    const outside = await temporary("robothree-dfi1a-outside-");
    await mkdir(join(root, "src"));
    await writeFile(join(root, "note.txt"), "hello");
    await symlink(join(root, "src"), join(root, "internal-link"));
    await symlink(outside, join(root, "outside-link"));
    const entries = await new NodeWorkspaceDirectoryReader().readDirectory({
      rootRealPath: root,
      directoryRelativePath: "",
    });
    expect(entries.map((entry) => [entry.displayName, entry.kind])).toEqual(expect.arrayContaining([
      ["src", "directory"],
      ["note.txt", "file"],
      ["internal-link", "symlink"],
      ["outside-link", "symlink"],
    ]));
    expect(entries.find((entry) => entry.displayName === "note.txt")?.sizeBytes).toBe(5);
  });

  it.each(["../outside", "/private/tmp", "C:\\Windows", "\\\\server\\share", "a\0b"])(
    "rejects unsafe directory input %s without echoing the path",
    async (relativePath) => {
      const root = await temporary("robothree-dfi1a-invalid-");
      const promise = new NodeWorkspaceDirectoryReader().readDirectory({
        rootRealPath: root,
        directoryRelativePath: relativePath,
      });
      await expect(promise).rejects.toMatchObject({
        code: "workspace.browser_invalid_relative_path",
      });
      await expect(promise).rejects.not.toThrow(relativePath);
    },
  );

  it("honors cancellation and keeps errors path-free", async () => {
    const root = await temporary("robothree-dfi1a-cancel-");
    const controller = new AbortController();
    controller.abort();
    await expect(new NodeWorkspaceDirectoryReader().readDirectory({
      rootRealPath: root,
      directoryRelativePath: "",
      signal: controller.signal,
    })).rejects.toMatchObject({ code: "workspace.browser_cancelled" });
    await expect(new NodeWorkspaceDirectoryReader().readDirectory({
      rootRealPath: root,
      directoryRelativePath: "missing",
    })).rejects.toMatchObject({ code: "workspace.browser_directory_unavailable" });
  });
});

async function temporary(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}
