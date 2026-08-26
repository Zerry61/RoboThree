import type { AgentDefinitionRevisionV1Alpha2 } from "@robothree/contracts/runtime-selection/agent-definition/v1alpha2";

import type { ReadableAgentDefinitionRepository } from "../ports/readable-agent-definition-repository.js";
import { createAgentDefinitionRevisionV1Alpha2 } from "./agent-definition-v1alpha2.js";

export const BUILT_IN_GENERAL_AGENT_ID = "agent.general" as const;
export const BUILT_IN_GENERAL_AGENT_CREATED_AT =
  "2026-08-26T00:00:00.000Z" as const;
export const BUILT_IN_GENERAL_AGENT_REVISION =
  "sha256:f846f63e9b0b7135df865a2de832f0605643eeb25919201e1285315a250078cc" as const;

const GENERAL_AGENT = createAgentDefinitionRevisionV1Alpha2({
  schemaVersion: "v1alpha2",
  agentDefinitionId: BUILT_IN_GENERAL_AGENT_ID,
  managementClass: "system_builtin",
  name: "RoboThree 通用助手",
  identity: "你是 RoboThree 通用任务助手，帮助用户处理分析、写作、信息整理和当前能力允许的工作空间任务。",
  goal: "准确理解用户目标，以尽量少的阻塞完成任务，并交付真实、清晰、可验证的结果。",
  instructions: "- 优先解决用户当前问题。\n- 不预设行业角色或专业立场。\n- 只使用当前任务真实启用的 Skill、Tool 和参考资料。\n- 不编造未提供的能力、文件、来源或执行结果。",
  modelRestriction: { mode: "unrestricted" },
  skillRestriction: { mode: "unrestricted" },
  toolRestriction: { mode: "unrestricted" },
  knowledgeRestriction: { mode: "unrestricted" },
  requiredModelCapabilities: {
    inputModalities: ["text"],
    outputModalities: ["text"],
    supportsToolCalling: false,
    supportsStreaming: false,
  },
  createdAt: BUILT_IN_GENERAL_AGENT_CREATED_AT,
});

if (GENERAL_AGENT.revision !== BUILT_IN_GENERAL_AGENT_REVISION) {
  throw new Error("built-in general Agent exact material drifted");
}

export class BuiltInGeneralAgentSource implements ReadableAgentDefinitionRepository {
  loadDefault(): AgentDefinitionRevisionV1Alpha2 {
    return structuredClone(GENERAL_AGENT);
  }

  async loadExactAgent(
    agentDefinitionId: string,
    revision: string,
  ): Promise<AgentDefinitionRevisionV1Alpha2 | undefined> {
    if (
      agentDefinitionId !== BUILT_IN_GENERAL_AGENT_ID
      || revision !== BUILT_IN_GENERAL_AGENT_REVISION
    ) return undefined;
    return this.loadDefault();
  }
}
