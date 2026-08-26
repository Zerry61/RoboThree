# Pi Agent — Research Index

## Project Identity

| Field | Value |
|---|---|
| **Repository** | https://github.com/earendil-works/pi |
| **npm Scope** | `@earendil-works/pi-*` |
| **Study Target** | npm v0.80.7 / commit `c9715af` (2026-07-03) |
| **License** | MIT |
| **Language** | TypeScript |
| **Research Depth** | Level 3 — Three-Mechanism Deep Dive |

## Research Status

| Stage | Status | Date |
|---|---|---|
| Stage A: Project Identification | ✅ Complete | 2026-07-21 |
| Stage B: Core Runtime Trace | ✅ Complete | 2026-07-21 |
| Stage C1: Agent Loop Three-Layer API | ✅ Complete | 2026-07-21 |
| Stage C2: Extension System | ✅ Complete | 2026-07-21 |
| Stage C3: Session & Context Pipeline | ✅ Complete | 2026-07-21 |
| Stage D: RoboThree Mapping | ✅ Complete | 2026-07-21 |
| Final Review | ✅ Complete | 2026-07-21 |

## Research Outputs

### Required (7)

| File | Description |
|---|---|
| [index.md](index.md) | This file |
| [project-overview.md](project-overview.md) | Project positioning, tech stack, license snapshot |
| [source-map.md](source-map.md) | Directory map, entry points, package topology |
| [architecture.md](architecture.md) | Architecture overview with permission/security |
| [runtime-sequence.md](runtime-sequence.md) | End-to-end call chain with Mermaid + Hop Evidence |
| [robothree-fit-analysis.md](robothree-fit-analysis.md) | ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE |
| [open-questions.md](open-questions.md) | Unresolved items with How to Close |

### Conditional — Level 3 Deep Dives (3)

| File | Mechanism | Trigger |
|---|---|---|
| [agent-loop-three-layer.md](agent-loop-three-layer.md) | Agent Loop 三层 API | Core runtime innovation |
| [extension-system.md](extension-system.md) | Extension 扩展系统 | Skill/Plugin/Hook 四类命中 |
| [session-context-pipeline.md](session-context-pipeline.md) | Session & Context Pipeline | Context 是核心创新 + 真实长期记忆 |

### Advanced

| File | Description |
|---|---|
| [final-review.md](final-review.md) | Level 3 30-item full self-check |

## Key Architectural Conclusion

Pi Agent is a **layered, event-driven, TypeScript agent toolkit** with three distinctive architectural contributions:

1. **Three-layer agent API** (stateless `agentLoop` generator → stateful `Agent` class → engineering `AgentHarness`) that allows different consumers to operate at the right abstraction level
2. **"Core minimal + everything via extensions"** philosophy where only 4 built-in tools exist and all advanced capabilities (skills, subagents, MCP, sandboxing, permissions) are composed via jiti-loaded TypeScript extensions
3. **Tree-structured append-only session model** with two fork strategies and compaction-based context management

## L3 Mechanism Selection Rationale

The three mechanisms were selected because:
- **Agent Loop**: Pi's most innovative and unique contribution — no other agent framework has this clean three-layer separation
- **Extension System**: The defining architectural philosophy — understanding extensions is understanding Pi
- **Session & Context**: Addresses the hardest problem in agent engineering (context window management) with an elegant tree model
