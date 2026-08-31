# AAPI-0.3 Read-only Projection Inventory / HTTP Shell 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-27  
> 负责人：Codex 5.6  
> 上游：AAPI-0 Revision 1、AAPI-0.1～AAPI-0.2、cross-consumer alignment v1 均 `PASS/CLOSED`  
> 对应前端：Admin Console AFE；本方案不授权修改 `apps/admin-console/**`  
> 身份策略：仅允许明确 development/test Principal；production identity 继续 false  
> 本批最高允许输出：`AAPI03_TEST_ONLY_READ_HTTP_SHELL_CONFORMANT`

> 用户接受：2026-08-27；独立 QA `P0=0 / P1=0 / P2=0 / P3=1（阶段边界，非阻断）`。P3 明确为
> development/test Browser 真实贯通仍待 AAPI-0.4，不影响 AAPI-0.3 关闭。

## 0. 结论摘要

AAPI-0.3 的职责是把已经冻结的 `admin-control.v1alpha1` 从 TS shape 和 Central test-only capability foundation，
推进到可被独立验证的 Central read-only Projection inventory 与 HTTP shell。它不实现浏览器安全闭环，不实现
production identity，也不把缺失的业务 read model、CRUD、TGM 或 Knowledge Provider 用 Fixture 冒充完成。

本方案冻结十二项决定：

1. HTTP base 固定为 `/admin/v1alpha1`，只开放 GET；mutation route count 必须为 0；
2. AAPI-0.3 的 HTTP shell 只允许在 development/test composition 中显式开启，production Controller/mapping 为 0；
3. AAPI-0.4 前不宣称 Browser-ready，不接 HttpOnly session、CSRF/CSP/Origin production filter；
4. 服务端每个请求先建立 exact test-only Principal，再做 capability authorization；浏览器不得自报 user/role/capability；
5. 六类模块分别声明可信 authority 与 availability，缺事实返回 partial/unavailable，不生成假记录；
6. Robot/Tool 遵循 cross-consumer alignment，但 Admin 与 Desktop 不共用 DTO、不导入 Desktop Contract、不跨服务读取 Local Core；
7. active `ImmutableConfigurationSnapshot` 只有通过完整 integrity verification 后才能作为部分 inventory 事实来源；
8. raw 64 hex、`sha256:` revision、ETag 与 queryRevision 四层分离，Converter 是唯一表示法边界；
9. cursor 为 per-runtime test-only HMAC opaque proof，绑定 module/queryRevision/sort key；restart 后旧 cursor typed stale；
10. `queryRevision` 覆盖 exact safe projection material 和 availability，不是权限事实，也不直接等于 snapshot revision；
11. 一个请求只捕获一次 Principal、capability snapshot、module inventory lease 和 `Clock.instant()`，Assembler 不二次读取 authority；
12. 本批不新增 migration、依赖、Contract version、production data source 或 Admin 前端代码。

最高输出必须同时附带：

```text
AAPI03_TEST_ONLY_READ_HTTP_SHELL_CONFORMANT
testIdentityUsed=true
productionIdentityReady=false
productionAdminReadHttpReady=false
browserSecurityReady=false
adminAdapterReady=false
mutationRouteCount=0
tgmReady=false
knowledgeProviderReady=false
agentLifecycleReady=false
```

不得输出 `ADMIN_API_PRODUCTION_READY`、`ADMIN_CONSOLE_READY`、`RBAC_READY`、`TOOL_MANAGEMENT_READY`、
`KNOWLEDGE_PROVIDER_READY` 或任何真实治理闭环声明。

## 1. 当前代码事实与真实缺口

### 1.1 已关闭事实

