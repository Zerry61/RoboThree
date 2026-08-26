import {
  AgentDefinitionRevisionSchema,
  JsonValueSchema,
  type AgentDefinitionRevision,
} from "@robothree/contracts";
import {
  AgentDefinitionRevisionV1Alpha2MaterialSchema,
  AgentDefinitionRevisionV1Alpha2Schema,
  type AgentDefinitionManagementClassV1Alpha2,
  type AgentDefinitionRevisionV1Alpha2,
  type AgentDefinitionRevisionV1Alpha2Material,
  type AgentKnowledgeRestrictionV1Alpha2,
  type AgentModelRestrictionV1Alpha2,
  type AgentSkillRestrictionV1Alpha2,
  type AgentToolRestrictionV1Alpha2,
} from "@robothree/contracts/runtime-selection/agent-definition/v1alpha2";

import { sha256CanonicalJson } from "../persistence/digest.js";
import { hasValidAgentDefinitionRevision } from "./runtime-selection-revisions.js";

export const AGENT_DEFINITION_REVISION_V1ALPHA2_DIGEST_DOMAIN =
  "robothree.agent-definition-revision.v1alpha2\n" as const;

export const AGENT_DEFINITION_V1ALPHA2_PRODUCTION_CONSUMER_ENABLED = false;

export type AgentDefinitionCompatibilityErrorCode =
  | "selection.agent_definition_version_unsupported"
  | "selection.agent_definition_invalid"
  | "selection.agent_definition_digest_mismatch"
  | "selection.agent_restriction_invalid"
  | "selection.agent_restriction_duplicate"
  | "selection.agent_restriction_reference_invalid"
  | "selection.legacy_agent_model_revision_unresolved";

export class AgentDefinitionCompatibilityError extends Error {
  readonly code: AgentDefinitionCompatibilityErrorCode;
  readonly safeSummary: string;

  constructor(code: AgentDefinitionCompatibilityErrorCode) {
    super(code);
    this.name = "AgentDefinitionCompatibilityError";
    this.code = code;
    this.safeSummary = "机器人资源限制不可用或不一致";
  }
}

export const LegacySingleModelIdRestrictionSchemaVersion = "v1alpha1" as const;

export type LegacySingleModelIdRestriction = Readonly<{
  mode: "single_model_id";
  modelId: string;
}>;

export type InterpretedAgentModelRestriction =
  | AgentModelRestrictionV1Alpha2
  | LegacySingleModelIdRestriction;

export type InterpretedAgentDefinitionRestrictions = Readonly<{
  sourceSchemaVersion: "v1alpha1" | "v1alpha2";
  exactAgentRef: Readonly<{
    agentDefinitionId: string;
    revision: string;
    digest: string;
  }>;
  managementClass: AgentDefinitionManagementClassV1Alpha2;
  modelRestriction: InterpretedAgentModelRestriction;
  skillRestriction: AgentSkillRestrictionV1Alpha2;
  toolRestriction: AgentToolRestrictionV1Alpha2;
  knowledgeRestriction: AgentKnowledgeRestrictionV1Alpha2;
}>;

export type ReadableAgentDefinitionRevision =
  | AgentDefinitionRevision
  | AgentDefinitionRevisionV1Alpha2;

export function calculateAgentDefinitionRevisionV1Alpha2Digest(
  material: AgentDefinitionRevisionV1Alpha2Material,
): string {
  const parsed = AgentDefinitionRevisionV1Alpha2MaterialSchema.parse(material);
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: AGENT_DEFINITION_REVISION_V1ALPHA2_DIGEST_DOMAIN,
    material: parsed,
  }));
}

export function createAgentDefinitionRevisionV1Alpha2(
  material: AgentDefinitionRevisionV1Alpha2Material,
): AgentDefinitionRevisionV1Alpha2 {
  const parsed = AgentDefinitionRevisionV1Alpha2MaterialSchema.parse(material);
  const digest = calculateAgentDefinitionRevisionV1Alpha2Digest(parsed);
  return AgentDefinitionRevisionV1Alpha2Schema.parse({
    ...parsed,
    revision: digest,
    digest,
  });
}

export function hasValidAgentDefinitionRevisionV1Alpha2(
  input: AgentDefinitionRevisionV1Alpha2,
): boolean {
  const parsed = AgentDefinitionRevisionV1Alpha2Schema.parse(input);
  const { revision: _revision, digest, ...material } = parsed;
  return digest === calculateAgentDefinitionRevisionV1Alpha2Digest(material);
}

