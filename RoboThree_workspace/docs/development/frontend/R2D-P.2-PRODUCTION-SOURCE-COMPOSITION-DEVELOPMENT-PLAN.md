# R2D-P.2 Production Source / Composition 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED；IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 日期：2026-08-28  
> 负责人：Codex 5.6  
> 父计划：[DFI-5.4 方案 A 前置详细计划](./DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md) `PASS/CLOSED`  
> 上游：LDA-1 / R2D-P.1 `PASS/CLOSED`  
> 本批最高允许输出：`R2DP2_PRODUCTION_SOURCE_COMPOSITION_CONFORMANT`  
> 并行批：PRA-2 repair.1 与 PRA-2 `PASS/CLOSED`  
> 下游：R2D-P.3、PRA-3 已进入文档评审，仍 `CODING GATED`；DFI-5.4.1～5.4.3 及其他下游继续 `GATED`

## 0. 结论先行

R2D-P.2 的目标不是把 `R2D3_CORE_DELTA_DEFAULT_ENABLED` 改成 `true`，而是把 R2D-3 已验收的
Planner、Task bundle 与 recovery 接到一张**完整、可信且默认不可达的 production composition graph**。

本批只关闭以下缺口：

1. 为 `TaskResourceEntitlementSource` 提供唯一 production 实现；
2. 以 LDA-1 `local_desktop_owner` 为唯一 local authority，读取真实 Personal Model、Registry、Workspace/Auth 与
   Tool Policy 事实；
3. 为 `R2D3AcceptanceAuthority` 提供 production 装配，不再依赖 tests/support adapter；
4. 将 code-owned `agent.general`、Personal Model exact lock、真实 Document Tool 与既有 R2D durable planner
   组合成一张可验证 graph；
5. 实现 `false / true-but-incomplete / test-only-complete` 三态启动门，但 production 默认仍为 `false`；
6. 保持 Skill、Knowledge 与 historical enterprise-owned Personal Model 的诚实不可用边界。

本批完成后，production 新 SubmitTurn 仍不会进入 R2D：R2D-P.3 尚未提供 Desktop v1alpha4 cutover，且
code-owned gate 继续为 `false`。因此本批不得宣称 Desktop v2 consumption 或 production ready。

另一个必须提前写死的事实是：现存 enterprise-bound Personal Model 不能被 LDA 自动接管。若当前数据库没有
local-owned Personal Model definition，production source 必须合法返回空 Model entitlement；不得 backfill、rebind、
创建 Fixture Model 或把 enterprise record 当作 local record。R2D-P.2 可以证明 source/composition 正确，但不能
伪造“已有可运行本地模型”。

## 1. 已关闭事实与真实缺口

### 1.1 必须复用的既有事实

1. R2D-3.3 已冻结 `accepted → message_appended → task_committed → completed`、Task bundle 原子提交与
   Provider 前 `task_committed` barrier；
2. `R2D3DurableAcceptancePlanner` 已按 Agent → subject → entitlement → Registry → Workspace/Auth → Preference →
   Tool Policy → Decision → locks → Reasoning → selection → authorization 的顺序读取首次接受事实；
3. R2D-P.1 已提供 LDA-1、Entitlement v2/readable union 与 Planner 单次 normalize；
4. code-owned `BuiltInGeneralAgentSource` 已冻结 `agent.general` exact v1alpha2 material；
5. `PersonalModelPersistence` 已提供 namespace、active heads、definition、status 与 preference 的 bounded read；
6. `PersonalCredentialStore.inspect()`、`PersonalModelProviderProfileRegistry` 与
   `PersonalModelTaskLockMaterializer` 已提供 Credential observation、Profile 与 exact lock 基础；
7. Registry 中的 Document Tool 已具备真实 definition/binding/adapter，TGM 未完成不应抹去该既有 Tool；
8. Runtime Selection v1alpha3、coordination v1alpha4、AgentResourceDecision v1 均保持原 schema，不新增 migration。

### 1.2 当前 production 缺口

