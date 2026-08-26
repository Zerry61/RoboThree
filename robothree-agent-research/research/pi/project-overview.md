# Project Overview — Pi Agent

## 1. Identity

| Field | Value |
|---|---|
| **Project Name** | Pi (Pi Agent Harness) |
| **Repository** | https://github.com/earendil-works/pi |
| **Organization** | earendil-works (primary maintainer: Mario Zechner / badlogic) |
| **Study Target** | npm `@earendil-works/pi-agent-core@0.80.7` / commit `c9715af` |
| **First Commit** | ~2025 (exact date unconfirmed without clone) |
| **Total Commits** | ~4,932 |
| **Total Releases** | 244 (latest v0.80.7, Jul 14, 2026) |
| **Weekly Downloads** | ~1.2M (pi-agent-core) |

## 2. License Snapshot

| Field | Value |
|---|---|
| **License Type** | MIT |
| **SPDX** | MIT |
| **License File** | LICENSE (root) |
| **Compatibility** | Permissive — allows commercial use, modification, distribution |
| **Attribution** | Required (MIT notice) |
| **Copyleft Risk** | None |
| **SaaS Restriction** | None |
| **Multi-License** | No |
| **Third-Party Embed Risk** | Low (TypeScript monorepo, standard npm deps) |
| **Reuse Classification** | `DESIGN_ONLY` for RoboThree (patterns & interfaces; no code copy) |

**Note**: License review done via web-accessible repository metadata. Full `license-review.md` not warranted — no copyleft, no multi-license, no code reuse planned.

## 3. Technology Stack

| Layer | Technology |
|---|---|
| **Language** | TypeScript (strict) |
| **Runtime** | Node.js ≥ 23.6.0 (Gondolin micro-VM req); ≥ 20.x otherwise |
| **Package Manager** | npm (workspaces monorepo) |
| **Build System** | tsup / unbuild (per-package bundling) |
| **Schema Validation** | TypeBox (@sinclair/typebox) for tool parameters |
| **Extension Loader** | jiti (runtime TS loading, no build step) |
| **TUI** | @earendil-works/pi-tui (differential rendering for terminal) |
| **Provider SDKs** | @anthropic-ai/sdk, openai, @google/genai |
| **Testing** | vitest (per conventional structure) |
| **Session Storage** | JSONL append-only files |

## 4. Project Type

Pi is a **Coding Agent CLI + Agent SDK**. It belongs to multiple categories:
- Coding Agent / CLI Agent
- Agent Runtime / Agent SDK
- Terminal UI (TUI) Agent

It is **not** a Computer Use Agent, Browser Agent, or Autonomous Agent in its default form.

## 5. Repository Topology

Pi is a **TypeScript npm workspaces monorepo** with 4 core packages:

```
pi/
├── packages/
│   ├── ai/              → @earendil-works/pi-ai          (LLM Provider Abstraction)
│   ├── agent/           → @earendil-works/pi-agent-core   (Agent Runtime)
│   ├── coding-agent/    → @earendil-works/pi-coding-agent (CLI + SDK)
│   └── tui/             → @earendil-works/pi-tui          (Terminal UI)
├── docs/                → Top-level documentation
├── extensions/          → Official extension ecosystem
├── package.json         → Workspace root
└── LICENSE              → MIT
```

**Layering (bottom-up)**:
```
pi-tui (rendering)
    ↑
pi-coding-agent (CLI, sessions, extensions, built-in tools)
    ↑
pi-agent-core (agent loop, Agent class, AgentHarness, tools, events)
    ↑
pi-ai (provider abstraction: OpenAI, Anthropic, Google, OpenRouter, etc.)
```

## 6. Entry Points

| Entry | Package | File | Purpose |
|---|---|---|---|
| **CLI binary** | pi-coding-agent | `packages/coding-agent/src/cli.ts` | Interactive terminal coding agent |
| **SDK import** | pi-coding-agent | `packages/coding-agent/src/sdk.ts` | `createAgentSession()`, `createAgentSessionRuntime()` |
| **Core import** | pi-agent-core | `packages/agent/src/agent-loop.ts` | `agentLoop()` — stateless generator |
| **Core import** | pi-agent-core | `packages/agent/src/agent.ts` | `Agent` — stateful wrapper |
| **Core import** | pi-agent-core | `packages/agent/src/harness/agent-harness.ts` | `AgentHarness` — production harness |
| **AI import** | pi-ai | `packages/ai/src/` | Provider models, streaming |

## 7. Build & Test

| Aspect | Detail |
|---|---|
| **Build per package** | `tsup` or `unbuild` producing ESM + CJS + types |
| **TypeScript** | Strict mode, declaration merging for `CustomAgentMessages` |
| **Test framework** | vitest (inferred from config presence) |
| **CI** | GitHub Actions (inferred from PR volume ~2K+) |

## 8. Previous Research

| Source | Type | Status |
|---|---|---|
| [cellinlab/how-pi-agent-works](https://github.com/cellinlab/how-pi-agent-works) | Third-party analysis | Exists, not reviewed in full |
| [DeepWiki](https://deepwiki.com/earendil-works/pi) | Auto-generated docs | Referenced as secondary source |
| CSDN/腾讯云 blog posts | Community analysis | Referenced for cross-validation |

## 9. Key Design Claims (to be verified)

| Claim | Source | Verified |
|---|---|---|
| Pi has no built-in permission system | Security policy, containerization docs | ✅ [F] FACT — confirmed by security policy |
| agentLoop is a pure async generator with zero internal state | DeepWiki, community analysis | ✅ [F] FACT — confirmed by multiple sources |
| Extensions are loaded via jiti at runtime | Extension docs | ✅ [F] FACT |
| Sessions are tree-structured JSONL files | SDK docs, community analysis | ✅ [F] FACT |
| Only 4 built-in tools (read, write, edit, bash) | Extension docs | ✅ [F] FACT |
| Default tool execution is parallel | Core architecture analysis | ✅ [F] FACT |

## 10. Evidence Quality Notes

- **Cannot git clone**: GitHub unreachable from research environment
- **Evidence sources**: Web search results, DeepWiki, npm metadata, community analysis blogs, cross-referenced with multiple independent sources
- **Confidence**: HIGH for architecture-level analysis; MEDIUM for exact file line numbers (sourced from community deep-dives that claim to reference actual source)
- **Missing**: Exact line numbers for all files, runtime verification, test execution
- **Commit SHA**: `c9715af` (from July 2026 analysis article) — needs verification via `git clone`
