# 产品原则 source map

> 本文件**不复制并重新编号**正式不变量；只维护"本地检查 ID → 正式来源"的映射。
> 任何条目变更须先在 KEY-NODES / ADR / 基线 v1.0 落定，再在本表追加对应行。
> 本地 ID 仅用于本 Skill 内部追踪，不替代正式编号。

## 1. 使用方式

每条产品侧结论需要引用不变量时：

```text
[INV-LOCAL-XXX] <一句话>
证据：source map 行 #N
正式来源：<file:line> <标题>
最后核对：YYYY-MM-DD
```

任何引用必须能回链到 source map 行 + 正式来源中的具体段落；缺一不可。

## 2. KN-001 §8 正式不变量 source map

> KN-001 §8 实际编号为 1～16（共 16 条）。
> 本表用 INV-LOCAL-NN 作为本地稳定引用；不重新编号正式不变量。

| 本地 ID | 正式编号 | 一句话 | 正式来源 | 状态 | 最后核对 |
| --- | --- | --- | --- | --- | --- |
| INV-LOCAL-01 | KN-001 §8.1 | 能力平台化设计 + 最小垂直任务链路优先 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 379 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-02 | KN-001 §8.2 | 业务场景和具体软件能力不进入 Core | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 380 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-03 | KN-001 §8.3 | 标准场景使用声明式组合 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 381 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-04 | KN-001 §8.4 | 开放任务由 Core 动态生成和修订 ExecutionPlan | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 382 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-05 | KN-001 §8.5 | 动态编排只允许已注册、已发布、版本兼容且校验通过的能力 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 383 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-06 | KN-001 §8.6 | Core 不热加载未审核的可执行代码 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 384 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-07 | KN-001 §8.7 | 所有核心 Contract 版本化 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 385 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-08 | KN-001 §8.8 | Task 锁定能力、配置、模型和 ExecutionPlan 版本 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 386 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-09 | KN-001 §8.9 | MCP Tools 适配 Tool Contract；Resources / Prompts / Notifications 适配对应 Contract | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 387 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-10 | KN-001 §8.10 | Tool Pack / 接入协议 / 执行位置是正交维度 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 388 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-11 | KN-001 §8.11 | 声明式扩展与可执行扩展采用不同的信任模型 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 389 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-12 | KN-001 §8.12 | 第一版不建公开 Marketplace | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 390 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-13 | KN-001 §8.13 | ExecutionPlan 可动态修订，但每个 Plan Revision 不可变 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 391 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-14 | KN-001 §8.14 | 所有具有副作用的执行必经 Intent + Policy + Tool Runtime + Worker + Event | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 392 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-15 | KN-001 §8.15 | Task Runtime 是 TaskState 唯一写入者 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 393 | CONFIRMED | 2026-07-20 |
| INV-LOCAL-16 | KN-001 §8.16 | Approval 绑定具体 Plan Revision + Step + Action + 参数摘要 + 资源范围 | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 394 | CONFIRMED | 2026-07-20 |

> 注：早期版本曾标注为"17 条"，实际 KN-001 §8 只有 16 条。INV-LOCAL-17 已在历史示例中标注为"合成规则"，本表不强制列出。

## 3. KN-001 §6 副作用一致性 source map

> 这部分规则在 KN-001 §6 已落地但不在 §8 中。仍属于正式已确认原则。

| 本地 ID | 正式编号 | 一句话 | 正式来源 | 状态 | 最后核对 |
| --- | --- | --- | --- | --- | --- |
| INV-LOCAL-17 | KN-001 §6（副作用一致性原则） | Intent 持久化 → Worker 执行 → Observation 持久化 → Checkpoint → Event 发布；不满足幂等的副作用进入 Reconciliation | `${CODE_ROOT}/docs/architecture/KEY-NODES.md` 行 316-343 | CONFIRMED | 2026-07-20 |

## 4. 基线 v1.0 / ADR 产品侧约束 source map

> 这些条目来自基线 v1.0 / ADR-001～ADR-004（均为 ACCEPTED），不在 KN-001 §8 内但仍是产品侧必须遵守的约束。

