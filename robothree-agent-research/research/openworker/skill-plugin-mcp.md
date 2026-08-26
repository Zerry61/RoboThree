# Skill / Plugin / MCP — OpenWorker (L3 Deep Dive)

> Commit: `f96ad4c8e6865f0aec519681a3717b6bcdd81546`
> Focus Mechanism #3: **Persona + Skill Progressive Disclosure + MCP Integration**

## 1. Persona System

### 1.1 Architecture

OpenWorker's persona system treats agent behaviors as **declarative manifests**:

```text
PersonaManifest (YAML frontmatter + markdown body)
├── id, name, icon, tagline, description
├── family: "code" | "knowledge"
├── tools: [capability ids from vetted catalog]
├── connectors: bool           # expose connector tools?
├── messaging: bool            # expose send_message?
├── default_permission_mode: "discuss" | "plan" | "interactive" | "custom" | "auto"
├── recommended_models: [model strings]
├── skills: [skill names]      # pre-loaded skills
├── mcp: [MCP server names]    # required MCP servers
├── recommends: [{connector|mcp, reason, tier}]
└── system_prompt: str (markdown body)
```

[F: `personas/manifest.py:47-70`]

### 1.2 Manifest → Agent Materialization

`PersonaManifest.to_agent()` converts a manifest to a runtime `Agent`:

```python
def to_agent(self):
    tool_ids = list(self.tools)
    factory = (lambda ctx: expand(tool_ids, ctx)) if tool_ids else None
    return Agent(
        name=self.id, title=self.name,
        system_prompt=self.system_prompt,
        needs_workspace=self.needs_workspace,
        tool_factory=factory,
        family=self.family, messaging=self.messaging, connectors=self.connectors,
    )
```

Tools are expanded from the vetted `CATALOG` via `expand()`. Unknown tools fail loudly at parse time. [F: `manifest.py:76-92, 246-255`]

### 1.3 Persona Lifecycle

`PersonaRegistry` (`personas/registry.py`) manages:

| Operation | Behavior |
|-----------|----------|
| **Install** (Git/dir/gallery) | Parse manifest → validate → store snapshot → land DISABLED |
| **Enable** | Flip enabled flag; installs persona as agent in registry |
| **Disable** | Flip enabled flag; archives all its non-internal sessions |
| **Uninstall** | Remove snapshot + lifecycle state (builtins can't be uninstalled) |
| **Set surfaced** | Show/hide in sidebar |

Third-party personas always land **disabled** pending user consent — a trust-by-default model. [F: `app.py:418-465`]

### 1.4 Connector Hierarchy

A three-layer hierarchy gates connector tool exposure:

```text
Layer 1: Account-connected     → connector_list(secrets) filtered by "connected" AND "enabled"
Layer 2: Persona defaults      → persona_connections.json (seeded from manifest recommends)
Layer 3: Session overrides     → session_connections.json (user can mute a connector per-session)
         ↓
Effective set                  → intersection gates both inbound delivery AND engine tools
```

`effective_connectors()` computes the resolved set. A muted connector is gated at both inbound (message delivery) and outbound (tool exposure) — they can never disagree. [F: `manager.py:512-541`]

## 2. Skill System — Progressive Disclosure

### 2.1 SKILL.md Format

Skills follow Anthropic's SKILL.md format with YAML frontmatter:

```yaml
---
name: my-skill
description: What this skill does
allowed-tools: read_file, write_file
---
(Full instructions body)
```

Skills live in:
- `~/.config/coworker/skills/` (global, user-installed)
- `<workspace>/.coworker/skills/` (per-project)

[F: `skills/base.py:56-81`]

### 2.2 Progressive Disclosure Strategy

**Phase 1 — Catalog Injection** (at session start):
```python
catalog = skill_catalog_text(skill_loader)
if catalog:
    instructions = f"{instructions}\n\n{catalog}"
# Result: "Available skills:
#  - pdf: Read and extract text from PDF files
#  - data-analysis: Analyze CSV/JSON data with pandas"
```
[F: `skills/base.py:84-92; agent.py:263-266`]

**Phase 2 — On-Demand Loading** (during the task):
```python
def load_skill(name: str) -> dict:
    skill = loader.get(name)
    return {
        "name": skill.name,
        "instructions": skill.instructions,   # Full body, loaded NOW
        "resources_path": skill.path,
    }
```
[F: `skills/base.py:95-115`]

This prevents context bloat while keeping specialized capabilities available.

### 2.3 Skill vs Persona

| Aspect | Persona | Skill |
|--------|---------|-------|
| **Scope** | Defines WHO the agent is | Defines WHAT the agent can additionally do |
| **Persistence** | Per-session identity | Loaded on demand per task |
| **Tools** | Base toolset (from catalog) | Allowed-tools constraint (advisory) |
| **Format** | YAML frontmatter + markdown | Same format, simpler fields |
| **Lifecycle** | Install/enable/disable/uninstall | Discovered from directories at engine build |

The `persona ⊇ skill` principle: both use the same YAML-frontmatter-markdown format, but personas have more structured capability declarations. [F: `personas/manifest.py:3-4`]

## 3. MCP Integration

### 3.1 Transport Layer

`MCPManager` (`mcp/client.py`) manages persistent per-server connections:

```text
MCPManager
├── _conns: dict[str, _Conn]
│   ├── session: ClientSession
│   ├── tools: list[mcp.types.Tool]
│   └── shutdown: asyncio.Event
├── _tasks: dict[str, asyncio.Task]    # one background task per server
└── _lock: asyncio.Lock                # connection creation serialization
```

Each server runs in a dedicated asyncio task that:
1. Opens transport (stdio subprocess OR streamable-http)
2. Creates `ClientSession` + initializes
3. Lists tools
4. Waits on shutdown event → closes transport + session in same task

Tool calls from the (sync) `ToolRegistry` bridge back via `run_coroutine_threadsafe`. [F: `mcp/client.py:33-159; mcp/tools.py`]

### 3.2 MCP Tool Gating

For connector-backed MCP servers, tools are gated through the same connector hierarchy:

```python
# In prepare_mcp_tools:
descriptor = get_descriptor(server.name)
backed = descriptor is not None and bool(descriptor.mcp_url)
if backed:
    effective = self.effective_connectors(session_id, agent)
    if server.name not in effective:
        continue    # muted connector → MCP tools invisible
    # Per-tool approval from pinned read/write classification:
    for fn in callables:
        fn.__aisuite_tool_metadata__.requires_approval = approval_for_tool(
            fn.__aisuite_tool_metadata__.name, default=True
        )
```

Unknown vendor tools from backed servers are excluded via `include_tools` (the descriptor's pinned tool list). This is a curated allowlist, not a free-for-all. [F: `manager.py:886-908, 934-943`]

### 3.3 MCP OAuth

`mcp/oauth.py` implements the OAuth 2.0 Authorization Code flow for MCP servers:

```text
1. User clicks "Connect" for an OAuth MCP server
2. Browser opens → user authorizes
3. Callback hits /mcp/oauth/callback → code exchanged
4. Tokens stored in SecretStore
5. Subsequent connects use stored tokens; silent refresh when possible
```

Key safety: `interactive=False` (default for session-start connects) **refuses** to open a browser — only explicit "Connect" actions are interactive. This prevents a failed one-click config from freezing every new session. [F: `mcp/oauth.py; manager.py:887-894`]

### 3.4 MCP Server Configuration

```python
MCPServerDef:
    name: str
    enabled: bool
    transport: "stdio" | "http"
    # stdio
    command: str
    args: list[str]
    env: dict
    cwd: str
    # http
    url: str
    headers: dict
    auth: "oauth" | None
    # filtering
    requires_approval: bool
    include_tools: list[str]   # curated allowlist
```

[F: `mcp/config.py`]

## 4. Key Architectural Insights

| Insight | Type | Evidence |
|---------|------|----------|
| Persona = Agent identity; Skill = on-demand capability — same format, different lifecycle | FACT | `manifest.py:3-4`, `skills/base.py` |
| Third-party personas land DISABLED — user must consent before any tool is exposed | FACT | `app.py:418-465` |
| Connector hierarchy is three-layer: connected → persona defaults → session overrides | FACT | `connections.py`, `manager.py:512-541` |
| MCP tools from backed servers are gated through the same connector hierarchy | FACT | `manager.py:886-908` |
| Skills use progressive disclosure: catalog at start, full body on demand via `load_skill` | FACT | `skills/base.py:84-115` |
| Non-interactive MCP connects refuse to open a browser — prevents session-freezing | FACT | `manager.py:887-894` |
| Unknown vendor MCP tools are excluded by a curated `include_tools` list | FACT | `manager.py:907-909` |
| Persona tools must reference the vetted `CATALOG` — unknown capability IDs fail loudly | FACT | `manifest.py:246-255` |
