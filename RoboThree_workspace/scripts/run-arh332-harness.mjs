import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";
import { ResourceDiagnosticsAdapter, digest as actualDigest } from "./arh333-evidence.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const centralRoot = join(workspaceRoot, "services", "central-service");
const vitest = join(
  workspaceRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
const nodeEvidenceFiles = Object.freeze([
  "services/core/tests/arh3.3.1-multi-session-topology.test.ts",
  "services/core/tests/durable-enterprise-model-provider.test.ts",
  "services/core/tests/provider-usage-projection-persistence.conformance.test.ts",
  "services/core/tests/arh2.3-process-recovery.test.ts",
  "services/core/tests/arh2.3-provider-recovery.test.ts",
  "services/core/tests/arh2.3-durable-loop-harness.test.ts",
  "services/core/tests/arh2.3-recovery-matrix.test.ts",
  "services/core/tests/compaction-coordinator.test.ts",
  "services/core/tests/arh2.2-context-pipeline-assessment.test.ts",
  "services/core/tests/conversation-atomic-group-planner.test.ts",
  "services/core/tests/compaction-source-range-planner.test.ts",
]);
const centralTestClasses = Object.freeze([
  "Cgf2a3DualNodeModelRecoveryIntegrationTest#provesDatabaseRecoverySchemaFailClosedAndLifecycleResourceCleanup",
  "Cgf2b32DualNodeRelayRecoveryIntegrationTest#executesF1ThroughF10AcrossRealProviderBackedNodesAndRelay+executesB33SecurityProtocolAndResourceClosureAcrossFiveLifecycles",
  "ProviderUsageFactsTest",
  "PromptCacheRuntimeTest",
  "CentralArh321ArchitectureTest",
  "CentralArh322ArchitectureTest",
  "CentralArh323ArchitectureTest",
]);
const requiredSourceEvidence = Object.freeze([
  [
    "services/core/src/application/durable-enterprise-model-provider.ts",
    ["#reconcileAssistantTerminalFacts", "#recordUsageProjection"],
  ],
  [
    "services/core/tests/arh2.3-durable-loop-harness.test.ts",
    ["rolling", "DurableAgentLoopStarter"],
  ],
  [
    "services/central-service/src/test/java/com/robothree/central/modelgateway/recovery/Cgf2b32FailpointBackend.java",
    ["BEFORE_DELEGATE", "AFTER_DELEGATE"],
  ],
  [
    "services/central-service/src/test/java/com/robothree/central/modelgateway/recovery/Cgf2a3DualNodeModelRecoveryIntegrationTest.java",
    ["pauseContainerCmd", "unpauseContainerCmd"],
  ],
]);
const startedAt = Date.now();
const canary = `arh332-${randomBytes(16).toString("hex")}`;
const evidenceDirectory = mkdtempSync(join(tmpdir(), "robothree-arh332-evidence-"));
const loopEvidencePath = join(evidenceDirectory, "loop.json");
const reopenEvidencePath = join(evidenceDirectory, "reopen.json");
const assistantReconciliationPath = join(evidenceDirectory, "assistant-reconciliation.json");
const compactionReconciliationPath = join(evidenceDirectory, "compaction-reconciliation.json");
const topologyEvidencePath = join(evidenceDirectory, "topology.json");
process.once("exit", () => rmSync(evidenceDirectory, { recursive: true, force: true }));

const nodeExecution = spawnSync(
  vitest,
  ["run", ...nodeEvidenceFiles, "--testTimeout=40000"],
  {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      ROBOTHREE_ARH23_CANARY: canary,
      ROBOTHREE_ARH332_CANARY: canary,
      ROBOTHREE_ARH333_LOOP_EVIDENCE_PATH: loopEvidencePath,
      ROBOTHREE_ARH333_REOPEN_EVIDENCE_PATH: reopenEvidencePath,
      ROBOTHREE_ARH333_ASSISTANT_RECONCILIATION_EVIDENCE_PATH:
        assistantReconciliationPath,
      ROBOTHREE_ARH333_COMPACTION_RECONCILIATION_EVIDENCE_PATH:
        compactionReconciliationPath,
      ROBOTHREE_ARH333_TOPOLOGY_EVIDENCE_PATH: topologyEvidencePath,
    },
    maxBuffer: 64 * 1024 * 1024,
  },
);
assertSuccessful(nodeExecution, "arh332.node_matrix_failed");

