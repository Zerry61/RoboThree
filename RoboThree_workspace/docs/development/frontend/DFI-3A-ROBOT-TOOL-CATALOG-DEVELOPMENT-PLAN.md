# DFI-3A Robot / Tool Catalog 详细实施方案

> 状态：**REVISION 1 / PLAN REVIEW PASS/CLOSED；DFI-3A.1 PASS/CLOSED；DFI-3A.2 DOCUMENT REVIEW PENDING / CODING GATED**  
> 日期：2026-08-24  
> 负责人：Codex 5.6  
> 上游：DFI-0、DFI-1A、DFI-1B、DFI-2A `PASS/CLOSED`；Desktop Frontend Experience Foundation `PASS/CLOSED`  
> 本批不依赖真实企业 SSO；生产 Enterprise Session 继续默认关闭

## Revision 1 评审修订

- 新增并依赖 [Robot / Tool Catalog 跨消费面对齐基线 v1](../CATALOG-PROJECTION-CROSS-CONSUMER-ALIGNMENT-v1.md)；
- 明确 Desktop 与 Admin 不共用 DTO，只共享稳定身份、exact revision 映射、限制三态和 Tool 风险语义；
- 明确 Desktop 读取 Local Core materialization，Admin 表达 Central 治理事实，二者 availability 不得互相冒充；
- DFI-3A.1 必须先产出 cross-consumer canonical fixture，供 AAPI-0.1 校验共同语义，但不得产生跨 Contract 运行时依赖。

## 0. 目标与结论边界

DFI-3A 只把当前 Desktop 智能中心中的“机器人”和“工具”从不完整 Projection / Mock 目录收敛为真实、只读、
有界且 Renderer-safe 的 Catalog。它不建设机器人或 Tool 的创建、编辑、发布、安装、启停或企业治理写链路。

本批完成后允许声明：

```text
DFI3A_ROBOT_TOOL_CATALOG_CONFORMANT
```

不得声明：

```text
Skill Runtime ready
Knowledge Provider ready
Admin governance ready
production identity ready
Robot/Tool create or publish ready
```

## 1. 当前代码事实

1. Desktop Local `v1alpha1` 已有 `listAgents()` 和 `listModels()`，但 `AgentProjection` 主要服务任务选择，
   不是完整的浏览目录/详情 Contract；
2. Renderer `intelligence-adapter.ts` 当前机器人来自真实 `listAgents()`，技能和工具仍来自本地 Mock；
3. Core 已有 `TrustedAgentRepository`，支持 active Agent list 与 exact revision load；
4. Core `RegistrySnapshot` 已包含类型化的 model/tool definitions、bindings、adapter descriptors 与
   `registryRevision`；当前五个 Document Tool 已以 `kind=tool` 的可信定义登记；
5. `CapabilityResolver` 已有 disabled、revoked、credential unavailable、health unavailable 等失败关闭语义，
   但 DFI-3A 不能在缺少真实 availability fact 时伪造健康状态；
6. Desktop 目前没有 `listRobots/getRobot/listTools/getTool` 的专用公开方法；
7. DFI-3B Skill Catalog 仍依赖真实 Skill Runtime Foundation，不能随 DFI-3A 创建空壳接口；
8. Knowledge Center 仍由 `GatedKnowledgeAdapter`/Fixture 管理，不属于本批。

## 2. 产品范围

### 2.1 机器人列表与详情

只展示普通用户理解所需的安全摘要：

- 名称、简介、所有者/来源显示摘要；
- 当前 active revision；
- 默认模型显示摘要；
- 模型/技能/工具/知识限制是“未设置限制”还是“已设置限制”；
- 已设置时只展示资源名称、稳定 id、锁定 revision 和可用性摘要；
- 当前是否可运行，以及不可运行的安全原因。

不得把 `identity`、完整 system prompt、内部 binding、configuration ref 或 digest 当作主页面字段。技术 id 与
revision 只允许出现在受控“技术信息”区域。

### 2.2 工具列表与详情

只展示：

