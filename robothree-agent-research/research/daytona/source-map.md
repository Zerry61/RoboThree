# Source Map — Daytona

> **Repository**: daytonaio/daytona @ `main`
> **Evidence Basis**: GitHub repo tree, DeepWiki analysis, PR discussions

## 1. Repository Architecture

### 1.1 Top-Level Organization

```
daytona/
├── apps/                    # Application services (9 apps)
│   ├── api/                 # [TS/NestJS] Control Plane — central orchestration
│   ├── runner/              # [Go] Compute Plane — container lifecycle
│   ├── daemon/              # [Go] Sandbox agent (injected into containers)
│   ├── proxy/               # [Go] HTTP/WS routing to sandboxes
│   ├── ssh-gateway/         # [Go] SSH connection handling
│   ├── snapshot-manager/    # [Go] Snapshot lifecycle
│   ├── cli/                 # [Go] CLI tool
│   ├── dashboard/           # [TS/React/Vite] Web UI
│   └── docs/                # [MDX/Astro] Documentation
├── libs/                    # Shared libraries & SDKs
│   ├── api-client-go/       # Go API client library
│   ├── common-go/           # Shared Go utilities
│   ├── computer-use/        # Computer Use shared library
│   ├── python-sdk/          # Python SDK
│   ├── typescript-sdk/      # TypeScript SDK
│   ├── go-sdk/              # Go SDK
│   ├── ruby-sdk/            # Ruby SDK
│   └── java-sdk/            # Java SDK
├── docker/                  # Docker Compose for self-hosted
├── go.work                  # Go workspace (ties all Go modules)
└── README.md
```

**[F]** Structure confirmed via GitHub repository tree and DeepWiki system architecture overview page.

### 1.2 Go Workspace

```go
// go.work — ties all Go modules together
use (
    ./apps/cli
    ./apps/daemon
    ./apps/proxy
    ./apps/runner
    ./apps/snapshot-manager
    ./apps/ssh-gateway
    ./libs/api-client-go
    ./libs/common-go
    ./libs/computer-use
)
```

**[F]** Go workspace structure confirmed via DeepWiki and fork analysis (`jamesmurdza/daytona`).

## 2. Control Plane Source Map (`apps/api/`)

### 2.1 NestJS Module Structure

```
apps/api/src/
├── main.ts                          # Bootstrap entry
├── app.module.ts                     # Root module (TypeORM config L73-107)
├── sandbox/
│   ├── sandbox.module.ts            # SandboxModule (controllers at L66-162)
│   ├── controllers/
│   │   ├── sandbox.controller.ts    # REST endpoints, validation
│   │   └── runner.controller.ts     # Runner management
│   ├── services/
│   │   ├── sandbox.service.ts       # Business logic, cron jobs
│   │   ├── job-state-handler.service.ts  # V2 job completion handling
│   │   └── snapshot.service.ts      # Snapshot business logic
│   ├── managers/
│   │   ├── sandbox.manager.ts       # State reconciliation (5s cron)
│   │   └── snapshot.manager.ts      # Snapshot orchestration
│   ├── entities/
│   │   └── sandbox.entity.ts        # TypeORM entity (L56-233)
│   ├── dto/
│   │   └── snapshot.dto.ts          # Data transfer objects
│   └── repositories/
│       ├── sandbox.repository.ts    # Custom DB queries
│       └── snapshot.repository.ts   # Custom DB queries
├── audit/
│   ├── interceptors/
│   │   └── audit.interceptor.ts     # "Record-Execute-Update" pattern
│   └── adapters/
│       └── audit-opensearch.adapter.ts  # OpenSearch publishing
└── ...
```

**[F]** API structure confirmed via DeepWiki backend architecture + API service architecture pages, PR #4434, and search results.

### 2.2 Key Symbols

| Symbol | File | Purpose |
|--------|------|---------|
| `SandboxController` | `sandbox.controller.ts` | REST endpoints for sandbox CRUD |
| `SandboxService` | `sandbox.service.ts` | Business logic, `cleanupOldSandboxActivity()` cron |
| `SandboxManager` | `sandbox.manager.ts` | State reconciliation loop (5s) |
| `Sandbox` (entity) | `sandbox.entity.ts` | TypeORM entity: state, desiredState, resources, timestamps |
| `AuditInterceptor` | `audit.interceptor.ts` | Captures all API actions pre/post execution |
| `JobStateHandlerService` | `job-state-handler.service.ts` | V2 job completion → state transition |
| `RedisLockProvider` | (Redis module) | Distributed locking: `sandbox:{id}:state-change` |

**[F]** Symbols confirmed via DeepWiki backend architecture analysis.

