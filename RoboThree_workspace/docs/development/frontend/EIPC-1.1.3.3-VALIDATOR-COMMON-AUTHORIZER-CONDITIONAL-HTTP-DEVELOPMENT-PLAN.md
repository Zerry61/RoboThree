# EIPC-1.1.3.3 Validator / Common Authorizer / Conditional HTTP 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED；INDEPENDENT QA PASS；USER ACCEPTED；PASS/CLOSED / DORMANT FOUNDATION**  
> 日期：2026-08-24  
> 负责人：Codex 5.6  
> 上游：EIPC-1.1.3.1、EIPC-1.1.3.2 `PASS/CLOSED`；EIPC-1.1.3 计划 `PASS/CLOSED`  
> blocker：`BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION` 与 identity composition blocker 保持打开

## 0. 结论与授权边界

EIPC-1.1.3.3 负责完成 Central 内部的 Session Token 校验、legacy/session 统一授权接缝，以及默认关闭的
Enterprise Session HTTP Foundation。它不提供真实企业身份输入，也不把尚未实现的 production resolver、codec
或 signing handle 伪装成可用依赖。

本批最高允许输出：

```text
EIPC113_SESSION_HTTP_FOUNDATION_CONFORMANT
```

并必须同时输出：

```text
productionSessionEnabled = false
productionIdentityReady = false
identityCompositionBlockerClosed = false
downstreamCodingUnlocked = false
```

本批已完成实现、独立 QA 与用户接受，只作为默认关闭的 dormant foundation 保留。EIPC-1.2、EIPC-1.3、
EIPC-2、EIPC-3 已移出当前版本；本批不得被解释为真实 SSO、production identity 或下游业务编码授权。

## 1. 已核实的代码基线

### 1.1 已交付并直接复用

- EIPC-1.1.1 已冻结 `enterprise-session.v1alpha1` strict Wire Contract、`eipc.session-token.v1` claims profile、
  `EnterpriseBearerPrincipal`、`EnterpriseBearerAuthorizationResult` 与 `EnterpriseBearerAuthorizer` Port；
- EIPC-1.1.2 已交付 PostgreSQL v0010、`EnterpriseSessionPersistence`、immutable Lease Issuance 与统一 load-time
  validator；
- EIPC-1.1.3.2 已交付 handle-bound Challenge 和同事务 Session Lease；`tokenCodec.encode()`、Challenge consume、
  Lease issuance 已处于同一 `CentralTransactionRunner.required()` closure；
- `EnterpriseSessionTokenCodec.decodeAndVerify()` 已要求 expected issuer、audience 与 opaque verification key handle；
- `EnterpriseBearerTokenFilter` 当前只从受保护 Configuration / Model Invocation 请求提取 bearer，并将其放入 request
  attribute；它不读取 JWT header/payload、不验签、不缓存、不记录 bearer；
- `CentralProductionBootstrapConfiguration` 已通过 `SmartInitializingSingleton` 在 HTTP ready 前执行 production
  dependency/readiness 校验，可承载本批 activation fail-closed；
- `GlobalExceptionHandler` 已提供 `400/401/403/409/503/500` 与 `Cache-Control: no-store` 的安全映射基础。

### 1.2 当前真实缺口

| 编号 | 当前事实 | 本批处理 |
| --- | --- | --- |
| G1 | 尚无 strict Session Token production validator | 新增 validator foundation；production codec/key 缺失时不安装 Session branch |
| G2 | `ConfigurationReadService` 直接依赖 `RoboThreeAccessTokenValidator` | 改依赖 Common Authorizer，legacy 行为零漂移 |
| G3 | `RoboThreeModelInvocationAccessAuthorizer` 直接依赖 legacy validator | 改依赖 Common Authorizer，仍返回既有 `AuthorizedSubject` |
| G4 | 尚无 legacy/session Composite | 新增“恰好一个分支成功”组合器，不解析未验证 payload 路由 |
| G5 | 尚无 Enterprise Session HTTP Controller | 条件注册 Challenge / Lease Controller，默认完全不注册 |
| G6 | production resolver、Session codec、signing/verification handle provider 均缺失 | property=true 时 HTTP ready 前启动失败，禁止 Fake 补位 |
| G7 | production dependency manifest 尚不表达 Session 可选能力 | 新增 feature-scoped dependency gate，不把可选能力变成全局无条件依赖 |
| G8 | legacy Filter 与 consumer 职责可能被误合并 | Filter 永久保持 extract-only；授权只在 application consumer 接缝发生 |

