import { z } from "zod";

export const TimestampSchema = z.string().datetime({ offset: true });

export type Timestamp = z.infer<typeof TimestampSchema>;
