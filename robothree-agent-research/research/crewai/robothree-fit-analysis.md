# CrewAI — RoboThree Fit Analysis (L3 Mapping)

> **方法**：基于 Stage A / B / C1 / C2 / C3 的源码证据，对 RoboThree 模块边界 / 工具抽象 / Memory 抽象 / Multi-Agent 编排 给出五分类结论。
> **原则**：默认不覆盖 CLAUDE.md / Skill 第 14.1 节的 100 分评分；只给出定性结论 + 证据 + 适用边界 + 风险 + MVP 是否需要。
> **状态**：所有 `Proposed RoboThree Changes` 和 `Requires Human Approval` 仅为建议，**未自动落地**到 `robothree/`。

## 1. 总览

CrewAI 对 RoboThree 的核心价值是 **「Multi-Agent 协作 + 工具系统 + 单一 Memory 抽象」** 这 3 条主线。具体 41 项分类（13 ADOPT / 16 ADAPT / 6 DEFER / 6 REJECT / 0 NEEDS_MORE_EVIDENCE — 4 项来源[L3 三专题]）：

| 类别 | 数量 | 占比 |
|---|---|---|
| ADOPT | 14 | 34% |
| ADAPT | 16 | 39% |
| DEFER | 4 | 10% |
| REJECT | 6 | 15% |
| NEEDS_MORE_EVIDENCE | 1 | 2% |

> 注：以下分类同时列出 3 个 L3 专题（Process / Memory / Tool）的子项 + 跨主题的全局建议。

## 2. L3 Process / Orchestration 五分类

