# DFI-4A.4.2 Personal Model CRUD / Credential Reveal / Durable Recovery 详细实施方案

> 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-29  
> 负责人：Codex 5.6  
> 已关闭上游：DFI-4A.4.1、STRM-3 `PASS/CLOSED`  
> 父计划：[DFI-4A.4 Revision 2](./DFI-4A.4-REVISION-2-LOCAL-PERSONAL-MODEL-CRUD-CREDENTIAL-PACKAGING-DEVELOPMENT-PLAN.md)  
> 直接下游：DFI-4A.4.3、Desktop Renderer Personal Model UI 继续 `GATED`  
> 当前授权边界：A2 聚焦修订、实现、独立 QA 与用户接受均已关闭；DFI-4A.4.3 不自动解锁

## 0. 结论先行

DFI-4A.4.2 不是重新开发个人模型存储，也不是直接开放 Renderer 表单。现有 Core 已具备 Personal Model
SQLite persistence、Keychain Store、Credential Coordinator、Reveal Service、Operation Journal、Receipt、Broker
handler 与恢复逻辑；STRM-3 已关闭 Electron sensitive transport blocker。当前剩余工作是把这些能力组成唯一正常
Desktop 业务图，并建立一条 **普通字段走严格 JSON Contract、密钥字节只走 STRM MessagePort + fd4/fd5** 的安全
管理接口。

本批计划交付：

1. byte-freeze 已关闭的 `personal-model-management/v1alpha1` 只读 Contract；新增 additive
   `personal-model-management/v1alpha2` CRUD / Reveal / Operation Query Contract；
2. 新增 exact Core private routes、Main IPC 与 sandboxed Preload API；禁止 generic dispatcher；
3. normal Core graph 安装唯一 production Personal Model business handler，复用现有 Coordinator、Reveal Service、
   Operation Journal、Receipt、Keychain Store 与 STRM transport；
4. create/update/delete 实现 durable prepare、exact command replay、conflict、uncertain、manual attention、
   cleanup pending 与 restart recovery；
5. reveal 每次重新校验 owner、model revision、Credential binding、限频、单并发和 deadline，不持久化“用户已看到”；
6. 用受控 `test_isolated` 原生 Helper 与临时真实 Keychain 证明实现链路，但不把它冒充正式签名安装包资产。

只有实现、开发者门禁、独立 QA 和用户接受全部完成后，本批最高允许输出：

```text
DFI4A42_PERSONAL_MODEL_CRUD_REVEAL_RECOVERY_CONFORMANT
```

它必须同时附带：

```text
productionSensitiveTransportReady = true
productionBusinessHandlerInstalled = true
productionBusinessHandlerReady = false
productionHelperAssetPresent = false
productionPersonalModelCrudReady = false
productionCredentialRevealReady = false
rendererPersonalModelUiReady = false
dfi4a43Unlocked = false
enterpriseIdentityReady = false
adminV2Ready = false
tgmReady = false
knowledgeProviderReady = false
agentLifecycleReady = false
zeroCopyClaimed = false
structuredCloneInternalCopiesReliablyClearable = false
```

`productionBusinessHandlerInstalled=true` 仅说明 normal Core graph 不再使用固定 unavailable handler；在正式签名
Helper 未进入安装包前，`productionBusinessHandlerReady`、CRUD 和 Reveal 仍必须为 false。普通安装图应返回 typed
unavailable，不得用受控 Helper、Fixture、ad-hoc signature 或测试身份伪装成功。

## 1. 当前事实与真实缺口

### 1.1 已存在且必须复用

- `SqlitePersonalModelPersistence` 已承载 immutable definition/head/status、Operation Journal 与 durable Receipt；
- `MacOsKeychainPersonalCredentialStore` 已实现 store/replace/inspect/resolve/delete、超时和 uncertain reconciliation；
- `PersonalModelCredentialCoordinator` 已实现 prepare/execute、幂等 replay、material conflict 与 recovery；
- `PersonalModelCredentialRecoveryCoordinator` 已提供 bounded durable recovery；
- `PersonalModelCredentialRevealService` 与 `PersonalModelRevealAttemptRegistry` 已提供 owner/revision/binding 校验、
  单模型并发、限频、deadline、无 replay 和 tombstone；
