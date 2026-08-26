---
name: promote-research-decision
description: Promote an explicitly approved research conclusion into RoboThree architecture documentation or an ADR with traceable evidence. Use only when the user has approved a specific decision and asks to write it into RoboThree_workspace; do not use for exploratory research or unapproved recommendations.
---

# Promote Research Decision

把用户已批准的研究结论整理为产品仓库中的正式 Architecture 文档或 ADR。该流程只修改产品仓库，不反向修改研究仓库。

## Preconditions

执行前确认以下信息齐全：

- 用户明确批准了具体决策，而不是只要求讨论。
- 目标是 `RoboThree_workspace/docs/architecture/` 或 `RoboThree_workspace/docs/adr/` 中的明确文件。
- 研究来源、版本或 Commit、适用边界可以追溯。
- 采用理由、风险、替代方案和后续验证计划已经说明。

任一条件缺失时，输出缺失项，不写入文件。

## Workflow

1. 读取总目录 `README.md`，再读取产品仓库的 `AGENTS.md`、`CLAUDE.md`、`CHANGELOG.md` 和目标目录约定。
2. 只读核对研究报告和来源版本，分别整理外部事实、RoboThree 推断与最终决定。
3. 选择文档类型：
   - Architecture：描述当前系统结构、边界或运行方式。
   - ADR：记录重要、长期且难以回退的取舍。
4. 文档至少包含状态、背景、决定、采用理由、替代方案、影响、适用边界、验证计划和来源。
5. 只修改已批准的目标文档及产品 `CHANGELOG.md`；不要顺带改代码或研究报告。
6. 检查路径、链接和来源是否存在，并汇报验证结果。

## Guardrails

- 未明确批准时不得写入产品仓库。
- 不把研究报告原文或第三方实现直接复制到正式文档。
- 不读取 `备注文件/`，除非用户明确指定。
- 不修改 `robothree-agent-research/` 中的任何文件。
- 不在同一任务中扩大到产品实现；代码修改应作为后续独立任务。
