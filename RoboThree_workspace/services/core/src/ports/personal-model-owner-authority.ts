import type {
  PersonalModelOwnerIdentity,
  PersonalModelOwnerNamespace,
} from "../application/personal-model-domain.js";

export type PersonalModelOfflineState =
  | "online"
  | "enterprise_temporarily_unavailable"
  | "enterprise_session_invalid";

export type PersonalModelOwnerAction =
  | "configure"
  | "use"
  | "reveal"
  | "delete";

export type PersonalModelOwnerAuthority = Readonly<{
  ownerIdentity: PersonalModelOwnerIdentity;
  authoritySource: "runtime_active_enterprise_identity";
  entitlement: "personal_model.configure";
  entitlementRevision: string;
  offlineState: PersonalModelOfflineState;
}>;

export type PersonalModelOwnerAuthorityInput = Readonly<{
  namespace: PersonalModelOwnerNamespace;
  enterpriseId: string;
  userId: string;
  deviceId: string;
  entitlementGranted: boolean;
  entitlementRevision: string;
  offlineState: PersonalModelOfflineState;
  action: PersonalModelOwnerAction;
}>;

export interface PersonalModelOwnerAuthorityResolver {
  resolve(input: PersonalModelOwnerAuthorityInput): PersonalModelOwnerAuthority;
}
