import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const DFI534_CHANNELS = Object.freeze([
  "stdout",
  "stderr",
  "evidenceJson",
  "failureJson",
]);

export const DFI534_MARKERS = Object.freeze({
  credential: "dfi534/credential/\"7a3e91\"",
  endpoint: "dfi534/endpoint/\"2f960b\"",
  rawEffort: "dfi534/raw-effort/\"ef1854\"",
  rawBudget: "dfi534/raw-budget/\"384db0\"",
  privateReasoning: "dfi534/private-reasoning/\"92ad63\"",
});

export const DFI534_RESOURCE_KEYS = Object.freeze([
  "activeCoreChildren",
  "activeCentralChildren",
  "providerFixtureServers",
  "listeningPorts",
  "openSqliteHandles",
  "inFlightInvocationLinkClaims",
  "providerStreams",
  "sseSubscriptions",
  "timersSchedulers",
  "abortControllers",
  "mappingLookupLeases",
  "pendingUsageProjections",
  "lateCallbacks",
  "temporaryFixtureFileHandles",
]);

export const DFI534_PROVIDER_PATHS = Object.freeze([
  "local_personal_openai",
  "enterprise_openai",
  "enterprise_anthropic",
]);

export function encodedDfi534Markers() {
  return Object.values(DFI534_MARKERS).flatMap((marker) => [
    Object.freeze({ marker, encoding: "plain", value: marker }),
    Object.freeze({
      marker,
      encoding: "json_escaped",
      value: JSON.stringify(marker).slice(1, -1),
    }),
    Object.freeze({
      marker,
      encoding: "base64",
      value: Buffer.from(marker, "utf8").toString("base64"),
    }),
    Object.freeze({ marker, encoding: "percent", value: encodeURIComponent(marker) }),
  ]);
}

export function scanDfi534Leakage(channels) {
  const normalized = Object.fromEntries(DFI534_CHANNELS.map((channel) => {
    const value = channels[channel];
    if (typeof value !== "string") throw typed(`dfi534_channel_invalid:${channel}`);
    return [channel, value];
  }));
  const matches = [];
  for (const encoded of encodedDfi534Markers()) {
    for (const channel of DFI534_CHANNELS) {
      if (normalized[channel].includes(encoded.value)) {
        matches.push(Object.freeze({ channel, encoding: encoded.encoding }));
      }
    }
  }
  return Object.freeze({
    totalMatchCount: matches.length,
    channelMatchCounts: Object.freeze(Object.fromEntries(DFI534_CHANNELS.map((channel) => [
      channel,
      matches.filter((match) => match.channel === channel).length,
    ]))),
  });
}

export function proveDfi534LeakScannerNegativeCoverage() {
  let detectionCount = 0;
  for (const encoded of encodedDfi534Markers()) {
    for (const channel of DFI534_CHANNELS) {
      const channels = Object.fromEntries(DFI534_CHANNELS.map((candidate) => [
        candidate,
        candidate === channel ? `prefix:${encoded.value}:suffix` : "safe",
      ]));
      const result = scanDfi534Leakage(channels);
      if (result.totalMatchCount !== 1 || result.channelMatchCounts[channel] !== 1) {
        throw typed(`dfi534_leak_injection_missed:${channel}:${encoded.encoding}`);
      }
      detectionCount += 1;
    }
  }
  return detectionCount;
}

export function exactDfi534ResourceCounts(input) {
  if (!isRecord(input)) throw typed("dfi534_resource_counts_invalid");
  return Object.freeze(Object.fromEntries(DFI534_RESOURCE_KEYS.map((key) => {
    const value = input[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw typed(`dfi534_resource_count_invalid:${key}`);
    }
    return [key, value];
  })));
}

export function extractDfi53ParentMatrix(plan) {
  if (typeof plan !== "string") throw typed("dfi534_parent_plan_invalid");
  const start = plan.indexOf("## 9. QA 矩阵（120 项）");
  const end = plan.indexOf("## 10. 分批实施计划与估算", start);
  if (start < 0 || end < 0) throw typed("dfi534_parent_matrix_missing");
  const section = plan.slice(start, end);
  const ids = [];
  for (const line of section.split("\n")) {
    if (line.startsWith("#") || line.startsWith(">")) continue;
    for (const match of line.matchAll(/(?:^|；)\s*(\d+)(?:～(\d+))?\./gu)) {
      const first = Number(match[1]);
      const last = match[2] === undefined ? first : Number(match[2]);
      for (let value = first; value <= last; value += 1) ids.push(value);
    }
  }
  const unique = [...new Set(ids)].sort((left, right) => left - right);
  if (unique.length !== 120 || unique.some((value, index) => value !== index + 1)) {
    throw typed("dfi534_parent_matrix_drift");
  }
  return Object.freeze(unique);
}

