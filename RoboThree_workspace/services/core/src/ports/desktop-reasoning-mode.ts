import type {
  ReasoningModePreferenceReceipt,
} from "@robothree/contracts";
import type {
  ReasoningProfile,
  ReasoningProfileSubject,
} from "@robothree/contracts/reasoning-mode/v1alpha1";

import type {
  DesktopExperienceOwnerNamespace,
  DesktopExperiencePreferenceOwnerIdentity,
  DesktopReasoningModePreference,
} from "../application/desktop-reasoning-mode-domain.js";

export interface ReasoningProfileSource {
  loadExact(subject: ReasoningProfileSubject): Promise<ReasoningProfile | undefined>;
}

export type DesktopReasoningModeOwnerAuthority =
  | Readonly<{
    state: "available";
    enterpriseId: string;
    userId: string;
    deviceId: string;
    currentClientInstanceId: string;
    authoritySource: "runtime_active_enterprise_identity" | "test_only";
    testIdentityUsed: boolean;
    productionIdentityReady: boolean;
  }>
  | Readonly<{
    state: "unavailable";
    testIdentityUsed: false;
    productionIdentityReady: false;
  }>;

export interface DesktopReasoningModeOwnerAuthorityProvider {
  resolve(): Promise<DesktopReasoningModeOwnerAuthority>;
}

export type DesktopReasoningModePreferenceReceiptRecord =
  ReasoningModePreferenceReceipt & DesktopExperiencePreferenceOwnerIdentity;

export type DesktopReasoningModePersistenceErrorCode =
  | "reasoning_mode.preference_conflict"
  | "reasoning_mode.owner_namespace_unavailable"
  | "reasoning_mode.integrity_invalid";

export type DesktopReasoningModeWriteResult<T> =
  | Readonly<{ ok: true; replayed: boolean; value: T }>
  | Readonly<{
    ok: false;
    error: Readonly<{
      code: DesktopReasoningModePersistenceErrorCode;
      message: string;
    }>;
  }>;

export interface DesktopReasoningModePreferencePersistence {
  start(): Promise<void>;
  stop(): Promise<void>;
  loadActiveOwnerNamespace(): Promise<DesktopExperienceOwnerNamespace | undefined>;
  initializeOwnerNamespace(
    namespace: DesktopExperienceOwnerNamespace,
  ): Promise<DesktopReasoningModeWriteResult<DesktopExperienceOwnerNamespace>>;
  loadPreference(
    owner: DesktopExperiencePreferenceOwnerIdentity,
  ): Promise<DesktopReasoningModePreference | undefined>;
  loadReceipt(
    owner: DesktopExperiencePreferenceOwnerIdentity,
    commandId: string,
  ): Promise<DesktopReasoningModePreferenceReceiptRecord | undefined>;
  commitPreference(input: Readonly<{
    preference: DesktopReasoningModePreference;
    receipt: DesktopReasoningModePreferenceReceiptRecord;
    expectedPreferenceRevision: number;
  }>): Promise<DesktopReasoningModeWriteResult<DesktopReasoningModePreferenceReceiptRecord>>;
}

export type EffectiveReasoningModel = Readonly<{
  modelId: string;
  modelRevision: string;
  subject: ReasoningProfileSubject;
}>;

export interface EffectiveReasoningModelResolver<Query> {
  resolve(query: Query): Promise<EffectiveReasoningModel>;
}
