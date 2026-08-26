# Architecture — Pi Agent

> npm v0.80.7 / commit `c9715af` | TypeScript Monorepo | MIT

## 1. Architectural Overview

Pi Agent is a **four-package, three-layer monorepo** organized as a vertical stack:

```
┌──────────────────────────────────────────────────┐
│                 pi-coding-agent                    │
│  CLI · AgentSession · SessionManager · Extensions │
│  Skills · Compaction · Built-in Tools · Subagents │
├──────────────────────────────────────────────────┤
│                 pi-agent-core                      │
│  AgentHarness · Agent · agentLoop · Tool Pipeline │
│  Context Pipeline · Event Stream · Steering       │
├──────────────────────────────────────────────────┤
│                    pi-ai                           │
│  Model Registry · Provider Adapters · Streaming   │
├──────────────────────────────────────────────────┤
│                    pi-tui                          │
│  Differential Rendering · Components · Input      │
└──────────────────────────────────────────────────┘
```

### 1.1 Core Design Philosophy

Pi follows a **"core minimal + everything via extensions"** philosophy:

- **4 built-in tools only**: `read`, `write`, `edit`, `bash`
- **No built-in permission system**: Delegated to external containerization
- **No built-in MCP/Skills/Subagents in core**: All composed via extensions
- **Three API layers**: Users can operate at `agentLoop` (stateless), `Agent` (stateful), or `AgentHarness` (production) level

### 1.2 Package Responsibilities

| Package | Role | Key Exports |
|---|---|---|
| `pi-ai` | Unified LLM provider abstraction | `Models`, `streamSimple`, provider adapters |
| `pi-agent-core` | Agent runtime engine | `agentLoop`, `Agent`, `AgentHarness`, `AgentTool`, `AgentEvent` |
| `pi-coding-agent` | Application layer (CLI + SDK) | `createAgentSession`, `createAgentSessionRuntime`, `ExtensionAPI` |
| `pi-tui` | Terminal UI framework | Differential renderer, component library |

## 2. Agent Loop Architecture (Core Runtime)

### 2.1 Three-Layer API Design

This is Pi's most distinctive architectural contribution:

| Layer | Class/Function | State | Purpose |
|---|---|---|---|
| **L1** | `agentLoop()` | **Stateless** | Async generator, pure function of inputs |
| **L2** | `class Agent` | **Shared mutable** | Wraps L1 with state + multi-subscriber events |
| **L3** | `class AgentHarness` | **Phase machine** | Adds persistence, hooks, turn snapshots |

```typescript
// L1: Pure generator — testable, embeddable
function agentLoop(
    prompts: AgentMessage[],
    context: AgentContext,
    config: AgentLoopConfig,
    signal?: AbortSignal,
    streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]>;

// L2: Stateful wrapper — for chat UIs
class Agent {
  state: AgentState;          // systemPrompt, model, tools, messages, isStreaming
  subscribe(fn): () => void;  // Multi-subscriber event dispatch
  prompt(msg): Promise<void>;
  steer(msg): void;           // Interrupt at turn boundary
  followUp(msg): void;         // Queue after agent stops
  abort(): void;
}

// L3: Production harness — phase state machine + persistence
class AgentHarness {
  // Phase-gated operations: prompt/compact/navigate only in "idle"
  // steer/followUp/abort only in "turn"
  // Turn snapshots prevent config races
}
```

### 2.2 Double-Loop Structure

```
OUTER LOOP (follow-up messages):
  while (true):
    INNER LOOP (turns):
      while (hasMoreToolCalls || pendingMessages):
        1. Drain steering queue → inject user messages
        2. Build context (transformContext → convertToLlm)
        3. Call LLM (streamAssistantResponse)
        4. Parse tool calls from response
        5. Execute tools (parallel or sequential)
        6. Push tool results into context
        7. Emit turn_end
        8. prepareNextTurn save point
        9. shouldStopAfterTurn? → exit
        10. Poll steering queue
    Check follow-up queue → restart outer loop or break
```

### 2.3 Event Protocol

Pi uses a richly typed event stream as its universal interface:

