# PRA-2 Exact Subject-bound Release Materializer 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED；IMPLEMENTED / DEVELOPER GATES PASS / REPAIR.1 FOCUSED RE-QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 日期：2026-08-28  
> 负责人：Codex 5.6  
> 父计划：[DFI-5.4 方案 A 前置详细计划](./DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md) `PASS/CLOSED`  
> 上游：LDA-1 / R2D-P.1、PRA-1、DFI-5.3 `PASS/CLOSED`  
> 本批最高允许输出：`PRA2_EXACT_SUBJECT_RELEASE_MATERIALIZER_CONFORMANT`  
> 下游：PRA-3、R2D-P.3 已进入文档评审，仍 `CODING GATED`；DFI-5.4.1～5.4.3 及其他下游继续 `GATED`

## 0. 结论先行

PRA-2 负责把 PRA-1 的 code-owned immutable policy 与某一个**真实 Personal Model exact subject**确定性结合，
生成可校验的 subject-bound Provider release candidate。它不负责把 candidate 宣布为 production admitted，也不
把 release 安装到 production Registry。

当前 OpenAI candidate 明确是：

```text
admissionState = pending_conformance
productionAdmitted = false
```

因此 PRA-2 必须区分：

1. `pending_conformance_materialized`：在受控测试中可以确定性生成 candidate，用于 PRA-3 fixture/lifecycle；
2. `production_admitted_materialized`：只有未来 code-owned policy 明确 admitted 且 PRA-3 通过后才可产生；
3. `rejected`：subject、policy、endpoint、adapter、projector、timeout 或 Credential observation 不匹配。

本批结束时第二种状态的数量必须为 0，production release registry consumer 数必须为 0。PRA-2 不得通过改变
PRA-1 policy、忽略 `productionAdmitted=false` 或把 test candidate 放入 bootstrap 来制造“支持 Max”。

## 1. 已关闭事实与真实缺口

### 1.1 必须复用

1. PRA-1 已冻结 OpenAI exact snapshot policy、evidence、endpoint identity、adapter/projector/timeout identity，状态为
   `pending_conformance`；
2. DeepSeek 已冻结为 `requires_mapping_revision`，不能进入当前 materializer；
3. DFI-5.3.1 已提供 `ProviderReasoningMappingRelease`、三层非循环 digest 与 exact registry；
4. DFI-5.3.2 已提供 `deriveLocalPersonalReasoningProfileSubject()`、Local sealed projection 与
   mapping-before-durable-prepare；
5. `PersonalModelTaskLockMaterializer` 已用 `pmcfg1` 绑定 owner、configuration 与 execution digest；
6. LDA-1 已提供 local owner authority，但不证明 enterprise identity 或 CRUD permission；
7. migration 25 durable deadline、Local timeout policy 与 retry/restart 语义已关闭；
8. production `createProviderReasoningMappingRelease` consumer 与 supported release count 仍为 0。

### 1.2 当前缺口

| 缺口 | 当前代码事实 | PRA-2 关闭方式 |
| --- | --- | --- |
| Exact subject input | helper 只验证 definition + Task lock + adapter | 新增完整 subject proof 与固定验证顺序 |
| Policy source | PRA-1 只有 code-owned candidate constant | 新增 exact policy source，禁止 current/latest |
| Identity ownership | adapter/projector revision 公式写在 PRA-1 内 | 提升为单一 code-owned identity，digest 必须零漂移 |
| Release IDs | mapping/profile/strategy IDs 尚无 subject-bound规则 | 独立 domain 确定性派生，不含 Secret/raw endpoint |
| Admission state | candidate 仍 pending | sealed outcome 分开 candidate 与 production admitted |
| Installation | exact Registry 可装 release但 production consumer=0 | 本批不安装，只输出验证过的 immutable envelope |
| Credential proof | exact subject 不应读取 Secret | 只接受 safe observation revision/binding digest |

## 2. 范围与明确不做

### 2.1 本批允许

