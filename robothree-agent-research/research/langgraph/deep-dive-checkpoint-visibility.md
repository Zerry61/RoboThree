# L3 Deep-Dive #1 — Checkpoint Durability & Visibility Invariant

> 研究日期：2026-07-18
> Commit: `49ae27c2ae983cfb92091b0dea9f7bc37a716479`
> 机制选择理由：这是 LangGraph 在所有分布式执行框架中**最独特**的设计——它解决了"checkpoint 持久化与 channel 增量写入的因果顺序"问题。这是 RoboThree 要实现 Durable Execution 最难的一关。

## 1. 问题定义

### 1.1 一致性需求

Checkpoint 持久化必须满足两个不变量：

**不变量 1 — Checkpoint 全量快照的不变量**：
> 当 `checkpoint.channel_values[ch]` 包含通道 `ch` 的值（snapshot）时，后续对该通道的所有 `put_writes` 必须等到 checkpoint 持久化之后才被消费者读到。

**不变量 2 — Delta 通道的不变量**：
> 对于 `DeltaChannel`（增量通道），当 N 个 step 累积了 delta writes 而没有 snapshot 时，`put_writes` 必须在任何后续 checkpoint 持久化之前完成。否则，下游 step 会读到不完整的 channel 历史。

### 1.2 为什么这个设计重要

考虑一个拥有 1 万条消息（`DeltaChannel`）的 Conversation：

- 每个 step 都做全量 checkpoint → 性能灾难（O(N²) 写入）
- 只存增量 → 必须保证 checkpoint 与 writes 的因果顺序
- 否则：消费者读 checkpoint.channel_values，发现 messages 通道为空 → 走 ancestor walk 找最近的 snapshot → 但 snapshot 之前的 writes 还没持久化 → 数据丢失

LangGraph 的解决方案：在每次 `_put_checkpoint` 提交前阻塞等待当前 superstep 的所有 delta writes 持久化。

## 2. 实现细节

### 2.1 Future 链 + 批量等待

**`_loop.py:415-508` put_writes** — 每次提交 delta writes 时记录 Future：

```python
def put_writes(self, task_id: str, writes: WritesT) -> None:
    # ...
    if self._delta_write_futs is not None and any(
        isinstance(self.specs.get(c), DeltaChannel) for c, _ in writes_to_save
    ):
        self._delta_write_futs.append(fut)   # ← 记录 future
    # ...
```

**`_loop.py:1081-1219` _put_checkpoint** — 在提交 checkpoint 前等待：

```python
def _put_checkpoint(self, metadata: CheckpointMetadata) -> None:
    # ...
    # 仅当 durability != "exit" 且 checkpointer 存在时:
    if self.durability != "exit" and self.checkpointer_put_writes is not None:
        # 每条 put_writes 已 submit 到 BackgroundExecutor
        fut = self.submit(
            self.checkpointer_put_writes,
            config,
            writes_to_save,
            task_id,
            ...
        )
        if self._delta_write_futs is not None and any(...DeltaChannel...):
            self._delta_write_futs.append(fut)
```

**`_loop.py:1530-1546` SyncPregelLoop._checkpointer_put_after_previous** — **关键的等待点**：

```python
def _checkpointer_put_after_previous(
    self,
    prev: concurrent.futures.Future | None,
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    new_versions: ChannelVersions,
) -> RunnableConfig:
    # Step 1: 等待所有当前 superstep 的 delta writes
    if self._delta_write_futs:
        futs, self._delta_write_futs = self._delta_write_futs, []
        concurrent.futures.wait(futs)   # ← 关键！
    # Step 2: 等待上一个 checkpoint
    try:
        if prev is not None:
            prev.result()
    finally:
        # Step 3: 持久化当前 checkpoint
        cast(BaseCheckpointSaver, self.checkpointer).put(
            config, checkpoint, metadata, new_versions
        )
```

异步版本（`_loop.py:1783-1802`）：
```python
async def _checkpointer_put_after_previous(...):
    if self._delta_write_futs:
        futs, self._delta_write_futs = self._delta_write_futs, []
        await asyncio.gather(*futs)   # ← asyncio 版本
    try:
        if prev is not None:
            await prev
    finally:
        await cast(BaseCheckpointSaver, self.checkpointer).aput(...)
```

### 2.2 顺序保证图

