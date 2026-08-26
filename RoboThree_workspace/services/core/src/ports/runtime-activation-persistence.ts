import type {
  EnterpriseRuntimeGenerationIdentity,
} from "../application/enterprise-registry-materializer.js";
import type { EnterpriseIdentityScope } from "./enterprise-access-token-provider.js";
import type { PersistenceAdapter } from "./persistence.js";

export type RuntimeActivationTarget = Readonly<
  EnterpriseRuntimeGenerationIdentity & {
    registryRevision: string;
  }
>;

export type RuntimeActivationAttemptStatus =
  | "intent_recorded"
  | "restart_requested"
  | "internally_ready"
  | "completed"
  | "failed";

export type RuntimeActiveGeneration = Readonly<{
  activationAttemptId: string;
  scope: EnterpriseIdentityScope;
  target: RuntimeActivationTarget;
  activatedAt: string;
}>;

export type RuntimeActivationFailureFact = Readonly<{
  activationAttemptId: string;
  scope: EnterpriseIdentityScope;
  target: RuntimeActivationTarget;
  errorCode: string;
  failedAt: string;
  fallbackRuntimeActive?: RuntimeActiveGeneration;
  fallbackReadyAt?: string;
}>;

export type RuntimeActivationAttempt = Readonly<{
  activationAttemptId: string;
  scope: EnterpriseIdentityScope;
  target: RuntimeActivationTarget;
  expectedPreviousRuntimeActive?: RuntimeActiveGeneration;
  status: RuntimeActivationAttemptStatus;
  requestedAt: string;
  restartRequestedAt?: string;
  internallyReadyAt?: string;
  completedAt?: string;
  failure?: RuntimeActivationFailureFact;
}>;

export type RuntimeActivationState = Readonly<{
  runtimeActive?: RuntimeActiveGeneration;
  latestAttempt?: RuntimeActivationAttempt;
  lastFailure?: RuntimeActivationFailureFact;
}>;

export type RuntimeActivationPersistenceErrorCode =
  | "runtime_activation.persistence_conflict"
  | "runtime_activation.target_not_storage_active"
  | "runtime_activation.stale_attempt"
  | "runtime_activation.integrity_mismatch"
  | "runtime_activation.persistence_unavailable";

export type RuntimeActivationPersistenceError = Readonly<{
  code: RuntimeActivationPersistenceErrorCode;
  message: string;
}>;

export type RuntimeActivationWriteResult<T> =
  | Readonly<{ ok: true; replayed: boolean; value: T }>
  | Readonly<{ ok: false; error: RuntimeActivationPersistenceError }>;

export type BeginRuntimeActivationInput = Readonly<{
  activationAttemptId: string;
  scope: EnterpriseIdentityScope;
  target: RuntimeActivationTarget;
  expectedPreviousRuntimeActive?: RuntimeActiveGeneration;
  requestedAt: string;
}>;

export type AdvanceRuntimeActivationInput = Readonly<{
  activationAttemptId: string;
  scope: EnterpriseIdentityScope;
  target: RuntimeActivationTarget;
  occurredAt: string;
}>;

export type FailRuntimeActivationInput = AdvanceRuntimeActivationInput & Readonly<{
  errorCode: string;
}>;

export type RecordRuntimeFallbackInput = AdvanceRuntimeActivationInput & Readonly<{
  fallbackRuntimeActive: RuntimeActiveGeneration;
}>;

export interface RuntimeActivationPersistence extends PersistenceAdapter {
  loadRuntimeActivationState(
    scope: EnterpriseIdentityScope,
  ): Promise<RuntimeActivationState>;
  loadRuntimeActivationAttempt(
    activationAttemptId: string,
  ): Promise<RuntimeActivationAttempt | undefined>;
  listRuntimeActivationAttempts(
    scope: EnterpriseIdentityScope,
  ): Promise<readonly RuntimeActivationAttempt[]>;
  beginRuntimeActivation(
    input: BeginRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationAttempt>>;
  recordRestartDecision(
    input: AdvanceRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationAttempt>>;
  recordInternalReadiness(
    input: AdvanceRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationAttempt>>;
  commitRuntimeActive(
    input: AdvanceRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActiveGeneration>>;
  recordRuntimeActivationFailure(
    input: FailRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationFailureFact>>;
  recordRuntimeFallbackReady(
    input: RecordRuntimeFallbackInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationFailureFact>>;
}

export function runtimeActivationPersistenceFailure(
  code: RuntimeActivationPersistenceErrorCode,
  message: string,
): RuntimeActivationWriteResult<never> {
  return { ok: false, error: { code, message } };
}
