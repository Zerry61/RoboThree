# Open Questions — Daytona

> **Research**: daytonaio/daytona @ `main`
> **Status**: Active — questions pending source verification

## 1. Architecture Questions

### Q1: V2 Polling Latency
**Question**: What is the typical end-to-end latency for sandbox creation in V2 polling mode (from API job creation to sandbox STARTED)?
**Why Matters**: RoboThree Worker Runtime latency SLO
**Current Evidence**: "90ms cold start" claim in docs — but this is container startup time, not including polling delay
**How to Close**: Benchmark a self-hosted Daytona instance; measure job creation → completion latency

### Q2: Polling Interval
**Question**: What is the configurable polling interval for V2 runners? Is it adaptive (shorter when busy, longer when idle)?
**Why Matters**: Determines minimum latency for Worker task pickup
**Current Evidence**: Polling loop mentioned in `poller.go` without interval specification
**How to Close**: Read `poller.go` source or Daytona configuration reference

### Q3: Max Sandboxes Per Runner
**Question**: What is the practical limit of concurrent sandboxes per runner node?
**Why Matters**: Worker capacity planning
**Current Evidence**: Resource limits documented (per-sandbox and org-level), but not per-runner
**How to Close**: Load test or Daytona operations documentation

### Q4: Daemon Binary Size
**Question**: How large is the embedded daemon binary (`daemon-amd64`)?
**Why Matters**: Impacts sandbox startup time and image transfer
**Current Evidence**: Not documented
**How to Close**: Binary size measurement from release artifacts

## 2. Security Questions

### Q5: Privileged Container Justification
**Question**: Why does Daytona use `Privileged=true` for standard sandboxes? Is there a technical requirement, or is it for convenience?
**Why Matters**: RoboThree security posture
**Current Evidence**: `container_configs.go` — Privileged=true for standard; false for GPU
**How to Close**: Source analysis of container requirements; Daytona security documentation

### Q6: Docker Socket Exposure
**Question**: Is the Docker socket mounted inside standard sandboxes? If not, how does Docker-in-Docker work?
**Why Matters**: Container escape risk
**Current Evidence**: UNKNOWN — not covered in available documentation
**How to Close**: Read `container_configs.go` for mount specifications

### Q7: Daemon Binary Integrity
**Question**: Is the embedded daemon binary signed? Is signature verified before bind-mount?
**Why Matters**: Supply chain security for injected agent
**Current Evidence**: No mention of binary signing in available sources
**How to Close**: Check build pipeline and binary signing configuration

## 3. Operational Questions

### Q8: OpenSearch vs ClickHouse Overlap
**Question**: Why use both ClickHouse (metrics) and OpenSearch (audit logs)? Could a single store serve both?
**Why Matters**: RoboThree observability stack simplification
**Current Evidence**: Both mentioned in telemetry stack; different query patterns implied
**How to Close**: Daytona architecture decision records or engineering blog

### Q9: PostHog Dependency
**Question**: Is PostHog required for self-hosted deployments, or is it optional?
**Why Matters**: Self-hosted RoboThree should not require third-party analytics
**Current Evidence**: PostHog listed in architecture; self-hosted Docker Compose content unknown
**How to Close**: Check `docker/docker-compose.yml` — which services are required vs optional

### Q10: Auth0 Lock-in
**Question**: How tightly coupled is the API to Auth0? Can it work with any OIDC provider?
**Why Matters**: Enterprise deployments may require specific IdP
**Current Evidence**: Architecture mentions "Auth0/OIDC" — suggests generic OIDC support
**How to Close**: Read auth module source (`apps/api/src/auth/`)

## 4. Computer Use Questions

### Q11: Computer Use Performance
**Question**: What is the latency for screenshot capture over the Toolbox API? Is it suitable for real-time agent interaction?
**Why Matters**: Computer Use agent responsiveness
**Current Evidence**: API documented but no performance metrics
**How to Close**: Benchmark screenshot + mouse/keyboard round-trip latency

### Q12: VNC vs WebRTC
**Question**: Does Computer Use use VNC only, or is there a lower-latency WebRTC option?
**Why Matters**: User-facing remote desktop experience
**Current Evidence**: VNC mentioned for browser-based desktop; WebRTC not mentioned
**How to Close**: Check Computer Use plugin source

## 5. Customer-Managed Compute Questions

### Q13: Control Plane Dependency
**Question**: In customer-managed mode, what happens if the connection to Daytona Control Plane is lost? Do sandboxes continue running?
**Why Matters**: Customer-managed Worker resilience
**Current Evidence**: Job polling model — runners need continuous API access
**How to Close**: Test network partition scenario; check for offline mode

### Q14: Data Residency Guarantees
**Question**: In customer-managed mode with local snapshot manager, does any sandbox metadata leave the customer infrastructure?
**Why Matters**: Compliance (GDPR, HIPAA)
**Current Evidence**: Architecture claims data stays in customer infrastructure for optional local components
**How to Close**: Audit of what data the Control Plane stores for customer-managed sandboxes

## 6. SDK Questions

### Q15: SDK Feature Parity
**Question**: Do all five SDKs (Python, TypeScript, Go, Ruby, Java) support the full Toolbox API?
**Why Matters**: RoboThree SDK strategy
**Current Evidence**: Python and TypeScript SDKs documented; Go/Ruby/Java less so
**How to Close**: SDK source comparison

### Q16: MCP Server Implementation
**Question**: Is the MCP Server a wrapper around the SDK, or a direct API client?
**Why Matters**: RoboThree MCP integration strategy
**Current Evidence**: MCP Server listed in Interface Plane; no implementation detail
**How to Close**: MCP Server source code analysis

## 7. Evidence Quality Questions

### Q17: Source Access
**Question**: Can we get a full local clone of the Daytona repo for source-level verification?
**Why Matters**: All source-level evidence currently from DeepWiki/docs; direct verification needed for high-confidence conclusions
**Current Evidence**: Git clone failed due to network constraints
**How to Close**: Retry clone with better network; or use GitHub Codespace; or download release tarball

## Resolution Priority

| Priority | Questions | Rationale |
|----------|-----------|-----------|
| P0 | Q17 (source access) | Foundation for verifying all other answers |
| P0 | Q1, Q2 (polling latency) | Direct impact on RoboThree Worker architecture decision |
| P0 | Q5 (privileged containers) | Security posture decision |
| P1 | Q13 (offline resilience) | Customer-managed Worker architecture |
| P1 | Q3 (scaling limits) | Capacity planning |
| P1 | Q10 (Auth0 lock-in) | Enterprise deployment flexibility |
| P2 | Q8, Q9 (observability stack) | Operational simplification |
| P2 | Q11, Q12 (Computer Use) | Post-MVP feature planning |
| P2 | Q14, Q15, Q16 | Post-MVP details |
