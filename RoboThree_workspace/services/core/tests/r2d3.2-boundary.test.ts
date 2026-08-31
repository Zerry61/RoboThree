import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AGENT_DEFINITION_V1ALPHA2_PRODUCTION_CONSUMER_ENABLED,
  CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED,
  R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY,
} from "../src/index.js";

const root = process.cwd();

describe("R2D-3.2 architecture and release boundary", () => {
  it("keeps all production activation facts false", () => {
    expect(AGENT_DEFINITION_V1ALPHA2_PRODUCTION_CONSUMER_ENABLED).toBe(false);
    expect(R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY).toBe(false);
    expect(CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED).toBe(false);
  });

  it("allows only the later-authorized R2D-P.2 production source", async () => {
    const implementations: string[] = [];
    for (const file of await sourceFiles(resolve(root, "services/core/src"))) {
      const source = await readFile(file, "utf8");
      if (/implements\s+TaskResourceEntitlementSource\b/u.test(source)) {
        implementations.push(relative(root, file));
      }
    }
    expect(implementations).toEqual([
      "services/core/src/application/local-desktop-r2d-production.ts",
    ]);
  });

  it("allows the later-authorized built-in Agent graph while keeping the scripted fixture demo-only", async () => {
    const bootstrap = await readFile(resolve(
      root,
      "services/core/src/bootstrap/create-desktop-private-runtime.ts",
    ), "utf8");
    expect(bootstrap).toMatch(/BuiltInGeneralAgentSource/u);
    expect(bootstrap).toMatch(/createScriptedDesktopAgentFixture/u);
    expect(bootstrap).toMatch(/const fixtureMode = demoMode \|\| legacyTestMode/u);
    expect(bootstrap).toMatch(/if \(fixtureMode\) \{\s*catalog\.registerAgent/u);
    expect(bootstrap).toMatch(/const executionAgents = fixtureMode[\s\S]*builtInGeneralAgent/u);
    expect(bootstrap).not.toMatch(/agent\.fixture\.desktop-scripted/u);
  });

  it("keeps the scripted fixture outside the Core root export", async () => {
    const rootIndex = await readFile(resolve(root, "services/core/src/index.ts"), "utf8");
    expect(rootIndex).not.toMatch(/scripted-desktop-agent-fixture/u);
    const fixture = await readFile(resolve(
      root,
      "services/core/src/adapters/fake/scripted-desktop-agent-fixture.ts",
    ), "utf8");
    expect(fixture).toContain("agent.fixture.desktop-scripted");
    expect(fixture).not.toContain("agent.general");
  });

  it("keeps R2D-3.3, Provider, Desktop, Admin and Central consumers absent", async () => {
    const unexpected: string[] = [];
    for (const directory of [
      "apps/desktop/src",
      "apps/admin-console/src",
      "services/central-service/src/main",
      "services/document-worker/src",
    ]) {
      for (const file of await sourceFiles(resolve(root, directory))) {
        const source = await readFile(file, "utf8");
        if (/AgentResourceDecisionPlanner|BuiltInGeneralAgentSource|TaskResourceEntitlementSource|agent\.fixture\.desktop-scripted/u.test(source)) {
          unexpected.push(relative(root, file));
        }
      }
    }
    expect(unexpected).toEqual([]);
  });

  it("keeps migration and dependency bytes unchanged", async () => {
    const migrations = await readFile(resolve(
      root,
      "services/core/src/adapters/sqlite/migrations.ts",
    ), "utf8");
    const ids = [...migrations.matchAll(/\bid:\s*(\d+),/gu)]
      .map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    expect(migrations).not.toMatch(/\bid:\s*27,/u);
    const lockfile = await readFile(resolve(root, "pnpm-lock.yaml"));
    expect(createHash("sha256").update(lockfile).digest("hex")).toBe(
      "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31",
    );
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && /\.(?:ts|tsx|vue|java)$/u.test(path)) files.push(path);
  }
  return files.sort();
}
