import {
  JsonValueSchema,
  type TaskCapabilityLock,
} from "@robothree/contracts";

import { sha256CanonicalJson } from "../persistence/digest.js";

const PROFILE_PREFIX = "model-capability-profile:v1";
const LEGACY_MAX_OUTPUT_TOKENS = 1_024;
const MIN_CONTEXT_WINDOW_TOKENS = 8_192;
const MAX_CONTEXT_WINDOW_TOKENS = 1_048_576;
const MAX_OUTPUT_TOKENS = 262_144;

export type ExactModelCapabilityProfile = Readonly<{
  schemaVersion: "v1";
  capabilityId: string;
  modelFamily: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  capabilityProfileRevision: string;
  source: "exact_configuration_ref" | "legacy_task_lock";
}>;

export class ExactModelCapabilityProfileError extends Error {
  public readonly code:
    | "model.capability_profile_invalid"
    | "model.capability_profile_unavailable";

  public constructor(
    code: ExactModelCapabilityProfileError["code"],
    message: string,
  ) {
    super(message);
    this.name = "ExactModelCapabilityProfileError";
    this.code = code;
  }
}

export function createExactModelCapabilityProfile(input: Readonly<{
  capabilityId: string;
  modelFamily: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
}>): ExactModelCapabilityProfile {
  validateMaterial(input);
  const material = Object.freeze({
    schemaVersion: "v1" as const,
    capabilityId: input.capabilityId,
    modelFamily: input.modelFamily,
    contextWindowTokens: input.contextWindowTokens,
    maxOutputTokens: input.maxOutputTokens,
  });
  return Object.freeze({
    ...material,
    capabilityProfileRevision: sha256CanonicalJson(JsonValueSchema.parse(material)),
    source: "exact_configuration_ref" as const,
  });
}

export function encodeExactModelCapabilityProfile(
  profile: ExactModelCapabilityProfile,
): string {
  const exact = createExactModelCapabilityProfile(profile);
  if (profile.capabilityProfileRevision !== exact.capabilityProfileRevision) {
    throw invalid("Model capability profile revision does not match its material");
  }
  return [
    PROFILE_PREFIX,
    String(exact.contextWindowTokens),
    String(exact.maxOutputTokens),
    exact.capabilityProfileRevision.slice("sha256:".length),
  ].join("/");
}

export function resolveExactModelCapabilityProfile(
  lock: TaskCapabilityLock,
  options: Readonly<{ allowLegacyTaskLock?: boolean }> = {},
): ExactModelCapabilityProfile {
  if (lock.definitionSnapshot.kind !== "model") {
    throw invalid("Exact Model capability profile requires a Model lock");
  }
  const descriptorRef = lock.adapterDescriptorSnapshot.configurationRef;
  const bindingRef = lock.bindingSnapshot.configurationRef;
  if (descriptorRef === undefined || bindingRef === undefined) {
    return legacyOrUnavailable(lock, options.allowLegacyTaskLock === true);
  }
  if (descriptorRef !== bindingRef) {
    throw invalid("Model capability profile references do not match");
  }
  if (!descriptorRef.startsWith(`${PROFILE_PREFIX}/`)) {
    return legacyOrUnavailable(lock, options.allowLegacyTaskLock === true);
  }
  const parts = descriptorRef.split("/");
  if (parts.length !== 4 || parts[0] !== PROFILE_PREFIX) {
    throw invalid("Model capability profile reference is malformed");
  }
  const contextWindowTokens = parsePositiveInteger(parts[1]);
  const maxOutputTokens = parsePositiveInteger(parts[2]);
  const revision = `sha256:${parts[3] ?? ""}`;
  const profile = createExactModelCapabilityProfile({
    capabilityId: lock.definitionSnapshot.capabilityId,
    modelFamily: lock.definitionSnapshot.model.family,
    contextWindowTokens,
    maxOutputTokens,
  });
  if (
    revision !== profile.capabilityProfileRevision
    || lock.definitionSnapshot.model.contextWindow !== contextWindowTokens
  ) {
    throw invalid("Model capability profile does not match the exact Task lock");
  }
  return profile;
}

function legacyOrUnavailable(
  lock: Extract<TaskCapabilityLock, { definitionSnapshot: { kind: "model" } }>
    | TaskCapabilityLock,
  allowed: boolean,
): ExactModelCapabilityProfile {
  if (!allowed) {
    throw new ExactModelCapabilityProfileError(
      "model.capability_profile_unavailable",
      "New Tasks require an exact Model context and output capability profile",
    );
  }
  if (lock.definitionSnapshot.kind !== "model") {
    throw invalid("Legacy capability fallback requires a Model lock");
  }
  const contextWindowTokens = lock.definitionSnapshot.model.contextWindow;
  if (contextWindowTokens === undefined) {
    throw new ExactModelCapabilityProfileError(
      "model.capability_profile_unavailable",
      "Historical Task lock has no readable Model context window",
    );
  }
  const material = Object.freeze({
    schemaVersion: "legacy_task_lock" as const,
    capabilityId: lock.definitionSnapshot.capabilityId,
    capabilityRevision: lock.definitionSnapshot.revision,
    modelFamily: lock.definitionSnapshot.model.family,
    contextWindowTokens,
    maxOutputTokens: LEGACY_MAX_OUTPUT_TOKENS,
  });
  return Object.freeze({
    schemaVersion: "v1" as const,
    capabilityId: material.capabilityId,
    modelFamily: material.modelFamily,
    contextWindowTokens: material.contextWindowTokens,
    maxOutputTokens: material.maxOutputTokens,
    capabilityProfileRevision: sha256CanonicalJson(JsonValueSchema.parse(material)),
    source: "legacy_task_lock" as const,
  });
}

function validateMaterial(input: Readonly<{
  capabilityId: string;
  modelFamily: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
}>): void {
  if (!input.capabilityId.startsWith("model.")) {
    throw invalid("Model capability profile requires a Model capability id");
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(input.modelFamily)) {
    throw invalid("Model capability profile requires an exact Provider family");
  }
  if (
    !Number.isSafeInteger(input.contextWindowTokens)
    || input.contextWindowTokens < MIN_CONTEXT_WINDOW_TOKENS
    || input.contextWindowTokens > MAX_CONTEXT_WINDOW_TOKENS
    || !Number.isSafeInteger(input.maxOutputTokens)
    || input.maxOutputTokens < 256
    || input.maxOutputTokens > MAX_OUTPUT_TOKENS
    || input.maxOutputTokens > input.contextWindowTokens
  ) {
    throw invalid("Model context or output capability is outside its safe range");
  }
}

function parsePositiveInteger(value: string | undefined): number {
  if (value === undefined || !/^\d+$/u.test(value)) {
    throw invalid("Model capability profile contains a non-integer limit");
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw invalid("Model capability profile contains an invalid limit");
  }
  return parsed;
}

function invalid(message: string): ExactModelCapabilityProfileError {
  return new ExactModelCapabilityProfileError(
    "model.capability_profile_invalid",
    message,
  );
}

export const ExactModelCapabilityProfileConstants = Object.freeze({
  profilePrefix: PROFILE_PREFIX,
  legacyMaxOutputTokens: LEGACY_MAX_OUTPUT_TOKENS,
  minContextWindowTokens: MIN_CONTEXT_WINDOW_TOKENS,
  maxContextWindowTokens: MAX_CONTEXT_WINDOW_TOKENS,
  maxOutputTokens: MAX_OUTPUT_TOKENS,
});
