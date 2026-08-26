import { describe, expect, it } from "vitest";

import {
  STRM23_CHANNELS,
  STRM23_MARKERS,
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

describe("STRM-2.3 evidence", () => {
  it("freezes all named windows without a fabricated S4 reveal", () => {
    expect(STRM23_SCENARIOS).toHaveLength(19);
    expect(new Set(STRM23_SCENARIOS.map((item) => item.window)))
      .toEqual(new Set(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]));
    expect(STRM23_SCENARIOS.some((item) => item.name === "s4_reveal")).toBe(false);
  });

  it("rejects stale and mismatched parent decisions", () => {
    const barrier = {
      type: "barrier",
      scenario: "s6_mutation",
      scenarioId: "round-1:s6_mutation",
      window: "S6",
      direction: "mutation",
    };
    expect(validateStrm23ParentDecision(barrier, {
      scenarioId: barrier.scenarioId,
      action: "kill_core",
    })).toBe(true);
    expect(() => validateStrm23ParentDecision(barrier, {
      scenarioId: "round-0:s6_mutation",
      action: "kill_core",
    })).toThrow("barrier_identity_mismatch");
    expect(() => validateStrm23ParentDecision(barrier, {
      scenarioId: barrier.scenarioId,
      action: "continue",
    })).toThrow("barrier_identity_mismatch");
  });

  it("uses the exact fourteen resource keys", () => {
    expect(STRM23_RESOURCE_KEYS).toHaveLength(14);
    expect(new Set(STRM23_RESOURCE_KEYS).size).toBe(14);
  });

  it("detects all four channels, five markers, and four encodings", () => {
    expect(STRM23_CHANNELS).toHaveLength(4);
    expect(Object.keys(STRM23_MARKERS)).toHaveLength(5);
    expect(assertStrm23LeakageScannerNegativeCoverage()).toBe(80);
  });

  it("reports zero for clean channels", () => {
    const scan = scanStrm23Leakage(Object.fromEntries(
      STRM23_CHANNELS.map((key) => [key, "safe-output"]),
    ));
    expect(scan.totalMatchCount).toBe(0);
    expect(Object.values(scan.channelMatchCounts)).toEqual([0, 0, 0, 0]);
  });

  it("keeps semantic digest independent from process noise", () => {
    const first = semanticStrm23Summary([result("s1_mutation", { pid: 1, port: 7 })]);
    const second = semanticStrm23Summary([result("s1_mutation", { pid: 99, port: 999 })]);
    expect(strm23SemanticDigest(first)).toBe(strm23SemanticDigest(second));
    expect(Object.hasOwn(first[0], "pid")).toBe(false);
    expect(Object.hasOwn(first[0], "port")).toBe(false);
  });

  it("keeps failure evidence allowlisted", () => {
    const evidence = safeFailureEvidence({
      scenario: "s6_mutation",
      window: "S6",
      direction: "mutation",
      lastBarrier: "after_dispatch",
      expectedAction: "kill_core",
      observedSafeStatus: "failed",
      typedErrorCode: "strm23_failure",
      resourceCounts: Object.fromEntries(STRM23_RESOURCE_KEYS.map((key) => [key, 0])),
      durationMs: 13,
      semanticEvidenceDigest: `sha256:${"a".repeat(64)}`,
      secret: "forbidden",
      absolutePath: "/forbidden",
      pid: 42,
    });
    expect(Object.keys(evidence)).not.toContain("secret");
    expect(Object.keys(evidence)).not.toContain("absolutePath");
    expect(Object.keys(evidence)).not.toContain("pid");
  });

  it("validates the complete process matrix", () => {
    const results = STRM23_SCENARIOS.map((definition) => result(definition.name));
    expect(validateStrm23ScenarioEvidence(results)).toMatchObject({
      scenarioRunCount: 19,
      namedCrashWindows: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
    });
  });

  it("requires observed process exit evidence for SIGKILL scenarios", () => {
    const results = STRM23_SCENARIOS.map((definition) => result(definition.name));
    const killed = results.find((item) => item.scenario === "s2_mutation");
    delete killed.processExitObservation;
    expect(() => validateStrm23ScenarioEvidence(results))
      .toThrow("strm23_process_group_exit_evidence_invalid");
  });
});

function result(name, noise = {}) {
  const definition = STRM23_SCENARIOS.find((item) => item.name === name)
    ?? STRM23_SCENARIOS[0];
  const coreRestart = name === "s6_mutation" || name === "s6_reveal"
    || name === "s8_core_restart";
  return {
    status: "PASS",
    scenario: definition.name,
    window: definition.window,
    direction: definition.direction,
    classification: name.endsWith("reveal")
      ? "reveal_uncertain_no_replay"
      : "business_reconciliation_required",
    typedErrorCode: "none",
    barrierReachedCount: 1,
    actionCount: 1,
    brokerDispatchCount: definition.expectedDispatchCount,
    terminalObserved: false,
    runtimeChanged: coreRestart,
    channelChanged: coreRestart,
    coreStartCount: coreRestart ? 2 : 1,
    lateCleanupCount: 0,
    realCorePrivateSupervisor: true,
    jsonLifecycleFd3: true,
    binaryBrokerFd4Fd5: true,
    sandbox: true,
    contextIsolation: true,
    nodeIntegrationDisabled: true,
    resourceCounts: Object.fromEntries(STRM23_RESOURCE_KEYS.map((key) => [key, 0])),
    ...(definition.action === "sigkill_electron" ? {
      resourceCountsAtBarrier: Object.fromEntries(
        STRM23_RESOURCE_KEYS.map((key) => [key, key === "childProcessCount" ? 1 : 0]),
      ),
      processExitObservation: {
        processGroupExitObserved: true,
        trackedProcessCount: 2,
        observedAbsentTrackedProcessCount: 2,
        observedTerminalTrackedProcessCount: 0,
        observedGroupMemberCount: 0,
        observedTerminalGroupMemberCount: 0,
        activeTrackedProcessCount: 0,
        activeGroupMemberCount: 0,
      },
      resourceAccountingSources: [
        "exact_barrier_snapshot",
        "os_process_table_snapshot",
        "tracked_process_identity_match",
      ],
    } : {}),
    productionFeatureEnabled: false,
    productionSensitiveTransportReady: false,
    productionBusinessHandlerReady: false,
    transportBlockerClosed: false,
    rendererBusinessApiExposed: false,
    zeroCopyClaimed: false,
    ...noise,
  };
}
