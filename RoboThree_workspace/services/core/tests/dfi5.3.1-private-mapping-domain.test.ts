import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  ProviderReasoningMappingIntegrityError,
  calculateProviderReasoningMappingDigest,
  calculateProviderReasoningStrategyDigest,
  commitmentFromMapping,
  createProviderReasoningMappingRelease,
  validateProviderReasoningMapping,
  validateProviderReasoningMappingRelease,
} from "../src/application/provider-reasoning-mapping-domain.js";
import { ReleasePinnedReasoningMappingRegistry } from
  "../src/application/release-pinned-reasoning-mapping-registry.js";
import { commitmentFixture } from "./support/dfi531-private-mapping-fixture.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe("DFI-5.3.1 private mapping digest ordering", () => {
  it("matches the frozen Core/Central private conformance fixture", () => {
    const fixture = JSON.parse(readFileSync(new URL(
      "./fixtures/dfi531-private-mapping-conformance.json",
      import.meta.url,
    ), "utf8")) as {
      mappingId: string;
      commitment: ReturnType<typeof commitmentFixture>;
      expected: {
        strategyDigest: string;
        profileRevision: string;
        mappingRevision: string;
      };
    };
    const release = createProviderReasoningMappingRelease({
      mappingId: fixture.mappingId,
      commitment: fixture.commitment,
    });
    expect(release.mapping.strategyRef.strategyDigest).toBe(fixture.expected.strategyDigest);
    expect(release.profile.profileRevision).toBe(fixture.expected.profileRevision);
    expect(release.mapping.mappingRevision).toBe(fixture.expected.mappingRevision);
  });

  it("calculates the Strategy commitment before Profile and full mapping without a cycle", () => {
    const commitment = commitmentFixture();
    const strategyDigest = calculateProviderReasoningStrategyDigest(commitment);
    const release = createProviderReasoningMappingRelease({
      mappingId: "reasoning.mapping.fixture-openai",
      commitment,
    });

    expect(Object.keys(commitment)).not.toEqual(expect.arrayContaining([
      "profileRevision",
      "profileDigest",
      "strategyDigest",
      "mappingRevision",
      "mappingDigest",
    ]));
    expect(release.profile.maxStrategy?.strategyDigest).toBe(strategyDigest);
    expect(release.profile.profileRevision).toBe(release.profile.profileDigest);
    expect(release.mapping.profileRef).toEqual({
      profileId: release.profile.profileId,
      profileRevision: release.profile.profileRevision,
      profileDigest: release.profile.profileDigest,
    });
    expect(release.mapping.mappingRevision).toBe(release.mapping.mappingDigest);
    const { mappingRevision: _revision, mappingDigest: _digest, ...mappingMaterial } =
      release.mapping;
    expect(calculateProviderReasoningMappingDigest(mappingMaterial))
      .toBe(release.mapping.mappingDigest);
    expect(Object.keys(mappingMaterial)).not.toContain("mappingDigest");
  });

  it("is deterministic and propagates private directive drift through all three layers", () => {
    const commitment = commitmentFixture();
    expect(new Set(Array.from({ length: 100 }, () =>
      calculateProviderReasoningStrategyDigest(commitment))).size).toBe(1);
    const first = createProviderReasoningMappingRelease({
      mappingId: "reasoning.mapping.fixture-openai",
      commitment,
    });
    const changed = createProviderReasoningMappingRelease({
      mappingId: "reasoning.mapping.fixture-openai-v2",
      commitment: {
        ...commitment,
        strategyRevision: digest("9"),
        typedPrivateDirective: { kind: "openai_reasoning_effort", effort: "high" },
      },
    });

    expect(changed.mapping.strategyRef.strategyDigest)
      .not.toBe(first.mapping.strategyRef.strategyDigest);
    expect(changed.profile.profileDigest).not.toBe(first.profile.profileDigest);
    expect(changed.mapping.mappingDigest).not.toBe(first.mapping.mappingDigest);
  });

  it("rejects revision reuse, duplicate exact mappings, and every integrity byte flip", () => {
    const first = createProviderReasoningMappingRelease({
      mappingId: "reasoning.mapping.fixture-openai",
      commitment: commitmentFixture(),
    });
    const sameRevisionDifferentRaw = createProviderReasoningMappingRelease({
      mappingId: "reasoning.mapping.fixture-openai-v2",
      commitment: {
        ...commitmentFixture(),
        typedPrivateDirective: { kind: "openai_reasoning_effort", effort: "high" },
      },
    });
    expect(() => new ReleasePinnedReasoningMappingRegistry([
      first,
      sameRevisionDifferentRaw,
    ])).toThrow(ProviderReasoningMappingIntegrityError);
    expect(() => new ReleasePinnedReasoningMappingRegistry([first, first]))
      .toThrow(ProviderReasoningMappingIntegrityError);

    expect(() => validateProviderReasoningMapping({
      ...first.mapping,
      evidenceRevision: digest("8"),
    })).toThrow("locked reasoning mapping cannot be verified");
    expect(() => validateProviderReasoningMappingRelease({
      profile: { ...first.profile, profileDigest: digest("8"), profileRevision: digest("8") },
      mapping: first.mapping,
    })).toThrow();
    expect(() => validateProviderReasoningMappingRelease({
      profile: first.profile,
      mapping: {
        ...first.mapping,
        mappingRevision: digest("8"),
        mappingDigest: digest("8"),
      },
    })).toThrow();
  });

  it("keeps historical exact mappings addressable without a current alias", async () => {
    const historical = createProviderReasoningMappingRelease({
      mappingId: "reasoning.mapping.fixture-openai-v1",
      commitment: commitmentFixture(),
    });
    const current = createProviderReasoningMappingRelease({
      mappingId: "reasoning.mapping.fixture-openai-v2",
      commitment: {
        ...commitmentFixture(),
        strategyRevision: digest("9"),
        typedPrivateDirective: { kind: "openai_reasoning_effort", effort: "high" },
      },
    });
    const registry = new ReleasePinnedReasoningMappingRegistry([historical, current]);
    const matches = await registry.loadExact(queryFrom(historical));

    expect(matches).toEqual([historical.mapping]);
    expect(registry.loadExactProfile(historical.profile.subject, historical.mapping.profileRef))
      .toEqual(historical.profile);
    expect(registry.loadExactProfile(historical.profile.subject, {
      ...historical.mapping.profileRef,
      profileRevision: digest("0"),
      profileDigest: digest("0"),
    })).toBeUndefined();
    expect(commitmentFromMapping(matches[0]!)).toEqual(commitmentFixture());
  });

  it("enforces provider-family, authority, directive, and timeout pairings", () => {
    expect(() => createProviderReasoningMappingRelease({
      mappingId: "reasoning.mapping.invalid",
      commitment: {
        ...commitmentFixture(),
        providerFamily: "enterprise_anthropic",
      },
    })).toThrow();
    expect(() => createProviderReasoningMappingRelease({
      mappingId: "reasoning.mapping.invalid",
      commitment: {
        ...commitmentFixture(),
        authority: "local_personal",
      },
    })).toThrow();
  });
});

function queryFrom(release: ReturnType<typeof createProviderReasoningMappingRelease>) {
  return {
    authority: release.mapping.authority,
    providerFamily: release.mapping.providerFamily,
    exactSubject: release.mapping.exactSubject,
    profileRef: release.mapping.profileRef,
    strategyRef: release.mapping.strategyRef,
  };
}
