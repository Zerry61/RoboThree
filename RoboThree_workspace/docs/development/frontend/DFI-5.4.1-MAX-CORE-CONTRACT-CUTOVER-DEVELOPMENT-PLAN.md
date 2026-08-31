# DFI-5.4.1 Max Core Contract / Durable Cutover 详细实施方案

> 状态：**PASS/CLOSED**
> 日期：2026-08-28
> 负责人：Codex 5.6
> 父方案：[DFI-5.4 Desktop Max UI / Safe Preview / Production Cutover](./DFI-5.4-DESKTOP-MAX-UI-PRODUCTION-CUTOVER-DEVELOPMENT-PLAN.md)
> 控制前置：[DFI-5.4.0 Contract / Durable Resolution / Production Release Authority](./DFI-5.4.0-CONTRACT-RELEASE-AUTHORITY-PREFLIGHT-CONFIRMATION.md)
> 方案 A 前置：[最小 R2D Production Consumption / Provider Release Admission](./DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md)
> 工程上游：R2D-P.1～P.3、PRA-1～PRA-3、DFI-5.3 均 `PASS/CLOSED`
> 本批性质：Contract / Core durable cutover；不创建 HTTP、Main、Preload、Renderer 或 UI
> 下游：DFI-5.4.2～5.4.3、TGM、Knowledge Provider、Agent Lifecycle、Desktop/Admin v2 consumption 继续 `GATED`
> 实施报告：[DFI-5.4.1 Max Core Contract / Durable Cutover 实施报告](./DFI-5.4.1-MAX-CORE-CONTRACT-CUTOVER-IMPLEMENTATION-REPORT.md)

## 0. 结论先行

方案 A 的两个前置工程线已经关闭，DFI-5.4.1 已获用户单独授权并完成编码与开发者门禁。本批只解决
“Core 能否诚实、原子、可恢复地接受一次 Max 请求”这一件事，没有提前打开 Desktop 用户入口。

本批冻结单一版本链：

```text
Desktop Local v1alpha5
  → ReasoningModeLock v1alpha2
  → TaskRuntimeSelection v1alpha4
  → SubmitTurn coordination v1alpha5
  → existing ModelRequest v1alpha2 / DFI-5.3 mapping
```

禁止建立从 Runtime Selection v1alpha2 / coordination v1alpha3 派生的 legacy Max 分支。历史 v1alpha1～v1alpha4
仍可读、可恢复，但新请求只能走上面的单一新链。

完成本批、开发者门禁、独立 QA 与用户接受后，最高只允许输出：

```text
DFI541_MAX_CORE_CUTOVER_CONFORMANT
```

它只表示新 Contract、Planner、durable acceptance 与 test-only complete composition 一致，不表示 production
Desktop Max 已可用。以下状态在 DFI-5.4.2 / 5.4.3 前必须继续成立：

```text
production DFI-5.4.1 activation       false
production R2D activation             false
production CPC activation             false
production enterprise entitlement     false
production Core private v1alpha5 route 0
production Main/Preload Max API        0
production Desktop Max UI              false
production installed subject release   0
```

## 1. 已关闭事实与当前缺口

### 1.1 必须复用的已关闭事实

1. DFI-5.1 已有安全 Preview、独立 Preference、CAS、durable Receipt 与 migration 26；
2. DFI-5.2 已有四 variant ReasoningModeLock v1alpha1、单一 Planner、Task bundle 原子物化、ModelRequest v1alpha2、
   Compaction binding 与全生命周期 exact lock reuse；
3. DFI-5.3 已有 Local Personal / Enterprise OpenAI-compatible / Anthropic-compatible sealed mapping、body omission、
   exact release-pinned registry 与 120 项阶段账本；
4. R2D-P.3 已完成 Desktop Local v1alpha4 default-only Contract/Core/Main/Preload/Renderer 单线，Receipt 无
   `defaultModelId`，production gate 仍 false；
5. PRA-3 已有唯一 code-owned admitted policy、immutable conformance manifest 与 exact subject-bound admitted
   materializer；“admitted policy 存在”与“production release 已安装”严格分离；
