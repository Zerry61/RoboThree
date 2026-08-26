# Context Handling Comparison — 6 Agent Frameworks

> Cross-project comparison of context assembly, injection, persistence, compaction, and memory across all six researched agent projects.
> Analysis date: 2026-07-21

## Research Sources

| Project | Research Depth | Commit | Key Context Documents |
|---|---|---|---|
| **Hermes Agent** | Level 2 | `3d9be27` | [session-state-memory.md](../hermes-agent/session-state-memory.md), [architecture.md](../hermes-agent/architecture.md) §3 |
| **OpenHands SDK** | Level 2 | `4fe5656` | [context-system.md](../software-agent-sdk/context-system.md), [architecture.md](../software-agent-sdk/architecture.md) §2 |
| **OpenClaw** | Level 2 | `deccdb5` | [session-state-memory.md](../openclaw/session-state-memory.md), [architecture.md](../openclaw/architecture.md) §2.8 |
| **Grok-build** | Level 2 | `98c3b24` | [runtime-sequence.md](../grok-build/runtime-sequence.md), [architecture.md](../grok-build/architecture.md) |
| **Claude Code Best** | Level 3 | `feb76f11` | [architecture.md](../claude-code-best/architecture.md) §2 (Query Loop), [runtime-sequence.md](../claude-code-best/runtime-sequence.md) |
| **Pi Agent** | Level 3 | `c9715af` | [session-context-pipeline.md](../pi/session-context-pipeline.md), [architecture.md](../pi/architecture.md) §4 |

---

## 1. What Is "Context" — Six Different Answers

### 1.1 Definition Matrix

| Project | Core Abstraction | Data Structure | Single Source of Truth |
|---|---|---|---|
| **Hermes** | Dual message lists (persistent + API-time copy) | `messages: list[dict]` + `api_messages: list[dict]` | `AIAgent.messages` on the god object |
| **OpenHands** | Three-layer static/dynamic/per-turn | `EventLog` (file-backed, tree via `parent_id`) | EventLog file — `ConversationState.view` provides LLM-ready slice |
| **OpenClaw** | SessionKey-routed conversation + Memory Plugin | SQLite + Transcript (JSON→SQLite migration) | SQLite State DB |
| **Grok-build** | ChatStateActor memory state | `RefCell<HashMap<..>>` + `Mutex` (in-process) | Memory (ChatStateActor); SQLite journal is secondary |
| **Claude Code Best** | Frozen QueryConfig + 4 compaction strategies | `sessionStorage` + `saveCacheSafeParams` snapshot | QueryEngine state + `flushSessionStorage` |
| **Pi Agent** | Two-stage pipeline + tree JSONL session | Append-only JSONL (parentId tree + leaf pointer + compaction entries) | JSONL file — `buildSessionContext()` reconstructs from leaf→root walk |

### 1.2 Philosophical Stance

| Project | Treats Context As... | Key Design Principle |
|---|---|---|
| **Hermes** | A durable conversation log + a throwaway API payload | "Never mutate what's persisted for API call injection" |
| **OpenHands** | An event-sourced, cache-aware, forkable stream | "Static parts stay cached across sessions; dynamic parts are per-turn" |
| **OpenClaw** | A channel-scoped conversation + pluggable memory backends | "Memory is a Plugin; the core only knows about root memory files" |
| **Grok-build** | An opaque actor state (details buried in sampler internals) | "ChatStateActor owns the state; tools read via queries" |
| **Claude Code Best** | An immutable snapshot per turn + 4-layer compaction | "Freeze config at turn start; compact in layers; memory is fire-and-forget" |
| **Pi Agent** | A tree of typed messages + a two-stage transformation | "Tree for branching; linear for LLM; compaction IS a tree node" |

---

## 2. Context Assembly — How Messages Are Built Before the LLM Call

### 2.1 Assembly Pipeline Comparison

