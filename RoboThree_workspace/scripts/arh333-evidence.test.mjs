import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import {
  LEAKAGE_CHANNEL_KEYS,
  LEAKAGE_MARKER_KEYS,
  FourChannelLeakageScanner,
  RESOURCE_METRIC_KEYS,
  ResourceDiagnosticsAdapter,
  assertSemanticReplay,
  digest,
  matrixDefinitionDigest,
  normalizeSemanticRound,
} from "./arh333-evidence.mjs";

describe("ARH-3.3.3 private safe evidence", () => {
  it("keeps matrix identity separate from actual durable results", () => {
    const definition = matrixDefinitionDigest(matrix());
    const result = normalizeSemanticRound(round());
    expect(definition).not.toBe(result.semanticResultDigest);
  });

  it("is canonical for unordered count maps and typed error sets", () => {
    const left = normalizeSemanticRound(round());
    const right = normalizeSemanticRound({
      ...round(),
      terminalClassCounts: { uncertain: 2, completed: 9 },
      typedErrorCodes: ["recovery_exhausted", "model_stream_resume_unavailable"],
    });
    expect(left.semanticResultDigest).toBe(right.semanticResultDigest);
  });

  it("changes when a durable terminal, Usage, cache, or Summary fact changes", () => {
    const baseline = normalizeSemanticRound(round()).semanticResultDigest;
    const changes = [
      { terminalClassCounts: { completed: 8, uncertain: 3 } },
      { topology: { ...round().topology, usageProjectionCount: 5 } },
      { centralRecovery: { ...round().centralRecovery, cachePlanCount: 6 } },
      { coreRecovery: { ...round().coreRecovery, rollingCompactionCommittedCount: 2 } },
    ];
    for (const change of changes) {
      expect(normalizeSemanticRound({ ...round(), ...change }).semanticResultDigest)
        .not.toBe(baseline);
    }
  });

  it("does not accept process, transport, clock, path, or body fields", () => {
    for (const key of ["pid", "port", "requestId", "startedAt", "path", "message"]) {
      expect(() => normalizeSemanticRound({ ...round(), [key]: "forbidden" }))
        .toThrow("strict schema");
    }
  });

  it("requires exactly three equal semantic replay rounds", () => {
    const value = normalizeSemanticRound(round());
    expect(assertSemanticReplay([value, value, value])).toBe(value.semanticResultDigest);
    expect(() => assertSemanticReplay([value, value])).toThrow("exactly three");
    const drift = normalizeSemanticRound({
      ...round(),
      terminalClassCounts: { completed: 8, uncertain: 3 },
    });
    expect(() => assertSemanticReplay([value, value, drift])).toThrow("diverged");
  });

  it("fails closed when a resource diagnostic is missing or duplicated", () => {
    const adapter = new ResourceDiagnosticsAdapter();
    adapter.observe("core", zeroMetrics());
    expect(() => adapter.close(["core", "central"]))
      .toThrow("missing for central");
    expect(() => adapter.observe("core", zeroMetrics())).toThrow("twice");
  });

  it("rejects hard-coded partial/default metrics and non-zero resources", () => {
    const incomplete = new ResourceDiagnosticsAdapter();
    expect(() => incomplete.observe("core", { childProcessCount: 0 }))
      .toThrow("strict schema");
    const leaked = new ResourceDiagnosticsAdapter();
    leaked.observe("core", { ...zeroMetrics(), pendingTimerCount: 1 });
    expect(() => leaked.close(["core"]))
      .toThrow("pendingTimerCount did not return to zero");
  });

  it("returns only the eight frozen zero resource metrics", () => {
    const adapter = new ResourceDiagnosticsAdapter();
    adapter.observe("core", zeroMetrics());
    adapter.observe("central", zeroMetrics());
    const result = adapter.close(["central", "core"]);
    expect(Object.keys(result)).toEqual(RESOURCE_METRIC_KEYS);
    expect(Object.values(result)).toEqual(Array.from({ length: 8 }, () => 0));
  });

  it("keeps canonical digest stable across object insertion order", () => {
    expect(digest({ a: 1, b: { c: 2, d: 3 } }))
      .toBe(digest({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it("requires all four leakage channels and five marker categories", () => {
    const scanner = new FourChannelLeakageScanner(leakageMarkers());
    expect(() => scanner.scan({ processOutput: "clean" }))
      .toThrow("strict schema");
    expect(() => new FourChannelLeakageScanner({ canary: "only-one" }))
      .toThrow("strict schema");
    expect(LEAKAGE_CHANNEL_KEYS).toHaveLength(4);
    expect(LEAKAGE_MARKER_KEYS).toHaveLength(5);
  });

  it("detects every marker category in every leakage channel", () => {
    const markers = leakageMarkers();
    const scanner = new FourChannelLeakageScanner(markers);
    for (const channel of LEAKAGE_CHANNEL_KEYS) {
      for (const marker of Object.values(markers)) {
        const channels = cleanLeakageChannels();
        channels[channel] = `before ${marker} after`;
        const result = scanner.scan(channels);
        expect(result.channelMatchCounts[channel]).toBeGreaterThan(0);
        expect(result.totalMatchCount).toBeGreaterThan(0);
        expect(() => scanner.assertClean(channels))
          .toThrow("arh333.four_channel_sensitive_output_detected");
      }
    }
  });

  it("detects encoded leakage without returning marker values", () => {
    const markers = leakageMarkers();
    const scanner = new FourChannelLeakageScanner(markers);
    const channels = cleanLeakageChannels();
    channels.childLogAndTrace = Buffer.from(markers.credential).toString("base64");
    const result = scanner.scan(channels);
    expect(result.channelMatchCounts.childLogAndTrace).toBe(1);
    expect(JSON.stringify(result)).not.toContain(markers.credential);
  });

  it("returns an exact four-channel zero projection for clean evidence", () => {
    const result = new FourChannelLeakageScanner(leakageMarkers())
      .assertClean(cleanLeakageChannels());
    expect(Object.keys(result.channelMatchCounts)).toEqual(LEAKAGE_CHANNEL_KEYS);
    expect(Object.values(result.channelMatchCounts)).toEqual([0, 0, 0, 0]);
    expect(result.totalMatchCount).toBe(0);
  });
});

function matrix() {
  return {
    crashWindows: ["M8", "M1", "M2", "M3", "M4", "M5", "M6", "M7"],
    invocationKinds: ["rolling_compaction", "main", "initial_compaction"],
    cacheStatuses: ["unknown", "unsupported", "disabled", "miss", "hit"],
  };
}

function round() {
  return {
    topology: {
      sessionCount: 3,
      userScopeCount: 2,
      enterpriseScopeCount: 2,
      cacheContextCount: 4,
      usageProjectionCount: 4,
      topologyDigest: digest({ topology: "A1-A2-B1" }),
    },
    coreRecovery: {
      mainTerminalCount: 1,
      initialCompactionCommittedCount: 1,
      rollingCompactionCommittedCount: 1,
      coreReopenRecoveryCount: 1,
      statusFirstReconciliationCount: 1,
      toolCallCount: 50,
      timelineDigest: digest({ timeline: "durable" }),
      semanticViewDigest: digest({ view: "summary-raw-tail" }),
    },
    centralRecovery: {
      centralTakeoverCount: 1,
      durableTerminalCount: 10,
      providerRequestCount: 8,
      usageFactCount: 10,
      cachePlanCount: 5,
      fencingConflictCount: 1,
      durableCursorClass: "monotonic",
      cacheStatusCounts: { unknown: 1, hit: 1, miss: 1, disabled: 1, unsupported: 1 },
    },
    terminalClassCounts: { completed: 9, uncertain: 2 },
    typedErrorCodes: ["model_stream_resume_unavailable", "recovery_exhausted"],
  };
}

function zeroMetrics() {
  return Object.fromEntries(RESOURCE_METRIC_KEYS.map((key) => [key, 0]));
}

function leakageMarkers() {
  return {
    canary: "arh333-canary-6c1cfccf",
    credential: "arh333-credential-0e91dafe",
    providerEndpoint: "https://relay-32d03ed1.invalid/v1/model-route",
    contentBody: "ARH333 synthetic body 711dbaee",
    absolutePath: "/private/tmp/arh333-8e8873c6/sensitive.txt",
  };
}

function cleanLeakageChannels() {
  return Object.fromEntries(LEAKAGE_CHANNEL_KEYS.map((key) => [key, "clean"]));
}
