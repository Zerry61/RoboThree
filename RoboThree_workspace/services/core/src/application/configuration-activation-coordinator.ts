import type {
  ActivatedEnterpriseConfiguration,
  ValidatedConfigurationSnapshot,
  ValidatedEnterprisePackage,
} from "./enterprise-configuration-types.js";
import type { EnterpriseIdentityScope } from "../ports/enterprise-access-token-provider.js";
import type {
  EnterpriseConfigurationPersistence,
  EnterpriseConfigurationWriteResult,
} from "../ports/enterprise-configuration-persistence.js";
import { PackageMaterializer } from "./package-materializer.js";

export type ActivateValidatedEnterpriseConfigurationInput = Readonly<{
  scope: EnterpriseIdentityScope;
  snapshot: ValidatedConfigurationSnapshot;
  packages: readonly ValidatedEnterprisePackage[];
  expectedActiveRevision?: string;
  now: string;
}>;

/**
 * Coordinates only local stage, seal, and Storage Activation. Downloads stay
 * outside this class, so no transport operation can be held inside a database
 * transaction. A per-scope mailbox provides the Alpha single-writer rule.
 */
export class ConfigurationActivationCoordinator {
  readonly #persistence: EnterpriseConfigurationPersistence;
  readonly #materializer: PackageMaterializer;
  readonly #mailboxes = new Map<string, Promise<void>>();

  constructor(input: {
    persistence: EnterpriseConfigurationPersistence;
    materializer?: PackageMaterializer;
  }) {
    this.#persistence = input.persistence;
    this.#materializer = input.materializer ?? new PackageMaterializer();
  }

  activate(
    input: ActivateValidatedEnterpriseConfigurationInput,
  ): Promise<EnterpriseConfigurationWriteResult<ActivatedEnterpriseConfiguration>> {
    return this.#enqueue(input.scope, () => this.#activateSerialized(input));
  }

  async #activateSerialized(
    input: ActivateValidatedEnterpriseConfigurationInput,
  ): Promise<EnterpriseConfigurationWriteResult<ActivatedEnterpriseConfiguration>> {
    const configuration = this.#materializer.materialize({
      scope: input.scope,
      snapshot: input.snapshot,
      packages: input.packages,
      sealedAt: input.now,
    });
    const begun = await this.#persistence.beginOrResumeCandidate({
      identity: configuration.identity,
      snapshot: input.snapshot,
      createdAt: input.now,
    });
    if (!begun.ok) return begun;
    for (const item of input.packages) {
      const stored = await this.#persistence.storeValidatedPackage({
        candidateKey: configuration.identity.candidateKey,
        scope: input.scope,
        package: item,
      });
      if (!stored.ok) return stored;
    }
    const sealed = await this.#persistence.sealCandidate({
      candidateKey: configuration.identity.candidateKey,
      scope: input.scope,
      configuration,
    });
    if (!sealed.ok) return sealed;
    return this.#persistence.activateSealedCandidate({
      candidateKey: configuration.identity.candidateKey,
      scope: input.scope,
      ...(input.expectedActiveRevision === undefined
        ? {}
        : { expectedActiveRevision: input.expectedActiveRevision }),
      activatedAt: input.now,
    });
  }

  async #enqueue<T>(
    scope: EnterpriseIdentityScope,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = scopeKey(scope);
    const previous = this.#mailboxes.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => turn);
    this.#mailboxes.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
      if (this.#mailboxes.get(key) === tail) {
        this.#mailboxes.delete(key);
      }
    }
  }
}

function scopeKey(scope: EnterpriseIdentityScope): string {
  return [
    scope.enterpriseId,
    scope.userId,
    scope.deviceId,
    scope.clientInstanceId,
  ].map((part) => `${part.length}:${part}`).join("|");
}