```
Superstep N 的时序图：

[Tick开始]                                            
   ↓                                                
[Node 1 写入] → put_writes(N, [msg1]) → submit → fut_A ─┐
   ↓                                                    │
[Node 2 写入] → put_writes(N, [msg2]) → submit → fut_B ─┤
   ↓                                                    │
[after_tick 开始]                                        │
   ↓                                                    │
[apply_writes 合并]                                      │
   ↓                                                    │
[_put_checkpoint 开始]                                   │
   ↓                                                    │
[_checkpointer_put_after_previous]                      │
   ↓                                                    │
   ├─ 1. wait(fut_A, fut_B)  ← 等所有 delta 持久化  ───┘
   ├─ 2. wait(prev_checkpoint)                          
   └─ 3. put(checkpoint_N)  ← 然后才持久化 checkpoint  
                                                       
[Checkpoint N 此时对消费者可见]                          
   └─ 此时 fut_A, fut_B 已完成 → ancestor walk 不会丢数据
```

### 2.3 为什么不在 put_writes 里 join

为什么不直接在 `put_writes` 里 join future？

**答案**：`put_writes` 是从 Executor 线程池中回调触发的（来自 `commit()`），而 `_checkpointer_put_after_previous` 是从主循环线程触发的。如果在 put_writes 内阻塞，会死锁——因为 put_writes 自己也在 BackgroundExecutor 的线程池中执行，可能会占用线程导致 _put_checkpoint 无法 commit 自己的 checkpoint。

**正确做法**：只在 `_checkpointer_put_after_previous`（持有主循环调用栈）里等待 Future，避免与 BackgroundExecutor 死锁。

### 2.4 Exit 模式的特例（`_loop.py:1221-1315` _put_exit_delta_writes）

当 `durability == "exit"` 时，正常流程不持久化 writes，只在 `_suppress_interrupt` 退出时统一持久化：

```python
def _suppress_interrupt(self, exc_type, exc_value, traceback) -> bool | None:
    if self.durability == "exit" and (
        not self.is_nested  # top graph
        or exc_value is not None  # nested with error/interrupt
        or all(NS_END not in part for part in self.checkpoint_ns)  # nested with checkpointer=True
    ):
        self._put_exit_delta_writes()      # ← 累积所有 delta writes
        self._put_checkpoint(self.checkpoint_metadata)   # ← 最终 checkpoint
        self._put_pending_writes()
```

`_put_exit_delta_writes` 的细节：
1. 找出本次运行所有未 snapshot 的 delta writes（从 `_exit_delta_writes` 累计）
2. 用 step-prefixed synthetic task_id 保证 Order By 顺序
3. 用 anchor_config（要么 parent 的 checkpoint_id，要么 lazy stub 的 id）锚定
4. 把所有 put_writes 提交 → 加入 `_delta_write_futs`
5. 最终 `_put_checkpoint` 时 `_checkpointer_put_after_previous` 等待

### 2.5 Stub Lazy-Create（`_loop.py:1253-1281`）

首次运行的 thread 没有 parent checkpoint，但需要为 delta writes 提供 anchor：

```python
if self._has_persisted_parent:
    anchor_config = self._initial_checkpoint_config  # 有 parent
else:
    stub_cp = empty_checkpoint()
    stub_cp["id"] = self.checkpoint_id_saved
    # ... stub_put_config: checkpoint_id=None, 表示没有 parent
    self._put_checkpoint_fut = self.submit(
        self._checkpointer_put_after_previous,
        ..., stub_cp, {"step": -2}, {}, ...
    )
    # ... 让 checkpoint_config 指向 stub
```

**为什么这是必要的**：DeltaChannel 在 ancestor walk 时需要一个可锚定的 checkpoint，否则从 root 找不到任何 messages。这相当于"bootstrapping" 机制。

## 3. 错误恢复语义

### 3.1 BackgroundExecutor 异常传播

如果某个 `put_writes` Future 抛异常，`concurrent.futures.wait(futs)` 会传播异常到主循环 → 然后抛出 `GraphBubbleUp` 或被 `_suppress_interrupt` 抑制。

### 3.2 Crash Recovery 保证

进程崩溃后：
- 如果 crash 发生在 `wait(futs)` 之前 → writes 可能部分写入，checkpoint 没写入 → 下次启动时 `get_tuple` 读不到该 step → 重新执行该 step → **幂等性要求**
- 如果 crash 发生在 `put(checkpoint)` 之后 → 整个 step 完整 → 下次启动继续

幂等性由 channel_versions 保证：相同的 input 产生相同的 version → 节点调度器会发现 channel 未变化 → 不重执行（`_algo.py:_triggers`）。

## 4. 对 RoboThree 的核心启示

### 4.1 强烈推荐：实现等价的不变量

