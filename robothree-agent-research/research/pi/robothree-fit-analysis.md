# RoboThree Fit Analysis — Pi Agent

> npm v0.80.7 / commit `c9715af` | L3 Deep Dive Complete

## 1. Summary of Recommendations

| # | Mechanism | Verdict | MVP Priority |
|---|---|---|---|
| 1 | Three-Layer Agent API | **ADAPT** | P1 — Core architecture |
| 2 | Turn Snapshots | **ADOPT** | P1 — Prevents config race bugs |
| 3 | Event Stream as Universal Interface | **ADAPT** | P1 — Core communication |
| 4 | Steering + FollowUp Dual Queue | **ADAPT** | P2 — Control flow |
| 5 | Three Dispatch Strategies (Bail/Waterfall/F&F) | **ADOPT** | P1 — Extension safety |
| 6 | Unified ExtensionAPI | **ADAPT** | P1 — Plugin architecture |
| 7 | Deferral Pattern (Dynamic Tool Control) | **ADOPT** | P2 — Context efficiency |
| 8 | Append-Only JSONL Sessions | **ADOPT** | P1 — Persistence |
| 9 | Tree-Structured Sessions with Fork | **ADAPT** | P2 — Branching |
| 10 | Two-Stage Context Pipeline | **ADOPT** | P1 — Context engineering |
| 11 | Declaration Merging for Custom Messages | **ADAPT** | P2 — Type-safe extensibility |
| 12 | Compaction as Tree Entry | **ADAPT** | P2 — Context management |
| 13 | "Core Minimal + Extensions" Philosophy | **ADOPT** | P1 — Product philosophy |
| 14 | No Built-in Permissions | **REJECT** | P1 — Security |
| 15 | Extension Same-Process Loading | **REJECT** | P1 — Security isolation |
| 16 | jiti Runtime Loading | **DEFER** | P3 — Nice-to-have |

## 2. Detailed Recommendations

### #1: Three-Layer Agent API → ADAPT

**What Pi does**: Separates agent runtime into `agentLoop()` (stateless generator) → `Agent` (stateful event hub) → `AgentHarness` (phase machine).

**Recommendation**: ADAPT the pattern but with different layer boundaries for RoboThree.

**Reasoning**:
- The three-layer concept is Pi's strongest architectural contribution
- RoboThree's layers should differ: `CoreLoop` (stateless, sync context) → `AgentRuntime` (stateful, async sessions, tool reg) → `AgentService` (multi-tenant, persistence, auth)
- The generator pattern is elegant but may not fit Go/Rust implementation

**Evidence**: [agent-loop-three-layer.md](agent-loop-three-layer.md) §1-2; [architecture.md](architecture.md) §2.1

**Applicable Boundary**: RoboThree Core Runtime module

**Risk**: Over-engineering — MVP may only need 2 layers. Start with L1+L2, add L3 when multi-tenancy needed.

**MVP**: P1. Two-layer is sufficient for MVP; leave third layer for post-MVP.

### #2: Turn Snapshots → ADOPT

**What Pi does**: `createTurnState()` freezes model/tools/systemPrompt for entire turn duration.

**Recommendation**: ADOPT directly. This is a low-cost, high-value pattern.

**Reasoning**:
- Prevents mid-turn config mutation bugs without complex locking
- Essential for any system that allows runtime tool/model changes
- Implementation is trivial (snapshot on turn start, read from snapshot during turn)

**Evidence**: [agent-loop-three-layer.md](agent-loop-three-layer.md) §1.3, §3.5; [architecture.md](architecture.md) §2.2

**Applicable Boundary**: RoboThree Agent Runtime — turn lifecycle

**Risk**: One-turn latency for config changes (acceptable; documented behavior)

**MVP**: P1. Implement from day one — retrofitting is harder.

### #3: Event Stream as Universal Interface → ADAPT

**What Pi does**: Typed discriminated union of AgentEvent types flows through all layers.

**Recommendation**: ADAPT with RoboThree-specific event taxonomy.

**Reasoning**:
- Events as the contract between layers is the right pattern
- Pi's event types are coding-agent-specific; RoboThree needs a generalized taxonomy
- The `agent_start → turn_start → message_* → tool_execution_* → turn_end → agent_end` structure is reusable

**Evidence**: [runtime-sequence.md](runtime-sequence.md) §2 (Hop Evidence Table), §1.2 (Mermaid); [architecture.md](architecture.md) §2.3

**Applicable Boundary**: All RoboThree modules

**Risk**: Event type explosion — define a minimal core set, extend via the same declaration merging pattern