- `createPersonalModelCredentialBrokerHandler()` 已能把 Broker command 分发给 Coordinator / Reveal Service；
- `PersonalCredentialBrokerServer`、Main transport controller、Preload receiver 与 fd4/fd5 已存在；
- STRM-3 已证明 normal Main/Preload/Core transport activation、真实 SIGKILL/restart、80 次泄漏注入和 16 类资源归零；
- DFI-4A.4.1 已提供 management authority、Helper manifest/签名验证与 v1alpha1 Compatibility/List/Detail API；
- DFI-5.4.3A 已把 Personal Model persistence 和 Keychain Store 放入 normal Desktop Core composition；
- migration 当前止 26，新增 CRUD/Reveal 不需要新表、索引或 durable cursor store。

### 1.2 当前缺口

| 缺口 | 当前事实 | DFI-4A.4.2 决策 |
| --- | --- | --- |
| Contract | v1alpha1 只有 Compatibility/List/Detail | v1alpha1 byte freeze；新增 additive v1alpha2 |
| normal business handler | `desktop-private-main.ts` 仍安装固定 `credential_store_unavailable` handler | 接入唯一真实 Coordinator/Reveal handler |
| command service | Read Service 只有安全投影 | 新增薄 Command Service，负责 authority、命令规范化和 Core-generated identity |
| Main/Preload surface | 只有三条只读 API | 新增 exact v1alpha2 八方法，密钥不进入普通 invoke |
| Helper asset | production Helper binary/正式签名仍不存在 | normal 安装图诚实 unavailable；受控 Helper 只用于 conformance |
| recovery activation | Coordinator recovery 存在但未进入 normal lifecycle | bounded startup recovery + named barrier + durable exact replay |
| Renderer | Personal Model UI 仍 GATED | 本批不改 Renderer，只交付稳定 Adapter 接口 |

### 1.3 基线

```text
Root/Core/Desktop version            = 0.0.0-strm.3
Contracts version                    = 0.0.0-dfi.4a.4.1
Admin version                        = 0.0.0-afe.6c
编码目标 Root/Core/Contracts/Desktop = 0.0.0-dfi.4a.4.2（获授权后才执行）
pnpm-lock.yaml sha256                = 5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31
migration max                        = 26
STRM-3                               = PASS/CLOSED / SENSITIVE_TRANSPORT_READY
production Helper asset              = false
production Personal Model CRUD       = false
production Credential Reveal         = false
Desktop Renderer Personal Model UI   = GATED
```

## 2. 冻结架构

### 2.1 G1：v1alpha1 byte freeze，v1alpha2 additive

禁止原地扩写已关闭的
`@robothree/contracts/desktop-local/personal-model-management/v1alpha1`。新增 exact package subpath：

```text
@robothree/contracts/desktop-local/personal-model-management/v1alpha2
```

v1alpha2 可以复用 v1alpha1 的安全 list/detail projection，但必须有独立 schema version、独立 exact exports、strict
Zod schema 和 single-dispatch。未知版本 typed fail-closed，禁止 fallback 到 v1alpha1。

### 2.2 G2：八个 exact API 方法

冻结 `window.robothreePersonalModelV1Alpha2` 八方法：

1. `getCompatibility()`；
2. `listPersonalModels(query)`；
3. `getPersonalModel(query)`；
4. `createPersonalModel(command, apiKeyBytes)`；
5. `updatePersonalModel(command, apiKeyBytes?)`；
6. `deletePersonalModel(command)`；
7. `revealPersonalModelKey(command)`，成功值仅为调用方独占的 `Uint8Array`；
8. `queryPersonalModelOperation(query)`。

对应必须存在且只存在八条 Core route、八个 Main IPC channel 和八个 frozen Preload method。禁止 `action` 字段、
generic command dispatcher、任意 route 拼接或 Renderer 自报 capability。

### 2.3 G3：普通字段与 Secret bytes 强制分流

普通 JSON 只允许承载：command ID、operation kind、expected revision、provider profile、display name、endpoint profile、
model ID、capability selection、deadline、idempotency identity 和 safe query。它不得包含 API Key、Reveal bytes、
Credential Reference、Keychain account、namespace key、Helper path 或私有 mapping material。

create、`replace_secret` update 与 reveal 的固定顺序：

```text
Renderer safe command
  -> Preload strict parse + owned byte copy
  -> Main exact IPC / current webContents lease
  -> Core safe prepare route
  -> durable prepared Operation Journal
  -> Main revalidate runtime + webContents lease
  -> STRM MessagePort one-shot body
  -> Core fd4/fd5 Broker
  -> production Personal Model business handler
  -> Coordinator or Reveal Service
  -> durable Receipt / safe terminal envelope
  -> Preload clears its owned byte copy
```

