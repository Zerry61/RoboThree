# Skill Format Compatibility — 6 Agent Frameworks

> Cross-project comparison of Skill definition formats, fields, discovery, loading, and execution models.
> Purpose: Decide RoboThree's Skill Manifest strategy — self-contained vs compatible with which external format.
> Analysis date: 2026-07-22

## Sources & Evidence Quality

| Project | Research Depth | Source Code Available? | Key Skill Documents |
|---|---|---|---|
| **Claude Code Best** | Level 3 | ⚠️ Reverse-engineered, LICENSE_RISK | [architecture.md](../claude-code-best/architecture.md) §5, [skill-plugin-mcp-deep-dive.md](../claude-code-best/skill-plugin-mcp-deep-dive.md) |
| **OpenHands SDK** | Level 2 + source | ✅ Full source | [architecture.md](../software-agent-sdk/architecture.md), [`openhands/sdk/skills/skill.py`](../../sources/software-agent-sdk/openhands-sdk/openhands/sdk/skills/skill.py) |
| **Hermes Agent** | Level 2 + source | ✅ Full source | [skill-plugin-mcp.md](../hermes-agent/skill-plugin-mcp.md), [`agent/prompt_builder.py`](../../sources/hermes-agent/agent/prompt_builder.py) |
| **OpenClaw** | Level 2 + source | ✅ Full source | [skill-plugin-mcp.md](../openclaw/skill-plugin-mcp.md), [`ui/src/lib/skills/index.ts`](../../sources/openclaw/ui/src/lib/skills/index.ts) |
| **Pi Agent** | Level 3 | ❌ No source (GitHub unreachable from research env) | [extension-system.md](../pi/extension-system.md), [architecture.md](../pi/architecture.md) §1.1 |
| **Grok-build** | Level 2 + source | ✅ Full source | [architecture.md](../grok-build/architecture.md), [runtime-sequence.md](../grok-build/runtime-sequence.md) |

---

## 1. What Is a "Skill" — Six Different Definitions

### 1.1 Skill Definition Matrix

| Project | Core Abstraction | Storage Format | Content Type |
|---|---|---|---|
| **Claude Code Best** | `BundledSkillDefinition` | `.claude/skills/<name>/SKILL.md` (file) + bundled registry + MCP | Markdown with YAML frontmatter + associated `files` map |
| **OpenHands SDK** | `Skill` (Pydantic model) | `.agents/skills/<name>/SKILL.md` OR legacy `.openhands/skills/*.md` | Markdown with YAML frontmatter (AgentSkills standard) |
| **Hermes Agent** | `SKILL.md` index + skill_manage tool | `~/.hermes/skills/<category>/<name>/SKILL.md` (file) | Markdown with YAML frontmatter (custom fields) |
| **OpenClaw** | ClawHub Skill npm package | `extensions/<skill>/` npm package + `openclaw.plugin.json` | TypeScript package, not Markdown |
| **Pi Agent** | TypeScript Extension | `~/.pi/agent/extensions/*.ts` (file) + npm packages | TypeScript module (TS code) |
| **Grok-build** | — (no Skill concept) | — | Tool is the unit of extension |

### 1.2 Key Insight: Only 3 of 6 Use Markdown Skills

Only Claude Code Best, OpenHands SDK, and Hermes Agent use **Markdown files with YAML frontmatter** as their Skill format.

