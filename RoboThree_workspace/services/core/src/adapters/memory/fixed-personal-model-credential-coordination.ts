import type {
  PersonalCredentialReferenceUsage,
  PersonalCredentialReferenceUsageDecision,
  PersonalModelDeletionDecision,
  PersonalModelDeletionGuard,
  PersonalModelOwnerAuthorityContext,
  PersonalModelOwnerAuthorityContextProvider,
} from "../../ports/personal-model-credential-coordination.js";

export class FixedPersonalModelOwnerAuthorityContextProvider
implements PersonalModelOwnerAuthorityContextProvider {
  public constructor(private context: PersonalModelOwnerAuthorityContext) {}

  public setContext(context: PersonalModelOwnerAuthorityContext): void {
    this.context = context;
  }

  public async load(): Promise<PersonalModelOwnerAuthorityContext> {
    return structuredClone(this.context);
  }
}

export class FixedPersonalModelDeletionGuard implements PersonalModelDeletionGuard {
  public constructor(private decision: PersonalModelDeletionDecision) {}

  public setDecision(decision: PersonalModelDeletionDecision): void {
    this.decision = decision;
  }

  public async evaluate(): Promise<PersonalModelDeletionDecision> {
    return structuredClone(this.decision);
  }
}

export class FixedPersonalCredentialReferenceUsage
implements PersonalCredentialReferenceUsage {
  public constructor(private decision: PersonalCredentialReferenceUsageDecision) {}

  public setDecision(decision: PersonalCredentialReferenceUsageDecision): void {
    this.decision = decision;
  }

  public async evaluate(): Promise<PersonalCredentialReferenceUsageDecision> {
    return structuredClone(this.decision);
  }
}