export class ReadableAgentDefinitionInterpreter {
  interpret(input: unknown): InterpretedAgentDefinitionRestrictions {
    const parsed = parseReadableAgentDefinitionRevision(input);
    if (parsed.schemaVersion === "v1alpha1") return interpretV1Alpha1(parsed);
    if (parsed.schemaVersion === "v1alpha2") return interpretV1Alpha2(parsed);
    throw new AgentDefinitionCompatibilityError(
      "selection.agent_definition_version_unsupported",
    );
  }
}

export function parseReadableAgentDefinitionRevision(
  input: unknown,
): ReadableAgentDefinitionRevision {
  const schemaVersion = readSchemaVersion(input);
  try {
    if (schemaVersion === "v1alpha1") {
      const parsed = AgentDefinitionRevisionSchema.parse(input);
      if (!hasValidAgentDefinitionRevision(parsed)) {
        throw new AgentDefinitionCompatibilityError(
          "selection.agent_definition_digest_mismatch",
        );
      }
      return parsed;
    }
    if (schemaVersion === "v1alpha2") {
      const parsed = AgentDefinitionRevisionV1Alpha2Schema.parse(input);
      if (!hasValidAgentDefinitionRevisionV1Alpha2(parsed)) {
        throw new AgentDefinitionCompatibilityError(
          "selection.agent_definition_digest_mismatch",
        );
      }
      return parsed;
    }
  } catch (error) {
    if (error instanceof AgentDefinitionCompatibilityError) throw error;
    throw new AgentDefinitionCompatibilityError("selection.agent_definition_invalid");
  }
  throw new AgentDefinitionCompatibilityError(
    "selection.agent_definition_version_unsupported",
  );
}

function interpretV1Alpha1(input: unknown): InterpretedAgentDefinitionRestrictions {
  let parsed: AgentDefinitionRevision;
  try {
    parsed = AgentDefinitionRevisionSchema.parse(input);
  } catch {
    throw new AgentDefinitionCompatibilityError("selection.agent_definition_invalid");
  }
  if (!hasValidAgentDefinitionRevision(parsed)) {
    throw new AgentDefinitionCompatibilityError(
      "selection.agent_definition_digest_mismatch",
    );
  }

  const modelRestriction: InterpretedAgentModelRestriction = parsed.allowModelOverride
    ? Object.freeze({ mode: "unrestricted" })
    : Object.freeze({
      mode: "single_model_id",
      modelId: parsed.defaultModelId,
    });

  return Object.freeze({
    sourceSchemaVersion: "v1alpha1",
    exactAgentRef: Object.freeze({
      agentDefinitionId: parsed.agentDefinitionId,
      revision: parsed.revision,
      digest: parsed.digest,
    }),
    managementClass: "managed",
    modelRestriction,
    skillRestriction: Object.freeze({
      mode: "allowlist",
      references: parsed.skillReferences.map((reference) => Object.freeze({
        skillId: reference.id,
        revision: reference.revision,
        contentDigest: reference.contentDigest,
      })),
    }),
    toolRestriction: Object.freeze({
      mode: "allowlist",
      references: parsed.toolReferences.map((reference) => Object.freeze({
        capabilityId: reference.capabilityId,
        capabilityRevision: reference.capabilityRevision,
      })),
    }),
    knowledgeRestriction: Object.freeze({
      mode: "allowlist",
      references: parsed.knowledgeReferences.map((reference) => Object.freeze({
        knowledgeId: reference.id,
        revision: reference.revision,
        contentDigest: reference.contentDigest,
      })),
    }),
  });
}

function interpretV1Alpha2(input: unknown): InterpretedAgentDefinitionRestrictions {
  let parsed: AgentDefinitionRevisionV1Alpha2;
  try {
    parsed = AgentDefinitionRevisionV1Alpha2Schema.parse(input);
  } catch {
    throw new AgentDefinitionCompatibilityError("selection.agent_definition_invalid");
  }
  if (!hasValidAgentDefinitionRevisionV1Alpha2(parsed)) {
    throw new AgentDefinitionCompatibilityError(
      "selection.agent_definition_digest_mismatch",
    );
  }
  return Object.freeze({
    sourceSchemaVersion: "v1alpha2",
    exactAgentRef: Object.freeze({
      agentDefinitionId: parsed.agentDefinitionId,
      revision: parsed.revision,
      digest: parsed.digest,
    }),
    managementClass: parsed.managementClass,
    modelRestriction: parsed.modelRestriction,
    skillRestriction: parsed.skillRestriction,
    toolRestriction: parsed.toolRestriction,
    knowledgeRestriction: parsed.knowledgeRestriction,
  });
}

function readSchemaVersion(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new AgentDefinitionCompatibilityError("selection.agent_definition_invalid");
  }
  return Reflect.get(input, "schemaVersion");
}
