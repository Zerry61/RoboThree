import type { ReadableAgentDefinitionRevision } from "../application/agent-definition-v1alpha2.js";

export interface ReadableAgentDefinitionRepository {
  loadExactAgent(
    agentDefinitionId: string,
    revision: string,
  ): Promise<ReadableAgentDefinitionRevision | undefined>;
}
