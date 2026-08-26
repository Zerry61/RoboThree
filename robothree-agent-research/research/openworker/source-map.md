# Source Map — OpenWorker

> All paths relative to repo root. Commit: `f96ad4c8e6865f0aec519681a3717b6bcdd81546`.

## 1. Top-Level Structure

```
openworker/
├── coworker/          # Python backend (agent engine, server, tools, connectors)
├── surfaces/gui/      # React + Tauri desktop app
├── stt/               # Rust speech-to-text sidecar
├── packaging/         # Installer builds (DMG, Windows)
├── docs/              # Design specs and decision logs
├── tests/             # Backend test suite
├── ui-mocks/          # UI mockups
└── pyproject.toml     # Python project config
```

## 2. Core Engine (`coworker/`)

### 2.1 Agent Loop

| File | Key Symbols | Role |
|------|-------------|------|
| `engine.py` | `TurnEngine`, `ApprovalOutcome`, `PermissionRequest`, `Approver` | **Core agent loop**: async event-driven, handles streaming, tool execution, permission gating, interrupt, retry, durable resume |
| `agent.py` | `build_engine()`, `build_code_engine()` | **Engine assembly**: wires Agent + Tools + Permissions + Memory + Skills → TurnEngine |
| `events.py` | `Event`, `EventType` | Event types for engine → UI stream |

### 2.2 Agent Definitions

| File | Key Symbols | Role |
|------|-------------|------|
| `agents/base.py` | `Agent`, `AgentContext` | Agent data class: name, system_prompt, needs_workspace, tool_factory, family, messaging, connectors |
| `agents/cowork.py` | `cowork_agent()`, `cowork_tool_factory()` | Cowork agent (knowledge-work, deliverable-oriented) |
| `agents/chat.py` | `chat_agent()` | Chat agent (no workspace, conversational) |
| `agents/code.py` | `code_agent()` | Code agent (git workspace, explorer subagents) |
| `agents/myhelper.py` | `myhelper_agent()` | Always-on helper agent |
| `agents/registry.py` | `get_agent()`, `list_agents()` | Agent registry (builtins + personas) |

### 2.3 Tool System

| File | Key Symbols | Role |
|------|-------------|------|
| `tools/registry.py` | `ToolRegistry`, `ToolSpec` | Tool registry wrapping aisuite `Tools` for schema generation |
| `tools/files.py` | — | File read/write tools |
| `tools/shell.py` | `LocalExecutor`, `execute_shell()` | Shell command execution with cwd binding |
| `tools/search.py` | — | Web search tool |
| `tools/todo.py` | `TodoList` | Task tracking |
| `tools/subagent.py` | `explorer_tools()` | Read-only explorer subagent tools |
| `tools/ask.py` | `ask_user_tool()` | Human-in-the-loop question tool |
| `tools/plan.py` | `propose_plan_tool()` | Plan proposal tool |
| `tools/directories.py` | `request_directory_tool()` | Directory grant request tool |

### 2.4 Permission System

| File | Key Symbols | Role |
|------|-------------|------|
| `permissions.py` | `PermissionEngine`, `Decision`, `Mode` | Permission evaluation: mode-based gating, path scoping, command allowlisting, task rules |
| `risk.py` | `RiskClass`, `classify()`, `is_consequential()` | Tool risk classification (READ, WRITE_LOCAL, EXEC, EXTERNAL) |
| `overrides.py` | `RiskOverrideStore` | User-local risk override resolver |

### 2.5 Model Providers

| File | Key Symbols | Role |
|------|-------------|------|
| `providers/base.py` | `ProviderClient`, `AssistantTurn`, `ToolCall` | Provider abstraction |
| `providers/openai_provider.py` | — | OpenAI provider |
| `providers/anthropic_provider.py` | — | Anthropic provider |
| `providers/gemini_provider.py` | — | Google Gemini provider |
| `providers/vertex_provider.py` | — | Vertex AI provider |
| `providers/bedrock_provider.py` | — | AWS Bedrock provider |
| `providers/router.py` | `ProviderRouter` | Model string → provider routing (`provider:` prefix) |
| `providers/matrix.py` | `MATRIX`, `model_labels()` | Curated model capability matrix |
| `providers/capabilities.py` | — | Per-model capability flags (vision, pdf, etc.) |
| `providers/errors.py` | `friendly_model_error()` | User-friendly error messages |

### 2.6 Server Layer

| File | Key Symbols | Role |
|------|-------------|------|
| `server/app.py` | `create_app()` | FastAPI app: REST + WS endpoints, CORS, auth, 50+ routes |
| `server/manager.py` | `SessionManager` | Session lifecycle, engine cache, MCP management, gateways, automations, inbox |
| `server/run.py` | `main()` | Server entry point (CLI args → uvicorn) |

