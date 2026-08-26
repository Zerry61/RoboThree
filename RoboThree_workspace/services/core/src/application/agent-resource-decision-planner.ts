import {
  ModelCapabilityFactsSchema,
  Sha256DigestSchema,
  type RequiredModelCapabilities,
} from "@robothree/contracts";
import {
  AgentKnowledgeRestrictionRefV1Alpha2Schema,
  AgentModelRestrictionRefV1Alpha2Schema,
  AgentSkillRestrictionRefV1Alpha2Schema,
  AgentToolRestrictionRefV1Alpha2Schema,
  type AgentKnowledgeRestrictionRefV1Alpha2,
  type AgentModelRestrictionRefV1Alpha2,
  type AgentSkillRestrictionRefV1Alpha2,
  type AgentToolRestrictionRefV1Alpha2,
} from "@robothree/contracts/runtime-selection/agent-definition/v1alpha2";
import { z } from "zod";

import type { TaskToolCandidatePolicyResult } from "../ports/task-tool-candidate-policy.js";
import {
  ReadableAgentDefinitionInterpreter,
  parseReadableAgentDefinitionRevision,
  type ReadableAgentDefinitionRevision,
} from "./agent-definition-v1alpha2.js";
import {
  createAgentResourceDecisionV1,
  EntitledToolRefV1Schema,
  hasValidTaskResourceEntitlementSnapshotV1,
  type AgentResourceDecisionV1,
  type TaskResourceEntitlementSnapshotV1,
} from "./task-resource-entitlement.js";

export type AgentResourceDecisionPlannerErrorCode =
  | "selection.resource_facts_invalid"
  | "selection.entitlement_invalid"
  | "selection.registry_unavailable"
  | "selection.model_rejected"
  | "selection.model_unavailable"
  | "selection.skill_rejected"
  | "selection.knowledge_rejected"
  | "selection.knowledge_unavailable"
  | "selection.tool_policy_unavailable";

export class AgentResourceDecisionPlannerError extends Error {
  readonly safeSummary = "当前机器人或资源选择不可用";

  constructor(readonly code: AgentResourceDecisionPlannerErrorCode) {
    super(code);
    this.name = "AgentResourceDecisionPlannerError";
  }
}

const RegistryModelFactSchema = z.object({
  ref: AgentModelRestrictionRefV1Alpha2Schema,
  capabilities: ModelCapabilityFactsSchema,
  available: z.boolean(),
}).strict();
const RegistrySkillFactSchema = z.object({
  ref: AgentSkillRestrictionRefV1Alpha2Schema,
  available: z.boolean(),
  materialAvailable: z.boolean(),
}).strict();
const RegistryToolFactSchema = z.object({
  ref: AgentToolRestrictionRefV1Alpha2Schema,
  available: z.boolean(),
}).strict();
const RegistryKnowledgeFactSchema = z.object({
  ref: AgentKnowledgeRestrictionRefV1Alpha2Schema,
  available: z.boolean(),
  materialAvailable: z.boolean(),
}).strict();

export const AgentResourceRegistrySnapshotV1Schema = z.object({
  schemaVersion: z.literal("v1"),
  registryRevision: Sha256DigestSchema,
  models: z.array(RegistryModelFactSchema).max(64),
  skills: z.array(RegistrySkillFactSchema).max(64),
  tools: z.array(RegistryToolFactSchema).max(128),
  knowledge: z.array(RegistryKnowledgeFactSchema).max(64),
  knowledgeProviderReady: z.boolean(),
}).strict().superRefine((value, context) => {
  unique(value.models.map((entry) => entry.ref.modelId), "Model", context);
  unique(value.skills.map((entry) => entry.ref.skillId), "Skill", context);
  unique(value.tools.map((entry) => entry.ref.capabilityId), "Tool", context);
  unique(value.knowledge.map((entry) => entry.ref.knowledgeId), "Knowledge", context);
});

