import type { PersistenceAdapter } from "./persistence.js";
import type {
  ActivatedEnterpriseConfiguration,
  EnterpriseConfigurationCandidateIdentity,
  MaterializedEnterpriseConfiguration,
  ValidatedConfigurationSnapshot,
  ValidatedEnterprisePackage,
} from "../application/enterprise-configuration-types.js";
import type { EnterpriseIdentityScope } from "./enterprise-access-token-provider.js";

export type EnterpriseConfigurationCandidateStatus = "staging" | "sealed";

export type EnterpriseConfigurationCandidate = Readonly<{
  identity: EnterpriseConfigurationCandidateIdentity;
  status: EnterpriseConfigurationCandidateStatus;
  snapshot: ValidatedConfigurationSnapshot;
  packages: readonly ValidatedEnterprisePackage[];
  configuration?: MaterializedEnterpriseConfiguration;
  createdAt: string;
}>;

export type EnterpriseConfigurationPersistenceErrorCode =
  | "configuration.persistence_conflict"
  | "configuration.candidate_not_found"
  | "configuration.candidate_not_sealed"
  | "configuration.candidate_incomplete"
  | "configuration.scope_mismatch"
  | "configuration.activation_conflict"
  | "configuration.persistence_unavailable";

export type EnterpriseConfigurationPersistenceError = Readonly<{
  code: EnterpriseConfigurationPersistenceErrorCode;
  message: string;
}>;

export type EnterpriseConfigurationWriteResult<T> =
  | Readonly<{ ok: true; replayed: boolean; value: T }>
  | Readonly<{ ok: false; error: EnterpriseConfigurationPersistenceError }>;

export type EnterpriseConfigurationStatusEvent =
  | Readonly<{
    scope: EnterpriseIdentityScope;
    sequence: number;
    type: "storage_activated";
    storageActiveRevision: string;
    storageActiveDigest: string;
    previousStorageRevision?: string;
    occurredAt: string;
  }>
  | Readonly<{
    scope: EnterpriseIdentityScope;
    sequence: number;
    type: "sync_succeeded" | "sync_failed";
    errorCode?: string;
    occurredAt: string;
  }>;

export type EnterpriseConfigurationSyncFacts = Readonly<{
  lastSuccessfulSyncAt?: string;
  lastErrorCode?: string;
}>;

export type RecordEnterpriseConfigurationSyncOutcomeInput = Readonly<{
  scope: EnterpriseIdentityScope;
  outcome: "succeeded" | "failed";
  errorCode?: string;
  occurredAt: string;
}>;

export type EnterpriseConfigurationDiagnostics = Readonly<{
  scope: EnterpriseIdentityScope;
  candidateCount: number;
  unsealedCandidateCount: number;
  sealedGenerationCount: number;
  materializedBytes: number;
  oldestSealedAt?: string;
  activeCandidateKey?: string;
  previousCandidateKey?: string;
}>;

export type BeginEnterpriseConfigurationCandidateInput = Readonly<{
  identity: EnterpriseConfigurationCandidateIdentity;
  snapshot: ValidatedConfigurationSnapshot;
  createdAt: string;
}>;

export type StoreEnterpriseConfigurationPackageInput = Readonly<{
  candidateKey: string;
  scope: EnterpriseIdentityScope;
  package: ValidatedEnterprisePackage;
}>;

export type SealEnterpriseConfigurationCandidateInput = Readonly<{
  candidateKey: string;
  scope: EnterpriseIdentityScope;
  configuration: MaterializedEnterpriseConfiguration;
}>;

export type ActivateEnterpriseConfigurationCandidateInput = Readonly<{
  candidateKey: string;
  scope: EnterpriseIdentityScope;
  expectedActiveRevision?: string;
  activatedAt: string;
}>;

export interface EnterpriseConfigurationPersistence extends PersistenceAdapter {
  loadActive(
    scope: EnterpriseIdentityScope,
  ): Promise<ActivatedEnterpriseConfiguration | undefined>;
  loadPrevious(
    scope: EnterpriseIdentityScope,
  ): Promise<ActivatedEnterpriseConfiguration | undefined>;
  loadSealedGeneration(
    scope: EnterpriseIdentityScope,
    candidateKey: string,
  ): Promise<ActivatedEnterpriseConfiguration | undefined>;
  loadCandidate(
    candidateKey: string,
  ): Promise<EnterpriseConfigurationCandidate | undefined>;
  beginOrResumeCandidate(
    input: BeginEnterpriseConfigurationCandidateInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationCandidate>>;
  storeValidatedPackage(
    input: StoreEnterpriseConfigurationPackageInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationCandidate>>;
  sealCandidate(
    input: SealEnterpriseConfigurationCandidateInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationCandidate>>;
  activateSealedCandidate(
    input: ActivateEnterpriseConfigurationCandidateInput,
  ): Promise<EnterpriseConfigurationWriteResult<ActivatedEnterpriseConfiguration>>;
  discardUnsealedCandidate(
    candidateKey: string,
    scope: EnterpriseIdentityScope,
  ): Promise<EnterpriseConfigurationWriteResult<boolean>>;
  loadStatusEventsAfter(
    scope: EnterpriseIdentityScope,
    sequence: number,
  ): Promise<readonly EnterpriseConfigurationStatusEvent[]>;
  loadSyncFacts(
    scope: EnterpriseIdentityScope,
  ): Promise<EnterpriseConfigurationSyncFacts>;
  recordSyncOutcome(
    input: RecordEnterpriseConfigurationSyncOutcomeInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationSyncFacts>>;
  diagnostics(
    scope: EnterpriseIdentityScope,
  ): Promise<EnterpriseConfigurationDiagnostics>;
}

export function enterpriseConfigurationPersistenceFailure(
  code: EnterpriseConfigurationPersistenceErrorCode,
  message: string,
): EnterpriseConfigurationWriteResult<never> {
  return { ok: false, error: { code, message } };
}
