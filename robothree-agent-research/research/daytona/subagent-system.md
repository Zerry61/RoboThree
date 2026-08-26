# Subagent / Worker System — Daytona Runner Architecture

> **Evidence Basis**: DeepWiki runner architecture, PR #3361 (Runner v2), architecture docs
> **Conclusion Types**: [F] = FACT, [I] = INFERENCE, [R] = RECOMMENDATION

## 1. Runner as Agent Worker

Daytona 的 Runner 架构是 RoboThree Worker Runtime 最直接的参照对象。Runner 本质上是一个 **专用 Agent Worker** — 它不执行 AI 推理，而是管理 AI Agent 所需的执行环境。

### 1.1 Worker Abstraction Levels

```
Daytona Worker Hierarchy:
┌────────────────────────────────────────┐
│ Control Plane (NestJS API)             │  Orchestration
│ - Job creation & scheduling            │
│ - State reconciliation                 │
│ - Audit logging                        │
├────────────────────────────────────────┤
│ Runner v2 (Go)                         │  Worker Node
│ - Job polling from control plane       │
│ - Container lifecycle management       │
│ - Resource allocation & monitoring     │
├────────────────────────────────────────┤
│ Sandbox Container                      │  Execution Environment
│ - Isolated Linux environment           │
│ - Daemon (in-sandbox agent)            │
│ - Toolbox API (:2280)                  │
└────────────────────────────────────────┘
```

**[F]** Worker hierarchy derived from architecture analysis.

### 1.2 Runner as "Agent Runtime Worker"

将 Daytona Runner 映射到 RoboThree 概念：

| Daytona Concept | RoboThree Concept | Mapping |
|----------------|-------------------|---------|
| Runner | Cloud Worker / Remote Worker | 1:1 — worker node managing execution environments |
| Sandbox | Sandbox | 1:1 — isolated execution environment |
| Daemon | Agent Runtime (in-sandbox) | 1:1 — agent binary injected into sandbox |
| Control Plane API | Enterprise Control Plane | 1:1 — central orchestration |
| Job Queue | Task Scheduler | 1:1 — task distribution |

**[R]** This mapping validates RoboThree's proposed module decomposition.

## 2. Job-Based Worker Communication

### 2.1 The Pull Model

这是 Daytona 架构最核心的设计决策：

```
Traditional Push Model (V0):
Control Plane → HTTP call → Worker
    Problems:
    ├── Worker must expose endpoint (firewall issue)
    ├── Control Plane must know worker address
    ├── Worker failure = HTTP timeout
    └── Hard to scale across regions

Daytona Pull Model (V2):
Worker → HTTP poll → Control Plane
    Benefits:
    ├── Worker only needs outbound HTTPS
    ├── Worker self-registers (address not needed)
    ├── Job durability (in DB, not memory)
    ├── Dead worker → timeout → reassign
    └── Multi-region, customer-managed friendly
```

**[F]** Pull model from PR #3361 and architecture docs.

### 2.2 Worker Lifecycle

```
Worker Registration:
1. Runner starts with DAYTONA_RUNNER_TOKEN
2. Runner calls Control Plane: register(token, capacity)
3. Control Plane validates token → creates runner record
4. Runner begins polling for jobs

Worker Heartbeat:
1. Healthcheck service sends heartbeat every N seconds
2. Reports: status, capacity, active sandboxes
3. Control Plane tracks last heartbeat timestamp
4. No heartbeat for > timeout → mark runner as DEAD
5. Dead runner's PENDING jobs → reassigned

Worker Shutdown:
1. Runner stops polling
2. Completes in-flight jobs (graceful)
3. Reports shutdown to Control Plane
4. Control Plane marks runner as OFFLINE
```

**[F]** Worker lifecycle from DeepWiki runner architecture and PR #3361.

## 3. Resource Management

### 3.1 Per-Sandbox Resources

```
Sandbox Resource Allocation:
├── CPU: 1-4 vCPU (org max)
├── Memory: 1-8 GiB (org max)
├── Disk: 1-10 GiB (org max)
└── GPU: Fixed (16 cores, 256GB RAM, 512GB disk)

Org-Level Quotas:
├── Tier 1: 10 vCPU / 10 GiB RAM / 30 GiB Storage
├── Tier 2: 100 vCPU / 200 GiB RAM / 300 GiB Storage
├── Tier 3: 250 vCPU / 500 GiB RAM / 2000 GiB Storage
└── Tier 4: 500 vCPU / 1000 GiB RAM / 5000 GiB Storage

Quota Validation:
├── Per-sandbox max check (org settings)
├── Aggregate regional usage check
├── Occurs BEFORE sandbox creation
└── Failed validation → 4xx error
```

**[F]** Resource limits and quotas from official sandbox docs.

### 3.2 Runner Capacity Reporting

```
Runner reports to Control Plane:
├── Total CPU cores available
├── Total memory available
├── Total disk available
├── Currently allocated CPU/memory/disk
├── Active sandbox count
└── GPU availability (if applicable)

Control Plane uses capacity for:
├── Scheduling decisions (which runner gets job)
├── Quota validation (does org have capacity)
├── Auto-scaling signals
└── Capacity planning
```

**[F]** Capacity reporting from DeepWiki healthcheck and runner architecture.

