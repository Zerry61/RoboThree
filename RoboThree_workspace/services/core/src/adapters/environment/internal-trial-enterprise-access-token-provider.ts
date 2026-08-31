import { Buffer } from "node:buffer";

import { z } from "zod";

import type { Clock } from "../../ports/clock.js";
import {
  sameEnterpriseIdentityScope,
  type EnterpriseAccessTokenLease,
  type EnterpriseAccessTokenProvider,
  type EnterpriseAccessTokenRenewalRequest,
  type EnterpriseAccessTokenRequest,
  type EnterpriseIdentityScope,
} from "../../ports/enterprise-access-token-provider.js";

export const INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV =
  "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN";

const BoundedTextSchema = z.string().min(1).max(160);
const TimestampSchema = z.iso.datetime({ offset: true });
const PermissionSchema = z.enum([
  "configuration.read",
  "model.use",
  "tool.use",
  "agent.use",
  "skill.use",
  "knowledge.use",
]);
const PermissionsSchema = z.array(PermissionSchema)
  .min(1)
  .max(32)
  .superRefine((permissions, context) => {
    if (new Set(permissions).size !== permissions.length) {
      context.addIssue({ code: "custom", message: "permissions must be unique" });
    }
  });
const LegacyClaimsSchema = z.object({
  contractVersion: z.literal("v1alpha1"),
  issuer: BoundedTextSchema,
  audience: BoundedTextSchema,
  enterpriseId: BoundedTextSchema,
  userId: BoundedTextSchema,
  deviceId: BoundedTextSchema,
  clientInstanceId: z.uuid(),
  tokenId: z.uuid(),
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
  permissions: PermissionsSchema,
}).strict();
const ClaimsSchema = LegacyClaimsSchema;
const INTERNAL_TRIAL_AUDIENCE = "enterprise-model-gateway";
const INTERNAL_TRIAL_PERMISSION = "model.use";
const JwsHeaderSchema = z.object({
  alg: z.string().min(2).max(32),
  typ: z.literal("JWT"),
}).passthrough();

type Environment = Record<string, string | undefined>;

export type InternalTrialEnterpriseAccessTokenErrorCode =
  | "internal_trial_token_invalid"
  | "internal_trial_token_expired"
  | "internal_trial_token_ttl_insufficient"
  | "internal_trial_token_audience_mismatch"
  | "internal_trial_token_permission_missing"
  | "internal_trial_token_scope_mismatch"
  | "internal_trial_token_renewal_unavailable";

/**
 * Internal-trial-only bearer source. The compact token is consumed once from
 * the Core process environment and retained only in this in-memory adapter.
 *
 * JWS claims are decoded only to construct the local request lease. They are
 * not treated as authenticated authority: Central still verifies the compact
 * token signature, issuance, expiry, permission and scope on every request.
 */
