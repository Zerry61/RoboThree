import { z } from "zod";

import { CurrentContractVersionSchema } from "../common/version.js";
import { Sha256DigestSchema } from "../persistence/common.js";

export const ToolRiskFactKindSchema = z.enum([
  "routine_file",
  "destructive_file",
  "protected_resource",
  "local_execution",
  "external_send",
  "unknown",
]);

export const ToolRiskDeclarationSchema = z.object({
  schemaVersion: CurrentContractVersionSchema,
  sourceRevision: z.string().trim().min(1).max(200),
  staticFacts: z.array(ToolRiskFactKindSchema).max(6),
  inspectorRef: z.string().trim().min(1).max(240).optional(),
}).strict().superRefine((value, context) => {
  if (new Set(value.staticFacts).size !== value.staticFacts.length) {
    context.addIssue({ code: "custom", message: "tool risk facts must be unique", path: ["staticFacts"] });
  }
});

export const ToolRiskFactsSchema = z.object({
  schemaVersion: CurrentContractVersionSchema,
  sourceRevision: z.string().trim().min(1).max(200),
  facts: z.array(ToolRiskFactKindSchema).max(6),
  factsDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (new Set(value.facts).size !== value.facts.length) {
    context.addIssue({ code: "custom", message: "tool risk facts must be unique", path: ["facts"] });
  }
});

export type ToolRiskFactKind = z.infer<typeof ToolRiskFactKindSchema>;
export type ToolRiskDeclaration = z.infer<typeof ToolRiskDeclarationSchema>;
export type ToolRiskFacts = z.infer<typeof ToolRiskFactsSchema>;