| 事实 | 当前状态 | AAPI-0.3 复用方式 |
| --- | --- | --- |
| `admin-control.v1alpha1` | AAPI-0.1 `PASS/CLOSED` | 作为唯一 HTTP JSON shape；不另造 Java-only JSON 语义 |
| test-only Principal / Capability | AAPI-0.2 `PASS/CLOSED` | 服务端 authorization 与 envelope identity flag 来源 |
| Robot/Tool alignment | `PASS/CLOSED` | 复用 stable identity/revision/restriction/risk 不变量，不复用 Desktop DTO |
| Active configuration | Central 已有 immutable snapshot/package repository 与 integrity verifier | 只作为能被逐字段证明的只读事实来源 |
| Admin Vue | AFE-1.1/AFE-2/AFE-3A 已有工程和页面基础 | 本批不修改；AAPI-0.4/AFE consumption 后再接入 |

### 1.2 代码层真实缺口

- Central 当前没有 `/admin/v1alpha1` Controller、read authorizer、Projection query service 或 cursor codec；
- `AdminAdapter` 当前只有 `getCapability()`，production 默认仍是 `UnavailableAdminAdapter`；
- active configuration descriptor 能证明 id/revision/enabled/credential availability 等有限事实，但不完整承载
  Admin Tool `readOnly/riskSummary`、Robot review lifecycle、Model default flag 等全部字段；
- Central 没有完整 Agent publish/review read model、TGM Tool read model、Knowledge Provider read model或通用 Audit query；
- Model invocation audit outbox 只能证明有限系统事件，不能冒充完整企业审计；
- AAPI-0.1 Contract 是 TS Contract，Central 尚未建立逐字段 Java Projection 与 cross-language response fixture；
- AAPI-0.4 的 Browser session、CSRF、Origin、CSP、frame protection、no-store 与正式三态 activation gate 尚未实现。

结论：AAPI-0.3 可以提供真实 HTTP 接口和诚实 partial/unavailable Projection，但不能承诺六模块都返回 ready 数据。

## 2. 目标与非目标

### 2.1 目标

1. 建立六类 read-only module inventory Port、captured lease 与 safe Projection assembler；
2. 建立 test-only HTTP shell、strict request mapper、typed response/error assembler；
3. 建立服务端 read authorization，消费 AAPI-0.2 Principal/Capability，不信任浏览器；
4. 建立 queryRevision、opaque cursor、稳定排序、分页与 ETag/304；
5. 对现有 active configuration 能证明的事实进行逐字段安全投影；
6. 对缺失 authority 的模块和字段返回明确 partial/unavailable/gated；
7. 形成 TS/Java/cross-consumer/harness/security conformance。

### 2.2 非目标

- 不实现 POST/PUT/PATCH/DELETE，不实现保存、发布、审核、测试、启停、同步、导出或删除；
- 不实现真实 SSO、RBAC、组织、角色、tenant、production Admin Principal；
- 不修改 Admin Vue、Desktop、Core、Main、Preload、IPC、Renderer 或 Document Worker；
- 不实现 Agent Lifecycle、TGM、Skill Runtime、Knowledge Provider、Memory 或 Effect Reconciliation；
- 不接收 API Key、Token、Endpoint、Credential、Skill package、Prompt 或脚本正文；
- 不创建数据库表、migration、索引或新的 durable cursor store；
- 不改 `admin-control.v1alpha1`；若诚实投影必须扩 Contract，立即停止回评审；
- 不把 EIPC Enterprise Session Controller、Desktop Local API 或 Core private route 复用为 Admin API。

## 3. 模块 Authority Inventory

### 3.1 总体规则

每个模块都由独立 typed source 返回 `AdminModuleInventoryLease<T>`：

```text
module
sourceKind
sourceRevision
availability = ready | partial | unavailable | gated
safeReason?
capturedAt
items[]
```

规则：

- `ready`：Projection 要求的全部权威字段均可验证；
- `partial`：仅返回能够证明的安全字段/记录，capability 必须同步为 partial；
- `unavailable`：依赖缺失、损坏或没有可信 read model；不得返回 Fixture 补齐；
- `gated`：业务线明确未授权，例如 TGM/Knowledge Provider/Agent Lifecycle；
- source 缺失与 empty inventory 必须区分：前者 unavailable/gated，后者是 ready/partial + items empty；
- 单个坏 record 不能静默跳过；如果不能证明 inventory 完整性，整个 module lease 失败关闭。