## 2. 范围与非目标

### 2.1 本批实现范围

1. `EnterpriseSessionTokenValidator`；
2. `LegacyBearerAuthorizerAdapter`；
3. `CompositeEnterpriseBearerAuthorizer`；
4. Common Authorizer 的 typed result-to-exception mapper；
5. Configuration 与 Model Gateway 两个既有 consumer 的 additive cutover；
6. Enterprise Session Challenge / Lease strict HTTP models、mapper、controller 与 safe error projection；
7. `robothree.enterprise-session.enabled` 默认关闭的 activation configuration；
8. property / dependency / controller registration / startup-ready architecture tests；
9. legacy token 全量回归、dual-profile conformance 与 conditional HTTP Harness。

### 2.2 明确不做

- 不实现 production `VerifiedIdentityHandleResolver`；
- 不实现 production `EnterpriseSessionTokenCodec`、Secure Enclave signer 或 verification-key distribution；
- 不实现本地 Enterprise Credential Store、Core `EnterpriseAccessTokenProvider` 或 Runtime composition；
- 不关闭两个 identity blocker；
- 不修改 frozen `enterprise-session.v1alpha1` Contract、Gateway v1alpha1/v1alpha2 Contract 或 claims profile；
- 不新增 PostgreSQL v0011，不改 v0001～v0010；
- 不修改 Desktop、Main、Preload、Renderer、Core、Document Worker；
- 不注册依赖 Fake resolver、fixed userId、OS user、单行数据库推断或 test codec 的 production endpoint；
- 不持久化 bearer、verified identity handle、proof、signature 或 verification/signing key material；
- 不建设 SSO 登录 UI、Admin Console、个人模型 CRUD/reveal 或 DFI-4A.4 接线。

## 3. Session Token Validator

### 3.1 Production-private 依赖

在既有 Port 基础上新增或冻结以下 production-private 依赖接缝：

```text
EnterpriseSessionVerificationKeyHandleProvider
  requireCurrent() -> SessionVerificationKeyHandle

EnterpriseSessionTokenValidator
  authorize(compactToken, requiredPermission, now)
    -> EnterpriseBearerAuthorizationResult
```

`EnterpriseSessionVerificationKeyHandleProvider` 只返回 opaque/redacted handle，不返回 public/private key bytes；它与
signing handle provider 可以共享同一受控 key identity，但职责与类型必须分离。production 实现留 EIPC-1.2。

### 3.2 固定验证顺序

Session branch 必须严格按以下顺序执行：

1. bearer 非空、ASCII、长度 16～16384；超限在 codec 前返回 `invalid`；
2. 获取当前 verification key handle；依赖缺失/不可用返回 `unavailable(enterprise_session_unavailable)`；
3. `decodeAndVerify()` 完成 signature、issuer、audience 验证；
4. strict 构造 `EnterpriseSessionTokenClaims`，验证 claims profile、UUID、permission enum、UTC millisecond 与时间顺序；
5. 以 `tokenId` 调用 `EnterpriseSessionPersistence.loadLeaseByTokenId()`；缺失返回 `invalid`；
6. 计算 raw compact bearer digest，并与 durable `tokenDigest` timing-safe equality；
7. claims 与 Lease Issuance 的 indexed facts 逐字段精确比较；
8. 复用 EIPC-1.1.2 单一 persistence validator 重算 assertion、trust、source-decision、record digest；
9. 校验 enterprise/user/device/client、permissions、compatibility revision 与所有绑定 digest；
10. 只有 1～9 全部通过后才判断 `expiresAt <= now`，此时返回
    `expired(eipc.session-token.v1)`；
11. 校验 required permission；缺失必须映射 `permission_denied`，不得变成 token invalid；
12. 返回不含 bearer、assertion/trust JSON 或 key handle 的 `EnterpriseBearerPrincipal`。

### 3.3 verified expiry 的定义

以下情况不得返回 `expired`：

- 仅从未验证 JWT payload 读到过期时间；
- signature、issuer、audience 或 claims profile 未通过；
- durable issuance 不存在；
- token digest、claims/issuance、record digest 任一不匹配；
- verification dependency unavailable。

`expired` 是“已完成 cryptographic + durable verification 后确认过期”的事实，不是解析提示。该定义同时适用于
legacy adapter 与 Session validator。

