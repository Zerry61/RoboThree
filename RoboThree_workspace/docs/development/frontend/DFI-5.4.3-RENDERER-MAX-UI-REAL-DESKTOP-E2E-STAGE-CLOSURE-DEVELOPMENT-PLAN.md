# DFI-5.4.3 Renderer Max UI / Safe Preview / Real Desktop E2E / Stage Closure 详细实施方案

> 状态：**INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 日期：2026-08-28  
> 负责人：Codex 5.6  
> 父方案：[DFI-5.4 Desktop Max UI / Safe Preview / Production Cutover](./DFI-5.4-DESKTOP-MAX-UI-PRODUCTION-CUTOVER-DEVELOPMENT-PLAN.md)  
> 直接上游：[DFI-5.4.2 Desktop v1alpha5 Safe API / Restart Lease](./DFI-5.4.2-DESKTOP-SAFE-API-RESTART-LEASE-DEVELOPMENT-PLAN.md)  
> 上游状态：DFI-5.4.0～5.4.2、R2D-P.1～P.3、PRA-1～PRA-3 均 `PASS/CLOSED`  
> 本批性质：Renderer consumption + Local Personal production cutover + durable safe projection + real Desktop E2E + DFI-5 stage closure  
> 明确不包含：Enterprise production identity/entitlement、Gateway v1alpha3 production route、TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 public CRUD、Admin v2 consumption
> 控制性子批：[DFI-5.4.3A Local Personal Production Graph 聚焦实施方案](./DFI-5.4.3A-LOCAL-PERSONAL-PRODUCTION-GRAPH-DEVELOPMENT-PLAN.md)；[实施停手报告](./DFI-5.4.3-RENDERER-MAX-UI-IMPLEMENTATION-STOP-REPORT.md)

> 2026-08-28 实施说明：DFI-5.4.3A 已独立关闭，用户随后恢复父批编码授权。Renderer Max UI、Safe Preview、
> Durable Task Reasoning Projection、Local Personal exact Max production path 与真实 Desktop E2E 已完成；父108项
> 账本已在开发者 Harness 中执行；独立 QA 已通过并由用户正式接受，DFI-5.4.3、DFI-5.4 与 DFI-5 全阶段均
> `PASS/CLOSED`。

## 0. 结论先行

DFI-5.4.3 是 DFI-5 的最后一个产品收口批。它不再发明 reasoning 参数，也不修改 DFI-5.1～5.4.2 已关闭的
Contract、Planner、mapping 或 durable acceptance 语义；它只完成四件事：

1. 让 Workbench 通过已关闭的 `window.robothreeDesktopV1Alpha5` 六方法 API 消费真实 Compatibility、Safe
   Preview、Preference、SubmitTurn 与 Receipt；
2. 在模型选择附近提供单一 `Max` 开关，持续显示 supported / unsupported / unknown / fallback 的中文安全说明；
3. 以 code-owned production decision 安装 Local Personal exact subject materializer 与 DFI-5.4 production graph，
   只允许已冻结的 OpenAI-compatible exact policy 路径按 Task locked subject 物化，不为其他模型伪造支持；
4. 用真实 Electron Main、sandboxed Preload、Renderer DOM、Core child、SQLite reopen 与受控 TLS/SSE Provider
   fixture 完成生命周期和 DFI-5 阶段 Closure。

本批必须正面关闭一个 DFI-5.4.2 之后才可确认的 projection 缺口：v1alpha5 六方法可以按
`submitTurnCommandId` 查询 Receipt，但现有 v1alpha1 Task list/detail 没有 reasoning summary，也没有公开
`submitTurnCommandId`。只把 Receipt 放在 Composer 成功提示中，应用重启或从任务列表重新进入详情后就无法持续说明
“本次未启用 Max”。以下方式全部禁止：

- 把 reasoning 摘要写入 LocalStorage、URL 或 Renderer 私有缓存并当作 durable truth；
- 给 v1alpha1 Task projection 原地加字段；
- 给已关闭的 v1alpha5 六方法接口原地追加第七个方法；
- 把 reasoning 结果伪装成 Assistant/System Message，从而进入模型上下文；
- 用 retention-bounded Desktop event replay 作为唯一长期 authority。

因此本方案新增一个**独立、最小、只读、版本化的 Task Reasoning Projection**，不扩写 v1alpha5：

```text
@robothree/contracts/desktop-local/task-reasoning/v1alpha1
window.robothreeDesktopTaskReasoningV1Alpha1.getTaskReasoningMode
POST /task-reasoning/v1alpha1/get
robothree:task-reasoning:v1alpha1:get
```

它只按 `taskId` 从既有 durable Task binding、DFI-5.4.1 envelope 与 final Receipt 投影安全摘要；不读取 current
Preference、Profile、mapping、Credential 或 Provider，不新增 migration。该独立 read model 是本方案相对父方案的
controlling clarification，必须在独立文档复核中明确接受后才能编码。

