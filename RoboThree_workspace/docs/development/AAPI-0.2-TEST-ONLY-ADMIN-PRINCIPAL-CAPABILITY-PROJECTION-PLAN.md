# AAPI-0.2 Test-only Admin Principal / Capability Projection 详细方案

> 状态：**DOCUMENT REVIEW PENDING / CODING GATED**  
> 日期：2026-08-24  
> 负责人：Codex 5.6  
> 上游：AAPI-0.1 `PASS/CLOSED`；DFI-3A.1 `PASS/CLOSED`；cross-consumer alignment v1 已确认  
> 本批性质：方案评审，不自动编码，不输出 `AUTHORIZED`、`IMPLEMENTED`、`PASS/CLOSED` 或 `AFE/AAPI READY`

## 0. 当前事实核查

| 事实 | 当前核查 |
| --- | --- |
| AAPI-0.1 | `admin-control.v1alpha1` TS-only Contract package 已实现并由用户接受关闭 |
| Admin Console | `apps/admin-console/**` 已存在，production 默认仍通过 `UnavailableAdminAdapter` 失败关闭 |
| Central Admin runtime | 尚无正式 Admin HTTP runtime、Controller、Filter、AdminAdapter wiring 或真实 RBAC |
| 身份线 | EIPC production identity blocker 继续打开；真实 SSO/OA/MDM、production resolver/codec/signer 不属于当前版本 |
| AAPI-0.2 位置 | 只规划 test-only 管理员 Principal 与 Capability Projection 的最小可验证基础，不提供生产身份就绪结论 |

结论：AAPI-0.2 可以进入文档评审，但编码必须另行授权；AAPI-0.2 即使实现通过，也不能关闭 production
identity blocker，不能宣称 Admin API 或 Admin Console 已可用于真实企业治理。

## 1. 目标

AAPI-0.2 后续若获编码授权，只解决四个基础问题：

1. 为 development/test profile 提供明确命名的 test-only 管理员 Principal；
2. 从服务端投影 Admin Capability Projection，作为未来 Admin 前端权限事实来源；
3. 在 production graph 中证明 test-only/fake/fixed/inmemory/development Principal 不存在；
4. 让 `admin-control.v1alpha1` envelope 持续表达 `testIdentityUsed=true` 与 `productionIdentityReady=false` 的安全事实。

本批最高只能输出：

```text
AAPI02_TEST_ONLY_ADMIN_PRINCIPAL_CAPABILITY_PROJECTION_CONFORMANT
```

不得输出：

```text
ADMIN_API_READY
ADMIN_ADAPTER_READY
ADMIN_RBAC_READY
PRODUCTION_IDENTITY_READY
ENTERPRISE_SSO_READY
AAPI_0_READY
```

## 2. 非目标

- 不实现真实 SSO、OA、MDM、RBAC、组织、角色继承或 group mapping；
- 不实现 Admin HTTP Controller、浏览器 Session、CSRF Filter、CSP header 或 AdminAdapter E2E；
- 不修改 `apps/admin-console/**`，不接入前端页面，不改变菜单、路由、权限壳或 UI；
- 不实现模型、机器人、技能、工具、知识或系统管理 CRUD；
- 不建立 Central Java mirror，不新增 Contract family，不改 `admin-control.v1alpha1` 已冻结语义，除非评审发现必须 additive；
- 不修改 Desktop、Core、Main、Preload、IPC、Renderer、migration、root 依赖或 lockfile；
- 不用 Fixture、Mock、LocalStorage、SessionStorage、IndexedDB 或前端数组伪装业务持久化。

## 3. 编码前置条件

| 条件 | 冻结口径 |
| --- | --- |
| AAPI-0.2 文档评审 | 本文需经 Claude Code 独立文档复核，并由技术负责人接受 |
| 编码授权 | 需用户单独授权 AAPI-0.2 编码；本文不构成编码许可 |
| 文件范围 | 编码前需确认是否允许触碰 `services/central-service/**`；若只允许 Contract package，则本方案必须修订 |
| JDK 环境 | 若触碰 Central Java，开发者和 QA 环境需具备 JDK 21 以复跑 Central online/offline |
| Admin 前端 | AAPI-0.2 不修改 `apps/admin-console/**`；AFE Adapter 消费另走 AFE 窗口 |
| production identity | blocker 继续打开；test-only Principal 不得用作 production readiness 证据 |

## 4. 计划文件范围

后续编码若获授权，建议允许：

- `services/central-service/**` 中 Admin principal / capability projection 的 domain、application、configuration
  与 tests；
- `packages/contracts/tests/**` 仅在需要补 AAPI-0.1 P3 的 subpath export 自动断言时触碰；
- `README.md`、`CHANGELOG.md`、`docs/development/DEVELOPMENT-LOG.md` 和实施报告；
- root / affected package version 仅按正式编码批规则升级，不新增依赖。

继续禁止：