密钥字节禁止进入 `ipcRenderer.invoke` 参数、Core private HTTP body、Zod command object、SQLite、日志、Trace、错误、
Evidence、URL、文件、剪贴板、broadcast 或多 consumer fan-out。structured clone 可能产生内部复制，因此不得声称
zero-copy，也不得声称所有内部复制都可可靠清零。

delete 已按用户接受的聚焦修订改为 safe Core command：Core durable prepare 后调用同一 Coordinator，并传入
zero Secret。`reuse_existing` metadata-only update 也不产生 Secret bytes；由于 frozen STRM v1 无法表达 zero-Secret
update，已按用户接受的 A2 修订采用与 delete 相同的 safe Core command + same Coordinator + zero Secret 路径。两条
safe Core 分支都不得绕过 authority、Journal、Receipt、Operation Gate、Keychain 或 recovery，不得建立第二套状态机。

### 2.4 G4：唯一 production composition

normal Core graph 组合并共享以下实例：

- `SqlitePersonalModelPersistence`；
- `MacOsKeychainPersonalCredentialStore`；
- `ProductionPersonalModelManagementAuthoritySource`；
- 单一 `PersonalModelOperationGate`；
- 单一 `PersonalModelCredentialCoordinator`；
- 单一 `PersonalModelCredentialRecoveryCoordinator`；
- 单一 `PersonalModelCredentialRevealService`；
- 新增薄 `PersonalModelManagementCommandService`；
- `createPersonalModelCredentialBrokerHandler(coordinator, revealService)`。

`desktop-private-main.ts` 不再固定返回 `credential_store_unavailable`，而是安装上述 handler。若 production Helper
descriptor 不存在或验证失败，Keychain Store 和 Compatibility 仍返回 typed unavailable；不得回退 InMemory Store、
shell security command、test helper、legacy handler 或 Renderer Secret。

### 2.5 G5：Core 是 ID、revision 与 canonical material authority

Renderer 不得生成 `personalModelId`、`credentialRef`、definition revision/digest、operation digest 或 Keychain account。
Command Service 必须：

- 从 management authority 获得 exact owner namespace；
- 对 provider profile、endpoint 和 capability 组合做 allowlist canonicalization；
- 由 Core 生成稳定 model identity 与 opaque Credential Reference；
- 生成 content-free command material digest；
- 复用现有 Coordinator prepare，不复制 journal/receipt/digest 算法；
- 保存不自动测试连接，初始运行状态为 `unverified`；
- metadata-only update 复用旧 Credential；endpoint/provider/credential binding 变化必须要求新 Key；
- 禁止自动选择第一个个人模型、自动 fallback 企业模型或覆盖用户已锁定模型。

### 2.6 G6：真实 capability/readiness 交集

Compatibility 由 Core 派生：

```text
mutationAvailable = managementAuthorityReady
  && productionHelperVerified
  && productionSensitiveTransportReady
  && productionBusinessHandlerInstalled

revealAvailable = mutationAvailable
  && managementAuthority.permissions.mayRevealSecret
```

Catalog read 可以在 Helper 缺失时继续 available；mutation/reveal 必须 unavailable，并给出固定安全 reason。测试图中的
`test_isolated` Helper 不得改变 production flags。production Helper asset 缺失不能被 `?? true`、默认值、Fixture
manifest 或 ad-hoc signature 覆盖。

### 2.7 G7：Durable CRUD 与幂等恢复

create/update/delete 复用既有 Operation Journal + Receipt：

- 同一 command ID + 同一 material digest：返回 exact durable Receipt，不再次写 Keychain/SQLite；
- 同一 command ID + 不同 material：typed `revision_conflict` / material conflict；
- `prepared`：恢复时只读 durable journal 和 Keychain inspection，不重新向 Renderer 请求 Secret；
- Keychain side effect 已发生但 DB commit 未完成：按 inspect/reconcile 进入 committed、cleanup_pending、
  manual_attention 或 operation_uncertain；
- DB commit 已完成但响应丢失：重放 exact Receipt；
- delete 前必须由 Core 检查 active Task / durable usage；无法证明未使用时返回 `usage_unknown`，不得靠 Renderer cache；
- bounded recovery，不使用无限 retry、wall-clock sleep 或删除重建数据库冒充恢复。

