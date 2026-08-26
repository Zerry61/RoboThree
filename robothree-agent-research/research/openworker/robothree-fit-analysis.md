# RoboThree Fit Analysis — OpenWorker

> Commit: `f96ad4c8e6865f0aec519681a3717b6bcdd81546`
> Analysis: L3 Deep Dive on TurnEngine + Inbox HITL + Persona/Skill/MCP

## 1. ADOPT / ADAPT / DEFER / REJECT / NEEDS_MORE_EVIDENCE

### 1.1 ADOPT — Directly Applicable Patterns

#### A1. Inbox-based Human-in-the-Loop

**What**: Durable, surface-agnostic approval queue where tool calls suspend at a prompt, park as inbox items, and can be resolved from WS, REST, or messaging channels. Survives server restarts via `durable_resume`.

**Why ADOPT**: This is a novel and proven pattern for agent-human interaction that decouples the human attention loop from the agent execution loop. It enables multi-surface interaction (desktop, mobile via Slack, API) without coupling the approval mechanism to any specific UI.

**Evidence**: `coworker/inbox.py`, `coworker/engine.py:250-292`, `coworker/server/app.py:1478-1653`

**Applicable to RoboThree modules**: Agent Runtime, Human-in-the-Loop Gateway

**Risk**: Adds complexity to the turn lifecycle; requires careful idempotency design for `durable_resume`

**MVP need**: High — the Inbox pattern enables the core "ask before acting" behavior that distinguishes RoboThree as a coworker, not a chatbot

#### A2. Risk-Based Tool Classification + Multi-Mode Permission Gating

**What**: Every tool classified as READ / WRITE_LOCAL / EXEC / EXTERNAL; permission engine evaluates based on mode (Discuss/Plan/Interactive/Auto) + risk level + path scoping + command allowlisting.

**Why ADOPT**: This is a clean, composable permission model that scales from read-only exploration to full automation. The risk classification is metadata-driven and overridable per-user.

**Evidence**: `coworker/permissions.py`, `coworker/risk.py`

**Applicable to RoboThree modules**: Tool Runtime, Permission & Security

**Risk**: Need to maintain accurate tool classifications as new tools are added

**MVP need**: High — permission gating is fundamental to the trust model

#### A3. Catalog-Based Capability Composition

**What**: Tools are registered in a vetted `CATALOG`; personas declare capabilities by referencing catalog IDs. Unknown IDs fail loudly at manifest parse time.

**Why ADOPT**: Prevents persona manifests from silently referencing nonexistent capabilities; provides a single source of truth for available tools.

**Evidence**: `coworker/catalog.py`, `coworker/personas/manifest.py:246-255`

**Applicable to RoboThree modules**: Skill Framework, Agent Definition

**Risk**: Catalog must stay in sync with actual tool implementations

**MVP need**: Medium — useful for persona/skill validation but can start with simpler validation

### 1.2 ADAPT — Good Pattern, Needs Modification

#### B1. TurnEngine — Async Event-Driven Loop with Thread-Offloading

**What**: Async agent loop that offloads blocking provider/tool calls to threads; event-driven output for UI consumption; interrupt handling at every stage.

**Why ADAPT**: The basic pattern (async loop + thread offloading + event streaming) is sound, but the specific implementation is tightly coupled to aisuite's provider abstraction and a Python-specific asyncio model.

**Adaptation for RoboThree**:
- Replace aisuite dependency with RoboThree's own Provider abstraction
- Consider whether RoboThree needs Python asyncio or a different concurrency model
- Keep the interrupt-everywhere pattern and "no orphan tool calls" guarantee
- Keep the parallel-safe / serial tool execution split

**Evidence**: `coworker/engine.py:52-388`

**Applicable to RoboThree modules**: Agent Runtime (Core Loop)

**Risk**: Thread-offloading model may not translate to other languages/runtimes

**MVP need**: High — the agent loop IS the product

#### B2. Persona Manifest Format (YAML Frontmatter + Markdown)

**What**: Persona = YAML frontmatter (structured capability declaration) + markdown body (system prompt). Same format as SKILL.md but with richer fields.

**Why ADAPT**: The dual-format approach (machine-readable frontmatter + human-readable body) is excellent, but RoboThree may want to extend the capability declaration language beyond simple tool lists.

**Adaptation for RoboThree**:
- Extend frontmatter with RoboThree-specific fields (e.g., memory scopes, allowed MCP servers)
- Consider whether `recommends` (connector/MCP suggestions) is needed for MVP
- The "land disabled pending consent" model for third-party personas is required

**Evidence**: `coworker/personas/manifest.py`

**Applicable to RoboThree modules**: Agent Definition, Skill Framework

**Risk**: YAML frontmatter parsing needs robust error handling for third-party content

**MVP need**: Medium — persona format is important but can iterate

#### B3. Progressive Disclosure for Skills

**What**: Skills inject only name+description at session start; full instructions loaded on demand via `load_skill` tool.

**Why ADAPT**: This is a proven context-engineering pattern. RoboThree should adopt the principle but adapt the specific mechanism to its own skill loading architecture.

**Adaptation for RoboThree**:
- Consider whether "catalog at start" works for RoboThree's context budget
- The `load_skill` tool pattern is reusable as-is
- Consider whether skills should carry their own tool declarations or inherit from the parent agent

**Evidence**: `coworker/skills/base.py`

**Applicable to RoboThree modules**: Skill Framework, Context System

**Risk**: Catalog injection may not be appropriate if RoboThree has many more skills

