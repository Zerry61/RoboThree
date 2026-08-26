---
name: architecture-convergence
description: Converge multiple architecture research reports into evidence-backed RoboThree architecture candidates. Use when comparing findings across projects, resolving conflicting recommendations, evaluating ADOPT/ADAPT/DEFER/REJECT choices, or preparing an unapproved architecture proposal without changing either repository.
---

# Architecture Convergence

将研究仓库中的多来源证据收敛为 RoboThree 架构候选。默认只分析和输出建议，不修改产品仓库或研究仓库。

## Workflow

1. 读取总目录 `README.md`，确认两个仓库的职责边界。
2. 从 `robothree-agent-research/research/` 选择与问题直接相关的报告、对比矩阵和来源版本。
3. 只读查看 `RoboThree_workspace/docs/product/` 与 `docs/architecture/`，确认产品目标、已有决定和 MVP 约束。
4. 对每个结论区分：
   - 外部事实：有来源文件和版本支持。
   - RoboThree 推断：由事实推导，但不是上游事实。
   - 架构建议：尚待用户批准。
5. 对候选方案标注 `ADOPT`、`ADAPT`、`DEFER` 或 `REJECT`，并说明适用边界、风险、替代方案和待验证问题。
6. 默认在对话中输出候选结论。用户明确要求保存草案时，先确认目标位置；不得自行写入两个仓库。

## Output

按以下顺序给出结果：

- 决策问题与当前约束。
- 来源证据及其版本。
- 一致结论与冲突点。
- 候选决策表。
- 对 Desktop、Core、Contracts、Worker 或 MVP 范围的影响。
- 尚未解决的问题和建议验证方式。

## Guardrails

- 不把研究建议表述为已接受的 RoboThree 决策。
- 不直接复制第三方源码或整篇研究报告。
- 不读取 `备注文件/`，除非用户明确指定。
- 不修改 Architecture、ADR 或产品代码；正式提升使用 `promote-research-decision`。
