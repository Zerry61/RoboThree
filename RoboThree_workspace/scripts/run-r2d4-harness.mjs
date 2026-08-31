import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  R2D4_CRASH_WINDOWS,
  R2D4_RESOURCE_KEYS,
  R2D4_TIME_FACT_KEYS,
  exactR2D4ResourceCounts,
  exactR2D4TimeFacts,
  proveR2D4LeakScannerNegativeCoverage,
  scanR2D4Leakage,
  validateR2D4ClosureEvidence,
} from "./r2d4-evidence.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const executableSuffix = process.platform === "win32" ? ".cmd" : "";
const vitest = join(workspaceRoot, "node_modules", ".bin", `vitest${executableSuffix}`);
const artifactDirectory = join(workspaceRoot, "artifacts", "r2d4");
const evidencePath = join(artifactDirectory, "evidence.json");
const failurePath = join(artifactDirectory, "failure.json");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "robothree-r2d4-harness-"));
const processEvidencePath = join(temporaryDirectory, "process.json");
const boundaryEvidencePath = join(temporaryDirectory, "boundary.json");
const startedAt = Date.now();
const focusedFiles = Object.freeze([
  "services/core/tests/r2d4-process-lifecycle.test.ts",
  "services/core/tests/r2d4-boundary.test.ts",
  "scripts/r2d4-evidence.test.mjs",
  "services/core/tests/submit-turn-coordinator.integration.test.ts",
  "services/core/tests/r2d3.3-boundary.test.ts",
  "services/core/tests/r2d3.2-agent-resource-decision-planner.test.ts",
  "services/core/tests/r2d3.2-built-in-general-agent.test.ts",
  "services/core/tests/r2d3.2-boundary.test.ts",
  "services/core/tests/r2d3.2-resource-ports.test.ts",
  "services/core/tests/r2d3.1-entitlement-decision-domain.test.ts",
  "services/core/tests/r2d3.1-private-revision-domain.test.ts",
  "services/core/tests/r2d3.1-contract-boundary.test.ts",
  "packages/contracts/tests/r2d3.1-private-revisions-contracts.test.ts",
  "services/core/tests/r2d2-agent-definition-interpreter.test.ts",
  "services/core/tests/r2d2-agent-definition-boundary.test.ts",
  "packages/contracts/tests/r2d2-agent-definition-v1alpha2-contracts.test.ts",
  "services/core/tests/r2d1-dynamic-request-facts.test.ts",
  "services/core/tests/r2d1-boundary.test.ts",
]);

