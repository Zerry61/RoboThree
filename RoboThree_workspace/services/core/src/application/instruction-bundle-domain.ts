import {
  DesktopResourceIdSchema,
  EntityIdSchema,
  JsonValueSchema,
  MaterializedResourceRevisionSchema,
  Sha256DigestSchema,
  type MaterializedResourceRevision,
  type Sha256Digest,
} from "@robothree/contracts";
import type { ReadableTaskRuntimeSelectionV1Alpha3 } from
  "@robothree/contracts/runtime-selection/v1alpha3";
import type { TaskRuntimeSelectionV1Alpha4 } from
  "@robothree/contracts/runtime-selection/v1alpha4";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";
import { parseReadableTaskRuntimeSelectionV1Alpha3 } from
  "./runtime-selection-revisions.js";

const TASK_INSTRUCTION_BINDING_DIGEST_DOMAIN =
  "robothree.task-instruction-binding.v1\n";
const INSTRUCTION_SOURCE_DIGEST_DOMAIN = "robothree.instruction-source.v1\n";
const INSTRUCTION_BUNDLE_DIGEST_DOMAIN = "robothree.instruction-bundle.v1\n";

const InstructionSourceKindSchema = z.enum([
  "platform",
  "task_boundary",
  "agent",
  "skill",
]);
const InstructionAuthorityModeSchema = z.enum(["hard", "role", "advisory"]);

// v1-v1alpha3 durable selections keep their historical Core-private
// materializedRef. Runtime Selection v1alpha4 deliberately removed local
// handles, so its additive readable form persists only the portable exact ref.
const PortableLockedSkillRevisionSchema = z.object({
  id: DesktopResourceIdSchema,
  revision: Sha256DigestSchema,
  contentDigest: Sha256DigestSchema,
}).strict();

const LockedSkillRevisionSchema = z.union([
  MaterializedResourceRevisionSchema,
  PortableLockedSkillRevisionSchema,
]);

const InstructionSourceIdentitySchema = z.object({
  sourceKind: InstructionSourceKindSchema,
  sourceId: z.string().trim().min(1).max(240),
  sourceRevision: z.string().trim().min(1).max(240),
  sourceDigest: Sha256DigestSchema,
  ordinal: z.number().int().nonnegative(),
  authorityMode: InstructionAuthorityModeSchema,
}).strict();

export const InstructionSourceV1Schema = z.object({
  ...InstructionSourceIdentitySchema.shape,
  content: z.string().min(1).max(256 * 1024),
}).strict();

const TaskInstructionBindingFields = {
  schemaVersion: z.literal("v1"),
  taskId: EntityIdSchema,
  runtimeSelectionId: EntityIdSchema,
  runtimeSelectionDigest: Sha256DigestSchema,
  submitTurnBundleDigest: Sha256DigestSchema,
  platformPromptRevision: Sha256DigestSchema,
  agentRevision: Sha256DigestSchema,
  agentDigest: Sha256DigestSchema,
  orderedSkillRefs: z.array(LockedSkillRevisionSchema).max(64),
  assemblyRevision: Sha256DigestSchema,
};

const TaskInstructionBindingMaterialSchema = z.object(
  TaskInstructionBindingFields,
).strict();

export const TaskInstructionBindingV1Schema = z.object({
  ...TaskInstructionBindingFields,
  bindingDigest: Sha256DigestSchema,
}).strict();

const InstructionBundleDescriptorFields = {
  schemaVersion: z.literal("v1"),
  assemblyRevision: Sha256DigestSchema,
  taskInstructionBindingDigest: Sha256DigestSchema,
  orderedSources: z.array(InstructionSourceIdentitySchema).min(3).max(67),
};

const InstructionBundleDescriptorMaterialSchema = z.object(
  InstructionBundleDescriptorFields,
).strict();

export const InstructionBundleDescriptorV1Schema = z.object({
  ...InstructionBundleDescriptorFields,
  instructionBundleDigest: Sha256DigestSchema,
}).strict();

const assemblyMaterial = Object.freeze({
  schemaVersion: "v1",
  wrapper: "RoboThree Instruction Bundle v1",
  output: "one_provider_neutral_system_message",
  ordering: ["platform:0", "task_boundary:10", "agent:20", "skill:30+locked_index"],
  escaping: "canonical_json_string",
  dynamicFacts: "excluded",
  references: "excluded",
});

export const CPC1_INSTRUCTION_ASSEMBLY_REVISION = sha256CanonicalJson(
  JsonValueSchema.parse(assemblyMaterial),
);

