import { z } from "zod";

import {
  EntityIdSchema,
  NamespacedResourceIdSchema,
} from "../common/identifiers.js";

export const AgentDefinitionRefSchema = z.object({
  agentDefinitionId: z.union([EntityIdSchema, NamespacedResourceIdSchema]),
  version: z.string().min(1),
});

export const ExecutionPlanRevisionRefSchema = z.object({
  executionPlanId: EntityIdSchema,
  planRevisionId: EntityIdSchema,
  revision: z.number().int().positive(),
});

export type AgentDefinitionRef = z.infer<typeof AgentDefinitionRefSchema>;
export type ExecutionPlanRevisionRef = z.infer<typeof ExecutionPlanRevisionRefSchema>;
