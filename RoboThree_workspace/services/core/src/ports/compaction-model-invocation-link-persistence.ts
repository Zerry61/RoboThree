import {
  EntityIdSchema,
  JsonValueSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "@robothree/contracts";
import { z } from "zod";

import { DynamicRequestFactsV1Schema } from
  "../application/dynamic-request-facts.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

const CommonMaterialFields = {
  compactionJobId: EntityIdSchema,
  clientRequestId: EntityIdSchema,
  modelRequestId: EntityIdSchema,
  modelRequestDigest: Sha256DigestSchema,
  executionBindingDigest: Sha256DigestSchema,
  confirmationId: EntityIdSchema,
  scopeDigest: Sha256DigestSchema,
  dataScopeDigest: Sha256DigestSchema,
  invocationId: EntityIdSchema.optional(),
  statusRevision: z.number().int().nonnegative().optional(),
  durableCursor: z.string().min(1).max(1024).optional(),
  acceptedAt: TimestampSchema.optional(),
  outputStartedAt: TimestampSchema.optional(),
  summaryCommittedAt: TimestampSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

const LegacyMaterialSchema = z.object(CommonMaterialFields).strict();
const V2MaterialSchema = z.object({
  schemaVersion: z.literal("v2"),
  ...CommonMaterialFields,
  dynamicRequestFacts: DynamicRequestFactsV1Schema,
  contextAssemblyReceiptDigest: Sha256DigestSchema,
}).strict();

export const LegacyCompactionModelInvocationLinkSchema = LegacyMaterialSchema.extend({
  recordDigest: Sha256DigestSchema,
}).strict().superRefine(validateRecord);

export const CompactionModelInvocationLinkV2Schema = V2MaterialSchema.extend({
  recordDigest: Sha256DigestSchema,
}).strict().superRefine(validateRecord);

export type LegacyCompactionModelInvocationLink = z.infer<
  typeof LegacyCompactionModelInvocationLinkSchema
>;
export type CompactionModelInvocationLinkV2 = z.infer<
  typeof CompactionModelInvocationLinkV2Schema
>;
export type CompactionModelInvocationLink =
  | LegacyCompactionModelInvocationLink
  | CompactionModelInvocationLinkV2;
type CompactionModelInvocationMaterial =
  | z.infer<typeof LegacyMaterialSchema>
  | z.infer<typeof V2MaterialSchema>;

export const CompactionModelInvocationLinkSchema =
  z.custom<CompactionModelInvocationLink>((value) => {
    try {
      validateCompactionModelInvocationLink(value);
      return true;
    } catch {
      return false;
    }
  }, { message: "Compaction Model invocation link is invalid" })
    .transform((value) => validateCompactionModelInvocationLink(value));

export function validateCompactionModelInvocationLink(
  input: unknown,
): CompactionModelInvocationLink {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Compaction Model invocation link must be an object");
  }
  const schemaVersion = (input as Record<string, unknown>).schemaVersion;
  if (schemaVersion === undefined) {
    return LegacyCompactionModelInvocationLinkSchema.parse(input);
  }
  if (schemaVersion === "v2") return CompactionModelInvocationLinkV2Schema.parse(input);
  throw new Error("Compaction Model invocation link schema version is unsupported");
}

type PrepareOmitted =
  | "invocationId" | "statusRevision" | "durableCursor" | "acceptedAt"
  | "outputStartedAt" | "summaryCommittedAt" | "recordDigest" | "updatedAt";
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, Extract<K, keyof T>>
  : never;
export type PrepareCompactionModelInvocationLinkInput = DistributiveOmit<
  CompactionModelInvocationLink,
  PrepareOmitted
>;

export type CompactionModelInvocationLinkWriteResult =
  | Readonly<{ ok: true; replayed: boolean; value: CompactionModelInvocationLink }>
  | Readonly<{ ok: false; error: Readonly<{
    code: "compaction_model_invocation_link.conflict"
      | "compaction_model_invocation_link.not_found"
      | "compaction_model_invocation_link.stale_revision";
    message: string;
  }> }>;

export interface CompactionModelInvocationLinkPersistence {
  loadByCompactionJobId(jobId: string): Promise<CompactionModelInvocationLink | undefined>;
  prepare(input: PrepareCompactionModelInvocationLinkInput): Promise<CompactionModelInvocationLinkWriteResult>;
  recordAccepted(input: Readonly<{
    compactionJobId: string;
    expectedRecordDigest: string;
    invocationId: string;
    statusRevision: number;
    durableCursor?: string;
    acceptedAt: string;
  }>): Promise<CompactionModelInvocationLinkWriteResult>;
  recordStreamProgress(input: Readonly<{
    compactionJobId: string;
    expectedRecordDigest: string;
    statusRevision: number;
    durableCursor?: string;
    outputStartedAt?: string;
    updatedAt: string;
  }>): Promise<CompactionModelInvocationLinkWriteResult>;
}

export function withCompactionInvocationDigest(
  material: CompactionModelInvocationMaterial,
): CompactionModelInvocationLink {
  const parsed = validateMaterial(material);
  return validateCompactionModelInvocationLink({
    ...parsed,
    recordDigest: sha256CanonicalJson(JsonValueSchema.parse(parsed)),
  });
}

export function samePreparedCompactionModelInvocationLink(
  record: CompactionModelInvocationLink,
  input: PrepareCompactionModelInvocationLinkInput,
): boolean {
  const common = record.compactionJobId === input.compactionJobId
    && record.clientRequestId === input.clientRequestId
    && record.modelRequestId === input.modelRequestId
    && record.modelRequestDigest === input.modelRequestDigest
    && record.executionBindingDigest === input.executionBindingDigest
    && record.confirmationId === input.confirmationId
    && record.scopeDigest === input.scopeDigest
    && record.dataScopeDigest === input.dataScopeDigest;
  if (!common) return false;
  const recordV2 = "schemaVersion" in record;
  const inputV2 = "schemaVersion" in input;
  if (recordV2 !== inputV2) return false;
  if (!recordV2 || !inputV2) return true;
  return record.contextAssemblyReceiptDigest === input.contextAssemblyReceiptDigest
    && record.dynamicRequestFacts.factsDigest === input.dynamicRequestFacts.factsDigest
    && sha256CanonicalJson(JsonValueSchema.parse(record.dynamicRequestFacts))
      === sha256CanonicalJson(JsonValueSchema.parse(input.dynamicRequestFacts));
}

function validateMaterial(input: unknown): CompactionModelInvocationMaterial {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Compaction Model invocation material must be an object");
  }
  const schemaVersion = (input as Record<string, unknown>).schemaVersion;
  if (schemaVersion === undefined) return LegacyMaterialSchema.parse(input);
  if (schemaVersion === "v2") return V2MaterialSchema.parse(input);
  throw new Error("Compaction Model invocation material schema version is unsupported");
}

function validateRecord(
  record: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  const { recordDigest, ...material } = record;
  if (recordDigest !== sha256CanonicalJson(JsonValueSchema.parse(material))) {
    context.addIssue({ code: "custom", message: "Compaction Model invocation link digest mismatch" });
  }
  if ((record.invocationId === undefined) !== (record.acceptedAt === undefined)) {
    context.addIssue({ code: "custom", message: "accepted invocation facts must be committed together" });
  }
  if ((record.invocationId === undefined) !== (record.statusRevision === undefined)) {
    context.addIssue({ code: "custom", message: "accepted invocation requires a status revision" });
  }
  if (record.durableCursor !== undefined && record.invocationId === undefined) {
    context.addIssue({ code: "custom", message: "durable cursor requires an accepted invocation" });
  }
  if (record.outputStartedAt !== undefined && record.invocationId === undefined) {
    context.addIssue({ code: "custom", message: "output start requires an accepted invocation" });
  }
  if (record.summaryCommittedAt !== undefined && record.outputStartedAt === undefined) {
    context.addIssue({ code: "custom", message: "summary commit requires complete live output" });
  }
}
