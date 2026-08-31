import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "pra1");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const focusedFiles = Object.freeze([
  "services/core/tests/pra1-provider-release-admission-policy.test.ts",
  "services/core/tests/r2dp1-pra1-boundary.test.ts",
  "services/core/tests/dfi5.3.1-private-mapping-domain.test.ts",
  "services/core/tests/dfi5.3.2-local-personal-reasoning-mapping.test.ts",
  "services/core/tests/dfi5.3.4-boundary.test.ts",
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
  if (execution.status !== 0) throw typed("pra1_focused_tests_failed");

  const testFileCount = exactCount(execution.stdout ?? "", /Test Files\s+(\d+) passed/u);
  const testCount = exactCount(execution.stdout ?? "", /Tests\s+(\d+) passed/u);
  if (testFileCount !== focusedFiles.length) throw typed("pra1_test_file_count_mismatch");

  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("pra1_lockfile_drift");
  const historical = JSON.parse(await readFile(
    join(root, "artifacts/dfi534/evidence.json"),
    "utf8",
  ));
  if (historical.evidenceDigest
    !== "sha256:bf89b2fda81f2b11cac63ca0ad58f1962bd309b587b48b0e1e19ba2c493c3a08") {
    throw typed("pra1_historical_dfi53_evidence_drift");
  }

  const semanticEvidence = Object.freeze({
    outcome: "PRA1_IMMUTABLE_EVIDENCE_ADMISSION_POLICY_CONFORMANT",
    exactOpenAiCandidateCount: 1,
    productionSupportedReleaseCount: 0,
    admissionState: "pending_conformance",
    deepSeekDisposition: "requires_mapping_revision",
    productionProviderReleaseMaterializerCount: 0,
    productionLocalPersonalMaxReleaseCount: 0,
    productionSubmitTurnMaxReachable: false,
    desktopMaxUiReady: false,
    pra2Unlocked: false,
    pra3Unlocked: false,
    dfi541Unlocked: false,
    historicalDfi53EvidenceDigest: historical.evidenceDigest,
    lockfileDigest: `sha256:${lockfileDigest}`,
  });
  const result = Object.freeze({
    status: "PASS",
    ...semanticEvidence,
    testFileCount,
    testCount,
    evidenceDigest: `sha256:${createHash("sha256")
      .update(JSON.stringify(semanticEvidence)).digest("hex")}`,
  });
  await writeFile(join(artifactDirectory, "evidence.json"), `${JSON.stringify(result)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = Object.freeze({
    status: "FAIL",
    outcome: "PRA1_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "pra1_unexpected_failure",
  });
  await writeFile(join(artifactDirectory, "failure.json"), `${JSON.stringify(failure)}\n`, {
    mode: 0o600,
  });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function exactCount(output, pattern) {
  const value = pattern.exec(output)?.[1];
  if (value === undefined) throw typed("pra1_test_summary_missing");
  return Number.parseInt(value, 10);
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
