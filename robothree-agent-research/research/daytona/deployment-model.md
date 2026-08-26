# Deployment Model — Daytona

> **Evidence Basis**: Architecture docs, DeepWiki regions & infrastructure, PR #3361 (Runner v2)
> **Conclusion Types**: [F] = FACT, [I] = INFERENCE, [R] = RECOMMENDATION

## 1. Three Deployment Models

### 1.1 Fully Managed (app.daytona.io)

```
Daytona Cloud
├── Control Plane (API + DB + Redis + OpenSearch)
├── Compute Plane (managed runners)
├── Proxy (managed)
├── SSH Gateway (managed)
└── Snapshot Registry (managed)
        │
        ▼
    End Users (SDK/CLI/Dashboard)
```

**[F]** Managed deployment from architecture docs.

### 1.2 Self-Hosted Open Source

```
Customer Infrastructure (single host or cluster)
├── docker-compose up (from docker/ directory)
├── All components on-premises
├── Full control over data and execution
└── Community support
```

**[F]** Self-hosted deployment from `docker/` directory in monorepo.

### 1.3 Hybrid / Customer-Managed Compute

```
        ┌─────────────────────────────┐
        │   Daytona Cloud             │
        │   ┌───────────────────┐     │
        │   │  Control Plane    │     │
        │   │  (API + DB + etc) │     │
        │   └────────┬──────────┘     │
        └────────────┼────────────────┘
                     │ Job Queue (API)
                     │ HTTPS
        ┌────────────┼────────────────┐
        │   Customer Infrastructure  │
        │   ┌────────▼──────────┐     │
        │   │  Runner (polling) │     │
        │   │  Proxy (optional) │     │
        │   │  SSH GW (optional)│     │
        │   │  Snapshot Mgr     │     │
        │   │  (optional)       │     │
        │   └───────────────────┘     │
        │            │                │
        │   ┌────────▼──────────┐     │
        │   │  Sandbox Containers│    │
        │   │  (customer infra) │     │
        │   └───────────────────┘     │
        └─────────────────────────────┘
```

**[F]** Hybrid deployment from DeepWiki regions and infrastructure page.

## 2. Runner v2 — The Polling Architecture

### 2.1 Why Polling (Not Push)?

Daytona v2 从同步 HTTP push 改为异步 Job polling 的核心原因：

1. **Firewall-Friendly**: Runners can be behind NAT/firewalls — they initiate outbound connections
2. **Customer-Managed Compute**: Customers don't need to expose endpoints
3. **Scalability**: Runners self-register and pull work at their own pace
4. **Fault Tolerance**: Dead runners are detected via healthcheck timeout; jobs reassigned
5. **Multi-Region**: Runners in different regions pull from same job queue

**[F]** V2 architectural motivation from PR #3361 (Runner v2) and DeepWiki runner system page.

### 2.2 V0 vs V2 Comparison

| Dimension | V0 (Synchronous Push) | V2 (Job Polling) |
|-----------|----------------------|------------------|
| **Communication** | API → Runner HTTP call | Runner → API poll |
| **Network** | Runner must expose endpoint | Runner only needs outbound |
| **Firewall** | Requires inbound port | Firewall-friendly |
| **State Updates** | Synchronous on response | Async via StateHandler |
| **Health** | Active health checks | Heartbeat + capacity report |
| **Fault Tolerance** | API must handle timeouts | Jobs persist in DB |
| **Customer Compute** | Difficult (expose ports) | Easy (poll only) |
| **Adapter Class** | `RunnerAdapterV0` | `RunnerAdapterV2` |

**[F]** V0/V2 comparison confirmed via PR #3361 and DeepWiki.

### 2.3 Runner Configuration

