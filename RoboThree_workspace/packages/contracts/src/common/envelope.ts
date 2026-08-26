import { z } from "zod";

import { EntityIdSchema } from "./identifiers.js";
import { TimestampSchema } from "./time.js";
import { CONTRACT_VERSION, ContractVersionSchema } from "./version.js";

const EnvelopeMetadataSchema = z.object({
  schemaVersion: ContractVersionSchema,
  id: EntityIdSchema,
  correlationId: EntityIdSchema,
  timestamp: TimestampSchema,
});

export function createCommandEnvelopeSchema<TPayload extends z.ZodType>(payload: TPayload) {
  return EnvelopeMetadataSchema.extend({
    kind: z.string().min(1),
    payload,
  });
}

export function createEventEnvelopeSchema<TPayload extends z.ZodType>(payload: TPayload) {
  return EnvelopeMetadataSchema.extend({
    kind: z.string().min(1),
    sequence: z.number().int().nonnegative(),
    payload,
  });
}

export const createEnvelopeMetadata = (input: {
  id: string;
  correlationId: string;
  timestamp: string;
}) =>
  EnvelopeMetadataSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    ...input,
  });
