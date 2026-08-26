import { z } from "zod";

export const COMPACTION_SCHEMA_VERSION = "v1alpha1" as const;
export const CompactionSchemaVersionSchema = z.literal(COMPACTION_SCHEMA_VERSION);

export type CompactionSchemaVersion = z.infer<typeof CompactionSchemaVersionSchema>;
