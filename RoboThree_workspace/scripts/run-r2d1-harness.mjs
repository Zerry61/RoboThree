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
const evidenceDirectory = join(workspaceRoot, "qa-reports", "r2d1-runs", runId);
const resultPath = join(evidenceDirectory, "result.json");
const failurePath = join(evidenceDirectory, "failure.json");
const startedAt = Date.now();
const focusedFiles = Object.freeze([
  "services/core/tests/r2d1-dynamic-request-facts.test.ts",
  "services/core/tests/r2d1-boundary.test.ts",
  "services/core/tests/arh2.2-model-backed-compaction-summarizer.test.ts",
  "services/core/tests/model-invocation-link-persistence.conformance.test.ts",
  "services/core/tests/arh2.2-compaction-model-invocation-link.test.ts",
  "services/core/tests/local-personal-model-invocation-persistence.conformance.test.ts",
  "services/core/tests/durable-enterprise-model-provider.test.ts",
  "services/core/tests/dfi4a33-durable-personal-provider.test.ts",
  "services/core/tests/context-pipeline.test.ts",
  "services/core/tests/cpc2-runtime-integration.test.ts",
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
  if (execution.status !== 0) throw typed("r2d1_focused_tests_failed");

  const testFileCount = exactCount(stdout, /Test Files\s+(\d+) passed/u, "test_files");
  const testCount = exactCount(stdout, /Tests\s+(\d+) passed/u, "tests");
  if (testFileCount !== focusedFiles.length) throw typed("r2d1_focused_file_count_mismatch");
  const migrations = await readFile(join(
    workspaceRoot,
    "services/core/src/adapters/sqlite/migrations.ts",
  ), "utf8");
  const migrationIds = [...migrations.matchAll(/\bid:\s*(\d+),/gu)]
    .map((match) => Number(match[1]));
  const targetSchemaVersion = Math.max(...migrationIds);
  if (targetSchemaVersion !== 26) throw typed("r2d1_migration_boundary_drift");
  const lockfileDigest = `sha256:${createHash("sha256").update(
    await readFile(join(workspaceRoot, "pnpm-lock.yaml")),
  ).digest("hex")}`;
  const semanticEvidence = Object.freeze({
    outcome: "R2D_DYNAMIC_REQUEST_FACTS_CONFORMANT",
    productionDynamicRequestFactsEnabled: false,
    productionCpcActivationEnabled: false,
    productionEnterpriseEntitlementReady: false,
    r2d2Unlocked: false,
    r2d3Unlocked: false,
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
    outcome: "R2D1_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "r2d1_unexpected_failure",
  });
  await writeFile(failurePath, `${JSON.stringify(failure)}\n`, { mode: 0o600 });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function exactCount(output, pattern, label) {
  const match = pattern.exec(output);
  if (match?.[1] === undefined) throw typed(`r2d1_${label}_summary_missing`);
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
