import {
  JsonObjectSchema,
  ObservationSchema,
  type Action,
  type EffectAttempt,
} from "@robothree/contracts";
import type { DocumentWorkerTextWritePostconditionMessage } from "@robothree/document-worker";

import type { EffectQueryResult } from "../ports/effect-executor.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

export function workspaceTextPostconditionToEffectQueryResult(input: Readonly<{
  postcondition: DocumentWorkerTextWritePostconditionMessage;
  attempt: EffectAttempt;
  action: Action;
  observedAt: string;
}>): EffectQueryResult {
  if (
    input.postcondition.decision === "not_found"
    || input.postcondition.decision === "safe_retry"
  ) {
    return { outcome: "not_found" };
  }
  if (input.postcondition.decision !== "recovered_success") {
    return { outcome: "unknown" };
  }
  const observation = ObservationSchema.parse({
    observationId: `wfw-recovered:${sha256CanonicalJson(JsonObjectSchema.parse({
      actionId: input.action.actionId,
      effectAttemptId: input.attempt.effectAttemptId,
      idempotencyKey: input.attempt.idempotencyKey,
    })).slice("sha256:".length)}`,
    actionId: input.action.actionId,
    observedAt: input.observedAt,
    outcome: "succeeded",
    output: {
      status: "succeeded",
      result: input.postcondition.output,
      metadata: input.postcondition.metadata,
    },
  });
  if (observation.outcome !== "succeeded") return { outcome: "unknown" };
  return {
    outcome: "succeeded",
    resultRef: observation.observationId,
    output: observation.output ?? null,
    observation,
  };
}
