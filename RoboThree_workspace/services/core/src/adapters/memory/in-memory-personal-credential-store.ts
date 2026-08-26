import { timingSafeEqual } from "node:crypto";

import { EntityIdSchema } from "@robothree/contracts";

import {
  PersonalCredentialObservationSchema,
  calculateCredentialBindingDigest,
  type PersonalCredentialObservation,
} from "../../application/personal-model-domain.js";
import type {
  PersonalCredentialStore,
  PersonalCredentialStoreErrorCode,
  PersonalCredentialStoreResult,
} from "../../ports/personal-credential-store.js";

type CredentialItem = Readonly<{
  operationId: string;
  credentialRef: string;
  revision: number;
  bindingDigest: string;
  bytes: Uint8Array;
}>;

type SimulatedUnavailableCode = Extract<PersonalCredentialStoreErrorCode,
  "credential_store_unavailable" | "credential_store_locked" |
  "credential_store_access_denied" | "credential_store_internal">;

export class InMemoryPersonalCredentialStore implements PersonalCredentialStore {
  readonly #items = new Map<string, CredentialItem>();
  readonly #operations = new Map<string, Readonly<{ kind: "store" | "replace" | "delete"; target: string }>>();
  #started = false;
  #unavailableCode: SimulatedUnavailableCode | undefined;
  #nextDeleteUncertain = false;

