import { z } from "zod";

export const EntityIdSchema = z.string().uuid();

export const NamespacedResourceIdSchema = z.string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u);

export type EntityId = z.infer<typeof EntityIdSchema>;
export type NamespacedResourceId = z.infer<typeof NamespacedResourceIdSchema>;