### 3.2 当前 authority 映射

| 模块 | 可用可信事实 | 当前不可证明事实 | 允许最高状态 |
| --- | --- | --- | --- |
| Model | verified active snapshot 的 id/raw revision/enabled/credentialAvailable/capabilities | 正式 display name、provider label、default-for-new-task authority、完整 lifecycle | `partial` |
| Robot | active snapshot exact agent package ref + verified package manifest/material | review/publisher/admin lifecycle；缺 strict Agent material 时的 restriction summary | `partial` 或 `unavailable` |
| Skill | active snapshot exact skill package ref + verified manifest/package digest | 上传/发布流程、审核事实、runtime ready | `partial` |
| Tool | active snapshot descriptor 的 id/revision/enabled/credential availability | readOnly/riskSummary、policy/connection/health exact facts（需 TGM/Registry evidence） | `unavailable/gated`，除非 exact source 全字段可证 |
| Knowledge | active snapshot descriptor 的 id/revision/enabled/credential availability | Provider 配置、索引、同步、retrieval ready | `gated/partial`，state 不得为 ready |
| Audit | bounded model invocation audit outbox/system facts | 完整 actor/action/result、企业审计正文、导出 | `partial` |

### 3.3 Projection 规则

#### Model

- `modelRevision = "sha256:" + rawRevision`，仅 Converter 可转换；
- id 可作为 fallback display text，但必须标明安全摘要“来自受信配置的模型标识”，不能伪造产品名称；
- `providerLabel` 只能来自 explicit safe provider label；缺失时 detail/list module 保持 partial，不从 endpoint 猜 Provider；
- `credentialAvailable=true → configured`；false 只允许 `unavailable`，不得擅自判为 missing；
- `defaultForNewTasks` 缺 authority 时 detail 必须 typed unavailable，不能默认 false；
- enabled 不等于 published，不得直接扩大 lifecycle。

#### Robot

- 只有 active snapshot exact agent ref + package digest/revision + strict material parser 全部通过才生成 item；
- `publishedRobotRevision` 必须 exact 对应 package/Agent definition revision，不得使用 snapshot revision；
- `enterprise_published` 只有已存在 immutable published evidence 才能使用；active reference 本身不足时 source/lifecycle 不得猜；
- restriction summary 必须来自 strict Agent definition；不从 manifest 文案、id 或 Desktop projection反推；
- code-owned `agent.general` 不在 Central authority 中时不得复制到 Admin inventory。

#### Skill

- exact package ref、kind、revision、digest 与 package document 必须全匹配；
- package integrity 通过可投影 `packageValidationState=valid`，但不等于 Skill Runtime ready；
- manifest 只允许读取 bounded name/description；脚本正文、文件内容和本地路径不得进入 Projection；
- lifecycle 缺真实 publish authority 时使用 unavailable/gated，不推断 published。

#### Tool

- `toolDefinitionRevision` 必须 exact 对应 capability revision；
- `readOnly` 与 `riskSummary` 必须来自可信 Tool definition/Policy risk facts；缺失即 module unavailable，不填 false/空数组；
- policy/connection/credential/health 分层，不把 enabled 或 credentialAvailable 扩大为四项 configured/healthy；
- 禁止从 ModelRequest tools、Provider adapter、Local Core Registry 或 Tool 名称猜测事实。

#### Knowledge

- 当前没有 Knowledge Provider，任何 item 的 state 不得为 ready；
- 可投影 active configuration 中的 safe id/revision 和固定安全摘要，但 capability 必须 partial/gated；
- retrievalState 固定 unavailable/gated，不能用配置存在性冒充检索成功。

#### Audit

