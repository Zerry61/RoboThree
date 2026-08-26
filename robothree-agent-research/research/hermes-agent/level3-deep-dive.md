# Hermes Agent — Level 3 Deep Dive

> **Level**: 3 — 源码级深挖
> **Commit**: `3d9be2789552a495c7adf30148e867e7614a4bdc`
> **Mode**: STATIC_ANALYSIS_ONLY
> **Date**: 2026-07-18
> **Mechanisms**: (1) Agent 主循环 + Context 注入, (2) 多层 Tool 阻断 + Checkpoint, (3) Session 持久化与崩溃恢复

## 选择依据

Level 2 把这 3 个机制都标为 ADOPT。本次深挖验证：
- ADOPT 结论是否真的成立
- 失败 / 取消 / 恢复路径是否与正常路径同等成熟
- 有没有 Level 2 看不到的反模式或安全漏洞

---

## Deep Dive 1：Agent 主循环 + Context 注入

### 1.1 主循环的真实结构

**[F]** 入口在 `agent/conversation_loop.py:565`，符号 `run_conversation(agent, user_message, ...)`。

**[F]** 实际执行分两段（不是 Level 2 描述的单段 while 循环）：

| 段 | 函数 | 行 | 职责 |
|---|---|---|---|
| Per-turn prologue | `build_turn_context()` | turn_context.py:119 | stdio 守护、运行时恢复、MCP 刷新、SessionDB 创建、System prompt 缓存恢复、Compression preflight、pre_llm_call 钩子、External Memory 预取 |
| Main loop | `run_conversation()` while | conversation_loop.py:689 | API call → 工具执行 → 状态写回 |

**[F]** `build_turn_context()` 返回一个 `TurnContext` dataclass（turn_context.py:93），包含：`user_message`、`original_user_message`、`messages`、`conversation_history`、`active_system_prompt`、`effective_task_id`、`turn_id`、`current_turn_user_idx`、`should_review_memory`、`plugin_user_context`、`ext_prefetch_cache`。

**[F]** Prologue 的关键调用顺序（turn_context.py:155-180）：
1. `set_session_context(agent.session_id)` — 日志标签
2. `set_current_write_origin(...)` — Skill 写入来源标记
3. `agent._restore_primary_runtime()` — 上一轮切换过 fallback 就还原
4. `auxiliary_client.set_runtime_main(...)` — 通知辅助客户端当前主 provider
5. MCP refresh（如果上次 turn 之后 MCP server 还在连接）

**[I]** 这个 prologue 拆分是 Level 2 没有的发现。它证明 Hermes 的设计哲学是 **"per-turn setup" 作为独立的、可单元测试的纯函数**，而主循环只关心 iterate。这是非常干净的架构选择，值得 RoboThree 借鉴。

### 1.2 主循环的三层守卫

**[F]** 主循环的退出条件（conversation_loop.py:689）：
```python
while (api_call_count < agent.max_iterations
       and agent.iteration_budget.remaining > 0) or agent._budget_grace_call:
```

**[F]** 三层守卫：

| 守卫 | 机制 | 默认值 | 来源 |
|---|---|---|---|
| `max_iterations` | 硬上限 | 90 | AIAgent 构造 |
| `iteration_budget` | 线程安全计数器 | 继承 max_iterations | iteration_budget.py:32-59 |
| `_budget_grace_call` | 宽限一次 | False | Agent 内部标志 |

**[F]** `IterationBudget` 是独立的、可线程安全计数的对象（iteration_budget.py）：
```python
def consume(self) -> bool:
    with self._lock:
        if self._used >= self.max_total:
            return False
        self._used += 1
        return True

def refund(self) -> None:
    with self._lock:
        if self._used > 0:
            self._used -= 1
```

**[F]** Subagent 的 budget 完全独立（iteration_budget.py:21-26）：
> "Each subagent gets an independent budget capped at `delegation.max_iterations` (default 50) — this means total iterations across parent + subagents can exceed the parent's cap."

**[R] ADOPT-CONFIRMED**：iteration budget 设计极其干净。RoboThree 应该 ADOPT。

### 1.3 Context 注入的真实机制

**[F]** Hermes 的 "双消息列表" 在 Level 2 已经分析清楚，但 Level 3 发现了更多细节：

#### 1.3.1 System Prompt 持久化 + Cache Key

