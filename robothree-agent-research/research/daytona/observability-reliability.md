# Observability & Reliability — Daytona

> **Evidence Basis**: DeepWiki audit logging, observability & telemetry pages, architecture docs
> **Conclusion Types**: [F] = FACT, [I] = INFERENCE, [R] = RECOMMENDATION

## 1. Audit Logging Architecture

### 1.1 Record-Execute-Update Pattern

Daytona 的审计日志系统是整个研究中最具参考价值的机制之一。

```
┌─────────────────────────────────────────────────────┐
│                 Audit Interceptor                     │
│                                                       │
│  1. PRE-EXECUTION                                     │
│     └── INSERT audit_log (status=null)               │
│         ├── id: UUID                                  │
│         ├── actorId, actorEmail                       │
│         ├── action: "start" | "stop" | "delete" | ...│
│         ├── targetType: "sandbox" | "snapshot" | ...  │
│         ├── targetId: specific resource ID             │
│         ├── ipAddress: request origin                 │
│         └── metadata: JSON context                    │
│                                                       │
│  2. EXECUTE HANDLER                                   │
│     └── Normal NestJS handler execution               │
│                                                       │
│  3. POST-EXECUTION                                    │
│     └── UPDATE audit_log                             │
│         ├── statusCode: HTTP response code            │
│         └── error: error message (if failed)          │
│                                                       │
│  4. PUBLISH (Cron: every 1 second)                    │
│     └── SELECT * FROM audit_log WHERE status NOT NULL │
│         → Bulk write to OpenSearch Data Streams       │
│         → DELETE from PostgreSQL staging              │
└─────────────────────────────────────────────────────┘
```

**[F]** Audit interceptor pattern confirmed via DeepWiki: `apps/api/src/audit/interceptors/audit.interceptor.ts`, `apps/api/src/audit/adapters/audit-opensearch.adapter.ts`.

### 1.2 Audit Log Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique audit entry ID |
| `actorId` | String | User or system role ID |
| `actorEmail` | String | User email |
| `action` | Enum | Operation: start, stop, delete, login, execute_command, git_commit, computer_use_start, ... |
| `targetType` | Enum | Resource: sandbox, snapshot, organization |
| `targetId` | String | Specific resource ID |
| `statusCode` | Number | HTTP response code |
| `ipAddress` | String | Request origin IP |
| `metadata` | JSON | Request-specific context |
| `createdAt` | DateTime | When the action was initiated |

**[F]** Schema confirmed via DeepWiki audit logging page.

### 1.3 Tracked Actions

```
Sandbox Lifecycle:
├── create, start, stop, archive, fork, resize, create_backup

Access Control:
├── login, logout
├── create_ssh_access, revoke_ssh_access
├── regenerate_proxy_api_key

Toolbox Operations:
├── execute_command
├── git_commit_changes
├── computer_use_start, computer_use_stop
```

**[F]** Tracked actions confirmed via DeepWiki.

### 1.4 Reliability Features

```
Dangling Log Resolution:
├── Cron job detects incomplete audit entries
├── Entries with status=null beyond timeout
├── Marked as potential failures
└── Cleaned up to prevent accumulation

Retention:
├── Configurable retention policies
├── Time-based cleanup of old logs
└── OpenSearch Data Stream lifecycle management
```

**[F]** Reliability features from DeepWiki audit logging.

## 2. Telemetry Stack

### 2.1 Components

```
Telemetry Architecture:
├── Metrics: ClickHouse (high-performance column store)
├── Logs: OpenSearch (text search + analytics)
├── Traces: OpenTelemetry (distributed tracing)
├── Errors: Sentry (error tracking)
├── Analytics: PostHog (product analytics)
└── Email: SMTP (notifications)
```

**[F]** Telemetry stack confirmed via DeepWiki observability page.

### 2.2 Daemon Telemetry

```go
// apps/daemon/pkg/toolbox/telemetry.go
// Initializes OpenTelemetry providers for:
// - Logs (structured via slog → tint → lumberjack rotation)
// - Metrics (custom metrics)
// - Traces (distributed tracing)
// Targets OTLP endpoint (OpenTelemetry Collector)
```

**[F]** Daemon telemetry confirmed via DeepWiki.

### 2.3 Runner Healthcheck

```
Healthcheck Service (healthcheck.go):
├── Continuous heartbeat to Control Plane
├── Reports:
│   ├── Runner status (healthy/degraded/dead)
│   ├── Available capacity (CPU/memory/disk)
│   ├── Active sandbox count
│   └── GPU availability
├── Enables scheduling decisions
└── Dead runner → job reassignment
```

**[F]** Healthcheck from DeepWiki runner architecture and PR #3361.

## 3. Reliability Mechanisms

### 3.1 State Reconciliation

```
SandboxManager.syncInstanceState() (every 5 seconds):
├── Query all sandboxes where state != desiredState
├── Identify stuck transitions
├── Trigger corrective actions
└── Update error states

Handles:
├── Runner failure during state transition
├── Network partition
├── Database inconsistency
└── Zombie containers
```

**[F]** State reconciliation confirmed via DeepWiki backend architecture.

### 3.2 Exponential Backoff Retry

```go
// apps/runner/pkg/docker/client.go:81-92
// RetryWithExponentialBackoff for Docker API calls
// Handles transient Docker daemon failures
```

**[F]** Retry logic confirmed via DeepWiki runner architecture.

### 3.3 Job Durability

```
Job Lifecycle:
├── Created in PostgreSQL (durable)
├── Polled by runner (pull-based)
├── Executed (with retry on transient failure)
├── Status updated (SUCCESS / FAILED)
└── If runner dies → job remains PENDING → reassigned

Job State Transitions:
PENDING → PROCESSING → SUCCESS
                     → FAILED (terminal)
                     → PENDING (retry after transient failure)
```

**[F]** Job durability from PR #3361 and DeepWiki background jobs page.

### 3.4 Volume Cleanup

```
Orphan Volume GC (every 30 seconds):
├── Enumerate volume mount directories
├── Check if associated container exists
├── Unmount orphaned FUSE mounts
└── Remove orphaned directories
```

**[F]** Volume cleanup from DeepWiki `volumes_cleanup.go`.

## 4. RoboThree Observability Recommendations

| Daytona Feature | RoboThree Application | Recommendation |
|----------------|----------------------|----------------|
| **Record-Execute-Update Audit** | Enterprise Control Plane audit | **ADOPT** — critical pattern |
| **PostgreSQL → OpenSearch pipeline** | Audit log storage | **ADAPT** — evaluate ClickHouse vs OpenSearch |
| **State Reconciliation loop** | Workspace Manager consistency | **ADOPT** — 5-10 second reconciliation |
| **Runner Healthcheck heartbeat** | Worker health monitoring | **ADOPT** |
| **Job durability (DB-backed)** | Task Scheduler reliability | **ADOPT** |
| **Dangling log resolution** | Audit completeness | **ADOPT** |
| **OTel distributed tracing** | End-to-end visibility | **ADOPT** |
| **Exponential backoff retry** | Transient failure handling | **ADOPT** |

### Key Takeaway

> Daytona 的审计日志 "Record-Execute-Update" 模式确保即使在 crash 场景下也有审计记录（status=null → dangling detection）。这对 Enterprise Control Plane 是必需的合规能力。

**[R]** This audit pattern is a must-have for enterprise deployment of RoboThree.
