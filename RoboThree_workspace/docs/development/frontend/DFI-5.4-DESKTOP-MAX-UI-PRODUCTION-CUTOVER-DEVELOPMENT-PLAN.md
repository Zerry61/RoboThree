# DFI-5.4 Desktop Max UI / Safe Preview / Production Cutover 详细实施方案

> 状态：**DFI-5.4.0～DFI-5.4.3 PASS/CLOSED；DFI-5.4 阶段 PASS/CLOSED**
> 日期：2026-08-28
> 负责人：Codex 5.6
> 父计划：[DFI-5.0 Max Reasoning Mode](./DFI-5.0-MAX-REASONING-MODE-DEVELOPMENT-PLAN.md)
> 工程上游：DFI-5.1、DFI-5.2、DFI-5.3 均已 `PASS/CLOSED`
> 产品上游：Model Experience Spec Revision 4、Frontend Experience Spec Revision 16
> 本批目标：把已关闭的安全 Preview、Task lock 与三类 Provider mapping 接成可见、可提交、可恢复的 Desktop Max 闭环
> 下游：TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 `GATED`
> Controlling addendum：[DFI-5.4.0 Contract / Durable Resolution / Production Release Authority 前置聚焦确认](./DFI-5.4.0-CONTRACT-RELEASE-AUTHORITY-PREFLIGHT-CONFIRMATION.md)
> 方案 A 详细前置：[最小 R2D Production Consumption / Provider Release Admission](./DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md)
> 当前子批：[DFI-5.4.3 Renderer Max UI / Safe Preview / Real Desktop E2E / Stage Closure](./DFI-5.4.3-RENDERER-MAX-UI-REAL-DESKTOP-E2E-STAGE-CLOSURE-DEVELOPMENT-PLAN.md)

> Revision note（2026-08-27）：独立文档复核总体 `PASS` 后，DFI-5.4.0 聚焦代码核查确认：既有
> ReasoningModeLock v1alpha1 无法表达两类最新产品 fallback，coordination v1alpha4 属 R2D 分支且 production
> R2D gate 仍 false，Local Personal exact release 又绑定具体用户 execution digest。因此 §3～§4 的实施入口以
> controlling addendum 为准；父方案产品目标与安全边界继续有效，但不得据此直接进入 DFI-5.4.1 编码。
>
> Scheme A notice（2026-08-27）：用户已接受 DFI-5.4.0 并选择方案 A。先完成 Desktop Local v1alpha4 的最小
> R2D production consumption（reasoning 仅 `default`），再由 DFI-5.4.1 以 Desktop Local v1alpha5、
> ReasoningModeLock v1alpha2、Runtime Selection additive v1alpha4 与 coordination additive v1alpha5 接入 Max。
> 本文原 §3 的 Desktop v1alpha4 Max 版本号假设被该单线版本顺序取代，禁止建立 legacy Runtime Selection 分支。
>
> Scheme A closure note（2026-08-28）：LDA-1 / R2D-P.1～P.3 与 PRA-1～PRA-3 均已完成编码、独立 QA、
> 用户接受并正式 `PASS/CLOSED`。DFI-5.4.1 的前置进入条件现已满足，详细实施边界由当前子批方案控制；
> 在该方案独立文档复核、用户接受与单独编码授权前，仍不得进入编码。
>
> DFI-5.4.2 closure note（2026-08-28）：Desktop v1alpha5 Safe API / Restart Lease 已经独立 QA、用户接受并
> `PASS/CLOSED`。DFI-5.4.3 详细方案确认现有 Task list/detail 不含 durable reasoning summary，故以独立、最小、
> 只读 Task Reasoning Projection 关闭应用重启后的安全解释缺口；该 controlling clarification 不扩写已冻结的
> v1alpha5 六方法 API，且在独立文档复核与用户单独授权前继续 `CODING GATED`。

## 0. 结论先行

DFI-5.4 是 DFI-5 的产品收口批，但当前**不能直接把现有 v1alpha3 路由打开**。代码与最新产品文档之间存在一项
必须先冻结的语义差异：

| 事实 | 已冻结语义 |
| --- | --- |
| DFI-5.2 / Desktop SubmitTurn v1alpha3 | 页面支持态发生漂移时返回 `reasoning_selection_stale`，Task 副作用为 0，刷新后重新提交 |
| Model Experience Spec Revision 4 / Frontend Experience Spec Revision 16 | Max 是 best-effort 增强偏好；漂移或安全映射不可用时，Core 按模型默认模式继续创建 Task，不要求用户二次提交 |

两者不能由 Renderer 自动重试、Main 吞错或 Core 静默改变 v1alpha3 语义来“兼容”。本方案冻结：