### 3.4 Validator 失败矩阵

| 输入/状态 | branch result | 禁止行为 |
| --- | --- | --- |
| malformed / oversized / bad signature | `invalid` | 不读 payload 路由、不查另一套持久层猜 profile |
| verified token + issuance missing | `invalid` | 不把签名成功当授权成功 |
| token/record/digest tamper | `invalid` | 不返回内部 mismatch 字段 |
| verified and durably matched expired | `expired(verifiedProfile)` | 不降级成 generic invalid |
| verification key/codec/persistence unavailable | `unavailable(safeCode)` | 不 fallback 到另一个 branch 成功 |
| valid but permission missing | common mapper `permission_denied` | 不抹平成 access token invalid |

## 4. Legacy Adapter 与 Composite Authorizer

### 4.1 Legacy branch

`LegacyBearerAuthorizerAdapter` 必须完整复用 `RoboThreeAccessTokenValidator` 的 codec、issuer/audience/time、
issuance 与 token digest 校验，不复制 legacy JWT 解析逻辑。

映射规则：

- 完整成功 -> `success(legacy principal)`；
- 完整验证后过期 -> `expired(v1alpha1)`；
- `access_token_invalid` -> `invalid`；
- 依赖不可用 -> `unavailable(typedSafeCode)`；
- permission 不在 branch 内提前抹平；由 common authorizer 对成功 principal 统一检查。

必须为 cutover 前后的 legacy 响应码、error code、retryable、principal identity 与授权结果建立 golden regression。

### 4.2 不读取未验证 payload

`CompositeEnterpriseBearerAuthorizer` 必须收到一组已安装 branch，并对每个 branch 调用完整 `authorize()`；禁止：

- decode JWT header/payload 获取 `claimsProfile` 后选择 branch；
- 根据 token prefix、长度、点号数量、tokenId 或 issuer 猜 branch；
- legacy 失败后才尝试 Session，或 Session 失败后 fallback legacy；
- 将 branch 顺序作为优先级；
- 把 disabled Session branch 安装成永远 `invalid` 的假分支。

token 只在方法局部变量中传给两个 branch；日志、trace、metrics、exception、Evidence 不得包含 token 或其派生形态。

### 4.3 “恰好一个成功”真值表

| Legacy | Session | Composite 结果 |
| --- | --- | --- |
| success | invalid | success legacy |
| invalid | success | success session |
| success | success | `access_token_profile_ambiguous` |
| expired(verified legacy) | invalid | `access_token_expired` |
| invalid | expired(verified session) | `access_token_expired` |
| expired | expired | `access_token_profile_ambiguous`，不得猜 profile |
| invalid | invalid | `access_token_invalid` |
| unavailable | invalid/expired/success | typed service unavailable，禁止 fallback |
| invalid/expired/success | unavailable | typed service unavailable，禁止 fallback |
| unavailable | unavailable | typed service unavailable，若 safeCode 不同则使用统一 `enterprise_session_unavailable` |

补充规则：

1. production property=false 时只安装 legacy branch，因此不存在伪造的 Session `invalid`；
2. 两个 branch 只有一个成功时才进一步检查 common principal permission；
3. 两个 success 即使 principal material 完全相同也必须 ambiguous；
4. verified expired 仅在另一 branch 为 `invalid` 时保留；另一 branch `unavailable` 时不可掩盖 unavailable；
5. Composite 输出只允许 `EnterpriseAuthenticationException` 的安全 code/summary，不输出 branch 内部异常。

### 4.4 Common permission mapper

新增单一 mapper 将 result 转成 principal 或 typed exception：

```text
success + hasPermission       -> principal
success + missingPermission   -> permission_denied / 403
invalid                       -> access_token_invalid / 401
verified expired              -> access_token_expired / 401
ambiguous                     -> access_token_profile_ambiguous / 401
unavailable                   -> typed safe service code / 503
```

required permission 必须来自服务端 consumer 常量，不接受 request/body/Renderer 自报。

## 5. Consumer Cutover

### 5.1 Filter 永久保持 extract-only

`EnterpriseBearerTokenFilter` 只允许：

1. 判断受保护路径；
2. 提取唯一 `Authorization: Bearer ...`；
3. 将 compact token 放入 request attribute；
4. 请求结束后移除 attribute；
5. 提取失败时返回既有 `access_token_invalid`。

