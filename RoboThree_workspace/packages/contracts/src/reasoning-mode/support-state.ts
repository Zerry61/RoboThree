import { z } from "zod";

export const ReasoningSupportStateSchema = z.enum([
  "supported",
  "unsupported",
  "unknown",
]);

export type ReasoningSupportState = z.infer<typeof ReasoningSupportStateSchema>;
