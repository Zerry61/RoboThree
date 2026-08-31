# PRA-3 Provider Lifecycle / Admission Closure 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-28  
> 负责人：Codex 5.6  
> 父计划：[DFI-5.4 方案 A 前置详细计划](./DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md) `PASS/CLOSED`  
> 上游：PRA-1、PRA-2 repair.1、DFI-5.3、LDA-1 `PASS/CLOSED`  
> 并行批：R2D-P.3 `PASS/CLOSED`  
> 下游：DFI-5.4.1～5.4.3、TGM、Knowledge Provider、Agent Lifecycle、Desktop/Admin v2 继续 `GATED`  
> 本批最高允许输出：`PRA3_PROVIDER_LIFECYCLE_ADMISSION_CONFORMANT`

## 0. 结论先行

PRA-3 的目标是把 PRA-1 的 OpenAI exact snapshot candidate 从 `pending_conformance` 推进到一个新的、code-owned、
可审计的 **production admitted policy revision**，并证明 PRA-2 materializer 能针对 exact Local Personal subject
生成 `production_admitted_materialized` release。

这不是“当前用户的模型一定可用”，也不是“打开 Max UI”。本批只证明：

1. 一个 exact policy（`gpt-5.2-2025-12-11` + exact endpoint/adapter/projector/timeout）已通过受控协议和生命周期
   conformance；
2. additive admitted policy revision 与历史 pending policy并存，PRA-1 evidence/hash 不改写；
3. admitted policy只能由 code-owned exact source提供，PRA-2 module-private branch才能构造 admitted result；
4. 真实用户 subject仍必须通过 LDA/definition/head/status/Credential observation/Task lock exact materialization；
5. production bootstrap installed subject release count仍为0，production registry consumer仍为0，等待 DFI-5.4.1；
6. production SubmitTurn Max、Desktop Max UI 与 production R2D activation继续false。

## 1. 当前代码事实与真实缺口

### 1.1 已有且必须复用

1. PRA-1 `ProviderReleaseAdmissionPolicyV1` 是 strict pending-only schema，OpenAI candidate
   `productionAdmitted=false`；DeepSeek 为 `requires_mapping_revision`；
2. PRA-2 `ExactSubjectBoundProviderReleaseMaterializer` 已完成 local authority、Personal Model exact facts、Credential
   observation、Task lock、endpoint、adapter/projector/timeout 与 DFI-5.3 release digest 绑定；
3. repair.1 已定义 pending/admitted/rejected 三个独立 TypeScript variant；`unique symbol` 提供编译期结构隔离，
   **不是运行时密码学防伪**；
4. 当前 materializer 运行路径只返回 pending/rejected，production admitted/supported/registry consumer均为0；
5. Local Personal raw Provider 已支持 test-only loopback、custom CA/lookup、四阶段 timeout、SSE progress/Usage/[DONE]
   与 Tool Call；
6. DFI-5.3.1～5.3.4 historical evidence/harness只读；migration 25保存 exact durable deadline；
7. `ReleasePinnedReasoningMappingRegistry` 已能 exact 安装 immutable release，但 production bootstrap没有 consumer。

### 1.2 必须关闭的缺口

| 缺口 | 当前事实 | 本批关闭方式 |
| --- | --- | --- |
| Admission schema | v1 pending-only | additive v2 admitted policy + readable union，v1字节冻结 |
| Conformance authority | 只有官方 evidence claims | code-owned immutable conformance manifest + deterministic fixture results |
| Admitted result | 类型存在但无合法构造路径 | module内仅对validated v2 policy构造 proof |
| Policy source | 只有 exported candidate constant | exact code-owned source，禁止 current/latest/family fallback |
| Runtime proof | DFI-5.3已有mapping测试但无PRA subject admission lifecycle | real TLS/SSE fixture + subject materialization + crash/restart |
| Tool continuation | policy声称 chat-completions tool messages | 两轮真实request验证，不持久化private reasoning state |
| Production boundary | registry consumer=0 | 继续为0；只交付可供后续DFI-5.4.1消费的 admitted source/materializer |