| 缺口 | 当前代码事实 | R2D-P.2 关闭方式 |
| --- | --- | --- |
| Entitlement source | production implementation count = 0 | 新增唯一 local production source |
| Acceptance authority | 仅 tests/support 完整实现 | 新增 local production adapter/composition |
| Subject binding | Port 只有两个 digest，不能信任任意字符串 | 由同一 session authority capture 后以 typed proof 交给 source |
| Personal Model enumeration | 既有统一目录强制 enterprise configure authority | 新建 use-only local reader，不扩宽 CRUD authority |
| Snapshot consistency | 多次 persistence read 可能跨 revision | captured lease + 末尾 exact revalidation，漂移失败关闭 |
| Stable ordering | Renderer 不应决定 | Core 以 `updatedAt + personalModelId` 顺序冻结 stable ordinal |
| Fixture bootstrap | 当前 Desktop runtime 含 scripted fixture | production R2D graph 不得消费 fixture；legacy gate=false 保持零漂移 |
| Skill/Knowledge | 无可信 production runtime | entitlement 空；显式请求由 Planner typed reject/unavailable |

## 2. 范围与明确不做

### 2.1 本批允许

- `LocalDesktopTaskResourceEntitlementSource` production implementation；
- local use-only Personal Model candidate reader；
- production `R2D3AcceptanceAuthority` adapter 与 composition factory；
- code-owned graph completeness validator 与三态 startup gate；
- Personal Model/Tool exact candidate、stable ordinal、preference 与 lock materialization；
- InMemory/SQLite 等价 conformance、focused Harness、Evidence 与治理文档。

### 2.2 本批禁止

- 不修改 Desktop Contract、Main、Preload、Renderer；
- 不注册 Desktop v1alpha4 route，不打开 production R2D gate；
- 不新增或修改 migration，不 backfill/rebind Personal Model；
- 不开放 Personal Model configure/reveal/delete；
- 不修改 `PersonalModelOwnerAuthority` 的 enterprise CRUD 语义；
- 不实现 Skill Runtime、Knowledge Provider、TGM、Agent Lifecycle；
- 不安装 Provider release，不修改 DFI-5.3 private mapping；
- 不使用 Fixture Agent、scripted Model、固定用户、OS 用户名或 Renderer 自报身份；
- 不新增依赖，不修改 `pnpm-lock.yaml`；
- 不修改 CPC activation、production enterprise identity/entitlement 或 DFI-5.4.x。

## 3. 冻结架构决策

### 3.1 单一 use-only local authority

新增 local reader 必须消费 LDA-1 已验证的：

```text
authorityKind = local_desktop_owner
ownerScopeNamespaceRevision
ownerScopeDigest
authorityRevision
identityEvidence = local true / enterprise false / test false
```

它只授权 `personal_model.use` 与 task-resource entitlement。不得把
`PersonalModelOwnerAuthority.entitlement="personal_model.configure"` 改成 union，也不得借用 enterprise resolver。

首次加载固定为：

```text
load active namespace once
  -> derive + validate local authority once
  -> bind captured runtime/client subject proof
  -> enumerate only exact local owner heads
  -> load exact definition/status/profile/credential observation
  -> revalidate namespace + head/query revision before return
```

authority、namespace、head 或 query revision 在一次 load 中发生漂移，返回 typed
`selection.entitlement_stale`；不得混合两个 snapshot。

### 3.2 Subject binding proof 不信任裸 digest

现有 `TaskResourceEntitlementLoadInput` 的两个 digest 只是传输字段，不自动构成 authority。production
composition 必须由同一个 `LocalDesktopR2DSubjectBindingAuthority` 完成：

1. 从已建立的 Core session 验证 `desktopSessionId ↔ internalSessionId ↔ client binding`；
2. 生成 content-free `LocalDesktopR2DSubjectBindingProofV1`；
3. `R2D3AcceptanceAuthority.captureSubjectBindings()` 返回 proof 中的两个 digest；
4. Entitlement source 从 request-scoped proof registry 取回并验证 exact proof；
5. proof 单次消费或在同一 first-accept scope 内只读复用，跨 session/client/task 不可重放；
6. proof 不持久化 Secret、OS account、Keychain identifier 或 raw session token。

若既有 session graph 无法证明这两个 digest 来自同一 accepted client/runtime，立即停手回评审；不得以
`sha256(sessionId)` 或固定 digest 代替。