```
agent_start
  turn_start
    message_start  { userMsg }
    message_end    { userMsg }
    message_start  { assistant partial }
    message_update { delta } × N        ← streaming chunks
    message_end    { complete assistant }
    [tool_execution_start ...]           ← if tool calls
    [message_start/message_end toolResult]
  turn_end
  [repeat inner loop if more tool calls]
agent_end  { messages: AgentMessage[] }
```

### 2.4 Tool Execution Modes

| Mode | Behavior | Trigger |
|---|---|---|
| **Parallel** (default) | Preflight sequentially, execute concurrently, emit results in source order | Default |
| **Sequential** | Execute one-at-a-time in order | Global `toolExecution: "sequential"` or any tool has `executionMode: "sequential"` |

**Important**: One sequential tool in a batch downgrades the entire batch to sequential.

### 2.5 Tool Pipeline (5 Steps)

```
Define → Register → Intercept (beforeToolCall) → Execute → Reclaim (afterToolCall)
```

- `beforeToolCall`: Can **block** execution (`{ block: true, reason }`)
- `afterToolCall`: Can modify results or set `terminate: true` to skip follow-up LLM call
- `terminate`: Batch only stops if ALL tools terminate; mixed batches continue

## 3. Extension System Architecture

### 3.1 Philosophy

Extensions are Pi's **primary extension mechanism**. Everything beyond the 4 core tools is built as an extension:

- Skills → Extension that loads `SKILL.md` on demand
- Subagents → Extension that spawns child `pi` processes
- MCP → Extension that connects to MCP servers
- Sandboxing → Extension that routes tools into containers
- Permission gates → Extension that blocks on `tool_call` events
- Path protection → Extension that restricts file access

### 3.2 Architecture

```
┌─────────────────────────────────────┐
│           Extension Loader           │
│  jiti (runtime TS, no build step)    │
├─────────────────────────────────────┤
│  Discovery:                          │
│  ~/.pi/agent/extensions/*.ts         │
│  .pi/extensions/*.ts                 │
│  settings.json extensions[]          │
│  npm packages with "pi" field        │
├─────────────────────────────────────┤
│  Lifecycle:                          │
│  extension_factory(pi: ExtensionAPI) │
│  → registers tools, hooks, commands  │
└─────────────────────────────────────┘
```

### 3.3 Lifecycle Events (14+ events)

```
project_trust
session_start → resources_discover
  before_agent_start
  agent_start
    turn_start
      context (can modify messages)
      before_provider_headers
      before_provider_request → after_provider_response
      [tool_call (can block!) → tool_result (can modify)]
    turn_end
  agent_end → agent_settled
session_before_compact → session_compact
session_before_switch / session_before_fork → session_shutdown
```

### 3.4 Extension Capabilities

| Capability | API | Description |
|---|---|---|
| Custom tools | `pi.registerTool(def)` | TypeBox-validated tool the LLM can call |
| Slash commands | `pi.registerCommand(name, def)` | `/my-command` in TUI |
| Keyboard shortcuts | `pi.registerShortcut(key, def)` | Custom keybindings |
| CLI flags | `pi.registerFlag(name, def)` | `pi --my-flag` |
| Custom providers | `pi.registerProvider(name, cfg)` | Additional LLM backends |
| Dynamic tool control | `pi.setActiveTools(names)` | Toggle which tools the model sees |
| Session persistence | `pi.appendEntry(entry)` | Write custom data to JSONL |
| UI interaction | `ctx.ui.confirm/select/input/notify/custom` | Interactive TUI dialogs |

## 4. Session & Context Architecture

### 4.1 Tree-Structured Sessions

Sessions are **append-only JSONL files** forming a logical tree:

```jsonl
{"id":"1","type":"message","role":"user","content":[...]}
{"id":"2","parentId":"1","type":"message","role":"assistant","content":[...]}
{"id":"3","parentId":"2","type":"message","role":"toolResult",...}
{"id":"4","type":"leaf","entryId":"3"}
```

