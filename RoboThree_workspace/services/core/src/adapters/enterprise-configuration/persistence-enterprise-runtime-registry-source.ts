import type {
  EnterpriseRuntimeRegistrySource,
} from "../../ports/enterprise-runtime-registry-source.js";
import type {
  EnterpriseIdentityScope,
} from "../../ports/enterprise-access-token-provider.js";
import type {
  EnterpriseConfigurationPersistence,
} from "../../ports/enterprise-configuration-persistence.js";

export class PersistenceEnterpriseRuntimeRegistrySource
implements EnterpriseRuntimeRegistrySource {
  readonly #persistence: EnterpriseConfigurationPersistence;

  constructor(persistence: EnterpriseConfigurationPersistence) {
    this.#persistence = persistence;
  }

  loadStorageActive(scope: EnterpriseIdentityScope) {
    return this.#persistence.loadActive(scope);
  }

  loadSealedGeneration(
    scope: EnterpriseIdentityScope,
    candidateKey: string,
  ) {
    return this.#persistence.loadSealedGeneration(scope, candidateKey);
  }
}
