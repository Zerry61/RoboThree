import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN_ENV,
  InternalTrialAgentLifecycleAccessToken,
} from "../src/adapters/environment/internal-trial-agent-lifecycle-access-token.js";
import type { Clock } from "../src/ports/clock.js";

const now = "2026-08-30T12:00:00.000Z";
const clock: Clock = { now: () => now };

describe("InternalTrialAgentLifecycleAccessToken", () => {
  it("consumes and deletes one exact agent.manage token", () => {
    const token = compactToken();
    const environment = { [INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN_ENV]: token };
    const lease = InternalTrialAgentLifecycleAccessToken.consume({ environment, clock });

    expect(environment).not.toHaveProperty(INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN_ENV);
    expect(lease?.bearer()).toBe(token);
  });

  it("deletes and rejects wrong audience, excess permission and expired material", () => {
    for (const token of [
      compactToken({ audience: "enterprise-model-gateway" }),
      compactToken({ permissions: ["agent.manage", "model.use"] }),
      compactToken({ expiresAt: "2026-08-30T12:00:00.000Z" }),
    ]) {
      const environment = { [INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN_ENV]: token };
      expect(() => InternalTrialAgentLifecycleAccessToken.consume({ environment, clock }))
        .toThrow("internal_trial_agent_lifecycle_token_invalid");
      expect(environment).not.toHaveProperty(INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN_ENV);
    }
  });

  it("fails closed when the in-memory lease is close to expiry", () => {
    const lease = InternalTrialAgentLifecycleAccessToken.consume({
      environment: { [INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN_ENV]: compactToken() },
      clock,
    });
    expect(() => lease?.bearer(10 * 60_000)).toThrow(
      "internal_trial_agent_lifecycle_token_invalid",
    );
  });
});

function compactToken(overrides: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    contractVersion: "v1alpha1",
    issuer: "central.internal-trial",
    audience: "enterprise-agent-lifecycle",
    enterpriseId: "enterprise.internal-trial",
    userId: "user.internal-trial",
    deviceId: "device.internal-trial",
    clientInstanceId: "00000000-0000-4000-8000-000000000101",
    tokenId: "00000000-0000-4000-8000-000000000102",
    issuedAt: "2026-08-30T11:59:00.000Z",
    expiresAt: "2026-08-30T12:05:00.000Z",
    permissions: ["agent.manage"],
    ...overrides,
  })).toString("base64url");
  return `${header}.${payload}.c2lnbmF0dXJl`;
}
