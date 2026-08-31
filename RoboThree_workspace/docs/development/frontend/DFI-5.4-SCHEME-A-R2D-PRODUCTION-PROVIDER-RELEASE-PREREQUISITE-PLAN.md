# DFI-5.4 方案 A 前置：最小 R2D Production Consumption 与 Provider Release Admission 详细实施计划

> 状态：**PLAN REVIEW PASS/CLOSED；LDA-1 / R2D-P.1～P.3、PRA-1～PRA-3、DFI-5.4.1 PASS/CLOSED；DFI-5.4.2 PLAN DOCUMENT REVIEW PASS WITH P3 PRECISION NOTES / USER ACCEPTANCE PENDING / CODING GATED**
> 日期：2026-08-27
> 负责人：Codex 5.6
> 上游：[DFI-5.4.0 前置聚焦确认](./DFI-5.4.0-CONTRACT-RELEASE-AUTHORITY-PREFLIGHT-CONFIRMATION.md) `PASS/CLOSED`
> 路线裁决：采用方案 A；禁止建立 legacy Runtime Selection 分支
> 工程上游：R2D conformance、CPC、DFI-5.1～DFI-5.3 均 `PASS/CLOSED`
> 下游：DFI-5.4.2～DFI-5.4.3 继续 `GATED`
> 本文性质：依赖关系、分批顺序与详细实施方案；本轮不创建代码、Contract、测试、Harness、依赖或 migration

## 0. 结论先行

方案 A 不是“直接把 `r2dCoreDeltaEnabled` 改成 true”，也不是“先画 Max 开关再补后端”。当前两个独立阻塞是：

1. **R2D production consumption 阻塞**：R2D 的 Contract、Planner、原子提交与恢复已经通过，但 production
   `TaskResourceEntitlementSource` 实现数为 0，Desktop 仍消费 legacy SubmitTurn，并把兼容投影
   `defaultModelId` 当作 Agent 选择依据；
2. **Provider Release Admission 阻塞**：三类 Provider mapping 已通过，但 production release 数为 0；Local
   Personal exact subject 绑定具体 Personal Model definition，不能用一个通用 digest 覆盖所有用户配置。

两条线共享一个最小根事实：**Local Desktop Subject Authority（LDA）**。它证明“当前本地 Core 数据库中的这个
Personal Model / Task 资源属于同一个本地 owner scope”，但绝不冒充 Enterprise Identity、SSO、Central
entitlement 或 Admin authority。

冻结后的依赖图：

```text
                         ┌─ PRA-1 Evidence / Admission Policy ───────────┐
LDA-1 Local Subject ─────┼─ R2D-P.1 Local Entitlement Contract          │
Authority                │                                               │
                         ├─ R2D-P.2 Production Composition ──┐           │
                         │                                    ├─ R2D-P.3 Desktop v1alpha4
                         └─ PRA-2 Exact Release Materializer ─┘   consumption / cutover
                                      │
                                      └─ PRA-3 Provider lifecycle closure

R2D-P.1～R2D-P.3 PASS/CLOSED
  + PRA-1～PRA-3 PASS/CLOSED
  + 至少一个 exact subject 可被真实受控 fixture 证明 admitted
       ↓
才允许重新申请 DFI-5.4.1 编码授权
```

`R2D-P` 是 R2D conformance 关闭后的 production consumption 线，不重开或改写 R2D-1～R2D-4 历史结论；
`PRA` 是独立 Provider Release Admission 线，任何 Provider projector/mapping revision 都必须在 PRA 内独立评审，
不得藏入 DFI-5.4.1～5.4.3。

## 1. 当前代码事实与不能跳过的缺口

### 1.1 已关闭、必须复用

1. `TaskRuntimeSelection v1alpha3` 已绑定 exact Agent、Entitlement、Decision、Model/Tool locks、Skill/Knowledge
   refs、ReasoningModeLock、Workspace 与 Registry revision；
2. coordination v1alpha4 已完成 `accepted → message_appended → task_committed → completed`、Task bundle 原子提交、
   `task_committed` Provider 前 barrier 与 exact recovery；
3. code-owned `agent.general` v1alpha2 exact material 已冻结；`agent.fixture.desktop-scripted` 已隔离；
4. Dynamic Request Facts、Instruction Bundle、ModelRequest v1alpha2、Compaction、retry/restart 已形成单一 durable
   事实链；
5. Local Personal、Enterprise OpenAI-compatible、Enterprise Anthropic-compatible mapping 已通过 DFI-5.3 stage
   closure，historical evidence 只读；
6. migration 23 已有 `personal_model_owner_scope_namespaces`；migration 26 已有 Desktop Reasoning Preference owner
   namespace。两者用途不同，不得混用 HMAC domain；
