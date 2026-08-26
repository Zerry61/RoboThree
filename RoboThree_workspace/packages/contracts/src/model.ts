import { z } from "zod";

import { RuntimeErrorSchema } from "./common/runtime-error.js";
import { AssistantToolCallSchema } from "./model-protocol/message.js";

const ModelStreamStartedSchema = z.object({
  type: z.literal("started"),
});

const ModelStreamTextDeltaSchema = z.object({
  type: z.literal("text_delta"),
  delta: z.string().min(1),
});

const ModelStreamUsageSchema = z.object({
  type: z.literal("usage"),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

const ModelStreamToolCallSchema = z.object({
  type: z.literal("tool_call"),
  call: AssistantToolCallSchema,
});

const ModelStreamCompletedSchema = z.object({
  type: z.literal("completed"),
  finishReason: z.string().min(1),
});

const ModelStreamFailedSchema = z.object({
  type: z.literal("failed"),
  error: RuntimeErrorSchema,
});

export const ModelStreamEventSchema = z.discriminatedUnion("type", [
  ModelStreamStartedSchema,
  ModelStreamTextDeltaSchema,
  ModelStreamToolCallSchema,
  ModelStreamUsageSchema,
  ModelStreamCompletedSchema,
  ModelStreamFailedSchema,
]);

export type ModelStreamEvent = z.infer<typeof ModelStreamEventSchema>;
