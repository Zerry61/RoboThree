import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("R2D-3.1 Contract/export/production boundary", () => {
  it("imports both exact built JS subpaths and emits declarations", async () => {
    const runtime = await import("@robothree/contracts/runtime-selection/v1alpha3");
    const coordination = await import(
      "@robothree/contracts/submit-turn-coordination/v1alpha4"
    );
    expect(runtime.RUNTIME_SELECTION_SCHEMA_VERSION_V1ALPHA3).toBe("v1alpha3");
    expect(coordination.SUBMIT_TURN_COORDINATION_SCHEMA_VERSION_V1ALPHA4)
      .toBe("v1alpha4");
    for (const file of [
      "packages/contracts/dist/runtime-selection/v1alpha3/index.js",
      "packages/contracts/dist/runtime-selection/v1alpha3/index.d.ts",
      "packages/contracts/dist/submit-turn-coordination/v1alpha4/index.js",
      "packages/contracts/dist/submit-turn-coordination/v1alpha4/index.d.ts",
    ]) await expect(access(resolve(root, file))).resolves.toBeUndefined();
  });

  it("exports only the two exact private package subpaths", async () => {
    const packageJson = JSON.parse(await readFile(resolve(
      root,
      "packages/contracts/package.json",
    ), "utf8")) as { exports: Record<string, unknown> };
    expect(packageJson.exports["./runtime-selection/v1alpha3"]).toEqual({
      types: "./dist/runtime-selection/v1alpha3/index.d.ts",
      import: "./dist/runtime-selection/v1alpha3/index.js",
    });
    expect(packageJson.exports["./submit-turn-coordination/v1alpha4"]).toEqual({
      types: "./dist/submit-turn-coordination/v1alpha4/index.d.ts",
      import: "./dist/submit-turn-coordination/v1alpha4/index.js",
    });
  });

  it("keeps Contracts roots free of the new private revisions", async () => {
    for (const file of [
      "packages/contracts/src/index.ts",
      "packages/contracts/src/runtime-selection/index.ts",
      "packages/contracts/src/submit-turn-coordination/index.ts",
    ]) {
      const source = await readFile(resolve(root, file), "utf8");
      expect(source).not.toMatch(/TaskRuntimeSelectionV1Alpha3|SubmitTurnRecordV1Alpha4/u);
      expect(source).not.toMatch(/runtime-selection\/v1alpha3|coordination\/v1alpha4/u);
    }
  });

  it("keeps frozen v1/v2 selection and v1-v3 coordination source bytes unchanged", async () => {
    const frozen = new Map([
      ["packages/contracts/src/runtime-selection/runtime-selection.ts", "8fce0bfb6e2a3d625a8c3f7801b83e513278a79763032ac6df6b409e84355e9a"],
      ["packages/contracts/src/runtime-selection/v1alpha2.ts", "c8ecbed8c574d6332bb1837cc78f56d2da5bc0b747004ee5ccb529e19412ce8f"],
      ["packages/contracts/src/submit-turn-coordination/v1alpha1.ts", "7fd694d5301cf429453e58dbf5fe6d673d10e07bd7d7c880ab0cc7a8afe6d49c"],
      ["packages/contracts/src/submit-turn-coordination/v1alpha2.ts", "a66f734b807cd6637b144d09a90e80b9972e8b51df92ad10ffe5f430f97cb3ac"],
      ["packages/contracts/src/submit-turn-coordination/v1alpha3.ts", "cbdae54db7adb015ec3049c8f3dfa82feac90410ea1f79311a3f45e9315ab0a1"],
    ]);
    for (const [file, expected] of frozen) {
      const digest = createHash("sha256")
        .update(await readFile(resolve(root, file))).digest("hex");
      expect(digest, file).toBe(expected);
    }
  });

  it("confines production consumers to the authorized R2D-3.3 Core graph", async () => {
    const allowed = new Set([
      "services/core/src/application/runtime-selection-v1alpha3.ts",
      "services/core/src/application/submit-turn-coordination-v1alpha4.ts",
      "services/core/src/application/task-resource-entitlement.ts",
      "services/core/src/application/agent-resource-decision-planner.ts",
      "services/core/src/ports/task-resource-entitlement-source.ts",
      "services/core/src/ports/task-tool-candidate-policy.ts",
      "services/core/src/adapters/memory/in-memory-submit-turn-persistence.ts",
      "services/core/src/adapters/memory/in-memory-task-persistence.ts",
      "services/core/src/adapters/sqlite/sqlite-submit-turn-persistence.ts",
      "services/core/src/adapters/sqlite/sqlite-task-persistence.ts",
      "services/core/src/application/instruction-bundle-domain.ts",
      "services/core/src/application/r2d3-durable-acceptance-planner.ts",
      "services/core/src/application/r2d3-durable-acceptance.ts",
      "services/core/src/application/local-desktop-r2d-production.ts",
      "services/core/src/application/runtime-selection-revisions.ts",
      "services/core/src/application/submit-turn-coordinator.ts",
      "services/core/src/persistence/r2d3-task-bundle-validation.ts",
      "services/core/src/persistence/task-authorization-selection-record.ts",
      "services/core/src/ports/r2d3-acceptance-authority.ts",
      "services/core/src/ports/submit-turn-persistence.ts",
      "services/core/src/ports/task-persistence.ts",
      "services/core/src/index.ts",
    ]);
    const unexpected: string[] = [];
    for (const file of await sourceFiles(resolve(root, "services/core/src"))) {
      const path = relative(root, file);
      if (allowed.has(path)) continue;
      const source = await readFile(file, "utf8");
      if (
        /TaskRuntimeSelectionV1Alpha3|SubmitTurnRecordV1Alpha4|TaskResourceEntitlementSnapshotV1|AgentResourceDecisionV1/u
          .test(source)
      ) unexpected.push(path);
    }
    expect(unexpected).toEqual([]);
  });

  it("keeps the new revisions out of Desktop, Admin, Central and Document Worker", async () => {
    const unexpected: string[] = [];
    for (const directory of [
      "apps/desktop/src",
      "apps/admin-console/src",
      "services/central-service/src/main",
      "services/document-worker/src",
    ]) {
      for (const file of await sourceFiles(resolve(root, directory))) {
        const source = await readFile(file, "utf8");
        if (/runtime-selection\/v1alpha3|coordination\/v1alpha4|TaskResourceEntitlementSnapshotV1/u.test(source)) {
          unexpected.push(relative(root, file));
        }
      }
    }
    expect(unexpected).toEqual([]);
  });

  it("keeps migration 27 absent and pnpm lock bytes stable", async () => {
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
