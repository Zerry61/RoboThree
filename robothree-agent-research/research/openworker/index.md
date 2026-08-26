# OpenWorker — Research Index

> **Status**: L3 Deep Dive — Complete
> **Fixed Commit**: `f96ad4c8e6865f0aec519681a3717b6bcdd81546` (2026-07-30)
> **Repository**: https://github.com/andrewyng/openworker
> **License**: MIT
> **Tech Stack**: Python (FastAPI + asyncio), TypeScript/React + Tauri, Rust (STT sidecar)

## Research Artifacts

| File | Type | Status |
|------|------|--------|
| [index.md](index.md) | Required | ✅ |
| [project-overview.md](project-overview.md) | Required | ✅ |
| [source-map.md](source-map.md) | Required | ✅ |
| [architecture.md](architecture.md) | Required | ✅ |
| [runtime-sequence.md](runtime-sequence.md) | Required | ✅ |
| [robothree-fit-analysis.md](robothree-fit-analysis.md) | Required | ✅ |
| [open-questions.md](open-questions.md) | Required | ✅ |
| [tool-system.md](tool-system.md) | Conditional (Triggered) | ✅ |
| [permission-system.md](permission-system.md) | Conditional (Triggered) | ✅ |
| [skill-plugin-mcp.md](skill-plugin-mcp.md) | Conditional (Triggered) | ✅ |
| [final-review.md](final-review.md) | L3 Required | ✅ |

## L3 Deep-Dive Mechanisms

Based on Stage A/B analysis, the three most architecturally significant mechanisms:

1. **TurnEngine + Approval Gate** — The async agent loop with interrupt handling, parallel tool execution, and multi-mode permission gating
2. **Inbox-based Human-in-the-Loop** — Prompts parked as durable queue items, resolvable across surfaces (WS/REST/Slack), surviving restarts
3. **Persona + Skill Progressive Disclosure** — YAML frontmatter manifests, catalog-based capability composition, on-demand skill loading

## Quick Summary

OpenWorker is a **desktop AI coworker** (Andrew Ng / aisuite ecosystem) that runs locally, delivers finished work products (documents, reports, messages), and gates consequential actions behind an Inbox-based approval system. Its architecture centers on a Provider-agnostic async TurnEngine with a sophisticated permission model (Discuss/Plan/Interactive/Auto modes), durable session persistence, and a persona system that composes agent behaviors from a vetted capability catalog.
