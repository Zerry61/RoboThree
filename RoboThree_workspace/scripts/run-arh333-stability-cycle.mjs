import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FourChannelLeakageScanner,
  ResourceDiagnosticsAdapter,
  digest,
} from "./arh333-evidence.mjs";
import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const centralRoot = join(workspaceRoot, "services", "central-service");
const vitest = join(
  workspaceRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
const startedAt = Date.now();
const canary = process.env.ROBOTHREE_ARH333_STABILITY_CANARY;
if (canary === undefined || !canary.startsWith("arh333-stability-")) {
  throw new Error("arh333.stability_canary_missing");
}
const markerNonce = randomBytes(24).toString("hex");
const leakageMarkers = Object.freeze({
  canary,
  credential: `arh333-credential-${markerNonce}`,
  providerEndpoint: `https://relay-${markerNonce}.invalid/v1/model-route`,
  contentBody: `ARH333 synthetic conversation body ${markerNonce}`,
  absolutePath: `/private/tmp/robothree-arh333-${markerNonce}/sensitive.txt`,
});
const markerEnvironment = Object.freeze({
  ROBOTHREE_ARH333_LEAKAGE_CANARY: leakageMarkers.canary,
  ROBOTHREE_ARH333_LEAKAGE_CREDENTIAL: leakageMarkers.credential,
  ROBOTHREE_ARH333_LEAKAGE_PROVIDER_ENDPOINT: leakageMarkers.providerEndpoint,
  ROBOTHREE_ARH333_LEAKAGE_CONTENT_BODY: leakageMarkers.contentBody,
  ROBOTHREE_ARH333_LEAKAGE_ABSOLUTE_PATH: leakageMarkers.absolutePath,
});

const evidenceDirectory = mkdtempSync(join(tmpdir(), "robothree-arh333-stability-"));
const topologyEvidencePath = join(evidenceDirectory, "topology.json");
const loopEvidencePath = join(evidenceDirectory, "loop.json");
const reopenEvidencePath = join(evidenceDirectory, "reopen.json");
const assistantEvidencePath = join(evidenceDirectory, "assistant.json");
const compactionEvidencePath = join(evidenceDirectory, "compaction.json");
process.once("exit", () => rmSync(evidenceDirectory, { recursive: true, force: true }));

const topologyExecution = execute(vitest, [
  "run",
  "services/core/tests/arh3.3.1-multi-session-topology.test.ts",
  "--testTimeout=40000",
], {
  ...process.env,
  ...markerEnvironment,
  CI: "true",
  ROBOTHREE_ARH333_TOPOLOGY_EVIDENCE_PATH: topologyEvidencePath,
});
assertSuccessful(topologyExecution, "arh333.stability_topology_failed");

const coreExecution = execute(vitest, [
  "run",
  "services/core/tests/arh2.3-durable-loop-harness.test.ts",
  "services/core/tests/arh2.3-process-recovery.test.ts",
  "services/core/tests/durable-enterprise-model-provider.test.ts",
  "--testNamePattern",
  "runs 50 ordered Tool batches|reopens one rolling active view ten times|"
    + "reconciles terminal (Assistant|Compaction) Usage after SQLite restart at "
    + "after_projection_before_cursor",
  "--testTimeout=40000",
], {
  ...process.env,
  ...markerEnvironment,
  CI: "true",
  ROBOTHREE_ARH23_CANARY: canary,
  ROBOTHREE_ARH333_LOOP_EVIDENCE_PATH: loopEvidencePath,
  ROBOTHREE_ARH333_REOPEN_EVIDENCE_PATH: reopenEvidencePath,
  ROBOTHREE_ARH333_ASSISTANT_RECONCILIATION_EVIDENCE_PATH: assistantEvidencePath,
  ROBOTHREE_ARH333_COMPACTION_RECONCILIATION_EVIDENCE_PATH: compactionEvidencePath,
});
assertSuccessful(coreExecution, "arh333.stability_core_failed");

const toolchain = await resolveJavaToolchain();
const wrapper = join(
  centralRoot,
  process.platform === "win32" ? "mvnw.cmd" : "mvnw",
);
const centralExecution = execute(wrapper, [
  "-q",
  "-Dtest=Cgf2b32DualNodeRelayRecoveryIntegrationTest"
    + "#executesArh333LightweightTakeoverAndResourceClosure",
  "test",
], withJavaToolchainEnvironment(toolchain, {
  ...process.env,
  ...markerEnvironment,
  CI: "true",
}), centralRoot);
assertSuccessful(centralExecution, "arh333.stability_central_failed");

const topology = readEvidence(topologyEvidencePath, [
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
const loop = readEvidence(loopEvidencePath, [
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
const reopen = readEvidence(reopenEvidencePath, [
  "schemaVersion",
  "coreReopenRecoveryCount",
  "contextRevision",
  "semanticDigest",
  "pendingTimerCount",
  "temporaryArtifactHandleCount",
]);
const assistant = readEvidence(assistantEvidencePath, [
  "schemaVersion",
  "invocationKind",
  "statusFirstReconciliationCount",
  "usageProjectionCount",
  "durableCursorClass",
  "ephemeralReplayCount",
]);
const compaction = readEvidence(compactionEvidencePath, [
  "schemaVersion",
  "invocationKind",
  "statusFirstReconciliationCount",
  "usageProjectionCount",
  "durableCursorClass",
  "ephemeralReplayCount",
]);
const centralOutput = `${centralExecution.stdout ?? ""}\n${centralExecution.stderr ?? ""}`;
const central = marker(
  centralOutput,
  "ROBOTHREE_ARH333_CENTRAL_STABILITY_RESULT=",
);

if (topology.openAdapterCount !== 0
  || loop.pendingCompactionCount !== 0
  || loop.openDispositionCount !== 0
  || assistant.ephemeralReplayCount !== 0
  || compaction.ephemeralReplayCount !== 0) {
  throw new Error("arh333.stability_resource_fact_nonzero");
}

const diagnostics = new ResourceDiagnosticsAdapter();
diagnostics.observe("stability-cycle", {
  childProcessCount: Math.max(
    topology.childProcessCount,
    loop.childProcessCount,
    central.finalLiveChildProcessCount,
  ),
  openLoopbackPortCount: central.finalOpenLoopbackPortCount,
  connectionCount: central.finalClusterConnectionCount,
  recoveryLeaseCount: central.finalActiveRecoveryLeaseCount,
  subscriberCount: central.finalActiveSseSubscriberCount,
  bufferCount: Math.max(
    central.finalEphemeralBufferCount,
    central.finalRelayActiveRequestCount,
  ),
  pendingTimerCount: Math.max(
    topology.pendingTimerCount,
    reopen.pendingTimerCount,
  ),
  temporaryArtifactHandleCount: reopen.temporaryArtifactHandleCount,
});
const resourceMetrics = diagnostics.close(["stability-cycle"]);
const stabilityFacts = Object.freeze({
  topology: {
    sessionCount: topology.sessionCount,
    userScopeCount: topology.userScopeCount,
    enterpriseScopeCount: topology.enterpriseScopeCount,
    topologyDigest: topology.topologyDigest,
  },
  core: {
    mainTerminalCount: loop.mainTerminalCount,
    initialCompactionCommittedCount: loop.initialCompactionCommittedCount,
    rollingCompactionCommittedCount: loop.rollingCompactionCommittedCount,
    coreReopenRecoveryCount: reopen.coreReopenRecoveryCount,
    statusFirstReconciliationCount:
      assistant.statusFirstReconciliationCount
      + compaction.statusFirstReconciliationCount,
    timelineDigest: loop.timelineDigest,
    semanticViewDigest: loop.semanticViewDigest,
    sourceDigest: reopen.semanticDigest,
  },
  central: {
    centralTakeoverCount: central.centralTakeoverCount,
    durableTerminalCount: central.durableTerminalCount,
    fencingConflictCount: central.fencingConflictCount,
  },
});
assertMinimumFacts(stabilityFacts);

const machineEvidence = [
  topologyEvidencePath,
  loopEvidencePath,
  reopenEvidencePath,
  assistantEvidencePath,
  compactionEvidencePath,
].map((path) => readFileSync(path, "utf8"));
const surefireEvidence = [
  "TEST-com.robothree.central.modelgateway.recovery."
    + "Cgf2b32DualNodeRelayRecoveryIntegrationTest.xml",
  "com.robothree.central.modelgateway.recovery."
    + "Cgf2b32DualNodeRelayRecoveryIntegrationTest.txt",
].map((fileName) => join(centralRoot, "target", "surefire-reports", fileName))
  .filter(existsSync)
  .map((path) => readFileSync(path, "utf8"));
if (central.childLogAndTraceMatchCount !== 0) {
  throw new Error("arh333.stability_child_log_or_trace_sensitive_output_detected");
}
const leakage = new FourChannelLeakageScanner(leakageMarkers).assertClean({
  processOutput: [
    topologyExecution.stdout ?? "",
    topologyExecution.stderr ?? "",
    coreExecution.stdout ?? "",
    coreExecution.stderr ?? "",
    centralExecution.stdout ?? "",
    centralExecution.stderr ?? "",
  ],
  childLogAndTrace: [JSON.stringify({
    centralChildLogAndTraceMatchCount: central.childLogAndTraceMatchCount,
  })],
  testAndMachineEvidence: [...machineEvidence, ...surefireEvidence],
  safeJsonAndDiagnostics: [JSON.stringify({
    stabilityFacts,
    resourceMetrics,
    central: {
      sensitiveOutputMatchCount: central.sensitiveOutputMatchCount,
      childLogAndTraceMatchCount: central.childLogAndTraceMatchCount,
    },
  })],
});
if (central.sensitiveOutputMatchCount !== 0) {
  throw new Error("arh333.stability_sensitive_output_detected");
}

rmSync(evidenceDirectory, { recursive: true, force: true });
if (existsSync(evidenceDirectory)) {
  throw new Error("arh333.stability_temporary_evidence_not_closed");
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "v1alpha1",
  status: "PASS",
  stabilityResultDigest: digest(stabilityFacts),
  stabilityFacts,
  resourceMetrics,
  leakageChannelMatchCounts: leakage.channelMatchCounts,
  sensitiveOutputMatchCount: leakage.totalMatchCount,
  durationMs: Date.now() - startedAt,
})}\n`);

function execute(command, arguments_, environment, cwd = workspaceRoot) {
  return spawnSync(command, arguments_, {
    cwd,
    env: environment,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1_024,
  });
}

function assertSuccessful(result, errorCode) {
  if (result.error !== undefined) throw result.error;
  if (result.status === 0) return;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  process.stderr.write(`${JSON.stringify({
    errorCode,
    exitStatus: result.status,
    stdoutDigest: digest({ stdout: result.stdout ?? "" }),
    stderrDigest: digest({ stderr: result.stderr ?? "" }),
    typedErrorCodes: [
      ...new Set(output.match(/(?:arh333|model_gateway|model_stream)\.[a-z0-9_.]+/gu) ?? []),
    ].sort(),
    failureLocations: [
      ...new Set(output.match(
        /com\.robothree\.[A-Za-z0-9_.]+\.[A-Za-z0-9_$]+/gu,
      ) ?? []),
    ].sort(),
  })}\n`);
  throw new Error(errorCode);
}

function readEvidence(path, allowedKeys) {
  if (!existsSync(path)) throw new Error("arh333.stability_evidence_missing");
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (JSON.stringify(Object.keys(value).sort())
    !== JSON.stringify([...allowedKeys].sort())) {
    throw new Error("arh333.stability_evidence_schema_drift");
  }
  return value;
}

function marker(output, prefix) {
  const line = output.split(/\r?\n/u).find((candidate) => candidate.startsWith(prefix));
  if (line === undefined) throw new Error("arh333.stability_central_evidence_missing");
  return JSON.parse(line.slice(prefix.length));
}

function assertMinimumFacts(value) {
  const counts = [
    value.core.mainTerminalCount,
    value.core.initialCompactionCommittedCount,
    value.core.rollingCompactionCommittedCount,
    value.central.centralTakeoverCount,
    value.core.coreReopenRecoveryCount,
    value.core.statusFirstReconciliationCount,
  ];
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 1)) {
    throw new Error("arh333.stability_minimum_fact_missing");
  }
}