7. Personal Model Domain/Persistence、Keychain、Provider、Task lock 与 recovery 基础已存在，但 public Desktop CRUD
   / Reveal 仍属于 DFI-4A.4，继续 GATED；
8. Desktop Robot/Tool Catalog v1alpha2 已真实接通，旧 Task/SubmitTurn 可用。

### 1.2 当前 production 缺口

| 缺口 | 当前事实 | 本计划关闭方式 |
| --- | --- | --- |
| Local owner authority | Personal Model authority 只接受 `runtime_active_enterprise_identity` | LDA-1 新增 local-only authority，不伪造 enterprise |
| Entitlement | Snapshot v1 的 `authorityKind` 固定为 enterprise | R2D-P.1 additive v2 + readable union，v1 字节冻结 |
| Production source | `TaskResourceEntitlementSource` 只有 tests/support 实现 | R2D-P.2 用真实本地 facts 装配唯一 source |
| Runtime composition | Bootstrap 仍是 scripted fixture，R2D gate=false | R2D-P.2 移除 production fixture authority，依赖完整前仍 false |
| Desktop consumption | Renderer/Main/Preload 只提交旧版本 | R2D-P.3 新建 Desktop Local v1alpha4 单线 cutover |
| Agent default authority | Renderer 仍读取 `agent.defaultModelId` | v1alpha4 Receipt 删除该兼容字段，UI 只认 resolved Model |
| Provider release | production release count=0 | PRA 两层 authority + exact subject materialization |
| Public Personal Model 配置 | DFI-4A.4 仍 GATED | 不在本计划偷跑；无可信配置时 Preview 保持 unavailable |

### 1.3 最小产品边界

本计划允许：

- 新 Task 在 code-owned gate 开启后使用 R2D v3/v4 事实；
- `agent.general` + 当前本地 owner 已合法存在、完整且可用的 Personal Model；
- 真实已注册且当前 policy 允许的 Document Tool；
- Skill/Knowledge 在对应 runtime 未完成前保持空集合或 typed unavailable；
- Desktop v1alpha4 展示 resolved Model 与资源摘要，不展示 internal digest。

本计划不允许：

- 以 OS 用户名、固定 `user.local`、Renderer/Main 自报 ID、test identity 充当 production owner；
- 把 local authority 投影成 enterprise identity/entitlement ready；
- 为了“有模型可测”自动创建 scripted model、Fixture Personal Model 或默认 Secret；
- 打开 Personal Model CRUD/Reveal UI、Admin v2、TGM、Knowledge Provider、Agent Lifecycle；
- 在 Desktop v1alpha4 暴露 Max；Max 仍属于后续 v1alpha5/DFI-5.4.1。

## 2. G1：Local Desktop Subject Authority（LDA-1）

### 2.1 Authority 来源

LDA-1 只使用 Core 持有的 `personal_model_owner_scope_namespaces` active namespace（migration 23）：

```text
authorityKind = local_desktop_owner
namespaceRevision = exact active personal-model namespace revision
ownerScopeDigest = HMAC-SHA256(
  namespaceKey,
  "robothree.local-desktop-owner.v1\n" + canonicalJson({
    schemaVersion: "v1",
    scope: "local_personal_model_and_task_resource"
  })
)
```

冻结规则：

1. 必须使用独立 HMAC domain；不得复用 enterprise owner material 或 Desktop Preference owner domain；
2. namespace key 只在 Core 内短暂使用并清零，不进 Contract、Receipt、日志、Renderer、Main；
3. namespace 缺失可由既有原子 initialize 产生；重复 active namespace、key check/digest 损坏一律失败关闭；
4. 复制 SQLite 会复制 owner namespace，但不会复制 macOS Keychain item；复制后的 Credential 检查必须失败关闭，
   不得因此把新机器视为可调用；
5. historical enterprise-bound Personal Model records 不 backfill、不 rebind、不自动转为 local owner；
6. LDA-1 本批只给 `use` 与 task-resource entitlement 提供 authority。`configure/reveal/delete` 的 public Desktop
   接线仍属于 DFI-4A.4；不得因共享 owner identity 宣称 CRUD ready；
7. 无 local-owner Personal Model definition 时 R2D 可返回“无合法模型”，PRA 可安装 admission policy，但 Max
   Preview 不得显示 supported。

### 2.2 Action 与身份分层

新增 local authority 必须是 strict discriminated union，而不是给现有 enterprise object 塞可空字段：

```text
runtime_active_enterprise_identity  // 历史语义零漂移
local_desktop_owner                 // local-only、productionIdentityReady=false
test_only                           // 仅 tests/support
```

`local_desktop_owner` 可以证明本机数据库 owner scope，不证明自然人、组织、设备合规或 Central 授权。它的
`productionLocalAuthorityReady=true` 与 `productionEnterpriseIdentityReady=false` 必须同时存在，且 schema 禁止
两者混淆。