- `apps/admin-console/**`；
- `apps/desktop/**`；
- `services/core/**`；
- Electron Main、Preload、IPC、Renderer；
- database migration；
- root dependencies、workspace 配置、`pnpm-lock.yaml`；
- EIPC production adapter、真实 Credential、TGM、Knowledge Provider 或 Max/DFI-5。

若实现需要新增依赖、改 lockfile、改 workspace 配置或接 HTTP runtime，必须先修订本方案并重新评审。

## 5. Test-only Principal 设计

规划 Central-private provider：

```text
DevelopmentAdminPrincipalProvider
profiles: development | test
source: central test/development composition only
```

投影事实：

```text
principalId: admintest_...
displayName: Test Admin
testIdentityUsed: true
productionIdentityReady: false
capabilitySetRevision: aapi02-dev-capabilities-v1
```

规则：

1. Principal id、displayName、capability set 必须是固定 fake/sentinel 值；
2. 禁止从 OS user、浏览器传入 userId、路由、菜单、LocalStorage、SessionStorage、cookie 明文或单条业务数据推断身份；
3. 禁止把 test-only Principal 写入 production source graph；
4. 禁止 `@ConditionalOnMissingBean`、`ObjectProvider.getIfAvailable(Fake::new)` 或默认构造 fake provider；
5. production profile 中 provider bean 数必须为 0；
6. 如果缺失真实 production Principal provider，production 必须 unavailable 或在 HTTP ready 前失败关闭，不能降级到 test-only。

## 6. Capability Projection

AAPI-0.2 只冻结服务端 capability projection，不冻结完整 RBAC。

建议内部模型：

```text
AdminCapabilityProjection
  contractVersion
  principalSummary
  testIdentityUsed
  productionIdentityReady
  capabilitySetRevision
  capabilities[]
```

Capability item：

```text
key
state = ready | unavailable | gated | partial
safeLabel
safeSummary?
source = test-only | production
```

规则：

- `source=test-only` 时 envelope 必须 `testIdentityUsed=true`、`productionIdentityReady=false`；
- `source=production` 不得在 AAPI-0.2 输出；
- capability state 只表达测试投影或后端可用性，不代表业务 CRUD 已完成；
- denied 不返回 role graph、policy expression、entitlement object 或内部审计数据；
- `capabilitySetRevision` 是 capability 集合事实版本，不是资源 revision 或 cursor revision。

## 7. Provisional Capability Key

本批能力名仍为 provisional，不进入正式 RBAC Contract：

| 模块 | Read alias | Write / action alias |
| --- | --- | --- |
| 模型管理 | `admin.model.read` | `admin.model.write` |
| 机器人管理 | `admin.robot.read` | `admin.robot.write` |
| 技能管理 | `admin.skill.read` | `admin.skill.write` |
| 工具管理 | `admin.tool.read` | `admin.tool.write` |
| 知识管理 | `admin.knowledge.read` | `admin.knowledge.write` |
| 用户与权限 | `admin.system.users.read` | `admin.system.users.write` |
| 审计日志 | `admin.system.audit.read` | `admin.system.audit.export` |
| 反馈管理 | `admin.system.feedback.read` | `admin.system.feedback.write` |

边界：

- capability key 不等于 Vue route name，不等于菜单 visible alias，不等于页面 operation guard；
- 前端隐藏菜单不是授权；
- AAPI-0.2 可以为 test-only Principal 返回固定 capability 集合，但不得宣称这些 key 已是正式企业 RBAC 权限；
- 若后续 Contract/RBAC 冻结前 key 有变化，必须通过 projection revision 和迁移说明处理。

## 8. Production Graph Exclusion

后续实现必须用自动测试证明：

| 场景 | 预期 |
| --- | --- |
| production profile | `DevelopmentAdminPrincipalProvider` bean 数为 0 |
| production graph | `fake/fixed/inmemory/deterministic/development/test` 命名或等价 test provider 不存在 |
| provider missing | 不创建 fallback fake；返回 unavailable 或启动失败关闭 |
| development/test profile | provider 明确存在，且 projection 标记 test-only |
| capability source drift | 任何 productionReady=true + testIdentityUsed=true 组合直接 schema/validator 失败 |

生产默认不因 AAPI-0.2 变为可登录、可访问或可操作。

## 9. Adapter / Fixture / Mock 边界

| 类型 | AAPI-0.2 规则 |
| --- | --- |
| Contract | AAPI-0.1 是 shape 来源；AAPI-0.2 不随意扩 schema |
| Projection | 由 Central-side service 生成；不由前端或 Fixture 推断 |
| Fixture | 只可用于 tests / harness / 明确 prototype evidence |
| Mock | 不进入 production bundle 或默认运行路径 |
| AdminAdapter | 本批不修改、不接入 |
| HTTP | 本批不开放；若要开放需进入 AAPI-0.3/0.4 |

未接真实后端时，Admin 页面仍保持 unavailable/gated，不展示创建成功、保存成功、发布成功、安装成功、同步成功、
测试连接成功或真实检索成功。