- `ExactSubjectBoundProviderReleaseMaterializer`；
- strict subject materialization input/proof 与 sealed result；
- code-owned exact admission policy source；
- adapter contract/projector identity 单一 owner；
- deterministic strategy/profile/mapping ID 与 digest；
- pending candidate envelope、safe receipt 与 boundary diagnostics；
- focused tests、Harness、Evidence 与治理文档。

### 2.2 本批禁止

- 不把 PRA-1 policy 改为 admitted；
- 不安装 production release Registry，不接 Provider/bootstrap/SubmitTurn；
- 不调用 Credential secret resolve、DNS、socket、TLS、HTTP 或公网；
- 不新增 directive variant、Tool continuation private state、token 字段或 Gateway schema；
- 不修改 DFI-5.3 historical Evidence/Harness；
- 不修改 public Contract、Desktop/Admin/Central、migration、依赖或 lockfile；
- 不实现 PRA-3 fixture/lifecycle；
- 不打开 production Local Max、SubmitTurn Max 或 Desktop Max UI。

## 3. 冻结架构决策

### 3.1 单一 exact input envelope

materializer 只接受已经由 production authority 捕获的：

```text
validated LocalDesktopSubjectAuthorityV1
validated PersonalModelOwnerNamespace
validated PersonalModelDefinition
validated PersonalModelHead
validated PersonalModelStatusFact
safe PersonalCredentialObservation
validated exact TaskCapabilityLock
validated exact PersonalModelProviderProfile
exact adapter contract identity
exact request projector identity
exact timeout policy identity
exact ProviderReleaseAdmissionPolicyV1
```

不得直接接受 `modelId + endpoint + effort` 三个裸字符串，也不得在 materializer 内查询 current Profile、current
policy 或 current Personal Model head。I/O 与 exact snapshot 捕获在调用方完成；materializer 本身是同步纯函数。

### 3.2 固定验证顺序

```text
1. validate namespace + LDA authority
2. validate definition/head/status same local owner
3. validate head -> definition -> execution digest chain
4. validate safe Credential observation exact binding
5. verify pmcfg1 Task lock against namespace
6. derive exact ReasoningProfileSubject
7. load/validate one exact code-owned policy
8. validate exact model snapshot allowlist
9. derive final dispatch URL from canonical API base + exact Profile relative path, then validate endpoint identity
10. validate adapter contract/projector/timeout identities
11. derive deterministic subject-bound IDs
12. create + revalidate ProviderReasoningMappingRelease
13. return sealed admission envelope
```

步骤 1～10 任一失败都必须发生在 Credential secret resolve、Provider resolve、DNS、socket、TLS、HTTP body、
Invocation Link、Timeout Fact 与 Usage 之前，九类计数均为 0。

### 3.3 Owner / Personal Model / Task lock exact binding

必须同时满足：

- LDA namespace revision/owner digest 与 definition/head/status exact 一致；
- head current configuration/execution digest 与 definition 一致；
- status configuration/execution digest 与 definition 一致；
- Credential observation 为 `present` 且 revision/binding digest 与 definition 一致；
- `PersonalModelTaskLockMaterializer.verify()` 解出的 owner/configuration/execution identity 与 definition 一致；
- `deriveLocalPersonalReasoningProfileSubject()` 的 capability revision 来自
  `modelLock.definitionSnapshot.revision`，不得用 Personal configuration revision 替代；
- adapter descriptor revision 来自 exact Task lock，不能只比较 adapter ID；
- endpoint/model/display name/raw credentialRef 不进入 safe subject。

historical enterprise-bound definition 不允许通过 local LDA 校验；不得 rebind。

### 3.4 Endpoint 与 Model snapshot

Personal Model definition 保存的是 canonical **API base**，当前 Profile 另行冻结
`chatCompletionsRelativePath="chat/completions"`。PRA-1 policy 的 endpoint rule 必须与两者按 raw Adapter 同一规则
组合出的**最终 dispatch URL** exact tuple 比较，而不是把 API base 直接与 `/v1/chat/completions` 比较：

```text
protocol / normalized host / effective port / normalized path
```

