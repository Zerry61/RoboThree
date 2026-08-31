import { Buffer } from "node:buffer";

export const AAPI03_CHANNELS = Object.freeze([
  "stdout", "stderr", "evidenceJson", "failureJson",
]);

export const AAPI03_MARKERS = Object.freeze([
  "aapi03/secret-token/51d8",
  "aapi03/credential-reference/2c7e",
  "aapi03/provider-endpoint/94af",
  "aapi03/private-prompt/c671",
  "aapi03/workspace-path/8e3a",
]);

export function encodedAapi03Markers() {
  return AAPI03_MARKERS.flatMap((marker) => [
    marker,
    Buffer.from(marker, "utf8").toString("base64"),
    Buffer.from(marker, "utf8").toString("hex"),
    encodeURIComponent(marker),
  ]);
}

export function scanAapi03Leakage(channels) {
  const normalized = Object.fromEntries(AAPI03_CHANNELS.map((name) => {
    if (typeof channels?.[name] !== "string") throw typed("aapi03_channel_invalid");
    return [name, channels[name]];
  }));
  const counts = Object.fromEntries(AAPI03_CHANNELS.map((name) => [name, 0]));
  for (const marker of encodedAapi03Markers()) {
    for (const channel of AAPI03_CHANNELS) {
      if (normalized[channel].includes(marker)) counts[channel] += 1;
    }
  }
  return Object.freeze({
    channelMatchCounts: Object.freeze(counts),
    totalMatchCount: Object.values(counts).reduce((sum, value) => sum + value, 0),
  });
}

export function proveAapi03LeakScanner() {
  let count = 0;
  for (const marker of encodedAapi03Markers()) {
    for (const selected of AAPI03_CHANNELS) {
      const result = scanAapi03Leakage(Object.fromEntries(AAPI03_CHANNELS.map((channel) => [
        channel,
        channel === selected ? `before:${marker}:after` : "safe",
      ])));
      if (result.totalMatchCount !== 1 || result.channelMatchCounts[selected] !== 1) {
        throw typed("aapi03_leak_scanner_not_effective");
      }
      count += 1;
    }
  }
  return count;
}

export function validateAapi03Evidence(value) {
  if (value?.status !== "PASS"
    || value.outcome !== "AAPI03_TEST_ONLY_READ_HTTP_SHELL_CONFORMANT"
    || value.getRouteCount !== 12
    || value.mutationRouteCount !== 0
    || value.productionControllerBeanCount !== 0
    || value.productionMappingCount !== 0
    || value.productionTestInventorySourceCount !== 0
    || value.testIdentityUsed !== true
    || value.productionIdentityReady !== false
    || value.productionAdminReadHttpReady !== false
    || value.browserSecurityReady !== false
    || value.adminAdapterReady !== false
    || value.tgmReady !== false
    || value.knowledgeProviderReady !== false
    || value.agentLifecycleReady !== false
    || value.negativeLeakInjectionDetectionCount !== 80) {
    throw typed("aapi03_evidence_invalid");
  }
  return Object.freeze(value);
}

function typed(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
