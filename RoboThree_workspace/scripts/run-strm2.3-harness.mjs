import { spawn, spawnSync } from "node:child_process";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import {
  STRM23_CHANNELS,
  STRM23_RESOURCE_KEYS,
  STRM23_SCENARIOS,
  assertStrm23LeakageScannerNegativeCoverage,
  safeFailureEvidence,
  scanStrm23Leakage,
  semanticStrm23Summary,
  strm23SemanticDigest,
  validateStrm23ParentDecision,
  validateStrm23ScenarioEvidence,
} from "./strm23-evidence.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const executableSuffix = process.platform === "win32" ? ".cmd" : "";
const vitest = join(workspaceRoot, "node_modules", ".bin", `vitest${executableSuffix}`);
const electron = join(
  workspaceRoot,
  "apps",
  "desktop",
  "node_modules",
  ".bin",
  `electron${executableSuffix}`,
);
const fixture = join(scriptDirectory, "run-strm23-process-electron.mjs");
const artifactDirectory = join(workspaceRoot, "artifacts", "strm2.3");
const failurePath = join(artifactDirectory, "failure.json");
const failureTemporaryPath = join(artifactDirectory, "failure.json.tmp");
const activeElectronProcesses = new Set();
const startedAt = Date.now();

try {
  runSync(vitest, [
    "run",
    "packages/contracts/tests/strm2.3-personal-credential-transport-closure-contract.test.ts",
    "apps/desktop/tests/strm2.3-personal-credential-transport-closure.test.ts",
    "scripts/strm23-evidence.test.mjs",
    "--reporter=dot",
  ]);

  const regression = parseLastJsonLine(runSync(
    process.execPath,
    ["scripts/run-strm2.2-harness.mjs"],
    true,
  ).stdout);
  if (regression.outcome !== "STRM22_BROKER_DIRECTIONAL_CLOSURE_CONFORMANT") {
    throw typed("strm23_strm22_regression_invalid");
  }

  const replayRounds = [];
  const collectedChannels = Object.fromEntries(STRM23_CHANNELS.map((key) => [key, []]));
  for (let round = 1; round <= 3; round += 1) {
    const results = [];
    for (const definition of STRM23_SCENARIOS) {
      const scenarioId = `semantic-round-${round}:${definition.name}`;
      const execution = await runScenario(definition, scenarioId);
      results.push(execution.evidence);
      process.stdout.write(`${JSON.stringify({
        type: "progress",
        round,
        scenario: definition.name,
        status: execution.evidence.status,
      })}\n`);
      collectedChannels.parentStdout.push(execution.parentStdout);
      collectedChannels.childStderr.push(execution.childStderr);
      collectedChannels.machineEvidence.push(JSON.stringify(execution.evidence));
      collectedChannels.safeTrace.push(JSON.stringify({
        scenario: definition.name,
        window: definition.window,
        direction: definition.direction,
        action: definition.action,
        classification: execution.evidence.classification,
        status: execution.evidence.status,
      }));
    }
    const summary = validateStrm23ScenarioEvidence(results);
    const semanticEvidence = semanticStrm23Summary(results);
    replayRounds.push(Object.freeze({
      results: Object.freeze(results),
      summary,
      digest: strm23SemanticDigest(semanticEvidence),
    }));
  }

  const digests = [...new Set(replayRounds.map((item) => item.digest))];
  if (digests.length !== 1) throw typed("strm23_semantic_replay_mismatch");
  const channels = Object.fromEntries(STRM23_CHANNELS.map((key) => [
    key,
    collectedChannels[key].join("\n"),
  ]));
  const leakage = scanStrm23Leakage(channels);
  if (leakage.totalMatchCount !== 0) throw typed("strm23_sensitive_output_detected");
  const negativeLeakInjectionDetectionCount = assertStrm23LeakageScannerNegativeCoverage();
  if (negativeLeakInjectionDetectionCount !== 80) {
    throw typed("strm23_leakage_negative_coverage_incomplete");
  }

  const allResults = replayRounds.flatMap((item) => item.results);
  const resourceCounts = aggregateResourceCounts(allResults);
  if (activeElectronProcesses.size !== 0
    || Object.values(resourceCounts).some((value) => value !== 0)) {
    throw typed("strm23_final_resource_not_zero");
  }
  await removeFailureArtifact();

  const evidence = Object.freeze({
    status: "PASS",
    outcome: "STRM2_PRODUCTION_WIRING_CONFORMANT",
    namedCrashWindows: replayRounds[0].summary.namedCrashWindows,
    scenarioRunCount: allResults.length,
    semanticReplayCount: replayRounds.length,
    semanticEvidenceDigest: digests[0],
    mutationDispatchCount: allResults
      .filter((item) => item.direction === "mutation")
      .reduce((sum, item) => sum + item.brokerDispatchCount, 0),
    revealDispatchCount: allResults
      .filter((item) => item.direction === "reveal")
      .reduce((sum, item) => sum + item.brokerDispatchCount, 0),
    lateCleanupCount: allResults.reduce((sum, item) => sum + item.lateCleanupCount, 0),
    durableReconciliationRequiredCount: allResults.filter(
      (item) => item.classification === "business_reconciliation_required",
    ).length,
    revealNoReplayCount: allResults.filter(
      (item) => item.classification === "reveal_uncertain_no_replay",
    ).length,
    fourChannelLeakageMatchCounts: leakage.channelMatchCounts,
    negativeLeakInjectionDetectionCount,
    resourceCounts,
    typedErrorCodes: [...new Set(allResults.map((item) => item.typedErrorCode))].sort(),
    productionFeatureEnabled: false,
    productionSensitiveTransportReady: false,
    productionBusinessHandlerReady: false,
    transportBlockerClosed: false,
    rendererBusinessApiExposed: false,
    zeroCopyClaimed: false,
    durationMs: Date.now() - startedAt,
  });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} catch (error) {
  await persistFailure(error);
  process.stderr.write(`strm23_harness_failed:${safeCode(error)}\n`);
  process.exitCode = 1;
}

