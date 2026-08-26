# Deep Dive 2: Extension System

> L3 Mechanism #2 | npm v0.80.7 / commit `c9715af`

## Executive Summary

Pi's Extension system is the **architectural backbone** that enables Pi's "core minimal" philosophy. Only 4 built-in tools exist; everything else — skills, subagents, MCP, sandboxing, permission gates, SSH execution, custom editors, plan mode — is composed via TypeScript extensions loaded at runtime by jiti. The system provides 14+ lifecycle hooks, a unified `ExtensionAPI` for tool/command/shortcut/flag registration, and three distinct event dispatch strategies (Bail, Waterfall, Fire-and-forget).

## 1. Extension Lifecycle: From Discovery to Execution

### 1.1 Discovery Paths (5 sources)

```
Priority order (latter overrides former for same key):
1. ~/.pi/agent/extensions/*.ts or */index.ts     ← Global (all projects)
2. .pi/extensions/*.ts or */index.ts              ← Project-local (after trust)
3. settings.json extensions[] array               ← Explicit paths
4. settings.json packages[] array                 ← npm packages with "pi" field
5. CLI flag: pi -e ./path.ts                      ← One-off (no hot-reload)
```

**npm package discovery**: Packages with `"pi": { "extensions": ["./index.ts"] }` in `package.json`, installed under `~/.pi/agent/extensions/<name>/`, are auto-discovered.

### 1.2 Loading Mechanism

```
Extension file (.ts)
    │
    ▼ jiti (runtime TypeScript loader, no build step)
    │
Extension module loaded
    │
    ▼ Module exports inspected
    │
    ├─ default export is function → call with ExtensionAPI
    ├─ named exports → treated as individual registrations
    └─ static object → legacy format (deprecated)
    │
    ▼
Extension registers capabilities:
    pi.on("event", handler)
    pi.registerTool(def)
    pi.registerCommand(name, def)
    ...
```

**jiti properties**:
- No compilation step — `.ts` files run directly
- Supports ESM + CJS interop
- Caches modules; `/reload` flushes cache for hot-reload
- Extensions share the same Node.js process (no isolation)

### 1.3 Unified Extensions (Post-Issue #454)