| 本地 ID | 来源 | 一句话 | 正式来源 | 状态 | 最后核对 |
| --- | --- | --- | --- | --- | --- |
| PROD-LOCAL-01 | 基线 v1.0 §1.3 + §5.1 | Windows Desktop 是第一版主要用户工作入口和本地执行宿主 | `${CODE_ROOT}/docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md` 行 56-61, 264-285 | CONFIRMED | 2026-07-20 |
| PROD-LOCAL-02 | 基线 v1.0 §5.2 | Admin Console 属于企业控制面，不直接执行用户任务 | `${CODE_ROOT}/docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md` 行 287-302 | CONFIRMED | 2026-07-20 |
| PROD-LOCAL-03 | 基线 v1.0 §4.4 | Access Role（RBAC）与 Agent Role（Agent 身份）严格分离 | `${CODE_ROOT}/docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md` 行 242-248 | CONFIRMED | 2026-07-20 |
| PROD-LOCAL-04 | 基线 v1.0 §14.3 | 数据分级显式标注 PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED | `${CODE_ROOT}/docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md` 行 940-948 | CONFIRMED | 2026-07-20 |
| PROD-LOCAL-05 | 基线 v1.0 §8.3 | Task 状态机固定 9 个状态 | `${CODE_ROOT}/docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md` 行 480-491 | CONFIRMED | 2026-07-20 |
| PROD-LOCAL-06 | 基线 v1.0 §8.4 | Workspace File 与 Artifact 边界明确；localhost 预览属于 Preview Session | `${CODE_ROOT}/docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md` 行 503-512 | CONFIRMED | 2026-07-20 |
| PROD-LOCAL-07 | 基线 v1.0 §8.5 | 来源追溯（来源文件 / 页码 / Tool 调用 / 可信状态 / 人工确认） | `${CODE_ROOT}/docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md` 行 515-525 | CONFIRMED | 2026-07-20 |
| PROD-LOCAL-08 | ADR-002 | FileGrant / WorkspaceGrant 显式授权；高风险操作需额外权限或确认 | `${CODE_ROOT}/docs/adr/002-local-file-authorization.md` 行 1-58 | ACCEPTED | 2026-07-20 |
| PROD-LOCAL-09 | ADR-004 | Renderer 不直接访问文件系统 / SQLite / 凭证 / 系统命令 / Worker 原生接口 | `${CODE_ROOT}/docs/adr/004-kernel-alpha-technology-stack.md` 行 28-37 | ACCEPTED | 2026-07-20 |
| PROD-LOCAL-10 | 基线 v1.0 §10.4 | Skill 生命周期 Draft / Reviewing / Published / Disabled + Rejected；可见范围 OwnerOnly / Department / Enterprise | `${CODE_ROOT}/docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md` 行 666-693 | CONFIRMED | 2026-07-20 |

## 5. PROPOSED 状态条目（不构成产品侧硬约束）

> 这些条目来自 PROPOSED ADR（005 / 006 / 007）。引用前必须先检查状态是否仍为 PROPOSED；如升级为 ACCEPTED 则需在第 2-4 节中追加正式条目。

| 本地 ID | 来源 | 一句话 | 正式来源 | 状态 | 最后核对 |
| --- | --- | --- | --- | --- | --- |
| PROP-LOCAL-01 | ADR-005 | AgentDefinition 仅保存版本化配置；运行时状态进入 TaskRunState | `${CODE_ROOT}/docs/adr/005-agent-state-task-run-step.md` | PROPOSED | 2026-07-20 |
| PROP-LOCAL-02 | ADR-006 | Authorization / ActionRisk / DataClassification / PolicyDecision / Approval 分层 | `${CODE_ROOT}/docs/adr/006-permission-policy-data-approval.md` | PROPOSED | 2026-07-20 |
| PROP-LOCAL-03 | ADR-007 | Intent / Observation / Checkpoint / Outbox / Idempotency Key 一致性 | `${CODE_ROOT}/docs/adr/007-event-checkpoint-side-effect-consistency.md` | PROPOSED | 2026-07-20 |

> 引用 PROP-LOCAL 条目时必须在产物中明确标注 `PROPOSED`，并指出"待 ADR 升级为 ACCEPTED 后方可作为硬约束"。

## 6. 当前已实现 vs 已确认 vs 提案 vs 待决

引用任何条目时除 source map 行外，必须按以下状态分类给出本需求的影响结论：

| 状态 | 含义 | 引用规则 |
| --- | --- | --- |
| 当前实现影响 | 代码已存在 | 可引用代码 `file:line` 作为最强证据 |
| 已确认设计影响 | ACCEPTED ADR / 基线 CONFIRMED 段 | 可引用 ADR / 基线作为正式来源 |
| 未来阶段候选 | PROPOSED ADR / 未冻结阶段 | 必须同时标 `PROPOSED` + 说明待决 |
| 待架构冻结 | 基线 / ADR / KEY-NODES 均未涉及 | 不得作为已确认约束；只作 `OPEN` |

