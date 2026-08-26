# Output Templates Guide

> 每个输出文件的：目的 / 适用场景 / 最低完成标准 / 必填章节 / Evidence 要求 / 更新规则 / 与其他文件的关系。

---

## 总原则

1. **每个文件有最小完成标准**：低于该标准不算 Phase 完成。
2. **必填章节缺失 = Phase 未完成**。
3. **Evidence 块**：每个 Phase 模板顶部必须声明 Repository / Branch / Commit；单条结论遵循 `references/evidence-standard.md`。
4. **更新规则**：任何修改必须保留旧版本（在 git 中而不是文件内）；结论改变必须更新 `analysis.json` 对应维度状态。
5. **跨文件引用**：用相对路径 `../<file>.md` 或锚点。

---

## 通用最小字段

每个文件顶部（除 `index.md`、`final-review.md`、`change-report.md` 之外）：

```markdown
## Metadata

- Project: <name>
- Repository: <owner/repo>
- Branch: <branch>
- Commit: <sha>
- Analyzed at: YYYY-MM-DD
- Analyzer: <subagent-name | human>
- Phase: <phase>
- Confidence: HIGH | MEDIUM | LOW (per dimension)
- License: see license-review.md

## Scope

> 描述本文件覆盖的范围、覆盖到哪个 Phase。

## Verified Facts

> 必填。每个事实一段 + Evidence 块。

## Inferences

> 必填（如有）。每条一段 + Evidence 块，列出可证伪条件。

## Unknowns

> 必填（如有）。每条一段 + Evidence 块，说明关闭条件。

## RoboThree Impact

> 必填。列出 ADOPT / ADAPT / DEFER / REJECT / NEEDS_MORE_EVIDENCE 各项。

## Evidence Index

> 必填。引用 `references/evidence-standard.md` 块 ID。

## Last Updated

YYYY-MM-DD
```

---

## 各文件专门要求

### project-overview.md

- 目的：项目定位 + 技术栈 + 顶层结构 + License 摘要 + RoboThree 初步价值。
- 最低标准：一句话定位 + 顶层目录树 + 入口清单 + License 名 + 是否建议 Level 2/3。
- 必填章节：Metadata、Project Positioning、Top-level Layout、Tech Stack、Entry Points、License Snapshot、Preliminary RoboThree Value、Recommended Next Steps。

### source-map.md

- 目的：仓库结构地图、目录职责、关键文件清单、阅读顺序。
- 最低标准：顶层目录 + 每个核心目录的一句话职责 + 阅读顺序。
- 必填章节：Metadata、Top-level Layout、Per-directory Roles、Key Files Index、Recommended Reading Order、Entry Points、Generation / Vendor Markers。

### architecture.md

- 目的：架构总览。
- 必填章节：Metadata、Executive Summary、Project Positioning、Architectural Style、Runtime Boundary、Major Components、Component Relationships、Entry Points、Agent Runtime、Model Layer、Context Layer、Tool Layer、Session and State、Memory、Skill/Plugin/Hook/MCP、Subagent/Worker、Permission/Security、Persistence、Deployment、Observability/Reliability、Key Design Decisions、Strengths、Limitations、Open Questions、RoboThree Implications、Evidence Index。

### runtime-sequence.md

- 目的：一次完整请求的运行时调用链。
- 必填章节：Metadata、Scenario、Preconditions、Entry Point、End-to-End Sequence、Detailed Call Chain、Context Assembly、Model Request Construction、Model Response Handling、Tool Call Handling、Permission Check、Tool Execution、State Mutation、Persistence、Streaming、Error Path、Retry Path、Cancellation Path、Resume Path、Stop Conditions、Mermaid Sequence Diagram、Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### module-analysis.md

- 目的：单个模块深度分析。
- 必填章节：Metadata、Module Identity、Public Interface、Internal Structure、Dependencies、Callers、Callees、Failure Modes、Performance、Security Hints、Version Notes、Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### model-system.md