Historically, Pi had separate `hooks/` and `tools/` directories with duplicate loader infrastructure. Issue [#454](https://github.com/earendil-works/pi/issues/454) merged them:

- **Before**: `~/.pi/agent/hooks/*.ts` + `~/.pi/agent/tools/*.ts` — separate discovery, separate loader
- **After**: `~/.pi/agent/extensions/*.ts` — unified discovery, single `ExtensionAPI`
- **Compat**: Old `hooks/` and `tools/` directories show deprecation warnings
- **CLI flag**: `--extension` / `-e` replaces `--hook` and `--tool`
- **Shared state**: Tools and event handlers share closure scope — they can coordinate

## 2. ExtensionAPI: Complete Interface

### 2.1 Registration Methods

```typescript
interface ExtensionAPI {
  // === Capability Registration ===
  registerTool(def: ToolDefinition): void;
  //   name, label, description, parameters (TypeBox), execute,
  //   renderCall?, renderResult?, executionMode?

  registerCommand(name: string, def: { description: string; handler: (args, ctx) => Promise<void> }): void;
  //   Slash commands: /my-command in TUI

  registerShortcut(key: string, def: ShortcutDefinition): void;
  //   Keyboard bindings: ctrl+x → action

  registerFlag(name: string, def: FlagDefinition): void;
  //   CLI flags: pi --my-flag

  registerProvider(name: string, config: ProviderConfig): void;
  //   Custom LLM provider backends

  // === Dynamic Tool Control ===
  getAllTools(): string[];
  getActiveTools(): string[];
  setActiveTools(names: string[]): void;
  //   Deferral pattern: register many tools, activate only needed ones
  //   Reduces context bloat — model only sees active tools

  // === Lifecycle Hooks ===
  on(event: string, handler: (event, ctx: ExtensionContext) => Promise<void | BlockResult | ModifyResult>): void;
  //   14+ events (see §3)

  // === Session Persistence ===
  appendEntry(entry: Record<string, unknown>): void;
  //   Write custom data to session JSONL (audit log)
}
```

### 2.2 ExtensionContext

```typescript
interface ExtensionContext {
  // === User Interaction ===
  ui: {
    confirm(question: string, detail?: string): Promise<boolean>;
    select<T>(question: string, options: SelectOption<T>[]): Promise<T>;
    input(question: string, defaultValue?: string): Promise<string>;
    notify(message: string): void;
    setStatus(message: string): void;
    setWidget(component: TuiComponent): void;
    custom<T>(component: TuiComponent): Promise<T>;  // Full TUI overlay modals
  };

  // === Process Control ===
  exec(command: string, args: string[], opts?: ExecOpts): Promise<ExecResult>;
  //   Spawn child processes from extensions

  cwd: string;  // Current working directory

  // === Inter-Extension Communication ===
  events: EventEmitter;        // Extension-to-extension event bus
  sendMessage(target: string, msg: unknown): void;  // Send to named extension
}
```

## 3. Lifecycle Events: Complete Map

### 3.1 Event Flow Diagram

```
┌─ pi starts ──────────────────────────────────────────┐
│ project_trust    ← Only for project-local extensions │
│ session_start    ← reason: "startup" | "switch" | "fork"
│ resources_discover ← reason: "startup"              │
└──────────────────────────────────────────────────────┘
                         │
┌─ user sends prompt ──────────────────────────────────┐
│ input              ← Can intercept/transform/handle  │
│                      Return string to override input │
│ before_agent_start ← Can inject message, modify      │
│                      systemPrompt (full replacement  │
│                      in v0.39.0+)                     │
│ agent_start        ← Observational only              │
│                                                      │
│   ┌─── turn loop ───────────────────────────────┐   │
│   │ turn_start                                   │   │
│   │ context          ← Can modify event.messages │   │
│   │ before_provider_headers                      │   │
│   │ before_provider_request                      │   │
│   │ after_provider_response                      │   │
│   │                                              │   │
│   │   [LLM calls tools:]                         │   │
│   │   tool_execution_start                       │   │
│   │   tool_call       ← ★ CAN BLOCK              │   │
│   │   tool_execution_update  ← progress streaming│   │
│   │   tool_result     ← CAN MODIFY               │   │
│   │   tool_execution_end                         │   │
│   │                                              │   │
│   │ turn_end                                     │   │
│   └──────────────────────────────────────────────┘   │
│                                                      │
│ agent_end          ← Observational                   │
│ agent_settled     ← After persistence + cleanup      │
└──────────────────────────────────────────────────────┘
                         │
┌─ session management ─────────────────────────────────┐
│ session_before_switch  ← Can cancel (return false)   │
│ session_before_fork    ← Can cancel (return false)   │
│ session_before_compact ← Can cancel                  │
│ session_compact        ← After compaction summary    │
│ session_shutdown       ← Cleanup (teardown)          │
└──────────────────────────────────────────────────────┘
```

### 3.2 Event Dispatch Strategies

| Strategy | Events Using It | Behavior | Can Block? | Can Modify? |
|---|---|---|---|---|
| **Bail** | `tool_call`, `input` | First handler returning `{ block: true }` short-circuits; remaining handlers skipped | ✅ Yes | ❌ No |
| **Waterfall** | `tool_result`, `before_provider_request`, `before_provider_payload`, `context` | Each handler's output becomes next handler's input (reduce chain) | ❌ No | ✅ Yes |
| **Fire-and-forget** | `tool_execution_*`, `after_provider_response`, `agent_start`, `agent_end`, `agent_settled`, `turn_start`, `turn_end`, `session_start`, `session_shutdown` | All handlers run; return values ignored | ❌ No | ❌ No |

### 3.3 Key Handler Signatures

```typescript
// Bail pattern — can block
pi.on("tool_call", async (event: {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}, ctx: ExtensionContext) => {
  // Return { block: true, reason: "..." } to prevent execution
  // Return void/undefined to allow
});

// Waterfall pattern — can modify
pi.on("tool_result", async (event: {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
}, ctx: ExtensionContext) => {
  // Return modified ToolResult to pass to next handler
  // Return event.result to pass-through unchanged
  return { ...event.result, details: { ...event.result.details, custom: true } };
});

// Fire-and-forget — observe only
pi.on("agent_start", async (event: {
  messages: AgentMessage[];
}, ctx: ExtensionContext) => {
  // Log, notify, update status — cannot affect agent behavior
});
```

## 4. Extension Composition Patterns

### 4.1 Permission Gate (Bail Pattern)

```typescript
// Extensions can implement ad-hoc permission gates
// No built-in policy engine — entirely extension-defined

export default function (pi: ExtensionAPI) {
  const BLOCKED_PATTERNS = [/rm -rf/, /sudo/, /> \/dev\/sda/];

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const cmd = event.input.command as string;
    const match = BLOCKED_PATTERNS.find(p => p.test(cmd));

    if (match) {
      const ok = await ctx.ui.confirm(
        "Potentially dangerous command detected",
        `"${cmd}" matches blocked pattern "${match}". Execute anyway?`
      );
      if (!ok) return { block: true, reason: "User rejected dangerous command" };
    }
  });
}
```

### 4.2 Deferral Pattern (Dynamic Tool Control)

```typescript
// Register many specialized tools, but only activate a subset
// Reduces context bloat — LLM only sees active tools

export default function (pi: ExtensionAPI) {
  const ALL_TOOLS = ["tool_a", "tool_b", "tool_c", ...];

  // Register all tools
  for (const name of ALL_TOOLS) {
    pi.registerTool({ name, /* ... */ });
  }

  // Start with minimal set
  pi.setActiveTools(["tool_a"]);

  // Extension can activate more based on context
  pi.on("turn_end", async (event) => {
    if (needsAdvancedTools(event)) {
      pi.setActiveTools(["tool_a", "tool_b", "tool_c"]);
    }
  });
}
```

### 4.3 Subagent Spawning (Process Fork)

```typescript
// Subagents are child pi processes with IPC bridge
// Root session runs IPC server; children connect via Unix socket/named pipe

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "delegate_to_worker",
    description: "Spawn a worker subagent to handle a task",
    parameters: Type.Object({ task: Type.String() }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const env = buildUiBridgeEnv("worker");

      const child = spawn("pi", ["--prompt", params.task], {
        env: { ...process.env, ...env },
      });

      // Collect output from child via IPC
      const result = await collectFromChild(child, signal);

      return {
        content: [{ type: "text", text: result }],
        details: { subagent: "worker" },
      };
    },
  });
}
```

### 4.4 MCP Integration

```typescript
// MCP is NOT built-in — implemented as an extension
// Connects to MCP servers, registers their tools + resources

export default function (pi: ExtensionAPI) {
  const mcpClients: MCPClient[] = [];

  pi.on("session_start", async () => {
    const servers = loadMcpConfig();  // From .pi/mcp.json or similar

    for (const server of servers) {
      const client = await connectMCP(server);
      mcpClients.push(client);

      // Register MCP server's tools as Pi tools
      for (const tool of client.tools) {
        pi.registerTool({
          name: `mcp_${server.name}_${tool.name}`,
          description: tool.description,
          parameters: convertToTypeBox(tool.inputSchema),
          execute: async (id, params) => {
            const result = await client.callTool(tool.name, params);
            return { content: result.content, details: {} };
          },
        });
      }
    }
  });

  pi.on("session_shutdown", async () => {
    for (const client of mcpClients) {
      await client.disconnect();
    }
  });
}
```

## 5. Critical Design Decisions & Trade-offs

### 5.1 No Extension Sandboxing

**Decision**: Extensions run in the same Node.js process with full privileges.

**Why**:
- Simplicity — no IPC overhead, no serialization
- Direct access to `pi` internals, file system, network
- Performance — tool calls from extensions are synchronous function calls

**Trade-off**: A malicious or buggy extension can crash the agent, access files, exfiltrate data, or modify other extensions' state. The security model trusts the user to only install trustworthy extensions.

### 5.2 jiti Runtime Loading (No Build Step)

**Decision**: Extensions are `.ts` files loaded at runtime via jiti, not pre-compiled.

**Why**:
- Zero-config development — write a `.ts` file, it works
- Hot-reload with `/reload` — no restart needed
- Extension distribution as raw TypeScript — no bundling

**Trade-off**:
- Slower cold start (JIT compilation on first load)
- jiti-specific compatibility (not all TypeScript features supported)
- No tree-shaking or dead code elimination

### 5.3 Bail Strategy for `tool_call` (Not Waterfall)

**Decision**: `tool_call` uses Bail (first-blocker-wins), not Waterfall (chain transform).

**Why**:
- Permission checking should short-circuit — if one handler blocks, no need to ask others
- Different handlers may have different blocking criteria — combining them is non-deterministic
- Performance — skip unnecessary handler execution

**Trade-off**: Only one extension's block reason is returned to the user. If multiple handlers would block, the user only sees the first one's message.

### 5.4 No Extension Dependency Graph

**Decision**: Extensions are loaded flat — no ordering guarantees, no dependency resolution.

**Why**:
- Simplicity — no complex graph resolution
- Extensions should be independent — if they depend on each other, they're poorly designed

**Trade-off**: Extensions that need ordering (e.g., "authenticate before allow") must coordinate manually via shared state or a meta-extension.

## 6. Comparison with Other Extension Systems

| Aspect | Pi | VS Code | Claude Code | npm Packages |
|---|---|---|---|---|
| **Language** | TypeScript (jiti) | TypeScript/JS | Markdown (SKILL.md) | Any JS |
| **Loading** | Runtime (no build) | Pre-compiled | Text parsing | Pre-built |
| **Sandbox** | ❌ Same process | ✅ Extension Host | ✅ Instructions only | ✅ npm sandbox |
| **Hot-reload** | ✅ `/reload` | ✅ `Reload Window` | ✅ File watcher | ❌ npm install |
| **Lifecycle hooks** | 14+ typed events | 30+ activation events | N/A | N/A |
| **Dispatch strategy** | 3 (Bail/Waterfall/F&F) | Single subscriber | None | None |
| **UI extension** | ✅ Full TUI components | ✅ Webviews | ❌ Text only | N/A |
| **Tool registration** | ✅ Dynamic + deferral | ❌ Static contributions | ❌ Static | N/A |

## 7. RoboThree Implications

### What to ADOPT

1. **Unified ExtensionAPI**: Single `pi` object with `registerTool`, `on`, `registerCommand` — clean, discoverable. RoboThree should provide one `ExtensionAPI` surface, not separate hook/tool/plugin registries.

2. **Three dispatch strategies**: Bail (permission gates), Waterfall (transform chains), Fire-and-forget (observability). RoboThree should use these same three patterns for different event types.

3. **Deferral pattern (`setActiveTools`)**: Register many tools, activate subset. Critical for context window management as tool count grows.

### What to ADAPT

1. **Extension sandboxing**: Pi's same-process model is too permissive for RoboThree. RoboThree should isolate extensions (separate thread/process with capability tokens) while keeping the API surface similar.

2. **Extension dependency graph**: RoboThree needs explicit ordering (`before: ["auth-gate"]`, `after: ["tool-logger"]`) for deterministic composition of permission + logging + transformation chains.

3. **Declarative extension manifest**: Pi's convention-based discovery (`*.ts` in directory) is simple but fragile. RoboThree should require a `manifest.json` with explicit capabilities, version, and dependencies.

### Risks

- Waterfall chains can be hard to debug — one misbehaving handler corrupts downstream
- Bail short-circuit makes permission outcomes dependent on load order
- No extension sandboxing means RoboThree must design its own isolation from scratch

## 8. Evidence Quality Assessment

| Aspect | Status |
|---|---|
| **API surface confirmed** | ✅ From official extension docs + community analysis |
| **Dispatch strategies** | ✅ Cross-referenced from multiple sources |
| **jiti loading** | ✅ Confirmed from official docs + npm metadata |
| **Issue #454 merge** | ✅ Confirmed from GitHub issue tracker |
| **Event flow** | ✅ Cross-referenced between DeepWiki + extension docs |
| **Exact signatures** | ⚠️ Approximate — need `git clone` for TypeScript types |
