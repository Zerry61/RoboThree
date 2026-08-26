# Hermes Agent — Architecture

## 1. High-Level Architecture

Hermes Agent follows a **monolithic Python agent runtime** pattern with plugin extensibility points:

```text
┌─────────────────────────────────────────────────────────────┐
│                     Gateway / CLI / TUI                      │
│  (gateway/, cli.py, tui_gateway/)                            │
├─────────────────────────────────────────────────────────────┤
│                    Agent Runtime (AIAgent)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Context  │  │  Agent   │  │   Tool   │  │  Session/  │  │
│  │ Engine   │  │  Loop    │  │ Executor │  │  Memory    │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Provider │  │ Plugin   │  │  Skill   │  │  Subagent  │  │
│  │ Adapters │  │ System   │  │ System   │  │  Runtime   │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                     Worker Backends                          │
│  (local / docker / ssh / singularity / modal / daytona)      │
└─────────────────────────────────────────────────────────────┘
```

**[I]** The architecture is characterized by a single `AIAgent` class that holds all runtime state — including messages, tools, session ID, iteration budget, context compressor, and tool executor — and is passed as the first argument to most module-level functions.

## 2. Agent Main Loop

### 2.1 Core Loop Structure

The main agent loop is a **while-loop with budget guards**, located at:

> **File**: `agent/conversation_loop.py`  
> **Symbol**: `run_conversation()` — Line 565  
> **Loop guard**: Line 689

```python
while (api_call_count < agent.max_iterations
       and agent.iteration_budget.remaining > 0
       ) or agent._budget_grace_call:
```

**[F]** The loop is a **while loop**, not recursion, state machine, or event-driven. Evidence: the `while` statement at conversation_loop.py:689, the `continue` at line 5088 (after tool execution), and `break` at various exit points.

### 2.2 Loop Phases

Each iteration goes through these phases:

1. **Interrupt Check** (L694-699): Check `agent._interrupt_requested`, break if set
2. **Budget Consumption** (L710-714): `agent.iteration_budget.consume()` — if exhausted and no grace call, break
3. **Step Callback** (L717-742): Fire `agent.step_callback(api_call_count, prev_tools)` for gateway hooks
4. **Pre-API Steer Drain** (L762-799): Drain `/steer` messages pending from the previous API call
5. **Context Assembly** (L801-963): Build `api_messages` from `messages` with memory/plugin injection
6. **Pre-API Compression Check** (L1068-1126): Compress context if needed before the API call
7. **API Call** (L1383-1413): `_interruptible_streaming_api_call()` or `_interruptible_api_call()` via middleware
8. **Response Validation** (L1433-1511): Validate response shape by api_mode
9. **Error/Fallback Handling** (L1513-1630): Invalid response → fallback chain or retry
10. **Tool Call Processing** (L4638-5088): If `assistant_message.tool_calls`, validate names, parse args, execute, persist
11. **Final Response** (L5090+): If no tool calls, this is the final output

### 2.3 Retry & Fallback

**[F]** Inside the main while loop, there is a **nested retry loop** (L1168):

```python
while retry_count < max_retries:
```

This handles:
- Provider rate limiting (Nous Portal guard, L1174-1217)
- API call with middleware pipeline (L1219-1413)
- Response validation failures → fallback provider activation (L1544-1552)
- Error classification via `classify_api_error()` (L1613+)

**[F]** The fallback chain is `agent._fallback_chain` — an ordered list of alternative providers. When the primary provider fails, `agent._try_activate_fallback()` (L1546) switches to the next provider and resets retry counters.

### 2.4 Context Compression

**[F]** Two compression trigger points:
1. **Pre-API** (L1075-1126): Before the first API call of the iteration, if `should_compress(request_pressure_tokens)` returns True
2. **Post-tool** (L5073-5082): After tool execution, using real `last_prompt_tokens` from the API response

**[F]** Compression is gated by:
- `agent.compression_enabled` flag
- Max 3 attempts per turn (`compression_attempts < 3`)
- `_defer_preflight()` guard for noisy estimates
- Cooldown on compression failure

### 2.5 Loop Exit Conditions

| Exit Reason | Code Location | Type |
| --- | --- | --- |
| Budget exhausted | L710-714 | Normal |
| Max iterations reached | L689 | Normal |
| Interrupt requested | L694-699 | User action |
| Final response (no tool calls) | L5090+ | Normal completion |
| Guardrail halt | L4994-5015 | Safety |
| Invalid tool calls exceeded | L4696-4709 | Error |
| Truncated tool args | L4773-4789 | Error |
| Ollama context too small | L1037-1049 | Error |
| Rate limit, no fallback | L1199-1213 | Error |

