import type { PersonalCredentialObservation } from "../application/personal-model-domain.js";

export type PersonalCredentialStoreErrorCode =
  | "credential_store_unavailable"
  | "credential_store_locked"
  | "credential_store_access_denied"
  | "credential_store_corrupted"
  | "credential_store_cancelled"
  | "credential_store_internal"
  | "credential_store_not_found"
  | "credential_store_conflict"
  | "credential_delete_uncertain"
  | "credential_operation_uncertain"
  | "credential_input_already_bound";

export type PersonalCredentialStoreResult<T> =
  | Readonly<{ ok: true; replayed: boolean; value: T }>
  | Readonly<{
    ok: false;
    error: Readonly<{ code: PersonalCredentialStoreErrorCode; message: string }>;
  }>;

export interface PersonalCredentialStore {
  start(): Promise<void>;
  stop(): Promise<void>;
  store(
    operationId: string,
    credentialRef: string,
    secret: Uint8Array,
  ): Promise<PersonalCredentialStoreResult<PersonalCredentialObservation>>;
  replace(
    operationId: string,
    oldCredentialRef: string,
    newCredentialRef: string,
    secret: Uint8Array,
  ): Promise<PersonalCredentialStoreResult<PersonalCredentialObservation>>;
  inspect(credentialRef: string): Promise<PersonalCredentialObservation>;
  resolve(
    credentialRef: string,
  ): Promise<PersonalCredentialStoreResult<Uint8Array>>;
  delete(
    operationId: string,
    credentialRef: string,
  ): Promise<PersonalCredentialStoreResult<PersonalCredentialObservation>>;
}