const ExactResourcePermissionsV1Schema = z.object({
  schemaVersion: z.literal("v1"),
  factsDigest: Sha256DigestSchema,
  models: z.array(AgentModelRestrictionRefV1Alpha2Schema).max(64),
  skills: z.array(AgentSkillRestrictionRefV1Alpha2Schema).max(64),
  tools: z.array(AgentToolRestrictionRefV1Alpha2Schema).max(128),
  knowledge: z.array(AgentKnowledgeRestrictionRefV1Alpha2Schema).max(64),
}).strict().superRefine((value, context) => {
  unique(value.models.map((entry) => entry.modelId), "Model", context);
  unique(value.skills.map((entry) => entry.skillId), "Skill", context);
  unique(value.tools.map((entry) => entry.capabilityId), "Tool", context);
  unique(value.knowledge.map((entry) => entry.knowledgeId), "Knowledge", context);
});

const AcceptedResourceSelectionV1Schema = z.object({
  requestedModelId: z.string().min(1).max(256).refine((id) => id.startsWith("model."))
    .optional(),
  selectedSkillRefs: z.array(AgentSkillRestrictionRefV1Alpha2Schema).max(64),
  selectedKnowledgeRefs: z.array(AgentKnowledgeRestrictionRefV1Alpha2Schema).max(64),
}).strict().superRefine((value, context) => {
  unique(value.selectedSkillRefs.map((entry) => entry.skillId), "Skill", context);
  unique(
    value.selectedKnowledgeRefs.map((entry) => entry.knowledgeId),
    "Knowledge",
    context,
  );
});

const TaskToolCandidateFactsV1Schema = z.object({
  registryRevision: Sha256DigestSchema,
  authorityFactsDigest: Sha256DigestSchema,
  candidates: z.array(EntitledToolRefV1Schema).max(128),
}).strict().superRefine((value, context) => {
  unique(value.candidates.map((entry) => entry.capabilityId), "Tool candidate", context);
});

export type AgentResourceRegistrySnapshotV1 = z.infer<
  typeof AgentResourceRegistrySnapshotV1Schema
>;
export type ExactResourcePermissionsV1 = z.infer<
  typeof ExactResourcePermissionsV1Schema
>;
export type AcceptedResourceSelectionV1 = z.infer<
  typeof AcceptedResourceSelectionV1Schema
>;

export type AgentResourceDecisionPlanInput = Readonly<{
  taskId: string;
  exactAgent: ReadableAgentDefinitionRevision;
  exactEntitlementSnapshot: TaskResourceEntitlementSnapshotV1;
  acceptedSelectionRequest: AcceptedResourceSelectionV1;
  exactUserModelPreference?: AgentModelRestrictionRefV1Alpha2;
  registrySnapshot: AgentResourceRegistrySnapshotV1;
  workspaceAndAuthorizationFacts: ExactResourcePermissionsV1;
  taskToolCandidates: TaskToolCandidatePolicyResult;
}>;

export class AgentResourceDecisionPlanner {
  readonly #interpreter = new ReadableAgentDefinitionInterpreter();

