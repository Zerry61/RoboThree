# Source Map — Pi Agent

## 1. Repository Structure (npm v0.80.7 / commit `c9715af`)

```
pi/                                    # Monorepo root
├── package.json                       # workspaces: ["packages/*"]
├── LICENSE                            # MIT
├── README.md
├── packages/
│   ├── ai/                            # @earendil-works/pi-ai
│   │   ├── src/
│   │   │   ├── models.ts              # Model registry, provider definitions
│   │   │   ├── stream.ts              # streamSimple(), streamMessages()
│   │   │   ├── providers/             # Per-provider adapters
│   │   │   │   ├── anthropic.ts       # Anthropic Claude adapter
│   │   │   │   ├── openai.ts          # OpenAI adapter
│   │   │   │   ├── google.ts          # Google Gemini adapter
│   │   │   │   └── openrouter.ts      # OpenRouter adapter
│   │   │   └── types.ts               # Message, Tool, Context types
│   │   └── package.json
│   │
│   ├── agent/                         # @earendil-works/pi-agent-core
│   │   ├── src/
│   │   │   ├── agent-loop.ts          # ★ agentLoop() — stateless async generator
│   │   │   ├── agent.ts               # ★ Agent class — stateful wrapper
│   │   │   ├── types.ts               # AgentMessage, AgentEvent, AgentTool, AgentContext
│   │   │   ├── tools/
│   │   │   │   ├── execute.ts         # executeToolCalls, parallel/sequential dispatch
│   │   │   │   ├── tool-registry.ts   # Tool registration & schema validation
│   │   │   │   └── tool-pipeline.ts   # beforeToolCall → execute → afterToolCall
│   │   │   ├── context/
│   │   │   │   ├── transform.ts       # transformContext hook interface
│   │   │   │   └── convert.ts         # convertToLlm — AgentMessage → LLM Message
│   │   │   ├── events/
│   │   │   │   └── event-types.ts     # AgentEvent discriminated union
│   │   │   ├── steer/
│   │   │   │   └── steering.ts        # Steering & follow-up queue interfaces
│   │   │   └── harness/
│   │   │       └── agent-harness.ts   # ★ AgentHarness — phase state machine
│   │   ├── docs/
│   │   │   └── agent-harness.md       # Harness design documentation
│   │   └── package.json
│   │
│   ├── coding-agent/                  # @earendil-works/pi-coding-agent
│   │   ├── src/
│   │   │   ├── cli.ts                 # ★ CLI entry point (pi binary)
│   │   │   ├── sdk.ts                 # ★ createAgentSession(), createAgentSessionRuntime()
│   │   │   ├── session/
│   │   │   │   ├── agent-session.ts   # AgentSession — high-level orchestrator
│   │   │   │   ├── session-manager.ts # SessionManager — JSONL persistence
│   │   │   │   ├── session-runtime.ts # AgentSessionRuntime — lifecycle management
│   │   │   │   └── session-tree.ts    # Tree navigation, fork, leaf management
│   │   │   ├── extensions/
│   │   │   │   ├── extension-api.ts   # ★ ExtensionAPI type definition
│   │   │   │   ├── extension-loader.ts# jiti-based discovery & loading
│   │   │   │   └── extension-context.ts# ExtensionContext (ui, exec, cwd, events)
│   │   │   ├── tools/
│   │   │   │   ├── builtin/
│   │   │   │   │   ├── read.ts        # File read tool
│   │   │   │   │   ├── write.ts       # File write tool
│   │   │   │   │   ├── edit.ts        # File edit tool
│   │   │   │   │   └── bash.ts        # Shell execution tool
│   │   │   │   ├── grep.ts            # Content search tool
│   │   │   │   ├── find.ts            # File search tool
│   │   │   │   └── ls.ts             # Directory listing tool
│   │   │   ├── compaction/
│   │   │   │   └── compactor.ts       # Auto & manual context compaction
│   │   │   ├── skills/
│   │   │   │   └── skill-loader.ts    # Skill discovery & loading
│   │   │   └── subagent/
│   │   │       └── subagent.ts        # Subagent spawning & IPC
│   │   ├── docs/
│   │   │   ├── sdk.md                 # SDK documentation
│   │   │   ├── extensions.md          # Extension system documentation
│   │   │   ├── containerization.md    # Sandboxing patterns
│   │   │   └── skills.md              # Skills system documentation
│   │   └── package.json
│   │
│   └── tui/                           # @earendil-works/pi-tui
│       ├── src/
│       │   ├── renderer.ts            # Differential terminal renderer
│       │   ├── components/            # TUI component library
│       │   └── input.ts               # Keyboard input handling
│       └── package.json
│
├── extensions/                        # Official extension ecosystem
└── docs/                              # Top-level docs
```