```
Hermes:
  messages (persisted)
    → copy to api_messages
    → inject memory prefetch (user message)
    → inject plugin pre_llm_call hooks (user message)
    → inject MoA aggregation
    → apply Anthropic cache_control markers
    → LLM call

OpenHands:
  EventLog (file)
    → State.view (incremental cache, rebuilt on condensation)
    → LLMConvertibleEvent.events_to_messages()
    → coalesce consecutive user messages
    → merge ActionEvents into single assistant message
    → LLM call

OpenClaw:
  SessionKey lookup → SQLite
    → root memory files auto-injected
    → active memory via memory.search() tool call (not auto)
    → Channel → MsgContext
    → auto-reply pipeline
    → LLM call

Grok-build:
  ChatStateActor.get_conversation()
    → sampler turn builds API request
    → ChatStateActor.get_sampling_config()
    → LLM call
    (exact injection points not documented)

Claude Code Best:
  QueryConfig (immutable, created at turn start)
    → fetchSystemPromptParts(...)
    → normalizeMessagesForAPI
    → getCoordinatorUserContext (if coordinator mode)
    → autoCompactIfNeeded + microcompactMessages
    → LLM call

Pi Agent:
  buildSessionContext()  ← leaf→root tree walk
    → Stage 1: transformContext(AgentMessage[] → AgentMessage[])
        prune / inject AGENTS.md+Skills / apply compaction / RAG
    → Stage 2: convertToLlm(AgentMessage[] → LLM Message[])
        filter UI-only types / map custom roles → user/assistant/tool
    → LLM call
```

### 2.2 Stage Count & Separation

| Project | Stages | Separation Clarity | Extensibility |
|---|---|---|---|
| **Hermes** | 1 (implicit in `api_messages` construction) | ❌ Mixed — injection, cache markers, MoA all in one code path | Plugin hooks only |
| **OpenHands** | 3 (static/dynamic/per-turn) | ✅ Clean — layers have explicit cache on/off markers | `system_prompt_filename` + `system_prompt_kwargs` escape hatches |
| **OpenClaw** | 1 (Context assembly in auto-reply) | ❌ Implicit — memory injection and channel logic intertwined | Plugin-based memory backends |
| **Grok-build** | 1 (sampler turn) | ❌ Opaque — not documented | None visible |
| **Claude Code Best** | 2 (fetch parts → normalize) | ⚠️ Implicit — normalization is coupled to `callModel` | Via `QueryDeps` DI (4 deps) |
| **Pi Agent** | **2 (explicit pipeline)** | ✅ **Cleanest** — Stage 1 (optional, message-level) and Stage 2 (required, format conversion) are **separate functions with explicit contracts** | `transformContext` is an extension hook; `convertToLlm` can be customized |

**[F]** Pi's two-stage pipeline is the only design where Stage 1 is **explicitly optional** — consumers can skip `transformContext` entirely for lightweight use cases. Evidence: `AgentLoopConfig` accepts `transformContext` as an optional callback; `convertToLlm` is required. ([session-context-pipeline.md](../pi/session-context-pipeline.md) §2.1-2.3)

---

## 3. Context Injection — Where Memory / Skills / Knowledge Enter the Stream

### 3.1 Injection Point Matrix

| Project | Memory Injection Point | Skill Injection Point | System Prompt Assembly |
|---|---|---|---|
| **Hermes** | **User message** (API-time copy, never persisted) | Tool nudge + skill_manage tool | `_cached_system_prompt` (session-stable) + `ephemeral_system_prompt` (per-turn) |
| **OpenHands** | Via `AgentContext.Skills` in dynamic context | Via `AgentContext.Skills` in dynamic context | Section Registry → `system_prompt` (static, cache ON) + `dynamic_context` (per-session, cache OFF) |
| **OpenClaw** | 3 paths: Root Memory (auto-inject) / Active Memory (tool call) / Session Memory (transcript) | File-system skills (54 directories) via skill filter | Per-plugin system prompt contribution |
| **Grok-build** | `xai-grok-memory` (unclear injection point) | Not documented | ChatStateActor.get_sampling_config() |
| **Claude Code Best** | `memdir` + `extractMemories` (Stop hook, fire-and-forget) + `autoDream` (Stop hook, fire-and-forget) | 3 sources: bundled (registry) / file-based (loadSkillsDir) / MCP-sourced (mcpSkillBuilders) | `fetchSystemPromptParts(...)` → assembled per turn |
| **Pi Agent** | Via `transformContext` Stage 1 (extension-controlled) | Via `transformContext` Stage 1 (extension injects `<available_skills>` block) | Via `AgentHarness.createTurnState()` → frozen per turn; extension `before_agent_start` can modify |

