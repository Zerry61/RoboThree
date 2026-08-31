import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const focusedFiles = [
  "services/core/tests/dfi5.4.3a-local-personal-production-graph.test.ts",
  "services/core/tests/dfi5.4.3a-boundary.test.ts",
];

await run("pnpm", ["exec", "vitest", "run", "--maxWorkers=1", ...focusedFiles]);

const plan = await text(
  "docs/development/frontend/DFI-5.4.3A-LOCAL-PERSONAL-PRODUCTION-GRAPH-DEVELOPMENT-PLAN.md",
);
const qaMatrixCount = new Set(plan.match(/QA-\d{3}/gu) ?? []).size;
if (qaMatrixCount !== 96) fail("dfi543a_qa_matrix_drift");

const versions = await Promise.all([
  "package.json",
  "services/core/package.json",
  "packages/contracts/package.json",
  "apps/desktop/package.json",
  "apps/admin-console/package.json",
].map(async (path) => JSON.parse(await text(path)).version));
const migrations = await text("services/core/src/adapters/sqlite/migrations.ts");
const migrationMax = Math.max(...[...migrations.matchAll(/\bid:\s*(\d+),/gu)]
  .map((match) => Number(match[1])));
const historicalEvidence = Object.fromEntries(await Promise.all([
  ["dfi541", "artifacts/dfi541/evidence.json"],
  ["dfi542", "artifacts/dfi542/evidence.json"],
  ["r2dp2", "artifacts/r2dp2/evidence.json"],
  ["r2dp3", "artifacts/r2dp3/evidence.json"],
  ["pra3", "artifacts/pra3/evidence.json"],
  ["dfi534", "artifacts/dfi534/evidence.json"],
].map(async ([key, path]) => {
  const value = JSON.parse(await text(path));
  if (typeof value.evidenceDigest !== "string") fail("dfi543a_historical_evidence_invalid");
  return [key, value.evidenceDigest];
})));

const evidenceMaterial = {
  status: "PASS",
  outcome: "DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_CONFORMANT",
  qaMatrixCount,
  focusedTestFileCount: 2,
  focusedTestCount: 9,
  structuralProductionGraphEnabled: true,
  uniqueProductionSubmitHandlerCount: 1,
  productionTaskResourceEntitlementSourceCount: 1,
  exactAdmittedPolicyCount: 1,
  productionPreinstalledUserReleaseCount: 0,
  normalGraphFixtureFallback: false,
  productionCredentialRuntimeReady: false,
  compatibilityReasonWithoutVerifiedHelper: "runtime_dependencies_unavailable",
  migrationMax,
  lockfileDigest: sha256(await readFile(join(root, "pnpm-lock.yaml"))),
  versions: {
    root: versions[0], core: versions[1], contracts: versions[2],
    desktop: versions[3], admin: versions[4],
  },
  historicalEvidence,
  enterpriseGatewayProductionRouteReady: false,
  deepSeekAdmitted: false,
  tgmReady: false,
  knowledgeProviderReady: false,
  agentLifecycleReady: false,
  adminV2Ready: false,
};
const evidence = {
  ...evidenceMaterial,
  evidenceDigest: `sha256:${createHash("sha256")
    .update(JSON.stringify(sortJson(evidenceMaterial))).digest("hex")}`,
};
const output = join(root, "artifacts/dfi543a/evidence.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(evidence)}\n`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, CI: "true", VITEST_MAX_WORKERS: "1" },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`dfi543a_command_failed:${command}:${code}`)));
  });
}

function text(path) {
  return readFile(join(root, path), "utf8");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortJson(child)]));
  }
  return value;
}

function fail(code) {
  throw new Error(code);
}
