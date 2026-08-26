import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeModuleSource, runBoundaryChecks } from "./check-boundaries.mjs";

const workspaceRoot = "/workspace";
const contractsFile = "/workspace/packages/contracts/src/example.ts";
const kernelFile = "/workspace/services/core/src/kernel/example.ts";
const temporaryRoots = [];

describe("architecture boundary checks", () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  it.each([
    ['import fs from "fs";', "Node system APIs"],
    ['import fs from "node:fs/promises";', "Node system APIs"],
    ['const electron = require("electron");', "Electron"],
    ['const sdk = await import("openai");', "provider SDKs"],
    ['export { createCore } from "@robothree/core";', "Core implementation"],
    ['import sqlite = require("better-sqlite3");', "databases"],
  ])("rejects forbidden contracts dependency: %s", (source, expectedReason) => {
    const violations = analyzeModuleSource({
      boundary: "contracts",
      filePath: contractsFile,
      source,
      workspaceRoot,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(expectedReason);
  });

  it("rejects RuntimeAdapterHandle declarations from contracts", () => {
    const violations = analyzeModuleSource({
      boundary: "contracts",
      filePath: contractsFile,
      source: "export interface RuntimeAdapterHandle { close(): void }",
      workspaceRoot,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("RuntimeAdapterHandle must not enter contracts");
  });

  it("rejects SelectedSkillContext declarations from public contracts", () => {
    const violations = analyzeModuleSource({
      boundary: "contracts",
      filePath: contractsFile,
      source: "export interface SelectedSkillContext { revision: string }",
      workspaceRoot,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("SelectedSkillContext must remain Core-internal");
  });

  it.each([
    ['import adapter from "../adapters/system-clock.js";', "concrete adapters"],
    ['const adapter = await import("../adapters/system-clock.js");', "concrete adapters"],
    ['const api = require("../api/server.js");', "delivery APIs"],
    ['export { client } from "openai";', "concrete SDKs"],
    ['import sqlite from "node:sqlite";', "SQLite"],
    ['import childProcess from "node:child_process";', "process or transport APIs"],
    ['import registry from "../registry/registry-builder.js";', "application registry"],
    ['import evaluator from "../application/authorization-evaluator.js";', "application orchestration"],
  ])("rejects forbidden kernel dependency: %s", (source, expectedReason) => {
    const violations = analyzeModuleSource({
      boundary: "kernel",
      filePath: kernelFile,
      source,
      workspaceRoot,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(expectedReason);
  });

  it("rejects non-literal dynamic module references in protected code", () => {
    const violations = analyzeModuleSource({
      boundary: "kernel",
      filePath: kernelFile,
      source: "const moduleName = '../adapters/system-clock.js'; await import(moduleName);",
      workspaceRoot,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("must use string literals");
  });

  it("allows ports and contracts imports from kernel", () => {
    const source = [
      'import type { Clock } from "../ports/clock.js";',
      'import type { CoreHealth } from "@robothree/contracts";',
      '// require("electron") in a comment must not trigger a violation',
      `const example = 'import("openai")';`,
    ].join("\n");

    expect(analyzeModuleSource({ boundary: "kernel", filePath: kernelFile, source, workspaceRoot })).toEqual([]);
  });

  it("scans JavaScript and TSX files and fails closed when a protected root is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-boundaries-"));
    temporaryRoots.push(root);
    const contractsRoot = join(root, "packages/contracts/src");
    const kernelRoot = join(root, "services/core/src/kernel");
    await mkdir(contractsRoot, { recursive: true });
    await mkdir(kernelRoot, { recursive: true });
    await writeFile(join(contractsRoot, "forbidden.cjs"), 'require("electron");\n');
    await writeFile(join(kernelRoot, "forbidden.tsx"), 'void import("../adapters/runner.js");\n');

    const violations = await runBoundaryChecks(root);
    expect(violations).toHaveLength(2);
    expect(violations.join("\n")).toContain("forbidden.cjs");
    expect(violations.join("\n")).toContain("forbidden.tsx");

    await rm(kernelRoot, { force: true, recursive: true });
    expect(await runBoundaryChecks(root)).toContain(
      "services/core/src/kernel: required architecture boundary root does not exist",
    );
  });
});
