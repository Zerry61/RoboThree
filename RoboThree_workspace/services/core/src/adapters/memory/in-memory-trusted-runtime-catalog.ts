import {
  AgentDefinitionRevisionSchema,
  ModelDefinitionSchema,
} from "@robothree/contracts";
import type {
  AgentDefinitionRevision,
  ModelDefinition,
} from "@robothree/contracts";

import type {
  TrustedAgentRepository,
  TrustedModelRepository,
} from "../../ports/trusted-runtime-catalog.js";
import {
  hasValidAgentDefinitionRevision,
  hasValidModelDefinition,
} from "../../application/runtime-selection-revisions.js";

export class InMemoryTrustedRuntimeCatalog
implements TrustedAgentRepository, TrustedModelRepository {
  readonly #agents = new Map<string, Map<string, AgentDefinitionRevision>>();
  readonly #activeAgentRevisions = new Map<string, string>();
  readonly #models = new Map<string, ModelDefinition>();

  registerAgent(input: AgentDefinitionRevision, active = true): this {
    const agent = AgentDefinitionRevisionSchema.parse(input);
    if (!hasValidAgentDefinitionRevision(agent)) {
      throw new Error("trusted Agent definition digest is invalid");
    }
    const revisions = this.#agents.get(agent.agentDefinitionId) ?? new Map();
    const existing = revisions.get(agent.revision);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(agent)) {
      throw new Error("trusted Agent revision conflicts with existing material");
    }
    revisions.set(agent.revision, structuredClone(agent));
    this.#agents.set(agent.agentDefinitionId, revisions);
    if (active) this.#activeAgentRevisions.set(agent.agentDefinitionId, agent.revision);
    return this;
  }

  registerModel(input: ModelDefinition): this {
    const model = ModelDefinitionSchema.parse(input);
    if (!hasValidModelDefinition(model)) {
      throw new Error("trusted Model definition digest is invalid");
    }
    const existing = this.#models.get(model.modelId);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(model)) {
      throw new Error("trusted Model ID conflicts with existing material");
    }
    this.#models.set(model.modelId, structuredClone(model));
    return this;
  }

  async loadActiveAgent(agentDefinitionId: string): Promise<AgentDefinitionRevision | undefined> {
    const revision = this.#activeAgentRevisions.get(agentDefinitionId);
    return revision === undefined ? undefined : this.loadAgentRevision(agentDefinitionId, revision);
  }

  async loadAgentRevision(
    agentDefinitionId: string,
    revision: string,
  ): Promise<AgentDefinitionRevision | undefined> {
    const agent = this.#agents.get(agentDefinitionId)?.get(revision);
    return agent === undefined ? undefined : structuredClone(agent);
  }

  async listActiveAgents(): Promise<readonly AgentDefinitionRevision[]> {
    const result: AgentDefinitionRevision[] = [];
    for (const [agentId, revision] of this.#activeAgentRevisions) {
      const agent = this.#agents.get(agentId)?.get(revision);
      if (agent !== undefined) result.push(structuredClone(agent));
    }
    return result.sort((left, right) =>
      left.agentDefinitionId.localeCompare(right.agentDefinitionId));
  }

  async loadModel(modelId: string): Promise<ModelDefinition | undefined> {
    const model = this.#models.get(modelId);
    return model === undefined ? undefined : structuredClone(model);
  }

  async listModels(): Promise<readonly ModelDefinition[]> {
    return [...this.#models.values()]
      .sort((left, right) => left.modelId.localeCompare(right.modelId))
      .map((model) => structuredClone(model));
  }
}
