import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DFI541_MAX_CORE_DEFAULT_ENABLED,
  DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT,
} from "../src/index.js";

const root = resolve(import.meta.dirname, "../../..");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";

describe("DFI-5.4.2 boundaries", () => {
  it("keeps production Max activation and subject installation disabled", () => {
    expect(DFI541_MAX_CORE_DEFAULT_ENABLED).toBe(false);
    expect(DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT).toBe(0);
  });

  it("exposes exactly six Core routes and six Main IPC channels", async () => {
    const server = await source("services/core/src/adapters/http/core-private-http-server.ts");
    const foundation = await source("apps/desktop/src/shared/foundation-api.ts");
    const routes = new Set(server.match(/\/v1alpha5\/[a-z/-]+/gu) ?? []);
    const channels = new Set(foundation.match(/robothree:v1alpha5:[a-z-]+/gu) ?? []);
    expect([...routes].sort()).toEqual([
      "/v1alpha5/control/compatibility",
      "/v1alpha5/reasoning/preference/get",
      "/v1alpha5/reasoning/preference/update",
      "/v1alpha5/reasoning/preview",
      "/v1alpha5/turns/status",
      "/v1alpha5/turns/submit",
    ]);
    expect(channels.size).toBe(6);
  });

  it("keeps still-gated downstream applications free of v1alpha5 consumption", async () => {
    const sourceText = await readTrees([
      "apps/admin-console/src",
      "services/central-service/src/main",
      "services/document-worker/src",
    ]);
    expect(sourceText).not.toMatch(/robothreeDesktopV1Alpha5|desktop-local\/v1alpha5/gu);
  });

  it("freezes the v1alpha4 Contract sources byte-for-byte", async () => {
    const expected = new Map([
      ["packages/contracts/src/desktop-local/v1alpha4/control.ts",
        "43410ed72253b66c16fc9a7203539fc3a705aa7ae2d1700d441a55ebdb1129f4"],
      ["packages/contracts/src/desktop-local/v1alpha4/submit-turn.ts",
        "04afa58420b65b3720edd5b63b7671e0bc87d65ad74dfd2f2a7bfebaf30441ec"],
    ]);
    for (const [path, digest] of expected) {
      expect(createHash("sha256").update(await readFile(join(root, path)))
        .digest("hex"), path).toBe(digest);
    }
  });

  it("keeps versions, migration and lockfile on the accepted baseline", async () => {
    const versions = await Promise.all([
      "package.json",
      "services/core/package.json",
      "packages/contracts/package.json",
      "apps/desktop/package.json",
      "apps/admin-console/package.json",
    ].map(async (path) => JSON.parse(await source(path)) as { version: string }));
    expect(versions.map((value) => value.version)).toEqual([
      "0.0.0-dfi.4a.4.1",
      "0.0.0-dfi.4a.4.1",
      "0.0.0-dfi.4a.4.1",
      "0.0.0-dfe.run.1.repair.1",
      "0.0.0-afe.6c",
    ]);
    const migrations = await source("services/core/src/adapters/sqlite/migrations.ts");
    const migrationIds = [...migrations.matchAll(/\bid:\s*(\d+),/gu)]
      .map((match) => Number.parseInt(match[1]!, 10));
    expect(Math.max(...migrationIds)).toBe(26);
    expect(createHash("sha256").update(await readFile(join(root, "pnpm-lock.yaml")))
      .digest("hex")).toBe(expectedLockfileDigest);
  });

  it("keeps DFI-5.4.1 closure evidence immutable", async () => {
    const evidence = JSON.parse(await source("artifacts/dfi541/evidence.json")) as {
      evidenceDigest?: string;
    };
    expect(evidence.evidenceDigest).toBe(
      "sha256:165d1544a66ed12578271b490767fc5be1d513c2324355adf4da6a74e9735ed4",
    );
  });
});

async function source(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

async function readTrees(paths: readonly string[]): Promise<string> {
  const values: string[] = [];
  for (const path of paths) await readTree(join(root, path), values);
  return values.join("\n");
}

async function readTree(path: string, values: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) await readTree(target, values);
    else if (/\.(?:ts|tsx|js|mjs|java|vue)$/u.test(entry.name)) {
      values.push(await readFile(target, "utf8"));
    }
  }
}