### 2.8 G8：Reveal 是短生命周期能力，不是持久化读取

Reveal 每次必须重新验证：management authority、owner、model revision、Credential binding、runtime lease、限频、
单模型并发和 deadline。Reveal bytes：

- 只返回发起调用的 main-frame consumer；
- 不产生 durable “用户已看到”事实；
- 不写 Receipt、SQLite、clipboard、cache、analytics 或 trace；
- timeout/navigation/runtime change 后进入 `reveal_expired`，不自动 replay；
- late helper/port response 必须丢弃并清理；
- Preload 对自身持有的 `Uint8Array` 在返回/失败后 best-effort `fill(0)`，但不作 zero-copy 承诺。

### 2.9 G9：Typed safe error vocabulary

v1alpha2 必须提供 sealed safe error envelope，至少覆盖：

```text
personal_model.contract_invalid
personal_model.feature_unavailable
personal_model.runtime_changed
personal_model.permission_denied
personal_model.not_found
personal_model.revision_conflict
personal_model.cursor_stale
personal_model.credential_required
personal_model.credential_store_unavailable
personal_model.transport_unavailable
personal_model.operation_in_progress
personal_model.in_use
personal_model.usage_unknown
personal_model.rate_limited
personal_model.operation_uncertain
personal_model.manual_attention
personal_model.cleanup_pending
personal_model.reveal_expired
personal_model.internal
```

错误只允许 code、固定 safe summary、retryability 与 content-free receipt identity；禁止 stack、Zod path、SQL、Helper
stderr、endpoint、model owner、Credential Ref、digest、Keychain account 或真实文件路径。

## 3. 生命周期与恢复矩阵

### 3.1 Mutation M1～M10

| 窗口 | 中断点 | 恢复与验收 |
| --- | --- | --- |
| M1 | authority 前 | durable prepare=0、Keychain/SQLite side effect=0 |
| M2 | safe prepare 前 | Broker/Helper/Secret read=0 |
| M3 | journal prepared 后、body 前 | 恢复只读 journal；无 Secret 时 typed pending/unavailable，不伪成功 |
| M4 | body accepted 后、Helper 前 | 单一 inflight；旧 runtime/port 回包拒绝 |
| M5 | Helper request sent | at-least-once 语义显式；timeout 不自动重发 Renderer bytes |
| M6 | Keychain side effect 后、DB commit 前 | inspect/reconcile；进入 committed/cleanup/manual/uncertain 之一 |
| M7 | DB transaction 中 | rollback 或 exact durable winner；不出现半 definition/head/status |
| M8 | DB commit 后、Receipt 响应前 | replay exact Receipt；Keychain/SQLite 增量调用=0 |
| M9 | delete credential 后、metadata cleanup 前 | cleanup_pending；不伪装 deleted |
| M10 | completed 后 response loss | query/replay 返回单一 terminal winner |

### 3.2 Reveal R1～R8

| 窗口 | 中断点 | 恢复与验收 |
| --- | --- | --- |
| R1 | authority 前 | Keychain/transport 调用=0 |
| R2 | binding 校验后、ticket 前 | navigation/runtime change 使请求失效 |
| R3 | ticket 后、body 前 | bounded tombstone；无 bytes 泄漏 |
| R4 | Helper request sent | deadline/cancel 单终态 |
| R5 | bytes returned 到 Core | 仅 exact Broker session 可消费 |
| R6 | bytes 到 Preload | 只交付 exact main-frame caller，不 fan-out |
| R7 | Renderer 接收后 | 不持久化 viewed fact，不自动 clipboard |
| R8 | late response / restart | 丢弃、best-effort clear、资源归零、无 replay |

### 3.3 真实进程证据

必须使用真实 Electron Main、sandboxed Preload、Core child、SQLite 原文件、临时 Keychain、受控 `test_isolated`
原生 Helper、
MessagePort 和 fd4/fd5。崩溃使用真实 `SIGKILL`、验证旧 PID 已退出、启动新 PID、原 SQLite reopen。named barrier
只能确定中断窗口，不能代替真实 side effect。禁止单进程 direct call、`throw` 冒充 SIGKILL、删除数据库冒充 reopen、
JSDOM 冒充 Electron、body mock 冒充 STRM 或公网真实 Key。

## 4. Contract / HTTP / IPC 详细交付

### 4.1 v1alpha2 Contract

新增：

```text
packages/contracts/src/desktop-local/personal-model-management/v1alpha2/**
```

