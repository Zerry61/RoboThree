# LangGraph — 研究索引

> 研究日期：2026-07-18
> 固定 Commit：`49ae27c2ae983cfb92091b0dea9f7bc37a716479`
> 仓库：https://github.com/langchain-ai/langgraph
> 研究深度：**Level 2 + 3 个 Level 3 专项深挖**
> 状态：✅ 完成

## 产物清单

### Required（7 个）

| 文件 | 状态 | 行数 | 说明 |
|------|------|------|------|
| `index.md` | ✅ | ~30 | 本文件 |
| `project-overview.md` | ✅ | ~80 | 项目定位 + 技术栈 + License |
| `source-map.md` | ✅ | ~180 | 目录地图 + 真实入口 |
| `architecture.md` | ✅ | ~420 | 架构总览 + Pregel 运行时模型 + Permission/Security 节 |
| `runtime-sequence.md` | ✅ | ~200 | 一次完整 Superstep 调用链 + Mermaid + Hop Evidence |
| `robothree-fit-analysis.md` | ✅ | ~440 | ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE |
| `open-questions.md` | ✅ | ~130 | 未解问题 + How to Close |

### Conditional & Advanced

| 文件 | 状态 | 行数 | 说明 |
|------|------|------|------|
| `LICENSE-NOTES.md` | ✅ | ~20 | MIT → DESIGN_ONLY |
| `deep-dive-checkpoint-visibility.md` | ✅ | ~340 | **Level 3** Checkpoint 持久化与可见性不变量 |
| `deep-dive-interrupt-resume.md` | ✅ | ~340 | **Level 3** Interrupt + Resume 契约 + 多 Interrupt 区分 |
| `deep-dive-channel-versioning.md` | ✅ | ~410 | **Level 3** Channel Versioning 驱动的节点调度 |
| `final-review.md` | ✅ | ~210 | Level 3 验收报告（30 项自检） |

**总计 ~2810 行** — 全部为静态源码分析，无运行时验证。

## 三大深挖选择依据

基于 Level 2 完成的 5 大设计模式（Durable State Machine、Checkpoint Contract、Interrupt Contract、Resume Contract、Event Stream），
我选择以下 3 个机制做 Level 3 深挖：

1. **Checkpoint Visibility** — 这是 LangGraph 在所有分布式框架中最独特的设计。它解决了"checkpoint 持久化与 channel 增量写入的因果顺序"问题，是 RoboThree 实现 Durable Execution 最难的一关。

2. **Interrupt + Resume Contract** — Human-in-the-loop 是 LangGraph 相对其他 Agent 框架最差异化的能力。`Command(resume)` 是恢复入口，需要理解它如何被合并到 `_first()`，以及多个 interrupt 如何区分。

3. **Channel Versioning-Driven Scheduling** — 这是 Pregel Superstep 模型最精妙的设计。节点不被"重执行"，而是因为 channel 版本变化而触发。这是 LangGraph 实现"去重执行"和"长时间运行安全"的核心。

## RoboThree 核心问题（已回答）

1. **Agent Loop 是否应该固定成 while loop？** → ❌ 应采用 Superstep 模型
2. **是否需要状态机或 Workflow Graph？** → ✅ Superstep 就是隐式状态机；Graph Builder DEFER
3. **如何暂停、恢复和重放任务？** → ✅ Paused 状态 + Checkpoint + Command(resume)
4. **人工审批如何插入运行流程？** → ✅ interrupt_before/after + 显式 resume API
5. **长任务如何跨进程恢复？** → ✅ thread_id → get_tuple → __enter__ 恢复
6. **Task State 和 Session State 如何区分？** → ✅ Reducer 声明的字段 = Task State；Session Store 单独设计

## 核心结论

| 模式 | 结论 | 优先级 |
|------|------|--------|
| Durable State Machine (Superstep) | ADAPT | 高 |
| Checkpoint Contract | ADAPT | 高 |
| State Reducer (Channel) System | **ADOPT** | 高 |
| Interrupt Contract | ADAPT | 高 |
| Resume Contract | ADAPT | 高 |
| Event Stream Model | **ADOPT** | 高 |
| Graph Builder API | DEFER | 低 |
| Pregel 运行时全部 | DEFER | 低 |
| Send API (Parallel) | ADAPT | 中 |
| Subgraph 嵌套 | ADAPT | 中 |
| Durability Mode | ADOPT | 中 |
| Overwrite 语义 | ADOPT | 中 |

## 源码获取方式

通过 GitHub API zipball 下载（git clone 超时），Commit SHA 通过 GitHub API 获取。
