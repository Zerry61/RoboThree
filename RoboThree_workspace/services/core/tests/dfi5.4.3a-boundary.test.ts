import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";

describe("DFI-5.4.3A production graph boundaries", () => {
  it("has one production handler and one production entitlement source", async () => {
    const core = await readTree(join(root, "services/core/src"));
    expect(count(core, /class Dfi543LocalPersonalSubmitTurnHandler/gu)).toBe(1);
    expect(count(core, /class LocalDesktopTaskResourceEntitlementSource/gu)).toBe(1);
    expect(count(core, /DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_ENABLED = true/gu))
      .toBe(1);
  });

  it("keeps private mapping and credential material out of public Contracts", async () => {
    const contracts = await readTree(join(root, "packages/contracts/src"));
    expect(contracts).not.toMatch(
      /openai_reasoning_effort|anthropic_thinking_budget|productionAdmissionProof/gu,
    );
  });

  it("keeps Enterprise, DeepSeek and downstream production activation absent", async () => {
    const bootstrap = await source("services/core/src/bootstrap/create-desktop-private-runtime.ts");
    const central = await readTree(join(root, "services/central-service/src/main"));
    expect(bootstrap).not.toMatch(/DeepSeek|deepseek/gu);
    expect(central).not.toMatch(/DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_ENABLED/gu);
  });

  it("preserves migration, lockfile and the scoped package version strategy", async () => {
    const migrations = await source("services/core/src/adapters/sqlite/migrations.ts");
    const ids = [...migrations.matchAll(/\bid:\s*(\d+),/gu)]
      .map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    expect(createHash("sha256").update(await readFile(join(root, "pnpm-lock.yaml")))
      .digest("hex")).toBe(expectedLockfileDigest);
    const versions = await Promise.all([
      "package.json",
      "services/core/package.json",
      "packages/contracts/package.json",
      "apps/desktop/package.json",
      "apps/admin-console/package.json",
    ].map(async (path) => JSON.parse(await source(path)) as { version: string }));
    expect(versions.map((item) => item.version)).toEqual([
      "0.0.0-dfi.4a.4.1",
      "0.0.0-dfi.4a.4.1",
      "0.0.0-dfi.4a.4.1",
      "0.0.0-dfe.run.1.repair.1",
      "0.0.0-afe.6c",
    ]);
  });
});

function count(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function source(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

async function readTree(path: string): Promise<string> {
  const values: string[] = [];
  const visit = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (/\.(?:ts|java)$/u.test(entry.name)) values.push(await readFile(child, "utf8"));
    }
  };
  await visit(path);
  return values.join("\n");
}
