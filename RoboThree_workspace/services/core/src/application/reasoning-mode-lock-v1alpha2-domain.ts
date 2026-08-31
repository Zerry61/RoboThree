import {
  JsonValueSchema,
  Sha256DigestSchema,
  type Sha256Digest,
} from "@robothree/contracts";
import {
  ReasoningModeLockMaterialV1Alpha2Schema,
  ReasoningModeLockV1Alpha2Schema,
  ReasoningResolutionEvidenceRefV1Alpha2Schema,
  type ReasoningModeLockMaterialV1Alpha2,
  type ReasoningModeLockV1Alpha2,
  type ReasoningResolutionEvidenceRefV1Alpha2,
} from "@robothree/contracts/reasoning-mode/v1alpha2";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";

const LOCK_DIGEST_DOMAIN = "robothree.reasoning-mode-lock.v1alpha2\n";
const RESOLUTION_EVIDENCE_DIGEST_DOMAIN =
  "robothree.reasoning-mode-resolution-evidence.v1\n";

const ResolutionEvidenceMaterialSchema = z.object({
  schemaVersion: z.literal("v1"),
  taskId: z.string().min(1),
  reasoningModeLockId: z.string().min(1),
  modelLockDigest: Sha256DigestSchema,
  cause: z.enum([
    "support_changed",
    "provider_release.policy_unavailable",
    "provider_release.policy_not_admitted",
  ]),
  observedMaxSupport: z.literal("supported"),
  observedMaxSupportRevision: Sha256DigestSchema,
  resolvedMaxSupport: z.enum(["supported", "unsupported", "unknown"]).optional(),
  resolvedMaxSupportRevision: Sha256DigestSchema.optional(),
}).strict().superRefine((value, context) => {
  const supportChanged = value.cause === "support_changed";
  if (supportChanged !== (value.resolvedMaxSupport !== undefined)
    || supportChanged !== (value.resolvedMaxSupportRevision !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "support drift evidence requires the resolved support fact",
    });
  }
});

export const ReasoningResolutionEvidenceV1Schema = z.object({
  ...ResolutionEvidenceMaterialSchema.shape,
  resolutionEvidenceRevision: Sha256DigestSchema,
  resolutionEvidenceDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.resolutionEvidenceRevision !== value.resolutionEvidenceDigest) {
    context.addIssue({ code: "custom", message: "resolution evidence refs must match" });
  }
});

export type ReasoningResolutionEvidenceV1 = z.infer<
  typeof ReasoningResolutionEvidenceV1Schema
>;

export function createReasoningResolutionEvidenceV1(
  material: z.input<typeof ResolutionEvidenceMaterialSchema>,
): ReasoningResolutionEvidenceV1 {
  const parsed = ResolutionEvidenceMaterialSchema.parse(material);
  const digest = domainDigest(RESOLUTION_EVIDENCE_DIGEST_DOMAIN, parsed);
  return Object.freeze(ReasoningResolutionEvidenceV1Schema.parse({
    ...parsed,
    resolutionEvidenceRevision: digest,
    resolutionEvidenceDigest: digest,
  }));
}

export function resolutionEvidenceRef(
  evidence: ReasoningResolutionEvidenceV1,
): ReasoningResolutionEvidenceRefV1Alpha2 {
  const parsed = validateReasoningResolutionEvidenceV1(evidence);
  return Object.freeze(ReasoningResolutionEvidenceRefV1Alpha2Schema.parse({
    resolutionEvidenceRevision: parsed.resolutionEvidenceRevision,
    resolutionEvidenceDigest: parsed.resolutionEvidenceDigest,
  }));
}

export function validateReasoningResolutionEvidenceV1(
  input: ReasoningResolutionEvidenceV1,
): ReasoningResolutionEvidenceV1 {
  const parsed = ReasoningResolutionEvidenceV1Schema.parse(input);
  const { resolutionEvidenceRevision, resolutionEvidenceDigest, ...material } = parsed;
  const expected = domainDigest(RESOLUTION_EVIDENCE_DIGEST_DOMAIN, material);
  if (resolutionEvidenceRevision !== expected || resolutionEvidenceDigest !== expected) {
    throw new ReasoningModeLockV1Alpha2IntegrityError(
      "reasoning_resolution_evidence.digest_invalid",
    );
  }
  return parsed;
}