- 必填章节：Metadata、Provider Inventory、Unified Interface、Schema Conversion、Streaming、Retry/Backoff/Fallback、Token Usage、Cost、Special Models (planning/summarizing/judging/routing/embedding)、Local Model、OpenAI-compatible、Multi-Model Strategy、Capability Negotiation、Provider Error Normalization、Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### context-system.md

- 必填章节：Metadata、System Prompt Sources、Skill/Tool/MCP Injection、Memory/File/Search Injection、Token Budget、Compression、Summary、Short-term vs Long-term、Cache、Retrieval、Vector Search、Static Duplication、Injection Defense、Trust Levels、Priority Order、Layering、Lazy Load、Partial Invalidation、Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### tool-system.md

- 必填章节：Metadata、Tool Interface、Schema、Registry、Discovery、Dispatch、Validation、Result Normalization、Error Format、Timeout、Cancel、Concurrency、Retry、Idempotency、Truncation、Large Results、Binary、Streaming、UI Result、Remote Tool、MCP Tool、Built-in Tool、User Tool、Plugin Tool、Skill Tool、Permission、Lifecycle、Log、Trace、Cost、Name Collision、Version、Dependency、Isolation、Cache、Approval、Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### session-state-memory.md

- 必填章节：Metadata + 三块分章 Session / Runtime State / Memory。Session：ID/Lifecycle/Recovery/Branch/Fork/Delete/Export/Isolation/Multi-device/User/Project/Workspace/Concurrency/Lock。Runtime State：当前任务/计划/步骤/工具调用/文件/目录/Workspace/权限/模型/Token/Subagent/Pending Action/Stream/Retry/Error/Checkpoint/Cancellation。Memory：Working/Episodic/Semantic/User/Project/Skill/Vector/Structured/Summary/Cross-session + Write Policy / Retrieval / Forgetting / Correction / Privacy / Scope / Namespace / Conflict / Version / TTL / Embedding / Ranking / Injection / Approval。Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### skill-plugin-mcp.md

- 必填章节：Metadata + 四块分章 Skill / Plugin / Hook / MCP。每块按通用字段（Identity/Manifest/Loading/Trigger/Isolation/Permission/Lifecycle/Update/Crash Handling 等）。Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### subagent-system.md

- 必填章节：Metadata、Subagent Identity (process/thread/object/task/prompt-role/workflow-node/bg-job/remote)、Independent Session/Context/ToolSet/Permission、Comms、Scheduling、Parallelism、Recursion、Depth/Budget Limits、Shared Memory/FS/Workspace、Aggregation、Handoff、Cancel、Resume、Deadlock Risk、Duplicate Risk、Permission Escalation Risk、Context Leak Risk、Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### permission-system.md

- 必填章节：Metadata、Default Policy、Interceptor Locations、Allowlist/Denylist、Workspace Boundary、Path Traversal Defense、Symlink Defense、Command Injection Defense、Secret Access、Env Var、Token Storage、SSH/Remote Execution、Container/Sandbox、Multi-user、Confirmation UI、Audit Log、Approval Record、Background Task、Subagent Inheritance、Remote Worker Trust、Browser/Clipboard/Screenshot/Local Network、Cloud Metadata、Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### security-review.md

- 必填章节：Metadata、Threat Model、Code Execution、File System、Network、Secret、Prompt/Tool/MCP Injection、Skill/Plugin/Memory Trust、Subagent/Background Task、Multi-user、Browser/Desktop/Mobile、Remote Worker/Daemon、Audit、Dependency/Supply Chain、Known CVE、Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### deployment-model.md

- 必填章节：Metadata、Supported Targets、Runtime Placement、Tool Placement、Filesystem Ownership、Workspace Ownership、UI↔Runtime Communication、Remote Task Support、Offline、Multi-device、Multi-user、Enterprise Isolation、Gateway/Control Plane/Data Plane、Queue/Scheduler/Daemon、Crash Recovery、Upgrade Recovery、Worker Registration/Auth/Discovery/Reporting、Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### observability-reliability.md

