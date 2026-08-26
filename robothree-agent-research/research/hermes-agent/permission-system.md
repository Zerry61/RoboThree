# Hermes Agent — Permission & Security

> **Note**: This analysis is based on static source code review only. No runtime testing, sandbox escape testing, or adversarial probing was performed.

## 1. Permission Model Overview

**[F]** Hermes uses a **multi-layer pre-execution blocking** model rather than a centralized permission manager:

```text
Model emits tool_call
        │
        ▼
┌─────────────────────┐
│ 1. Tool Scope Gate   │ ← Session-scoped toolset
│    _tool_search_     │   Tools not granted → blocked
│    scoped_names()    │
└────────┬────────────┘
         │ Pass
         ▼
┌─────────────────────┐
│ 2. Plugin Block      │ ← Plugin-defined rules
│    resolve_pre_tool_ │   Plugin returns message → blocked
│    block()           │
└────────┬────────────┘
         │ Pass
         ▼
┌─────────────────────┐
│ 3. Guardrail Check   │ ← Centralized policy engine
│    _tool_guardrails. │   Guardrail rejects → blocked
│    before_call()     │
└────────┬────────────┘
         │ Pass
         ▼
┌─────────────────────┐
│ 4. Checkpoint        │ ← File safety net
│    (write_file,      │   Snapshot before mutation
│     patch, terminal) │
└────────┬────────────┘
         │
         ▼
    Tool executes
```

**[F]** Evidence: tool_executor.py:437-522

## 2. Permission Layers in Detail

### 2.1 Tool Scope Gate

**[F]** The tool scope gate (`_tool_search_scoped_names()`, tool_executor.py:219) returns a `frozenset` of tool names the current session is allowed to use. Tools not in the set are blocked with a JSON error result (L437-451):

```python
_ts_scope_block = json.dumps({
    "error": (
        f"'{_underlying}' is not available in this session. "
        "Use tool_search to find tools you can call."
    ),
}, ensure_ascii=False)
```

**[F]** This is the first blocking layer — blocks happen **before any hook, checkpoint, or middleware** fires (L400-404).

**[I]** The scope is session-level: a session is granted a subset of the globally registered tools. This allows per-session tool restrictions.

### 2.2 Plugin Pre-Tool Block

**[F]** Plugins can block tool execution via `resolve_pre_tool_block()` (tool_executor.py:454-466). The plugin receives full context:
- `function_name` — tool being called
- `function_args` — arguments
- `task_id`, `session_id`, `tool_call_id`, `turn_id`, `api_request_id`
- `middleware_trace` — trace of middleware transformations

**[F]** If a plugin returns a non-None block message, the tool is blocked and gets a JSON error result:
```python
block_result = json.dumps({"error": block_message}, ensure_ascii=False)
```

### 2.3 Guardrail System

**[F]** The guardrail system (`agent/tool_guardrails.py`) provides centralized policy enforcement:
```python
guardrail_decision = agent._tool_guardrails.before_call(function_name, function_args)
if not guardrail_decision.allows_execution:
    block_result = agent._guardrail_block_result(guardrail_decision)
    blocked_by_guardrail = True
```
(tool_executor.py:483-498)

**[F]** Guardrails can also **halt the entire turn** post-execution (conversation_loop.py:4994-5015):
```python
if agent._tool_guardrail_halt_decision is not None:
    decision = agent._tool_guardrail_halt_decision
    _turn_exit_reason = "guardrail_halt"
    final_response = agent._toolguard_controlled_halt_response(decision)
    break
```

### 2.4 Checkpoint System

**[F]** Before file-mutating tools (`write_file`, `patch`) and destructive terminal commands, the checkpoint manager takes a snapshot:
```python
if function_name in {"write_file", "patch"} and agent._checkpoint_mgr.enabled:
    agent._checkpoint_mgr.ensure_checkpoint(work_dir, f"before {function_name}")

if function_name == "terminal" and agent._checkpoint_mgr.enabled:
    if _is_destructive_command(cmd):
        agent._checkpoint_mgr.ensure_checkpoint(cwd, f"before terminal: {cmd[:60]}")
```
(tool_executor.py:500-522)

**[I]** This is a **recovery mechanism**, not a prevention mechanism. Checkpoints allow rollback after damage, but don't prevent the damage.

## 3. Destructive Command Detection

**[F]** `_is_destructive_command()` in `agent/tool_dispatch_helpers.py:81` identifies dangerous terminal commands. This is used for:
- Checkpoint triggering before execution
- Display warnings (not blocking)

**[I]** The detection is pattern-based (regex matching on command strings), not behavioral. It can be bypassed with command obfuscation.