**[F]** System prompt 不是简单的"组装后丢弃"，而是：
1. **第一次构建**：调用 `agent._build_system_prompt()`（conversation_loop.py:360）
2. **缓存到 `agent._cached_system_prompt`**（L333）
3. **写入 SQLite**：`agent._session_db.update_system_prompt(agent.session_id, prompt)`（L395）
4. **下一轮读取**：从 SQLite 读取并验证 `Model:`/`Provider:` 行（`_stored_prompt_matches_runtime`，conversation_loop.py:405）
5. **检查通过就复用**：保持 Anthropic cache prefix 稳定
6. **失败就重建**：logger.warning 记录（"prefix cache will miss"）

**[F]** 三种状态明确（conversation_loop.py:288-298）：
- `missing` — 没有 session row（新会话，正常）
- `null` — row 存在但 `system_prompt` 列是 NULL（遗留 / migration bug）
- `empty` — row 存在但 `system_prompt` 是空字符串（持久化 bug 警报）
- `present` — row 有有效 prompt

**[F]** Level 2 没看到的：`on_session_start` 钩子在 system prompt 首次构建时触发（conversation_loop.py:367），允许插件初始化 session-scoped state（如预热 memory cache）。

#### 1.3.2 API Messages 注入点的精确顺序

**[F]** Level 2 已经标了 8a/8b/8c。Level 3 补充：

**[F]** 注入顺序（conversation_loop.py:838-963）：
1. **构造 `api_messages`**：从 `messages` 逐个 `msg.copy()`（不修改原列表）
2. **User Message 注入**（仅当前轮 user message）：
   - `_ext_prefetch_cache` → `build_memory_context_block()` (L849-852)
   - `_plugin_user_context`（来自 pre_llm_call 钩子）(L853-854)
   - 用 `\n\n` 拼接，保留 base content 不变
3. **Reasoning 字段处理**：`_copy_reasoning_content_for_api()` (L862)
4. **严格 API 字段剔除**（Mistral/Fireworks）：`_sanitize_tool_calls_for_strict_api()` (L878)
5. **System Prompt 拼装**：active_system_prompt + ephemeral_system_prompt (L898-902)
6. **MoA 聚合上下文**（如果开了 moa）：注入到最后一个 user message (L927-940)
7. **Prefill 消息插入**（在 system 之后，history 之前）(L946-949)
8. **Anthropic Cache Control 注入**：自动检测，system + 最后 3 条消息加 cache_control (L957-962)
9. **API 消息清洗**：`_sanitize_api_messages()` 移除孤儿 tool results (L968)
10. **Thinking-only 消息清理**（Anthropic 400 防御）(L978-981)
11. **Whitespace 归一化 + Tool Call JSON 规范化**（L989-1014）— 这是 KV cache 命中的关键
12. **Surrogate 字符清理**（Ollama json.dumps 崩溃防御）(L1020)

**[R] ADOPT-CONFIRMED + ADAPT**：注入点设计细致，但顺序耦合严重，RoboThree 应该 ADOPT 为"显式 pipeline"模式，每个注入点是一个独立的 transformer 函数，而不是一段直线代码。

### 1.4 压缩（Compression）的双重触发

**[F]** Level 2 看到的是 pre-API + post-tool 双重触发。Level 3 发现：

**[F]** `compress_context()`（conversation_compression.py:459）有 **SQLite-based 会话锁** 防止并发压缩（conversation_compression.py:558-578）：
> "Two AIAgent instances that share the same session_id (most commonly the parent-turn agent and its background-review fork) can each call compress() on overlapping snapshots... both succeed, both rotate agent.session_id to a fresh id... The gateway's SessionEntry only catches one rotation, so the other child becomes an orphan."

**[F]** 这是一个真实的生产 bug。Hermes 通过 `state.db` 中的 lock 表 + lease refresher（`CompressionLockLeaseRefresher`，conversation_compression.py:99）解决。

**[F]** 两种压缩模式：
- **Legacy（默认）**：旋转到新 session_id，parent_session_id 链可追溯
- **In-place（config: `compression.in_place`）**：同一 session_id 内压缩（消除 session rotation bug cluster, #38763）

**[F]** `_ensure_compressed_has_user_turn()`（conversation_compression.py:418）保证压缩后的 transcript 至少包含一个 user message。这是 strict chat template（LM Studio / llama.cpp Jinja）的防御。

