import { z } from "zod";

export const RuntimeErrorCategorySchema = z.enum([
  "validation",
  "configuration",
  "authentication",
  "authorization",
  "rate_limit",
  "timeout",
  "cancelled",
  "provider",
  "persistence",
  "internal",
]);

export const RuntimeErrorSchema = z.object({
  code: z.string().min(1),
  category: RuntimeErrorCategorySchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type RuntimeErrorCategory = z.infer<typeof RuntimeErrorCategorySchema>;
export type RuntimeError = z.infer<typeof RuntimeErrorSchema>;
