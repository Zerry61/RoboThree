import type {
  ReasoningModeLockProfileRef,
  ReasoningProfile,
  ReasoningProfileSubject,
} from "@robothree/contracts/reasoning-mode/v1alpha1";

import type { ReasoningProfileSource } from "../ports/desktop-reasoning-mode.js";
import type {
  ProviderReasoningMappingQuery,
  ProviderReasoningMappingSource,
} from "../ports/provider-reasoning-mapping-source.js";
import {
  ProviderReasoningMappingIntegrityError,
  type ProviderReasoningMapping,
  type ProviderReasoningMappingRelease,
  validateProviderReasoningMappingRelease,
} from "./provider-reasoning-mapping-domain.js";
import { sameReasoningProfileSubject } from "./desktop-reasoning-mode-domain.js";

/**
 * Immutable production-capable catalog. It contains no built-in entries and is
 * intentionally not installed by the production bootstrap in DFI-5.3.1.
 */
export class ReleasePinnedReasoningMappingRegistry
implements ProviderReasoningMappingSource {
  readonly #releases: readonly ProviderReasoningMappingRelease[];

  public constructor(releases: readonly ProviderReasoningMappingRelease[]) {
    this.#releases = Object.freeze(releases.map(validateProviderReasoningMappingRelease));
    assertUniqueReleaseIdentities(this.#releases);
  }

  public async loadExact(
    query: ProviderReasoningMappingQuery,
  ): Promise<readonly ProviderReasoningMapping[]> {
    return Object.freeze(this.#releases
      .filter((release) => exactMappingMatch(release.mapping, query))
      .map((release) => release.mapping));
  }

  public loadExactProfile(
    subject: ReasoningProfileSubject,
    reference: ReasoningModeLockProfileRef,
  ): ReasoningProfile | undefined {
    const matches = this.#releases.filter((release) =>
      sameReasoningProfileSubject(release.profile.subject, subject)
      && release.profile.profileId === reference.profileId
      && release.profile.profileRevision === reference.profileRevision
      && release.profile.profileDigest === reference.profileDigest);
    if (matches.length > 1) {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
    }
    return matches[0]?.profile;
  }

  public pinnedProfileSource(
    pins: readonly Readonly<{
      subject: ReasoningProfileSubject;
      profileRef: ReasoningModeLockProfileRef;
    }>[],
  ): ReasoningProfileSource {
    const profiles = pins.map((pin) => {
      const profile = this.loadExactProfile(pin.subject, pin.profileRef);
      if (profile === undefined) {
        throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_unavailable");
      }
      return profile;
    });
    if (new Set(profiles.map((profile) => subjectKey(profile.subject))).size !== profiles.length) {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
    }
    return Object.freeze({
      loadExact: async (subject: ReasoningProfileSubject) =>
        profiles.find((profile) => sameReasoningProfileSubject(profile.subject, subject)),
    });
  }
}

function assertUniqueReleaseIdentities(
  releases: readonly ProviderReasoningMappingRelease[],
): void {
  const exactKeys = releases.map((release) => exactMappingKey(release.mapping));
  const strategyKeys = releases.map((release) => strategyReleaseKey(release.mapping));
  const mappingIds = releases.map((release) => release.mapping.mappingId);
  if (
    new Set(exactKeys).size !== exactKeys.length
    || new Set(strategyKeys).size !== strategyKeys.length
    || new Set(mappingIds).size !== mappingIds.length
  ) {
    throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  }
}

function exactMappingMatch(
  mapping: ProviderReasoningMapping,
  query: ProviderReasoningMappingQuery,
): boolean {
  return mapping.authority === query.authority
    && mapping.providerFamily === query.providerFamily
    && sameReasoningProfileSubject(mapping.exactSubject, query.exactSubject)
    && mapping.profileRef.profileId === query.profileRef.profileId
    && mapping.profileRef.profileRevision === query.profileRef.profileRevision
    && mapping.profileRef.profileDigest === query.profileRef.profileDigest
    && mapping.strategyRef.strategyId === query.strategyRef.strategyId
    && mapping.strategyRef.strategyRevision === query.strategyRef.strategyRevision
    && mapping.strategyRef.strategyDigest === query.strategyRef.strategyDigest
    && mapping.strategyRef.timeoutPolicyRef === query.strategyRef.timeoutPolicyRef;
}

function exactMappingKey(mapping: ProviderReasoningMapping): string {
  return [
    mapping.authority,
    mapping.providerFamily,
    subjectKey(mapping.exactSubject),
    mapping.profileRef.profileId,
    mapping.profileRef.profileRevision,
    mapping.strategyRef.strategyId,
    mapping.strategyRef.strategyRevision,
    mapping.strategyRef.strategyDigest,
    mapping.timeoutPolicyIdentity.timeoutPolicyRef,
    mapping.timeoutPolicyIdentity.timeoutPolicyRevision,
    mapping.timeoutPolicyIdentity.timeoutPolicyDigest,
  ].join("\u0000");
}

function strategyReleaseKey(mapping: ProviderReasoningMapping): string {
  return [
    mapping.authority,
    mapping.providerFamily,
    subjectKey(mapping.exactSubject),
    mapping.profileRef.profileId,
    mapping.strategyRef.strategyId,
    mapping.strategyRef.strategyRevision,
  ].join("\u0000");
}

function subjectKey(subject: ReasoningProfileSubject): string {
  return [
    subject.authority,
    subject.modelCapabilityId,
    subject.modelCapabilityRevision,
    subject.adapterDescriptorId,
    subject.adapterDescriptorRevision,
    subject.personalExecutionDefinitionDigest ?? "",
  ].join("\u0000");
}