## 4. Daemon as In-Sandbox Subagent

### 4.1 Agent Injection Model

```
┌──────────────────────────────────────┐
│ Runner                               │
│                                      │
│  Embedded Binary:                    │
│  ┌──────────────────────────────┐    │
│  │ daemon-amd64 (Go binary)      │    │
│  │ ├── Toolbox API server        │    │
│  │ ├── Process executor          │    │
│  │ ├── LSP server                │    │
│  │ ├── Computer Use engine       │    │
│  │ └── Session manager           │    │
│  └──────────────────────────────┘    │
│           │                          │
│           │ bind-mount                │
│           ▼                          │
│  ┌──────────────────────────────┐    │
│  │ Sandbox Container            │    │
│  │  /usr/local/bin/daytona ←─── │    │
│  │  (daemon starts on boot)     │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

**[F]** Agent injection from DeepWiki runner architecture: binary extraction at `main.go:130-134`, bind-mount at `container_configs.go:189`.

### 4.2 Why Injection Instead of Pre-Installed?

```
Injection Benefits:
├── Runner controls agent version (not image)
├── Works with any base image
├── No pre-built image requirements
├── Single binary update upgrades all sandboxes
└── Consistent behavior across all sandboxes

Pre-Installed Drawbacks:
├── Image must include agent
├── Version tied to image tag
├── Hard to upgrade agent across all images
└── Image maintenance burden
```

**[R]** This is a crucial insight for RoboThree: Agent Runtime should be injected by Worker, not pre-installed in sandbox images.

## 5. Computer Use as Specialized Subagent

### 5.1 Computer Use Architecture

```
Computer Use Plugin:
├── Separate binary/library: /usr/local/lib/daytona-computer-use
├── Mounted into sandbox (read-only)
├── Provides: mouse, keyboard, screenshot, VNC
├── Lifecycle managed by daemon
└── Accessible via Toolbox API (:2280)

VNC/Recording:
├── VNC server for GUI interaction
├── Session recording (start/stop/list/download/delete)
├── Recording playback on port 33333
└── Auth required for all access
```

**[F]** Computer Use from DeepWiki `container_configs.go:192-194` (plugin mount) and sandbox docs.

### 5.2 Computer Use as Agent Capability

```
AI Agent using Computer Use:
1. Agent (via SDK) → create sandbox with computer_use enabled
2. Daemon starts Computer Use engine
3. Agent sends mouse/keyboard/screenshot commands via Toolbox API
4. Daemon executes in sandbox's virtual display
5. Results (screenshots, recordings) returned to agent
6. Cleanup: stop engine, download recordings
```

**[I]** Computer Use flow inferred from SDK docs and sandbox documentation.

## 6. RoboThree Worker Architecture Recommendations

### 6.1 Core Architecture

```
Proposed RoboThree Worker Architecture (inspired by Daytona):

┌─────────────────────────────────────────┐
│ Enterprise Control Plane                │
│ ┌─────────────────────────────────┐     │
│ │ Job Queue (PostgreSQL)          │     │
│ │ State Reconciliation (cron)     │     │
│ │ Audit Logging                   │     │
│ └─────────────────────────────────┘     │
└──────────────┬──────────────────────────┘
               │ HTTPS (poll)
    ┌──────────┴──────────┐
    │                     │
┌───▼──────────┐   ┌──────▼──────────┐
│ Cloud Worker │   │ Remote Worker   │
│ (managed)    │   │ (customer infra)│
│ ┌──────────┐ │   │ ┌──────────┐    │
│ │ Poller   │ │   │ │ Poller   │    │
│ │ Executor │ │   │ │ Executor │    │
│ │ Health   │ │   │ │ Health   │    │
│ └──────────┘ │   │ └──────────┘    │
│      │       │   │      │          │
│ ┌────▼────┐  │   │ ┌────▼────┐     │
│ │Sandbox  │  │   │ │Sandbox  │     │
│ │+ Agent  │  │   │ │+ Agent  │     │
│ └─────────┘  │   │ └─────────┘     │
└──────────────┘   └─────────────────┘
```

### 6.2 Key Design Decisions

| Decision | Daytona Pattern | Recommendation |
|----------|----------------|----------------|
| Worker communication | V2 Job Polling | **ADOPT** |
| Agent in sandbox | Daemon injection | **ADOPT** |
| Worker registration | Token + heartbeat | **ADOPT** |
| Resource allocation | Per-sandbox + org quotas | **ADOPT** |
| Job durability | PostgreSQL-backed | **ADOPT** |
| State reconciliation | 5s cron loop | **ADOPT** |
| Computer Use | Plugin mount + daemon API | **ADAPT** — evaluate priority |

### 6.3 Anti-Pattern to Avoid

> ❌ **Agent Runtime 直接管理容器**: Daytona 的架构清晰地展示了为什么不应该这样做。Control Plane 不应该直接调用 Docker API 或 Kubernetes API 来管理容器。它应该：
> 1. 将执行需求建模为 Job
> 2. Worker 拉取 Job
> 3. Worker 管理容器生命周期
> 4. Worker 回报结果
>
> 这种间接性是实现 Cloud Worker 和 Remote Worker 统一抽象的关键。

**[R]** This anti-pattern avoidance is the central architectural recommendation for RoboThree.