## 2. 范围与明确不做

### 2.1 本批允许

- additive `ProviderReleaseAdmissionPolicyV2`、readable union与code-owned exact source；
- immutable `ProviderReleaseConformanceManifestV1` 与canonical test vectors；
- PRA-2 materializer的admitted branch（仅validated v2 policy）；
- Local Personal exact OpenAI-compatible TLS/SSE fixture；
- default/max body、Usage、Tool continuation、timeout、EOF、crash/restart/replay conformance；
- test-only release registry/Provider composition、Harness/Evidence/docs。

### 2.2 本批禁止

- 不修改PRA-1 V1 policy/evidence/exclusion或DFI-5.3 historical evidence；
- 不把DeepSeek/alias/`latest`/family marketing name纳入admitted；
- 不增加directive variant、private reasoning continuation state、token字段或Gateway schema；
- 不安装production subject release，不接SubmitTurn/Preview/Desktop UI；
- 不使用公网、真实用户Secret或付费调用；
- 不修改Desktop/Admin/Central、migration、依赖或lockfile；
- 不将controlled fixture成功解释为真实用户endpoint当前可用。

## 3. 冻结架构决策

### 3.1 G1：V1 byte freeze + additive admitted V2

`ProviderReleaseAdmissionPolicyV1` 保持 pending-only且source hash/digest零漂移。新增：

```text
ProviderReleaseAdmissionPolicyV2 = {
  schemaVersion: "v2",
  admissionState: "production_admitted",
  productionAdmitted: true,
  ...same exact provider/model/endpoint/adapter/projector/timeout commitments,
  supersedesPolicyRevision: <PRA-1 pending revision>,
  conformanceManifestRef: { manifestId, manifestRevision, manifestDigest }
}

ReadableProviderReleaseAdmissionPolicy = V1 | V2
```

读取只能先读 `schemaVersion` 一次，再strict dispatch。损坏V2不得fallback V1；V1 candidate不得原地改字段或更新
历史digest。

### 3.2 G2：Immutable Conformance Manifest

Manifest只记录content-free/canonical事实：

- exact model snapshot、provider/api family；
- adapter contract、request projector、timeout policy identities；
- default omission / max xhigh request-vector digest；
- streaming/Usage/[DONE]/EOF/timeout/tool-continuation vector digests；
- lifecycle/replay semantic-vector digest；
- fixture protocol revision、test CA revision、expected Host/SNI identity；
- historical DFI-5.3/PRA-1/PRA-2 evidence refs；
- revocation/supersession规则。

Manifest不得包含响应正文、Secret、raw endpoint、私有directive JSON、PID/port/path/wall clock。Harness根据真实运行结果
重算每个vector digest并与Manifest逐项比较；不得把Harness最终evidenceDigest反向写入Manifest形成循环。

### 3.3 G3：Code-owned admitted policy source

新增单一 exact source：

```text
loadExact({
  providerFamily,
  apiFamily,
  exactModelId,
  endpointIdentity,
  adapterContractRevision,
  requestProjectorRevision,
  timeoutPolicyIdentity
}) -> 0 | 1 policy
```

规则：

1. 无 `current/latest/defaultForFamily()`；
2. duplicate exact identity fail-fast；
3. exact model只允许`gpt-5.2-2025-12-11`，alias/大小写/营销名不匹配；
4. endpoint必须是canonical final dispatch identity，不以loopback测试端口替代production policy；
5. revocation只能由新code-owned revision明确产生，不能用配置覆盖；
6. production code-owned admitted policy count为1，但active user subject release count不由该数字推断。

### 3.4 G4：Admitted branch 的唯一合法构造路径

PRA-2 materializer additive接受 readable policy：

- V1 valid → `pending_conformance_materialized`；
- V2 valid + manifest exact + subject exact → module内部构造
  `production_admitted_materialized` + private proof；
- invalid/missing/drift → rejected。

private proof只承担TypeScript编译期结构隔离。运行时authority来自：policy V2 digest、manifest digest、exact subject、
DFI-5.3 release重算与source唯一性。不得宣称`unique symbol`能阻止恶意JavaScript type assertion或反射伪造。