**[F]** `try_shrink_image_parts_in_messages()`（conversation_compression.py:1233）是另一个独立的 context-shrinking 路径，专门压缩图片附件。

**[F]** `replay_compression_warning()`（conversation_compression.py:377）处理 status callback replay——如果第一次压缩尝试时前端没收到 warning，会在合适时机 replay。

**[R] ADAPT**：compression 设计的复杂度过高。RoboThree MVP 不应做 in-place 模式，只做 legacy session rotation；如果做，必须先解决并发锁问题。

### 1.5 MoA（Mixture of Agents）的注入点

**[F]** Level 2 提到了 moa_loop。Level 3 看到：
- `aggregate_moa_context()` 在 main agent API call 之前为参考模型 + 聚合模型生成 context
- 注入位置是最后一个 user message（L927-940）
- 聚合温度 vs 参考温度独立配置

**[I]** MoA 是 Hermes 的独特设计（类似 DeepSeek 早期论文的 MoA 思路）。RoboThree MVP 不需要，但应预留 multi-model aggregator 接口。

### 1.6 异常路径

| 异常 | 检测点 | 处理 | 证据 |
|---|---|---|---|
| Ollama context too small | `_ollama_context_limit_error` | break + 退款 iteration | L1037-1049 |
| Invalid API response | `_try_activate_fallback` | 切换 fallback provider 或 retry | L1544-1552 |
| Rate limit (Nous Portal) | `nous_rate_limit_remaining` | fallback 或 break | L1174-1217 |
| Truncated tool args | `_is_truncated` | partial result + persist | L4773-4789 |
| Invalid tool name (3+ times) | `_invalid_tool_retries` | partial break | L4696-4709 |
| Tool guardrail halt | `_tool_guardrail_halt_decision` | break with controlled response | L4994-5015 |
| Content policy block | `_content_policy_blocked_result` | no retry, terminal | L514-537 |

**[F]** Hermes 处理异常路径的方式是 **每种异常有一个清晰的 terminal 函数**（返回 partial dict 或 break），不在主循环里堆积 if-else。这是非常清晰的设计。

---

## Deep Dive 2：多层 Tool 阻断 + Checkpoint

### 2.1 Tool 阻断的精确层级

**[F]** Level 2 已经识别 scope → plugin → guardrail 三层。Level 3 补充：

| 层 | 符号 | 行 | 阻断前还是阻断后？ | 决策粒度 |
|---|---|---|---|---|
| 1. Tool Scope | `_tool_search_scoped_names()` | tool_executor.py:411 | **前**（在 checkpoint 之前） | per-tool boolean |
| 2. Plugin Block | `resolve_pre_tool_block()` | tool_executor.py:455 | **前**（在 guardrail 之前） | per-call message string |
| 3. Guardrail | `agent._tool_guardrails.before_call()` | tool_executor.py:483 | **前**（在 checkpoint 之前） | allow/warn/block/halt |
| 4. Checkpoint preflight | `_checkpoint_mgr.ensure_checkpoint` | tool_executor.py:503-522 | 同步快照（不阻断） | per-write_file/patch/terminal |
| 5. Worker execution | `agent._invoke_tool()` | tool_executor.py:605 | 实际执行 | — |
| 6. Post-hook | `_emit_terminal_post_tool_call()` | tool_executor.py:1586 | 后置，触发 `post_tool_call` | 总是发，但 `agent_runtime_owns_post_tool_hook` 区分 |
| 7. Guardrail after_call | `agent._tool_guardrails.after_call()` | 未直接读，但 halt_decision 在 conversation_loop.py:4994 被检查 | 后置，可能导致 halt | warn/allow/block/halt |

**[F]** 重要发现（tool_executor.py:1576-1584）：`_executor_must_emit_post_hook` 是用 `agent_runtime_owns_post_tool_hook(agent, function_name)` 区分的：
- **Built-in agent runtime tools**（todo, session_search, memory, context-engine, memory-manager, clarify, delegate_task）由 executor 自己触发 post_tool_call 钩子
- **Registry-dispatched tools**（其他所有）由 `handle_function_call` 触发 post_tool_call 钩子

**[R] ADOPT-CONFIRMED**：分层清晰，但 RoboThree 应该明确 "Built-in tools" 和 "External tools" 的边界。