## 3. Context Engineering

### 3.1 Dual Message Lists

**[F]** Hermes maintains two message representations:

| List | Purpose | Mutated | Evidence |
| --- | --- | --- | --- |
| `messages` | **Session-persisted** conversation state | By tool results, assistant messages | `conversation_loop.py:637` |
| `api_messages` | **API-call-time** copy with ephemeral injections | By context assembly, never persisted | `conversation_loop.py:838` |

**[F]** This separation is explicit in the code: `api_messages` is built as a copy of `messages` (L838-881), with injections added to the copy. The original `messages` list is untouched by context assembly.

### 3.2 Injection Points

**[F]** At API-call time, three sources inject into the user message (not system prompt):

1. **Memory Manager Prefetch** (L849-852): `build_memory_context_block(_ext_prefetch_cache)`
2. **Plugin `pre_llm_call` Hooks** (L853-854): `_plugin_user_context`
3. **MoA Aggregation** (L927-940): Multi-model aggregation context

**[F]** System prompt is assembled from:
- `active_system_prompt` — the cached, session-stable system prompt (L893)
- `agent.ephemeral_system_prompt` — per-turn ephemeral additions (L899-900)

### 3.3 Prompt Caching

**[F]** Anthropic prompt caching is applied at L957-962:
```python
if agent._use_prompt_caching:
    api_messages = apply_anthropic_cache_control(
        api_messages, cache_ttl=agent._cache_ttl,
        native_anthropic=agent._use_native_cache_layout,
    )
```

## 4. Tool System Architecture

### 4.1 Execution Modes

**[F]** Three execution modes in `agent/tool_executor.py`:

| Mode | Function | Line | Description |
| --- | --- | --- | --- |
| Concurrent | `execute_tool_calls_concurrent()` | L327 | Thread pool with `DaemonThreadPoolExecutor`, max 8 workers |
| Sequential | `execute_tool_calls_sequential()` | L1028 | One tool at a time |
| Segmented | `execute_tool_calls_segmented()` | L1742 | Mixed batch: segment by dependency |

**[F]** Concurrent execution uses `DaemonThreadPoolExecutor` (L682) with max workers = `min(len(runnable_calls), _MAX_TOOL_WORKERS)` where `_MAX_TOOL_WORKERS = 8` (L73).

**[F]** Default concurrent tool timeout = 420.0 seconds (L76). Overridable via `HERMES_CONCURRENT_TOOL_TIMEOUT_S` env var (L98-100).

### 4.2 Dispatch Flow

**[F]** The tool dispatch flow per tool call:

```text
1. Parse arguments (_parse_tool_arguments, L79)
2. Tool Search unwrap (if "tool_call" bridge, L389-422)
3. Tool request middleware (_apply_tool_request_middleware_for_agent, L424-430)
4. Block evaluation:
   a. Tool scope block (session-scoped toolset, L437-451)
   b. Plugin pre-tool block (resolve_pre_tool_block, L453-481)
   c. Guardrail check (guardrail_decision.before_call, L483-498)
5. Checkpoint preflight (for write_file/patch/terminal, L500-522)
6. Execute (_run_tool worker in thread pool, L573-655)
   a. Register worker thread for interrupt (L579)
   b. agent._invoke_tool() (L605)
   c. Post-execution error detection (_detect_tool_failure, L637)
7. Post-execution:
   a. Turn budget enforcement (enforce_turn_budget)
   b. Tool result persistence (maybe_persist_tool_result)
   c. /steer injection into last tool result
```

### 4.3 Tool Result Safety

**[F]** Tool result formatting uses `make_tool_result_message()` (tool_dispatch_helpers.py:457). Key safety features:
- `_is_destructive_command()` (L81) — detects destructive terminal commands
- `_is_untrusted_tool()` (L526) — flags untrusted tool outputs for wrapping
- `_tool_output_risk_metadata()` (L534) — risk classification metadata

## 5. Permission & Security Architecture

### 5.1 Pre-Execution Blocking Layers

**[F]** Three layers of pre-execution blocking (tool_executor.py):

| Layer | Symbol | Line | Mechanism |
| --- | --- | --- | --- |
| Tool Scope | `_tool_search_scoped_names()` | L411 | Session-scoped toolset; tools not in scope get JSON error result |
| Plugin Block | `resolve_pre_tool_block()` | L454-466 | Plugin-defined block rules |
| Guardrail | `agent._tool_guardrails.before_call()` | L483 | Centralized guardrail policy engine |

