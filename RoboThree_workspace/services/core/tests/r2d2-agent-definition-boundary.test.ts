import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  AGENT_DEFINITION_V1ALPHA2_PRODUCTION_CONSUMER_ENABLED,
  createAgentDefinitionRevision,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("R2D-2 private export, zero drift and production boundary", () => {
  it("exposes the exact built private subpath without widening Contracts roots", async () => {
    const privateModule = await import(
      "@robothree/contracts/runtime-selection/agent-definition/v1alpha2"
    );
    expect(privateModule.AGENT_DEFINITION_SCHEMA_VERSION_V1ALPHA2).toBe("v1alpha2");
    expect(privateModule.AgentDefinitionRevisionV1Alpha2Schema).toBeDefined();

    const packageJson = JSON.parse(await readFile(resolve(
      root,
      "packages/contracts/package.json",
    ), "utf8")) as { exports: Record<string, unknown> };
    expect(packageJson.exports["./runtime-selection/agent-definition/v1alpha2"])
      .toEqual({
        types: "./dist/runtime-selection/agent-definition/v1alpha2/index.d.ts",
        import: "./dist/runtime-selection/agent-definition/v1alpha2/index.js",
      });
    const rootIndex = await readFile(resolve(root, "packages/contracts/src/index.ts"), "utf8");
    const runtimeIndex = await readFile(resolve(
      root,
      "packages/contracts/src/runtime-selection/index.ts",
    ), "utf8");
    expect(rootIndex).not.toMatch(/AgentDefinitionRevisionV1Alpha2|agent-definition\/v1alpha2/u);
    expect(runtimeIndex).not.toMatch(/AgentDefinitionRevisionV1Alpha2|agent-definition\/v1alpha2/u);
  });

  it("keeps frozen v1 and TaskRuntimeSelection v1alpha2 source bytes unchanged", async () => {
    const frozen = new Map([
      ["packages/contracts/src/runtime-selection/runtime-selection.ts", "8fce0bfb6e2a3d625a8c3f7801b83e513278a79763032ac6df6b409e84355e9a"],
      ["packages/contracts/src/runtime-selection/index.ts", "d11649dc3ae67b34b3816e7f1bdda8a0d53d9b48e2cdf60f189e967ff9a9073a"],
      ["packages/contracts/src/index.ts", "73fd6ae55e021c5e0b8daef416400ce5376ac61d5b8f2f5e7195d3072c6bd3b6"],
      ["packages/contracts/src/runtime-selection/v1alpha2.ts", "c8ecbed8c574d6332bb1837cc78f56d2da5bc0b747004ee5ccb529e19412ce8f"],
    ]);
    for (const [file, expected] of frozen) {
      const digest = createHash("sha256").update(await readFile(resolve(root, file))).digest("hex");
      expect(digest, file).toBe(expected);
    }
  });

  it("keeps the v1 Agent canonical digest corpus unchanged", () => {
    const record = createAgentDefinitionRevision({
      schemaVersion: "v1alpha1",
      agentDefinitionId: "agent.r2d2-frozen",
      name: "Frozen",
      identity: "Frozen identity",
      goal: "Frozen goal",
      instructions: "Frozen instructions",
      defaultModelId: "model.frozen",
      allowModelOverride: false,
      skillReferences: [],
      toolReferences: [],
      knowledgeReferences: [],
      requiredModelCapabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportsToolCalling: true,
        supportsStreaming: true,
      },
      createdAt: "2026-08-26T00:00:00.000Z",
    });
    expect(record.digest).toBe(
      "sha256:b6739b6313182df344718b45adee83884678066baa8026da162e49b0726a2479",
    );
  });

  it("keeps the v1alpha2 foundation unconsumed by production runtime", async () => {
    expect(AGENT_DEFINITION_V1ALPHA2_PRODUCTION_CONSUMER_ENABLED).toBe(false);
    const allowedDefinitions = new Set([
      "services/core/src/application/agent-definition-v1alpha2.ts",
      "services/core/src/application/agent-resource-decision-planner.ts",
      "services/core/src/application/built-in-general-agent-source.ts",
      "services/core/src/application/task-resource-entitlement.ts",
      "services/core/src/ports/readable-agent-definition-repository.ts",
      "services/core/src/ports/task-tool-candidate-policy.ts",
      "services/core/src/index.ts",
    ]);
    const unexpectedConsumers: string[] = [];
    for (const file of await sourceFiles(resolve(root, "services/core/src"))) {
      const path = relative(root, file);
      if (allowedDefinitions.has(path)) continue;
      const source = await readFile(file, "utf8");
      if (/AgentDefinitionRevisionV1Alpha2|agent-definition\/v1alpha2/u.test(source)) {
        unexpectedConsumers.push(path);
      }
    }
    expect(unexpectedConsumers).toEqual([]);
  });

  it("keeps private Agent v2 out of Desktop, Admin and Central", async () => {
    const unexpectedConsumers: string[] = [];
    for (const directory of [
      "apps/desktop/src",
      "apps/admin-console/src",
      "services/central-service/src/main",
    ]) {
      for (const file of await sourceFiles(resolve(root, directory))) {
        const source = await readFile(file, "utf8");
        if (/AgentDefinitionRevisionV1Alpha2|agent-definition\/v1alpha2/u.test(source)) {
          unexpectedConsumers.push(relative(root, file));
        }
      }
    }
    expect(unexpectedConsumers).toEqual([]);
  });

  it("keeps migration 27 absent, the lockfile stable and downstream disabled", async () => {
    const migrations = await readFile(resolve(
      root,
      "services/core/src/adapters/sqlite/migrations.ts",
    ), "utf8");
    const ids = [...migrations.matchAll(/\bid:\s*(\d+),/gu)].map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    expect(migrations).not.toMatch(/\bid:\s*27,/u);
    const lockfile = await readFile(resolve(root, "pnpm-lock.yaml"));
    expect(createHash("sha256").update(lockfile).digest("hex")).toBe(
      "c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07",
    );
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && /\.(?:ts|java)$/u.test(path)) files.push(path);
  }
  return files.sort();
}
