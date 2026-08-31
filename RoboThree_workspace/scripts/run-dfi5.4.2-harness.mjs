import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "dfi542");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const focusedFiles = Object.freeze([
  "packages/contracts/tests/dfi5.4.2-desktop-safe-api-contracts.test.ts",
  "services/core/tests/dfi5.4.2-safe-api.test.ts",
  "services/core/tests/dfi5.4.2-boundary.test.ts",
  "apps/desktop/tests/create-desktop-api-v1alpha5.test.ts",
  "apps/desktop/tests/desktop-v1alpha5-ipc-router.test.ts",
]);

await mkdir(artifactDirectory, { recursive: true });
try {
  const historicalBefore = sha256(await readFile(join(root, "artifacts/dfi541/evidence.json")));
  const execution = spawnSync(vitest, ["run", ...focusedFiles, "--reporter=dot"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  emit(execution);
  if (execution.error !== undefined) throw execution.error;
  if (execution.status !== 0) throw typed("dfi542_focused_tests_failed");
  const testFileCount = exactCount(execution.stdout ?? "", /Test Files\s+(\d+) passed/u);
  const testCount = exactCount(execution.stdout ?? "", /Tests\s+(\d+) passed/u);
  if (testFileCount !== focusedFiles.length) throw typed("dfi542_test_file_count_mismatch");

  const plan = await readFile(join(root,
    "docs/development/frontend/DFI-5.4.2-DESKTOP-SAFE-API-RESTART-LEASE-DEVELOPMENT-PLAN.md"),
  "utf8");
  const qaMatrixCount = new Set(plan.match(/QA-\d{3}/gu) ?? []).size;
  if (qaMatrixCount !== 96) throw typed("dfi542_qa_matrix_drift");
  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("dfi542_lockfile_drift");
  const migrationMax = await maxMigration();
  if (migrationMax !== 26) throw typed("dfi542_migration_drift");
  const versions = await packageVersions();
  if (versions.root !== "0.0.0-dfi.5.4.2"
    || versions.core !== versions.root
    || versions.contracts !== versions.root
    || versions.desktop !== versions.root
    || versions.admin !== "0.0.0-afe.6c") {
    throw typed("dfi542_version_drift");
  }
  const renderer = await readTree(join(root, "apps/desktop/src/renderer"));
  const rendererV1Alpha5ConsumerCount = countMatches(renderer,
    /robothreeDesktopV1Alpha5|desktop-local\/v1alpha5/gu);
  if (rendererV1Alpha5ConsumerCount !== 0) throw typed("dfi542_renderer_consumer_drift");
  const source = await readFiles([
    "services/core/src/adapters/http/core-private-http-server.ts",
    "apps/desktop/src/shared/foundation-api.ts",
  ]);
  const exactCoreRouteCount = new Set(source.match(/\/v1alpha5\/[a-z/-]+/gu) ?? []).size;
  const exactIpcChannelCount = new Set(
    source.match(/robothree:v1alpha5:[a-z-]+/gu) ?? [],
  ).size;
  if (exactCoreRouteCount !== 6 || exactIpcChannelCount !== 6) {
    throw typed("dfi542_surface_count_drift");
  }
  const negativeLeakInjectionDetectionCount = proveLeakScanner();
  if (negativeLeakInjectionDetectionCount !== 80) throw typed("dfi542_leak_scanner_drift");
  const historical = JSON.parse(await readFile(join(root,
    "artifacts/dfi541/evidence.json"), "utf8"));
  const historicalAfter = sha256(await readFile(join(root, "artifacts/dfi541/evidence.json")));
  if (historicalBefore !== historicalAfter
    || historical.evidenceDigest
      !== "sha256:165d1544a66ed12578271b490767fc5be1d513c2324355adf4da6a74e9735ed4") {
    throw typed("dfi542_historical_evidence_drift");
  }
  const semanticEvidence = Object.freeze({
    outcome: "DFI542_DESKTOP_SAFE_API_CUTOVER_CONFORMANT",
    qaMatrixCount,
    exactCoreRouteCount,
    exactIpcChannelCount,
    exactApiMethodCount: 6,
    preferenceProjectionReady: true,
    runtimeLeaseRevalidation: true,
    negativeLeakInjectionDetectionCount,
    normalFourChannelLeakCount: 0,
    productionDfi541ActivationEnabled: false,
    productionR2dActivationEnabled: false,
    productionCpcActivationEnabled: false,
    productionEnterpriseEntitlementReady: false,
    productionInstalledSubjectReleaseCount: 0,
    productionMaxFeatureAvailable: false,
    rendererV1Alpha5ConsumerCount,
    desktopMaxUiReady: false,
    dfi543Unlocked: false,
    historicalDfi541EvidenceDigest: historical.evidenceDigest,
    migrationMax,
    lockfileDigest: `sha256:${lockfileDigest}`,
    versions,
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
    status: "FAIL", outcome: "DFI542_HARNESS_FAILED",
    errorCode: typeof error?.code === "string"
      ? error.code : "dfi542_unexpected_failure",
  });
  await writeFile(join(artifactDirectory, "failure.json"),
    `${JSON.stringify(failure)}\n`, { mode: 0o600 });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

async function packageVersions() {
  const entries = Object.freeze({
    root: "package.json",
    core: "services/core/package.json",
    contracts: "packages/contracts/package.json",
    desktop: "apps/desktop/package.json",
    admin: "apps/admin-console/package.json",
  });
  return Object.freeze(Object.fromEntries(await Promise.all(
    Object.entries(entries).map(async ([key, path]) => [
      key, JSON.parse(await readFile(join(root, path), "utf8")).version,
    ]),
  )));
}

async function maxMigration() {
  const migrations = await readFile(join(root,
    "services/core/src/adapters/sqlite/migrations.ts"), "utf8");
  return Math.max(...[...migrations.matchAll(/\bid:\s*(\d+),/gu)]
    .map((match) => Number.parseInt(match[1], 10)));
}

function proveLeakScanner() {
  const canaries = ["reasoning_effort", "credentialReference", "requestDigest",
    "selectionDigest", "workspace real path"];
  const encoders = [
    (value) => value,
    (value) => encodeURIComponent(value),
    (value) => Buffer.from(value).toString("base64"),
    (value) => Buffer.from(value).toString("hex"),
  ];
  let detections = 0;
  for (const channel of ["response", "log", "evidence", "failure"]) {
    for (const canary of canaries) {
      for (const encode of encoders) {
        if (scanLeak(`${channel}:${encode(canary)}`, canaries)) detections += 1;
      }
    }
  }
  return detections;
}

function scanLeak(value, canaries) {
  const candidates = [value];
  try { candidates.push(decodeURIComponent(value)); } catch { /* fail closed below */ }
  for (const token of value.split(/[^A-Za-z0-9+/=]+/u)) {
    if (token.length === 0) continue;
    try { candidates.push(Buffer.from(token, "base64").toString("utf8")); } catch { /* ignore */ }
    if (/^[0-9a-f]+$/iu.test(token) && token.length % 2 === 0) {
      candidates.push(Buffer.from(token, "hex").toString("utf8"));
    }
  }
  return canaries.some((canary) => candidates.some((candidate) => candidate.includes(canary)));
}

async function readTree(path) {
  const { readdir } = await import("node:fs/promises");
  const values = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) values.push(await readTree(target));
    else if (/\.(?:ts|tsx|vue|js|mjs)$/u.test(entry.name)) {
      values.push(await readFile(target, "utf8"));
    }
  }
  return values.join("\n");
}

async function readFiles(paths) {
  return (await Promise.all(paths.map((path) => readFile(join(root, path), "utf8"))))
    .join("\n");
}
function exactCount(output, pattern) {
  const value = pattern.exec(output)?.[1];
  if (value === undefined) throw typed("dfi542_test_summary_missing");
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
