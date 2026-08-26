import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export const RESOURCE_METRIC_KEYS = Object.freeze([
  "childProcessCount",
  "openLoopbackPortCount",
  "connectionCount",
  "recoveryLeaseCount",
  "subscriberCount",
  "bufferCount",
  "pendingTimerCount",
  "temporaryArtifactHandleCount",
]);

export const LEAKAGE_CHANNEL_KEYS = Object.freeze([
  "processOutput",
  "childLogAndTrace",
  "testAndMachineEvidence",
  "safeJsonAndDiagnostics",
]);

export const LEAKAGE_MARKER_KEYS = Object.freeze([
  "canary",
  "credential",
  "providerEndpoint",
  "contentBody",
  "absolutePath",
]);

const ROUND_KEYS = Object.freeze([
  "topology",
  "coreRecovery",
  "centralRecovery",
  "terminalClassCounts",
  "typedErrorCodes",
]);

export function matrixDefinitionDigest(input) {
  return digest({
    revision: "ARH-3.3.3-Revision-1",
    scenarioCount: 52,
    minimumParentScenarioCount: 36,
    crashWindows: [...input.crashWindows].sort(),
    invocationKinds: [...input.invocationKinds].sort(),
    cacheStatuses: [...input.cacheStatuses].sort(),
  });
}

export function normalizeSemanticRound(input) {
  assertStrictKeys(input, ROUND_KEYS, "semantic round");
  const normalized = Object.freeze({
    topology: normalizeTopology(input.topology),
    coreRecovery: normalizeCoreRecovery(input.coreRecovery),
    centralRecovery: normalizeCentralRecovery(input.centralRecovery),
    terminalClassCounts: sortedCountRecord(
      input.terminalClassCounts,
      "terminal class counts",
    ),
    typedErrorCodes: sortedUniqueStrings(input.typedErrorCodes, "typed error codes"),
  });
  return Object.freeze({
    normalized,
    semanticResultDigest: digest(normalized),
    normalizedTimelineDigest: digest({
      core: normalized.coreRecovery.timelineDigest,
      central: normalized.centralRecovery.durableCursorClass,
      terminalClassCounts: normalized.terminalClassCounts,
    }),
    viewDigest: digest({
      topology: normalized.topology.topologyDigest,
      semanticView: normalized.coreRecovery.semanticViewDigest,
    }),
    sourceDigest: digest({
      initialCompactionCommittedCount:
        normalized.coreRecovery.initialCompactionCommittedCount,
      rollingCompactionCommittedCount:
        normalized.coreRecovery.rollingCompactionCommittedCount,
    }),
    usageDigest: digest({
      usageProjectionCount: normalized.topology.usageProjectionCount,
      usageFactCount: normalized.centralRecovery.usageFactCount,
    }),
    cacheDigest: digest({
      cacheContextCount: normalized.topology.cacheContextCount,
      cachePlanCount: normalized.centralRecovery.cachePlanCount,
      statuses: normalized.centralRecovery.cacheStatusCounts,
    }),
  });
}

export class ResourceDiagnosticsAdapter {
  #observations = new Map();

  observe(source, metrics) {
    if (typeof source !== "string" || source.length === 0) {
      throw new Error("resource diagnostics source is required");
    }
    if (this.#observations.has(source)) {
      throw new Error("resource diagnostics source was recorded twice");
    }
    assertStrictKeys(metrics, RESOURCE_METRIC_KEYS, `resource metrics from ${source}`);
    const normalized = Object.fromEntries(RESOURCE_METRIC_KEYS.map((key) => [
      key,
      nonNegativeInteger(metrics[key], `resource metric ${key}`),
    ]));
    this.#observations.set(source, Object.freeze(normalized));
  }

  close(requiredSources) {
    const sources = sortedUniqueStrings(requiredSources, "resource diagnostic sources");
    for (const source of sources) {
      if (!this.#observations.has(source)) {
        throw new Error(`resource diagnostics are missing for ${source}`);
      }
    }
    if (this.#observations.size !== sources.length) {
      throw new Error("resource diagnostics contain an unexpected source");
    }
    const metrics = Object.fromEntries(RESOURCE_METRIC_KEYS.map((key) => [
      key,
      Math.max(...sources.map((source) => this.#observations.get(source)[key])),
    ]));
    for (const [key, value] of Object.entries(metrics)) {
      if (value !== 0) throw new Error(`resource metric ${key} did not return to zero`);
    }
    return Object.freeze(metrics);
  }
}

export class FourChannelLeakageScanner {
  #markers;

  constructor(markers) {
    assertStrictKeys(markers, LEAKAGE_MARKER_KEYS, "leakage markers");
    const values = LEAKAGE_MARKER_KEYS.map((key) =>
      nonEmptyString(markers[key], `leakage marker ${key}`));
    if (new Set(values).size !== values.length) {
      throw new Error("leakage markers must be unique");
    }
    this.#markers = Object.freeze(values);
  }

  scan(channels) {
    assertStrictKeys(channels, LEAKAGE_CHANNEL_KEYS, "leakage channels");
    const channelMatchCounts = Object.fromEntries(
      LEAKAGE_CHANNEL_KEYS.map((key) => [key, this.#count(channels[key])]),
    );
    const totalMatchCount = Object.values(channelMatchCounts)
      .reduce((sum, count) => sum + count, 0);
    return Object.freeze({
      channelMatchCounts: Object.freeze(channelMatchCounts),
      totalMatchCount,
    });
  }

  assertClean(channels) {
    const result = this.scan(channels);
    if (result.totalMatchCount !== 0) {
      const error = new Error("arh333.four_channel_sensitive_output_detected");
      error.channelMatchCounts = result.channelMatchCounts;
      throw error;
    }
    return result;
  }

  #count(channel) {
    const texts = Array.isArray(channel) ? channel : [channel];
    if (texts.some((value) => typeof value !== "string")) {
      throw new Error("leakage channel values must be strings");
    }
    let count = 0;
    for (const text of texts) {
      for (const marker of this.#markers) {
        for (const variant of markerVariants(marker)) {
          if (text.includes(variant)) count += 1;
        }
      }
    }
    return count;
  }
}

export function assertSemanticReplay(rounds) {
  if (!Array.isArray(rounds) || rounds.length !== 3) {
    throw new Error("semantic replay requires exactly three fresh rounds");
  }
  const expected = rounds[0]?.semanticResultDigest;
  if (!DIGEST_PATTERN.test(expected ?? "")) {
    throw new Error("semantic replay is missing its first durable result digest");
  }
  if (!rounds.every((round) => round.semanticResultDigest === expected)) {
    throw new Error("semantic replay durable results diverged");
  }
  return expected;
}

export function digest(value) {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex")}`;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      canonicalValue(value[key]),
    ]));
  }
  return value;
}

