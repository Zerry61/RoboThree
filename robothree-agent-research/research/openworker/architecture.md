# Architecture — OpenWorker

> Commit: `f96ad4c8e6865f0aec519681a3717b6bcdd81546`

## 1. High-Level Architecture

OpenWorker is a **local-first desktop AI coworker** with three layers:

```text
┌──────────────────────────────────────────────────────┐
│  Desktop Shell (Tauri + React)                       │
│  Composer · Transcript · ApprovalCard · Inbox · …   │
├──────────────────────────────────────────────────────┤
│  Agent Server (Python FastAPI + WebSocket)           │
│  SessionManager · TurnEngine · InboxStore · …       │
├──────────────────────────────────────────────────────┤
│  Provider Layer (aisuite + custom providers)         │
│  OpenAI · Anthropic · Gemini · Ollama · Vertex · …  │
└──────────────────────────────────────────────────────┘
```

Communication: The React GUI communicates with the Python server via:
- **WebSocket** (`/ws/session/{session_id}`) — real-time engine events + user messages + approval responses
- **REST** (`/v1/*`) — session management, settings, connectors, automations, inbox

## 2. Core Architecture Patterns

### 2.1 TurnEngine — Async Event-Driven Agent Loop

The `TurnEngine` (`coworker/engine.py`) is the heart of the system. Key design decisions:

**Async with Thread-Offloading**: The loop is async, but blocking provider/tool calls run via `asyncio.to_thread()` so the event loop stays responsive. [F]

**Event Stream**: The engine yields `Event` objects that are broadcast to all WebSocket clients viewing the session. Events include `TURN_START`, `ASSISTANT_DELTA`, `TOOL_PROPOSED`, `PERMISSION_REQUIRED`, `TOOL_FINISHED`, `TURN_END`, etc. [F]

**Streaming with Interrupt**: Model streaming runs in a thread with an `asyncio.Queue` bridge. `request_interrupt()` sets an `asyncio.Event` checked at every chunk boundary, enabling clean mid-stream cancellation. [F]

**Tool Execution Model**:
- Low-risk tools (reads, searches) execute **concurrently** via `asyncio.gather`
- High-risk tools (writes, shell) execute **sequentially** in call order
- Interrupted calls still get a tool-error result — no orphaned tool_calls in history [F]

**Durable Resume**: When a turn is suspended at a prompt (approval/question) and the server restarts, `resume()` reconstructs unanswered tool_calls from the persisted thread and re-processes them. [F]

### 2.2 Permission Engine — Multi-Mode Gating

`PermissionEngine` (`coworker/permissions.py`) implements 5 modes:

| Mode | Behavior |
|------|----------|
| `DISCUSS` | Read-only conversation (no edits, no planning) |
| `PLAN` | Read-only + proposes plans via `propose_plan` tool |
| `INTERACTIVE` (default) | Auto-allow reads, ask on writes/commands |
| `AUTO` | Full access (path-scoped) |
| `CUSTOM` | Interactive + auto-allow configured tools |

Risk classification (`coworker/risk.py`): `READ` → `WRITE_LOCAL` → `EXEC` → `EXTERNAL`. Each tool is classified, and `is_consequential()` gates the approval path. [F]

Key Permission features:
- **Path scoping**: Writes must land under a writable root directory [F]
- **Command allowlisting**: Shell commands matched by `shlex` token prefix, shell operators rejected [F]
- **Task-scoped standing rules**: Automation tasks can auto-allow specific tool→target pairs [F]
- **Session-scoped grants**: "Always allow" approvals persist per-session [F]

### 2.3 Inbox — Human Attention as a Queue

`InboxStore` (`coworker/inbox.py`) is a cross-session queue of items requiring human attention:

- **Item types**: Approvals, Questions, Directory Grants, Plan Proposals
- **Visibility**: `VIS_INLINE` (session-scoped, attended) or `VIS_INBOX` (cross-session, unattended)
- **Resolution surfaces**: Live WS, REST API, Slack channel buttons, bound inbox routing
- **Durability**: Items survive server restarts (JSON-persisted); `durable_resume` rebuilds the engine from saved thread when a resolved item's session isn't in memory [F]
- **Mirroring**: Unattended items can mirror to a bound Slack channel as interactive buttons [F]

