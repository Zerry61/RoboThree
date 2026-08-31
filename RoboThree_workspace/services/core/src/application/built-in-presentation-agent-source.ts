import type { MaterializedResourceRevision } from "@robothree/contracts";
import type {
  PortableAgentModelRestrictionRef,
  PortableAgentSkillRestrictionRef,
  PortableAgentToolRestrictionRef,
  PrivateAgentDefinitionRevision,
} from "./agent-definition-v1alpha2.js";

import type { ReadableAgentDefinitionRepository } from
  "../ports/readable-agent-definition-repository.js";
import { createPortableAgentDefinitionRevision } from
  "./agent-definition-v1alpha2.js";
import { createAgentDefinitionRevision } from
  "./runtime-selection-revisions.js";

export const BUILT_IN_PRESENTATION_AGENT_ID = "agent.presentation" as const;
export const BUILT_IN_PRESENTATION_AGENT_CREATED_AT =
  "2026-08-29T00:00:00.000Z" as const;

export class BuiltInPresentationAgentSource
implements ReadableAgentDefinitionRepository {
  readonly #agent: PrivateAgentDefinitionRevision;

  constructor(input: Readonly<{
    model: PortableAgentModelRestrictionRef;
    skill: PortableAgentSkillRestrictionRef;
    tools: readonly PortableAgentToolRestrictionRef[];
    minimumContextWindow?: number;
  }>) {
    this.#agent = createPortableAgentDefinitionRevision({
      schemaVersion: "v1alpha2",
      agentDefinitionId: BUILT_IN_PRESENTATION_AGENT_ID,
      managementClass: "system_builtin",
      name: "演示文稿助手",
      identity: "你是 RoboThree 演示文稿助手，负责把用户提供的真实信息组织成清晰、简洁、可交付的演示文稿。",
      goal: "理解汇报目标和受众，按需读取用户明确指定的工作空间资料，使用锁定的演示文稿规划 Skill 设计内容，并通过获准的 PPTX 工具生成用户要求的文件。",
      instructions: [
        "- 只处理演示文稿规划与 PPTX 生成，不扩展到未授权任务。",
        "- 不编造用户未提供的数据、来源、进度或结论；缺少事实时使用明确占位或先说明限制。",
        "- 用户明确指定工作空间资料时，先调用与文件类型匹配的锁定读取工具，再依据真实 Tool 结果形成页级结构。",
        "- 形成适合受众的页级结构后调用锁定的 PPTX 工具；不得声称未执行的读取或写入结果。",
        "- 只使用当前任务锁定的 Model、Skill、Tool、工作空间与知识资料。",
        "- Tool 失败时如实返回安全摘要，不伪造文件、路径或成功状态。",
      ].join("\n"),
      modelRestriction: { mode: "allowlist", references: [input.model] },
      skillRestriction: { mode: "allowlist", references: [input.skill] },
      toolRestriction: { mode: "allowlist", references: [...input.tools] },
      knowledgeRestriction: { mode: "unrestricted" },
      requiredModelCapabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportsToolCalling: true,
        supportsStreaming: true,
        ...(input.minimumContextWindow === undefined
          ? {}
          : { minimumContextWindow: input.minimumContextWindow }),
      },
      createdAt: BUILT_IN_PRESENTATION_AGENT_CREATED_AT,
    });
  }

  loadDefault(): PrivateAgentDefinitionRevision {
    return structuredClone(this.#agent);
  }

  async loadExactAgent(agentDefinitionId: string, revision: string) {
    if (agentDefinitionId !== this.#agent.agentDefinitionId
      || revision !== this.#agent.revision) return undefined;
    return this.loadDefault();
  }
}

export function createPresentationAgentCatalogProjection(input: Readonly<{
  source: BuiltInPresentationAgentSource;
  modelId: string;
  skill: MaterializedResourceRevision;
  tools: readonly PortableAgentToolRestrictionRef[];
}>) {
  const agent = input.source.loadDefault();
  return createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: agent.agentDefinitionId,
    name: agent.name,
    identity: agent.identity,
    goal: agent.goal,
    instructions: agent.instructions,
    defaultModelId: input.modelId,
    allowModelOverride: false,
    skillReferences: [input.skill],
    toolReferences: [...input.tools],
    knowledgeReferences: [],
    requiredModelCapabilities: agent.requiredModelCapabilities,
    createdAt: agent.createdAt,
  });
}
