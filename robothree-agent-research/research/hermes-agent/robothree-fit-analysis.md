# Hermes Agent → RoboThree Fit Analysis

> **Analysis Basis**: Level 2 static source analysis of hermes-agent@`3d9be27`  
> **Execution Mode**: STATIC_ANALYSIS_ONLY

## RoboThree Module Mapping

Each finding is mapped to one or more RoboThree target modules using ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE.

---

## 1. Agent Main Loop — ADAPT

**Finding**: Hermes uses a **while-loop with iteration budget + max_iterations + grace call** (conversation_loop.py:689)

**RoboThree Modules**: `Agent Runtime`

**Conclusion**: ADAPT

**Source Evidence**:
- `agent/conversation_loop.py:689` — `while (api_call_count < agent.max_iterations and agent.iteration_budget.remaining > 0) or agent._budget_grace_call:`
- `agent/iteration_budget.py` — `IterationBudget` class with `consume()`, `refund()`, `remaining`

**Reason**: The while-loop + budget pattern is clean and proven, but the Hermes implementation couples the loop tightly to the AIAgent god object. RoboThree should ADAPT by separating the loop controller from agent state.

**Applicability Boundary**: Applies only to synchronous agent loops. RoboThree's async architecture would need an async variant.

**Risk**: Over-engineering the budget system before MVP is needed. Start simple.

**MVP Required**: Yes — the agent loop is fundamental.

---

## 2. Dual Message Lists (Session vs API-Time) — ADOPT

**Finding**: Hermes maintains `messages` (session-persisted) and `api_messages` (API-call-time with ephemeral injections) as separate lists (conversation_loop.py:637,838)

**RoboThree Modules**: `Context Engine`, `Session Manager`

**Conclusion**: ADOPT

**Source Evidence**:
- `agent/conversation_loop.py:637-638` — `messages` and `conversation_history` as session state
- `agent/conversation_loop.py:838-881` — `api_messages` built as a copy with injections
- `agent/conversation_loop.py:843-847` — explicit documentation of the separation

**Reason**: This is one of the cleanest patterns in Hermes. Separating what's persisted from what's injected at call time prevents:
- Memory/plugin context leaking into session storage
- System prompt cache invalidation
- Context pollution across turns

**Applicability Boundary**: Requires that the Context Engine knows which injections are ephemeral vs persistent.

**Risk**: Low. This is a data model decision, not a runtime behavior change.

**MVP Required**: Yes — this separation should be in the core data model from day one.

---

## 3. Multi-Layer Tool Blocking — ADOPT

**Finding**: Hermes blocks tool execution at three layers: scope → plugin → guardrail, all before `agent._invoke_tool()` (tool_executor.py:437-498)

**RoboThree Modules**: `Tool Runtime`, `Tool Permission`, `Plugin Engine`

**Conclusion**: ADOPT

**Source Evidence**:
- `agent/tool_executor.py:437-451` — Tool scope block
- `agent/tool_executor.py:454-466` — Plugin pre-tool block
- `agent/tool_executor.py:483-498` — Guardrail before_call

**Reason**: The layered approach allows different stakeholders to enforce different policies:
- Scope = session-level tool availability (admin/config controlled)
- Plugin = extensible business logic (developer controlled)
- Guardrail = safety policy (security controlled)

**Applicability Boundary**: Each layer needs a clear contract for what information it receives and what decision it can make.

**Risk**: Ordering matters — scope must run first to avoid leaking information about unavailable tools to plugins.

**MVP Required**: Yes — but scope + guardrail only; plugin blocking can be post-MVP.

---

## 4. Incremental Session Persistence Before Tool Execution — ADOPT

**Finding**: Session is flushed to DB before tool execution to survive crashes from destructive tools (conversation_loop.py:4966-4978)

**RoboThree Modules**: `Session Manager`, `Tool Runtime`

**Conclusion**: ADOPT

**Source Evidence**:
- `agent/conversation_loop.py:4967-4970` — explicit docstring about crash resilience
- `agent/conversation_loop.py:4971` — `agent._flush_messages_to_session_db(messages, conversation_history)`
- `agent/tool_executor.py:354` — same pattern in tool executor

**Reason**: Crash resilience is essential for an agent that executes arbitrary tools. Flushing before (not after) dangerous operations ensures the tool call is recorded even if the tool crashes the process.

**Applicability Boundary**: Only needed before tools with side effects. Read-only tools don't need pre-flush.

**Risk**: Performance cost of DB writes in the hot path. Mitigated by incremental flush (only new messages, not full session).

**MVP Required**: Yes.

---

## 5. Context Compression with Anti-Thrash Guards — ADAPT

**Finding**: Dual trigger points (pre-API + post-tool), anti-thrash cooldowns, and 3-attempt cap (conversation_loop.py:1068-1126, 5073-5082)

**RoboThree Modules**: `Context Engine`

**Conclusion**: ADAPT

**Source Evidence**:
- `agent/conversation_loop.py:1075-1082` — pre-API compression gate conditions
- `agent/conversation_loop.py:5073` — post-tool compression
- `agent/conversation_loop.py:1083-1126` — compression with iteration budget refund