1. v1alpha3 Contract、Planner、历史 Harness 与 stale 语义保持逐字节/行为零漂移；
2. DFI-5.4.0 先完成一次聚焦前置确认，决定 additive Desktop SubmitTurn、ReasoningModeLock、Runtime Selection
   与 coordination 的完整 exact version chain、schema/digest/recovery 语义；
3. 新版本只把**可证明是 Max 增强偏好本身导致的 support drift**解析为模型默认模式并继续；模型不可用、权限失败、
   Credential/Endpoint/协议损坏、Task lock integrity failure 仍按既有 typed failure 失败关闭；
4. DFI-5.4 不原地改写任何 v1alpha1～v1alpha3 Contract，不自动 retry，也不生成第二个 Task；
5. 至少一个真实、受审计、code-owned 的 production Local Personal admission policy 与具体 subject-bound exact
   release materialization 在编码前单独冻结；未完成该确认时只能做 test-only UI/E2E，不能输出
   `DFI5_MAX_REASONING_MODE_CONFORMANT`。

完成全部子批、独立 QA 与用户接受后，最高允许输出：

```text
DFI5_MAX_REASONING_MODE_CONFORMANT
```

不得据此声明所有模型支持 Max、Enterprise identity ready、推理质量保证、固定费用/时长、TGM/Knowledge/Agent
Lifecycle ready，或允许用户看到 Provider raw effort/thinking/budget。

## 1. 当前工程事实

### 1.1 已存在且必须复用

1. Desktop Local v1alpha3 已有 strict `ReasoningModePreview`、Preference Query/Update/Receipt 与 SubmitTurn request/
   Receipt/status schemas；当前尚无 Main/Preload/Renderer 消费；
2. Core 已有 `ReasoningModePreviewService`、`ReasoningModePreferenceService`、migration 26 三张 STRICT 表、owner
   HMAC namespace、CAS 与 durable Receipt；production owner 不可信时 preference 必须 unavailable；
3. DFI-5.2 已完成 ReasoningModeLock、Runtime Selection v1alpha2、ModelRequest v1alpha2、coordination v1alpha3、
   main/Tool/Compaction/retry/restart exact lock reuse；
4. R2D 已新增 Runtime Selection v1alpha3 与 coordination v1alpha4，但 production `r2dCoreDeltaEnabled=false`；
   DFI-5.4 不顺带打开 R2D 或 Desktop/Admin v2 consumption；
5. DFI-5.3 已完成 Local Personal、Enterprise OpenAI-compatible、Enterprise Anthropic-compatible typed mapping，
   父 120 项账本为 `executed_at_dfi53_stage_closure`；
6. production Gateway v1alpha3 route、Local/Enterprise Max release、SubmitTurn reasoning route 与 Desktop Max UI
   目前仍为 0/不可达；
7. Desktop 当前只暴露 `window.robothreeDesktop` v1alpha1 与 `window.robothreeDesktopV1Alpha2`；v1alpha1 Workbench
   仍提交 legacy SubmitTurn，不能携带 reasoning preference；
8. Core private HTTP 当前只有 v1alpha1 SubmitTurn route 与 v1alpha2 Catalog/Workspace routes；没有 v1alpha3/v1alpha4
   reasoning routes；