### 3.2 Injection Safety — Does Injection Leak Into Persistence?

| Project | Safe? | Mechanism |
|---|---|---|
| **Hermes** | ✅ **Yes** — injection only touches `api_messages`, never `messages` | Explicit copy at conversation_loop.py:838; comment at L843-847 confirms "API-call-time only — the original message in `messages` is never mutated" |
| **OpenHands** | ✅ Yes — injection via Events, not mutation | `SystemPromptEvent` + `dynamic_context` are separate from `EventLog` entries |
| **OpenClaw** | ⚠️ Partially — Root Memory is auto-injected into Context assembly | No explicit separation of "injected" vs "persisted" context |
| **Grok-build** | ❓ Unknown | Not documented |
| **Claude Code Best** | ✅ Yes — `QueryConfig` is immutable snapshot; `saveCacheSafeParams` captures only session metadata | `createCacheSafeParams(stopHookContext)` strips ephemeral state |
| **Pi Agent** | ✅ **Yes** — `transformContext` operates on a **copy** of `buildSessionContext()` output | Append-only JSONL is never mutated; pipeline produces transient arrays |

**[F]** Hermes and Pi both achieve injection safety through the same principle: **never mutate the persisted representation for API-call-time injection**. Hermes uses explicit copy (`messages` → `api_messages`); Pi uses pipeline stages that produce new arrays. ([hermes-agent/session-state-memory.md](../hermes-agent/session-state-memory.md) §2.1; [pi/session-context-pipeline.md](../pi/session-context-pipeline.md) §2.1)

---

## 4. Session Persistence & Recovery

### 4.1 Storage Format

| Project | Format | Append-Only? | Tree/Branch Support? | Crash-Safe? |
|---|---|---|---|---|
| **Hermes** | SQLite (dual-write: incremental flush + full persist) | ❌ Update-in-place | ❌ Linear | ⚠️ Transaction-dependent |
| **OpenHands** | EventLog file (lazy-load, sharded) | ✅ Append events | ✅ `parent_id` tree → `LocalConversation.fork()` | ✅ Event-level append |
| **OpenClaw** | SQLite (migrated from JSON) | ❌ Update-in-place | ❌ SessionKey grouping | ⚠️ Transaction-dependent |
| **Grok-build** | Memory (RefCell) + SQLite journal | ❌ Memory-primary | ❌ Linear; `StdioReplayState` replays ACP requests only | ❌ Memory state lost on crash |
| **Claude Code Best** | `sessionStorage` + `saveCacheSafeParams` | ⚠️ Snapshot-based | ❌ Linear; `--continue/--resume` for recovery | ⚠️ Snapshot saves are not per-event |
| **Pi Agent** | **Append-only JSONL** | ✅ **Append-only by construction** | ✅ **parentId tree + leaf pointer + 2 fork strategies** | ✅ **Any crash leaves a valid JSONL file** |

### 4.2 Fork / Branch / Time-Travel

| Project | Fork Support | Mechanism | Use Case |
|---|---|---|---|
| **Hermes** | ❌ None | — | — |
| **OpenHands** | ✅ `LocalConversation.fork()` | Copies `events.path_to_root()` to new branch | "Try a different approach from step N" |
| **OpenClaw** | ❌ None | — | — |
| **Grok-build** | ⚠️ `StdioReplayState` | Replays cached ACP requests (initialize + session/load) — **does not restore running tool calls** | Leader crash recovery only |
| **Claude Code Best** | ⚠️ `--continue <id>` / `--resume <id>` | `matchSessionMode()` + `saveCacheSafeParams` rehydration | Session resume after restart |
| **Pi Agent** | ✅ **Two strategies** | **(1) `navigateTree(entryId)`**: in-file branch — leaf pointer moves to entryId, new entries fork from there; **no data duplication**. **(2) `fork()`**: new JSONL file — copies root→fork point path; **two files diverge completely** | (1) "Go back to message 4 and try differently"; (2) "Start a completely separate exploration" |