**Reason**: The dual-trigger + cooldown pattern is good, but Hermes' implementation is tightly coupled to the `context_compressor` object on the AIAgent. RoboThree should ADAPT with a standalone `ContextCompressor` service.

**Applicability Boundary**: Compression decisions should be based on real token counts from the provider, not rough estimates. Hermes' fallback to rough estimates when `last_prompt_tokens == 0` (L5069-5071) is a pragmatic but imprecise pattern.

**Risk**: Over-compression loses critical context. The 3-attempt cap + cooldown guards are essential.

**MVP Required**: No — compression can be added post-MVP. MVP should focus on basic context assembly.

---

## 6. Hook-Based Plugin Architecture — ADOPT

**Finding**: Named hook points with typed context, `has_hook()` / `invoke_hook()` pattern (conversation_loop.py:1270-1322, tool_executor.py:454-466)

**RoboThree Modules**: `Plugin Engine`, `Context Engine`, `Tool Runtime`

**Conclusion**: ADOPT

**Source Evidence**:
- `agent/conversation_loop.py:1270-1273` — hook check and invocation
- `agent/conversation_loop.py:1297-1322` — hook context (task_id, turn_id, session_id, etc.)
- `agent/tool_executor.py:454-466` — pre_tool_block hook

**Reason**: Named hooks with well-defined context are the most proven extensibility pattern. The key design decisions:
1. Hooks are string-named (easy to discover)
2. Hook context is explicit (typed, documented)
3. Hooks can block (not just observe)
4. Hooks are optional (has_hook check before invocation)

**Applicability Boundary**: The hook set should be closed (not arbitrary strings) to enable static analysis and documentation.

**Risk**: Hook context inflation — too many fields passed to every hook.

**MVP Required**: Yes — extensibility should be designed in from the start, even if only 2-3 hooks are initially supported.

---

## 7. Provider Fallback Chain — ADAPT

**Finding**: Ordered fallback chain with rate limit awareness and automatic provider switching (conversation_loop.py:1174-1217, 1544-1552)

**RoboThree Modules**: `Agent Runtime` (Model Provider abstraction)

**Conclusion**: ADAPT

**Source Evidence**:
- `agent/conversation_loop.py:1544-1552` — `agent._try_activate_fallback()` with system prompt sync
- `agent/conversation_loop.py:1174-1217` — Nous Portal rate limit guard with fallback

**Reason**: Provider fallback is critical for reliability, but Hermes' implementation is provider-specific (hard-coded Nous Portal checks). RoboThree should ADAPT with a provider-agnostic fallback abstraction:
- Health check interface per provider
- Configurable fallback order
- Rate limit detection from response headers (not hard-coded)

**Applicability Boundary**: Fallback is only meaningful when multiple providers are configured.

**Risk**: Fallback can mask provider issues. Need observability into fallback frequency.

**MVP Required**: No — single provider is sufficient for MVP.

---

## 8. Skill Nudge Mechanism — ADAPT

**Finding**: Counters track iterations since last skill/memory usage, system nudges model when thresholds exceeded (conversation_loop.py:746-748, tool_executor.py:384-387)

**RoboThree Modules**: `Skill Engine`, `Memory Engine`

**Conclusion**: ADAPT

**Source Evidence**:
- `agent/conversation_loop.py:746-748` — skill nudge counter increment
- `agent/tool_executor.py:384-387` — counter reset on memory/skill tool use

**Reason**: The nudge pattern (track usage, prompt when stale) is useful for ensuring the model doesn't forget to use skills/memory. But it's a heuristic that may not work for all models.

**Applicability Boundary**: Only useful when skills/memory are available but not guaranteed to be used.

**Risk**: Nudge fatigue — the model may learn to ignore nudges. Needs A/B testing.

**MVP Required**: No — manual skill invocation is sufficient for MVP.

---

## 9. Concurrent Tool Execution — ADAPT

**Finding**: DaemonThreadPoolExecutor with max 8 workers, thread-local interrupt bits, ContextVar propagation (tool_executor.py:657-721)

**RoboThree Modules**: `Tool Runtime`

**Conclusion**: ADAPT

**Source Evidence**:
- `agent/tool_executor.py:682` — `DaemonThreadPoolExecutor(max_workers=max_workers)`
- `agent/tool_executor.py:691-693` — `propagate_context_to_thread(_run_tool)`
- `agent/tool_executor.py:73` — `_MAX_TOOL_WORKERS = 8`

**Reason**: Concurrent tool execution is essential for performance. But thread-based execution in the same process is weak isolation. RoboThree should ADAPT with:
- Async/await instead of threads (for I/O-bound tools)
- Process-based isolation for CPU-bound or risky tools
- Configurable max concurrency per tool type

**Applicability Boundary**: Concurrent execution is only beneficial when tools are independent.

**Risk**: Thread safety bugs in tool implementations. Hermes mitigates with ContextVar propagation and thread-locals.

**MVP Required**: No — sequential execution is sufficient for MVP.

---

## 10. Missing ChannelCapabilities Abstraction — REJECT (the absence)

