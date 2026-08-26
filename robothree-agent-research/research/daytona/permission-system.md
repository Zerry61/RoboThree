# Permission & Network Policy — Daytona

> **Evidence Basis**: Official architecture docs, sandbox docs, DeepWiki network configuration
> **Conclusion Types**: [F] = FACT, [I] = INFERENCE, [R] = RECOMMENDATION

## 1. Network Isolation Architecture

Daytona 实现三层网络隔离，从物理层到应用层：

### 1.1 Layer 1 — Bridge Isolation (Physical)

```
Runner Bridge Network: runner-bridge
├── Subnet: 172.20.0.0/16
├── ICC (Inter-Container Communication): DISABLED
├── Each sandbox gets dedicated network namespace
└── Sandbox → Sandbox communication: IMPOSSIBLE
```

**[F]** Bridge isolation confirmed via DeepWiki runner architecture (`client.go:97-116`) and official network docs. ICC disabled — sandboxes cannot reach each other at the Docker bridge level.

### 1.2 Layer 2 — Egress Control (iptables)

```go
// Applied asynchronously when containers start
// NetRulesManager handles runtime updates

Network Config:
├── networkBlockAll: true  → iptables DROP all outbound
├── networkAllowList: "10.0.0.0/8,192.168.0.0/16"
│   └── iptables ACCEPT only listed CIDRs
├── limitNetworkEgress: "true"
│   └── Apply rate limiter to outbound traffic
└── Rules applied using sandbox's internal IP
```

**[F]** Egress control confirmed via official sandbox docs and DeepWiki network configuration page. iptables-based enforcement.

### 1.3 Layer 3 — Tier-Based Restrictions

| Tier | Network Policy | Use Case |
|------|---------------|----------|
| **Tier 1** | Restricted: package registries, Git, CDN, AI APIs only | Basic sandbox |
| **Tier 2** | Same as Tier 1 + extended service list | Standard sandbox |
| **Tier 3** | Full internet (optional allowlist/block) | Advanced sandbox |
| **Tier 4** | Full internet (optional allowlist/block) | Enterprise sandbox |

**[F]** Tier-based restrictions confirmed via official sandbox docs.

## 2. Authentication & Authorization

### 2.1 Control Plane Auth

```
Primary Auth: Auth0 / OIDC
├── Organization-level multi-tenancy
├── JWT token validation
└── Role-based access control (RBAC)

API Security:
├── All endpoints require authentication
├── Organization-scoped data isolation
└── API token for runner authentication
```

**[F]** Auth confirmed via architecture docs. Auth0/OIDC integration mentioned as primary auth mechanism.

### 2.2 Sandbox Access Control

```
Sandbox Auth:
├── Unique authToken per sandbox
├── Daemon API (:2280) requires authToken
├── Web Terminal (:22222) restricted to org members
├── SSH: time-limited tokens via create_ssh_access()
├── VNC (:33333) requires authentication
└── Preview URLs: optional signed tokens with expiry
```

**[F]** Sandbox access confirmed via sandbox documentation.

### 2.3 API Token Model

```
Runner Authentication:
├── DAYTONA_RUNNER_TOKEN env var
├── API validates token on job poll
└── Runner identity tied to organization + region

SDK Authentication:
├── DAYTONA_API_KEY for programmatic access
├── Organization-scoped permissions
└── Rate limited via Redis
```

**[F]** Token model confirmed via runner config and SDK documentation.

## 3. Security Boundaries

### 3.1 Container Isolation

```
Sandbox Container:
├── Linux Namespaces: PID, NET, IPC, UTS, MNT
├── No shared PID namespace between sandboxes
├── No shared network namespace
├── Standard sandbox: Privileged = true (⚠️)
├── GPU sandbox: Privileged = false (CDI-based GPU access)
└── No Docker socket mount (⚠️ needs verification)
```

**[F]** Container isolation confirmed via DeepWiki container_configs.go analysis. [UNKNOWN] Docker socket mount status in standard sandboxes needs source verification. [I] "Privileged = true" for standard sandboxes is a security concern — may enable container escape.

### 3.2 Filesystem Isolation

```
Sandbox Filesystem:
├── Dedicated overlay filesystem per container
├── Persistent volumes: S3 FUSE mount-s3
│   ├── mount-s3 --allow-other (⚠️ wide permissions)
│   └── systemd-run --scope for survival
├── Daemon binary: read-only bind-mount
├── Computer Use plugin: read-only mount
└── Volumes cleanup: 30s interval orphan GC
```

**[F]** Filesystem from DeepWiki. [I] `--allow-other` on FUSE mounts may allow cross-sandbox FS access if not properly namespaced.

### 3.3 Process Isolation

```
Process Boundaries:
├── Dedicated PID namespace per sandbox
├── Process execution via daemon (not direct Docker exec)
├── FIFO pipes for stdout/stderr (not shared memory)
├── Timeout-based termination (configurable per command)
└── PTY sessions: size, cwd, env isolation
```

**[F]** Process isolation confirmed via sandbox docs and daemon analysis.

## 4. Threat Model & Risks

### 4.1 Identified Risks

| Risk | Severity | Evidence | Mitigation |
|------|----------|----------|------------|
| Standard sandbox runs privileged | HIGH | `container_configs.go` — Privileged=true | Use GPU/CDI mode or custom seccomp profiles |
| FUSE --allow-other | MEDIUM | `volumes_mountpaths.go` — mount-s3 --allow-other | Needs namespace verification |
| Daemon binary injection | MEDIUM | Binary mounted from host | Ensure binary integrity (signatures) |
| iptables async application | LOW | Rules applied after container start | Brief window of unrestricted egress |

**[F]** Risks identified via DeepWiki source analysis. [I] Severity assessments are inferential without full source.

### 4.2 Network Threat Surface

```
Egress Paths:
├── Default: bridge network (ICC disabled) ✅
├── Tier 1-2: restricted egress (iptables) ✅
├── Tier 3-4: full internet ⚠️
└── Preview URL: public or signed ✅

Ingress Paths:
├── Proxy routing: {port}-{sandboxId}.{proxyDomain} ✅
├── SSH: time-limited tokens ✅
├── Web Terminal: org-members only ✅
└── VNC: authenticated ✅
```

**[F]** Network threat surface from architecture docs and sandbox docs.

## 5. RoboThree Implications

| Daytona Feature | RoboThree Mapping | Recommendation |
|----------------|-------------------|----------------|
| Bridge Isolation + ICC Disabled | Sandbox network model | ADOPT |
| iptables Egress Control | Network Policy engine | ADAPT — consider eBPF/Cilium for Kubernetes |
| Tier-Based Restrictions | Resource Quota + Policy tiers | ADOPT |
| authToken per Sandbox | Sandbox identity model | ADOPT |
| Time-limited SSH tokens | Remote Worker access | ADOPT |
| Privileged containers for standard | Sandbox security posture | REJECT — use rootless/namespace-only |
| FUSE mount for persistent volumes | Workspace storage | ADAPT — evaluate vs CSI drivers |
