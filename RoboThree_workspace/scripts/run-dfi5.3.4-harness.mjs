import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDfi53ParentExecutionLedger,
  exactDfi534ResourceCounts,
  proveDfi534LeakScannerNegativeCoverage,
  scanDfi534Leakage,
  validateDfi534ClosureEvidence,
} from "./dfi5.3.4-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "dfi534");
const expectedLockfileDigest = "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const historicalDigests = Object.freeze({
  dfi531: "sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841",
  dfi532: "sha256:d8fcaa832b0aa689d6d939e143fc56e3cf3180b28f77f50c4f14e5e020ef60fb",
  dfi533: "sha256:b8ede54d8d22e0458ab80cd7fe059c2c97a105c2101c9cb47622fea48ed9d826",
});
const focusedFiles = Object.freeze([
  "scripts/dfi5.3.4-evidence.test.mjs",
  "services/core/tests/dfi5.3.4-lifecycle-closure.test.ts",
  "services/core/tests/dfi5.3.4-process-lifecycle.test.ts",
  "services/core/tests/dfi5.3.4-boundary.test.ts",
  "services/core/tests/dfi5.3.1-private-mapping-domain.test.ts",
  "services/core/tests/dfi5.3.1-task-locked-mapper.test.ts",
  "services/core/tests/dfi5.3.1-boundary.test.ts",
  "services/core/tests/dfi5.3.2-local-personal-reasoning-mapping.test.ts",
  "services/core/tests/dfi5.3.2-boundary.test.ts",
  "services/core/tests/dfi5.3.3-enterprise-reasoning-mapping.test.ts",
  "services/core/tests/dfi5.3.3-boundary.test.ts",
  "services/core/tests/durable-enterprise-model-provider.test.ts",
  "packages/contracts/tests/dfi-5.2.3-model-request-v1alpha2-contracts.test.ts",
  "services/core/tests/local-personal-model-provider.test.ts",
  "services/core/tests/provider-usage.test.ts",
  "services/core/tests/model-invocation-timeout-policy.test.ts",
  "services/core/tests/dfi4a33-durable-personal-provider.test.ts",
  "services/core/tests/dfi5.2.3-reasoning-request-lifecycle.test.ts",
  "services/core/tests/compaction-coordinator.test.ts",
]);
const javaTests = Object.freeze([
  "EnterpriseReasoningSecondValidatorTest",
  "EnterpriseReasoningGatewayConfigurationTest",
  "EnterpriseReasoningBodyProjectionTest",
  "ModelInvocationV1Alpha3ContractTest",
  "EnterpriseContractV1Alpha3ConformanceTest",
  "DurableModelInvocationV1Alpha3GatewayServiceTest",
  "Dfi534EnterpriseLifecycleIntegrationTest",
]);