**[F]** Pi is the only project with **two distinct fork strategies** covering both lightweight exploration (repoint the leaf) and heavy branching (independent file). Evidence: [pi/session-context-pipeline.md](../pi/session-context-pipeline.md) §1.3.

### 4.3 Session Reconstruction

| Project | Reconstruction Method | Complexity | Deterministic? |
|---|---|---|---|
| **Hermes** | Load `messages` from SQLite → replay into `api_messages` | O(n) per turn | ✅ Same DB state → same output |
| **OpenHands** | Load EventLog (lazy) → build `State.view` (incremental cache) | O(delta) after first build | ✅ Same EventLog → same view |
| **OpenClaw** | Load SQLite session entry → transcript events | O(n) per load | ✅ Same DB → same transcript |
| **Grok-build** | `ChatStateActor.get_conversation()` from memory | O(1) if cached | ❓ Memory state opaque |
| **Claude Code Best** | `saveCacheSafeParams` snapshot → rehydrate | O(1) from snapshot | ✅ Same snapshot → same state |
| **Pi Agent** | `buildSessionContext()`: leaf→root walk, O(depth); handle compaction entries inline | **O(depth)** per build; **cacheable** | ✅ Same JSONL tree → same linear array |

---

## 5. Context Window Management & Compaction

### 5.1 Compaction Strategy

| Project | Strategy | Trigger | Preventative or Reactive? | Known Issues |
|---|---|---|---|---|
| **Hermes** | Dual-trigger compression | Pre-API (pressure estimate) + Post-tool (actual token count) | ✅ **Preventative** | Max 3 attempts; cooldown on failure; anti-thrash guards |
| **OpenHands** | `LLMSummarizingCondenser` | `LLMContextWindowExceedError` | ❌ **Reactive** — only fires after overflow | Single condenser; no preventive check |
| **OpenClaw** | None explicit | — | ❌ | Context grows unboundedly |
| **Grok-build** | `xai-grok-sampler` (not deep-dived) | Unknown | ❓ | Listed as open question |
| **Claude Code Best** | **4 strategies**: autoCompact + microcompact + reactiveCompact + history-snip | autoCompact: near window threshold; microcompact: lightweight, always-on; reactiveCompact: triggered; history-snip: manual/boundary | ✅ **Multi-layer preventative** | Feature-gated complexity; 4 strategies hard to reason about |
| **Pi Agent** | **Compaction as tree entry** | Manual (`/compact`) or auto (token threshold) | ⚠️ **Design is preventative, implementation is reactive** | **#3660**: auto-compaction triggers AFTER overflow, not before; **#5512**: no mid-turn guard — long tool loops can exceed `contextWindow` |

**[F]** Pi's compaction design is architecturally elegant (compaction IS a tree node, appended atomically) but has known race conditions. Evidence: GitHub issues [#3660](https://github.com/earendil-works/pi/issues/3660) and [#5512](https://github.com/earendil-works/pi/issues/5512).

**[I]** The root cause of Pi's #3660 is that budget checking happens inside `transformContext` (Stage 1), but by the time the pipeline reaches Stage 1, the full context has already been reconstructed in `buildSessionContext()`. The fix should be a **Stage 0 token budget pre-check** before `buildSessionContext()` allocates memory for the full tree walk.

### 5.2 Compaction Data Model

| Project | Where Compaction Lives | Atomic with Session? | Branching-Aware? |
|---|---|---|---|
| **Hermes** | In-memory compression state on `AIAgent` | ❌ Separate from session persistence | ❌ |
| **OpenHands** | `CondensationRequest` event in EventLog | ✅ Part of EventLog | ✅ Different branches can have different condensation points |
| **Claude Code Best** | In-message transformation during `normalizeMessagesForAPI` | ❌ Ephemeral — not persisted | ❌ |
| **Pi Agent** | **Compaction entry IN the JSONL tree** | ✅ **Atomic** — compaction is just another `appendEntry()` call | ✅ **Different branches can have different compaction points** |

