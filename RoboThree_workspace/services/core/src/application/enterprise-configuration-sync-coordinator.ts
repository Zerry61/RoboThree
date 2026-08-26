import type { EnterprisePackageReference } from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type {
  EnterpriseIdentityScope,
} from "../ports/enterprise-access-token-provider.js";
import {
  EnterpriseConfigurationClientError,
  type EnterpriseConfigurationClient,
  type EnterpriseConfigurationReadOperation,
} from "../ports/enterprise-configuration-client.js";
import type {
  EnterpriseConfigurationCandidate,
  EnterpriseConfigurationPersistence,
  EnterpriseConfigurationPersistenceError,
} from "../ports/enterprise-configuration-persistence.js";
import {
  type ConfigurationValidator,
  EnterpriseConfigurationValidationError,
  canonicalJson,
} from "./configuration-validator.js";
import {
  type ActivatedEnterpriseConfiguration,
  type ValidatedConfigurationSnapshot,
  type ValidatedEnterprisePackage,
} from "./enterprise-configuration-types.js";
import {
  PackageMaterializer,
  candidateIdentity,
} from "./package-materializer.js";

export type EnterpriseConfigurationSyncOptions = Readonly<{
  packageDownloadConcurrency: number;
}>;

export type EnterpriseConfigurationSyncResult =
  | Readonly<{
    ok: true;
    outcome: "activated" | "not_modified";
    active: ActivatedEnterpriseConfiguration;
  }>
  | Readonly<{
    ok: false;
    errorCode: string;
  }>;

export class EnterpriseConfigurationSyncCoordinator {
  readonly #client: EnterpriseConfigurationClient;
  readonly #validator: ConfigurationValidator;
  readonly #materializer: PackageMaterializer;
  readonly #persistence: EnterpriseConfigurationPersistence;
  readonly #clock: Clock;
  readonly #concurrency: number;
  readonly #mailboxes = new Map<string, Promise<void>>();

