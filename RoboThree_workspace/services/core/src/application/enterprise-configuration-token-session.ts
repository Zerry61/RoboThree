import {
  sameEnterpriseIdentityScope,
  type EnterpriseAccessTokenLease,
  type EnterpriseAccessTokenProvider,
  type EnterpriseAccessTokenRequest,
  type EnterpriseIdentityScope,
} from "../ports/enterprise-access-token-provider.js";

export type EnterpriseConfigurationTokenErrorCode =
  | "enterprise_session_not_acquired"
  | "enterprise_session_scope_changed"
  | "enterprise_permission_missing"
  | "enterprise_token_refresh_exhausted";

/**
 * Coordinates one enterprise configuration operation. The bearer token stays
 * in memory, scope drift fails closed, and an expired token may be renewed only
 * once before the caller must start a new operation.
 */
export class EnterpriseConfigurationTokenSession {
  readonly #provider: EnterpriseAccessTokenProvider;
  readonly #request: EnterpriseAccessTokenRequest;
  #expectedScope: EnterpriseIdentityScope | undefined;
  #lease: EnterpriseAccessTokenLease | undefined;
  #renewalCount = 0;

  constructor(
    provider: EnterpriseAccessTokenProvider,
    request: EnterpriseAccessTokenRequest,
  ) {
    this.#provider = provider;
    this.#request = request;
  }

  async acquire(): Promise<EnterpriseAccessTokenLease> {
    if (this.#lease !== undefined) return this.#lease;
    const lease = await this.#provider.acquire(this.#request);
    this.#acceptLease(lease);
    return lease;
  }

  async renewAfterTokenExpired(): Promise<EnterpriseAccessTokenLease> {
    const previous = this.#requireLease();
    const expectedScope = this.#expectedScope;
    if (expectedScope === undefined) {
      throw new EnterpriseConfigurationTokenError(
        "enterprise_session_not_acquired",
        "enterprise configuration session has no acquired identity scope",
      );
    }
    if (this.#renewalCount >= 1) {
      throw new EnterpriseConfigurationTokenError(
        "enterprise_token_refresh_exhausted",
        "enterprise configuration operation permits at most one token renewal",
      );
    }

    this.#renewalCount += 1;
    const renewed = await this.#provider.renew({
      ...this.#request,
      expectedScope,
      previousTokenId: previous.tokenId,
      reason: "token_expired",
    });
    this.#acceptLease(renewed);
    return renewed;
  }

  async assertReadyToSeal(): Promise<void> {
    const expectedScope = this.#expectedScope;
    if (expectedScope === undefined) {
      throw new EnterpriseConfigurationTokenError(
        "enterprise_session_not_acquired",
        "enterprise configuration session must acquire a token before sealing",
      );
    }
    await this.#provider.assertCurrentSession(
      expectedScope,
      this.#request.requiredPermission,
    );
  }

  #acceptLease(lease: EnterpriseAccessTokenLease): void {
    if (lease.audience !== this.#request.audience) {
      throw new EnterpriseConfigurationTokenError(
        "enterprise_session_scope_changed",
        "enterprise access token audience changed during configuration operation",
      );
    }
    if (!lease.permissions.includes(this.#request.requiredPermission)) {
      throw new EnterpriseConfigurationTokenError(
        "enterprise_permission_missing",
        "enterprise access token does not grant the required configuration permission",
      );
    }

    const requestedScope = this.#request.expectedScope;
    if (requestedScope !== undefined
      && !sameEnterpriseIdentityScope(requestedScope, lease.scope)) {
      throw new EnterpriseConfigurationTokenError(
        "enterprise_session_scope_changed",
        "enterprise access token does not match the requested identity scope",
      );
    }
    if (this.#expectedScope !== undefined
      && !sameEnterpriseIdentityScope(this.#expectedScope, lease.scope)) {
      throw new EnterpriseConfigurationTokenError(
        "enterprise_session_scope_changed",
        "enterprise identity scope changed during configuration operation",
      );
    }

    this.#expectedScope ??= lease.scope;
    this.#lease = lease;
  }

  #requireLease(): EnterpriseAccessTokenLease {
    if (this.#lease === undefined) {
      throw new EnterpriseConfigurationTokenError(
        "enterprise_session_not_acquired",
        "enterprise configuration session must acquire a token before renewal",
      );
    }
    return this.#lease;
  }
}

export class EnterpriseConfigurationTokenError extends Error {
  constructor(
    readonly code: EnterpriseConfigurationTokenErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EnterpriseConfigurationTokenError";
  }
}