## 3. G2：R2D-P 最小 production consumption

### 3.1 R2D-P.1：Local Entitlement Contract / Interpreter（2～4 日）

范围：

1. 新增 Core-private `TaskResourceEntitlementSnapshot v2`：
   - `authorityKind="local_desktop_owner"`；
   - exact local owner binding digest；
   - Model/Skill/Tool/Knowledge portable refs + stable ordinal；
   - `identityEvidence={localAuthorityReady:true, enterpriseIdentityReady:false, testIdentityUsed:false}`；
2. 新增 `ReadableTaskResourceEntitlementSnapshot` 单次 `schemaVersion` dispatch；v1 source/hash/digest 不变；
3. Planner 只消费 normalize 后的 canonical entitlement view，不复制两份交集真值表；
4. `AgentResourceDecision v1` 若现有 digest/ref 已能 exact 绑定 v2 entitlement，则保持不变；若 strict schema 无法
   证明，立即停手评审 additive decision version，不得原地扩字段；
5. Port 从只返回 v1 收窄为 readable union；tests/support adapter 与 production adapter 明确分开；
6. 不改 Runtime Selection v1alpha3、coordination v1alpha4、migration 或 public Desktop Contract。

### 3.2 R2D-P.2：Production Source / Composition（3～5 日）

唯一 production source 每次首次 accept 读取：

| 资源 | 可信来源 | 未就绪语义 |
| --- | --- | --- |
| Agent | code-owned `BuiltInGeneralAgentSource`；未来 Agent Lifecycle exact source | 非 `agent.general` 且无 source → unavailable |
| Model | local owner 下 active Personal Model head + exact definition/status/profile/credential observation | 任一缺失/漂移 → 不进入 entitlement |
| Tool | current Registry 中真实 definition/binding/adapter + availability + Workspace/Auth/Tool policy | TGM 不存在不影响既有 Document Tool；未知 Tool 不进入 |
| Skill | 当前无可信 production materializer/catalog | 空集合；用户请求非空 → typed unavailable |
| Knowledge | Knowledge Provider 未 ready | 空集合；用户请求非空 → typed unavailable |
| Preference | exact local Personal Model preference；缺失则 stable fallback | 不能按显示顺序或 Renderer 顺序猜 |

装配规则：

1. `unrestricted` 不等于加载所有资源；只从 entitlement 与 Registry exact intersection 产生候选；
2. stable ordinal 由 Core source 给出，Renderer 不排序；
3. production bootstrap 不得注册 `agent.fixture.desktop-scripted`、`model.desktop-scripted` 或 test source；
4. composition 完成后仍先保持 `R2D_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED=false`；
5. code-owned true + source/agent/registry/policy/lock/coordination 任一缺失或重复时，Core HTTP ready 前 fail-fast；
6. gate=false 时旧 Task/旧 SubmitTurn 零漂移；不得半装配投影 R2D ready。

新 Task 的 cutover 三态必须精确区分：

1. gate=false：新 Task 继续既有 legacy SubmitTurn 路径，历史语义零漂移；
2. gate=true 且启动依赖不完整：Core 必须在 HTTP ready 前 fail-fast，不得先 ready 再制造 route-level
   “空窗口”；
3. gate=true、启动图完整，但运行期间 local authority 或 exact source 变为 unavailable：v1alpha4 路径返回
   typed unavailable/rejected，不得 fallback legacy；已经 accepted 的旧 Task 始终按 durable exact facts replay。

### 3.3 R2D-P.3：Desktop Local v1alpha4 / Cutover / E2E（3～5 日）

新增单一线性版本：

```text
Desktop Local v1alpha4
  -> Core SubmitTurn command uses R2D Runtime Selection v1alpha3
  -> coordination v1alpha4
  -> Reasoning preference is strict literal { requestedMode: "default" }
```

v1alpha4 冻结：

1. request 继承 v1alpha2 资源与 authorization 选择，但 reasoning 只能是 `default`；不得接受 Max observation；
2. Receipt 投影 exact Agent revision、resolved Model、active Skill、allowed Tool、Knowledge、authorization 和安全状态；
3. **移除 `defaultModelId` 兼容投影**，不得给它改名或从 resolved Model 反向伪造 Agent default；
4. Main/Preload/Renderer 新增 `robothreeDesktopV1Alpha4` exact API；不扩宽 v1/v2；
5. Renderer 不解释 entitlement、intersection、ordinal、lock 或 digest；只提交用户显式选择并展示 Core Receipt；
6. 旧 Task 按原 schema readable；新 Task 只有 gate true + 完整 graph 时进入 v1alpha4；
7. response loss、Core restart、application restart、terminal replay 不重新读取 Agent/Entitlement/Preference/
   Registry/Tool policy；
