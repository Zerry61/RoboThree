import { JsonValueSchema } from "@robothree/contracts";

import type { EnterpriseIdentityScope } from "../ports/enterprise-access-token-provider.js";
import {
  ENTERPRISE_CONFIGURATION_LIMITS,
  EnterpriseConfigurationValidationError,
  canonicalJson,
  rawSha256,
} from "./configuration-validator.js";
import type {
  EnterpriseConfigurationCandidateIdentity,
  MaterializedEnterpriseConfiguration,
  ValidatedConfigurationSnapshot,
  ValidatedEnterprisePackage,
} from "./enterprise-configuration-types.js";

export class PackageMaterializer {
  materialize(input: {
    scope: EnterpriseIdentityScope;
    snapshot: ValidatedConfigurationSnapshot;
    packages: readonly ValidatedEnterprisePackage[];
    sealedAt: string;
  }): MaterializedEnterpriseConfiguration {
    const expected = new Map(
      [...input.snapshot.document.agents, ...input.snapshot.document.skills]
        .map((reference) => [
          packageKey(reference.kind, reference.packageId),
          reference,
        ]),
    );
    const actual = new Map<string, ValidatedEnterprisePackage>();
    for (const candidate of input.packages) {
      const key = packageKey(candidate.reference.kind, candidate.reference.packageId);
      if (actual.has(key)) {
        throw new EnterpriseConfigurationValidationError(
          "configuration.duplicate_reference",
          "materialization contains a duplicate package",
        );
      }
      const reference = expected.get(key);
      if (
        reference === undefined
        || reference.revision !== candidate.reference.revision
        || reference.digest !== candidate.reference.digest
      ) {
        throw new EnterpriseConfigurationValidationError(
          "configuration.reference_mismatch",
          "materialization contains a package outside the exact snapshot closure",
        );
      }
      actual.set(key, candidate);
    }
    if (actual.size !== expected.size) {
      throw new EnterpriseConfigurationValidationError(
        "configuration.reference_mismatch",
        "materialization is missing an exact snapshot package",
      );
    }
    const packages = [...actual.values()].sort(
      (left, right) => packageKey(
        left.reference.kind,
        left.reference.packageId,
      ).localeCompare(packageKey(
        right.reference.kind,
        right.reference.packageId,
      )),
    );
    const materializedBytes = input.snapshot.byteLength
      + packages.reduce((total, current) => total + current.byteLength, 0);
    if (materializedBytes > ENTERPRISE_CONFIGURATION_LIMITS.materializedBytes) {
      throw new EnterpriseConfigurationValidationError(
        "configuration.document_too_large",
        "materialized enterprise configuration exceeds the total byte limit",
      );
    }
    const identity = candidateIdentity(input.scope, input.snapshot);
    const materializationDigest = rawSha256(canonicalJson(JsonValueSchema.parse({
      scope: identity.scope,
      snapshotId: identity.snapshotId,
      snapshotRevision: identity.snapshotRevision,
      snapshotDigest: identity.snapshotDigest,
      packages: packages.map(({ reference, document }) => ({
        reference,
        packageDigest: document.packageDigest,
      })),
    })));
    return deepFreeze({
      identity,
      compatibility: {
        contractVersion: input.snapshot.document.contractVersion,
        schemaVersion: input.snapshot.document.schemaVersion,
        minimumDesktopVersion: input.snapshot.document.minimumDesktopVersion,
        minimumCoreVersion: input.snapshot.document.minimumCoreVersion,
      },
      snapshot: input.snapshot.document,
      ...(input.snapshot.etag === undefined
        ? {}
        : { snapshotEtag: input.snapshot.etag }),
      packages,
      materializationDigest,
      materializedBytes,
      sealedAt: input.sealedAt,
    });
  }
}

export function candidateIdentity(
  scope: EnterpriseIdentityScope,
  snapshot: ValidatedConfigurationSnapshot,
): EnterpriseConfigurationCandidateIdentity {
  const facts = {
    scope,
    snapshotId: snapshot.document.snapshotId,
    snapshotRevision: snapshot.document.revision,
    snapshotDigest: snapshot.document.digest,
  };
  return deepFreeze({
    candidateKey: enterpriseConfigurationCandidateKey(facts),
    ...facts,
  });
}

export function enterpriseConfigurationCandidateKey(
  facts: Readonly<{
    scope: EnterpriseIdentityScope;
    snapshotId: string;
    snapshotRevision: string;
    snapshotDigest: string;
  }>,
): string {
  return rawSha256(canonicalJson(JsonValueSchema.parse(facts)));
}

function packageKey(kind: string, packageId: string): string {
  return `${kind}:${packageId}`;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}
