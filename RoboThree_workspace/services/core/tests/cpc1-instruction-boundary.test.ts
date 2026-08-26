import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CPC_INSTRUCTION_FOUNDATION_DEFAULT_ENABLED,
  CpcInstructionCompilerConstants,
} from "../src/index.js";

const root = process.cwd();

describe("CPC-1 architecture boundary", () => {
  it("keeps the production feature disabled and outside Agent Loop integration", async () => {
    expect(CPC_INSTRUCTION_FOUNDATION_DEFAULT_ENABLED).toBe(false);
    const agentLoop = await readFile(resolve(
      root,
      "services/core/src/application/durable-agent-loop-starter.ts",
    ), "utf8");
    expect(agentLoop).not.toMatch(
      /instruction-bundle-compiler|TaskInstructionBundleMaterializer/u,
    );
  });

  it("does not install a production Locked Skill resolver", async () => {
    const files = await sourceFiles(resolve(root, "services/core/src"));
    const implementations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (/implements\s+LockedSkillInstructionResolver/u.test(source)) {
        implementations.push(relative(root, file));
      }
    }
    expect(implementations).toEqual([]);
  });

  it("keeps CPC types inside Core rather than adding a Contract subpath", async () => {
    const contractFiles = await sourceFiles(resolve(root, "packages/contracts/src"));
    expect(contractFiles.filter((file) => /(?:cpc|instruction-bundle)/u.test(file)))
      .toEqual([]);
    const rootExports = await readFile(resolve(
      root,
      "packages/contracts/src/index.ts",
    ), "utf8");
    expect(rootExports).not.toMatch(/InstructionBundle|TaskInstructionBinding/u);
  });

  it("does not expose CPC foundation through Desktop or Admin source graphs", async () => {
    const consumerFiles = [
      ...await sourceFiles(resolve(root, "apps/desktop/src")),
      ...await sourceFiles(resolve(root, "apps/admin-console/src")),
    ];
    const imports: string[] = [];
    for (const file of consumerFiles) {
      const source = await readFile(file, "utf8");
      if (
        /instruction-bundle|platform-prompt-source|LockedSkillInstructionResolver/u
          .test(source)
      ) imports.push(relative(root, file));
    }
    expect(imports).toEqual([]);
  });

  it("does not introduce migration 27", async () => {
    const migrations = await readFile(resolve(
      root,
      "services/core/src/adapters/sqlite/migrations.ts",
    ), "utf8");
    const ids = [...migrations.matchAll(/\bid:\s*(\d+),/gu)].map(
      (match) => Number(match[1]),
    );
    expect(Math.max(...ids)).toBe(26);
    expect(migrations).not.toMatch(/\bid:\s*27,/u);
  });

  it("keeps dynamic facts, references and Developer Role outside the compiler", () => {
    expect(CpcInstructionCompilerConstants).toMatchObject({
      dynamicFactsEnabled: false,
      referencesCompiledAsInstructions: false,
      developerRoleEnabled: false,
    });
  });

  it("limits CPC-2 production consumers to the runtime resolver and disabled composition", async () => {
    const files = await sourceFiles(resolve(root, "services/core/src"));
    const consumers: string[] = [];
    for (const file of files) {
      if (file.endsWith("instruction-bundle-compiler.ts")) continue;
      const source = await readFile(file, "utf8");
      if (/TaskInstructionBundleMaterializer/u.test(source)) {
        consumers.push(relative(root, file));
      }
    }
    expect(consumers).toEqual([
      "services/core/src/application/task-locked-instruction-runtime.ts",
      "services/core/src/bootstrap/create-desktop-private-runtime.ts",
    ]);
    expect(consumers.some((file) => file.includes("/adapters/https/"))).toBe(false);
  });

  it("keeps dependency and lockfile inputs unchanged", async () => {
    const lockfile = await readFile(resolve(root, "pnpm-lock.yaml"), "utf8");
    const corePackage = JSON.parse(await readFile(resolve(
      root,
      "services/core/package.json",
    ), "utf8")) as { dependencies: Record<string, string> };
    expect(lockfile).not.toContain("cpc-instruction");
    expect(Object.keys(corePackage.dependencies).sort()).toEqual([
      "@robothree/contracts",
      "@robothree/document-worker",
      "zod",
    ]);
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