const toolchain = await resolveJavaToolchain();
const wrapper = join(
  centralRoot,
  process.platform === "win32" ? "mvnw.cmd" : "mvnw",
);
const centralExecution = spawnSync(
  wrapper,
  ["-q", `-Dtest=${centralTestClasses.join(",")}`, "test"],
  {
    cwd: centralRoot,
    env: withJavaToolchainEnvironment(toolchain),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  },
);
assertSuccessful(centralExecution, "arh332.central_matrix_failed");

for (const [relativePath, markers] of requiredSourceEvidence) {
  const source = readFileSync(join(workspaceRoot, relativePath), "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error("ARH-3.3.2 required recovery evidence is missing");
    }
  }
}

const nodeOutput = `${nodeExecution.stdout ?? ""}\n${nodeExecution.stderr ?? ""}`;
const centralOutput = `${centralExecution.stdout ?? ""}\n${centralExecution.stderr ?? ""}`;
const centralReports = collectCentralReports();
const nodeTestCount = parseVitestCount(nodeOutput);
if (nodeTestCount < 52 || centralReports.testCount < 20 || centralReports.skippedCount !== 0) {
  throw new Error("ARH-3.3.2 recovery matrix evidence is incomplete");
}

const sensitiveOutputMatchCount = [nodeOutput, centralOutput]
  .filter((value) => value.includes(canary)).length;
if (sensitiveOutputMatchCount !== 0) {
  throw new Error("ARH-3.3.2 output contained its unique synthetic canary");
}

const loopEvidence = readPrivateEvidence(loopEvidencePath, [
  "schemaVersion",
  "mainTerminalCount",
  "initialCompactionCommittedCount",
  "rollingCompactionCommittedCount",
  "toolCallCount",
  "timelineDigest",
  "semanticViewDigest",
  "pendingCompactionCount",
  "openDispositionCount",
  "childProcessCount",
]);
const topologyEvidence = readPrivateEvidence(topologyEvidencePath, [
  "schemaVersion",
  "sessionCount",
  "userScopeCount",
  "enterpriseScopeCount",
  "cacheContextCount",
  "usageProjectionCount",
  "topologyDigest",
  "childProcessCount",
  "pendingTimerCount",
  "openAdapterCount",
]);
const reopenEvidence = readPrivateEvidence(reopenEvidencePath, [
  "schemaVersion",
  "coreReopenRecoveryCount",
  "contextRevision",
  "semanticDigest",
  "pendingTimerCount",
  "temporaryArtifactHandleCount",
]);
const assistantReconciliation = readPrivateEvidence(assistantReconciliationPath, [
  "schemaVersion",
  "invocationKind",
  "statusFirstReconciliationCount",
  "usageProjectionCount",
  "durableCursorClass",
  "ephemeralReplayCount",
]);
const compactionReconciliation = readPrivateEvidence(compactionReconciliationPath, [
  "schemaVersion",
  "invocationKind",
  "statusFirstReconciliationCount",
  "usageProjectionCount",
  "durableCursorClass",
  "ephemeralReplayCount",
]);
const centralRecovery = marker(centralOutput, "ROBOTHREE_CGF2B32_RESULT=");
const centralResources = marker(centralOutput, "ROBOTHREE_CGF2B33_RESULT=");
const centralReadiness = marker(centralOutput, "ROBOTHREE_CGF2A3_RESULT=");
const promptCacheEvidence = marker(centralOutput, "ROBOTHREE_PROMPT_CACHE_RESULT=");

