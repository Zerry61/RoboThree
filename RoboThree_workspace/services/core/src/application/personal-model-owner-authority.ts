import { Sha256DigestSchema } from "@robothree/contracts";

import { derivePersonalModelOwnerIdentity } from "./personal-model-domain.js";
import type {
  PersonalModelOwnerAuthority,
  PersonalModelOwnerAuthorityInput,
  PersonalModelOwnerAuthorityResolver,
} from "../ports/personal-model-owner-authority.js";

export class StrictPersonalModelOwnerAuthorityResolver
implements PersonalModelOwnerAuthorityResolver {
  public resolve(input: PersonalModelOwnerAuthorityInput): PersonalModelOwnerAuthority {
    const identityPresent = input.enterpriseId.length > 0
      && input.userId.length > 0
      && input.deviceId.length > 0;
    const sessionValid = input.offlineState !== "enterprise_session_invalid";
    const deleteAllowed = input.action === "delete" && identityPresent;
    if (!identityPresent
      || (!deleteAllowed && (!input.entitlementGranted || !sessionValid))) {
      throw new PersonalModelOwnerAuthorityError("personal_model.permission_denied");
    }
    return {
      ownerIdentity: derivePersonalModelOwnerIdentity(input.namespace, input),
      authoritySource: "runtime_active_enterprise_identity",
      entitlement: "personal_model.configure",
      entitlementRevision: Sha256DigestSchema.parse(input.entitlementRevision),
      offlineState: input.offlineState,
    };
  }
}

export class PersonalModelOwnerAuthorityError extends Error {
  public constructor(public readonly code: "personal_model.permission_denied") {
    super(code);
    this.name = "PersonalModelOwnerAuthorityError";
  }
}
