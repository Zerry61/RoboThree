import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "pra2");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const focusedFiles = Object.freeze([
  "services/core/tests/pra2-exact-subject-release-materializer.test.ts",
  "services/core/tests/r2dp2-pra2-boundary.test.ts",
  "services/core/tests/pra1-provider-release-admission-policy.test.ts",
  "services/core/tests/dfi5.3.1-private-mapping-domain.test.ts",
  "services/core/tests/dfi5.3.2-local-personal-reasoning-mapping.test.ts",
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
  if (execution.status !== 0) throw typed("pra2_focused_tests_failed");
  const testFileCount = exactCount(execution.stdout ?? "", /Test Files\s+(\d+) passed/u);
  const testCount = exactCount(execution.stdout ?? "", /Tests\s+(\d+) passed/u);
  if (testFileCount !== focusedFiles.length) throw typed("pra2_test_file_count_mismatch");
  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("pra2_lockfile_drift");
  const materializerSource = await readFile(join(
    root,
    "services/core/src/application/exact-subject-provider-release-materializer.ts",
  ), "utf8");
  if (
    !/state:\s*"pending_conformance_materialized"/u.test(materializerSource)
    || !/state:\s*"production_admitted_materialized"/u.test(materializerSource)
    || !/state:\s*"rejected"/u.test(materializerSource)
    || !/declare const productionAdmissionProof:\s*unique symbol/u.test(materializerSource)
  ) {
    throw typed("pra2_sealed_outcome_drift");
  }
  const pra1 = JSON.parse(await readFile(join(root, "artifacts/pra1/evidence.json"), "utf8"));
  const semanticEvidence = Object.freeze({
    outcome: "PRA2_EXACT_SUBJECT_RELEASE_MATERIALIZER_CONFORMANT",
    materializedAdmissionState: "pending_conformance_materialized",
    productionAdmittedMaterializedCount: 0,
    productionSupportedReleaseCount: 0,
    productionReleaseRegistryConsumerCount: 0,
    sealedOutcomeVariantCount: 3,
    exactSubjectValidation: true,
    deterministicMaterialization: true,
    secretResolutionCount: 0,
    upstreamRequestCount: 0,
    pra3Unlocked: false,
    dfi541Unlocked: false,
    historicalPra1EvidenceDigest: pra1.evidenceDigest,
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
    status: "FAIL", outcome: "PRA2_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "pra2_unexpected_failure",
  });
  await writeFile(join(artifactDirectory, "failure.json"), `${JSON.stringify(failure)}\n`, { mode: 0o600 });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function exactCount(output, pattern) {
  const value = pattern.exec(output)?.[1];
  if (value === undefined) throw typed("pra2_test_summary_missing");
  return Number.parseInt(value, 10);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function digestObject(value) { return `sha256:${sha256(JSON.stringify(value))}`; }
function sanitize(value) { return value.split(root).join("<workspace>"); }
function typed(code) { const error = new Error(code); error.code = code; return error; }
