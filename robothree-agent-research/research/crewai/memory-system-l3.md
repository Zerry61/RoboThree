# CrewAI — Unified Memory System (L3 Deep Dive)

> **机制选型依据**：CrewAI 在 **单一 `Memory` 对象** 中统一了 Short / Long / Entity / Knowledge 四类（README 声明四类，实现在 `Memory` 内部皆走 `remember/recall/scope/slice` 同一 API）。
> - 把 **Memory 抽象** + **Capability Seam**（`<==> DeepSeek Harness`） + **异步 Future 写入** + **复合打分 + 路径 scope** 单独抽出来，对 RoboThree 是最直接可借鉴的范式。

## 1. 数据结构

### 1.1 `Memory` 主类（[memory/unified_memory.py:76](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L76)）

```python
class Memory(BaseModel):
    memory_kind: Literal["memory"] = "memory"
    llm: BaseLLM | str = "gpt-5.4-mini"
    storage: StorageBackend | str = "lancedb"
    embedder: Any = None
    recency_weight: float = 0.3
    semantic_weight: float = 0.5
    importance_weight: float = 0.2
    recency_half_life_days: int = 30
    consolidation_threshold: float = 0.85
    consolidation_limit: int = 5
    default_importance: float = 0.5
    confidence_threshold_high: float = 0.8
    confidence_threshold_low: float = 0.5
    complex_query_threshold: float = 0.7
    exploration_budget: int = 1
    query_analysis_threshold: int = 200
    read_only: bool = False
    root_scope: str | None = None
```

**关键 Pydantic 私有属性**：

- `_config: MemoryConfig` — 内部配置聚合
- `_llm_instance: BaseLLM | None` — 懒加载
- `_embedder_instance: Any` — 懒加载
- `_storage: StorageBackend` — 强制实例化
- `_save_pool: ThreadPoolExecutor(max_workers=1, thread_name_prefix="memory-save")` — **串行写入**（max_workers=1）
- `_pending_saves: list[Future]` — 跟踪中的 save
- `_pending_lock: threading.Lock` + `_reset_lock: RLock`

### 1.2 `MemoryRecord`（[memory/types.py:32-90](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L32-L90)）

```python
class MemoryRecord(BaseModel):
    id: str                          # uuid4
    content: str                     # 主文本
    scope: str = "/"                 # 路径式 scope
    categories: list[str] = []
    metadata: dict = {}
    importance: float = 0.5          # 0-1 (ge=0, le=1)
    created_at: datetime
    last_accessed: datetime
    embedding: list[float] | None = None   # exclude=True
    source: str | None = None        # provenance / privacy
    private: bool = False
```

### 1.3 `MemoryMatch`（[memory/types.py:80-90](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L80-L90)）

```python
class MemoryMatch(BaseModel):
    record: MemoryRecord
    score: float
    match_reasons: list[str]  # ["semantic" | "recency" | "importance" | "diversity" | "temporal" | "reformulation" | "synthesized" | "pivotal" | "hindsight" | "contextual" | "transferable"]
```

### 1.4 `MemoryConfig`（[memory/types.py:135-280](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L135-L280)）

内部分数权重 + 阈值。**默认 0.3 + 0.5 + 0.2 = 1.0**（来源注释）。

### 1.5 `MemoryScope` / `MemorySlice`（[memory/memory_scope.py:53 / 379](../../sources/crewai/lib/crewai/src/crewai/memory/memory_scope.py)）

- `MemoryScope(memory, root_path)` — 路径式 scope 视图
- `MemorySlice(memory, scopes, categories, read_only)` — 多 scope 视图

## 2. Capability Seam — `StorageBackend` Protocol

### 2.1 Protocol 定义（[storage/backend.py:45](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L45)）

