# Tool System — Daytona Daemon Toolbox API

> **Evidence Basis**: Official sandbox documentation, SDK docs, DeepWiki analysis
> **Conclusion Types**: [F] = FACT, [I] = INFERENCE, [R] = RECOMMENDATION

## 1. Daemon Architecture Overview

Daytona 的 Tool System 核心是 **Sandbox Daemon** — 一个在每个 Sandbox 容器内运行的 Go 二进制文件，暴露统一的 **Toolbox API**。

### 1.1 Daemon Injection Mechanism

```
Runner Startup (main.go:130-134)
    │
    └── Extract embedded daemon-amd64 binary to host path
            │
            ▼
Container Creation (container_configs.go:189)
    │
    └── Bind-mount daemon at /usr/local/bin/daytona
            │
            ▼
Container Start → daemon auto-initializes on :2280
```

**[F]** Daemon injection confirmed via DeepWiki runner architecture: embedded binary extract at `apps/runner/cmd/runner/main.go:130-134`, bind-mount at `container_configs.go:189`.

**[R]** This pattern is crucial for RoboThree: the Worker Runtime should embed and inject the Agent Runtime into sandboxes, rather than requiring pre-built images with agents installed.

### 1.2 Daemon Initialization

```go
// apps/daemon/cmd/daemon/main.go
func main() {
    // 1. Structured logging (tint + lumberjack rotation)
    // 2. OTel providers (logs, metrics, traces → OTLP endpoint)
    // 3. Session executor (FIFO pipes for stdout/stderr)
    // 4. Start Toolbox API server on :2280
}
```

**[F]** Daemon init confirmed via DeepWiki: `slog` + `tint.NewHandler` + `lumberjack.Logger` for logging, OTel providers in `pkg/toolbox/telemetry.go`, session executor in `pkg/session/execute.go`.

## 2. Toolbox API Surface

所有 API 运行在端口 2280，**始终需要认证**（sandbox-specific `authToken`）。

### 2.1 File System Operations

| Operation | Description |
|-----------|-------------|
| `list` | List directory contents |
| `read` | Read file contents |
| `write` | Write/create file |
| `move` | Move/rename file |
| `delete` | Delete file |
| `search` | Search file contents |
| `replace` | Find and replace |
| `permissions` | Get/set file permissions |

**[F]** File system API confirmed via official sandbox docs.

### 2.2 Git Operations

| Operation | Description |
|-----------|-------------|
| `clone` | Clone repository |
| `status` | Working tree status |
| `commit` | Stage and commit changes |
| `push` | Push to remote |
| `branch` | Branch management |

**[F]** Git API confirmed via official sandbox docs.

### 2.3 Process Execution

| Mode | Description | State |
|------|-------------|-------|
| Shell Command | Execute arbitrary command with `cwd`, `env`, `timeout` | Stateless |
| Code Execution | Run Python/TS/JS directly (language param) | Stateless |
| Code Interpreter | Stateful Python with isolated contexts | Stateful |
| Background Session | Persistent process sessions (create/execute/get/list/delete) | Stateful |
| PTY Terminal | Interactive pseudo-terminal (create, connect, send input, resize, kill) | Stateful |

**[F]** Process execution API confirmed via official sandbox docs.

### 2.4 Language Server Protocol (LSP)

```
LSP Support:
├── Python (pyright/langserver)
└── TypeScript (typescript-language-server)
```

**[F]** LSP support confirmed via official sandbox docs.

### 2.5 Computer Use

```
Computer Use API:
├── Mouse: click, move, drag, scroll, position
├── Keyboard: type, press, hotkey combinations
├── Screenshot: full screen, region, compressed formats
├── Recording: start/stop/list/download/delete
├── Display: screen info, window management
└── Lifecycle: start/stop/status/restart/logs/errors
```

**[F]** Computer Use API confirmed via official sandbox docs and SDK references.

### 2.6 Port/Proxy

```
Port Management:
├── Expose port from sandbox
├── Generate preview URL: {port}-{sandboxId}.{proxyDomain}
├── Public or signed (token with expiry)
└── Proxy configuration
```

**[F]** Port/proxy API confirmed via architecture docs.

## 3. Toolbox API Access Patterns

### 3.1 Direct SDK Access

```
Python SDK:
    sandbox = daytona.create()
    sandbox.process.execute_command("ls -la")
    sandbox.fs.upload_file("main.py", content)
    sandbox.git.clone("https://github.com/...")
    sandbox.computer_use.screenshot()

TypeScript SDK:
    const sandbox = await daytona.create()
    await sandbox.process.executeCommand("ls -la")
    await sandbox.fs.uploadFile("main.py", content)
    await sandbox.computerUse.screenshot()
```

**[F]** SDK access patterns from SDK documentation and sandbox docs.

### 3.2 MCP Server Access

Daytona provides an MCP Server that exposes Toolbox API capabilities as MCP tools, enabling AI models to directly control sandboxes through the Model Context Protocol.

**[F]** MCP Server mentioned in architecture docs as part of Interface Plane.

## 4. Session Execution Model

### 4.1 Named Pipe (FIFO) Architecture

```go
// apps/daemon/pkg/session/execute.go
// Uses named pipes for stdout/stderr multiplexing
// Shell wrappers redirect command output → unified output.log
// Enables real-time log streaming + post-execution demux
```

**[F]** FIFO-based session execution from DeepWiki daemon analysis.

### 4.2 Execution Flow

```
Toolbox Request (:2280)
    → Validate authToken
    → Create FIFO pipes (/tmp/daytona-session-{id}-stdout, -stderr)
    → Fork shell process (stdout/stderr → FIFO)
    → Stream FIFO content back to caller (SSE/WebSocket)
    → On process exit: capture exit code, cleanup pipes
    → Return exit code + full output log
```

**[I]** Execution flow inferred from session executor description and FIFO architecture.

## 5. Design Patterns for RoboThree

### Pattern: Embedded Agent Injection

**What**: Runner embeds daemon binary, injects it into every sandbox via bind-mount.
**Why**: Consistent in-sandbox API surface without custom images. Runner controls agent version.
**RoboThree**: ADOPT — Worker Runtime should embed RoboThree Agent and inject it into sandboxes.

### Pattern: Unified Toolbox API on Fixed Port

**What**: All tool capabilities exposed on a single port (:2280) with consistent auth.
**Why**: Simpler firewall rules, proxy routing, and SDK implementation.
**RoboThree**: ADOPT — Single Agent API port in sandbox, unified auth.

### Pattern: FIFO-Based Process I/O

**What**: Named pipes for stdout/stderr multiplexing to unified log file.
**Why**: Real-time streaming + post-execution retrieval without in-memory buffering.
**RoboThree**: ADAPT — Consider FIFO vs WebSocket streaming based on latency requirements.

### Pattern: Stateless + Stateful Dual Model

**What**: Quick commands (stateless shell exec) + persistent sessions (stateful PTY/interpreter).
**Why**: Different use cases need different execution models. Stateless is simpler; stateful enables REPLs.
**RoboThree**: ADOPT — Task Scheduler should support both ephemeral and persistent execution contexts.