**[F]** Pi's compaction-as-tree-entry is the only approach where compaction and session persistence share the same atomicity guarantee. Evidence: compaction entry format `{id, parentId, type:"compaction", summary:"...", firstKeptEntryId:"m11"}` in the same JSONL stream. ([pi/session-context-pipeline.md](../pi/session-context-pipeline.md) §3.1)

---

## 6. Prompt Caching Strategy

| Project | Prompt Cache Approach | Static/Dynamic Split? | Cross-Session Sharing? |
|---|---|---|---|
| **Hermes** | System prompt cached via `_cached_system_prompt`; Anthropic `cache_control` markers applied at API time | ✅ Static prefix (system prompt) vs dynamic (ephemeral additions) | ⚠️ Per-session; no explicit cross-session cache key |
| **OpenHands** | **Static/Dynamic explicit split** with `prompt_cache_key` for cross-session sharing | ✅ **Best in class** — `system_prompt` (cache ON) + `dynamic_context` (cache OFF) + tool schemas as static | ✅ `LLMCallContext.prompt_cache_key`; child sessions can share parent's cache key |
| **OpenClaw** | None explicit | ❌ | ❌ |
| **Grok-build** | None documented | ❌ | ❌ |
| **Claude Code Best** | `saveCacheSafeParams` snapshot; `shouldShowCacheWarning`/`isCacheWarningEnabled` for quota exhaustion | ⚠️ Implicit — `QueryConfig` is frozen but not split into cache tiers | ⚠️ Per-query; `createCacheSafeParams` strips ephemeral state |
| **Pi Agent** | None explicit in core | ❌ Extension-controlled via `before_provider_request` hook | ❌ |

**[R] Recommendation for RoboThree**: ADOPT OpenHands' Static/Dynamic split + `prompt_cache_key` pattern. This is the only approach that enables cross-session prompt cache sharing, which directly reduces per-call token cost in a multi-user enterprise environment.

---

## 7. Memory Architecture — Long-Term Knowledge

### 7.1 Memory as Architectural Component

| Project | Memory Location | Retrieval Mechanism | Auto-Extraction? | Backend Pluggability |
|---|---|---|---|---|
| **Hermes** | `agent/memory_manager.py` + `memory_provider.py` | Prefetch → inject into user message (API-time) | ⚠️ `agent/curator.py` + `agent/learning_graph.py` (auto-generated skills) | MemoryProvider abstraction (details unclear) |
| **OpenHands** | Via `AgentContext.Skills` (not standalone memory) | Skills in dynamic context | ❌ | Via Section Registry |
| **OpenClaw** | **Plugin architecture**: Root Memory Files + Active Memory + Embedding Providers | 3 paths: auto-inject (Root) / tool-call (Active) / transcript (Session) | ❌ Manual curation | ✅ **Best pluggability** — Memory backends are Plugins; Embedding Providers are also Plugins |
| **Grok-build** | `xai-grok-memory` (undocumented) | Unknown | ❓ | Unknown |
| **Claude Code Best** | `memdir` + `extractMemories` (Stop hook) + `autoDream` (Stop hook) | Background fire-and-forget tasks; `nestedMemoryAttachmentTriggers` dedup | ✅ **Auto-extraction** via Stop hooks (fire-and-forget) | File-based `memdir`; no vector DB integration found |
| **Pi Agent** | None built-in — extensions implement memory | Via `transformContext` Stage 1 (extension injects) | ❌ Extension-controlled | ✅ Extension-controlled |

### 7.2 Memory Nudge / Proactive Recall

| Project | Nudge Mechanism | Evidence |
|---|---|---|
| **Hermes** | `_turns_since_memory` counter → nudge model to use memory tools after interval; `_should_review_memory` flag from `build_turn_context()` triggers background review | [session-state-memory.md](../hermes-agent/session-state-memory.md) §2.4 |
| **Claude Code Best** | `extractMemories` + `autoDream` in Stop hooks — fire-and-forget, no retry, no user notification on failure | [architecture.md](../claude-code-best/architecture.md) §2 (Query Loop), H18 |
| **Pi Agent** | None built-in | N/A |
| **Others** | None | N/A |

