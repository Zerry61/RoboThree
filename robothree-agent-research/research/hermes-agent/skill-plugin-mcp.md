# Hermes Agent — Skill, Plugin & MCP

## 1. Skill System

### 1.1 Skill Lifecycle

**[I]** Skills in Hermes are first-class extensibility units with dedicated infrastructure:

| Component | File/Dir | Role |
| --- | --- | --- |
| Skill Commands | `agent/skill_commands.py` | Command-line interface for skill management |
| Skill Bundles | `agent/skill_bundles.py` | Packaging and distribution of skill bundles |
| Skill Preprocessing | `agent/skill_preprocessing.py` | Preprocessing before skill execution |
| Skill Utilities | `agent/skill_utils.py` | Shared utilities |
| Bundled Skills | `skills/` | Default skill definitions shipped with Hermes |
| Optional Skills | `optional-skills/` | Optional skill packages |

### 1.2 Skill Trigger Mechanism

**[F]** Skill usage is tracked and nudged via two counters:

1. **Skill iteration counter**: `agent._iters_since_skill` — increments each tool-call iteration; resets when `skill_manage` is used (conversation_loop.py:746-748, tool_executor.py:386-387)
2. **Skill nudge interval**: `agent._skill_nudge_interval` — configurable threshold; when counter exceeds interval, the system nudges the model toward skill usage

**[F]** The nudge mechanism:
```python
if (agent._skill_nudge_interval > 0
        and "skill_manage" in agent.valid_tool_names):
    agent._iters_since_skill += 1
```
(conversation_loop.py:746-748)

### 1.3 Skill Tool Scope

**[I]** Skills are exposed through the tool system. The `skill_manage` tool is in the `valid_tool_names` set, and its availability is gated by `_tool_search_scoped_names()` (tool_executor.py:219).

### 1.4 Skill Auto-Generation (Learning Graph)

**[I]** Hermes includes a **learning graph** system (`agent/learning_graph.py`, `agent/learning_mutations.py`, `agent/learning_graph_render.py`) that can automatically create or modify skills based on conversation patterns. This raises important security considerations:

- **[I]** Auto-generated skills could contain prompt injection payloads from user conversations
- **[I]** Auto-generated skills could be assigned unintended tool permissions
- **[UNKNOWN]** Whether auto-generated skills require human approval before activation
- **[UNKNOWN]** Whether auto-generated skills have a restricted toolset by default

## 2. Plugin System

### 2.1 Hook Architecture

**[F]** Hermes plugins use a **hook-based architecture** with named hook points. Plugins register handlers for specific hooks via `hermes_cli/plugins/`.

**[F]** Key hook points identified:

| Hook | Type | When | Evidence |
| --- | --- | --- | --- |
| `pre_llm_call` | Context injection | Before model API call, inject user context | conversation_loop.py:617 (via turn_context.py) |
| `pre_api_request` | Observability | Before HTTP request, capture request data | conversation_loop.py:1274-1322 |
| `pre_tool_block` | Security | Before tool execution, block if needed | tool_executor.py:454-466 |
| `post_tool_call` | Observability | After tool execution, capture results | tool_executor.py (post-execution hooks) |

### 2.2 Plugin Hook Invocation

**[F]** Hook invocation pattern (conversation_loop.py:1270-1322):
```python
from hermes_cli.plugins import has_hook, invoke_hook as _invoke_hook
if has_hook("pre_api_request"):
    _invoke_hook("pre_api_request",
        task_id=..., turn_id=...,
        session_id=..., model=..., provider=...,
        request_messages=..., request=...)
```

**[F]** Hook context includes: `task_id`, `turn_id`, `api_request_id`, `session_id`, `user_message`, `conversation_history`, `platform`, `model`, `provider`, `base_url`, `api_mode`, `api_call_count`, `message_count`, `tool_count`, `approx_input_tokens`, `request_char_count`, `max_tokens`, `started_at`, `middleware_trace`, `request` (sanitized payload).

### 2.3 Plugin Blocking