必须包含 Compatibility、List、Detail、Create/Update/Delete command、Reveal command、Operation Query、Receipt、
strict success/error envelope 与 exact schema version。所有 record `.strict()`；所有 revision/digest exact 配对；数组
有上限；未知字段、null 替代、boolean capability、自报 owner 和原始 Secret 全部拒绝。

### 4.2 Core private routes

新增 exact routes，路由名与 Contract 一一对应；只接受现有 Host/Origin/Bearer 与 runtime lease 约束。Create/Update/
Reveal route 只做 safe prepare/status，不接收 Secret body；sensitive bytes 继续只走 Broker。

### 4.3 Main IPC 与 Preload

Main router：

- 只绑定 main frame；
- 每个 webContents 绑定 current Core runtime/client lease；
- binding cap、per-webContents/global inflight cap 和 deadline 固定；
- navigation、render-process-gone、destroyed 时撤销 ticket、清理 listener/port/byte refs；
- prepare 后、open transport 前再次 revalidate lease；旧 runtime 返回 typed `runtime_changed`。

Preload API 必须 `Object.freeze`，Renderer 不获得 raw MessagePort、Broker token、Helper descriptor、runtime identity 或
Credential Ref。输入 Secret 必须是 bounded `Uint8Array`，拒绝 string/Base64/ArrayBuffer alias 或超限值。

## 5. Sensitive leakage 与资源纪律

### 5.1 80 次负向泄漏注入

沿用 STRM-3 四通道扫描：

```text
parentStdout / childStderr / machineEvidence / safeTrace
```

对 5 个 canary 分别注入 raw、base64、hex、JSON-escaped 四种编码，共 `4 × 5 × 4 = 80` 次；每次必须精确检出，
正常路径四通道命中 0。Scanner 必须继承 STRM-3 marker 并扩展 Personal Model ID、Credential Ref、endpoint、
operation digest、Keychain account、Helper path、stack/Zod path 等新增敏感项；不得用固定 0 或空输入冒充。

### 5.2 18 类资源真实归零

至少从 child diagnostics / OS observation 统计：

1. electronProcess；2. browserWindow；3. webContents；4. messagePort；5. ipcListener；6. navigationListener；
7. timer；8. transportSession；9. transportRegistry；10. brokerInflight；11. brokerTombstone；12. coreChild；
13. sensitiveStream；14. helperProcess；15. listeningPort；16. temporaryDirectory；17. revealAttempt；
18. operationLease。

每项必须为 non-negative safe integer；最终为 0。禁止 `?? 0`、缺字段当 0、parent 盲信 child 或 hard-coded 0。

## 6. 父方案 QA Ledger

父计划 120 项必须保留 item-level ledger：

- QA-061～QA-080：保持 `executed_by_strm3`，引用 STRM-3 immutable Evidence，不重写历史；
- QA-081～QA-100：本批逐项执行并标记 `executed_by_dfi4a42`；
- 其余 80 项：继续 `retained_for_dfi4a4_stage_closure`，不得冒充已执行；
- focused 96 项不能替代父 120 项；每项必须记录 `qaId / ownerTest / evidenceKey / result`。

本批必须特别证明父 QA-081～100：create prepared before Keychain、initial unverified、save no connection test、
metadata update reuse、binding change requires new key、exact replace revision、active use/usage unknown delete block、
Core preference convergence、exact Receipt replay、material conflict、uncertain/manual/cleanup honest outcome、recovery no
Renderer Secret reread、Reveal exact revalidation/rate-limit/no replay/no durable viewed fact 和 deadline byte clearing。

## 7. 修改边界

### 7.1 编码授权后允许

- `packages/contracts/src/desktop-local/personal-model-management/v1alpha2/**`、exact export 与 tests；
- `services/core/src/application|ports|adapters|bootstrap|desktop-private-main.ts` 中 Personal Model 管理增量；
- `apps/desktop/src/shared|main|preload/**` 与对应 tests；
- 受控 Helper fixture、真实进程 E2E、Harness、Evidence、实施报告；
- 必要的版本、README、CHANGELOG、DEVELOPMENT-LOG、audit baseline 精确同步。

### 7.2 明确禁止