8. 真实 Electron → sandboxed Preload → Main → Core child → SQLite → Agent Loop E2E；不以 JSDOM/direct method
   冒充；
9. 本批不投影 `max_reasoning_mode` feature，不出现 Max UI。

DFI-5.4 后续版本链改为：

```text
R2D-P.3 Desktop Local v1alpha4          // production R2D，reasoning 仅 default
DFI-5.4.1 Desktop Local v1alpha5        // additive best-effort Max
  + ReasoningModeLock v1alpha2
  + Runtime Selection additive v1alpha4
  + coordination additive v1alpha5
```

Receipt summary additive extension只能与 ReasoningModeLock v1alpha2、Runtime Selection v1alpha4、coordination
v1alpha5 同批 exact 演进；禁止只扩 Receipt，禁止建立 legacy Runtime Selection 分支，禁止重新发明同义字段。

## 4. G3：独立 Provider Release Admission（PRA）

### 4.1 PRA-1：Immutable Evidence / Admission Policy（1～2 日）

每个 candidate 必须形成 code-owned content-addressed manifest：

```text
providerFamily / apiFamily
exact model ID or snapshot allowlist
canonical endpoint identity rule
adapter descriptor revision
request projector revision
supported strongest directive
default omission rule
Usage / SSE terminal / Tool continuation rule
timeout policy identity
official evidence excerpts digests + source URLs + observed date
revocation / supersession rule
```

网页 URL 会变化，只作出处；进入 release graph 的是仓库内 immutable manifest 与 digest。根据 2026-08-27 官方
资料，OpenAI GPT-5.2 exact snapshot 是当前最短路径候选，但仍需 Chat Completions body/token/tool conformance；
DeepSeek V4 的 `thinking`、`max` 与 Tool reasoning continuation 超出当前 sealed projector，不得在 PRA 内静默
映射成 `xhigh`。参考：