- 仅投影 content-free system/outbox facts；不返回 Task/Prompt/ModelRequest/Tool arguments/文件内容；
- actorSummary 缺 authority 时只能使用明确 `System`，不得推断用户；
- result 缺可信判定时使用 unavailable，不用 publishedAt 推断 allowed；
- source 只是 partial system audit inventory，不宣传为完整企业审计。

## 4. Port 与 Application 设计

### 4.1 Ports

建议新增 Central-private Ports：

```text
AdminModelInventorySource
AdminRobotInventorySource
AdminSkillInventorySource
AdminToolInventorySource
AdminKnowledgeInventorySource
AdminAuditInventorySource
AdminReadRequestAuthorizer
AdminCursorCodec
AdminRequestEntropySource
```

每个 source 必须返回 immutable captured lease，不得让 Service 在分页/assemble 途中逐项回查 Repository。

### 4.2 单一 Query Service

`AdminReadProjectionService` 固定顺序：

1. strict parse route/query/header；
2. `now = clock.instant()` 单次采样；
3. 建立 exact Principal；
4. authorize exact module read capability；
5. capture module inventory lease 恰好一次；
6. validate lease source revision/availability/items；
7. 计算 safe inventory material 与 queryRevision；
8. decode/validate cursor（若有）；
9. stable sort + bounded page；
10. assemble Contract data；
11. 计算 ETag；
12. 返回 envelope 或 304。

Service 禁止读取 HTTP、Cookie、Vue route、Desktop API、Credential material 或 Provider endpoint。

### 4.3 Capability 合并

AAPI-0.2 的 test-only capability 表达“测试身份具备 read 权限”，AAPI-0.3 再与 module availability 收窄：

```text
effectiveState = min(principalCapabilityState, moduleAvailability)
```

规则：

- read capability ready + module partial → partial；
- read capability ready + module unavailable → unavailable；
- capability denied/gated 优先于数据存在；
- write/action capability 继续 gated；
- 前端不能通过传 capability key 改变 effectiveState。

## 5. HTTP Shell

### 5.1 Routes

只允许以下 GET routes：

```text
GET /admin/v1alpha1/capabilities/current
GET /admin/v1alpha1/models
GET /admin/v1alpha1/models/{modelId}
GET /admin/v1alpha1/robots
GET /admin/v1alpha1/robots/{robotId}
GET /admin/v1alpha1/skills
GET /admin/v1alpha1/skills/{skillId}
GET /admin/v1alpha1/tools
GET /admin/v1alpha1/tools/{toolId}
GET /admin/v1alpha1/knowledge
GET /admin/v1alpha1/knowledge/{knowledgeId}
GET /admin/v1alpha1/system/audit-events
```

mutation route count 必须为 0。不得注册 generic `/admin/v1alpha1/{module}/{action}` dispatcher。

### 5.2 Request mapping

GET 不携带 JSON body。映射固定为：

- `X-RoboThree-Contract-Version: admin-control.v1alpha1` 必填；
- `X-RoboThree-Query-Id` 必填且为 bounded EntityId；
- `X-RoboThree-Correlation-Id` 必填；
- list query 仅 `cursor`、`limit`；未知 query parameter 拒绝；
- detail id 来自 path 并按 resource id schema 严格校验；
- `If-None-Match` 可选，只接受 bounded quoted ETag；
- 禁止 body、userId、role、tenant、capability、endpoint 或 credential query parameter。

### 5.3 Response mapping

- success：`200` + strict success envelope；
- ETag exact match：`304`，无 body；
- error：只返回 `AdminControlSafeError`；
- `Cache-Control: no-store` 可在 shell 中固定输出，但完整 Browser security/header conformance 仍属于 AAPI-0.4；
- response 不回显原始请求、cursor payload、exception、stack 或 rejected body。

### 5.4 AAPI-0.4 前的可达性

AAPI-0.3 只允许：

```text
profile = development | test
robothree.admin-api.test-read-shell-enabled = true
DevelopmentAdminPrincipalProvider present exactly once
test inventory composition explicitly present
```

生产环境必须满足：

