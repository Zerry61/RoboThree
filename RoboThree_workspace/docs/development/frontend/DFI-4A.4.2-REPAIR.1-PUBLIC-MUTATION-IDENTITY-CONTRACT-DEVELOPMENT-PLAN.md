# DFI-4A.4.2 repair.1 Public Mutation Identity Contract 聚焦实施方案

> 状态：**DEFERRED BY MVP-VERTICAL-SLICE-1 / CODING GATED**  
> 日期：2026-08-29  
> 负责人：Codex 5.6  
> 触发来源：[DFI-4A.4.3 编码前停手报告](./DFI-4A.4.3-PRE-CODE-PUBLIC-MUTATION-IDENTITY-STOP-REPORT.md)  
> 已关闭上游：DFI-4A.4.1、STRM-3、DFI-4A.4.2 `PASS/CLOSED`  
> 阻塞下游：DFI-4A.4.3、Renderer Personal Model UI 继续 `GATED`

> 2026-08-29 优先级更新：本方案不再作为当前下一批。用户要求从底座分层建设切换为真实任务垂直交付，当前唯一
> P0 改为 [MVP-VERTICAL-SLICE-1](../MVP-VERTICAL-SLICE-1-REAL-TASK-END-TO-END-DEVELOPMENT-PLAN.md)。本方案保留为
> P0.5 历史候选，不进入文档复核或编码；未来恢复仍需重新确认产品优先级与单独授权。

## 0. 结论先行

DFI-4A.4.2 repair.1 只修复一个公开接口闭环：当前
`personal-model-management.v1alpha2` 的 update/delete/reveal 命令要求调用方提交
`expectedExecutionDefinitionDigest`，但 List/Detail 安全投影不返回该值，真实 Renderer 无法从公开 API 构造命令。

本批采用 **additive v1alpha3**，冻结 v1alpha1/v1alpha2 字节，不修改既有 durable Coordinator、Receipt、Recovery、
STRM v1 或 SQLite schema。Core 在同一次 head/definition/status 快照中已经读取到 configuration 与 execution 两个
revision；v1alpha3 只把这对 content-free concurrency facts 作为一个不可拆分的 public mutation identity 投影：

```text
mutationIdentity = {
  schemaVersion: "personal-model-mutation-identity.v1alpha1",
  configurationRevision,
  executionDefinitionDigest
}
```

v1alpha3 update/delete/reveal 只接受 `expectedMutationIdentity`，Core 将其逐字段映射到既有 v1alpha2 internal command
material，再由原 Coordinator 做 exact pair 校验。Main/Preload/Renderer 不得查询 current 值、推导 digest、回退到
`configurationRevision` 单值或保存隐藏缓存。

本批完成后最高只允许输出：

```text
DFI4A42_REPAIR1_PUBLIC_MUTATION_IDENTITY_CONFORMANT
```

它只解除 DFI-4A.4.3 的 public command-construction blocker，不代表 Personal Model production ready，不自动恢复
DFI-4A.4.3 编码，也不授权 Renderer UI、正式签名 Helper、production CRUD/Reveal 或其他下游。

## 1. 已核实事实与缺口

### 1.1 已关闭事实

1. v1alpha1 只读 Contract 已由 DFI-4A.4.1 关闭；
2. v1alpha2 八方法、STRM/A2 分流、Coordinator/Recovery/Reveal 已由 DFI-4A.4.2 关闭；
3. `PersonalModelManagementReadService.#project` 已在同一逻辑快照中读取 active head、exact configuration
   definition、exact status fact 与 credential masked observation；
4. Read Service 已验证
   `definition.executionDefinitionDigest === head.currentExecutionDefinitionDigest === status.executionDefinitionDigest`；
