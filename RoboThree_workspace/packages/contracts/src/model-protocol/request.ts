import { z } from "zod";

import { CapabilityIdSchema } from "../capability/common.js";
import { EntityIdSchema } from "../common/identifiers.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { JsonObjectSchema } from "../runtime/json.js";
import { ModelTextPartSchema, ProviderNeutralMessageSchema } from "./message.js";
import { ModelProtocolVersionSchema } from "./version.js";

export const ModelInstructionMessageSchema = z.object({
  schemaVersion: ModelProtocolVersionSchema,
  role: z.literal("system"),
  sourceId: z.string().trim().min(1).max(240),
  sourceRevision: z.string().trim().min(1).max(240),
  sourceDigest: Sha256DigestSchema,
  content: z.array(ModelTextPartSchema).min(1).max(64),
}).strict();

export const ModelRequestMessageSchema = z.union([
  ModelInstructionMessageSchema,
  ProviderNeutralMessageSchema,
]);

export const ModelTargetSchema = z.object({
  capabilityId: CapabilityIdSchema,
  capabilityRevision: Sha256DigestSchema,
}).strict().superRefine((target, context) => {
  if (!target.capabilityId.startsWith("model.")) {
    context.addIssue({
      code: "custom",
      message: "model target capabilityId must start with model.",
      path: ["capabilityId"],
    });
  }
});

export const ModelToolDefinitionSchema = z.object({
  taskId: EntityIdSchema,
  lockId: EntityIdSchema,
  capabilityId: CapabilityIdSchema,
  capabilityRevision: Sha256DigestSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2_000),
  inputSchema: JsonObjectSchema,
}).strict().superRefine((tool, context) => {
  if (!tool.capabilityId.startsWith("tool.")) {
    context.addIssue({
      code: "custom",
      message: "model tool capabilityId must start with tool.",
      path: ["capabilityId"],
    });
  }
});

export const ModelContextArtifactSchema = z.object({
  type: z.literal("tool_result"),
  toolCallId: EntityIdSchema,
  taskId: EntityIdSchema,
  actionId: EntityIdSchema,
  observationId: EntityIdSchema,
  resultDigest: Sha256DigestSchema,
  originalBytes: z.number().int().nonnegative(),
  previewBytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
}).strict().superRefine((artifact, context) => {
  if (artifact.previewBytes > artifact.originalBytes) {
    context.addIssue({ code: "custom", message: "artifact preview cannot exceed original content" });
  }
  if (artifact.truncated !== (artifact.previewBytes < artifact.originalBytes)) {
    context.addIssue({ code: "custom", message: "artifact truncated flag must match byte counts" });
  }
});

export const ModelRequestSchema = z.object({
  schemaVersion: ModelProtocolVersionSchema,
  requestId: EntityIdSchema,
  snapshotId: EntityIdSchema,
  contextSourceDigest: Sha256DigestSchema,
  model: ModelTargetSchema,
  messages: z.array(ModelRequestMessageSchema).min(1),
  tools: z.array(ModelToolDefinitionSchema),
  artifacts: z.array(ModelContextArtifactSchema),
  maxOutputTokens: z.number().int().positive(),
  requestDigest: Sha256DigestSchema,
}).strict().superRefine((request, context) => {
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
});

export type ModelInstructionMessage = z.infer<typeof ModelInstructionMessageSchema>;
export type ModelRequestMessage = z.infer<typeof ModelRequestMessageSchema>;
export type ModelTarget = z.infer<typeof ModelTargetSchema>;
export type ModelToolDefinition = z.infer<typeof ModelToolDefinitionSchema>;
export type ModelContextArtifact = z.infer<typeof ModelContextArtifactSchema>;
export type ModelRequest = z.infer<typeof ModelRequestSchema>;
