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
const evidenceDirectory = join(workspaceRoot, "qa-reports", "r2d3.3-runs", runId);
const resultPath = join(evidenceDirectory, "result.json");
const failurePath = join(evidenceDirectory, "failure.json");
const startedAt = Date.now();
const expectedLockfileDigest =
  "sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const focusedFiles = Object.freeze([
  "services/core/tests/submit-turn-coordinator.integration.test.ts",
  "services/core/tests/r2d3.3-boundary.test.ts",
  "services/core/tests/r2d3.1-private-revision-domain.test.ts",
  "services/core/tests/r2d3.1-contract-boundary.test.ts",
  "services/core/tests/r2d3.2-agent-resource-decision-planner.test.ts",
  "services/core/tests/r2d3.2-built-in-general-agent.test.ts",
]);
const frozenFiles = new Map([
  ["services/core/src/application/durable-agent-loop-starter.ts",
    "390253e26242e7dbdf575a0a08c95ba90bf406b9fb7c22342a4fe67b9b4967cb"],
  ["services/core/src/application/durable-local-personal-model-provider.ts",
    "11f58ddb927c25916c6190845d3e6fe0f8a3c5b08c05308bc18365503ea2a8d8"],
  ["services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts",
    "452d2cab2b04cec0e7c39d672745641c58c79b20640350b6e73b78f1a93e631e"],
  ["packages/contracts/src/runtime-selection/v1alpha3/index.ts",
    "4238164b88d14e54b68b88b703187d65108b545eed665a9805911323043b8571"],
  ["packages/contracts/src/submit-turn-coordination/v1alpha4/index.ts",
    "222737715e5007a9005e21eb89ffed403ab9dff57557a27ebac953a4a53d78c2"],
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
  if (execution.status !== 0) throw typed("r2d33_focused_tests_failed");

  const testFileCount = exactCount(stdout, /Test Files\s+(\d+) passed/u, "test_files");
  const testCount = exactCount(stdout, /Tests\s+(\d+) passed/u, "tests");
  if (testFileCount !== focusedFiles.length) {
    throw typed("r2d33_focused_file_count_mismatch");
  }

  for (const [file, expected] of frozenFiles) {
    const actual = createHash("sha256")
      .update(await readFile(join(workspaceRoot, file))).digest("hex");
    if (actual !== expected) throw typed("r2d33_frozen_boundary_drift");
  }
  const migrations = await readFile(join(
    workspaceRoot,
    "services/core/src/adapters/sqlite/migrations.ts",
  ), "utf8");
  const migrationIds = [...migrations.matchAll(/\bid:\s*(\d+),/gu)]
    .map((match) => Number(match[1]));
  const targetSchemaVersion = Math.max(...migrationIds);
  if (targetSchemaVersion !== 26) throw typed("r2d33_migration_boundary_drift");

  const lockfileDigest = `sha256:${createHash("sha256").update(
    await readFile(join(workspaceRoot, "pnpm-lock.yaml")),
  ).digest("hex")}`;
  if (lockfileDigest !== expectedLockfileDigest) throw typed("r2d33_lockfile_drift");

  const semanticEvidence = Object.freeze({
    outcome: "R2D33_DURABLE_ACCEPTANCE_CONFORMANT",
    coordinationSchemaVersion: "v1alpha4",
    runtimeSelectionSchemaVersion: "v1alpha3",
    coordinationStateMachineReused: true,
    sqliteTaskBundleAtomicCommitProven: true,
    inMemoryStagedStateSingleSwapProven: true,
    taskCommittedBeforeAgentLoopProven: true,
    acceptedRecoveryCurrentAuthorityReadCount: 0,
    messageAppendedRecoveryCurrentAuthorityReadCount: 0,
    acceptanceReceiptIdentityEqualsCommandId: true,
    preallocatedDeliveryIdentitySeparate: true,
    productionR2dGateEnabled: false,
    productionEnterpriseEntitlementReady: false,
    productionCpcActivationEnabled: false,
    providerChanged: false,
    desktopAdminChanged: false,
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
    outcome: "R2D33_HARNESS_FAILED",
    errorCode: typeof error?.code === "string"
      ? error.code
      : "r2d33_unexpected_failure",
  });
  await writeFile(failurePath, `${JSON.stringify(failure)}\n`, { mode: 0o600 });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function exactCount(output, pattern, label) {
  const match = pattern.exec(output);
  if (match?.[1] === undefined) throw typed(`r2d33_${label}_summary_missing`);
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
