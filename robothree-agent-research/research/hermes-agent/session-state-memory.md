# Hermes Agent — Session, State & Memory

## 1. Session Architecture

### 1.1 Session Lifecycle

**[I]** Session creation and management is distributed across multiple files:
- `agent/agent_init.py` — session initialization
- `agent/conversation_loop.py` — per-turn session operations
- `agent/turn_context.py` — per-turn session setup
- Agent's `session_id` attribute — used throughout for logging, persistence, and context

**[F]** Session is identified by `agent.session_id` (referenced at conversation_loop.py:131, many other locations).

### 1.2 Session Persistence

**[F]** Two persistence mechanisms observed:

| Mechanism | Symbol | When | Purpose |
| --- | --- | --- | --- |
| Incremental Flush | `agent._flush_messages_to_session_db()` | Before each tool execution (conversation_loop.py:4971) | Crash resilience — tool call blocks survive crash |
| Full Persist | `agent._persist_session()` | End of turn, error exits (conversation_loop.py:1200, 4700, 4781) | Complete session save |

**[F]** The incremental flush before tool execution is a deliberate design choice documented in code:
```python
# Persist the assistant tool-call turn before any tool
# side effects run. If a destructive tool restarts or
# terminates Hermes mid-turn, resume logic still sees
# the exact tool-call block that already executed.
```
(conversation_loop.py:4967-4970)

### 1.3 Session State Management

**[F]** Session state is held on the `AIAgent` object (god object pattern):

| State Field | Type | Usage |
| --- | --- | --- |
| `agent.session_id` | str | Session identity |
| `agent.messages` / `_session_messages` | list[dict] | Conversation history |
| `agent._cached_system_prompt` | str | Cached system prompt (session-stable) |
| `agent.ephemeral_system_prompt` | str | Per-turn ephemeral system prompt additions |
| `agent.conversation_history` | list | History cursor for persistence |
| `agent._last_flushed_db_idx` | int | Cursor for incremental flush |
| `agent.iteration_budget` | IterationBudget | Turn budget tracking |
| `agent._interrupt_requested` | bool | Interrupt flag |

**[F]** Message list repair: `repair_message_sequence_with_cursor()` (agent_runtime_helpers.py) recomputes the flush cursor when repair compacts the list (conversation_loop.py:829-836).

### 1.4 Cross-Turn Continuity

**[F]** Between turns:
- System prompt is cached (`_cached_system_prompt`) and replayed verbatim for prompt cache stability (conversation_loop.py:893-897)
- Per-turn state (retry counters, compression attempts, empty response counters) is **reset** at the start of each `run_conversation()` call (L651-666)
- The `_session_messages` list carries conversation state across turns

## 2. Memory System

### 2.1 Memory Architecture

**[F]** Memory is handled by `agent/memory_manager.py` and `agent/memory_provider.py`:

- `build_memory_context_block()` — called at conversation_loop.py:850 to format memory for API injection
- Memory is injected into the **user message** at API-call time, NOT the system prompt
- This keeps the system prompt prefix stable for prompt caching

**[F]** Memory injection is API-call-time only — the original `messages` list is never mutated:
```python
# Sources: memory manager prefetch + plugin pre_llm_call hooks
# with target="user_message" (the default).  Both are
# API-call-time only — the original message in `messages` is
# never mutated, so nothing leaks into session persistence.
```
(conversation_loop.py:843-847)

### 2.2 Memory Prefetch

**[F]** Memory prefetch happens in `build_turn_context()` (turn_context.py, called at conversation_loop.py:618). The result is stored in `_ext_prefetch_cache` and injected at L849-852.

### 2.3 Memory Curation

**[I]** Based on file listing, memory curation is handled by:
- `agent/curator.py` — automated memory curation
- `agent/curator_backup.py` — backup mechanisms
- `agent/learning_graph.py` — learning graph for auto-generated skills
- `agent/learning_mutations.py` — mutation operations on learned content

### 2.4 Memory Nudge

**[F]** The agent tracks `_turns_since_memory` counter — nudges the model to use memory tools after a configurable interval (tool_executor.py:384-385):
```python
if function_name == "memory":
    agent._turns_since_memory = 0
```