try {
  await mkdir(artifactDirectory, { recursive: true });
  const execution = spawnSync(vitest, ["run", ...focusedFiles, "--reporter=dot"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      VITEST_MAX_WORKERS: "1",
      ROBOTHREE_R2D4_PROCESS_EVIDENCE_PATH: processEvidencePath,
      ROBOTHREE_R2D4_BOUNDARY_EVIDENCE_PATH: boundaryEvidencePath,
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = sanitize(execution.stdout ?? "");
  const stderr = sanitize(execution.stderr ?? "");
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
  if (execution.error !== undefined) throw execution.error;
  if (execution.status !== 0) throw typed("r2d4_focused_tests_failed");

  const processEvidence = JSON.parse(await readFile(processEvidencePath, "utf8"));
  const boundary = JSON.parse(await readFile(boundaryEvidencePath, "utf8"));
  validateFocusedEvidence(processEvidence, boundary);
  const resourceCounts = exactR2D4ResourceCounts({
    activeCoreChildren: processEvidence.activeCoreChildren,
    ...exactChildTerminalResources(processEvidence.scenarios),
  });
  const testFileCount = exactCount(stdout, /Test Files\s+(\d+) passed/u, "test_files");
  const testCount = exactCount(stdout, /Tests\s+(\d+) passed/u, "tests");
  if (testFileCount !== focusedFiles.length) throw typed("r2d4_focused_file_count_mismatch");

  const evidenceWithoutLeakage = Object.freeze({
    schemaVersion: "v1",
    status: "PASS",
    outcome: "R2D_CORE_DELTA_CONFORMANT",
    crashWindowCount: processEvidence.crashWindowCount,
    semanticReplayCount: processEvidence.semanticReplayCount,
    semanticReplayDigest: processEvidence.semanticReplayDigest,
    semanticReplayProcessIds: processEvidence.semanticReplayProcessIds,
    semanticReplayTimeFacts: exactR2D4TimeFacts(processEvidence.semanticReplayTimeFacts),
    timeDriftChangesSemanticDigest: processEvidence.timeDriftChangesSemanticDigest,
    productionR2dGateEnabled: boundary.productionR2dGateEnabled,
    productionCpcActivationEnabled: boundary.productionCpcActivationEnabled,
    productionEnterpriseEntitlementReady:
      boundary.productionEnterpriseEntitlementReady,
    productionEntitlementImplementationCount:
      boundary.productionEntitlementImplementationCount,
    agentLifecycleReady: false,
    desktopV2ConsumptionReady: boundary.desktopV2ConsumerCount !== 0,
    adminV2ConsumptionReady: boundary.adminV2ConsumerCount !== 0,
    knowledgeProviderReady: false,
    memoryReady: false,
    effectReconciliationReady: false,
    dfi53Unlocked: false,
    testIdentityUsed: true,
    targetSchemaVersion: boundary.targetSchemaVersion,
    lockfileDigest: boundary.lockfileDigest,
    resourceCounts,
    testFileCount,
    testCount,
    durationMs: Date.now() - startedAt,
  });
  const evidenceJson = JSON.stringify(evidenceWithoutLeakage);
  const failureJson = await optionalFile(failurePath);
  const leakage = scanR2D4Leakage({ stdout, stderr, evidenceJson, failureJson });
  if (leakage.totalMatchCount !== 0) throw typed("r2d4_sensitive_output_detected");
  const negativeLeakInjectionDetectionCount = proveR2D4LeakScannerNegativeCoverage();
  const stableEvidenceDigestMaterial = Object.fromEntries(
    Object.entries(evidenceWithoutLeakage).filter(([key]) =>
      key !== "durationMs" && key !== "semanticReplayProcessIds"),
  );
  const evidence = validateR2D4ClosureEvidence(Object.freeze({
    ...evidenceWithoutLeakage,
    fourChannelLeakageMatchCounts: leakage.channelMatchCounts,
    negativeLeakInjectionDetectionCount,
    evidenceDigest: `sha256:${createHash("sha256")
      .update(JSON.stringify(stableEvidenceDigestMaterial)).digest("hex")}`,
  }));
  await writeFile(evidencePath, JSON.stringify(evidence), "utf8");
  await unlink(failurePath).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} catch (error) {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(failurePath, JSON.stringify({
    status: "FAIL",
    code: safeCode(error),
  }), "utf8");
  process.stderr.write(`r2d4_harness_failed:${safeCode(error)}\n`);
  process.exitCode = 1;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function validateFocusedEvidence(processEvidence, boundary) {
  if (processEvidence?.status !== "PASS"
    || processEvidence.activeCoreChildren !== 0
    || processEvidence.crashWindowCount !== R2D4_CRASH_WINDOWS.length
    || processEvidence.semanticReplayCount !== 3
    || new Set(processEvidence.semanticReplayProcessIds).size !== 3
    || processEvidence.timeDriftChangesSemanticDigest !== true
    || !sameMembers(processEvidence.scenarios.map((scenario) => scenario.window), R2D4_CRASH_WINDOWS)
    || boundary?.productionR2dGateEnabled !== false
    || boundary.productionCpcActivationEnabled !== false
    || boundary.productionEnterpriseEntitlementReady !== false
    || boundary.productionEntitlementImplementationCount !== 0
    || boundary.desktopV2ConsumerCount !== 0
    || boundary.adminV2ConsumerCount !== 0
    || boundary.downstreamProductionConsumerCount !== 0
    || boundary.targetSchemaVersion !== 26
    || boundary.lockfileDigest
      !== "sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31") {
    throw typed("r2d4_focused_evidence_invalid");
  }
  exactR2D4TimeFacts(processEvidence.semanticReplayTimeFacts);
  if (Object.keys(processEvidence.semanticReplayTimeFacts).sort().join("|")
    !== [...R2D4_TIME_FACT_KEYS].sort().join("|")) {
    throw typed("r2d4_authority_time_fact_set_invalid");
  }
  for (const scenario of processEvidence.scenarios) {
    if (!scenario.processExitObserved
      || scenario.crashedPid === scenario.recoveredPid
      || Object.values(scenario.authorityCounts).some((value) => value !== 0)
      || Object.values(scenario.upstreamCountsBeforeTaskCommit).some((value) => value !== 0)
      || scenario.loopStartedCount !== 1
      || scenario.replayLoopStartDelta !== 0) {
      throw typed("r2d4_process_scenario_invalid");
    }
    exactR2D4TimeFacts(scenario.timeFacts);
  }
}

function exactChildTerminalResources(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw typed("r2d4_process_scenarios_missing");
  }
  const output = {};
  for (const key of R2D4_RESOURCE_KEYS.filter((candidate) => candidate !== "activeCoreChildren")) {
    const values = scenarios.map((scenario) => scenario?.resourceCounts?.[key]);
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw typed(`r2d4_process_resource_invalid:${key}`);
    }
    output[key] = Math.max(...values);
  }
  return Object.freeze(output);
}

function sameMembers(left, right) {
  return left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function exactCount(output, pattern, label) {
  const match = pattern.exec(output);
  if (match?.[1] === undefined) throw typed(`r2d4_${label}_summary_missing`);
  return Number.parseInt(match[1], 10);
}

async function optionalFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function sanitize(value) {
  return value.split(workspaceRoot).join("<workspace>");
}

function typed(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeCode(error) {
  return typeof error?.code === "string" ? error.code : "r2d4_unexpected_failure";
}
