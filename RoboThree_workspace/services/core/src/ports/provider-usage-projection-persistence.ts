import {
  EntityIdSchema,
  JsonValueSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "@robothree/contracts";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";
import { UsageAuthoritySchema } from "./provider-usage.js";

const UsageProjectionMaterialSchema = z.object({
  invocationKind: z.enum(["assistant_message", "compaction_summary"]),
  invocationLinkId: EntityIdSchema,
  sessionId: EntityIdSchema,
  usageAuthority: UsageAuthoritySchema,
  authorityInvocationId: EntityIdSchema,
  usageEventId: EntityIdSchema,
  usageEventDigest: z.string().regex(/^[0-9a-f]{64}$/u),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  usageRecordedAt: TimestampSchema,
}).strict();

export const InvocationUsageProjectionSchema = UsageProjectionMaterialSchema.extend({
  recordDigest: Sha256DigestSchema,
}).strict().superRefine((record, context) => {
  const { recordDigest, ...material } = record;
  if (recordDigest !== sha256CanonicalJson(JsonValueSchema.parse(material))) {
    context.addIssue({ code: "custom", message: "Usage projection digest mismatch" });
  }
});

export type InvocationUsageProjection = z.infer<typeof InvocationUsageProjectionSchema>;
export type PrepareInvocationUsageProjection = z.input<typeof UsageProjectionMaterialSchema>;

export type UsageProjectionWriteResult =
  | Readonly<{ ok: true; replayed: boolean; value: InvocationUsageProjection }>
  | Readonly<{ ok: false; error: Readonly<{
    code: "usage_projection.conflict";
    message: string;
  }> }>;

export interface ProviderUsageProjectionPersistence {
  start(): Promise<void>;
  stop(): Promise<void>;
  record(input: PrepareInvocationUsageProjection): Promise<UsageProjectionWriteResult>;
  loadByLink(
    invocationKind: InvocationUsageProjection["invocationKind"],
    invocationLinkId: string,
  ): Promise<InvocationUsageProjection | undefined>;
  listBySession(sessionId: string): Promise<readonly InvocationUsageProjection[]>;
}

export function withUsageProjectionDigest(
  input: PrepareInvocationUsageProjection,
): InvocationUsageProjection {
  const material = UsageProjectionMaterialSchema.parse(input);
  return InvocationUsageProjectionSchema.parse({
    ...material,
    recordDigest: sha256CanonicalJson(JsonValueSchema.parse(material)),
  });
}

export function sessionUsageProjection(
  sessionId: string,
  records: readonly InvocationUsageProjection[],
): Readonly<{
  sessionId: string;
  invocationCount: number;
  inputTokens: number;
  outputTokens: number;
  recordDigest: string;
}> {
  const selected = records
    .map((record) => InvocationUsageProjectionSchema.parse(record))
    .filter((record) => record.sessionId === sessionId)
    .sort((left, right) => left.recordDigest.localeCompare(right.recordDigest));
  const material = {
    sessionId: EntityIdSchema.parse(sessionId),
    invocationCount: selected.length,
    inputTokens: selected.reduce((total, record) => total + record.inputTokens, 0),
    outputTokens: selected.reduce((total, record) => total + record.outputTokens, 0),
    invocationDigests: selected.map((record) => record.recordDigest),
  };
  return Object.freeze({
    sessionId: material.sessionId,
    invocationCount: material.invocationCount,
    inputTokens: material.inputTokens,
    outputTokens: material.outputTokens,
    recordDigest: sha256CanonicalJson(JsonValueSchema.parse(material)),
  });
}