完成编码、开发者门禁、独立 QA 与用户接受后，最高只允许输出：

```text
DFI5_MAX_REASONING_MODE_CONFORMANT
```

它只表示首个已审计 Local Personal OpenAI-compatible exact subject 路径、Desktop Max 体验和恢复语义通过。
不得解释为所有模型支持 Max、Enterprise Max production ready、推理质量保证、固定费用/时长，或 TGM / Knowledge /
Agent Lifecycle / Admin v2 ready。

## 1. 当前工程事实

### 1.1 已关闭且必须复用

1. DFI-5.4.1 已冻结 Desktop Local v1alpha5 → ReasoningModeLock v1alpha2 → Runtime Selection v1alpha4 →
   coordination v1alpha5 → ModelRequest v1alpha2 的 durable 版本链；
2. v1alpha5 SubmitTurn 只允许两类 Max-only fallback：`support_changed_default` 与
   `mapping_unavailable_default`；其他 8 种 PRA typed cause 继续 fail-closed；
3. PRA-3 已提供 code-owned admitted V2 policy、9 个 conformance vectors、immutable manifest 与 exact
   subject-bound materializer；DeepSeek 继续 `requires_mapping_revision`；
4. R2D-P.2 已提供唯一 production `TaskResourceEntitlementSource`，但 production consumption decision 仍 false；
5. DFI-5.4.2 已交付六条 exact Core private route、六个 Main IPC channel、单一 connection lease revalidation、
   bounded client binding 与 frozen sandboxed Preload API；
6. `window.robothreeDesktopV1Alpha4` 继续是 default-only 三方法路径；`window.robothreeDesktopV1Alpha5` 是 Max
   六方法路径，二者不得互相翻译；