### 3.5 G5：受控 TLS/SSE Provider fixture

真实fixture必须：

- `node:https`独立process、受控测试CA/cert；
- canonical Host/SNI保持policy identity，test-only lookup把该host解析到loopback；
- `testOnlyAllowLoopback=true`仅NODE_ENV=test可用；production构造必须立即以既有 typed cause
  `personal_model.test_transport_forbidden` 拒绝，不得改写成 generic runtime/configuration error，也不得新增同义
  `provider_release.*` 错误码；
- 实际读取HTTP request headers/body并实际发送chunked SSE；
- 不使用公网、真实OpenAI Key、用户Personal Model数据库或付费调用；
- fixture Secret只存在测试进程内，测试结束清零且四通道扫描0命中。

证书/私钥若入仓只能位于test fixture目录并由boundary排除production bundle；更优先运行时生成到临时目录，结束后
删除。不得新增证书生成依赖。

### 3.6 G6：Body / Stream / Usage / Tool continuation conformance

**default**：body中`reasoning`/`reasoning_effort`/`effort`/`thinking`/`budget`字段计数全部0；其余字段与legacy
serializer canonical等价。

**max**：只出现`reasoning_effort:"xhigh"`；不得出现boolean/budget/generic JSON patch。

**stream**至少覆盖：

1. role-only空content首帧算progress；
2. content/reasoning/tool_call/finish reason算progress；
3. pure `usage:null`不续命，content+usage:null仍算正文progress；
4. final non-null Usage正确投影；
5. `[DONE]`终止；正常EOF无`[DONE]`为`stream_terminal_missing`；
6. invalid JSON立即protocol error；
7. timeout winner不被late ECONNRESET覆盖。

**Tool continuation**：真实两轮request：第一轮assistant tool call，第二轮包含tool result；两轮均复用同一exact
mapping/release/deadline。不得保存或回传隐藏reasoning/thinking state。

### 3.7 G7：Lifecycle / crash / replay

至少覆盖named barriers：

```text
policy_loaded
subject_materialized
invocation_link_prepared
dispatch_claimed
output_started
terminal_committed
```

规则：

- policy_loaded/subject_materialized前后崩溃：fresh process重算同一release digest；
- link prepared后：沿用migration 25 exact deadline，不重新now+900s；
- request sent前崩溃：可安全重派；
- request sent/output started后崩溃：保留既有at-least-once/resume-unavailable诚实语义，不伪造exactly-once；
- terminal replay：policy/materializer/mapping/upstream/Usage增量为0；
- SQLite reopen使用原文件，新PID由OS验证，禁止delete/recreate或throw冒充SIGKILL。

### 3.8 G8：Production installation boundary

PRA-3可交付：

- code-owned admitted V2 policy；
- exact policy source；
- admitted-capable materializer；
- future consumer可用的sealed installer factory。

PRA-3不得：

- 在production bootstrap遍历用户Personal Models并预装release；
- 把fixture subject/Secret/endpoint注册到production；
- 把release注入SubmitTurn、Reasoning Preview或Provider registry consumer。

关闭时证据口径：

```text
codeOwnedAdmittedPolicyCount=1
productionMaterializerCanAdmitExactSubject=true
productionBootstrapInstalledSubjectReleaseCount=0
productionReleaseRegistryConsumerCount=0
productionSubmitTurnMaxReachable=false
desktopMaxUiReady=false
```

### 3.9 G9：No current fallback / revocation

- historical Task/accepted plan若未来绑定release，必须使用exact revision/digest；
- admitted policy被新revision撤销只影响新materialization，不改历史durable fact；
- subject/head/Profile/projector/timeout漂移返回typed unavailable/conflict，不切current policy或default；
- V1 pending与V2 admitted可并存，但exact source不得返回两条；
- DeepSeek exclusion继续requires_mapping_revision。

### 3.10 G10：泄漏、资源与诚实输出

