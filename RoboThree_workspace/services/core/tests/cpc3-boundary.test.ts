import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED } from "../src/index.js";

const root = process.cwd();

describe("CPC-3 closure boundary", () => {
  it("keeps production activation disabled and test composition unreachable", async () => {
    expect(CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED).toBe(false);
    const bootstrap = await readFile(resolve(
      root,
      "services/core/src/bootstrap/create-desktop-private-runtime.ts",
    ), "utf8");
    expect(bootstrap).toContain(
      "const cpcInstructionRuntimeEnabled = CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED",
    );
    expect(bootstrap).not.toMatch(/CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED\s*=\s*true/u);
    expect(bootstrap).not.toMatch(/cpc3|CPC3/u);
  });

  it("keeps production Skill resolvers at zero and fixtures outside the source graph", async () => {
    const implementations: string[] = [];
    for (const file of await sourceFiles(resolve(root, "services/core/src"))) {
      const source = await readFile(file, "utf8");
      if (/implements\s+LockedSkillInstructionResolver/u.test(source)) {
        implementations.push(relative(root, file));
      }
      expect(source).not.toMatch(/cpc3-lifecycle-child|CPC3_EVAL_CORPUS/u);
    }
    expect(implementations).toEqual([]);
  });

  it("uses the validated materializer path in production and keeps compatibility API isolated", async () => {
    const runtime = await readFile(resolve(
      root,
      "services/core/src/application/task-locked-instruction-runtime.ts",
    ), "utf8");
    expect(runtime).toContain("this.#materializer.materializeValidated({");
    expect(runtime).not.toContain("this.#materializer.materialize({");
    const productionConsumers: string[] = [];
    for (const file of await sourceFiles(resolve(root, "services/core/src"))) {
      if (file.endsWith("instruction-bundle-domain.ts")) continue;
      const source = await readFile(file, "utf8");
      if (/deriveTaskInstructionBindingV1\(/u.test(source)) {
        productionConsumers.push(relative(root, file));
      }
    }
    expect(productionConsumers).toEqual([]);
  });

  it("keeps safe summaries exhaustive without a generic default", async () => {
    const domain = await readFile(resolve(
      root,
      "services/core/src/application/instruction-bundle-domain.ts",
    ), "utf8");
    const starter = await readFile(resolve(
      root,
      "services/core/src/application/durable-agent-loop-starter.ts",
    ), "utf8");
    const union = domain.slice(
      domain.indexOf("export type CpcInstructionFoundationErrorCode"),
      domain.indexOf("export class CpcInstructionFoundationError"),
    );
    const summary = starter.slice(
      starter.indexOf("function cpcSafeSummary"),
      starter.indexOf("function instructionContext"),
    );
    const codes = [...union.matchAll(/\|\s+"([^"]+)"/gu)].map((match) => match[1]);
    expect(codes).toHaveLength(9);
    for (const code of codes) expect(summary).toContain(`case "${code}":`);
    expect(summary).not.toMatch(/\bdefault\s*:/u);
  });

  it("does not add migration, Contract, Provider, Desktop or Admin production surface", async () => {
    const migrations = await readFile(resolve(
      root,
      "services/core/src/adapters/sqlite/migrations.ts",
    ), "utf8");
    const ids = [...migrations.matchAll(/\bid:\s*(\d+),/gu)].map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    expect(migrations).not.toMatch(/\bid:\s*27,/u);
    for (const directory of [
      "packages/contracts/src",
      "services/core/src/adapters/https",
      "apps/desktop/src",
      "apps/admin-console/src",
    ]) {
      for (const file of await sourceFiles(resolve(root, directory))) {
        expect(await readFile(file, "utf8")).not.toMatch(/CPC3_EVAL_CORPUS|cpc3-lifecycle/u);
      }
    }
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
