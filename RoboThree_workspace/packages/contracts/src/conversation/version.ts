import { z } from "zod";

export const CONVERSATION_SCHEMA_VERSION = "v1alpha1" as const;
export const ConversationSchemaVersionSchema = z.literal(CONVERSATION_SCHEMA_VERSION);

export type ConversationSchemaVersion = z.infer<typeof ConversationSchemaVersionSchema>;
