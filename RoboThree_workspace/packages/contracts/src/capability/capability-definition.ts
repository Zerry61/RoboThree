import { z } from "zod";

import { ToolRiskDeclarationSchema } from "../authorization/tool-risk-facts.js";
import { ContractVersionSchema } from "../common/version.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { JsonObjectSchema } from "../runtime/json.js";
import {
  CapabilityIdSchema,
  CapabilitySourceSchema,
} from "./common.js";

const DefinitionCommonFields = {
  schemaVersion: ContractVersionSchema,
  capabilityId: CapabilityIdSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2_000),
  source: CapabilitySourceSchema,
};

export const ModelCapabilityDefinitionMaterialSchema = z.object({
  ...DefinitionCommonFields,
  kind: z.literal("model"),
  model: z.object({
    family: z.string().trim().min(1).max(120),
    inputModalities: z.array(z.enum(["text", "image", "audio"])).min(1),
    outputModalities: z.array(z.enum(["text", "image", "audio"])).min(1),
    contextWindow: z.number().int().positive().optional(),
    supportsStreaming: z.boolean(),
  }).strict(),
}).strict().superRefine((definition, context) => {
  if (!definition.capabilityId.startsWith("model.")) {
    context.addIssue({
      code: "custom",
      message: "model capabilityId must start with model.",
      path: ["capabilityId"],
    });
  }
});

export const ToolCapabilityDefinitionMaterialSchema = z.object({
  ...DefinitionCommonFields,
  kind: z.literal("tool"),
  tool: z.object({
    inputSchema: JsonObjectSchema,
    outputSchema: JsonObjectSchema.optional(),
    readOnlyHint: z.boolean(),
    risk: ToolRiskDeclarationSchema,
  }).strict(),
}).strict().superRefine((definition, context) => {
  if (!definition.capabilityId.startsWith("tool.")) {
    context.addIssue({
      code: "custom",
      message: "tool capabilityId must start with tool.",
      path: ["capabilityId"],
    });
  }
});

export const CapabilityDefinitionMaterialSchema = z.discriminatedUnion("kind", [
  ModelCapabilityDefinitionMaterialSchema,
  ToolCapabilityDefinitionMaterialSchema,
]);

export const ModelCapabilityDefinitionSchema = z.object({
  ...DefinitionCommonFields,
  kind: z.literal("model"),
  model: z.object({
    family: z.string().trim().min(1).max(120),
    inputModalities: z.array(z.enum(["text", "image", "audio"])).min(1),
    outputModalities: z.array(z.enum(["text", "image", "audio"])).min(1),
    contextWindow: z.number().int().positive().optional(),
    supportsStreaming: z.boolean(),
  }).strict(),
  revision: Sha256DigestSchema,
}).strict().superRefine((definition, context) => {
  if (!definition.capabilityId.startsWith("model.")) {
    context.addIssue({
      code: "custom",
      message: "model capabilityId must start with model.",
      path: ["capabilityId"],
    });
  }
});

export const ToolCapabilityDefinitionSchema = z.object({
  ...DefinitionCommonFields,
  kind: z.literal("tool"),
  tool: z.object({
    inputSchema: JsonObjectSchema,
    outputSchema: JsonObjectSchema.optional(),
    readOnlyHint: z.boolean(),
    risk: ToolRiskDeclarationSchema,
  }).strict(),
  revision: Sha256DigestSchema,
}).strict().superRefine((definition, context) => {
  if (!definition.capabilityId.startsWith("tool.")) {
    context.addIssue({
      code: "custom",
      message: "tool capabilityId must start with tool.",
      path: ["capabilityId"],
    });
  }
});

export const CapabilityDefinitionSchema = z.discriminatedUnion("kind", [
  ModelCapabilityDefinitionSchema,
  ToolCapabilityDefinitionSchema,
]);

export type ModelCapabilityDefinitionMaterial = z.infer<typeof ModelCapabilityDefinitionMaterialSchema>;
export type ToolCapabilityDefinitionMaterial = z.infer<typeof ToolCapabilityDefinitionMaterialSchema>;
export type CapabilityDefinitionMaterial = z.infer<typeof CapabilityDefinitionMaterialSchema>;
export type ModelCapabilityDefinition = z.infer<typeof ModelCapabilityDefinitionSchema>;
export type ToolCapabilityDefinition = z.infer<typeof ToolCapabilityDefinitionSchema>;
export type CapabilityDefinition = z.infer<typeof CapabilityDefinitionSchema>;