禁止在 Filter 内 decode、validate、选择 profile、查数据库、查 permission 或缓存 principal。Filter 源码需有
architecture test 锁定：不得依赖 codec、persistence、authorizer implementation 或 JWT parser。

### 5.2 Configuration consumer

`ConfigurationReadService` 构造依赖由 concrete `RoboThreeAccessTokenValidator` 改为
`EnterpriseBearerAuthorizer`，`read()` 与 `readPackage()` 均调用统一 helper：

```text
authorize(compactToken, "configuration.read", now)
```

`now` 由注入 Clock 单次采样，不由 Controller 传入。除授权接缝外，ETag、snapshot integrity、package exact
reference 与 response bytes 必须零漂移。

### 5.3 Model Gateway consumer

`RoboThreeModelInvocationAccessAuthorizer` 改依赖 Common Authorizer：

```text
authorize(compactToken, "model.use", now)
  -> AuthorizedSubject(enterpriseId, userId, deviceId, clientInstanceId)
```

不得把 `claimsProfile`、tokenId、Session assertion 或 trust detail 注入 Model Invocation business material；已有
request/selection/audit digest 不因 token profile 改变。

### 5.4 Cutover 完整性

本批必须一次性修改所有 production 受保护 consumer。architecture source/dependency graph 扫描必须证明：

- production consumer 不再直接依赖 `RoboThreeAccessTokenValidator`；
- 唯一允许持有 legacy validator 的 production class 是 `LegacyBearerAuthorizerAdapter`；
- Filter 仍 extract-only；
- test-only direct validator usage 不进入 production graph；
- 不存在 legacy/session 双写、双 principal cache 或第二套 permission evaluator。

若发现第三个 production consumer 直接依赖 legacy validator，必须纳入同一 cutover；不得留下半切换。

## 6. Conditional HTTP Foundation

### 6.1 固定 Endpoint

仅在 Session feature 完整启用时注册：

```text
POST /enterprise-session/v1alpha1/device-challenges
POST /enterprise-session/v1alpha1/session-leases
```

请求/响应必须逐字段映射 EIPC-1.1.1 frozen Contract；Controller 不自行拼 canonical JSON/digest，不读取数据库，
不选择 identity，不签名 token。

### 6.2 HTTP 安全边界

- 只接受 `application/json`，拒绝未知字段、重复 JSON key、trailing token 与错误 charset；
- Challenge body 上限 32 KiB，Lease body 上限 64 KiB；超过上限必须在 JSON mapping/service 前返回安全错误；
- response 与所有 error 均 `Cache-Control: no-store`；Lease success 追加 `Pragma: no-cache`；
- 不把 bearer、handle、proof、signature、nonce、key handle 写入日志、trace、metrics 或 exception；
- correlationId 只在 request strict validation 成功后进入安全 response；非法 request 使用 server trace id，不回显原值；
- Controller 不接受 verifiedIdentityId、userId、enterpriseId、deviceId 或 permission decision；
- Lease access token 只在 service result 到 HTTP response 的局部引用存在；不进入 Event/Audit/Evidence；
- response loss 不 replay bearer；客户端必须重新发起 fresh Challenge/Lease。

### 6.3 Error 投影

Session HTTP 使用 frozen `EnterpriseSessionErrorV1Alpha1` allowlist；application 内部 code 必须通过显式 mapper：

- handle invalid/drift -> 对应 frozen identity handle code；
- challenge expired/replayed、signature/context、managed/compliant、permission、compatibility、conflict -> 对应 frozen code；
- dependency unavailable -> `enterprise_session_unavailable` / 503 / retryable=true；
- 未知内部异常 -> `internal` / 500 / retryable=false。

禁止把 persistence table/column、SQL、class name、stack、JWT、handle、proof 或内部 mismatch detail 写入响应。

## 7. 三态启动策略

### 7.1 配置源

新增唯一配置：

```text
robothree.enterprise-session.enabled=false
```

默认值必须为 false。环境变量映射可使用 Spring 标准 relaxed binding，但 source of truth 仍是该 property；不得通过
“发现某个 bean 存在”自动启用，也不得由 HTTP request、数据库 row、Main/Renderer 或测试参数动态切换。

### 7.2 三态定义