export class InternalTrialEnterpriseAccessTokenProvider
implements EnterpriseAccessTokenProvider {
  readonly #clock: Clock;
  readonly #lease: EnterpriseAccessTokenLease;

  private constructor(input: Readonly<{
    clock: Clock;
    compactToken: string;
    claims: z.infer<typeof ClaimsSchema>;
  }>) {
    this.#clock = input.clock;
    this.#lease = Object.freeze({
      compactToken: input.compactToken,
      tokenId: input.claims.tokenId,
      audience: input.claims.audience,
      permissions: Object.freeze([...input.claims.permissions]),
      issuedAt: input.claims.issuedAt,
      expiresAt: input.claims.expiresAt,
      scope: Object.freeze({
        enterpriseId: input.claims.enterpriseId,
        userId: input.claims.userId,
        deviceId: input.claims.deviceId,
        clientInstanceId: input.claims.clientInstanceId,
      }),
    });
  }

  public static consume(input: Readonly<{
    environment: Environment;
    clock: Clock;
    variableName?: string;
  }>): InternalTrialEnterpriseAccessTokenProvider | undefined {
    const variableName = input.variableName
      ?? INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV;
    const compactToken = input.environment[variableName];
    delete input.environment[variableName];
    if (compactToken === undefined || compactToken.length === 0) return undefined;

    try {
      const provider = new InternalTrialEnterpriseAccessTokenProvider({
        clock: input.clock,
        compactToken: boundedCompactToken(compactToken),
        claims: decodeClaims(compactToken),
      });
      provider.#assertUsable(0);
      return provider;
    } catch (error) {
      if (error instanceof InternalTrialEnterpriseAccessTokenError) throw error;
      throw invalidToken();
    }
  }

  public async acquire(
    request: EnterpriseAccessTokenRequest,
  ): Promise<EnterpriseAccessTokenLease> {
    this.#assertRequest(request);
    return this.#lease;
  }

  public identityScope(): EnterpriseIdentityScope {
    return this.#lease.scope;
  }

  public async renew(
    _request: EnterpriseAccessTokenRenewalRequest,
  ): Promise<EnterpriseAccessTokenLease> {
    throw new InternalTrialEnterpriseAccessTokenError(
      "internal_trial_token_renewal_unavailable",
      "internal-trial token renewal is unavailable",
    );
  }

  public async assertCurrentSession(
    expectedScope: EnterpriseIdentityScope,
    requiredPermission: string,
  ): Promise<void> {
    this.#assertUsable(0);
    if (!sameEnterpriseIdentityScope(expectedScope, this.#lease.scope)) {
      throw new InternalTrialEnterpriseAccessTokenError(
        "internal_trial_token_scope_mismatch",
        "internal-trial token scope does not match the active session",
      );
    }
    if (!this.#lease.permissions.includes(requiredPermission)) {
      throw new InternalTrialEnterpriseAccessTokenError(
        "internal_trial_token_permission_missing",
        "internal-trial token does not grant the required permission",
      );
    }
  }

  #assertRequest(request: EnterpriseAccessTokenRequest): void {
    if (request.audience !== this.#lease.audience) {
      throw new InternalTrialEnterpriseAccessTokenError(
        "internal_trial_token_audience_mismatch",
        "internal-trial token audience does not match the requested service",
      );
    }
    if (!this.#lease.permissions.includes(request.requiredPermission)) {
      throw new InternalTrialEnterpriseAccessTokenError(
        "internal_trial_token_permission_missing",
        "internal-trial token does not grant the required permission",
      );
    }
    if (request.expectedScope !== undefined
      && !sameEnterpriseIdentityScope(request.expectedScope, this.#lease.scope)) {
      throw new InternalTrialEnterpriseAccessTokenError(
        "internal_trial_token_scope_mismatch",
        "internal-trial token scope does not match the requested identity",
      );
    }
    this.#assertUsable(request.minimumRemainingTtlMs);
  }

  #assertUsable(minimumRemainingTtlMs: number): void {
    if (!Number.isInteger(minimumRemainingTtlMs) || minimumRemainingTtlMs < 0) {
      throw invalidToken();
    }
    const now = Date.parse(this.#clock.now());
    const issuedAt = Date.parse(this.#lease.issuedAt);
    const expiresAt = Date.parse(this.#lease.expiresAt);
    if (!Number.isFinite(now) || !Number.isFinite(issuedAt)
      || !Number.isFinite(expiresAt) || issuedAt >= expiresAt || now < issuedAt) {
      throw invalidToken();
    }
    const remaining = expiresAt - now;
    if (remaining <= 0) {
      throw new InternalTrialEnterpriseAccessTokenError(
        "internal_trial_token_expired",
        "internal-trial token has expired",
      );
    }
    if (remaining < minimumRemainingTtlMs) {
      throw new InternalTrialEnterpriseAccessTokenError(
        "internal_trial_token_ttl_insufficient",
        "internal-trial token remaining lifetime is insufficient",
      );
    }
  }
}

export class InternalTrialEnterpriseAccessTokenError extends Error {
  public constructor(
    public readonly code: InternalTrialEnterpriseAccessTokenErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InternalTrialEnterpriseAccessTokenError";
  }
}

function boundedCompactToken(value: string): string {
  if (value.length < 32 || value.length > 8_192
    || /\s/u.test(value) || !/^[A-Za-z0-9._~-]+$/u.test(value)) {
    throw invalidToken();
  }
  return value;
}

function decodeClaims(compactToken: string): z.infer<typeof ClaimsSchema> {
  const parts = compactToken.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw invalidToken();
  }
  try {
    JwsHeaderSchema.parse(JSON.parse(
      Buffer.from(parts[0]!, "base64url").toString("utf8"),
    ));
    if (!/^[A-Za-z0-9_-]+$/u.test(parts[2]!)) throw invalidToken();
    const document: unknown = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8"),
    );
    const claims = ClaimsSchema.parse(document);
    if (claims.audience !== INTERNAL_TRIAL_AUDIENCE
      || claims.permissions.length !== 1
      || claims.permissions[0] !== INTERNAL_TRIAL_PERMISSION) {
      throw invalidToken();
    }
    return claims;
  } catch {
    throw invalidToken();
  }
}

function invalidToken(): InternalTrialEnterpriseAccessTokenError {
  return new InternalTrialEnterpriseAccessTokenError(
    "internal_trial_token_invalid",
    "internal-trial token is invalid",
  );
}
