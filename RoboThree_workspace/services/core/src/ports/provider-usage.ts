import { createHash } from "node:crypto";

import {
  EntityIdSchema,
  TimestampSchema,
} from "@robothree/contracts";
import { z } from "zod";

export const UsageAuthoritySchema = z.enum([
  "central_enterprise",
  "local_personal",
]);
export type UsageAuthority = z.infer<typeof UsageAuthoritySchema>;
const RawSha256DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
export const ANTHROPIC_USAGE_SEMANTICS_REVISION = sha256(
  "anthropic-compatible-provider-usage-v1",
);
export const OPENAI_USAGE_SEMANTICS_REVISION = sha256(
  "openai-compatible-provider-usage-v1",
);

export const ProviderUsageFactSchema = z.object({
  usageFactId: EntityIdSchema,
  usageAuthority: UsageAuthoritySchema,
  authorityInvocationId: EntityIdSchema,
  providerAttemptKey: RawSha256DigestSchema,
  fencingEpoch: z.number().int().positive(),
  usageDigest: RawSha256DigestSchema,
  sourceProtocol: z.enum(["anthropic_compatible", "openai_compatible"]),
  reportingSemanticsRevision: RawSha256DigestSchema,
  providerInputTokens: z.number().int().nonnegative(),
  providerOutputTokens: z.number().int().nonnegative(),
  cacheReadInputTokens: z.number().int().nonnegative().optional(),
  cacheWriteInputTokens: z.number().int().nonnegative().optional(),
  reasoningOutputTokens: z.number().int().nonnegative().optional(),
  normalizedTotalInputTokens: z.number().int().nonnegative(),
  attemptDisposition: z.enum(["terminal_winner", "superseded_confirmed"]),
  recordedAt: TimestampSchema,
}).strict().superRefine((fact, context) => {
  if (
    fact.reasoningOutputTokens !== undefined
    && fact.reasoningOutputTokens > fact.providerOutputTokens
  ) {
    context.addIssue({
      code: "custom",
      message: "reasoning output tokens must be a subset of output tokens",
    });
  }
  const expectedSemantics = fact.sourceProtocol === "anthropic_compatible"
    ? ANTHROPIC_USAGE_SEMANTICS_REVISION
    : OPENAI_USAGE_SEMANTICS_REVISION;
  if (fact.reportingSemanticsRevision !== expectedSemantics) {
    context.addIssue({ code: "custom", message: "Provider Usage reporting semantics drifted" });
  }
  if (
    fact.sourceProtocol === "openai_compatible"
    && fact.cacheReadInputTokens !== undefined
    && fact.cacheReadInputTokens > fact.providerInputTokens
  ) {
    context.addIssue({
      code: "custom",
      message: "OpenAI cached input must be a subset of input tokens",
    });
  }
  const expectedNormalized = fact.sourceProtocol === "anthropic_compatible"
    ? fact.providerInputTokens
      + (fact.cacheReadInputTokens ?? 0)
      + (fact.cacheWriteInputTokens ?? 0)
    : fact.providerInputTokens;
  if (fact.normalizedTotalInputTokens !== expectedNormalized) {
    context.addIssue({ code: "custom", message: "Provider Usage normalized input drifted" });
  }
  const expectedAttempt = providerAttemptKey(
    fact.usageAuthority,
    fact.authorityInvocationId,
    fact.fencingEpoch,
  );
  if (fact.providerAttemptKey !== expectedAttempt) {
    context.addIssue({ code: "custom", message: "Provider attempt key mismatch" });
  }
  const { usageFactId: _id, usageDigest: _digest, recordedAt: _time, ...material } = fact;
  if (fact.usageDigest !== providerUsageDigest(material)) {
    context.addIssue({ code: "custom", message: "Provider Usage digest mismatch" });
  }
});

export type ProviderUsageFact = z.infer<typeof ProviderUsageFactSchema>;

export type ProviderUsageWriteResult =
  | Readonly<{ ok: true; replayed: boolean; value: ProviderUsageFact }>
  | Readonly<{ ok: false; error: Readonly<{
    code: "provider_usage.conflict" | "provider_usage.attempt_not_registered";
    message: string;
  }> }>;

export interface LocalPersonalUsageAuthorityPort {
  registerAttempt(input: Readonly<{
    authorityInvocationId: string;
    fencingEpoch: number;
    providerAttemptKey: string;
  }>): Promise<void>;
  record(fact: ProviderUsageFact): Promise<ProviderUsageWriteResult>;
  load(input: Readonly<{
    authorityInvocationId: string;
    providerAttemptKey: string;
  }>): Promise<ProviderUsageFact | undefined>;
}

export function providerAttemptKey(
  authority: UsageAuthority,
  authorityInvocationId: string,
  fencingEpoch: number,
): string {
  return sha256(bound([
    UsageAuthoritySchema.parse(authority),
    EntityIdSchema.parse(authorityInvocationId),
    z.number().int().positive().parse(fencingEpoch).toString(),
  ]));
}

export function providerUsageDigest(
  material: Omit<ProviderUsageFact, "usageFactId" | "usageDigest" | "recordedAt">,
): string {
  return sha256(bound([
    UsageAuthoritySchema.parse(material.usageAuthority),
    EntityIdSchema.parse(material.authorityInvocationId),
    RawSha256DigestSchema.parse(material.providerAttemptKey),
    z.number().int().positive().parse(material.fencingEpoch).toString(),
    material.sourceProtocol,
    RawSha256DigestSchema.parse(material.reportingSemanticsRevision),
    z.number().int().nonnegative().parse(material.providerInputTokens).toString(),
    z.number().int().nonnegative().parse(material.providerOutputTokens).toString(),
    optional(material.cacheReadInputTokens),
    optional(material.cacheWriteInputTokens),
    optional(material.reasoningOutputTokens),
    z.number().int().nonnegative().parse(material.normalizedTotalInputTokens).toString(),
    material.attemptDisposition,
  ]));
}

function optional(value: number | undefined): string {
  return value === undefined
    ? "unknown"
    : z.number().int().nonnegative().parse(value).toString();
}

function bound(values: readonly string[]): string {
  return values.map((value) => `${value.length}:${value}|`).join("");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