80次负向泄漏：5 canary（Secret/Authorization/endpoint/private directive/owner material）×4编码×4通道；正常命中0。
资源真实归零：fixture process、Core child、SQLite、HTTPS server/client sockets、TLS sessions、DNS lookup hooks、timers、
AbortController、stream iterators、temporary CA files、Credential byte copies、release registries、listeners。

最高输出：

```text
PRA3_PROVIDER_LIFECYCLE_ADMISSION_CONFORMANT
codeOwnedAdmittedPolicyCount=1
productionBootstrapInstalledSubjectReleaseCount=0
productionReleaseRegistryConsumerCount=0
productionSubmitTurnMaxReachable=false
desktopMaxUiReady=false
productionReady=false
```

## 4. Typed error 与安全摘要

| code | 安全摘要 |
| --- | --- |
| `provider_release.conformance_manifest_invalid` | Max 准入验证材料不完整 |
| `provider_release.policy_integrity_invalid` | Max 准入策略校验失败 |
| `provider_release.policy_not_admitted` | 当前模型尚未完成 Max 准入验证 |
| `provider_release.subject_invalid` | 当前模型运行身份不一致 |
| `provider_release.endpoint_mismatch` | 模型接入地址与准入策略不一致 |
| `provider_release.identity_mismatch` | 模型适配身份校验失败 |
| `provider_release.lifecycle_unavailable` | 当前模型调用无法安全恢复 |
| `provider_release.materialization_conflict` | Max 准入材料发生冲突 |
| `personal_model.test_transport_forbidden` | 当前运行环境禁止测试专用模型传输 |

日志/evidence/failure summary只输出code + fixed safe summary，不输出URL/model string/digest/Secret/Zod path/stack。
`personal_model.test_transport_forbidden` 属既有 Local Personal raw Provider 构造边界，PRA-3 只复用并验证，不复制或
改写其错误分类。

## 5. 生命周期矩阵

### 5.1 Conformance C1～C10

1. C1 V1 pending仍只产pending；
2. C2 V2 admitted + exact manifest产admitted；
3. C3损坏manifest拒绝；
4. C4 alias model拒绝；
5. C5 endpoint漂移拒绝；
6. C6 adapter/projector/timeout漂移拒绝；
7. C7 default body完全省略；
8. C8 max body exact xhigh；
9. C9 Tool continuation两轮同release；
10. C10 terminal replay零调用。

### 5.2 Crash L1～L8

1. L1 policy_loaded前；
2. L2 policy_loaded后；
3. L3 subject_materialized后；
4. L4 invocation_link_prepared后；
5. L5 dispatch_claimed后；
6. L6 output_started后；
7. L7 terminal_before_commit；
8. L8 terminal_committed后response loss。

每个窗口记录PID、barrier、release digest、deadline、link状态、provider request count、Usage count与资源计数；权威字段
不允许通过normalization删除以伪造semantic一致。

## 6. 实施步骤与工期

### Step 1：Policy V2 / manifest / exact source（1～2 日）

- V1 byte freeze、V2/readable union；
- manifest/vector digest；
- exact source、duplicate/revocation/supersession。

### Step 2：Admitted materializer / installer boundary（1～1.5 日）

- module-private admitted constructor；
- exact manifest/policy/subject binding；
- production consumer=0 boundary。

### Step 3：Real TLS/SSE/Tool continuation conformance（1～2 日）

- lookup/Host/SNI/test CA；
- default/max/Usage/EOF/timeout/tool rounds；
- content-free vector evidence。

### Step 4：SIGKILL/reopen/replay closure（1～1.5 日）

- named barriers、new PID、SQLite reopen；
- semantic replay、leak/resource scans、historical regression。

细化估算：**4～7 个集中工程日**，替代父计划 3～5 日粗估。增加量来自 admitted policy additive version、真实TLS
fixture与多窗口恢复证据，不包含DFI-5.4.1消费接线。

## 7. 文件边界

### 7.1 允许