```python
@runtime_checkable
class StorageBackend(Protocol):
    def save(self, records: list[MemoryRecord]) -> None
    def search(self, query_embedding, scope_prefix, categories, metadata_filter, limit, min_score) -> list[tuple[MemoryRecord, float]]
    def delete(self, scope_prefix, categories, record_ids, older_than, metadata_filter) -> int
    def update(self, record: MemoryRecord) -> None
    def get_record(self, record_id: str) -> MemoryRecord | None
    def list_records(self, scope_prefix, limit, offset) -> list[MemoryRecord]
    def get_scope_info(self, scope: str) -> ScopeInfo
    def list_scopes(self, parent: str = "/") -> list[str]
    def list_categories(self, scope_prefix: str | None = None) -> dict[str, int]
    def count(self, scope_prefix: str | None = None) -> int
    def reset(self, scope_prefix: str | None = None) -> None
    # Async variants:
    async def asave(self, records) -> None
    async def asearch(self, ...) -> list[tuple[MemoryRecord, float]]
    async def adelete(self, ...) -> int
```

**16 个方法**（同步 12 + 异步 3）+ `EmbeddingDimensionMismatchError` 异常。

### 2.2 自定义 Backend 注入

```python
# storage/factory.py:33
def set_memory_storage_factory(factory: MemoryStorageFactory | None) -> None:
    """Replace the process-wide default memory storage factory."""
```

进程级 setter → `Memory.model_post_init` 中 `resolve_memory_storage(self.storage)` 调用（[unified_memory.py:235](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L235)）。

```python
# unified_memory.py:232-251
if isinstance(self.storage, str):
    custom = resolve_memory_storage(self.storage)
    if custom is not None:
        self._storage = custom
    elif self.storage == "qdrant-edge":
        self._storage = QdrantEdgeStorage()
    elif self.storage == "lancedb":
        self._storage = LanceDBStorage()
    else:
        self._storage = LanceDBStorage(path=self.storage)
else:
    self._storage = self.storage
```

**三个途径**：
1. 注入 `StorageBackend` 实例。
2. 注册 `set_memory_storage_factory(fn)` → 进程级。
3. 传 `"lancedb"` / `"qdrant-edge"` / 路径字符串 → 内置实现。

### 2.3 内置实现

