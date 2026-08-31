import { describe, expect, it } from "vitest";

import {
  activationRevision,
  validateSensitiveTransportBootDescriptor,
} from "../src/application/sensitive-transport-activation.js";

const material = Object.freeze({
  schemaVersion: "strm3-sensitive-transport-activation.v1" as const,
  transportProtocolVersion: "personal-credential-transport.v1" as const,
  transportProfileRevision: "personal-credential.route-a.structured-clone.v1" as const,
  activationState: "production_active" as const,
  runtimeFallbackEnabled: false as const,
  zeroCopyClaimed: false as const,
  structuredCloneInternalCopiesReliablyClearable: false as const,
});

describe("STRM-3 Core boot activation validation", () => {
  it("recomputes and accepts only the exact descriptor", () => {
    const descriptor = { ...material, activationRevision: activationRevision(material) };
    expect(validateSensitiveTransportBootDescriptor(descriptor)).toEqual(descriptor);
    expect(descriptor.activationRevision).toBe(
      "sha256:05518b25b34c0554a029a435a93680f4cead19c16cf8bd9ad96ae80d4cc2edbf",
    );
  });

  it("treats a missing descriptor as unavailable and rejects every drift", () => {
    expect(validateSensitiveTransportBootDescriptor(undefined)).toBeUndefined();
    for (const drifted of [
      { ...material, activationRevision: `sha256:${"0".repeat(64)}` },
      { ...material, activationRevision: activationRevision(material), extra: true },
      { ...material, activationRevision: activationRevision(material), zeroCopyClaimed: true },
      { ...material, activationRevision: activationRevision(material),
        transportProfileRevision: "personal-credential.route-a.invalid.v9" },
    ]) {
      expect(() => validateSensitiveTransportBootDescriptor(drifted))
        .toThrow("sensitive_transport_activation_invalid");
    }
  });
});