function normalizeTopology(value) {
  assertStrictKeys(value, [
    "sessionCount",
    "userScopeCount",
    "enterpriseScopeCount",
    "cacheContextCount",
    "usageProjectionCount",
    "topologyDigest",
  ], "topology evidence");
  return Object.freeze({
    sessionCount: positiveInteger(value.sessionCount, "session count"),
    userScopeCount: positiveInteger(value.userScopeCount, "user scope count"),
    enterpriseScopeCount: positiveInteger(
      value.enterpriseScopeCount,
      "enterprise scope count",
    ),
    cacheContextCount: positiveInteger(value.cacheContextCount, "cache context count"),
    usageProjectionCount: positiveInteger(
      value.usageProjectionCount,
      "usage projection count",
    ),
    topologyDigest: requiredDigest(value.topologyDigest, "topology digest"),
  });
}

function normalizeCoreRecovery(value) {
  assertStrictKeys(value, [
    "mainTerminalCount",
    "initialCompactionCommittedCount",
    "rollingCompactionCommittedCount",
    "coreReopenRecoveryCount",
    "statusFirstReconciliationCount",
    "toolCallCount",
    "timelineDigest",
    "semanticViewDigest",
  ], "Core recovery evidence");
  return Object.freeze({
    mainTerminalCount: positiveInteger(value.mainTerminalCount, "main terminal count"),
    initialCompactionCommittedCount: positiveInteger(
      value.initialCompactionCommittedCount,
      "initial Compaction count",
    ),
    rollingCompactionCommittedCount: positiveInteger(
      value.rollingCompactionCommittedCount,
      "rolling Compaction count",
    ),
    coreReopenRecoveryCount: positiveInteger(
      value.coreReopenRecoveryCount,
      "Core reopen recovery count",
    ),
    statusFirstReconciliationCount: positiveInteger(
      value.statusFirstReconciliationCount,
      "status-first reconciliation count",
    ),
    toolCallCount: positiveInteger(value.toolCallCount, "Tool Call count"),
    timelineDigest: requiredDigest(value.timelineDigest, "timeline digest"),
    semanticViewDigest: requiredDigest(value.semanticViewDigest, "semantic view digest"),
  });
}

function normalizeCentralRecovery(value) {
  assertStrictKeys(value, [
    "centralTakeoverCount",
    "durableTerminalCount",
    "providerRequestCount",
    "usageFactCount",
    "cachePlanCount",
    "fencingConflictCount",
    "durableCursorClass",
    "cacheStatusCounts",
  ], "Central recovery evidence");
  return Object.freeze({
    centralTakeoverCount: positiveInteger(
      value.centralTakeoverCount,
      "Central takeover count",
    ),
    durableTerminalCount: positiveInteger(
      value.durableTerminalCount,
      "durable terminal count",
    ),
    providerRequestCount: positiveInteger(
      value.providerRequestCount,
      "Provider request count",
    ),
    usageFactCount: positiveInteger(value.usageFactCount, "Usage fact count"),
    cachePlanCount: positiveInteger(value.cachePlanCount, "cache Plan count"),
    fencingConflictCount: positiveInteger(
      value.fencingConflictCount,
      "fencing conflict count",
    ),
    durableCursorClass: nonEmptyString(value.durableCursorClass, "durable cursor class"),
    cacheStatusCounts: sortedCountRecord(value.cacheStatusCounts, "cache status counts"),
  });
}

function sortedCountRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) throw new Error(`${label} must not be empty`);
  return Object.freeze(Object.fromEntries(entries.map(([key, count]) => [
    nonEmptyString(key, `${label} key`),
    nonNegativeInteger(count, `${label}.${key}`),
  ])));
}

function sortedUniqueStrings(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  const normalized = values.map((value) => nonEmptyString(value, label)).sort();
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} contain a duplicate`);
  }
  return Object.freeze(normalized);
}

function assertStrictKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} does not match its strict schema`);
  }
}

function requiredDigest(value, label) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function positiveInteger(value, label) {
  const number = nonNegativeInteger(value, label);
  if (number === 0) throw new Error(`${label} must be positive`);
  return number;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function markerVariants(marker) {
  return [...new Set([
    marker,
    Buffer.from(marker, "utf8").toString("base64"),
    encodeURIComponent(marker),
  ])];
}
