import type {
  AgentDefinitionRevision,
  ModelDefinition,
} from "@robothree/contracts";

export interface TrustedAgentRepository {
  loadActiveAgent(agentDefinitionId: string): Promise<AgentDefinitionRevision | undefined>;
  loadAgentRevision(
    agentDefinitionId: string,
    revision: string,
  ): Promise<AgentDefinitionRevision | undefined>;
  listActiveAgents(): Promise<readonly AgentDefinitionRevision[]>;
}

export interface TrustedModelRepository {
  loadModel(modelId: string): Promise<ModelDefinition | undefined>;
  listModels(): Promise<readonly ModelDefinition[]>;
}
