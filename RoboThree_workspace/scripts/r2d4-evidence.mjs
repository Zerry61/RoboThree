import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const R2D4_CHANNELS = Object.freeze([
  "stdout",
  "stderr",
  "evidenceJson",
  "failureJson",
]);

export const R2D4_MARKERS = Object.freeze({
  credential: "r2d4/credential-token/8e3c1a",
  workspacePath: "r2d4/absolute-workspace/0f947b",
  entitlementOwner: "r2d4/entitlement-owner/62d90e",
  resourceAllowlist: "r2d4/resource-allowlist/ba1843",
  providerReasoning: "r2d4/provider-reasoning/49cf25",
});

export const R2D4_RESOURCE_KEYS = Object.freeze([
  "activeCoreChildren",
  "openSqliteHandles",
  "preparedInvocationLinks",
  "pendingCoordination",
  "activeCapabilityLocks",
  "activeAgentResolutionLeases",
  "activeEntitlementSnapshotLeases",
  "activeTimeoutSchedulers",
  "activeProviderRequests",
  "activeContextMaterializers",
  "activeCompactionJobs",
  "lateCallbacks",
]);

export const R2D4_CRASH_WINDOWS = Object.freeze([
  "accepted_after_commit",
  "message_appended_after_commit",
  "task_bundle_after_commit",
  "task_committed_after_commit",
  "completed_after_commit",
]);

export const R2D4_TIME_FACT_KEYS = Object.freeze([
  "acceptedAt",
  "createdAt",
  "lockedAt",
  "observedAt",
  "committedAt",
]);

export function encodedR2D4Markers() {
  return Object.values(R2D4_MARKERS).flatMap((marker) => [
    Object.freeze({ marker, encoding: "raw", value: marker }),
    Object.freeze({
      marker,
      encoding: "base64",
      value: Buffer.from(marker, "utf8").toString("base64"),
    }),
    Object.freeze({
      marker,
      encoding: "hex",
      value: Buffer.from(marker, "utf8").toString("hex"),
    }),
    Object.freeze({ marker, encoding: "url", value: encodeURIComponent(marker) }),
  ]);
}

export function scanR2D4Leakage(channels) {
  const normalized = Object.fromEntries(R2D4_CHANNELS.map((channel) => {
    const value = channels[channel];
    if (typeof value !== "string") throw typed(`r2d4_channel_invalid:${channel}`);
    return [channel, value];
  }));
  const matches = [];
  for (const encoded of encodedR2D4Markers()) {
    for (const channel of R2D4_CHANNELS) {
      if (normalized[channel].includes(encoded.value)) {
        matches.push(Object.freeze({ channel, encoding: encoded.encoding }));
      }
    }
  }
  return Object.freeze({
    totalMatchCount: matches.length,
    channelMatchCounts: Object.freeze(Object.fromEntries(R2D4_CHANNELS.map((channel) => [
      channel,
      matches.filter((match) => match.channel === channel).length,
    ]))),
  });
}

export function proveR2D4LeakScannerNegativeCoverage() {
  let detectionCount = 0;
  for (const encoded of encodedR2D4Markers()) {
    for (const channel of R2D4_CHANNELS) {
      const channels = Object.fromEntries(R2D4_CHANNELS.map((candidate) => [
        candidate,
        candidate === channel ? `prefix:${encoded.value}:suffix` : "safe",
      ]));
      const result = scanR2D4Leakage(channels);
      if (result.totalMatchCount !== 1 || result.channelMatchCounts[channel] !== 1) {
        throw typed(`r2d4_leak_injection_missed:${channel}:${encoded.encoding}`);
      }
      detectionCount += 1;
    }
  }
  return detectionCount;
}

export function exactR2D4ResourceCounts(input) {
  if (!isRecord(input)) throw typed("r2d4_resource_counts_invalid");
  return Object.freeze(Object.fromEntries(R2D4_RESOURCE_KEYS.map((key) => {
    const value = input[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw typed(`r2d4_resource_count_invalid:${key}`);
    }
    return [key, value];
  })));
}

export function exactR2D4TimeFacts(input) {
  if (!isRecord(input)) throw typed("r2d4_time_facts_invalid");
  return Object.freeze(Object.fromEntries(R2D4_TIME_FACT_KEYS.map((key) => {
    const value = input[key];
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
      throw typed(`r2d4_time_fact_invalid:${key}`);
    }
    return [key, value];
  })));
}

export function r2d4SemanticSummary(input) {
  return Object.freeze({
    schemaVersion: "v1",
    scenarioOutcomes: [...input.scenarioOutcomes].sort((left, right) =>
      left.scenario.localeCompare(right.scenario)),
    acceptedPlanDigest: input.acceptedPlanDigest,
    entitlementSnapshotDigest: input.entitlementSnapshotDigest,
    agentResourceDecisionDigest: input.agentResourceDecisionDigest,
    runtimeSelectionDigest: input.runtimeSelectionDigest,
    reasoningModeLockId: input.reasoningModeLockId,
    reasoningModeLockDigest: input.reasoningModeLockDigest,
    taskInstructionBindingDigest: input.taskInstructionBindingDigest,
    dynamicFactsDigestSequence: [...input.dynamicFactsDigestSequence],
    modelRequestDigestSequence: [...input.modelRequestDigestSequence],
    coordinationTerminalState: input.coordinationTerminalState,
    typedFailureCodes: [...input.typedFailureCodes].sort(),
    timeFacts: exactR2D4TimeFacts(input.timeFacts),
    resourceTerminalCounts: exactR2D4ResourceCounts(input.resourceTerminalCounts),
  });
}

export function r2d4SemanticDigest(summary) {
  return `sha256:${createHash("sha256").update(canonicalJson(summary)).digest("hex")}`;
}

export function validateR2D4ClosureEvidence(evidence) {
  if (!isRecord(evidence)
    || evidence.status !== "PASS"
    || evidence.outcome !== "R2D_CORE_DELTA_CONFORMANT"
    || evidence.productionR2dGateEnabled !== false
    || evidence.productionCpcActivationEnabled !== false
    || evidence.productionEnterpriseEntitlementReady !== false
    || evidence.agentLifecycleReady !== false
    || evidence.desktopV2ConsumptionReady !== false
    || evidence.adminV2ConsumptionReady !== false
    || evidence.knowledgeProviderReady !== false
    || evidence.memoryReady !== false
    || evidence.effectReconciliationReady !== false
    || evidence.dfi53Unlocked !== false
    || evidence.testIdentityUsed !== true
    || evidence.semanticReplayCount !== 3
    || evidence.negativeLeakInjectionDetectionCount !== 80) {
    throw typed("r2d4_closure_evidence_invalid");
  }
  const resourceCounts = exactR2D4ResourceCounts(evidence.resourceCounts);
  if (Object.values(resourceCounts).some((value) => value !== 0)) {
    throw typed("r2d4_closure_resources_not_zero");
  }
  return Object.freeze({ ...evidence, resourceCounts });
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typed(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