**MVP need**: Medium — progressive disclosure matters more at scale

### 1.3 DEFER — Good But Not Yet

#### C1. Automation Scheduler with Self-Wake

**What**: Cron-based scheduler with catch-up, skip-on-overlap, and agent self-wake capabilities.

**Why DEFER**: Scheduled automations are a power-user feature. The architecture is sound, but it requires the full TurnEngine + Inbox infrastructure to work correctly (automated runs need approval handling). Defer to post-MVP.

**Evidence**: `coworker/automation/scheduler.py`, `coworker/selfwake.py`

#### C2. Multi-Root Workspace with Directory Granting

**What**: Sessions can have multiple writable roots; agents can request additional folders via `request_directory` tool.

**Why DEFER**: Multi-root is useful for "orphan" knowledge-work sessions but adds complexity to path scoping. MVP can start with single workspace.

**Evidence**: `coworker/roots.py`, `coworker/tools/directories.py`

#### C3. Managed Connector OAuth Relay

**What**: Cloud service brokers OAuth handshakes for 25+ third-party connectors.

**Why DEFER**: This is a product feature (not an architecture pattern) and depends on OpenWorker's cloud infrastructure. RoboThree would need its own connector strategy.

**Evidence**: `coworker/connectors/`, `coworker/cloud.py`

### 1.4 REJECT — Not Suitable

#### D1. aisuite as Provider Abstraction

**What**: OpenWorker's engine is built on aisuite, a specific Python library.

**Why REJECT**: RoboThree should define its own provider abstraction rather than coupling to aisuite. The pattern (unified chat-completions API) is what matters, not the specific library.

**Evidence**: `pyproject.toml` (aisuite dependency pin)

#### D2. Desktop-Only Deployment Model

**What**: OpenWorker runs as a local Tauri desktop app with a Python sidecar server.

**Why REJECT**: RoboThree's deployment model is still being defined, but a desktop-only model limits flexibility. The client-server architecture pattern (separate GUI from agent server) is useful, but the Tauri+Python stack is specific to OpenWorker's desktop focus.

**Evidence**: `surfaces/gui/src-tauri/`, packaging scripts

### 1.5 NEEDS_MORE_EVIDENCE

#### E1. Memory System Design

**What**: Simple SQLite-backed key-value memory with GLOBAL/WORKSPACE/SESSION scopes.

**Status**: The current memory system is minimal. It's unclear whether this is intentionally simple or just early-stage. RoboThree's memory requirements may differ significantly (vector DB, semantic search, knowledge graphs).

**How to close**: Study memory systems in other agent frameworks (LangGraph, CrewAI) and define RoboThree's memory requirements before deciding.

#### E2. Explorer Subagent Model

**What**: Code-family agents can fan out research to read-only explorer subagents.

**Status**: The subagent code exists (`coworker/tools/subagent.py`) but is lightweight. The architecture for subagent isolation, context sharing, and result aggregation needs more investigation.

**How to close**: Study subagent architectures in other frameworks (Daytona, Goose) before deciding on RoboThree's subagent model.

#### E3. MCP Client Architecture

**What**: OpenWorker's MCPManager uses per-server async tasks with shutdown events.

**Status**: The pattern works but is tightly coupled to Python's asyncio. RoboThree's MCP integration strategy depends on its runtime language and deployment model.

**How to close**: Define RoboThree's runtime before finalizing MCP client architecture.

## 2. Proposed RoboThree Changes

> These are candidate changes that would affect RoboThree's module boundaries, proposed based on OpenWorker research findings. **None are automatically applied.**

| # | Proposed Change | Affected Module | Priority |
|---|----------------|-----------------|----------|
| 1 | Adopt Inbox-based HITL pattern: decouple human attention from agent loop with a durable, surface-agnostic approval queue | Agent Runtime, HITL Gateway | P0 |
| 2 | Adopt risk-based tool classification (READ/WRITE/EXEC/EXTERNAL) with multi-mode permission gating | Tool Runtime, Permission | P0 |
| 3 | Define a vetted tool capability catalog that personas/skills reference by ID | Skill Framework, Agent Definition | P1 |
| 4 | Design TurnEngine with interrupt-everywhere guarantee (no orphaned tool calls) | Agent Runtime (Core Loop) | P0 |
| 5 | Adopt progressive disclosure for skills: catalog at session start, full body on demand | Skill Framework, Context System | P2 |
| 6 | Implement persona manifests as structured frontmatter + markdown body | Agent Definition | P1 |

## 3. Requires Human Approval

> Items that need explicit user decision before any RoboThree architecture change.

| # | Decision | Options | Status |
|---|----------|---------|--------|
| 1 | Should RoboThree adopt the Inbox-based HITL pattern as its primary approval mechanism? | ADOPT / ADAPT to different queue backend / DEFER | `PENDING_HUMAN_DECISION` |
| 2 | Should RoboThree use the same risk classification scheme (READ/WRITE_LOCAL/EXEC/EXTERNAL)? | ADOPT as-is / Extend with additional classes / Use different taxonomy | `PENDING_HUMAN_DECISION` |
| 3 | Should the TurnEngine's async+thread-offloading model be the basis for RoboThree's agent loop? | ADAPT / Design from scratch / Use different concurrency model | `PENDING_HUMAN_DECISION` |
| 4 | Should RoboThree adopt the persona manifest format (YAML frontmatter + markdown)? | ADOPT / Extend format / Use different format (TOML, JSON, etc.) | `PENDING_HUMAN_DECISION` |