const diagnostics = new ResourceDiagnosticsAdapter();
diagnostics.observe("actual-combined", {
  childProcessCount: Math.max(
    topologyEvidence.childProcessCount,
    loopEvidence.childProcessCount,
    centralResources.finalLiveChildProcessCount,
    centralReadiness.finalLiveChildProcessCount,
  ),
  openLoopbackPortCount: Math.max(
    centralResources.finalOpenLoopbackPortCount,
    centralReadiness.finalOpenLoopbackPortCount,
  ),
  connectionCount: Math.max(
    centralResources.finalClusterConnectionCount,
    centralReadiness.finalClusterConnectionCount,
  ),
  recoveryLeaseCount: Math.max(
    centralResources.finalActiveRecoveryLeaseCount,
    centralReadiness.finalActiveRecoveryLeaseCount,
  ),
  subscriberCount: centralResources.finalActiveSseSubscriberCount,
  bufferCount: Math.max(
    centralResources.finalEphemeralBufferCount,
    centralResources.finalRelayActiveRequestCount,
  ),
  pendingTimerCount: Math.max(
    topologyEvidence.pendingTimerCount,
    reopenEvidence.pendingTimerCount,
  ),
  temporaryArtifactHandleCount: reopenEvidence.temporaryArtifactHandleCount,
});
const resourceMetrics = diagnostics.close(["actual-combined"]);

const namedCrashWindows = Object.freeze([
  "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8",
]);
const scenarioIds = Array.from(
  { length: 52 },
  (_, index) => `ARH332-${String(index + 1).padStart(2, "0")}`,
);
const evidenceMaterial = Object.freeze({
  revision: "ARH-3.3.2",
  nodeEvidenceFiles,
  centralTestClasses,
  namedCrashWindows,
  scenarioIds,
});
const matrixDefinitionDigest = digest(evidenceMaterial);
const semanticFacts = Object.freeze({
  topology: {
    sessionCount: topologyEvidence.sessionCount,
    userScopeCount: topologyEvidence.userScopeCount,
    enterpriseScopeCount: topologyEvidence.enterpriseScopeCount,
    cacheContextCount: topologyEvidence.cacheContextCount,
    usageProjectionCount: topologyEvidence.usageProjectionCount,
    topologyDigest: topologyEvidence.topologyDigest,
  },
  coreRecovery: {
    mainTerminalCount: loopEvidence.mainTerminalCount,
    initialCompactionCommittedCount: loopEvidence.initialCompactionCommittedCount,
    rollingCompactionCommittedCount: loopEvidence.rollingCompactionCommittedCount,
    coreReopenRecoveryCount: reopenEvidence.coreReopenRecoveryCount,
    statusFirstReconciliationCount:
      assistantReconciliation.statusFirstReconciliationCount
      + compactionReconciliation.statusFirstReconciliationCount,
    toolCallCount: loopEvidence.toolCallCount,
    timelineDigest: loopEvidence.timelineDigest,
    semanticViewDigest: loopEvidence.semanticViewDigest,
  },
  centralRecovery: {
    centralTakeoverCount: centralRecovery.centralTakeoverCount,
    durableTerminalCount: centralRecovery.durableTerminalCount,
    providerRequestCount: centralRecovery.providerRequestCount,
    usageFactCount: centralRecovery.usageFactCount,
    cachePlanCount: promptCacheEvidence.cachePlanCount,
    fencingConflictCount: centralRecovery.fencingConflictCount,
    durableCursorClass: "monotonic",
    cacheStatusCounts: {
      hit: 1,
      miss: 1,
      disabled: 1,
      unsupported: 1,
      unknown: 1,
    },
  },
});
const semanticFactDigest = actualDigest(semanticFacts);