---

## 8. Message Type System — Internal vs LLM Format

### 8.1 Rich Internal Types vs LLM-Native Types

| Project | Internal Message Types | LLM Conversion | Custom Type Extension? |
|---|---|---|---|
| **Hermes** | `messages` (7+ roles: user, assistant, tool_result, system, plugin, memory, MoA) | Manual construction in `api_messages` assembly | Plugin hooks |
| **OpenHands** | `Event` subtypes (SystemPrompt, Message, Action, Observation, ...) | `LLMConvertibleEvent.events_to_messages()` — coalesces, merges, converts | Add Event subclass |
| **OpenClaw** | Channel-specific MsgContext | Auto-reply pipeline | Plugin-dependent |
| **Grok-build** | ChatStateActor internal messages | Sampler turn construction | Unknown |
| **Claude Code Best** | `messages` with `ToolUseBlock` extraction | `normalizeMessagesForAPI` | Via `ToolUseContext` 30+ fields |
| **Pi Agent** | `AgentMessage` (7+ roles via **TypeScript declaration merging**) | **`convertToLlm`**: filters UI-only types, maps custom roles → `user\|assistant\|tool` | ✅ **Declaration merging** — zero-runtime-cost type extension: `interface CustomAgentMessages { ... }` |

**[F]** Pi's declaration merging is a TypeScript-native, zero-runtime-cost mechanism for consumers to define custom message types without forking core types. Evidence: [pi/session-context-pipeline.md](../pi/session-context-pipeline.md) §2.4.

### 8.2 Conversion Complexity

| Project | Conversion Steps | Lossy? | Testable Independently? |
|---|---|---|---|
| **Hermes** | copy + inject + cache markers (all in one code path) | ❌ Injection-only; original messages preserved | ❌ Tightly coupled to loop |
| **OpenHands** | Event → LLMConvertibleEvent → messages (coalesce + merge) | ✅ Tool execution details lost in conversion | ✅ `events_to_messages()` is a pure function |
| **Pi Agent** | AgentMessage → transformContext → AgentMessage → convertToLlm → LLM Message | ✅ Custom types filtered out; tool call metadata normalized | ✅ **Both stages are independently testable pure functions** |

---

## 9. Dynamic Tool Visibility — Context Bloat Prevention

| Project | Mechanism | Granularity | Evidence |
|---|---|---|---|
| **Hermes** | Tool scope filtering via `_tool_search_scoped_names()` | Session-level toolset | [architecture.md](../hermes-agent/architecture.md) §4.2 |
| **OpenHands** | Tool schemas as static system prompt (always visible, but cache-shared) | Agent-config-level | [context-system.md](../software-agent-sdk/context-system.md) §4.2 |
| **Claude Code Best** | Tool whitelists: `ASYNC_AGENT_ALLOWED_TOOLS`, `COORDINATOR_MODE_ALLOWED_TOOLS`, `ALL_AGENT_DISALLOWED_TOOLS` | Agent-type-level | [runtime-sequence.md](../claude-code-best/runtime-sequence.md) §5.5 |
| **Pi Agent** | **Deferral pattern**: `registerTool` (always) + **`setActiveTools(names)`** (activate subset) | **Per-turn dynamic** — extensions can change active tools at turn boundaries | [extension-system.md](../pi/extension-system.md) §4.2 |

**[R]** Pi's deferral pattern is the only mechanism that allows **registering hundreds of tools while exposing only 5-10 to the LLM**, with dynamic activation at turn boundaries. This is critical for RoboThree's enterprise scenario where Tool Registry may contain 100+ enterprise tools (CRM, ERP, OA, MCP servers, etc.) but a single task typically needs only a handful.

---

## 10. Turn-Level Config Safety — Preventing Mid-Turn Mutation