9. production CPC activation、production R2D gate 与 production enterprise entitlement 继续 false；
10. migration 最大 id 为 26，lockfile 当前 digest 为
    `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

### 1.2 本批必须关闭的缺口

- Safe Preview 与 Preference Service 未进入 production composition；
- 缺少可发布 `max_reasoning_mode` 的完整依赖图与 code-owned activation decision；
- 缺少 production release authority；DFI-5.3 的 production release count 仍为 0；
- 缺少 Core private route、Main IPC、sandboxed Preload API 与 Renderer Adapter；
- Workbench 没有 Max UI、支持态重算、保存失败提示与 Core Receipt 只读摘要；
- 产品 Revision 4 best-effort fallback 与 v1alpha3 stale 语义尚未版本化对齐；
- 缺少真实 Electron → Main → Core child → SQLite → Local Provider TLS/SSE 的联合 E2E；
- 缺少 application restart、Core restart、response loss 与 terminal replay 的 UI/Task 一致性证据。

## 2. 分批与授权边界

| 子批 | 范围 | 估算 | 编码条件 |
| --- | --- | --- | --- |
| DFI-5.4.0 | docs-only 语义/版本与首个 production release exact material 前置确认 | 1～2 日 | `PASS/CLOSED` |
| 方案 A 前置 | LDA / R2D-P.1～P.3 + PRA-1～PRA-3 | 关键路径 8～15 日 | 独立方案评审、逐批授权与 QA |
| DFI-5.4.1 | Desktop v1alpha5 + Lock/Runtime/coordination additive Contract/Core cutover、production gate | 4～7 日 | R2D-P 与 PRA 全部 `PASS/CLOSED` 后单独授权 |
| DFI-5.4.2 | Core private HTTP、Main IPC、Preload v1alpha5 safe API 与 restart lease | 4～6 日 | 5.4.1 独立 QA 并关闭 |
| DFI-5.4.3 | Renderer Max UI、Safe Preview、durable Task Reasoning Projection、真实 Desktop E2E、DFI-5 stage closure | 7～12 日 | 5.4.2 独立 QA 并关闭 |

DFI-5.4.1～5.4.3 本身修正为约 **15～25 个集中工程日**；方案 A 前置关键路径另计 **8～15 日**。早期
12～21 日总估算不再覆盖新增的 R2D production consumption 与 Provider admission。增加量来自最新产品 fallback 语义的
additive 版本化、首个 production release authority、真实 Electron/Core/Provider 生命周期与生产 cutover 证据，
不是单纯画一个开关。

每个子批必须分别经过方案/聚焦确认、编码授权、开发者门禁、独立 QA 与用户接受；本文件评审通过不自动授权
DFI-5.4.0 或任何编码。

## 3. G1：additive SubmitTurn v1alpha4 / coordination v1alpha5

### 3.1 版本策略

新增 exact package subpath：

```text
@robothree/contracts/desktop-local/v1alpha4
@robothree/contracts/submit-turn-coordination/v1alpha5
```

根入口继续维持既有导出行为；v1alpha1～v1alpha3 source、fixture、digest 与 historical Harness 字节冻结。
Core-private readable union 单次读取 `schemaVersion` 后只 dispatch 一次；损坏 v1alpha4/v1alpha5 不得 fallback 旧版本。

### 3.2 Max best-effort 解析

v1alpha4 request 仍只携带：

```text
requestedMode = default | max
observedMaxSupport?
observedMaxSupportRevision?
```

Renderer 仍不得提交 Profile/Strategy/mapping/raw parameter。Receipt 的 safe reasoning summary additive 增加：

```text
resolvedMode = model_default | max
resolutionReason =
  requested_default
  | applied
  | unsupported
  | capability_unknown
  | support_changed_default
  | mapping_unavailable_default