6. R2D-3.3 已有 `accepted → message_appended → task_committed → completed` coordination 与 Task bundle 原子提交；
7. migration 最大 id 为 26，lockfile digest 为
   `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

### 1.2 代码事实证明的新版本确有必要

| 现有层 | 当前事实 | 本批缺口 |
| --- | --- | --- |
| ReasoningModeLock v1alpha1 | 只有 default/applied/unsupported/unknown 四 variant | 无法表达 support drift 与 mapping unavailable fallback |
| Desktop v1alpha4 | `reasoningPreference` 只能是 `default` | 无法提交 Max observation，也无 safe reasoning Receipt |
| Runtime Selection v1alpha3 | 嵌入 Lock v1alpha1 | 无法把最终 best-effort resolution 放进 selection digest |
| coordination v1alpha4 | 绑定 R2D resource plan 与旧 reasoning lock | accepted plan 无法持久证明新 resolution / admission |
| PRA-3 | policy/materializer 可产 exact admitted release | production bootstrap 尚未安装 subject release，registry consumer=0 |
| production composition | R2D/DFI/CPC gates 全 false | 不能把 test fixture 或 half graph 宣称 ready |

## 2. 本批范围、非目标与产物

### 2.1 允许范围

- additive `@robothree/contracts/reasoning-mode/v1alpha2`；
- additive `@robothree/contracts/runtime-selection/v1alpha4`；
- additive `@robothree/contracts/submit-turn-coordination/v1alpha5`；
- additive `@robothree/contracts/desktop-local/v1alpha5`；
- Core-private readable union、single-dispatch、digest helper、v1alpha2 Planner 与 durable acceptance 接线；
- PRA-3 admitted source/materializer 到 test-only release installer/registry composition 的最小接缝；
- code-owned `DFI541_MAX_CORE_DEFAULT_ENABLED=false` 与 complete-graph startup validation；
- Contract/Core focused tests、historical conformance、Harness、Evidence 与治理文档。

### 2.2 明确非目标

- 不新增 Core private HTTP route；
- 不修改 Main IPC、sandboxed Preload、Renderer 或 Desktop 页面；
- 不打开 production R2D / CPC / enterprise entitlement；
- 不修改 Provider body、mapping variant、timeout 数值或 DFI-5.3 historical evidence；
- 不实现 Enterprise production identity/release；
- 不实现 TGM、Knowledge Provider、Agent Lifecycle、Admin v2 或 mutation；
- 不新增 migration、依赖，不修改 `pnpm-lock.yaml`；
- 不使用 Mock、Fixture、LocalStorage 或 Renderer 自报冒充 production authority。

## 3. G1：四层 additive Contract 单线

### 3.1 ReasoningModeLock v1alpha2

v1alpha2 复制并逐字保留 v1alpha1 四个 strict variant 的语义，新增两个 strict variant：

```text
max_support_changed_default
max_mapping_unavailable_default
```

六 variant 统一包含：

```text
schemaVersion = v1alpha2
reasoningModeLockId
taskId
modelLockRef { lockId, lockDigest }
requestedMode
lockedAt
reasoningModeLockDigest
```

两个新 fallback 必须额外保存：

```text
observedMaxSupport = supported
observedMaxSupportRevision
resolutionEvidenceRevision
resolutionEvidenceDigest
```

`max_support_changed_default` 再保存 accept 时 content-free 的：

```text
resolvedMaxSupport = supported | unsupported | unknown
resolvedMaxSupportRevision
```

`max_mapping_unavailable_default` 只表示 exact admission 在 durable accept 前安全不可用，不携带 Profile、Strategy、
timeout 或 mapping ref。只有 `max_applied` 可以携带 exact `profileRef` 与 `strategyRef`。任何 fallback 都不得伪造
“曾应用 Max”。

`resolutionEvidenceDigest` 使用独立 domain：

```text
robothree.reasoning-mode-resolution-evidence.v1\n
```

其 canonical material 只含 Task/Model lock identity、原 observation、accept-time safe resolution state 与 evidence
revision；不含 raw effort/thinking/budget、Endpoint、Credential 或 private mapping material。

### 3.2 Runtime Selection v1alpha4

`TaskRuntimeSelectionV1Alpha4` 必须从 v1alpha3 的字段集合 additive 演进，只把 `reasoningModeLock` 升级为
v1alpha2；Agent、Entitlement、Decision、Model/Skill/Tool/Knowledge、Authorization、Instruction Binding 等 R2D
事实不降级、不复制。

不允许把 Runtime Selection v1alpha2 作为新版本父结构。v1alpha4 的 `selectionDigest` 必须覆盖完整 v1alpha2 lock，
包括两个 fallback 的 resolution evidence。Reasoning lock ID 继续不能进入 capability lock IDs。

### 3.3 coordination v1alpha5

v1alpha5 从 coordination v1alpha4 additive 演进，继续复用：

```text
accepted → message_appended → task_committed → completed
```

不得建立第二套 coordination。其 durable plan 必须 exact 绑定：

- SubmitTurn v1alpha5 request digest；
- Entitlement Snapshot / Agent Resource Decision；
- Runtime Selection v1alpha4 digest；
- ReasoningModeLock v1alpha2 ID/digest；
- Task Instruction Binding；
- Authorization / Execution / Task bundle digests；
- `resolutionEvidenceRevision/digest`；
- `max_applied` 时的 safe admission envelope identity/materialization digest；
- `mapping_unavailable_default` 时的 content-free unavailable evidence；
- 原 commandId、Task ID、Message ID、Receipt identity 与 durable deadline。

accepted 后不得重新读取 current Preference、Profile、admission policy、manifest、Personal Model head、Registry 或
mapping source来改变 resolution。

### 3.4 Desktop Local v1alpha5

v1alpha5 从 v1alpha4 的 R2D selection/Receipt 形状 additive 演进，并恢复 v1alpha3 已有的 reasoning observation：

```text
reasoningPreference =
  { requestedMode: default }
  | {
      requestedMode: max,
      observedMaxSupport: supported | unsupported | unknown,
      observedMaxSupportRevision
    }
