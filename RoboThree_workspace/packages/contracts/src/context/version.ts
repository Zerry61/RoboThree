import { z } from "zod";

export const CONTEXT_SCHEMA_VERSION = "v1alpha1" as const;
export const ContextSchemaVersionSchema = z.literal(CONTEXT_SCHEMA_VERSION);

export type ContextSchemaVersion = z.infer<typeof ContextSchemaVersionSchema>;