7. Workbench 当前协商 v1alpha4，并把 `reasoningPreference` 固定为 `default`；Renderer v1alpha5 consumer count=0；
8. production DFI-5.4.1、R2D-P.2、R2D-P.3 activation 仍 false，production installed subject release count=0；
9. migration 最大 id=26，lockfile digest 为
   `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；
10. DFI-5.4.2 独立 QA、聚焦环境复核和用户接受均完成，P0～P3 全 0。

### 1.2 真实代码缺口

| 缺口 | 当前事实 | DFI-5.4.3 必须交付 |
| --- | --- | --- |
| Renderer Adapter | Workbench 只消费 v1/v1alpha4 | 单一 reasoning adapter + v1alpha5 submit path |
| Max UI | 控件数=0 | 单一 accessible switch + inline status |
| Preference | Renderer 不读 migration 26 projection | load / CAS save / explicit retry / unavailable honesty |
| Preview | Renderer 不调 Core Preview | effective Model identity + late response discard |
| Receipt | 只显示通用“任务已提交” | exact safe reasoning summary 优先于本地预计 |
| Task detail | v1alpha1 projection 无 reasoning | 独立 task-reasoning read model，重启后可恢复 |
| Production graph | DFI-5.4.1 helper禁止 production activation | 新建 DFI-5.4.3 final cutover composition，不篡改 historical helper |
| Provider release | admitted policy存在但 bootstrap consumer=0 | exact subject just-in-time materialization，禁止遍历预装用户 release |
| E2E | 到 Preload 为止 | 真 Electron→Renderer→Core→SQLite→TLS/SSE Provider |
| Stage closure | parent 108 项尚未阶段执行 | item-level ledger + focused 120 项 + historical evidence 不漂移 |

## 2. 范围与授权边界

### 2.1 本批允许

- 新增 Renderer `reasoning-mode-adapter.ts`、纯 ViewModel/presentation 与 Workbench UI 接线；
- 对 `workbench-adapter.ts` 做最小组合改造，使 available Max 使用 v1alpha5，default-only baseline 保留 v1alpha4；
- 新增独立 `desktop-local/task-reasoning/v1alpha1` strict read-only Contract、一个 Core route、一个 IPC channel、
  一个 frozen Preload method 与 Task detail只读消费；
- 新增 DFI-5.4.3 final production composition、exact subject input source 接线和 code-owned activation decision；
- 新增真实 Electron/Core/SQLite/Provider lifecycle Harness、Evidence、测试和必要的版本/治理同步；
- 在不改变既有语义的前提下，增加 content-free diagnostics、named barriers 与真实资源计数。

### 2.2 本批禁止

- 修改 v1alpha1～v1alpha5 已关闭 request/receipt 形状或给 v1alpha5 API 原地追加方法；
- 修改 ReasoningModeLock、Runtime Selection、coordination、ModelRequest 或 DFI-5.3 private mapping digest 公式；
- 建立 legacy Runtime Selection、Renderer fallback Max 或 generic reasoning dispatcher；
- 打开 Enterprise Gateway v1alpha3 production route、production enterprise identity/entitlement、CPC；
- 实现 TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 CRUD、Admin v2；
- 新增 migration 27、第三方依赖或改变 `pnpm-lock.yaml`；
- 使用 Mock、Fixture、LocalStorage、URL state、事件短期缓存或旧 Receipt 伪造 production reasoning truth；
- 使用公网 Provider、真实用户 Key、真实收费调用或把 test identity 宣称为 production identity。

## 3. G1：单一 Renderer Reasoning Adapter

### 3.1 API 与 identity

新增 `apps/desktop/src/renderer/adapters/reasoning-mode-adapter.ts`，只消费：

```text
window.robothreeDesktopV1Alpha5
window.robothreeDesktopTaskReasoningV1Alpha1
```

Adapter 使用一个进程内稳定原始 UUID `clientInstanceId`，不得加 `renderer:*` 前缀。它不得导入 Electron、
`ipcRenderer`、Main channel、Core route、Profile、Strategy 或 Provider-private类型。

Adapter 公开的业务方法固定为：

```text
negotiate()
loadPreference()
preview({ agentId, requestedModelId })
savePreference({ requestedMode, expectedRevision, commandId })
submitTask(... existing Workbench selection ..., reasoningDraft)
recoverSubmit({ submitTurnCommandId })
loadTaskReasoning({ taskId })
```

`commandId` 由 Adapter 第一次创建后保留到 operation terminal；response loss / runtime change 不生成新 ID。

### 3.2 Compatibility 与 baseline 分流

| Compatibility | Composer | Submit path |
| --- | --- | --- |
| v1alpha5 feature `available/ready` | 显示可交互 Max | default/max 均走 v1alpha5 |
| `unavailable/production_gate_disabled` | Max 不可交互并说明不可用 | default-only 继续走已关闭 v1alpha4 |
| `runtime_dependencies_unavailable` | Max 不可交互，提示本地能力暂不可用 | default-only v1alpha4，不提交 Max |
| `reasoning.runtime_changed` | 进入 reconnecting；丢弃旧业务结果 | 重新协商；禁止自动 replay command |
| v1alpha5 API 不存在 | 兼容旧 Desktop，Max 不显示 | v1alpha4 default-only；不回退 v1alpha1 Max |

该 baseline 分流不是 legacy Max translation。只要用户已在 available v1alpha5 下请求 Max，任何错误都不得改走
v1alpha4 创建第二个 Task。

### 3.3 Preview 的 latest-wins 纪律

- 首次 compatibility available 且 effective model 已确定时请求 Preview；
- Agent、requested Model、机器人约束或 Catalog refresh 改变 effective model 时增加 `previewGeneration`；
- API 不支持传 `AbortSignal`，因此“取消”只表示 Renderer 丢弃旧 generation 的晚到结果，不虚假声称取消了 IPC/Core；
- 接受结果前同时验证 generation、当前 agentId、requestedModelId、returned effectiveModelId 与 negotiated runtime；
- Renderer 不解析 `maxSupportRevision`，只把它作为提交时 observation 原样回传；
- 不缓存上一模型 supported，不把错误转成 supported/unsupported；错误独立展示为 preview error。

## 4. G2：Preference 与 Composer draft 分离

### 4.1 初始化

状态固定为：

```text
preference = loading | available | saving | saved | save_failed | uncertain | unavailable
draftMode = default | max
```

- production preference available：用 Core `requestedMode + preferenceRevision` 初始化新 Composer；
- unavailable：新 Composer 初始化 `default`，但用户在当前 Composer 仍可选择 Max；
- test identity 不得投影为 production ready；
- 已创建 Task 的 reasoning 不再读取全局 preference。

### 4.2 保存与失败

- 用户切换 draft 后，以当前 exact revision 做一次 CAS save；
- save success 才推进 persisted revision；
- conflict、unavailable 或 validation failure 不回滚当前 draft，不阻断当前任务；
- 就近持续显示“本次选择可用，未保存为后续默认”；
- `runtime.request_aborted` / response loss 进入 `uncertain`，保留原 commandId 和 material，只有用户显式点击
  “确认保存结果”才用同一 commandId 重放；禁止自动 retry；
- 用户再次切换形成新 material 时必须生成新 commandId，旧 uncertain operation 不得覆盖新 draft。

## 5. G3：Safe Preview / Max UI / presentation

### 5.1 ViewModel 状态

```text
compatibility = loading | available | unavailable | reconnecting | error
preview       = idle | loading | supported | unsupported | unknown | error | stale
submit        = idle | submitting | recovering_status | accepted | fallback_accepted | failed | uncertain
taskReasoning = loading | available | legacy | unavailable | error
```

Preview loading、unsupported、unknown 或 error 都不得单独禁用正常任务提交；是否可提交继续由现有 Workspace、Agent、
Model、Skill/Knowledge 与 busy 规则决定。

### 5.2 UI 冻结

- 在 Workbench 模型选择附近只增加一个标记为 `Max` 的 switch；
- 关闭说明：“使用模型默认模式”；
- 开启说明：“优先使用当前模型支持的最强推理模式，可能需要更长时间”；
- supported：显示“当前模型支持 Max”；
- unsupported：显示“当前模型不支持 Max，将按模型默认模式运行”；
- unknown：显示“当前模型的 Max 支持状态尚未验证，将按模型默认模式运行”；
- error/unavailable：不猜测支持状态，显示安全错误和可执行下一步；
- switch 支持 Space/Enter、可见 focus、`role="switch"`、`aria-checked`、`aria-describedby`；
- 原因和状态不能只靠颜色；移动端/窄窗口不得遮挡模型选择与提交按钮。

不显示：effort level、budget、thinking、Profile/Strategy/mapping revision、Lock ID/digest、思维链、Provider raw model ID。

### 5.3 Submit 与 Receipt 优先级

- default 请求只发送 `{ requestedMode: "default" }`；
- max 请求必须携带同一有效 Preview 的 `observedMaxSupport` 和 `observedMaxSupportRevision`；
- 没有匹配当前 effective model 的 Preview 时，UI 不得伪造 max observation；用户仍可提交 default；
- accepted/replayed 后，页面以 Receipt `requestedMode/resolvedMode/resolutionReason` 覆盖本地预计；
- `support_changed_default | mapping_unavailable_default` 显示持续的“本次未启用 Max，已使用模型默认模式”；
- `unsupported | capability_unknown` 显示对应安全原因；
- `applied` 只显示“Max”，不显示 private directive；
- 任务成功 Receipt 不是 Toast-only：Workbench receipt card 与 Task detail只读摘要都必须展示。

## 6. G4：独立 Durable Task Reasoning Projection

### 6.1 Contract

新增 strict discriminated union：

```text
TaskReasoningModeProjectionV1Alpha1 =
  | {
      state: "available"
      taskId
      requestedMode: "default" | "max"
      resolvedMode: "model_default" | "max"
      resolutionReason:
        requested_default | applied | unsupported | capability_unknown
        | support_changed_default | mapping_unavailable_default
      acceptedAt
    }
  | {
      state: "legacy"
      taskId
      safeSummary: "该任务创建时未记录 Max 推理摘要"
    }
