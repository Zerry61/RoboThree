import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const executableSuffix = process.platform === "win32" ? ".cmd" : "";
const vitest = join(workspaceRoot, "node_modules", ".bin", `vitest${executableSuffix}`);
const runId = new Date().toISOString().replaceAll(/[:.]/gu, "-");
const evidenceDirectory = join(workspaceRoot, "qa-reports", "r2d3.2-runs", runId);
const resultPath = join(evidenceDirectory, "result.json");
const failurePath = join(evidenceDirectory, "failure.json");
const startedAt = Date.now();
const expectedLockfileDigest =
  "sha256:c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07";
const focusedFiles = Object.freeze([
  "services/core/tests/r2d3.2-agent-resource-decision-planner.test.ts",
  "services/core/tests/r2d3.2-built-in-general-agent.test.ts",
  "services/core/tests/r2d3.2-boundary.test.ts",
  "services/core/tests/r2d3.1-entitlement-decision-domain.test.ts",
  "services/core/tests/r2d3.1-contract-boundary.test.ts",
  "services/core/tests/r2d2-agent-definition-boundary.test.ts",
]);

await mkdir(evidenceDirectory, { recursive: true });
try {
  const execution = spawnSync(vitest, ["run", ...focusedFiles, "--reporter=dot"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = sanitize(execution.stdout ?? "");
  const stderr = sanitize(execution.stderr ?? "");
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
  if (execution.error !== undefined) throw execution.error;
  if (execution.status !== 0) throw typed("r2d32_focused_tests_failed");

  const testFileCount = exactCount(stdout, /Test Files\s+(\d+) passed/u, "test_files");
  const testCount = exactCount(stdout, /Tests\s+(\d+) passed/u, "tests");
  if (testFileCount !== focusedFiles.length) {
    throw typed("r2d32_focused_file_count_mismatch");
  }

  const migrations = await readFile(join(
    workspaceRoot,
    "services/core/src/adapters/sqlite/migrations.ts",
  ), "utf8");
  const migrationIds = [...migrations.matchAll(/\bid:\s*(\d+),/gu)]
    .map((match) => Number(match[1]));
  const targetSchemaVersion = Math.max(...migrationIds);
  if (targetSchemaVersion !== 26) throw typed("r2d32_migration_boundary_drift");

  const lockfileDigest = `sha256:${createHash("sha256").update(
    await readFile(join(workspaceRoot, "pnpm-lock.yaml")),
  ).digest("hex")}`;
  if (lockfileDigest !== expectedLockfileDigest) throw typed("r2d32_lockfile_drift");

  const semanticEvidence = Object.freeze({
    outcome: "R2D32_AGENT_RESOURCE_PLANNER_CONFORMANT",
    exactBuiltInGeneralAgentDigest:
      "sha256:f846f63e9b0b7135df865a2de832f0605643eeb25919201e1285315a250078cc",
    plannerIsPureAndSynchronous: true,
    explicitInvalidFallbackCount: 0,
    scriptedFixtureAgentId: "agent.fixture.desktop-scripted",
    productionTaskResourceEntitlementSourcePresent: false,
    productionEnterpriseEntitlementReady: false,
    productionCpcActivationEnabled: false,
    productionR2dGateEnabled: false,
    atomicSubmitTurnV1Alpha4Ready: false,
    providerInvoked: false,
    desktopV2ConsumptionReady: false,
    adminV2ConsumptionReady: false,
    r2d33Unlocked: false,
    r2d4Unlocked: false,
    targetSchemaVersion,
    lockfileDigest,
  });
  const result = Object.freeze({
    status: "PASS",
    ...semanticEvidence,
    testFileCount,
    testCount,
    evidenceDigest: `sha256:${createHash("sha256")
      .update(JSON.stringify(semanticEvidence)).digest("hex")}`,
    durationMs: Date.now() - startedAt,
  });
  await writeFile(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = Object.freeze({
    status: "FAIL",
    outcome: "R2D32_HARNESS_FAILED",
    errorCode: typeof error?.code === "string"
      ? error.code
      : "r2d32_unexpected_failure",
  });
  await writeFile(failurePath, `${JSON.stringify(failure)}\n`, { mode: 0o600 });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function exactCount(output, pattern, label) {
  const match = pattern.exec(output);
  if (match?.[1] === undefined) throw typed(`r2d32_${label}_summary_missing`);
  return Number.parseInt(match[1], 10);
}

function sanitize(value) {
  return value.split(workspaceRoot).join("<workspace>");
}

function typed(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