组合规则必须复用或无行为漂移地提升现有 `createChatCompletionsUrl()` 的 canonical helper；禁止在 materializer 中
复制另一套 URL join。禁止字符串前缀、包含、重定向后 host、display name 或 provider kind 猜测。query、
fragment、userinfo、非默认端口、路径尾斜杠漂移均按 policy exact rule 处理。

具体代码 authority：`createChatCompletionsUrl()` 位于
`services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts:433`；
`PersonalModelProviderProfileRegistry` 位于
`services/core/src/application/personal-model-provider-profile.ts:30`。编码不得另建同义 Registry 或 URL helper。

`definition.providerModelId` 必须 exact 命中 policy allowlist；`gpt-5.2`、`latest`、alias、大小写变化或营销名称均不
等于 `gpt-5.2-2025-12-11`。

### 3.5 Code-owned identity 单一所有权

PRA-1 当前在 policy material 内计算 adapter contract revision 与 request projector revision。PRA-2 编码时应把它们
提升为单一 Core-private constants/helper，由 policy 与 materializer共同引用：

```text
LOCAL_PERSONAL_ADAPTER_CONTRACT_REVISION
LOCAL_OPENAI_REASONING_REQUEST_PROJECTOR_REVISION
```

要求：

1. 提升前后 PRA-1 `policyRevision/policyDigest` 字节不变；
2. DFI-5.3.2 projector 行为与 body bytes 不变；
3. 若共享 constant 会改变任一历史 digest，立即停手，不得更新 baseline；
4. 不从文件 mtime、package version 或运行时 function source 计算 identity。

### 3.6 Deterministic subject-bound IDs

新增独立 domains：

```text
robothree.provider-release.subject-bound-id.v1
robothree.provider-release.materialization-envelope.v1
```

ID material 只包含 safe exact refs：

```text
policyRevision
ReasoningProfileSubject
timeoutPolicyIdentity
adapterContractRevision
requestProjectorRevision
```

确定性派生：

- `strategyId = strategy.provider-release.<digest-prefix>`；
- `profileId = profile.provider-release.<digest-prefix>`；
- `mappingId = mapping.provider-release.<digest-prefix>`；
- `materializationId = provider-release.materialization.<digest-prefix>`。

ID 只用于索引；完整 digest 仍是 authority。prefix collision、重复 exact identity 对应不同 material、同 ID 不同 digest
一律 `provider_release.materialization_conflict`，不得追加随机 nonce。

### 3.7 三层 release material 映射

PRA-2 对当前 OpenAI candidate 固定生成：

```text
authority = local_personal
providerFamily = local_openai
mappingKind = openai_reasoning_effort
typedPrivateDirective = { kind: openai_reasoning_effort, effort: xhigh }
requestProjectionRevision = exact code-owned projector revision
timeoutPolicyIdentity = exact Local Personal timeout policy
evidenceRevision = PRA-1 policyDigest
strategyRevision = subject + policy commitment digest
```

然后调用 DFI-5.3.1 的 `createProviderReasoningMappingRelease()` 并立即
`validateProviderReasoningMappingRelease()` 重算。不得复制 Strategy/Profile/mapping digest 算法。

### 3.8 Sealed admission outcome

```text
ProviderReleaseMaterializationResult =
  | { state: "pending_conformance_materialized"; envelope; release }
  | { state: "production_admitted_materialized"; envelope; release }
  | { state: "rejected"; code; safeSummary }
```

规则：

- PRA-1 当前 policy 只能产生第一种；
- 第二种要求 `productionAdmitted=true` 的新 code-owned policy revision，不能由调用方 boolean override；
- `pending` release 只能供 PRA-3 test fixture/conformance 使用，类型上不能传给 production registry installer；
- production installer 本批不存在；production supported release count=0；
- rejected 不返回部分 release、raw directive、endpoint 或 Credential ref。

### 3.9 Candidate envelope 与安全 Receipt

`ProviderReleaseMaterializationEnvelopeV1` 只包含：

