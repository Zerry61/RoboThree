# Project Overview — OpenWorker

## Identity

| Field | Value |
|-------|-------|
| **Name** | OpenWorker |
| **Repository** | `https://github.com/andrewyng/openworker` |
| **Fixed Commit** | `f96ad4c8e6865f0aec519681a3717b6bcdd81546` |
| **Version** | `0.0.0` (beta) |
| **Author** | Andrew Ng |
| **Language** | Python 3.10+ (backend), TypeScript/React (frontend), Rust (STT) |
| **License** | MIT |
| **Built On** | [aisuite](https://github.com/andrewyng/aisuite) (pinned commit `1b4bbf3`) |

## What It Is

OpenWorker is an **open-source desktop AI coworker** that:

1. Runs locally on macOS/Windows as a Tauri desktop app with a Python agent server sidecar
2. Delivers **finished work products** (documents, spreadsheets, reports) rather than chat
3. Gates all consequential actions (writes, sends, shell commands) behind user approval
4. Supports 25+ third-party integrations (Slack, GitHub, Jira, Gmail, Google Calendar, etc.)
5. Brings your own model — provider-agnostic via aisuite (OpenAI, Anthropic, Google, Ollama, etc.)
6. Includes scheduled automations and Slack-based interaction (`@OpenWorker`)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Agent Engine** | Python asyncio (`TurnEngine` in `coworker/engine.py`) |
| **API Server** | FastAPI + WebSocket (`coworker/server/app.py`) |
| **Model Providers** | aisuite + custom providers (OpenAI, Anthropic, Gemini, Vertex, Bedrock, Ollama) |
| **Desktop Shell** | Tauri (Rust) + React (TypeScript) (`surfaces/gui/`) |
| **Speech-to-Text** | Rust sidecar (`stt/`) |
| **Storage** | SQLite (conversations, memory, audit, automations) + JSON files (inbox, prefs, subscriptions) |
| **MCP** | Official `mcp` SDK (`mcp>=1.1,<2`) — stdio + streamable-http transports |
| **Auth** | OAuth 2.0 for cloud sign-in + managed connector flows |
| **Packaging** | macOS DMG, Windows MSI/NSIS installer |

## Repository Scale

| Metric | Count |
|--------|-------|
| Python source files | ~122 |
| TypeScript/TSX files | ~156 |
| Total LoC (Python) | ~15,000+ |
| Key packages | `coworker/agents/`, `coworker/server/`, `coworker/tools/`, `coworker/connectors/`, `coworker/mcp/`, `coworker/memory/`, `coworker/personas/`, `coworker/skills/`, `coworker/providers/`, `coworker/automation/` |

## License Snapshot

- **License**: MIT (see `LICENSE` at repo root)
- **Copyright**: 2024 Andrew Ng
- **Third-party deps with notable licenses**: `pypdf` (BSD), `pypdfium2` (BSD-3), `mcp` (MIT), `aisuite` (MIT)
- **Deliberate avoidance**: PyMuPDF excluded due to AGPL incompatibility with DMG distribution (`pyproject.toml` comment)
- **Reuse classification**: `DESIGN_ONLY` — design patterns and architectural decisions are extractable; direct code reuse should follow MIT attribution requirements

## Entry Points

| Entry | File | Symbol | Description |
|-------|------|--------|-------------|
| CLI | `coworker/cli.py` | `main()` | Textual TUI entry |
| Server | `coworker/server/run.py` | `main()` | FastAPI server sidecar (production) |
| Connectors CLI | `coworker/connectors/cli.py` | `main()` | Connector management CLI |
| Desktop App | `surfaces/gui/src/main.tsx` | — | React + Tauri entry |
| GUI Tauri | `surfaces/gui/src-tauri/` | — | Tauri shell (manages server lifecycle) |