**Finding**: Hermes handles platform differences (streaming, threading, late completion) per-adapter without a formal ChannelCapabilities model.

**RoboThree Modules**: `Gateway`

**Conclusion**: REJECT the absence — RoboThree SHOULD establish explicit `ChannelCapabilities`

**Source Evidence**: No formal capability abstraction found in analyzed code. Platform adapters in `gateway/` handle differences ad-hoc.

**Reason**: RoboThree should define `ChannelCapabilities` upfront:
```text
supports_streaming
supports_late_completion
supports_background_notification
supports_user_approval
supports_artifact_update
supports_interrupt
supports_threaded_reply
```

**Applicability Boundary**: Required whenever multiple gateway platforms are supported.

**Risk**: Low — adding a capability model is purely additive.

**MVP Required**: Yes — should be in the Gateway design from day one.

---

## 11. Worker Backend Abstraction — ADAPT

**Finding**: Six backends (local, docker, ssh, singularity, modal, daytona) share `BaseEnvironment` interface.

**RoboThree Modules**: `Local Worker`, `Cloud Worker`, `Remote Worker`

**Conclusion**: ADAPT

**Source Evidence**: `tools/environments/base.py` — `BaseEnvironment` abstract interface (inferred from directory structure and tool_executor.py imports)

**Reason**: The `BaseEnvironment` pattern is the right abstraction, but RoboThree's worker taxonomy (Local/Cloud/Remote) is different from Hermes' backend taxonomy (Docker/SSH/Modal/etc.). RoboThree should ADAPT the abstraction pattern while defining its own backend taxonomy.

**Applicability Boundary**: Each worker type needs different capability declarations (persistent filesystem, GPU, network egress, etc.).

**Risk**: Abstracting too early — start with Local Worker, add Cloud/Remote later.

**MVP Required**: Yes — Local Worker only.

---

## 12. God Object Anti-Pattern — REJECT

**Finding**: The `AIAgent` class holds all runtime state — messages, tools, session, budget, compressor, callbacks, interrupt state, spinners, and more.

**RoboThree Modules**: `Agent Runtime`

**Conclusion**: REJECT

**Source Evidence**: Inferred from the function signature pattern `run_conversation(agent, ...)` where `agent` carries all state.

**Reason**: The god object makes testing, modularity, and reasoning about state extremely difficult. RoboThree should use dependency injection with explicitly scoped state objects:
- `SessionState` — messages, history
- `ToolRegistry` — tools, schemas
- `BudgetTracker` — iteration count
- `ContextConfig` — compression settings

**Applicability Boundary**: Always. Even in MVP.

**Risk**: Over-engineering — but the alternative (god object) is worse.

**MVP Required**: Yes — architectural decision that's expensive to change later.

---

## Proposed RoboThree Changes

> These are candidate changes to RoboThree module boundaries, data models, or architectural decisions.  
> **None are automatically applied.** All require human review.

1. **Context Engine**: Adopt dual message list pattern (session vs API-time). Add `SessionMessages` and `ApiMessages` as distinct types.
2. **Tool Permission**: Adopt multi-layer blocking (scope → plugin → guardrail). Define `ToolBlockLayer` interface with clear ordering.
3. **Session Manager**: Adopt incremental persistence before destructive operations. Define `PreFlushPolicy` per tool category.
4. **Gateway**: Define explicit `ChannelCapabilities` model. Add `supports_streaming`, `supports_late_completion`, `supports_user_approval`, `supports_interrupt`, `supports_threaded_reply` as boolean flags.
5. **Plugin Engine**: Adopt hook-based architecture with named hooks, typed context, and `has_hook()`/`invoke_hook()` pattern.
6. **Agent Runtime**: REJECT god object pattern. Define separate state objects (`SessionState`, `ToolRegistry`, `BudgetTracker`, `ContextConfig`).
7. **Worker Runtime**: Adopt `BaseEnvironment` abstraction pattern. Start with Local Worker only.

## Requires Human Approval

> Items requiring explicit human decision before proceeding to RoboThree formal architecture.

| # | Decision | Default Status | Impact |
| --- | --- | --- | --- |
| 1 | Adopt dual message list pattern as core data model | `PENDING_HUMAN_DECISION` | Affects Context Engine, Session Manager, Memory Engine |
| 2 | Define `ChannelCapabilities` in Gateway design | `PENDING_HUMAN_DECISION` | Affects Gateway architecture |
| 3 | REJECT god object — enforce DI from day one | `PENDING_HUMAN_DECISION` | Affects entire Agent Runtime architecture |
| 4 | Multi-layer tool blocking as default permission model | `PENDING_HUMAN_DECISION` | Affects Tool Runtime, Tool Permission, Plugin Engine |
| 5 | Incremental persistence before destructive tool execution | `PENDING_HUMAN_DECISION` | Affects Session Manager, Tool Runtime |
| 6 | Hook-based plugin architecture as extensibility model | `PENDING_HUMAN_DECISION` | Affects Plugin Engine, Skill Engine |
| 7 | Start with Local Worker only; defer Cloud/Remote Worker | `PENDING_HUMAN_DECISION` | Affects Worker Runtime MVP scope |