```

Projection 不含 `submitTurnCommandId`、Lock ID/digest、resolution evidence digest、Profile、Strategy、mapping、
Credential、Endpoint 或 private Provider model ID。

### 6.2 Core authority

唯一读取顺序：

1. strict parse taskId；
2. `loadSubmitTurnBindingByTaskId` 取得 durable binding；
3. 按 binding 的 command identity 单次读取 coordination record、DFI-5.4.1 envelope 与 final Receipt；
4. exact 验证 taskId / commandId / Runtime Selection / reasoning lock identity；
5. 只从 final Receipt 投影 safe summary；
6. v1alpha1～v1alpha4 historical Task 返回 `legacy`，不伪造 default；
7. v1alpha5 record 缺 envelope、Receipt 或 exact binding 时 typed fail-closed，不降为 legacy。

禁止读取 current Preference、Profile、Registry、admission policy、mapping、Credential 或 Provider。InMemory/SQLite
必须使用同一 validator；SQLite 原文件 reopen 后结果逐字一致，不新增表/列/索引。

### 6.3 Transport

- 一个 exact Core private read route；
- 一个 exact Main IPC channel，复用单一 connection lease 与 return revalidation；
- 一个 frozen sandboxed Preload method；
- Renderer Task adapter 只在 Task detail打开时按 taskId读取；
- runtime changed 后丢弃旧 response，重新协商后允许重新查询；
- 不把 Desktop event retention 当 authority，event 只触发 refresh。

## 7. G5：Local Personal production cutover

### 7.1 不改 historical helper

以下 DFI-5.4.1 时点事实保持不动：

```text
DFI541_MAX_CORE_DEFAULT_ENABLED = false
DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT = 0
createDfi541MaxCoreComposition production activation forbidden
```

DFI-5.4.3 新建最终 `Dfi543DesktopMaxProductionComposition`；不得回写 DFI-5.4.1 historical evidence 或把旧 helper
改成 true。

### 7.2 最终 production graph

graph 必须 exact 含：

1. Local Desktop subject authority；
2. 唯一 production Entitlement source；
3. DFI-5.4.1 Planner / coordination / Task bundle persistence；
4. code-owned admitted OpenAI GPT-5.2 policy；
5. immutable conformance manifest；
6. exact subject input source；
7. exact subject-bound materializer；
8. release-pinned private mapping registry/projector；
9. durable timeout facts；
10. Preview 与 Preference persistence；
11. v1alpha5 six-method route/API graph；
12. task-reasoning read projection。

缺失、重复或 digest drift 在 HTTP ready 前 fail-fast。不得用 `@ConditionalOnMissingBean`、fake identity、环境变量或
Renderer preference 补齐。

### 7.3 subject release 语义

- production bootstrap 安装的是 code-owned admission source、manifest 与 exact materializer，不遍历或预装所有用户
  Personal Model release；
- 首次 SubmitTurn 只对已锁定的 Local Desktop owner + Personal Model definition/head/status/Credential observation +
  Model lock exact materialize；
- exact policy不匹配时按 frozen typed cause fallback/fail-closed，不切 current policy、不猜 model name；
- materialized release identity写入 durable accepted plan，retry/Tool/Compaction/restart 只复用该 release；
- Enterprise 与 DeepSeek 继续 unavailable/unsupported，不伪装 production admitted。

### 7.4 activation 顺序

1. 新 graph 先以 test-only complete mode运行；
2. Contract/Core/Provider/body omission/historical回归通过；
3. Renderer 与 task-reasoning projection 接线完成；
4. real Desktop E2E 全矩阵通过；
5. 最后一个受审查的 code-owned production decision 才切为 enabled；
6. 再次从零复跑完整门禁；
7. Compatibility 仅在最终 graph complete 时返回 `available/ready`。

不得用 env、CLI、Admin、远端配置或用户 preference 控制 activation。

## 8. G6：命令恢复与生命周期

### 8.1 Submit response loss / runtime change

- Adapter 在调用前保存原 `submitTurnCommandId`；
- `reasoning.runtime_changed` 或 response loss 后不得生成新 command；
- 先重新 compatibility negotiation，再以原 ID 调 `getSubmitTurnStatus`；
- not found 才显示“尚未确认是否已创建任务”，不得自动重提；
- accepted/replayed 返回同一 taskId/lock/reasoning summary；
- 用户显式“查询提交结果”是 query，不是 retry。

### 8.2 生命周期矩阵

| 窗口 | 必须结果 |
| --- | --- |
| Preview 后切模型/机器人 | 旧 generation 丢弃；新 effective model exact Preview |
| Preference commit 后 response loss | 同 commandId 显式重放，revision只增1 |
| Preview supported 后 support drift | 单 command/Task；Receipt `support_changed_default` |
| release admission unavailable | 单 command/Task；Receipt `mapping_unavailable_default` |
| accepted 后 bundle前 SIGKILL | durable exact plan恢复；current authority read=0 |
| task committed 后 Core restart | 同 lock/release/deadline/request digest |
| Electron app restart | Task detail按 taskId恢复 safe reasoning summary |
| Tool round / Compaction | 同 lock、release mapping 与 deadline |
| request sent / output started | 保留 at-least-once / resume-unavailable 诚实语义 |
| terminal replay | Preview/Profile/mapping/Provider/upstream/Usage新增调用=0 |

所有 crash 窗口使用 named deterministic barrier；禁止 sleep 猜窗口或自动 retry。

## 9. G7：真实 Desktop E2E

### 9.1 必须拓扑

```text
real Electron binary
  -> real BrowserWindow
  -> sandboxed preload / contextBridge
  -> real Renderer DOM / Workbench
  -> exact Main IPC
  -> real Core child / private HTTP
  -> real SQLite file + reopen
  -> controlled local HTTPS/TLS + SSE OpenAI-compatible fixture