### 2.2 Guardrail 的四种 Action

**[F]** `ToolGuardrailDecision` 有四种 action（tool_guardrails.py:148）：
- `allow` — 放行
- `warn` — 放行但附加 guidance
- `block` — 不执行，synthetic tool result（带 error message）
- `halt` — 整个 turn 立即停止

**[F]** 三种触发条件（tool_guardrails.py:67-79）：
- **exact_failure_warn_after** (default 2) / **exact_failure_block_after** (default 5)：相同 tool + 完全相同参数失败 N 次
- **same_tool_failure_warn_after** (default 3) / **same_tool_failure_halt_after** (default 8)：同一个 tool 失败 N 次（参数可变）
- **no_progress_warn_after** (default 2) / **no_progress_block_after** (default 5)：idempotent tool 返回相同结果 N 次

**[F]** 默认 hard_stop_enabled = False（tool_guardrails.py:73），意味着默认只 warn，不 halt。这是一个"温柔默认值"，用户必须显式 opt-in 才能得到硬停止。

**[F]** Warn 不会阻断工具执行——它只附加 guidance 字符串（`append_toolguard_guidance()`，tool_guardrails.py:394）。Block 才生成 synthetic result 注入 messages。Halt 设置 `_halt_decision`，主循环在 tool 执行后检查并 break。

**[F]** `IDEMPOTENT_TOOL_NAMES`（tool_guardrails.py:20-39）和 `MUTATING_TOOL_NAMES`（tool_guardrails.py:41-60）是硬编码的 frozenset。这意味着新工具默认既不是 idempotent 也不是 mutating，只能走"exact_failure"路径。

**[R] ADOPT-CONFIRMED + ADAPT**：四级 action 设计合理，但 Hermes 的 IDEMPOTENT_TOOL_NAMES 硬编码是反模式。RoboThree 应该让工具自己声明 idempotent / mutating，而不是中央维护白名单。

### 2.3 Checkpoint 系统

**[F]** 触发点（tool_executor.py:500-522）：
- `write_file` + `patch`：取 `path` 参数作为 work_dir
- `terminal` + `_is_destructive_command(cmd)`：取 `workdir` 或环境变量
- 都检查 `agent._checkpoint_mgr.enabled` 开关