| 状态 | property | production 依赖 | Controller/branch | 启动结果 |
| --- | --- | --- | --- | --- |
| DISABLED | false | 不要求 Session 依赖 | 不注册 Session endpoint；只安装 legacy branch | 正常启动 |
| REQUESTED_BUT_INCOMPLETE | true | 任一必需依赖缺失/ambiguous/test-only | 不得进入 HTTP ready | `CentralProductionStartupException` fail-closed |
| ENABLED | true | 每项恰好一个 production 实现且 readiness 校验通过 | 注册两个 endpoint；安装 legacy+session Composite | 正常启动 |

EIPC-1.1.3.3 当前交付后，仓库 production composition 仍应处于 `DISABLED`；由于 EIPC-1.2 尚未交付真实依赖，
不得在本批把默认值改为 true，也不得输出 ENABLED Evidence。

### 7.3 启用时的必需 production 依赖

至少包含：

- `VerifiedIdentityHandleResolver`；
- `EnterpriseSessionTokenCodec`；
- `EnterpriseSessionSigningKeyHandleProvider`；
- `EnterpriseSessionVerificationKeyHandleProvider`；
- `EnterpriseSessionPersistence` 的 MyBatis production adapter；
- `IssueEnterpriseSessionChallengeService`；
- `IssueEnterpriseSessionLeaseService`；
- `EnterpriseSessionTokenValidator`；
- `CompositeEnterpriseBearerAuthorizer`；
- identity/device/permission/trust/proof/compatibility/transaction 的既有 production 依赖。

每种 Port 必须恰好一个 production bean。Fake、InMemory、test fixture、fixed userId、OS user、单行数据库推断、
deterministic codec、test signing key 任一进入 production graph，都必须启动失败。

### 7.4 HTTP ready 前失败关闭

activation gate 必须接入现有 production startup gate，执行顺序固定：

```text
property parse
  -> base production dependency validation
  -> schema v0010 readiness
  -> Session feature dependency validation
  -> Session validator/composite/controller graph validation
  -> HTTP ready
```

要求：

- property=true + 依赖缺失：Spring context/production startup 失败，不能只是 readiness health DOWN 后仍监听业务端口；
- property=true + 依赖 ambiguous 或 test-only：同样在 ready 前失败；
- property=false：Controller bean 数为 0、RequestMapping 数为 0、Session branch 数为 0；请求必须 404，而不是
  401/503 或返回“暂不可用”的假 endpoint；
- 不允许启动成功后后台等待 dependency，再静默注册 endpoint；
- feature 状态不可运行时热切换；变更 property 需要完整重启与重新校验。

## 8. 组合与 Bean 边界

### 8.1 Legacy-only composition

property=false 时：

- `LegacyBearerAuthorizerAdapter` + single-branch `CompositeEnterpriseBearerAuthorizer` 仍可作为 Common Authorizer，
  供既有 Configuration/Model Gateway consumer 使用；
- Session validator、Session Controller 与 production Session services 不安装；
- legacy authorization 的 HTTP/error/digest 行为必须与 cutover 前完全一致。

### 8.2 Session-enabled composition

property=true 且依赖完整时：

- Common Authorizer 同时安装 legacy/session 两个 branch；
- Controller 只依赖两个 application service 与 mapper；
- Session validator 只依赖 codec、verification handle provider、persistence 与 clock/policy；
- startup gate 从 bean factory 验证 production 类型与 cardinality，不接受接口名相同的 test implementation。

### 8.3 禁止循环依赖与隐式 fallback

- Common Authorizer 不依赖 Controller/Filter；
- Session service 不依赖 Common Authorizer；
- Filter 不依赖 Common Authorizer；
- production activation 不通过 catch-and-log 变成 disabled；
- `@ConditionalOnMissingBean` 不得生成 Fake/no-op Session dependency；
- 不允许用 `Optional`/`ObjectProvider.getIfAvailable(Fake::new)` 绕过缺失依赖。

## 9. 崩溃、并发与恢复窗口