## 10. 敏感信息边界

Projection、Fixture、日志、错误和测试快照禁止包含：

- API Key、Token、Secret、Bearer、Cookie 值；
- Credential Reference 字符串或 mask；
- Provider Endpoint、内部路径、stack trace；
- role graph、entitlement object、policy expression；
- 原始审计 payload、任务正文、模型私有思考、Prompt、Tool 参数；
- Browser 自报身份或未经验证的 user/tenant/device claim。

允许：

- 固定 fake/sentinel id；
- `configured | missing | unavailable` 等非敏感枚举；
- 面向用户的安全摘要；
- correlation id，但不得编码敏感材料。

## 11. 页面状态映射

AAPI-0.2 只提供 capability projection 的状态事实，未来前端可映射到 AFE-1.1 已有八态：

| Projection state | 页面状态建议 | 说明 |
| --- | --- | --- |
| `ready` | ready | 仅表示该测试能力可见或可进入，只在 test-only 场景允许 |
| `unavailable` | unavailable | 后端能力未接入、production dependency 缺失或服务不可用 |
| `gated` | disabled / permissionDenied | 缺少 test capability 或后续真实权限拒绝 |
| `partial` | partial | 部分 read model 可用、部分能力仍 gated/unavailable |

Production 未接真实身份时不得返回整体 ready。

## 12. 测试与 QA 门禁

后续编码若获授权，至少要求：

| 门禁 | 要求 |
| --- | --- |
| Central unit / harness | development/test provider 存在，production provider 为 0 |
| Capability tests | capability key 精确、唯一、排序稳定；state 不混淆 |
| Envelope tests | `testIdentityUsed=true` 必须 `productionIdentityReady=false` |
| Production graph scan | 禁 fake/fixed/inmemory/deterministic/development/test provider 进入 production graph |
| Negative tests | browser supplied identity、productionReady + testIdentity、fallback fake 均失败 |
| Sensitive scan | 正反向注入，证明真实/疑似 secret 检出且 fake allowlist 不误报 |
| Contract focused | 若补 subpath export 自动断言，需覆盖 `@robothree/contracts/admin-control/v1alpha1` |
| Workspace | `pnpm run check` PASS |
| Central online/offline | 若触碰 Central Java，`pnpm run check:central` 与 `pnpm run check:central:offline` 必须 PASS |
| Boundary | Admin/Desktop/Core/Main/Preload/IPC/migration/root deps/lockfile 零越界 |

如果执行环境缺少 JDK 21，不能把 Central online/offline 记为 PASS；必须如实记录 NOT RUN 并交独立 QA 环境补跑。

## 13. 分批建议与工期

建议 AAPI-0.2 拆为一个小编码批：

| 子项 | 内容 | 估算 |
| --- | --- | --- |
| AAPI-0.2.1 | Test-only Principal domain/provider 与 envelope flag validator | 0.5～1 天 |
| AAPI-0.2.2 | Capability Projection service、provisional capability set 与 focused tests | 1～1.5 天 |
| AAPI-0.2.3 | Production graph exclusion、sensitive scan、workspace/Central 门禁与报告 | 1～1.5 天 |

总估算：2.5～4 个集中工程日。若评审要求同时引入 HTTP endpoint、AdminAdapter 或真实 RBAC，应拆到
AAPI-0.3/AAPI-0.4 或新的方案，不能扩大本批。

## 14. 未解决问题 / 阻断项

| 编号 | 问题 | 当前建议 |
| --- | --- | --- |
| O-01 | AAPI-0.2 编码是否允许触碰 `services/central-service/**` | 建议允许 Central-private domain/application/config/test；否则 AAPI-0.2 无法验证服务端权限事实 |
| O-02 | 是否同批开放 Admin HTTP endpoint | 否；延后到 AAPI-0.3/0.4 |
| O-03 | provisional capability key 是否接受当前列表 | 需技术负责人评审确认，后续可通过 revision 调整 |
| O-04 | AAPI-0.1 P3 subpath export 自动断言是否纳入 AAPI-0.2 | 建议纳入，范围仅限 contracts test |
| O-05 | 独立 QA 是否具备 JDK 21 | 若 Central Java 被授权，必须具备或由另一环境补跑 |

这些问题未关闭前，本文不能转为编码授权。

## 15. P0～P3 自检

| 等级 | 自检 |
| --- | --- |
| P0 | 未宣称 production identity ready；未规划 fake provider 进入 production |
| P1 | 未修改前端或业务 CRUD；未把菜单隐藏等同授权 |
| P2 | 明确 Central/file scope、production graph exclusion、identity flag 组合、sensitive scan |
| P3 | AAPI-0.1 subpath export 自动测试覆盖作为后续提醒，不阻断方案评审 |

当前结论：

```text
AAPI-0.2 DOCUMENT PLAN ONLY / CODING GATED
```
