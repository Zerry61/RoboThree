import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "dfi533");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const historicalDfi531Digest =
  "sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841";
const historicalDfi532Digest =
  "sha256:d8fcaa832b0aa689d6d939e143fc56e3cf3180b28f77f50c4f14e5e020ef60fb";
const focusedFiles = Object.freeze([
  "services/core/tests/dfi5.3.3-enterprise-reasoning-mapping.test.ts",
  "services/core/tests/dfi5.3.3-boundary.test.ts",
  "services/core/tests/dfi5.3.1-private-mapping-domain.test.ts",
  "services/core/tests/dfi5.3.1-task-locked-mapper.test.ts",
  "services/core/tests/dfi5.3.1-boundary.test.ts",
  "services/core/tests/dfi5.3.2-local-personal-reasoning-mapping.test.ts",
  "services/core/tests/durable-enterprise-model-provider.test.ts",
  "packages/contracts/tests/dfi-5.2.3-model-request-v1alpha2-contracts.test.ts",
]);
const javaTests = Object.freeze([
  "EnterpriseReasoningSecondValidatorTest",
  "EnterpriseReasoningGatewayConfigurationTest",
  "EnterpriseReasoningBodyProjectionTest",
  "ModelInvocationV1Alpha3ContractTest",
  "EnterpriseContractV1Alpha3ConformanceTest",
  "DurableModelInvocationV1Alpha3GatewayServiceTest",
]);