- 修改 `apps/desktop/src/renderer/**`；
- 修改 `apps/admin-console/**`、Central、Document Worker、TGM、Knowledge Provider、Agent Lifecycle；
- 原地扩写 personal-model-management v1alpha1 或改写历史 STRM/DFI Evidence/Harness；
- migration 27、修改 migration 1～26、新表/索引/durable cursor；
- 新第三方依赖或 lockfile 变化；
- 把正式 Developer ID、证书私钥、真实用户 Key、预构建 production Helper binary 提交仓库；
- test-isolated Helper、ad-hoc signature、Fixture identity、LocalStorage 或 InMemory Store 冒充生产能力；
- 修改 Provider execution、Max、Enterprise Gateway、Admin v2 或 Renderer Personal Model UI；
- 自动测试连接、自动选择模型、自动 fallback、自动恢复已清空选择；
- 宣称 notarization、installer、production ready、Enterprise ready 或 UI ready。

## 8. 实施步骤与估算

### Step 1：v1alpha2 Contract / Safe Command Service（1～1.5 日）

- additive Contract、exact subpath/import boundary、v1alpha1 byte freeze；
- Command Service、authority/readiness、canonical material、typed errors；
- unit/contract/boundary tests。

### Step 2：Production composition / CRUD durable recovery（1.5～2.5 日）

- 共享 Coordinator/Gate/Recovery/Reveal composition；
- 真实 Broker handler 替换 fixed unavailable；
- create/update/delete/query、Receipt replay、conflict/uncertain/manual/cleanup；
- SQLite/Keychain crash-window tests。

### Step 3：Main/Preload sensitive API / Reveal（1～2 日）

- 八 route / 八 IPC / 八 Preload methods；
- current lease、ticket/inflight/deadline、navigation cleanup；
- STRM body、Reveal exact consumer、rate limit、no replay、best-effort clear。

### Step 4：Lifecycle Harness / Evidence / Report（0.5～1 日）

- real child/Electron/SQLite/Keychain/controlled `test_isolated` native Helper；
- 80 leak injections、18 resource counts、parent QA-081～100 ledger；
- historical Evidence digest checks、implementation report 与全量 gates。

合计 **4～7 个集中工程日**，不含独立 QA、正式 Developer ID/签名资产、notarization、DMG、Renderer UI 或返工。

## 9. 开发者门禁

编码完成后必须串行执行：

```text
pnpm run harness:dfi4a4.2
pnpm run harness:strm3
pnpm run harness:dfi4a4.1   # 只观察历史时点；合法版本演进不得改写历史 Evidence
env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check
pnpm run check:central
pnpm run check:central:offline
pnpm run lint
pnpm run typecheck
pnpm run audit:dtp4
```

Node 必须为 24.13.0，JDK 必须为 21。历史 Harness 因当前合法版本/consumer 演进触发时点断言时，只能记录精确
原因并由本批 Harness 校验 historical Evidence digest；不得修改历史 Harness/Evidence。若历史行为测试本身失败、
Evidence digest 漂移或无法证明与本批无因果，必须停手。

## 10. Focused QA Matrix（96 项）

### 10.1 Contract / Authority / Readiness（QA-001～QA-016）

1. QA-001 v1alpha1 source byte freeze；
2. QA-002 v1alpha1 built import仍可用；
3. QA-003 v1alpha2 exact subpath可导入；
4. QA-004 v1alpha2 single-dispatch；
5. QA-005 unknown version typed reject；
6. QA-006 strict unknown field reject；
7. QA-007八方法精确且唯一；
8. QA-008 mutation method count=3；
9. QA-009 reveal method count=1；
10. QA-010 generic dispatcher count=0；
11. QA-011 standalone authority exact；
12. QA-012 enterprise authority unavailable不fallback；
13. QA-013 Task entitlement不能授权管理；
14. QA-014 Helper缺失时catalog仍可读；
15. QA-015 Helper缺失时mutation/reveal false；
16. QA-016 test helper不改变production flags。

### 10.2 Command / CRUD / Durable Receipt（QA-017～QA-032）

17. QA-017 Core生成model identity；
18. QA-018 Core生成opaque credentialRef；
19. QA-019 create prepare先于Keychain；
20. QA-020 create初始unverified；
21. QA-021 save不测试连接；
22. QA-022 metadata-only update复用Credential，并通过safe Core command调用同一Coordinator、Secret长度0；
23. QA-023 binding变化要求新Key；
24. QA-024 replace exact expected revision；
25. QA-025 delete通过safe Core command走同一Coordinator；
26. QA-026 delete sensitive body长度0；
27. QA-027 active Task阻止delete；
28. QA-028 usage unknown阻止delete；
29. QA-029 committed Receipt exact replay；
30. QA-030 replay side effect delta=0；
31. QA-031 same command different material conflict；
32. QA-032 Operation Query只返回safe projection。