```

必须实测：`sandbox=true`、`contextIsolation=true`、`nodeIntegration=false`、真实 DOM switch/aria/focus、真实 Core PID、
真实 Provider request body、SSE terminal/Usage、SIGKILL 后新 PID、SQLite 同一原文件 reopen。

不得用 happy-dom/JSDOM、单进程 direct method、`throw` 冒充 crash、删除 DB 冒充 reopen、requestBody mock 冒充
Provider、真实公网或真实用户 Secret 冒充 E2E。

### 9.2 E2E 情景

- default：body 完全省略 reasoning 字段；
- Max supported exact subject：body只含 sealed `reasoning_effort=xhigh`；
- unsupported / unknown：任务继续，body完全省略；
- support drift / mapping unavailable：单 Task fallback + 持续 UI 摘要；
- preference unavailable/save conflict/response loss；
- Core restart、Electron restart、Tool continuation、Compaction、terminal replay；
- legacy Task detail显示 `legacy`，不伪造 default/max；
- Enterprise/DeepSeek 不进入 production Local release。

## 10. 安全、泄漏与资源收敛

### 10.1 统一泄漏扫描

继承 DFI-5.4.2 scanner 并覆盖 Renderer DOM/accessibility tree、IPC、HTTP、Provider fixture、stdout、stderr、Evidence、
failure JSON。禁止内容至少包括：

```text
reasoning_effort（只允许在受控 Provider fixture body evidence中出现）
thinking / budget_tokens / raw mapping / Profile / Strategy
authorization / cookie / credentialReference / Secret / Endpoint query
requestDigest / selectionDigest / lock digest / signature / stack / Zod path
workspaceRoot / rootRealPath / transportClientInstanceId / owner HMAC material
reasoning private output / thinking content
```

执行 5 canary × 4 encoding × 4 channel = 80 次负向注入，每次精确检出；正常四通道命中0。Provider fixture body
采用结构化 allowlist断言，不把 raw body打印到 Evidence。

### 10.2 真实资源计数

至少逐项诊断：Electron children、Core children、Provider fixture children、BrowserWindow、webContents、IPC handlers、
Core HTTP servers、TLS servers、listening ports、SQLite handles、SSE streams、timers、AbortControllers、client bindings、
pending Preference commands、pending Submit commands、late callbacks、temporary files。全部必须来自真实 diagnostics；
禁止缺字段当0、`?? 0`、硬编码0或 parent盲信 child。

## 11. 父方案 108 项阶段账本

DFI-5.4 父方案 §12 的 QA-001～QA-108 在本批形成 item-level ledger：

```text
qaId
ownerTest
evidenceKey
result = pass | blocked
historicalSource? = dfi541 | dfi542 | dfi534 | r2dp3 | pra3
```

- historical Harness PASS 不能直接写成当前执行；必须实际复跑或以文件 hash + 内层 evidence digest 双重校验；
- DFI-5.4.1/5.4.2 已关闭项可以标 historical regression，但必须列出 owner test；
- Renderer/E2E/activation/closure 项必须由 DFI-5.4.3 当次执行；
- 108 项全部 pass 才能从 `retained_for_dfi54_stage_closure` 迁移为
  `executed_at_dfi54_stage_closure`；
- focused 120 项不得冒充父方案 108 项。

## 12. Focused QA 矩阵（120 项）

### 12.1 Adapter / compatibility / identity（QA-001～QA-020）

1. QA-001 v1alpha5 API absent；2. QA-002 gate disabled；3. QA-003 dependencies unavailable；4. QA-004 ready；
5. QA-005 stable raw UUID；6. QA-006 transport ID不等同 owner；7. QA-007 negotiate一次；8. QA-008 runtime changed；
9. QA-009 client mismatch；10. QA-010 no v1alpha1 Max fallback；11. QA-011 v1alpha4 default baseline；
12. QA-012 available Max必须v1alpha5；13. QA-013 late compatibility discard；14. QA-014 API strict parse；
15. QA-015 safe error presentation；16. QA-016 generic dispatcher=0；17. QA-017 Renderer ipcRenderer=0；
18. QA-018 raw channel=0；19. QA-019 fixture fallback=0；20. QA-020 LocalStorage reasoning truth=0。

### 12.2 Preview / preference（QA-021～QA-040）

21. QA-021 initial preference default；22. QA-022 available persisted max；23. QA-023 unavailable projects default；
24. QA-024 current draft max仍可用；25. QA-025 preview exact agent/model；26. QA-026 returned effective model验证；
27. QA-027 model change refetch；28. QA-028 agent change refetch；29. QA-029 refresh change refetch；
30. QA-030 late generation discard；31. QA-031 loading不伪装supported；32. QA-032 unsupported文案；
33. QA-033 unknown文案；34. QA-034 error不猜支持态；35. QA-035 CAS exact revision；36. QA-036 save success revision+1；
37. QA-037 save conflict保留draft；38. QA-038 save unavailable保留draft；39. QA-039 uncertain同command显式重放；
40. QA-040 no automatic retry。

### 12.3 UI / accessibility / submission（QA-041～QA-060）

41. QA-041 单一Max switch；42. QA-042 default文案；43. QA-043 max文案；44. QA-044 role switch；
45. QA-045 aria-checked；46. QA-046 aria-describedby；47. QA-047 keyboard Space；48. QA-048 keyboard Enter；
49. QA-049 visible focus；50. QA-050 reason非color-only；51. QA-051 responsive layout；52. QA-052 no five levels；
53. QA-053 default request无observation；54. QA-054 max exact observation；55. QA-055 stale preview禁伪造max；
56. QA-056 unsupported不阻断正常Task；57. QA-057 unknown不阻断正常Task；58. QA-058 model/permission failure仍阻断；
59. QA-059 Receipt覆盖本地预计；60. QA-060 fallback持续非Toast展示。

### 12.4 Durable Task reasoning projection（QA-061～QA-080）

61. QA-061 independent subpath import；62. QA-062 strict available + `extraStateRejected`（`loading/error` 均拒绝）；63. QA-063 strict legacy；
64. QA-064 raw/digest字段拒绝；65. QA-065 taskId exact；66. QA-066 binding single load；67. QA-067 record single load；
68. QA-068 envelope single load；69. QA-069 Receipt single load；70. QA-070 exact four-way binding；
71. QA-071 current Preference read=0；72. QA-072 Profile read=0；73. QA-073 mapping read=0；
74. QA-074 Credential/Provider read=0；75. QA-075 legacy不伪造default；76. QA-076 damaged v1alpha5 fail-close；
77. QA-077 InMemory/SQLite同 validator；78. QA-078 SQLite原文件reopen；79. QA-079 task detail readonly；
80. QA-080 event仅触发refresh非authority。

### 12.5 Production cutover / Provider（QA-081～QA-100）

81. QA-081 DFI541 historical helper不变；82. QA-082 new graph 12项exact，且 `task-reasoning/v1alpha1` additive 落地并可由 exact package subpath 真实 import；83. QA-083 duplicate fail-fast；
84. QA-084 missing fail-fast；85. QA-085 code-owned activation；86. QA-086 env/CLI/Admin不能打开；
87. QA-087 policy exact model allowlist；88. QA-088 exact local subject；89. QA-089 no bootstrap user enumeration；
90. QA-090 admitted materialization；91. QA-091 unsupported no materialization；92. QA-092 DeepSeek not admitted；
93. QA-093 default body omission；94. QA-094 max sealed body；95. QA-095 fallback body omission；
96. QA-096 Tool same release；97. QA-097 Compaction same release；98. QA-098 retry/restart same deadline；
99. QA-099 terminal replay upstream=0；100. QA-100 Enterprise route count=0。

### 12.6 Real E2E / leakage / closure（QA-101～QA-120）

101. QA-101 real Electron；102. QA-102 sandbox/contextIsolation/nodeIntegration；103. QA-103 real Renderer DOM；
104. QA-104 real Main IPC；105. QA-105 real Core child；106. QA-106 real SQLite reopen；107. QA-107 real TLS/SSE fixture；
108. QA-108 named SIGKILL barriers；109. QA-109 app restart task summary；110. QA-110 three semantic replays；
111. QA-111 80 negative detections；112. QA-112 normal four-channel zero；113. QA-113 exact resource convergence；
114. QA-114 historical dfi541 digest；115. QA-115 historical dfi542 digest；116. QA-116 historical dfi534/r2dp3/pra3；
117. QA-117 parent108 ledger all pass；118. QA-118 migration26/lockfile unchanged；119. QA-119 downstream false清单；
120. QA-120 outcome exact且无PRODUCTION_READY。

测试禁止 `.skip/.only/@Disabled/sleep`、自动 retry、硬编码资源0、`?? 0`、Fake宣称production、删除数据库冒充
reopen、request-body mock冒充Provider或覆盖historical Evidence。

## 13. 实施步骤与估算

### Step 1：Durable Task Reasoning Projection（1～2日）

- strict Contract / Core projection / InMemory+SQLite validator；
- one route / one IPC / frozen Preload；
- Task detail safe ViewModel；
- legacy/integrity矩阵。

### Step 2：Renderer Adapter / Composer / Preference（2～3日）

- compatibility、Preview latest-wins、Preference CAS/uncertain；
- v1alpha5 submit/status recovery；
- Max switch、inline reason、Receipt/task summary、accessibility；
- 与现有 Agent/Model/Skill/Knowledge清空语义回归。

### Step 3：Final production composition / Local exact release（2～3日）

- 新 DFI-5.4.3 graph，不修改 DFI541 historical helper；
- exact subject input source、admitted materializer、just-in-time release；
- code-owned final activation与fail-fast；
- default/fallback omission和Max sealed body。

### Step 4：Real Desktop lifecycle / stage closure（2～4日）

- real Electron/Core/SQLite/TLS-SSE Provider Harness；
- crash/restart/response loss/Tool/Compaction/terminal replay；
- parent108 ledger、focused120、80 leak、资源归零；
- 全量回归、Evidence、实施报告与治理同步。

合计 **7～12个集中工程日**。父方案原 DFI-5.4.3 4～7日估算未覆盖 durable Task reasoning projection、final
production graph 与真实 app-restart readonly summary，故由本详细方案替代；DFI-5.4 总线估算相应增加3～5日。

## 14. 门禁

编码后至少执行：

```text
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r
CI=true pnpm run harness:dfi5.4.3
CI=true pnpm run harness:dfi5.4.2
CI=true pnpm run harness:dfi5.4.1
CI=true pnpm run harness:dfi5.3.4
CI=true pnpm run harness:r2dp3
CI=true pnpm run harness:pra3
CI=true pnpm run harness:r2d4
CI=true pnpm --filter @robothree/contracts build
CI=true pnpm --filter @robothree/desktop build
CI=true pnpm run typecheck
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm install --frozen-lockfile --offline
shasum -a 256 pnpm-lock.yaml
```

Historical Harness 若需要写 artifact，必须先记录文件 hash与内层 evidence digest，并验证语义 digest不漂移；不得静默
覆盖历史后再宣称“只读”。

## 15. 版本与文件边界

### 15.1 编码授权后的版本策略

- Root/Core/Contracts/Desktop 同步为 `0.0.0-dfi.5.4.3`；
- Admin 保持自身已关闭版本，不因 Desktop 批次 bump；
- DTP-4 packaging baseline按标准滚动同步；
- migration仍止26；
-不新增依赖，lockfile digest必须保持 `sha256:5b15ae01…874f31`。

### 15.2 预计允许文件

- `packages/contracts/src/desktop-local/task-reasoning/v1alpha1/**` 与 exact package export；
- `services/core/src/application/*reasoning*projection*`、DFI-5.4.3 composition/exact source接线；
- `services/core/src/adapters/http/core-private-http-server.ts` 的一个 exact read route；
- `apps/desktop/src/{main,preload,shared}/**` 的一个独立 read API与必要 regression；
- `apps/desktop/src/renderer/adapters/reasoning-mode-adapter.ts`、Workbench/Task detail纯 ViewModel/UI；
- 对应 tests、scripts、artifacts、版本和治理文档。

若实现需要改 DFI-5.4.1 durable schema、v1alpha5 six-method API、migration或第三方依赖，必须停止回评审。

## 16. 停手条件

发现任一情况必须停止：

1. 必须原地修改 v1alpha1～v1alpha5 request/receipt/API；
2. taskId无法从现有 durable binding安全定位 final DFI-5.4.1 Receipt；
3. 只能用LocalStorage/URL/event retention恢复Task reasoning；
4. 必须把reasoning摘要写进模型上下文Message；
5. 必须新增migration27或改lockfile；
6. 必须改Reasoning lock/selection/coordination/mapping digest公式；
7. 必须用Renderer/Main重算support/fallback；
8. 必须自动retry Preference或Submit command；
9. 必须为同一用户动作创建两个commandId/Task；
10. production graph只能用fake/test identity补齐；
11. exact release只能按显示名、Endpoint或marketing文本猜测；
12. default/fallback必须发送low/minimal/off/disabled；
13. Max必须扩大权限、Tool、Workspace、output token、retry或Secret边界；
14. 真实E2E必须使用公网、真实Key或收费调用；
15. 只能用JSDOM/direct method/body mock冒充真实E2E；
16. app restart后Task reasoning只能显示Renderer旧缓存；
17. terminal replay会重读Preference/Profile/mapping或重新上游调用；
18. historical Evidence必须改写语义才能通过；
19. parent108任一项无法形成item-level证据；
20. production Gateway/enterprise entitlement/CPC必须打开；
21. 未授权TGM/Knowledge/Agent Lifecycle/Admin v2/DFI-4A.4代码混入；
22. root/Central失败来自共享并发窗口且无法安全隔离。

## 17. 当前状态与独立评审问题

```text
DFI-5.0～DFI-5.3                PASS/CLOSED
DFI-5.4 parent plan             PASS/CLOSED
DFI-5.4.0～DFI-5.4.2           PASS/CLOSED
DFI-5.4.3                       PASS/CLOSED
DFI-5.4.3A                      PASS/CLOSED
production DFI-5.4 Max          false
production Local subject path   exact locked subject path IMPLEMENTED；真实用户 Credential packaging deferred
production Gateway v1alpha3     route count=0
production Enterprise Max       false
Desktop Max UI                  IMPLEMENTED
TGM / Knowledge / Agent Lifecycle / DFI-4A.4 / Admin v2 GATED
```

请独立评审重点回答：

1. 是否接受 v1alpha5 六方法保持冻结，另建最小独立 Task Reasoning read model，而不是扩写旧API？
2. 是否接受 Task detail只从 durable binding/envelope/final Receipt投影，legacy不伪造default，损坏v1alpha5 fail-close？
3. 是否接受 v1alpha4只保留gate unavailable时的default baseline，available Max全部走v1alpha5且禁止错误后降级重提？
4. 是否接受 Preview latest-wins只丢弃Renderer晚到结果，不虚假声明取消Core调用？
5. 是否接受Preference draft与durable preference分离，uncertain只允许同commandId显式重放？
6. 是否接受新增DFI-5.4.3 final composition，不修改DFI541 historical false/0 helper？
7. 是否接受production bootstrap安装admission/materializer，不遍历预装用户release，Submit时按locked subject即时物化？
8. 是否接受Enterprise/DeepSeek继续不可达，DFI-5 closure只覆盖首个Local OpenAI-compatible exact path？
9. 是否接受real Electron/Core/SQLite/TLS-SSE Provider与app restart task summary为必需证据？
10. 是否接受parent108 item-level ledger + focused120 + 80 leak +真实资源归零？
11. 是否接受7～12日替代父方案4～7日，并把新增时间归因于durable只读摘要和final production cutover？
12. 是否确认本批关闭不自动解锁TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4或Admin v2？

文档作者自检：

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
DFI-5.4.3A PASS/CLOSED = true
DFI-5.4.3 PARENT RESTORE AUTHORIZED = true
DFI-5.4.3 IMPLEMENTATION COMPLETE = true
DFI-5.4.3 INDEPENDENT QA PASS = true
DFI-5.4.3 USER ACCEPTED = true
DFI-5.4 PASS/CLOSED = true
DFI-5 PASS/CLOSED = true
```

父方案的历史文档复核保持成立；实施触发 §16 #10 后暂停，DFI-5.4.3A 已完成独立 QA 并由用户正式接受为
`PASS/CLOSED`，用户随后明确恢复父批编码授权。Renderer、E2E 与 Closure 实现、开发者门禁和独立 QA 均已完成，
用户已正式接受并同步关闭 DFI-5.4.3、DFI-5.4 与 DFI-5 全阶段；下游 `GATED` 边界不变。
