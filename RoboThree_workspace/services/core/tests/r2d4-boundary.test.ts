import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED,
  R2D3_CORE_DELTA_DEFAULT_ENABLED,
  R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY,
} from "../src/index.js";

const root = process.cwd();
const evidence = {
  productionR2dGateEnabled: R2D3_CORE_DELTA_DEFAULT_ENABLED,
  productionCpcActivationEnabled: CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED,
  productionEnterpriseEntitlementReady: R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY,
  productionEntitlementImplementationCount: -1,
  desktopV2ConsumerCount: -1,
  adminV2ConsumerCount: -1,
  downstreamProductionConsumerCount: -1,
  targetSchemaVersion: -1,
  lockfileDigest: "",
};

afterAll(async () => {
  const output = process.env.ROBOTHREE_R2D4_BOUNDARY_EVIDENCE_PATH;
  if (output !== undefined) await writeFile(output, JSON.stringify(evidence), "utf8");
});

describe("R2D-4 closure and release boundary", () => {
  it("derives all production activation facts as disabled", () => {
    expect(R2D3_CORE_DELTA_DEFAULT_ENABLED).toBe(false);
    expect(CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED).toBe(false);
    expect(R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY).toBe(false);
  });

  it("keeps the R2D gate code-owned and absent from external configuration", async () => {
    const bootstrap = await source("services/core/src/bootstrap/create-desktop-private-runtime.ts");
    const planner = await source(
      "services/core/src/application/r2d3-durable-acceptance-planner.ts",
    );
    expect(planner).toContain("R2D3_CORE_DELTA_DEFAULT_ENABLED = false");
    expect(bootstrap).toContain("r2dCoreDeltaEnabled: R2D3_CORE_DELTA_DEFAULT_ENABLED");
    expect(`${bootstrap}\n${planner}`).not.toMatch(
      /process\.env.*R2D|R2D.*process\.env|argv.*R2D|R2D.*argv/u,
    );
  });

  it("proves the only production source is the later-authorized R2D-P.2 graph", async () => {
    const implementations: string[] = [];
    for (const file of await sourceFiles(resolve(root, "services/core/src"))) {
      if (/implements\s+TaskResourceEntitlementSource\b/u.test(await readFile(file, "utf8"))) {
        implementations.push(relative(root, file));
      }
    }
    evidence.productionEntitlementImplementationCount = implementations.length;
    expect(implementations).toEqual([
      "services/core/src/application/local-desktop-r2d-production.ts",
    ]);
  });

  it("keeps v1alpha3/v1alpha4 consumption out of Desktop, Admin and downstream runtimes", async () => {
    const marker = /runtime-selection\/v1alpha3|submit-turn-coordination\/v1alpha4|R2D3DurableAcceptancePlanner/u;
    const counts = {
      desktop: await matchingFiles("apps/desktop/src", marker),
      admin: await matchingFiles("apps/admin-console/src", marker),
      downstream: [
        ...await matchingFiles("services/central-service/src/main", marker),
        ...await matchingFiles("services/document-worker/src", marker),
      ],
    };
    evidence.desktopV2ConsumerCount = counts.desktop.length;
    evidence.adminV2ConsumerCount = counts.admin.length;
    evidence.downstreamProductionConsumerCount = counts.downstream.length;
    expect(counts).toEqual({ desktop: [], admin: [], downstream: [] });
  });

  it("retains single-dispatch parsers and rejects unknown runtime versions", async () => {
    const revisions = await source(
      "services/core/src/application/runtime-selection-revisions.ts",
    );
    expect(revisions).toMatch(/const schemaVersion = readSchemaVersion\(input\)/u);
    expect(revisions).toMatch(/schemaVersion === "v1alpha1"[\s\S]*schemaVersion === "v1alpha2"[\s\S]*schemaVersion === "v1alpha3"/u);
    expect(revisions).toContain("TaskRuntimeSelection schema version is unsupported");
    expect(revisions).not.toMatch(/try[\s\S]{0,180}v1alpha1[\s\S]{0,180}catch/u);
  });

  it("keeps migration 26 and the frozen dependency graph", async () => {
    const migrations = await source("services/core/src/adapters/sqlite/migrations.ts");
    const migrationIds = [...migrations.matchAll(/\bid:\s*(\d+),/gu)]
      .map((match) => Number(match[1]));
    evidence.targetSchemaVersion = Math.max(...migrationIds);
    evidence.lockfileDigest = `sha256:${createHash("sha256")
      .update(await readFile(resolve(root, "pnpm-lock.yaml"))).digest("hex")}`;
    expect(evidence.targetSchemaVersion).toBe(26);
    expect(evidence.lockfileDigest).toBe(
      "sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31",
    );
  });

  it("retains the Desktop defaultModelId field only as an exact compatibility projection", async () => {
    const coordinator = await source("services/core/src/application/submit-turn-coordinator.ts");
    const start = coordinator.indexOf("function selectionSummaryR2D3(");
    const end = coordinator.indexOf("function selectionSummaryV1Alpha2(", start);
    const projection = coordinator.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(projection).toContain("The v1alpha3 Desktop receipt still requires this legacy projection field");
    expect(projection).toMatch(
      /defaultModelId:\s*selection\.resolvedModelLock\.capabilityId/u,
    );
    expect(projection).not.toMatch(/agentDefaultModelId/u);
  });
});

async function source(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

async function matchingFiles(directory: string, marker: RegExp): Promise<string[]> {
  const matches: string[] = [];
  for (const file of await sourceFiles(resolve(root, directory))) {
    if (marker.test(await readFile(file, "utf8"))) matches.push(relative(root, file));
  }
  return matches;
}

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
