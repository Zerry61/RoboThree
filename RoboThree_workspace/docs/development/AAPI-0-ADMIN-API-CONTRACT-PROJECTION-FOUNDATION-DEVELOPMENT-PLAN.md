# AAPI-0 Admin API Contract / Projection Foundation 详细实施方案

> 状态：**REVISION 1 / PLAN REVIEW PASS/CLOSED；AAPI-0.1～AAPI-0.4 CODING GATED**  
> 日期：2026-08-24  
> 负责人：Codex 5.6  
> 对应前端：AFE-0/AFE-1；不自动授权 AFE 编码  
> 身份策略：当前版本使用明确 test-only 模拟管理员；真实 SSO/RBAC 延期

## Revision 1 评审修订

- 新增并依赖 [Robot / Tool Catalog 跨消费面对齐基线 v1](./CATALOG-PROJECTION-CROSS-CONSUMER-ALIGNMENT-v1.md)；
- 明确 Admin 与 Desktop 不共用 DTO，只共享稳定身份、exact revision 映射、限制三态和风险语义；
- AAPI-0.4 的 conditional registration 复用 EIPC-1.1.3.3 已验证的三态启动模式与 production dependency
  exclusion 规则，不复制 Enterprise Session 的 feature-specific Gate；
- 修正 Admin Console 工作区事实：`apps/admin-console/**` 已存在且 AFE-1.1 已正式 `PASS/CLOSED`，
  AAPI 编码只保证不修改、不依赖该目录，不再把它描述为尚未创建。

## 0. 目标

AAPI-0 为 Admin Console 六个一级模块冻结统一、语言无关、浏览器安全的 Admin API 基础，但不在一个批次内
实现全部业务。首要目标是消除“每个页面自行定义 Adapter/Mock/错误/分页/权限”的风险，为后续模型、机器人、
技能、工具、知识和系统管理接口提供同一 Contract 与 Projection 规范。

本批不提供真实企业 SSO，不把 test account 冒充生产账号，也不把空数据或 Fixture 写成业务成功。

## 1. 当前事实

- Central 已有 Configuration、Model Gateway、Tool Gateway 与 Audit 基础包，但没有面向 Admin Console 的完整
  Model/Robot/Skill/Tool/Knowledge CRUD Controller；
- Admin Console AFE-1.1 Scaffold / Route Shell 已存在并经独立 QA 与用户接受正式 `PASS/CLOSED`；
  真实 Adapter 仍被 B-03 阻断，现有工程不构成 Admin API 已就绪的证据；
- PRD 已冻结六个一级模块和系统管理三个二级页面；
- Tool 写链路受 TGM 阻断；Knowledge Provider 仍是 P0 Conditional；
- EIPC-1.1 是默认关闭的 dormant foundation，真实 SSO、Credential bootstrap 与 production identity
  composition 不属于当前版本。

## 2. API family 与 HTTP 边界

规划独立语言中立 family：

```text
admin-control.v1alpha1
HTTP base: /admin/v1alpha1
```

不得复用 Desktop Local Contract、Core private HTTP 或 Enterprise Session Wire family。

统一冻结：

- strict request/response envelope；
- typed safe error；
- opaque cursor、queryRevision 与 stale cursor；
- `commandId` 幂等、expectedRevision/CAS 与 durable Receipt；
- `ETag`/revision 只作为并发控制，不作为权限事实；
- list/detail Projection 与 mutation command 分离；
- page/field/JSON byte 上限；
- no-store、CSRF、Origin、CSP 与点击劫持策略的服务端接缝；
- 401（未建立管理会话）与 403（已识别但无权）严格分离。

## 3. test-only 模拟管理员

当前版本允许为联调和验收提供一个明确模拟账号，但必须单独命名为开发能力：

```text
DevelopmentAdminPrincipalProvider
profile = development | test
testIdentityUsed = true
productionIdentityReady = false
```

约束：

1. production profile 中该 Provider bean 数必须为 0；
2. 不使用 fixed activeUserId、OS user、Browser 自报 userId 或数据库单行推断 owner；
3. 模拟账号只能使用固定的非生产 id、显示名和 provisional capability set；
4. 浏览器不持久化 bearer；开发会话优先使用 HttpOnly/SameSite cookie 或同等 test harness；
5. 页面和 Evidence 持续标识“测试账号/非生产身份”；
6. production identity blocker 继续打开；
7. 模拟账号不得用于关闭 EIPC、STRM、DFI-4A.4 或 production readiness。

## 4. 权限模型边界

AAPI-0 只冻结 Admin capability projection，不建设完整 RBAC：

- route meta 使用 provisional capability key；
- Server 是最终授权者，前端隐藏入口仅用于体验；
- 通用权限与资源使用范围分离；
- denied 不返回内部 policy、role graph 或 entitlement object；
- 当前测试 capability set 可覆盖 model/tool/robot/skill/knowledge/audit 的 read/write/review 基础动作；
- 正式组织、角色继承、SSO group mapping、动态 Policy Engine 延期。

## 5. 模块 Projection 顺序

Robot/Tool list/detail 必须遵循跨消费面对齐基线。Admin Projection 表达治理、发布、配置和验证事实；
不得复制 Desktop `runnable/availability` 作为 Admin lifecycle，也不得让 Fixture 补造 Central published fact。