### 3.3 Personal Model entitlement 读取与一致性

每个 active head 依次验证：

1. owner identity 与 LDA exact 一致；
2. `selectionState="active"`；
3. head 的 configuration/execution digest 与 exact definition 一致；
4. status 与 definition 的 owner、configuration、execution digest 一致；
5. Provider Profile exact revision 可解析；
6. Credential observation 为 `present`，且 revision/binding digest exact；
7. capability 至少含 text，Model id 满足 `model.*`；
8. source 返回前重读 head，record digest 与首次读取一致。

单个 candidate 的 Profile、Credential 或 status 不可用时，该 candidate 不进入 entitlement，并生成固定安全原因的
content-free diagnostic；namespace、query revision、owner 或 record integrity 损坏则整次 load typed fail-closed。
不得把“当前无可用模型”改写成 Fixture 成功。

### 3.4 Stable ordinal 与 preference

- Model ordinal 以 persistence 已冻结的 `updatedAt ASC, personalModelId ASC` 为 authority；
- entitlement 中只写 portable exact ref 与 ordinal，不写 endpoint、credential、display name 或 local path；
- exact Personal Model preference 只在 R2D Planner 的既有 preference 步骤读取一次；
- preference 指向不在 entitlement 的 model 时不静默换 current，Planner 按既有真值表处理；
- stable fallback 只按 entitlement ordinal，Renderer/显示顺序不参与；
- source 返回空 models 合法，但新 Task 无候选时必须 typed reject，不造默认模型。

### 3.5 Agent、Tool、Skill、Knowledge

**Agent**：本批 production graph 只允许 code-owned `agent.general`。其他 Agent ID 无 exact source 时返回 unavailable。

**Tool**：只投影当前 Registry 中通过 definition/binding/adapter、availability、Workspace/Auth 与既有
`TaskToolCandidatePolicy` 校验的真实 Tool。TGM 未就绪不影响已冻结 Document Tool，但未知 Tool 不得出现。

**Skill / Knowledge**：production entitlement 固定为空。显式非空选择由既有 exact-ref 校验失败关闭；不得放入
Mock、Catalog summary、`materializedRef`、文件路径或“待接入但可用”的占位。

### 3.6 Production graph composition

新增单一 `createLocalDesktopR2DProductionComposition()`，装配：

```text
BuiltInGeneralAgentSource
LocalDesktopR2DSubjectBindingAuthority
LocalDesktopTaskResourceEntitlementSource
production R2D3AcceptanceAuthority
AgentResourceDecisionPlanner
PersonalModelTaskLockMaterializer
existing Registry / Workspace/Auth / Tool Policy / Authorization Policy
existing ReasoningModeLockPlanner
R2D3DurableAcceptancePlanner
```

禁止在 Main、route 或 `SubmitTurnCoordinator` 内逐个 `new` 这些组件；禁止第二份交集/排序/lock 真值表。

`agent.fixture.desktop-scripted` 与 `model.desktop-scripted` 可以继续服务 gate=false 的历史 fixture/runtime，但不能
被 production R2D composition 引用。boundary test 必须分别证明“legacy fixture 仍存在”和“R2D graph consumer=0”。

R2D-P.2 不得导入、重算或修改 PRA-2 冻结的
`LOCAL_PERSONAL_ADAPTER_CONTRACT_REVISION` 与
`LOCAL_OPENAI_REASONING_REQUEST_PROJECTOR_REVISION`，也不得为 production composition 建立第二条
Projector revision 路径或内联 digest。Provider-private identity 只属于 PRA/DFI 映射线。

### 3.7 三态启动门

| 状态 | 行为 |
| --- | --- |
| code-owned false | 不构造/注册 production R2D consumer；legacy 行为零漂移 |
| true + graph 缺任一 dependency | HTTP ready 前 fail-fast，错误只含 safe dependency code |
| test-only true + graph 完整 | 只在受控 integration composition 运行，允许验证 first-accept |

本批结束时 production 常量仍为 `false`；不得增加 env、CLI、Renderer、Main 或 Profile 覆盖入口。production
R2D route count、Desktop v1alpha4 consumer count继续为 0。

