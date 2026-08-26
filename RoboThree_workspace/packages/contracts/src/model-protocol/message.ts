import { z } from "zod";

import { CapabilityIdSchema } from "../capability/common.js";
import { EntityIdSchema } from "../common/identifiers.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { JsonObjectSchema } from "../runtime/json.js";
import { ModelProtocolVersionSchema } from "./version.js";

export const ModelTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(262_144),
}).strict();

export const AssistantToolCallSchema = z.object({
  toolCallId: EntityIdSchema,
  taskId: EntityIdSchema,
  actionId: EntityIdSchema,
  capabilityId: CapabilityIdSchema,
  arguments: JsonObjectSchema,
}).strict();

const UserModelMessageSchema = z.object({
  schemaVersion: ModelProtocolVersionSchema,
  role: z.literal("user"),
  content: z.array(ModelTextPartSchema).min(1).max(64),
}).strict();

const AssistantModelMessageSchema = z.object({
  schemaVersion: ModelProtocolVersionSchema,
  role: z.literal("assistant"),
  content: z.array(ModelTextPartSchema).max(64),
  toolCalls: z.array(AssistantToolCallSchema).max(32),
}).strict().superRefine((message, context) => {
  if (message.content.length === 0 && message.toolCalls.length === 0) {
    context.addIssue({
      code: "custom",
      message: "assistant message requires text content or at least one tool call",
    });
  }
  if (new Set(message.toolCalls.map((call) => call.toolCallId)).size !== message.toolCalls.length) {
    context.addIssue({ code: "custom", message: "assistant toolCallId values must be unique" });
  }
  if (new Set(message.toolCalls.map((call) => call.actionId)).size !== message.toolCalls.length) {
    context.addIssue({ code: "custom", message: "assistant actionId values must be unique" });
  }
});

export const ToolResultOutcomeSchema = z.enum([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "user_rejected",
]);

const ToolResultModelMessageSchema = z.object({
  schemaVersion: ModelProtocolVersionSchema,
  role: z.literal("tool"),
  toolCallId: EntityIdSchema,
  taskId: EntityIdSchema,
  actionId: EntityIdSchema,
  observationId: EntityIdSchema,
  outcome: ToolResultOutcomeSchema,
  resultDigest: Sha256DigestSchema,
  content: z.array(ModelTextPartSchema).max(64),
}).strict();

export const ProviderNeutralMessageSchema = z.discriminatedUnion("role", [
  UserModelMessageSchema,
  AssistantModelMessageSchema,
  ToolResultModelMessageSchema,
]);

export type ModelTextPart = z.infer<typeof ModelTextPartSchema>;
export type AssistantToolCall = z.infer<typeof AssistantToolCallSchema>;
export type ToolResultOutcome = z.infer<typeof ToolResultOutcomeSchema>;
export type ProviderNeutralMessage = z.infer<typeof ProviderNeutralMessageSchema>;