await mkdir(artifactDirectory, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "dfi534-harness-"));
const processEvidencePath = join(temporary, "process.json");
const boundaryEvidencePath = join(temporary, "boundary.json");
const centralEvidencePath = join(temporary, "central.json");
try {
  const historicalFileHashes = await historicalHashes();
  const ts = spawnSync(vitest, ["run", ...focusedFiles, "--reporter=dot"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      VITEST_MAX_WORKERS: "1",
      ROBOTHREE_DFI534_PROCESS_EVIDENCE_PATH: processEvidencePath,
      ROBOTHREE_DFI534_BOUNDARY_EVIDENCE_PATH: boundaryEvidencePath,
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(sanitize(ts.stdout ?? ""));
  process.stderr.write(sanitize(ts.stderr ?? ""));
  if (ts.error !== undefined) throw ts.error;
  if (ts.status !== 0) throw typed("dfi534_typescript_tests_failed");
  const tsTestFileCount = exactCount(ts.stdout ?? "", /Test Files\s+(\d+) passed/u, "ts_files");
  const tsTestCount = exactCount(ts.stdout ?? "", /Tests\s+(\d+) passed/u, "ts_tests");
  if (tsTestFileCount !== focusedFiles.length) throw typed("dfi534_ts_file_count_mismatch");

  const central = join(root, "services", "central-service");
  const java = spawnSync(join(central, "mvnw"), [
    "-q",
    `-Dtest=${javaTests.join(",")}`,
    `-Drobothree.dfi534.centralEvidencePath=${centralEvidencePath}`,
    "test",
  ], {
    cwd: central,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(sanitize(java.stdout ?? ""));
  process.stderr.write(sanitize(java.stderr ?? ""));
  if (java.error !== undefined) throw java.error;
  if (java.status !== 0) throw typed("dfi534_java_tests_failed");
  const { javaTestClassCount, javaTestCount } = await javaCounts(central);

  await assertHistoricalEvidence(historicalFileHashes);
  const processEvidence = JSON.parse(await readFile(processEvidencePath, "utf8"));
  const boundaryEvidence = JSON.parse(await readFile(boundaryEvidencePath, "utf8"));
  const centralEvidence = JSON.parse(await readFile(centralEvidencePath, "utf8"));
  if (processEvidence.status !== "PASS" || boundaryEvidence.status !== "PASS"
      || centralEvidence.status !== "PASS") throw typed("dfi534_runtime_evidence_invalid");
  if (sha256(await readFile(join(root, "pnpm-lock.yaml"))) !== expectedLockfileDigest) {
    throw typed("dfi534_lockfile_drift");
  }

  const focusedPlan = await readFile(join(
    root,
    "docs/development/frontend/DFI-5.3.4-LIFECYCLE-CUTOVER-STAGE-CLOSURE-DEVELOPMENT-PLAN.md",
  ), "utf8");
  const focusedIds = [...focusedPlan.matchAll(/^\d+\. QA-(\d{3})\b/gmu)]
    .map((match) => Number(match[1]));
  if (focusedIds.length !== 96 || focusedIds.some((value, index) => value !== index + 1)) {
    throw typed("dfi534_focused_matrix_drift");
  }
  const parentPlan = await readFile(join(
    root, "docs/development/frontend/DFI-5.3-PROVIDER-MAPPING-DEVELOPMENT-PLAN.md",
  ), "utf8");
  const parentQaLedger = createDfi53ParentExecutionLedger({
    parentPlan,
    ownerResults: {
      "dfi5.3.1+dfi5.3.3": "pass",
      "dfi5.3.2+dfi5.3.3": "pass",
      "dfi5.3.1+dfi5.3.2+dfi5.3.3": "pass",
      "dfi5.3.3": "pass",
      "dfi5.3.4-lifecycle": "pass",
      "dfi5.3.4-boundary": "pass",
    },
  });

  const resourceCounts = exactDfi534ResourceCounts({
    ...processEvidence.resourceCounts,
    activeCentralChildren: centralEvidence.activeCentralChildren,
    providerFixtureServers: Math.max(
      processEvidence.resourceCounts.providerFixtureServers,
      centralEvidence.providerFixtureServers,
    ),
    listeningPorts: Math.max(
      processEvidence.resourceCounts.listeningPorts,
      centralEvidence.listeningPorts,
    ),
  });
  const leakage = scanDfi534Leakage({
    stdout: sanitize(ts.stdout ?? "") + sanitize(java.stdout ?? ""),
    stderr: sanitize(ts.stderr ?? "") + sanitize(java.stderr ?? ""),
    evidenceJson: JSON.stringify({ processEvidence, boundaryEvidence, centralEvidence }),
    failureJson: "",
  });
  if (leakage.totalMatchCount !== 0) throw typed("dfi534_runtime_leak_detected");

  const semanticEvidence = {
    status: "PASS",
    outcome: "DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT",
    historicalDfi531EvidenceDigest: historicalDigests.dfi531,
    historicalDfi532EvidenceDigest: historicalDigests.dfi532,
    historicalDfi533EvidenceDigest: historicalDigests.dfi533,
    parentQaMatrixCount: parentQaLedger.length,
    parentMatrixExecutionStatus: "executed_at_dfi53_stage_closure",
    parentQaLedger,
    focusedQaMatrixCount: focusedIds.length,
    semanticReplayCount: processEvidence.semanticReplayCount,
    semanticReplayPathRunCount: processEvidence.semanticReplayPathRunCount,
    negativeLeakInjectionDetectionCount: proveDfi534LeakScannerNegativeCoverage(),
    normalLeakMatchCount: leakage.totalMatchCount,
    localPersonalPathConformant: true,
    enterpriseOpenAiPathConformant: true,
    enterpriseAnthropicPathConformant: true,
    productionSubmitTurnV1Alpha3Reachable: false,
    desktopMaxUiReady: false,
    productionGatewayV1Alpha3RouteCount: 0,
    productionLocalPersonalMaxReleaseCount: 0,
    productionEnterpriseOpenAiMaxReleaseCount: 0,
    productionEnterpriseAnthropicMaxReleaseCount: 0,
    productionCpcActivationEnabled: false,
    productionEnterpriseEntitlementReady: false,
    tgmReady: false,
    knowledgeProviderReady: false,
    agentLifecycleReady: false,
    desktopAdminV2ConsumptionReady: false,
    gatewayV1Alpha3CanonicalDigests: boundaryEvidence.gatewayV1Alpha3CanonicalDigests,
    migrationMax: boundaryEvidence.migrationMax,
    lockfileDigest: boundaryEvidence.lockfileDigest,
    resourceCounts,
  };
  validateDfi534ClosureEvidence(semanticEvidence);
  const result = {
    ...semanticEvidence,
    tsTestFileCount,
    tsTestCount,
    javaTestClassCount,
    javaTestCount,
    processEvidence,
    centralEvidence,
    evidenceDigest: `sha256:${createHash("sha256")
      .update(JSON.stringify(semanticEvidence)).digest("hex")}`,
  };
  await writeFile(join(artifactDirectory, "evidence.json"), `${JSON.stringify(result)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = {
    status: "FAIL",
    outcome: "DFI534_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "dfi534_unexpected_failure",
  };
  await writeFile(join(artifactDirectory, "failure.json"), `${JSON.stringify(failure)}\n`, {
    mode: 0o600,
  });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

async function historicalHashes() {
  return Object.fromEntries(await Promise.all(Object.keys(historicalDigests).map(async (batch) => {
    const value = await readFile(join(root, "artifacts", batch, "evidence.json"));
    return [batch, sha256(value)];
  })));
}

async function assertHistoricalEvidence(before) {
  for (const [batch, expectedEvidenceDigest] of Object.entries(historicalDigests)) {
    const path = join(root, "artifacts", batch, "evidence.json");
    const value = await readFile(path);
    if (sha256(value) !== before[batch]) throw typed("dfi534_historical_file_rewritten");
    const parsed = JSON.parse(value.toString("utf8"));
    if (parsed.evidenceDigest !== expectedEvidenceDigest) {
      throw typed("dfi534_historical_evidence_drift");
    }
  }
}

async function javaCounts(central) {
  const reports = await readdir(join(central, "target", "surefire-reports"));
  const selected = reports.filter((name) => javaTests.some((test) => name.endsWith(`.${test}.xml`)));
  if (selected.length !== javaTests.length) throw typed("dfi534_java_report_missing");
  let count = 0;
  for (const name of selected) {
    const xml = await readFile(join(central, "target", "surefire-reports", name), "utf8");
    const tests = /<testsuite[^>]*\btests="(\d+)"/u.exec(xml)?.[1];
    const failures = /<testsuite[^>]*\bfailures="(\d+)"/u.exec(xml)?.[1];
    const errors = /<testsuite[^>]*\berrors="(\d+)"/u.exec(xml)?.[1];
    if (tests === undefined || failures !== "0" || errors !== "0") {
      throw typed("dfi534_java_report_invalid");
    }
    count += Number.parseInt(tests, 10);
  }
  return { javaTestClassCount: selected.length, javaTestCount: count };
}

function exactCount(output, pattern, label) {
  const match = pattern.exec(output);
  if (match?.[1] === undefined) throw typed(`dfi534_${label}_summary_missing`);
  return Number.parseInt(match[1], 10);
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function sanitize(value) { return value.split(root).join("<workspace>"); }
function typed(code) { const error = new Error(code); error.code = code; return error; }