  plan(input: AgentResourceDecisionPlanInput): AgentResourceDecisionV1 {
    const parsed = this.#parse(input);
    const restrictions = this.#interpreter.interpret(parsed.agent);
    const skills = selectSkills(parsed.request.selectedSkillRefs, restrictions.skillRestriction,
      parsed.entitlement.skills, parsed.registry.skills, parsed.permissions.skills);
    const knowledge = selectKnowledge(
      parsed.request.selectedKnowledgeRefs,
      restrictions.knowledgeRestriction,
      parsed.entitlement.knowledge,
      parsed.registry.knowledge,
      parsed.permissions.knowledge,
      parsed.registry.knowledgeProviderReady,
    );
    const tools = selectTools(
      parsed.toolCandidates,
      restrictions.toolRestriction,
      parsed.entitlement.tools,
      parsed.registry.tools,
      parsed.permissions.tools,
    );
    const eligibleModels = parsed.entitlement.models.filter((entitled) => {
      if (!restrictionAllowsModel(restrictions.modelRestriction, entitled)) return false;
      const registered = parsed.registry.models.find((entry) => entry.ref.modelId === entitled.modelId);
      if (registered === undefined || !registered.available
        || !sameModelRef(registered.ref, entitled)) return false;
      if (!parsed.permissions.models.some((entry) => sameModelRef(entry, entitled))) return false;
      return satisfiesCapabilities(
        registered.capabilities,
        parsed.agent.requiredModelCapabilities,
        tools.length > 0,
      );
    });

    const selected = selectModel(
      parsed.request.requestedModelId,
      parsed.preference,
      eligibleModels,
    );
    return createAgentResourceDecisionV1({
      schemaVersion: "v1",
      taskId: input.taskId,
      agentRef: restrictions.exactAgentRef,
      entitlementSnapshotDigest: parsed.entitlement.snapshotDigest,
      registryRevision: parsed.registry.registryRevision,
      modelSelectionSource: selected.source,
      ...(selected.source === "explicit"
        ? { requestedModelId: selected.ref.modelId }
        : {}),
      resolvedModelRef: exactModelRef(selected.ref),
      activeSkillRefs: skills,
      toolCandidateRefs: tools,
      knowledgeRefs: knowledge,
    });
  }

  #parse(input: AgentResourceDecisionPlanInput) {
    try {
      const agent = parseReadableAgentDefinitionRevision(input.exactAgent);
      const entitlement = input.exactEntitlementSnapshot;
      if (!hasValidTaskResourceEntitlementSnapshotV1(entitlement)) {
        throw new AgentResourceDecisionPlannerError("selection.entitlement_invalid");
      }
      const request = AcceptedResourceSelectionV1Schema.parse(input.acceptedSelectionRequest);
      const registry = AgentResourceRegistrySnapshotV1Schema.parse(input.registrySnapshot);
      requireRegistryExactness(entitlement, registry);
      const permissions = ExactResourcePermissionsV1Schema.parse(
        input.workspaceAndAuthorizationFacts,
      );
      const preference = input.exactUserModelPreference === undefined
        ? undefined
        : AgentModelRestrictionRefV1Alpha2Schema.parse(input.exactUserModelPreference);
      const toolCandidateFacts = TaskToolCandidateFactsV1Schema.parse(
        input.taskToolCandidates,
      );
      if (toolCandidateFacts.registryRevision !== registry.registryRevision) {
        throw new AgentResourceDecisionPlannerError("selection.tool_policy_unavailable");
      }
      return { agent, entitlement, request, registry, permissions, preference,
        toolCandidates: toolCandidateFacts.candidates };
    } catch (error) {
      if (error instanceof AgentResourceDecisionPlannerError) throw error;
      throw new AgentResourceDecisionPlannerError("selection.resource_facts_invalid");
    }
  }
}

function selectModel(
  requestedModelId: string | undefined,
  preference: AgentModelRestrictionRefV1Alpha2 | undefined,
  eligible: readonly TaskResourceEntitlementSnapshotV1["models"][number][],
) {
  if (requestedModelId !== undefined) {
    const match = eligible.find((entry) => entry.modelId === requestedModelId);
    if (match === undefined) {
      throw new AgentResourceDecisionPlannerError("selection.model_rejected");
    }
    return { source: "explicit" as const, ref: match };
  }
  if (preference !== undefined) {
    const match = eligible.find((entry) => sameModelRef(entry, preference));
    if (match !== undefined) return { source: "user_preference" as const, ref: match };
  }
  const fallback = eligible[0];
  if (fallback === undefined) {
    throw new AgentResourceDecisionPlannerError("selection.model_unavailable");
  }
  return { source: "stable_fallback" as const, ref: fallback };
}

