import { describe, expect, it } from "vitest";

import {
  R2D4_CHANNELS,
  R2D4_CRASH_WINDOWS,
  R2D4_RESOURCE_KEYS,
  R2D4_TIME_FACT_KEYS,
  exactR2D4ResourceCounts,
  proveR2D4LeakScannerNegativeCoverage,
  r2d4SemanticDigest,
  r2d4SemanticSummary,
  scanR2D4Leakage,
  validateR2D4ClosureEvidence,
} from "./r2d4-evidence.mjs";

describe("R2D-4 evidence contract", () => {
  it("freezes five process windows, twelve resources and five authority time facts", () => {
    expect(R2D4_CRASH_WINDOWS).toHaveLength(5);
    expect(R2D4_RESOURCE_KEYS).toHaveLength(12);
    expect(R2D4_TIME_FACT_KEYS).toEqual([
      "acceptedAt",
      "createdAt",
      "lockedAt",
      "observedAt",
      "committedAt",
    ]);
  });

  it("proves all eighty channel, marker and encoding injections are detectable", () => {
    expect(R2D4_CHANNELS).toHaveLength(4);
    expect(proveR2D4LeakScannerNegativeCoverage()).toBe(80);
    expect(scanR2D4Leakage(Object.fromEntries(
      R2D4_CHANNELS.map((channel) => [channel, "safe"]),
    ))).toMatchObject({ totalMatchCount: 0 });
  });

  it("requires real resource counters instead of treating missing values as zero", () => {
    const measured = resourceCounts();
    expect(exactR2D4ResourceCounts(measured)).toEqual(measured);
    const incomplete = { ...measured };
    delete incomplete.activeProviderRequests;
    expect(() => exactR2D4ResourceCounts(incomplete))
      .toThrow("r2d4_resource_count_invalid:activeProviderRequests");
  });

  it("includes every authority time fact in the semantic digest", () => {
    const base = semanticInput();
    const baseline = r2d4SemanticDigest(r2d4SemanticSummary(base));
    for (const key of R2D4_TIME_FACT_KEYS) {
      const drifted = r2d4SemanticDigest(r2d4SemanticSummary({
        ...base,
        timeFacts: { ...base.timeFacts, [key]: "2026-08-26T10:00:00.001Z" },
      }));
      expect(drifted, key).not.toBe(baseline);
    }
  });

  it("excludes process noise without deleting authority time facts", () => {
    const base = semanticInput();
    const left = r2d4SemanticDigest(r2d4SemanticSummary({
      ...base,
      processId: 100,
      port: 41000,
      temporaryPath: "/tmp/one",
    }));
    const right = r2d4SemanticDigest(r2d4SemanticSummary({
      ...base,
      processId: 200,
      port: 42000,
      temporaryPath: "/tmp/two",
    }));
    expect(left).toBe(right);
    expect(r2d4SemanticSummary(base).timeFacts).toEqual(base.timeFacts);
  });

  it("rejects any production-ready overclaim", () => {
    const valid = closureEvidence();
    expect(validateR2D4ClosureEvidence(valid).outcome)
      .toBe("R2D_CORE_DELTA_CONFORMANT");
    expect(() => validateR2D4ClosureEvidence({
      ...valid,
      productionR2dGateEnabled: true,
    })).toThrow("r2d4_closure_evidence_invalid");
    expect(() => validateR2D4ClosureEvidence({
      ...valid,
      resourceCounts: { ...valid.resourceCounts, lateCallbacks: 1 },
    })).toThrow("r2d4_closure_resources_not_zero");
  });
});

function at() {
  return "2026-08-26T10:00:00.000Z";
}

function resourceCounts() {
  return Object.fromEntries(R2D4_RESOURCE_KEYS.map((key) => [key, 0]));
}

function semanticInput() {
  return {
    scenarioOutcomes: [{ scenario: "A8", outcome: "completed" }],
    acceptedPlanDigest: digest("1"),
    entitlementSnapshotDigest: digest("2"),
    agentResourceDecisionDigest: digest("3"),
    runtimeSelectionDigest: digest("4"),
    reasoningModeLockId: "019f9500-0000-7000-8000-000000000001",
    reasoningModeLockDigest: digest("5"),
    taskInstructionBindingDigest: digest("6"),
    dynamicFactsDigestSequence: [digest("7")],
    modelRequestDigestSequence: [digest("8")],
    coordinationTerminalState: "completed",
    typedFailureCodes: [],
    timeFacts: Object.fromEntries(R2D4_TIME_FACT_KEYS.map((key) => [key, at()])),
    resourceTerminalCounts: resourceCounts(),
  };
}

function closureEvidence() {
  return {
    status: "PASS",
    outcome: "R2D_CORE_DELTA_CONFORMANT",
    productionR2dGateEnabled: false,
    productionCpcActivationEnabled: false,
    productionEnterpriseEntitlementReady: false,
    agentLifecycleReady: false,
    desktopV2ConsumptionReady: false,
    adminV2ConsumptionReady: false,
    knowledgeProviderReady: false,
    memoryReady: false,
    effectReconciliationReady: false,
    dfi53Unlocked: false,
    testIdentityUsed: true,
    semanticReplayCount: 3,
    negativeLeakInjectionDetectionCount: 80,
    resourceCounts: resourceCounts(),
  };
}

function digest(marker) {
  return `sha256:${marker.repeat(64)}`;
}