```text
Controller bean count = 0
mapping count = 0
DevelopmentAdminPrincipalProvider count = 0
Development/Test inventory source count = 0
```

不得使用 `@ConditionalOnMissingBean` 创建 test source；不得让 production property 开启本 shell。AAPI-0.4 将另行
建立 Browser session/security 与正式三态 activation gate，AAPI-0.3 不抢跑。

## 6. Query Revision / Cursor / ETag

### 6.1 Query revision

domain：

```text
robothree.admin-control.query-inventory.v1\n
```

material 至少包括：

```text
contractVersion
module
sourceKind
sourceRevision
availability
safeReasonCode?
ordered safe projection items
```

禁止包含 Principal、capability、cursor、request id、server time、Secret、endpoint 或 raw package content。

### 6.2 稳定排序

- Model/Robot/Skill/Tool/Knowledge：NFC displayName 升序，再按 stable resource id ASCII 升序；
- Audit：occurredAt 倒序，再按 auditEventId ASCII 升序；
- 同一 queryRevision 下排序必须稳定；
- 不使用数据库默认顺序、HashMap iteration 或前端排序。

### 6.3 Cursor

opaque cursor 固定 prefix `r3admin1.`，payload 内绑定：

```text
contractVersion
module
queryRevision
lastSortKey
lastResourceId
limit
codecRevision
```

测试 shell 使用 per-runtime cryptographic key；key 不进入 JSON、日志或 evidence。restart 后旧 cursor 无法证明当前
runtime，统一返回 `stale_cursor`，不泄漏 signature 是否正确。跨 module、queryRevision drift、sort key mismatch
也返回 `stale_cursor`；语法不合法返回 `invalid_request`。

### 6.4 ETag

- page ETag 覆盖 queryRevision + cursor page boundary + returned item identities；
- detail ETag 覆盖 exact resource revision + safe Projection；
- ETag/revision 仅为缓存/并发事实，不作为授权依据；
- 304 前仍必须完成 Principal 与 capability authorization，不能以 ETag 命中绕过授权。

## 7. 错误语义

| 条件 | HTTP/code | 规则 |
| --- | --- | --- |
| header/query/path/schema invalid | 400 `invalid_request` | 不回显原值 |
| test Principal 未建立 | 401 `admin_session_required` | AAPI-0.3 test shell 仍使用统一语义 |
| 已识别但 capability denied | 403 `permission_denied` | 不返回 role/capability graph |
| module ready/partial 且 item 不存在 | 404 `not_found` | detail only |
| cursor 语法合法但 revision/runtime/module drift | 410 `stale_cursor` | 不区分 HMAC mismatch |
| module 业务线未实现/gated | 422 `business_rule_unavailable` | Tool/Knowledge/Agent lifecycle 等 |
| dependency 缺失、inventory 损坏、digest drift | 503 `service_unavailable` | 整个 module fail-closed |
| unknown exception | 503 `internal` | 固定 safe summary + correlation id |

缺 source 与 empty page 不得混淆；坏 record 不能跳过后返回 200 partial page。

## 8. 敏感信息与安全边界

HTTP、Projection、cursor、ETag、日志、evidence 和测试快照禁止包含：

- API Key、Token、Bearer、Cookie、Secret、Credential Reference 或 mask；
- Provider endpoint、gateway endpoint、Binding、Adapter Descriptor、环境变量；
- Agent system prompt、identity/goal/instructions 原文；
- Skill 文件正文、脚本、压缩包内容或本地路径；
- Knowledge chunk、embedding、query、retrieval result；
- Task/Message/ModelRequest/Tool arguments、private reasoning；
- raw entitlement、role graph、policy expression、完整 audit payload；
- Desktop workspace path、Core private handle、stack trace。

安全摘要只能来自 allowlisted fixed mapper 或 bounded、validated safe manifest fields；不得直接透传
`unavailableReason`、exception message 或 Provider body。

## 9. 一致性、并发与恢复