Key properties:
- **Append-only**: No updates or deletes — crash-safe by design
- **Tree via parentId**: Each entry knows its parent, enabling branching
- **Leaf pointer**: Durable pointer to current position; advancing it creates branches
- **Two fork strategies**: `navigateTree()` (in-file branch) and `fork()` (new file branch)

### 4.2 Two-Stage Context Pipeline

```
AgentMessage[] (rich, 7+ types, app-custom)
    │
    ▼ transformContext()  ← Optional: prune, inject resources, compact
    │
AgentMessage[] (filtered)
    │
    ▼ convertToLlm()      ← Required: filter UI-only, convert to 3 LLM types
    │
Message[] (user | assistant | toolResult)
    │
    ▼ LLM API call
```

### 4.3 Compaction

Compaction inserts a summary entry into the session tree:
- `compaction` entry contains a summary + `firstKeptEntryId` marker
- On context rebuild, entries **before** the compaction are replaced with the summary
- Entries **after** `firstKeptEntryId` are kept verbatim
- Can be triggered manually (`compact()`) or auto-triggered by threshold

### 4.4 AgentHarness Phase State Machine

```typescript
type AgentHarnessPhase = "idle" | "turn" | "compaction" | "branch_summary" | "retry";
```

- Structural ops (`prompt`, `compact`, `navigateTree`) require `"idle"`
- Steer ops (`steer`, `followUp`, `abort`) require `"turn"`
- Violation throws `AgentHarnessError("busy")`
- Turn snapshots freeze `model`/`tools`/`systemPrompt` for entire turn duration

## 5. Permission & Security Architecture

### 5.1 Explicit Non-Design

Pi has **no built-in permission system**. This is an explicit architectural decision:

```text
Source: Security policy (github.com/earendil-works/pi/security)
- Pi treats local user account and writable files as same trust boundary
- User responsible for monitoring or containing Pi
- Out of scope: sandboxing, prompt injection, untrusted extensions/skills/repos
```

### 5.2 Three Containerization Strategies

| Strategy | What's Isolated | Mechanism |
|---|---|---|
| **Gondolin** | Built-in tools + `!` commands | Linux micro-VM (QEMU), host FS mount at `/workspace` |
| **Plain Docker** | Whole `pi` process | Docker container with volume mounts |
| **OpenShell** | Whole `pi` process (policy-controlled) | NVIDIA OpenShell gateway; filesystem/process/network/credential/inference controls |

### 5.3 Extension-Based Permission Gating

While Pi has no native permissions, extensions can implement ad-hoc gating:

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "bash" && isDangerous(event.input.command)) {
    const ok = await ctx.ui.confirm("Dangerous command", "Proceed?");
    if (!ok) return { block: true, reason: "Blocked by user" };
  }
});
```

This is **confirmation-based, not policy-based** — no deny-by-default, no RBAC, no capability tokens.

### 5.4 Security Posture Assessment

| Concern | Status | Notes |
|---|---|---|
| **Filesystem isolation** | ❌ None by default | Opt-in via containers |
| **Process isolation** | ❌ None by default | Same process as user |
| **Network restriction** | ❌ None by default | Opt-in via containers |
| **Credential protection** | ⚠️ API keys in env vars | OpenShell can inject from outside sandbox |
| **Prompt injection defense** | ❌ Explicitly out of scope | Trusted repos/extensions only |
| **Extension sandboxing** | ❌ None | Extensions run with full process privileges |

## 6. Deployment Model

Pi is a **local-first CLI tool** with optional containerized deployment:

- **Primary**: Local Node.js process on developer workstation
- **Containerized**: Docker / Gondolin micro-VM / OpenShell sandbox
- **Headless**: SDK mode for programmatic embedding
- **Remote**: Not natively supported; OpenShell can back with remote k8s

No cloud control plane, no remote workers, no gateway in the default architecture.

## 7. Observability

- **Event stream**: The primary observability mechanism — all state changes flow through typed events
- **JSONL session files**: Append-only audit log of all messages + tool calls
- **No built-in metrics/tracing**: No OpenTelemetry, no Prometheus endpoints
- **Extension-based logging**: Custom events can be appended via `pi.appendEntry()`