## 4. Tool Result Safety

### 4.1 Untrusted Tool Output

**[F]** Tools can be marked as untrusted (`_is_untrusted_tool()` at tool_dispatch_helpers.py:526). Untrusted tool outputs are wrapped to prevent them from being interpreted as system instructions when fed back to the model.

**[F]** `_maybe_wrap_untrusted()` (tool_dispatch_helpers.py:583) applies delimiters to untrusted output that would otherwise be raw text injected into the model's context.

### 4.2 Risk Metadata

**[F]** `_tool_output_risk_metadata()` (tool_dispatch_helpers.py:534) generates risk classification for tool outputs, used for display and logging.

### 4.3 Content Sanitization

**[F]** Multiple sanitization layers exist in `agent/message_sanitization.py`:
- `_sanitize_messages_non_ascii()` — non-ASCII filtering
- `_sanitize_messages_surrogates()` — surrogate character removal (prevents json.dumps crashes)
- `_strip_images_from_messages()` — image stripping for providers that don't support images
- `close_interrupted_tool_sequence()` — repair after interrupt

## 5. File Safety

**[F]** `agent/file_safety.py` provides file operation safety checks. Not analyzed in detail, but its existence confirms file safety is a recognized concern.

## 6. Secret Management

**[F]** `agent/secret_scope.py` and `agent/secret_sources/` handle secret management:
- Secret scoping (which tools/contexts can access which secrets)
- Secret sources (where secrets are stored/retrieved)

**[F]** `agent/redact.py` handles data redaction for logging and display.

## 7. SSL/TLS Verification

**[F]** `agent/ssl_guard.py` and `agent/ssl_verify.py` handle SSL/TLS certificate verification for API calls.

## 8. Subagent Permission Inheritance

**[UNKNOWN]** Whether subagents inherit the parent agent's full permissions, a subset, or have independent permission configuration. The `delegate_task` tool reference in conversation_loop.py:4835 (`agent._cap_delegate_task_calls()`) suggests capping exists, but the specific inheritance model is not confirmed.

## 9. User Approval Flow

**[I]** Based on the `_approval_session_key` ContextVar reference (tool_executor.py:688 comment), there is an approval mechanism for tool execution. The `propagate_context_to_thread()` call propagates approval callbacks to worker threads, suggesting:
- Approvals happen per-tool or per-session
- Approval state is thread-local
- Approvals are propagated to concurrent tool workers

**[UNKNOWN]** Whether approval is:
- A real execution gate (tool cannot execute without approval)
- An informational UI prompt (tool executes but user is notified)
- Configurable per-tool or per-tool-category

## 10. Security Assessment

### Strengths

1. **[F]** Multi-layer blocking (scope → plugin → guardrail) with **real pre-execution prevention**
2. **[F]** Incremental session persistence before tool execution — crash resilience
3. **[F]** Checkpoint snapshots before destructive operations — rollback capability
4. **[F]** Untrusted tool output wrapping — prevents prompt injection via tool results
5. **[F]** Destructive command detection for terminal operations

### Weaknesses

1. **[I]** Tool execution is **thread-based, not process-sandboxed** — a malicious tool shares the agent process
2. **[I]** Checkpoint is recovery-only, not prevention — damage happens first, rollback after
3. **[I]** Destructive command detection is pattern-based — bypassable with obfuscation
4. **[UNKNOWN]** Approval model — unclear if it's a real gate or UI-only
5. **[UNKNOWN]** Subagent permission isolation — inheritance model not confirmed

### Critical Unknowns

1. **Sandbox**: Is there any OS-level sandboxing (seccomp, containers) for tool execution? Not found in analyzed files.
2. **Network Egress Control**: Can tools make unrestricted network requests? Not analyzed.
3. **Approval Persistence**: Do approvals persist across turns? Across sessions? Unknown.
4. **Secret Injection**: How are secrets injected into tool context? Is there a risk of leakage into model context?

## 11. RoboThree Implications

### ADOPT

1. **Multi-layer pre-execution blocking** — scope + plugin + guardrail is a robust pattern
2. **Untrusted output wrapping** — essential for tool result safety
3. **Incremental persistence before dangerous operations** — crash resilience pattern

### ADAPT

1. **Checkpoint system** — valuable but should be paired with pre-execution prevention, not just recovery
2. **Pattern-based destructive command detection** — useful quick check, but not sufficient alone

### REJECT

1. **Thread-based tool execution without process isolation** — RoboThree should enforce stronger isolation

### NEEDS_MORE_EVIDENCE

1. Approval model — needs runtime testing to determine if it's a real gate
2. Subagent permission inheritance — needs deeper code analysis
