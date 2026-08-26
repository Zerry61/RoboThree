import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED,
  LEGACY_DESKTOP_PROMPT_REVISION,
} from "../src/index.js";

const root = process.cwd();

describe("CPC-2 architecture and activation boundary", () => {
  it("materializes after terminal replay and before Provider resolution", async () => {
    const source = await readFile(resolve(
      root,
      "services/core/src/application/durable-agent-loop-starter.ts",
    ), "utf8");
    const terminal = source.indexOf("const existingAssistant = terminalAssistant");
    const materialize = source.indexOf("this.#instructionRuntime.resolve");
    const provider = source.indexOf("const resolvedModel = await this.#modelProviders?.resolve");
    expect(terminal).toBeGreaterThan(0);
    expect(materialize).toBeGreaterThan(terminal);
    expect(provider).toBeGreaterThan(materialize);
  });

  it("keeps production disabled and uses one code-owned exact legacy marker", async () => {
    expect(CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED).toBe(false);
    expect(LEGACY_DESKTOP_PROMPT_REVISION).toMatch(/^sha256:9{64}$/u);
    const source = await readFile(resolve(
      root,
      "services/core/src/bootstrap/create-desktop-private-runtime.ts",
    ), "utf8");
    expect(source).toContain("platformPromptRevision: platformPromptRevisionForNewTask(");
    expect(source).toContain("enabled: cpcInstructionRuntimeEnabled");
    expect(source).toContain(
      "const cpcInstructionRuntimeEnabled = CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED",
    );
    expect(source).not.toContain('platformPromptRevision: digest("9")');
  });

  it("does not modify Provider-private production adapters or install a Skill resolver", async () => {
    const providers = await sourceFiles(resolve(root, "services/core/src/adapters/https"));
    for (const file of providers) {
      const source = await readFile(file, "utf8");
      expect(source).not.toMatch(/InstructionBundle|TaskLockedInstruction/u);
    }
    const core = await sourceFiles(resolve(root, "services/core/src"));
    const skillImplementations: string[] = [];
    for (const file of core) {
      const source = await readFile(file, "utf8");
      if (/implements\s+LockedSkillInstructionResolver/u.test(source)) {
        skillImplementations.push(relative(root, file));
      }
    }
    expect(skillImplementations).toEqual([]);
  });

  it("keeps Contracts, migration, Desktop, Admin, dependency and lockfile boundaries", async () => {
    const migrations = await readFile(resolve(
      root,
      "services/core/src/adapters/sqlite/migrations.ts",
    ), "utf8");
    const ids = [...migrations.matchAll(/\bid:\s*(\d+),/gu)].map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    expect(migrations).not.toMatch(/\bid:\s*27,/u);
    const contractFiles = await sourceFiles(resolve(root, "packages/contracts/src"));
    expect(contractFiles.filter((file) => /(?:cpc|instruction-bundle)/u.test(file))).toEqual([]);
    for (const directory of ["apps/desktop/src", "apps/admin-console/src"]) {
      for (const file of await sourceFiles(resolve(root, directory))) {
        expect(await readFile(file, "utf8")).not.toMatch(
          /task-locked-instruction-runtime|instruction-bundle-compiler/u,
        );
      }
    }
    const corePackage = JSON.parse(await readFile(resolve(
      root,
      "services/core/package.json",
    ), "utf8")) as { dependencies: Record<string, string> };
    expect(Object.keys(corePackage.dependencies).sort()).toEqual([
      "@robothree/contracts",
      "@robothree/document-worker",
      "zod",
    ]);
    expect(await readFile(resolve(root, "pnpm-lock.yaml"), "utf8"))
      .not.toContain("cpc-runtime-integration");
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && path.endsWith(".ts")) files.push(path);
  }
  return files.sort();
}