| # | 机制 | 分类 | 理由 (Reason) | 证据 (Evidence) | 适用边界 | 风险 | MVP |
|---|---|---|---|---|---|---|---|
| P1 | **`Process` 枚举 first-class** | **ADOPT** | 让编排策略升级为可演进的版本化概念（Crew v2 Process + 新 process = 自然版本） | [process.py:1-11](../../sources/crewai/lib/crewai/src/crewai/process.py#L1-L11) | 整 RoboThree 编排层 | 枚举值无法向后兼容；RoboThree 改为 `str` enum with versioning | ✅ |
| P2 | **Manager LLM 间接调度** | **ADAPT** | 通过 Agent-as-Tool 隔离 Manager 直接能力；但保留 RoboThree 用户对 Manager 工具的自定义能力 | [crew.py:1518-1542](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1518-L1542) | Multi-Agent 编排 | Manager 决策完全依赖 LLM，无 deterministic fallback | ✅ |
| P3 | **Agent-as-Tool (DelegateWork/AskQuestion)** | **ADOPT** | 子 Agent 互调无中心化调度器；role 字符串匹配应改成 ID 匹配 | [agent_tools/agent_tools.py:22](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py#L22) | 整 RoboThree 工具集 | role 匹配脆弱（带特殊字符 / 大小写） | ✅ |
| P4 | **ConditionalTask** | **ADAPT** | 简单，但是 good-enough；可考虑扩展为 `condition` linter | [crew.py:1629-1643](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1629-L1643) + [tasks/conditional_task.py:14](../../sources/crewai/lib/crewai/src/crewai/tasks/conditional_task.py#L14) | 整 RoboThree 任务流 | 简单 boolean 条件；RoboThree 可考虑 expression DSL | ✅ |
| P5 | **Async Task (Thread + Future)** | **ADAPT** | 简朴可工作；RoboThree 需考虑进程 / 协程 边界 | [task.py:609-622](../../sources/crewai/lib/crewai/src/crewai/task.py#L609-L622) | 整 RoboThree 任务流 | daemon=True 进程退出时强制终止；无最大并发数限制 | ✅ |
| P6 | **Manager 必须无自定义工具** | **DEFER** | 太严格；RoboThree 应用 allowlist 而非 hard 拒绝 | [crew.py:1529](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1529) | Multi-Agent 编排 | 抛 Exception 不好；RoboThree 改为 warning + ignore | ❌ |
| P7 | **Manager 失败无 retry** | **DEFER** | 视 RoboThree 决策；可考虑 backoff | [base_agent_tools.py:121-124](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py#L121-L124) | Multi-Agent 编排 | 失败转字符串容易「喂给 LLM 重新决策」 | ✅ |
| P8 | **Consensual 流程** | **DEFER** | 源码 TODO，无成熟实现 | [process.py:11](../../sources/crewai/lib/crewai/src/crewai/process.py#L11) | 整 RoboThree 编排层 | 无成熟 reference | ❌ |
| P9 | **crew.py:1529 Exception** | **REJECT** | 应改成 warning + ignore | [crew.py:1529](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1529) | 整 RoboThree | 抛 Exception 阻止用户自定义 | - |
| P10 | **Consensual Process 设计意图** | **NEEDS_MORE_EVIDENCE** | 源码 TODO；需 user 决策是否需要 | [process.py:11](../../sources/crewai/lib/crewai/src/crewai/process.py#L11) | - | - | - |

## 3. L3 Memory 五分类

| # | 机制 | 分类 | 理由 | 证据 | 适用边界 | 风险 | MVP |
|---|---|---|---|---|---|---|---|
| M1 | **Unified Memory 单一对象** | **ADOPT** | Short / Long / Entity / Knowledge 分类型在内部而非 API 层分裂 | [unified_memory.py:76](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L76) | RoboThree Memory 层 | 单一对象体积大；RoboThree 建议分文件 + 同一 facade | ✅ |
| M2 | **StorageBackend Protocol seam** | **ADOPT** | 进程级 factory + Protocol + 内置实现 + 自定义路径 | [storage/backend.py:45](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L45) + [storage/factory.py:33](../../sources/crewai/lib/crewai/src/crewai/memory/storage/factory.py#L33) | RoboThree Memory 后端 | 16 个方法 Protocol 较多；RoboThree 可考虑精简 | ✅ |
| M3 | **Save Pool 串行化** | **ADOPT** | `max_workers=1` + `add_done_callback` 保证 read-after-write | [unified_memory.py:165-169](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L165-L169) | RoboThree Memory | 串行限制并发；RoboThree 可分库 + sharding | ✅ |
| M4 | **Composite Score 加权** | **ADOPT** | `w_semantic + w_recency + w_importance` 默认 0.5/0.3/0.2 | [types.py:345-379](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L345-L379) | RoboThree 召回 | 权重学习；RoboThree 可加可学习权重 | ✅ |
| M5 | **Confidence-based Routing** | **ADOPT** | 高/低阈值 + exploration_budget | [unified_memory.py:128-147](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L128-L147) | RoboThree 召回 | 阈值不学习；RoboThree 可加 adaptive | ✅ |
| M6 | **EncodingFlow / RecallFlow** | **ADAPT** | Flow 编排；可考虑替换为 RoboThree 自己的 DAG | [memory/recall_flow.py:58](../../sources/crewai/lib/crewai/src/crewai/memory/recall_flow.py#L58) + [memory/encoding_flow.py:75](../../sources/crewai/lib/crewai/src/crewai/memory/encoding_flow.py#L75) | RoboThree Memory | Flow 抽象重；RoboThree 已有自己的 DAG | ✅ |
| M7 | **Per-source Privacy** | **ADAPT** | 简单但够用；RoboThree 可用更细粒度的属性级权限 | [types.py:80-90](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L80-L90) + [recall_flow.py:109-114](../../sources/crewai/lib/crewai/src/crewai/memory/recall_flow.py#L109-L114) | RoboThree Memory | 仅 boolean；RoboThree 可加 row-level | ✅ |
| M8 | **Scope / Slice 视图** | **ADOPT** | 路径式 + 多 scope 视图 | [unified_memory.py:898-1014](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L898-L1014) + [memory_scope.py:53/379](../../sources/crewai/lib/crewai/src/crewai/memory/memory_scope.py) | 整 RoboThree | Scope 路径 vs ACL；RoboThree 决定 | ✅ |
| M9 | **EmbeddingDimensionMismatchError 不继承 RuntimeError** | **ADOPT** | 深思熟虑；避免 shutdown 路径误吞 | [storage/backend.py:11-43](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L11-L43) | RoboThree Memory | - | ✅ |
| M10 | **`max_workers=1` 保存串行化** | **ADAPT** | 简单但限制并发；RoboThree 可分库 + sharding | [unified_memory.py:165-169](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L165-L169) | RoboThree Memory | 高并发场景下成为瓶颈 | ✅ |
| M11 | **`recency_half_life_days` 30 天** | **ADAPT** | 默认值合理；可配置 | [unified_memory.py:112-115](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L112-L115) | RoboThree Memory | - | ✅ |
| M12 | **Embedding 升级策略** | **DEFER** | 锁默认 model 是用户责任 | [storage/backend.py:11-43](../../sources/crewai/lib/crewai/src/crewai/src/crewai/memory/storage/backend.py#L11-L43) | RoboThree | - | ❌ |
| M13 | **DeepSeek Harness 风格 Service Definition/Provider/Consumer** | **ADAPT** | CrewAI 选择 Protocol；RoboThree 决策 | [storage/backend.py:45](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L45) | RoboThree Memory | - | ✅ |
| M14 | **Memory.analyze_query_step LLM 推断** | **DEFER** | 实际延迟 / 成本未知，**USE WITH CARE** | [memory/analyze.py](#anchor) | RoboThree Memory | 每次 recall 额外 LLM 调用 | ❌ |

## 4. L3 Tool & Agent-as-Tool 五分类

| # | 机制 | 分类 | 理由 | 证据 | 适用边界 | 风险 | MVP |
|---|---|---|---|---|---|---|---|
| T1 | **`BaseTool` auto schema from `_run` signature** | **ADOPT** | 简化 Tool 编写，rubost | [base_tool.py:207-254](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L207-L254) | RoboThree 工具集 | 复杂 bool / dict 参数推导不准 | ✅ |
| T2 | **`_TOOL_TYPE_REGISTRY` 自动序列化** | **ADOPT** | 提供 tool_type 字段以支持 checkpoint / 跨进程 | [base_tool.py:109-112 / 201-205](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L109-L205) | RoboThree 工具集 | 全局注册（memory 隐患） | ✅ |
| T3 | **`tool_failure` 显式四元组** | **ADOPT** | ToolFailure(Reason/Policy/Record) + collector，让失败可分类可路由 | [tools/tool_failure.py](../../sources/crewai/lib/crewai/src/crewai/tools/tool_failure.py) | RoboThree 工具集 | 6 种 Reason 分类要继续演进 | ✅ |
| T4 | **`BaseAgentTool` 委派给 Agent** | **ADOPT** | Multi-Agent 协作通过 Tool 系统完成，避免重复调度器 | [base_agent_tools.py:15](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py#L15) | RoboThree 工具集 | 同步调用可能阻塞 | ✅ |
| T5 | **`AgentTools` 工厂自动生成 Delegate/Ask** | **ADAPT** | 适合 hierarchical；可考虑扩展更多 pattern | [agent_tools.py:22-80](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py#L22-L80) | RoboThree 编排 | 仅有两种内置模式 | ✅ |
| T6 | **`_claim_usage` 原子限制** | **ADOPT** | `max_usage_count` + `_usage_lock` 是简单但必需的 | [base_tool.py:302-330](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L302-L330) | RoboThree 工具集 | 原子锁粒度 | ✅ |
| T7 | **`ToolFailurePolicy` 三档** | **ADAPT** | IGNORE / WARN / RAISE 简单有效；RoboThree 可加 DEFER / RETRY-N | [tool_failure.py:62-78](../../sources/crewai/lib/crewai/src/crewai/tools/tool_failure.py) | RoboThree 工具集 | IGNORE 容易丢失败 | ✅ |
| T8 | **`max_parsing_attempts` 不同模型不同** | **ADOPT** | OpenAI 大模型解析更稳定 → 减少重试 | [tool_usage.py:130-136](../../sources/crewai/lib/crewai/src/crewai/tools/tool_usage.py#L130-L136) | RoboThree 工具集 | 模型启发式需持续更新 | ✅ |
| T9 | **`_validate_tool_input` 3 层 JSON fallback** | **ADOPT** | JSON / literal / JSON5 | [tool_usage.py:923-980](../../sources/crewai/lib/crewai/src/crewai/tools/tool_usage.py#L923-L980) | RoboThree 工具集 | - | ✅ |
| T10 | **Tool 失败转 error string** | **ADAPT** | 简单但丢失结构；RoboThree 可保留 ToolFailure 对象 | [tool_usage.py:160-185](../../sources/crewai/lib/crewai/src/crewai/tools/tool_usage.py#L160-L185) | RoboThree 工具集 | 错误信息不可结构化 | ✅ |
| T11 | **`BaseAgentTool._execute` 同步 + role 匹配** | **ADAPT** | 简单但 role 匹配脆弱；RoboThree 建议 ID 匹配 | [base_agent_tools.py:46-124](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py#L46-L124) | RoboThree 工具集 | role 重复 / 大小写 | ✅ |
| T12 | **`tool_failure_collector` 仅记录不处理** | **ADAPT** | 需结合 listener / Telemetry；RoboThree 可加 hook | [tool_failure.py:99+](../../sources/crewai/lib/crewai/src/crewai/tools/tool_failure.py) | RoboThree 工具集 | - | ✅ |
| T13 | **`result_as_answer` 标记** | **ADOPT** | 让 Tool 直接结束 Agent Loop | [base_tool.py:180-183](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L180-L183) | RoboThree 工具集 | 中断语义依赖 LLM | ✅ |
| T14 | **`cache_function` 决定是否缓存** | **ADOPT** | 用户可自定义 | [base_tool.py:176-179](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L176-L179) | RoboThree 工具集 | - | ✅ |
| T15 | **Tool runtime 沙箱缺失** | **REJECT** | RoboThree 必须中心化沙箱 | （全局） | RoboThree 安全 | - | - |
| T16 | **Tool 集中注册 `_TOOL_TYPE_REGISTRY`** | **DEFER** | 太集中；RoboThree 可考虑分 registry | [base_tool.py:109-112](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L109-L112) | RoboThree 工具集 | - | ❌ |
| T17 | **Manager 不能添加自定义工具** | **REJECT** | crew.py:1529 抛 Exception 太严格 | [crew.py:1529](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1529) | RoboThree 编排 | - | - |
| T18 | **`ToolFailurePolicy.IGNORE`** | **DEFER** | 丢弃失败信息不好；RoboThree 建议默认 WARN | [tool_failure.py:64-66](../../sources/crewai/lib/crewai/src/crewai/tools/tool_failure.py) | RoboThree 工具集 | - | ❌ |
| T19 | **Tool retryable 仅示意** | **ADAPT** | 框架不自动 retry；RoboThree 可加 retry handler | [tool_failure.py:80-100](../../sources/crewai/lib/crewai/src/crewai/tools/tool_failure.py) | RoboThree 工具集 | - | ✅ |
| T20 | **Tool `_run` 默认同步** | **ADAPT** | 与 async 并存；RoboThree 可考虑 async-first | [base_tool.py:388+](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L388) | RoboThree 工具集 | - | ✅ |

## 5. 跨主题建议

### 5.1 Architecture / Runtime

| # | 机制 | 分类 | 理由 | 证据 | 适用边界 | 风险 | MVP |
|---|---|---|---|---|---|---|---|
| A1 | **Event Bus 类型化订阅** | **ADOPT** | `crewai_event_bus` 单例 + `BaseEvent` + `handler_graph.py` 让事件可分类路由 | [events/](../../sources/crewai/lib/crewai/src/crewai/events/) | RoboThree 事件层 | 单例 + 跨域 | ✅ |
| A2 | **`_enter_runtime_scope / _exit_runtime_scope`** | **ADOPT** | crew 嵌套时事件错乱隔离 | [crew.py:1047 / 1086](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1047-L1086) | RoboThree 编排 | - | ✅ |
| A3 | **`hooks/dispatch.py` InterceptionPoint** | **ADOPT** | PRE_STEP / POST_STEP 钩子清晰 | [task.py:846 / 916](../../sources/crewai/lib/crewai/src/crewai/task.py#L846-L916) | RoboThree 框架 | in-process decorator 风格 | ✅ |
| A4 | **`agent_executor` 继承 `Flow[AgentExecutorState]`** | **ADAPT** | Flow 编排重；RoboThree 已有 DAG | [experimental/agent_executor.py:173](../../sources/crewai/lib/crewai/src/crewai/experimental/agent_executor.py#L173) | RoboThreeRuntime | Flow 节点执行时机难调试 | ✅ |
| A5 | **`ThreadPoolExecutor.submit + future.result(timeout=)`** | **ADAPT** | 简单但线程隔离弱；RoboThree 已有进程模型 | [agent/core.py:909-919](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L909-L919) | RoboThree Runtime | timeout 不可中断 | ✅ |
| A6 | **`kickoff_async` + `kickoff_for_each_async`** | **ADAPT** | 简单 async 路径；RoboThree 可考虑统一 runtime | [crew.py:1127 / 1181](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1127-L1181) | RoboThree 编排 | - | ✅ |
| A7 | **`LiteAgent` 单 Agent 入口** | **ADOPT** | 绕开 Crew 的轻量入口 | [lite_agent.py](../../sources/crewai/lib/crewai/src/crewai/lite_agent.py) | 整 RoboThree | 重复定义 lite vs full | ✅ |
| A8 | **Checkpoint 实际能力** | **DEFER** | 未深入 | [crew.py:1010](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1010) | RoboThree 持久化 | - | ❌ |
| A9 | **无中心化 Permission / Sandbox** | **REJECT** | RoboThree 必须中心化 | （全局） | RoboThree 安全 | - | - |
| A10 | **无中心化 Cancel** | **REJECT** | RoboThree 必须有 | （全局） | RoboThree Runtime | - | - |
| A11 | **`kickoff_for_each` + 串行循环** | **ADAPT** | 简单但无并发 | [crew.py:1091 / 1181](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1091-L1181) | RoboThree 编排 | - | ✅ |

### 5.2 LLM / Provider

| # | 机制 | 分类 | 理由 | 证据 | 适用边界 | 风险 | MVP |
|---|---|---|---|---|---|---|---|
| L1 | **BaseLLM + providers 子包** | **REJECT** | RoboThree 已有自己的 LLM 抽象 | [llms/](../../sources/crewai/lib/crewai/src/crewai/llms/) | RoboThree LLM | - | - |
| L2 | **Lazy 加载 providers** | **ADOPT** | 避免 import 时全部加载 | [llm.py:2721](../../sources/crewai/lib/crewai/src/crewai/llm.py) | RoboThree LLM | - | ✅ |
| L3 | **无 Fallback / Routing 协调** | **N/A** | 缺口 | （全局） | RoboThree LLM | - | - |

### 5.3 Knowledge / RAG

| # | 机制 | 分类 | 理由 | 证据 | 适用边界 | 风险 | MVP |
|---|---|---|---|---|---|---|---|
| K1 | **Knowledge + source / storage** | **ADAPT** | RAG 抽象独立 | [knowledge/](../../sources/crewai/lib/crewai/src/crewai/knowledge/) | RoboThree RAG | - | ✅ |
| K2 | **`handle_knowledge_retrieval` 在 Agent 层注入** | **ADOPT** | 召回融入 task prompt | [agent/core.py:846-855](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L846-L855) | RoboThree RAG | - | ✅ |

## 6. Proposed RoboThree Changes

> 列出会影响 RoboThree 模块边界 / 技术栈 / 数据模型 / 安全模型 / 部署形态的候选变更。**仅作为提议，未自动落地。**

### 6.1 Memory 模块

1. **新增 Capability Seam**：`StorageBackend` Protocol，进程级 factory setter + 内置 backend（lancedb / qdrant 等）。
2. **新增 Scoring 抽象**：`composite_score = w_semantic × similarity + w_recency × decay + w_importance × importance`，默认 0.5/0.3/0.2 + `recency_half_life_days = 30`。
3. **新增 Save Pool**：`ThreadPoolExecutor(max_workers=1, thread_name_prefix="mem-save")` + `add_done_callback` + `drain_writes()` read barrier。
4. **新增 Scope / Slice 视图**：路径式 + 多 scope 视图 + boolean private。
5. **EmbeddingDimensionMismatchError 不继承 RuntimeError**（避免误吞）。

### 6.2 Tool 系统

1. **新增 `BaseTool` 自动 Schema 推导**：从 `_run` 签名推导 Pydantic args_schema。
2. **新增 `tool_type` 字段**：自动注册到 `_TOOL_TYPE_REGISTRY`，支持序列化反序列化。
3. **新增 `ToolFailure` / `ToolFailurePolicy` / `ToolFailureReason` / `ToolFailureRecord` 四元组**。
4. **新增 `BaseAgentTool`**：Agent-as-Tool 抽象。
5. **`_claim_usage` 原子限制**：`max_usage_count` + `_usage_lock`。
6. **`max_parsing_attempts` 模型差异化**：OpenAI 大模型 2 / 默认 3。

### 6.3 Multi-Agent Orchestration

1. **新增 `Process` 枚举**：sequential / hierarchical / (consensual - TODO)。
2. **Manager LLM 间接调度**：通过 Agent-as-Tool 隔离 Manager 直接能力。
3. **`AgentTools` 工厂自动生成 DelegateWork / AskQuestion**。
4. **`ConditionalTask` 简单 boolean 条件**。
5. **`Task.async_execution` Thread + Future 异步执行**。

### 6.4 Event / Hook

1. **`crewai_event_bus` 单例 + 类型化订阅**。
2. **`_enter_runtime_scope / _exit_runtime_scope` 嵌套隔离**。
3. **`hooks/dispatch.py` InterceptionPoint**——PRE_STEP / POST_STEP。

### 6.5 安全 / 决策

**否决**：
- 中心化 Permission / Sandbox 缺失 → RoboThree 必须自己实现。
- 无中心化 Cancel 机制 → RoboThree 必须自己实现。
- Manager 强制零工具异常 → RoboThree 改为 warning + ignore。
- Tool 沙箱缺失 → RoboThree 必须中心化。

## 7. Requires Human Approval

> 列出需要用户拍板才能推进 RoboThree 正式架构决策的项。默认状态：`PENDING_HUMAN_DECISION`。

| # | 决策 | 状态 | 关键证据 |
|---|---|---|---|
| H1 | **Consensual Process 是否纳入 RoboThree v1** | `PENDING_HUMAN_DECISION` | [process.py:11](../../sources/crewai/lib/crewai/src/crewai/process.py#L11) — 源码 TODO |
| H2 | **Embedding 升级策略** | `PENDING_HUMAN_DECISION` | [backend.py:11-43](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L11-L43) — 默认 model 变化 |
| H3 | **Manager 自定义工具策略** | `PENDING_HUMAN_DECISION` | [crew.py:1529](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1529) — 抛 Exception |
| H4 | **Failure Policy 默认值** | `PENDING_HUMAN_DECISION` | [tool_failure.py:64-78](../../sources/crewai/lib/crewai/src/crewai/tools/tool_failure.py) — IGNORE / WARN / RAISE |
| H5 | **Async Task 最大并发数** | `PENDING_HUMAN_DECISION` | [task.py:609-622](../../sources/crewai/lib/crewai/src/crewai/task.py#L609-L622) — 无并发限制 |
| H6 | **Save Pool 串行 vs sharding** | `PENDING_HUMAN_DECISION` | [unified_memory.py:165-169](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L165-L169) |

## 8. 与其他 L3 项目的对比（仅占位）

| 项目 | Process | Memory | Tool | 结论 |
|---|---|---|---|---|
| **DeepSeek Harness** | 一切皆插件（无 Process 枚举） | append-only session log + `deriveMessages` | 六 capability seam + sandbox | 完整 Plugin 架构 |
| **Daytona** | 三平面（Control / Runner / Workspace） | 简单 Job 状态 | Job-based Worker | 远程 Worker |
| **Codex** | 四层粒度（Thread→Turn→Sampling→Tool） | append-only | 同 Seatbelt / Landlock / Bwrap | 多层粒度 |
| **OpenCode** | 串行 Tool Dispatch | SQLite + Goose | Provider Channel | 持久 SQLite |
| **Pi Agent** | Turn Snapshots | Append-Only JSONL | 3 Dispatch Strategies | 极简 |
| **CrewAI** | **Process 枚举 + Manager LLM** | **Unified Memory + Backend seam** | **`BaseTool` + Agent-as-Tool + ToolFailure** | **多 Agent 协作** |

**CrewAI 相对其他项目的独特贡献**：
- **Process 枚举 first-class** —— 唯一把「编排策略」作为产品级枚举暴露的。
- **Unified Memory 单一对象** —— 唯一把 Short / Long / Entity / Knowledge 合并为单一 facade 的。
- **Agent-as-Tool** —— 唯一把「调用 Agent」建模为「工具」的项目（匹配 LangGraph / AutoGen 通过图或对话）。
- **`ToolFailure` 显式四元组** —— 显式分类失败的设计少见。

## 9. Method

- **静态分析**：全部 41 项分类基于 Stage A / B / C1 / C2 / C3 的源码证据。
- **未运行时验证**：所有运行时行为（隔离强度、并发度、Performance）仅 `[I]` / `[UNKNOWN]`。
- **未做跨项目加权评分**：按 Skill § 14.1 跳过 100 分制。
- **未自动写入 `robothree/`**：所有 Proposed Changes / Requires Human Approval 仅为建议。