- `services/core/src/application/provider-release-admission-policy*`；
- `exact-subject-provider-release-materializer.ts` 的additive V2/admitted path；
- exact source/installer boundary/private ports；
- `services/core/tests/**pra3**`、fixtures、scripts、artifacts、docs；
- package scripts/version/governance（编码批获授权后）。

### 7.2 禁止

- Desktop/Main/Preload/Renderer/Admin/Central/Document Worker production code；
- Local Provider body语义变更（若fixture暴露缺口必须停手做mapping revision）；
- DFI-5.3/PRA-1/PRA-2 historical evidence覆盖；
- migration、依赖、lockfile；
- production bootstrap/SubmitTurn/Preview/UI consumer。

## 8. QA 矩阵（84 项）

### 8.1 Policy / manifest（QA-001～QA-014）

1. QA-001：V1 source hash零漂移。
2. QA-002：V1 policy/evidence digest零漂移。
3. QA-003：V2 schema strict且version独立。
4. QA-004：V2必须productionAdmitted=true。
5. QA-005：V2必须supersede exact V1 revision。
6. QA-006：V2必须绑定manifest ref三元组。
7. QA-007：readable union单次dispatch。
8. QA-008：损坏V2不fallback V1。
9. QA-009：manifest content-free。
10. QA-010：manifest vector digest可重算。
11. QA-011：manifest无outer evidence循环。
12. QA-012：exact source duplicate fail-fast。
13. QA-013：无current/latest/family fallback。
14. QA-014：DeepSeek exclusion不漂移。

### 8.2 Materializer / admission（QA-015～QA-028）

15. QA-015：V1只产pending/rejected。
16. QA-016：V2 exact才产admitted。
17. QA-017：private proof仅模块内构造。
18. QA-018：文档不宣称runtime密码学防伪。
19. QA-019：local authority exact。
20. QA-020：definition/head/status exact。
21. QA-021：Credential observation exact且不resolve Secret。
22. QA-022：Task lock/subject exact。
23. QA-023：endpoint final tuple exact。
24. QA-024：adapter/projector/timeout exact。
25. QA-025：DFI-5.3 release helper唯一。
26. QA-026：相同input release/envelope确定。
27. QA-027：漂移改变digest或typed reject。
28. QA-028：partial release不从rejected泄漏。

### 8.3 Provider protocol（QA-029～QA-042）

29. QA-029：真实HTTPS fixture process。
30. QA-030：test CA/lookup只在test可用；production启用loopback精确返回personal_model.test_transport_forbidden。
31. QA-031：canonical Host/SNI不被loopback替代。
32. QA-032：default reasoning字段计数0。
33. QA-033：default其余body与legacy等价。
34. QA-034：max只含reasoning_effort=xhigh。
35. QA-035：boolean/budget/JSON patch拒绝。
36. QA-036：role-only帧算progress。
37. QA-037：pure usage:null不续命。
38. QA-038：content+usage:null算progress。
39. QA-039：final Usage正确。
40. QA-040：[DONE]终态正确。
41. QA-041：EOF无[DONE]为terminal_missing。
42. QA-042：invalid JSON立即protocol error。

### 8.4 Tool / timeout / lifecycle（QA-043～QA-056）

43. QA-043：Tool call首轮真实SSE。
44. QA-044：Tool result第二轮真实HTTP。
45. QA-045：两轮同release/mapping/deadline。
46. QA-046：不持久化private reasoning state。
47. QA-047：connect/first/idle/overall cause精确。
48. QA-048：late ECONNRESET不覆盖timeout。
49. QA-049：L1/L2 policy读取规定次数。
50. QA-050：L3重算同release digest。
51. QA-051：L4复用exact deadline。
52. QA-052：L5保留at-least-once诚实性。
53. QA-053：L6 resume-unavailable诚实性。
54. QA-054：L7 terminal single winner。
55. QA-055：L8 response loss replay零调用。
56. QA-056：真实SIGKILL/new PID/SQLite reopen。

### 8.5 Boundary / readiness（QA-057～QA-070）

