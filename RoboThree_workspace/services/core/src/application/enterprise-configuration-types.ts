import type {
  EnterpriseConfigurationSnapshot,
  EnterprisePackageDocument,
  EnterprisePackageReference,
} from "@robothree/contracts";

import type { EnterpriseIdentityScope } from "../ports/enterprise-access-token-provider.js";

export type ValidatedConfigurationSnapshot = Readonly<{
  document: EnterpriseConfigurationSnapshot;
  byteLength: number;
  etag?: string;
}>;

export type ValidatedEnterprisePackage = Readonly<{
  reference: EnterprisePackageReference;
  document: EnterprisePackageDocument;
  byteLength: number;
  etag?: string;
}>;

export type EnterpriseConfigurationCandidateIdentity = Readonly<{
  candidateKey: string;
  scope: EnterpriseIdentityScope;
  snapshotId: string;
  snapshotRevision: string;
  snapshotDigest: string;
}>;

export type MaterializedEnterpriseConfiguration = Readonly<{
  identity: EnterpriseConfigurationCandidateIdentity;
  compatibility: Readonly<{
    contractVersion: string;
    schemaVersion: string;
    minimumDesktopVersion: string;
    minimumCoreVersion: string;
  }>;
  snapshot: EnterpriseConfigurationSnapshot;
  snapshotEtag?: string;
  packages: readonly ValidatedEnterprisePackage[];
  materializationDigest: string;
  materializedBytes: number;
  sealedAt: string;
}>;

export type ActivatedEnterpriseConfiguration = Readonly<{
  configuration: MaterializedEnterpriseConfiguration;
  storageActivatedAt: string;
}>;