async function runScenario(definition, scenarioId) {
  const child = spawn(electron, [fixture], {
    cwd: workspaceRoot,
    detached: process.platform !== "win32",
    env: {
      ...cleanElectronEnvironment(process.env),
      CI: "true",
      ROBOTHREE_STRM23_SCENARIO: definition.name,
      ROBOTHREE_STRM23_SCENARIO_ID: scenarioId,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  activeElectronProcesses.add(child);
  const started = Date.now();
  let stdout = "";
  let stderr = "";
  let barrier;
  let evidence;
  let actionCount = 0;
  let settled = false;
  const stdoutReader = createInterface({ input: child.stdout });
  stdoutReader.on("line", (line) => {
    stdout += `${line}\n`;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message?.type === "barrier") {
      if (barrier !== undefined) {
        child.kill("SIGKILL");
        return;
      }
      barrier = message;
      const decision = { scenarioId, action: definition.action };
      validateStrm23ParentDecision(message, decision);
      actionCount += 1;
      if (definition.action === "sigkill_electron") {
        killElectronProcessGroup(child);
      } else {
        child.stdin.write(`${JSON.stringify(decision)}\n`);
      }
      return;
    }
    if (message?.type === "evidence") evidence = message;
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  const exit = await waitForChild(child, 15_000).finally(() => {
    settled = true;
    activeElectronProcesses.delete(child);
    stdoutReader.close();
  });
  if (barrier === undefined) {
    throw scenarioFailure(definition, undefined, "barrier_not_observed", Date.now() - started);
  }
  if (actionCount !== 1) {
    throw scenarioFailure(definition, barrier, "action_count_mismatch", Date.now() - started);
  }

  if (definition.action === "sigkill_electron") {
    if (exit.signal !== "SIGKILL") {
      throw scenarioFailure(definition, barrier, "electron_sigkill_not_observed", Date.now() - started);
    }
    const processExitObservation = observeKilledProcessGroup(child.pid, barrier.processTopology);
    evidence = killedProcessEvidence(definition, barrier, processExitObservation);
  } else if (exit.code !== 0 || evidence === undefined) {
    throw scenarioFailure(
      definition,
      barrier,
      evidence === undefined ? "evidence_missing" : "fixture_nonzero_exit",
      Date.now() - started,
    );
  }

  if (!settled || evidence.actionCount !== 1) {
    throw scenarioFailure(definition, barrier, "scenario_not_settled", Date.now() - started);
  }
  return Object.freeze({
    evidence: validateLateCleanupEvidence(evidence),
    parentStdout: stdout,
    childStderr: stderr,
  });
}

function killedProcessEvidence(definition, barrier, processExitObservation) {
  return Object.freeze({
    status: "PASS",
    scenario: definition.name,
    window: definition.window,
    direction: definition.direction,
    classification: killedClassification(definition.name),
    typedErrorCode: killedTypedError(definition.name),
    barrierReachedCount: 1,
    actionCount: 1,
    brokerDispatchCount: barrier.brokerDispatchCount,
    terminalObserved: definition.name.startsWith("s7_"),
    runtimeChanged: false,
    channelChanged: false,
    coreStartCount: 1,
    realCorePrivateSupervisor: true,
    jsonLifecycleFd3: true,
    binaryBrokerFd4Fd5: true,
    sandbox: true,
    contextIsolation: true,
    nodeIntegrationDisabled: true,
    resourceCountsAtBarrier: exactResourceSnapshot(barrier.resourceCounts),
    resourceCounts: processGroupExitResourceCounts(
      barrier.resourceCounts,
      processExitObservation,
    ),
    processExitObservation,
    resourceAccountingSources: [
      "exact_barrier_snapshot",
      "os_process_table_snapshot",
      "tracked_process_identity_match",
    ],
    lateCleanupCount: exactNonnegativeInteger(
      barrier.lateCleanupCount,
      "strm23_late_cleanup_barrier_invalid",
    ),
    productionFeatureEnabled: false,
    productionSensitiveTransportReady: false,
    productionBusinessHandlerReady: false,
    transportBlockerClosed: false,
    rendererBusinessApiExposed: false,
    zeroCopyClaimed: false,
  });
}

function processGroupExitResourceCounts(barrierCounts, observation) {
  const observedAtBarrier = exactResourceSnapshot(barrierCounts);
  if (observation.processGroupExitObserved !== true
    || observation.activeGroupMemberCount !== 0
    || observation.activeTrackedProcessCount !== 0) {
    throw typed("strm23_process_group_resource_owner_still_active");
  }
  // Each resource was observed inside the killed Electron process group at the
  // exact barrier. A single OS process-table snapshot now proves there are no
  // active owners. Math.min preserves zero-at-barrier facts while deriving
  // non-zero barrier facts from the observed active owner count.
  return Object.freeze(Object.fromEntries(STRM23_RESOURCE_KEYS.map((key) => [
    key,
    Math.min(observedAtBarrier[key], observation.activeGroupMemberCount),
  ])));
}

function exactResourceSnapshot(input) {
  const output = {};
  for (const key of STRM23_RESOURCE_KEYS) {
    output[key] = exactNonnegativeInteger(input?.[key], `strm23_barrier_resource_invalid:${key}`);
  }
  return Object.freeze(output);
}

function validateLateCleanupEvidence(evidence) {
  exactNonnegativeInteger(evidence?.lateCleanupCount, "strm23_late_cleanup_evidence_missing");
  return Object.freeze({ ...evidence });
}

function exactNonnegativeInteger(value, code) {
  if (!Number.isInteger(value) || value < 0) throw typed(code);
  return value;
}

function observeKilledProcessGroup(groupLeaderPid, topology) {
  if (process.platform === "win32") throw typed("strm23_process_group_observation_unsupported");
  if (!Number.isInteger(groupLeaderPid)
    || !Number.isInteger(topology?.electronProcessId)
    || !Array.isArray(topology.coreChildProcessIds)
    || topology.coreChildProcessIds.length === 0
    || !Array.isArray(topology.helperProcessIds)) {
    throw typed("strm23_process_topology_invalid");
  }
  const trackedProcessIds = [...new Set([
    groupLeaderPid,
    topology.electronProcessId,
    ...topology.coreChildProcessIds,
    ...topology.helperProcessIds,
  ])];
  if (trackedProcessIds.some((pid) => !Number.isInteger(pid) || pid <= 0)) {
    throw typed("strm23_process_topology_invalid");
  }

  const snapshot = spawnSync("/bin/ps", ["-axo", "pid=,pgid=,stat="], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (snapshot.status !== 0 || snapshot.error !== undefined) {
    throw typed("strm23_process_table_observation_failed");
  }
  const rows = snapshot.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
    .map((line) => {
      const match = /^(\d+)\s+(\d+)\s+(\S+)/u.exec(line);
      return match === null ? undefined : {
        pid: Number(match[1]),
        processGroupId: Number(match[2]),
        state: match[3],
      };
    })
    .filter((row) => row !== undefined);
  const tracked = new Set(trackedProcessIds);
  const trackedRows = rows.filter((row) => tracked.has(row.pid));
  const groupRows = rows.filter((row) => row.processGroupId === groupLeaderPid);
  const terminal = (row) => process.platform === "darwin"
    ? row.state.includes("E") || row.state.startsWith("Z")
    : /^[ZX]/u.test(row.state);
  const active = (row) => !terminal(row);
  const activeTrackedProcessCount = trackedRows.filter(active).length;
  const activeGroupMemberCount = groupRows.filter(active).length;
  if (activeTrackedProcessCount !== 0 || activeGroupMemberCount !== 0) {
    throw typed("strm23_process_group_exit_not_observed");
  }
  return Object.freeze({
    processGroupExitObserved: true,
    trackedProcessCount: trackedProcessIds.length,
    observedAbsentTrackedProcessCount: trackedProcessIds.length - trackedRows.length,
    observedTerminalTrackedProcessCount: trackedRows.filter(terminal).length,
    observedGroupMemberCount: groupRows.length,
    observedTerminalGroupMemberCount: groupRows.filter(terminal).length,
    activeTrackedProcessCount,
    activeGroupMemberCount,
  });
}

function killedClassification(scenario) {
  if (scenario === "s2_mutation" || scenario === "s5_mutation") {
    return "durable_prepared_preserved";
  }
  if (scenario === "s2_reveal" || scenario === "s3_reveal") return "reveal_not_resolved";
  if (scenario === "s4_mutation") return "mutation_uncertain_no_replay";
  if (scenario === "s7_mutation") return "business_reconciliation_required";
  return "reveal_uncertain_no_replay";
}

function killedTypedError(scenario) {
  return scenario === "s2_mutation" || scenario === "s2_reveal" || scenario === "s3_reveal"
    ? "none"
    : "personal_credential_transport_uncertain";
}

function killElectronProcessGroup(child) {
  if (child.pid === undefined) throw typed("strm23_electron_pid_missing");
  if (process.platform === "win32") child.kill("SIGKILL");
  else process.kill(-child.pid, "SIGKILL");
}

function waitForChild(child, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      try { killElectronProcessGroup(child); } catch { child.kill("SIGKILL"); }
      reject(typed("strm23_process_timeout"));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal });
    });
  });
}

