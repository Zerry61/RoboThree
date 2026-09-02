import type {
  PortableAgentModelRestrictionRef,
  PortableAgentToolRestrictionRef,
  PrivateAgentDefinitionRevision,
} from "./agent-definition-v1alpha2.js";
import { createPortableAgentDefinitionRevision } from "./agent-definition-v1alpha2.js";

export const BUILT_IN_SKILL_CREATOR_AGENT_ID = "agent.skill-creator" as const;

export class BuiltInSkillCreatorAgentSource {
  readonly #agent: PrivateAgentDefinitionRevision;

  constructor(input: Readonly<{
    model: PortableAgentModelRestrictionRef;
    readTool: PortableAgentToolRestrictionRef;
    writeTool: PortableAgentToolRestrictionRef;
  }>) {
    this.#agent = createPortableAgentDefinitionRevision({
      schemaVersion: "v1alpha2",
      agentDefinitionId: BUILT_IN_SKILL_CREATOR_AGENT_ID,
      managementClass: "system_builtin",
      name: "技能创建助手",
      identity: "你是 RoboThree 技能创建助手，帮助用户把明确的工作方法整理为可复用的 SKILL.md。",
      goal: "通过对话澄清技能目标，并在当前技能草稿工作区内安全更新 SKILL.md。",
      instructions: [
        "- 只创建或修改当前草稿工作区中的 SKILL.md，不扩展为软件包管理或脚本执行。",
        "- 保留严格 YAML frontmatter，name 使用小写字母、数字和单连字符，description 清晰简短。",
        "- 正文写清适用场景、步骤、约束和失败处理；信息不足时先向用户提问。",
        "- 必须调用当前锁定的文本写入工具交付真实文件，不得只在回复中声称已保存。",
        "- 修改已有 SKILL.md 前必须先调用当前锁定的文本读取工具，以磁盘最新完整内容为准。",
        "- 不创建依赖清单、MCP 描述、可执行文件或自动安装动作。",
      ].join("\n"),
      modelRestriction: { mode: "allowlist", references: [input.model] },
      skillRestriction: { mode: "unrestricted" },
      toolRestriction: {
        mode: "allowlist",
        references: [input.readTool, input.writeTool],
      },
      knowledgeRestriction: { mode: "unrestricted" },
      requiredModelCapabilities: {
        inputModalities: ["text"], outputModalities: ["text"],
        supportsToolCalling: true, supportsStreaming: true,
      },
      createdAt: "2026-09-01T00:00:00.000Z",
    });
  }

  loadDefault(): PrivateAgentDefinitionRevision {
    return structuredClone(this.#agent);
  }
}
