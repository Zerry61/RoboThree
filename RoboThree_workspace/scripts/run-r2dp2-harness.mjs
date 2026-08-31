import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "r2dp2");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const focusedFiles = Object.freeze([
  "services/core/tests/r2dp2-production-source-composition.test.ts",
  "services/core/tests/r2dp2-pra2-boundary.test.ts",
  "services/core/tests/r2d3.2-agent-resource-decision-planner.test.ts",
  "services/core/tests/r2d3.2-resource-ports.test.ts",
  "services/core/tests/personal-model-domain.test.ts",
]);

await mkdir(artifactDirectory, { recursive: true });
try {
  const execution = spawnSync(vitest, ["run", ...focusedFiles, "--reporter=dot"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(sanitize(execution.stdout ?? ""));
  process.stderr.write(sanitize(execution.stderr ?? ""));
  if (execution.error !== undefined) throw execution.error;
  if (execution.status !== 0) throw typed("r2dp2_focused_tests_failed");
  const testFileCount = exactCount(execution.stdout ?? "", /Test Files\s+(\d+) passed/u);
  const testCount = exactCount(execution.stdout ?? "", /Tests\s+(\d+) passed/u);
  if (testFileCount !== focusedFiles.length) throw typed("r2dp2_test_file_count_mismatch");
  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("r2dp2_lockfile_drift");
  const source = await readFile(join(
    root,
    "services/core/src/application/local-desktop-r2d-production.ts",
  ), "utf8");
  const implementationCount = (source.match(/implements\s+TaskResourceEntitlementSource\b/gu) ?? []).length;
  if (implementationCount !== 1
    || !/R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED\s*=\s*false/u.test(source)) {
    throw typed("r2dp2_production_boundary_drift");
  }
  const semanticEvidence = Object.freeze({
    outcome: "R2DP2_PRODUCTION_SOURCE_COMPOSITION_CONFORMANT",
    productionTaskResourceEntitlementSourceCount: implementationCount,
    productionR2dConsumptionEnabled: false,
    subjectProofSingleUse: true,
    entitlementSchemaVersion: "v2",
    localAuthorityKind: "local_desktop_owner",
    personalModelContextWindowState: "unknown",
    skillEntitlementCount: 0,
    knowledgeEntitlementCount: 0,
    desktopV2ConsumptionReady: false,
    r2dp3Unlocked: false,
    dfi541Unlocked: false,
    lockfileDigest: `sha256:${lockfileDigest}`,
  });
  const result = Object.freeze({
    status: "PASS", ...semanticEvidence, testFileCount, testCount,
    evidenceDigest: digestObject(semanticEvidence),
  });
  await writeFile(join(artifactDirectory, "evidence.json"), `${JSON.stringify(result)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = Object.freeze({
    status: "FAIL", outcome: "R2DP2_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "r2dp2_unexpected_failure",
  });
  await writeFile(join(artifactDirectory, "failure.json"), `${JSON.stringify(failure)}\n`, { mode: 0o600 });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function exactCount(output, pattern) {
  const value = pattern.exec(output)?.[1];
  if (value === undefined) throw typed("r2dp2_test_summary_missing");
  return Number.parseInt(value, 10);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function digestObject(value) { return `sha256:${sha256(JSON.stringify(value))}`; }
function sanitize(value) { return value.split(root).join("<workspace>"); }
function typed(code) { const error = new Error(code); error.code = code; return error; }