### 10.3 Recovery / Failure Semantics（QA-033～QA-048）

33. QA-033 prepared recovery不重新请求Renderer Secret；
34. QA-034 Keychain side effect后inspect；
35. QA-035 DB commit前SIGKILL无半状态；
36. QA-036 DB commit后response loss exact replay；
37. QA-037 uncertain不伪成功；
38. QA-038 manual_attention不伪成功；
39. QA-039 cleanup_pending不伪成功；
40. QA-040 bounded recovery limit；
41. QA-041 no automatic infinite retry；
42. QA-042 no sleep-based barrier；
43. QA-043 original SQLite reopen；
44. QA-044 old PID ESRCH/new PID；
45. QA-045 durable winner count=1；
46. QA-046 model/head/status atomic；
47. QA-047 preference convergence由Core决定；
48. QA-048 terminal replay authority reread=0。

### 10.4 STRM / Reveal / Lease（QA-049～QA-064）

49. QA-049 Secret不进入ipcRenderer.invoke；
50. QA-050 Secret不进入Core HTTP；
51. QA-051 create与replace-secret update只接受Uint8Array；reuse-existing update不接收Secret；
52. QA-052 string/Base64 Secret拒绝；
53. QA-053 input/body length cap；
54. QA-054 prepare后lease二次校验；
55. QA-055 subframe拒绝；
56. QA-056 stale runtime typed runtime_changed；
57. QA-057 navigation撤销ticket；
58. QA-058 late port response丢弃；
59. QA-059 Reveal每次重检authority/revision/binding；
60. QA-060 Reveal单模型单并发；
61. QA-061 Reveal限频；
62. QA-062 Reveal deadline/reveal_expired；
63. QA-063 Reveal无durable viewed fact；
64. QA-064 Reveal不clipboard/cache/fan-out。

### 10.5 Security / Leak / Resource（QA-065～QA-080）

65. QA-065 Preload owned copy best-effort clear；
66. QA-066 zeroCopyClaimed=false；
67. QA-067 production Helper secret/identity不入仓；
68. QA-068 test helper production flag=false；
69. QA-069 safe error不含stack/Zod path；
70. QA-070 safe error不含endpoint/credentialRef/digest；
71. QA-071 80次负向注入逐次检出；
72. QA-072正常parentStdout命中0；
73. QA-073正常childStderr命中0；
74. QA-074正常machineEvidence命中0；
75. QA-075正常safeTrace命中0；
76. QA-076 18类资源均有字段；
77. QA-077资源字段均为non-negative safe integer；
78. QA-078最终资源全部0；
79. QA-079禁止`?? 0`/hard-coded 0；
80. QA-080 parent不盲信child。

### 10.6 Boundary / Ledger / Honesty（QA-081～QA-096）

81. QA-081 Renderer consumer count=0；
82. QA-082 Admin/Central/TGM/Knowledge/Agent Lifecycle改动=0；
83. QA-083 migration max=26；
84. QA-084 lockfile digest不变；
85. QA-085无新增第三方依赖；
86. QA-086 historical STRM-3 evidence digest不漂移；
87. QA-087 historical DFI-4A.4.1 evidence digest不漂移；
88. QA-088父QA-061～080保持executed_by_strm3；
89. QA-089父QA-081～100逐项executed_by_dfi4a42；
90. QA-090父其余80项仍retained；
91. QA-091 STRM-3 historical Evidence 保持 `productionBusinessHandlerInstalled=false`，本批当前 Evidence 目标为 `productionBusinessHandlerInstalled=true`；
92. QA-092 `productionBusinessHandlerReady=false / productionHelperAssetPresent=false`；
93. QA-093 `productionPersonalModelCrudReady=false / productionCredentialRevealReady=false`；
94. QA-094 `rendererPersonalModelUiReady=false / dfi4a43Unlocked=false`；
95. QA-095 `zeroCopyClaimed=false / structuredCloneInternalCopiesReliablyClearable=false`；
96. QA-096 outcome不含PRODUCTION_READY/RENDERER_READY/ENTERPRISE_READY。

## 11. 停手条件

出现任一条件立即停手并回到文档评审：