  constructor(input: {
    client: EnterpriseConfigurationClient;
    validator: ConfigurationValidator;
    persistence: EnterpriseConfigurationPersistence;
    clock: Clock;
    materializer?: PackageMaterializer;
    options?: EnterpriseConfigurationSyncOptions;
  }) {
    this.#client = input.client;
    this.#validator = input.validator;
    this.#persistence = input.persistence;
    this.#clock = input.clock;
    this.#materializer = input.materializer ?? new PackageMaterializer();
    this.#concurrency = validateConcurrency(
      input.options?.packageDownloadConcurrency ?? 1,
    );
  }

  sync(input: {
    scope: EnterpriseIdentityScope;
    signal?: AbortSignal;
  }): Promise<EnterpriseConfigurationSyncResult> {
    return this.#enqueue(input.scope, () => this.#syncSerialized(input));
  }

  async #syncSerialized(input: {
    scope: EnterpriseIdentityScope;
    signal?: AbortSignal;
  }): Promise<EnterpriseConfigurationSyncResult> {
    try {
      const operation = this.#client.beginRead(input.scope);
      const active = await this.#persistence.loadActive(input.scope);
      const conditionalEtag = active?.configuration.snapshotEtag;
      let snapshotResponse = await operation.readSnapshot({
        ...(conditionalEtag === undefined
          ? {}
          : { ifNoneMatch: conditionalEtag }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      if (snapshotResponse.status === "not_modified") {
        if (active !== undefined && this.#isValidActive(active)) {
          await operation.assertReadyToSeal();
          await this.#recordSuccess(input.scope);
          return { ok: true, outcome: "not_modified", active };
        }
        snapshotResponse = await operation.readSnapshot({
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
        if (snapshotResponse.status === "not_modified") {
          throw new EnterpriseConfigurationClientError(
            "configuration.client_protocol_invalid",
            "unconditional configuration read returned not modified",
          );
        }
      }
      const snapshot = this.#validator.validateSnapshot({
        rawJson: snapshotResponse.rawJson,
        etag: snapshotResponse.etag,
      });
      const identity = candidateIdentity(input.scope, snapshot);
      let begun = await this.#persistence.beginOrResumeCandidate({
        identity,
        snapshot,
        createdAt: this.#clock.now(),
      });
      if (!begun.ok) throw new PersistenceOperationError(begun.error);
      try {
        this.#validateResumedCandidate(begun.value, snapshot);
      } catch (error) {
        if (begun.value.status !== "staging") throw error;
        const discarded = await this.#persistence.discardUnsealedCandidate(
          identity.candidateKey,
          input.scope,
        );
        if (!discarded.ok) {
          throw new PersistenceOperationError(discarded.error);
        }
        begun = await this.#persistence.beginOrResumeCandidate({
          identity,
          snapshot,
          createdAt: this.#clock.now(),
        });
        if (!begun.ok) throw new PersistenceOperationError(begun.error);
      }
      const staged = new Map(
        begun.value.packages.map((item) => [
          packageKey(item.reference),
          item,
        ]),
      );
      const references = [
        ...snapshot.document.agents,
        ...snapshot.document.skills,
      ];
      const packages = await mapBounded(
        references,
        this.#concurrency,
        async (reference) => {
          const existing = staged.get(packageKey(reference));
          if (existing !== undefined
            && existing.reference.revision === reference.revision
            && existing.reference.digest === reference.digest) {
            return existing;
          }
          const downloaded = await this.#readExactPackage({
            operation,
            snapshot,
            reference,
            active,
            signal: input.signal,
          });
          const stored = await this.#persistence.storeValidatedPackage({
            candidateKey: identity.candidateKey,
            scope: input.scope,
            package: downloaded,
          });
          if (!stored.ok) throw new PersistenceOperationError(stored.error);
          return downloaded;
        },
      );
      await operation.assertReadyToSeal();
      const configuration = this.#materializer.materialize({
        scope: input.scope,
        snapshot,
        packages,
        sealedAt: this.#clock.now(),
      });
      const sealed = await this.#persistence.sealCandidate({
        candidateKey: identity.candidateKey,
        scope: input.scope,
        configuration,
      });
      if (!sealed.ok) throw new PersistenceOperationError(sealed.error);
      const activated = await this.#persistence.activateSealedCandidate({
        candidateKey: identity.candidateKey,
        scope: input.scope,
        ...(active === undefined
          ? {}
          : {
            expectedActiveRevision:
              active.configuration.identity.snapshotRevision,
          }),
        activatedAt: this.#clock.now(),
      });
      if (!activated.ok) throw new PersistenceOperationError(activated.error);
      await this.#recordSuccess(input.scope);
      return {
        ok: true,
        outcome: "activated",
        active: activated.value,
      };
    } catch (error) {
      const errorCode = safeErrorCode(error);
      try {
        const recorded = await this.#persistence.recordSyncOutcome({
          scope: input.scope,
          outcome: "failed",
          errorCode,
          occurredAt: this.#clock.now(),
        });
        return {
          ok: false,
          errorCode: recorded.ok
            ? errorCode
            : recorded.error.code,
        };
      } catch {
        return { ok: false, errorCode };
      }
    }
  }

  async #readExactPackage(input: {
    operation: EnterpriseConfigurationReadOperation;
    snapshot: ValidatedConfigurationSnapshot;
    reference: EnterprisePackageReference;
    active: ActivatedEnterpriseConfiguration | undefined;
    signal: AbortSignal | undefined;
  }): Promise<ValidatedEnterprisePackage> {
    const cached = input.active?.configuration.packages.find((item) =>
      item.reference.kind === input.reference.kind
      && item.reference.packageId === input.reference.packageId
      && item.reference.revision === input.reference.revision
      && item.reference.digest === input.reference.digest);
    let response = await input.operation.readPackage({
      snapshotId: input.snapshot.document.snapshotId,
      snapshotRevision: input.snapshot.document.revision,
      snapshotDigest: input.snapshot.document.digest,
      reference: input.reference,
      ...(cached?.etag === undefined ? {} : { ifNoneMatch: cached.etag }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    if (response.status === "not_modified") {
      if (cached !== undefined) {
        return this.#validator.validatePackage({
          rawJson: canonicalJson(cached.document),
          expected: input.reference,
          ...(cached.etag === undefined ? {} : { etag: cached.etag }),
        });
      }
      response = await input.operation.readPackage({
        snapshotId: input.snapshot.document.snapshotId,
        snapshotRevision: input.snapshot.document.revision,
        snapshotDigest: input.snapshot.document.digest,
        reference: input.reference,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      if (response.status === "not_modified") {
        throw new EnterpriseConfigurationClientError(
          "configuration.client_protocol_invalid",
          "unconditional package read returned not modified",
        );
      }
    }
    return this.#validator.validatePackage({
      rawJson: response.rawJson,
      expected: input.reference,
      etag: response.etag,
    });
  }

  #isValidActive(active: ActivatedEnterpriseConfiguration): boolean {
    try {
      const snapshot = this.#validator.validateSnapshot({
        rawJson: canonicalJson(active.configuration.snapshot),
        ...(active.configuration.snapshotEtag === undefined
          ? {}
          : { etag: active.configuration.snapshotEtag }),
      });
      const packages = active.configuration.packages.map((item) =>
        this.#validator.validatePackage({
          rawJson: canonicalJson(item.document),
          expected: item.reference,
          ...(item.etag === undefined ? {} : { etag: item.etag }),
        }));
      const rebuilt = this.#materializer.materialize({
        scope: active.configuration.identity.scope,
        snapshot,
        packages,
        sealedAt: active.configuration.sealedAt,
      });
      return rebuilt.identity.candidateKey
          === active.configuration.identity.candidateKey
        && rebuilt.materializationDigest
          === active.configuration.materializationDigest;
    } catch {
      return false;
    }
  }

  #validateResumedCandidate(
    candidate: EnterpriseConfigurationCandidate,
    expectedSnapshot: ValidatedConfigurationSnapshot,
  ): void {
    const validatedSnapshot = this.#validator.validateSnapshot({
      rawJson: canonicalJson(candidate.snapshot.document),
      ...(candidate.snapshot.etag === undefined
        ? {}
        : { etag: candidate.snapshot.etag }),
    });
    if (
      validatedSnapshot.document.snapshotId
        !== expectedSnapshot.document.snapshotId
      || validatedSnapshot.document.revision
        !== expectedSnapshot.document.revision
      || validatedSnapshot.document.digest
        !== expectedSnapshot.document.digest
    ) {
      throw new EnterpriseConfigurationValidationError(
        "configuration.reference_mismatch",
        "staged candidate snapshot no longer matches the exact response",
      );
    }
    for (const item of candidate.packages) {
      const expected = [
        ...expectedSnapshot.document.agents,
        ...expectedSnapshot.document.skills,
      ].find((reference) =>
        reference.kind === item.reference.kind
        && reference.packageId === item.reference.packageId);
      if (expected === undefined) {
        throw new EnterpriseConfigurationValidationError(
          "configuration.reference_mismatch",
          "staged candidate contains an unreferenced package",
        );
      }
      this.#validator.validatePackage({
        rawJson: canonicalJson(item.document),
        expected,
        ...(item.etag === undefined ? {} : { etag: item.etag }),
      });
    }
  }

  async #recordSuccess(scope: EnterpriseIdentityScope): Promise<void> {
    const recorded = await this.#persistence.recordSyncOutcome({
      scope,
      outcome: "succeeded",
      occurredAt: this.#clock.now(),
    });
    if (!recorded.ok) throw new PersistenceOperationError(recorded.error);
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
      if (this.#mailboxes.get(key) === tail) this.#mailboxes.delete(key);
    }
  }
}