57. QA-057：codeOwnedAdmittedPolicyCount=1。
58. QA-058：production materializer exact subject可admit。
59. QA-059：bootstrap installed subject release count=0。
60. QA-060：production registry consumer count=0。
61. QA-061：SubmitTurn Max不可达。
62. QA-062：Desktop Max UI false。
63. QA-063：R2D production activation false。
64. QA-064：fixture subject/Secret不进production graph。
65. QA-065：public Contract无private mapping/policy。
66. QA-066：Desktop/Admin/Central零consumer。
67. QA-067：migration止26。
68. QA-068：lockfile不变。
69. QA-069：新增依赖0。
70. QA-070：historical evidence只读不漂移。

### 8.6 Security / closure（QA-071～QA-084）

71. QA-071：80次负向泄漏全检出。
72. QA-072：正常四通道命中0。
73. QA-073：Secret byte copy清零。
74. QA-074：临时CA/cert资源清理。
75. QA-075：socket/timer/iterator/listener全0。
76. QA-076：缺失资源字段不得当0。
77. QA-077：三轮fresh-process semantic digest一致。
78. QA-078：权威字段漂移改变semantic digest。
79. QA-079：root check通过。
80. QA-080：Central online/offline通过。
81. QA-081：lint/architecture/audit通过。
82. QA-082：historical harness全绿。
83. QA-083：无skip/only/Disabled/sleep/retry逃逸。
84. QA-084：outcome不宣称production ready。

## 9. 正式门禁

```text
Node 24.13.0 / pnpm 11.11.0 preflight
focused policy-v2 / manifest / materializer / TLS-SSE / lifecycle tests
harness:pra3
harness:pra2 / pra1 / dfi5.3.4 / dfi5.3.3 / dfi5.3.2 / dfi5.3.1 / dfi5.2.3 / cpc3
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline
lockfile / migration / historical hash / consumer / leak / resource scans
```

## 10. 停手条件

出现任一情况立即停止并回评审：

1. 必须原地扩宽PRA-1 V1或改历史digest；
2. 必须把unique symbol宣称为runtime security authority；
3. 必须用公网/真实Secret/付费调用；
4. 必须放宽endpoint/model snapshot exact规则才能连fixture；
5. 必须新增directive/private reasoning continuation/token/Gateway schema；
6. Tool continuation需要持久化hidden reasoning state；
7. 必须在production bootstrap安装fixture subject/release；
8. 必须接SubmitTurn/Preview/Desktop UI才能证明本批；
9. 必须修改DFI-5.3/PRA historical evidence；
10. 必须新增migration、依赖或lockfile变化；
11. 资源/泄漏计数只能硬编码或缺失字段当0；
12. root/Central失败来自并发窗口且无法安全归因。

## 11. 文档评审问题

1. 是否接受V1 pending byte freeze、additive V2 admitted policy？
2. 是否接受code-owned conformance manifest而非Harness outer evidence作为admission authority？
3. 是否接受`unique symbol`只作编译期隔离，运行时authority来自exact policy/manifest/subject/digest？
4. 是否接受controlled TLS/SSE fixture足以证明adapter protocol conformance，但不证明用户endpoint当前可用？
5. 是否接受GPT-5.2 exact snapshot为唯一admitted candidate，DeepSeek继续excluded？
6. 是否接受PRA-3交付admitted source/materializer，但production bootstrap registry consumer仍为0？
7. 是否接受request-sent/output-started后保留at-least-once/resume-unavailable语义？
8. 是否接受84项QA与4～7日细化估算？
9. 是否确认本批不解锁DFI-5.4.1、R2D activation、Desktop Max、TGM、Knowledge或Agent Lifecycle？

## 12. 当前状态

```text
PRA-1                                PASS/CLOSED
PRA-2 repair.1                       PASS/CLOSED
PRA-2                                PASS/CLOSED
PRA-3                                PASS/CLOSED
R2D-P.1                              PASS/CLOSED
R2D-P.2                              PASS/CLOSED
R2D-P.3                              PASS/CLOSED
DFI-5.4.1～5.4.3                     GATED
code-owned admitted policy count     1
production registry consumer count   0
production SubmitTurn Max            false
Desktop Max UI                        false
```