1. 必须原地修改 v1alpha1 Contract 才能实现；
2. 必须新增 migration 27、表、索引或 durable cursor；
3. 必须新增第三方依赖或修改 lockfile；
4. 必须把 Secret 放入 JSON/HTTP/普通 IPC/SQLite/日志/Evidence；
5. 无法在 prepare 后、open transport 前重新校验 runtime/webContents lease；
6. 无法复用现有 Coordinator/Journal/Receipt，需要第二套状态机；
7. normal graph 必须使用 InMemory Store、test helper 或 fixed identity；
8. Helper 缺失时只能伪造 mutation/reveal ready；
9. create/update/delete 无法形成单一 durable winner；
10. recovery 必须重新向 Renderer 请求 Secret；
11. delete 只能靠 Renderer cache 判断 active use；
12. Reveal 必须写 durable viewed fact、clipboard、cache 或 fan-out；
13. Reveal late response 无法拒绝或清理；
14. production business handler 无法与 test-only handler严格隔离；
15. Core无法成为modelId/credentialRef/revision authority；
16. 受控Helper必须被表述为production Helper；
17. 必须把Developer ID、私钥、真实用户Key或production binary提交仓库；
18. 必须修改Renderer/Admin/Central/TGM/Knowledge/Agent Lifecycle；
19. 必须自动测试连接、自动fallback或自动选择个人模型；
20. 80次负向泄漏不能真实检出；
21. 18类资源只能用缺失字段/硬编码0表达；
22. historical Evidence digest发生漂移；
23. 父120项账本无法逐项区分executed与retained；
24. 只有宣称Personal Model production ready或Renderer ready才能关闭本批。

## 12. 文档评审问题

请独立评审明确回答：

1. 是否接受 v1alpha1 byte freeze、CRUD/Reveal 使用 additive v1alpha2？
2. 是否接受八个 exact API，禁止 generic dispatcher？
3. 是否接受普通字段走 JSON，实际存在的 Secret bytes 只走 STRM MessagePort + fd4/fd5？
4. 是否接受 delete 与 reuse-existing update 经 safe Core command 复用同一 durable Coordinator 且 Secret 长度为0？
5. 是否接受 normal Core graph 安装真实 business handler，但 Helper 缺失时 production CRUD/Reveal 仍 false？
6. 是否接受 test-isolated Helper只证明conformance、不构成production ready？
7. 是否接受 Core生成modelId/credentialRef/revision，Renderer不作为authority？
8. 是否接受create/update/delete复用现有Coordinator/Journal/Receipt，不建第二套状态机？
9. 是否接受recovery不重新向Renderer索取Secret，无法确定时输出uncertain/manual/cleanup？
10. 是否接受Reveal无durable viewed fact、无自动replay、无clipboard/cache/fan-out？
11. 是否接受本批只执行父QA-081～100，其余80项保留到DFI-4A.4.3？
12. 是否接受4～7日估算，关闭后仍不自动解锁DFI-4A.4.3或Renderer UI？

评审输出必须包含：`PASS / PASS_WITH_REVISIONS / RED`、P0～P3、是否可冻结、是否保持 Coding Gated。

## 13. 当前门禁

```text
DFI-4A.4 Revision 2                  PLAN REVIEW PASS/CLOSED
DFI-4A.4.1 Revision 2                PASS/CLOSED
STRM-3                               PASS/CLOSED / SENSITIVE_TRANSPORT_READY
DFI-4A.4.2 Revision 2                PASS/CLOSED
DFI-4A.4.3 Revision 2                DOCUMENT REVIEW PENDING / CODING GATED
Desktop Renderer Personal Model UI  GATED
production Helper asset              false
production Business Handler installed true / ready false
production Personal Model CRUD       false
production Credential Reveal         false
Enterprise identity/entitlement      false / deferred
Admin v2 / TGM / Knowledge / Agent Lifecycle GATED
```

独立文档复核已 `PASS` 并由用户接受，编码授权已单独授予。第一轮 exact Contract 差异已按用户选择方案 A 关闭：
delete 通过 safe Core command 调用同一 durable Coordinator 并使用 zero Secret。恢复编码后又确认 frozen STRM v1
无法表达 `reuse_existing` metadata-only update 的 zero-Secret 语义。用户已接受 A2：该分支与 delete 一致地放入
safe Core command，其余 create/replace-secret update/reveal 继续走 STRM；编码授权已恢复。不得缩窄
metadata-only update、修改 frozen STRM v1 或创建 transport v2。
