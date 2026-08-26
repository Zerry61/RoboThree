import { describe, expect, it } from "vitest";

import {
  ANTHROPIC_USAGE_SEMANTICS_REVISION,
  InMemoryLocalPersonalUsageAuthority,
  OPENAI_USAGE_SEMANTICS_REVISION,
  ProviderUsageFactSchema,
  providerAttemptKey,
  providerUsageDigest,
} from "../src/index.js";

const id = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const now = "2026-08-13T08:00:00.000Z";
const semantics = OPENAI_USAGE_SEMANTICS_REVISION;

describe("Provider Usage private authority semantics", () => {
  it("namespaces stable attempt identities by authority", () => {
    const invocationId = id(9701);
    const enterprise = providerAttemptKey("central_enterprise", invocationId, 1);
    const personal = providerAttemptKey("local_personal", invocationId, 1);

    expect(enterprise).toHaveLength(64);
    expect(personal).toHaveLength(64);
    expect(enterprise).not.toBe(personal);
    expect(providerAttemptKey("central_enterprise", invocationId, 1)).toBe(enterprise);
    expect(providerAttemptKey("central_enterprise", invocationId, 2)).not.toBe(enterprise);
  });

  it("keeps the TS digest formula identical to the Java execution authority", () => {
    const material = materialFor("central_enterprise", id(9702), 1);
    expect(providerUsageDigest(material)).toBe(
      "9b2b6d1b4425bf2763a894d0583237df154188343512c7745ea1c5993bbc774a",
    );
  });

  it("keeps protocol-specific normalized input and reporting semantics fail-closed", () => {
    const invocationId = id(9711);
    const material = {
      usageAuthority: "central_enterprise" as const,
      authorityInvocationId: invocationId,
      providerAttemptKey: providerAttemptKey("central_enterprise", invocationId, 1),
      fencingEpoch: 1,
      sourceProtocol: "anthropic_compatible" as const,
      reportingSemanticsRevision: ANTHROPIC_USAGE_SEMANTICS_REVISION,
      providerInputTokens: 5,
      providerOutputTokens: 3,
      cacheReadInputTokens: 2,
      cacheWriteInputTokens: 4,
      normalizedTotalInputTokens: 11,
      attemptDisposition: "terminal_winner" as const,
    };
    expect(ProviderUsageFactSchema.parse({
      ...material,
      usageFactId: id(9712),
      usageDigest: providerUsageDigest(material),
      recordedAt: now,
    })).toMatchObject({ normalizedTotalInputTokens: 11 });
    const drifted = { ...material, normalizedTotalInputTokens: 5 };
    expect(() => ProviderUsageFactSchema.parse({
      ...drifted,
      usageFactId: id(9713),
      usageDigest: providerUsageDigest(drifted),
      recordedAt: now,
    })).toThrow(/normalized input/u);
  });

  it("freezes a local-personal Fake with the shared idempotency and conflict rules", async () => {
    const authority = new InMemoryLocalPersonalUsageAuthority();
    const invocationId = id(9703);
    const attemptKey = providerAttemptKey("local_personal", invocationId, 1);
    await authority.registerAttempt({
      authorityInvocationId: invocationId,
      fencingEpoch: 1,
      providerAttemptKey: attemptKey,
    });
    const fact = factFor("local_personal", invocationId, 1, id(9704));

    await expect(authority.record(fact)).resolves.toMatchObject({ ok: true, replayed: false });
    await expect(authority.record({ ...fact, usageFactId: id(9705) }))
      .resolves.toMatchObject({ ok: true, replayed: true });
    const driftedMaterial = {
      ...materialFor("local_personal", invocationId, 1),
      providerInputTokens: 9,
      normalizedTotalInputTokens: 9,
    };
    const drifted = ProviderUsageFactSchema.parse({
      ...driftedMaterial,
      usageFactId: id(9706),
      usageDigest: providerUsageDigest(driftedMaterial),
      recordedAt: now,
    });
    await expect(authority.record(drifted)).resolves.toMatchObject({
      ok: false,
      error: { code: "provider_usage.conflict" },
    });
  });

  it("rejects unknown authority, malformed digest and unregistered attempt", async () => {
    expect(() => ProviderUsageFactSchema.parse({
      ...materialFor("local_personal", id(9707), 1),
      usageAuthority: "remote_personal",
      usageFactId: id(9708),
      usageDigest: "b".repeat(64),
      recordedAt: now,
    })).toThrow();
    const authority = new InMemoryLocalPersonalUsageAuthority();
    await expect(authority.record(factFor("local_personal", id(9709), 1, id(9710))))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "provider_usage.attempt_not_registered" },
      });
  });
});

function materialFor(
  authority: "central_enterprise" | "local_personal",
  invocationId: string,
  epoch: number,
) {
  return {
    usageAuthority: authority,
    authorityInvocationId: invocationId,
    providerAttemptKey: providerAttemptKey(authority, invocationId, epoch),
    fencingEpoch: epoch,
    sourceProtocol: "openai_compatible" as const,
    reportingSemanticsRevision: semantics,
    providerInputTokens: 8,
    providerOutputTokens: 3,
    cacheReadInputTokens: 4,
    reasoningOutputTokens: 2,
    normalizedTotalInputTokens: 8,
    attemptDisposition: "terminal_winner" as const,
  };
}

function factFor(
  authority: "central_enterprise" | "local_personal",
  invocationId: string,
  epoch: number,
  usageFactId: string,
) {
  const material = materialFor(authority, invocationId, epoch);
  return ProviderUsageFactSchema.parse({
    ...material,
    usageFactId,
    usageDigest: providerUsageDigest(material),
    recordedAt: now,
  });
}