- 每个请求只使用一个 captured inventory lease；list 过程中 source current pointer 漂移不拼接两代数据；
- cursor 下一页必须匹配原 queryRevision；漂移 typed stale，不自动回第一页；
- detail 请求独立捕获 current lease，不承诺跨请求 snapshot transaction；
- response loss 可由客户端使用同 query 重新读；读接口无 command receipt、不建 replay journal；
- restart 后新 cursor key 使旧 cursor stale；资源事实仍从 current verified authority 重建；
- test fixture 与 real configuration source 不得混装成同一 inventory；重复 source 启动失败；
- 不引入 sleep、自动 retry 或 silent fallback。

## 10. 文件边界

### 10.1 编码获授权后允许

- `services/central-service/src/main/java/com/robothree/central/admincontrol/**`；
- `services/central-service/src/test/java/com/robothree/central/admincontrol/**`；
- 必要的 configuration/modelgateway persistence read Port **仅在不改变既有写语义且方案明确列出时**；
- `packages/contracts/tests/**` 与 cross-consumer fixture tests；
- AAPI-0.3 Harness/evidence scripts；
- version、实施报告和治理文档。

### 10.2 继续禁止

- `apps/admin-console/**`；
- `apps/desktop/**`、`services/core/**`、Main/Preload/IPC/Renderer；
- public Contract source 与 Contract version；
- migration、新依赖、root workspace 配置、`pnpm-lock.yaml`；
- EIPC production identity/session adapter；
- TGM、Knowledge Provider、Agent Lifecycle、Skill Runtime、DFI-5.3；
- POST/PUT/PATCH/DELETE Controller。

如果必须修改公共 Contract、migration、依赖或 Admin 前端，立即停止并回文档评审。

## 11. 分批实施

### Step 1：Projection Domain / Ports / Cross-language Binding（2～3 日）

- 六类 inventory lease/read fact；
- representation Converter 与 queryRevision material；
- Java Projection records/validators；
- TS/Java/cross-consumer fixture conformance；
- module availability/capability intersection。

### Step 2：Read Service / Configuration-backed Partial Inventory（3～5 日）

- single-capture Query Service；
- strict verified configuration/package materializer；
- stable sort、pagination、cursor、ETag；
- honest partial/unavailable module mapping；
- audit partial source 与 source integrity tests。

### Step 3：Test-only HTTP Shell / Harness / Boundary（2～4 日）

- 12 GET routes、strict mapper、safe error assembler；
- development/test explicit composition；
- production Controller/mapping/source count=0；
- HTTP E2E、restart/cursor/security/leak/boundary evidence；
- root/Central online/offline regression 与报告。

合计 **7～12 个集中工程日**。这替代 AAPI-0 总计划中未拆分的粗估；AAPI-0.4、Admin Adapter 和业务 CRUD 不计入。

## 12. QA 矩阵（96 项）

### A. Contract / Representation / Cross-language（QA-001～QA-016）

1. QA-001：Java Model Projection 与 TS schema fixture 一致；
2. QA-002：Robot Projection 与 TS schema fixture 一致；
3. QA-003：Skill Projection 与 TS schema fixture 一致；
4. QA-004：Tool Projection 与 TS schema fixture 一致；
5. QA-005：Knowledge Projection 与 TS schema fixture 一致；
6. QA-006：Audit Projection 与 TS schema fixture 一致；
7. QA-007：unknown field 在 test mapper 中拒绝；
8. QA-008：raw 64 hex 只经 Converter 变为 `sha256:`；
9. QA-009：`sha256:` 不得写回 raw hex authority；
10. QA-010：ETag/queryRevision/resource revision 四层不混写；
11. QA-011：Robot cross-consumer identity/revision exact；
12. QA-012：Tool cross-consumer identity/revision exact；
13. QA-013：restriction 三态 exact；
14. QA-014：Tool readOnly/risk 缺事实不补默认值；
15. QA-015：Admin-only 字段不进入 Desktop fixture；
16. QA-016：Contract source/version/root export 零漂移。

