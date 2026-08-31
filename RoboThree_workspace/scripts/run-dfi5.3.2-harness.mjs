import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "dfi532");
const historicalDfi531Digest =
  "sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841";
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const focusedFiles = Object.freeze([
  "services/core/tests/dfi5.3.2-local-personal-reasoning-mapping.test.ts",
  "services/core/tests/dfi5.3.2-boundary.test.ts",
  "services/core/tests/dfi5.3.1-private-mapping-domain.test.ts",
  "services/core/tests/dfi5.3.1-task-locked-mapper.test.ts",
  "services/core/tests/dfi5.3.1-boundary.test.ts",
  "services/core/tests/local-personal-model-provider.test.ts",
  "services/core/tests/dfi4a33-durable-personal-provider.test.ts",
  "services/core/tests/model-invocation-timeout-policy.test.ts",
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
  if (execution.status !== 0) throw typed("dfi532_focused_tests_failed");

  const stdout = execution.stdout ?? "";
  const testFileCount = exactCount(stdout, /Test Files\s+(\d+) passed/u, "test_files");
  const testCount = exactCount(stdout, /Tests\s+(\d+) passed/u, "tests");
  if (testFileCount !== focusedFiles.length) throw typed("dfi532_test_file_count_mismatch");

  const historical = JSON.parse(await readFile(
    join(root, "artifacts", "dfi531", "evidence.json"),
    "utf8",
  ));
  if (historical.evidenceDigest !== historicalDfi531Digest) {
    throw typed("dfi531_historical_evidence_drift");
  }
  const plan = await readFile(
    join(root, "docs/development/frontend/DFI-5.3.2-LOCAL-PERSONAL-REASONING-MAPPING-DEVELOPMENT-PLAN.md"),
    "utf8",
  );
  const qaIds = [...plan.matchAll(/^\d+\. QA-(\d{3})\b/gmu)]
    .map((match) => Number(match[1]));
  if (qaIds.length !== 96 || qaIds.some((value, index) => value !== index + 1)) {
    throw typed("dfi532_qa_matrix_drift");
  }

  const durable = await readFile(
    join(root, "services/core/src/application/durable-local-personal-model-provider.ts"),
    "utf8",
  );
  const raw = await readFile(
    join(root, "services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts"),
    "utf8",
  );
  const publicSurfaces = await Promise.all([
    readTree(join(root, "packages/contracts/src")),
    readTree(join(root, "apps/desktop/src")),
    readTree(join(root, "apps/admin-console/src")),
    readTree(join(root, "services/central-service/src")),
  ]);
  const authorizedLocalConsumerCount = durable.includes("TaskLockedReasoningProviderMapper") ? 1 : 0;
  const unexpectedConsumerCount = publicSurfaces.filter((source) =>
    /LocalPersonalReasoningProjection|openai_reasoning_effort/u.test(source)).length;
  if (authorizedLocalConsumerCount !== 1) throw typed("dfi532_local_consumer_missing");
  if (unexpectedConsumerCount !== 0) throw typed("dfi532_unexpected_consumer_present");
  if (!raw.includes("reasoning_effort")) throw typed("dfi532_body_projection_missing");

  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("dfi532_lockfile_drift");
  const migrationIds = [...(await readFile(
    join(root, "services/core/src/adapters/sqlite/migrations.ts"),
    "utf8",
  )).matchAll(/\bid:\s*(\d+),/gu)].map((match) => Number(match[1]));
  const migrationMax = Math.max(...migrationIds);
  if (migrationMax !== 26) throw typed("dfi532_migration_boundary_drift");

  const semanticEvidence = Object.freeze({
    outcome: "DFI532_LOCAL_PERSONAL_REASONING_MAPPING_CONFORMANT",
    historicalDfi531EvidenceDigest: historicalDfi531Digest,
    dfi532QaMatrixCount: qaIds.length,
    parentMatrixExecutionStatus: "retained_for_dfi53_stage_closure",
    exactSubjectRevisionDomain: "locked_capability_definition_revision",
    personalExecutionIdentityBound: true,
    timeoutPolicyRef: "timeout.local-personal.model-invocation.v1",
    defaultBodyReasoningFieldCount: 0,
    maxProfileLoadCount: 1,
    maxMappingLoadCount: 1,
    terminalReplayMappingLoadCount: 0,
    mappingFailureDurablePrepareCount: 0,
    productionSupportedReleaseCount: 0,
    authorizedLocalConsumerCount,
    unexpectedConsumerCount,
    enterpriseConsumerCount: 0,
    publicPrivateMappingLeakCount: 0,
    productionSubmitTurnV1Alpha3Reachable: false,
    desktopMaxUiReady: false,
    dfi533Unlocked: false,
    migrationMax,
    lockfileDigest: `sha256:${lockfileDigest}`,
  });
  const result = Object.freeze({
    status: "PASS",
    ...semanticEvidence,
    testFileCount,
    testCount,
    evidenceDigest: `sha256:${createHash("sha256")
      .update(JSON.stringify(semanticEvidence), "utf8").digest("hex")}`,
  });
  await writeFile(join(artifactDirectory, "evidence.json"), `${JSON.stringify(result)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = Object.freeze({
    status: "FAIL",
    outcome: "DFI532_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "dfi532_unexpected_failure",
  });
  await writeFile(join(artifactDirectory, "failure.json"), `${JSON.stringify(failure)}\n`, {
    mode: 0o600,
  });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function exactCount(output, pattern, label) {
  const match = pattern.exec(output);
  if (match?.[1] === undefined) throw typed(`dfi532_${label}_summary_missing`);
  return Number.parseInt(match[1], 10);
}

async function readTree(directory) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && /\.(?:ts|tsx|js|mjs)$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name)).sort();
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitize(value) {
  return value.split(root).join("<workspace>");
}

function typed(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