- `LanceDBStorage`（[storage/lancedb_storage.py:42](../../sources/crewai/lib/crewai/src/crewai/memory/storage/lancedb_storage.py#L42)）— 默认
- `QdrantEdgeStorage`（[storage/qdrant_edge_storage.py:81](../../sources/crewai/lib/crewai/src/crewai/memory/storage/qdrant_edge_storage.py#L81)）— qdrant-edge 客户端

### 2.4 维度不匹配错误

`EmbeddingDimensionMismatchError`（[storage/backend.py:11-43](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L11-L43)）—— **特意不继承 `RuntimeError`**（避免被解释器 shutdown 路径误吞）。**这是一个深思熟虑的设计选择**。

## 3. 写入路径

### 3.1 保存流程

```python
# unified_memory.py:430-521
def remember(self, content, scope=None, categories=None, metadata=None,
             importance=None, source=None, private=False, agent_role=None,
             root_scope=None) -> MemoryRecord | None:
    if self.read_only:
        return None
    crewai_event_bus.emit(self, MemorySaveStartedEvent(...))
    future = self._submit_save(
        self._encode_batch,
        [content],
        scope, categories, metadata, importance, source, private, effective_root,
    )
    records = future.result()                   # 同步阻塞
    record = records[0] if records else None
    crewai_event_bus.emit(self, MemorySaveCompletedEvent(...))
    return record
```

**关键观察**：
- `remember()` **同步阻塞**（`.result()`）—— 调用方拿到 `MemoryRecord` 立即得到结果。
- `remember_many()` **异步非阻塞**（仅 `_submit_save`，无 `.result()`），调用方拿到 `[ ]`。
- 两者都走 `_encode_batch` + `_submit_save` → `ThreadPoolExecutor.submit(ctx.run, ...)`，**串行化**（`max_workers=1`）。

### 3.2 异步保存 + Read Barrier

```python
# unified_memory.py:712-713
def recall(self, query, ...):
    # Read barrier: wait for any pending background saves to finish
    self.drain_writes()
```

`recall` 永远会先 `drain_writes`，确保搜索时所有 pending 写入已完成。这是为了 **read-after-write 语义**。

### 3.3 Save Pool 与 Shutdown

```python
# unified_memory.py:297-322
def _submit_save(self, fn, *args, **kwargs) -> Future[Any]:
    with self._reset_lock:
        ctx = contextvars.copy_context()
        try:
            future = self._save_pool.submit(ctx.run, fn, *args, **kwargs)
        except RuntimeError:
            # Pool shut down -- run synchronously as fallback
            future = Future()
            try:
                result = fn(*args, **kwargs)
                future.set_result(result)
            except Exception as exc:
                future.set_exception(exc)
            return future
        with self._pending_lock:
            self._pending_saves.append(future)
        future.add_done_callback(self._on_save_done)
        return future
```

**关键设计**：
- `max_workers=1`—— 强制 **save 串行**（避免 race）。
- Pool 关闭时 fallback 同步执行。
- `add_done_callback` → `_on_save_done` 触发 `MemorySaveFailedEvent`（仅失败，不传播 exception）。

### 3.4 Encoding Flow

```python
# encoding_flow.py:75
class EncodingFlow(Flow[EncodingState]):
    # Steps:
    # - batch_embed              [113]
    # - intra_batch_dedup        [122]
    # - parallel_find_similar    [155]    # 找到与现有库的相似记录
    # - parallel_analyze         [224]    # LLM 推断 scope / categories / importance
    # - _apply_defaults          [349]
    # - execute_plans            [372]
```

**关键步骤**：
1. `batch_embed` — 批量嵌入（避免 per-call embedding）。
2. `intra_batch_dedup` — 批内去重（基于余弦相似度）。
3. `parallel_find_similar` — 找到与 limit=5 的近似记录（consolidation）。
4. `parallel_analyze` — 用 LLM 推断 `scope / categories / importance`。
5. `execute_plans` — 写入 storage，记录 consolidation decisions。

### 3.5 Consolidation

```python
# unified_memory.py:116-123
consolidation_threshold: float = 0.85
consolidation_limit: int = 5
```

- `consolidation_threshold` — 相似度 ≥ 0.85 触发合并。
- `consolidation_limit` — 同一新记录最多与 5 条现有记录对比。
- **合并策略**通过 `Memory.analyze`（[memory/analyze.py](../../sources/crewai/lib/crewai/src/crewai/memory/analyze.py)）+ LLM 决策。

## 4. 召回路径

### 4.1 双深度召回

```python
# unified_memory.py:681-816
def recall(self, query, scope=None, categories=None, limit=10,
           depth: Literal["shallow", "deep"] = "deep", source=None,
           include_private=False) -> list[MemoryMatch]:
    self.drain_writes()                # read barrier
    # ...
    if depth == "shallow":
        embedding = embed_text(self._embedder, query)
        raw = self._storage.search(embedding, ...)
    else:
        flow = RecallFlow(
            storage=self._storage, llm=self._llm,
            embedder=self._embedder, config=self._config,
        )
        flow.kickoff(inputs={"query": ..., "limit": limit, ...})
        results = flow.state.final_results
```

### 4.2 `RecallFlow`（[memory/recall_flow.py:58](../../sources/crewai/lib/crewai/src/crewai/memory/recall_flow.py#L58)）

```python
class RecallFlow(Flow[RecallState]):
    # Steps:
    # - analyze_query_step        [181]   # LLM 分解 query → sub-queries + scopes
    # - filter_and_chunk          [246]
    # - search_chunks             [269]
    # - _do_search                [89]    # 并行 search × scopes
    # - decide_depth              [274]   # confidence-based routing
    # - recursive_exploration     [294]
    # - re_search                 [336]
    # - re_decide_depth           [341]
    # - synthesize_results        [346]
```

`RecallFlow` 本身是 **Flow**（[flow/](../../sources/crewai/lib/crewai/src/crewai/flow/) 装饰器），靠 `@start / @listen / @router` 编排节点。

`_do_search` 内部用 `ThreadPoolExecutor(max_workers=min(len(tasks), 4))` 进行并行搜索（[recall_flow.py:147](../../sources/crewai/lib/crewai/src/crewai/memory/recall_flow.py#L147)）。

### 4.3 Composite Score

```python
# types.py:345-379
def compute_composite_score(record, semantic_score, config) -> tuple[float, list[str]]:
    age_seconds = (datetime.utcnow() - record.created_at).total_seconds()
    age_days = max(age_seconds / 86400.0, 0.0)
    decay = 0.5 ** (age_days / config.recency_half_life_days)
    composite = (
        config.semantic_weight * semantic_score
        + config.recency_weight * decay
        + config.importance_weight * record.importance
    )
    reasons = ["semantic"]
    if decay > 0.5:
        reasons.append("recency")
    if record.importance > 0.5:
        reasons.append("importance")
    return composite, reasons
```

**权重公式**：`composite = w_semantic × similarity + w_recency × decay + w_importance × importance`，sum 默认 1.0。

`decay = 0.5^(age_days / half_life_days)` — 30 天减半。

### 4.4 Confidence-Based Routing

```python
# unified_memory.py:128-147
confidence_threshold_high: float = 0.8   # 之上 → 直接返回
confidence_threshold_low: float = 0.5    # 之下 → 触发 deeper exploration
complex_query_threshold: float = 0.7    # 复杂查询阈值
exploration_budget: int = 1              # 探索轮数
```

`RecallFlow.decide_depth` / `recursive_exploration` / `re_search` / `re_decide_depth` 实现 confidence-based routing。

### 4.5 Oversample Factor

```python
# types.py:26
_RECALL_OVERSAMPLE_FACTOR = 2
```

召回先多取（结果 `limit * 2`），再 trim。这是后处理 composite scoring 的基础。

## 5. Scope / Slice 视图

### 5.1 Scope

```python
# unified_memory.py:898-902
def scope(self, path: str) -> MemoryScope:
    return MemoryScope(memory=self, root_path=path)
```

`MemoryScope` 是路径式视图（[memory_scope.py:53](../../sources/crewai/lib/crewai/src/crewai/memory/memory_scope.py#L53)），像一个"目录"。所有 remember/recall 操作限定在 `root_path` 子树。

### 5.2 Slice

```python
# unified_memory.py:904-918
def slice(self, scopes: list[str], categories=None, read_only=True) -> MemorySlice:
    return MemorySlice(memory=self, scopes=scopes, categories=categories, read_only=read_only)
```

`MemorySlice` 是**多 scope 视图** + categories 过滤 + read-only。**适合 Multi-Agent 共享一个 subset 记忆**。

### 5.3 Root Scope

```python
# unified_memory.py:152-159
root_scope: str | None = Field(
    default=None,
    description=(
        "Structural root scope prefix. When set, LLM-inferred or explicit scopes "
        "are nested under this root. For example, a crew with root_scope='/crew/research' "
        "will store memories at '/crew/research/<inferred_scope>'."
    ),
)
```

实例级 scope prefix。**Crew-level 隔离** 的简单方式。

### 5.4 Privacy

```python
# types.py:80-90
private: bool = False  # 仅在 source 匹配或 include_private=True 时可见
```

召回时过滤：

```python
# recall_flow.py:109-114
if not self.state.include_private and raw:
    raw = [
        (r, s) for r, s in raw
        if not r.private or r.source == self.state.source
    ]
```

**per-source privacy**—— 来自同一 source 的 Agent 可见自己的私有记忆。

## 6. 失败 / 取消 / 恢复

### 6.1 写入失败

```python
# _on_save_done:324-348
def _on_save_done(self, future):
    try:
        with self._pending_lock:
            try:
                self._pending_saves.remove(future)
            except ValueError:
                pass
        exc = future.exception()
        if exc is not None:
            crewai_event_bus.emit(self, MemorySaveFailedEvent(...))
    except Exception:
        pass  # swallow everything during shutdown
```

**保存失败仅 emit `MemorySaveFailedEvent`**，不传播给 caller。Task 不因此失败。

### 6.2 进程退出

```python
# _background_encode_batch:644-649
except RuntimeError as e:
    if "cannot schedule new futures" in str(e):
        return []
    raise
```

进程退出时 `asyncio.run() → to_thread()` 报 `cannot schedule new futures` → **静默放弃**。**这是正确选择**（进程退出了，没必要 raise）。

### 6.3 取消

**`Memory` 没有 cancel 机制**。Save 是后台 thread，无法取消。
- 唯一兜底是 `drain_writes`，主动等待所有 pending 完成。
- `close()`（[unified_memory.py:365-370](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L365-L370)）— `drain_writes + storage.close() + save_pool.shutdown(wait=True)`。

### 6.4 内存完整性

- ✅ **Read-after-write**：recall 之前自动 `drain_writes`。
- ✅ **Save 串行化**：`max_workers=1`。
- ✅ **不再试图用 shutdown 时 already-closed threadpool 执行** —— 优雅 fallback。
- ⚠ **没有事务**：save 失败只会 emit 事件，不会回滚之前的 save。
- ⚠ **Race 风险是 closed**：save pool 关闭后 `submit` 同步 fallback → 可能阻塞 caller。

## 7. 关键决策矩阵

| 决策 | 类型 | 证据 |
|---|---|---|
| Memory 单一对象统一 4 类 | FACT | [unified_memory.py:76](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L76) |
| `StorageBackend` Protocol | FACT | [backend.py:45](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L45) |
| 进程级 factory setter | FACT | [factory.py:33](../../sources/crewai/lib/crewai/src/crewai/memory/storage/factory.py#L33) |
| Save 串行化（max_workers=1） | FACT | [unified_memory.py:165-169](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L165-L169) |
| Recall 自动 `drain_writes` | FACT | [unified_memory.py:712-713](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L712-L713) |
| Composite score = recency + semantic + importance | FACT | [types.py:345-379](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L345-L379) |
| RecallFlow 是 Flow 装饰器 | FACT | [recall_flow.py:58](../../sources/crewai/lib/crewai/src/crewai/memory/recall_flow.py#L58) |
| `_search_one` 用 ThreadPoolExecutor 并行 | FACT | [recall_flow.py:147-154](../../sources/crewai/lib/crewai/src/crewai/memory/recall_flow.py#L147-L154) |
| Embedding dimension mismatch 主动报错 | FACT | [backend.py:11-43](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L11-L43) |
| Recall oversample 2x | FACT | [types.py:26](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L26) |
| Confidence-based routing 高/低阈值 | FACT | [unified_memory.py:128-147](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L128-L147) |
| Save 失败仅 emit 事件不传播 | FACT | [unified_memory.py:324-348](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L324-L348) |
| Shutdown 期间 silent abandon | FACT | [unified_memory.py:644-649](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L644-L649) |
| LLM-driven scope inference | FACT | [encoding_flow.py:224](#anchor) + `analyze.py` |
| Memory 在 Agent 内部是 `memory: bool = False` | FACT | [agent/core.py:179](#anchor) — `Agent.memory` |
| Recency 权重调成 0.3 / 0.5 / 0.2 | FACT | [unified_memory.py:100-111](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L100-L111) |

## 8. 关键 UNKNOWN

- `analyze.py` 中 LLM 推断 scope / categories / importance 的 prompt 实际生成细节（**未深入**）。
- `Memory.analyze_query_step` 中 LLM 决定 sub-queries 的生成 prompt（**未深入**）。
- `EncodingFlow` / `RecallFlow` Flow 节点的具体执行顺序（`@start / @listen / @router` 配置）—— **未深入**。
- `LanceDBStorage` 实际数据落盘位置 / 多 crew 共享（路径冲突）—— **未深入**。
- `QdrantEdgeStorage` 实际后端选择（cloud vs edge）—— **未深入**。

## 9. 与 RoboThree 的对照

| 维度 | CrewAI Memory | RoboThree 现状（猜测） |
|---|---|---|
| Unified Memory vs 4 个对象 | 单一 | （待确认） |
| Capability Seam (StorageBackend Protocol) | ✅ | （待确认） |
| Save Pool 串行化 | ✅ | （待确认） |
| Read-after-write barrier | ✅ | （待确认） |
| Composite Score | ✅ w_recency + w_semantic + w_importance | （待确认） |
| Confidence-based Routing | ✅ | （待确认） |
| Scope / Slice 视图 | ✅ | （待确认） |
| Per-source Privacy | ✅ | （待确认） |
| Process-level Factory | ✅ | （待确认） |

## 10. 对 RoboThree 的五分类建议（详见 [robothree-fit-analysis.md](robothree-fit-analysis.md)）

| 机制 | 分类 | 关键理由 |
|---|---|---|
| **Unified Memory 单一对象** | ADOPT | Short / Long / Entity / Knowledge 分类型在内部而非 API 层分裂 |
| **StorageBackend Protocol seam** | ADOPT | 进程级 factory + Protocol + 内置实现 + 自定义路径 |
| **Save Pool 串行化** | ADOPT | `max_workers=1` + `add_done_callback` 保证 read-after-write |
| **Composite Score 加权** | ADOPT | `w_semantic + w_recency + w_importance` 默认 0.5/0.3/0.2 |
| **Confidence-based Routing** | ADOPT | 高/低阈值 + exploration_budget |
| **EncodingFlow / RecallFlow** | ADAPT | Flow 编排；可考虑替换为 RoboThree 自己的 DAG |
| **Per-source Privacy** | ADAPT | 简单但够用；RoboThree 可用更细粒度的属性级权限 |
| **Scope / Slice 视图** | ADOPT | 路径式 + 多 scope 视图 |
| **EmbeddingDimensionMismatchError 不继承 RuntimeError** | ADOPT | 深思熟虑；避免 shutdown 路径误吞 |
| **`max_workers=1` 保存串行化** | ADAPT | 简单但限制并发；RoboThree 可分库 + sharding |
| **`recency_half_life_days` 30 天** | ADAPT | 默认值合理；可配置 |
| **Embedding 升级策略** | DEFER | 锁默认 model 是用户责任 |
| **DeepSeek Harness 风格 Service Definition/Provider/Consumer** | ADAPT | CrewAI 选择 Protocol 而非双层 Provider；RoboThree 决策 |
| **Flow 编排 (EncodingFlow/RecallFlow)** | DEFER | 太重；RoboThree 可用更轻的 DAG |
| **Memory.analyze_query_step LLM 推断** | NEEDS_MORE_EVIDENCE | 实际延迟 / 成本未知 |

## 11. 关键引用清单

| 引用 | 位置 |
|---|---|
| Memory 主类 | [memory/unified_memory.py:76](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L76) |
| MemoryRecord 数据 | [memory/types.py:32-90](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L32-L90) |
| MemoryMatch + match_reasons | [memory/types.py:80-130](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L80-L130) |
| MemoryConfig 默认值 | [memory/types.py:135-280](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L135-L280) |
| compute_composite_score | [memory/types.py:345-379](../../sources/crewai/lib/crewai/src/crewai/memory/types.py#L345-L379) |
| StorageBackend Protocol | [memory/storage/backend.py:45](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L45) |
| EmbeddingDimensionMismatchError | [memory/storage/backend.py:11-43](../../sources/crewai/lib/crewai/src/crewai/memory/storage/backend.py#L11-L43) |
| set_memory_storage_factory | [memory/storage/factory.py:33](../../sources/crewai/lib/crewai/src/crewai/memory/storage/factory.py#L33) |
| remember (sync) | [memory/unified_memory.py:430-521](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L430-L521) |
| remember_many (async) | [memory/unified_memory.py:523-579](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L523-L579) |
| _submit_save | [memory/unified_memory.py:297-322](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L297-L322) |
| _on_save_done | [memory/unified_memory.py:324-348](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L324-L348) |
| drain_writes | [memory/unified_memory.py:350-363](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L350-L363) |
| close | [memory/unified_memory.py:365-370](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L365-L370) |
| recall (shallow + deep) | [memory/unified_memory.py:681-816](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L681-L816) |
| scope / slice / list_scopes | [memory/unified_memory.py:898-1014](../../sources/crewai/lib/crewai/src/crewai/memory/unified_memory.py#L898-L1014) |
| RecallFlow | [memory/recall_flow.py:58](../../sources/crewai/lib/crewai/src/crewai/memory/recall_flow.py#L58) |
| RecallFlow._do_search | [memory/recall_flow.py:89-175](../../sources/crewai/lib/crewai/src/crewai/memory/recall_flow.py#L89-L175) |
| EncodingFlow | [memory/encoding_flow.py:75](../../sources/crewai/lib/crewai/src/crewai/memory/encoding_flow.py#L75) |
| MemoryScope | [memory/memory_scope.py:53/379](../../sources/crewai/lib/crewai/src/crewai/memory/memory_scope.py) |
| _drain_memory_writes (Crew-level) | [crew.py:1887](../../sources/crewai/lib/crewai/src/crewai/crew.py#L1887) |