### B. Authority / Inventory / Projection（QA-017～QA-032）

17. QA-017：active snapshot integrity 失败使 module 整体失败；
18. QA-018：exact package ref revision/digest mismatch 失败；
19. QA-019：缺 source 与 empty inventory 可区分；
20. QA-020：单个坏 record 不静默跳过；
21. QA-021：Model provider label 缺失不按 endpoint 猜；
22. QA-022：Model default fact 缺失不默认 false；
23. QA-023：Robot restriction 缺 strict material 时 unavailable；
24. QA-024：Robot source/lifecycle 不按 active ref 扩大；
25. QA-025：Skill validation valid 不等于 runtime ready；
26. QA-026：Tool risk/readOnly 缺失时 module gated/unavailable；
27. QA-027：Knowledge Provider 缺失时 state 不得 ready；
28. QA-028：Audit actor 缺失时不推断用户；
29. QA-029：Audit result 缺失时不推断 allowed；
30. QA-030：inventory lease immutable；
31. QA-031：一个请求 source capture count=1；
32. QA-032：assembler authority read count=0。

### C. Authorization / Capability / Identity（QA-033～QA-048）

33. QA-033：每请求 Principal resolve count=1；
34. QA-034：每请求 capability snapshot count=1；
35. QA-035：browser userId 被拒绝；
36. QA-036：browser role/capability 被拒绝；
37. QA-037：缺 Principal → 401；
38. QA-038：identified denied → 403；
39. QA-039：read ready + module partial → effective partial；
40. QA-040：read ready + module unavailable → effective unavailable；
41. QA-041：write/action capability 始终 gated；
42. QA-042：testIdentityUsed=true；
43. QA-043：productionIdentityReady=false；
44. QA-044：两 flag 不合法组合失败；
45. QA-045：production Principal provider count=0；
46. QA-046：production development inventory source count=0；
47. QA-047：重复 Principal/source 启动失败；
48. QA-048：授权失败时 inventory capture count=0。

### D. HTTP / Cursor / ETag / Error（QA-049～QA-064）

49. QA-049：12 条 GET route 精确注册；
50. QA-050：POST/PUT/PATCH/DELETE route count=0；
51. QA-051：generic module/action dispatcher count=0；
52. QA-052：缺 Contract header → 400；
53. QA-053：未知 query parameter → 400；
54. QA-054：GET body → 400；
55. QA-055：limit 1～100；
56. QA-056：稳定排序与 tie-break；
57. QA-057：cursor 绑定 module；
58. QA-058：cursor 绑定 queryRevision；
59. QA-059：restart 后旧 cursor → stale_cursor；
60. QA-060：cursor 语法坏 → invalid_request；
61. QA-061：ETag 命中仍先授权；
62. QA-062：304 无 body；
63. QA-063：item absent 与 module unavailable 精确区分；
64. QA-064：unknown exception 固定 safe error、无 stack。

### E. Lifecycle / Concurrency / Failure（QA-065～QA-080）

65. QA-065：一次 now 采样复用于 envelope/lease；
66. QA-066：分页途中 current source 漂移不拼接；
67. QA-067：下一页 revision drift → stale；
68. QA-068：response loss 重读不写 durable receipt；
69. QA-069：read request mutation count=0；
70. QA-070：read request transaction write count=0；
71. QA-071：dependency missing → 503；
72. QA-072：business line gated → 422；
73. QA-073：bad record fail-closed、无 partial 200；
74. QA-074：test fixture 与 real source 不混装；
75. QA-075：source restart 重建 current inventory；
76. QA-076：cursor key 不 durable、不输出；
77. QA-077：并发同 queryRevision page material 相同；
78. QA-078：detail ETag 随 safe Projection drift 改变；
79. QA-079：queryRevision 不随 request/correlation/time 变化；
80. QA-080：capability 变化不篡改 resource queryRevision。

### F. Security / Boundary / Regression（QA-081～QA-096）