| 顺序 | 模块 | AAPI-0 处理 | 后续写链路 |
| --- | --- | --- | --- |
| 1 | 模型管理 | 冻结 list/detail 与安全 Credential 状态枚举 | AAPI-1 |
| 2 | 机器人管理 | 冻结 list/detail/draft summary/restriction summary | AAPI-1 |
| 3 | 技能管理 | 冻结 list/detail/package validation summary | AAPI-2 |
| 4 | 工具管理 | 冻结统一 list/detail/source/policy/health 分层 | TGM + AAPI-2 |
| 5 | 知识管理 | 冻结 Unconfigured/Unavailable Projection | Knowledge Provider 后 |
| 6 | 系统管理 | 冻结 test users、audit query、feedback gated summary | AAPI-3 |

生产事实不存在的字段必须省略或投影为明确 `unavailable/gated`，不得由 Fixture 补齐。

## 6. 敏感信息边界

Admin API 永不返回：

- API Key、Token、Secret、Credential Reference 明文；
- Provider 原始响应、内部 stack；
- Desktop workspace path、Core private handle；
- Agent 完整 system prompt；
- Skill 包内脚本正文或任意可执行内容；
- Tool Binding/Adapter Descriptor/环境变量；
- 审计中的完整任务正文、模型私有思考或文件内容。

Credential 只投影 `configured | missing | unavailable`。涉及新 Secret 的 mutation 必须等待独立 Credential
Threat Model 和安全输入通道，不属于 AAPI-0。

## 7. 分批计划

| 子批 | 目标 | 当前状态 |
| --- | --- | --- |
| AAPI-0.1 | Canonical Contract、safe errors、cursor/CAS/Receipt、cross-language conformance | GATED |
| AAPI-0.2 | test-only admin principal、capability projection、production graph exclusion | GATED |
| AAPI-0.3 | read-only Model/Robot/Skill/Tool/Knowledge/Audit Projection inventory 与 HTTP shell | GATED |
| AAPI-0.4 | Browser security headers、conditional registration、Admin Adapter E2E | GATED |

AAPI-0 预计 12～20 个集中工程日；业务 CRUD、技能包解析、Tool 连接、Credential、Knowledge Provider 不计入。

### 7.1 Conditional registration 复用规则

AAPI-0.4 复用 EIPC-1.1.3.3 已验证的 activation gate 模式和通用 production bootstrap primitives，
但不得直接把 Enterprise Session 的 feature-specific Gate 当作 Admin Gate：

1. `property=false` 时 Admin Controller、Filter、mapping bean 数必须为 0，请求表现为 404；
2. `property=true` 且任一 production 依赖缺失、重复或来自非生产 source set 时，必须在 HTTP ready 前失败关闭；
3. production dependency 必须恰好一个，拒绝 `.support.`、`.test.`、`.persistence.memory.`，以及
   `fake/fixed/inmemory/deterministic/development` 命名或等价测试实现；
4. 禁止 `@ConditionalOnMissingBean` 生成 Fake，也禁止 `ObjectProvider.getIfAvailable(Fake::new)` 兜底；
5. development/test profile 可以显式安装 `DevelopmentAdminPrincipalProvider`，但必须投影
   `testIdentityUsed=true` 与 `productionIdentityReady=false`；
6. 若需要抽取新的通用 Gate helper，必须保持 EIPC 行为零漂移并单独通过 architecture/conformance 测试。

## 8. 文件边界

编码获授权后允许：

- 新增独立 Admin Contract package/family；
- `services/central-service/**` 内 admin API 专属 domain/application/port/http/configuration；
- tests、Harness、Evidence。

禁止：

- Desktop Main/Preload/Renderer、Local Core private API；
- 已存在的 `apps/admin-console/**`；AAPI 后端批次不得修改、导入或依赖该目录，Admin Adapter 与页面消费
  必须由 AFE 独立窗口评审、QA 和授权；
- EIPC production adapter、真实 SSO/OA/MDM；
- Personal Credential/Keychain；
- TGM Tool mutation、Knowledge Provider；
- root package/lockfile，除非共享窗口单独授权。

## 9. QA 门禁

至少验证：

- TS/Java cross-language canonical fixture；
- strict unknown-field rejection；
- cursor/query revision/CAS/idempotent Receipt；
- production graph 中 test principal 数为 0；
- development profile 明确 `testIdentityUsed=true`；
- 401/403/404/409/410/422/503 typed mapping；
- property=false endpoint bean/mapping 为 0；
- property=true 依赖不完整时 HTTP ready 前失败关闭；
- CSRF/Origin/CSP/frame-ancestors/no-store；
- 四通道敏感扫描与正反向注入；
- Java/TS canonical fixture 与未来 Admin Adapter consumer fixture；本批不修改 Admin Vue 2 工程；
- cross-consumer canonical fixture 校验 Robot/Tool 共同语义，不要求 Admin/Desktop JSON 相同；
- AFE-1.1 当前代码以外部前端窗口产物纳入 workspace baseline；AAPI 门禁不得把其未完成 QA 冒充后端成功，
  也不得通过修改或清理 Admin 工程来修复后端门禁；
- Central online/offline 与完整 Workspace 回归。

## 10. 当前门禁

```text
AAPI-0 Plan                  REVISION 1 / PLAN REVIEW PASS/CLOSED
AAPI-0.1～AAPI-0.4           GATED
Cross-consumer alignment    PASS/CLOSED
AFE-1.1                     PASS/CLOSED；独立前端门禁
EIPC-1.2～EIPC-3             DEFERRED / OUT OF CURRENT RELEASE
TGM                          GATED
Knowledge Provider           GATED
```