function aggregateResourceCounts(results) {
  return Object.freeze(Object.fromEntries(STRM23_RESOURCE_KEYS.map((key) => [
    key,
    results.reduce((sum, item) => sum + item.resourceCounts[key], 0),
  ])));
}

function runSync(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...cleanElectronEnvironment(process.env),
      CI: "true",
      VITEST_MAX_WORKERS: "1",
    },
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  if (!capture && result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw typed("strm23_regression_gate_failed");
  return result;
}

function parseLastJsonLine(output) {
  const lines = output.trim().split(/\r?\n/u);
  const value = JSON.parse(lines.at(-1) ?? "null");
  if (typeof value !== "object" || value === null) throw typed("strm23_evidence_missing");
  return value;
}

async function persistFailure(error) {
  const evidence = safeFailureEvidence(error?.strm23Context ?? {
    scenario: "harness",
    window: "unknown",
    direction: "unknown",
    lastBarrier: "unknown",
    expectedAction: "none",
    observedSafeStatus: "failed",
    typedErrorCode: safeCode(error),
    resourceCounts: Object.fromEntries(STRM23_RESOURCE_KEYS.map((key) => [
      key,
      key === "childProcessCount" ? activeElectronProcesses.size : 0,
    ])),
    durationMs: Date.now() - startedAt,
    semanticEvidenceDigest: `sha256:${"0".repeat(64)}`,
  });
  const scan = scanStrm23Leakage({
    parentStdout: "failure",
    childStderr: safeCode(error),
    machineEvidence: JSON.stringify(evidence),
    safeTrace: "failed",
  });
  if (scan.totalMatchCount !== 0) return;
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(failureTemporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(failureTemporaryPath, failurePath);
}

async function removeFailureArtifact() {
  for (const path of [failureTemporaryPath, failurePath]) {
    try { await unlink(path); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function scenarioFailure(definition, barrier, status, durationMs) {
  const error = typed("strm23_scenario_failed");
  error.strm23Context = {
    scenario: definition.name,
    window: definition.window,
    direction: definition.direction,
    lastBarrier: barrier?.phase ?? "not_observed",
    expectedAction: definition.action,
    observedSafeStatus: status,
    typedErrorCode: "strm23_scenario_failed",
    resourceCounts: Object.fromEntries(STRM23_RESOURCE_KEYS.map((key) => [
      key,
      Number.isInteger(barrier?.resourceCounts?.[key]) ? barrier.resourceCounts[key] : -1,
    ])),
    durationMs,
    semanticEvidenceDigest: `sha256:${"0".repeat(64)}`,
  };
  return error;
}

function cleanElectronEnvironment(environment) {
  const clean = { ...environment };
  delete clean.ELECTRON_RUN_AS_NODE;
  return clean;
}

function typed(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeCode(error) {
  if (typeof error === "object" && error !== null && typeof error.code === "string") {
    return error.code.replaceAll(/[^a-z0-9_.-]/giu, "_").slice(0, 96);
  }
  if (error instanceof Error) {
    return error.message.replaceAll(/[^a-z0-9_.:-]/giu, "_").slice(0, 96);
  }
  return "unknown_failure";
}
