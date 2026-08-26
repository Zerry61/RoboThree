# Project Overview — Daytona

> **Repository**: https://github.com/daytonaio/daytona
> **Target Ref**: `main` branch, commit `ec4c21b` (partial shallow clone)
> **Research Date**: 2026-07-18

## 1. What Is Daytona?

Daytona is an **open-source, secure, elastic infrastructure platform for running AI-generated code**. It provides ephemeral sandbox environments that spin up in under 90ms, designed for AI agent workflows, code execution, and development environments.

**核心定位**：Daytona 是一个 **Sandbox-as-a-Service 平台**。它不是 Agent Framework，而是 Agent 执行代码所需要的安全隔离环境的基础设施层。

## 2. License Snapshot

| Aspect | Detail |
|--------|--------|
| **Primary License** | AGPL-3.0 |
| **SDK License** | Apache-2.0 (TypeScript, Python, Go, Ruby, Java SDKs) |
| **Dual Licensing** | Yes — AGPL for backend, Apache-2.0 for client SDKs |
| **Commercial Use** | Requires license for proprietary forks; SDKs permissive |
| **Copyleft Risk** | HIGH for backend integration; LOW for SDK-only usage |
| **RoboThree Implication** | DESIGN_ONLY — reference architecture patterns, do not embed code |

**[F]** License files: `README.md` header, license link at bottom of repo page. AGPL-3.0 for the platform; SDKs under `libs/` use Apache-2.0.

**[I]** The dual licensing strategy (AGPL platform + Apache-2.0 SDKs) suggests Daytona intends the platform to be open but SDK integrations to be frictionless — a common commercial open-source pattern.

## 3. Technology Stack

### Backend / Control Plane

| Component | Language | Framework | Purpose |
|-----------|----------|-----------|---------|
| API Service | TypeScript | NestJS | Central orchestration, REST API, business logic |
| Database | PostgreSQL | TypeORM | Persistent metadata store |
| Cache / Locking | Redis | ioredis | Distributed locking, rate limiting, sessions |
| Object Storage | S3/MinIO | — | Snapshots, volumes, backups |
| Metrics | ClickHouse | — | High-performance telemetry |
| Audit Logs | OpenSearch | — | Administrative audit trails |
| Email | SMTP | — | Notifications |
| Analytics | PostHog | — | Product analytics |

### Compute Plane (Go)

| Component | Language | Framework | Purpose |
|-----------|----------|-----------|---------|
| Runner | Go | Gin | Container lifecycle, sandbox execution |
| Daemon | Go | stdlib | Code execution agent inside sandboxes |
| Proxy | Go | — | HTTP/WebSocket routing, auth |
| SSH Gateway | Go | — | SSH connection handling |
| Snapshot Manager | Go | — | Snapshot lifecycle |
| CLI | Go | — | User interaction |

### Frontend

| Component | Language | Framework |
|-----------|----------|-----------|
| Dashboard | TypeScript | React + Vite |

### Infrastructure

| Component | Technology |
|-----------|-----------|
| Container Runtime | Docker (Docker-in-Docker for runners) |
| GPU Support | NVIDIA CDI (Container Device Interface) |
| Networking | Custom bridge (`runner-bridge`, `172.20.0.0/16`), ICC disabled |
| Persistent Storage | S3 FUSE (`mount-s3`) |

## 4. Monorepo Structure

```
daytona/
├── apps/
│   ├── api/          # NestJS Control Plane (TypeScript)
│   ├── cli/          # Go CLI
│   ├── daemon/       # Go sandbox daemon
│   ├── dashboard/    # React/Vite web UI
│   ├── docs/         # Documentation (Astro/Starlight)
│   ├── proxy/        # Go HTTP proxy
│   ├── runner/       # Go compute plane
│   ├── snapshot-manager/  # Go snapshot manager
│   └── ssh-gateway/  # Go SSH gateway
├── libs/
│   ├── api-client-go/      # Go API client
│   ├── common-go/          # Shared Go utilities
│   ├── computer-use/       # Computer Use library
│   ├── python-sdk/         # Python SDK
│   ├── typescript-sdk/     # TypeScript SDK
│   ├── go-sdk/             # Go SDK
│   ├── ruby-sdk/           # Ruby SDK
│   └── java-sdk/           # Java SDK
├── docker/           # Docker Compose for self-hosted
├── go.work           # Go workspace config
└── README.md
```

**[F]** Monorepo structure confirmed via GitHub repository tree (`github.com/daytonaio/daytona/tree/main`), DeepWiki analysis (`deepwiki.com/daytonaio/daytona/1.1-system-architecture-overview`).

## 5. Key Entry Points

| Component | Entry File | Function |
|-----------|-----------|----------|
| API Server | `apps/api/src/main.ts` | NestJS bootstrap |
| Runner | `apps/runner/cmd/runner/main.go` | Gin server + poller wiring |
| Daemon | `apps/daemon/cmd/daemon/main.go` | Sandbox agent bootstrap |
| CLI | `apps/cli/cmd/` | Cobra commands |
| Proxy | `apps/proxy/cmd/` | HTTP proxy |

**[F]** Entry points confirmed via DeepWiki analysis and PR discussions. Runner entry at `main.go:130-134` extracts embedded daemon binary; daemon entry initializes OpenTelemetry + session executor.

## 6. Deployment Models

| Model | Description |
|-------|-------------|
| **Managed** (`app.daytona.io`) | Fully hosted Daytona service |
| **Self-Hosted** | Docker Compose from `docker/` directory |
| **Hybrid / Customer-Managed** | Control plane in Daytona cloud; compute on customer infrastructure |

**[F]** Deployment models described in official architecture docs and search results.

## 7. Confidence Assessment

| Area | Confidence | Reason |
|------|-----------|--------|
| Architecture | HIGH | Official architecture docs + DeepWiki + PR discussions |
| Source Structure | HIGH | GitHub tree + DeepWiki analysis |
| Control Plane | HIGH | Multiple search results confirming API structure |
| Compute Plane | HIGH | DeepWiki runner architecture detail |
| Sandbox Lifecycle | HIGH | Official sandbox documentation |
| Daemon/Toolbox | MEDIUM | Documented but not source-verified |
| Audit Log | HIGH | DeepWiki audit logging detail |
| Network Policy | HIGH | Official docs + DeepWiki |
| Resource Quota | HIGH | Official docs |
| Computer Use | MEDIUM | SDK-level documentation, limited source evidence |
| Customer-Managed Compute | MEDIUM | Documented in architecture, limited source evidence |

**Overall**: 研究基于官方架构文档 + DeepWiki 源码分析 + PR 讨论 + Web 搜索结果。由于 Git clone 失败（网络限制），未获得完整本地源码。置信度 HIGH 的来源是官方文档与 DeepWiki 交叉验证的结果。置信度 MEDIUM 的维度仅基于文档声明，未经过源码验证。