await mkdir(artifactDirectory, { recursive: true });
try {
  const ts = spawnSync(vitest, ["run", ...focusedFiles, "--reporter=dot"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(sanitize(ts.stdout ?? ""));
  process.stderr.write(sanitize(ts.stderr ?? ""));
  if (ts.error !== undefined) throw ts.error;
  if (ts.status !== 0) throw typed("dfi533_typescript_tests_failed");
  const tsTestFileCount = exactCount(ts.stdout ?? "", /Test Files\s+(\d+) passed/u, "ts_files");
  const tsTestCount = exactCount(ts.stdout ?? "", /Tests\s+(\d+) passed/u, "ts_tests");
  if (tsTestFileCount !== focusedFiles.length) throw typed("dfi533_ts_file_count_mismatch");

  const central = join(root, "services", "central-service");
  const java = spawnSync(join(central, "mvnw"), [
    "-q", `-Dtest=${javaTests.join(",")}`, "test",
  ], {
    cwd: central,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(sanitize(java.stdout ?? ""));
  process.stderr.write(sanitize(java.stderr ?? ""));
  if (java.error !== undefined) throw java.error;
  if (java.status !== 0) throw typed("dfi533_java_tests_failed");
  const reports = await readdir(join(central, "target", "surefire-reports"));
  const selectedReports = reports.filter((name) => javaTests.some((test) =>
    name.endsWith(`.${test}.xml`)));
  if (selectedReports.length !== javaTests.length) throw typed("dfi533_java_report_missing");
  let javaTestCount = 0;
  for (const name of selectedReports) {
    const xml = await readFile(join(central, "target", "surefire-reports", name), "utf8");
    const tests = /<testsuite[^>]*\btests="(\d+)"/u.exec(xml)?.[1];
    const failures = /<testsuite[^>]*\bfailures="(\d+)"/u.exec(xml)?.[1];
    const errors = /<testsuite[^>]*\berrors="(\d+)"/u.exec(xml)?.[1];
    if (tests === undefined || failures !== "0" || errors !== "0") {
      throw typed("dfi533_java_report_invalid");
    }
    javaTestCount += Number.parseInt(tests, 10);
  }

  const historical531 = JSON.parse(await readFile(
    join(root, "artifacts", "dfi531", "evidence.json"), "utf8"));
  const historical532 = JSON.parse(await readFile(
    join(root, "artifacts", "dfi532", "evidence.json"), "utf8"));
  if (historical531.evidenceDigest !== historicalDfi531Digest
      || historical532.evidenceDigest !== historicalDfi532Digest) {
    throw typed("dfi533_historical_evidence_drift");
  }
  const plan = await readFile(join(
    root,
    "docs/development/frontend/DFI-5.3.3-ENTERPRISE-OPENAI-ANTHROPIC-REASONING-MAPPING-DEVELOPMENT-PLAN.md",
  ), "utf8");
  const qaIds = [...plan.matchAll(/^\d+\. QA-(\d{3})\b/gmu)]
    .map((match) => Number(match[1]));
  if (qaIds.length !== 108 || qaIds.some((value, index) => value !== index + 1)) {
    throw typed("dfi533_qa_matrix_drift");
  }
  const parent = await readFile(join(
    root, "docs/development/frontend/DFI-5.3-PROVIDER-MAPPING-DEVELOPMENT-PLAN.md",
  ), "utf8");
  if (!parent.includes("QA 矩阵（120 项）")
      || !parent.includes("### 9.1 Contract / digest / registry（1～20）")
      || !parent.includes("### 9.6 Boundary / gates（109～120）")) {
    throw typed("dfi53_parent_matrix_drift");
  }

  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("dfi533_lockfile_drift");
  const migrationIds = [...(await readFile(
    join(root, "services/core/src/adapters/sqlite/migrations.ts"), "utf8"))
    .matchAll(/\bid:\s*(\d+),/gu)].map((match) => Number(match[1]));
  const migrationMax = Math.max(...migrationIds);
  if (migrationMax !== 26) throw typed("dfi533_migration_boundary_drift");

  const cpc = JSON.parse(await readFile(join(root, "artifacts/cpc3/evidence.json"), "utf8"));
  const semanticEvidence = Object.freeze({
    outcome: "DFI533_ENTERPRISE_REASONING_MAPPING_CONFORMANT",
    historicalDfi531EvidenceDigest: historicalDfi531Digest,
    historicalDfi532EvidenceDigest: historicalDfi532Digest,
    dfi533QaMatrixCount: qaIds.length,
    parentQaMatrixCount: 120,
    parentMatrixExecutionStatus: "retained_for_dfi53_stage_closure",
    gatewayContractVersion: "v1alpha3",
    gatewayDispatchVersions: ["v1alpha1", "v1alpha2", "v1alpha3"],
    centralIndependentDigestLayers: 3,
    centralSecondValidationBeforeAccept: true,
    centralMappingFailureAcceptCount: 0,
    centralMappingFailureProviderRequestCount: 0,
    defaultBodyReasoningFieldCount: 0,
    openAiProjectionKind: "reasoning_effort",
    anthropicProjectionKind: "thinking_budget",
    productionGatewayV1Alpha3RouteCount: 0,
    productionEnterpriseOpenAiMaxReleaseCount: 0,
    productionEnterpriseAnthropicMaxReleaseCount: 0,
    productionSubmitTurnV1Alpha3Reachable: false,
    desktopMaxUiReady: false,
    productionCpcActivationEnabled: false,
    productionEnterpriseEntitlementReady: false,
    cpcClosureEvidenceDigest: cpc.semanticEvidenceDigest,
    migrationMax,
    lockfileDigest: `sha256:${lockfileDigest}`,
  });
  const result = Object.freeze({
    status: "PASS",
    ...semanticEvidence,
    tsTestFileCount,
    tsTestCount,
    javaTestClassCount: selectedReports.length,
    javaTestCount,
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
    outcome: "DFI533_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "dfi533_unexpected_failure",
  });
  await writeFile(join(artifactDirectory, "failure.json"), `${JSON.stringify(failure)}\n`, {
    mode: 0o600,
  });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function exactCount(output, pattern, label) {
  const match = pattern.exec(output);
  if (match?.[1] === undefined) throw typed(`dfi533_${label}_summary_missing`);
  return Number.parseInt(match[1], 10);
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
