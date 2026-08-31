import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  DFI534_RESOURCE_KEYS,
  createDfi53ParentExecutionLedger,
  dfi534SemanticDigest,
  exactDfi534ResourceCounts,
  extractDfi53ParentMatrix,
  proveDfi534LeakScannerNegativeCoverage,
  scanDfi534Leakage,
  validateDfi534ClosureEvidence,
} from "./dfi5.3.4-evidence.mjs";

const parentPlan = await readFile(new URL(
  "../docs/development/frontend/DFI-5.3-PROVIDER-MAPPING-DEVELOPMENT-PLAN.md",
  import.meta.url,
), "utf8");

describe("DFI-5.3.4 evidence", () => {
  it("extracts the exact retained parent matrix and produces an item-level ledger", () => {
    expect(extractDfi53ParentMatrix(parentPlan)).toEqual(
      Array.from({ length: 120 }, (_, index) => index + 1),
    );
    const ledger = createDfi53ParentExecutionLedger({
      parentPlan,
      ownerResults: ownerResults(),
    });
    expect(ledger).toHaveLength(120);
    expect(ledger[0]).toMatchObject({ qaId: "QA-001", result: "pass" });
    expect(ledger[119]).toMatchObject({ qaId: "QA-120", result: "pass" });
    expect(new Set(ledger.map((entry) => entry.evidenceKey)).size).toBe(120);
  });

  it("does not allow an unexecuted owner to be marked passed", () => {
    expect(() => createDfi53ParentExecutionLedger({
      parentPlan,
      ownerResults: { ...ownerResults(), "dfi5.3.4-lifecycle": "pending" },
    })).toThrow("dfi534_parent_owner_not_passed");
  });

  it("proves all eighty negative leakage injections and scans clean channels", () => {
    expect(proveDfi534LeakScannerNegativeCoverage()).toBe(80);
    expect(scanDfi534Leakage({
      stdout: "safe",
      stderr: "safe",
      evidenceJson: "safe",
      failureJson: "safe",
    })).toMatchObject({ totalMatchCount: 0 });
  });

  it("requires all fourteen resource diagnostics rather than defaulting missing values", () => {
    expect(Object.keys(exactDfi534ResourceCounts(zeroResources())).sort())
      .toEqual([...DFI534_RESOURCE_KEYS].sort());
    const missing = { ...zeroResources() };
    delete missing.activeCentralChildren;
    expect(() => exactDfi534ResourceCounts(missing))
      .toThrow("dfi534_resource_count_invalid:activeCentralChildren");
  });

  it("keeps authoritative semantic material in the digest", () => {
    const baseline = semanticMaterial();
    expect(dfi534SemanticDigest({ ...baseline, processId: 1 }))
      .toBe(dfi534SemanticDigest({ ...baseline, processId: 2 }));
    const normalized = dfi534SemanticDigest(baseline);
    expect(dfi534SemanticDigest({ ...baseline, mappingDigest: digest("2") }))
      .not.toBe(normalized);
    expect(dfi534SemanticDigest({ ...baseline, deadlineAt: "2026-08-27T08:15:00.001Z" }))
      .not.toBe(normalized);
  });

  it("rejects a closure claim with a non-zero resource or missing readiness false", () => {
    const valid = evidence();
    expect(validateDfi534ClosureEvidence(valid)).toMatchObject({ status: "PASS" });
    expect(() => validateDfi534ClosureEvidence({
      ...valid,
      resourceCounts: { ...zeroResources(), lateCallbacks: 1 },
    })).toThrow("dfi534_resources_not_zero");
    expect(() => validateDfi534ClosureEvidence({ ...valid, desktopMaxUiReady: true }))
      .toThrow("dfi534_closure_evidence_invalid");
  });
});

function ownerResults() {
  return {
    "dfi5.3.1+dfi5.3.3": "pass",
    "dfi5.3.2+dfi5.3.3": "pass",
    "dfi5.3.1+dfi5.3.2+dfi5.3.3": "pass",
    "dfi5.3.3": "pass",
    "dfi5.3.4-lifecycle": "pass",
    "dfi5.3.4-boundary": "pass",
  };
}

function zeroResources() {
  return Object.fromEntries(DFI534_RESOURCE_KEYS.map((key) => [key, 0]));
}

function semanticMaterial() {
  return {
    providerPath: "local_personal_openai",
    reasoningModeLockDigest: digest("1"),
    mappingDigest: digest("1"),
    deadlineAt: "2026-08-27T08:15:00.000Z",
    bodyMode: "max",
    usageDigest: digest("1"),
    terminal: "completed",
  };
}

function evidence() {
  const ledger = createDfi53ParentExecutionLedger({ parentPlan, ownerResults: ownerResults() });
  return {
    status: "PASS",
    outcome: "DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT",
    parentQaMatrixCount: 120,
    parentMatrixExecutionStatus: "executed_at_dfi53_stage_closure",
    parentQaLedger: ledger,
    focusedQaMatrixCount: 96,
    semanticReplayCount: 3,
    negativeLeakInjectionDetectionCount: 80,
    localPersonalPathConformant: true,
    enterpriseOpenAiPathConformant: true,
    enterpriseAnthropicPathConformant: true,
    productionSubmitTurnV1Alpha3Reachable: false,
    desktopMaxUiReady: false,
    productionGatewayV1Alpha3RouteCount: 0,
    productionLocalPersonalMaxReleaseCount: 0,
    productionEnterpriseOpenAiMaxReleaseCount: 0,
    productionEnterpriseAnthropicMaxReleaseCount: 0,
    productionCpcActivationEnabled: false,
    productionEnterpriseEntitlementReady: false,
    tgmReady: false,
    knowledgeProviderReady: false,
    agentLifecycleReady: false,
    desktopAdminV2ConsumptionReady: false,
    resourceCounts: zeroResources(),
  };
}

function digest(marker) {
  return `sha256:${marker.repeat(64)}`;
}