- schemaVersion / materializationId / materializationDigest；
- policy ref/digest；
- safe subject digest；
- strategy/profile/mapping refs；
- admission state；
- createdFromEvidenceRevision（code-owned，不采样 wall clock）。

不包含 endpoint、providerModelId、credentialRef、Credential observation、raw HMAC owner digest、namespace key、
private directive 或 evidence excerpt。private release 仅留在 Core-private graph。

### 3.10 No current fallback / no persistence

PRA-2 不新增数据库表，也不把 materialized candidate 写入 Task/Receipt。exact input相同必须得到相同 envelope/release；
任一 authority/policy/subject变化必须改变 digest或 typed reject。

不得提供：

- `currentPolicy()`、`latestRelease()`、按 model family fallback；
- 缺 exact snapshot时切到其他 model；
- policy pending时静默返回 omit/default；
- duplicate release last-write-wins；
- test fixture 自动注册到 production composition。

## 4. Typed error 与安全摘要

| code | 安全摘要 |
| --- | --- |
| `provider_release.local_authority_invalid` | 本地模型身份校验失败 |
| `provider_release.subject_invalid` | 模型运行身份不一致 |
| `provider_release.credential_observation_invalid` | 模型凭据状态不可用 |
| `provider_release.policy_unavailable` | 当前模型没有可用的 Max 准入策略 |
| `provider_release.policy_not_admitted` | 当前模型尚未完成 Max 准入验证 |
| `provider_release.endpoint_mismatch` | 模型接入地址与准入策略不一致 |
| `provider_release.model_snapshot_mismatch` | 当前模型版本未通过 Max 准入 |
| `provider_release.identity_mismatch` | 模型适配身份校验失败 |
| `provider_release.materialization_conflict` | Max 准入材料发生冲突 |

内部 cause 可以 typed 细分，但日志/Receipt 只输出 code + safe summary，不输出 URL、model string、digest、Secret 或
Zod path。

## 5. 实施步骤与工期

### Step 1：Exact subject proof 与 code-owned identities（0.5～1 日）

- input schema、owner/head/status/Credential/lock 验证；
- adapter/projector identity 单一 owner；
- PRA-1 digest 零漂移断言。

### Step 2：Deterministic materializer / sealed outcome（1～1.5 日）

- subject-bound IDs；
- DFI-5.3 release helper复用；
- pending/admitted/rejected 类型隔离；
- safe envelope/receipt。

### Step 3：Boundary / Harness / Evidence（0.5～1.5 日）

- determinism、byte flip、zero-upstream、leak scan；
- historical DFI/PRA/R2D evidence regression；
- root/Central/lockfile/migration 门禁。

合计：**2～4 个集中工程日**。不含 PRA-3 真实 Provider fixture 与 admission promotion。

## 6. 文件边界

### 6.1 允许

- `services/core/src/application/provider-release-*`；
- `services/core/src/application/**subject*release*`；
- 必要的 Local projector/adapter identity constant 提升，但行为与 digest 必须零漂移；
- Core-private index export；
- focused tests、Harness、Evidence、package script、实施/治理文档；
- root/Core development version。

### 6.2 禁止

- production bootstrap/Provider consumer/registry installer；
- `packages/contracts/**`、Desktop/Admin/Central/Document Worker；
- migration、依赖、lockfile；
- DFI-5.3 historical Evidence/Harness；
- PRA-3、R2D-P.2/P.3、DFI-5.4.x 代码；
- DeepSeek mapping revision、Tool private reasoning state。

## 7. Threat Model

| 威胁 | 控制 |
| --- | --- |
| pending policy 被当 admitted | sealed state + production installer类型不接受 pending |
| model alias 冒充 snapshot | exact allowlist，无 current/latest |
| endpoint 相似字符串绕过 | canonical tuple exact match |
| enterprise record 冒充 local subject | LDA + owner exact equality |
| configuration revision 冒充 capability revision | Personal lock verify +分层 digest |
| Credential Secret 泄漏 | 只消费 safe observation；九类上游计数0 |
| projector identity 双份漂移 | code-owned single constants + historical digest freeze |
| 随机 ID 掩盖冲突 | content-addressed IDs + collision fail-closed |
| test candidate 进入 bootstrap | consumer allowlist + production registry count=0 |
| raw directive进入公共面 | Core-private release + envelope safe refs only |