export function createReasoningModeLockV1Alpha2(
  material: ReasoningModeLockMaterialV1Alpha2,
): ReasoningModeLockV1Alpha2 {
  const parsed = ReasoningModeLockMaterialV1Alpha2Schema.parse(material);
  return Object.freeze(ReasoningModeLockV1Alpha2Schema.parse({
    ...parsed,
    reasoningModeLockDigest: calculateReasoningModeLockV1Alpha2Digest(parsed),
  }));
}

export function calculateReasoningModeLockV1Alpha2Digest(
  material: ReasoningModeLockMaterialV1Alpha2,
): Sha256Digest {
  return domainDigest(
    LOCK_DIGEST_DOMAIN,
    ReasoningModeLockMaterialV1Alpha2Schema.parse(material),
  );
}

export function validateReasoningModeLockV1Alpha2(
  input: ReasoningModeLockV1Alpha2,
  expected: Readonly<{
    taskId?: string;
    modelLockRef?: Readonly<{ lockId: string; lockDigest: string }>;
    resolutionEvidence?: ReasoningResolutionEvidenceV1;
  }> = {},
): ReasoningModeLockV1Alpha2 {
  const parsed = ReasoningModeLockV1Alpha2Schema.parse(input);
  const { reasoningModeLockDigest, ...material } = parsed;
  if (reasoningModeLockDigest !== calculateReasoningModeLockV1Alpha2Digest(material)) {
    throw new ReasoningModeLockV1Alpha2IntegrityError("reasoning_lock.digest_invalid");
  }
  if (expected.taskId !== undefined && parsed.taskId !== expected.taskId) {
    throw new ReasoningModeLockV1Alpha2IntegrityError("reasoning_lock.task_mismatch");
  }
  if (expected.modelLockRef !== undefined && (
    parsed.modelLockRef.lockId !== expected.modelLockRef.lockId
    || parsed.modelLockRef.lockDigest !== expected.modelLockRef.lockDigest
  )) {
    throw new ReasoningModeLockV1Alpha2IntegrityError(
      "reasoning_lock.model_lock_mismatch",
    );
  }
  const requiresEvidence = parsed.resolution === "max_support_changed_default"
    || parsed.resolution === "max_mapping_unavailable_default";
  const evidenceWasSupplied = Object.prototype.hasOwnProperty.call(
    expected,
    "resolutionEvidence",
  );
  if (evidenceWasSupplied
    && requiresEvidence !== (expected.resolutionEvidence !== undefined)) {
    throw new ReasoningModeLockV1Alpha2IntegrityError(
      "reasoning_lock.resolution_evidence_missing",
    );
  }
  if (expected.resolutionEvidence !== undefined) {
    const evidence = validateReasoningResolutionEvidenceV1(expected.resolutionEvidence);
    if (!("resolutionEvidenceRevision" in parsed)
      || !("resolutionEvidenceDigest" in parsed)) {
      throw new ReasoningModeLockV1Alpha2IntegrityError(
        "reasoning_lock.resolution_evidence_mismatch",
      );
    }
    if (
      evidence.taskId !== parsed.taskId
      || evidence.reasoningModeLockId !== parsed.reasoningModeLockId
      || evidence.modelLockDigest !== parsed.modelLockRef.lockDigest
      || evidence.resolutionEvidenceRevision !== parsed.resolutionEvidenceRevision
      || evidence.resolutionEvidenceDigest !== parsed.resolutionEvidenceDigest
    ) {
      throw new ReasoningModeLockV1Alpha2IntegrityError(
        "reasoning_lock.resolution_evidence_mismatch",
      );
    }
  }
  return parsed;
}

export class ReasoningModeLockV1Alpha2IntegrityError extends Error {
  public constructor(public readonly code:
    | "reasoning_lock.digest_invalid"
    | "reasoning_lock.task_mismatch"
    | "reasoning_lock.model_lock_mismatch"
    | "reasoning_lock.resolution_evidence_missing"
    | "reasoning_lock.resolution_evidence_mismatch"
    | "reasoning_resolution_evidence.digest_invalid") {
    super(code);
    this.name = "ReasoningModeLockV1Alpha2IntegrityError";
  }
}

function domainDigest(domain: string, material: unknown): Sha256Digest {
  return Sha256DigestSchema.parse(sha256CanonicalJson(JsonValueSchema.parse({
    domain,
    material,
  })));
}

export const ReasoningModeLockV1Alpha2DomainConstants = Object.freeze({
  lockDigestDomain: LOCK_DIGEST_DOMAIN,
  resolutionEvidenceDigestDomain: RESOLUTION_EVIDENCE_DIGEST_DOMAIN,
});
