# RoboThree Fit Analysis — Daytona

> **Research**: daytonaio/daytona @ `main` (commit `ec4c21b`)
> **Conclusion Types**: [F] = FACT, [I] = INFERENCE, [R] = RECOMMENDATION

## 1. Executive Summary

Daytona 是当前研究中对 **RoboThree Worker Runtime** 参考价值最高的项目。其三平面架构（Interface → Control → Compute）、Runner v2 Job Polling 模式、Daemon 注入机制、和 Audit Log "Record-Execute-Update" 模式，直接验证了 RoboThree 核心架构假设的正确性。

**核心结论**：Daytona 证明了 "Agent Runtime 不应直接管理容器，而应通过 Worker/Sandbox API 申请执行环境" 这一架构原则的可行性。RoboThree 应将其 Runner v2 模式作为 Worker Runtime 的基线参考架构。

## 2. ADOPT / ADAPT / DEFER / REJECT / NEEDS_MORE_EVIDENCE

### 2.1 ADOPT — 直接采纳的设计模式

| # | Pattern | Daytona Evidence | RoboThree Application | MVP? |
|---|---------|-----------------|----------------------|------|
| 1 | **Job-Based Worker Polling** (Runner v2) | PR #3361, `poller/poller.go`, `executor/executor.go` | Worker Runtime: Worker 主动拉取 Job，非推送 | ✅ YES |
| 2 | **Three-Plane Separation** (Interface/Control/Compute) | `architecture.mdx` | Module boundary: Interface → Control Plane → Compute Plane | ✅ YES |
| 3 | **Agent Injection via Bind-Mount** | `main.go:130-134`, `container_configs.go:189` | Worker 将 Agent Runtime 二进制注入 Sandbox | ✅ YES |
| 4 | **State Reconciliation Loop** (5s cron) | `SandboxManager.syncInstanceState()` | Workspace Manager 一致性与恢复 | ✅ YES |
| 5 | **Record-Execute-Update Audit** | `audit.interceptor.ts`, `audit-opensearch.adapter.ts` | Enterprise Control Plane 审计日志 | ❌ NO (post-MVP) |
| 6 | **Worker Healthcheck Heartbeat** | `healthcheck.go` | Worker 健康监控 + 心跳 | ✅ YES |
| 7 | **Per-Sandbox authToken** | Sandbox docs | Sandbox 身份与访问控制 | ✅ YES |
| 8 | **Bridge Network + ICC Disabled** | `client.go:97-116` | Sandbox 间网络隔离 | ✅ YES |
| 9 | **Job Durability (DB-backed)** | PostgreSQL Job entity | Task Scheduler 可靠性 | ✅ YES |

### 2.2 ADAPT — 需要改造的模式

| # | Pattern | Daytona Implementation | RoboThree Adaptation | MVP? |
|---|---------|----------------------|---------------------|------|
| 1 | **Egress Control** | iptables-based | **Adapt to**: eBPF/Cilium NetworkPolicy (for K8s) | ❌ NO |
| 2 | **Persistent Volumes** | S3 FUSE `mount-s3` | **Adapt to**: CSI drivers (for K8s native storage) | ❌ NO |
| 3 | **Container Runtime** | Docker-in-Docker | **Adapt to**: containerd/CRI-O via Kubernetes | ✅ YES |
| 4 | **Snapshot Registry** | OCI/S3 internal registry | **Adapt to**: OCI-compatible but evaluate vs custom format | ❌ NO |
| 5 | **Tier-Based Quotas** | Static org tiers | **Adapt to**: Dynamic policy-based quotas | ❌ NO |
| 6 | **FIFO Process I/O** | Named pipes | **Adapt to**: WebSocket streaming for lower latency | ✅ YES |
| 7 | **Computer Use Plugin** | Separate binary mount | **Adapt to**: Lighter-weight (browser-based CU may not need full VNC) | ❌ NO |
| 8 | **PostgreSQL + OpenSearch Audit** | Dual-store (staging → published) | **Adapt to**: Evaluate ClickHouse vs OpenSearch; consider single-store | ❌ NO |

### 2.3 DEFER — 推迟采纳

| # | Pattern | Reason for Deferral |
|---|---------|-------------------|
| 1 | **V0 Direct HTTP Runner** (legacy) | V2 polling is superior; V0 only needed for legacy compatibility |
| 2 | **GPU Sandbox** (NVIDIA CDI) | Not in MVP scope; evaluate when GPU workloads needed |
| 3 | **Android Emulator Sandbox** (KVM mount) | Highly specialized; evaluate when mobile testing needed |
| 4 | **Full org-tier quota system** | MVP can start with flat limits; complex quotas post-MVP |
| 5 | **LSP Integration in Sandbox** | Nice-to-have; not critical for MVP agent execution |

### 2.4 REJECT — 不应采纳的设计

| # | Pattern | Reason for Rejection |
|---|---------|---------------------|
| 1 | **Privileged Containers** for standard sandbox (`Privileged=true`) | Security risk too high. Use rootless containers or user namespace remapping. |
| 2 | **AGPL-3.0 License** for backend code | Cannot embed Daytona code in RoboThree. Reference design patterns only. |
| 3 | **Docker-in-Docker** for runner | Adds complexity. Prefer Kubernetes-native container runtime (containerd/CRI-O). |
| 4 | **FUSE `--allow-other`** for volumes | Broad permission model. Use CSI-native multi-writer volumes if needed. |

### 2.5 NEEDS_MORE_EVIDENCE — 需要更多证据

