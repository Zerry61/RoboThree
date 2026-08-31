import type {
  PublishedRobotReleasePage,
  RobotDraftDetail,
} from "@robothree/contracts/agent-lifecycle/v1alpha1";
import type { AgentDefinitionRevisionV1Alpha2 } from
  "@robothree/contracts/runtime-selection/agent-definition/v1alpha2";
import type { AgentDefinitionRevision } from "@robothree/contracts";

import { createAgentDefinitionRevisionV1Alpha2 } from "./agent-definition-v1alpha2.js";
import { createAgentDefinitionRevision } from "./runtime-selection-revisions.js";

/** In-memory exact source for Central-published robots and the user's current test draft. */
export class InternalTrialAgentLifecycleSource {
  readonly #revisions = new Map<string, Map<string, AgentDefinitionRevisionV1Alpha2>>();
  readonly #active = new Map<string, string>();

  registerPublished(page: PublishedRobotReleasePage): void {
    for (const release of page.items) {
      this.#put(release.agentPackage.agentDefinition, true);
    }
  }

  catalogProjection(
    agent: AgentDefinitionRevisionV1Alpha2,
    fallbackModelId: string,
  ): AgentDefinitionRevision {
    const modelReferences = agent.modelRestriction.mode === "allowlist"
      ? agent.modelRestriction.references
      : [];
    const defaultModelId = modelReferences[0]?.modelId ?? fallbackModelId;
    return createAgentDefinitionRevision({
      schemaVersion: "v1alpha1",
      agentDefinitionId: agent.agentDefinitionId,
      name: agent.name,
      identity: agent.identity,
      goal: agent.goal,
      instructions: agent.instructions,
      defaultModelId,
      allowModelOverride: agent.modelRestriction.mode === "unrestricted",
      skillReferences: agent.skillRestriction.mode === "allowlist"
        ? agent.skillRestriction.references.map((reference) => ({
          id: reference.skillId,
          revision: reference.revision,
          contentDigest: reference.contentDigest,
          materializedRef: `central-agent-lifecycle:${reference.skillId}@${reference.revision}`,
        }))
        : [],
      toolReferences: agent.toolRestriction.mode === "allowlist"
        ? agent.toolRestriction.references
        : [],
      knowledgeReferences: agent.knowledgeRestriction.mode === "allowlist"
        ? agent.knowledgeRestriction.references.map((reference) => ({
          id: reference.knowledgeId,
          revision: reference.revision,
          contentDigest: reference.contentDigest,
          materializedRef: `central-agent-lifecycle:${reference.knowledgeId}@${reference.revision}`,
        }))
        : [],
      requiredModelCapabilities: agent.requiredModelCapabilities,
      createdAt: agent.createdAt,
    });
  }

  registerDraft(detail: RobotDraftDetail): AgentDefinitionRevisionV1Alpha2 {
    const material = detail.material;
    const agent = createAgentDefinitionRevisionV1Alpha2({
      schemaVersion: "v1alpha2",
      agentDefinitionId: material.robotId,
      managementClass: "managed",
      name: material.name,
      identity: material.description ?? material.name,
      goal: material.description ?? `按 ${material.name} 的规则完成用户任务。`,
      instructions: material.behaviorRules ?? "准确完成用户任务，不编造执行结果。",
      modelRestriction: restriction(material.modelRestriction),
      skillRestriction: restriction(material.skillRestriction),
      toolRestriction: restriction(material.toolRestriction),
      knowledgeRestriction: restriction(material.knowledgeRestriction),
      requiredModelCapabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportsToolCalling: material.toolRestriction.enabled
          && material.toolRestriction.selectedReferences.length > 0,
        supportsStreaming: false,
      },
      createdAt: detail.updatedAt,
    });
    this.#put(agent, true);
    return agent;
  }

  async loadActiveAgent(agentDefinitionId: string) {
    const revision = this.#active.get(agentDefinitionId);
    return revision === undefined
      ? undefined
      : this.loadExactAgent(agentDefinitionId, revision);
  }

  async loadExactAgent(agentDefinitionId: string, revision: string) {
    const value = this.#revisions.get(agentDefinitionId)?.get(revision);
    return value === undefined ? undefined : structuredClone(value);
  }

  #put(agent: AgentDefinitionRevisionV1Alpha2, active: boolean): void {
    const revisions = this.#revisions.get(agent.agentDefinitionId) ?? new Map();
    const existing = revisions.get(agent.revision);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(agent)) {
      throw new Error("agent_lifecycle_release_conflict");
    }
    revisions.set(agent.revision, structuredClone(agent));
    this.#revisions.set(agent.agentDefinitionId, revisions);
    if (active) this.#active.set(agent.agentDefinitionId, agent.revision);
  }
}

function restriction<T extends Readonly<{ enabled: boolean; selectedReferences: readonly unknown[] }>>(
  value: T,
): { mode: "unrestricted" } | { mode: "allowlist"; references: T["selectedReferences"] } {
  return value.enabled
    ? { mode: "allowlist", references: value.selectedReferences }
    : { mode: "unrestricted" };
}