export function createDfi53ParentExecutionLedger(input) {
  const ids = extractDfi53ParentMatrix(input.parentPlan);
  if (!isRecord(input.ownerResults)) throw typed("dfi534_owner_results_invalid");
  const ledger = ids.map((id) => {
    const ownerTest = ownerForParentQa(id);
    if (input.ownerResults[ownerTest] !== "pass") {
      throw typed(`dfi534_parent_owner_not_passed:${ownerTest}`);
    }
    return Object.freeze({
      qaId: `QA-${String(id).padStart(3, "0")}`,
      ownerTest,
      providerPath: providerPathForParentQa(id),
      evidenceKey: `parent.${String(id).padStart(3, "0")}`,
      result: "pass",
    });
  });
  return Object.freeze(ledger);
}

export function dfi534SemanticDigest(summary) {
  if (!isRecord(summary)) throw typed("dfi534_semantic_summary_invalid");
  const normalized = { ...summary };
  for (const key of [
    "processId",
    "port",
    "temporaryPath",
    "wallClockStartedAt",
    "transportNonce",
  ]) {
    delete normalized[key];
  }
  return `sha256:${createHash("sha256").update(canonicalJson(normalized)).digest("hex")}`;
}

export function validateDfi534ClosureEvidence(evidence) {
  if (!isRecord(evidence)
    || evidence.status !== "PASS"
    || evidence.outcome !== "DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT"
    || evidence.parentQaMatrixCount !== 120
    || evidence.parentMatrixExecutionStatus !== "executed_at_dfi53_stage_closure"
    || evidence.focusedQaMatrixCount !== 96
    || evidence.semanticReplayCount !== 3
    || evidence.negativeLeakInjectionDetectionCount !== 80
    || evidence.localPersonalPathConformant !== true
    || evidence.enterpriseOpenAiPathConformant !== true
    || evidence.enterpriseAnthropicPathConformant !== true
    || evidence.productionSubmitTurnV1Alpha3Reachable !== false
    || evidence.desktopMaxUiReady !== false
    || evidence.productionGatewayV1Alpha3RouteCount !== 0
    || evidence.productionLocalPersonalMaxReleaseCount !== 0
    || evidence.productionEnterpriseOpenAiMaxReleaseCount !== 0
    || evidence.productionEnterpriseAnthropicMaxReleaseCount !== 0
    || evidence.productionCpcActivationEnabled !== false
    || evidence.productionEnterpriseEntitlementReady !== false
    || evidence.tgmReady !== false
    || evidence.knowledgeProviderReady !== false
    || evidence.agentLifecycleReady !== false
    || evidence.desktopAdminV2ConsumptionReady !== false) {
    throw typed("dfi534_closure_evidence_invalid");
  }
  if (!Array.isArray(evidence.parentQaLedger)
    || evidence.parentQaLedger.length !== 120
    || evidence.parentQaLedger.some((entry, index) => !isRecord(entry)
      || entry.qaId !== `QA-${String(index + 1).padStart(3, "0")}`
      || entry.result !== "pass")) {
    throw typed("dfi534_parent_ledger_invalid");
  }
  const resourceCounts = exactDfi534ResourceCounts(evidence.resourceCounts);
  if (Object.values(resourceCounts).some((value) => value !== 0)) {
    throw typed("dfi534_resources_not_zero");
  }
  return Object.freeze({ ...evidence, resourceCounts });
}

function ownerForParentQa(id) {
  if (id <= 20) return "dfi5.3.1+dfi5.3.3";
  if (id <= 40) return "dfi5.3.2+dfi5.3.3";
  if (id <= 64) return "dfi5.3.1+dfi5.3.2+dfi5.3.3";
  if (id <= 84) return "dfi5.3.3";
  if (id <= 108) return "dfi5.3.4-lifecycle";
  return "dfi5.3.4-boundary";
}

function providerPathForParentQa(id) {
  if (id <= 20 || id >= 109) return "cross_provider";
  if (id >= 65 && id <= 84) return "enterprise_gateway";
  if ([21, 24, 27, 45, 46, 47].includes(id)) return "local_personal_openai";
  if ([23, 26, 29, 44].includes(id)) return "enterprise_anthropic";
  if ([22, 25, 28, 41, 42, 43].includes(id)) return "enterprise_openai";
  return "cross_provider";
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