### 2.7 Persona System

| File | Key Symbols | Role |
|------|-------------|------|
| `personas/manifest.py` | `PersonaManifest`, `parse_manifest()`, `load_manifest_file()` | Persona manifest: YAML frontmatter + markdown body → PersonaManifest |
| `personas/registry.py` | `PersonaRegistry` | Persona lifecycle: install, enable, disable, uninstall, list |
| `personas/loading.py` | — | Persona discovery from dirs |

### 2.8 Skill System

| File | Key Symbols | Role |
|------|-------------|------|
| `skills/base.py` | `Skill`, `SkillLoader`, `skill_catalog_text()`, `skill_tools()` | Skill loading: SKILL.md format, progressive disclosure (catalog at start, load on demand) |

### 2.9 MCP Integration

| File | Key Symbols | Role |
|------|-------------|------|
| `mcp/client.py` | `MCPManager`, `_Conn` | Async MCP client: stdio + streamable-http, per-server tasks |
| `mcp/config.py` | `MCPServerDef` | MCP server configuration |
| `mcp/tools.py` | `build_callables()`, `run_coroutine_threadsafe()` | MCP tool → aisuite callable bridging |
| `mcp/oauth.py` | `build_auth()` | MCP OAuth 2.0 support |

### 2.10 Memory

| File | Key Symbols | Role |
|------|-------------|------|
| `memory/base.py` | `MemoryItem`, `MemoryStore`, `Scope` | Memory abstraction |
| `memory/sqlite_store.py` | `SQLiteMemoryStore` | SQLite-backed memory store |
| `memory/tools.py` | `memory_tools()` | Memory CRUD tools for agents |

### 2.11 Automation

| File | Key Symbols | Role |
|------|-------------|------|
| `automation/scheduler.py` | `Scheduler` | Cron-based scheduler: catch-up, skip-on-overlap, spawned runs |
| `automation/models.py` | `ScheduledTask`, `TaskRun` | Automation data models |
| `automation/store.py` | `TaskStore` | SQLite task persistence |
| `automation/tools.py` | `scheduling_tools()` | Agent-facing scheduling tools |

### 2.12 Supporting Infrastructure

| File | Key Symbols | Role |
|------|-------------|------|
| `sessions.py` | `SessionRecord` | Session persistence record |
| `conversations.py` | `ConversationStore` | Conversation/session SQLite store |
| `inbox.py` | `InboxStore`, `InboxItem` | Cross-session human attention queue |
| `inbox_routing.py` | `InboxRouting` | Named inbox routing (Slack channels, etc.) |
| `connections.py` | `PersonaConnectionStore`, `SessionConnectionStore` | Per-persona/session connector hierarchy |
| `config.py` | `load_config()` | YAML config loading |
| `secrets.py` | `SecretStore`, `state_dir()` | Encrypted secret storage |
| `audit.py` | `AuditStore` | Tool call audit logging |
| `subscriptions.py` | `SubscriptionStore`, `ChannelBuffer` | Channel subscriptions |
| `unattended.py` | `UnattendedRegistry` | Unattended mode toggle |
| `selfwake.py` | `WakeStore`, `selfwake_tools()` | Self-wake/suspend tools |
| `catalog.py` | `CATALOG`, `expand()` | Vetted tool capability catalog |
| `mentions.py` | `MentionSessionStore` | Slack mention → session routing |
| `roots.py` | `RootDir`, `normalize_roots()` | Multi-root directory management |
| `workspace_trust.py` | `WorkspaceTrustStore` | Workspace trust model |

## 3. Frontend (`surfaces/gui/`)

### 3.1 Key Components (`src/components/`)

| Component | Role |
|-----------|------|
| `App.tsx` | Root app component |
| `Composer.tsx` | Message input + attachments |
| `Transcript.tsx` | Conversation transcript |
| `ApprovalCard.tsx` | Tool approval UI |
| `Sidebar.tsx` | Session sidebar |
| `PersonaView.tsx` | Persona detail/management |
| `InboxView.tsx` | Cross-session inbox |
| `ScheduledView.tsx` | Automation management |
| `SettingsView.tsx` | Settings panel |
| `IntegrationsView.tsx` | Connector management |

### 3.2 Key Infrastructure

| File | Role |
|------|------|
| `api.ts` | API client (REST + WS) |
| `types.ts` | TypeScript type definitions |
| `tauri.ts` | Tauri bridge |
| `streamGate.ts` | Streaming event handling |
| `itemsFromMessages.ts` | Message → UI item transformation |
