import { describe, it, expect, afterEach } from "vitest";
import { resolveSafePath, PathGuardError } from "../../src/security/path-guard.js";
import { tmpdir } from "node:os";
import {
  realpathSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

describe("resolveSafePath", () => {
  let roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
    roots = [];
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "dw-path-guard-"));
    roots.push(root);
    return root;
  }

  it("resolves a readable regular file inside the workspace", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "report.xlsx"), "data");

    const result = await resolveSafePath(root, "report.xlsx");

    expect(result).toBe(realpathSync(resolve(root, "report.xlsx")));
  });

  it("resolves a nested readable regular file", async () => {
    const root = tempRoot();
    mkdirSync(join(root, "sub", "dir"), { recursive: true });
    writeFileSync(join(root, "sub", "dir", "file.pdf"), "data");

    const result = await resolveSafePath(root, "sub/dir/file.pdf");

    expect(result).toBe(realpathSync(resolve(root, "sub", "dir", "file.pdf")));
  });

  it("rejects empty relative path", async () => {
    await expect(resolveSafePath(tempRoot(), "")).rejects.toMatchObject({
      code: "path_guard.not_found",
    });
  });

  it("rejects traversal before realpath", async () => {
    await expect(resolveSafePath(tempRoot(), "../etc/passwd")).rejects.toMatchObject({
      code: "path_guard.traversal",
    });
    await expect(
      resolveSafePath(tempRoot(), "sub/../../../etc/passwd"),
    ).rejects.toMatchObject({
      code: "path_guard.traversal",
    });
  });

  it("rejects POSIX absolute path", async () => {
    await expect(resolveSafePath(tempRoot(), "/etc/passwd")).rejects.toMatchObject({
      code: "path_guard.absolute_path",
    });
  });

  it("rejects Windows drive absolute and UNC paths on non-Windows hosts", async () => {
    await expect(resolveSafePath(tempRoot(), "C:\\Users\\file.xlsx")).rejects.toMatchObject({
      code: "path_guard.absolute_path",
    });
    await expect(resolveSafePath(tempRoot(), "\\\\server\\share\\file.xlsx")).rejects.toMatchObject({
      code: "path_guard.absolute_path",
    });
  });

  it("rejects Windows separators in relative paths", async () => {
    await expect(resolveSafePath(tempRoot(), "sub\\file.pdf")).rejects.toMatchObject({
      code: "path_guard.traversal",
    });
  });

  it("rejects null bytes", async () => {
    await expect(resolveSafePath(tempRoot(), "report.pdf\0.exe")).rejects.toMatchObject({
      code: "path_guard.traversal",
    });
  });

  it("rejects final file symlink escaping outside the workspace", async () => {
    const root = tempRoot();
    const outsideRoot = tempRoot();
    const outsideTarget = join(outsideRoot, "outside.txt");
    writeFileSync(outsideTarget, "secret");
    symlinkSync(outsideTarget, join(root, "escape.link"));

    await expect(resolveSafePath(root, "escape.link")).rejects.toMatchObject({
      code: "path_guard.symlink_escape",
    });
  });

  it("rejects parent directory symlink escaping outside the workspace", async () => {
    const root = tempRoot();
    const outsideRoot = tempRoot();
    writeFileSync(join(outsideRoot, "outside.txt"), "secret");
    symlinkSync(outsideRoot, join(root, "external-dir"));

    await expect(resolveSafePath(root, "external-dir/outside.txt")).rejects.toMatchObject({
      code: "path_guard.symlink_escape",
    });
  });

  it("allows symlinks that resolve to regular files inside the same workspace", async () => {
    const root = tempRoot();
    mkdirSync(join(root, "safe"), { recursive: true });
    writeFileSync(join(root, "safe", "inside.txt"), "ok");
    symlinkSync(join(root, "safe", "inside.txt"), join(root, "inside.link"));

    const result = await resolveSafePath(root, "inside.link");

    expect(result).toBe(realpathSync(resolve(root, "safe", "inside.txt")));
  });

  it("allows workspace root itself to be a symlink when target file stays inside canonical root", async () => {
    const realRoot = tempRoot();
    writeFileSync(join(realRoot, "inside.txt"), "ok");
    const symlinkParent = tempRoot();
    const symlinkRoot = join(symlinkParent, "workspace-link");
    symlinkSync(realRoot, symlinkRoot);

    const result = await resolveSafePath(symlinkRoot, "inside.txt");

    expect(result).toBe(realpathSync(resolve(realRoot, "inside.txt")));
  });

  it("rejects missing target and directory target without exposing local path", async () => {
    const root = tempRoot();
    await expect(resolveSafePath(root, "missing.txt")).rejects.toMatchObject({
      code: "path_guard.not_found",
    });

    mkdirSync(join(root, "dir"));
    await expect(resolveSafePath(root, "dir")).rejects.toMatchObject({
      code: "path_guard.not_file",
    });

    try {
      await resolveSafePath(root, "missing.txt");
    } catch (error) {
      expect(error).toBeInstanceOf(PathGuardError);
      expect((error as Error).message).not.toContain(root);
    }
  });
});