81. QA-081：Secret 正向注入可检出；
82. QA-082：Token/Bearer/Cookie 正向注入可检出；
83. QA-083：Credential Reference/Endpoint 正向注入可检出；
84. QA-084：Prompt/Skill body/Tool args 正向注入可检出；
85. QA-085：workspace path/stack 正向注入可检出；
86. QA-086：正常四通道敏感命中 0；
87. QA-087：cursor/ETag 不含可逆敏感 material；
88. QA-088：production Controller bean count=0；
89. QA-089：production mapping count=0；
90. QA-090：Admin/Desktop/Core/Document Worker 零修改；
91. QA-091：migration 最大 id 仍 26；
92. QA-092：lockfile digest 不变；
93. QA-093：TS/Java focused PASS；
94. QA-094：Central online/offline PASS；
95. QA-095：root check/lint/architecture/audit PASS；
96. QA-096：evidence 最高仅输出允许 marker + readiness false。

禁止 `.skip`、`.only`、`@Disabled`、sleep 猜并发窗口、自动 retry 掩盖失败、硬编码资源 0 或用 schema parse
失败冒充 authorization/source graph 证据。

## 13. 停手条件

出现任一情况立即停止并回文档评审：

1. 必须修改 `admin-control.v1alpha1` Contract 才能诚实表达结果；
2. 必须新增 migration、表、索引或 durable cursor store；
3. 必须读取 Local Core/Desktop DTO 才能生成 Admin Robot/Tool；
4. 必须填默认 false/空数组/healthy 才能通过 Projection schema；
5. 必须接收真实 Secret、Endpoint、Credential 或 Skill package；
6. 必须实现 mutation 才能完成本批；
7. 必须安装 Browser production session/security 才能让 shell 测试通过；
8. development/test source 会进入 production graph；
9. 需要 `@ConditionalOnMissingBean` 或 Fake fallback；
10. Tool readOnly/risk、Robot restriction/lifecycle 或 Model default 无可信 authority；
11. 现有 configuration snapshot integrity 无法证明 inventory；
12. 需要新增依赖或修改 lockfile；
13. 需要修改 Admin Vue、Desktop、Core、Main、Preload 或 IPC；
14. Central online/offline 不能在 JDK 21 环境通过；
15. 并行窗口使 root baseline 无法可靠归因。

## 14. 文档评审问题

1. 是否接受 AAPI-0.3 只提供 development/test HTTP shell，production mapping 继续为 0？
2. 是否接受六模块分别表达 partial/unavailable，而不是为每个模块生成 fixture success？
3. 是否接受 active configuration 只有通过 integrity verifier 后才可投影有限事实？
4. 是否接受 Tool 在 readOnly/risk/TGM authority 缺失时整体 gated/unavailable？
5. 是否接受 Robot 缺 restriction/publish authority 时不进入 ready inventory？
6. 是否接受 Model detail 缺 default authority 时 typed unavailable，而不是默认 false？
7. 是否接受 Knowledge 永不投影 ready，Audit 只表达 partial system facts？
8. 是否接受 per-runtime test-only HMAC cursor，restart 后旧 cursor stale？
9. 是否接受 AAPI-0.4 前不修改 AdminAdapter、不宣称 Browser-ready？
10. 是否接受 7～12 日估算和三步串行实施？

## 15. 当前状态与下一步

```text
AAPI-0 Plan        PASS/CLOSED
AAPI-0.1           PASS/CLOSED
AAPI-0.2           PASS/CLOSED
AAPI-0.3           PASS/CLOSED
AAPI-0.4           DOCUMENT REVIEW PENDING / CODING GATED
Admin Adapter      AAPI-0.4 PLAN ONLY / CODING GATED
Production identity=false
TGM=false
Knowledge Provider=false
Agent Lifecycle=false
```

用户已接受 AAPI-0.3 独立 QA并正式关闭该批。AAPI-0.4 当前只进入 Browser Security / Admin Adapter /
development-test integration 详细方案评审；方案评审不等于编码授权，也不自动解锁下游。