## 7. 不变量引用约定

每条产品侧产物引用本表条目时使用以下格式：

```text
[INV-LOCAL-NN] 一句话描述
证据：source map 第 § 节第 N 行
正式来源：${CODE_ROOT}/docs/architecture/KEY-NODES.md 行 X
状态：当前实现 / 已确认设计 / 未来阶段候选 / 待架构冻结
最后核对：YYYY-MM-DD
```

引用 PROP-LOCAL 必须额外注明 "PROPOSED，待 ADR 升级"。

## 8. 更新流程

1. KEY-NODES 新增节点或 ADR 状态变更时，先在 `${CODE_ROOT}` 侧落定。
2. 本表追加对应行；本地 ID 顺序追加；不替换既有行。
3. 最后核对日期必须更新。
4. 任何替换既有行的操作必须留下 `SUPERSEDED-BY` 注释，不静默覆盖。

## 9. 与既有决策的角色分工

| 决策类型 | 入口 | 本 Skill 的角色 |
| --- | --- | --- |
| 调整 §2-4 的条目 | KEY-NODES / 基线 v1.0 / ADR | 不修改；只检查并报告 |
| 调整 §5 的 PROPOSED 条目 | PROPOSED ADR 升级为 ACCEPTED | 不修改；待 ADR 状态变更后追加正式条目 |
| 新增业务场景 | 基线 §9～§11 | 不修改；识别是否违反 INV-LOCAL-02 |
| 调整 Skill 生命周期 | 基线 §10.4 + ADR | 不修改；识别需求是否引入未支持的可见范围 |
| 调整 Task 状态机 | 基线 §8.3 + ADR-005 | 不修改；标注需求是否引入未支持的状态值 |

## 10. 局限与待确认

- 本表只覆盖当前仓库已存在的文件；后续 KEY-NODES 新增节点后必须在本表追加。
- 当前 INV-LOCAL 编号与 KN-001 §8 编号一对一映射到 §8.1～§8.16。
- PROP-LOCAL-01～03 仍在 PROPOSED；引用时需明确"待 ADR 接受"。
- 本地 ID 不替代正式编号；正式沟通中仍需使用 KN-001 §8.x 或 ADR-NNN。

## 11. 当前 MVP 场景清单

> 此清单在基线 v1.0 + 当前 Release Scope 基础上维护；不在此清单内的需求按"新场景"处理，需先在 §11.1 增补条目再进入 PRD 撰写。

| 场景 ID | 名称 | 描述 | 来源 | 当前阶段 |
| --- | --- | --- | --- | --- |
| SCN-MVP-01 | 招投标材料分析 | 解析本地 PDF/DOCX/XLSX、提取关键字段、执行企业规则、生成 Excel/PPT、用户审核 | 基线 v1.0 §9 | KA-2 之后 |
| SCN-MVP-02 | Skill 生成与治理 | 自然语言生成 Skill 草稿、Tool/知识绑定、审核、发布 | 基线 v1.0 §10 | KA-2 之后 |
| SCN-MVP-03 | HTML 本机预览 | 自然语言生成/修改 HTML + CSS + JavaScript、localhost 预览、增量修改 | 基线 v1.0 §11 + ADR-003 | KA-2 |
| SCN-MVP-04 | （占位） | 新场景进入时追加 | TBD | TBD |

### 11.1 新场景添加流程

1. 在产品负责人 + 架构师评审通过后追加 SCN-MVP-NN 行；
2. 标注当前阶段（KA-X / KAF-X）；
3. 标注与现有 17 条 INV-LOCAL 的关系；
4. 不替换既有行，使用 `SUPERSEDED-BY` 注释历史场景；
5. 引用时使用 `SCN-MVP-NN` 作为产品侧稳定引用。

### 11.2 场景不进入 Core 的判定

任何 SCN-MVP-NN 的实现必须满足：

- 通过 Agent Definition + Skill + Tool/MCP + Knowledge + Task Template 声明式组合实现；
- 不在 Core 中增加 `if scenario == "..."` 类分支；
- HTML 等通用执行能力以 Tool Pack / Worker 提供，不写入 Core 模块代码；
- 业务规则通过 Skill / Task Template 配置，不通过 Core 硬编码。

违反以上任一项的方案按 INV-LOCAL-02 标记为 `INVARIANT-VIOLATION` 或 `BASELINE-CHANGE-PROPOSAL`，不进入下一阶段。