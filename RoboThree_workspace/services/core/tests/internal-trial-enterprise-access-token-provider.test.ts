import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV,
  InternalTrialEnterpriseAccessTokenProvider,
} from "../src/adapters/environment/internal-trial-enterprise-access-token-provider.js";
import type { Clock } from "../src/ports/clock.js";

const now = "2026-08-29T10:00:00.000Z";
const scope = Object.freeze({
  enterpriseId: "enterprise.internal-trial",
  userId: "user.internal-trial",
  deviceId: "device.internal-trial",
  clientInstanceId: "00000000-0000-4000-8000-000000000101",
});

describe("InternalTrialEnterpriseAccessTokenProvider", () => {
  it("consumes the environment value once and returns an exact in-memory lease", async () => {
    const token = compactToken();
    const environment = { [INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV]: token };
    const provider = requireProvider(environment);

    expect(environment).not.toHaveProperty(INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV);
    await expect(provider.acquire({
      audience: "enterprise-model-gateway",
      requiredPermission: "model.use",
      minimumRemainingTtlMs: 30_000,
      expectedScope: scope,
    })).resolves.toEqual({
      compactToken: token,
      tokenId: "00000000-0000-4000-8000-000000000102",
      audience: "enterprise-model-gateway",
      permissions: ["model.use"],
      issuedAt: "2026-08-29T09:59:00.000Z",
      expiresAt: "2026-08-29T10:05:00.000Z",
      scope,
    });
  });

  it("deletes malformed bearer material without exposing it in the error", () => {
    const secret = "not-a-valid-compact-token-secret-value";
    const environment = { [INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV]: secret };

    expect(() => requireProvider(environment)).toThrowError(
      expect.objectContaining({ code: "internal_trial_token_invalid" }),
    );
    expect(environment).not.toHaveProperty(INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV);
    try {
      requireProvider({ [INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV]: secret });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("rejects a bearer with excess permission or the wrong audience at consumption", () => {
    for (const token of [
      compactToken({ permissions: ["configuration.read", "model.use"] }),
      compactToken({ audience: "configuration-service" }),
    ]) {
      const environment = { [INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV]: token };
      expect(() => requireProvider(environment)).toThrowError(
        expect.objectContaining({ code: "internal_trial_token_invalid" }),
      );
      expect(environment).not.toHaveProperty(INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV);
    }
  });

  it("fails closed for expiry, insufficient TTL, audience, permission and scope drift", async () => {
    const provider = requireProvider({
      [INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV]: compactToken(),
    });
    const acquire = (overrides: Record<string, unknown> = {}) => provider.acquire({
      audience: "enterprise-model-gateway",
      requiredPermission: "model.use",
      minimumRemainingTtlMs: 0,
      expectedScope: scope,
      ...overrides,
    });

    await expect(acquire({ minimumRemainingTtlMs: 301_000 }))
      .rejects.toMatchObject({ code: "internal_trial_token_ttl_insufficient" });
    await expect(acquire({ audience: "configuration-service" }))
      .rejects.toMatchObject({ code: "internal_trial_token_audience_mismatch" });
    await expect(acquire({ requiredPermission: "configuration.read" }))
      .rejects.toMatchObject({ code: "internal_trial_token_permission_missing" });
    await expect(acquire({ expectedScope: { ...scope, userId: "user.other" } }))
      .rejects.toMatchObject({ code: "internal_trial_token_scope_mismatch" });

    expect(() => requireProvider({
      [INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV]: compactToken({
        expiresAt: "2026-08-29T10:00:00.000Z",
      }),
    })).toThrowError(expect.objectContaining({
      code: "internal_trial_token_expired",
    }));
  });

  it("does not renew or replace the pre-issued bearer", async () => {
    const provider = requireProvider({
      [INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV]: compactToken(),
    });
    await expect(provider.renew({
      audience: "enterprise-model-gateway",
      requiredPermission: "model.use",
      minimumRemainingTtlMs: 0,
      expectedScope: scope,
      previousTokenId: "00000000-0000-4000-8000-000000000102",
      reason: "token_expired",
    })).rejects.toMatchObject({
      code: "internal_trial_token_renewal_unavailable",
    });
  });

  it("returns undefined when the internal-trial token was not configured", () => {
    expect(InternalTrialEnterpriseAccessTokenProvider.consume({
      environment: {},
      clock: fixedClock(),
    })).toBeUndefined();
  });
});

function requireProvider(environment: Record<string, string | undefined>) {
  const provider = InternalTrialEnterpriseAccessTokenProvider.consume({
    environment,
    clock: fixedClock(),
  });
  if (provider === undefined) throw new Error("provider was not configured");
  return provider;
}

function fixedClock(): Clock {
  return { now: () => now };
}

function compactToken(overrides: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" }))
    .toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    contractVersion: "v1alpha1",
    issuer: "central.internal-trial",
    audience: "enterprise-model-gateway",
    ...scope,
    tokenId: "00000000-0000-4000-8000-000000000102",
    issuedAt: "2026-08-29T09:59:00.000Z",
    expiresAt: "2026-08-29T10:05:00.000Z",
    permissions: ["model.use"],
    ...overrides,
  })).toString("base64url");
  return `${header}.${payload}.${"a".repeat(86)}`;
}