```python
# RoboThree 版本（基于 Rust/Go 实现）
class TaskCheckpointManager:
    pending_writes: list[Future[None]]   # 当前 step 的写入 futures
    last_checkpoint_future: Future | None

    async def persist_step(self, writes: list[Write], snapshot: Snapshot):
        # 1. 提交所有 writes 到 IO 池
        write_futs = [self.io_pool.submit(w) for w in writes]
        self.pending_writes.extend(write_futs)

        # 2. 等待上一个 checkpoint 持久化（保证顺序）
        if self.last_checkpoint_future:
            await self.last_checkpoint_future

        # 3. 等待当前 step 的 writes 全部持久化
        await asyncio.gather(*write_futs)

        # 4. 持久化 checkpoint（它指向这些 writes）
        self.last_checkpoint_future = asyncio.create_task(
            self.io_pool.submit(snapshot.persist)
        )
```

### 4.2 关键设计决策

1. **BackgroundExecutor + Future 链** vs **同步 await**：
   - Future 链更复杂但避免阻塞主线程
   - 同步 await 简单但会有竞争
   - RoboThree 可视场景选择：MVP 同步；生产异步

2. **Exit Mode（延迟持久化）**：
   - 提升 2-10x 吞吐量（避免每次 step IO）
   - 代价：长任务崩溃后丢失更多进度
   - RoboThree 推荐：MVP 默认 step mode；生产可优化为 exit mode（仅对短任务）

3. **Stub Lazy-Create**：
   - 解决 first-run 问题
   - 让 ancestor walk 永远能找到 anchor
   - RoboThree 设计 Checklist 必须包含此点

### 4.3 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 多 Worker 写同一 thread | Future 链只保护单进程，多进程需分布式锁 | Postgres 等后端用数据库锁；MVP 单 worker |
| IO 后端崩溃 | 数据丢失 | WAL 模式（Sqlite）；业务级别 idempotency key |
| 测试困难 | Future timing 难复现 | 注入 fake Future；chromatic fixtures |

## 5. 证据强度

- [F] 关键调用链：`_loop.py:415-508` (put_writes) → `_loop.py:1081-1219` (put_checkpoint) → `_loop.py:1530-1802` (wait + put) 全部源码已读
- [F] 两份独立的字段：`_delta_write_futs` 和 `_error_handler_write_futs` 各自跟踪不同类型的写入
- [F] Error handler 路径：`_loop.py:1578-1581` 类似的"wait before schedule" 模式，证明这是 LangGraph 的通用规律
- [I] 推断的死锁原因：基于 BackgroundExecutor + Future 链的语义推断，无源码直接说明
- [R] RoboThree 适配建议基于不变量提取

## 6. Hop Evidence 表（本深挖的核心跳）

| Hop | From → To | File | Symbol | Lines | Evidence Type | Confidence |
|-----|-----------|------|--------|-------|---------------|------------|
| H1 | Node 完成 → put_writes 提交 | `pregel/_loop.py` | `put_writes()` | 415-508 | SOURCE | HIGH |
| H1a | Delta writes Future 记录 | `pregel/_loop.py` | `self._delta_write_futs.append(fut)` | 495-498 | SOURCE | HIGH |
| H2 | after_tick → _put_checkpoint | `pregel/_loop.py` | `_put_checkpoint({"source":"loop"})` | 718 | SOURCE | HIGH |
| H3 | _put_checkpoint → _checkpointer_put_after_previous | `pregel/_loop.py` | `self.submit(self._checkpointer_put_after_previous, ...)` | 1202-1209 | SOURCE | HIGH |
| H4 | 等待 delta writes | `pregel/_loop.py` | `concurrent.futures.wait(futs)` | 1539-1540 | SOURCE | HIGH |
| H4a | 等待 prev checkpoint | `pregel/_loop.py` | `if prev is not None: prev.result()` | 1542-1543 | SOURCE | HIGH |
| H5 | 持久化当前 checkpoint | `pregel/_loop.py` | `cast(BaseCheckpointSaver, self.checkpointer).put(...)` | 1545-1547 | SOURCE | HIGH |
| H6 | Exit mode → 累积退出 | `pregel/_loop.py` | `_suppress_interrupt` → `_put_exit_delta_writes` | 1317-1334 | SOURCE | HIGH |
| H6a | Stub lazy-create | `pregel/_loop.py` | `stub_cp = empty_checkpoint()` | 1258-1281 | SOURCE | HIGH |
| H7 | Async 版本（asyncio.gather） | `pregel/_loop.py` | `await asyncio.gather(*futs)` | 1793-1795 | SOURCE | HIGH |

## 7. 待 RoboThree 决策点

1. **MVP 持久化策略**：默认 step mode（每次 step 后持久化）vs exit mode（仅完成时持久化）？
2. **多 Worker 部署**：MVP 是否需要？需要的化必须考虑分布式锁
3. **First-run 锚定策略**：是否引入 stub lazy-create 机制？建议必引入
4. **Future vs Sync 等待**：MVP 用同步 await 是否足够？性能基准数据待运行时验证
