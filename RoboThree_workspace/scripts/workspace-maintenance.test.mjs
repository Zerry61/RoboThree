import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { cleanWorkspace } from "./clean.mjs";
import { createSourcePackage, shouldIncludeSourcePath } from "./package-source.mjs";

const execFileAsync = promisify(execFile);
const temporaryRoots = [];

describe("workspace maintenance", () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  it("cleans only the fixed generated paths and preserves source, dependencies, and QA evidence", async () => {
    const root = await createTemporaryRoot();
    const generatedPaths = [
      "packages/contracts/dist/index.js",
      "packages/contracts/tsconfig.tsbuildinfo",
      "services/core/dist/index.js",
      "services/core/tsconfig.tsbuildinfo",
      "apps/desktop/dist/main.js",
      "apps/desktop/tsconfig.renderer.tsbuildinfo",
      "services/central-service/target/app.jar",
    ];
    const preservedPaths = [
      "services/core/src/index.ts",
      "node_modules/example/index.js",
      "qa-reports/run/evidence.log",
    ];
    await Promise.all([...generatedPaths, ...preservedPaths].map((path) => writeFixture(root, path)));

    const removed = await cleanWorkspace({ root, log: () => {} });

    expect(removed).toContain("services/central-service/target");
    for (const path of generatedPaths) {
      await expect(stat(join(root, path))).rejects.toMatchObject({ code: "ENOENT" });
    }
    for (const path of preservedPaths) {
      await expect(stat(join(root, path))).resolves.toBeDefined();
    }
  });

  it("rejects unknown clean scopes", async () => {
    const root = await createTemporaryRoot();
    await expect(
      cleanWorkspace({ root, requestedProjects: ["../"], log: () => {} }),
    ).rejects.toThrow("Refusing to clean unknown project");
  });

  it.each([
    ["src/index.ts", false, true],
    [".env.example", false, true],
    ["node_modules/pkg/index.js", false, false],
    ["services/core/dist/index.js", false, false],
    ["services/central-service/target/app.jar", false, false],
    ["qa-reports/run/full-check.log", false, false],
    [".env", false, false],
    [".env.production", false, false],
    ["runtime/state.sqlite-wal", false, false],
    ["node_modules", true, false],
  ])("classifies delivery path %s", (path, isDirectory, expected) => {
    expect(shouldIncludeSourcePath(path, { isDirectory })).toBe(expected);
  });

  it("creates an archive with source, manifest, and checksum but no generated or sensitive files", async () => {
    const parent = await createTemporaryRoot();
    const workspaceRoot = join(parent, "RoboThree_workspace");
    const outputDirectory = join(parent, "deliverables");
    await writeFixture(
      workspaceRoot,
      "package.json",
      `${JSON.stringify({ name: "robothree", version: "0.0.0-test" })}\n`,
    );
    await writeFixture(workspaceRoot, "src/index.ts", "export const ready = true;\n");
    await writeFixture(workspaceRoot, ".env.example", "MODEL_API_KEY=\n");
    await writeFixture(workspaceRoot, ".env", "MODEL_API_KEY=secret\n");
    await writeFixture(workspaceRoot, "node_modules/pkg/index.js", "dependency\n");
    await writeFixture(workspaceRoot, "services/core/dist/index.js", "generated\n");
    await writeFixture(workspaceRoot, "qa-reports/run/full-check.log", "transient\n");
    await writeFixture(workspaceRoot, "docs/development/qa/report.md", "formal evidence\n");
    await writeFixture(workspaceRoot, "services/central-service/mvnw", "#!/bin/sh\n");
    await chmod(join(workspaceRoot, "services/central-service/mvnw"), 0o755);

    const result = await createSourcePackage({
      workspaceRoot,
      outputDirectory,
      now: new Date("2026-07-26T00:00:00.000Z"),
      log: () => {},
    });
    const { stdout } = await execFileAsync("tar", ["-tzf", result.archivePath]);
    const entries = stdout.trim().split("\n");

    expect(entries).toContain("RoboThree_workspace/src/index.ts");
    expect(entries).toContain("RoboThree_workspace/.env.example");
    expect(entries).toContain("RoboThree_workspace/docs/development/qa/report.md");
    expect(entries).toContain("RoboThree_workspace/SOURCE-MANIFEST.json");
    expect(entries.some((entry) => entry.includes("node_modules"))).toBe(false);
    expect(entries.some((entry) => entry.includes("/dist/"))).toBe(false);
    expect(entries.some((entry) => entry.includes("qa-reports"))).toBe(false);
    expect(entries).not.toContain("RoboThree_workspace/.env");
    expect(await readFile(result.checksumPath, "utf8")).toContain(result.archiveDigest);
    expect(result.manifest.files.map((file) => file.path)).toContain("src/index.ts");
  });

  it("refuses to write delivery output inside the source workspace", async () => {
    const root = await createTemporaryRoot();
    await writeFixture(
      root,
      "package.json",
      `${JSON.stringify({ name: "robothree", version: "0.0.0-test" })}\n`,
    );

    await expect(
      createSourcePackage({
        workspaceRoot: root,
        outputDirectory: join(root, "deliverables"),
        log: () => {},
      }),
    ).rejects.toThrow("outside RoboThree_workspace");
  });

  it("resolves output symlinks before enforcing the outside-workspace boundary", async () => {
    const parent = await createTemporaryRoot();
    const workspaceRoot = join(parent, "RoboThree_workspace");
    const outputLink = join(parent, "output-link");
    await writeFixture(
      workspaceRoot,
      "package.json",
      `${JSON.stringify({ name: "robothree", version: "0.0.0-test" })}\n`,
    );
    await symlink(workspaceRoot, outputLink, "dir");

    await expect(
      createSourcePackage({
        workspaceRoot,
        outputDirectory: outputLink,
        log: () => {},
      }),
    ).rejects.toThrow("outside RoboThree_workspace");
  });
});

async function createTemporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "robothree-maintenance-"));
  temporaryRoots.push(root);
  return root;
}

async function writeFixture(root, relativePath, contents = "fixture\n") {
  const path = join(root, relativePath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}