**[F]** `_is_destructive_command()`（tool_dispatch_helpers.py:81）：
```python
_DESTRUCTIVE_PATTERNS = re.compile(
    r"""(?:^|\s|&&|\|\||;|`)(?:
        rm\s|rmdir\s|
        cp\s|install\s|
        mv\s|
        sed\s+-i|
        truncate\s|
        dd\s|
        shred\s|
        git\s+(?:reset|clean|checkout)\s
    )""",
    re.VERBOSE,
)
_REDIRECT_OVERWRITE = re.compile(r'[^>]>[^>]|^>[^>]')
```

**[I]** 这个正则有明确的 bypass：
- `rm -rf` 不在列表里（匹配 `rm\s` 不需要 flag）
- `find ... -delete` 不在列表
- `curl ... | sh` 不在列表
- `tar ... | sh` 不在列表

**[R] ADAPT**：Hermes 的 destructive 检测只能挡"显式 rm"，挡不了真正的破坏性命令。RoboThree 应该用 Worker Sandbox 而不是模式匹配。

### 2.4 并发执行的实际隔离级别

**[F]** `DaemonThreadPoolExecutor`（tool_executor.py:682）：
- 线程共享同一进程内存
- thread-local 状态：interrupt bits, activity callback, ContextVars
- max 8 worker
- daemon=True：interpreter 退出不会被 block

**[F]** Thread-local interrupt bits 处理（tool_executor.py:578-589）：
```python
_worker_tid = threading.current_thread().ident
with agent._tool_worker_threads_lock:
    agent._tool_worker_threads.add(_worker_tid)
# Race: if the agent was interrupted between fan-out (which
# snapshotted an empty/earlier set) and our registration, apply
# the interrupt to our own tid now so is_interrupted() inside
# the tool returns True on the next poll.
```

**[F]** 显式承认有 race condition（tool_executor.py:582-584 的注释），但通过 "apply interrupt now" 缓解。

**[F]** `propagate_context_to_thread()`（tool_executor.py:691-693）：
- 传播 ContextVars（如 `_approval_session_key`）
- 传播 thread-local callbacks
- 清理 worker thread 上的回调

**[R] REJECT-CONFIRMED**：线程级隔离太弱。一个 Tool 错误（segfault、内存泄漏、未捕获的 KeyboardInterrupt）会影响到整个 Agent。RoboThree 必须用进程级隔离（subprocess）甚至容器隔离。

### 2.5 异常与取消路径

**[F]** 取消路径（tool_executor.py:615-632）：
```python
except KeyboardInterrupt:
    try:
        agent.interrupt("keyboard interrupt")
    except Exception:
        pass
    result = _emit_cancelled_terminal_post_tool_call(
        agent, function_name=function_name,
        function_args=function_args,
        effective_task_id=effective_task_id,
        tool_call_id=getattr(tool_call, "id", "") or "",
        start_time=start,
        middleware_trace=list(middleware_trace),
    )
```

**[F]** Interrupted in mid-batch（tool_executor.py:1707-1723）：
```python
if agent._interrupt_requested and i < len(assistant_message.tool_calls):
    remaining = len(assistant_message.tool_calls) - i
    agent._vprint(f"{agent.log_prefix}⚡ Interrupt: skipping {remaining} remaining tool call(s)", force=True)
    for skipped_tc in assistant_message.tool_calls[i:]:
        skipped_name = skipped_tc.function.name
        messages.append(make_tool_result_message(
            skipped_name,
            f"[Tool execution skipped — {skipped_name} was not started. User sent a new message]",
            skipped_tc.id,
            effect_disposition="none",
        ))
```

**[F]** 注意："interrupted in mid-batch" 会注入一个 cancelled tool result 而不是 error result。这是有意为之——告诉模型"用户打断了"而不是"工具失败了"。

---

## Deep Dive 3：Session 持久化与崩溃恢复

### 3.1 Session DB 后端

**[F]** Level 2 已经标记为 UNKNOWN。Level 3 确认：**SQLite**。

**[F]** 证据（conversation_loop.py:310-322）：
```python
if conversation_history and agent._session_db:
    try:
        session_row = agent._session_db.get_session(agent.session_id)
        if session_row is not None:
            raw_prompt = session_row.get("system_prompt")
```

**[F]** 关键 API：
- `agent._session_db.get_session(session_id)` → row dict
- `agent._session_db.update_system_prompt(session_id, prompt)` → 写 system prompt
- `agent._flush_messages_to_session_db(messages)` → 增量 flush
- `agent._session_db` 还提供 lock API（conversation_compression.py:592-595）

**[F]** Compression 路径有会话锁（conversation_compression.py:557-578），证实 SessionDB 是一个完整的 RDBMS-like 抽象（不只是一个文件）。

**[R] ADOPT-CONFIRMED**：SQLite 是合理选择（嵌入式、零运维、支持事务）。RoboThree MVP 可以 ADOPT SQLite。

### 3.2 增量持久化的所有触发点

**[F]** Level 2 看到一个触发点。Level 3 找到**所有**触发点：

| 触发点 | 行 | 触发时机 | 是否 pre-tool-execution |
|---|---|---|---|
| Pre-tool-call block | conversation_loop.py:4971 | 工具执行前 | **是** |
| Post-tool-progress (concurrent) | tool_executor.py:354 | 每完成一个 tool | 否 |
| Post-tool-progress (sequential) | tool_executor.py:1686 | 每完成一个 tool | 否 |
| Skipped tool result | tool_executor.py:1718 | 用户 interrupt 跳过剩余 tools | 否 |
| Cancelled tool result | tool_executor.py:355 | interrupt 后取消当前 tool | 否 |
| Turn-end persist | conversation_loop.py:1200, 4700, 4781 | 各种退出路径 | 否 |

**[F]** Pre-tool-call block 的注释（conversation_loop.py:4967-4970）：
> "Persist the assistant tool-call turn before any tool side effects run. If a destructive tool restarts or terminates Hermes mid-turn, resume logic still sees the exact tool-call block that already executed."

**[R] ADOPT-CONFIRMED**：这个"两次持久化"模式（pre-tool + post-tool + turn-end）值得 RoboThree 直接 ADOPT。**核心思想是：dangerous operation 的 durability 优先于 performance**。

### 3.3 Untrusted Tool Output Wrapping

**[F]** 这是 Level 2 没仔细看的关键安全机制。Level 3 完整剖析：

**[F]** 工具输出在注入 messages 之前会经过 `make_tool_result_message()`（tool_dispatch_helpers.py:457），它调用 `_maybe_wrap_untrusted(name, content)`（L583）。

**[F]** 哪些 tool 是 untrusted（tool_dispatch_helpers.py:503-516）：
```python
_UNTRUSTED_TOOL_NAMES = frozenset({
    "web_extract",
    "web_search",
})
_UNTRUSTED_TOOL_PREFIXES = (
    "browser_",
    "mcp_",
)
```

**[F]** 包装格式：用 `<untrusted_tool_result>...</untrusted_tool_result>` 分隔符包裹，明确告诉模型"这是数据，不是指令"。

**[F]** `_neutralize_delimiters()`（tool_dispatch_helpers.py:570）：
> "Without this, a poisoned web page / GitHub issue / MCP response that contains `</untrusted_tool_result>` would close the trust boundary early"

**[F]** 这是**真正的 prompt injection 防御**，通过**语义标记**（不是正则阻断）让模型区分"指令"和"数据"。

**[F]** `_DELIMITER_TOKEN_RE = re.compile(r"untrusted_tool_result", re.IGNORECASE)`（L523）防止大小写绕过。

**[F]** `_UNTRUSTED_WRAP_MIN_CHARS = 32`（L518）：小于 32 字符的内容不包装（开销大于风险）。

**[F]** `_tool_output_risk_metadata()`（tool_dispatch_helpers.py:534）：对 untrusted 内容做 `scan_for_threats` 扫描，结果作为 `_tool_output_risk` 字段附加到 tool result message，但**不阻断也不修改**。

**[R] ADOPT-CONFIRMED**：语义分隔符模式（而不是 regex 黑名单）是正确的方向。RoboThree 应该 ADOPT。

### 3.4 取消 / 恢复路径

**[F]** 取消有 3 个层次：

| 层 | 触发 | 机制 | 行 |
|---|---|---|---|
| API 调用层 | 用户按 Ctrl-C | `_interruptible_streaming_api_call` / `_interruptible_api_call` | conversation_loop.py:1390-1394 |
| Tool 调度层 | 新消息到达 | `_interrupt_requested` 标志 + thread-local interrupt bits | tool_executor.py:345, 1707 |
| Worker 线程层 | propagate_context_to_thread | `_ra()._set_interrupt(True, _worker_tid)` | tool_executor.py:587 |

**[F]** 取消不是"kill 进程"，而是"标记中断"。每个 tool 实现需要自己 polling `is_interrupted()`。

**[F]** Partial Stream Recovery（conversation_loop.py:5104-5129）：如果 SSE 流已经部分交付，agent 用部分内容作为最终响应：
```python
_partial_streamed = (
    getattr(agent, "_current_streamed_assistant_text", "") or ""
)
if agent._has_content_after_think_block(_partial_streamed):
    _turn_exit_reason = "partial_stream_recovery"
    ...
```

**[F]** Empty Response Recovery（conversation_loop.py:5131+）：三种 fallback：
1. **Prior-turn housekeeping content**（L5141-5155）：如果上一轮的 tool call 都是 housekeeping（如 memory/skill_manage），那上一轮说的内容就是最终答案
2. **Post-tool-call nudge**（L5157+）：注入 user hint 让模型继续
3. **Continuation prompt**（`_get_continuation_prompt`，L429）：如果上一轮被截断，注入"继续"指令

**[R] ADOPT-CONFIRMED**：多层恢复路径非常成熟。RoboThree 应该 ADOPT 这个 "partial → fallback → nudge" 三层 fallback 模式。

### 3.5 取消与持久化的协作

**[F]** 中断时（tool_executor.py:344-359）：
```python
if agent._interrupt_requested:
    print(f"{agent.log_prefix}⚡ Interrupt: skipping {num_tools} tool call(s)")
    for tc in tool_calls:
        messages.append(make_tool_result_message(
            tc.function.name,
            f"[Tool execution cancelled — {tc.function.name} was skipped due to user interrupt]",
            tc.id,
            effect_disposition="none",
        ))
        _flush_session_db_after_tool_progress(
            agent,
            messages,
            stage=f"cancelled tool result {tc.function.name}",
        )
    return
```

**[F]** 关键发现：**即使中断，也要 flush 取消的 tool result 到 DB**。这保证了 resume 时 transcript 是完整的。

**[F]** Per-tool /steer drain（tool_executor.py:1692-1696）：
```python
# Drain pending steer BETWEEN individual tool calls so the
# injection lands as soon as a tool finishes — not after the
# entire batch.  The model sees it on the next API iteration.
agent._apply_pending_steer_to_tool_results(messages, 1)
```

**[F]** 重要 UX 设计：用户在长工具 batch 中可以 `/steer` 改变方向，steer 在每个 tool 完成后立即注入，不必等整个 batch 结束。

---

## 综合结论

### Level 2 ADOPT 结论的复核

| Level 2 结论 | Level 3 复核 | 变化 |
|---|---|---|
| 双消息列表 ADOPT | ✅ 确认 + 更精细的注入点排序 | ADOPT-CONFIRMED |
| 多层 Tool 阻断 ADOPT | ✅ 确认 + 4 级 action（allow/warn/block/halt） | ADOPT-CONFIRMED |
| 增量持久化 ADOPT | ✅ 确认 + 5 个触发点的完整列表 | ADOPT-CONFIRMED |
| Hook 架构 ADOPT | ✅ 确认 + agent_runtime_owns_post_tool_hook 的细节 | ADOPT-CONFIRMED |
| 降级链 ADAPT | ✅ 确认 + 锁机制解决并发压缩 bug | ADAPT-CONFIRMED |
| 线程级执行 REJECT | ✅ 确认 + race condition 显式承认 | REJECT-CONFIRMED |
| God Object REJECT | ✅ 确认 + 拆分出 build_turn_context 是改进信号 | REJECT-CONFIRMED |

### Level 3 新发现

| 发现 | 评估 |
|---|---|
| **Prologue 拆分为 `build_turn_context()`** | **NEW ADOPT** — 干净的分层 |
| **SQLite SessionDB with lock API** | **ADOPT** — 嵌入式 RDBMS 足够 |
| **Untrusted tool output 语义分隔符** | **NEW ADOPT** — 比 regex 黑名单正确 |
| **三层 partial stream recovery** | **NEW ADOPT** — production-grade resilience |
| **IDEMPOTENT_TOOL_NAMES 硬编码** | **REJECT** — 反模式，应该工具自声明 |
| **Destructive command regex 检测** | **ADAPT-WITH-CAVEAT** — 太弱，必须配合 Sandbox |
| **Compression 双重模式（legacy / in-place）** | **DEFER** — 太复杂，MVP 不需要 |

### RoboThree 设计建议补充

1. **Context Engine** 应该采用显式 Pipeline 模式，每个注入点是一个独立 transformer
2. **Tool Permission** 应该让 Tool 自己声明 `idempotent` / `mutating` / `destructive` 属性，而不是中央维护白名单
3. **Session Manager** 必须支持 SQLite-based lock API 用于压缩等并发敏感操作
4. **Tool Runtime** 应该采用 Untrusted Tool Output 语义分隔符（`<untrusted_tool_result>`）
5. **Agent Runtime** 应该把 per-turn setup 拆为独立的 `build_turn_context()` 函数
6. **Safety Model** 不能只靠 regex 黑名单；RoboThree 必须有 Worker Sandbox 作为防御纵深

### 仍需更多证据（UNKNOWNs 升级）

| 未知项 | 升级说明 |
|---|---|
| Sandbox 是否存在 | 仍未发现 OS-level sandbox（seccomp/container）证据 |
| Approval Model | `_approval_session_key` ContextVar 已确认存在（tool_executor.py:688），但实际是 gate 还是 UI 未读源码 |
| Memory 后端 | 未读 `memory_manager.py`/`memory_provider.py` |
| Subagent 隔离 | `delegate_task` 是工具分支，但实际如何 fork 未分析 |

### 建议下次 Level 3 深挖

1. **Memory 系统** — `memory_manager.py` 的具体实现（Vector DB? 文件？）
2. **Subagent 隔离** — `delegate_task` 实际是进程级还是线程级？
3. **Worker Backend 抽象** — `BaseEnvironment` 接口和 6 个 backend 的实际差异
4. **Gateway Channel Capabilities** — 每个平台 adapter 实际支持哪些 capability
