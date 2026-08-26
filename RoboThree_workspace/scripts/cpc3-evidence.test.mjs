import { describe, expect, it } from "vitest";

import {
  CPC3_CHANNELS,
  CPC3_CONFLICT_CORPUS,
  CPC3_CRASH_WINDOWS,
  CPC3_RESOURCE_KEYS,
  cpc3SemanticDigest,
  cpc3SemanticSummary,
  exactResourceCounts,
  proveCpc3LeakScannerNegativeCoverage,
  scanCpc3Leakage,
  validateCpc3ClosureEvidence,
} from "./cpc3-evidence.mjs";

describe("CPC-3 evidence contract", () => {
  it("freezes twelve conflict cases and six named crash windows", () => {
    expect(CPC3_CONFLICT_CORPUS).toHaveLength(12);
    expect(new Set(CPC3_CONFLICT_CORPUS.map((entry) => entry.id)).size).toBe(12);
    expect(CPC3_CRASH_WINDOWS).toEqual([
      "task_bundle_loaded",
      "instruction_bundle_materialized",
      "model_request_finalized",
      "tool_result_committed",
      "compaction_committed",
      "assistant_committed",
    ]);
  });

  it("detects all eighty channel, marker and encoding negative injections", () => {
    expect(CPC3_CHANNELS).toHaveLength(4);
    expect(proveCpc3LeakScannerNegativeCoverage()).toBe(80);
    expect(scanCpc3Leakage(Object.fromEntries(CPC3_CHANNELS.map((key) => [key, "safe"]))))
      .toMatchObject({ totalMatchCount: 0 });
  });

  it("requires all twelve resource counters and rejects missing values", () => {
    const measured = Object.fromEntries(CPC3_RESOURCE_KEYS.map((key) => [key, 0]));
    expect(exactResourceCounts(measured)).toEqual(measured);
    const incomplete = { ...measured };
    delete incomplete.mailboxes;
    expect(() => exactResourceCounts(incomplete)).toThrow("cpc3_resource_count_invalid:mailboxes");
  });

  it("excludes process noise from semantic replay digests", () => {
    const base = semanticInput();
    const left = cpc3SemanticDigest(cpc3SemanticSummary({
      ...base,
      processId: 100,
      port: 41000,
      temporaryPath: "/tmp/one",
    }));
    const right = cpc3SemanticDigest(cpc3SemanticSummary({
      ...base,
      processId: 200,
      port: 42000,
      temporaryPath: "/tmp/two",
    }));
    expect(left).toBe(right);
  });

  it("rejects a ready claim when any honesty flag or resource is wrong", () => {
    const valid = closureEvidence();
    expect(validateCpc3ClosureEvidence(valid).outcome).toBe("CPC_CORE_PROMPT_MVP_CONFORMANT");
    expect(() => validateCpc3ClosureEvidence({
      ...valid,
      productionCpcActivationEnabled: true,
    })).toThrow("cpc3_closure_evidence_invalid");
    expect(() => validateCpc3ClosureEvidence({
      ...valid,
      resourceCounts: { ...valid.resourceCounts, scheduledTimers: 1 },
    })).toThrow("cpc3_closure_resources_not_zero");
  });
});

function resourceCounts() {
  return Object.fromEntries(CPC3_RESOURCE_KEYS.map((key) => [key, 0]));
}

function semanticInput() {
  return {
    scenarioOutcomes: [{ scenario: "L1", outcome: "completed" }],
    taskInstructionBindingDigest: `sha256:${"1".repeat(64)}`,
    instructionBundleDigest: `sha256:${"2".repeat(64)}`,
    orderedSourceIdentities: ["platform:0", "task_boundary:10", "agent:20"],
    mainRequestDigestSequence: [`sha256:${"3".repeat(64)}`],
    compactionEvidence: [],
    toolEffectOutcomes: [],
    typedFailureCodes: [],
    terminalState: "completed",
    resourceTerminalCounts: resourceCounts(),
  };
}

function closureEvidence() {
  return {
    outcome: "CPC_CORE_PROMPT_MVP_CONFORMANT",
    productionCpcActivationEnabled: false,
    productionSkillResolverPresent: false,
    knowledgeProviderReady: false,
    memoryReady: false,
    effectReconciliationReady: false,
    desktopAdminEntryReady: false,
    testIdentityUsed: true,
    observationalModelEvalOutcome: "MODEL_BEHAVIOR_EVAL_NOT_RUN_APPROVED_PROFILE_MISSING",
    semanticReplayCount: 3,
    conflictCorpusCaseCount: 12,
    negativeLeakInjectionDetectionCount: 80,
    resourceCounts: resourceCounts(),
  };
}