```bash
# Key environment variables for Runner v2
DAYTONA_API_URL="https://api.daytona.io"   # Control plane endpoint
DAYTONA_RUNNER_TOKEN="runner-xxx"           # Auth token
API_VERSION="2"                              # v2 polling mode
API_PORT="8080"                              # Optional: local API port
CONTAINER_RUNTIME="docker"                   # Container runtime
GPU_ENABLED="false"                          # GPU support
RESOURCE_LIMITS_DISABLED="false"            # cgroup limits
USE_SNAPSHOT_ENTRYPOINT="false"             # Image entrypoint override
MOUNT_KVM_TO_ANDROID_SANDBOX="false"        # Android emulator support
```

**[F]** Runner config from `apps/runner/cmd/runner/config/config.go` (DeepWiki).

## 3. Organization-Owned Custom Regions

### 3.1 Custom Region Architecture

```
Custom Region Deployment:
├── Organization creates region via Dashboard
├── Deploys infrastructure components
│   ├── Runner (required) — compute nodes
│   ├── Proxy (optional) — routes traffic within region
│   ├── SSH Gateway (optional) — SSH within region
│   └── Snapshot Manager (optional) — local snapshot storage
├── All sandbox traffic stays in customer network
└── Control plane integration via API polling
```

**[F]** Custom regions from DeepWiki regions and infrastructure.

### 3.2 Compliance Implications

```
Data Locality:
├── Sandbox execution: customer infrastructure
├── Sandbox data: customer volumes
├── Snapshots: optional local storage
├── SSH traffic: optional local routing
└── Proxy traffic: optional local routing

Compliance Frameworks:
├── HIPAA: Data stays in customer infrastructure
├── SOC 2: Audit trails in control plane
├── GDPR: Regional data locality
└── FedRAMP: Requires further evaluation
```

**[F]** Compliance claims from Daytona documentation. [I] Actual certification status not independently verified.

## 4. Multi-Region Architecture

```
Daytona Control Plane
    │
    ├── Region: us-east-1
    │   ├── Runners (polling)
    │   ├── Snapshot Registry (S3)
    │   └── Proxy (optional)
    │
    ├── Region: eu-west-1
    │   ├── Runners (polling)
    │   ├── Snapshot Registry (S3)
    │   └── Proxy (optional)
    │
    └── Region: ap-southeast-1
        ├── Runners (polling)
        ├── Snapshot Registry (S3)
        └── Proxy (optional)
```

**[F]** Multi-region architecture from DeepWiki and architecture docs.

## 5. Snapshot Distribution

```
Snapshot Lifecycle Across Regions:
1. Snapshot built/pushed to internal OCI registry (S3-backed)
2. SnapshotManager detects new snapshot
3. SnapshotManager scales snapshot to regional runners
4. Regional runners pull image from local registry
5. Snapshot marked as READY in that region
6. Cron cleanup removes inactive snapshots
```

**[F]** Snapshot distribution from DeepWiki and PR #4636.

## 6. RoboThree Deployment Recommendations

| Daytona Pattern | RoboThree Application | Recommendation |
|----------------|----------------------|----------------|
| **V2 Job Polling** | Worker Runtime → Control Plane communication | **ADOPT** — enables Remote Worker behind firewall |
| **Customer-Managed Regions** | Enterprise Control Plane + Customer Workers | **ADOPT** — enterprise deployment model |
| **Runner Self-Registration** | Worker registration in Control Plane | **ADOPT** — plug-and-play workers |
| **Healthcheck Heartbeat** | Worker health monitoring | **ADOPT** — dead worker detection |
| **Multi-Region Snapshots** | Workspace template distribution | **ADAPT** — evaluate OCI vs custom format |
| **Optional Proxy/Gateway** | Traffic routing per deployment | **ADAPT** — make components composable |
| **V0 Direct HTTP** (legacy) | Direct Worker call (simpler setups) | **DEFER** — V2 polling is better; add V0 only if needed |

### Key Architectural Insight

> Daytona v2 的 Job Polling 模式证明了：**Control Plane 不需要直接管理容器，甚至不需要直接调用 Worker API**。Worker 主动拉取 Job、执行、回报结果。这是实现 Agent Runtime 不直接管理容器的最佳实践。

**[R]** This insight is the single most important finding for RoboThree Worker Runtime architecture.