| Project | Config Freeze? | Mechanism | What's Frozen |
|---|---|---|---|
| **Hermes** | ❌ | Config changes on `AIAgent` object take effect immediately | — |
| **OpenHands** | ⚠️ Partial | Agent is `frozen=True` Pydantic model → config CANNOT change after init; but `ConversationState` is mutable | Agent config only |
| **OpenClaw** | ❌ | Plugin-level | — |
| **Grok-build** | ❌ | `RefCell` mutations propagate immediately | — |
| **Claude Code Best** | ✅ **At query start** | `QueryConfig` is an immutable snapshot created at `query()` entry; tool discovery can refresh mid-session via `refreshTools?()` | model, tools, systemPrompt |
| **Pi Agent** | ✅ **Per turn** | **`AgentHarness.createTurnState()`** snapshots `model`/`tools`/`systemPrompt`/`resources`/`thinkingLevel` for the entire turn duration; config changes apply on the **next turn** | model, tools, systemPrompt, resources, thinkingLevel |

**[F]** Pi is the only project where config freezing is enforced at the **turn boundary** by a dedicated `createTurnState()` function in the production harness (L3). Claude Code Best achieves a similar effect via `QueryConfig` immutability but does not explicitly label it as a turn snapshot. Evidence: [pi/agent-loop-three-layer.md](../pi/agent-loop-three-layer.md) §1.3, §3.5.

---

## 11. Cross-Cutting Summary — Best in Class per Dimension

| Dimension | Best Project | Why |
|---|---|---|
| **Context pipeline clarity** | **Pi Agent** | Two explicit stages with clear contracts; Stage 1 is optional |
| **Static/Dynamic separation for cache** | **OpenHands** | `prompt_cache_key` + cross-session sharing + tool schemas as static |
| **Session persistence model** | **Pi Agent** | Append-only JSONL tree — crash-safe, forkable, human-readable, git-friendly |
| **Fork/branch/time-travel** | **Pi Agent** | Two fork strategies (in-file + new-file); OpenHands has only one (file copy) |
| **Injection safety** | **Hermes + Pi** (tie) | Both ensure injection never pollutes persisted state; Hermes via dual lists, Pi via pipeline copies |
| **Compaction** | **Claude Code Best** | 4 strategies (auto/micro/reactive/history-snip) — most comprehensive; but Pi's tree-embedded design is more elegant if bug-fixed |
| **Memory pluggability** | **OpenClaw** | Memory backends and embedding providers are both Plugins — most modular |
| **Auto-memory extraction** | **Claude Code Best** | `extractMemories` + `autoDream` in Stop hooks; though fire-and-forget with no retry |
| **Dynamic tool visibility** | **Pi Agent** | `setActiveTools()` deferral pattern — register hundreds, show handful |
| **Turn config safety** | **Pi Agent** | `createTurnState()` explicit per-turn snapshot — prevents mid-turn config races |
| **Prompt cache optimization** | **OpenHands** | Static/Dynamic explicit split with cross-session cache key sharing |
| **Message type extensibility** | **Pi Agent** | Declaration merging — zero-runtime-cost custom message types |

---

## 12. RoboThree Recommendations

### 12.1 ADOPT (Directly Copy the Pattern)

| # | Pattern | From | Rationale |
|---|---|---|---|
| 1 | **Two-stage context pipeline** | Pi | Cleanest separation of message-level transforms and LLM format conversion; Stage 1 is optional |
| 2 | **Append-only JSONL + parentId tree** | Pi | Crash-safe, forkable, auditable, git-friendly session persistence |
| 3 | **Static/Dynamic split with prompt_cache_key** | OpenHands | Enterprise cost reduction via cross-session prompt cache sharing |
| 4 | **Turn snapshots** | Pi | Prevents mid-turn config mutation bugs; low-cost implementation |
| 5 | **Deferral pattern (dynamic tool activation)** | Pi | Critical for enterprise 100+ tool scenarios |
| 6 | **Memory injection into user message, never system prompt** | Hermes | Prevents prompt cache fragmentation; memory is per-user, not per-model |
| 7 | **Dual message safety** (injection never pollutes persistence) | Hermes + Pi | Hermes' explicit copy pattern + Pi's pipeline-as-copy |

### 12.2 ADAPT (Modify Before Adopting)

