# Open Questions — OpenWorker

> Commit: `f96ad4c8e6865f0aec519681a3717b6bcdd81546`

## 1. Architecture-Level Questions

### Q1: Provider Streaming Thread Safety
**Question**: The `_astream()` method runs the provider's blocking stream generator in a thread (`loop.run_in_executor(None, produce)`) and bridges results via `asyncio.Queue` with `call_soon_threadsafe`. Is there any risk of queue overflow if the consumer is slower than the producer?

**Status**: UNKNOWN
**How to Close**: Profile under high-throughput streaming (e.g., long reasoning traces) or add backpressure to the producer when queue size exceeds threshold.
**Evidence**: `engine.py:390-437` (no explicit backpressure)

### Q2: Durable Resume Atomicity
**Question**: When `durable_resume()` rebuilds an engine and re-processes unanswered tool_calls, what happens if the resolved Inbox item's `tool_call_id` doesn't match any call in the persisted thread (e.g., due to concurrent resolution from two surfaces)?

**Status**: UNKNOWN
**How to Close**: Test concurrent resolution scenarios; review `_unanswered_trailing_tool_calls()` for edge cases.
**Evidence**: `engine.py:268-292` (seems robust for normal cases, but concurrent resolution path unclear)

### Q3: Memory System Evolution Path
**Question**: The current memory system is a simple SQLite key-value store. What is the planned evolution path — vector embeddings, semantic search, knowledge graphs?

**Status**: UNKNOWN
**How to Close**: Monitor OpenWorker issues/PRs for memory-related changes; review aisuite's memory roadmap.
**Evidence**: `coworker/memory/sqlite_store.py` (minimal implementation)

### Q4: Explorer Subagent Isolation
**Question**: Explorer subagents (`coworker/tools/subagent.py`) are described as "read-only". What isolation guarantees exist? Are they truly sandboxed or just convention-enforced?

**Status**: UNKNOWN
**How to Close**: Read `coworker/tools/subagent.py` in full; test subagent behavior with write attempts.
**Evidence**: `agent.py:217-224` (creates explorer tools with `workspace`, `provider`, `model` — unclear if a separate PermissionEngine is created)

## 2. Design Decision Questions

### Q5: Why Python for the Agent Server?
**Question**: OpenWorker chose Python (FastAPI + asyncio) for the agent server while the desktop shell is Rust+Tauri. Was this purely for aisuite compatibility, or are there other constraints?

**Status**: INFERENCE — likely aisuite compatibility (aisuite is Python) + rapid development speed.
**How to Close**: Check `docs/` design specs or early commit messages.
**Evidence**: `pyproject.toml` (aisuite dependency); `surfaces/gui/src-tauri/` (Rust shell)

### Q6: Why JSON Files for Inbox/Prefs Instead of SQLite?
**Question**: Conversations, memory, and automations use SQLite, but the Inbox and user prefs use JSON files. Is there a consistency reason?

**Status**: INFERENCE — Inbox items are ephemeral (resolved items are deleted), and prefs are read-heavy with infrequent writes. JSON is simpler for these patterns.
**How to Close**: Check `docs/` for storage strategy decisions.
**Evidence**: `manager.py:125-231` (mixed storage: SQLite for sessions/memory/audit/automations, JSON for inbox/prefs/subscriptions)

### Q7: Why Require Workspace Trust for Shell Commands?
**Question**: Workspace trust is required before command allowlisting takes effect. What user experience considerations drove this design?

**Status**: INFERENCE — prevents "clone and run" attacks where a malicious repo's `.coworker/config.yaml` would auto-allow dangerous commands.
**How to Close**: Review `docs/` UX decision logs or related GitHub issues.
**Evidence**: `workspace_trust.py`, `manager.py:257-278`

## 3. Missing Artifacts

### Q8: No Formal ADR Directory
**Question**: OpenWorker has `docs/` with "design specs and decision logs" but no formal ADR (Architecture Decision Record) directory. Where are significant architecture decisions documented?

**Status**: UNKNOWN
**How to Close**: Explore `docs/` directory contents.
**Evidence**: README mentions `docs/` but directory contents not explored in this research.

### Q9: No Public Test Coverage for Inbox Durability
**Question**: Are there tests for the `durable_resume` flow (server restart mid-turn → resume)?

**Status**: UNKNOWN
**How to Close**: Search `tests/` for resume/durable/inbox-related tests.
**Evidence**: Test directory not explored in this research (out of scope for static analysis focus).

## 4. RoboThree-Relevant Unknowns

### Q10: Does the Inbox Pattern Scale to Multi-User?
**Question**: OpenWorker's Inbox is single-user (one desktop app = one human). Can the same pattern scale to multi-user scenarios where different humans have different approval scopes?

**Status**: UNKNOWN
**How to Close**: Design RoboThree-specific multi-user extensions to the Inbox pattern.
**Relevance**: High — RoboThree may need multi-user collaboration features.

### Q11: What is the Cold-Start Latency of MCP Tool Loading?
**Question**: `prepare_mcp_tools()` connects all enabled MCP servers before building the engine. What's the latency impact when many MCP servers are configured?

**Status**: UNKNOWN
**How to Close**: Benchmark MCP connection time with varying server counts.
**Relevance**: Medium — affects RoboThree's session startup time.
**Evidence**: `manager.py:861-944` (sequential connection of all enabled servers)
