import {
  EntityIdSchema,
  JsonValueSchema,
  NamespacedResourceIdSchema,
  Sha256DigestSchema,
  TimestampSchema,
  type Sha256Digest,
} from "@robothree/contracts";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";
import { DynamicRequestFactsV1Schema } from "./dynamic-request-facts.js";

export const LocalPersonalModelInvocationKindSchema = z.enum([
  "assistant_message",
  "compaction_summary",
]);
export const LocalPersonalModelInvocationStatusSchema = z.enum([
  "accepted",
  "dispatching",
  "output_started",
  "terminal",
  "recovery_exhausted",
]);

const CommonFields = {
  invocationKind: LocalPersonalModelInvocationKindSchema,
  invocationLinkId: EntityIdSchema,
  authorityInvocationId: EntityIdSchema,
  sessionId: EntityIdSchema,
  taskId: EntityIdSchema,
  runId: EntityIdSchema,
  round: z.number().int().nonnegative(),
  taskRuntimeSelectionId: EntityIdSchema,
  taskRuntimeSelectionDigest: Sha256DigestSchema,
  modelLockId: EntityIdSchema,
  modelLockDigest: Sha256DigestSchema,
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
  personalModelId: NamespacedResourceIdSchema,
  configurationRevision: Sha256DigestSchema,
  executionDefinitionDigest: Sha256DigestSchema,
  providerProfileRevision: Sha256DigestSchema,
  endpointIdentityDigest: Sha256DigestSchema,
  credentialBindingDigest: Sha256DigestSchema,
  modelRequestDigest: Sha256DigestSchema,
  admissionScopeDigest: Sha256DigestSchema,
  status: LocalPersonalModelInvocationStatusSchema,
  fencingEpoch: z.number().int().positive(),
  outputStartedAt: TimestampSchema.optional(),
  terminalAt: TimestampSchema.optional(),
  terminalClass: z.enum(["completed", "failed", "cancelled", "timed_out"]).optional(),
  typedErrorCode: z.string().min(3).max(160).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

const LegacyMaterialSchema = z.object({
  schemaVersion: z.literal("v1alpha1"),
  ...CommonFields,
}).strict().superRefine(validateLifecycle);

const V2MaterialSchema = z.object({
  schemaVersion: z.literal("v1alpha2"),
  ...CommonFields,
  dynamicRequestFacts: DynamicRequestFactsV1Schema,
  contextAssemblyReceiptDigest: Sha256DigestSchema,
}).strict().superRefine(validateLifecycle);

export const LegacyLocalPersonalModelInvocationLinkSchema =
  LegacyMaterialSchema.extend({ recordDigest: Sha256DigestSchema })
    .strict().superRefine(validateRecordDigest);
export const LocalPersonalModelInvocationLinkV2Schema =
  V2MaterialSchema.extend({ recordDigest: Sha256DigestSchema })
    .strict().superRefine(validateRecordDigest);

export type LocalPersonalModelInvocationMaterial =
  | z.infer<typeof LegacyMaterialSchema>
  | z.infer<typeof V2MaterialSchema>;
export type LocalPersonalModelInvocationLink =
  | z.infer<typeof LegacyLocalPersonalModelInvocationLinkSchema>
  | z.infer<typeof LocalPersonalModelInvocationLinkV2Schema>;

export const LocalPersonalModelInvocationLinkSchema =
  z.custom<LocalPersonalModelInvocationLink>((value) => {
    try {
      validateLocalPersonalModelInvocationLink(value);
      return true;
    } catch {
      return false;
    }
  }, { message: "Local Personal Model invocation link is invalid" })
    .transform((value) => validateLocalPersonalModelInvocationLink(value));

export function createLocalPersonalModelInvocationLink(
  input: LocalPersonalModelInvocationMaterial,
): LocalPersonalModelInvocationLink {
  const material = validateMaterial(input);
  return validateLocalPersonalModelInvocationLink({
    ...material,
    recordDigest: invocationLinkDigest(material),
  });
}

export function validateLocalPersonalModelInvocationLink(
  input: unknown,
): LocalPersonalModelInvocationLink {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Local Personal Model invocation link must be an object");
  }
  const schemaVersion = (input as Record<string, unknown>).schemaVersion;
  if (schemaVersion === "v1alpha1") {
    return LegacyLocalPersonalModelInvocationLinkSchema.parse(input);
  }
  if (schemaVersion === "v1alpha2") {
    return LocalPersonalModelInvocationLinkV2Schema.parse(input);
  }
  throw new Error("Local Personal Model invocation link schema version is unsupported");
}

export function invocationLinkDigest(
  input: LocalPersonalModelInvocationMaterial,
): Sha256Digest {
  const material = validateMaterial(input);
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: material.schemaVersion === "v1alpha1"
      ? "robothree.local-personal-model.invocation-link.v1"
      : "robothree.local-personal-model.invocation-link.v2",
    material,
  }));
}

function validateMaterial(input: unknown): LocalPersonalModelInvocationMaterial {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Local Personal Model invocation material must be an object");
  }
  const schemaVersion = (input as Record<string, unknown>).schemaVersion;
  if (schemaVersion === "v1alpha1") return LegacyMaterialSchema.parse(input);
  if (schemaVersion === "v1alpha2") return V2MaterialSchema.parse(input);
  throw new Error("Local Personal Model invocation material schema version is unsupported");
}

function validateLifecycle(
  value: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  const isTerminal = value.status === "terminal";
  const exhausted = value.status === "recovery_exhausted";
  if (isTerminal !== (value.terminalClass !== undefined)) {
    context.addIssue({ code: "custom", message: "terminal class must match terminal status" });
  }
  if ((isTerminal || exhausted) !== (value.terminalAt !== undefined)) {
    context.addIssue({ code: "custom", message: "terminal timestamp must match terminal fact" });
  }
  if (!isTerminal && !exhausted && value.typedErrorCode !== undefined) {
    context.addIssue({ code: "custom", message: "nonterminal invocation cannot carry typed error" });
  }
  if (value.status === "output_started" && value.outputStartedAt === undefined) {
    context.addIssue({ code: "custom", message: "output_started requires timestamp" });
  }
  if (exhausted && value.typedErrorCode === undefined) {
    context.addIssue({ code: "custom", message: "recovery_exhausted requires typed error" });
  }
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  if (typeof createdAt === "string" && typeof updatedAt === "string" && updatedAt < createdAt) {
    context.addIssue({ code: "custom", message: "invocation update precedes creation" });
  }
  const outputStartedAt = value.outputStartedAt;
  if (typeof outputStartedAt === "string" && typeof createdAt === "string"
    && typeof updatedAt === "string"
    && (outputStartedAt < createdAt || outputStartedAt > updatedAt)) {
    context.addIssue({ code: "custom", message: "output timestamp is outside invocation lifetime" });
  }
  const terminalAt = value.terminalAt;
  if (typeof terminalAt === "string" && typeof createdAt === "string"
    && typeof updatedAt === "string"
    && (terminalAt < createdAt || terminalAt > updatedAt)) {
    context.addIssue({ code: "custom", message: "terminal timestamp is outside invocation lifetime" });
  }
  if (typeof outputStartedAt === "string" && typeof terminalAt === "string"
    && terminalAt < outputStartedAt) {
    context.addIssue({ code: "custom", message: "terminal timestamp precedes output" });
  }
}

function validateRecordDigest(
  value: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  const { recordDigest, ...material } = value;
  if (recordDigest !== invocationLinkDigest(material as LocalPersonalModelInvocationMaterial)) {
    context.addIssue({ code: "custom", message: "local invocation link digest mismatch" });
  }
}
