import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const STRM23_SCENARIOS = Object.freeze([
  scenario("s1_mutation", "S1", "mutation", "continue", 0),
  scenario("s1_reveal", "S1", "reveal", "continue", 0),
  scenario("s2_mutation", "S2", "mutation", "sigkill_electron", 0),
  scenario("s2_reveal", "S2", "reveal", "sigkill_electron", 0),
  scenario("s3_mutation", "S3", "mutation", "close_port", 0),
  scenario("s3_reveal", "S3", "reveal", "sigkill_electron", 0),
  scenario("s4_mutation", "S4", "mutation", "sigkill_electron", 0),
  scenario("s5_mutation", "S5", "mutation", "sigkill_electron", 0),
  scenario("s5_reveal", "S5", "reveal", "sigkill_electron", 1),
  scenario("s6_mutation", "S6", "mutation", "kill_core", 1),
  scenario("s6_reveal", "S6", "reveal", "kill_core", 1),
  scenario("s7_mutation", "S7", "mutation", "sigkill_electron", 1),
  scenario("s7_reveal", "S7", "reveal", "sigkill_electron", 1),
  scenario("s8_navigation", "S8", "mutation", "navigate", 0),
  scenario("s8_reload", "S8", "mutation", "reload", 0),
  scenario("s8_renderer_crash", "S8", "mutation", "crash_renderer", 0),
  scenario("s8_core_restart", "S8", "reveal", "restart_core", 1),
  scenario("s8_main_close", "S8", "mutation", "close_main", 0),
  scenario("s8_profile_change", "S8", "mutation", "continue", 0),
]);

export const STRM23_RESOURCE_KEYS = Object.freeze([
  "windowCount",
  "messagePortCount",
  "ipcListenerCount",
  "navigationListenerCount",
  "timerCount",
  "transportSessionCount",
  "transportRegistryCount",
  "frameAuthorizationCount",
  "brokerInflightCount",
  "brokerCompletedCount",
  "brokerRevealTombstoneCount",
  "childProcessCount",
  "helperProcessCount",
  "openSensitiveStreamCount",
]);

export const STRM23_CHANNELS = Object.freeze([
  "parentStdout",
  "childStderr",
  "machineEvidence",
  "safeTrace",
]);

export const STRM23_MARKERS = Object.freeze({
  canary: "strm23-sensitive-canary-not-real",
  credential: "sk-strm23-placeholder-not-real",
  providerEndpoint: "https://strm23-sensitive.example.invalid/v1",
  contentBody: "strm23-private-content-body-never-real",
  absolutePath: "/Users/strm23/private/credential.txt",
});

export function validateStrm23ScenarioEvidence(results) {
  if (!Array.isArray(results) || results.length !== STRM23_SCENARIOS.length) {
    throw new Error("strm23_scenario_count_mismatch");
  }
  const expected = new Map(STRM23_SCENARIOS.map((item) => [item.name, item]));
  for (const result of results) {
    const definition = expected.get(result.scenario);
    if (definition === undefined || result.status !== "PASS") {
      throw new Error("strm23_scenario_failed");
    }
    if (result.window !== definition.window
      || result.direction !== definition.direction
      || result.barrierReachedCount !== 1
      || result.actionCount !== 1
      || result.brokerDispatchCount !== definition.expectedDispatchCount) {
      throw new Error("strm23_scenario_identity_or_dispatch_mismatch");
    }
    if (!Number.isInteger(result.lateCleanupCount) || result.lateCleanupCount < 0) {
      throw new Error("strm23_late_cleanup_count_invalid");
    }
    if (definition.action === "sigkill_electron"
      && (result.processExitObservation?.processGroupExitObserved !== true
        || result.processExitObservation.activeGroupMemberCount !== 0
        || result.processExitObservation.activeTrackedProcessCount !== 0
        || Object.keys(result.resourceCountsAtBarrier ?? {}).length !== STRM23_RESOURCE_KEYS.length
        || !result.resourceAccountingSources?.includes("os_process_table_snapshot"))) {
      throw new Error("strm23_process_group_exit_evidence_invalid");
    }
    if (result.realCorePrivateSupervisor !== true
      || result.jsonLifecycleFd3 !== true
      || result.binaryBrokerFd4Fd5 !== true
      || result.sandbox !== true
      || result.contextIsolation !== true
      || result.nodeIntegrationDisabled !== true) {
      throw new Error("strm23_process_topology_not_proven");
    }
    for (const key of STRM23_RESOURCE_KEYS) {
      if (result.resourceCounts?.[key] !== 0) {
        throw new Error(`strm23_resource_not_zero:${key}`);
      }
    }
    for (const key of [
      "productionFeatureEnabled",
      "productionSensitiveTransportReady",
      "productionBusinessHandlerReady",
      "transportBlockerClosed",
      "rendererBusinessApiExposed",
      "zeroCopyClaimed",
    ]) {
      if (result[key] !== false) throw new Error(`strm23_forbidden_claim:${key}`);
    }
  }
  const coreRecovery = results.filter((item) => item.scenario === "s6_mutation"
    || item.scenario === "s6_reveal" || item.scenario === "s8_core_restart");
  if (!coreRecovery.every((item) => item.runtimeChanged === true
    && item.channelChanged === true && item.coreStartCount >= 2)) {
    throw new Error("strm23_core_restart_identity_not_changed");
  }
  return Object.freeze({
    scenarioRunCount: results.length,
    namedCrashWindows: Object.freeze([...new Set(results.map((item) => item.window))]),
    mutationScenarioCount: results.filter((item) => item.direction === "mutation").length,
    revealScenarioCount: results.filter((item) => item.direction === "reveal").length,
    brokerDispatchCount: results.reduce((sum, item) => sum + item.brokerDispatchCount, 0),
    durableReconciliationRequiredCount: results.filter(
      (item) => item.classification === "business_reconciliation_required",
    ).length,
    revealNoReplayCount: results.filter(
      (item) => item.classification === "reveal_uncertain_no_replay",
    ).length,
  });
}

