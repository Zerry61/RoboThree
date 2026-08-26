import type { Sha256Digest } from "@robothree/contracts";

export type ModelInvocationTimeoutMaterial = Readonly<{
  timeoutPolicyRevision: "model-invocation-timeout.v1";
  timeoutPolicyDigest: Sha256Digest;
  selectedOverallTimeoutMs: number;
  effectiveDeadlineSource: "policy_overall" | "outer_deadline";
  outerDeadlineAt?: string | undefined;
  invocationStartedAt: string;
  policyDeadlineAt: string;
  invocationDeadlineAt: string;
}>;
