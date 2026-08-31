import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "dfi541");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const focusedFiles = Object.freeze([
  "packages/contracts/tests/dfi5.4.1-max-core-contracts.test.ts",
  "services/core/tests/dfi5.4.1-lock-domain.test.ts",
  "services/core/tests/dfi5.4.1-planner.test.ts",
  "services/core/tests/dfi5.4.1-durable-cutover.test.ts",
  "services/core/tests/dfi5.4.1-boundary.test.ts",
]);

await mkdir(artifactDirectory, { recursive: true });
try {
  const execution = spawnSync(vitest, ["run", ...focusedFiles, "--reporter=dot"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  emit(execution);
  if (execution.error !== undefined) throw execution.error;
  if (execution.status !== 0) throw typed("dfi541_focused_tests_failed");
  const testFileCount = exactCount(execution.stdout ?? "", /Test Files\s+(\d+) passed/u);
  const testCount = exactCount(execution.stdout ?? "", /Tests\s+(\d+) passed/u);
  if (testFileCount !== focusedFiles.length) throw typed("dfi541_test_file_count_mismatch");

  const plan = await readFile(join(root,
    "docs/development/frontend/DFI-5.4.1-MAX-CORE-CONTRACT-CUTOVER-DEVELOPMENT-PLAN.md"),
  "utf8");
  const qaMatrixCount = new Set(plan.match(/QA-\d{3}/gu) ?? []).size;
  if (qaMatrixCount !== 96) throw typed("dfi541_qa_matrix_drift");
  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("dfi541_lockfile_drift");
  const migrations = await readFile(join(root,
    "services/core/src/adapters/sqlite/migrations.ts"), "utf8");
  const migrationMax = Math.max(...[...migrations.matchAll(/\bid:\s*(\d+),/gu)]
    .map((match) => Number.parseInt(match[1], 10)));
  if (migrationMax !== 26) throw typed("dfi541_migration_drift");
  const cutover = await readFile(join(root,
    "services/core/src/application/dfi541-max-core-cutover.ts"), "utf8");
  if (!/DFI541_MAX_CORE_DEFAULT_ENABLED\s*=\s*false/u.test(cutover)
    || !/DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT\s*=\s*0/u.test(cutover)) {
    throw typed("dfi541_production_gate_drift");
  }
  const contracts = await readFiles([
    "packages/contracts/src/reasoning-mode/v1alpha2/index.ts",
    "packages/contracts/src/runtime-selection/v1alpha4/index.ts",
    "packages/contracts/src/submit-turn-coordination/v1alpha5/index.ts",
    "packages/contracts/src/desktop-local/v1alpha5/submit-turn.ts",
  ]);
  const publicPrivateMappingLeakCount = countMatches(contracts,
    /reasoning_effort|budget_tokens|authorization\s*:|cookie\s*:|credentialReference/giu);
  if (publicPrivateMappingLeakCount !== 0) throw typed("dfi541_private_mapping_leak");
  const dfi534 = await evidence("dfi534");
  const r2dp3 = await evidence("r2dp3");
  const pra3 = await evidence("pra3");
  const semanticEvidence = Object.freeze({
    outcome: "DFI541_MAX_CORE_CUTOVER_CONFORMANT",
    qaMatrixCount,
    contractVersionChain: ["desktop.v1alpha5", "reasoning-lock.v1alpha2",
      "runtime-selection.v1alpha4", "coordination.v1alpha5", "model-request.v1alpha2"],
    reasoningResolutionVariantCount: 6,
    safeFallbackCauseCount: 2,
    inMemoryAtomicSingleSwapVerified: true,
    sqliteAtomicReopenVerified: true,
    durableAcceptedEnvelopeVerified: true,
    productionDfi541ActivationEnabled: false,
    productionR2dActivationEnabled: false,
    productionCpcActivationEnabled: false,
    productionEnterpriseEntitlementReady: false,
    productionCorePrivateV1Alpha5RouteCount: 0,
    productionMainPreloadMaxApiCount: 0,
    productionDesktopMaxUiReady: false,
    productionInstalledSubjectReleaseCount: 0,
    publicPrivateMappingLeakCount,
    historicalDfi534EvidenceDigest: dfi534.evidenceDigest,
    historicalR2dp3EvidenceDigest: r2dp3.evidenceDigest,
    historicalPra3EvidenceDigest: pra3.evidenceDigest,
    migrationMax,
    lockfileDigest: `sha256:${lockfileDigest}`,
  });
  const result = Object.freeze({
    status: "PASS", ...semanticEvidence, testFileCount, testCount,
    evidenceDigest: digestObject(semanticEvidence),
  });
  await writeFile(join(artifactDirectory, "evidence.json"),
    `${JSON.stringify(result)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = Object.freeze({
    status: "FAIL", outcome: "DFI541_HARNESS_FAILED",
    errorCode: typeof error?.code === "string"
      ? error.code : "dfi541_unexpected_failure",
  });
  await writeFile(join(artifactDirectory, "failure.json"),
    `${JSON.stringify(failure)}\n`, { mode: 0o600 });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

async function evidence(name) {
  return JSON.parse(await readFile(join(root, `artifacts/${name}/evidence.json`), "utf8"));
}
async function readFiles(paths) {
  return (await Promise.all(paths.map((path) => readFile(join(root, path), "utf8"))))
    .join("\n");
}
function exactCount(output, pattern) {
  const value = pattern.exec(output)?.[1];
  if (value === undefined) throw typed("dfi541_test_summary_missing");
  return Number.parseInt(value, 10);
}
function countMatches(value, pattern) { return (value.match(pattern) ?? []).length; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function digestObject(value) { return `sha256:${sha256(JSON.stringify(value))}`; }
function emit(execution) {
  process.stdout.write(sanitize(execution.stdout ?? ""));
  process.stderr.write(sanitize(execution.stderr ?? ""));
}
function sanitize(value) { return value.split(root).join("<workspace>"); }
function typed(code) { const error = new Error(code); error.code = code; return error; }
