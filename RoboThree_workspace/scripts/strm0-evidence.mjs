import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const STRM0_SCENARIOS = Object.freeze([
  "roundtrip",
  "foreign_window",
  "wrong_identity",
  "duplicate",
  "wrong_brand",
  "zero_length",
  "max_length",
  "oversize",
  "navigation_invalidated",
  "renderer_crash",
  "port_close",
  "deadline",
]);

export const STRM0_CHANNELS = Object.freeze([
  "parentStdout",
  "childStderr",
  "machineEvidence",
  "safeTrace",
]);

export const STRM0_MARKERS = Object.freeze({
  canary: "strm0-mutation-canary-not-real",
  credential: "sk-strm0-placeholder-not-real",
  providerEndpoint: "https://strm0-sensitive.example.invalid/v1",
  contentBody: "strm0-private-content-body-never-real",
  absolutePath: "/Users/strm0/private/credential.txt",
});

export function scanStrm0Leakage(channels, markers = STRM0_MARKERS) {
  assertExactKeys(channels, STRM0_CHANNELS, "leakage channels");
  const markerValues = Object.values(markers);
  const channelMatchCounts = Object.fromEntries(STRM0_CHANNELS.map((channel) => [
    channel,
    markerValues.reduce((total, marker) => total
      + markerVariants(marker).filter((variant) => channels[channel].includes(variant)).length, 0),
  ]));
  return Object.freeze({
    channelMatchCounts: Object.freeze(channelMatchCounts),
    totalMatchCount: Object.values(channelMatchCounts).reduce((sum, count) => sum + count, 0),
  });
}

export function assertStrm0LeakageScannerNegativeCoverage() {
  let detectionCount = 0;
  for (const channel of STRM0_CHANNELS) {
    for (const marker of Object.values(STRM0_MARKERS)) {
      for (const variant of markerVariants(marker)) {
        const channels = Object.fromEntries(STRM0_CHANNELS.map((key) => [key, "safe"]));
        channels[channel] = `prefix-${variant}-suffix`;
        if (scanStrm0Leakage(channels).channelMatchCounts[channel] <= 0) {
          throw new Error("strm0_leakage_scanner_negative_injection_missed");
        }
        detectionCount += 1;
      }
    }
  }
  return detectionCount;
}

export function validateStrm0ScenarioEvidence(results) {
  if (!Array.isArray(results) || results.length !== STRM0_SCENARIOS.length + 2) {
    throw new Error("strm0_scenario_count_mismatch");
  }
  const rounds = results.filter((result) => result.scenario === "roundtrip");
  if (rounds.length !== 3) throw new Error("strm0_roundtrip_replay_count_mismatch");
  const expected = new Set(STRM0_SCENARIOS);
  for (const result of results) {
    if (result.status !== "PASS" || !expected.has(result.scenario)) {
      throw new Error("strm0_scenario_failed");
    }
    for (const value of Object.values(result.resources ?? {})) {
      if (value !== 0) throw new Error("strm0_resource_not_zero");
    }
    if (result.sandbox !== true
      || result.contextIsolation !== true
      || result.nodeIntegrationDisabled !== true
      || result.mainDerivedWebContentsIdentity !== true
      || result.mainDerivedMainFrameIdentity !== true) {
      throw new Error("strm0_process_identity_or_sandbox_invariant_failed");
    }
  }
  const accepted = results.filter((result) => result.terminalCode === "accepted");
  if (!accepted.every((result) => result.mutationSenderRetainedAfterClone === true
    && result.mutationSenderZeroized === true
    && result.mutationReceiverZeroized === true
    && result.revealSenderRetainedAfterClone === true
    && result.revealSenderZeroized === true
    && result.revealReceiverZeroized === true
    && result.revealValid === true)) {
    throw new Error("strm0_bidirectional_cleanup_invariant_failed");
  }
  return Object.freeze({
    scenarioRunCount: results.length,
    uniqueScenarioCount: expected.size,
    roundtripReplayCount: rounds.length,
    acceptedScenarioCount: accepted.length,
    observableApplicationCopyLowerBound: 2,
  });
}

export function strm0SemanticDigest(summary) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(sortObject(summary)))
    .digest("hex")}`;
}

function markerVariants(marker) {
  const base64 = Buffer.from(marker).toString("base64");
  const urlEncoded = [...Buffer.from(marker)]
    .map((value) => `%${value.toString(16).padStart(2, "0")}`)
    .join("");
  return [...new Set([
    marker,
    base64,
    urlEncoded,
    Buffer.from(marker).toString("hex"),
  ])];
}

function assertExactKeys(value, expected, label) {
  const keys = Object.keys(value).sort();
  const frozen = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(frozen)
    || Object.values(value).some((entry) => typeof entry !== "string")) {
    throw new Error(`strm0_${label.replaceAll(" ", "_")}_invalid`);
  }
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      sortObject(value[key]),
    ]));
  }
  return value;
}