| # | Question | How to Close |
|---|----------|-------------|
| 1 | **Polling interval vs latency**: What is the typical job pickup latency in V2? | Need production metrics from Daytona team or self-hosted benchmark |
| 2 | **Runner scaling limits**: How many sandboxes per runner before degradation? | Need load test data |
| 3 | **Snapshot cold start**: Is 90ms cold start reproducible in customer-managed deployments? | Need benchmark in target environment |
| 4 | **Daemon binary size**: How large is the embedded daemon? Impact on sandbox startup? | Need binary size measurement |
| 5 | **OpenSearch costs**: What is the operational cost of OpenSearch for audit logs at scale? | Need cost analysis at 1000+ sandboxes/day |
| 6 | **Multi-region snapshot consistency**: How does SnapshotManager handle regional consistency? | Need source code analysis of SnapshotManager |
| 7 | **Auth0/OIDC lock-in**: How tightly coupled is the API to Auth0? Can it support generic OIDC? | Need source code analysis of auth module |

## 3. Proposed RoboThree Changes

### 3.1 Module Boundary Changes

```
Current (inferred from requirements):
┌─────────────────────────────┐
│ Agent Runtime               │
│ (directly manages containers)│  ← ANTI-PATTERN
└─────────────────────────────┘

Proposed (Daytona-inspired):
┌──────────────────────────────────────┐
│ Enterprise Control Plane              │
│ - Job Queue (PostgreSQL)              │
│ - State Reconciliation (cron)         │
│ - Audit Logging                       │
│ - Auth (OIDC)                         │
├──────────────────────────────────────┤
│ Worker Runtime (Cloud / Remote)       │
│ - Job Poller                          │
│ - Executor (sandbox lifecycle)        │
│ - Healthcheck                         │
│ - Agent Injection                     │
├──────────────────────────────────────┤
│ Sandbox                               │
│ - Injected Agent Runtime              │
│ - Tool API (process, fs, git, etc.)   │
│ - Network Isolation                   │
│ - Resource Limits                     │
└──────────────────────────────────────┘
```

### 3.2 Interface Definitions

```typescript
// Proposed Worker API (inspired by Daytona Runner v2)

// Job types
type JobType =
  | 'CREATE_SANDBOX'
  | 'START_SANDBOX'
  | 'STOP_SANDBOX'
  | 'DESTROY_SANDBOX'
  | 'RESIZE_SANDBOX'
  | 'EXECUTE_TASK'
  | 'SNAPSHOT_SANDBOX'
  | 'FORK_SANDBOX'

// Worker polls this endpoint
GET /api/v2/jobs?status=PENDING&runner={runnerId}
Response: Job[]

// Worker updates job status
PATCH /api/v2/jobs/{jobId}
Body: { status: 'SUCCESS' | 'FAILED', metadata: {...} }

// Worker healthcheck
POST /api/v2/runners/{runnerId}/heartbeat
Body: { status: 'HEALTHY', capacity: {...}, sandboxes: [...] }
```

### 3.3 Task Scheduler Redesign

```
Current (implicit): Agent Runtime creates container → executes → destroys

Proposed (Daytona-inspired):
1. Task Scheduler creates Job record
2. Worker polls and picks up Job
3. Worker creates Sandbox (if needed) or reuses existing
4. Worker injects Agent Runtime into Sandbox
5. Agent Runtime executes task via Tool API
6. Worker reports result → Job complete
7. Lifecycle policies handle cleanup (auto-stop/archive/delete)
```

## 4. Risk Assessment

### 4.1 Adoption Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Polling latency unacceptable for real-time tasks | MEDIUM | HIGH | Add WebSocket push channel for latency-sensitive operations |
| Worker injection adds complexity vs pre-built images | LOW | MEDIUM | Support both modes: injection for generic images, pre-installed for optimized |
| Job durability increases DB load | MEDIUM | LOW | Use separate DB for jobs; add TTL-based cleanup |
| State reconciliation loop overhead at scale | LOW | MEDIUM | Use incremental reconciliation (only changed entities) |

### 4.2 Non-Adoption Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent directly managing containers leads to tight coupling | HIGH | HIGH | Architect with Worker abstraction from day one |
| No audit trail makes enterprise adoption impossible | HIGH | HIGH | Implement Record-Execute-Update from MVP |
| Without Worker heartbeat, dead workers leave orphaned sandboxes | MEDIUM | HIGH | Implement healthcheck from MVP |
| Direct container management blocks customer-managed compute | HIGH | HIGH | Job polling enables customer-managed compute from start |

## 5. Requires Human Approval

> **Status**: PENDING_HUMAN_DECISION

The following decisions require explicit approval before proceeding to RoboThree architecture:

1. **[ARCH-001]**: Adopt Daytona-inspired Three-Plane architecture (Interface → Control → Compute) as RoboThree's top-level module decomposition.
2. **[ARCH-002]**: Adopt Job-based Worker Polling (Runner v2 pattern) as the primary Worker Runtime communication model. Reject direct container management by Agent Runtime.
3. **[ARCH-003]**: Adopt Agent Injection pattern (Worker embeds + bind-mounts Agent Runtime into Sandbox). Decide: injection-only, pre-install-only, or hybrid?
4. **[ARCH-004]**: Adopt PostgreSQL-backed Job queue with state reconciliation loop. Decide: reconciliation interval (Daytona uses 5s).
5. **[ARCH-005]**: Adopt Record-Execute-Update audit pattern for Enterprise Control Plane. Decide: MVP scope or post-MVP?
6. **[SEC-001]**: Reject privileged containers. Adopt rootless containers or user namespace remapping from day one.
7. **[LIC-001]**: Confirm DESIGN_ONLY for Daytona — no code reuse due to AGPL-3.0.