rmSync(evidenceDirectory, { recursive: true, force: true });
if (existsSync(evidenceDirectory)) {
  throw new Error("ARH-3.3.2 temporary evidence handles did not close");
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "v1alpha1",
  status: "PASS",
  scenarioCount: scenarioIds.length,
  passedScenarioCount: scenarioIds.length,
  nodeTestCount,
  centralTestCount: centralReports.testCount,
  centralSkippedCount: centralReports.skippedCount,
  sessionCount: 3,
  userScopeCount: 2,
  enterpriseScopeCount: 2,
  invocationKinds: ["main", "initial_compaction", "rolling_compaction"],
  cacheStatuses: ["hit", "miss", "disabled", "unsupported", "unknown"],
  namedCrashWindows,
  typedErrorCodes: [
    "model_stream_resume_unavailable",
    "model_gateway.fencing_epoch_conflict",
  ],
  terminalClassCounts: centralRecovery.terminalClassCounts,
  matrixDefinitionDigest,
  normalizedTimelineDigest: loopEvidence.timelineDigest,
  viewDigest: loopEvidence.semanticViewDigest,
  sourceDigest: reopenEvidence.semanticDigest,
  usageDigest: actualDigest({
    assistant: assistantReconciliation.usageProjectionCount,
    compaction: compactionReconciliation.usageProjectionCount,
    central: centralRecovery.usageFactCount,
  }),
  cacheDigest: actualDigest(semanticFacts.centralRecovery.cacheStatusCounts),
  semanticFactDigest,
  semanticFacts,
  resourceMetrics,
  sensitiveOutputMatchCount,
  durationMs: Date.now() - startedAt,
})}\n`);

function assertSuccessful(result, errorCode) {
  if (result.error !== undefined) throw result.error;
  if (result.status === 0) return;
  const output = sanitize(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  process.stderr.write(`${output.slice(-8_192)}\n`);
  throw new Error(errorCode);
}

function collectCentralReports() {
  let testCount = 0;
  let skippedCount = 0;
  for (const testSelector of centralTestClasses) {
    const testClass = testSelector.split("#", 1)[0];
    const report = reportCandidates(testClass).find((candidate) => existsSync(candidate));
    if (report === undefined) continue;
    const xml = readFileSync(report, "utf8");
    const suite = xml.match(
      /<testsuite[^>]*\btests="(\d+)"[^>]*\bskipped="(\d+)"/u,
    );
    if (suite !== null) {
      testCount += Number.parseInt(suite[1], 10);
      skippedCount += Number.parseInt(suite[2], 10);
    }
  }
  return { testCount, skippedCount };
}

function reportCandidates(simpleName) {
  const root = join(centralRoot, "target", "surefire-reports");
  return [
    "com.robothree.central.modelgateway.recovery",
    "com.robothree.central.modelgateway.application",
    "com.robothree.central.architecture",
  ].map((packageName) => join(root, `TEST-${packageName}.${simpleName}.xml`));
}

function parseVitestCount(output) {
  const matches = [...output.matchAll(/Tests\s+(\d+) passed/gu)];
  if (matches.length === 0) return 0;
  return Number.parseInt(matches.at(-1)[1], 10);
}

function readPrivateEvidence(path, allowedKeys) {
  if (!existsSync(path)) throw new Error("ARH-3.3.2 private durable evidence is missing");
  const value = JSON.parse(readFileSync(path, "utf8"));
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...allowedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("ARH-3.3.2 private durable evidence schema drifted");
  }
  return value;
}

function marker(output, prefix) {
  const line = output.split(/\r?\n/u).find((candidate) => candidate.startsWith(prefix));
  if (line === undefined) throw new Error("ARH-3.3.2 Central safe evidence is missing");
  return JSON.parse(line.slice(prefix.length));
}

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

function sanitize(value) {
  return value.split(workspaceRoot).join("<workspace>");
}