5. update/delete/reveal 的既有 Coordinator 会同时校验 configuration revision 与 execution definition digest；
6. v1alpha2 Preload 使用 strict Zod parse，Main Router 只做 lease/identity/transport 接线，没有安全补值入口；
7. migration 仍止 26；当前 lockfile 基线为
   `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

### 1.2 精确缺口

`PersonalModelSafeProjectionV1Alpha2Schema` 只提供 `configurationRevision`。以下命令却都要求
`expectedExecutionDefinitionDigest`：Update、Delete、Reveal。现有 Integration Test 能完成这些操作，是因为测试
直接从 persistence 读取 `head.currentExecutionDefinitionDigest`；这不是 Renderer 可用的公开链路。

## 2. 范围

### 2.1 本批必须交付

1. additive exact package subpath：
   `@robothree/contracts/desktop-local/personal-model-management/v1alpha3`；
2. frozen `PersonalModelMutationIdentityV1Alpha3` strict schema；
3. v1alpha3 Compatibility/List/Detail/Create/Update/Delete/Reveal/Query 八方法 Contract；
4. v1alpha3 Core-private 八条 exact route 与 Facade single-dispatch；
5. Read Service 同快照 projection material 与 v1/v2 zero-drift 显式投影；
6. v1alpha3 expected mutation identity → 既有 Coordinator command 的逐字段映射；
7. v1alpha3 Main IPC Router、八条 exact IPC channel 与 runtime lease revalidation；
8. frozen sandboxed Preload `window.robothreePersonalModelV1Alpha3` 八方法；
9. Contract/Core/Main/Preload focused tests、Harness/Evidence、实施报告；
10. DFI-4A.4.3 恢复前的 Frontend API handoff 修订。

### 2.2 明确禁止

- 修改 personal-model-management v1alpha1/v1alpha2 任一源文件字节；
- 从 Contracts root、desktop-local root 或既有 v1alpha1/v1alpha2 subpath 导出 v1alpha3；
- 新 migration、表、索引、durable token store、依赖或 lockfile 变化；
- 新 Coordinator、Receipt、Recovery、Reveal 状态机；
- Renderer consumer、页面、Store、LocalStorage 或 Mock success；
- Main/Preload 查 SQLite、缓存 current identity 或向 Renderer 隐式补值；
- 把 configuration revision 当作 execution digest；
- 输出 Credential Reference、owner digest、Endpoint、Secret、definition material 或本机路径；
- 修改 STRM-3、DFI-4A.4.1/4A.4.2/DFI-5.x historical Harness/Evidence；
- 正式 Helper signing/notarization、Enterprise/Admin/TGM/Knowledge/Agent Lifecycle 开发。

## 3. G1：additive v1alpha3 Contract

### 3.1 Contract version 与 subpath

```text
PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA3
  = "personal-model-management.v1alpha3"
