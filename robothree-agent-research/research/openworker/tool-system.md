# Tool System — OpenWorker (L3 Deep Dive)

> Commit: `f96ad4c8e6865f0aec519681a3717b6bcdd81546`
> Focus Mechanism #1: **TurnEngine Tool Execution + Approval Gate**

## 1. Tool Registry Architecture

### 1.1 Core Design

`ToolRegistry` (`coworker/tools/registry.py`) wraps aisuite's `Tools` schema generator:

```
ToolRegistry
├── _tools: dict[str, ToolSpec]
│   ├── name: str
│   ├── schema: dict          # OpenAI-format function schema
│   ├── func: Callable        # Actual implementation
│   └── metadata: ToolMetadata # risk_level, category, capabilities, requires_approval
├── register(func, metadata, schema) → ToolSpec
├── schemas() → list[dict]    # All schemas for the model
└── execute(name, args) → Any # Run one tool
```

Schema generation is delegated to aisuite's `Tools([func]).tools(format="openai")` which extracts JSON Schema from type hints + docstrings. Custom schemas can be provided via `__coworker_schema__` attribute. [F: `tools/registry.py:40-44`]

### 1.2 Tool Assembly (build_engine)

The engine builder (`coworker/agent.py:build_engine()`) composes tools from multiple sources:

```text
1. Agent base tools     → agent.build_tools(context)      [files, search, shell, todo]
2. Extra tools (MCP)    → registry.register_all(extra_tools)
3. send_message         → if agent.messaging + connectors
4. send_file            → if agent.messaging + connectors
5. Subscription tools   → if subscription_store present
6. request_directory    → if agent.family == "knowledge" + roots
7. Integration tools    → if agent.connectors
8. Web search + fetch   → always (keyless DuckDuckGo default)
9. ask_user             → if question_asker present
10. Explorer subagents  → if agent.family == "code" + workspace
11. Scheduling tools    → if task_store + agent.family == "knowledge"
12. Self-wake tools     → if wake_store + agent.family == "knowledge"
13. Memory tools        → if memory_store present
14. Skill tools         → always (load_skill)
15. propose_plan        → always (engine-intercepted)
```

[F: `agent.py:161-285`]

### 1.3 Tool Risk Classification

`coworker/risk.py` classifies every tool:

```text
RiskClass.READ       → Non-consequential (auto-allowed in all modes)
RiskClass.WRITE_LOCAL → File writes (gated by path scoping + mode)
RiskClass.EXEC        → Shell commands (gated by command allowlisting + mode)
RiskClass.EXTERNAL    → Network/API calls (gated by mode + task rules)
```

Classification is based on tool metadata (category + capabilities) with user overrides via `RiskOverrideStore`. [F: `risk.py`]

## 2. The TurnEngine Execution Flow — Full Detail

### 2.1 Turn Lifecycle

```
run(user_input)
  ├── messages.append({role: "user", content})
  ├── yield TURN_START
  └── _loop()
        ├── [iteration ≤ max_iterations]
        ├── _astream()                     → model streaming
        │     ├── provider.stream() [thread]
        │     ├── yield REASONING_DELTA / ASSISTANT_DELTA
        │     └── return AssistantTurn
        ├── messages.append(assistant_message)
        ├── yield ASSISTANT_MESSAGE
        ├── if no tool_calls:
        │     ├── if _steering: _inject_steering() → continue
        │     └── yield TURN_END(completed)
        └── if tool_calls:
              ├── _handle_tool_calls()
              │     ├── For each call: TOOL_PROPOSED → _authorize()
              │     │     ├── Special tools (request_directory, propose_plan, ask_user)
              │     │     │     → Engine-intercepted, resolved out-of-band
              │     │     └── Normal tools
              │     │           ├── PermissionEngine.evaluate()
              │     │           ├── if needs_user → PERMISSION_REQUIRED → await approver()
              │     │           └── return allowed/denied
              │     ├── Concurrent execution (low-risk reads/searches)
              │     ├── Serial execution (writes, shell, unknown risk)
              │     └── For each executed: TOOL_FINISHED
              ├── yield ITERATION_END
              └── if _steering: _inject_steering() → loop continues
```

[F: `engine.py:156-388`]

### 2.2 Parallel vs Serial Tool Execution

The key innovation: after all tools in a turn are authorized, they split into two groups:

