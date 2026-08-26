import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";

import {
  SensitiveFrameDecoder,
  encodeSensitiveFrame,
} from "@robothree/contracts/desktop-private/personal-credential-broker-v1";

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
import {
  PERSONAL_CREDENTIAL_HELPER_PROTOCOL_VERSION,
  PersonalCredentialHelperRequestSchema,
  PersonalCredentialHelperResponseSchema,
  type PersonalCredentialHelperRequest,
  type PersonalCredentialHelperResponse,
} from "./personal-credential-helper-protocol.js";
import {
  verifyPersonalCredentialHelperDescriptor,
  type PersonalCredentialHelperDescriptor,
  type VerifiedPersonalCredentialHelper,
} from "./personal-credential-helper-trust.js";

const HELPER_TIMEOUT_MS = 5_000;

export class MacOsKeychainPersonalCredentialStore implements PersonalCredentialStore {
  readonly #descriptor: PersonalCredentialHelperDescriptor | undefined;
  readonly #spawn: typeof spawn;
  #helper: VerifiedPersonalCredentialHelper | undefined;
  #started = false;

  public constructor(input: {
    descriptor?: PersonalCredentialHelperDescriptor;
    dependencies?: { spawn?: typeof spawn };
  } = {}) {
    this.#descriptor = input.descriptor;
    this.#spawn = input.dependencies?.spawn ?? spawn;
  }

  public get productionReady(): boolean {
    return this.#helper?.productionReady === true;
  }

  public async start(): Promise<void> {
    this.#helper = this.#descriptor === undefined
      ? undefined
      : await verifyPersonalCredentialHelperDescriptor(this.#descriptor);
    this.#started = true;
  }

  public async stop(): Promise<void> {
    this.#helper = undefined;
    this.#started = false;
  }

  public async store(
    operationId: string,
    credentialRef: string,
    secret: Uint8Array,
  ): Promise<PersonalCredentialStoreResult<PersonalCredentialObservation>> {
    const binding = calculateCredentialBindingDigest({
      credentialRef,
      createdByOperationId: operationId,
      credentialRevision: 1,
    });
    const result = await this.#invoke({
      operation: "store",
      operationId,
      credentialRef,
      credentialRevision: 1,
      credentialBindingDigest: binding,
    }, secret);
    if (!result.ok && result.code === "uncertain") {
      const observed = await this.inspect(credentialRef);
      return observationMatches(observed, operationId, 1, binding)
        ? { ok: true, replayed: true, value: observed }
        : failure("credential_operation_uncertain");
    }
    return this.#observationResult(result);
  }

  public async replace(
    operationId: string,
    oldCredentialRef: string,
    newCredentialRef: string,
    secret: Uint8Array,
  ): Promise<PersonalCredentialStoreResult<PersonalCredentialObservation>> {
    const previous = await this.inspect(oldCredentialRef);
    if (previous.state === "unavailable") {
      return failure(mapObservationError(previous.errorCode));
    }
    if (previous.state === "absent") return failure("credential_store_not_found");
    const revision = previous.credentialRevision + 1;
    const binding = calculateCredentialBindingDigest({
      credentialRef: newCredentialRef,
      createdByOperationId: operationId,
      credentialRevision: revision,
    });
    const result = await this.#invoke({
      operation: "replace",
      operationId,
      credentialRef: newCredentialRef,
      oldCredentialRef,
      credentialRevision: revision,
      credentialBindingDigest: binding,
    }, secret);
    if (!result.ok && result.code === "uncertain") {
      const observed = await this.inspect(newCredentialRef);
      return observationMatches(observed, operationId, revision, binding)
        ? { ok: true, replayed: true, value: observed }
        : failure("credential_operation_uncertain");
    }
    return this.#observationResult(result);
  }

  public async inspect(credentialRef: string): Promise<PersonalCredentialObservation> {
    const result = await this.#invoke({ operation: "inspect", credentialRef });
    if (!result.ok) {
      if (result.code === "not_found") {
        return PersonalCredentialObservationSchema.parse({ state: "absent", credentialRef });
      }
      return PersonalCredentialObservationSchema.parse({
        state: "unavailable",
        credentialRef,
        errorCode: mapPersonalCredentialHelperErrorCode(result.code),
      });
    }
    return observationFrom(result);
  }

  public async resolve(
    credentialRef: string,
  ): Promise<PersonalCredentialStoreResult<Uint8Array>> {
    const result = await this.#invoke({ operation: "resolve", credentialRef });
    if (!result.ok) return failure(mapPersonalCredentialHelperErrorCode(result.code));
    if (result.secret === undefined || result.secret.byteLength === 0) {
      return failure("credential_store_corrupted");
    }
    return { ok: true, replayed: false, value: result.secret };
  }

  public async delete(
    operationId: string,
    credentialRef: string,
  ): Promise<PersonalCredentialStoreResult<PersonalCredentialObservation>> {
    const result = await this.#invoke({ operation: "delete", operationId, credentialRef });
    if (!result.ok && result.code === "uncertain") {
      const observed = await this.inspect(credentialRef);
      return observed.state === "absent"
        ? { ok: true, replayed: true, value: observed }
        : failure("credential_operation_uncertain");
    }
    if (!result.ok && result.code !== "not_found") {
      return failure(mapPersonalCredentialHelperErrorCode(result.code));
    }
    return {
      ok: true,
      replayed: !result.ok,
      value: PersonalCredentialObservationSchema.parse({ state: "absent", credentialRef }),
    };
  }

  async #invoke(
    material: Omit<PersonalCredentialHelperRequest,
      "protocolVersion" | "secretByteLength" | "testKeychainPath">,
    secret: Uint8Array<ArrayBufferLike> = new Uint8Array(0),
  ): Promise<HelperInvocationResult> {
    this.#requireStarted();
    const helper = this.#helper;
    if (helper === undefined) return { ok: false, code: "unavailable" };
    const body = Uint8Array.from(secret);
    let header: PersonalCredentialHelperRequest;
    try {
      header = PersonalCredentialHelperRequestSchema.parse({
        protocolVersion: PERSONAL_CREDENTIAL_HELPER_PROTOCOL_VERSION,
        ...material,
        ...(helper.testKeychainPath === undefined
          ? {}
          : { testKeychainPath: helper.testKeychainPath }),
        secretByteLength: body.byteLength,
      });
    } catch {
      body.fill(0);
      return { ok: false, code: "invalid_request" };
    }
    const frame = encodeSensitiveFrame(header, body);
    body.fill(0);
    const child = this.#spawn(helper.helperPath, [], {
      env: {},
      stdio: ["pipe", "pipe", "ignore"],
    });
    const decoder = new SensitiveFrameDecoder(PersonalCredentialHelperResponseSchema);
    return new Promise((resolve) => {
      let settled = false;
      let response: HelperInvocationResult | undefined;
      const finish = (value: HelperInvocationResult): void => {
        if (settled) {
          value.secret?.fill(0);
          return;
        }
        settled = true;
        clearTimeout(timer);
        decoder.reset();
        resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        finish({
          ok: false,
          code: isMutation(material.operation) ? "uncertain" : "cancelled",
        });
      }, HELPER_TIMEOUT_MS);
      child.stdout.on("data", (chunk: Uint8Array) => {
        try {
          for (const item of decoder.push(chunk)) {
            if (response !== undefined) {
              item.body.fill(0);
              throw new Error("multiple helper responses");
            }
            response = item.header.ok
              ? {
                ok: true,
                header: item.header,
                ...(item.body.byteLength === 0 ? {} : { secret: item.body }),
              }
              : { ok: false, code: item.header.code };
          }
        } catch {
          child.kill("SIGTERM");
          finish({ ok: false, code: "internal" });
        }
      });
      child.once("error", () => finish({ ok: false, code: "unavailable" }));
      child.once("exit", () => {
        try {
          decoder.finish();
        } catch {
          response?.secret?.fill(0);
          finish({ ok: false, code: "internal" });
          return;
        }
        finish(response ?? {
          ok: false,
          code: isMutation(material.operation) ? "uncertain" : "internal",
        });
      });
      child.stdin.end(frame, () => frame.fill(0));
    });
  }

  #observationResult(
    result: HelperInvocationResult,
  ): PersonalCredentialStoreResult<PersonalCredentialObservation> {
    if (!result.ok) return failure(mapPersonalCredentialHelperErrorCode(result.code));
    return { ok: true, replayed: result.header.replayed, value: observationFrom(result) };
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("Personal Credential Store is not started");
  }
}