function selectSkills(
  requested: readonly AgentSkillRestrictionRefV1Alpha2[],
  restriction: ReturnType<ReadableAgentDefinitionInterpreter["interpret"]>["skillRestriction"],
  entitlement: TaskResourceEntitlementSnapshotV1["skills"],
  registry: AgentResourceRegistrySnapshotV1["skills"],
  permissions: ExactResourcePermissionsV1["skills"],
): AgentSkillRestrictionRefV1Alpha2[] {
  if (restriction.mode === "allowlist" && restriction.references.length === 0) {
    if (requested.length > 0) {
      throw new AgentResourceDecisionPlannerError("selection.skill_rejected");
    }
    return [];
  }
  return requested.map((ref) => {
    const allowed = restriction.mode === "unrestricted"
      || restriction.references.some((entry) => sameSkillRef(entry, ref));
    const entitled = entitlement.some((entry) => sameSkillRef(entry, ref));
    const permitted = permissions.some((entry) => sameSkillRef(entry, ref));
    const registered = registry.find((entry) => entry.ref.skillId === ref.skillId);
    if (!allowed || !entitled || !permitted || registered === undefined
      || !registered.available || !registered.materialAvailable
      || !sameSkillRef(registered.ref, ref)) {
      throw new AgentResourceDecisionPlannerError("selection.skill_rejected");
    }
    return ref;
  }).sort((left, right) => compareAscii(left.skillId, right.skillId));
}

function selectKnowledge(
  requested: readonly AgentKnowledgeRestrictionRefV1Alpha2[],
  restriction: ReturnType<ReadableAgentDefinitionInterpreter["interpret"]>["knowledgeRestriction"],
  entitlement: TaskResourceEntitlementSnapshotV1["knowledge"],
  registry: AgentResourceRegistrySnapshotV1["knowledge"],
  permissions: ExactResourcePermissionsV1["knowledge"],
  providerReady: boolean,
): AgentKnowledgeRestrictionRefV1Alpha2[] {
  if (restriction.mode === "allowlist" && restriction.references.length === 0) {
    if (requested.length > 0) {
      throw new AgentResourceDecisionPlannerError("selection.knowledge_rejected");
    }
    return [];
  }
  if (requested.length > 0 && !providerReady) {
    throw new AgentResourceDecisionPlannerError("selection.knowledge_unavailable");
  }
  return requested.map((ref) => {
    const allowed = restriction.mode === "unrestricted"
      || restriction.references.some((entry) => sameKnowledgeRef(entry, ref));
    const entitled = entitlement.some((entry) => sameKnowledgeRef(entry, ref));
    const permitted = permissions.some((entry) => sameKnowledgeRef(entry, ref));
    const registered = registry.find((entry) => entry.ref.knowledgeId === ref.knowledgeId);
    if (!allowed || !entitled || !permitted || registered === undefined
      || !registered.available || !registered.materialAvailable
      || !sameKnowledgeRef(registered.ref, ref)) {
      throw new AgentResourceDecisionPlannerError("selection.knowledge_rejected");
    }
    return ref;
  }).sort((left, right) => compareAscii(left.knowledgeId, right.knowledgeId));
}

function selectTools(
  candidates: readonly TaskResourceEntitlementSnapshotV1["tools"][number][],
  restriction: ReturnType<ReadableAgentDefinitionInterpreter["interpret"]>["toolRestriction"],
  entitlement: TaskResourceEntitlementSnapshotV1["tools"],
  registry: AgentResourceRegistrySnapshotV1["tools"],
  permissions: ExactResourcePermissionsV1["tools"],
): AgentToolRestrictionRefV1Alpha2[] {
  if (restriction.mode === "allowlist" && restriction.references.length === 0) return [];
  const result = candidates.filter((ref) => {
    const allowed = restriction.mode === "unrestricted"
      || restriction.references.some((entry) => sameToolRef(entry, ref));
    const entitled = entitlement.some((entry) => sameToolRef(entry, ref));
    const permitted = permissions.some((entry) => sameToolRef(entry, ref));
    const registered = registry.find((entry) => entry.ref.capabilityId === ref.capabilityId);
    return allowed && entitled && permitted && registered?.available === true
      && sameToolRef(registered.ref, ref);
  });
  if (result.length !== candidates.length) {
    throw new AgentResourceDecisionPlannerError("selection.tool_policy_unavailable");
  }
  return result.map((ref) => ({
    capabilityId: ref.capabilityId,
    capabilityRevision: ref.capabilityRevision,
  })).sort((left, right) => compareAscii(left.capabilityId, right.capabilityId));
}

