import { z } from "zod";

import { EntityIdSchema, NamespacedResourceIdSchema } from "../common/identifiers.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import {
  ModelContextArtifactSchema,
  ModelRequestMessageSchema,
  ModelRequestSchema,
  ModelTargetSchema,
  ModelToolDefinitionSchema,
} from "./request.js";

export const MODEL_PROTOCOL_VERSION_V1ALPHA2 = "v1alpha2" as const;
export const ModelProtocolVersionV1Alpha2Schema = z.literal(
  MODEL_PROTOCOL_VERSION_V1ALPHA2,
);

export const DefaultPassthroughModelReasoningSchema = z.object({
  mode: z.literal("default_passthrough"),
  reasoningModeLockId: EntityIdSchema,
  reasoningModeLockDigest: Sha256DigestSchema,
}).strict();

export const LockedMaxStrategyModelReasoningSchema = z.object({
  mode: z.literal("locked_max_strategy"),
  reasoningModeLockId: EntityIdSchema,
  reasoningModeLockDigest: Sha256DigestSchema,
  strategyId: NamespacedResourceIdSchema,
  strategyRevision: Sha256DigestSchema,
  strategyDigest: Sha256DigestSchema,
  timeoutPolicyRef: NamespacedResourceIdSchema,
}).strict();

export const ModelReasoningV1Alpha2Schema = z.discriminatedUnion("mode", [
  DefaultPassthroughModelReasoningSchema,
  LockedMaxStrategyModelReasoningSchema,
]);

export const ModelRequestV1Alpha2MaterialSchema = z.object({
  schemaVersion: ModelProtocolVersionV1Alpha2Schema,
  requestId: EntityIdSchema,
  snapshotId: EntityIdSchema,
  contextSourceDigest: Sha256DigestSchema,
  model: ModelTargetSchema,
  messages: z.array(ModelRequestMessageSchema).min(1),
  tools: z.array(ModelToolDefinitionSchema),
  artifacts: z.array(ModelContextArtifactSchema),
  maxOutputTokens: z.number().int().positive(),
  reasoning: ModelReasoningV1Alpha2Schema,
}).strict();

export const ModelRequestV1Alpha2Schema = z.object({
  ...ModelRequestV1Alpha2MaterialSchema.shape,
  requestDigest: Sha256DigestSchema,
}).strict().superRefine(validateRequestReferences);

export const ReadableModelRequestSchema = z.union([
  ModelRequestSchema,
  ModelRequestV1Alpha2Schema,
]);

export type DefaultPassthroughModelReasoning = z.infer<
  typeof DefaultPassthroughModelReasoningSchema
>;
export type LockedMaxStrategyModelReasoning = z.infer<
  typeof LockedMaxStrategyModelReasoningSchema
>;
export type ModelReasoningV1Alpha2 = z.infer<typeof ModelReasoningV1Alpha2Schema>;
export type ModelRequestV1Alpha2Material = z.infer<
  typeof ModelRequestV1Alpha2MaterialSchema
>;
export type ModelRequestV1Alpha2 = z.infer<typeof ModelRequestV1Alpha2Schema>;
export type ReadableModelRequest = z.infer<typeof ReadableModelRequestSchema>;

function validateRequestReferences(
  request: z.infer<typeof ModelRequestV1Alpha2Schema>,
  context: z.RefinementCtx,
): void {
  const toolKeys = request.tools.map((tool) => `${tool.taskId}\u0000${tool.capabilityId}`);
  if (new Set(toolKeys).size !== toolKeys.length) {
    context.addIssue({ code: "custom", message: "model request tools must be unique per Task" });
  }
  if (new Set(request.tools.map((tool) => tool.lockId)).size !== request.tools.length) {
    context.addIssue({ code: "custom", message: "model request tool lockId values must be unique" });
  }
  const artifactsByObservation = new Map(
    request.artifacts.map((artifact) => [artifact.observationId, artifact]),
  );
  if (artifactsByObservation.size !== request.artifacts.length) {
    context.addIssue({ code: "custom", message: "model request artifact observations must be unique" });
  }
  for (const message of request.messages) {
    if (message.role !== "tool") continue;
    const artifact = artifactsByObservation.get(message.observationId);
    if (
      artifact === undefined
      || artifact.toolCallId !== message.toolCallId
      || artifact.taskId !== message.taskId
      || artifact.actionId !== message.actionId
      || artifact.resultDigest !== message.resultDigest
    ) {
      context.addIssue({
        code: "custom",
        message: "every tool result message requires one exact artifact reference",
      });
    }
  }
}
