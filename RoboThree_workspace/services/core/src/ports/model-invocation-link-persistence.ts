import {
  EntityIdSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "@robothree/contracts";
import { z } from "zod";

import { DynamicRequestFactsV1Schema } from
  "../application/dynamic-request-facts.js";

const CommonFields = {
  taskId: EntityIdSchema,
  runId: EntityIdSchema,
  stepId: EntityIdSchema,
  actionId: EntityIdSchema,
  round: z.number().int().positive().max(64),
  runtimeSelectionDigest: Sha256DigestSchema,
  assistantMessageId: EntityIdSchema,
  modelRequestId: EntityIdSchema,
  modelRequestDigest: Sha256DigestSchema,
  confirmationId: EntityIdSchema,
  scopeDigest: Sha256DigestSchema,
  dataScopeDigest: Sha256DigestSchema,
  clientRequestId: EntityIdSchema,
  centralAcceptRequestDigest: Sha256DigestSchema,
  invocationId: EntityIdSchema.optional(),
  statusRevision: z.number().int().nonnegative().optional(),
  durableCursor: z.string().min(1).max(1024).optional(),
  acceptedAt: TimestampSchema.optional(),
  outputStartedAt: TimestampSchema.optional(),
  messageCommittedAt: TimestampSchema.optional(),
  recordDigest: Sha256DigestSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

export const LegacyModelInvocationLinkSchema = z.object(CommonFields)
  .strict().superRefine(validateLifecycle);

export const ModelInvocationLinkV2Schema = z.object({
  schemaVersion: z.literal("v2"),
  ...CommonFields,
  dynamicRequestFacts: DynamicRequestFactsV1Schema,
  contextAssemblyReceiptDigest: Sha256DigestSchema,
}).strict().superRefine(validateLifecycle);

export type LegacyModelInvocationLink = z.infer<
  typeof LegacyModelInvocationLinkSchema
>;
export type ModelInvocationLinkV2 = z.infer<typeof ModelInvocationLinkV2Schema>;
export type ModelInvocationLink = LegacyModelInvocationLink | ModelInvocationLinkV2;

/** Single version dispatch: an unknown explicit discriminator never falls back to legacy. */
export const ModelInvocationLinkSchema = z.custom<ModelInvocationLink>(
  (value) => {
    try {
      validateModelInvocationLink(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Model invocation link is invalid" },
).transform((value) => validateModelInvocationLink(value));

export function validateModelInvocationLink(input: unknown): ModelInvocationLink {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Model invocation link must be an object");
  }
  const schemaVersion = (input as Record<string, unknown>).schemaVersion;
  if (schemaVersion === undefined) return LegacyModelInvocationLinkSchema.parse(input);
  if (schemaVersion === "v2") return ModelInvocationLinkV2Schema.parse(input);
  throw new Error("Model invocation link schema version is unsupported");
}

type PrepareOmitted =
  | "invocationId"
  | "statusRevision"
  | "durableCursor"
  | "acceptedAt"
  | "outputStartedAt"
  | "messageCommittedAt"
  | "recordDigest"
  | "updatedAt";
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, Extract<K, keyof T>>
  : never;
export type PrepareModelInvocationLinkInput = DistributiveOmit<
  ModelInvocationLink,
  PrepareOmitted
>;

export type ModelInvocationLinkWriteResult =
  | Readonly<{ ok: true; replayed: boolean; value: ModelInvocationLink }>
  | Readonly<{
    ok: false;
    error: Readonly<{
      code: "model_invocation_link.conflict" | "model_invocation_link.not_found" | "model_invocation_link.stale_revision";
      message: string;
    }>;
  }>;

export interface ModelInvocationLinkPersistence {
  start(): Promise<void>;
  stop(): Promise<void>;
  loadByClientRequestId(clientRequestId: string): Promise<ModelInvocationLink | undefined>;
  loadRound(taskId: string, runId: string, round: number): Promise<ModelInvocationLink | undefined>;
  listIncomplete(limit: number): Promise<readonly ModelInvocationLink[]>;
  prepare(input: PrepareModelInvocationLinkInput): Promise<ModelInvocationLinkWriteResult>;
  recordAccepted(input: Readonly<{
    clientRequestId: string;
    expectedRecordDigest: string;
    invocationId: string;
    statusRevision: number;
    durableCursor?: string;
    acceptedAt: string;
  }>): Promise<ModelInvocationLinkWriteResult>;
  recordStreamProgress(input: Readonly<{
    clientRequestId: string;
    expectedRecordDigest: string;
    statusRevision: number;
    durableCursor?: string;
    outputStartedAt?: string;
    updatedAt: string;
  }>): Promise<ModelInvocationLinkWriteResult>;
  recordMessageCommitted(input: Readonly<{
    clientRequestId: string;
    expectedRecordDigest: string;
    messageCommittedAt: string;
  }>): Promise<ModelInvocationLinkWriteResult>;
}

function validateLifecycle(
  record: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  if ((record.invocationId === undefined) !== (record.acceptedAt === undefined)) {
    context.addIssue({ code: "custom", message: "accepted link facts must be committed together" });
  }
  if (record.statusRevision !== undefined && record.invocationId === undefined) {
    context.addIssue({ code: "custom", message: "status revision requires an accepted invocation" });
  }
  if (record.durableCursor !== undefined && record.invocationId === undefined) {
    context.addIssue({ code: "custom", message: "durable cursor requires an accepted invocation" });
  }
  if (record.outputStartedAt !== undefined && record.invocationId === undefined) {
    context.addIssue({ code: "custom", message: "output start requires an accepted invocation" });
  }
  if (record.messageCommittedAt !== undefined && record.outputStartedAt === undefined) {
    context.addIssue({ code: "custom", message: "message commit requires a complete live output" });
  }
}