```python
concurrent = [tc for tc in cleared if self._parallel_safe(tc)] if len(cleared) > 1 else []
serial = [tc for tc in cleared if tc not in concurrent]

# Concurrent: asyncio.gather (all start at once)
outcomes = await asyncio.gather(
    *[asyncio.to_thread(self._execute_sync, tc) for tc in concurrent]
)

# Serial: one at a time, with interrupt check between each
for tool_call in serial:
    if self._cancel.is_set():
        yield self._interrupted_tool(tool_call)
        continue
    yield TOOL_STARTED
    result, status = await asyncio.to_thread(self._execute_sync, tool_call)
    yield self._record_result(tool_call, result, status)
```

`_parallel_safe()` returns True only for metadata-declared low-risk tools (reads, searches, git queries) that don't require approval. [F: `engine.py:480-526`]

### 2.3 Interrupt Handling — No Orphan Guarantee

The engine guarantees that every proposed tool_call always gets a result:

```python
def request_interrupt(self):
    self._cancel.set()                        # main cancel signal
    for hook in self._interrupt_hooks:
        hook()                                # executor.interrupt_now → kills shell

# In _handle_tool_calls, BEFORE authorization:
if self._cancel.is_set():
    yield self._interrupted_tool(tool_call)   # tool-error in history
    continue

# In serial execution loop, BEFORE execution:
if self._cancel.is_set():
    yield self._interrupted_tool(tool_call)   # tool-error in history
    continue
```

This is critical because hosted chat templates reject messages with orphaned tool_calls. [F: `engine.py:120-132, 447-504, 506-517`]

### 2.4 Engine-Intercepted Tools

Three tools bypass the normal permission/registry path:

| Tool | Handler | Behavior |
|------|---------|----------|
| `request_directory` | `_handle_directory_request()` | Emits `DIRECTORY_REQUESTED`, awaits user grant, applies to session roots |
| `propose_plan` | `_handle_plan_proposal()` | Emits `PLAN_PROPOSED`, awaits approval, flips mode out of PLAN |
| `ask_user` | `_handle_ask_user()` | Emits question, awaits answer from Inbox/surface |

These are "out-of-band interactive" — the user's decision IS the consent, so they skip the permission engine. [F: `engine.py:459-470, 706-866`]

### 2.5 Steering — Mid-Turn User Messages

`queue_steering(text, source)` allows injecting user messages mid-turn without stopping the loop. After the current iteration completes (model response + tool execution), steering messages are appended as user messages and the loop continues. This enables "add more context" mid-task without interrupting tool execution. [F: `engine.py:150-153, 368-370, 386-387, 868-878`]

### 2.6 Context Provider — Per-Turn Ephemeral Context

`context_provider` is a callback that returns an ephemeral `<system-context>` block appended to the LAST user message at send-time only. This carries:

- **Mode reminders**: "Plan mode is active: write and shell tools are blocked..."
- **Live directory list**: The current writable roots, updated if folders are added mid-session

The block is never persisted — `_outbound_messages()` adds it to a copy. [F: `engine.py:89-93, 966-985; agent.py:297-307`]

## 3. Tool Result Privacy

Tool results can carry a `_display` sidecar with metadata the agent must never see:

```python
# In _record_result:
display = result.get("_display") or None
result = {k: v for k, v in result.items() if k != "_display"}
message = _tool_result_message(tool_call, result)
if display:
    message["_display"] = display   # persisted for GUI, stripped from provider feed
```

This is used for Gmail privacy filters: the agent sees filtered results but not counts of what was hidden, preventing the model from probing around privacy controls. [F: `engine.py:644-690`]

## 4. Key Architectural Insights

| Insight | Type | Evidence |
|---------|------|----------|
| Tool execution is always off the event loop via `asyncio.to_thread` | FACT | `engine.py:492, 503` |
| All authorization completes before ANY tool executes | FACT | `engine.py:439-478` (all authorized first) |
| Low-risk tools run concurrently; writes/shell are strictly ordered | FACT | `engine.py:480-504` |
| Interrupted tools always produce a tool-error message — no orphans | FACT | `engine.py:126, 506-517` |
| Engine-intercepted tools (ask_user, propose_plan, request_directory) skip the permission engine | FACT | `engine.py:459-470` |
| `_display` sidecar implements agent-opaque privacy metadata | FACT | `engine.py:644-690` |
| Steering enables mid-turn user feedback without interrupting running tools | FACT | `engine.py:368-370, 868-878` |