export const CPC_INSTRUCTION_FOUNDATION_DEFAULT_ENABLED = false as const;

export type InstructionSourceKind = z.infer<typeof InstructionSourceKindSchema>;
export type InstructionAuthorityMode = z.infer<typeof InstructionAuthorityModeSchema>;
export type InstructionSourceV1 = z.infer<typeof InstructionSourceV1Schema>;
export type TaskInstructionBindingV1 = z.infer<typeof TaskInstructionBindingV1Schema>;
export type InstructionBundleDescriptorV1 = z.infer<
  typeof InstructionBundleDescriptorV1Schema
>;

export function calculateInstructionContentDigest(content: string): Sha256Digest {
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: INSTRUCTION_SOURCE_DIGEST_DOMAIN,
    content,
  }));
}

export function createInstructionSourceV1(
  material: Omit<InstructionSourceV1, "sourceDigest"> & Readonly<{
    sourceDigest?: Sha256Digest;
  }>,
): InstructionSourceV1 {
  const calculatedDigest = calculateInstructionContentDigest(material.content);
  if (material.sourceDigest !== undefined && material.sourceDigest !== calculatedDigest) {
    throw new CpcInstructionFoundationError(
      "context.instruction_source_invalid",
      "Instruction source content digest is invalid",
    );
  }
  return InstructionSourceV1Schema.parse({
    ...material,
    sourceDigest: calculatedDigest,
  });
}

export function deriveTaskInstructionBindingV1(input: Readonly<{
  runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha3;
  submitTurnBundleDigest: string;
  assemblyRevision?: string;
}>): TaskInstructionBindingV1 {
  let selection: ReadableTaskRuntimeSelectionV1Alpha3;
  try {
    selection = parseReadableTaskRuntimeSelectionV1Alpha3(input.runtimeSelection);
  } catch {
    throw new CpcInstructionFoundationError(
      "context.instruction_binding_invalid",
      "Task runtime selection cannot prove an exact instruction binding",
    );
  }
  return deriveTaskInstructionBindingV1FromValidatedSelection({
    runtimeSelection: selection,
    submitTurnBundleDigest: input.submitTurnBundleDigest,
    ...(input.assemblyRevision === undefined
      ? {}
      : { assemblyRevision: input.assemblyRevision }),
  });
}

export function deriveTaskInstructionBindingV1FromValidatedSelection(
  input: Readonly<{
    runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha3;
    submitTurnBundleDigest: string;
    assemblyRevision?: string;
  }>,
): TaskInstructionBindingV1 {
  const selection = input.runtimeSelection;
  const material = TaskInstructionBindingMaterialSchema.parse({
    schemaVersion: "v1",
    taskId: selection.taskId,
    runtimeSelectionId: selection.runtimeSelectionId,
    runtimeSelectionDigest: selection.selectionDigest,
    submitTurnBundleDigest: Sha256DigestSchema.parse(input.submitTurnBundleDigest),
    platformPromptRevision: selection.platformPromptRevision,
    agentRevision: selection.agent.revision,
    agentDigest: selection.agent.digest,
    orderedSkillRefs: portableInstructionSkillRefs(selection.activeSkillRevisions),
    assemblyRevision: Sha256DigestSchema.parse(
      input.assemblyRevision ?? CPC1_INSTRUCTION_ASSEMBLY_REVISION,
    ),
  });
  return TaskInstructionBindingV1Schema.parse({
    ...material,
    bindingDigest: calculateTaskInstructionBindingDigest(material),
  });
}

export function deriveTaskInstructionBindingV1FromValidatedSelectionV1Alpha4(
  input: Readonly<{
    runtimeSelection: TaskRuntimeSelectionV1Alpha4;
    submitTurnBundleDigest: string;
    assemblyRevision?: string;
  }>,
): TaskInstructionBindingV1 {
  const selection = input.runtimeSelection;
  const material = TaskInstructionBindingMaterialSchema.parse({
    schemaVersion: "v1",
    taskId: selection.taskId,
    runtimeSelectionId: selection.runtimeSelectionId,
    runtimeSelectionDigest: selection.selectionDigest,
    submitTurnBundleDigest: Sha256DigestSchema.parse(input.submitTurnBundleDigest),
    platformPromptRevision: selection.platformPromptRevision,
    agentRevision: selection.agent.revision,
    agentDigest: selection.agent.digest,
    orderedSkillRefs: portableInstructionSkillRefs(selection.activeSkillRevisions),
    assemblyRevision: Sha256DigestSchema.parse(
      input.assemblyRevision ?? CPC1_INSTRUCTION_ASSEMBLY_REVISION,
    ),
  });
  return TaskInstructionBindingV1Schema.parse({
    ...material,
    bindingDigest: calculateTaskInstructionBindingDigest(material),
  });
}

