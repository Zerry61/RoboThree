import {
  JsonValueSchema,
  type Sha256Digest,
} from "@robothree/contracts";
import {
  ReasoningModeLockMaterialSchema,
  ReasoningModeLockSchema,
  type ReasoningModeLock,
  type ReasoningModeLockMaterial,
  type ReasoningModeLockModelRef,
} from "@robothree/contracts/reasoning-mode/v1alpha1";

import { sha256CanonicalJson } from "../persistence/digest.js";

const REASONING_MODE_LOCK_DIGEST_DOMAIN = "robothree.reasoning-mode-lock.v1\n";

export function createReasoningModeLock(
  material: ReasoningModeLockMaterial,
): ReasoningModeLock {
  const parsed = ReasoningModeLockMaterialSchema.parse(material);
  return ReasoningModeLockSchema.parse({
    ...parsed,
    reasoningModeLockDigest: calculateReasoningModeLockDigest(parsed),
  });
}

export function calculateReasoningModeLockDigest(
  material: ReasoningModeLockMaterial,
): Sha256Digest {
  const parsed = ReasoningModeLockMaterialSchema.parse(material);
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: REASONING_MODE_LOCK_DIGEST_DOMAIN,
    material: parsed,
  }));
}

export function validateReasoningModeLock(
  input: ReasoningModeLock,
  expected?: Readonly<{
    taskId?: string;
    modelLockRef?: ReasoningModeLockModelRef;
  }>,
): ReasoningModeLock {
  const parsed = ReasoningModeLockSchema.parse(input);
  const { reasoningModeLockDigest, ...material } = parsed;
  if (reasoningModeLockDigest !== calculateReasoningModeLockDigest(material)) {
    throw new ReasoningModeLockIntegrityError(
      "reasoning_lock.digest_invalid",
      "Reasoning Mode lock digest is invalid",
    );
  }
  if (expected?.taskId !== undefined && parsed.taskId !== expected.taskId) {
    throw new ReasoningModeLockIntegrityError(
      "reasoning_lock.task_mismatch",
      "Reasoning Mode lock belongs to a different Task",
    );
  }
  if (
    expected?.modelLockRef !== undefined
    && (
      parsed.modelLockRef.lockId !== expected.modelLockRef.lockId
      || parsed.modelLockRef.lockDigest !== expected.modelLockRef.lockDigest
    )
  ) {
    throw new ReasoningModeLockIntegrityError(
      "reasoning_lock.model_lock_mismatch",
      "Reasoning Mode lock does not reference the exact Model lock",
    );
  }
  return parsed;
}

export class ReasoningModeLockIntegrityError extends Error {
  public constructor(
    public readonly code:
      | "reasoning_lock.digest_invalid"
      | "reasoning_lock.task_mismatch"
      | "reasoning_lock.model_lock_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "ReasoningModeLockIntegrityError";
  }
}

export const ReasoningModeLockDomainConstants = Object.freeze({
  digestDomain: REASONING_MODE_LOCK_DIGEST_DOMAIN,
});
