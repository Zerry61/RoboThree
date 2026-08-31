import { describe, expect, it } from "vitest";

import {
  ReasoningModePreferenceProjectionV1Alpha5Schema,
} from "../src/desktop-local/v1alpha5/index.js";

describe("DFI-5.4.2 Desktop v1alpha5 preference projection", () => {
  it("accepts an available exact preference", () => {
    expect(ReasoningModePreferenceProjectionV1Alpha5Schema.parse({
      contractVersion: "v1alpha5",
      requestedMode: "max",
      preferenceRevision: 7,
      preferencePersistence: "available",
      testIdentityUsed: false,
      productionIdentityReady: true,
    }).preferenceRevision).toBe(7);
  });

  it("accepts only a default projection when persistence is unavailable", () => {
    expect(ReasoningModePreferenceProjectionV1Alpha5Schema.parse({
      contractVersion: "v1alpha5",
      requestedMode: "default",
      preferencePersistence: "unavailable",
      testIdentityUsed: false,
      productionIdentityReady: false,
    }).requestedMode).toBe("default");
    expect(() => ReasoningModePreferenceProjectionV1Alpha5Schema.parse({
      contractVersion: "v1alpha5",
      requestedMode: "max",
      preferencePersistence: "unavailable",
      testIdentityUsed: false,
      productionIdentityReady: false,
    })).toThrow();
  });

  it("requires revision exactly when persistence is available", () => {
    expect(() => ReasoningModePreferenceProjectionV1Alpha5Schema.parse({
      contractVersion: "v1alpha5",
      requestedMode: "default",
      preferencePersistence: "available",
      testIdentityUsed: false,
      productionIdentityReady: false,
    })).toThrow();
    expect(() => ReasoningModePreferenceProjectionV1Alpha5Schema.parse({
      contractVersion: "v1alpha5",
      requestedMode: "default",
      preferenceRevision: 0,
      preferencePersistence: "unavailable",
      testIdentityUsed: false,
      productionIdentityReady: false,
    })).toThrow();
  });

  it("rejects test identity pretending to be production ready", () => {
    expect(() => ReasoningModePreferenceProjectionV1Alpha5Schema.parse({
      contractVersion: "v1alpha5",
      requestedMode: "default",
      preferenceRevision: 0,
      preferencePersistence: "available",
      testIdentityUsed: true,
      productionIdentityReady: true,
    })).toThrow();
  });

  it("is strict and exposes no owner material", () => {
    expect(() => ReasoningModePreferenceProjectionV1Alpha5Schema.parse({
      contractVersion: "v1alpha5",
      requestedMode: "default",
      preferenceRevision: 0,
      preferencePersistence: "available",
      testIdentityUsed: false,
      productionIdentityReady: false,
      ownerIdentity: "private",
    })).toThrow();
  });
});
