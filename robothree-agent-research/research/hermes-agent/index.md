# Hermes Agent — Research Index

> **Project**: Hermes Agent (formerly OpenClaw / Moltbot / Claude Code)
> **Repository**: https://github.com/NousResearch/hermes-agent
> **Analysis Level**: Level 2 — Core Architecture Research
> **Execution Mode**: STATIC_ANALYSIS_ONLY

## Metadata

| Field | Value |
| --- | --- |
| Repository | `https://github.com/NousResearch/hermes-agent` |
| Branch | `main` |
| Commit SHA | `3d9be2789552a495c7adf30148e867e7614a4bdc` |
| Analysis Date | 2026-07-18 |
| Analysis Level | Level 2 |
| Execution Mode | STATIC_ANALYSIS_ONLY |
| License | MIT |

## Research Status

| Stage | Status | Files |
| --- | --- | --- |
| Stage A: Identification | ✅ Complete | `project-overview.md`, `source-map.md` |
| Stage B: Core Runtime | ✅ Complete | `architecture.md`, `runtime-sequence.md` |
| Stage C: Conditional | ✅ 3/4 max triggered | `session-state-memory.md`, `skill-plugin-mcp.md`, `permission-system.md` |
| Stage D: RoboThree Mapping | ✅ Complete | `robothree-fit-analysis.md`, `open-questions.md` |
| Level 3 Deep Dive | ✅ Complete | `level3-deep-dive.md`, `final-review.md` |
| Trial Notes | ✅ Complete | `skill-trial-notes.md` |

## Key Findings Summary

1. **Agent Loop**: `run_conversation()` in `agent/conversation_loop.py:565` — while-loop with iteration budget + max_iterations + grace call. Nested retry loop for API calls.
2. **Tool Dispatch**: Three modes — concurrent (`DaemonThreadPoolExecutor`), sequential, and segmented. Actual invocation via `agent._invoke_tool()`.
3. **Permission Model**: Multi-layer pre-execution blocking (scope → plugin → guardrail), not a separate centralized permission manager.
4. **Session/Memory**: Separate `memory_manager.py` for persistent memory; plugin-based context injection into user messages at API-call time.
5. **Subagent**: `delegate_task` tool spawns subagents; stateless for one-shot/cron, stateful for interactive. Toolset inheritance with capping.
6. **Gateway**: Platform adapter pattern with `gateway/` directory; Channel Capability concept implicit but not formalized.
7. **Worker Backends**: Six backends (local, docker, ssh, singularity, modal, daytona) with abstract `BaseEnvironment` interface.

## Files

| File | Type | Lines (approx) | Description |
| --- | --- | --- | --- |
| [index.md](index.md) | Required | — | This index |
| [project-overview.md](project-overview.md) | Required | — | Project positioning + tech stack + license |
| [source-map.md](source-map.md) | Required | — | Directory map + entry points |
| [architecture.md](architecture.md) | Required | — | Architecture overview + permission/security |
| [runtime-sequence.md](runtime-sequence.md) | Required | — | End-to-end call chain + Mermaid + Hop Evidence |
| [session-state-memory.md](session-state-memory.md) | Conditional | — | Session/Memory/Skill layering |
| [skill-plugin-mcp.md](skill-plugin-mcp.md) | Conditional | — | Skill/Plugin/MCP system |
| [permission-system.md](permission-system.md) | Conditional | — | Permission + security deep dive |
| [robothree-fit-analysis.md](robothree-fit-analysis.md) | Required | — | RoboThree ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE |
| [open-questions.md](open-questions.md) | Required | — | Open questions + how to close |
| [level3-deep-dive.md](level3-deep-dive.md) | Level 3 | — | Deep dive on main loop + Tool + Session |
| [final-review.md](final-review.md) | Level 3 | — | 30-item self-check + RoboThree design principles |
| [skill-trial-notes.md](skill-trial-notes.md) | Meta | — | Skill trial feedback (non-architectural) |

## Research Scope

This Level 2 research focused on 7 themes:
1. Agent Main Loop
2. Session, Memory, and Skill Layering
3. Tool Registry, Tool Dispatch, and Permission
4. Subagent Runtime
5. Worker and Terminal Backend
6. Gateway and Channel Capability
7. RoboThree Fit Mapping

## Constraints

- Network connectivity issues prevented full clone; selective file fetch was used
- No dependency installation, test execution, or runtime verification
- Some architectural conclusions rely on inference from partial source access
- Gateway, subagent, and worker backend analysis has lower confidence due to limited file access