- **OpenHands SDK is the only one that explicitly targets `https://agentskills.io/specification`** — the AgentSkills standard that Claude Code's SKILL.md conforms to. Evidence: [`skill.py:193`](../../sources/software-agent-sdk/openhands-sdk/openhands/sdk/skills/skill.py#L193): *"This model supports both OpenHands-specific fields and AgentSkills standard fields (https://agentskills.io/specification) for cross-platform compatibility."*
- **Hermes Agent uses Markdown but with custom fields** (`platforms`, `conditions`, `categories`) — not compatible with AgentSkills standard. Evidence: [`prompt_builder.py:117-125`](../../sources/hermes-agent/agent/prompt_builder.py#L117-L125) defines a Hermes-specific YAML frontmatter parser.
- **OpenClaw Skill = npm package**, not Markdown — entirely different deployment model.
- **Pi Agent Skill = TypeScript Extension**, not Markdown — code-driven, not data-driven.
- **Grok-build has no Skill layer at all** — Tool is the unit.

---

## 2. Skill Definition Format — Field-by-Field Comparison

### 2.1 Markdown-Based Skills (Claude Code Best, OpenHands SDK, Hermes Agent)

| Field | Claude Code Best | OpenHands SDK (AgentSkills standard) | Hermes Agent (custom) |
|---|---|---|---|
| **`name`** | ✅ required | ✅ required | ✅ derived from path or frontmatter |
| **`description`** | ✅ required (1-1024 chars) | ✅ required (1-1024 chars per AgentSkills) | ✅ extracted from frontmatter |
| **`version`** | ❌ | ✅ default "1.0.0" (AgentSkills field) | ❌ |
| **`license`** | ❌ | ✅ (AgentSkills field, e.g., "Apache-2.0") | ❌ |
| **`compatibility`** | ❌ | ✅ (AgentSkills field, env requirements) | ❌ |
| **`metadata`** | ❌ | ✅ arbitrary key-value (AgentSkills extensibility) | ❌ |
| **`allowed-tools` / `allowed_tools`** | ✅ required list | ✅ parsed from string or list (AgentSkills) | ❌ Hermes uses `platforms` instead |
| **`disable-model-invocation` / `disable_model_invocation`** | ✅ | ✅ (AgentSkills, also forced for PathTrigger) | ❌ |
| **`whenToUse` / `when_to_use`** | ✅ | ❌ (description field covers this) | ❌ |
| **`argumentHint` / `argument_hint`** | ✅ | ❌ | ❌ |
| **`userInvocable` / `user_invocable`** | ✅ | ❌ (uses `inputs` field instead) | ❌ |
| **`aliases`** | ✅ | ❌ | ❌ |
| **`hooks`** | ✅ Pre/Post | ❌ (uses SDK Hook system separately) | ❌ |
| **`context: 'inline' \| 'fork'`** | ✅ | ❌ (uses `is_agentskills_format` instead) | ❌ |
| **`agent`** | ✅ agent role ref | ❌ (uses separate `agent_role_ref`) | ❌ |
| **`files: Record<string,string>`** | ✅ file name → content map | ❌ (uses `resources: SkillResources`) | ❌ |
| **`getPromptForCommand`** | ✅ function | ❌ (declarative `prompt_template`) | ❌ |
| **`mcp_tools`** | ❌ | ✅ dict[str, MCPServer] | ❌ |
| **`triggers`** | ❌ (uses whenToUse) | ✅ list of keyword strings | ❌ |
| **`paths`** (path globs) | ❌ | ✅ comma-separated string or YAML list (forces PathTrigger) | ❌ |
| **`inputs`** | ❌ | ✅ list of InputMetadata (TaskTrigger) | ❌ |
| **`platforms`** | ❌ | ❌ | ✅ custom field for Hermes platforms |
| **`conditions`** | ❌ | ❌ | ✅ toolset/conditional activation |
| **`categories`** | ❌ | ❌ | ✅ skill categorization for prompt grouping |

### 2.2 Code-Based "Skills" (OpenClaw, Pi Agent)

| Field | OpenClaw (npm package) | Pi Agent (TS Extension) |
|---|---|---|
| **Definition file** | `openclaw.plugin.json` (Manifest) | `index.ts` (default-exported factory function) |
| **Loader** | Plugin Loader (`src/plugins/loader.ts`) | jiti (runtime TypeScript loader) |
| **Type system** | TypeScript types in `plugin-sdk` | TypeBox (parameter validation) |
| **Registration API** | `createChatChannelPlugin()`, `registerTool()`, etc. | `pi.registerTool()`, `pi.registerCommand()`, `pi.on()` |
| **Code execution** | Same Node.js process | Same Node.js process |
| **Versioning** | npm SemVer | npm SemVer |
| **Distribution** | ClawHub marketplace + npm + git | npm + `~/.pi/agent/extensions/*.ts` |

### 2.3 Non-Existent Skill Layer (Grok-build)

Grok-build has no Skill abstraction. The `ToolBridge` (`crates/codegen/xai-grok-tools/src/bridge.rs`) wraps `FinalizedToolset` directly. Three coexisting tool implementations (`grok_build`, `codex`, `opencode`) provide all extensibility.

---

## 3. Skill Discovery Paths

| Project | Discovery Order (priority: latter wins) |
|---|---|
| **Claude Code Best** | (1) Bundled registry (`bundledSkills.ts`), (2) `<cwd>/.claude/skills/` via `loadSkillsDir`, (3) MCP-sourced via `mcpSkillBuilders` |
| **OpenHands SDK** | (1) Public repo (`~/.openhands/skills-cache/extensions/skills/`), (2) `~/.agents/skills/`, `~/.openhands/skills/`, (3) `<cwd>/.agents/skills/`, `<cwd>/.openhands/skills/` + git root walk, (4) third-party files: `AGENTS.md`, `.cursorrules`, `CLAUDE.md`, `gemini.md`, `agents.md`, `agent.md`, `claude.md` ([skill.py:346-352](../../sources/software-agent-sdk/openhands-sdk/openhands/sdk/skills/skill.py#L346-L352)) |
| **Hermes Agent** | (1) `~/.hermes/skills/<category>/<name>/SKILL.md` + external dirs from `skills.external_dirs` config, (2) `skill_manage` tool for runtime activation |
| **OpenClaw** | (1) `~/.openclaw/extensions/` global, (2) `<cwd>/.openclaw/extensions/` project-local, (3) ClawHub registry, (4) npm packages with `openclaw.plugin.json` |
| **Pi Agent** | (1) `~/.pi/agent/extensions/*.ts` global, (2) `<cwd>/.pi/extensions/*.ts` project-local (after trust), (3) `settings.json` `extensions[]` array, (4) npm packages with `"pi"` field, (5) `pi -e ./path.ts` one-off |
| **Grok-build** | N/A — no Skill layer |

---

## 4. Skill Loading Mechanism

| Project | Build Time vs Runtime | Parser | Validation |
|---|---|---|---|
| **Claude Code Best** | Runtime (lazy via `loadSkillsDir`) | Custom YAML frontmatter parser | TypeBox schema per skill |
| **OpenHands SDK** | Runtime (lazy, with TTL cache for public repo) | `python-frontmatter` + `pyyaml` | Pydantic `Skill` model + validators (e.g., `_parse_allowed_tools`, `_convert_metadata_values`) |
| **Hermes Agent** | Runtime (LRU + disk snapshot) | Custom `_strip_yaml_frontmatter` + Hermes-specific field extraction | `skill_matches_platform`, `skill_matches_environment`, `_skill_should_show` |
| **OpenClaw** | Runtime via Plugin Loader | `import()` of npm package | Manifest schema validation + Security Scan |
| **Pi Agent** | Runtime via jiti (no build step) | TypeScript compiler (Bun runtime) | TypeBox schema for tool params |
| **Grok-build** | Compile-time (Rust monorepo) | n/a | Type system enforced |

---

## 5. Skill Execution Model

| Project | How Skill "Runs" | Sandboxing | Code Execution |
|---|---|---|---|
| **Claude Code Best** | Prompt injection into Context; `tool_call` events trigger Hooks; tool execution via `ToolUseContext` | Same Bun process; Claude Code `@anthropic-ai/sandbox-runtime` for opt-in containerization | ❌ No Skill-level code execution |
| **OpenHands SDK** | Skill content injected via `<available_skills>` XML block in system prompt; LLM calls `invoke_skill` tool to load full content on demand | Same Python process; `DockerWorkspace` for sandbox | ❌ No Skill-level code execution |
| **Hermes Agent** | Skill index built via `build_skills_system_prompt()` and injected as system prompt; `skill_manage` tool allows runtime activation | Same Python process | ⚠️ **`learning_graph` system auto-generates Skills** — see security note in §7 |
| **OpenClaw** | Skill contributes to Agent's auto-reply pipeline; `SkillFilter` controls loading | Same Node.js process | ⚠️ TypeScript plugin runs with full process privileges |
| **Pi Agent** | Extension factory function called with `ExtensionAPI`; `registerTool()`, `registerCommand()`, `pi.on()` registers capabilities | Same Node.js process via jiti | ✅ **Full TypeScript code execution** (explicit non-sandbox) |
| **Grok-build** | N/A | N/A | N/A |

---

## 6. Skill Lifecycle / Governance

| Project | Versioning | Approval Workflow | Visibility Scope | Marketplace |
|---|---|---|---|---|
| **Claude Code Best** | ⚠️ file-based, no explicit version | ❌ | ❌ | ❌ |
| **OpenHands SDK** | ✅ `version` field (AgentSkills standard) | ❌ | ❌ (relies on path layout) | ✅ Public repo (`OpenHands/extensions`) with marketplace filtering |
| **Hermes Agent** | ❌ | ❌ | ⚠️ external_dirs read-only, local takes precedence | ❌ |
| **OpenClaw** | ✅ npm SemVer | ⚠️ Security Scan on install | ✅ Per-Channel scoping | ✅ **ClawHub** (official marketplace) |
| **Pi Agent** | ✅ npm SemVer | ❌ | ⚠️ via settings.json + npm scopes | ❌ |
| **Grok-build** | N/A | N/A | N/A | N/A |

---

## 7. Compatibility with Claude Code Skill — Explicit Compatibility Statements

### 7.1 Direct Compatibility (Source Code Evidence)

| Project | Compatible? | Evidence |
|---|---|---|
| **OpenHands SDK** | ✅ **YES — explicitly targets AgentSkills standard** | [`skill.py:193`](../../sources/software-agent-sdk/openhands-sdk/openhands/sdk/skills/skill.py#L193): "AgentSkills standard fields (https://agentskills.io/specification) for cross-platform compatibility"; [`skill.py:299-309`](../../sources/software-agent-sdk/openhands-sdk/openhands/sdk/skills/skill.py#L299-L309) parses `allowed-tools` (Claude Code's field) into Pydantic model; [`skill.py:529`](../../sources/software-agent-sdk/openhands-sdk/openhands/sdk/skills/skill.py#L529) accepts both `disable-model-invocation` and `disable_model_invocation`; [`skill.py:346-352`](../../sources/software-agent-sdk/openhands-sdk/openhands/sdk/skills/skill.py#L346-L352) includes `CLAUDE.md`/`claude.md` in third-party file detection |
| **Claude Code Best** | ✅ Self (the source of the format) | N/A |

### 7.2 Indirect / Partial Compatibility (Project-Specific)

| Project | Compatible? | Evidence |
|---|---|---|
| **Hermes Agent** | ⚠️ Reads `CLAUDE.md` as project instructions but NOT as Skill | [`prompt_builder.py:1975-1982`](../../sources/hermes-agent/agent/prompt_builder.py#L1975-L1982) priority list: HERMES.md → AGENTS.md → CLAUDE.md → .cursorrules. `CLAUDE.md` is read as **system prompt content**, not as a Skill. Hermes SKILL.md format uses custom fields (`platforms`, `conditions`). |
| **OpenClaw** | ❌ No | ClawHub npm package format; no Markdown parsing |
| **Pi Agent** | ❌ No | TypeScript Extension format; Skill content may include SKILL.md loading but core Skill definition is `.ts` |
| **Grok-build** | ❌ No Skill layer at all | N/A |

### 7.3 The AgentSkills Specification — Claude Code's De Facto Standard

Per OpenHands SDK code ([`skill.py:237-292`](../../sources/software-agent-sdk/openhands-sdk/openhands/sdk/skills/skill.py#L237-L292)), the AgentSkills specification defines these fields:

| Field | Type | Purpose |
|---|---|---|
| `name` | string | Skill identifier |
| `description` | string (1-1024 chars) | When to use this skill |
| `version` | string (SemVer) | Skill version |
| `license` | string | Distribution license |
| `compatibility` | string | Environment requirements |
| `metadata` | dict[string, string] | Arbitrary extension data |
| `allowed-tools` | string or list | Pre-approved tools |
| `disable-model-invocation` | bool | Don't advertise to model |

**Claude Code's actual SKILL.md format conforms to this specification.** OpenHands SDK is the only project that explicitly implements it.

---

## 8. Critical Differences Affecting RoboThree Strategy

### 8.1 Three Skill Models — Pick Your Philosophy

| Model | Projects | Pros | Cons |
|---|---|---|---|
| **A. Markdown + YAML frontmatter** | Claude Code Best, OpenHands SDK, Hermes Agent | Easy to author (no code); diff-friendly; marketplace-compatible | Limited to declarative capabilities; no arbitrary code |
| **B. TypeScript/npm package** | OpenClaw, Pi Agent | Full programmatic power; npm distribution | Security risk (full process privileges); higher authoring bar |
| **C. No Skill layer** | Grok-build | Simpler model; Tool is the only extension | No reusable procedural knowledge |

**RoboThree baseline §4.2 already commits to Model A** (declarative Skills with Prompt/Tool/Schema/Rules/etc., no arbitrary scripts).

### 8.2 What Claude Code Skill Has That RoboThree Baseline §4.2 Lacks

| Claude Code Field | RoboThree §4.2 Equivalent? | Recommendation |
|---|---|---|
| `disable-model-invocation` | ❌ | ✅ **Add to RoboThree Manifest** — useful for compliance |
| `user-invocable` | ❌ | ✅ **Add** — slash-command vs LLM-auto-call distinction matters |
| `argument-hint` | ❌ | ✅ **Add** — improves UX for skill invocation |
| `aliases` | ❌ | ✅ **Add** — supports naming flexibility |
| `version` (SemVer) | ✅ mentioned in §4.2 (SkillDefinition / SkillVersion) | ✅ Already covered |
| `context: 'fork'\|'inline'` | ❌ | ⚠️ **Defer** — depends on Subagent design (P1 per baseline §13.3) |
| `hooks` | ✅ mentioned in §4.2 | ✅ Already covered |

### 8.3 What RoboThree Baseline §4.2 Has That Claude Code Skill Lacks

| RoboThree Field | Claude Code Equivalent? | Notes |
|---|---|---|
| **Knowledge Base references** (`knowledge_refs[]`) | ❌ | Enterprise-critical for KB-scoped Skills |
| **Risk level + Permissions** (`risk_level`, `permissions`) | ⚠️ Partial (`allowed-tools` is implicit) | RoboThree needs explicit risk declaration for Permission Engine |
| **Test cases** (`test_cases[]`) | ❌ | Baseline §10.3 explicitly requires testing |
| **Lifecycle states** (Draft/Reviewing/Published/Disabled/Rejected) | ❌ | Baseline §10.4 lifecycle is enterprise governance |
| **Visibility scope** (OwnerOnly/Department/Enterprise) | ❌ | Baseline §10.4 — needs explicit scope |
| **Data classification** | ❌ | Baseline §14.3 PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED |
| **Agent Role binding** (`agent_role_ref`) | ⚠️ Claude Code has `agent` field | Both have it; semantic similar |
| **Hook types** beyond Claude Code's Pre/Post | ✅ Claude Code has Pre/Post only | RoboThree should consider OnApproval/OnError (per baseline §10.3) |

### 8.4 Conclusion: Compatibility Strategy

**RoboThree should ADOPT Model A (Markdown) + extend with Model A enterprise fields.**

Specifically:
1. **Self-contained canonical format** = RoboThree Skill Manifest (baseline §4.2 + Claude Code's missing fields)
2. **Compatibility layer** = recognize Claude Code / AgentSkills standard SKILL.md frontmatter, map to RoboThree fields
3. **Drop unsupported fields gracefully** = Claude Code's `context: 'fork'|'inline'` → ignored if Subagent not supported; `files: Record<string,string>` → mapped to `assets[]` + `prompt_template`

---

## 9. Recommended RoboThree Skill Manifest Field Map

```yaml
# RoboThree Skill Manifest v1 (canonical)
skill:
  # ─── Identity (AgentSkills standard) ───
  name: "tender-analysis"                    # AgentSkills required
  version: "1.2.0"                           # AgentSkills standard
  display_name: "投标分析"
  description: "..."                         # AgentSkills required (1-1024 chars)
  license: "Apache-2.0"                      # AgentSkills standard
  compatibility: "Requires git and docker"   # AgentSkills standard

  # ─── Discovery (Claude Code compatible) ───
  aliases: ["bid-analysis", "tender"]        # Claude Code field
  when_to_use: "..."                         # Claude Code field (semantic equivalent of description)
  argument_hint: "<招标文件路径>"              # Claude Code field
  user_invocable: true                       # Claude Code field
  disable_model_invocation: false            # AgentSkills + Claude Code field

  # ─── Invocation Triggers (OpenHands AgentSkills extension) ───
  triggers: []                               # AgentSkills keyword triggers
  paths: []                                  # AgentSkills path globs
  inputs: []                                 # AgentSkills task input metadata

  # ─── Content ───
  prompt_template: "..."                     # RoboThree preferred (declarative)
  assets: []                                 # RoboThree preferred (vs Claude Code's files map)
  templates: []                              # Output templates

  # ─── Capabilities ───
  tools: []                                  # Explicit tool whitelist
  knowledge_refs: []                         # 🆕 Enterprise — knowledge base bindings
  mcp_tools: {}                              # OpenHands pattern

  # ─── Contracts ───
  input_schema: {}                           # JSON Schema
  output_schema: {}                          # JSON Schema

  # ─── Behavior & Governance (RoboThree enterprise extensions) ───
  rules: []                                  # Business rules
  hooks:                                     # Extended beyond Claude Code's Pre/Post
    pre_run: []
    post_run: []
    on_approval: []
    on_error: []

  risk_level: "medium"                       # 🆕 Enterprise — low/medium/high
  permissions: {}                            # 🆕 Enterprise — filesystem/network/approval
  data_classification: "confidential"        # 🆕 Enterprise — PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED

  # ─── Lifecycle (Baseline §10.4) ───
  lifecycle:
    status: "draft"                          # draft/reviewing/published/disabled/rejected
    scope: "department"                      # owner_only/department/enterprise
    approved_by: null

  test_cases: []                             # 🆕 Baseline §10.3 requirement

  agent_role_ref: "tender-analyst"           # Bind to Agent Role

  # ─── Provenance ───
  source_format: "robothree-native"          # or "claude-code" / "imported"
  original_format_path: null                 # If imported from external Skill
  author: "user@company.com"
  created_at: "2026-07-22"
```

### Mapping Table (Claude Code / AgentSkills → RoboThree)

| Source Field | RoboThree Manifest Field | Transformation |
|---|---|---|
| `name` | `name` | direct |
| `description` | `description` | direct (validate 1-1024 chars) |
| `whenToUse` | `when_to_use` | snake_case |
| `argumentHint` | `argument_hint` | snake_case |
| `allowed-tools` (string or list) | `tools[]` | list → list |
| `disable-model-invocation` | `disable_model_invocation` | snake_case |
| `user-invocable` | `user_invocable` | snake_case |
| `aliases` | `aliases[]` | direct |
| `hooks` (Pre/Post) | `hooks.pre_run / post_run` | rename |
| `context: 'inline'` | (default) | ignore |
| `context: 'fork'` | (deferred — Subagent P1) | warn + ignore for MVP |
| `agent` | `agent_role_ref` | rename |
| `files: Record<string,string>` | `assets[]` + `prompt_template` | split file content by extension/purpose |
| `getPromptForCommand` (function) | `prompt_template` + `inputs[]` | require manual rewrite |
| **AgentSkills `version`** | `version` | direct |
| **AgentSkills `license`** | `license` | direct |
| **AgentSkills `compatibility`** | `compatibility` | direct |
| **AgentSkills `metadata`** | `metadata` | direct |
| **OpenHands `triggers`** | `triggers[]` | direct |
| **OpenHands `paths`** | `paths[]` | direct |
| **OpenHands `inputs`** | `inputs[]` | direct |
| **OpenHands `mcp_tools`** | `mcp_tools{}` | direct |
| **(Claude Code missing)** `knowledge_refs[]` | `knowledge_refs[]` | n/a |
| **(Claude Code missing)** `risk_level` | `risk_level` | n/a |
| **(Claude Code missing)** `permissions` | `permissions{}` | n/a |
| **(Claude Code missing)** `test_cases[]` | `test_cases[]` | n/a |
| **(Claude Code missing)** `lifecycle{}` | `lifecycle{}` | n/a |
| **(Claude Code missing)** `data_classification` | `data_classification` | n/a |

---

## 10. What RoboThree Should NOT Copy from Each Project

| From | Pattern | Why REJECT |
|---|---|---|
| Hermes | `learning_graph` auto-skill-generation | Prompt injection risk; auto-generated Skills could grant unintended tool access. Baseline §10.5 explicitly requires human approval before publishing. |
| OpenClaw | Same-process Skill plugin execution | No process isolation; a malicious Skill could exfiltrate data. Baseline §6 Governance Plane requires sandboxing. |
| Pi Agent | TypeScript extension via jiti | Same as OpenClaw — same-process code execution. Also: requires Node.js runtime, conflicts with baseline §13.1 (Electron + Vue on Windows desktop). |
| Claude Code Best | `feature('ANT_…')` internal codenames | LICENSE_RISK; baseline research rejected this. |

---

## 11. Summary — Compatibility Strategy for RoboThree

| Layer | Decision | Source Project |
|---|---|---|
| **Canonical format** | RoboThree-native Manifest (baseline §4.2 + missing Claude Code fields + enterprise extensions) | Baseline |
| **Markdown Skill files** | ✅ Support SKILL.md format | Claude Code Best + OpenHands SDK (AgentSkills standard) |
| **Claude Code field mapping** | ✅ Map all Claude Code fields; drop `context: 'fork'` until P1 | Claude Code Best |
| **AgentSkills standard fields** | ✅ Support `version` / `license` / `compatibility` / `metadata` | OpenHands SDK |
| **Triggers / paths / inputs** | ✅ Support OpenHands AgentSkills extensions | OpenHands SDK |
| **Plugin/code execution** | ❌ Reject — Skill must be declarative only | Baseline §4.2 |
| **Auto-skill-generation** | ❌ Reject — requires human approval | Baseline §10.5 |
| **Marketplace (P2)** | ⏸ Defer | n/a |
| **Same-process isolation** | ❌ Reject | Pi/OpenClaw (would break baseline Governance Plane) |

**Bottom line**: RoboThree's Skill Manifest should be a **strict superset of the AgentSkills standard** (which Claude Code's SKILL.md conforms to), extended with enterprise governance fields. Import Claude Code Skills via adapter layer that maps frontmatter to RoboThree Manifest; explicitly reject fields that imply code execution or auto-generation.