**[F]** The `pre_tool_block` hook can **prevent tool execution** (tool_executor.py:454-466):
```python
block_message = resolve_pre_tool_block(
    function_name, function_args,
    task_id=..., session_id=..., tool_call_id=...,
    turn_id=..., api_request_id=...,
    middleware_trace=...
)
if block_message is not None:
    block_result = json.dumps({"error": block_message}, ...)
```

This is a **real execution gate** — blocked tools get a JSON error result injected into messages but never execute.

### 2.4 Plugin vs Skill

| Dimension | Plugin | Skill |
| --- | --- | --- |
| Extension Mechanism | Hook-based (event handlers) | Tool-based (model-invoked) |
| Invocation | Automatic (hook points) | Model decides (tool call) |
| Permission Model | Access to full hook context | Gated by session toolset scope |
| Storage | `plugins/` directory | `skills/` directory |
| Auto-Generation | No | Yes (learning graph) |

## 3. MCP (Model Context Protocol)

### 3.1 MCP Server

**[F]** Hermes includes an MCP server at `mcp_serve.py`. Based on the optional MCP configurations:
- `optional-mcps/` — optional MCP server configurations
- `acp_adapter/` — ACP (Agent Communication Protocol) adapter for inter-agent communication

### 3.2 MCP Integration Level

**[I]** Hermes acts as an **MCP host** (exposing tools/context to MCP clients) via `mcp_serve.py`. The depth of MCP client integration (connecting to external MCP servers) is not confirmed from static analysis.

### 3.3 ACP (Agent Communication Protocol)

**[F]** The `acp_adapter/` directory (7+ files) implements ACP, an agent communication protocol:
- `acp_adapter/server.py` — ACP server
- `acp_adapter/session.py` — ACP session handling
- `acp_adapter/tools.py` — ACP tool exposure
- `acp_adapter/permissions.py` — ACP permission model
- `acp_adapter/auth.py` — ACP authentication
- `acp_adapter/events.py` — ACP event system
- `acp_adapter/entry.py` — ACP entry point

**[I]** ACP provides inter-agent communication capabilities, potentially allowing Hermes instances to delegate to each other or to other ACP-compatible agents.

## 4. Middleware System

### 4.1 LLM Request Middleware

**[F]** A middleware pipeline wraps every LLM API call (conversation_loop.py:1247-1267):
```python
from hermes_cli.middleware import apply_llm_request_middleware
_llm_request_mw = apply_llm_request_middleware(
    api_kwargs, task_id=..., turn_id=..., session_id=...,
    platform=..., model=..., provider=..., base_url=...,
    api_mode=..., api_call_count=...
)
api_kwargs = _llm_request_mw.payload
```

### 4.2 LLM Execution Middleware

**[F]** A second middleware layer wraps the actual API execution (conversation_loop.py:1396-1413):
```python
from hermes_cli.middleware import run_llm_execution_middleware
response = run_llm_execution_middleware(
    api_kwargs, _perform_api_call,
    original_request=..., task_id=..., ...
)
```

**[I]** This two-layer middleware architecture (request transformation → execution interception) allows plugins to modify requests before sending and intercept/transform responses before processing.

### 4.3 Tool Request Middleware

**[F]** Tools also have middleware (tool_executor.py:268-294):
```python
function_args, middleware_trace = _apply_tool_request_middleware_for_agent(
    agent, function_name=..., function_args=...,
    effective_task_id=..., tool_call_id=...
)
```

## 5. RoboThree Implications

### ADOPT

1. **Hook-based plugin architecture with named hook points** — clear, extensible, well-defined context per hook
2. **Dual-layer middleware** (request transformation + execution interception) — separates concerns cleanly

### ADAPT

1. **Skill nudge mechanism** — nudging model toward skill usage, but needs human-in-the-loop for auto-generated skills
2. **Skill/Plugin separation** — tools vs hooks is a useful distinction for RoboThree

### DEFER

1. **Learning graph auto-generation** — too high-risk without clear safety boundaries; study more before adopting

### REJECT

1. **MCP as only a server** — RoboThree needs MCP client capabilities for tool consumption, not just tool exposure