### 3.8 Recovery 边界

R2D-P.2 只影响首次接受前的 authority capture。`accepted` 之后：

- entitlement snapshot、decision、locks、selection 与 instruction binding 从 durable envelope/bundle 恢复；
- 不再读取 LDA、Personal heads、Preference、Registry current pointer、Workspace/Auth 或 Tool Policy；
- response loss/restart/replay 不重选 Agent/Model/Tool；
- terminal replay Provider/Agent Loop/source read 增量均为 0；
- durable record 损坏 typed fail-closed，不回 legacy、不重新执行 first-accept。

## 4. Typed error 与安全摘要

| 内部 code | 对外安全语义 |
| --- | --- |
| `selection.subject_binding_invalid` | 当前会话无法验证，请重新打开任务 |
| `selection.local_authority_unavailable` | 本地身份状态暂不可用 |
| `selection.entitlement_stale` | 可用资源已变化，请重新提交 |
| `selection.entitlement_invalid` | 可用资源校验失败 |
| `selection.model_unavailable` | 当前没有可用模型 |
| `selection.skill_unavailable` | 所选技能当前不可用 |
| `selection.knowledge_unavailable` | 所选知识当前不可用 |
| `selection.production_graph_incomplete` | 当前运行环境未完成初始化 |

日志、Receipt 与 failure summary 只写 code + 固定 safe summary；不得写 owner digest、namespace key、Endpoint、
credentialRef、session token、record JSON 或 Zod path。

## 5. 实施步骤与工期

### Step 1：Local source 与 consistency lease（1～1.5 日）

- subject binding proof；
- LDA/namespace exact binding；
- Personal Model bounded enumeration、candidate validation、stable ordinal；
- empty/unavailable/stale typed semantics。

### Step 2：Acceptance authority 与 production composition（1～2 日）

- code-owned Agent、Registry、Workspace/Auth、Preference、Tool Policy、locks；
- single composition factory；
- startup graph validator 与 fixture isolation。

### Step 3：Recovery / boundary / Harness（1～1.5 日）

- first-accept read counters；
- accepted/restart/replay zero reread；
- SQLite reopen、boundary scans、content-free Evidence；
- historical R2D/DFI/CPC regressions。

合计：**3～5 个集中工程日**。不含独立 QA 返工，也不含 R2D-P.3 Desktop v1alpha4。

## 6. 文件边界

### 6.1 允许

- `services/core/src/application/**r2d*production*`；
- `services/core/src/application/**local*entitlement*`；
- `services/core/src/ports/task-resource-entitlement-source.ts` 的必要 additive typed proof；
- `services/core/src/bootstrap/create-desktop-private-runtime.ts` 仅用于默认 false 的完整 composition 接缝；
- Core tests/support、focused Harness、Evidence、package scripts 与本批文档；
- root/Core development version 与必要治理记录。

### 6.2 禁止

- `packages/contracts/**`、`apps/desktop/**`、`apps/admin-console/**`、Central、Document Worker；
- migration、依赖、lockfile；
- DFI-5.3 historical Evidence/Harness；
- Provider Adapter/body mapping；
- R2D-P.3、PRA-2/PRA-3、DFI-5.4.x 代码。

## 7. Threat Model

| 威胁 | 控制 |
| --- | --- |
| 裸 digest 冒充 verified subject | request-scoped typed proof + same-session verification |
| local authority 冒充 enterprise | strict LDA evidence flags + use-only Port |
| enterprise historical record 被接管 | owner exact match；不 backfill/rebind |
| 多次读跨 snapshot 拼接 | query/head record digest lease + return 前 revalidation |
| 复制 SQLite 后继续用 Credential | Keychain observation exact mismatch即排除 |
| Fixture 进入 production | composition import allowlist + boundary scan |
| Renderer 改顺序扩大候选 | Core stable ordinal + Planner exact intersection |
| unrestricted 被解释为所有资源 | 仅 entitlement 中 exact refs 可选 |
| gate 半开启 | false/incomplete/test-complete 三态 startup |
| restart 重选资源 | durable envelope/bundle single authority |

## 8. QA 矩阵（72 项）