**[F]** A `_should_review_memory` flag is set by `build_turn_context()` and checked post-turn to trigger background memory review (conversation_loop.py:643).

## 3. Skill System

### 3.1 Skill Architecture

**[I]** Based on file listing, skills have dedicated support:
- `agent/skill_commands.py` — skill command handling
- `agent/skill_bundles.py` — skill bundle packaging
- `agent/skill_preprocessing.py` — skill preprocessing
- `agent/skill_utils.py` — utilities
- `skills/` directory — bundled skill definitions
- `optional-skills/` — optional skill packages

### 3.2 Skill Nudge

**[F]** An explicit skill nudge mechanism pushes the model to use skills (conversation_loop.py:746-748):
```python
if (agent._skill_nudge_interval > 0
        and "skill_manage" in agent.valid_tool_names):
    agent._iters_since_skill += 1
```

This counter resets when `skill_manage` is actually used (tool_executor.py:386-387).

### 3.3 Skill Toolset Scope

**[I]** Skills operate within the session's toolset scope. The `_tool_search_scoped_names()` function (tool_executor.py:219) returns the set of tools the session is granted, and tools not in scope are blocked before dispatch (L411-422).

## 4. Memory / Skill / Session Separation

### 4.1 Are They Truly Separated?

**[I]** The separation is **partial**:

| Dimension | Separation Status | Evidence |
| --- | --- | --- |
| Session ↔ Memory | **Separated** — memory is injected at API time, not stored in session messages | conversation_loop.py:843-847 |
| Procedural Skill ↔ Declarative Memory | **Partially separated** — skill commands vs memory commands are distinct tools, but both inject into the same context | Skill nudge (L746) vs Memory nudge (tool_executor.py:384) |
| Skill ↔ Plugin | **Different mechanisms** — skills use tools + manifests, plugins use hook system | Directory separation: `skills/` vs `plugins/` |
| Memory Write ↔ Memory Read | **Different paths** — write via tool calls, read via prefetch injection | memory_manager.py vs _ext_prefetch_cache |

### 4.2 Skill Auto-Generation Safety

**[I]** The `agent/learning_graph.py`, `agent/learning_mutations.py`, and `agent/curator.py` files suggest an **auto-learning** capability where the agent can create or modify skills. This raises security concerns:
- Auto-generated skills could contain prompt injection
- Auto-generated skills could grant unintended tool access
- The safety boundary for auto-generated skills is not clear from static analysis

**[R]** RoboThree should establish explicit guardrails for auto-generated skills: mandatory human review, toolset whitelist, and sandboxed execution.

## 5. Plugin System

### 5.1 Hook Architecture

**[F]** Plugins use a hook-based architecture with explicit hook points:

| Hook | When Fired | Evidence |
| --- | --- | --- |
| `pre_llm_call` | Before model API call — context injection | conversation_loop.py:617 (in turn_context.py) |
| `pre_api_request` | Before actual HTTP request — observability/interception | conversation_loop.py:1274-1322 |
| `pre_tool_block` | Before tool execution — blocking | tool_executor.py:454-466 |
| `post_tool_call` | After tool execution | tool_executor.py signature |

**[F]** Hook invocation uses `has_hook()` / `invoke_hook()` from `hermes_cli.plugins` (conversation_loop.py:1270-1273).

### 5.2 Plugin Blocking

**[F]** Plugins can **block tool execution** via `resolve_pre_tool_block()` (tool_executor.py:454-466):
```python
block_message = resolve_pre_tool_block(
    function_name, function_args,
    task_id=..., session_id=..., tool_call_id=...
)
if block_message is not None:
    block_result = json.dumps({"error": block_message}, ...)
```

This is a **real pre-execution block** — the tool never reaches `agent._invoke_tool()`.

## 6. Open Questions

1. **Session DB Backend**: Is session storage file-based, SQLite, or remote? Not determined from static analysis.
2. **Memory Provider Backend**: Is memory stored as files, in a vector DB, or both? `agent/memory_provider.py` suggests abstraction but details unknown.
3. **Skill Auto-Generation Safety**: What guardrails exist for auto-generated skills? The learning graph system needs deeper investigation.
4. **Cross-Session Memory Search**: How does memory retrieval work across sessions? The `session_search` tool is referenced but not analyzed.
