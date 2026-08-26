import {
  validatePersonalModelDefinition,
  validatePersonalModelStatusFact,
  type PersonalModelDefinition,
  type PersonalModelOwnerIdentity,
  type PersonalModelStatusFact,
} from "./personal-model-domain.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";

export type PersonalModelRuntimeCandidate = Readonly<{
  authority: "local_personal";
  definition: PersonalModelDefinition;
  status: PersonalModelStatusFact;
}>;

export class PersonalModelRuntimeRegistry {
  readonly #persistence: PersonalModelPersistence;

  public constructor(persistence: PersonalModelPersistence) {
    this.#persistence = persistence;
  }

  public async resolve(input: Readonly<{
    ownerIdentity: PersonalModelOwnerIdentity;
    personalModelId: string;
    configurationRevision: string;
    executionDefinitionDigest: string;
  }>): Promise<PersonalModelRuntimeCandidate> {
    const definition = await this.#persistence.loadDefinition(
      input.ownerIdentity,
      input.personalModelId,
      input.configurationRevision,
    );
    if (definition === undefined) {
      throw new PersonalModelRuntimeRegistryError("personal_model.definition_not_found");
    }
    validatePersonalModelDefinition(definition);
    if (definition.executionDefinitionDigest !== input.executionDefinitionDigest) {
      throw new PersonalModelRuntimeRegistryError("personal_model.execution_identity_conflict");
    }
    const status = await this.#persistence.loadStatus(
      input.ownerIdentity,
      input.personalModelId,
      input.configurationRevision,
    );
    if (status === undefined) {
      throw new PersonalModelRuntimeRegistryError("personal_model.status_not_found");
    }
    validatePersonalModelStatusFact(status);
    if (status.executionDefinitionDigest !== definition.executionDefinitionDigest) {
      throw new PersonalModelRuntimeRegistryError("personal_model.status_identity_conflict");
    }
    return { authority: "local_personal", definition, status };
  }
}

export class PersonalModelRuntimeRegistryError extends Error {
  public constructor(public readonly code:
    | "personal_model.definition_not_found"
    | "personal_model.execution_identity_conflict"
    | "personal_model.status_not_found"
    | "personal_model.status_identity_conflict") {
    super(code);
    this.name = "PersonalModelRuntimeRegistryError";
  }
}
