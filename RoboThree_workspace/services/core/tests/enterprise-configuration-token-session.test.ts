import { describe, expect, it } from "vitest";

import {
  EnterpriseConfigurationTokenError,
  EnterpriseConfigurationTokenSession,
} from "../src/application/enterprise-configuration-token-session.js";
import type {
  EnterpriseAccessTokenLease,
  EnterpriseAccessTokenProvider,
  EnterpriseAccessTokenRenewalRequest,
  EnterpriseAccessTokenRequest,
  EnterpriseIdentityScope,
} from "../src/ports/enterprise-access-token-provider.js";

const scope: EnterpriseIdentityScope = {
  enterpriseId: "enterprise-1",
  userId: "user-1",
  deviceId: "device-1",
  clientInstanceId: "client-1",
};

const request: EnterpriseAccessTokenRequest = {
  audience: "robothree-central",
  requiredPermission: "configuration.read",
  minimumRemainingTtlMs: 30_000,
  expectedScope: scope,
};

function lease(
  tokenId: string,
  overrides: Partial<EnterpriseAccessTokenLease> = {},
): EnterpriseAccessTokenLease {
  return {
    compactToken: `sensitive-${tokenId}`,
    tokenId,
    audience: "robothree-central",
    permissions: ["configuration.read"],
    issuedAt: "2026-07-25T10:00:00Z",
    expiresAt: "2026-07-25T10:05:00Z",
    scope,
    ...overrides,
  };
}

class FakeEnterpriseAccessTokenProvider
implements EnterpriseAccessTokenProvider {
  acquireLease = lease("token-1");
  renewLease = lease("token-2");
  acquireCalls: EnterpriseAccessTokenRequest[] = [];
  renewalCalls: EnterpriseAccessTokenRenewalRequest[] = [];
  assertionCalls: Array<{
    expectedScope: EnterpriseIdentityScope;
    requiredPermission: string;
  }> = [];

  async acquire(
    tokenRequest: EnterpriseAccessTokenRequest,
  ): Promise<EnterpriseAccessTokenLease> {
    this.acquireCalls.push(tokenRequest);
    return this.acquireLease;
  }

  async renew(
    tokenRequest: EnterpriseAccessTokenRenewalRequest,
  ): Promise<EnterpriseAccessTokenLease> {
    this.renewalCalls.push(tokenRequest);
    return this.renewLease;
  }

  async assertCurrentSession(
    expectedScope: EnterpriseIdentityScope,
    requiredPermission: string,
  ): Promise<void> {
    this.assertionCalls.push({ expectedScope, requiredPermission });
  }
}

describe("EnterpriseConfigurationTokenSession", () => {
  it("acquires once and reuses the in-memory lease for the operation", async () => {
    const provider = new FakeEnterpriseAccessTokenProvider();
    const session = new EnterpriseConfigurationTokenSession(provider, request);

    expect(await session.acquire()).toEqual(lease("token-1"));
    expect(await session.acquire()).toEqual(lease("token-1"));
    expect(provider.acquireCalls).toHaveLength(1);
  });

  it("allows one token-expired renewal under the original identity scope", async () => {
    const provider = new FakeEnterpriseAccessTokenProvider();
    const session = new EnterpriseConfigurationTokenSession(provider, request);

    await session.acquire();
    expect(await session.renewAfterTokenExpired()).toEqual(lease("token-2"));
    expect(provider.renewalCalls).toEqual([{
      ...request,
      expectedScope: scope,
      previousTokenId: "token-1",
      reason: "token_expired",
    }]);
    await session.assertReadyToSeal();
    expect(provider.assertionCalls).toEqual([{
      expectedScope: scope,
      requiredPermission: "configuration.read",
    }]);
  });

  it("fails closed after the single renewal allowance is exhausted", async () => {
    const provider = new FakeEnterpriseAccessTokenProvider();
    const session = new EnterpriseConfigurationTokenSession(provider, request);

    await session.acquire();
    await session.renewAfterTokenExpired();
    await expect(session.renewAfterTokenExpired()).rejects.toMatchObject({
      code: "enterprise_token_refresh_exhausted",
    });
    expect(provider.renewalCalls).toHaveLength(1);
  });

  it("rejects identity-scope drift and missing permissions without leaking the token", async () => {
    const driftProvider = new FakeEnterpriseAccessTokenProvider();
    driftProvider.renewLease = lease("token-secret", {
      scope: { ...scope, userId: "other-user" },
    });
    const driftSession = new EnterpriseConfigurationTokenSession(
      driftProvider,
      request,
    );
    await driftSession.acquire();
    await expect(driftSession.renewAfterTokenExpired()).rejects.toMatchObject({
      code: "enterprise_session_scope_changed",
    });
    await expect(driftSession.renewAfterTokenExpired()).rejects.toMatchObject({
      code: "enterprise_token_refresh_exhausted",
    });
    expect(driftProvider.renewalCalls).toHaveLength(1);

    const permissionProvider = new FakeEnterpriseAccessTokenProvider();
    permissionProvider.acquireLease = lease("token-secret", {
      permissions: [],
    });
    const permissionSession = new EnterpriseConfigurationTokenSession(
      permissionProvider,
      request,
    );
    const failure = await permissionSession.acquire().catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(EnterpriseConfigurationTokenError);
    expect(failure).toMatchObject({ code: "enterprise_permission_missing" });
    expect(String(failure)).not.toContain("sensitive-token-secret");
  });

  it("requires acquisition before renewal or the final session check", async () => {
    const provider = new FakeEnterpriseAccessTokenProvider();
    const session = new EnterpriseConfigurationTokenSession(provider, request);

    await expect(session.renewAfterTokenExpired()).rejects.toMatchObject({
      code: "enterprise_session_not_acquired",
    });
    await expect(session.assertReadyToSeal()).rejects.toMatchObject({
      code: "enterprise_session_not_acquired",
    });
  });
});
