import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EnterpriseSessionDeviceChallengeRequestV1Alpha1Schema,
  EnterpriseSessionDeviceChallengeV1Alpha1Schema,
  EnterpriseSessionErrorV1Alpha1Schema,
  EnterpriseSessionLeaseRequestV1Alpha1Schema,
  EnterpriseSessionLeaseResultV1Alpha1Schema,
  EnterpriseSessionTokenClaimsV1Alpha1Schema,
  canonicalEnterpriseSessionDigestInput,
  canonicalEnterpriseSessionJson,
  enterpriseSessionAssertionDigestMaterial,
  enterpriseSessionDeviceTrustDigestMaterial,
} from "../src/index.js";
import type { EnterpriseSessionDigestDomain, JsonValue } from "../src/index.js";

const root = resolve(process.cwd(), "contracts/enterprise-session/v1alpha1");

describe("EIPC-1.1.1 Enterprise Session canonical Contract", () => {
  it("accepts and rejects the canonical fixture corpus", () => {
    const manifest = readJson("fixtures/manifest.json") as {
      contractVersion: string;
      claimsProfile: string;
      cases: { schema: string; file: string; valid: boolean }[];
    };
    expect(manifest.contractVersion).toBe("enterprise-session.v1alpha1");
    expect(manifest.claimsProfile).toBe("eipc.session-token.v1");
    for (const fixture of manifest.cases) {
      expect(
        parseFixture(fixture.schema, readJson(`fixtures/${fixture.file}`)),
        fixture.file,
      ).toBe(fixture.valid);
    }
  });

  it("keeps the handle opaque, bounded and separate from owner authority", () => {
    const request = readJson("fixtures/valid/device-challenge-request.json");
    expect(EnterpriseSessionDeviceChallengeRequestV1Alpha1Schema.parse(request)).toEqual(request);
    for (const forbidden of ["enterpriseId", "userId", "deviceId", "verifiedIdentityId"] as const) {
      expect(EnterpriseSessionDeviceChallengeRequestV1Alpha1Schema.safeParse({
        ...(request as object),
        [forbidden]: "forbidden",
      }).success).toBe(false);
    }
  });

  it("requires unique ASCII-sorted permissions including configuration.read", () => {
    const request = readJson("fixtures/valid/device-challenge-request.json") as Record<string, unknown>;
    expect(EnterpriseSessionDeviceChallengeRequestV1Alpha1Schema.safeParse({
      ...request,
      requiredPermissions: ["personal_model.configure", "configuration.read"],
    }).success).toBe(false);
    expect(EnterpriseSessionDeviceChallengeRequestV1Alpha1Schema.safeParse({
      ...request,
      requiredPermissions: ["personal_model.configure"],
    }).success).toBe(false);
    expect(EnterpriseSessionDeviceChallengeRequestV1Alpha1Schema.safeParse({
      ...request,
      requiredPermissions: ["configuration.read", "configuration.read"],
    }).success).toBe(false);
  });

  it("keeps challenge and lease binding fields exact", () => {
    const challenge = EnterpriseSessionDeviceChallengeRequestV1Alpha1Schema.parse(
      readJson("fixtures/valid/device-challenge-request.json"),
    );
    const lease = EnterpriseSessionLeaseRequestV1Alpha1Schema.parse(
      readJson("fixtures/valid/session-lease-request.json"),
    );
    expect({
      verifiedIdentityHandle: lease.verifiedIdentityHandle,
      currentClientInstanceId: lease.currentClientInstanceId,
      audience: lease.audience,
      requiredPermissions: lease.requiredPermissions,
      correlationId: lease.correlationId,
      deviceKeyId: lease.deviceProof.deviceKeyId,
    }).toEqual({
      verifiedIdentityHandle: challenge.verifiedIdentityHandle,
      currentClientInstanceId: challenge.currentClientInstanceId,
      audience: challenge.audience,
      requiredPermissions: challenge.requiredPermissions,
      correlationId: challenge.correlationId,
      deviceKeyId: challenge.deviceKeyId,
    });
  });

  it("rejects challenge expiry and duplicate algorithms", () => {
    const challenge = readJson("fixtures/valid/device-challenge.json") as Record<string, unknown>;
    expect(EnterpriseSessionDeviceChallengeV1Alpha1Schema.safeParse({
      ...challenge,
      expiresAt: challenge.issuedAt,
    }).success).toBe(false);
    expect(EnterpriseSessionDeviceChallengeV1Alpha1Schema.safeParse({
      ...challenge,
      allowedAlgorithms: ["ES256", "ES256"],
    }).success).toBe(false);
  });

  it("composes the exact EIPC-0 assertion and Device Trust semantics", () => {
    const result = EnterpriseSessionLeaseResultV1Alpha1Schema.parse(
      readJson("fixtures/valid/session-lease-result.json"),
    );
    expect(result.sessionAssertion.schemaVersion).toBe("eipc.v1alpha1");
    expect(result.deviceTrustDecision.schemaVersion).toBe("eipc.v1alpha1");
    expect(result.sessionAssertion.permissions).toContain("personal_model.configure");
  });

  it("rejects expiry, validity and owner drift in a Lease result", () => {
    const result = EnterpriseSessionLeaseResultV1Alpha1Schema.parse(
      readJson("fixtures/valid/session-lease-result.json"),
    );
    expect(EnterpriseSessionLeaseResultV1Alpha1Schema.safeParse({
      ...result,
      expiresAt: "2026-08-23T10:14:00.000Z",
    }).success).toBe(false);
    expect(EnterpriseSessionLeaseResultV1Alpha1Schema.safeParse({
      ...result,
      sessionAssertion: { ...result.sessionAssertion, validity: "invalid" },
    }).success).toBe(false);
    expect(EnterpriseSessionLeaseResultV1Alpha1Schema.safeParse({
      ...result,
      deviceTrustDecision: {
        ...result.deviceTrustDecision,
        ownerIdentity: { ...result.deviceTrustDecision.ownerIdentity, userId: "user.other" },
      },
    }).success).toBe(false);
  });

  it("keeps the new claims profile strict and separate from legacy claims", () => {
    const claims = readJson("fixtures/valid/session-token-claims.json") as Record<string, unknown>;
    expect(EnterpriseSessionTokenClaimsV1Alpha1Schema.parse(claims)).toEqual(claims);
    expect(EnterpriseSessionTokenClaimsV1Alpha1Schema.safeParse({
      ...claims,
      claimsProfile: "v1alpha1",
    }).success).toBe(false);
    expect(readText("../../enterprise-gateway/v1alpha1/schemas/access-token-claims.schema.json"))
      .not.toContain("personal_model.configure");
  });

  it("matches all six cross-language canonical digest fixtures", () => {
    const document = readJson("fixtures/conformance/digest-materials.json") as {
      cases: {
        name: string;
        domain: EnterpriseSessionDigestDomain;
        value: JsonValue;
        canonicalJson: string;
        sha256: string;
      }[];
    };
    expect(document.cases).toHaveLength(6);
    for (const fixture of document.cases) {
      const canonical = canonicalEnterpriseSessionJson(fixture.value);
      const digest = `sha256:${createHash("sha256")
        .update(canonicalEnterpriseSessionDigestInput(fixture.domain, fixture.value), "utf8")
        .digest("hex")}`;
      expect(canonical, fixture.name).toBe(fixture.canonicalJson);
      expect(digest, fixture.name).toBe(fixture.sha256);
    }
  });

  it("normalizes strings to NFC while preserving array order", () => {
    expect(canonicalEnterpriseSessionJson({ label: "e\u0301", list: ["b", "a"] }))
      .toBe(canonicalEnterpriseSessionJson({ list: ["b", "a"], label: "é" }));
    expect(canonicalEnterpriseSessionJson({ list: ["b", "a"] }))
      .not.toBe(canonicalEnterpriseSessionJson({ list: ["a", "b"] }));
  });

  it("strips only the digest field from EIPC-0 decision material", () => {
    const result = EnterpriseSessionLeaseResultV1Alpha1Schema.parse(
      readJson("fixtures/valid/session-lease-result.json"),
    );
    const assertion = canonicalEnterpriseSessionJson(
      enterpriseSessionAssertionDigestMaterial(result.sessionAssertion),
    );
    const trust = canonicalEnterpriseSessionJson(
      enterpriseSessionDeviceTrustDigestMaterial(result.deviceTrustDecision),
    );
    expect(assertion).not.toContain("assertionDigest");
    expect(assertion).toContain("assertionRevision");
    expect(trust).not.toContain("decisionDigest");
    expect(trust).toContain("decisionRevision");
  });

  it("keeps canonical source-decision material free of bearer, handle and proof", () => {
    const fixture = (readJson("fixtures/conformance/digest-materials.json") as {
      cases: { name: string; canonicalJson: string }[];
    }).cases.find((candidate) => candidate.name === "sourceDecision");
    expect(fixture).toBeDefined();
    for (const forbidden of [
      "accessToken", "tokenDigest", "verifiedIdentityHandle", "signature", "credentialRef",
    ]) {
      expect(fixture?.canonicalJson).not.toContain(forbidden);
    }
  });

  it("publishes exactly two no-store POST operations", () => {
    const openapi = readText("openapi.yaml");
    expect(openapi.match(/^ {2}\/enterprise-session\/v1alpha1\//gmu)).toHaveLength(2);
    expect(openapi.match(/^ {4}post:/gmu)).toHaveLength(2);
    expect(openapi.match(/const: no-store/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(openapi).not.toMatch(/^ {2}\/v1alpha1\/token:/mu);
    expect(openapi).not.toMatch(/^ {2}\/v1alpha1\/device-challenges:/mu);
  });

  it("keeps legacy Gateway and EIPC-0 canonical bytes unchanged", () => {
    expect(sha256(readText("../../enterprise-gateway/v1alpha1/openapi.yaml")))
      .toBe("0b872be7678bb4451203f16213ff372fdf2da9fff224769eb37cc82b3cdac3c4");
    expect(sha256(readText("../../enterprise-gateway/v1alpha1/fixtures/manifest.json")))
      .toBe("56549c2e277ef7d270dd2922a00329139539e8fe54f7c535021c755002469648");
    expect(sha256(readText("../../enterprise-identity-composition/v1alpha1/schemas/authority-semantics.schema.json")))
      .toBe("d03751b1713e095f073c9dd30d89a24c844e315dcbbe4e620b97a3f527ba7e35");
    expect(sha256(readText("../../enterprise-identity-composition/v1alpha1/fixtures/manifest.json")))
      .toBe("4c03200538af358d5d2d3b44c5769b16fe9ef0f78e634f1c2706163e115c3e30");
  });

  it("keeps typed errors strict and free of internal facts", () => {
    const error = readJson("fixtures/valid/error.json") as Record<string, unknown>;
    expect(EnterpriseSessionErrorV1Alpha1Schema.parse(error)).toEqual(error);
    expect(EnterpriseSessionErrorV1Alpha1Schema.safeParse({
      ...error,
      verifiedIdentityHandle: "forbidden",
    }).success).toBe(false);
    expect(EnterpriseSessionErrorV1Alpha1Schema.safeParse({
      ...error,
      stack: "forbidden",
    }).success).toBe(false);
  });

  it("derives the missing production AccessToken Provider from the real source graph", () => {
    const productionRoots = [
      resolve(process.cwd(), "services/core/src/adapters"),
      resolve(process.cwd(), "apps/desktop/src/main"),
    ];
    const implementationMatches = productionRoots
      .flatMap(sourceFiles)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /implements\s+EnterpriseAccessTokenProvider/u.test(source)
          || /satisfies\s+EnterpriseAccessTokenProvider/u.test(source)
          || /const\s+\w+\s*:\s*EnterpriseAccessTokenProvider\s*=/u.test(source);
      });
    expect(implementationMatches).toEqual([]);
  });
});

function parseFixture(schema: string, value: unknown): boolean {
  if (schema === "device-challenge") {
    return EnterpriseSessionDeviceChallengeRequestV1Alpha1Schema.safeParse(value).success
      || EnterpriseSessionDeviceChallengeV1Alpha1Schema.safeParse(value).success;
  }
  if (schema === "session-lease") {
    return EnterpriseSessionLeaseRequestV1Alpha1Schema.safeParse(value).success
      || EnterpriseSessionLeaseResultV1Alpha1Schema.safeParse(value).success;
  }
  if (schema === "session-token-claims") {
    return EnterpriseSessionTokenClaimsV1Alpha1Schema.safeParse(value).success;
  }
  if (schema === "error") return EnterpriseSessionErrorV1Alpha1Schema.safeParse(value).success;
  return false;
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readText(relativePath)) as unknown;
}

function readText(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}