| 窗口 | 场景 | 必须结果 |
| --- | --- | --- |
| A1 | property=false startup | endpoint/Session branch 均不存在，legacy 正常 |
| A2 | property=true、resolver 缺失 | HTTP ready 前启动失败 |
| A3 | property=true、codec/key provider 缺失 | HTTP ready 前启动失败 |
| A4 | property=true、Fake/test bean 注入 | production forbidden dependency 失败 |
| A5 | property=true、依赖重复 | ambiguous dependency 失败 |
| A6 | startup gate 后 dependency drift | 不支持热切换；进程必须重启，不静默 fallback |
| V1 | malformed token | 两 branch 完整安全失败，最终 invalid |
| V2 | legacy verified expired | Session invalid 时保留 expired |
| V3 | Session verified expired | legacy invalid 时保留 expired |
| V4 | dual valid | ambiguous，不猜 profile |
| V5 | branch unavailable + other success | unavailable，不 fallback |
| V6 | durable issuance corrupt/restart | fail-closed，不缓存旧 principal |
| H1 | Challenge response lost | 复用 EIPC-1.1.3.2 exact correlation 语义 |
| H2 | Lease response lost | bearer 不 replay，fresh Challenge/Lease |
| H3 | Controller crash after service return | durable Lease 仍权威，bearer 不可恢复 |
| H4 | Central restart | Session token 仅以 v0010 facts 重新验证 |
| C1 | legacy/session consumer 并发 | authorizer 无共享 mutable principal/token cache |
| C2 | Clock boundary expiry | 单次 now；同一次 authorize 不跨两套时钟 |

## 10. 文件修改范围

编码授权后仅允许修改：

```text
services/central-service/src/main/java/com/robothree/central/authentication/**
services/central-service/src/main/java/com/robothree/central/configuration/application/**
services/central-service/src/main/java/com/robothree/central/modelgateway/application/**
services/central-service/src/main/java/com/robothree/central/shared/adapter/http/**
services/central-service/src/main/java/com/robothree/central/bootstrap/production/**
services/central-service/src/main/resources/application*.yaml
services/central-service/src/test/**
scripts/run-eipc1.1.3.3-harness.mjs
scripts/eipc1.1.3.3-*/**
docs/development/frontend/**EIPC-1.1.3.3**
docs/development/qa/**eipc-1.1.3.3**
```

若 Java HTTP strict model 必须与 frozen TS Contract 对齐，只能在 Central 内新增 mapper/model；不得修改
`packages/contracts/src/enterprise-session/v1alpha1.ts`。

禁止修改：

```text
packages/contracts/** frozen source
services/central-service/deploy/migrations/v0001～v0010/**
services/core/**
services/document-worker/**
apps/desktop/**
apps/admin/**
pnpm-lock.yaml
root package.json / tsconfig.json
DFI-4A.4.1～4A.4.3 / DFI-2B / DFI-3 / TGM production work
```

若实现发现必须改 frozen Contract、migration、Desktop/Core 或 root dependency，必须停止编码并回到文档评审。

## 11. 实施步骤

### Step 1：Validator Foundation（3～5 日）

- verification key handle Port；
- Session validator 固定顺序；
- legacy adapter；
- strict branch result mapping；
- verified expiry / unavailable / tamper focused tests。

### Step 2：Composite 与 Consumer Cutover（3～5 日）

- Composite truth table；
- common permission mapper；
- Configuration/Model Gateway 同批 cutover；
- Filter extract-only architecture test；
- legacy golden regression 与 dual-valid ambiguity test。

### Step 3：Conditional HTTP 与 Startup Gate（4～6 日）

- Challenge/Lease HTTP strict model/mapper/controller；
- request body limit、no-store 与 safe error mapping；
- property=false / requested-incomplete / enabled 三态；
- ready 前 fail-closed；
- production graph scan 与 controller registration Harness。

合计估算 **10～16 个集中工程日**，替代父计划早期 5～8 日估算；不含独立 QA、返工、EIPC-1.2 production
adapter、EIPC-1.3 closure Harness 或现场企业环境联调。

## 12. QA 与门禁矩阵（100 项）

### 12.1 Validator（1～18）

1. bearer empty；2. non-ASCII；3. oversized；4. bad signature；5. wrong issuer；6. wrong audience；7. wrong profile；
8. invalid claims；9. issuance missing；10. token digest mismatch；11. claims mismatch；12. assertion digest mismatch；
13. trust digest mismatch；14. source-decision mismatch；15. record digest corrupt；16. verified expired；
17. dependency unavailable；18. permission missing。

### 12.2 Composite（19～36）

19. legacy success/session invalid；20. legacy invalid/session success；21. dual success ambiguous；22. dual invalid；
23. legacy verified expired/session invalid；24. legacy invalid/session verified expired；25. dual expired ambiguous；
26. legacy unavailable/session invalid；27. legacy invalid/session unavailable；28. unavailable+success 不 fallback；
29. success+unavailable 不 fallback；30. dual unavailable same code；31. dual unavailable different code；
32. branch 顺序交换结果一致；33. 不读未验证 header；34. 不读未验证 payload；35. permission 服务端常量；
36. common principal 不含敏感 material。