**MVP**: P1. Define core event taxonomy before implementing any consumer.

### #4: Steering + FollowUp Dual Queue → ADAPT

**What Pi does**: Steering interrupts at turn boundaries; FollowUp extends finished conversations.

**Recommendation**: ADAPT as first-class control signals with separate channels.

**Reasoning**:
- The "interrupt vs extend" distinction is valuable and not obvious
- Pi's implementation is tightly coupled to the double-loop; RoboThree should generalize
- Consider: `ControlSignal { type: "interrupt" | "resume" | "retry" | "cancel" }` as a unified control channel

**Evidence**: [runtime-sequence.md](runtime-sequence.md) §3.3; [agent-loop-three-layer.md](agent-loop-three-layer.md) §3.2

**Applicable Boundary**: RoboThree Agent Runtime — control plane

**Risk**: Over-generalization — start with interrupt + resume only; add retry/cancel later

**MVP**: P2. Useful but not blocking for MVP.

### #5: Three Dispatch Strategies → ADOPT

**What Pi does**: Bail (short-circuit), Waterfall (chain transform), Fire-and-forget (observe).

**Recommendation**: ADOPT directly. These three patterns cover all event handling semantics.

**Reasoning**:
- Bail = permission gates: first "no" wins
- Waterfall = transformation pipelines: each handler enriches
- Fire-and-forget = observability: logging, metrics, UI updates
- This taxonomy is general and not Pi-specific

**Evidence**: [extension-system.md](extension-system.md) §3.2; [architecture.md](architecture.md) §2.5

**Applicable Boundary**: RoboThree Extension/Hook system

**Risk**: Waterfall chains are hard to debug — add tracing IDs to each transform step

**MVP**: P1. Define dispatch strategy per hook type from day one.

### #6: Unified ExtensionAPI → ADAPT

**What Pi does**: Single `pi` object exposes `registerTool`, `on`, `registerCommand`, etc.

**Recommendation**: ADAPT with RoboThree-specific capabilities + isolation.

