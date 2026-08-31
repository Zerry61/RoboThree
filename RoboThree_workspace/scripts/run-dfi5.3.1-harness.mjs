import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "dfi531");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const focusedFiles = Object.freeze([
  "services/core/tests/dfi5.3.1-private-mapping-domain.test.ts",
  "services/core/tests/dfi5.3.1-task-locked-mapper.test.ts",
  "services/core/tests/dfi5.3.1-boundary.test.ts",
  "services/core/tests/reasoning-mode-preview-service.test.ts",
  "packages/contracts/tests/dfi-5.2.1-reasoning-lock-contracts.test.ts",
  "services/core/tests/dfi5.2.3-reasoning-request-lifecycle.test.ts",
  "services/core/tests/cpc2-runtime-integration.test.ts",
  "services/core/tests/cpc2-boundary.test.ts",
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
  if (execution.status !== 0) throw typed("dfi531_focused_tests_failed");

  const stdout = execution.stdout ?? "";
  const testFileCount = exactCount(stdout, /Test Files\s+(\d+) passed/u, "test_files");
  const testCount = exactCount(stdout, /Tests\s+(\d+) passed/u, "tests");
  if (testFileCount !== focusedFiles.length) throw typed("dfi531_test_file_count_mismatch");

  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("dfi531_lockfile_drift");
  const migrations = await readFile(
    join(root, "services/core/src/adapters/sqlite/migrations.ts"),
    "utf8",
  );
  const migrationIds = [...migrations.matchAll(/\bid:\s*(\d+),/gu)]
    .map((match) => Number(match[1]));
  const migrationMax = Math.max(...migrationIds);
  if (migrationMax !== 26) throw typed("dfi531_migration_boundary_drift");

  const parentPlan = await readFile(
    join(root, "docs/development/frontend/DFI-5.3-PROVIDER-MAPPING-DEVELOPMENT-PLAN.md"),
    "utf8",
  );
  const focusedRevision = await readFile(
    join(
      root,
      "docs/development/frontend/DFI-5.3.1-PRIVATE-MAPPING-DIGEST-ORDERING-FOCUSED-REVISION.md",
    ),
    "utf8",
  );
  const parentMatrixDefinitionCount = exactCount(
    parentPlan,
    /QA 矩阵（(\d+) 项）/u,
    "parent_matrix_definition",
  );
  const focusedMatrixAssertionCount = numberedItemsBetween(
    focusedRevision,
    "## 5. DFI-5.3.1 聚焦测试增量",
    "## 6. 聚焦复核问题",
  );
  const parentMatrixRetained = parentMatrixDefinitionCount === 120
    && parentPlan.includes("### 9.1 Contract / digest / registry（1～20）")
    && parentPlan.includes("### 9.6 Boundary / gates（109～120）")
    && parentPlan.includes("120. `.skip/.only/@Disabled/sleep/硬编码资源0` 静态扫描。");
  if (!parentMatrixRetained) throw typed("dfi531_parent_matrix_definition_drift");
  if (focusedMatrixAssertionCount !== 24) throw typed("dfi531_focused_matrix_drift");

  const bootstrap = await readTree(join(root, "services/core/src/bootstrap"));
  const adapters = await readTree(join(root, "services/core/src/adapters"));
  const publicSurfaces = [
    await readTree(join(root, "packages/contracts/src")),
    await readTree(join(root, "apps/desktop/src")),
    await readTree(join(root, "apps/admin-console/src")),
  ].join("\n");
  const productionMapperConsumerCount = count(
    `${bootstrap}\n${adapters}`,
    /TaskLockedReasoningProviderMapper|ReleasePinnedReasoningMappingRegistry/gu,
  );
  const publicPrivateMappingLeakCount = count(
    publicSurfaces,
    /ProviderReasoningMapping|typedPrivateDirective|mappingDigest/gu,
  );
  if (productionMapperConsumerCount !== 0) throw typed("dfi531_production_consumer_present");
  if (publicPrivateMappingLeakCount !== 0) throw typed("dfi531_public_private_mapping_leak");

  const semanticEvidence = Object.freeze({
    outcome: "DFI531_PRIVATE_MAPPING_FOUNDATION_CONFORMANT",
    digestOrdering: "strategy_then_profile_then_private_mapping",
    focusedMatrixAssertionCount,
    parentMatrixDefinitionCount,
    parentMatrixRetained,
    parentMatrixExecutionStatus: "retained_for_dfi53_stage_closure",
    exactProfileLoadCountForMax: 1,
    exactMappingLoadCountForMax: 1,
    defaultProfileLoadCount: 0,
    defaultMappingLoadCount: 0,
    mappingFailureUpstreamSideEffectCount: 0,
    productionMapperConsumerCount,
    publicPrivateMappingLeakCount,
    providerAdapterConnected: false,
    enterpriseGatewayV1Alpha3Ready: false,
    productionSubmitTurnV1Alpha3Reachable: false,
    desktopMaxUiReady: false,
    dfi532Unlocked: false,
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
  await writeFile(
    join(artifactDirectory, "evidence.json"),
    `${JSON.stringify(result)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = Object.freeze({
    status: "FAIL",
    outcome: "DFI531_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "dfi531_unexpected_failure",
  });
  await writeFile(
    join(artifactDirectory, "failure.json"),
    `${JSON.stringify(failure)}\n`,
    { mode: 0o600 },
  );
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function exactCount(output, pattern, label) {
  const match = pattern.exec(output);
  if (match?.[1] === undefined) throw typed(`dfi531_${label}_summary_missing`);
  return Number.parseInt(match[1], 10);
}

function numberedItemsBetween(source, start, end) {
  const startOffset = source.indexOf(start);
  const endOffset = source.indexOf(end, startOffset + start.length);
  if (startOffset < 0 || endOffset < 0) throw typed("dfi531_matrix_section_missing");
  return [...source.slice(startOffset, endOffset).matchAll(/^\d+\./gmu)].length;
}

async function readTree(directory) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx|js|mjs)$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}

function count(value, pattern) {
  return [...value.matchAll(pattern)].length;
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