class PersistenceOperationError extends Error {
  readonly persistenceError: EnterpriseConfigurationPersistenceError;

  constructor(error: EnterpriseConfigurationPersistenceError) {
    super(error.message);
    this.name = "PersistenceOperationError";
    this.persistenceError = error;
  }
}

async function mapBounded<T, U>(
  input: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>,
): Promise<readonly U[]> {
  const output = new Array<U>(input.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      if (index >= input.length) return;
      next += 1;
      output[index] = await mapper(input[index]!);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(input.length, 1)) },
      worker,
    ),
  );
  return output;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof EnterpriseConfigurationClientError) return error.code;
  if (error instanceof EnterpriseConfigurationValidationError) return error.code;
  if (error instanceof PersistenceOperationError) {
    return error.persistenceError.code;
  }
  return "configuration.sync_failed";
}

function validateConcurrency(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 8) {
    throw new Error("packageDownloadConcurrency must be between 1 and 8");
  }
  return value;
}

function packageKey(reference: EnterprisePackageReference): string {
  return `${reference.kind}:${reference.packageId}`;
}

function scopeKey(scope: EnterpriseIdentityScope): string {
  return [
    scope.enterpriseId,
    scope.userId,
    scope.deviceId,
    scope.clientInstanceId,
  ].map((part) => `${part.length}:${part}`).join("|");
}
