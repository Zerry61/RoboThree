import {
  EntityIdSchema,
  JsonValueSchema,
  Sha256DigestSchema,
  TimestampSchema,
  type Sha256Digest,
} from "@robothree/contracts";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";
import type {
  ModelInvocationTimeoutMaterial,
} from "../ports/model-invocation-timeout.js";

export const LOCAL_PERSONAL_TIMEOUT_POLICY_REVISION = "model-invocation-timeout.v1";
export const LOCAL_PERSONAL_CONNECT_TIMEOUT_MS = 30_000;
export const LOCAL_PERSONAL_FIRST_PROGRESS_TIMEOUT_MS = 90_000;
export const LOCAL_PERSONAL_STREAM_IDLE_TIMEOUT_MS = 300_000;
export const LOCAL_PERSONAL_OVERALL_TIMEOUT_MIN_MS = 120_000;
export const LOCAL_PERSONAL_OVERALL_TIMEOUT_DEFAULT_MS = 900_000;
export const LOCAL_PERSONAL_OVERALL_TIMEOUT_MAX_MS = 1_800_000;

const TimeoutPolicyMaterialSchema = z.object({
  policyRevision: z.literal(LOCAL_PERSONAL_TIMEOUT_POLICY_REVISION),
  connectTimeoutMs: z.literal(LOCAL_PERSONAL_CONNECT_TIMEOUT_MS),
  firstProgressTimeoutMs: z.literal(LOCAL_PERSONAL_FIRST_PROGRESS_TIMEOUT_MS),
  streamIdleTimeoutMs: z.literal(LOCAL_PERSONAL_STREAM_IDLE_TIMEOUT_MS),
  minimumOverallTimeoutMs: z.literal(LOCAL_PERSONAL_OVERALL_TIMEOUT_MIN_MS),
  defaultOverallTimeoutMs: z.literal(LOCAL_PERSONAL_OVERALL_TIMEOUT_DEFAULT_MS),
  maximumOverallTimeoutMs: z.literal(LOCAL_PERSONAL_OVERALL_TIMEOUT_MAX_MS),
  progressClassifierRevision: z.literal("openai-compatible-progress.v1"),
  timeoutErrorMappingRevision: z.literal("local-personal-timeout-errors.v1"),
}).strict();

export const ModelInvocationTimeoutPolicySchema = TimeoutPolicyMaterialSchema.extend({
  policyDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  const { policyDigest, ...material } = value;
  if (policyDigest !== timeoutPolicyDigest(material)) {
    context.addIssue({ code: "custom", message: "timeout policy digest mismatch" });
  }
});

export type ModelInvocationTimeoutPolicy = z.infer<typeof ModelInvocationTimeoutPolicySchema>;

const frozenPolicyMaterial = TimeoutPolicyMaterialSchema.parse({
  policyRevision: LOCAL_PERSONAL_TIMEOUT_POLICY_REVISION,
  connectTimeoutMs: LOCAL_PERSONAL_CONNECT_TIMEOUT_MS,
  firstProgressTimeoutMs: LOCAL_PERSONAL_FIRST_PROGRESS_TIMEOUT_MS,
  streamIdleTimeoutMs: LOCAL_PERSONAL_STREAM_IDLE_TIMEOUT_MS,
  minimumOverallTimeoutMs: LOCAL_PERSONAL_OVERALL_TIMEOUT_MIN_MS,
  defaultOverallTimeoutMs: LOCAL_PERSONAL_OVERALL_TIMEOUT_DEFAULT_MS,
  maximumOverallTimeoutMs: LOCAL_PERSONAL_OVERALL_TIMEOUT_MAX_MS,
  progressClassifierRevision: "openai-compatible-progress.v1",
  timeoutErrorMappingRevision: "local-personal-timeout-errors.v1",
});

export const LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1 = Object.freeze(
  ModelInvocationTimeoutPolicySchema.parse({
    ...frozenPolicyMaterial,
    policyDigest: timeoutPolicyDigest(frozenPolicyMaterial),
  }),
);