```

Receipt 的 safe summary 固定为：

```text
requestedMode = default | max
resolvedMode = model_default | max
resolutionReason =
  requested_default
  | applied
  | unsupported
  | capability_unknown
  | support_changed_default
  | mapping_unavailable_default
reasoningModeLockId
reasoningModeLockDigest
reasoningResolutionRevision
reasoningResolutionDigest
```

Receipt 不暴露 Profile/Strategy/mapping/timeout/raw parameter，不恢复 `defaultModelId`。它只从 durable lock/selection
投影，不重新计算 current 状态。Receipt 的 `reasoningResolutionRevision/reasoningResolutionDigest` 是
ReasoningModeLock / coordination 中 `resolutionEvidenceRevision/resolutionEvidenceDigest` 的 safe 投影名；跨层映射
必须强制 `reasoningResolutionRevision === resolutionEvidenceRevision` 且
`reasoningResolutionDigest === resolutionEvidenceDigest`，禁止生成第二份同义 evidence。

### 3.5 package export 与历史冻结

- 四个新版本都使用 exact subpath；
- Contracts root、旧 package root 与既有导出名继续指向原版本；
- v1alpha1～v1alpha4 source hash、built declaration、fixtures、historical Harness/evidence 全部冻结；
- readable union 只在 Core-private 调用点使用；
- 读取 `schemaVersion` 一次后 single-dispatch；损坏的新版本不得 fallback 旧版本。

## 4. G2：best-effort Planner 真值表

### 4.1 单一 v1alpha2 Planner

新增 `ReasoningModeLockPlannerV1Alpha2`（或现有 Planner 的显式 versioned sibling），作为 v1alpha5 acceptance 的
唯一真值表实现。旧 `ReasoningModeLockPlanner` 保留给历史 v1alpha3 语义，禁止原地改 stale 行为。

新 Planner 不写库、不 append Message、不创建 Task、不调 Provider、不解析 raw body。它只产生 validated
ReasoningModeLock v1alpha2 或 typed failure。

### 4.2 固定真值表

| 请求 | accept-time 可信事实 | Planner 结果 | Task 副作用 |
| --- | --- | --- | --- |
| default | 任意 | `default_passthrough` | 后续正常创建 |
| max / observed supported | exact Profile + admitted materialization 均通过 | `max_applied` | 后续正常创建 |
| max / observed unsupported | revision 一致 | `max_unsupported_default` | 后续正常创建 |
| max / observed unknown | revision 一致 | `max_capability_unknown_default` | 后续正常创建 |
| max / observed supported | support/revision 已变化，Model 仍合法 | `max_support_changed_default` | 同一 command/Task 正常创建 |
| max / observed supported | Profile仍 exact，但 policy/release安全不可用 | `max_mapping_unavailable_default` | 同一 command/Task 正常创建 |
| 任意 | Model/Agent/Entitlement/Workspace/Auth不合法 | 既有 typed reject | 0 |
| max | Profile/record/digest/manifest/identity损坏 | typed fail-closed | 0 |
| max | Credential observation/Endpoint/model snapshot不一致 | typed fail-closed | 0 |

### 4.3 load count 与线性化点

- default：Profile、admission source、materializer、release registry load 全 0；
- max first acceptance：exact subject 解析 1 次、Profile `loadExact` 1 次、admission lookup/materialize 最多 1 次；
- accepted/message_appended/task_committed/completed recovery：上述 current authority load 全 0；
- terminal replay：Planner、Profile、admission、Provider、Usage 新调用全 0；
- 不允许“先 current support、后 current mapping”跨 lease 拼接；单次 captured acceptance lease 是线性化边界。

### 4.4 safe fallback 与 fail-closed 的精确分界

PRA materializer error 只允许如下分类：

| cause | 处理 |
| --- | --- |
| `provider_release.policy_unavailable` | `max_mapping_unavailable_default` |
| `provider_release.policy_not_admitted` | `max_mapping_unavailable_default` |
| `conformance_manifest_invalid` | typed fail-closed |
| `local_authority_invalid` / `subject_invalid` | typed fail-closed |
| `credential_observation_invalid` | typed fail-closed |
| `endpoint_mismatch` / `model_snapshot_mismatch` | typed fail-closed |
| `identity_mismatch` / `materialization_conflict` | typed fail-closed |

fallback allowlist 穷举且只有：

```text
provider_release.policy_unavailable
provider_release.policy_not_admitted
```

PRA materializer 当前共 10 个 typed cause；除上述 2 个外，其余 8 个必须 typed fail-closed。仅“可信地证明没有可用
admission”属于 Max-only fallback；无法证明身份或完整性的情况不能降级掩盖。

## 5. G3：release installer / registry 与 secret 边界

### 5.1 两层事实不可混用

```text
PRA-3 code-owned admitted policy + immutable manifest
  → exact subject-bound materializer
  → private ProviderReasoningMappingRelease
  → release-pinned registry
  → safe admission envelope identity