- [OpenAI GPT-5.2 model](https://developers.openai.com/api/docs/models/gpt-5.2)
- [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2)
- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [DeepSeek Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion/)

### 4.2 PRA-2：Exact Subject-bound Release Materializer（2～4 日）

输入只能来自：

- Task exact Model lock；
- LDA-1 local owner authority；
- immutable Personal Model definition + execution digest；
- exact Adapter descriptor/profile；
- code-owned admitted policy。

固定顺序：

```text
validate local owner + model definition
  -> exact capability / adapter / execution subject
  -> load one admitted policy
  -> recompute Strategy/Profile/private mapping chain
  -> compare exact policy/projector/timeout identities
  -> materialize immutable subject-bound release
  -> durable accept stores only safe refs/digests
```

缺失、重复、digest drift、Endpoint identity 不符、projector 不支持最强档位均在 Credential resolve、DNS、socket、
TLS、HTTP body、Invocation Link/Timeout Fact、Usage 前失败关闭。不得 fallback current policy、当前 Profile、近似
model ID 或 family marketing 名。

若 candidate 需要新增 directive variant、Tool continuation private state、token 字段或 Gateway schema，必须停止并
单独输出 Provider mapping additive revision；该 revision 独立评审、授权、QA，不属于任何 DFI-5.4.x 子批。
PRA-1 只允许冻结 immutable evidence 与 admission policy；一旦最强候选需要上述任一新协议能力，PRA-1 也必须
立即停手，不能把新 directive、continuation state、token 字段或 Gateway schema 静默包装成 evidence/admission
实现。

### 4.3 PRA-3：Real Fixture / Lifecycle Closure（3～5 日）

1. 受控本地 HTTP/TLS/SSE Provider process，不调用公网、不需要真实用户 Secret；
2. default body 与 legacy body 在 reasoning 字段外等价，reasoning/effort/thinking/budget 字段数为 0；
3. Max body exact mapping、Usage 正确、`usage:null` 不失败、`[DONE]` 终态、非法 EOF、timeout typed 分类；
4. Tool continuation 若 candidate 官方协议要求 private reasoning round-trip，必须有已评审安全实现，否则 candidate
   不 admitted；
5. SIGKILL/restart/SQLite reopen 后复用 original release digest 与 durable deadline；terminal replay mapping/
   upstream/Usage 增量为 0；
6. production composition 只安装 code-owned admission policy/materializer，不安装 test subject 或 Fixture Secret；
7. `productionSupportedReleaseCount` 的口径是“可由 production materializer 对 exact subject 物化的 admitted
   policy 数”，不是当前用户一定已有可用配置；无 active exact subject 时 Preview 仍为 unavailable/unknown。

## 5. 分批顺序、并行关系与工期

| 批次 | 依赖 | 估算 | 可并行 | 关闭后解锁 |
| --- | --- | --- | --- | --- |
| LDA-1 + R2D-P.1 | 本方案 PASS/CLOSED + 单独授权 | 2～4 日 | PRA-1 | R2D-P.2、PRA-2 |
| PRA-1 | 本方案 PASS/CLOSED + 单独授权 | 1～2 日 | LDA/R2D-P.1 | PRA-2 |
| R2D-P.2 | R2D-P.1 PASS/CLOSED | 3～5 日 | PRA-2/PRA-3 | R2D-P.3 |
| PRA-2 | LDA-1 + PRA-1 PASS/CLOSED | 2～4 日 | R2D-P.2 | PRA-3 |
| PRA-3 | PRA-2 PASS/CLOSED | 4～7 日（细化） | R2D-P.3 | Provider admission closure |
| R2D-P.3 | R2D-P.2 PASS/CLOSED | 4～7 日（细化） | PRA-3 | R2D production consumption closure |

R2D-P 串行约 **9～16 日**；PRA 串行约 **7～13 日**，可在共享 LDA 完成后与 R2D-P.2/P.3 并行。按依赖关键
路径约 **9～16 个集中工程日**，不包含独立 QA 返工，也不包含 DFI-4A.4 public Personal Model CRUD UI。该修正
由 R2D-P.3 的真实 Electron E2E 与 PRA-3 的 admitted policy V2 / 真实 TLS lifecycle 细化产生，不扩大产品范围。

推荐授权顺序：

```text
本方案文档评审
  -> 单独授权 LDA-1 / R2D-P.1
  -> 同期单独授权 PRA-1
  -> R2D-P.2 与 PRA-2/PRA-3 按各自 QA 独立推进
  -> R2D-P.3
  -> 两条线独立 QA + 用户接受
  -> 重新评估并单独授权 DFI-5.4.1
```

不建议把六批合成一个大批；共享代码不等于共享 QA 状态。

## 6. 文件边界

### 6.1 LDA / R2D-P 允许范围

- `services/core/src/application/**local*authority*`、`task-resource-entitlement*`、R2D composition；
- `services/core/src/ports/**entitlement*`、必要的 readable union；
- `services/core/src/bootstrap/create-desktop-private-runtime.ts`（仅 R2D-P.2/P.3 授权后）；
- `packages/contracts/src/desktop-local/v1alpha4/**` 与 exact package export（仅 R2D-P.3）；
- `apps/desktop/src/main/**`、`preload/**`、`renderer/**`（仅 R2D-P.3）；
- 对应 tests/Harness/Evidence/docs。

### 6.2 PRA 允许范围

- `services/core/src/application/**reasoning*admission*`、`**release*`、private registry/materializer；
- 必要的 Local Personal Provider sealed projector additive 文件（必须先差异评审）；
- code-owned immutable manifests 与受控 Provider fixtures；
- 对应 tests/Harness/Evidence/docs。

### 6.3 全线禁止

- 原地修改 R2D v1、Runtime Selection v1～v3、coordination v1～v4、Desktop v1～v3；
- 修改 DFI-5.3 historical Evidence/Harness；
- migration 27、新依赖、lockfile 变化，除非某子批先停手回评审并获新授权；
- Central/Admin/TGM/Knowledge Provider/Agent Lifecycle/Memory/Effect Reconciliation；
- production enterprise identity/entitlement、CPC activation；
- DFI-5.4.1～5.4.3 代码。

## 7. 生命周期与 cutover 真值表

| Gate / 依赖 | 新 Task | 旧 Task | Feature 投影 |
| --- | --- | --- | --- |
| code-owned false | legacy path | exact historical replay | R2D v1alpha4 absent |
| true + LDA/entitlement/composition 不完整 | Core ready 前 fail-fast | 不启动新 runtime | absent |
| true + R2D 完整、PRA 未完成 | v1alpha4 + reasoning default | exact historical replay | R2D ready；Max absent |
| R2D + PRA 完整、DFI-5.4.1 未完成 | v1alpha4 + default | exact historical replay | Max route/UI absent |
| 后续 DFI-5.4.1～3 全关闭 | v1alpha5 best-effort Max | 按原版本 replay | Max 按 exact model Preview |

cutover 只影响首次新 SubmitTurn。accepted 后不得因 gate、current Agent、current model preference、current
Registry、current admission policy 变化而重选；损坏时 typed fail-closed，不回 legacy。

## 8. Threat Model

| 威胁 | 控制 |
| --- | --- |
| 固定用户/OS 用户冒充身份 | namespace-key HMAC authority；无外部自报字段 |
| local authority 冒充 enterprise | strict authority union + readiness 互斥 |
| SQLite 被复制后继续使用原 Credential | Keychain binding/observation fail-closed |
| historical enterprise records被接管 | 不 backfill、不 rebind、exact owner digest |
| Fixture model进入 production | bootstrap/source allowlist + boundary scan |
| Renderer排序/扩大 entitlement | ordinal 与 intersection 仅 Core authority |
| `defaultModelId`继续充当 Agent authority | v1alpha4 schema 删除 + Renderer scan |
| gate 半开启 | false/true-incomplete/true-complete 三态 startup |
| Provider按名称猜 supported | immutable manifest + exact subject release |
| current policy覆盖 durable release | accepted plan 保存 exact release digest |
| raw directive/Secret泄漏 | sealed private types + 多通道扫描 |
| Max mapping revision藏进 UI | PRA 独立停手/评审/授权规则 |

## 9. QA 矩阵（96 项）

### 9.1 LDA / Entitlement（QA-001～QA-024）

1. QA-001：local owner digest 只由 active Personal Model namespace key + 独立 domain 派生。
2. QA-002：raw namespace key 不进 Contract/Receipt/log/Main/Renderer。
3. QA-003：namespace key 使用后内存副本清零。
4. QA-004：缺失 namespace 原子 single-winner initialize。
5. QA-005：重复 active namespace 失败关闭。
6. QA-006：namespace key check mismatch 失败关闭。
7. QA-007：namespace record digest mismatch 失败关闭。
8. QA-008：local authority 与 enterprise authority strict 分支。
9. QA-009：local ready 不得使 enterprise ready=true。
10. QA-010：test identity 不得使 local production ready=true。
11. QA-011：OS username 不参与 authority。
12. QA-012：Renderer/Main client self-report 不参与 authority。
13. QA-013：historical enterprise Personal Model 不 backfill。
14. QA-014：SQLite copy 后缺 Keychain item使模型不可用。
15. QA-015：Entitlement v1 source/hash/digest 零漂移。
16. QA-016：Entitlement v2 authorityKind exact 为 local_desktop_owner。
17. QA-017：v2 identity flags 组合约束成立。
18. QA-018：v2 Model refs stable ordinal 严格递增且 exact tie-break。
19. QA-019：v2 Skill/Tool/Knowledge refs portable、无本机 handle。
20. QA-020：readable union 单次 schemaVersion dispatch。
21. QA-021：损坏 v2 不 fallback v1。
22. QA-022：Planner 使用单一 normalized view，不复制交集真值表。
23. QA-023：production source 与 tests/support source 边界分离。
24. QA-024：本批不解锁 public configure/reveal/delete。

### 9.2 R2D production composition / Desktop（QA-025～QA-048）

25. QA-025：production Agent 默认只来自 code-owned agent.general。
26. QA-026：agent.fixture.desktop-scripted production consumer count=0。
27. QA-027：model.desktop-scripted production consumer count=0。
28. QA-028：Personal Model 必须 exact head/definition/status一致。
29. QA-029：Personal Model Profile/Credential observation不完整则不进入 entitlement。
30. QA-030：Document Tool 必须 Registry/binding/availability/policy exact intersection。
31. QA-031：TGM 缺失不阻断既有 Document Tool，也不补造 Tool。
32. QA-032：Skill source未就绪时 entitlement为空。
33. QA-033：请求非空 Skill 而 source未就绪返回 typed unavailable。
34. QA-034：Knowledge source未就绪时 entitlement为空。
35. QA-035：请求非空 Knowledge 返回 typed unavailable。
36. QA-036：unrestricted 不自动加载全部资源。
37. QA-037：gate=false 时 production R2D route/consumer count=0。
38. QA-038：gate=true + 依赖缺失在 Core ready 前 fail-fast。
39. QA-039：Desktop v1alpha4 request reasoning只能 default。
40. QA-040：Desktop v1alpha4 Receipt 不含 defaultModelId。
41. QA-041：Renderer 不从 Agent defaultModelId 选择 Model。
42. QA-042：Renderer 不解释 entitlement/ordinal/digest。
43. QA-043：Main/Preload exact v1alpha4 API，不扩宽 v1/v2。
44. QA-044：旧 Task 按原 schema readable。
45. QA-045：损坏 v1alpha4 不 fallback legacy。
46. QA-046：response loss/restart 不重读八类 current authority。
47. QA-047：terminal replay Agent Loop/Provider 增量为0。
48. QA-048：真实 Electron/Core/SQLite E2E，不以 JSDOM 冒充。

### 9.3 Provider Release Admission（QA-049～QA-072）

49. QA-049：每个 candidate 有 immutable manifest 与 digest。
50. QA-050：网页 URL 不直接充当 release revision。
51. QA-051：exact model ID/snapshot allowlist存在。
52. QA-052：canonical endpoint identity rule存在且不按字符串相似猜测。
53. QA-053：Adapter descriptor/projector/timeout identities exact。
54. QA-054：default omission rule进入 evidence。
55. QA-055：Usage/SSE terminal/Tool continuation规则进入 evidence。
56. QA-056：DeepSeek max/thinking缺口不得映射为xhigh。
57. QA-057：GPT-5.2 candidate未过conformance不得admitted。
58. QA-058：Task Model lock进入 exact subject。
59. QA-059：Personal execution definition digest进入 exact subject。
60. QA-060：local owner identity与definition owner exact一致。
61. QA-061：Policy load恰好一次。
62. QA-062：Profile/mapping exact load各恰好一次。
63. QA-063：缺失/重复/drift在Credential resolve前失败。
64. QA-064：失败时DNS/socket/TLS/HTTP body均0。
65. QA-065：失败时Invocation Link/Timeout Fact/Usage均0。
66. QA-066：default body reasoning字段数为0。
67. QA-067：Max body只含sealed directive。
68. QA-068：usage:null内容帧不触发usage_invalid。
69. QA-069：正常EOF无[DONE]仍为stream_terminal_missing。
70. QA-070：timeout cause不被late ECONNRESET覆盖。
71. QA-071：restart复用original release digest/deadline。
72. QA-072：terminal replay mapping/upstream/Usage增量为0。

### 9.4 跨线 cutover / 安全 / 治理（QA-073～QA-096）

73. QA-073：R2D-P 与 PRA 独立 evidence/版本/QA 状态。
74. QA-074：PRA 不能修改 R2D Planner 真值表。
75. QA-075：R2D-P 不能安装 Provider private mapping。
76. QA-076：DFI-5.3 historical evidence文件hash不变。
77. QA-077：migration仍止26。
78. QA-078：lockfile digest保持编码前基线。
79. QA-079：新增依赖数为0。
80. QA-080：production CPC activation仍false。
81. QA-081：production enterprise identity/entitlement仍false。
82. QA-082：Admin v2 consumer count=0。
83. QA-083：DFI-5.4.1～5.4.3 consumer count=0。
84. QA-084：Max feature/route/UI继续absent。
85. QA-085：ReasoningModeLock v1alpha1 historical零漂移。
86. QA-086：不创建 legacy Runtime Selection 分支。
87. QA-087：R2D-P.3 后版本链唯一为v1alpha4→DFI v1alpha5。
88. QA-088：raw Secret/Endpoint/directive不进stdout。
89. QA-089：raw Secret/Endpoint/directive不进stderr。
90. QA-090：raw Secret/Endpoint/directive不进evidence。
91. QA-091：raw Secret/Endpoint/directive不进failure summary。
92. QA-092：负向泄漏注入覆盖raw/url/base64/hex。
93. QA-093：真实child/socket/timer/SQLite/fixture资源归零。
94. QA-094：root check、lint、boundary、audit全部通过。
95. QA-095：Central online/offline均通过，即使本批不改Central。
96. QA-096：最高只声明各子批conformant，不声明DFI5/production ready。

## 10. 正式门禁

每个编码子批至少执行：

```text
Node 24.13.0 / pnpm 11.11.0 preflight
focused Contract / Core / Desktop / Provider tests
对应 harness:r2d-production-* 或 harness:provider-release-admission-*
历史 harness:r2d4 / dfi5.3.4 / dfi5.2.3 / cpc3
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline
lockfile digest / migration max / package export / production consumer scans
```

真实进程测试必须使用 deterministic named barriers，禁止 `sleep` 猜窗口、自动 retry 掩盖偶发、缺失字段当 0、
`?? 0` 或 parent 盲信 child。

## 11. 停手条件

出现任一情况立即停止并回评审：

1. 需要用固定用户、OS 用户、Renderer/Main 自报身份；
2. 需要把 local authority 宣称为 enterprise identity；
3. migration 23 namespace 无法安全承载 local owner，必须新增 migration；
4. 必须 backfill/rebind historical Personal Model；
5. 必须启用 public Personal Model CRUD/Reveal 才能完成本批；
6. Entitlement v2 无法在不改 v1 的前提下进入 Planner；
7. AgentResourceDecision 必须原地改写；
8. production composition 只能使用 scripted/test fixture；
9. Skill/Knowledge 必须补造 ready；
10. Desktop v1alpha4 必须保留 defaultModelId；
11. 必须建立 legacy Runtime Selection 分支；
12. Provider candidate 最强模式无法由现有 sealed projector表达；
13. Tool continuation 需要持久化 private reasoning但安全边界未评审；
14. 只能用公网、真实用户 Secret 或付费调用证明 conformance；
15. production release 只能按显示名/Endpoint/marketing文本猜；
16. 需要修改 DFI-5.3 historical evidence；
17. 需要顺带解锁 DFI-5.4.1、Admin、TGM、Knowledge、Agent Lifecycle；
18. root/Central 失败来自并发窗口且无法安全归因。

## 12. 文档评审问题

1. 是否接受 LDA 以 migration 23 Personal Model owner namespace 为本地 authority 根，并与 enterprise/Desktop
   Preference HMAC domain完全分离？
2. 是否接受 local authority 只证明本地 owner scope，不证明自然人/企业/设备合规？
3. 是否接受 historical enterprise-bound Personal Model 不迁移、不接管？
4. 是否接受 R2D-P.1 新增 Entitlement v2/readable union，但保持 Decision/Runtime/coordination历史版本零漂移？
5. 是否接受 R2D-P.2 只把 agent.general、合法 Personal Model、真实 Document Tool 纳入 production source，
   Skill/Knowledge保持空或 unavailable？
6. 是否接受 Desktop v1alpha4 只完成 R2D production consumption，reasoning固定 default，Max 留给v1alpha5？
7. 是否接受 v1alpha4 删除 defaultModelId，禁止继续作为 Agent authority？
8. 是否接受 PRA 与 R2D-P 独立评审/授权/QA，只共享 LDA？
9. 是否接受 GPT-5.2只作为最短路径候选，未过真实受控 conformance前仍不admitted？
10. 是否接受任何 Provider mapping revision必须独立成批，不能藏进DFI-5.4.x？
11. 是否接受细化后的关键路径9～16日，并且DFI-5.4.1继续GATED到两线都关闭？
12. 是否确认本方案不自动解锁DFI-4A.4 public CRUD、Admin v2、TGM、Knowledge或Agent Lifecycle？

## 13. 当前状态

```text
DFI-5.4 parent plan                    PLAN REVIEW PASS/CLOSED
DFI-5.4.0                             PASS/CLOSED
Scheme A prerequisite plan            PLAN REVIEW PASS/CLOSED
LDA-1 / R2D-P.1                        PASS/CLOSED
R2D-P.2                                PASS/CLOSED
R2D-P.3                                PASS/CLOSED
PRA-1                                  PASS/CLOSED
PRA-2 repair.1 / PRA-2                 PASS/CLOSED
PRA-3                                  PASS/CLOSED
DFI-5.4.1                              PASS/CLOSED
DFI-5.4.2                              PLAN DOCUMENT REVIEW PASS WITH P3 PRECISION NOTES / USER ACCEPTANCE PENDING / CODING GATED
DFI-5.4.3                              GATED
production R2D consumption            false
production Provider release           0
production SubmitTurn Max / Desktop UI 0 / false
production CPC activation             false
production enterprise entitlement     false
DFI-4A.4 public Personal Model UI      GATED
Admin v2 / TGM / Knowledge / Agent Lifecycle GATED
```

文档作者自检：

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
CODING AUTHORIZED = false（DFI-5.4.1 仅进入详细方案评审，仍未获编码授权）
IMPLEMENTATION COMPLETE = true（R2D-P.1～P.3 与 PRA-1～PRA-3）
INDEPENDENT QA PASS = true（R2D-P.1～P.3 与 PRA-1～PRA-3，均已由用户接受）
```

R2D-P.2 与 PRA-2 的细化方案分别见
[R2D-P.2 Production Source / Composition](./R2D-P.2-PRODUCTION-SOURCE-COMPOSITION-DEVELOPMENT-PLAN.md) 与
[PRA-2 Exact Subject-bound Release Materializer](./PRA-2-EXACT-SUBJECT-BOUND-RELEASE-MATERIALIZER-DEVELOPMENT-PLAN.md)。
两份方案独立文档复核、编码、独立 QA / repair.1 聚焦 re-QA 均已由用户接受，R2D-P.2 与 PRA-2 正式
`PASS/CLOSED`。下一阶段详细方案见
[R2D-P.3 Desktop Local v1alpha4 / Production Cutover / E2E](./R2D-P.3-DESKTOP-V1ALPHA4-PRODUCTION-CUTOVER-DEVELOPMENT-PLAN.md)
与 [PRA-3 Provider Lifecycle / Admission Closure](./PRA-3-PROVIDER-LIFECYCLE-ADMISSION-CLOSURE-DEVELOPMENT-PLAN.md)；
两者独立文档复核、编码、独立 QA 与用户接受均已完成，现为 `PASS/CLOSED`。下一阶段详细方案见
[DFI-5.4.1 Max Core Contract / Durable Cutover](./DFI-5.4.1-MAX-CORE-CONTRACT-CUTOVER-DEVELOPMENT-PLAN.md)，
当前仅为 `DOCUMENT REVIEW PENDING / CODING GATED`；方案 A 前置关闭不构成自动编码授权。