- 必填章节：Metadata、Logging、Trace、Metrics、Token Usage、Cost、Tool Timing、Model Latency、Queue Latency、Error Classification、Retry、Backoff、Timeout、Circuit Breaker、Checkpoint、Resume、Idempotency、Dead Letter Queue、Task Recovery、Process Recovery、Crash Recovery、Partial Result、User Cancellation、Audit、Debug Mode、Replay、Event History、State Snapshot、Health Check、Heartbeat、Rate Limit、Resource Limit、Concurrency Limit、Budget Limit、Token Limit、Cost Limit、Verified Facts、Inferences、Unknowns、RoboThree Implications、Evidence Index。

### license-review.md

- 必填章节：Metadata、Root License、Sub-directory License、Submodule License、Vendor Code License、Generated Code License、Dependency License Summary、Commercial、SaaS、Network Copyleft、Trademark、Patent、Attribution Requirements、RoboThree Reuse Tier Table、Unknowns、Last Updated。

### reusable-patterns.md

- 必填章节：Metadata、Pattern Catalog、Interface Patterns、Algorithm Patterns、Data Structure Patterns、Architecture Patterns、Verified Patterns、Inferred Patterns、Not Recommended Patterns、License Tier Table、RoboThree Mapping（ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE）、Evidence Index。

### risks-and-limitations.md

- 必填章节：Metadata、Risk Catalog、Category（security/permission/supply-chain/performance/scalability/maintainability/license/correctness）、Severity、Affected Module、Evidence、Mitigation、RoboThree Implications、Evidence Index。

### robothree-fit-analysis.md

- 必填章节：Metadata、Executive Summary、Evaluated Mechanisms、Mapping to RoboThree Modules、ADOPT、ADAPT、DEFER、REJECT、NEEDS_MORE_EVIDENCE、MVP Recommendations、Future Recommendations、Security Implications、License Implications、Platform Implications、Proposed ADRs、Open Questions、Evidence Index。

### open-questions.md

- 必填章节：Metadata、Summary、Questions Index（每条含 question / evidence / how-to-close / priority / owner）、Open Items、Closed Items。

### change-report.md

- 必填章节：Metadata（Repository / Old Commit / New Commit / Commit Range / Compared at）、Changed Modules、New Capabilities、Removed Capabilities、Runtime Changes、Context Changes、Tool Changes、Memory Changes、Skill/Plugin/MCP Changes、Permission Changes、Security Changes、Deployment Changes、License Changes、Invalidated Conclusions、Updated Conclusions、RoboThree Impact、ADRs Requiring Review、Open Questions。

### final-review.md

- 必填章节：Metadata、Phase Completion Matrix、Self-check Checklist（30 项）+ 每项的 Evidence / Status、Sign-off、Open Questions Link、Last Updated。

### index.md（项目级）

- 必填章节：Project Name、Repository、Current Commit、Branch/Tag、Last Updated、Study Depth、Completed Modules、Pending Modules、Key Findings、Risk Summary、License Summary、RoboThree Fit Summary、Open Questions、All Research File Links、Change Reports。

### analysis.json

- 严格匹配 `schemas/project-analysis.schema.json`。
- 每个维度包含 `status` / `evidence_path` / `confidence` / `summary`。
- `key_files`、`risks`、`reusable_patterns` 严格匹配字段。

---

## 跨文件引用约定

- 引用其他 Phase 产物：`../<dimension>.md` 或 `research/<project>/<dimension>.md#section`。
- 引用 Evidence 块：`<file>.md#evidence-<n>`。
- 引用 ADR：`../adr/<NNNN>-<slug>.md`。

---

## 一致性自检（每次提交前）

- [ ] 所有 Phase 模板都填完。
- [ ] 所有 Evidence 都有 Repository / Commit / File / Symbol。
- [ ] 所有 FACT / INFERENCE / RECOMMENDATION / UNKNOWN 都明确标记。
- [ ] `analysis.json` 通过 schema 校验。
- [ ] `scripts/verify-citations.py` 无 orphan。
- [ ] `index.md` 链接全部命中。
- [ ] RoboThree 映射五分类齐全。
- [ ] `open-questions.md` 列出所有 UNKNOWN。
- [ ] `final-review.md` 30 项自检完成。
- [ ] 重要 ADR 已建（`robothree/adr/<NNNN>-<slug>.md`）。