export const ModelInvocationTimeoutMaterialSchema = z.object({
  timeoutPolicyRevision: z.literal(LOCAL_PERSONAL_TIMEOUT_POLICY_REVISION),
  timeoutPolicyDigest: Sha256DigestSchema,
  selectedOverallTimeoutMs: z.number().int()
    .min(LOCAL_PERSONAL_OVERALL_TIMEOUT_MIN_MS)
    .max(LOCAL_PERSONAL_OVERALL_TIMEOUT_MAX_MS),
  effectiveDeadlineSource: z.enum(["policy_overall", "outer_deadline"]),
  outerDeadlineAt: TimestampSchema.optional(),
  invocationStartedAt: TimestampSchema,
  policyDeadlineAt: TimestampSchema,
  invocationDeadlineAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  const startedAtMs = timestampMs(value.invocationStartedAt);
  const policyDeadlineAtMs = timestampMs(value.policyDeadlineAt);
  const invocationDeadlineAtMs = timestampMs(value.invocationDeadlineAt);
  const outerDeadlineAtMs = value.outerDeadlineAt === undefined
    ? undefined
    : timestampMs(value.outerDeadlineAt);
  if (policyDeadlineAtMs !== startedAtMs + value.selectedOverallTimeoutMs) {
    context.addIssue({ code: "custom", message: "policy deadline does not match invocation start" });
  }
  if (invocationDeadlineAtMs <= startedAtMs) {
    context.addIssue({ code: "custom", message: "invocation deadline must follow invocation start" });
  }
  const expectedDeadlineAtMs = outerDeadlineAtMs === undefined
    ? policyDeadlineAtMs
    : Math.min(policyDeadlineAtMs, outerDeadlineAtMs);
  if (invocationDeadlineAtMs !== expectedDeadlineAtMs) {
    context.addIssue({ code: "custom", message: "effective invocation deadline drifted" });
  }
  const expectedSource = outerDeadlineAtMs !== undefined && outerDeadlineAtMs < policyDeadlineAtMs
    ? "outer_deadline"
    : "policy_overall";
  if (value.effectiveDeadlineSource !== expectedSource) {
    context.addIssue({ code: "custom", message: "effective invocation deadline source drifted" });
  }
});

const TimeoutFactMaterialSchema = ModelInvocationTimeoutMaterialSchema.extend({
  schemaVersion: z.literal("v1alpha1"),
  authorityInvocationId: EntityIdSchema,
}).strict();

export const LocalPersonalInvocationTimeoutFactSchema = TimeoutFactMaterialSchema.extend({
  recordDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  const { recordDigest, ...material } = value;
  if (recordDigest !== timeoutFactDigest(material)) {
    context.addIssue({ code: "custom", message: "local personal timeout fact digest mismatch" });
  }
});

export type LocalPersonalInvocationTimeoutFact = z.infer<
  typeof LocalPersonalInvocationTimeoutFactSchema
>;

export function createModelInvocationTimeoutMaterial(input: Readonly<{
  policy: ModelInvocationTimeoutPolicy;
  invocationStartedAt: string;
  outerDeadlineAt?: string;
}>): ModelInvocationTimeoutMaterial {
  const policy = ModelInvocationTimeoutPolicySchema.parse(input.policy);
  const invocationStartedAt = canonicalTimestamp(input.invocationStartedAt);
  const policyDeadlineAt = new Date(
    timestampMs(invocationStartedAt) + policy.defaultOverallTimeoutMs,
  ).toISOString();
  const outerDeadlineAt = input.outerDeadlineAt === undefined
    ? undefined
    : canonicalTimestamp(input.outerDeadlineAt);
  const outerIsEarlier = outerDeadlineAt !== undefined
    && timestampMs(outerDeadlineAt) < timestampMs(policyDeadlineAt);
  return ModelInvocationTimeoutMaterialSchema.parse({
    timeoutPolicyRevision: policy.policyRevision,
    timeoutPolicyDigest: policy.policyDigest,
    selectedOverallTimeoutMs: policy.defaultOverallTimeoutMs,
    effectiveDeadlineSource: outerIsEarlier ? "outer_deadline" : "policy_overall",
    ...(outerDeadlineAt === undefined ? {} : { outerDeadlineAt }),
    invocationStartedAt,
    policyDeadlineAt,
    invocationDeadlineAt: outerIsEarlier ? outerDeadlineAt : policyDeadlineAt,
  });
}

