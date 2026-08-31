import { describe, expect, it } from "vitest";

import {
  AAPI03_CHANNELS,
  proveAapi03LeakScanner,
  scanAapi03Leakage,
  validateAapi03Evidence,
} from "./aapi03-evidence.mjs";

describe("AAPI-0.3 evidence", () => {
  it("proves all 80 channel and encoding leak injections", () => {
    expect(proveAapi03LeakScanner()).toBe(80);
    expect(scanAapi03Leakage(Object.fromEntries(
      AAPI03_CHANNELS.map((channel) => [channel, "safe"]),
    )).totalMatchCount).toBe(0);
  });

  it("rejects any production-ready or mutation drift", () => {
    const valid = {
      status: "PASS",
      outcome: "AAPI03_TEST_ONLY_READ_HTTP_SHELL_CONFORMANT",
      getRouteCount: 12,
      mutationRouteCount: 0,
      productionControllerBeanCount: 0,
      productionMappingCount: 0,
      productionTestInventorySourceCount: 0,
      testIdentityUsed: true,
      productionIdentityReady: false,
      productionAdminReadHttpReady: false,
      browserSecurityReady: false,
      adminAdapterReady: false,
      tgmReady: false,
      knowledgeProviderReady: false,
      agentLifecycleReady: false,
      negativeLeakInjectionDetectionCount: 80,
    };
    expect(validateAapi03Evidence(valid)).toEqual(valid);
    expect(() => validateAapi03Evidence({ ...valid, productionAdminReadHttpReady: true }))
      .toThrow(/aapi03_evidence_invalid/u);
    expect(() => validateAapi03Evidence({ ...valid, mutationRouteCount: 1 }))
      .toThrow(/aapi03_evidence_invalid/u);
  });
});
