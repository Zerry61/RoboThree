# Hermes Agent — Project Overview

## Identification

| Field | Value |
| --- | --- |
| Repository | `https://github.com/NousResearch/hermes-agent` |
| Branch | `main` |
| Commit SHA | `3d9be2789552a495c7adf30148e867e7614a4bdc` |
| Analysis Date | 2026-07-18 |
| GitHub Stars | ~216,600 |
| Repository Size | ~508 MB (7,445 files) |

## What Is This Project?

Hermes Agent is a **multi-platform, multi-provider AI agent CLI and gateway** built in Python. It was formerly known as "OpenClaw", "Moltbot", and "Claude Code" before being renamed. It is a production-scale agent runtime that:

- Runs as a CLI, TUI, or gateway server
- Supports 20+ model providers (Anthropic, OpenAI, Google, Bedrock, Vertex, local models, etc.)
- Supports 10+ messaging platforms (Telegram, Discord, Slack, WhatsApp, etc.)
- Has built-in tool execution with concurrent dispatch
- Has subagent delegation with capped toolset inheritance
- Has Skill/Plugin/MCP extensibility
- Has six worker backends (local, Docker, SSH, Singularity, Modal, Daytona)

### Key Characteristics

- **[F]** Language: Python 3 (with TypeScript/React desktop + web frontends)
- **[F]** Package manager: `uv` (Python), `npm` (JS)
- **[F]** License: MIT
- **[F]** Entry points: `cli.py`, `run_agent.py`, `gateway/`, `tui_gateway/`, `mcp_serve.py`
- **[I]** Architecture: Monolithic Python monorepo with plugin points via `plugins/` and `skills/` directories
- **[I]** Scale: Production-grade, deployed to hundreds of thousands of users

### License Snapshot

| Field | Value |
| --- | --- |
| SPDX | MIT |
| Full Name | MIT License |
| Commercial Use | ✅ Permitted |
| Modification | ✅ Permitted |
| Distribution | ✅ Permitted |
| Copyleft | ❌ None |
| Reuse Classification | `DESIGN_ONLY` — reference patterns and interfaces, do not copy implementation |

## Technology Stack

| Component | Technology |
| --- | --- |
| Core Runtime | Python 3 |
| Package Manager | `uv` (Python), `npm` (JS) |
| Build System | `setuptools` / `pyproject.toml` |
| Desktop App | Electron + React + TypeScript |
| Web Frontend | Next.js / React |
| AI Providers | OpenAI SDK, Anthropic SDK, boto3 (Bedrock), Google GenAI |
| Container Runtime | Docker, Singularity |
| Remote Execution | SSH, Modal, Daytona |
| Testing | pytest (Python), jest (JS) |

## Top-Level Directory Map

| Directory | Purpose | Evidence |
| --- | --- | --- |
| `agent/` | **Core agent runtime** — Loop, context, tools, memory, skills | GitHub API tree listing |
| `gateway/` | **Platform adapters** — Telegram, Discord, Slack, WhatsApp, etc. | GitHub API tree listing |
| `tools/` | **Tool implementations** — Terminal, file, browser, search, etc. | GitHub API tree listing |
| `skills/` | **Skill definitions** — Bundled skill manifests and code | GitHub API tree listing |
| `plugins/` | **Plugin system** — Extensibility hooks | GitHub API tree listing |
| `providers/` | **Model provider adapters** — Anthropic, OpenAI, Google, etc. | GitHub API tree listing |
| `hermes/` | **Hermes-specific runtime helpers** | GitHub API tree listing |
| `hermes_cli/` | **CLI-specific code** — Config, middleware, plugins | GitHub API tree listing |
| `acp_adapter/` | **ACP (Agent Communication Protocol) adapter** | GitHub API tree listing |
| `web/` | **Web frontend** (Next.js) | GitHub API tree listing |
| `apps/` | **Desktop app** (Electron) | GitHub API tree listing |
| `docker/` | **Docker configurations** | GitHub API tree listing |
| `docs/` | **Documentation** | GitHub API tree listing |
| `tests/` | **Python tests** | GitHub API tree listing |
| `tests-js/` | **JavaScript tests** | GitHub API tree listing |
| `cron/` | **Cron job infrastructure** | GitHub API tree listing |
| `scripts/` | **Utility scripts** | GitHub API tree listing |

## Real Entry Points

| Entry | File | Symbol | Type |
| --- | --- | --- | --- |
| CLI | `cli.py` | — | CLI launcher |
| Agent Runner | `run_agent.py` | `AIAgent` class | Core agent bootstrap |
| Conversation Loop | `agent/conversation_loop.py:565` | `run_conversation()` | Main agent loop |
| Gateway | `gateway/` | Platform adapters | Multi-platform server |
| TUI | `tui_gateway/` | — | Terminal UI |
| MCP Server | `mcp_serve.py` | — | MCP host |
| Cron Runner | `cron/` | — | Scheduled task runner |

## Core Agent Files Analyzed

| File | Lines | Role | Analysis Depth |
| --- | --- | --- | --- |
| [agent/conversation_loop.py](sources/hermes-agent/agent/conversation_loop.py) | 5,679 | Main agent loop | Full read |
| [agent/tool_executor.py](sources/hermes-agent/agent/tool_executor.py) | 1,801 | Tool dispatch + execution | Full read |
| [agent/tool_dispatch_helpers.py](sources/hermes-agent/agent/tool_dispatch_helpers.py) | 653 | Tool helpers + safety checks | Full read |

## Key Metrics

| Metric | Value |
| --- | --- |
| Total files | 7,445 |
| Repository size | ~508 MB |
| Core agent module | ~100+ Python files in `agent/` |
| Tool implementations | ~50+ in `tools/` |
| Platform adapters | ~10+ in `gateway/` |
| Model providers | ~20+ in `providers/` |
| Worker backends | 6 (local, docker, ssh, singularity, modal, daytona) |