function restrictionAllowsModel(
  restriction: ReturnType<ReadableAgentDefinitionInterpreter["interpret"]>["modelRestriction"],
  ref: AgentModelRestrictionRefV1Alpha2,
): boolean {
  if (restriction.mode === "unrestricted") return true;
  if (restriction.mode === "single_model_id") return restriction.modelId === ref.modelId;
  return restriction.references.some((entry) => sameModelRef(entry, ref));
}

function satisfiesCapabilities(
  actual: z.infer<typeof ModelCapabilityFactsSchema>,
  required: RequiredModelCapabilities,
  toolsSelected: boolean,
): boolean {
  return containsAll(actual.inputModalities, required.inputModalities)
    && containsAll(actual.outputModalities, required.outputModalities)
    && (!required.supportsStreaming || actual.supportsStreaming)
    && (!(required.supportsToolCalling || toolsSelected) || actual.supportsToolCalling)
    && (required.minimumContextWindow === undefined
      || actual.contextWindow >= required.minimumContextWindow);
}

function exactModelRef(ref: AgentModelRestrictionRefV1Alpha2) {
  return { modelId: ref.modelId, revision: ref.revision, digest: ref.digest };
}

function sameModelRef(left: AgentModelRestrictionRefV1Alpha2, right: AgentModelRestrictionRefV1Alpha2) {
  return left.modelId === right.modelId && left.revision === right.revision
    && left.digest === right.digest;
}
function sameSkillRef(left: AgentSkillRestrictionRefV1Alpha2, right: AgentSkillRestrictionRefV1Alpha2) {
  return left.skillId === right.skillId && left.revision === right.revision
    && left.contentDigest === right.contentDigest;
}
function sameToolRef(left: AgentToolRestrictionRefV1Alpha2, right: AgentToolRestrictionRefV1Alpha2) {
  return left.capabilityId === right.capabilityId
    && left.capabilityRevision === right.capabilityRevision;
}
function sameKnowledgeRef(
  left: AgentKnowledgeRestrictionRefV1Alpha2,
  right: AgentKnowledgeRestrictionRefV1Alpha2,
) {
  return left.knowledgeId === right.knowledgeId && left.revision === right.revision
    && left.contentDigest === right.contentDigest;
}
function containsAll(actual: readonly string[], required: readonly string[]) {
  const values = new Set(actual);
  return required.every((value) => values.has(value));
}
function unique(ids: readonly string[], label: string, context: z.RefinementCtx) {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: `${label} fact IDs must be unique` });
  }
}
function compareAscii(left: string, right: string) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function requireRegistryExactness(
  entitlement: TaskResourceEntitlementSnapshotV1,
  registry: AgentResourceRegistrySnapshotV1,
): void {
  const drifted = entitlement.models.some((ref) => {
    const fact = registry.models.find((entry) => entry.ref.modelId === ref.modelId);
    return fact !== undefined && !sameModelRef(fact.ref, ref);
  }) || entitlement.skills.some((ref) => {
    const fact = registry.skills.find((entry) => entry.ref.skillId === ref.skillId);
    return fact !== undefined && !sameSkillRef(fact.ref, ref);
  }) || entitlement.tools.some((ref) => {
    const fact = registry.tools.find((entry) => entry.ref.capabilityId === ref.capabilityId);
    return fact !== undefined && !sameToolRef(fact.ref, ref);
  }) || entitlement.knowledge.some((ref) => {
    const fact = registry.knowledge.find((entry) => entry.ref.knowledgeId === ref.knowledgeId);
    return fact !== undefined && !sameKnowledgeRef(fact.ref, ref);
  });
  if (drifted) {
    throw new AgentResourceDecisionPlannerError("selection.registry_unavailable");
  }
}
