import {
  EnterpriseConfigurationStatusProjectionSchema,
  type EnterpriseConfigurationStatusProjection,
} from "@robothree/contracts";

export type EnterpriseConfigurationGenerationRef = Readonly<{
  revision: string;
  digest: string;
}>;

export type EnterpriseConfigurationActivationFacts = Readonly<{
  storageActive?: EnterpriseConfigurationGenerationRef;
  runtimeActive?: EnterpriseConfigurationGenerationRef;
  lastSuccessfulSyncAt?: string;
  lastSyncErrorCode?: string;
  lastActivationFailure?: Readonly<{
    storageRevision: string;
    errorCode: string;
  }>;
}>;

export type EnterpriseConfigurationSyncView = Readonly<{
  inProgress: boolean;
}>;

export function projectEnterpriseConfigurationStatus(
  facts: EnterpriseConfigurationActivationFacts,
  sync: EnterpriseConfigurationSyncView,
): EnterpriseConfigurationStatusProjection {
  validateFacts(facts);
  const activationState = deriveActivationState(facts);
  const syncState = sync.inProgress
    ? "syncing"
    : facts.lastSyncErrorCode === undefined
      ? "idle"
      : "failed";
  const lastErrorCode = activationState === "activation_failed"
    ? facts.lastActivationFailure?.errorCode
    : facts.lastSyncErrorCode;

  return EnterpriseConfigurationStatusProjectionSchema.parse({
    contractVersion: "v1alpha2",
    syncState,
    activationState,
    storageActiveRevision: facts.storageActive?.revision,
    runtimeActiveRevision: facts.runtimeActive?.revision,
    lastSuccessfulSyncAt: facts.lastSuccessfulSyncAt,
    lastErrorCode,
  });
}

export function pendingRuntimeActivationFrom(
  projection: EnterpriseConfigurationStatusProjection,
): boolean {
  return projection.activationState === "pending_restart";
}

export type EnterpriseOfflineState =
  | "online"
  | "service_temporarily_unavailable"
  | "enterprise_session_invalid"
  | "recovered_update_waiting_for_application";

export type EnterpriseOfflineProjection = Readonly<{
  state: EnterpriseOfflineState;
  enterpriseCapabilitiesAvailable: boolean;
  locallyExecutableCapabilitiesMayContinue: boolean;
  requiresUserApplicationConfirmation: boolean;
  configurationMutationAllowed: boolean;
}>;

/**
 * Pure Desktop projection. Recovery detection never performs synchronization,
 * Storage Activation, Runtime Activation, or a Core restart.
 */
export function projectEnterpriseOfflineState(input: Readonly<{
  serviceReachable: boolean;
  enterpriseSessionValid: boolean;
  recoveredUpdateWaitingForApplication: boolean;
  runtimeActive: boolean;
  locallyExecutableCapabilityCount: number;
}>): EnterpriseOfflineProjection {
  if (input.locallyExecutableCapabilityCount < 0
    || !Number.isInteger(input.locallyExecutableCapabilityCount)) {
    throw new Error(
      "locally executable enterprise capability count must be a non-negative integer",
    );
  }
  if (!input.enterpriseSessionValid) {
    return offlineProjection("enterprise_session_invalid", false, false, false);
  }
  if (input.serviceReachable
    && input.recoveredUpdateWaitingForApplication) {
    return offlineProjection(
      "recovered_update_waiting_for_application",
      false,
      false,
      true,
    );
  }
  if (!input.serviceReachable) {
    const mayContinue = input.runtimeActive
      && input.locallyExecutableCapabilityCount > 0;
    return offlineProjection(
      "service_temporarily_unavailable",
      mayContinue,
      mayContinue,
      false,
    );
  }
  return offlineProjection("online", true, false, false, true);
}

function offlineProjection(
  state: EnterpriseOfflineState,
  enterpriseCapabilitiesAvailable: boolean,
  locallyExecutableCapabilitiesMayContinue: boolean,
  requiresUserApplicationConfirmation: boolean,
  configurationMutationAllowed = false,
): EnterpriseOfflineProjection {
  return Object.freeze({
    state,
    enterpriseCapabilitiesAvailable,
    locallyExecutableCapabilitiesMayContinue,
    requiresUserApplicationConfirmation,
    configurationMutationAllowed,
  });
}

function deriveActivationState(
  facts: EnterpriseConfigurationActivationFacts,
): EnterpriseConfigurationStatusProjection["activationState"] {
  if (facts.storageActive === undefined) return "uninitialized";
  if (sameGeneration(facts.storageActive, facts.runtimeActive)) return "current";
  if (facts.lastActivationFailure?.storageRevision
    === facts.storageActive.revision) {
    return "activation_failed";
  }
  return "pending_restart";
}

function validateFacts(facts: EnterpriseConfigurationActivationFacts): void {
  if (facts.storageActive === undefined && facts.runtimeActive !== undefined) {
    throw new Error(
      "enterprise configuration runtime-active revision requires storage-active configuration",
    );
  }
  if (facts.storageActive?.revision === facts.runtimeActive?.revision
    && facts.storageActive?.digest !== facts.runtimeActive?.digest) {
    throw new Error(
      "enterprise configuration revision cannot map to different storage/runtime digests",
    );
  }
}

function sameGeneration(
  left: EnterpriseConfigurationGenerationRef,
  right: EnterpriseConfigurationGenerationRef | undefined,
): boolean {
  return right !== undefined
    && left.revision === right.revision
    && left.digest === right.digest;
}
