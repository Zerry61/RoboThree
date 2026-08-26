export type EnterpriseIdentityScope = Readonly<{
  enterpriseId: string;
  userId: string;
  deviceId: string;
  clientInstanceId: string;
}>;

export type EnterpriseAccessTokenLease = Readonly<{
  /**
   * Sensitive bearer material. It is valid only in memory for the immediate
   * transport request and must never enter logs, persistence, fixtures, or
   * public Contracts.
   */
  compactToken: string;
  tokenId: string;
  audience: string;
  permissions: readonly string[];
  issuedAt: string;
  expiresAt: string;
  scope: EnterpriseIdentityScope;
}>;

export type EnterpriseAccessTokenRequest = Readonly<{
  audience: string;
  requiredPermission: string;
  minimumRemainingTtlMs: number;
  expectedScope?: EnterpriseIdentityScope;
}>;

export type EnterpriseAccessTokenRenewalRequest =
  EnterpriseAccessTokenRequest & Readonly<{
    previousTokenId: string;
    reason: "token_expired";
  }>;

/**
 * Local Application Port. Implementations compose the ADR-014 enterprise
 * identity, credential, device signer, and Central token-issuer flow.
 */
export interface EnterpriseAccessTokenProvider {
  acquire(
    request: EnterpriseAccessTokenRequest,
  ): Promise<EnterpriseAccessTokenLease>;

  renew(
    request: EnterpriseAccessTokenRenewalRequest,
  ): Promise<EnterpriseAccessTokenLease>;

  assertCurrentSession(
    expectedScope: EnterpriseIdentityScope,
    requiredPermission: string,
  ): Promise<void>;
}

export function sameEnterpriseIdentityScope(
  left: EnterpriseIdentityScope,
  right: EnterpriseIdentityScope,
): boolean {
  return left.enterpriseId === right.enterpriseId
    && left.userId === right.userId
    && left.deviceId === right.deviceId
    && left.clientInstanceId === right.clientInstanceId;
}