```

公共/持久 safe 面只能保存 policy/profile/strategy/mapping/materialization/manifest 的 digest refs。private release 仅
进入 Provider-private registry，不进入 Desktop Contract、Task Receipt、日志、Evidence 或 UI。

### 5.2 production 默认关闭时的安装语义

本批新增 installer/composition 接缝，但 `DFI541_MAX_CORE_DEFAULT_ENABLED=false` 时：

- 不读取用户 Credential secret；
- 不安装 production subject release；
- production registry consumer count=0；
- 不注册 route、不 advertise feature；
- R2D-P.3 default-only production path保持原状。

test-only complete graph 可以使用受控 immutable Personal Model/credential observation fixture 证明 exact
materialization 与 registry 唯一安装，但 Evidence 必须明确 `testIdentityUsed=true`、`productionReleaseInstalled=false`。

### 5.3 Secret 与网络零副作用

在 Planner / admission / digest / identity 任一失败时，下列计数必须全 0：

```text
credentialSecretResolution
dnsLookup
socketOpen
tlsHandshake
httpBodyWrite
gatewayDispatch
modelInvocationLinkPrepare
usageProjection
providerInvocation
agentLoopStart
```

safe Credential observation 可参与 identity proof，但不得包含 Secret、Authorization header 或可逆 Credential
reference。

## 6. G4：原子 acceptance 与恢复

### 6.1 固定顺序

首次 v1alpha5 SubmitTurn 固定为：

1. strict parse + client/connection lease 校验；
2. durable command replay 检查；
3. 捕获单次 acceptance authority lease；
4. R2D Agent/Entitlement/Registry/Preference/Tool policy 规划；
5. Reasoning v1alpha2 Planner 生成最终 lock；
6. 物化 Runtime Selection v1alpha4、Authorization、Instruction Binding 与 Task bundle；
7. 创建 coordination v1alpha5 accepted plan；
8. append Message；
9. 同一 Task bundle transaction 提交 Task/locks/selection/authorization/binding；
10. transition `task_committed`；
11. 只有此后才允许 Agent Loop / Provider path；
12. complete 与 Receipt replay。

步骤 1～7 任一失败，Message/coordination/Task/locks/Receipt/Loop/Provider 全 0。accepted 后恢复只读 durable plan，
不得回到步骤 3～5重新规划。

### 6.2 bundle 原子内容

同一 transaction / InMemory staged single-swap 必须同时提交：

- Task；
- Model/Tool capability locks；
- ReasoningModeLock v1alpha2；
- Runtime Selection v1alpha4；
- Authorization / Execution selection；
- Task Instruction Binding；
- exact safe admission evidence 或 fallback evidence；
- Task/selection/authorization/binding receipts。

无法用现有 `record_json` / readable union 原子承载时立即停手回评审；不得新增 migration 27 或第二张 shadow 表。

### 6.3 crash / replay 语义

| 窗口 | 恢复结果 |
| --- | --- |
| accepted 前 | 无 durable winner，可重新执行首次规划 |
| accepted 后、Message 前 | 复用 exact plan，不读 current authority |
| message_appended 后、bundle 前 | 同一 Message + exact plan，原子提交一次 |
| bundle 后、task_committed 前 | strict reload 同一 bundle，再推进 barrier |
| task_committed 后、Loop 前 | 同 lock/deadline启动一次 Loop |
| response loss | 同 commandId replay exact Receipt |
| terminal replay | 直接返回 terminal Receipt，所有上游新增计数为0 |

response loss/restart/replay 不重新选择 Agent、Model、Skill、Tool、Knowledge、reasoning resolution 或 Provider
release。Tool 后续轮与 Compaction 继续复用同一 lock、request digest 与 durable deadline。

## 7. G5：composition 与 activation gate

### 7.1 code-owned 三态

引入：

```text
DFI541_MAX_CORE_DEFAULT_ENABLED = false
```

禁止 env、CLI、Renderer、Main、Admin、Preference 或远端配置直接控制。

| 状态 | 必须结果 |
| --- | --- |
| code-owned false | v1alpha4 default-only path零漂移；v1alpha5 production consumer/route/feature=0 |
| true + graph 缺失/重复/损坏 | bootstrap ready 前 fail-fast；不得半装配 |
| test-only true + complete graph | 允许 Core harness 调 v1alpha5 internal facade；仍无 production route/UI |

### 7.2 complete graph

complete graph 至少包含：

- R2D-P.2唯一 production entitlement source与 Local Desktop subject authority；
- R2D-P.3 v1alpha4 default cutover；
- Reasoning Preview / Preference；
- v1alpha2 Planner与 subject resolver；
- coordination v1alpha5 + Task bundle persistence；
- PRA-3 admitted policy/manifest/materializer；
- release installer/private registry；
- DFI-5.3 Local mapping + durable Provider wrapper；
- migration 25 exact deadline与 migration 26 Preference；
- historical readable union与single-dispatch validators。

缺一项都不能投影 `max_reasoning_mode` ready。本批没有 HTTP/IPC surface，因此即使 test-only complete graph
通过，Desktop feature仍不可达。

## 8. 兼容、digest 与安全边界

### 8.1 historical compatibility

- v1alpha1～v1alpha4 Task/coordination/request按原版本恢复；
- v1alpha4 default-only生产请求不升级、不 backfill v1alpha5；
- v1alpha3 stale语义保持不变；
- 历史 `max_applied` lock不补造新 resolution evidence；
- v1alpha5损坏记录不得 fallback v1alpha4；
- terminal historical replay不触发新 Planner或release materializer。

### 8.2 digest 规则

- Lock v1alpha2 digest覆盖完整 material；
- resolution evidence使用独立 domain；
- Runtime Selection v1alpha4 digest覆盖 exact lock；
- coordination v1alpha5 record digest覆盖 accepted plan；
- Task bundle digest覆盖 selection/authorization/binding/lock/admission safe refs；
- Receipt digest/identity必须能从 durable facts重建并与原值相等；
- 不把 mapping digest拼接进旧 digest字符串，不修改历史 helper。

### 8.3 公共面禁止内容

Contracts root、Desktop v1alpha5、Receipt、Task projection、日志、stdout/stderr/Evidence/failure JSON 不得出现：

- `reasoning_effort`、`thinking`、`budget_tokens`、raw JSON patch；
- Endpoint、Authorization、Cookie、Secret、Credential reference；
- private Provider model id、Profile material、Strategy raw value；
- reasoning/thinking private output或signature；
- owner HMAC key、namespace key、transport token或stack。

## 9. Threat Model

| 威胁 | 控制 |
| --- | --- |
| Renderer伪造supported | Core exact Profile/admission重新验证 |
| support drift被误报unsupported | 独立 `support_changed_default` variant |
| mapping缺失被误报unknown | 独立 `mapping_unavailable_default` variant |
| integrity损坏被fallback掩盖 | 明确 fail-closed 分类 |
| current policy替换历史release | durable exact plan + no current reread |
| fallback携带Profile/timeout伪事实 | strict union禁止字段 |
| raw mapping进入Receipt/UI | safe/private双面+boundary scan |
| test fixture冒充production | testIdentity/productionInstalled双断言 |
| gate被env或Renderer打开 | code-owned literal + source scan |
| 新版本损坏回退旧版本 | single-dispatch/no fallback |
| crash产生双Task/双Message |既有 coordination + command winner + atomic bundle |
| task_committed前发上游请求 | 十类zero-side-effect barrier |
| retry/restart重新获得deadline | migration25 exact deadline复用 |
| Agent/Model/资源在恢复时重选 | accepted plan authority read=0 |
| reasoning private output泄漏 | 既有 progress-only classifier + 80次负向扫描 |

## 10. 文件边界

### 10.1 编码获授权后允许

- `packages/contracts/src/reasoning-mode/v1alpha2/**`；
- `packages/contracts/src/runtime-selection/v1alpha4/**`；
- `packages/contracts/src/submit-turn-coordination/v1alpha5/**`；
- `packages/contracts/src/desktop-local/v1alpha5/**`；
- `packages/contracts/package.json` 的 exact subpath exports与对应 Contract tests；
- `services/core/src/application/**` 中 versioned Planner、acceptance、readable union、release composition与gate；
- `services/core/src/persistence/**`、`ports/**` 的additive readable/atomic接口（不得改写旧语义）；
- focused tests、Harness、Evidence、版本与治理文档。

### 10.2 明确禁止

- `apps/desktop/src/main/**`、`preload/**`、`renderer/**`；
- Core private HTTP routes与Desktop API；
- Admin/Central production接线；
- Provider body/projector/mapping variant修改；
- v1alpha1～v1alpha4 source原地修改；
- migration27、依赖或lockfile变化；
- TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 CRUD；
- production gate设为true或production release安装；
- 修改DFI-5.3/R2D/PRA historical Evidence。

## 11. QA 矩阵（96项）

### 11.1 Contract与版本（QA-001～QA-020）

1. QA-001：Lock v1alpha2 default strict valid。
2. QA-002：Lock v1alpha2 max_applied strict valid。
3. QA-003：Lock v1alpha2 unsupported strict valid。
4. QA-004：Lock v1alpha2 unknown strict valid。
5. QA-005：support_changed strict valid并保留supported observation。
6. QA-006：mapping_unavailable strict valid并保留supported observation。
7. QA-007：两个新fallback都禁Profile/Strategy/timeout/mapping ref。
8. QA-008：resolution evidence revision/digest exact配对。
9. QA-009：Lock v1alpha2 digest tamper拒绝。
10. QA-010：Runtime Selection v1alpha4 exact绑定Lock v1alpha2。
11. QA-011：Runtime Selection v1alpha4 digest覆盖fallback evidence。
12. QA-012：reasoning lock ID不进入capability lock IDs。
13. QA-013：coordination v1alpha5 exact绑定selection/lock/evidence。
14. QA-014：coordination状态机仍为四阶段。
15. QA-015：Desktop v1alpha5 default strict valid且禁observed字段。
16. QA-016：Desktop v1alpha5 max必带exact observation。
17. QA-017：Receipt六种reason与resolvedMode真值一致，且reasoningResolution evidence exact等于durable evidence。
18. QA-018：Receipt不含defaultModelId/raw refs。
19. QA-019：四个exact package subpath构建后可import。
20. QA-020：Contracts root与旧root export零漂移。

### 11.2 Planner与admission（QA-021～QA-040）

21. QA-021：default Profile/admission/materializer/registry load全0。
22. QA-022：max supported Profile load恰1次。
23. QA-023：max admitted materializer恰1次。
24. QA-024：max exact成功产max_applied。
25. QA-025：unsupported产unsupported default。
26. QA-026：unknown产capability unknown default。
27. QA-027：support漂移产support_changed default。
28. QA-028：policy_unavailable产mapping_unavailable default。
29. QA-029：policy_not_admitted产mapping_unavailable default。
30. QA-030：manifest invalid typed fail-closed。
31. QA-031：authority/subject invalid typed fail-closed。
32. QA-032：credential observation invalid typed fail-closed。
33. QA-033：endpoint/model snapshot mismatch typed fail-closed。
34. QA-034：identity/materialization conflict typed fail-closed。
35. QA-035：Model/Agent/Entitlement失败不伪装fallback。
36. QA-036：单次captured lease内完成support/admission判断。
37. QA-037：admitted policy与installed release计数分层。
38. QA-038：private release不进入safe envelope。
39. QA-039：Planner不写库、不调Provider、不创建Task。
40. QA-040：旧v1alpha1 Planner stale语义零漂移。

### 11.3 Durable acceptance与恢复（QA-041～QA-060）

41. QA-041：首次authority规定读取次数逐项等于1。
42. QA-042：Planner失败时十类durable/上游副作用全0。
43. QA-043：accepted前失败Message/Task/Receipt全0。
44. QA-044：accepted plan保存原observation与final resolution。
45. QA-045：accepted plan保存exact Model lock与deadline。
46. QA-046：Task bundle transaction含Lock v1alpha2。
47. QA-047：Task bundle transaction含Selection v1alpha4。
48. QA-048：Task bundle transaction含Authorization/Binding。
49. QA-049：Task bundle transaction含safe admission/fallback evidence。
50. QA-050：SQLite rollback无partial rows。
51. QA-051：InMemory staged write只做single swap。
52. QA-052：accepted恢复current authority read=0。
53. QA-053：message_appended恢复current authority read=0。
54. QA-054：task_committed恢复current authority read=0。
55. QA-055：response loss replay同一command/Task/Message/Receipt。
56. QA-056：terminal replay Planner/Profile/admission/upstream/Usage=0。
57. QA-057：Tool后续轮复用同一lock/request mode。
58. QA-058：Compaction复用同一lock/request mode。
59. QA-059：restart复用migration25 exact deadline。
60. QA-060：损坏v1alpha5 record不fallback旧版本。

### 11.4 Composition、gate与兼容（QA-061～QA-076）

61. QA-061：DFI541 gate code-owned default false。
62. QA-062：env/CLI/Renderer/Main不能打开gate。
63. QA-063：gate false v1alpha5 production consumer=0。
64. QA-064：gate false production installed release=0。
65. QA-065：gate false route/IPC/Preload/UI=0。
66. QA-066：gate true缺依赖bootstrap fail-fast。
67. QA-067：duplicate release/registry entry fail-fast。
68. QA-068：test-only complete graph内部v1alpha5可达。
69. QA-069：test-only complete graph仍不advertise Desktop feature。
70. QA-070：v1alpha4 default-only path行为零漂移。
71. QA-071：v1alpha1～v1alpha4 source hash零漂移。
72. QA-072：historical request按原schema single-dispatch。
73. QA-073：historical terminal replay不触发新materializer。
74. QA-074：DFI-5.3 historical evidence digest不漂移。
75. QA-075：R2D-P/PRA historical evidence digest不漂移。
76. QA-076：migration止26且lockfile digest不变。

### 11.5 安全、边界与阶段门禁（QA-077～QA-096）

77. QA-077：public Contract raw mapping leak count=0。
78. QA-078：Desktop safe Receipt Secret/Endpoint/Credential count=0。
79. QA-079：日志/Evidence/failure private field count=0。
80. QA-080：reasoning private output不进入Message/Receipt。
81. QA-081：5 canary×4 encoding×4 channel=80次均检出。
82. QA-082：正常四通道canary命中0。
83. QA-083：十类pre-barrier副作用来自真实diagnostics且全0。
84. QA-084：资源计数来自真实snapshot，禁`?? 0`/硬编码0。
85. QA-085：focused tests无`.skip/.only/@Disabled/sleep`。
86. QA-086：不自动retry或创建第二个Task。
87. QA-087：apps/desktop生产代码变更数=0。
88. QA-088：Central/Admin/Document Worker变更数=0。
89. QA-089：Provider body/projector变更数=0。
90. QA-090：production CPC activation=false。
91. QA-091：production R2D activation=false。
92. QA-092：production enterprise entitlement=false。
93. QA-093：DFI-5.4.2/5.4.3 consumer/unlock=false。
94. QA-094：TGM/Knowledge/Agent Lifecycle/Admin v2继续GATED。
95. QA-095：Evidence outcome仅`DFI541_MAX_CORE_CUTOVER_CONFORMANT`。
96. QA-096：Evidence不包含production-ready/Desktop-ready声明。

## 12. 正式门禁

编码完成后至少执行：

```bash
CI=true VITEST_MAX_WORKERS=1 pnpm run harness:dfi5.4.1
CI=true VITEST_MAX_WORKERS=1 pnpm run harness:r2dp3
CI=true VITEST_MAX_WORKERS=1 pnpm run harness:pra3
CI=true VITEST_MAX_WORKERS=1 pnpm run harness:dfi5.3.4
CI=true VITEST_MAX_WORKERS=1 pnpm run harness:r2d4
CI=true pnpm run typecheck
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check
```

要求：

- Node必须为`.node-version`声明版本；
- historical Harness只读回归，不覆盖历史Evidence；
- Central即使本批不改Java也必须online/offline双跑；
- root check失败不得用自动retry掩盖；需区分真实缺陷与环境/并发问题并落盘；
- lockfile digest、migration max与package export必须由Harness运行时读取，不接受文档常量自证。

## 13. 实施步骤与工期

| 步骤 | 内容 | 估算 |
| --- | --- | --- |
| Step 1 | 四层additive Contract、exact subpath、digest与historical conformance | 1～2日 |
| Step 2 | v1alpha2 Planner、resolution evidence、PRA-3 admission分类 | 1～2日 |
| Step 3 | coordination v1alpha5、Task bundle atomic commit、recovery | 1～2日 |
| Step 4 | default-false composition/gate、Harness/Evidence/全量回归 | 1日 |

合计 **4～7个集中工程日**。该估算不含DFI-5.4.2的HTTP/Main/Preload，也不含DFI-5.4.3的Renderer/E2E/UI。

## 14. 停手条件

出现任一项立即停止并回评审：

1. 需要原地修改v1alpha1～v1alpha4 Contract或historical digest；
2. 需要建立legacy Runtime Selection/coordination Max分支；
3. 只扩Receipt而durable lock/selection/coordination无法同步升级；
4. fallback必须携带Profile/Strategy/timeout/raw mapping才能表达；
5. 需要把integrity/identity/Credential/Endpoint错误降级为default；
6. 现有record_json无法原子承载v1alpha5 plan；
7. 需要migration27、新依赖或lockfile变化；
8. 需要修改Provider body/projector/mapping variant；
9. 需要真实用户Secret、公网或付费Provider完成基本conformance；
10. 需要打开production R2D/CPC/enterprise entitlement；
11. 需要新增Core HTTP/Main/Preload/Renderer接线；
12. gate只能通过env/CLI/Renderer控制；
13. production installed release仍为0却要求advertise Max；
14. accepted恢复必须读取current Profile/policy/mapping才能继续；
15. task_committed前无法证明十类上游副作用为0；
16. raw mapping/Secret/Endpoint进入公共Contract、Receipt、日志或Evidence；
17. 需要顺带解锁TGM、Knowledge Provider、Agent Lifecycle或Admin v2；
18. root check因共享窗口漂移且无法安全归因。
19. 任何不属于`policy_unavailable | policy_not_admitted`的PRA typed cause被尝试降级为fallback。

## 15. 独立评审问题

1. 是否接受v1alpha5/Lock v1alpha2/Selection v1alpha4/coordination v1alpha5作为唯一新链？
2. 是否接受两个新fallback都保存原supported observation与content-free resolution evidence？
3. 是否接受只有max_applied可携带Profile/Strategy/timeout refs？
4. 是否接受policy_unavailable/policy_not_admitted可fallback，其他PRA错误全部fail-closed？
5. 是否接受default路径Profile/admission/materializer/registry load全0？
6. 是否接受accepted后recovery完全不读取current authority？
7. 是否接受PRA-3 admitted policy与production installed release继续分层？
8. 是否接受本批test-only complete graph可达，但production route/API/UI仍为0？
9. 是否接受不新增migration27并复用既有atomic bundle transaction？
10. 是否接受96项矩阵与historical Harness作为本批关闭门禁？
11. 是否接受4～7日估算，不把DFI-5.4.2/5.4.3藏入本批？
12. 是否确认本文件评审通过后仍需用户单独授权编码？

## 16. 当前状态

```text
DFI-5.4 parent plan                  PLAN REVIEW PASS/CLOSED
DFI-5.4.0                           PASS/CLOSED
Scheme A prerequisite plan          PASS/CLOSED
R2D-P.1～P.3                         PASS/CLOSED
PRA-1～PRA-3                         PASS/CLOSED
DFI-5.4.1                           PASS/CLOSED
DFI-5.4.2～DFI-5.4.3                 GATED
production DFI541 activation        false
production R2D activation           false
production CPC activation           false
production enterprise entitlement   false
production installed subject release 0
production v1alpha5 route/API/UI     0 / 0 / false
TGM / Knowledge / Agent Lifecycle   GATED
Desktop/Admin v2 consumption        GATED
```

本方案独立文档复核、编码、独立 QA 与用户接受均已完成，DFI-5.4.1 正式 `PASS/CLOSED`。该关闭不自动授权
DFI-5.4.2 编码，也不改变 production gate、route/API/UI/installed release 继续为 false/0 的边界。
