# Daytona — Research Index

> **Project**: Daytona — Secure and Elastic Infrastructure for Running AI-Generated Code
> **Repository**: https://github.com/daytonaio/daytona
> **License**: AGPL-3.0 (Apache-2.0 for SDKs)
> **Research Depth**: Level 3 — 专项深挖（12 个维度）
> **Research Date**: 2026-07-18

## Research Status

| Stage | Status | Notes |
|-------|--------|-------|
| Stage A：Project Identification | ✅ Complete | Web-sourced evidence; git clone failed due to network constraints |
| Stage B：Core Runtime Trace | ✅ Complete | Sandbox lifecycle + job-based execution traced |
| Stage C：Conditional Deep Dive | ✅ Complete | 6 conditional files generated for 12 dimensions |
| Stage D：RoboThree Mapping | ✅ Complete | ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE |

## Key Finding

Daytona 的三平面架构（Interface → Control → Compute）是 RoboThree Worker Runtime 最直接的架构参考。其 **Runner v2 的 Job-based Polling 模式** 是实现 Agent Runtime 不直接管理容器的最佳实践范例。

## Commit Reference

- **Target**: `main` branch
- **Commit**: `ec4c21b` (Fix license link in README) — partial shallow clone; full repo clone failed due to network
- **Evidence Source**: Architecture docs (`apps/docs/src/content/docs/en/architecture.mdx`), DeepWiki analysis, web search results, PR discussions (#3361, #4434, #4452, #4636)

## Files Generated

### Required (7)

| File | Status | Description |
|------|--------|-------------|
| [index.md](index.md) | ✅ | This file |
| [project-overview.md](project-overview.md) | ✅ | Project positioning, tech stack, license |
| [source-map.md](source-map.md) | ✅ | Directory map, entry points |
| [architecture.md](architecture.md) | ✅ | Three-plane architecture analysis |
| [runtime-sequence.md](runtime-sequence.md) | ✅ | Sandbox lifecycle call chain + Mermaid |
| [robothree-fit-analysis.md](robothree-fit-analysis.md) | ✅ | ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE |
| [open-questions.md](open-questions.md) | ✅ | Unresolved items + how to close |

### Conditional (6)

| File | Status | Trigger |
|------|--------|---------|
| [permission-system.md](permission-system.md) | ✅ | Network policy + isolation layers |
| [security-review.md](security-review.md) | ✅ | Sandbox security model |
| [deployment-model.md](deployment-model.md) | ✅ | Hybrid/customer-managed compute |
| [tool-system.md](tool-system.md) | ✅ | Daemon Toolbox API |
| [observability-reliability.md](observability-reliability.md) | ✅ | Audit log + telemetry |
| [subagent-system.md](subagent-system.md) | ✅ | Runner/Worker architecture |