**[F]** The blocking is **real pre-execution prevention** — blocked tools never reach `agent._invoke_tool()`. They get a JSON error result injected into messages as a tool result instead.

### 5.2 Checkpoint-Based Safety

**[F]** Before file-mutating tools (`write_file`, `patch`) and destructive terminal commands, a **checkpoint is taken** (L500-522):

```python
if function_name in {"write_file", "patch"} and agent._checkpoint_mgr.enabled:
    agent._checkpoint_mgr.ensure_checkpoint(work_dir, f"before {function_name}")
```

### 5.3 Guardrail Halt

**[F]** After tool execution, if a guardrail halt decision is set (`agent._tool_guardrail_halt_decision`), the loop breaks immediately with a controlled response (L4994-5015). This is a **post-execution kill switch**, distinct from pre-execution blocking.

### 5.4 Tool Execution Sandbox

**[I]** Tool execution is NOT sandboxed at the process level:
- Worker threads share the same process as the agent (thread pool, not separate processes)
- File operations use the host filesystem directly
- Terminal commands execute on the host (or configured worker backend)

**[I]** The primary safety mechanism is the **checkpoint + guardrail** combination, not OS-level sandboxing. The `DaemonThreadPoolExecutor` provides thread isolation but not process isolation.

## 6. Model Provider Architecture

**[I]** Multiple `api_mode` values are supported: `codex_responses`, `anthropic_messages`, `bedrock_converse`, and a default (OpenAI-compatible) mode. Each has its own response validation logic (L1436-1511).

**[F]** Provider selection is controlled by:
- `agent.provider` — provider name string
- `agent.base_url` — API base URL
- `agent.api_mode` — protocol mode
- `agent._fallback_chain` — ordered fallback list

## 7. Session Persistence

**[F]** Two persistence methods observed:
1. `agent._persist_session(messages, conversation_history)` — full session save (L1200, L4700, L4781)
2. `agent._flush_messages_to_session_db(messages, conversation_history)` — incremental flush (L4971, in tool_executor.py:354)

**[F]** Incremental persistence happens before tool execution to ensure tool-call blocks survive crashes (L4966-4978):
```python
# Persist the assistant tool-call turn before any tool side effects run.
# If a destructive tool restarts or terminates Hermes mid-turn,
# resume logic still sees the exact tool-call block.
```

## 8. Subagent Architecture (Summary)

**[I]** Based on directory structure and code references:
- `agent/auxiliary_client.py` — subagent client
- `agent/aux_accounting.py` — tracks subagent usage for billing
- `delegate_task` tool — spawns subagents with capped toolset inheritance

## 9. Worker Backend Architecture (Summary)

**[I]** Six backends inferred from directory structure:
1. **Local** — native process execution
2. **Docker** — containerized execution
3. **SSH** — remote execution
4. **Singularity** — HPC container execution
5. **Modal** — cloud function execution
6. **Daytona** — cloud dev environment

All share `BaseEnvironment` abstract interface in `tools/environments/base.py`.

## 10. Gateway Architecture (Summary)

**[I]** Platform adapters in `gateway/` directory handle:
- Message receipt and parsing
- Session routing and creation
- Response delivery (streaming, late completion, background notification)
- Thread routing (for threaded platforms)

Channel Capability differences (streaming, late completion, background notification) are handled per-adapter but **not formalized into an explicit capability model**.

## Architecture Assessment

### Strengths

1. **[F]** Clean separation of session-persisted messages from API-call-time messages — prevents context pollution
2. **[F]** Multi-layer tool blocking (scope → plugin → guardrail) with real pre-execution prevention
3. **[F]** Incremental session persistence before destructive tool execution — crash resilience
4. **[F]** Dual compression trigger points (pre-API + post-tool) with anti-thrash guards
5. **[F]** Provider fallback chain with rate limit awareness

### Weaknesses

1. **[I]** The `AIAgent` object is a **god object** — holds messages, tools, session, budget, compressor, callbacks, interrupt state, spinner state, and more
2. **[I]** No explicit `ChannelCapabilities` abstraction — each gateway adapter handles platform differences ad-hoc
3. **[I]** Thread-based tool execution provides weak isolation — no process sandboxing for tools
4. **[I]** Permission is embedded in guardrail/plugin layers, not a standalone permission manager with audit trail
5. **[I]** Subagent isolation level unclear from static analysis alone
