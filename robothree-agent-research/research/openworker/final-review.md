# Final Review — OpenWorker L3 Deep Dive

> Commit: `f96ad4c8e6865f0aec519681a3717b6bcdd81546`
> Research Date: 2026-07-30
> Depth: Level 3 (专项深挖: TurnEngine + Inbox HITL + Persona/Skill/MCP)

## 1. Research Summary

OpenWorker is a **production-quality desktop AI coworker** with a sophisticated architecture that balances capability, safety, and usability. The three deep-dive mechanisms reveal a system designed for real-world use, not just demonstration:

1. **TurnEngine** — An async event-driven agent loop with comprehensive interrupt handling, parallel/serial tool execution, durable session resume, and multi-mode permission gating.
2. **Inbox HITL** — A durable, surface-agnostic human attention queue that decouples approval from the agent loop and survives server restarts.
3. **Persona/Skill/MCP** — A composable behavior system with catalog-based capability validation, progressive disclosure, and a curated MCP integration model.

## 2. Level 2 Minimum Self-Check (10 Items)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Commit SHA fixed | ✅ | `f96ad4c8e6865f0aec519681a3717b6bcdd81546` |
| 2 | License checked | ✅ | MIT — recorded in `project-overview.md` |
| 3 | Real entry points confirmed | ✅ | CLI (`cli.py:main`), Server (`server/run.py:main`), Tauri (`surfaces/gui/src-tauri/`), not from README alone |
| 4 | Agent loop located | ✅ | `engine.py:TurnEngine._loop()` at line 294 |
| 5 | Representative E2E call chain | ✅ | `runtime-sequence.md` — user message → streaming → tool calls → approval → execution → response |
| 6 | Hop Evidence table | ✅ | 42 hops documented in `runtime-sequence.md` |
| 7 | Permission + Security checked | ✅ | `architecture.md` §3 + `permission-system.md` (full dedicated analysis) |
| 8 | FACT/INFERENCE/RECOMMENDATION/UNKNOWN | ✅ | All conclusions marked throughout all files |
| 9 | RoboThree 5-classification | ✅ | ADOPT (3), ADAPT (3), DEFER (3), REJECT (2), NEEDS_MORE_EVIDENCE (3) in `robothree-fit-analysis.md` |
| 10 | 7 Required artifacts | ✅ | index, project-overview, source-map, architecture, runtime-sequence, robothree-fit-analysis, open-questions |

## 3. L3 Extended Self-Check (30 Items)

### 3.1 Research Process

| # | Item | Status |
|---|------|--------|
| 1 | Repository cloned to `sources/openworker/` | ✅ |
| 2 | Commit pinned before analysis | ✅ |
| 3 | License reviewed | ✅ MIT |
| 4 | No dependency installation | ✅ (static analysis only) |
| 5 | No project execution | ✅ |
| 6 | No external network access beyond git clone | ✅ |

### 3.2 Source Coverage

| # | Item | Status |
|---|------|--------|
| 7 | Core engine files read | ✅ `engine.py`, `agent.py`, `agents/base.py`, `agents/cowork.py` |
| 8 | Server layer read | ✅ `server/app.py`, `server/manager.py` (full) |
| 9 | Permission system read | ✅ `permissions.py`, `risk.py` |
| 10 | Tool system read | ✅ `tools/registry.py` |
| 11 | Persona system read | ✅ `personas/manifest.py` |
| 12 | Skill system read | ✅ `skills/base.py` |
| 13 | MCP integration read | ✅ `mcp/client.py` |
| 14 | Memory system read | ✅ `memory/sqlite_store.py` |
| 15 | Automation scheduler read | ✅ `automation/scheduler.py` |

### 3.3 Evidence Quality

| # | Item | Status |
|---|------|--------|
| 16 | Every FACT tagged claim has source file + line | ✅ |
| 17 | INFERENCE claims explicitly marked | ✅ |
| 18 | No INFERENCE presented as FACT | ✅ |
| 19 | No README-only architecture claims | ✅ |
| 20 | Cross-module claims have ≥2 independent evidence | ✅ (e.g., approval flow traced across engine.py + app.py + manager.py + permissions.py) |
| 21 | Hop Evidence table populated | ✅ (42 hops) |

### 3.4 Call Chain Quality

| # | Item | Status |
|---|------|--------|
| 22 | Mermaid diagram shows real call flow | ✅ |
| 23 | Text call chain matches Hop Evidence | ✅ |
| 24 | Interrupt path documented | ✅ (`runtime-sequence.md` §Interrupt Path) |
| 25 | Retry path documented | ✅ (`runtime-sequence.md` §Retry Path) |
| 26 | Durable resume path documented | ✅ (`runtime-sequence.md` §Durable Resume Path) |

### 3.5 Output Completeness

| # | Item | Status |
|---|------|--------|
| 27 | 7 Required files complete | ✅ |
| 28 | 3 Conditional files triggered and complete | ✅ (`tool-system.md`, `permission-system.md`, `skill-plugin-mcp.md`) |
| 29 | `final-review.md` (this file) | ✅ |
| 30 | `open-questions.md` populated | ✅ (11 questions with How to Close) |

## 4. Key Findings Summary

### Most Valuable Patterns for RoboThree

1. **Inbox-based Human-in-the-Loop** (P0 ADOPT) — The most architecturally novel pattern. Durable, surface-agnostic, restart-surviving approval queue. This is the single most important takeaway for RoboThree.

2. **Risk-Based Tool Classification** (P0 ADOPT) — Clean, composable permission model that scales from read-only to full automation. The READ/WRITE_LOCAL/EXEC/EXTERNAL taxonomy is well-designed.

3. **TurnEngine with Interrupt-Everywhere** (P0 ADAPT) — The "no orphaned tool calls" guarantee is critical for production reliability. The parallel/serial split for tool execution is elegant.

4. **Catalog-Based Capability Validation** (P1 ADOPT) — Prevents silent failures from misconfigured persona manifests. Every tool reference is validated at parse time.

5. **Progressive Skill Disclosure** (P2 ADAPT) — Catalog at session start, full body on demand. Proven context engineering pattern.

### Architecture Decisions to Avoid

1. **Tight coupling to a specific provider library** (REJECT aisuite dependency)
2. **Desktop-only deployment** (REJECT Tauri+Python stack for RoboThree)
3. **JSON files for critical state** (prefer SQLite for everything important)

## 5. Research Limitations

| Limitation | Impact |
|-----------|--------|
| Static analysis only, no runtime verification | Call chain may miss dynamic dispatch paths |
| Frontend (React/TypeScript) not deeply analyzed | UI architecture patterns not captured |
| Tests not explored | Test coverage and testing patterns unknown |
| Connector implementations not deeply analyzed | Connector architecture details may be incomplete |
| No comparison with other agent frameworks in this research | Cross-project patterns not identified yet |

## 6. Follow-up Recommendations

1. **Cross-reference with Daytona research** — Daytona's Job-based Worker Polling + Agent Injection pattern complements OpenWorker's desktop-local model. Combined analysis could inform RoboThree's deployment architecture.

2. **Runtime verification** — If user authorizes, run OpenWorker's test suite to validate the call chains traced here.

3. **Inbox pattern formalization** — The Inbox HITL pattern deserves its own design document or ADR before being adopted into RoboThree.

4. **Memory system comparison** — Compare OpenWorker's simple SQLite memory with more sophisticated systems (LangGraph's checkpointing, Mem0, etc.) before finalizing RoboThree's memory architecture.
