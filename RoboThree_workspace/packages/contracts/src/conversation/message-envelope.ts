import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { ModelProtocolVersionSchema } from "../model-protocol/version.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { ConversationSchemaVersionSchema } from "./version.js";

export const ConversationMessageEnvelopeSchema = z.object({
  schemaVersion: ConversationSchemaVersionSchema,
  messageId: EntityIdSchema,
  sessionId: EntityIdSchema,
  sequence: z.number().int().positive(),
  messageSchemaVersion: ModelProtocolVersionSchema,
  messageDigest: Sha256DigestSchema,
  taskId: EntityIdSchema.optional(),
  createdAt: TimestampSchema,
}).strict();

export type ConversationMessageEnvelope = z.infer<typeof ConversationMessageEnvelopeSchema>;
