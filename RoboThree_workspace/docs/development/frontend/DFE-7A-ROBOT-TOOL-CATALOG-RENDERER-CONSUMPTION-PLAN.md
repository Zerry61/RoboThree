# DFE-7A Robot / Tool Catalog Renderer Consumption Plan

> 状态：**0.0.0-dfe.7a PASS/CLOSED**  
> 日期：2026-08-26  
> 负责人：Codex 5.6  
> 上游：DFE Frontend Experience Foundation PASS/CLOSED；DFI-3A.2 Main / Preload Catalog Wiring PASS/CLOSED  
> 范围：Desktop Renderer 只消费既有 v1alpha2 Robot / Tool Catalog Projection，将智能中心 Robot/Tool 从旧投影与 Mock 目录收敛到真实只读 Catalog  
> 非目标：不新增或修改 Main、Preload、IPC、Core、Contracts、Central、Admin、SQLite migration、TGM 或后端 Catalog 实现；不实现 Tool 管理、启停、配置、测试、删除或 Agent/Skill 真实创建

## 1. 目标

DFE-7A 是 DFE Foundation 关闭后的第一批真实数据收敛。目标是把 `#/intelligence` 中的 Robot 和
Tool 目录从旧 `listAgents/listModels` 与 `mockTools` 替换为已验收的 v1alpha2 Robot/Tool Catalog
Projection。

用户结果：

```text
打开智能中心
→ 前端协商 v1alpha2 robot_tool_catalog feature
→ 机器人 tab 加载真实 Robot Catalog Summary
→ 工具 tab 加载真实 Tool Catalog Summary
→ 打开机器人/工具详情时调用对应 getRobotCatalog/getToolCatalog
→ 技能 tab 明确显示 Skill Catalog 待接入，不展示生产 Mock Skill 条目
```

本批只做只读浏览、筛选已加载内容、详情查看、分页加载更多和安全状态展示。不得实现创建、编辑、安装、运行测试、
提交发布、启停、授权、配置、删除或任何真实业务成功。

## 2. 允许修改范围

编码阶段允许修改：

```text
apps/desktop/src/renderer/**
apps/desktop/tests/**
```

前端代码和测试冻结后，允许进入一次独占共享文件收口窗口更新：

```text
apps/desktop/package.json
scripts/audit-dtp4-packaging.mjs
scripts/audit-dtp4-packaging.test.mjs
CHANGELOG.md
docs/development/DEVELOPMENT-LOG.md
docs/development/frontend/**
```

共享文件收口只用于版本、audit 基线、实施报告和治理记录，不扩张业务范围。

禁止修改：

```text
apps/desktop/src/main/**
apps/desktop/src/preload/**
apps/desktop/src/shared/**
packages/**
services/**
apps/admin-console/**
services/central-service/**
SQLite migration
pnpm-lock.yaml
root package.json
root tsconfig.json
TGM
DFI-2B / DFI-3 / DFI-4A / DFI-5
```

## 3. Existing Interface Facts

DFE-7A 只消费既有 `window.robothreeDesktopV1Alpha2`。四个 Catalog API 已存在：

```ts
listRobotCatalog(query)
getRobotCatalog(query)
listToolCatalog(query)
getToolCatalog(query)
```

Compatibility feature 名称固定为：

```text
robot_tool_catalog
```

编码时不得新增 Contract、IPC、Preload API、Main route 或 Core route。

## 4. Adapter Revision

现有 `loadIntelligenceCatalog()` 一次性加载模型不再适用。DFE-7A 必须改为显式分页和详情接口：

```ts
type IntelligenceCatalogAdapter = {
  negotiateCatalog(): Promise<CatalogNegotiation>;
  listRobots(input: { cursor?: string; limit?: number }): Promise<RobotCatalogListResult>;
  getRobot(input: { robotId: string }): Promise<RobotCatalogDetailResult>;
  listTools(input: { cursor?: string; limit?: number }): Promise<ToolCatalogListResult>;
  getTool(input: { toolId: string }): Promise<ToolCatalogDetailResult>;
};
```

### 4.1 Client Identity