### 12.3 Consumer / Legacy Regression（37～54）

37. Filter 只 extract；38. Filter 不依赖 codec；39. Filter 不依赖 persistence；40. duplicate Authorization 拒绝；
41. Configuration legacy success；42. Configuration legacy expired；43. Configuration permission denied；
44. Configuration ETag 零漂移；45. package exact reference 零漂移；46. Model v1alpha1 legacy success；
47. Model v1alpha2 legacy success；48. Model session success；49. Model principal identity 精确；
50. claims profile 不进 business digest；51. production direct legacy consumer 数为 0；
52. legacy validator production holder 仅 adapter；53. 无第二 principal cache；54. 无半切换。

### 12.4 Conditional HTTP（55～70）

55. Challenge strict valid；56. Lease strict valid；57. unknown field；58. duplicate key；59. trailing JSON；
60. wrong content type；61. Challenge body oversized；62. Lease body oversized；63. success no-store；
64. Lease pragma no-cache；65. safe typed error；66. correlation invalid 不回显；67. internal error safe；
68. response/log 无 handle/proof/signature/bearer；69. response lost 不 replay bearer；70. Controller 不拼 digest。

### 12.5 Activation / Production Graph（71～88）

71. default property=false；72. false Controller bean=0；73. false mappings=0；74. false HTTP 404；
75. false Session branch=0；76. false legacy branch=1；77. true resolver missing 启动失败；
78. true codec missing 启动失败；79. true signing handle missing 启动失败；80. true verification handle missing 启动失败；
81. true persistence missing 启动失败；82. true duplicate dependency 启动失败；83. true Fake resolver 启动失败；
84. true fixed user adapter 启动失败；85. true test codec 启动失败；86. failure 在 HTTP ready 前；
87. 不后台静默 enable；88. 不 runtime fallback。

### 12.6 Recovery / Security / Boundary（89～100）

89. PostgreSQL restart validation；90. corrupt issuance fail-closed；91. Clock boundary single now；
92. concurrent authorization 无 mutable cache；93. raw/Base64/hex/URL-encoded canary 四通道负向检出；
94. stdout 0；95. stderr 0；96. log/trace 0；97. error/evidence 0；98. v0001～v0010 digest 零漂移；
99. frozen Contract digest 零漂移；100. Core/Desktop/Renderer/root config/lockfile 零漂移。

正式门禁必须严格串行：

```text
CI=true pnpm run harness:eipc1.1.3.3
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

Harness 必须输出测试数、legacy/session truth-table 结果、controller mapping count、production implementation count、
startup failure stage、敏感扫描结果与边界 digest；禁止把 test-only enabled context 表述为 production ready。

## 13. 文档评审问题

1. 是否接受 property=false 时采用 legacy-only Common Authorizer 完成 consumer cutover，而 Session branch 完全不安装？
2. 是否接受“verified expiry 只有在另一 branch invalid 时保留；任一 unavailable 优先 fail-closed”的组合规则？
3. 是否接受 property=true + 依赖缺失时直接阻止 Spring production startup，而不是仅 readiness health DOWN？
4. 是否接受新增独立 verification key handle provider，避免 codec 在 validator 内自行发现/选择 key？
5. 是否接受 10～16 个集中工程日的新估算？

## 14. 当前状态

```text
EIPC-1.1.3.2            PASS/CLOSED
EIPC-1.1.3.3 Plan       PASS/CLOSED
EIPC-1.1.3.3 Code       PASS/CLOSED / DORMANT FOUNDATION
EIPC-1.2～EIPC-1.3      DEFERRED / OUT OF CURRENT RELEASE
EIPC-2～EIPC-3          DEFERRED / OUT OF CURRENT RELEASE
STRM-3                  GATED
DFI-4A.4.1～4A.4.3      GATED
DFI-2B / DFI-3 / TGM    GATED
```

两个 identity blocker 继续保持打开。实现、独立 QA 与用户接受均已完成，本批作为默认关闭的 dormant
foundation 保留；不得据此进入任何真实 SSO 或 production identity 下游批次。实施证据见
[EIPC-1.1.3.3 实施报告](./EIPC-1.1.3.3-VALIDATOR-COMMON-AUTHORIZER-CONDITIONAL-HTTP-IMPLEMENTATION-REPORT.md)。
