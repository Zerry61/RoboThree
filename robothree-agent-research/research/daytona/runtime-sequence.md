# Runtime Sequence — Daytona

> **Evidence Basis**: Official architecture docs, DeepWiki, PR #3361 (Runner v2), PR #4452
> **Conclusion Types**: [F] = FACT, [I] = INFERENCE, [R] = RECOMMENDATION

## 1. Primary Trace: Sandbox Creation (V2 Job-Based)

The representative end-to-end path for sandbox creation via the V2 job-based polling architecture.

### 1.1 Mermaid Sequence Diagram

```mermaid
sequenceDiagram
    participant Client as Client (SDK/CLI)
    participant API as Daytona API (NestJS)
    participant DB as PostgreSQL
    participant Redis as Redis
    participant Runner as Runner v2 (Go)
    participant Docker as Docker Daemon
    participant Sandbox as Sandbox Container
    participant Daemon as Daytona Daemon
    participant OS as OpenSearch

    Note over Client,OS: Sandbox Creation — V2 Job-Based Polling

    Client->>API: H1 POST /sandbox {snapshot, resources}
    API->>API: H2 Auth check (Auth0/OIDC)
    API->>DB: H3 Validate org quota
    DB-->>API: H4 Quota OK
    API->>Redis: H5 Acquire lock (sandbox:{id}:state-change)
    Redis-->>API: H6 Lock acquired
    API->>DB: H7 INSERT sandbox (state=PENDING_BUILD)
    API->>DB: H8 INSERT job (type=CREATE_SANDBOX, status=PENDING)
    API->>API: H9 AuditInterceptor.pre() → audit log (status=null)
    API-->>Client: H10 Return sandbox ID (state=PENDING_BUILD)

    Note over Runner,OS: Async: Runner picks up the job

    loop Poll interval
        Runner->>API: H11 GET /jobs?status=PENDING
        API->>DB: H12 Query pending jobs for runner
        API-->>Runner: H13 Return job[JSON]
    end

    Runner->>Runner: H14 Executor dispatch → sandbox.go handler
    Runner->>Docker: H15 Pull snapshot image (OCI registry)
    Docker-->>Runner: H16 Image pulled
    Runner->>Docker: H17 Create container (resources, network, mounts)
    Runner->>Docker: H18 Bind-mount daemon at /usr/local/bin/daytona
    Runner->>Docker: H19 Mount volumes (S3 FUSE if configured)
    Runner->>Docker: H20 Start container
    Docker-->>Runner: H21 Container running
    Runner->>Runner: H22 Apply iptables rules (network policy)
    Runner->>API: H23 PATCH /jobs/{id} {status=SUCCESS, metadata}

    Note over Sandbox: Container starts, daemon self-initializes

    Sandbox->>Daemon: H24 Daemon starts (:2280)
    Daemon->>Daemon: H25 Init OTel providers (logs/metrics/traces)
    Daemon->>Daemon: H26 Init session executor (FIFO pipes)

    Note over API,OS: API handles job completion

    API->>API: H27 JobStateHandlerService.handleCreateSandboxCompletion()
    API->>DB: H28 UPDATE sandbox state → STARTED
    API->>Redis: H29 Release lock
    API->>API: H30 AuditInterceptor.post() → statusCode=200
    API->>DB: H31 INSERT/UPDATE audit_log (statusCode, metadata)
    API->>DB: H32 Cron → publish audit log
    API->>OS: H33 Bulk write to OpenSearch Data Stream
    API->>API: H34 Trigger webhooks, notifications
```

**[F]** Sequence confirmed via: architecture docs, PR #3361 (Runner v2), DeepWiki runner system and backend architecture pages.

## 2. Hop Evidence Table

