import { describe, expect, it } from "vitest";

import {
  ConfigurationValidator,
  ENTERPRISE_CONFIGURATION_LIMITS,
  EnterpriseConfigurationValidationError,
  PackageMaterializer,
  canonicalJson,
} from "../src/index.js";
import {
  createEnterpriseConfigurationFixture,
  enterpriseScope,
} from "./enterprise-configuration.fixtures.js";

describe("CGF-1.2B enterprise configuration validation", () => {
  it("produces order-independent immutable materialization facts", () => {
    const fixture = createEnterpriseConfigurationFixture();
    const reversed = new PackageMaterializer().materialize({
      scope: enterpriseScope,
      snapshot: fixture.snapshot,
      packages: [...fixture.packages].reverse(),
      sealedAt: fixture.materialized.sealedAt,
    });
    expect(reversed.identity.candidateKey).toBe(
      fixture.materialized.identity.candidateKey,
    );
    expect(reversed.materializationDigest).toBe(
      fixture.materialized.materializationDigest,
    );
    expect(Object.isFrozen(reversed)).toBe(true);
    expect(Object.isFrozen(reversed.packages)).toBe(true);
  });

  it("fails closed on a stale package file digest", () => {
    const fixture = createEnterpriseConfigurationFixture();
    const expected = fixture.packages[0]!.reference;
    const invalid = {
      ...fixture.packages[0]!.document,
      files: fixture.packages[0]!.document.files.map((file) => ({
        ...file,
        utf8Content: `${file.utf8Content}drift`,
      })),
    };
    const validator = compatibleValidator();
    expect(() => validator.validatePackage({
      rawJson: canonicalJson(invalid),
      expected,
    })).toThrowError(EnterpriseConfigurationValidationError);
  });

  it("requires the full exact package closure", () => {
    const fixture = createEnterpriseConfigurationFixture();
    expect(() => new PackageMaterializer().materialize({
      scope: enterpriseScope,
      snapshot: fixture.snapshot,
      packages: fixture.packages.slice(0, 1),
      sealedAt: fixture.materialized.sealedAt,
    })).toThrowError(/missing an exact snapshot package/u);
  });

  it("checks compatibility before accepting a valid snapshot", () => {
    const fixture = createEnterpriseConfigurationFixture();
    const validator = new ConfigurationValidator({
      desktopVersion: "0.0.0",
      coreVersion: "0.0.0",
      supportsContractVersion: () => false,
      isDesktopCompatible: () => true,
      isCoreCompatible: () => true,
    });
    expect(() => validator.validateSnapshot({
      rawJson: canonicalJson(fixture.snapshot.document),
    })).toThrowError(/not supported/u);
  });

  it("accepts the materialized byte boundary and rejects one byte above it", () => {
    const fixture = createEnterpriseConfigurationFixture();
    const snapshotBytes = 1;
    const firstPackageBytes = 1;
    const boundaryPackageBytes =
      ENTERPRISE_CONFIGURATION_LIMITS.materializedBytes
      - snapshotBytes
      - firstPackageBytes;
    const snapshot = { ...fixture.snapshot, byteLength: snapshotBytes };
    const packagesAtBoundary = [
      { ...fixture.packages[0]!, byteLength: firstPackageBytes },
      { ...fixture.packages[1]!, byteLength: boundaryPackageBytes },
    ];
    expect(new PackageMaterializer().materialize({
      scope: enterpriseScope,
      snapshot,
      packages: packagesAtBoundary,
      sealedAt: fixture.materialized.sealedAt,
    }).materializedBytes).toBe(
      ENTERPRISE_CONFIGURATION_LIMITS.materializedBytes,
    );
    expect(() => new PackageMaterializer().materialize({
      scope: enterpriseScope,
      snapshot,
      packages: [
        packagesAtBoundary[0]!,
        { ...packagesAtBoundary[1]!, byteLength: boundaryPackageBytes + 1 },
      ],
      sealedAt: fixture.materialized.sealedAt,
    })).toThrowError(/exceeds the total byte limit/u);
  });
});

function compatibleValidator(): ConfigurationValidator {
  return new ConfigurationValidator({
    desktopVersion: "0.0.0",
    coreVersion: "0.0.0",
    supportsContractVersion: () => true,
    isDesktopCompatible: () => true,
    isCoreCompatible: () => true,
  });
}