```

固定真值表：

| 请求 | 提交时可信事实 | 结果 |
| --- | --- | --- |
| default | 任意 | `requested_default`，不读取 Profile/mapping，body 完全省略 |
| max + exact supported | exact Profile + mapping admission 均可证明 | `applied` |
| max + exact unsupported | revision 一致 | `unsupported`，继续创建 Task，模型默认 |
| max + exact unknown | revision 一致 | `capability_unknown`，继续创建 Task，模型默认 |
| max + preview 后 support/revision 漂移 | 当前模型本身仍合法可用 | `support_changed_default`，继续创建同一 Task |
| max + safe release 在 accept 前不可用 | 当前模型本身仍合法可用 | `mapping_unavailable_default`，继续创建同一 Task |
| 任意 + 模型/权限/Workspace/Agent restriction 不满足 | 非 Max 原因 | 沿用既有 typed reject，不得伪装 fallback |
| max + digest/lock/record 损坏 | integrity failure | typed fail-closed，不得降级隐藏损坏 |

v1alpha5 durable accepted plan 必须保存用户请求、提交时 observation、最终 resolution 与 exact Model lock；accepted 后
recovery 只读 durable plan，不重新读取 Preference/Profile/current mapping。fallback 不是第二次 SubmitTurn，不新建
commandId、Task 或 Message，也不自动 retry。

### 3.3 映射可用性证明

Core 的 submit planner 只能消费 content-free `ReasoningMappingAdmission`：exact subject、Profile/Strategy/mapping
digests、timeout identity 与 `admitted | unavailable`。raw mapping 继续只在 Provider-private registry。

`admitted` 必须证明对应 Provider path 的 exact release 在当前 composition 唯一存在且 digest 有效；不得仅因为
Profile.support=supported 就假定 raw mapping 一定存在。Task commit 后 registry material 损坏属于 integrity failure，
不得把已锁 `max_applied` 改写为 default。

## 4. G2：首个 production release authority

DFI-5.4.0 必须单独冻结首个 production Local Personal release material：

- exact Provider family；
- exact personal execution subject 生成规则；
- exact Adapter descriptor revision；
- Provider model identifier 的 code-owned allowlist 规则；
- Profile/Strategy/private mapping revision 与 digest；
- timeout policy identity；
- body-level mapping 与 omission evidence；
- release source、审核依据、撤销/升级规则。

禁止从显示名称、营销文案、Endpoint、Renderer、自定义模型名称或“reasoning model”字符串推断 supported。没有一条
经过前置确认的 production release 时：

```text
productionSupportedReleaseCount = 0
max_reasoning_mode feature = absent
Renderer production Max control = unavailable/gated
DFI5_MAX_REASONING_MODE_CONFORMANT = false
```

Enterprise release 继续受 production identity/entitlement 阻塞，不作为 MVP DFI-5.4 关闭前提；test-only Enterprise
fixture 只能证明跨协议回归，不能冒充 production release。

## 5. G3：production composition 与三态 gate

引入 code-owned `DFI54_MAX_MODE_DEFAULT_ENABLED`，禁止 Renderer/Main/env/CLI/Profile 自报。三态固定为：

| 状态 | 结果 |
| --- | --- |
| code-owned false | v1alpha5 Core routes、Main IPC、Preload API feature 均不可用；旧 v1/v2/v4 零漂移 |
| true + 任一依赖缺失/重复/损坏 | Core HTTP ready 前 fail-fast；不得半装配投影 feature |
| true + 完整 graph | 注册六条 exact route，Compatibility 投影 `max_reasoning_mode`，允许 Renderer 消费 |

完整 graph 必须同时包括 Preview、Preference（可返回 unavailable）、v1alpha5 SubmitTurn/status、v1alpha5 coordination、
Reasoning Planner、Task materializer、至少一个 production release、Local mapping、durable timeout 与 Provider wrapper。

本批不改变：

```text
productionCpcActivationEnabled = false
productionR2dCoreDeltaEnabled = false
productionEnterpriseEntitlementReady = false
```

Preference persistence unavailable 不阻断当前 Composer 的 per-task Max 请求；UI 必须说明“本次选择可用，未保存为
后续默认”。不得使用 test identity、device fake owner 或 LocalStorage 冒充 production preference ready。

## 6. G4：Core private HTTP / Main / Preload safe API

> 后续 R2D-P.3 已占用 `window.robothreeDesktopV1Alpha4` 承载 default-only 三方法 API。DFI-5.4.2 的
> [controlling child plan](./DFI-5.4.2-DESKTOP-SAFE-API-RESTART-LEASE-DEVELOPMENT-PLAN.md) 因此冻结为独立
> Desktop v1alpha5 六方法 API；本节其余安全、lease 与无 Renderer UI 语义继续有效。

### 6.1 六条 exact Core private routes

```text
POST /v1alpha5/control/compatibility
POST /v1alpha5/reasoning/preview
POST /v1alpha5/reasoning/preference/get
POST /v1alpha5/reasoning/preference/update
POST /v1alpha5/turns/submit
POST /v1alpha5/turns/status
```

禁止 generic `reasoning(method, body)` dispatcher。每条 route strict parse request/response/error envelope；Preview 与
preference request 上限 16 KiB，SubmitTurn 沿用现有有界上限；Origin、Bearer、Host 与 response size 边界不变。

### 6.2 Main IPC 与 Preload API

新增独立：

```text
window.robothreeDesktopV1Alpha5
  getCompatibility
  previewReasoningMode
  getReasoningModePreference
  updateReasoningModePreference
  submitTurn
  getSubmitTurnStatus