- Tool 名称、简介、稳定 capability id、revision、来源；
- `readOnlyHint` 与业务化风险摘要；
- 当前是否可用于新任务，以及安全的不可用原因；
- 输入/输出能力的非敏感说明，不直接回传完整执行 Binding 或 Adapter Descriptor；
- 代码 Tool / HTTP / MCP 的来源类型只有在当前可信定义能够证明时才展示；不能根据 id 猜测。

不得展示 Endpoint、Credential、Secret、workspace path、adapter handle、binding id、内部进程信息或原始
Provider 错误。

## 3. Contract 冻结

本节必须同时遵循跨消费面对齐基线。`RobotCatalogSummary/ToolCatalogSummary` 是 Desktop 消费面，
不是 Admin 管理 Projection；共同字段的命名与语义按对齐基线冻结，Admin-only lifecycle/policy/connection
字段不得加入 Desktop Contract。

在 `packages/contracts/src/desktop-local/v1alpha2/` additive 新增 catalog family，不改写 `v1alpha1`：

```text
ListRobotCatalogQuery / RobotCatalogPage
GetRobotCatalogQuery / RobotCatalogDetail
ListToolCatalogQuery / ToolCatalogPage
GetToolCatalogQuery / ToolCatalogDetail
```

共同规则：

- 显式 `transportContractVersion = v1alpha2`；
- list `limit` 为 1～100，默认值由 Contract 固定；
- cursor 为 opaque、带 query revision 与最后排序键，不向 Renderer 暴露 registry 内部结构；
- list 固定按规范化名称、稳定 id 排序；同输入、同 registry/head 事实必须得到相同顺序；
- response 项目数、单字段长度和总 JSON bytes 有界；
- detail 使用稳定 id，未找到返回 typed `not_found`，不得把未匹配 id 回显为业务对象；
- stale cursor 返回 typed `stale_cursor`，不得静默从第一页重放；
- strict schema 拒绝未知字段。

## 4. Projection 设计

### 4.1 RobotCatalogSummary

```text
robotId
configurationRevision
displayName
description
sourceLabel
ownerLabel?
restrictionSummary
runnable
unavailableReason?
```

`restrictionSummary` 按 model/skill/tool/knowledge 四类分别表达：

```text
unrestricted
restricted_nonempty
restricted_empty
```

其中 `restricted_empty` 必须显示为“不允许使用任何此类资源”，不能显示成“未设置”。

### 4.2 RobotCatalogDetail

在 Summary 基础上增加四类已锁定资源的安全摘要、默认模型摘要、`allowModelOverride` 与技术信息区。不得复制
完整 Prompt 或把任务选择用 `eligibleModels` 直接当目录事实。

### 4.3 ToolCatalogSummary / Detail

```text
toolId
capabilityRevision
registryRevision
displayName
description
source
readOnly
riskSummary
availability
unavailableReason?
```

detail 可增加受控的输入/输出字段摘要，但不得返回完整 Binding、Adapter Descriptor、Credential 状态对象或
configuration ref。

## 5. Core Application 边界

新增只读 Application service：

```text
RobotCatalogQueryService
ToolCatalogQueryService
```

规则：

1. Robot 从 `TrustedAgentRepository` 的 active head 和 exact revision 读取；
2. Tool 从当前已验证 `RegistrySnapshot.agentVisibleCapabilities.tools` 读取；
3. Tool definition revision 与 registry revision 必须重算/校验；损坏时整体失败关闭，不跳过坏记录继续返回半真列表；
4. availability 只能消费已有可信事实；事实缺失时使用 `unknown/unavailable`，不得默认 healthy；
5. 权限、disabled、revoked、credential、health 只能收窄可用性，不能扩大；
6. Query service 只读，不修改 Registry、Agent head、Task、偏好、安装状态或使用范围；
7. 不把 Agent、Skill、Knowledge 塞进 Capability Registry。

## 6. Desktop 接线

编码获授权后才允许 additive 修改：

- Core private HTTP route；
- `core-private-client.ts`；
- `desktop-ipc-router.ts` 白名单；
- `create-desktop-api.ts` 与安全类型声明。

本批不修改 Renderer。DFI-3A 独立 QA 与用户接受后，再由单独 Desktop Frontend 消费批次修改
`IntelligenceAdapter` 和页面；该前端批次必须只通过 Adapter 调用，不得直接访问 Desktop global，并分别处理
Loading、Empty、Ready、Unavailable、Error、Permission denied、Partial 与 Stale。Skill Mock/Fixture 边界
在 DFI-3A 中保持不变。

