import { createHash } from "node:crypto";

import {
  EnterpriseConfigurationSnapshotConsumerSchema,
  EnterprisePackageDocumentConsumerSchema,
  JsonValueSchema,
  canonicalJsonStringify,
  type EnterpriseConfigurationSnapshot,
  type EnterprisePackageDocument,
  type EnterprisePackageReference,
} from "@robothree/contracts";

import type {
  ValidatedConfigurationSnapshot,
  ValidatedEnterprisePackage,
} from "./enterprise-configuration-types.js";

export const ENTERPRISE_CONFIGURATION_LIMITS = Object.freeze({
  snapshotBytes: 2 * 1024 * 1024,
  packageDocumentBytes: 4 * 1024 * 1024,
  packageFileBytes: 512 * 1024,
  packagePathBytes: 512,
  filesPerPackage: 256,
  agentPackages: 128,
  skillPackages: 256,
  materializedBytes: 64 * 1024 * 1024,
});

export type EnterpriseConfigurationValidationErrorCode =
  | "configuration.compatibility_failed"
  | "configuration.document_too_large"
  | "configuration.invalid_json"
  | "configuration.schema_invalid"
  | "configuration.digest_mismatch"
  | "configuration.kind_mismatch"
  | "configuration.duplicate_reference"
  | "configuration.path_invalid"
  | "configuration.reference_mismatch";

export class EnterpriseConfigurationValidationError extends Error {
  readonly code: EnterpriseConfigurationValidationErrorCode;

  constructor(
    code: EnterpriseConfigurationValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EnterpriseConfigurationValidationError";
    this.code = code;
  }
}

export type EnterpriseConfigurationCompatibility = Readonly<{
  desktopVersion: string;
  coreVersion: string;
  supportsContractVersion(version: string): boolean;
  isDesktopCompatible(minimumVersion: string): boolean;
  isCoreCompatible(minimumVersion: string): boolean;
}>;

export class ConfigurationValidator {
  readonly #compatibility: EnterpriseConfigurationCompatibility;

  constructor(compatibility: EnterpriseConfigurationCompatibility) {
    this.#compatibility = compatibility;
  }

  validateSnapshot(input: {
    rawJson: string;
    etag?: string;
  }): ValidatedConfigurationSnapshot {
    this.#assertContractCompatibility();
    const byteLength = utf8Bytes(input.rawJson);
    if (byteLength > ENTERPRISE_CONFIGURATION_LIMITS.snapshotBytes) {
      throw validationFailure(
        "configuration.document_too_large",
        "enterprise configuration snapshot exceeds the byte limit",
      );
    }
    const parsed = parseJson(input.rawJson);
    const result = EnterpriseConfigurationSnapshotConsumerSchema.safeParse(parsed);
    if (!result.success) {
      throw validationFailure(
        "configuration.schema_invalid",
        "enterprise configuration snapshot does not match the consumer contract",
      );
    }
    this.#assertCompatibility(result.data);
    assertDescriptorKinds(result.data);
    assertExactReferences(result.data);
    assertCanonicalDigest(result.data, "digest");
    return Object.freeze({
      document: deepFreeze(result.data),
      byteLength,
      ...(input.etag === undefined ? {} : { etag: input.etag }),
    });
  }

  validatePackage(input: {
    rawJson: string;
    expected: EnterprisePackageReference;
    etag?: string;
  }): ValidatedEnterprisePackage {
    const byteLength = utf8Bytes(input.rawJson);
    if (byteLength > ENTERPRISE_CONFIGURATION_LIMITS.packageDocumentBytes) {
      throw validationFailure(
        "configuration.document_too_large",
        "enterprise package document exceeds the byte limit",
      );
    }
    const parsed = parseJson(input.rawJson);
    const result = EnterprisePackageDocumentConsumerSchema.safeParse(parsed);
    if (!result.success) {
      throw validationFailure(
        "configuration.schema_invalid",
        "enterprise package document does not match the consumer contract",
      );
    }
    assertPackagePathsAndDigests(result.data);
    assertCanonicalDigest(result.data, "packageDigest");
    if (
      result.data.packageId !== input.expected.packageId
      || result.data.kind !== input.expected.kind
      || result.data.revision !== input.expected.revision
      || result.data.packageDigest !== input.expected.digest
    ) {
      throw validationFailure(
        "configuration.reference_mismatch",
        "enterprise package does not match the exact snapshot reference",
      );
    }
    return Object.freeze({
      reference: deepFreeze(input.expected),
      document: deepFreeze(result.data),
      byteLength,
      ...(input.etag === undefined ? {} : { etag: input.etag }),
    });
  }

