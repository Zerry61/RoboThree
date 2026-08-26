# Hermes Agent — Final Review (Level 3 验收)

> **Commit**: `3d9be2789552a495c7adf30148e867e7614a4bdc`
> **Date**: 2026-07-18
> **Mode**: STATIC_ANALYSIS_ONLY
> **Files Analyzed**: 9 Python files (~14,500 lines)

## 文件覆盖

| 文件 | 行数 | 角色 |
|---|---|---|
| `agent/conversation_loop.py` | 5,679 | 主循环 |
| `agent/tool_executor.py` | 1,801 | Tool 执行 |
| `agent/tool_dispatch_helpers.py` | 653 | Tool 辅助 + 安全 |
| `agent/conversation_compression.py` | ~1,900 | Context 压缩 |
| `agent/prompt_builder.py` | ~2,400 | Prompt 构建 |
| `agent/tool_guardrails.py` | 479 | Tool 守门员 |
| `agent/turn_context.py` | 180 | Per-turn prologue |
| `agent/iteration_budget.py` | 62 | Iteration budget |
| `run_agent.py` | 间接引用 | AIAgent 主类（未读全文） |

## Level 3 30 项自检

### Stage A 项目识别（6 项）

| # | 检查项 | 状态 |
|---|---|---|
| 1 | Commit SHA 已固定 | ✅ `3d9be27...` |
| 2 | License 初查已完成 | ✅ MIT |
| 3 | 真实入口已确认（不依赖 README） | ✅ `run_conversation` 在 conversation_loop.py:565 |
| 4 | 三个核心机制有源码证据 | ✅ 主循环 / Tool / Session 都有 |
| 5 | 主要风险已记录 | ✅ God Object / Thread 隔离 / Regex 黑名单 |
| 6 | 建议 "进入 Level 3" 或 "停止" | ✅ Level 3 已完成 |

### Stage B 核心运行路径（4 项）

| # | 检查项 | 状态 |
|---|---|---|
| 7 | Agent 主循环已定位 | ✅ `run_conversation` L565 + while L689 |
| 8 | 代表性端到端调用链完成 | ✅ runtime-sequence.md (27 hops) |
| 9 | Mermaid 序列图 + 文字链路 + Hop Evidence | ✅ runtime-sequence.md |
| 10 | Permission/Security 检查 | ✅ permission-system.md + level3-deep-dive.md § 2/3 |

### Stage C Conditional（3 项）

| # | 检查项 | 状态 |
|---|---|---|
| 11 | session-state-memory.md 触发判断 | ✅ 真实长期记忆确认 |
| 12 | skill-plugin-mcp.md 触发判断 | ✅ 四类机制都在 |
| 13 | permission-system.md 触发判断 | ✅ Shell/文件/网络都执行 |

### Stage D RoboThree 映射（7 项）

| # | 检查项 | 状态 |
|---|---|---|
| 14 | ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE | ✅ robothree-fit-analysis.md (12 条) |
| 15 | 每个结论有理由 + 证据 + 适用边界 + 风险 + MVP 需求 | ✅ |
| 16 | Proposed RoboThree Changes 章节 | ✅ |
| 17 | Requires Human Approval 章节 | ✅ 7 项 |
| 18 | 不自动修改 robothree/ | ✅ |
| 19 | 不自动创建 ADR | ✅ |
| 20 | 不自动创建 comparison 文件 | ✅ |

### Level 3 专项深挖（5 项）

| # | 检查项 | 状态 |
|---|---|---|
| 21 | 用户指定的机制有源码级深挖 | ✅ 3 个机制（主循环 / Tool / Session） |
| 22 | 失败 / 取消 / 恢复路径 | ✅ deep-dive.md § 1.6, 2.5, 3.4-3.5 |
| 23 | FACT / INFERENCE / UNKNOWN 标记 | ✅ |
| 24 | RoboThree 5 分类结论 | ✅ deep-dive.md "综合结论" |
| 25 | final-review.md 生成 | ✅ 本文件 |

### 跨文件一致性（5 项）

| # | 检查项 | 状态 |
|---|---|---|
| 26 | 所有 Required 7 文件内容完整 | ✅ |
| 27 | Conditional 触发合理 | ✅ 3/4 触发，理由充分 |
| 28 | 没有为模板创建空文件 | ✅ |
| 29 | Skill 试运行反馈已记录 | ✅ skill-trial-notes.md |
| 30 | 没有修改 sources/ 或 robothree/ | ✅ |

## Level 3 新发现（深度价值）

### A. Prologue 拆分

**[F]** `build_turn_context()` 是独立的纯函数，调用方传入 `agent` 和 helpers。这是非常干净的分层设计，让 per-turn setup 可单元测试。

