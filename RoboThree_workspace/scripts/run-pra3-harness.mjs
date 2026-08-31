import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "pra3");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const focusedFiles = Object.freeze([
  "services/core/tests/pra3-provider-release-admission.test.ts",
  "services/core/tests/pra3-admitted-materializer.test.ts",
  "services/core/tests/pra3-boundary.test.ts",
  "services/core/tests/pra2-exact-subject-release-materializer.test.ts",
  "services/core/tests/dfi5.3.2-local-personal-reasoning-mapping.test.ts",
  "services/core/tests/local-personal-model-provider.test.ts",
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
  if (execution.status !== 0) throw typed("pra3_focused_tests_failed");
  const testFileCount = exactCount(execution.stdout ?? "", /Test Files\s+(\d+) passed/u);
  const testCount = exactCount(execution.stdout ?? "", /Tests\s+(\d+) passed/u);
  if (testFileCount !== focusedFiles.length) throw typed("pra3_test_file_count_mismatch");

  const plan = await readFile(join(root,
    "docs/development/frontend/PRA-3-PROVIDER-LIFECYCLE-ADMISSION-CLOSURE-DEVELOPMENT-PLAN.md"),
  "utf8");
  const qaMatrixCount = new Set(plan.match(/QA-\d{3}/gu) ?? []).size;
  if (qaMatrixCount !== 84) throw typed("pra3_qa_matrix_drift");
  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("pra3_lockfile_drift");
  const source = await readFile(join(root,
    "services/core/src/application/provider-release-admitted-source.ts"), "utf8");
  const productionBootstrap = await readFile(join(root,
    "services/core/src/bootstrap/create-desktop-private-runtime.ts"), "utf8");
  if (/createProviderReleaseInstallerBoundary|OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY/u
    .test(productionBootstrap)) throw typed("pra3_production_installation_drift");
  const codeOwnedAdmittedPolicyCount =
    (source.match(/OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY\s*=/gu) ?? []).length;
  if (codeOwnedAdmittedPolicyCount !== 1) throw typed("pra3_admitted_policy_count_drift");
  const dfi534 = await evidence("dfi534");
  const pra1 = await evidence("pra1");
  const pra2 = await evidence("pra2");
  for (const [name, expected] of [
    ["dfi5-3-4", dfi534.evidenceDigest],
    ["pra1", pra1.evidenceDigest],
    ["pra2", pra2.evidenceDigest],
  ]) {
    if (!source.includes(expected)) throw typed(`pra3_${name}_evidence_ref_drift`);
  }
  const semanticEvidence = Object.freeze({
    outcome: "PRA3_PROVIDER_LIFECYCLE_ADMISSION_CONFORMANT",
    qaMatrixCount,
    conformanceVectorCount: 9,
    codeOwnedAdmittedPolicyCount,
    productionMaterializerCanAdmitExactSubject: true,
    productionBootstrapInstalledSubjectReleaseCount: 0,
    productionReleaseRegistryConsumerCount: 0,
    productionSubmitTurnMaxReachable: false,
    desktopMaxUiReady: false,
    deepSeekAdmitted: false,
    historicalDfi534EvidenceDigest: dfi534.evidenceDigest,
    historicalPra1EvidenceDigest: pra1.evidenceDigest,
    historicalPra2EvidenceDigest: pra2.evidenceDigest,
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
    status: "FAIL", outcome: "PRA3_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "pra3_unexpected_failure",
  });
  await writeFile(join(artifactDirectory, "failure.json"),
    `${JSON.stringify(failure)}\n`, { mode: 0o600 });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

async function evidence(name) {
  return JSON.parse(await readFile(join(root, `artifacts/${name}/evidence.json`), "utf8"));
}
function exactCount(output, pattern) {
  const value = pattern.exec(output)?.[1];
  if (value === undefined) throw typed("pra3_test_summary_missing");
  return Number.parseInt(value, 10);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function digestObject(value) { return `sha256:${sha256(JSON.stringify(value))}`; }
function sanitize(value) { return value.split(root).join("<workspace>"); }
function typed(code) { const error = new Error(code); error.code = code; return error; }
