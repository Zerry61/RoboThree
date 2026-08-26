import type { PersonalModelOfflineState } from "./personal-model-owner-authority.js";

export type PersonalModelOwnerAuthorityContext = Readonly<{
  enterpriseId: string;
  userId: string;
  deviceId: string;
  entitlementGranted: boolean;
  entitlementRevision: string;
  offlineState: PersonalModelOfflineState;
}>;

export interface PersonalModelOwnerAuthorityContextProvider {
  load(action: "configure" | "use" | "reveal" | "delete"): Promise<PersonalModelOwnerAuthorityContext>;
}

export type PersonalModelDeletionDecision =
  | Readonly<{ status: "clear" }>
  | Readonly<{ status: "in_use" | "unknown"; reasonCode: string }>;

export interface PersonalModelDeletionGuard {
  evaluate(input: Readonly<{
    ownerScopeNamespaceRevision: number;
    ownerScopeDigest: string;
    personalModelId: string;
    configurationRevision: string;
    executionDefinitionDigest: string;
  }>): Promise<PersonalModelDeletionDecision>;
}

export type PersonalCredentialReferenceUsageDecision =
  | Readonly<{ status: "unused" }>
  | Readonly<{ status: "referenced" | "unknown"; reasonCode: string }>;

export interface PersonalCredentialReferenceUsage {
  evaluate(input: Readonly<{
    ownerScopeNamespaceRevision: number;
    ownerScopeDigest: string;
    personalModelId: string;
    configurationRevision: string;
    executionDefinitionDigest: string;
    credentialRef: string;
  }>): Promise<PersonalCredentialReferenceUsageDecision>;
}

export class UnavailablePersonalModelOwnerAuthorityContextProvider
implements PersonalModelOwnerAuthorityContextProvider {
  public async load(): Promise<PersonalModelOwnerAuthorityContext> {
    throw new PersonalModelCredentialCoordinationBoundaryError(
      "personal_model.authority_context_unavailable",
    );
  }
}

export class ConservativePersonalModelDeletionGuard
implements PersonalModelDeletionGuard {
  public async evaluate(): Promise<PersonalModelDeletionDecision> {
    return { status: "unknown", reasonCode: "personal_model.usage_unknown" };
  }
}

export class ConservativePersonalCredentialReferenceUsage
implements PersonalCredentialReferenceUsage {
  public async evaluate(): Promise<PersonalCredentialReferenceUsageDecision> {
    return { status: "unknown", reasonCode: "personal_model.usage_unknown" };
  }
}

export class PersonalModelCredentialCoordinationBoundaryError extends Error {
  public constructor(public readonly code: "personal_model.authority_context_unavailable") {
    super(code);
    this.name = "PersonalModelCredentialCoordinationBoundaryError";
  }
}