## 7. 测试身份与权限边界

本批不接企业 SSO。测试时可使用明确的 test-only principal/capability fixture，但必须满足：

- 只存在于 test/dev harness，不进入 production dependency graph；
- Evidence 明确 `testIdentityUsed=true`；
- 同时明确 `productionIdentityReady=false`；
- 不使用 fixed userId、OS 用户或 Renderer 参数冒充生产 owner；
- 无可信权限 Projection 时，生产目录只允许当前本地可信 Catalog 的既有可见范围，不新增管理权限语义。

## 8. 文件范围

编码授权后允许：

- `packages/contracts/src/desktop-local/v1alpha2/**`；
- `services/core/src/application/**`、必要只读 Port/Adapter；
- `services/core/src/adapters/http/**`；
- `apps/desktop/src/main/**`、`apps/desktop/src/preload/**`；
- 对应 tests、Harness 与 Evidence。

禁止：

- Central/Admin API、数据库 migration；
- Enterprise Session/EIPC/STRM；
- Skill Runtime、Knowledge Provider；
- Tool 管理写接口、TGM、HTTP/MCP 连接；
- 机器人/技能创建发布；
- `apps/desktop/src/renderer/**`；
- 个人模型 CRUD/reveal；
- root 依赖或 lockfile，除非另行评审授权。

## 9. 测试矩阵

至少覆盖：

1. strict Contract valid/invalid 与未知字段拒绝；
2. robot/tool list/detail、not found、empty；
3. limit 边界、opaque cursor、stale cursor、稳定排序；
4. registry/definition revision tamper 失败关闭；
5. restricted empty 与 unrestricted 不混淆；
6. disabled/revoked/credential/health 只收窄；
7. availability unknown 不伪装 healthy；
8. Renderer-safe static scan：无 Endpoint/Credential/Binding/Adapter/private path；
9. Main/Preload 白名单与参数 exact parse；
10. Core restart、Main/Preload late response 与 client identity mismatch；
11. Renderer 生产源码零修改；
12. 既有 Skill/Knowledge Mock/GATED 行为零漂移；
13. Desktop build/tests/lint/audit/check；
14. Central online/offline 回归，证明本批未改变企业服务行为。
15. cross-consumer canonical fixture：Robot/Tool identity、exact revision、名称/简介、来源、限制三态、
    Tool readOnly/risk 与对齐基线一致；Admin-only 字段不得泄漏到 Desktop。

## 10. 交付与 QA

建议拆为：

| 子批 | 内容 | 估算 |
| --- | --- | --- |
| DFI-3A.1 | Contract、Projection、Core Query 与 conformance | 3～5 日 |
| DFI-3A.2 | Main/Preload 接线、runtime lease、restart/cursor/security E2E 与阶段收口 | 7～12 日 |

总计 10～17 个集中工程日，不含独立 QA 与返工。DFI-3A.2 原估算未覆盖 runtime lease、真实 restart barrier、
多编码泄漏扫描与进程级 E2E，现以
[DFI-3A.2 详细方案](./DFI-3A.2-MAIN-PRELOAD-CATALOG-WIRING-DEVELOPMENT-PLAN.md) 为准。每个子批必须单独评审、授权、QA 和用户接受；本方案评审通过
不自动授权任何编码。Renderer 真实消费另立 Desktop Frontend 批次。

## 11. 当前门禁

```text
DFI-3A Plan                    REVISION 1 / PLAN REVIEW PASS/CLOSED
Cross-consumer alignment      PASS/CLOSED
DFI-3A.1                      PASS/CLOSED
DFI-3A.2                      DOCUMENT REVIEW PENDING / CODING GATED
Desktop Renderer consumption   GATED / SEPARATE FRONTEND BATCH
DFI-3B Skill Catalog           GATED / BLOCKED BY SKILL RUNTIME
Knowledge Provider             GATED
Robot/Tool write governance    GATED
EIPC-1.2～EIPC-3               DEFERRED / OUT OF CURRENT RELEASE
```
