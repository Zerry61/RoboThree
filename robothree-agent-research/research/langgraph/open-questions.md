# LangGraph 研究 — 未解问题

> 研究日期：2026-07-18

## 开放问题

### 1. DeltaChannel 机制是否需要立即引入？

**问题**：LangGraph 的 DeltaChannel 实现了稀疏 checkpoint（只保存增量而不是每次全量快照），这是一个性能优化。RoboThree 的 MVP 是否需要？

**证据缺口**：未实际运行 LangGraph 并测量 DeltaChannel vs 全量 checkpoint 的性能差异。

**How to Close**：
- 在 RoboThree MVP 中先用全量 checkpoint（简单可靠）
- 当单次 Task State 超过 10KB 且 step 数超过 100 时再考虑 Delta 优化
- 可以参考 `checkpoint-sqlite/_delta.py` 的实现

**分类**：DEFER（MVP 不需要，后期优化）

---

### 2. Checkpoint 序列化格式选型

**问题**：LangGraph 使用 msgpack（通过自定义 JsonPlusSerializer）。RoboThree 应该用什么？

**How to Close**：
- 评估候选：JSON (最大兼容性) vs msgpack (更高性能) vs protobuf (强类型)
- JSON 对于 MVP 足够，且便于调试
- 如果 Task State 包含二进制数据（图片、文件），msgpack/protobuf 更有优势
- 参考 `checkpoint/serde/` 的设计

**分类**：NEEDS_MORE_EVIDENCE

---

### 3. 多 Worker 并发下的 Checkpoint 一致性

**问题**：LangGraph 的 `_checkpointer_put_after_previous` 用 future 链保证同一线程内 checkpoint 的写入顺序。但在多 Worker 场景下（多个进程同时操作同一个 thread），LangGraph 如何保证一致性？

**证据缺口**：
- 未找到 LangGraph 中的分布式锁机制
- PostgresSaver 可能依赖数据库事务，但未确认

**How to Close**：
- 阅读 `checkpoint-postgres/aio.py` 中的 `aput()` 实现，检查是否有乐观锁/悲观锁
- 或查看 LangGraph Platform 文档中的多 Worker 部署说明

**分类**：NEEDS_MORE_EVIDENCE

---

### 4. CachePolicy 的实际实现

**问题**：`CachePolicy` 似乎是一个节点级别的结果缓存机制，但源码中只看到了 `match_cached_writes()` 和 `InMemoryCache` 的简单实现。它是否支持跨 session 缓存？

**证据缺口**：只读了 `_loop.py:1549-1562` `match_cached_writes()` 和 `cache/memory/` 的简单实现。

**How to Close**：
- 阅读 `cache/redis/__init__.py` 确认是否有 Redis 后端
- 查看测试文件 `test_graph_callbacks.py` 中的缓存测试

**分类**：NEEDS_MORE_EVIDENCE（对 RoboThree 非关键，后期研究）

---

### 5. ManagedValue 系统的边界

**问题**：`ManagedValue` 是一种"不持久化的计算属性"，类似 SQL 的 generated column。但它的适用场景是什么？与普通 State 字段的关系如何？

**How to Close**：
- 阅读 `managed/base.py` 和 `managed/is_last_step.py`
- `IsLastStep` 是运行时注入的上下文信息，不适合持久化

**分类**：ADAPT（可以作为 Runtime Context 而非 State 字段）

---

### 6. Time Travel 的并发安全性

**问题**：当用户在 time travel 模式下从历史 checkpoint 创建 fork 分支后，新 fork 的 checkpoint 链与原分支的 checkpoint 链如何共存？读取最新 checkpoint 时返回哪个分支？

**证据缺口**：
- `BaseCheckpointSaver.get_tuple()` 默认返回"最新的 checkpoint"
- fork 创建一个新的 checkpoint（`source="fork"`），其 `checkpoint_id` 是新的
- 但 fork 的 parent_config 指向原 checkpoint，需要确认查询逻辑

**How to Close**：
- 阅读 `checkpoint/memory/__init__.py` 的 `get_tuple()` 实现
- 确认：最新 checkpoint 总是按 `checkpoint_id` 排序（uuid6），所以 fork 后的新 checkpoint 自然成为"最新"

**分类**：INFERENCE（基于 uuid6 单调递增特性推断，需确认）

---

### 7. Streaming Custom Mode 的实现

**问题**：LangGraph 的 `custom` stream mode 允许节点内写入自定义事件。这个 StreamWriter 是如何传递给节点函数的？

**How to Close**：
- 阅读 `types.py` 中的 `StreamWriter` 定义
- 阅读 `stream/_types.py` 中的 stream mode 路由

**分类**：NEEDS_MORE_EVIDENCE（对 RoboThree 非核心，作为参考）

---

### 8. LLM 调用与 Pregel 引擎的关系

**问题**：LangGraph 本身**不是** LLM 调用框架。LLM 调用是作为节点函数的一部分发生的。但 `prebuilt/` 中的 `create_react_agent` 是如何将 LLM + Tool Calling 打包成 Pregel 节点的？

**How to Close**：
- 阅读 `prebuilt/chat_agent_executor.py` 中的 `create_react_agent`
- 阅读 `prebuilt/tool_node.py` 中的 `ToolNode`

**分类**：ADAPT（RoboThree 可以借鉴 React Agent 的节点分解方式）

---

## 已完成解答的问题

| 问题 | 结论 | 位置 |
|------|------|------|
| Agent Loop 是否应固定成 while loop？ | ❌ 应采用 Superstep 模型 | `architecture.md` §2 |
| 是否需要状态机/Workflow Graph？ | ✅ Superstep 就是隐式状态机；MVP 不需要显式 Graph Builder | `robothree-fit-analysis.md` §1.1, §1.7 |
| 如何暂停和恢复？ | ✅ Paused 状态 + Checkpoint → 显式 API 恢复 | `robothree-fit-analysis.md` §1.4, §1.5 |
| 人工审批如何插入？ | ✅ interrupt_before/after + Command(resume) | `architecture.md` §5 |
| 长任务如何跨进程恢复？ | ✅ thread_id → get_tuple → __enter__ 恢复 | `architecture.md` §8 |
| Task State vs Session State？ | ✅ Reducer 声明的字段 = Task State；需单独设计 Session Store | `robothree-fit-analysis.md` §2 |
