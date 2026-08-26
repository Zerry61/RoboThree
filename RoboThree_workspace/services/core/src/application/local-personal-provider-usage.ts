import { EntityIdSchema, TimestampSchema } from "@robothree/contracts";
import { z } from "zod";

import {
  OPENAI_USAGE_SEMANTICS_REVISION,
  ProviderUsageFactSchema,
  providerAttemptKey,
  providerUsageDigest,
  type ProviderUsageFact,
} from "../ports/provider-usage.js";

const OpenAiUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative().optional(),
  prompt_tokens_details: z.object({
    cached_tokens: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
  completion_tokens_details: z.object({
    reasoning_tokens: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
}).passthrough().superRefine((value, context) => {
  if (value.total_tokens !== undefined
    && value.total_tokens !== value.prompt_tokens + value.completion_tokens) {
    context.addIssue({ code: "custom", message: "OpenAI Usage total is inconsistent" });
  }
  if ((value.prompt_tokens_details?.cached_tokens ?? 0) > value.prompt_tokens) {
    context.addIssue({ code: "custom", message: "cached input exceeds input tokens" });
  }
  if ((value.completion_tokens_details?.reasoning_tokens ?? 0) > value.completion_tokens) {
    context.addIssue({ code: "custom", message: "reasoning output exceeds output tokens" });
  }
});

export function createLocalPersonalOpenAiUsageFact(input: Readonly<{
  usageFactId: string;
  authorityInvocationId: string;
  fencingEpoch: number;
  rawUsage?: unknown;
  attemptDisposition: "terminal_winner" | "superseded_confirmed";
  recordedAt: string;
}>): ProviderUsageFact | undefined {
  if (input.rawUsage === undefined) return undefined;
  const usage = OpenAiUsageSchema.parse(input.rawUsage);
  const material = {
    usageAuthority: "local_personal" as const,
    authorityInvocationId: EntityIdSchema.parse(input.authorityInvocationId),
    providerAttemptKey: providerAttemptKey(
      "local_personal",
      input.authorityInvocationId,
      input.fencingEpoch,
    ),
    fencingEpoch: z.number().int().positive().parse(input.fencingEpoch),
    sourceProtocol: "openai_compatible" as const,
    reportingSemanticsRevision: OPENAI_USAGE_SEMANTICS_REVISION,
    providerInputTokens: usage.prompt_tokens,
    providerOutputTokens: usage.completion_tokens,
    ...(usage.prompt_tokens_details?.cached_tokens === undefined
      ? {}
      : { cacheReadInputTokens: usage.prompt_tokens_details.cached_tokens }),
    ...(usage.completion_tokens_details?.reasoning_tokens === undefined
      ? {}
      : { reasoningOutputTokens: usage.completion_tokens_details.reasoning_tokens }),
    normalizedTotalInputTokens: usage.prompt_tokens,
    attemptDisposition: input.attemptDisposition,
  };
  return ProviderUsageFactSchema.parse({
    usageFactId: EntityIdSchema.parse(input.usageFactId),
    ...material,
    usageDigest: providerUsageDigest(material),
    recordedAt: TimestampSchema.parse(input.recordedAt),
  });
}