| Hop | From → To | File / Source | Symbol or Key | Evidence Type | Conclusion Type | Confidence |
|-----|-----------|---------------|---------------|---------------|-----------------|------------|
| H1 | Client → API | `sandbox.controller.ts` | `POST /sandbox` | DOCS | FACT | HIGH |
| H2 | API Auth | Auth0/OIDC config | Guard decorator | DOCS | FACT | HIGH |
| H3-H4 | API → DB Quota | NestJS service | `validateOrgQuota()` | DEEPWIKI | INFERENCE | MEDIUM |
| H5-H6 | Redis Lock | Redis module | `sandbox:{id}:state-change` | DEEPWIKI | FACT | HIGH |
| H7 | INSERT Sandbox | `sandbox.entity.ts` | TypeORM `.save()` | DEEPWIKI | FACT | HIGH |
| H8 | INSERT Job | Job entity (V2) | `RunnerAdapterV2.createJob()` | DEEPWIKI | FACT | HIGH |
| H9 | Audit Interceptor | `audit.interceptor.ts` | `pre()` → status=null | DEEPWIKI | FACT | HIGH |
| H11-H13 | Runner Poll | `poller/poller.go` | `Poll()` | DEEPWIKI | FACT | HIGH |
| H14 | Executor Dispatch | `executor/executor.go` | `Dispatch(job)` | DEEPWIKI | FACT | HIGH |
| H15-H16 | Docker Pull | `client.go` | `RetryWithExponentialBackoff` | DEEPWIKI | FACT | MEDIUM |
| H17-H20 | Container Create | `container_configs.go` | Standard vs GPU config | DEEPWIKI | FACT | HIGH |
| H21-H22 | Network Rules | `NetRulesManager` | iptables apply | DOCS | FACT | MEDIUM |
| H23 | Job Update | `poller/poller.go` | `UpdateJobStatus()` | DEEPWIKI | FACT | HIGH |
| H24-H26 | Daemon Init | `cmd/daemon/main.go` | OTel + session executor | DEEPWIKI | FACT | MEDIUM |
| H27-H28 | State Handler | `job-state-handler.service.ts` | `handleCreateSandboxCompletion()` | DEEPWIKI | FACT | HIGH |
| H29 | Release Lock | Redis module | Lock release | DEEPWIKI | INFERENCE | MEDIUM |
| H30-H33 | Audit Publish | `audit-opensearch.adapter.ts` | Bulk write to Data Stream | DEEPWIKI | FACT | MEDIUM |

## 3. Secondary Trace: Process Execution via Daemon Toolbox API

```mermaid
sequenceDiagram
    participant Agent as AI Agent (SDK)
    participant Proxy as Daytona Proxy
    participant Daemon as Sandbox Daemon :2280
    participant Shell as Shell Process

    Note over Agent,Shell: Process Execution via Toolbox API

    Agent->>Proxy: H1 POST /toolbox/{sandboxId}/process/execute
    Proxy->>Proxy: H2 Auth (sandbox authToken)
    Proxy->>Daemon: H3 Forward to sandbox:2280
    Daemon->>Daemon: H4 Validate authToken
    Daemon->>Shell: H5 Create PTY (FIFO pipes)
    Daemon->>Shell: H6 Execute command with cwd/env/timeout
    Shell-->>Daemon: H7 Stream stdout/stderr via FIFO
    Daemon-->>Proxy: H8 Stream output (SSE/WS)
    Proxy-->>Agent: H9 Stream output to SDK
    Shell->>Daemon: H10 Process exit (exit code)
    Daemon-->>Proxy: H11 Return exit code
    Proxy-->>Agent: H12 Complete with exit code
```

**[F]** Process execution confirmed via official sandbox docs (Toolbox API). [I] SSE/WS streaming inferred from SDK documentation.

## 4. Tertiary Trace: Auto-Stop Lifecycle

```mermaid
sequenceDiagram
    participant Cron as Cron Job (10s)
    participant Svc as SandboxService
    participant DB as PostgreSQL
    participant API as Daytona API
    participant Runner as Runner

    Note over Cron,Runner: Auto-Stop Lifecycle

    Cron->>Svc: H1 checkAutoStop()
    Svc->>DB: H2 Query: lastActivityAt < now() - autoStopInterval
    DB-->>Svc: H3 Idle sandboxes
    Svc->>API: H4 Create STOP_SANDBOX job
    API->>DB: H5 INSERT job (STOP_SANDBOX)
    Runner->>API: H6 Poll job
    Runner->>Runner: H7 Stop container
    Runner->>API: H8 Job complete
    API->>DB: H9 UPDATE sandbox state → STOPPED

    Note over Cron,Runner: Then: Auto-Archive

    Cron->>Svc: H10 checkAutoArchive()
    Svc->>DB: H11 Query: stopped > autoArchiveInterval
    Svc->>Svc: H12 Archive: preserve filesystem, remove container
    Svc->>DB: H13 UPDATE sandbox state → ARCHIVED
```

**[F]** Auto-stop flow confirmed via official sandbox docs.

## 5. Confirmed by

| Path | Confirmation |
|------|-------------|
| Primary (Sandbox Creation) | Source docs + DeepWiki + PR discussions |
| Secondary (Process Execution) | Official sandbox docs |
| Tertiary (Auto-Stop) | Official sandbox docs |

**Overall**: source-confirmed (docs + DeepWiki), not runtime-verified.