| # | Pattern | From | Modification Needed |
|---|---|---|---|
| 1 | **Compaction as tree entry** | Pi | Fix #3660/#5512: add **Stage 0 token budget pre-check** before `buildSessionContext()`; add mid-turn context guard |
| 2 | **Three dispatch strategies** (Bail/Waterfall/F&F) | Pi | Add explicit ordering for Bail hooks (e.g., auth-gate before tool-logger) |
| 3 | **ToolUseContext explicit pass-through** | Claude Code Best | Reduce from 30+ fields; keep: `abortController`, `agentId`, `agentType`, `langfuseTrace`, `getAppState/setAppState` |
| 4 | **4 compaction strategies** | Claude Code Best | Reduce to 2 for MVP: microcompact (lightweight, always-on) + autoCompact (threshold-triggered) |

### 12.3 REJECT (Do Not Copy)

| # | Pattern | From | Reason |
|---|---|---|---|
| 1 | No explicit context pipeline (implicit in code path) | Hermes, Grok, OpenClaw | RoboThree needs explicit pipeline for audit and extension |
| 2 | Context assembly without static/dynamic split | OpenClaw, Grok, Pi | Enterprise cost control requires prompt cache optimization |
| 3 | Memory as fire-and-forget without retry | Claude Code Best | Enterprise memory extraction must be durable (persistent queue with retry) |
| 4 | Extension same-process loading (no sandbox) | Pi, Hermes | Enterprise security requires extension isolation |
| 5 | No built-in permissions | Pi, Grok | Enterprise compliance requires deny-by-default |

### 12.4 Proposed RoboThree Context Pipeline

```
Stage 0: Token Budget Pre-Check
  ├─ Estimate tokens BEFORE building context
  ├─ If approaching limit: trigger compaction BEFORE Stage 1
  └─ Output: budget decision (proceed / compact-first / hard-stop)

Stage A: buildSessionContext()
  ├─ Walk JSONL tree leaf→root
  ├─ Handle compaction entries inline
  └─ Output: AgentMessage[] (linear, from tree)

Stage 1: transformContext(AgentMessage[] → AgentMessage[])
  ├─ Extension hook: inject AGENTS.md, Skill descriptions
  ├─ Extension hook: prune old messages
  ├─ Extension hook: RAG query injection (enterprise knowledge)
  ├─ Extension hook: data classification tagging
  └─ Output: AgentMessage[] (enriched, pruned)

Stage 2: convertToLlm(AgentMessage[] → LLM Message[])
  ├─ Filter UI-only types
  ├─ Map custom roles → standard LLM roles
  ├─ Validate interleaving (user/assistant/tool alternation)
  └─ Output: Message[] (standard LLM format)

Per-Turn Safety:
  ├─ createTurnState(): snapshot model/tools/systemPrompt/resources
  ├─ Freeze for entire turn duration
  └─ Config changes take effect on next turn

Session Persistence:
  ├─ Append-only JSONL writes
  ├─ parentId tree + leaf pointer
  ├─ Compaction entries IN the tree (same atomicity)
  └─ Two fork strategies: navigateTree (in-file) + fork (new-file)
```

---

## 13. Evidence Quality

All conclusions are sourced from Level 2 or Level 3 research documents in `research/<project>/`. Each claim's evidence type ([F] FACT / [I] INFERENCE / [R] RECOMMENDATION) is marked inline. Cross-references to specific research files and line numbers are provided where available.

- **Hermes Agent**: Full read of `conversation_loop.py` (5,679 lines), `tool_executor.py` (1,801 lines), `tool_dispatch_helpers.py` (653 lines)
- **OpenHands SDK**: Full read of `architecture.md` (250+ lines with 30+ [F] evidence citations), `context-system.md` (136 lines)
- **OpenClaw**: Full read of `architecture.md` (261 lines), `session-state-memory.md` (117 lines)
- **Grok-build**: Full read of `architecture.md` (131 lines), `runtime-sequence.md` (157 lines with 21-hop evidence table)
- **Claude Code Best**: Full read of `architecture.md` (349 lines), `runtime-sequence.md` (345 lines with 33-hop evidence table)
- **Pi Agent**: Full read of `session-context-pipeline.md` (524 lines), `agent-loop-three-layer.md` (295 lines), `extension-system.md` (437 lines), `architecture.md` (324 lines)
