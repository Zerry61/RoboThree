# RoboThree Workspace Instructions

本文件只负责将 Codex 任务路由到正确位置，各仓库的具体开发规则由仓库内的说明文件负责。

## Repository roles

- 产品实现、测试、交付和正式产品文档：只写入 `RoboThree_workspace/`，并遵循其中的 `AGENTS.md` 和 `CHANGELOG.md`。
- 外部源码研究、引用和对比：只写入 `robothree-agent-research/`，并遵循其中的仓库规则。
- 跨仓架构收敛：读取 `.claude/skills/architecture-convergence/SKILL.md` 并默认只在对话中输出。
- 用户明确批准研究结论提升时：读取 `.claude/skills/promote-research-decision/SKILL.md`。

## Boundaries

- 默认不要在同一个任务中修改两个仓库，除非用户明确要求跨仓操作。
- 产品代码不得导入研究仓库或总目录中的文件。
- 不得把第三方镜像源码复制进产品仓库。
- 研究建议不是 RoboThree 已接受的设计，未经用户确认不得直接写入正式 Architecture 或 ADR。
- 总目录的 Skill 和 Hook 不能成为产品运行时依赖。

## Backup notes

`备注文件/` 是用户手动维护的纯备用资料。除非用户明确指定，否则不要读取、搜索、解释、修改、移动或删除其中内容。它不参与工程构建，不是需求或架构事实来源，也不能触发任何代码或配置变化。
