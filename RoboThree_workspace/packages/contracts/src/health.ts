import { z } from "zod";

import { TimestampSchema } from "./common/time.js";

export const HealthStatusSchema = z.enum(["ready", "degraded", "unavailable"]);

export const ComponentHealthSchema = z.object({
  componentId: z.string().min(1),
  status: HealthStatusSchema,
  checkedAt: TimestampSchema,
  details: z.record(z.string(), z.unknown()).optional(),
});

export const CoreHealthSchema = z.object({
  status: HealthStatusSchema,
  checkedAt: TimestampSchema,
  components: z.array(ComponentHealthSchema),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type ComponentHealth = z.infer<typeof ComponentHealthSchema>;
export type CoreHealth = z.infer<typeof CoreHealthSchema>;
