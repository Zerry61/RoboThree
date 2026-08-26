import { describe, expect, it } from "vitest";

import { projectEnterpriseOfflineState } from "../src/index.js";

describe("CGF-1.3C enterprise offline four-state projection", () => {
  it("projects online enterprise capabilities without implying a cached mode", () => {
    expect(projectEnterpriseOfflineState({
      serviceReachable: true,
      enterpriseSessionValid: true,
      recoveredUpdateWaitingForApplication: false,
      runtimeActive: true,
      locallyExecutableCapabilityCount: 2,
    })).toEqual({
      state: "online",
      enterpriseCapabilitiesAvailable: true,
      locallyExecutableCapabilitiesMayContinue: false,
      requiresUserApplicationConfirmation: false,
      configurationMutationAllowed: true,
    });
  });

  it("allows only runtime-active and fully local capabilities during a temporary outage", () => {
    expect(projectEnterpriseOfflineState({
      serviceReachable: false,
      enterpriseSessionValid: true,
      recoveredUpdateWaitingForApplication: false,
      runtimeActive: true,
      locallyExecutableCapabilityCount: 1,
    })).toMatchObject({
      state: "service_temporarily_unavailable",
      enterpriseCapabilitiesAvailable: true,
      locallyExecutableCapabilitiesMayContinue: true,
      configurationMutationAllowed: false,
    });
    expect(projectEnterpriseOfflineState({
      serviceReachable: false,
      enterpriseSessionValid: true,
      recoveredUpdateWaitingForApplication: false,
      runtimeActive: false,
      locallyExecutableCapabilityCount: 1,
    })).toMatchObject({
      state: "service_temporarily_unavailable",
      enterpriseCapabilitiesAvailable: false,
    });
  });

  it("pauses enterprise capabilities whenever the enterprise session is invalid", () => {
    expect(projectEnterpriseOfflineState({
      serviceReachable: true,
      enterpriseSessionValid: false,
      recoveredUpdateWaitingForApplication: true,
      runtimeActive: true,
      locallyExecutableCapabilityCount: 3,
    })).toEqual({
      state: "enterprise_session_invalid",
      enterpriseCapabilitiesAvailable: false,
      locallyExecutableCapabilitiesMayContinue: false,
      requiresUserApplicationConfirmation: false,
      configurationMutationAllowed: false,
    });
  });

  it("requires explicit application after recovery and never enables mutation implicitly", () => {
    expect(projectEnterpriseOfflineState({
      serviceReachable: true,
      enterpriseSessionValid: true,
      recoveredUpdateWaitingForApplication: true,
      runtimeActive: true,
      locallyExecutableCapabilityCount: 2,
    })).toEqual({
      state: "recovered_update_waiting_for_application",
      enterpriseCapabilitiesAvailable: false,
      locallyExecutableCapabilitiesMayContinue: false,
      requiresUserApplicationConfirmation: true,
      configurationMutationAllowed: false,
    });
  });

  it("rejects invalid local-executable counts", () => {
    expect(() => projectEnterpriseOfflineState({
      serviceReachable: false,
      enterpriseSessionValid: true,
      recoveredUpdateWaitingForApplication: false,
      runtimeActive: true,
      locallyExecutableCapabilityCount: -1,
    })).toThrow("non-negative integer");
  });
});
