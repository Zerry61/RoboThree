import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const electron = join(root, "apps", "desktop", "node_modules", ".bin", "electron");
const artifactDirectory = join(root, "artifacts", "r2dp3");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const focusedFiles = Object.freeze([
  "packages/contracts/tests/r2dp3-desktop-v1alpha4-contracts.test.ts",
  "services/core/tests/r2dp3-core-cutover.test.ts",
  "apps/desktop/tests/create-desktop-api-v1alpha4.test.ts",
  "apps/desktop/tests/desktop-v1alpha4-ipc-router.test.ts",
  "apps/desktop/tests/workbench-adapter.test.ts",
  "apps/desktop/tests/preload-bundle.test.ts",
  "apps/desktop/tests/core-private-supervisor.integration.test.ts",
  "services/core/tests/r2d4-process-lifecycle.test.ts",
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
  if (execution.status !== 0) throw typed("r2dp3_focused_tests_failed");
  const testFileCount = exactCount(execution.stdout ?? "", /Test Files\s+(\d+) passed/u);
  const testCount = exactCount(execution.stdout ?? "", /Tests\s+(\d+) passed/u);
  if (testFileCount !== focusedFiles.length) throw typed("r2dp3_test_file_count_mismatch");

  const electronExecution = spawnSync(electron, [
    join(root, "scripts/run-r2dp3-electron.mjs"),
  ], {
    cwd: root,
    encoding: "utf8",
    env: cleanElectronEnvironment(process.env),
    maxBuffer: 16 * 1024 * 1024,
  });
  emit(electronExecution);
  if (electronExecution.error !== undefined) throw electronExecution.error;
  if (electronExecution.status !== 0) throw typed("r2dp3_electron_evidence_failed");
  const electronEvidence = lastJson(electronExecution.stdout ?? "");
  if (electronEvidence.status !== "PASS"
    || electronEvidence.productionFeatureAvailable !== false
    || electronEvidence.sandbox !== true
    || electronEvidence.contextIsolation !== true) {
    throw typed("r2dp3_electron_evidence_invalid");
  }

  const plan = await readFile(join(root,
    "docs/development/frontend/R2D-P.3-DESKTOP-V1ALPHA4-PRODUCTION-CUTOVER-DEVELOPMENT-PLAN.md"),
  "utf8");
  const qaMatrixCount = new Set(plan.match(/QA-\d{3}/gu) ?? []).size;
  if (qaMatrixCount !== 84) throw typed("r2dp3_qa_matrix_drift");
  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("r2dp3_lockfile_drift");
  const contractSurface = await readFiles([
    "packages/contracts/src/desktop-local/v1alpha4/control.ts",
    "packages/contracts/src/desktop-local/v1alpha4/error.ts",
    "packages/contracts/src/desktop-local/v1alpha4/submit-turn.ts",
    "apps/desktop/src/main/desktop-v1alpha4-ipc-router.ts",
    "apps/desktop/src/preload/create-desktop-api.ts",
    "apps/desktop/src/renderer/adapters/workbench-adapter.ts",
  ]);
  if ((contractSurface.match(/defaultModelId/gu) ?? []).length !== 0) {
    throw typed("r2dp3_default_model_authority_leak");
  }
  const r2dp2 = await evidence("r2dp2");
  const r2d4 = await evidence("r2d4");
  const semanticEvidence = Object.freeze({
    outcome: "R2DP3_DESKTOP_V1ALPHA4_CUTOVER_CONFORMANT",
    qaMatrixCount,
    exactApiMethodCount: 3,
    defaultOnlyReasoning: true,
    defaultModelIdLeakCount: 0,
    productionR2dActivationEnabled: false,
    productionFeatureAvailable: false,
    realElectronMain: true,
    productionSandboxedPreload: true,
    realMainIpc: true,
    realCoreChild: true,
    realSqliteFile: true,
    historicalR2dp2EvidenceDigest: r2dp2.evidenceDigest,
    historicalR2d4EvidenceDigest: r2d4.evidenceDigest,
    productionMaxPreviewReady: false,
    productionSubmitTurnMaxReachable: false,
    desktopMaxUiReady: false,
    tgmReady: false,
    knowledgeProviderReady: false,
    agentLifecycleReady: false,
    adminV2Ready: false,
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
    status: "FAIL", outcome: "R2DP3_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "r2dp3_unexpected_failure",
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
  return (await Promise.all(paths.map((path) => readFile(join(root, path), "utf8")))).join("\n");
}
function exactCount(output, pattern) {
  const value = pattern.exec(output)?.[1];
  if (value === undefined) throw typed("r2dp3_test_summary_missing");
  return Number.parseInt(value, 10);
}
function lastJson(output) {
  const line = output.trim().split("\n").filter((item) => item.startsWith("{")).at(-1);
  if (line === undefined) throw typed("r2dp3_electron_json_missing");
  return JSON.parse(line);
}
function cleanElectronEnvironment(environment) {
  const result = { ...environment, CI: "true" };
  delete result.ELECTRON_RUN_AS_NODE;
  return result;
}
function emit(execution) {
  process.stdout.write(sanitize(execution.stdout ?? ""));
  process.stderr.write(sanitize(execution.stderr ?? ""));
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function digestObject(value) { return `sha256:${sha256(JSON.stringify(value))}`; }
function sanitize(value) { return value.split(root).join("<workspace>"); }
function typed(code) { const error = new Error(code); error.code = code; return error; }