## 8. QA 矩阵（72 项）

### 8.1 Input / owner / lock（QA-001～QA-016）

1. QA-001：只接受 validated local authority。
2. QA-002：enterprise/test authority 被拒绝。
3. QA-003：namespace revision drift 被拒绝。
4. QA-004：owner digest drift 被拒绝。
5. QA-005：head/definition owner mismatch 被拒绝。
6. QA-006：head configuration drift 被拒绝。
7. QA-007：head execution drift 被拒绝。
8. QA-008：status identity drift 被拒绝。
9. QA-009：Credential absent 被拒绝。
10. QA-010：Credential unavailable 被拒绝。
11. QA-011：Credential revision drift 被拒绝。
12. QA-012：Credential binding digest drift 被拒绝。
13. QA-013：pmcfg1 MAC invalid 被拒绝。
14. QA-014：Task lock owner/configuration/execution mismatch 被拒绝。
15. QA-015：Capability revision 来自 exact Task lock。
16. QA-016：configuration revision 不冒充 Capability revision。

### 8.2 Policy / endpoint / identity（QA-017～QA-032）

17. QA-017：Policy exact load恰好一次。
18. QA-018：duplicate policy identity 失败关闭。
19. QA-019：Policy digest drift 被拒绝。
20. QA-020：pending policy 不能产生 admitted outcome。
21. QA-021：调用方不能 boolean override admission state。
22. QA-022：DeepSeek exclusion 不能进入 materializer。
23. QA-023：exact GPT-5.2 snapshot 命中。
24. QA-024：alias/latest/大小写变化均不命中。
25. QA-025：API base + Profile relative path 与 raw Adapter 生成同一 final URL。
26. QA-026：protocol/host mismatch 被拒绝。
27. QA-027：final path/port/query/fragment/userinfo 漂移被拒绝。
28. QA-028：adapter descriptor ID/revision exact。
29. QA-029：adapter contract revision exact。
30. QA-030：request projector revision exact。
31. QA-031：timeout ref/revision/digest exact。
32. QA-032：共享 identity constants 后 PRA-1 policy digest不变。

### 8.3 Materialization / determinism（QA-033～QA-048）

33. QA-033：相同 exact input 10 次输出唯一。
34. QA-034：跨 fresh process 输出一致。
35. QA-035：policy byte flip 改变 digest或失败。
36. QA-036：subject byte flip 改变 digest或失败。
37. QA-037：adapter/projector/timeout byte flip 失败。
38. QA-038：strategy/profile/mapping/materialization ID可重复推导。
39. QA-039：ID prefix collision 失败关闭。
40. QA-040：不得使用随机 nonce或 wall clock。
41. QA-041：只调用 DFI-5.3 release creator 一次。
42. QA-042：release 创建后立即 exact revalidate。
43. QA-043：三层 digest 顺序与 DFI-5.3.1 一致。
44. QA-044：typed directive exact 为 xhigh。
45. QA-045：request projection revision exact。
46. QA-046：evidence revision exact 为 policy digest。
47. QA-047：pending envelope 与 production admitted type不可互换。
48. QA-048：rejected 不返回 partial release。

### 8.4 Zero side effect / leakage（QA-049～QA-060）

49. QA-049：materializer 内 persistence read count=0。
50. QA-050：Credential secret resolve count=0。
51. QA-051：Provider resolve count=0。
52. QA-052：DNS/socket/TLS count=0。
53. QA-053：HTTP body count=0。
54. QA-054：Invocation Link/Timeout Fact count=0。
55. QA-055：Usage projection count=0。
56. QA-056：stdout 不含 endpoint/model/credential/digest/private directive。
57. QA-057：stderr 不含敏感 material。
58. QA-058：evidence 不含敏感 material。
59. QA-059：failure summary 不含敏感 material。
60. QA-060：raw/url/base64/hex 负向注入均可检出。