export function validateStrm23ParentDecision(barrier, decision) {
  if (typeof barrier !== "object" || barrier === null
    || typeof decision !== "object" || decision === null
    || barrier.type !== "barrier"
    || barrier.scenarioId !== decision.scenarioId
    || typeof decision.action !== "string") {
    throw new Error("barrier_identity_mismatch");
  }
  const definition = STRM23_SCENARIOS.find((item) => item.name === barrier.scenario);
  if (definition === undefined
    || definition.window !== barrier.window
    || definition.direction !== barrier.direction
    || definition.action !== decision.action) {
    throw new Error("barrier_identity_mismatch");
  }
  return true;
}

export function semanticStrm23Summary(results) {
  return Object.freeze(results.map((item) => Object.freeze({
    scenario: item.scenario,
    window: item.window,
    direction: item.direction,
    classification: item.classification,
    typedErrorCode: item.typedErrorCode,
    barrierReachedCount: item.barrierReachedCount,
    brokerDispatchCount: item.brokerDispatchCount,
    terminalObserved: item.terminalObserved,
    runtimeChanged: item.runtimeChanged,
    channelChanged: item.channelChanged,
    lateCleanupCount: item.lateCleanupCount,
    productionFeatureEnabled: item.productionFeatureEnabled,
    productionSensitiveTransportReady: item.productionSensitiveTransportReady,
    productionBusinessHandlerReady: item.productionBusinessHandlerReady,
    transportBlockerClosed: item.transportBlockerClosed,
    rendererBusinessApiExposed: item.rendererBusinessApiExposed,
    zeroCopyClaimed: item.zeroCopyClaimed,
  })));
}

export function strm23SemanticDigest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(sortObject(value)))
    .digest("hex")}`;
}

export function scanStrm23Leakage(channels, markers = STRM23_MARKERS) {
  assertExactKeys(channels, STRM23_CHANNELS, "channels");
  const channelMatchCounts = Object.fromEntries(STRM23_CHANNELS.map((channel) => [
    channel,
    Object.values(markers).reduce((total, marker) => total
      + markerVariants(marker).filter((variant) => channels[channel].includes(variant)).length, 0),
  ]));
  return Object.freeze({
    channelMatchCounts: Object.freeze(channelMatchCounts),
    totalMatchCount: Object.values(channelMatchCounts).reduce((sum, count) => sum + count, 0),
  });
}

export function assertStrm23LeakageScannerNegativeCoverage() {
  let detectionCount = 0;
  for (const channel of STRM23_CHANNELS) {
    for (const marker of Object.values(STRM23_MARKERS)) {
      for (const variant of markerVariants(marker)) {
        const channels = Object.fromEntries(STRM23_CHANNELS.map((key) => [key, "safe"]));
        channels[channel] = `prefix-${variant}-suffix`;
        if (scanStrm23Leakage(channels).channelMatchCounts[channel] <= 0) {
          throw new Error("strm23_leakage_negative_injection_missed");
        }
        detectionCount += 1;
      }
    }
  }
  return detectionCount;
}

export function safeFailureEvidence(input) {
  return Object.freeze({
    schemaVersion: "strm23-failure-evidence.v1",
    scenario: safeText(input.scenario),
    window: safeText(input.window),
    direction: safeText(input.direction),
    lastBarrier: safeText(input.lastBarrier),
    expectedAction: safeText(input.expectedAction),
    observedSafeStatus: safeText(input.observedSafeStatus),
    typedErrorCode: safeText(input.typedErrorCode),
    resourceCounts: Object.freeze(Object.fromEntries(STRM23_RESOURCE_KEYS.map((key) => [
      key,
      Number.isInteger(input.resourceCounts?.[key]) ? input.resourceCounts[key] : -1,
    ]))),
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.trunc(input.durationMs)) : 0,
    semanticEvidenceDigest: /^sha256:[0-9a-f]{64}$/u.test(input.semanticEvidenceDigest ?? "")
      ? input.semanticEvidenceDigest
      : `sha256:${"0".repeat(64)}`,
  });
}

function scenario(name, window, direction, action, expectedDispatchCount) {
  return Object.freeze({ name, window, direction, action, expectedDispatchCount });
}

function markerVariants(marker) {
  return [...new Set([
    marker,
    Buffer.from(marker).toString("base64"),
    [...Buffer.from(marker)].map((value) => `%${value.toString(16).padStart(2, "0")}`).join(""),
    Buffer.from(marker).toString("hex"),
  ])];
}

function safeText(value) {
  return typeof value === "string"
    ? value.replaceAll(/[^a-z0-9_.:-]/giu, "_").slice(0, 96)
    : "unknown";
}

function assertExactKeys(value, expected, label) {
  const keys = Object.keys(value).sort();
  const frozen = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(frozen)
    || Object.values(value).some((entry) => typeof entry !== "string")) {
    throw new Error(`strm23_${label}_invalid`);
  }
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  }
  return value;
}
