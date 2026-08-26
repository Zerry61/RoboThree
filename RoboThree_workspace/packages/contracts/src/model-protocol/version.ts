import { z } from "zod";

export const MODEL_PROTOCOL_VERSION = "v1alpha1" as const;
export const ModelProtocolVersionSchema = z.literal(MODEL_PROTOCOL_VERSION);

export type ModelProtocolVersion = z.infer<typeof ModelProtocolVersionSchema>;