  public async start(): Promise<void> { this.#started = true; }

  public async stop(): Promise<void> {
    for (const item of this.#items.values()) item.bytes.fill(0);
    this.#items.clear();
    this.#operations.clear();
    this.#started = false;
  }

  public setUnavailable(
    code: SimulatedUnavailableCode | undefined,
  ): void {
    this.#unavailableCode = code;
  }

  public makeNextDeleteUncertain(): void {
    this.#nextDeleteUncertain = true;
  }

  public async store(
    operationId: string,
    credentialRef: string,
    secret: Uint8Array,
  ): Promise<PersonalCredentialStoreResult<PersonalCredentialObservation>> {
    this.#requireStarted();
    const unavailable = this.#failureIfUnavailable<PersonalCredentialObservation>();
    if (unavailable !== undefined) return unavailable;
    EntityIdSchema.parse(operationId);
    requireSecret(secret);
    const replay = this.#operations.get(operationId);
    if (replay !== undefined) {
      const item = this.#items.get(credentialRef);
      return replay.kind === "store" && replay.target === credentialRef
        && item !== undefined && sameBytes(item.bytes, secret)
        ? success(await this.inspect(credentialRef), true)
        : failure("credential_input_already_bound", "Credential operation already binds another input");
    }
    if (this.#items.has(credentialRef)) {
      return failure("credential_store_conflict", "Credential reference already exists");
    }
    const item = itemFor(operationId, credentialRef, 1, secret);
    this.#items.set(credentialRef, item);
    this.#operations.set(operationId, { kind: "store", target: credentialRef });
    return success(observation(item), false);
  }

  public async replace(
    operationId: string,
    oldCredentialRef: string,
    newCredentialRef: string,
    secret: Uint8Array,
  ): Promise<PersonalCredentialStoreResult<PersonalCredentialObservation>> {
    this.#requireStarted();
    const unavailable = this.#failureIfUnavailable<PersonalCredentialObservation>();
    if (unavailable !== undefined) return unavailable;
    EntityIdSchema.parse(operationId);
    requireSecret(secret);
    const replay = this.#operations.get(operationId);
    if (replay !== undefined) {
      const item = this.#items.get(newCredentialRef);
      return replay.kind === "replace" && replay.target === newCredentialRef
        && item !== undefined && sameBytes(item.bytes, secret)
        ? success(await this.inspect(newCredentialRef), true)
        : failure("credential_input_already_bound", "Credential operation already binds another input");
    }
    const oldItem = this.#items.get(oldCredentialRef);
    if (oldItem === undefined) {
      return failure("credential_store_not_found", "Credential to replace does not exist");
    }
    if (this.#items.has(newCredentialRef)) {
      return failure("credential_store_conflict", "Replacement Credential reference already exists");
    }
    const item = itemFor(operationId, newCredentialRef, oldItem.revision + 1, secret);
    this.#items.set(newCredentialRef, item);
    this.#operations.set(operationId, { kind: "replace", target: newCredentialRef });
    return success(observation(item), false);
  }

  public async inspect(credentialRef: string): Promise<PersonalCredentialObservation> {
    this.#requireStarted();
    if (this.#unavailableCode !== undefined) {
      return PersonalCredentialObservationSchema.parse({
        state: "unavailable",
        credentialRef,
        errorCode: this.#unavailableCode,
      });
    }
    const item = this.#items.get(credentialRef);
    return item === undefined
      ? PersonalCredentialObservationSchema.parse({ state: "absent", credentialRef })
      : observation(item);
  }

  public async resolve(
    credentialRef: string,
  ): Promise<PersonalCredentialStoreResult<Uint8Array>> {
    this.#requireStarted();
    const unavailable = this.#failureIfUnavailable<Uint8Array>();
    if (unavailable !== undefined) return unavailable;
    const item = this.#items.get(credentialRef);
    return item === undefined
      ? failure("credential_store_not_found", "Credential does not exist")
      : success(Uint8Array.from(item.bytes), false);
  }

  public async delete(
    operationId: string,
    credentialRef: string,
  ): Promise<PersonalCredentialStoreResult<PersonalCredentialObservation>> {
    this.#requireStarted();
    const unavailable = this.#failureIfUnavailable<PersonalCredentialObservation>();
    if (unavailable !== undefined) return unavailable;
    EntityIdSchema.parse(operationId);
    if (this.#nextDeleteUncertain) {
      this.#nextDeleteUncertain = false;
      return failure("credential_delete_uncertain", "Credential delete outcome is uncertain");
    }
    const replay = this.#operations.get(operationId);
    if (replay !== undefined) {
      return replay.kind === "delete" && replay.target === credentialRef
        ? success(PersonalCredentialObservationSchema.parse({ state: "absent", credentialRef }), true)
        : failure("credential_store_conflict", "Credential delete operation targets another reference");
    }
    const existing = this.#items.get(credentialRef);
    existing?.bytes.fill(0);
    this.#items.delete(credentialRef);
    this.#operations.set(operationId, { kind: "delete", target: credentialRef });
    return success(PersonalCredentialObservationSchema.parse({ state: "absent", credentialRef }), false);
  }

  #failureIfUnavailable<T>(): PersonalCredentialStoreResult<T> | undefined {
    return this.#unavailableCode === undefined
      ? undefined
      : failure(this.#unavailableCode, "Credential Store is unavailable");
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("Personal Credential Store is not started");
  }
}

function itemFor(
  operationId: string,
  credentialRef: string,
  revision: number,
  secret: Uint8Array,
): CredentialItem {
  return {
    operationId,
    credentialRef,
    revision,
    bindingDigest: calculateCredentialBindingDigest({
      credentialRef,
      createdByOperationId: operationId,
      credentialRevision: revision,
    }),
    bytes: Uint8Array.from(secret),
  };
}

function observation(item: CredentialItem): PersonalCredentialObservation {
  return PersonalCredentialObservationSchema.parse({
    state: "present",
    credentialRef: item.credentialRef,
    createdByOperationId: item.operationId,
    credentialRevision: item.revision,
    credentialBindingDigest: item.bindingDigest,
  });
}

function requireSecret(value: Uint8Array): void {
  if (value.byteLength === 0 || value.byteLength > 16_384) {
    throw new Error("Fake Credential bytes must be bounded and non-empty");
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function success<T>(value: T, replayed: boolean): PersonalCredentialStoreResult<T> {
  return { ok: true, replayed, value };
}

function failure<T>(
  code: PersonalCredentialStoreErrorCode,
  message: string,
): PersonalCredentialStoreResult<T> {
  return { ok: false, error: { code, message } };
}