- `clientInstanceId` 必须是稳定的原始 UUID；
- 不得使用 `renderer:dfe4a:${uuid}`、`catalog:${uuid}` 或其他带前缀的非 UUID 字符串；
- 同一 Renderer app lifetime 内复用同一个 catalog client UUID；
- `queryId` 与 `correlationId` 每次请求新生成 UUID；
- Renderer 不制造、解析或持久化 cursor 内容。

### 4.2 Compatibility

`negotiateCatalog()` 必须检查：

- `window.robothreeDesktopV1Alpha2` 存在；
- `selectedContractVersion === "v1alpha2"`；
- `features` 包含 `robot_tool_catalog`；
- `runtimeInstanceId` 存在，并仅作为 Renderer 页面 epoch 事实保存；
- API 返回错误时保留 error `code`、`category`、`retryable`、`safeSummary`。

Feature 缺失时页面展示真实 Unavailable，不 fallback 到 Robot/Tool Mock。

Robot/Tool list/detail 响应本身不携带 `runtimeInstanceId`。Catalog 请求与响应的 runtime lease 权威校验由既有
Main 接线完成；Renderer 不得根据响应内容自行推断 runtime，只消费 `catalog.runtime_changed`。

### 4.3 Runtime Changed

收到 `catalog.runtime_changed` 时：

- 不自动重放失败请求；
- 清空 Robot list、Tool list、Robot detail、Tool detail、cursor、queryRevision、pagination state 和 in-flight epoch；
- 显示 persistent notice，说明本地 Core 已重启，需要用户刷新目录；
- 用户点击“刷新”时重新 `getCompatibility`，生成新的 `queryId/correlationId`，然后重新加载第一页。

## 5. Robot Contract Boundary

Robot list 只能使用 `RobotCatalogSummary` 可证明字段：

```text
robotId
configurationRevision
displayName
description
source
restrictionSummary
runnable
unavailableReason
```

列表卡片不得展示或推导：

- “我创建的”；
- owner / createdByMe；
- 默认模型；
- eligible model 数量；
- skills/tools/knowledge 数量；
- 机器人状态、运行中、已安装、发布状态；
- 每个机器人 N+1 detail 预取。

机器人列表 UI 冻结为：

- 名称；
- safe description；
- source 文案；
- runnable / unavailable safe 状态；
- restrictionSummary 四类资源限制摘要；
- 打开详情按钮。

机器人详情打开后才允许展示 `RobotCatalogDetail` 字段：

```text
defaultModel
allowModelOverride
eligibleModels
skills
tools
knowledge
```

详情页不得展示完整 revision/digest；如需诊断，必须后置到 developer-only detail 批次。

“我创建的机器人”筛选在本批直接删除，不保留 disabled filter 或不可用子 Tab。页面不得展示：

```text
我创建的机器人
```

个人机器人筛选、owner/createdByMe 与个人机器人管理能力均留到 Catalog owner 字段和对应产品语义冻结后另立批次。

## 6. Tool Contract Boundary