export function validateTaskInstructionBindingV1(
  input: TaskInstructionBindingV1,
): TaskInstructionBindingV1 {
  const parsed = TaskInstructionBindingV1Schema.parse(input);
  const { bindingDigest, ...material } = parsed;
  if (bindingDigest !== calculateTaskInstructionBindingDigest(material)) {
    throw new CpcInstructionFoundationError(
      "context.instruction_binding_invalid",
      "Task instruction binding digest is invalid",
    );
  }
  return parsed;
}

function portableInstructionSkillRefs(
  references: readonly Readonly<{
    revision: string;
    contentDigest: string;
    id?: string;
    skillId?: string;
    materializedRef?: string;
  }>[],
) {
  return references.map((reference) => reference.skillId === undefined
    ? reference
    : {
      id: reference.skillId,
      revision: reference.revision,
      contentDigest: reference.contentDigest,
    });
}

export function createInstructionBundleDescriptorV1(input: Readonly<{
  binding: TaskInstructionBindingV1;
  orderedSources: readonly InstructionSourceV1[];
}>): InstructionBundleDescriptorV1 {
  const binding = validateTaskInstructionBindingV1(input.binding);
  const orderedSources = input.orderedSources.map((source) => {
    const parsed = InstructionSourceV1Schema.parse(source);
    const { content: _content, ...identity } = parsed;
    return identity;
  });
  const material = InstructionBundleDescriptorMaterialSchema.parse({
    schemaVersion: "v1",
    assemblyRevision: binding.assemblyRevision,
    taskInstructionBindingDigest: binding.bindingDigest,
    orderedSources,
  });
  return InstructionBundleDescriptorV1Schema.parse({
    ...material,
    instructionBundleDigest: calculateInstructionBundleDigest(material),
  });
}

export function validateInstructionBundleDescriptorV1(
  input: InstructionBundleDescriptorV1,
): InstructionBundleDescriptorV1 {
  const parsed = InstructionBundleDescriptorV1Schema.parse(input);
  const { instructionBundleDigest, ...material } = parsed;
  if (instructionBundleDigest !== calculateInstructionBundleDigest(material)) {
    throw new CpcInstructionFoundationError(
      "context.instruction_bundle_invalid",
      "Instruction bundle descriptor digest is invalid",
    );
  }
  return parsed;
}

function calculateTaskInstructionBindingDigest(
  material: z.infer<typeof TaskInstructionBindingMaterialSchema>,
): Sha256Digest {
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: TASK_INSTRUCTION_BINDING_DIGEST_DOMAIN,
    material,
  }));
}

function calculateInstructionBundleDigest(
  material: z.infer<typeof InstructionBundleDescriptorMaterialSchema>,
): Sha256Digest {
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: INSTRUCTION_BUNDLE_DIGEST_DOMAIN,
    material,
  }));
}

export type CpcInstructionFoundationErrorCode =
  | "context.platform_prompt_unavailable"
  | "context.instruction_runtime_unavailable"
  | "context.instruction_binding_invalid"
  | "context.instruction_source_invalid"
  | "context.instruction_bundle_invalid"
  | "context.agent_material_invalid"
  | "context.skill_material_unavailable"
  | "context.skill_material_invalid"
  | "context.locked_instructions_too_large";

export class CpcInstructionFoundationError extends Error {
  public constructor(
    public readonly code: CpcInstructionFoundationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CpcInstructionFoundationError";
  }
}

export const CpcInstructionFoundationDomainConstants = Object.freeze({
  taskInstructionBindingDigestDomain: TASK_INSTRUCTION_BINDING_DIGEST_DOMAIN,
  instructionSourceDigestDomain: INSTRUCTION_SOURCE_DIGEST_DOMAIN,
  instructionBundleDigestDomain: INSTRUCTION_BUNDLE_DIGEST_DOMAIN,
  assemblyRevision: CPC1_INSTRUCTION_ASSEMBLY_REVISION,
  defaultEnabled: CPC_INSTRUCTION_FOUNDATION_DEFAULT_ENABLED,
});

export function copySkillReferences(
  references: readonly MaterializedResourceRevision[],
): readonly MaterializedResourceRevision[] {
  return references.map((reference) => MaterializedResourceRevisionSchema.parse(reference));
}
