import { z } from "zod";

import { ProviderNeutralMessageSchema } from "../model-protocol/message.js";
import { ConversationMessageEnvelopeSchema } from "./message-envelope.js";

export const ConversationMessageSchema = z.object({
  envelope: ConversationMessageEnvelopeSchema,
  message: ProviderNeutralMessageSchema,
}).strict().superRefine((record, context) => {
  if (record.envelope.messageSchemaVersion !== record.message.schemaVersion) {
    context.addIssue({
      code: "custom",
      message: "message schemaVersion must match the envelope messageSchemaVersion",
      path: ["message", "schemaVersion"],
    });
  }
  const taskReferences = record.message.role === "assistant"
    ? record.message.toolCalls.map((call) => call.taskId)
    : record.message.role === "tool"
      ? [record.message.taskId]
      : [];
  if (taskReferences.length > 0 && record.envelope.taskId === undefined) {
    context.addIssue({
      code: "custom",
      message: "tool call and result messages require an envelope taskId",
      path: ["envelope", "taskId"],
    });
  }
  if (
    record.envelope.taskId !== undefined
    && taskReferences.some((taskId) => taskId !== record.envelope.taskId)
  ) {
    context.addIssue({
      code: "custom",
      message: "message task references must match the envelope taskId",
      path: ["message"],
    });
  }
});

export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
