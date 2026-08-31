import { Buffer } from "node:buffer";

import { z } from "zod";

import type { Clock } from "../../ports/clock.js";

export const INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN_ENV =
  "ROBOTHREE_INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN";

const ClaimsSchema = z.object({
  contractVersion: z.literal("v1alpha1"),
  issuer: z.string().min(1).max(160),
  audience: z.literal("enterprise-agent-lifecycle"),
  enterpriseId: z.string().min(1).max(160),
  userId: z.string().min(1).max(160),
  deviceId: z.string().min(1).max(160),
  clientInstanceId: z.uuid(),
  tokenId: z.uuid(),
  issuedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  permissions: z.tuple([z.literal("agent.manage")]),
}).strict();

const HeaderSchema = z.object({
  alg: z.string().min(2).max(32),
  typ: z.literal("JWT"),
}).passthrough();

type Environment = Record<string, string | undefined>;

/** Internal-trial-only token consumed once by Core and retained only in memory. */
export class InternalTrialAgentLifecycleAccessToken {
  readonly #compactToken: string;
  readonly #expiresAt: number;
  readonly #clock: Clock;

  private constructor(compactToken: string, expiresAt: string, clock: Clock) {
    this.#compactToken = compactToken;
    this.#expiresAt = Date.parse(expiresAt);
    this.#clock = clock;
  }

  static consume(input: Readonly<{
    environment: Environment;
    clock: Clock;
    variableName?: string;
  }>): InternalTrialAgentLifecycleAccessToken | undefined {
    const variableName = input.variableName
      ?? INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN_ENV;
    const compactToken = input.environment[variableName];
    delete input.environment[variableName];
    if (compactToken === undefined || compactToken.length === 0) return undefined;
    if (compactToken.length > 8_192 || /\s/u.test(compactToken)) throw invalid();
    try {
      const parts = compactToken.split(".");
      if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw invalid();
      HeaderSchema.parse(JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")));
      if (!/^[A-Za-z0-9_-]+$/u.test(parts[2]!)) throw invalid();
      const claims = ClaimsSchema.parse(JSON.parse(
        Buffer.from(parts[1]!, "base64url").toString("utf8"),
      ));
      const now = Date.parse(input.clock.now());
      const issuedAt = Date.parse(claims.issuedAt);
      const expiresAt = Date.parse(claims.expiresAt);
      if (!Number.isFinite(now) || issuedAt >= expiresAt || now < issuedAt || now >= expiresAt) {
        throw invalid();
      }
      return new InternalTrialAgentLifecycleAccessToken(
        compactToken,
        claims.expiresAt,
        input.clock,
      );
    } catch {
      throw invalid();
    }
  }

  bearer(minimumRemainingTtlMs = 30_000): string {
    const remaining = this.#expiresAt - Date.parse(this.#clock.now());
    if (!Number.isFinite(remaining) || remaining < minimumRemainingTtlMs) throw invalid();
    return this.#compactToken;
  }
}

function invalid(): Error {
  return new Error("internal_trial_agent_lifecycle_token_invalid");
}