type HelperInvocationResult =
  | Readonly<{
    ok: true;
    header: PersonalCredentialHelperResponse;
    secret?: Uint8Array;
  }>
  | Readonly<{
    ok: false;
    code: PersonalCredentialHelperResponse["code"];
    secret?: undefined;
  }>;

function observationFrom(result: Extract<HelperInvocationResult, { ok: true }>): PersonalCredentialObservation {
  const header = result.header;
  if (header.credentialRef === undefined
    || header.createdByOperationId === undefined
    || header.credentialRevision === undefined
    || header.credentialBindingDigest === undefined) {
    result.secret?.fill(0);
    throw new Error("Credential helper omitted binding metadata");
  }
  return PersonalCredentialObservationSchema.parse({
    state: "present",
    credentialRef: header.credentialRef,
    createdByOperationId: header.createdByOperationId,
    credentialRevision: header.credentialRevision,
    credentialBindingDigest: header.credentialBindingDigest,
  });
}

export function mapPersonalCredentialHelperErrorCode(
  code: PersonalCredentialHelperResponse["code"],
): PersonalCredentialStoreErrorCode {
  switch (code) {
    case "unavailable": return "credential_store_unavailable";
    case "locked": return "credential_store_locked";
    case "not_found": return "credential_store_not_found";
    case "access_denied": return "credential_store_access_denied";
    case "corrupted": return "credential_store_corrupted";
    case "cancelled": return "credential_store_cancelled";
    case "conflict": return "credential_store_conflict";
    case "input_already_bound": return "credential_input_already_bound";
    case "uncertain": return "credential_operation_uncertain";
    case "ok":
    case "invalid_request":
    case "internal":
      return "credential_store_internal";
  }
}

function isMutation(operation: PersonalCredentialHelperRequest["operation"]): boolean {
  return operation === "store" || operation === "replace" || operation === "delete";
}

function observationMatches(
  observation: PersonalCredentialObservation,
  operationId: string,
  revision: number,
  bindingDigest: string,
): observation is Extract<PersonalCredentialObservation, { state: "present" }> {
  return observation.state === "present"
    && observation.createdByOperationId === operationId
    && observation.credentialRevision === revision
    && observation.credentialBindingDigest === bindingDigest;
}

function mapObservationError(code: string): PersonalCredentialStoreErrorCode {
  return code === "credential_store_locked"
    || code === "credential_store_access_denied"
    || code === "credential_store_corrupted"
    || code === "credential_store_cancelled"
    || code === "credential_store_unavailable"
    ? code
    : "credential_store_internal";
}

function failure<T>(code: PersonalCredentialStoreErrorCode): PersonalCredentialStoreResult<T> {
  return { ok: false, error: { code, message: safeMessage(code) } };
}

function safeMessage(code: PersonalCredentialStoreErrorCode): string {
  return code === "credential_store_not_found"
    ? "Credential is not available"
    : "Personal Credential Store operation did not complete";
}

export function sameCredentialBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