### 2.4 Persona System — Composable Agent Behaviors

Personas are defined as **YAML frontmatter + markdown body** (same format as SKILL.md but with structured capability declarations):

```yaml
---
id: my-persona
name: My Persona
family: knowledge          # code | knowledge
tools: [files, search, shell, todo]  # from vetted catalog
connectors: true
messaging: true
default_permission_mode: interactive
recommends:
  - connector: github
    reason: "Read/write code"
    tier: core
---
(System prompt body)
```

Key design:
- **Vetted catalog**: Tools are declared by ID, validated against `CATALOG` (`coworker/catalog.py`) [F]
- **Connector hierarchy**: Persona defaults → session overrides → effective set. Connectors are gated at both inbound (message delivery) and outbound (tool exposure) [F]
- **Third-party install**: From Git URL, local dir, or cloud gallery. Land disabled pending user consent [F]

### 2.5 Skill System — Progressive Disclosure

Skills follow Anthropic's SKILL.md format with progressive disclosure:

1. **At session start**: Only the catalog (name + description) is injected into instructions
2. **On demand**: Agent calls `load_skill(name)` to get full instructions + resources path

This prevents context bloat while keeping specialized capabilities available. [F]

### 2.6 MCP Integration

`MCPManager` (`coworker/mcp/client.py`) provides:

- **Transport**: stdio (subprocess) and streamable-http
- **Lifecycle**: Per-server async tasks with dedicated `ClientSession`
- **OAuth**: Browser-based OAuth flow for MCP servers (`mcp/oauth.py`)
- **Connector-backed MCP**: Some connectors expose MCP servers; tools are gated through the same connector hierarchy [F]
- **Per-tool approval**: Connector-backed MCP tools get per-tool `requires_approval` from a pinned read/write classification [F]

### 2.7 Memory System

Simple SQLite-backed memory (`coworker/memory/`):

- **Scopes**: `GLOBAL`, `WORKSPACE`, `SESSION`
- **CRUD tools**: `remember`, `memory_update`, `memory_forget` exposed to agents
- **Injection**: At engine build, memories are formatted and injected into system instructions
- **Guidance**: Memory guidance text instructs the model on what/when to remember [F]

### 2.8 Automation Scheduler

`Scheduler` (`coworker/automation/scheduler.py`):

- **Tick-based**: 30-second cron evaluation loop
- **Catch-up**: Missed runs fire once on startup
- **Skip-on-overlap**: Doesn't stack runs if previous is still active
- **Spawned execution**: Each run is an independent asyncio task — a blocked run never stalls the scheduler [F]
- **Self-wake**: Agents can suspend themselves and schedule resumption via `selfwake_tools`

### 2.9 Session & Conversation Persistence

`ConversationStore` (`coworker/conversations.py`) uses SQLite for sessions. Each session record contains the full message thread, grants, mode, model, and metadata. Sessions survive server restarts. [F]

## 3. Permission & Security Summary

| Concern | Implementation | Evidence |
|---------|---------------|----------|
| **Path scoping** | Writes must be under writable roots; `_under_writable_root()` checks per call | `permissions.py:204-213` |
| **Command safety** | Shell operators rejected; shlex prefix matching for allowlist | `permissions.py:216-238` |
| **Origin gating** | WebSocket CORS: only `tauri://localhost`, `localhost`, `127.0.0.1` origins allowed | `app.py:32-37` |
| **Sidecar auth** | `X-OpenWorker-Token` header required for REST; WS subprotocol for WebSocket | `app.py:190-206` |
| **Secret storage** | `SecretStore` with 0600 permissions | `secrets.py` |
| **Workspace trust** | Per-workspace command allowlisting; untrusted workspaces require explicit trust | `workspace_trust.py`, `permissions.py` |
| **Privacy filters** | Gmail results can be filtered; agent sees omissions, user sees counts | `engine.py:_record_result()` |
| **Connector isolation** | Per-session/per-persona connector hierarchy gates tool exposure | `connections.py` |