**Reasoning**:
- Unified API surface (one object, not separate registries) is the right DX
- RoboThree needs additional registrations: `registerMemory`, `registerSkill`, `registerSandbox`
- MUST add isolation (Pi's same-process model is rejected, see #15)

**Evidence**: [extension-system.md](extension-system.md) §2; [architecture.md](architecture.md) §3

**Applicable Boundary**: RoboThree Extension/Plugin system

**Risk**: API surface bloat — version the ExtensionAPI, use capability negotiation

**MVP**: P1. Core ExtensionAPI must be stable before accepting community extensions.

### #7: Deferral Pattern (Dynamic Tool Control) → ADOPT

**What Pi does**: `registerTool` registers always; `setActiveTools` controls visibility.

**Recommendation**: ADOPT directly. Critical for context window management.

**Reasoning**:
- As tool count grows (MCP servers, skills, custom tools), context bloat is inevitable
- Deferral allows registering hundreds of tools while only exposing 5-10 to the LLM
- Tool discovery can be on-demand (search/activate pattern) rather than always-injected

**Evidence**: [extension-system.md](extension-system.md) §4.2

**Applicable Boundary**: RoboThree Tool Runtime

**Risk**: Too-aggressive deferral means LLM can't discover tools — balance with capability descriptions

**MVP**: P2. Start with all tools active; add deferral when tool count > 20.

### #8: Append-Only JSONL Sessions → ADOPT

**What Pi does**: JSONL files with append-only writes, parentId links, and leaf pointers.

**Recommendation**: ADOPT directly. This is the right persistence model for RoboThree sessions.

**Reasoning**:
- Crash-safe by construction (no in-place mutation)
- Git-friendly (line-by-line diffs)
- Human-readable (standard JSONL tools)
- Supports branching naturally (parentId graph)
- Easy to implement (no database needed for MVP)

**Evidence**: [session-context-pipeline.md](session-context-pipeline.md) §1

**Applicable Boundary**: RoboThree Session Store

**Risk**: Unbounded growth for long-running agents — must pair with reliable compaction

**MVP**: P1. Default session format.

### #9: Tree-Structured Sessions with Fork → ADAPT

**What Pi does**: Two fork strategies — `navigateTree` (in-file branch) and `fork` (new file branch).

**Recommendation**: ADAPT with a third strategy: shallow fork (shared pre-fork portion).

**Reasoning**:
- Tree structure is essential for exploratory agent workflows
- Two strategies cover different use cases well
- Shallow fork avoids duplication when branching from early checkpoints (common case)
- RoboThree should also support "merge" (combining branch results) — not in Pi

**Evidence**: [session-context-pipeline.md](session-context-pipeline.md) §1.3

**Applicable Boundary**: RoboThree Session Manager

**Risk**: Tree complexity grows with branches — add garbage collection for dead branches

**MVP**: P2. Linear sessions sufficient for MVP; branching for post-MVP exploration workflows.

### #10: Two-Stage Context Pipeline → ADOPT

**What Pi does**: `transformContext` (AgentMessage → AgentMessage) then `convertToLlm` (AgentMessage → LLM Message).

**Recommendation**: ADOPT directly. Clean separation of concerns.

**Reasoning**:
- Stage 1 (message-level transforms): pruning, injection, RAG, compaction — operates on rich types
- Stage 2 (format conversion): type normalization, role mapping — pure function, no side effects
- This separation makes each stage independently testable
- RoboThree should add a Stage 0: token budget calculator (estimate before transform)

**Evidence**: [session-context-pipeline.md](session-context-pipeline.md) §2; [runtime-sequence.md](runtime-sequence.md) §H10a-H10b

**Applicable Boundary**: RoboThree Context Engine

**Risk**: transformContext can be expensive — cache results when messages haven't changed

**MVP**: P1. Implement both stages from day one.

### #11: Declaration Merging for Custom Messages → ADAPT

**What Pi does**: TypeScript declaration merging on `CustomAgentMessages` interface.

**Recommendation**: ADAPT for TypeScript consumers; provide alternative for other languages.

**Reasoning**:
- Zero-runtime-cost type extension — brilliant in TypeScript
- RoboThree may support multiple language bindings (Go, Python)
- Alternative: protobuf `Any` or JSON Schema `$ref` for cross-language message extension

**Evidence**: [session-context-pipeline.md](session-context-pipeline.md) §2.4

**Applicable Boundary**: RoboThree Message type system

**Risk**: Type-only extension doesn't enforce runtime validation — add schema validation at convertToLlm

**MVP**: P2. Start with fixed message types; add extensibility when needed.

### #12: Compaction as Tree Entry → ADAPT

**What Pi does**: Inserts compaction entry into session tree; context rebuild reads it as summary.

**Recommendation**: ADAPT with Pi's known bugs fixed.

**Reasoning**:
- Embedding compaction in the tree is elegant — same append-only guarantees
- But Pi's implementation has races (#3660, #5512)
- RoboThree must: (a) check budget BEFORE context assembly, not after overflow; (b) guard mid-turn context against tool-loop growth

**Evidence**: [session-context-pipeline.md](session-context-pipeline.md) §3; [architecture.md](architecture.md) §4.3

**Applicable Boundary**: RoboThree Context Engine

**Risk**: Summary quality directly affects agent performance — invest in compaction prompt engineering

**MVP**: P2. Start with hard context limit; add smart compaction after.

### #13: "Core Minimal + Extensions" Philosophy → ADOPT

**What Pi does**: 4 built-in tools; everything else via extensions.

**Recommendation**: ADOPT as RoboThree's product philosophy.

**Reasoning**:
- Keeps core auditable and maintainable
- Allows ecosystem to innovate at extension speed (not core release speed)
- Forces discipline: "should this be core?" is a high bar
- Pi's success (1.2M weekly downloads, rich extension ecosystem) validates this approach

**Evidence**: [architecture.md](architecture.md) §1.1; [extension-system.md](extension-system.md) §1

**Applicable Boundary**: RoboThree product strategy

**Risk**: Core too minimal = bad out-of-box experience. Ship with 5-8 well-chosen built-in tools.

**MVP**: P1. Define core vs extension boundary before writing any code.

### #14: No Built-in Permissions → REJECT

**What Pi does**: Delegates all security to external containerization; no permission checks in agent loop.

**Recommendation**: REJECT for RoboThree. Permission system must be built-in from day one.

**Reasoning**:
- Pi's "user is responsible" model is unacceptable for a multi-tenant or shared agent platform
- RoboThree's use case likely involves running untrusted or semi-trusted agent tasks
- Permission must be deny-by-default, checked before tool execution, not opt-in via containers
- Can still support containerization as defense-in-depth, but not as the only security layer

**Evidence**: [architecture.md](architecture.md) §5; project security policy

**Applicable Boundary**: RoboThree Security module

**Risk**: Permission system adds latency to every tool call — must be fast-path optimized

**MVP**: P1. Non-negotiable for security posture.

### #15: Extension Same-Process Loading → REJECT

**What Pi does**: Extensions run in the same Node.js process via jiti.

**Recommendation**: REJECT for RoboThree. Extensions must be isolated.

**Reasoning**:
- Same-process extensions can crash the agent, access all memory, exfiltrate data
- Pi trusts users to vet extensions — RoboThree cannot make this assumption
- RoboThree should use a Worker pattern: extensions run in isolated threads/processes with capability tokens

**Evidence**: [extension-system.md](extension-system.md) §5.1; [architecture.md](architecture.md) §5.4

**Applicable Boundary**: RoboThree Extension Runtime

**Risk**: Isolation adds complexity and IPC overhead — start with WASM sandbox for lightweight isolation

**MVP**: P1. Extension isolation is a hard requirement.

### #16: jiti Runtime Loading → DEFER

**What Pi does**: Loads TypeScript extensions at runtime via jiti (no build step).

**Recommendation**: DEFER. Nice developer experience, but not essential for RoboThree MVP.

**Reasoning**:
- Hot-reload development loop is valuable for extension authors
- But requires Node.js runtime (jiti-specific)
- RoboThree's extension language may not be TypeScript/JavaScript
- Pre-compiled extensions with a runtime validation step are sufficient for MVP

**Evidence**: [extension-system.md](extension-system.md) §1.2, §5.2

**Applicable Boundary**: RoboThree Extension SDK

**Risk**: Skipping hot-reload slows extension development — mitigate with good testing tools

**MVP**: P3. Post-MVP developer experience investment.

## 3. Cross-Cutting Themes

### Theme 1: "Separation of Concerns by Layer"

Pi's strongest contribution is clean layering: stateless loop / stateful agent / production harness. RoboThree should adopt this layering philosophy across all modules (not just the agent loop).

### Theme 2: "Events as Contracts"

Pi treats events as the universal interface between all components. RoboThree should adopt this pattern: every module boundary should be defined by typed events, not direct function calls.

### Theme 3: "Tree Data, Linear Consumption"

Pi stores data as trees (sessions, context) but always produces linear arrays for LLM consumption. RoboThree should adopt this pattern for all LLM-facing data.

### Theme 4: "Extensions Are First-Class, Not Add-Ons"

Pi's architecture treats extensions as the primary mechanism for adding capabilities. RoboThree should design its extension API before implementing core features, ensuring core features could be implemented as extensions.

## 4. Proposed RoboThree Changes

> These are candidate changes to RoboThree module boundaries / tech stack / data model / security model / deployment. **Proposals only — not auto-applied.**

### Module Boundary Changes

1. **Split Agent Runtime into 3 layers**: `CoreLoop` → `AgentRuntime` → `AgentService`
2. **Add Extension Runtime module**: Separate from Agent Runtime; handles isolation, lifecycle, capability tokens
3. **Add Context Engine module**: Separate from Agent Runtime; handles transform pipeline, compaction, token budget

### Data Model Changes

4. **Session format**: Append-only JSONL with parentId tree + leaf pointer
5. **Message type system**: Rich internal AgentMessage → LLM Message via two-stage pipeline
6. **Compaction**: Tree-embedded compaction entries with pre-turn budget checking

### Security Model Changes

7. **Permission system**: Deny-by-default, tool-level, checked before every execution
8. **Extension isolation**: Worker threads/WASM with capability tokens
9. **Defense-in-depth**: Containerization as additional layer, not primary security

### Deployment Changes

10. **Session persistence**: Local JSONL for single-user; pluggable backend for multi-tenant

## 5. Requires Human Approval

> The following items need explicit user approval before becoming RoboThree architecture decisions. Default status: `PENDING_HUMAN_DECISION`.

| # | Decision | Why It Needs Approval | Status |
|---|---|---|---|
| D1 | Three-layer agent API as core architecture pattern | Determines entire runtime module structure | PENDING_HUMAN_DECISION |
| D2 | Append-only JSONL as default session format | Commits to a specific persistence model with trade-offs | PENDING_HUMAN_DECISION |
| D3 | "Core minimal + extensions" as product philosophy | Determines which features ship in MVP vs post-MVP | PENDING_HUMAN_DECISION |
| D4 | Deny-by-default permission system (rejecting Pi's approach) | Significant engineering investment; affects all tool execution | PENDING_HUMAN_DECISION |
| D5 | Extension isolation via Worker/WASM (rejecting Pi's approach) | Affects extension developer experience and runtime complexity | PENDING_HUMAN_DECISION |
| D6 | Event stream as universal inter-module interface | Forces all modules to adopt event-based communication | PENDING_HUMAN_DECISION |