export function createLocalPersonalInvocationTimeoutFact(input: Readonly<{
  authorityInvocationId: string;
  timeout: ModelInvocationTimeoutMaterial;
  policy: ModelInvocationTimeoutPolicy;
}>): LocalPersonalInvocationTimeoutFact {
  const timeout = validateModelInvocationTimeoutMaterial(input.timeout, input.policy);
  const material = TimeoutFactMaterialSchema.parse({
    schemaVersion: "v1alpha1",
    authorityInvocationId: input.authorityInvocationId,
    ...timeout,
  });
  return LocalPersonalInvocationTimeoutFactSchema.parse({
    ...material,
    recordDigest: timeoutFactDigest(material),
  });
}

export function validateModelInvocationTimeoutMaterial(
  input: ModelInvocationTimeoutMaterial,
  policy: ModelInvocationTimeoutPolicy,
): ModelInvocationTimeoutMaterial {
  const material = ModelInvocationTimeoutMaterialSchema.parse(input);
  const lockedPolicy = ModelInvocationTimeoutPolicySchema.parse(policy);
  if (material.timeoutPolicyRevision !== lockedPolicy.policyRevision
    || material.timeoutPolicyDigest !== lockedPolicy.policyDigest
    || material.selectedOverallTimeoutMs !== lockedPolicy.defaultOverallTimeoutMs) {
    throw new Error("local_personal.timeout_fact_drift");
  }
  return material;
}

export function validateLocalPersonalInvocationTimeoutFact(
  input: LocalPersonalInvocationTimeoutFact,
  policy?: ModelInvocationTimeoutPolicy,
): LocalPersonalInvocationTimeoutFact {
  const fact = LocalPersonalInvocationTimeoutFactSchema.parse(input);
  if (policy !== undefined) {
    validateModelInvocationTimeoutMaterial({
      timeoutPolicyRevision: fact.timeoutPolicyRevision,
      timeoutPolicyDigest: fact.timeoutPolicyDigest,
      selectedOverallTimeoutMs: fact.selectedOverallTimeoutMs,
      effectiveDeadlineSource: fact.effectiveDeadlineSource,
      ...(fact.outerDeadlineAt === undefined ? {} : { outerDeadlineAt: fact.outerDeadlineAt }),
      invocationStartedAt: fact.invocationStartedAt,
      policyDeadlineAt: fact.policyDeadlineAt,
      invocationDeadlineAt: fact.invocationDeadlineAt,
    }, policy);
  }
  return fact;
}

export function timeoutPolicyDigest(
  input: z.infer<typeof TimeoutPolicyMaterialSchema>,
): Sha256Digest {
  const material = TimeoutPolicyMaterialSchema.parse(input);
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: "robothree.local-personal-model.timeout-policy.v1",
    material,
  }));
}

export function timeoutFactDigest(
  input: z.infer<typeof TimeoutFactMaterialSchema>,
): Sha256Digest {
  const material = TimeoutFactMaterialSchema.parse(input);
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: "robothree.local-personal-model.invocation-timeout-fact.v1",
    material,
  }));
}

function canonicalTimestamp(value: string): string {
  const parsed = TimestampSchema.parse(value);
  const canonical = new Date(parsed).toISOString();
  if (canonical !== parsed) throw new Error("local_personal.timeout_fact_drift");
  return canonical;
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("local_personal.timeout_fact_drift");
  return parsed;
}