Tool list 只能使用 `ToolCatalogSummary` 可证明字段：

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
unavailableReason
```

必须删除现有旧语义：

- `modelCallable`；
- “模型可调用/不可调用”；
- “模型可调用工具”统计；
- `lifecycleLabel`；
- “已接入”生命周期推断；
- `artifact.preview` 作为 Tool 卡片混入真实 Tool Catalog。

可替换为：

- “已加载工具”；
- “可用工具”（仅 `availability === "available"`）；
- `readOnly` 文案；
- `riskSummary` 文案；
- source 文案；
- availability 文案。

`artifact.preview` 继续是 Desktop application capability，不是模型 Tool。本批不得在 Tool tab 中手写加入
`artifact.preview` 来补齐旧 UI。

Tool detail 只展示 `ToolCatalogDetail` 可证明字段：

```text
inputShape
outputShape
```

不得展示 Tool Registry 内部 binding、adapter descriptor、workspace authority、requestDigest 或 Credential。

## 7. Skill Tab Boundary

本批不接真实 Skill Catalog，因为当前没有 `listSkillCatalog` / `getSkillCatalog` Renderer API。

生产页面的 Skill tab 收敛为单一 GATED 状态：

```text
技能目录待接入。当前版本尚未提供真实 Skill Catalog。
```

不得在生产页面展示现有 `mockSkills` 的具体条目，例如：

- “已安装”；
- “技能广场”；
- “我的技能”；
- “本地目录”；
- “运行测试/提交发布”作为真实技能详情操作。

测试可以保留 `fixtureSkills`，但只能由测试 Adapter 注入，名称必须表明 fixture，不得作为失败 fallback。

## 8. Pagination, Search And Statistics

### 8.1 Pagination

- 列表第一页请求只发送 `limit`；
- 下一页只能传上一响应原始 `nextCursor`；
- 不得解析 cursor，不得自己生成 cursor；
- `limit` 建议使用 50，必须在 Contract 1～100 范围内；
- 后续页 `queryRevision` 必须等于第一页 `queryRevision`；
- 如果 `queryRevision` 变化，失败关闭，清除旧 cursor，并提示用户刷新；
- `cursor_invalid`、`stale_cursor`、`catalog.runtime_changed` 等 cursor/runtime 类错误不得静默 fallback 到第一页；
- 用户明确点击刷新后才重新协商并加载第一页。

### 8.2 Search

搜索框文案必须是：

```text
筛选已加载内容
```

或等价用户文案。不得暗示服务端全目录搜索。

搜索只过滤当前已加载 page set 中的安全展示字段：

- displayName；
- description；
- source label；
- toolId（Tool only，作为公开 capability id）；
- resource displayName（detail only）。

### 8.3 Statistics

Contract 没有 `totalCount`。因此：

- 有 `nextCursor` 时显示“已加载机器人/已加载工具”；
- `nextCursor` 消失后才可显示“全部已加载”；
- 不得把当前数组长度写成整个 Catalog 总数；
- 删除“模型可调用工具”统计；
- 可新增“可用工具”统计，但只基于已加载 items。

## 9. State Model

页面必须拆分独立状态，不再使用一个全局 `loading/error/catalog` 阻断所有 tab。

冻结状态：

```ts
robotListState
toolListState
robotDetailState
toolDetailState
skillGateState
robotPaginationState
toolPaginationState
compatibilityState
```

规则：

- Robot list 失败不得阻断 Tool list 或 Skill gated message；
- Tool list 失败不得阻断 Robot list 或 Skill gated message；
- Detail 失败不得清空 list；
- 直接打开 `/intelligence/robots/:robotId` 必须调用 `getRobotCatalog`；
- 直接打开 `/intelligence/tools/:toolId` 必须调用 `getToolCatalog`；
- 详情 URL 不要求目标出现在已加载第一页；
- route/tab/runtime 切换必须增加 request epoch，迟到响应不得覆盖当前状态；
- Feature missing 时显示真实 Unavailable，不恢复旧 Mock 目录。

## 10. Exhaustive Display Mapping

编码必须在 pure presentation/model 层冻结 exhaustive mapping，并用测试覆盖所有值。

### 10.1 Robot Source

| Value | 文案 |
| --- | --- |
| `local_trusted` | 本地可信 |
| `enterprise_published` | 企业发布 |
| `official_builtin` | 平台内置 |

### 10.2 Tool Source

| Value | 文案 |
| --- | --- |
| `enterprise_package` | 企业工具包 |
| `official_package` | 平台工具包 |

### 10.3 Restriction State

| Value | 文案 |
| --- | --- |
| `unrestricted` | 不限制 |
| `restricted_nonempty` | 已限制可用范围 |
| `restricted_empty` | 明确不允许使用任何此类资源 |

`restricted_empty` 不得显示为“未设置”“空”或“暂无配置”。

### 10.4 Availability

| Value | 文案 |
| --- | --- |
| `available` | 可用 |
| `unavailable` | 不可用 |
| `unknown` | 状态未知 |

`unknown` 不得显示为可用、健康或可执行。

### 10.5 Unavailable Reason

| Value | 文案 |
| --- | --- |
| `catalog.availability_unknown` | 目录暂时无法确认可用性 |
| `catalog.credential_unavailable` | 凭证不可用 |
| `catalog.disabled` | 已停用 |
| `catalog.health_unavailable` | 健康状态不可用 |
| `catalog.model_unavailable` | 模型不可用 |
| `catalog.revision_unavailable` | 指定版本不可用 |
| `catalog.revoked` | 已撤销 |

### 10.6 Risk Summary

Risk values 来自 `ToolRiskFactKindSchema`。编码必须对当前 Contract 枚举做穷尽映射；新增未知枚举时
TypeScript 或测试必须失败。

| Value | 文案 |
| --- | --- |
| `routine_file` | 常规文件操作 |
| `destructive_file` | 可能修改或删除文件 |
| `protected_resource` | 涉及受保护资源 |
| `local_execution` | 可在本地执行操作 |
| `external_send` | 可向外部发送数据 |
| `unknown` | 风险状态未知 |

### 10.7 ReadOnly

| Value | 文案 |
| --- | --- |
| `true` | 只读 |
| `false` | 可产生变更 |

`readOnly=false` 不等于“危险已授权”，只表示工具可能产生副作用。

### 10.8 Input And Output Shape

| Field | Value | 文案 |
| --- | --- | --- |
| `inputShape` | `structured_object` | 结构化输入 |
| `outputShape` | `structured_object` | 结构化输出 |
| `outputShape` | `unspecified` | 输出形态未声明 |

不得把 `outputShape=unspecified` 展示为“无输出”或“输出正常”。

### 10.9 Error Code

必须冻结并测试：

- `catalog.invalid_query`：目录请求无效，请刷新后重试；
- `catalog.cursor_invalid`：目录分页位置不属于当前运行实例，请刷新；
- `catalog.stale_cursor`：目录已变化，请刷新；
- `catalog.registry_unavailable`：目录暂时不可用；
- `catalog.integrity_violation`：受信目录完整性校验失败；
- `catalog.response_too_large`：目录响应超出安全大小限制；
- `catalog.robot_not_found`：机器人不存在或已不可见；
- `catalog.tool_not_found`：工具不存在或已不可见；
- `catalog.client_mismatch`：当前窗口目录客户端身份不匹配，请刷新；
- `catalog.runtime_changed`：本地 Core 已重启，请刷新；
- `runtime.request_aborted`：请求已取消或已被较新的页面状态取代；Renderer 丢弃结果，不展示为用户错误；
- feature unavailable：目录能力暂不可用。

页面只显示 `safeSummary` 或上述固定安全文案。不得展示 raw error、stack、内部 payload、workspace path、
Credential、authority、requestDigest 或 HMAC proof。

## 11. Page UX

### 11.1 Robots

- Summary list：名称、source、runnable/availability-safe state、restriction chips、description；
- 删除“我创建的” tab，不保留 disabled filter；
- Detail：打开后显示 default model、eligible model names、skills/tools/knowledge display names 和 availability；
- Detail resources 仅展示 safe displayName 与 availability，不展示 revision/digest。

### 11.2 Tools

- Summary list：名称、toolId、source、readOnly、risk chips、availability、description；
- Detail：input/output shape、readOnly、risk、source、availability；
- 删除“模型可调用工具”统计和 modelCallable tag。

### 11.3 Skills

- 生产显示单一 gated card；
- 不展示具体 Mock Skill 列表；
- “创建技能”入口可继续进入 GATED creation page，但必须保持无保存/测试/发布成功语义。

## 12. Tests

### 12.1 Focused Tests

新增/更新：

```text
apps/desktop/tests/intelligence-adapter.test.ts
apps/desktop/tests/intelligence-model.test.ts
apps/desktop/tests/intelligence-center-page.test.ts
apps/desktop/tests/renderer-router.test.ts
apps/desktop/tests/renderer-workbench-boundary.test.ts
```

必须覆盖：

- raw UUID `clientInstanceId`；
- compatibility API 存在、`selectedContractVersion`、`robot_tool_catalog` feature；
- Adapter 五方法调用精确 query shape；
- error envelope 保留 `code/category/retryable/safeSummary`；
- `catalog.runtime_changed` 不自动重放；
- `runtime.request_aborted` 不展示为用户错误；
- list robot/tool pagination、queryRevision mismatch、cursor invalid/stale；
- direct detail route 调 getRobot/getTool；
- route/tab/runtime 切换时 late response 丢弃；
- Robot summary 不展示 default model/resource counts/createdByMe；
- Tool summary 不展示 modelCallable/lifecycleLabel；
- Skill tab 生产只显示 gated，不展示 concrete mock skill；
- exhaustive source/restriction/availability/unavailableReason/risk/readOnly/inputShape/outputShape/error mapping；
- sensitive scan：无 `workspaceRoot`、`rootRealPath`、`selectedPath`、`credentialReference`、`requestDigest`、HMAC、
  stack、`ipcRenderer`、`localStorage`；
- rendered DOM / user-facing copy 不出现 raw enum error；presentation mapper 源码必须包含 enum literal 以证明穷尽映射。

### 12.2 Validation Commands

编码完成后至少运行：

```bash
shasum -a 256 pnpm-lock.yaml
CI=true pnpm install --frozen-lockfile --offline
CI=true pnpm --filter @robothree/desktop build
CI=true pnpm exec vitest run apps/desktop/tests/intelligence-adapter.test.ts apps/desktop/tests/intelligence-model.test.ts apps/desktop/tests/intelligence-center-page.test.ts apps/desktop/tests/renderer-router.test.ts apps/desktop/tests/renderer-workbench-boundary.test.ts
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true pnpm run check
shasum -a 256 pnpm-lock.yaml
```

如果 root check 受并行后端窗口或本机 loopback/Keychain 环境影响失败，必须报告完整失败面，不得隐瞒。
`pnpm-lock.yaml` 前后 digest 必须一致；本批不得修改 lockfile。

## 13. Visual And Accessibility

验收尺寸：

- `1180 x 760`
- `900 x 600`

要求：

- Robot/Tool/Skill 三个 tab 均可键盘切换；
- “加载更多”按钮有可访问名称和 pending 状态；
- 详情区 route 切换时不跳焦点到不可见控件；
- Feature unavailable、runtime changed、client mismatch 使用页面内 persistent notice；
- Status color 不是唯一信息；
- 长 toolId / displayName wrap，不覆盖按钮；
- Skill gated card 不像 empty success。

## 14. Remaining Blockers

DFE-7A 不阻塞于后端接口，四个 Catalog API 已存在。但以下能力继续 GATED：

- Skill Catalog API；
- TGM Tool 管理、配置、测试、启停、删除；
- Robot create/save/publish/avatar upload；
- Skill create/save/test/publish；
- Personal Model/Credential；
- Knowledge Provider；
- Admin Console Tool governance；
- formal installer / OS Sandbox。

## 15. Work Estimate

建议估算：

```text
3～5 个集中工程日
```

拆分：

- 0.5 天：Adapter 五方法与 compatibility/runtime 处理；
- 1～1.5 天：ViewModel 重构、Summary/Detail 字段收敛、mapping；
- 0.75～1 天：页面状态拆分、pagination、direct detail route、late response；
- 0.75～1 天：测试、安全扫描、视觉/可访问性；
- 0.25～0.5 天：共享文件收口和实施报告。

## 16. Coding Gate

当前状态：

```text
DFE-7A 0.0.0-dfe.7a: PASS/CLOSED
```

Revision 1.1 独立差异复核结论为 `PASS（P0=0、P1=0、P2=0、P3=2，均非阻断）`。两个 P3 分别为
`runtime.request_aborted` 穷尽映射遗漏和评审前自标 PASS；本 Revision 1.1 文档收口已补齐 error mapping，并将
状态改为引用独立复核事实，不把文档自检冒充独立结论。原复核计数保持如实记录，不静默改写为全 0。该结论不等于
用户接受或编码授权。

用户已在 Revision 1.1 复核后明确授权 DFE-7A 编码；`0.0.0-dfe.7a` 已完成 Renderer/tests 实现和共享治理收口。
独立复核确认 Renderer focused 门禁通过，但发现同一工作区存在未授权 CPC-2 `services/core/**` 生产实现落盘。
用户随后将该 Core 变更作为独立 CPC-2 批次追认、完成独立 QA 并正式关闭；Core drift 因此不再污染 DFE-7A
边界。用户单独接受并关闭 DFE-7A，当前为 `PASS/CLOSED`。该关闭只证明既有 v1alpha2 Robot / Tool Catalog 的
Renderer 消费，不解锁 Skill Catalog、Tool 管理、创建/发布或任何后端能力。