```

新增且只新增 v1alpha3 source directory 与 `packages/contracts/package.json` exact export。构建后必须真实
`import("@robothree/contracts/desktop-local/personal-model-management/v1alpha3")`，并验证 JS/declaration 产物。
v1alpha1/v1alpha2 同时冻结 source hash、built import、historical Evidence digest 与既有 corpus。

### 3.2 Mutation Identity

```ts
PersonalModelMutationIdentityV1Alpha3Schema = z.object({
  schemaVersion: z.literal("personal-model-mutation-identity.v1alpha1"),
  configurationRevision: Sha256DigestSchema,
  executionDefinitionDigest: Sha256DigestSchema,
}).strict()
```

它是 content-free optimistic-concurrency identity，不是 authorization token、Credential identity、Receipt、selection
digest 或 current alias。两个字段必须作为整体从同一 Read Service 快照产生、原样回传并一起校验。

### 3.3 Safe Projection

v1alpha3 保留 v1alpha2 安全展示字段，并新增 `mutationIdentity`。顶层 `configurationRevision` 继续存在，并强制与
`mutationIdentity.configurationRevision` 相等。不得公开 definition JSON、canonical endpoint、Credential
Reference、credential binding、owner identity 或 status private digest；List/Detail 使用同一 item schema。

### 3.4 Command schemas

- Create：与 v1alpha2 语义一致，不要求 expected identity；
- Update/Delete/Reveal：只接受 `expectedMutationIdentity`，不接受两个散列旧字段；
- Query Operation：保持 command identity 查询；
- Transport Preparation：update/reveal 携带 exact `expectedMutationIdentity`，Main 显式投影给 frozen STRM private
  material需要的两个字段；create 不伪造 execution identity。

所有 schema `.strict()`；缺字段、额外字段、null、单 digest、混合来自不同 Projection 的 pair 均拒绝。

## 4. G2：Read Service 同快照 authority

### 4.1 单一 projection material

在 `PersonalModelManagementReadService` 内部抽取 Core-private projection material，包含 safe display fields、
configuration revision 与 execution definition digest。它必须来自一次
`loadHead → loadDefinition → loadStatus → credentials.inspect` 链，并继续验证 head/definition/status execution
identity exact equality。不得先返回 v1alpha2 projection，再第二次查询 current digest。

### 4.2 显式版本投影

- v1alpha1/v1alpha2：逐字段投影既有 safe shape，明确丢弃 execution digest；
- v1alpha3：逐字段投影同一 safe shape，并构造 exact mutation identity；
- 禁止对内部 material 使用 `{...material}` 直接扩散到公共 Contract；
- v1/v2 JSON corpus、排序、queryRevision、error envelope 必须零漂移。

### 4.3 漂移语义

- head/definition/status identity 不一致：typed internal/fail-closed，不返回部分 identity；
- projection 后 authority 漂移：Coordinator 返回 revision conflict，不查 current fallback；
- List item 各自使用一致快照，page queryRevision 不冒充 mutation identity；
- retry/restart 复用调用方提交的 expected pair，不重写为 current pair。

## 5. G3：Core command compatibility adapter

v1alpha3 Facade strict parse 后逐字段映射：

```text
expectedMutationIdentity.configurationRevision -> expectedConfigurationRevision
expectedMutationIdentity.executionDefinitionDigest -> expectedExecutionDefinitionDigest
```

映射后调用既有 `PersonalModelManagementCommandService`。不得复制 command digest、Coordinator、operation gate、
deletion guard、recovery、Reveal Service 或 Receipt projection。

必须证明 exact pair 正常；stale configuration、stale execution、mixed pair 均 typed fail-closed；same command/exact
material replay exact Receipt；same command/different pair material conflict；所有拒绝发生在 Helper/Keychain/Provider/
STRM 之前。

## 6. G4：Core HTTP / Main IPC / Preload

### 6.1 Core-private HTTP

新增 `/personal-model-management/v1alpha3/*` 八条 exact route，禁止 generic dispatcher。Host/Origin/Bearer、body
limit、typed safe error 与 v1alpha2 相同；未知版本不得 fallback v1alpha2。

### 6.2 Main IPC

新增八个 exact channel：compatibility/list/detail/create/update/delete/reveal/query-operation。Router 必须复用 main-frame
authorization、单 window/client binding、cap=16、connection lease、runtime_changed 与 navigation/process-gone/
destroyed cleanup。transport preparation 只在 exact lease 下映射到既有 Controller。

### 6.3 Preload

新增 frozen `window.robothreePersonalModelV1Alpha3` 八方法。继续执行 strict parse、Secret bounded copy/clear、
query-after-transport、Reveal single consumer。Preload 不缓存 identity、不自动刷新 current identity、不静默重试；
Renderer consumer count 本批保持 0。

## 7. G5：Compatibility、版本与恢复

1. Compatibility 只在 supported versions 明确包含 v1alpha3 时成功；
2. v1alpha1/v1alpha2/v1alpha3 single-dispatch，无 downgrade fallback；
3. restart 后旧 Main binding 返回 `personal_model.runtime_changed`；
4. 后续 Renderer 必须重新 Compatibility + Detail 获得 exact identity；
5. response loss 通过原 command ID 查询 Receipt，不用 current identity改写原 command；
6. identity 不进入 LocalStorage、URL、日志、Toast、clipboard 或 telemetry；
7. Evidence 只记录 schema/version/count/hash，不记录真实 digest 值。

## 8. G6：诚实 readiness

repair.1 完成后只允许：

```text
outcome = DFI4A42_REPAIR1_PUBLIC_MUTATION_IDENTITY_CONFORMANT
publicMutationIdentityContractReady = true
dfi4a43Unblocked = true
dfi4a43CodingResumed = false
rendererPersonalModelUiReady = false
productionHelperAssetPresent = false
productionPersonalModelCrudReady = false
productionCredentialRevealReady = false
productionPackagingReady = false
enterpriseIdentityReady = false
adminV2Ready = false
tgmReady = false
knowledgeProviderReady = false
agentLifecycleReady = false
```

`dfi4a43Unblocked=true` 只表示 Contract blocker 已解除；恢复 DFI-4A.4.3 仍需独立 QA、用户接受 repair.1 与重新授权。

## 9. 文件边界

### 9.1 编码获批后允许

- v1alpha3 Contract source、exact package export 与 focused tests；
- Read Service internal projection material；
- Facade/Core HTTP/Client v1alpha3 additive methods；
- Desktop shared/Main/Preload v1alpha3 additive API；
- focused tests、repair.1 Harness/Evidence/实施报告；
- Root/Core/Contracts/Desktop 版本同步为 `0.0.0-dfi.4a.4.2-repair.1`；Admin 独立版本不动。

### 9.2 继续禁止

v1alpha1/v1alpha2 source、Renderer、Coordinator/Recovery/Reveal/STRM 业务语义、migration、依赖、lockfile、
production Helper、historical Harness/Evidence、DFI-4A.4.3 实现与全部其他下游。

## 10. 实施步骤与工期

1. Contract + zero-drift（0.5～1 日）；
2. Read/Facade mapping（0.75～1.25 日）；
3. HTTP/Main/Preload（0.75～1.25 日）；
4. Harness/Evidence/report（0.5～1 日）。

合计 2.5～4.5 日，计划口径 **3～5 个集中工程日**。不含独立 QA、DFI-4A.4.3 恢复、Renderer UI 或 Helper packaging。

## 11. Focused QA 矩阵（96 项）

### 11.1 Contract / zero drift（QA-001～QA-016）

1. QA-001 v1alpha1 source hash 不漂移；
2. QA-002 v1alpha2 source hash 不漂移；
3. QA-003 v1alpha1 built import 不漂移；
4. QA-004 v1alpha2 built import 不漂移；
5. QA-005 v1alpha3 exact subpath 可导入；
6. QA-006 v1alpha3 JS artifact 存在；
7. QA-007 v1alpha3 declaration artifact 存在；
8. QA-008 Contracts root 不导出 v1alpha3；
9. QA-009 desktop-local root 不导出 v1alpha3；
10. QA-010 mutation identity schema strict；
11. QA-011 mutation identity 两 digest 必填；
12. QA-012 mutation identity null/额外字段拒绝；
13. QA-013 projection 顶层 configuration 与 identity exact；
14. QA-014 List/Detail 使用同一 item schema；
15. QA-015 v1/v2 corpus byte-equivalent；
16. QA-016 historical DFI-4A.4.2 Evidence 不漂移；

### 11.2 Command semantics（QA-017～QA-032）

17. QA-017 create 不要求 expected identity；
18. QA-018 update 只接受 expectedMutationIdentity；
19. QA-019 delete 只接受 expectedMutationIdentity；
20. QA-020 reveal 只接受 expectedMutationIdentity；
21. QA-021 散列旧字段不能混入 v1alpha3；
22. QA-022 单 configuration digest 拒绝；
23. QA-023 单 execution digest 拒绝；
24. QA-024 exact pair 显式映射；
25. QA-025 stale configuration typed conflict；
26. QA-026 stale execution typed conflict；
27. QA-027 mixed pair typed conflict；
28. QA-028 rejection 前 Helper count=0；
29. QA-029 rejection 前 Keychain count=0；
30. QA-030 rejection 前 Provider/STRM count=0；
31. QA-031 same command/exact material Receipt replay；
32. QA-032 same command/different pair material conflict；

### 11.3 Read authority（QA-033～QA-048）

33. QA-033 head/definition/status 同 identity；
34. QA-034 identity mismatch fail-closed；
35. QA-035 同一次 projection material 产生 pair；
36. QA-036 禁止 v2 projection 后二次 current lookup；
37. QA-037 v1 显式投影不泄漏 execution digest；
38. QA-038 v2 显式投影不泄漏 execution digest；
39. QA-039 v3 只新增 mutation identity；
40. QA-040 v3 无 definition JSON；
41. QA-041 v3 无 canonical endpoint；
42. QA-042 v3 无 Credential Reference；
43. QA-043 v3 无 owner digest；
44. QA-044 v3 无 private status digest；
45. QA-045 List identity exact；
46. QA-046 Detail identity exact；
47. QA-047 queryRevision 不冒充 mutation identity；
48. QA-048 authority 漂移不 current fallback；

### 11.4 HTTP / Main / Preload（QA-049～QA-064）

49. QA-049 Core v1alpha3 route count=8；
50. QA-050 mutation route count=3；
51. QA-051 reveal route count=1；
52. QA-052 generic dispatcher count=0；
53. QA-053 Host/Origin/Bearer 保持；
54. QA-054 unknown version fail-closed；
55. QA-055 Main IPC count=8；
56. QA-056 Main main-frame authorization；
57. QA-057 Main client binding cap=16；
58. QA-058 Main exact connection lease；
59. QA-059 runtime_changed 后无静默 retry；
60. QA-060 navigation/process-gone/destroyed cleanup；
61. QA-061 Preload frozen method count=8；
62. QA-062 Preload strict input/output parse；
63. QA-063 mutation Secret bounded copy/clear；
64. QA-064 Reveal single consumer/no replay；

### 11.5 Compatibility / lifecycle（QA-065～QA-080）

65. QA-065 v1/v2/v3 single-dispatch；
66. QA-066 v3 negotiation requires explicit support；
67. QA-067 no downgrade fallback；
68. QA-068 old runtime binding typed conflict；
69. QA-069 reconnect 后重新 Compatibility；
70. QA-070 reconnect 后重新 Detail；
71. QA-071 original command replay 不重写 identity；
72. QA-072 response loss query exact command；
73. QA-073 update transport carries exact pair；
74. QA-074 reveal transport carries exact pair；
75. QA-075 create transport 不伪造 execution digest；
76. QA-076 reuse-existing zero Secret 不漂移；
77. QA-077 delete zero Secret 不漂移；
78. QA-078 operation gate 不复制；
79. QA-079 Coordinator/Recovery implementation count 不增加；
80. QA-080 v1alpha3 error envelope safe/content-free；

### 11.6 Boundary / evidence / honesty（QA-081～QA-096）

81. QA-081 Renderer v1alpha3 consumer count=0；
82. QA-082 Admin/Central/Document Worker consumer count=0；
83. QA-083 migration max=26；
84. QA-084 lockfile digest 不漂移；
85. QA-085 dependency count 不变；
86. QA-086 production Helper asset 仍 false；
87. QA-087 historical Harness/Evidence 不改写；
88. QA-088 DFI-4A.4.3 code/Harness/Evidence 仍未恢复；
89. QA-089 focused 96 项连续唯一；
90. QA-090 test 无 skip/only/sleep 逃逸；
91. QA-091 Evidence 不记录真实 mutation digest；
92. QA-092 Evidence 不记录敏感 material/path；
93. QA-093 outcome exact；
94. QA-094 publicMutationIdentityContractReady=true；
95. QA-095 dfi4a43Unblocked=true 且 codingResumed=false；
96. QA-096 全部 production/downstream readiness false 集合完整。

## 12. 正式门禁

编码获批后至少串行执行：

```bash
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r
CI=true pnpm run harness:dfi4a4.2-repair.1
CI=true pnpm run harness:dfi4a4.2
CI=true pnpm run harness:strm3
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run lint
CI=true pnpm run typecheck
CI=true pnpm run audit:dtp4
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central:offline
```

Historical Harness 只读；若因合法版本/subpath 演进失效，以 immutable historical Evidence + 当前 focused Harness
证明，不改旧 snapshot。

## 13. 停手条件

1. 需要修改 v1alpha1/v1alpha2 source；
2. 需要修改 frozen STRM v1；
3. 需要新 Coordinator/Receipt/Recovery/Reveal 状态机；
4. 需要 Main/Preload 查询 SQLite；
5. 需要 current/latest/fallback identity；
6. 需要把 configuration digest 当 execution digest；
7. 需要第二次 authority read 才能构造同一 Projection；
8. 需要把 internal material spread 到公共 Contract；
9. 需要 migration、依赖或 lockfile 变化；
10. 需要修改 Renderer；
11. 需要正式 Helper binary/signing；
12. 需要公网/真实 Key/付费 Provider；
13. 需要记录真实 mutation digest/owner/credential/path；
14. 需要改写 historical Harness/Evidence；
15. 无法保持 v1/v2 corpus zero drift；
16. v1alpha3 只能通过 root export 才能消费；
17. repair 关闭必须宣称 production ready；
18. root/Central 稳定失败无法在正确环境聚焦归因。

## 14. 独立评审问题

1. 是否接受 additive v1alpha3 且 v1alpha1/v1alpha2 byte frozen？
2. 是否接受 mutation identity 是 exact configuration/execution pair，而不是 current alias/token？
3. 是否接受顶层 configurationRevision 与 nested identity 强制相等？
4. 是否接受 update/delete/reveal 只接收 expectedMutationIdentity？
5. 是否接受 Read Service 单次快照产生 safe projection + identity？
6. 是否接受 v1/v2 显式投影移除 execution digest、禁止 spread？
7. 是否接受 v1alpha3 映射到既有 Coordinator，不新建状态机？
8. 是否接受八 Core route、八 IPC、八 frozen Preload methods，Renderer consumer=0？
9. 是否接受 runtime_changed 后重新 negotiation/detail，不静默 retry？
10. 是否接受 migration/依赖/lockfile/Helper/historical evidence 零变化？
11. 是否接受 repair 完成只解除 Contract blocker，不自动恢复 DFI-4A.4.3？
12. 是否接受 3～5 个集中工程日估算与编码继续单独 GATED？

评审输出必须包含：`PASS / PASS_WITH_REVISIONS / RED`、P0～P3、是否可冻结、是否继续 Coding Gated。

## 15. 当前门禁

```text
DFI-4A.4.1                              PASS/CLOSED
STRM-3                                   PASS/CLOSED
DFI-4A.4.2                               PASS/CLOSED
MVP-VERTICAL-SLICE-1                    DOCUMENT REVIEW PENDING / CODING GATED
DFI-4A.4.2 repair.1 Public Mutation ID  DEFERRED / CODING GATED
DFI-4A.4.3                               DEFERRED / IMPLEMENTATION STOPPED
Desktop Renderer Personal Model UI      GATED
production Helper / CRUD / Reveal       false
Enterprise/Admin/TGM/Knowledge/Agent Lifecycle GATED
```

本方案已被降为 P0.5 历史候选，不进入当前评审。用户未来重新提升优先级并单独授权前，不得创建 v1alpha3 Contract、
代码、测试、Harness、Evidence，不得修改版本、依赖、migration 或 lockfile，也不得恢复 DFI-4A.4.3。