  #assertCompatibility(snapshot: EnterpriseConfigurationSnapshot): void {
    if (
      !this.#compatibility.supportsContractVersion(snapshot.contractVersion)
      || !this.#compatibility.supportsContractVersion(snapshot.schemaVersion)
      || !this.#compatibility.isDesktopCompatible(snapshot.minimumDesktopVersion)
      || !this.#compatibility.isCoreCompatible(snapshot.minimumCoreVersion)
    ) {
      throw validationFailure(
        "configuration.compatibility_failed",
        "enterprise configuration is not compatible with this client",
      );
    }
  }

  #assertContractCompatibility(): void {
    if (!this.#compatibility.supportsContractVersion("v1alpha1")) {
      throw validationFailure(
        "configuration.compatibility_failed",
        "enterprise configuration contract is not supported by this client",
      );
    }
  }
}

export function rawSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function canonicalJson(value: unknown): string {
  return canonicalJsonStringify(JsonValueSchema.parse(value));
}

export function canonicalDigestWithout(
  value: Readonly<Record<string, unknown>>,
  digestField: string,
): string {
  const copy = { ...value };
  delete copy[digestField];
  return rawSha256(canonicalJson(copy));
}

function assertCanonicalDigest(
  value: Readonly<Record<string, unknown>>,
  digestField: string,
): void {
  if (value[digestField] !== canonicalDigestWithout(value, digestField)) {
    throw validationFailure(
      "configuration.digest_mismatch",
      "enterprise configuration canonical digest does not match",
    );
  }
}

function assertDescriptorKinds(snapshot: EnterpriseConfigurationSnapshot): void {
  for (const [expectedKind, descriptors] of [
    ["model", snapshot.models],
    ["tool", snapshot.tools],
    ["knowledge", snapshot.knowledge],
  ] as const) {
    if (descriptors.some((descriptor) => descriptor.kind !== expectedKind)) {
      throw validationFailure(
        "configuration.kind_mismatch",
        "enterprise descriptor appears in the wrong snapshot partition",
      );
    }
  }
  if (snapshot.agents.some((reference) => reference.kind !== "agent")
    || snapshot.skills.some((reference) => reference.kind !== "skill")) {
    throw validationFailure(
      "configuration.kind_mismatch",
      "enterprise package reference appears in the wrong snapshot partition",
    );
  }
}

function assertExactReferences(snapshot: EnterpriseConfigurationSnapshot): void {
  const keys = new Set<string>();
  for (const reference of [...snapshot.agents, ...snapshot.skills]) {
    const key = `${reference.kind}:${reference.packageId}`;
    if (keys.has(key)) {
      throw validationFailure(
        "configuration.duplicate_reference",
        "enterprise snapshot contains a duplicate package reference",
      );
    }
    keys.add(key);
  }
}

function assertPackagePathsAndDigests(document: EnterprisePackageDocument): void {
  const paths = new Set<string>();
  for (const file of document.files) {
    if (
      utf8Bytes(file.relativePath) > ENTERPRISE_CONFIGURATION_LIMITS.packagePathBytes
      || utf8Bytes(file.utf8Content) > ENTERPRISE_CONFIGURATION_LIMITS.packageFileBytes
      || file.relativePath.startsWith("/")
      || file.relativePath.split("/").includes("..")
    ) {
      throw validationFailure(
        "configuration.path_invalid",
        "enterprise package file violates the bounded relative-path contract",
      );
    }
    if (paths.has(file.relativePath)) {
      throw validationFailure(
        "configuration.path_invalid",
        "enterprise package contains a duplicate file path",
      );
    }
    paths.add(file.relativePath);
    if (rawSha256(file.utf8Content) !== file.contentDigest) {
      throw validationFailure(
        "configuration.digest_mismatch",
        "enterprise package file digest does not match",
      );
    }
  }
}

function parseJson(rawJson: string): unknown {
  try {
    return JSON.parse(rawJson) as unknown;
  } catch {
    throw validationFailure(
      "configuration.invalid_json",
      "enterprise configuration response is not valid JSON",
    );
  }
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function validationFailure(
  code: EnterpriseConfigurationValidationErrorCode,
  message: string,
): EnterpriseConfigurationValidationError {
  return new EnterpriseConfigurationValidationError(code, message);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}