### 8.1 Authority / binding（QA-001～QA-012）

1. QA-001：production source 只接受 `local_desktop_owner`。
2. QA-002：local ready 与 enterprise/test ready 互斥。
3. QA-003：namespace key 使用后副本清零。
4. QA-004：OS 用户名不参与 authority。
5. QA-005：Renderer/Main 自报身份不参与 authority。
6. QA-006：runtime/client binding 必须来自同一 session proof。
7. QA-007：裸 digest 无 proof 被拒绝。
8. QA-008：跨 session proof replay 被拒绝。
9. QA-009：跨 client proof replay 被拒绝。
10. QA-010：namespace drift 返回 typed unavailable/stale。
11. QA-011：authority digest drift 失败关闭。
12. QA-012：日志/evidence 不含 namespace key/owner digest/session token。

### 8.2 Personal Model source（QA-013～QA-028）

13. QA-013：只枚举 exact local owner active heads。
14. QA-014：historical enterprise owner heads 不进入 entitlement。
15. QA-015：head/definition configuration mismatch 被拒绝。
16. QA-016：head/definition execution mismatch 被拒绝。
17. QA-017：status/definition identity mismatch 被拒绝。
18. QA-018：Profile revision 缺失时 candidate 被排除。
19. QA-019：Credential absent 时 candidate 被排除。
20. QA-020：Credential unavailable 时 candidate 被排除。
21. QA-021：Credential revision/binding drift 被排除。
22. QA-022：缺 text capability 的 candidate 被排除。
23. QA-023：非法 Model ID 被排除。
24. QA-024：稳定顺序为 updatedAt + exact ID。
25. QA-025：stable ordinal 唯一递增。
26. QA-026：return 前 head revalidation 发现漂移即失败。
27. QA-027：active set query revision 漂移即失败。
28. QA-028：无 local-owned model 时返回空 models，不生成 Fixture/default。

### 8.3 Agent / Tool / Skill / Knowledge（QA-029～QA-040）

29. QA-029：production Agent 只来自 code-owned `agent.general`。
30. QA-030：fixture Agent production consumer count=0。
31. QA-031：scripted Model production consumer count=0。
32. QA-032：Document Tool 需 exact Registry/binding/adapter。
33. QA-033：Tool availability false 时不进入 candidate。
34. QA-034：Workspace/Auth 拒绝时 Tool 不进入 decision。
35. QA-035：Tool Policy 只执行一次。
36. QA-036：TGM 缺失不补造 Tool。
37. QA-037：Skill entitlement 固定为空。
38. QA-038：显式 Skill 请求 typed fail。
39. QA-039：Knowledge entitlement 固定为空。
40. QA-040：显式 Knowledge 请求 typed fail。

### 8.4 Composition / gate（QA-041～QA-052）

41. QA-041：唯一 production Entitlement Source implementation。
42. QA-042：唯一 production R2D composition factory。
43. QA-043：Planner 真值表未复制。
44. QA-044：gate=false 不构造 production consumer。
45. QA-045：gate=false legacy behavior 零漂移。
46. QA-046：gate=true 缺 source 时 ready 前 fail-fast。
47. QA-047：gate=true 缺 Agent/Registry/Policy/lock 任一项 fail-fast。
48. QA-048：受控 complete graph 可完成 first accept。
49. QA-049：production constant 仍为 false。
50. QA-050：无 env/CLI/Renderer/Main gate override。
51. QA-051：Desktop v1alpha4 route count=0。
52. QA-052：Provider release/materializer consumer count=0。

### 8.5 First accept / recovery（QA-053～QA-064）

53. QA-053：Agent 只读取一次。
54. QA-054：subject/LDA/entitlement 各只捕获一次。
55. QA-055：Registry/Workspace/Auth 各只读取一次。
56. QA-056：Preference 仅无 explicit model 时读取一次。
57. QA-057：Decision Planner 只执行一次。
58. QA-058：Task locks 只物化一次。
59. QA-059：`task_committed` 前 Provider/DNS/socket/TLS/Link/Loop 均0。
60. QA-060：accepted 恢复 authority current read增量=0。
61. QA-061：message_appended 恢复 current read增量=0。
62. QA-062：task_committed 恢复 current read增量=0。
63. QA-063：response loss/restart 不重选资源。
64. QA-064：terminal replay source/Provider/Loop增量=0。

