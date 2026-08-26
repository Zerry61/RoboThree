# CrewAI — Open Questions

> **状态**：仅记录 **当前静态分析未能完全确认** 的项。每条都附 **How to Close** —— 即需要再做哪些工作 / 询问哪些用户 / 启动哪些运行时验证。

## 1. Process / Orchestration

### Q1. Consensual 流程为何未实现？

- **背景**：`Process` 枚举中 `consensual` 显式标注 `TODO`（[process.py:11](../../sources/crewai/lib/crewai/src/crewai/process.py#L11)）。
- **当前静态推断**：**无 Consensual 实现**——任何 `consensual` 字符串落入 `NotImplementedError`（[crew.py:1056-1058](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1056-L1058)）。
- **How to Close**：
  - 询问用户 / PM 是否需要。
  - 暂未发现 CrewAI Issue / RFC 讨论。
  - **建议**：**RoboThree v1 暂不实现**；如需，在 v2 通过 Flow 自行实现。

### Q2. Manager 决策失败是否真的「让 LLM 重新决策」？

- **背景**：`_execute` 把 Agent 异常转字符串返回（[base_agent_tools.py:121-124](../../sources/crewai/lib/crewai/src/crewai/tools/agent_tools/base_agent_tools.py#L121-L124)）。
- **当前静态推断**：错误返回后 LLM 看到，下一步动作由 LLM 决定。
- **How to Close**：
  - **运行时验证**：在 Manager LLM 错配 role 时，trace LLM 行为。
  - **决策**：决定 RoboThree 是否需要 retry / backoff。

### Q3. `_task_output_handler` 实际持久化策略是什么？

- **背景**：[crew.py:1507](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1507) 调用 `_task_output_handler.update(...)`。
- **当前静态推断**：使用 `KickoffTaskOutputsSQLiteStorage`（[memory/storage/kickoff_task_outputs_storage.py:19](../../sources/crewai/lib/crewai/src/crewai/memory/storage/kickoff_task_outputs_storage.py#L19)）。
- **How to Close**：
  - 实际读写路径、IO 频率、Schema 详细。
  - 推断 SQLite 路径冲突：多 crew 同进程时路径如何避免？。

### Q4. `Flow` 内具体 Run 节点是否并发？

- **背景**：`AgentExecutor` 继承 `Flow[AgentExecutorState]`（[experimental/agent_executor.py:173](../../sources/crewai/lib/crewai/src/crewai/experimental/agent_executor.py#L173)）。
- **当前静态推断**：Flow 节点是 `@start / @listen / @router` 装饰器式 DAG；具体并发取决于 Flow 节点定义。
- **How to Close**：
  - 读取 Flow 节点定义（推测在 `flow/` 中）—— **未深入**。
  - **建议**：RoboThree 走自己的 DAG，不依赖 CrewAI Flow。

### Q5. `LiteAgent` 与 `Agent` 差异？

- **背景**：`lite_agent.py` 是 1059 行的独立单 Agent 入口（[lite_agent.py](../../sources/crewai/lib/crewai/src/crewai/lite_agent.py)）。
- **当前静态推断**：绕开 Crew 的轻量入口，但具体实现（LLM 调用、Tool 解析、Memory 共享）需要深入。
- **How to Close**：
  - 深入 `lite_agent.py`：构造方式、差异。
  - **建议**：作为 RoboThree 启动阶段的轻量实现参考。

### Q6. `_knowledge_source` 配置机制？

- **背景**：`handle_knowledge_retrieval` 在 `execute_task` 中调用（[agent/core.py:846-855](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L846-L855)）。
- **当前静态推断**：通过 `self.knowledge.query` 间接调用。
- **How to Close**：
  - `Knowledge` + `KnowledgeConfig` + `KnowledgeSource` 详细。
  - RoboThree RAG 决策参考。

### Q7. `a2a/` 实际协议？

- **背景**：`a2a/` 子包存在（[a2a/](../../sources/crewai/lib/crewai/src/crewai/a2a/)）。
- **当前静态推断**：推测 Google A2A 协议。
- **How to Close**：
  - 读 `a2a/__init__.py` + `a2a/*.py`。
  - **建议**：RoboThree 关注 A2A 协议是否进入主流。

### Q8. `mcp/` 实际桥接？

- **背景**：`mcp_native_tool.py` + `mcp_tool_wrapper.py`（[mcp/](../../sources/crewai/lib/crewai/src/crewai/mcp/)）。
- **当前静态推断**：MCP 集成。
- **How to Close**：
  - 实际 tool 列表、transport、auth 机制。

### Q9. `skills/` 框架？

- **背景**：`skills/` 目录存在。
- **当前静态推断**：Skill 注册框架。
- **How to Close**：
  - 读 `skills/` 详细。

### Q10. `hooks/` 拦截点全清单？

- **背景**：`hooks/dispatch.py` + `InterceptionPoint`。
- **当前静态推断**：仅 PRE_STEP / POST_STEP 已知。
- **How to Close**：
  - 完整 `InterceptionPoint` 枚举。

### Q11. `state/` 用法？

- **背景**：`state/` 目录（[state/](../../sources/crewai/lib/crewai/src/crewai/state/)）。
- **当前静态推断**：crew-scoped state。
- **How to Close**：
  - 详细机制。

### Q12. `Flow` vs `Crew` 互斥？

- **背景**：`Flow` 是另一种编排方式（`@start / @listen / @router`）。
- **当前静态推断**：Flow 与 Crew 可互调（LiteAgent 嵌入 Flow）。
- **How to Close**：
  - 实际互操作路径。

### Q13. Code Execution Tools 实际隔离？

- **背景**：`Agent.allow_code_execution` + `get_code_execution_tools`（[agent/core.py:1260-1270](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L1260-L1270)）。
- **当前静态推断**：在 `crewai-tools/` 子包中实现；主进程风险。
- **How to Close**：
  - 读 `crewai-tools/` 实际实现。
  - **建议**：RoboThree 中心化沙箱。

### Q14. `human_input` 强制同步等待机制？

- **背景**：`task.human_input = True` → `inputs["ask_for_human_input"] = True`（[agent/core.py:951](../../sources/crewai/lib/crewai/src/crewai/agent/core.py#L951)）。
- **当前静态推断**：`_handle_human_feedback` 等待用户输入。
- **How to Close**：
  - 实际 UI / 异步机制。

### Q15. `Telemetry` 实际发送到哪？

- **背景**：`Telemetry()` 在 ToolUsage 自动创建（[tool_usage.py:108](../../sources/crewai/lib/crewai/src/crewai/tools/tool_usage.py#L108)）。
- **当前静态推断**：发送匿名使用统计。
- **How to Close**：
  - 实际 endpoint，是否可禁用。

## 2. Memory

### Q16. EncodingFlow / RecallFlow 内部具体 Flow 节点？

- **背景**：`EncodingFlow` 集成了 `batch_embed / intra_batch_dedup / parallel_find_similar / parallel_analyze / _apply_defaults / execute_plans`（[memory/encoding_flow.py:75-372](../../sources/crewai/lib/crewai/src/crewai/memory/encoding_flow.py)）。
- **当前静态推断**：每个方法都是 Flow 节点；具体 `@start / @listen / @router` 配置。
- **How to Close**：
  - 读 Flow 节点 decorators。

### Q17. `Memory.analyze_query_step` LLM 推断调用频率？

- **背景**：`depth="deep"` 路径走 RecallFlow，分析调用 LLM。
- **当前静态推断**：每次 recall 都会触发 LLM。
- **How to Close**：
  - 实际 prompt 与频率。
  - **建议**：RoboThree 决策是否需要 LLM 查询分析。

### Q18. `EncodingFlow` 多 batch 的并发上限？

- **背景**：`parallel_find_similar` + `parallel_analyze`（[memory/encoding_flow.py:155 / 224](../../sources/crewai/lib/crewai/src/crewai/memory/encoding_flow.py)）。
- **当前静态推断**：ThreadPool，默认具体 max_workers。
- **How to Close**：
  - 实际并发数。

### Q19. `consolidation` 实际策略？

- **背景**：`consolidation_threshold = 0.85` + `consolidation_limit = 5`（[unified_memory.py:116-123](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L116-L123)）。
- **当前静态推断**：LLM 合并相似记录。
- **How to Close**：
  - 实际 LLM prompt + 决策。

### Q20. `LanceDBStorage` 默认路径？

- **背景**：`storage="lancedb"`（[unified_memory.py:242-245](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L242-L245)）。
- **当前静态推断**：本地磁盘路径。
- **How to Close**：
  - 实际路径 / 冲突。

### Q21. `QdrantEdgeStorage` 实际后端？

- **背景**：`storage="qdrant-edge"`（[unified_memory.py:238-241](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L238-L241)）。
- **当前静态推断**：Qdrant Edge 客户端。
- **How to Close**：
  - 实际服务端 / 嵌入式 / cloud 差异。

### Q22. `Knowledge` 是 Memory 的子集还是独立？

- **背景**：README 声称 4 类（Short / Long / Entity / Knowledge），但 Memory 实现无 Knowledge 入口。
- **当前静态推断**：Knowledge 独立于 Memory。
- **How to Close**：
  - 实际 Knowledge 交互。

## 3. Tool

### Q23. `CacheHandler` 实际缓存粒度？

- **背景**：`ToolUsage` 引用 `cache_handler`（[tool_usage.py:99](../../sources/crewai/lib/crewai/src/crewai/tools/tool_usage.py#L99)）。
- **当前静态推断**：缓存同 prompt 工具调用结果。
- **How to Close**：
  - 实际缓存策略（key / eviction / TTL）。

### Q24. `tool_failure_collector` 触发后如何路由？

- **背景**：TaskOutput.tool_failures 累积（[task.py:886](../../sources/crewai/src/crewai/task.py#L886)）。
- **当前静态推断**：仅记录，无 listener 路由。
- **How to Close**：
  - 验证 listener 是否消费。

### Q25. `_function_calling` `max_attempts=1` 实际行为？

- **背景**：[tool_usage.py:869](../../sources/crewai/lib/crewai/src/crewai/tools/tool_usage.py#L869) `max_attempts=1`。
- **当前静态推断**：单次尝试。
- **How to Close**：
  - 失败后是否回退到 `_tool_calling` 递归。

### Q26. `tools/agent_tools/` 之外还有哪些？

- **背景**：`tools/` 目录有 ~15 子模块。
- **当前静态推断**：未深入非 Agent 工具。
- **How to Close**：
  - `cache_tools/`, `memory_tools.py`, `mcp_*.py` 等。

### Q27. `result_as_answer` 触发后行为？

- **背景**：`result_as_answer = True`（[base_tool.py:180-183](../../sources/crewai/lib/crewai/src/crewai/tools/base_tool.py#L180-L183)）。
- **当前静态推断**：Tool 结果直接结束 Agent Loop。
- **How to Close**：
  - Executor 内的具体路径。

## 4. Runtime / Architecture

### Q28. `kickoff_async` 的实际并发？

- **背景**：`kickoff_async`（[crew.py:1127](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1127)）。
- **当前静态推断**：async/await 路径，未深入。
- **How to Close**：
  - 内部 async Task 调度。

### Q29. `CrewAIAgentExecutorFlow` deprecated alias 的含义？

- **背景**：[experimental/agent_executor.py:3315](../../sources/crewai/lib/crewai/src/crewai/experimental/agent_executor.py#L3315) `CrewAgentExecutorFlow = AgentExecutor`。
- **当前静态推断**：向后兼容别名。
- **How to Close**：
  - 实际使用情况。

### Q30. `telemetry/privacy` 实现？

- **背景**：`telemetry/` 目录。
- **当前静态推断**：匿名使用统计。
- **How to Close**：
  - 实际 endpoint + opt-out 机制。

### Q31. `auth/` 实现？

- **背景**：`auth/` 目录。
- **当前静态推断**：OAuth / API Key。
- **How to Close**：
  - 实际 providers。

### Q32. `experimental/` 还有哪些实验 API？

- **背景**：`experimental/` 目录。
- **当前静态推断**：`AgentExecutor` 就在此。
- **How to Close**：
  - 实际列表。

### Q33. `flow/` 完整 DAG？

- **背景**：`flow/` 目录。
- **当前静态推断**：`@start / @listen / @router` 装饰器。
- **How to Close**：
  - 实际节点定义。

### Q34. `plus_api.py` CrewAI+ 商业服务？

- **背景**：[plus_api.py](../../sources/crewai/lib/crewai/src/crewai/plus_api.py)。
- **当前静态推断**：云端增强服务。
- **How to Close**：
  - 实际 endpoints + 业务模式。

### Q35. `rag/` 工具？

- **背景**：`rag/` 目录。
- **当前静态推断**：RAG 工具集。
- **How to Close**：
  - 实际工具列表。

### Q36. `project/` 与 `project_utils.py`？

- **背景**：`project/` 子包 + `utilities/project_utils.py`。
- **当前静态推断**：项目管理。
- **How to Close**：
  - 实际 URIs/manifests。

### Q37. `translations/` 与 `i18n`？

- **背景**：`translations/` + `utilities/i18n.py`。
- **当前静态推断**：模板式 i18n。
- **How to Close**：
  - 实际语言 + 模板。

### Q38. `serialization.py` / `crew_json_encoder.py` / `training_converter.py`？

- **背景**：`utilities/` 30+ 模块。
- **当前静态推断**：JSON encoder + 训练数据转换。
- **How to Close**：
  - 实际 schema。

### Q39. `evaluators/` 子包？

- **背景**：`utilities/evaluators/`。
- **当前静态推断**：评估器。
- **How to Close**：
  - 实际评估策略。

### Q40. `file_handler.py` / `file_store.py`？

- **背景**：`utilities/`。
- **当前静态推断**：文件 IO 助手。
- **How to Close**：
  - 实际读写策略。

### Q41. `rpm_controller.py` 与 `rw_lock.py`？

- **背景**：`utilities/`。
- **当前静态推断**：RPM 限流 + 读写锁。
- **How to Close**：
  - 实际算法。

### Q42. `lock_store.py`？

- **背景**：`utilities/`。
- **当前静态推断**：全局锁仓库。
- **How to Close**：
  - 实际锁类型。

### Q43. `step_execution_context.py`？

- **背景**：`utilities/`。
- **当前静态推断**：步骤上下文。
- **How to Close**：
  - 实际字段。

### Q44. `declarative_refs.py` / `prompts.py`？

- **背景**：`utilities/`。
- **当前静态推断**：声明式引用 + 提示模板。
- **How to Close**：
  - 实际格式。

### Q45. `internal_instructor.py` / `pydantic_schema_utils.py`？

- **背景**：`utilities/`。
- **当前静态推断**：Instructor helper + Pydantic 工具。
- **How to Close**：
  - 实际包装。

### Q46. `import_utils.py` / `token_counter_callback.py` / `streaming.py`？

- **背景**：`utilities/`。
- **当前静态推断**：动态导入 + Token 计数 + 流式输出。
- **How to Close**：
  - 实际实现。

### Q47. `crew_chat.py` / `reset_memories.py`？

- **背景**：`utilities/`。
- **当前静态推断**：协作聊天 + 重置记忆。
- **How to Close**：
  - 实际用途。

### Q48. `planner_handler.py` / `reasoning_handler.py`？

- **背景**：`utilities/`。
- **当前静态推断**：规划 + 推理。
- **How to Close**：
  - 实际策略。

### Q49. `task_output_storage_handler.py`？

- **背景**：`utilities/`。
- **当前静态推断**：任务输出存储。
- **How to Close**：
  - 实际存储。

### Q50. `cli/` 内嵌 CLI？

- **背景**：`cli/` 目录。
- **当前静态推断**：与 `lib/cli/` 不同的内嵌 CLI。
- **How to Close**：
  - 实际命令。

### Q51. `crewai-tools/` 子包中的 150+ 工具？

- **背景**：`lib/crewai-tools/` 大型工具集。
- **当前静态推断**：File / Web / Code / DB / Search / 等各种工具。
- **How to Close**：
  - 实际工具清单（tool.specs.json 存在）。
  - **建议**：仅作为参考；RoboThree 自行实现。

### Q52. `crewai-files/` 子包？

- **背景**：`lib/crewai-files/`。
- **当前静态推断**：文件输入处理。
- **How to Close**：
  - 实际处理。

### Q53. `crewai-core/` 子包？

- **背景**：`lib/crewai-core/`。
- **当前静态推断**：核心 service（未深入）。
- **How to Close**：
  - 实际 content / cycle 等。

### Q54. `devtools/` 子包？

- **背景**：`lib/devtools/`。
- **当前静态推断**：开发工具。
- **How to Close**：
  - 实际工具。

### Q55. `pyproject.toml` 中 6 个 workspace 包的版本协调？

- **背景**：6 个 uv workspace 包。
- **当前静态推断**：版本可能独立 release。
- **How to Close**：
  - 实际版本矩阵。

### Q56. `experimental/agent_executor.py` 内 1913 / 2802 / 3273 之外的逻辑？

- **背景**：`AgentExecutor` 3500+ 行。
- **当前静态推断**：包含大量细节（[AgentExecutorState](#anchor) / [TodoList](#anchor) / [Plan / Replan](#anchor) 等）。
- **How to Close**：
  - 详细阅读 Flow 节点。

## 5. 跨项目

### Q57. 与 DeepSeek Harness Plugin 架构对比？

- **背景**：DeepSeek Harness 一切皆插件（Cordis）；CrewAI 一切皆 Pydantic。
- **How to Close**：
  - 写 `research/comparisons/architecture-philosophy.md`。
  - RoboThree 决策：Plugin-first vs Pydantic-first。

### Q58. 与 LangGraph State + Checkpoint 对比？

- **背景**：LangGraph 强调 Graph / State / Checkpoint；CrewAI 强调 Process / Agent / Task。
- **How to Close**：
  - 写 `research/comparisons/control-flow.md`。

### Q59. 与 AutoGen 对话范式对比？

- **背景**：AutoGen 强调对话；CrewAI 强调 Process。
- **How to Close**：
  - 写 `research/comparisons/conversation-vs-process.md`。

## 6. 全部 How to Close 汇总

| 类别 | 数量 | 关键 |
|---|---|---|
| Process / Orchestration | 15 | Q1-Q15 |
| Memory | 7 | Q16-Q22 |
| Tool | 5 | Q23-Q27 |
| Runtime / Architecture | 28 | Q28-Q55 |
| 跨项目 | 3 | Q57-Q59 |
| **总计** | **58** | - |

## 7. 优先级建议

| 优先级 | Q 编号 | 理由 |
|---|---|---|
| **P0** | Q1, Q5, Q13, Q15, Q21 | 影响 RoboThree 决策（Consensual / LiteAgent / Code Sandbox / Telemetry / Qdrant） |
| **P1** | Q3, Q4, Q9, Q10, Q28, Q33 | 影响 RoboThree 架构（持久化 / DAG / Skills / Hooks / Async / Flow） |
| **P2** | Q2, Q6, Q7, Q8, Q11, Q12, Q14, Q16-Q27, Q29-Q32, Q34-Q56 | 细节 / 优化 |
| **P3** | Q57-Q59 | 跨项目对比（待所有 L3 完成后） |
