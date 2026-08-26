import type {
  PersonalCredentialReferenceUsage,
  PersonalCredentialReferenceUsageDecision,
  PersonalModelDeletionDecision,
  PersonalModelDeletionGuard,
} from "../ports/personal-model-credential-coordination.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import {
  PersonalModelTaskLockMaterializer,
  isPersonalModelLock,
} from "../application/personal-model-task-lock.js";

const MAX_REFERENCES = 1_000;

export class TaskBackedPersonalModelUsageGuard
implements PersonalModelDeletionGuard, PersonalCredentialReferenceUsage {
  readonly #tasks: TaskPersistence;
  readonly #personal: PersonalModelPersistence;
  readonly #materializer: PersonalModelTaskLockMaterializer;

  public constructor(input: Readonly<{
    tasks: TaskPersistence;
    personal: PersonalModelPersistence;
    materializer?: PersonalModelTaskLockMaterializer;
  }>) {
    this.#tasks = input.tasks;
    this.#personal = input.personal;
    this.#materializer = input.materializer ?? new PersonalModelTaskLockMaterializer();
  }

  public async evaluate(input: Readonly<{
    ownerScopeNamespaceRevision: number;
    ownerScopeDigest: string;
    personalModelId: string;
    configurationRevision: string;
    executionDefinitionDigest: string;
    credentialRef: string;
  }>): Promise<PersonalCredentialReferenceUsageDecision>;
  public async evaluate(input: Readonly<{
    ownerScopeNamespaceRevision: number;
    ownerScopeDigest: string;
    personalModelId: string;
    configurationRevision: string;
    executionDefinitionDigest: string;
  }>): Promise<PersonalModelDeletionDecision>;
  public async evaluate(input: Readonly<{
    ownerScopeNamespaceRevision: number;
    ownerScopeDigest: string;
    personalModelId: string;
    configurationRevision: string;
    executionDefinitionDigest: string;
    credentialRef?: string;
  }>): Promise<PersonalModelDeletionDecision | PersonalCredentialReferenceUsageDecision> {
    try {
      const page = await this.#tasks.listNonTerminalTaskCapabilityLocksByCapabilityId(
        input.personalModelId,
        MAX_REFERENCES,
      );
      if (page.truncated) return unknown(input.credentialRef !== undefined);
      const namespace = await this.#personal.loadActiveOwnerNamespace();
      if (namespace === undefined) return unknown(input.credentialRef !== undefined);
      for (const lock of page.locks) {
        if (!isPersonalModelLock(lock)) return unknown(input.credentialRef !== undefined);
        const identity = this.#materializer.verify({ lock, namespace });
        if (identity.ownerIdentity.ownerScopeNamespaceRevision === input.ownerScopeNamespaceRevision
          && identity.ownerIdentity.ownerScopeDigest === input.ownerScopeDigest
          && identity.configurationRevision === input.configurationRevision
          && identity.executionDefinitionDigest === input.executionDefinitionDigest) {
          return input.credentialRef === undefined
            ? { status: "in_use", reasonCode: "personal_model.in_use" }
            : { status: "referenced", reasonCode: "personal_model.credential_referenced" };
        }
      }
      return input.credentialRef === undefined ? { status: "clear" } : { status: "unused" };
    } catch {
      return unknown(input.credentialRef !== undefined);
    }
  }
}

function unknown(credential: boolean):
  PersonalModelDeletionDecision | PersonalCredentialReferenceUsageDecision {
  return credential
    ? { status: "unknown", reasonCode: "personal_model.usage_unknown" }
    : { status: "unknown", reasonCode: "personal_model.usage_unknown" };
}