## 3. Compute Plane Source Map (`apps/runner/`)

### 3.1 Runner Structure

```
apps/runner/
├── cmd/runner/
│   ├── main.go                        # Entry point (daemon binary extraction L130-134)
│   └── config/
│       └── config.go                  # Environment-based config
├── pkg/
│   ├── api/
│   │   └── server.go                  # Gin REST API server
│   ├── docker/
│   │   ├── client.go                  # DockerClient (exponential backoff L81-92)
│   │   ├── container_configs.go       # Container config matrix (standard vs GPU)
│   │   ├── volumes_mountpaths.go      # S3 FUSE mount logic
│   │   └── volumes_cleanup.go         # Orphan volume GC (30s interval)
│   └── runner/
│       └── v2/
│           ├── poller/
│           │   └── poller.go          # Job polling from domain
│           ├── executor/
│           │   ├── executor.go        # Core dispatcher
│           │   ├── sandbox.go         # Sandbox job handlers
│           │   ├── snapshot.go        # Snapshot job handlers
│           │   ├── snapshot_sandbox.go # Docker commit/tag/push flow
│           │   ├── backup.go          # Backup handler
│           │   └── types.go           # Job type definitions
│           └── healthcheck/
│               └── healthcheck.go     # Heartbeat + capacity reporting
```

**[F]** Runner structure confirmed via DeepWiki runner architecture page + PR #3361 (Runner v2).

### 3.2 Key V2 Job Types

```go
// From executor/types.go
const (
    CREATE_SANDBOX     // Create + optionally start sandbox
    START_SANDBOX      // Start stopped sandbox
    STOP_SANDBOX       // Stop running sandbox
    DESTROY_SANDBOX    // Destroy/delete sandbox
    BUILD_SNAPSHOT     // Build Docker image from Dockerfile
    SNAPSHOT_SANDBOX   // Filesystem snapshot (Docker commit)
    FORK_SANDBOX       // Fork existing sandbox
    RESIZE_SANDBOX     // Resize CPU/memory/disk
    CREATE_BACKUP      // Create sandbox backup
)
```

**[F]** Job types confirmed via PR #3361, #4452, and DeepWiki runner system page.

### 3.3 Key Symbols

| Symbol | File | Purpose |
|--------|------|---------|
| `DockerClient` | `client.go` | Docker SDK wrapper with retry |
| `RetryWithExponentialBackoff` | `client.go:81-92` | Transient failure handling |
| `CreateNetwork` | `client.go:97-116` | `runner-bridge` with ICC disabled |
| `DetectGPU` | `client.go:129-136` | NVIDIA GPU detection |
| `Poller` | `poller/poller.go` | Job polling loop |
| `Executor` | `executor/executor.go` | Job dispatch to handlers |
| `handleCreateSandbox` | `executor/sandbox.go` | CREATE_SANDBOX logic |
| `Healthcheck` | `healthcheck/healthcheck.go` | Heartbeat reporting |

**[F]** Symbols confirmed via DeepWiki runner architecture analysis.

## 4. Daemon Source Map (`apps/daemon/`)

### 4.1 Daemon Structure

```
apps/daemon/
├── cmd/daemon/
│   └── main.go                        # Daemon bootstrap
├── pkg/
│   ├── toolbox/
│   │   └── telemetry.go              # OTLP providers for logs/metrics/traces
│   └── session/
│       └── execute.go                 # Named pipe (FIFO) for stdout/stderr
```

**[F]** Daemon structure confirmed via DeepWiki analysis.

### 4.2 Toolbox API Capabilities

| Capability | Port | Protocol |
|-----------|------|----------|
| File System | 2280 | REST (authenticated) |
| Git Operations | 2280 | REST (authenticated) |
| Process Execution | 2280 | REST (authenticated) |
| LSP | 2280 | REST (authenticated) |
| Computer Use | 2280 | REST (authenticated) |
| Interpreter | 2280 | REST (authenticated) |
| Web Terminal | 22222 | WebSocket |
| SSH | 22222 | TCP (time-limited tokens) |
| VNC/Recording Playback | 33333 | HTTP (authenticated) |

**[F]** Toolbox API capabilities confirmed via official sandbox documentation.

## 5. Confidence Notes

- **HIGH**: All file paths and structures confirmed through multiple independent sources (DeepWiki, official docs, PR discussions)
- **MEDIUM**: Exact line numbers for Go source files are from DeepWiki analysis, not direct file reading
- **UNKNOWN**: Exact NestJS source line numbers for some files (controller/service details not in search results)
- Source map is comprehensive enough for architecture analysis; for code-level reuse, full repo clone is needed