### 8.6 Boundary / regression（QA-065～QA-072）

65. QA-065：Entitlement v1 source/hash/digest 不漂移。
66. QA-066：Runtime Selection v1～v3、coordination v1～v4 不修改。
67. QA-067：migration 仍止 26。
68. QA-068：lockfile digest 保持编码前基线。
69. QA-069：R2D/DFI/CPC historical Harness 通过且 evidence 不覆盖。
70. QA-070：root check、lint、audit、frozen install 通过。
71. QA-071：Central online/offline 通过，即使本批不改 Central。
72. QA-072：最高只输出 R2DP2 conformant，不声明 production/Desktop ready。

## 9. 正式门禁

编码后至少运行：

```text
pnpm run harness:r2dp2
pnpm run harness:r2dp1
pnpm run harness:r2d4
pnpm run harness:r2d3.3
pnpm run harness:dfi5.3.4
pnpm run harness:cpc3
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline
```

Evidence 必须报告 production source count、gate 值、fixture consumer count、各 authority 读取次数、
recovery reread count、migration max、lockfile digest 与下游 readiness false；禁止硬编码 0、`?? 0`、`.skip`、
`.only`、`sleep` 或自动 retry。

## 10. 停手条件

出现任一情况立即停止并回评审：

1. 现有 session graph 无法证明两个 binding digest 属于同一 accepted client/runtime；
2. 必须扩宽 enterprise `PersonalModelOwnerAuthority` 才能读取 local records；
3. 必须 backfill/rebind historical Personal Model；
4. 需要 migration 27、新表、索引或 durable proof store；
5. 必须创建 Fixture/default Personal Model 才能通过；
6. 多次 persistence read 无法用现有 revision/digest 做一致性 revalidation；
7. 必须修改 R2D Planner 真值表或 Runtime/coordination schema；
8. 必须开放 Desktop v1alpha4 或 production gate；
9. 必须把 Skill/Knowledge/TGM 伪装 ready；
10. 必须修改 Provider mapping/release；
11. 必须修改 Contracts、Desktop、Admin、Central 或 migration；
12. root/Central 失败来自并发窗口且无法安全归因。

## 11. 文档评审问题

1. 是否接受 R2D-P.2 只建立 production-capable graph，production gate 仍 false？
2. 是否接受 production source 使用 LDA use-only authority，而不扩宽 enterprise CRUD authority？
3. 是否接受 subject binding 必须有同一 session 的 typed proof，裸 digest 不可信？
4. 是否接受多读 persistence 通过 query/head revision revalidation 形成 captured lease？
5. 是否接受 historical enterprise-bound Personal Model 不进入 local entitlement？
6. 是否接受无 local-owned model 时 models 为空，不能用 Fixture 补成功？
7. 是否接受 stable ordinal 由 `updatedAt + exact ID` 冻结，Renderer 不参与？
8. 是否接受 Skill/Knowledge 为空、Document Tool 只走真实 Registry intersection？
9. 是否接受 gate 三态，但本批只运行受控 test-complete，production false？
10. 是否接受 3～5 日估算及 72 项 focused QA？

## 12. 当前状态

```text
LDA-1 / R2D-P.1                       PASS/CLOSED
R2D-P.2                               PASS/CLOSED
R2D-P.3                               DOCUMENT REVIEW PENDING / CODING GATED
PRA-1                                 PASS/CLOSED
PRA-2 repair.1 / PRA-2                PASS/CLOSED
PRA-3                                 DOCUMENT REVIEW PENDING / CODING GATED
DFI-5.4.1～DFI-5.4.3                  GATED
production R2D consumption            false
production TaskResourceEntitlementSource 1（production bootstrap consumer=0）
production Desktop v1alpha4 route     0
production CPC activation             false
production enterprise entitlement     false
```

独立文档复核已通过并由用户正式接受；R2D-P.2 已完成编码与开发者门禁，等待独立 QA。R2D-P.3 与其他下游仍
GATED，不因本批实现自动解锁。
