# Hermes Agent — Open Questions

> Questions that could not be resolved through static analysis alone.  
> Each entry includes a proposed method to close the gap.

## 1. Agent Loop

### Q1.1: Async Loop Support
**Question**: Does Hermes support an async agent loop, or is it purely synchronous? The `run_conversation()` function is synchronous, but there may be async wrappers.

**Status**: UNKNOWN  
**How to Close**: Runtime profiling with `await` tracing, or deeper static analysis of `agent/async_utils.py`.

### Q1.2: Event-Driven Mode
**Question**: Is there an event-driven mode where the agent waits for external events (webhooks, cron triggers) instead of polling?

**Status**: UNKNOWN  
**How to Close**: Analyze `cron/` directory and gateway event handling.

---

## 2. Session & Memory

### Q2.1: Session Storage Backend
**Question**: What is the session storage backend? File-based JSON, SQLite, or a remote database?

**Status**: UNKNOWN  
**How to Close**: Analyze `_persist_session()` implementation and session DB initialization in `agent_init.py`.

### Q2.2: Cross-Session Memory Search
**Question**: How does memory retrieval work across sessions? Is there a vector search, keyword search, or hybrid approach?

**Status**: UNKNOWN  
**How to Close**: Analyze `agent/memory_manager.py` and `agent/memory_provider.py`.

### Q2.3: Memory Provider Backend
**Question**: Is memory stored as files, in a vector database (Chroma, Pinecone), or both?

**Status**: UNKNOWN  
**How to Close**: Analyze `agent/memory_provider.py` and configuration schema.

---

## 3. Tool System

### Q3.1: Tool Registration
**Question**: How are tools registered? Is there a decorator-based registry, a manifest file, or dynamic registration?

**Status**: UNKNOWN  
**How to Close**: Analyze tool initialization in `agent_init.py` and tool definitions in `tools/`.

### Q3.2: Dynamic Tool Addition
**Question**: Can tools be added/removed at runtime without restarting the agent?

**Status**: UNKNOWN  
**How to Close**: Search for dynamic toolset mutation in the codebase.

### Q3.3: Tool Schema Generation
**Question**: How are tool schemas (JSON Schema for function calling) generated? From type hints, docstrings, or manual schema files?

**Status**: UNKNOWN  
**How to Close**: Analyze `agent/tool_*.py` for schema generation logic.

---

## 4. Subagent

### Q4.1: Subagent Isolation Level
**Question**: Are subagents truly independent — separate process, separate session, separate toolset? Or are they lightweight wrappers?

**Status**: UNKNOWN  
**How to Close**: Analyze `agent/auxiliary_client.py`, `delegate_task` implementation, and subagent spawn logic.

### Q4.2: Recursive Delegation
**Question**: Can a subagent delegate to another subagent? If so, what is the depth limit?

**Status**: UNKNOWN  
**How to Close**: Analyze `_cap_delegate_task_calls()` (conversation_loop.py:4835) and subagent spawn logic.

### Q4.3: Subagent Result Delivery
**Question**: How do subagent results return to the parent? Synchronous return, callback, or message queue?

**Status**: UNKNOWN  
**How to Close**: Analyze subagent communication in `agent/auxiliary_client.py`.

---

## 5. Permission & Security

### Q5.1: Approval Model
**Question**: Is user approval a real execution gate (tool cannot run without approval) or an informational UI prompt?

**Status**: UNKNOWN  
**How to Close**: Runtime testing of approval flow, or analyze `_approval_session_key` usage.

### Q5.2: OS-Level Sandboxing
**Question**: Is there any OS-level sandboxing (seccomp, containers, macOS sandbox) for tool execution?

**Status**: UNKNOWN — not found in analyzed files  
**How to Close**: Analyze `tools/environments/` for sandbox configuration.

### Q5.3: Network Egress Control
**Question**: Can tools make arbitrary outbound network requests? Is there a domain allowlist?

**Status**: UNKNOWN  
**How to Close**: Analyze tool network access patterns and any egress filtering.

---

## 6. Gateway

### Q6.1: Session Routing
**Question**: How does the gateway route incoming messages to the correct session? By user ID, chat ID, or session token?

**Status**: UNKNOWN  
**How to Close**: Analyze `gateway/` platform adapter implementations.

### Q6.2: Late Completion
**Question**: For async platforms (cron, background tasks), how is the final response delivered after the agent completes? Polling, webhook, or push notification?

**Status**: UNKNOWN  
**How to Close**: Analyze gateway delivery mechanisms.

---

## 7. Worker Backends

### Q7.1: Backend Interface
**Question**: What is the exact `BaseEnvironment` interface? What methods must each backend implement?

**Status**: UNKNOWN  
**How to Close**: Read `tools/environments/base.py`.

### Q7.2: Persistent Filesystem vs Ephemeral
**Question**: Which backends provide persistent filesystems across sessions, and which are ephemeral?

**Status**: UNKNOWN  
**How to Close**: Analyze each backend's workspace configuration.

---

## 8. Learning & Auto-Generation

### Q8.1: Learning Graph Safety
**Question**: What guardrails exist for auto-generated skills from the learning graph? Is human approval required?

**Status**: UNKNOWN  
**How to Close**: Analyze `agent/learning_mutations.py` for safety gates and approval flows.

### Q8.2: Skill Auto-Generation Trigger
**Question**: What triggers automatic skill generation? Conversation patterns, explicit user request, or background analysis?

**Status**: UNKNOWN  
**How to Close**: Analyze `agent/curator.py` and `agent/learning_graph.py`.

---

## 9. Observability

### Q9.1: Telemetry
**Question**: What observability data does Hermes emit? Traces, metrics, logs? To what backends?

**Status**: UNKNOWN  
**How to Close**: Analyze `agent/trace_upload.py`, `agent/insights.py`, and `plugins/observability/`.

### Q9.2: Debug Mode
**Question**: Is there a debug mode that exposes internal state (messages, tool calls, budgets) for inspection?

**Status**: UNKNOWN  
**How to Close**: Search for debug flags and verbose logging configuration.

---

## Confidence Summary

| Category | FACT | INFERENCE | UNKNOWN |
| --- | --- | --- | --- |
| Agent Loop | 12 | 3 | 2 |
| Context/Compression | 8 | 4 | 0 |
| Tool System | 10 | 5 | 3 |
| Session/Memory | 6 | 5 | 3 |
| Skill/Plugin/MCP | 5 | 8 | 2 |
| Permission/Security | 8 | 6 | 5 |
| Subagent | 1 | 2 | 3 |
| Gateway | 1 | 4 | 2 |
| Worker | 0 | 3 | 2 |
| Learning | 0 | 2 | 2 |
| **Total** | **51** | **42** | **24** |