```

Main 只做 strict Contract mapping、runtime lease、client binding 与 safe error forwarding；不得重算支持态、解析
Profile、代替 Core fallback 或持久化偏好。Preload 用 `contextBridge` 暴露 frozen allowlist API，Renderer 不接触
`ipcRenderer`、Core token、transport client ID 或 private route。

### 6.3 Runtime lease 与 client identity

- Renderer `clientInstanceId` 是稳定原始 UUID；Main↔Core transport client identity 继续独立；
- 每次操作捕获同一个 `client/runtimeInstanceId/transportClientInstanceId` lease，Compatibility 与业务调用之间不得
  跨 runtime 拼接；返回前必须 revalidate current lease；
- Core restart 后旧 Preview/Preference response 返回 `reasoning.runtime_changed`，Renderer 重新协商并重新 Preview；
- SubmitTurn/Preference command 不自动 replay；只有调用方以原 commandId 显式查询 status/重放，Core durable receipt
  才能返回 exact winner；
- navigation/destroyed/clear 清理 client binding；跨 webContents 重用返回 `reasoning.client_mismatch`。

## 7. G5：Renderer Adapter 与页面状态

### 7.1 单一 Adapter

新增 `reasoning-mode-adapter.ts`，只依赖 `window.robothreeDesktopV1Alpha5`。它必须：

1. 先协商 compatibility 并确认 `max_reasoning_mode`；
2. 以当前 Agent + requestedModel 调 Preview；
3. 模型、机器人或约束导致 effective model 变化时取消旧请求并重新 Preview；
4. 不缓存上一模型的 supported 结果，不解析 support revision；
5. 不 fallback v1alpha1 SubmitTurn、Mock、LocalStorage 或 fixture；
6. 提交时只携带 Core Preview observation 与当前 Composer requested mode；
7. 以 Receipt reasoning summary 覆盖本地“预计结果”。

### 7.2 Composer 状态机

独立状态：

```text
compatibility: loading | available | unavailable
preview: idle | loading | supported | unsupported | unknown | error
preference: available | saving | save_failed | unavailable
submit: idle | submitting | accepted | fallback_accepted | failed
```

规则：

- 初次默认关闭；已持久化偏好可作为新 Composer 初始值；
- Preview loading 时 Max 控件可显示但不得声称 supported；提交按钮按现有模型/权限规则决定，不能只因 Max preview
  loading/unsupported/unknown 阻止正常任务；
- unsupported 显示“当前模型不支持 Max，将按模型默认模式运行”；unknown 显示“当前模型的 Max 支持状态尚未验证，
  将按模型默认模式运行”；
- preference save failure 保留当前 Composer 选择，显示“本次选择可用，未保存为后续默认”；
- Receipt 为 `support_changed_default` 或 `mapping_unavailable_default` 时，在任务反馈/只读摘要持续显示“本次未启用
  Max，已使用模型默认模式”；不得 Toast-only；
- 已创建 Task 的 reasoning 只读，不受全局开关后续变化影响。

### 7.3 可访问性与文案

- 单一 `Max` switch，位于模型选择附近；无五档、budget、Provider 参数；
- 关闭说明“使用模型默认模式”；开启说明“优先使用当前模型支持的最强推理模式，可能需要更长时间”；
- switch 支持键盘、明确 focus、`aria-checked` 与可读状态；原因不只依赖颜色；
- 不显示思维链、reasoning content、signature、raw Profile/mapping digest；
- task summary 只显示“Max”或“模型默认”，必要时显示 safe resolution reason。

## 8. G6：production cutover 顺序

固定切换顺序：

1. 冻结 v1alpha4/v1alpha5 Contract 与首个 production release exact material；
2. 安装 Core graph，但 `DFI54_MAX_MODE_DEFAULT_ENABLED=false`；
3. 通过 Contract/Core/Provider/body omission/historical Harness；
4. 安装 Core private routes、Main/Preload API，仍不向 Renderer advertised；
5. 通过真实 Electron integration build + Core child + Provider fixture E2E；
6. code-owned activation decision 改为 true；启动时重新验证完整 graph；
7. compatibility 才允许投影 `max_reasoning_mode`；Renderer 才显示可交互 Max；
8. 任一依赖回退/损坏时下次启动 fail-fast，不静默显示半可用 UI。

禁止以 runtime env 开关、远端页面配置、Admin 浏览器参数或用户偏好直接控制 production activation。

## 9. G7：真实 Desktop E2E 与生命周期

### 9.1 必须使用的拓扑

```text
real Electron main process
  -> sandboxed preload contextBridge
  -> real Renderer DOM / Workbench
  -> exact Main IPC v1alpha5
  -> real Core child + private HTTP
  -> real SQLite reopen
  -> controlled local TLS/SSE OpenAI-compatible Provider fixture