## 2. Real Entry Points

| Entry | Symbol | File (relative to repo root) | Consumer |
|---|---|---|---|
| **CLI** | `main()` or default export | `packages/coding-agent/src/cli.ts` | `npx pi` / `pi` binary |
| **SDK: Session** | `createAgentSession()` | `packages/coding-agent/src/sdk.ts` | Programmatic embedding |
| **SDK: Runtime** | `createAgentSessionRuntime()` | `packages/coding-agent/src/sdk.ts` | Multi-session management |
| **Core Loop** | `agentLoop()` | `packages/agent/src/agent-loop.ts` | Direct consumers wanting raw loop |
| **Core Agent** | `class Agent` | `packages/agent/src/agent.ts` | Browser UIs, alt frontends |
| **Core Harness** | `class AgentHarness` | `packages/agent/src/harness/agent-harness.ts` | Production backends |

## 3. Key Type Definitions

### AgentMessage (7+ types via declaration merging)

```typescript
// packages/agent/src/types.ts
type AgentMessage =
  | { role: "user"; content: ContentBlock[] }
  | { role: "assistant"; content: ContentBlock[] }
  | { role: "toolResult"; toolCallId: string; content: ContentBlock[] }
  | CustomAgentMessages  // TypeScript declaration merging for extensibility
```

### AgentTool (TypeBox-validated)

```typescript
// packages/agent/src/types.ts
interface AgentTool<TParams = any> {
  name: string;
  label?: string;
  description: string;
  parameters: TSchema;             // TypeBox schema
  execute: (toolCallId, params, signal, onUpdate, ctx) => Promise<ToolResult>;
  executionMode?: "sequential";
  renderCall?: RenderFn;
  renderResult?: RenderFn;
}
```

### AgentEvent (discriminated union)

```typescript
// packages/agent/src/events/event-types.ts
type AgentEvent =
  | { type: "agent_start"; ... }
  | { type: "turn_start"; ... }
  | { type: "message_start" | "message_update" | "message_end"; ... }
  | { type: "tool_execution_start" | "tool_execution_update" | "tool_execution_end"; ... }
  | { type: "turn_end"; ... }
  | { type: "agent_end"; messages: AgentMessage[] }
```

### ExtensionAPI

```typescript
// packages/coding-agent/src/extensions/extension-api.ts
interface ExtensionAPI {
  on(event, handler): void;           // Lifecycle hooks
  registerTool(def): void;            // Custom tools
  registerCommand(name, def): void;   // Slash commands
  registerShortcut(key, def): void;   // Keyboard bindings
  registerFlag(name, def): void;      // CLI flags
  registerProvider(name, cfg): void;  // Custom LLM providers
  getAllTools(): string[];
  getActiveTools(): string[];
  setActiveTools(names): void;        // Dynamic tool toggle
  appendEntry(entry): void;           // Persist to session JSONL
}
```

## 4. Key Configurations

| Config | Location | Purpose |
|---|---|---|
| `settings.json` | `~/.pi/agent/settings.json` | Global Pi settings (model, extensions, packages) |
| `.pi/` | Project root | Project-local extensions, skills, prompts |
| `~/.pi/agent/extensions/` | User home | Global extensions (all projects) |
| `~/.pi/agent/skills/` | User home | Global skills |
| `.pi/skills/` | Project root | Project-local skills |
| `.pi/extensions/` | Project root | Project-local extensions (after trust) |

## 5. Dependency Flow

```
┌─────────────────────────────────────────────┐
│                  pi (CLI)                     │
│  User types prompt → TUI renders response     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           pi-coding-agent                     │
│  AgentSession → SessionManager → Extensions   │
│  Skills → Compaction → Built-in Tools         │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           pi-agent-core                       │
│  AgentHarness → Agent → agentLoop             │
│  Tool Pipeline → Context Pipeline → Events    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              pi-ai                            │
│  Models → streamSimple → Provider Adapters    │
└─────────────────────────────────────────────┘
```
