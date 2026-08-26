# Robot / Tool Catalog 跨消费面对齐基线 v1

> 状态：**PASS/CLOSED**  
> 日期：2026-08-24  
> 适用计划：DFI-3A、AAPI-0  
> 目的：关闭两条计划对同一 Robot / Tool 事实各自定义 Projection 的跨线漂移风险

## 1. 冻结结论

Admin Console 与 Desktop 不共用同一个 DTO，也不互相导入 Contract：

- Admin API 投影企业治理、发布、配置和验证事实；
- Desktop Catalog 投影当前本机已物化、可供普通用户浏览和任务选择的安全事实；
- 两者共享稳定身份、发布版本、限制语义和风险语义的 canonical 基线；
- Desktop 的运行可用性不得反向冒充 Admin 的配置健康，Admin 的已发布状态也不得自动推导为 Desktop 可运行。

事实链固定为：

```text
Central Admin 治理事实
  -> immutable published revision
  -> Enterprise Configuration / Registry Generation
  -> Local Core materialization
  -> Desktop safe catalog projection
```

在当前版本真实 Admin 发布链尚未实现时，DFI-3A 只能读取已有 Local Core 可信事实；不得为了与 Admin 字段
对齐而补造 Central 发布事实。AAPI-0 只能冻结安全 Contract/Projection，不得用 Fixture 冒充上述事实链已经贯通。

## 2. Canonical 语义基线

### 2.1 共同字段语义

| 语义 | Robot | Tool | 规则 |
| --- | --- | --- | --- |
| 稳定身份 | `robotId` | `toolId` | 稳定、opaque；不得用显示名或列表位置派生 |
| 名称 | `displayName` | `displayName` | 面向用户的显示名称，不承载 Provider/Binding 标识 |
| 简介 | `description` | `description` | 安全摘要；不得包含 Prompt、脚本、Endpoint 或 Secret |
| 来源 | `source` | `source` | 只能由可信定义证明，不得按 id 猜测 |
| 对象版本 | `publishedRobotRevision` / `configurationRevision` | `toolDefinitionRevision` / `capabilityRevision` | 必须有显式、可验证映射；不得用 `registryRevision` 冒充对象版本 |
| 限制状态 | `unrestricted / restricted_nonempty / restricted_empty` | 适用时同语义 | `restricted_empty` 固定表示“不允许使用任何此类资源”，不得显示为“未设置” |
| 风险事实 | 机器人只投影其安全摘要 | `readOnly` + `riskSummary` | 由可信定义/Policy 事实派生，不得由 UI 猜测 |

### 2.2 Robot revision 映射

- Admin 的 `publishedRobotRevision` 对应发布后物化到 Local Core 的 exact Agent Definition revision；
- Desktop 的 `configurationRevision` 必须能通过发布记录、配置引用或受验证的 materialization evidence 映射到
  该 exact revision；
- `registryRevision` 只表示配置快照 epoch，不是 Robot 对象 revision；
- 当前仅有本地可信 Agent 时，Desktop 如实投影本地 exact revision，不得伪称已由 Admin 发布。

### 2.3 Tool revision 映射

- Admin `toolDefinitionRevision` 对应 Local Core `capabilityRevision`；
- 企业 Policy revision、Connection revision、Credential 状态、Adapter Descriptor revision 和
  `registryRevision` 分别表达，不得压成一个 `revision`；
- Desktop 只返回普通用户理解所需的 capability revision、registry epoch 和安全可用性摘要，不返回完整
  Binding、Adapter Descriptor、Connection 或 Credential Reference。

## 3. 消费面专属字段

### 3.1 Admin 专属

- draft / review / published / disabled 生命周期；
- 企业使用范围、发布人/审核人安全摘要；
- Tool Policy、Connection、Credential 配置状态和运行健康的分层摘要；
- 管理动作所需的 expectedRevision、ETag、commandId 与 Receipt。

这些字段不得因为 Desktop 当前可运行而自动变为“已发布/已验证”。

### 3.2 Desktop 专属

- `runnable` / `availability` 与面向新任务的安全不可用原因；
- 当前本机已物化的 Robot 限制摘要和 Tool 风险摘要；
- Task 选择所需的安全说明。

这些字段由 Local Core 当前 Registry、Agent head、权限和运行事实收窄；不得反向写回 Admin 治理状态。

## 4. Availability 对齐规则

Admin 与 Desktop 不使用同一个 availability 枚举：

- Admin 表达“配置是否完整、是否发布、验证/Connection/Credential/Health 是否有可信事实”；
- Desktop 表达“当前本机是否允许用于新任务”。

对齐只冻结以下不变量：

1. 缺失事实不得默认 healthy/available；
2. disabled、revoked、权限不足、Credential unavailable、Health unavailable 只能收窄，不能扩大；
3. `unknown` 必须保留为 unknown，不映射成成功；
4. 原始 Provider/Adapter 错误不得跨消费面传播，只能映射为安全 typed reason；
5. 已被任务锁定的历史 revision 与“可用于新任务”分开表达。

## 5. Contract 与 Conformance 边界

- DFI-3A 使用 Desktop Local `v1alpha2` additive family；
- AAPI-0 使用独立 `admin-control.v1alpha1`；
- 两者不得互相导入，也不得建立 Admin Runtime 对 Desktop Contract 的运行时依赖；
- 建立同一组 cross-consumer canonical fixtures，只校验共同语义字段，不强求整个 JSON 相同；
- fixture 至少覆盖 Robot/Tool identity、exact revision mapping、名称/简介、来源、限制三态、Tool readOnly/risk；
- conformance 必须证明 Admin-only 字段未泄漏到 Desktop，Desktop runtime-only 字段未冒充 Admin 治理事实。

## 6. 冻结与开发顺序

1. 本对齐基线通过差异复核；
2. DFI-3A.1 先基于现有 Local Core 事实冻结 Desktop Contract/Core Query；
3. AAPI-0.1 再基于本基线冻结 Admin Contract 和 cross-language conformance，不复制 Desktop DTO；
4. AAPI-0.3 接真实 Admin read model 时，补齐 Central published revision 到 Local materialization 的 evidence；
5. Desktop Renderer 与 Admin AFE 分别在独立前端批次消费，不能由后端批次越界修改。

任何一方需要改变稳定身份、revision 映射、限制三态或风险语义时，必须先修订本基线并完成双消费面差异复核。

## 7. 当前门禁

```text
Cross-consumer alignment      PASS/CLOSED
DFI-3A.1                      IMPLEMENTED / INDEPENDENT QA PENDING
AAPI-0.1                      GATED
Desktop Renderer consumption  GATED / SEPARATE FRONTEND BATCH
Admin AFE consumption         GATED / SEPARATE FRONTEND BATCH
```