```

Enterprise OpenAI/Anthropic 走受控 Central/Gateway fixture做回归，但 production identity/entitlement 继续 false。
不得用单进程 direct method、JSDOM-only、requestBody() mock、`throw` 冒充 crash、删除数据库冒充 reopen、sleep 猜窗口
或公网/真实 Key 冒充 E2E。

### 9.2 生命周期窗口

| 窗口 | 必须结果 |
| --- | --- |
| Preview 后模型切换 | 旧 response 不落 UI；新 effective model exact Preview |
| Preview supported 后提交漂移 | 单 command/单 Task；Receipt `support_changed_default` |
| Preference commit 后 response loss | 原 commandId 查询/replay exact Receipt；revision 只加 1 |
| accepted 后 Task bundle 前 crash | 读取 durable v1alpha5 plan，不重读 Preference/Profile/current mapping |
| task committed 后 Main/Core restart | 同 ReasoningModeLock、deadline、request digest |
| Tool 后续轮 / Compaction | 与首轮相同 lock 与 body mode |
| request sent / output started | 保留既有 at-least-once/resume-unavailable 诚实语义 |
| terminal replay | Preview/Profile/mapping/Provider/upstream/Usage 新增调用均为 0 |

使用 named deterministic barriers，禁止 sleep 与自动 retry。

## 10. 安全、泄漏与资源边界

### 10.1 禁止跨面内容

Renderer、IPC、公共 Contract、Receipt、Task projection、日志、stdout/stderr/Evidence/failure JSON 均不得出现：

- `reasoning_effort`、`thinking`、`budget_tokens`、raw mapping/profile material；
- Credential、Authorization、Cookie、Endpoint、provider private model id；
- reasoning/thinking private output、signature、完整 error/stack；
- Core authorization token、transport client identity、owner HMAC key/digest。

### 10.2 负向与资源证据

- 5 canary × 4 encoding × 4 channel = 80 次负向注入，每次必须精确检出；正常四通道命中 0；
- 资源至少覆盖 Electron/Core/Central children、BrowserWindow/webContents、IPC handlers、Core servers、Provider
  fixtures、listening ports、SQLite handles、SSE streams、timers、AbortControllers、client bindings、pending Preference/
  Submit commands、late callbacks、temporary fixture files；
- 所有计数来自真实 diagnostics，禁止缺失字段当 0、`?? 0`、硬编码 0 或 parent 盲信 child。

## 11. 文件边界

### 11.1 对应子批获授权后允许

- `packages/contracts/src/desktop-local/v1alpha5/**`；
- `packages/contracts/src/submit-turn-coordination/v1alpha5/**`；
- Core reasoning Preview/Preference/SubmitTurn composition、private HTTP route、test-only release fixture；
- 经 5.4.0 单独确认的 production Local Personal release source；
- `apps/desktop/src/main/**`、`preload/**`、`shared/**`、`renderer/**` 的 Max 专用接线；
- 对应 tests、真实进程 Harness、Evidence、版本与治理文档。

### 11.2 明确禁止

- 原地改写 v1alpha1～v1alpha3 Desktop Contract、coordination v1alpha1～v1alpha4、ModelRequest/Gateway 历史版本；
- mutation/Admin API、TGM、Knowledge Provider、Agent Lifecycle、Desktop/Admin v2 consumption；
- 打开 production CPC、R2D 或 enterprise entitlement；
- migration 27、新依赖或 lockfile 变化；
- MiniMax `[DONE]` Profile、真实公网 Provider/用户 Secret；
- 将 raw mapping、预算、思维链或 Credential 暴露给 Renderer；
- 用 Mock/Fixture/LocalStorage 作为 production fallback。

## 12. QA 矩阵（108 项）

### 12.1 Contract / version / legacy（QA-001～QA-018）

1. QA-001 v1alpha4 default strict valid；2. QA-002 v1alpha4 max strict valid；3. QA-003 default 禁 observed 字段；
4. QA-004 max 必带 observation；5. QA-005 safe fallback reasons strict；6. QA-006 raw field 拒绝；
7. QA-007 v1alpha5 accepted plan strict；8. QA-008 v1alpha5 digest tamper；9. QA-009 request/plan/Receipt exact binding；
10. QA-010 v1alpha1 source hash；11. QA-011 v1alpha2 source hash；12. QA-012 v1alpha3 source hash；
13. QA-013 coordination v1～v4 source hash；14. QA-014 root export 零漂移；15. QA-015 exact subpath import；
16. QA-016 single dispatch；17. QA-017 damaged v4/v5 不 fallback；18. QA-018 public raw mapping count=0。

### 12.2 Release / cutover / Core（QA-019～QA-036）

19. QA-019 production release exact subject；20. QA-020 allowlist 非模型名猜测；21. QA-021 release digest 重算；
22. QA-022 duplicate release fail-fast；23. QA-023 revoked/missing unavailable；24. QA-024 production release count≥1；
25. QA-025 default Profile/mapping load=0；26. QA-026 max admitted exact load；27. QA-027 unsupported fallback；
28. QA-028 unknown fallback；29. QA-029 support drift fallback；30. QA-030 mapping admission unavailable fallback；
31. QA-031 model unavailable 仍 reject；32. QA-032 permission failure 仍 reject；33. QA-033 integrity failure 仍 fail-close；
34. QA-034 gate=false route count=0；35. QA-035 gate=true incomplete startup fail；36. QA-036 complete graph feature advertised。

### 12.3 Preference / durable SubmitTurn（QA-037～QA-054）

37. QA-037 production owner unavailable projects default；38. QA-038 current composer max 仍可提交；
39. QA-039 save failure safe message；40. QA-040 CAS single winner；41. QA-041 response loss exact Receipt；
42. QA-042 client rebind reject；43. QA-043 default body omission；44. QA-044 max exact Task lock；
45. QA-045 drift 单 command/单 Task；46. QA-046 no automatic retry；47. QA-047 accepted recovery current reads=0；
48. QA-048 Task bundle atomic；49. QA-049 Tool round same lock；50. QA-050 Compaction same lock；
51. QA-051 retry same deadline；52. QA-052 restart same deadline；53. QA-053 terminal replay upstream=0；
54. QA-054 v1alpha3 stale historical test 不漂移。

### 12.4 Core HTTP / Main / Preload（QA-055～QA-072）

55. QA-055 六条 Core routes exact；56. QA-056 generic dispatcher count=0；57. QA-057 strict request parse；
58. QA-058 strict response parse；59. QA-059 typed safe errors；60. QA-060 Origin/Host/Bearer；
61. QA-061 request/response size；62. QA-062 Main 六 channel exact；63. QA-063 Main 不重算 Projection；
64. QA-064 stable raw UUID；65. QA-065 transport ID 分层；66. QA-066 lease single capture；
67. QA-067 return revalidation；68. QA-068 Core restart runtime_changed；69. QA-069 no command auto replay；
70. QA-070 navigation cleanup；71. QA-071 sandboxed Preload frozen API；72. QA-072 Renderer ipcRenderer count=0。

### 12.5 Renderer / accessibility / safe presentation（QA-073～QA-090）

73. QA-073 Max 单一 switch；74. QA-074 default 文案；75. QA-075 max 文案；76. QA-076 supported preview；
77. QA-077 unsupported inline reason；78. QA-078 unknown inline reason；79. QA-079 loading 不伪装 supported；
80. QA-080 model switch cancel old preview；81. QA-081 agent change refetch；82. QA-082 preference initial load；
83. QA-083 save failure保留 draft；84. QA-084 submit 不因 Max unsupported 阻断；85. QA-085 fallback Receipt 持续展示；
86. QA-086 created Task reasoning read-only；87. QA-087 keyboard switch；88. QA-088 focus/aria-checked；
89. QA-089 reason 非颜色-only；90. QA-090 raw Provider/reasoning content count=0。

### 12.6 Real E2E / leakage / closure（QA-091～QA-108）

91. QA-091 real Electron main；92. QA-092 real sandboxed preload；93. QA-093 real Renderer DOM；
94. QA-094 real Core child/private HTTP；95. QA-095 real SQLite reopen；96. QA-096 real TLS/SSE Provider；
97. QA-097 supported max body mapping；98. QA-098 default body omission；99. QA-099 unsupported/unknown fallback；
100. QA-100 drift fallback single Task；101. QA-101 Tool/Compaction/restart；102. QA-102 three semantic replays；
103. QA-103 80 negative leak detections；104. QA-104 normal four-channel zero；105. QA-105 exact resource convergence；
106. QA-106 DFI-5.1～5.3 historical Evidence 不漂移；107. QA-107 readiness false 清单；
108. QA-108 最高只输出 `DFI5_MAX_REASONING_MODE_CONFORMANT`。

测试禁止 `.skip/.only/@Disabled/sleep`、自动 retry、硬编码资源 0、`?? 0`、Fake 宣称 production、删除数据库冒充
reopen 或 request-body mock 冒充真实 Provider。

## 13. 门禁

每个编码子批至少执行：

```text
Node 24.13.0 exact
focused DFI-5.4 harness
DFI-5.1 / DFI-5.2.3 / DFI-5.3.4 / CPC-3 / R2D-4 historical regression
Contracts build + exact private subpath import
Desktop build + Main/Preload/Renderer tests
real Electron/Core/Provider E2E（5.4.3）
Central online/offline
pnpm run lint + Architecture boundary
pnpm run check（VITEST_MAX_WORKERS=1）
pnpm install --frozen-lockfile --offline
audit:dtp4
lockfile digest / migration max检查
多编码 Secret/raw mapping/reasoning output 泄漏扫描
```

## 14. Threat Model

| 威胁 | 控制 |
| --- | --- |
| Renderer 自报 supported | Core exact Preview + submit-time authority |
| 旧 Preview 跨模型落 UI | Abort + effective model identity + lease revalidation |
| Main 吞 stale 自动重试 | v1alpha4 Core 单次 best-effort plan，Main 无重算权 |
| fallback 掩盖模型/权限失败 | 真值表只允许 Max-only drift fallback |
| mapping 缺失在 Task 后才发现 | submit-time content-free admission |
| test fixture 冒充 production release | code-owned release count 与 exact material preflight |
| preference unavailable 阻断 Task | per-task draft 与 durable preference 分离 |
| LocalStorage 冒充偏好 | boundary scan + API-only persistence |
| restart 获得新 deadline/mapping | durable plan/lock/deadline exact recovery |
| v1alpha3 历史语义被改写 | source hash + historical Harness |
| raw effort/budget 泄漏 | sealed projector + multi-channel scan |
| private reasoning 进正文 | provider progress classifier + projection scan |
| UI 宣称所有模型支持 | per-model Preview + unknown preserved |
| activation 半装配 | code-owned three-state startup gate |

## 15. 停手条件

发现以下任一情况必须停止并回文档评审：

1. 必须原地修改 Desktop v1alpha1～v1alpha3 或 coordination v1～v4；
2. 无法只对 Max-only drift 做 fallback，必须吞掉模型/权限/integrity failure；
3. 必须由 Renderer/Main 自动 retry 才能满足产品语义；
4. 需要在同一用户动作创建两个 commandId/Task；
5. 无法在 Task commit 前证明 exact mapping admission；
6. 首个 production release 只能按模型显示名称/Endpoint猜测；
7. 只能用 test fixture、真实用户 Secret 或公网 Provider 证明 production supported；
8. 必须打开 production identity/enterprise entitlement/R2D/CPC；
9. 必须新增 migration 27、依赖或改 lockfile；
10. 必须修改 DFI-5.3 private mapping/digest 公式；
11. default/fallback 必须发送 low/minimal/off/disabled；
12. Max 必须扩大 output token、Tool round、权限、Workspace、retry 或 Secret 边界；
13. Preference unavailable 时只能阻断当前 Task；
14. Core restart 只能重新获取 deadline或当前 mapping；
15. terminal replay 会重新 Preview/Profile/mapping/Provider；
16. Renderer 必须读取 raw Profile/Strategy/mapping；
17. 真实 E2E 只能由 JSDOM/direct method/body mock 冒充；
18. historical Evidence/Harness 必须覆盖或重写才能通过；
19. root/Central 失败来自并发窗口且无法安全隔离；
20. 发现未授权 Admin/TGM/Knowledge/Agent Lifecycle/v2 consumption 代码混入。

## 16. 当前状态与独立评审问题

```text
DFI-5.0～DFI-5.3             PASS/CLOSED
DFI-5.4                       PASS/CLOSED
DFI-5.4.0                     PASS/CLOSED
Scheme A prerequisite plan   PASS/CLOSED
DFI-5.4.1                    PASS/CLOSED
DFI-5.4.2                    PASS/CLOSED
DFI-5.4.3                    PASS/CLOSED
production Gateway v1alpha3  ROUTE COUNT = 0
production preinstalled Max release COUNT = 0（exact locked subject 按需物化）
production SubmitTurn Max    Local exact path IMPLEMENTED；真实用户 Credential packaging deferred
Desktop Max UI               IMPLEMENTED
production CPC/R2D           false
production enterprise identity/entitlement false
Desktop minimal R2D consumption  PASS/CLOSED（production activation=false）
TGM / Knowledge Provider / Agent Lifecycle / Admin v2 consumption GATED
```

以下为父方案独立评审问题，现已完成并接受；DFI-5.4.0 后续实施问题以 controlling addendum §6 为准：

1. 是否接受最新产品 best-effort fallback 与 v1alpha3 stale 的差异必须 additive 版本化，禁止原地改写；
2. 是否接受 v1alpha4/v1alpha5 只对 Max-only drift fallback，模型/权限/integrity failure 继续失败关闭；
3. 是否接受先做 5.4.0 exact release/Contract 前置确认，再分三批编码；
4. 是否接受至少一个 production Local Personal release 是最终 conformant 的硬前提；
5. 是否接受 preference persistence unavailable 不阻断当前 per-task Max，但不得冒充保存成功；
6. 是否接受独立 `robothreeDesktopV1Alpha5` 六方法 API，不扩宽既有 v1/v2/v4 API；
7. 是否接受 runtime lease、client binding、restart 不自动 replay 的边界；
8. 是否接受 UI 持续展示 unsupported/unknown/fallback safe reason，不能 Toast-only；
9. 是否接受真实 Electron + sandboxed Preload + Core child + SQLite + TLS/SSE Provider 为关闭证据；
10. 是否接受 production CPC/R2D/enterprise entitlement 继续 false；
11. 是否接受 108 项 QA 与 80 次泄漏负向、真实资源归零；
12. 是否接受 12～21 个集中工程日替代 5～8 日粗估；
13. 是否确认 DFI-5.4 关闭不自动解锁 TGM/Knowledge/Agent Lifecycle/Desktop/Admin v2 consumption；
14. 若不接受 additive v1alpha4/v1alpha5，是否明确选择保留 v1alpha3 stale 产品体验并同步修订最新产品 Spec。

文档作者自检：

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
CODING AUTHORIZED = false
```

该自检不替代独立文档复核。用户正式接受方案并单独授权前，不得创建 DFI-5.4 Contract、route、IPC、Preload、
Renderer、release、test、Harness 或 Evidence。