### 8.5 Boundary / regression（QA-061～QA-072）

61. QA-061：production materializer consumer count=0。
62. QA-062：production supported release count=0。
63. QA-063：production Registry installer count=0。
64. QA-064：production SubmitTurn Max route=0。
65. QA-065：Desktop Max UI ready=false。
66. QA-066：PRA-1 historical evidence/hash 不覆盖。
67. QA-067：DFI-5.3.1～5.3.4 historical evidence不漂移。
68. QA-068：Contracts/migration 0 修改，migration仍止26。
69. QA-069：lockfile digest 保持编码前基线。
70. QA-070：root check、lint、audit、frozen install通过。
71. QA-071：Central online/offline通过，即使本批不改Central。
72. QA-072：最高只输出 PRA2 conformant，不声明 admitted/production ready。

## 9. 正式门禁

编码后至少运行：

```text
pnpm run harness:pra2
pnpm run harness:pra1
pnpm run harness:dfi5.3.4
pnpm run harness:dfi5.3.2
pnpm run harness:r2dp1
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline
```

Evidence 必须包含 policy/materializer load count、pending/admitted/rejected count、九类零副作用、production
consumer/release count、historical digests、migration max、lockfile digest 与全部下游 readiness false。禁止硬编码
0、`?? 0`、`.skip`、`.only`、`sleep` 或自动 retry。

## 10. 停手条件

出现任一情况立即停止并回评审：

1. 需要把 PRA-1 pending policy 原地改成 admitted；
2. 需要按 alias/current/latest 或 marketing name 选模型；
3. 需要放宽 endpoint exact rule；
4. 需要读取或记录 Credential Secret；
5. 需要新增 directive variant、token field、Tool continuation state 或 Gateway schema；
6. 共享 adapter/projector identity 会改变 PRA-1 或 DFI-5.3 historical digest；
7. 需要把 pending candidate 安装进 production registry；
8. 需要 migration、durable release table、新依赖或 lockfile 变化；
9. 需要修改 public Contract、Desktop/Admin/Central 或 Provider body；
10. 只能用公网/真实用户 Secret/付费调用证明 materializer；
11. 必须修改 historical Evidence/Harness；
12. root/Central 失败来自并发窗口且无法安全归因。

## 11. 文档评审问题

1. 是否接受 PRA-2 只 materialize exact candidate，不负责 production admission？
2. 是否接受 PRA-1 pending policy 只能产生 `pending_conformance_materialized`？
3. 是否接受 materializer 为同步纯函数，所有 I/O 由调用方先捕获成 exact input？
4. 是否接受 LDA/definition/head/status/Credential observation/Task lock 全链 exact 校验？
5. 是否接受 endpoint canonical tuple 与 exact model snapshot规则？
6. 是否接受 adapter/projector identities 提升为单一 constants，但 historical digest 必须不变？
7. 是否接受 content-addressed IDs 与 collision fail-closed，不使用 nonce？
8. 是否接受 safe envelope 不含 endpoint/model ID/credential/raw directive？
9. 是否接受本批 production materializer/release/Registry consumer 均保持0？
10. 是否接受 2～4 日估算及72项 focused QA？

## 12. 当前状态

```text
LDA-1 / R2D-P.1                       PASS/CLOSED
PRA-1                                 PASS/CLOSED
PRA-2 repair.1 / PRA-2                PASS/CLOSED
PRA-3                                 DOCUMENT REVIEW PENDING / CODING GATED
R2D-P.2                               PASS/CLOSED
R2D-P.3                               DOCUMENT REVIEW PENDING / CODING GATED
DFI-5.4.1～DFI-5.4.3                  GATED
production policy admitted count      0
production materializer consumer      0
production supported release count    0
production SubmitTurn Max / Desktop UI 0 / false
production CPC activation             false
production enterprise entitlement     false
```

独立文档复核已通过并由用户正式接受；PRA-2 已完成编码与开发者门禁，等待独立 QA。PRA-3 与其他下游仍
GATED，不因本批实现自动解锁。