**RoboThree 启示**: Agent Runtime 应该把 per-turn setup 拆为独立函数。

### B. SQLite-based 会话锁

**[F]** `compress_context()` 通过 `state.db` 中的 lock 表防止并发压缩。这是真实的生产 bug 修复。

**RoboThree 启示**: Session Manager 必须支持 lock API，不仅是简单的 key-value。

### C. Untrusted Tool Output 语义分隔符

**[F]** `<untrusted_tool_result>` 标签 + 大小写不敏感的反绕过防御。这是**真正的 prompt injection 防御**。

**RoboThree 启示**: Tool Runtime 应该 ADOPT 这个模式。

### D. 三层 Partial Stream Recovery

**[F]** partial streamed → prior-turn fallback → post-tool nudge → continuation prompt。

**RoboThree 启示**: Streaming 取消时应该有同样的多层 fallback。

### E. 4 级 Guardrail Action

**[F]** allow / warn / block / halt。默认 hard_stop_enabled=False。

**RoboThree 启示**: Tool Permission 的 action 体系应该至少支持这 4 级。

### F. _executor_must_emit_post_hook 的设计

**[F]** Built-in tools 由 executor 发 post_tool_call；External tools 由 handle_function_call 发。这是一种"职责清晰化"设计。

**RoboThree 启示**: Built-in vs External 的 post-tool 行为应该明确分离。

## RoboThree 设计原则建议（基于本次研究）

1. **分离 per-turn setup 和 main loop**: `build_turn_context()` 是好的范例
2. **分层阻断而非单点决策**: scope → plugin → guardrail 比单点 manager 更灵活
3. **Pre-tool persistence**: 危险工具执行前先 flush，比性能更重要
4. **语义标记 > regex 黑名单**: `<untrusted_tool_result>` 比模式匹配更可靠
5. **Lock API in SessionDB**: 不仅是存储，还要支持并发锁
6. **Tool 自声明 vs 中央白名单**: IDEMPOTENT_TOOL_NAMES 硬编码是反模式
7. **多层 fallback**: streaming cancel → partial recovery → nudge → continuation

## 仍待人类决策的 12 项（升级版）

| # | 决策 | 状态 |
|---|---|---|
| 1 | 双消息列表作为核心数据模型 | PENDING |
| 2 | Gateway 定义显式 ChannelCapabilities | PENDING |
| 3 | 拒绝 God Object，强制 DI | PENDING |
| 4 | 多层 Tool 阻断作为默认权限模型 | PENDING |
| 5 | 破坏性操作前增量持久化 | PENDING |
| 6 | Hook 式 Plugin 架构 | PENDING |
| 7 | MVP 只做 Local Worker | PENDING |
| 8 | **NEW** 引入 SQLite-based SessionDB + lock API | PENDING |
| 9 | **NEW** 引入 `<untrusted_tool_result>` 语义分隔符 | PENDING |
| 10 | **NEW** Tool 自声明 idempotent/mutating/destructive 属性 | PENDING |
| 11 | **NEW** Agent Runtime 拆分为 build_turn_context + main loop | PENDING |
| 12 | **NEW** Guardrail 4 级 action（allow/warn/block/halt） | PENDING |

## 验收结论

```text
✅ Level 3 验收通过
✅ 所有 Required 7 文件完成
✅ Conditional 触发合理（3/4 max）
✅ 30 项自检通过
✅ RoboThree 设计建议明确（12 项 PENDING_HUMAN_DECISION）
✅ 试运行 Skill 反馈已记录
```

**Level 3 核心价值**: 通过深度源码分析，确认了 Level 2 的 ADOPT 结论，并发现了 6 个 Level 2 没看到的更深层设计模式。所有这些都可以直接映射到 RoboThree 的具体模块设计。

## 文件清单

```
research/hermes-agent/
├── index.md
├── project-overview.md
├── source-map.md
├── architecture.md
├── runtime-sequence.md
├── robothree-fit-analysis.md
├── open-questions.md
├── session-state-memory.md
├── skill-plugin-mcp.md
├── permission-system.md
├── level3-deep-dive.md          # NEW
├── final-review.md              # NEW
└── skill-trial-notes.md
```

## 下次研究建议

如需 Level 3 继续深挖，建议优先级：

1. **Memory 系统**: `memory_manager.py` + `memory_provider.py` 的具体后端实现
2. **Subagent 隔离**: `delegate_task` 实际是进程级还是线程级？
3. **Worker Backend 抽象**: `BaseEnvironment` 接口 + 6 个 backend 的差异
4. **Gateway Channel Capabilities**: 每个平台 adapter 的实际 capability 矩阵
5. **Plugin System**: 实际有哪些官方 plugin 例子，能给 RoboThree 的 Plugin Engine 提供什么参考？
