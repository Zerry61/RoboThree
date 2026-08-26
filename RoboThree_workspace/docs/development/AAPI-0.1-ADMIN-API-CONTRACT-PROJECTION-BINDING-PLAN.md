# AAPI-0.1 Admin API Contract / Projection Binding 详细方案

> 状态：**DOCUMENT REVIEW PENDING / CODING GATED**  
> 日期：2026-08-24  
> 负责人：Codex 5.6  
> 上游：AFE-1.1 `PASS/CLOSED`；AAPI-0 Revision 1；DFI-3A.1 代码事实已出现但正式关闭状态需独立确认  
> 本批性质：方案评审，不自动编码，不输出 `CODING READY`

## 0. 当前事实核查

| 事实 | 当前核查 |
| --- | --- |
| Admin Console 前端 | `apps/admin-console/**` 已存在，AFE-1.1 已经用户接受并清理 `apps/admin-console-preflight/**` |
| Admin 前端默认数据入口 | `AdminAdapter` 当前只有 `getCapability()`；production 默认仍为 `UnavailableAdminAdapter` |
| Admin API code | `packages/**`、`services/**`、`apps/admin-console/src/**` 中未发现 `admin-control` 或正式 Admin API Contract |
| DFI-3A.1 代码事实 | root version 为 `0.0.0-dfi.3a.1`；`desktop-local/v1alpha2/catalog.ts`、Core catalog query port、cross-consumer fixture 已存在 |
| DFI-3A.1 focused 验证 | `pnpm exec vitest run packages/contracts/tests/desktop-local-v1alpha2-catalog-contracts.test.ts services/core/tests/catalog-query-service.test.ts`：2 files / 10 tests PASS |
| 文档状态差异 | README/CHANGELOG/DEV LOG 仍保留 DFI-3A/AAPI-0 文档评审态描述；DFI-3A.1 是否正式 `PASS/CLOSED` 需用户/独立 QA 单独确认 |

结论：AAPI-0.1 可以开始做详细方案评审，但在 DFI-3A.1 正式关闭状态和 cross-consumer alignment 评审状态确认前，
不得进入编码授权。

## 1. 目标

AAPI-0.1 只冻结 Admin API 的第一层 Contract 与 Projection binding 基线：

1. 独立 `admin-control.v1alpha1` family；
2. strict envelope、typed safe error、cursor、revision、CAS、idempotency 和 Receipt 语义；
3. Admin list/detail Projection 的字段层级、敏感字段禁入和 unavailable/gated 表达；
4. 与 Desktop Robot/Tool Catalog 的共同语义 fixture 对齐，但不复用 Desktop DTO；
5. 为未来 Admin Vue Adapter 提供稳定消费边界，但本批不修改 `apps/admin-console/**`。

本批最高只能输出：

```text
AAPI01_CONTRACT_PROJECTION_PLAN_REVIEWED
```

不得输出：

```text
ADMIN_API_READY
ADMIN_ADAPTER_READY
ADMIN_GOVERNANCE_READY
PRODUCTION_IDENTITY_READY
TOOL_MANAGEMENT_READY
KNOWLEDGE_PROVIDER_READY
```

## 2. 非目标

- 不实现 HTTP Controller、Filter、Central service wiring 或 database migration；
- 不实现真实登录、SSO、RBAC、企业身份、Credential bootstrap；
- 不修改 Desktop、Core、Central、Contracts、Admin 前端、Main、Preload、IPC 或 Renderer；
- 不创建 Admin CRUD、保存、发布、安装、同步、测试连接等业务成功路径；
- 不使用 Fixture、Mock、LocalStorage、SessionStorage、IndexedDB 或前端数组伪装业务持久化；
- 不把 DFI-3A Desktop Catalog DTO 当成 Admin DTO。

## 3. 编码前置条件

| 条件 | 冻结口径 |
| --- | --- |
| DFI-3A.1 | 需要独立 QA 和用户接受，或技术负责人明确允许 AAPI-0.1 只消费其 canonical fixture 草案 |
| Cross-consumer alignment | `CATALOG-PROJECTION-CROSS-CONSUMER-ALIGNMENT-v1.md` 需确认评审口径，至少稳定身份、revision 映射、限制三态、Tool 风险语义不能再漂移 |
| AAPI-0 | Revision 1 中 AFE-1.1 状态需按当前事实修正为 `PASS/CLOSED`；AAPI-0.1 不自动解锁 0.2～0.4 |
| Admin 前端 | AAPI 后端批不得修改 `apps/admin-console/**`；Adapter 消费另走 AFE 独立窗口 |
| 身份线 | EIPC production identity blocker 继续打开；只能规划 test-only principal，不得宣称 production identity |

如以上条件未满足，AAPI-0.1 只能停留在文档评审态。

## 4. Contract family

规划独立 family：

```text
family: admin-control.v1alpha1
transport: HTTP JSON over /admin/v1alpha1, but HTTP wiring is AAPI-0.3/0.4
source of truth: future Central Admin read model / Projection
consumer: future AdminAdapter, not Desktop Local API
```

AAPI-0.1 后续若获编码授权，建议新增独立 Contract package/folder，避免污染 Desktop Contract：

```text
packages/contracts/src/admin-control/v1alpha1/
  common.ts
  error.ts
  revision.ts
  pagination.ts
  receipt.ts
  capability.ts
  model.ts
  robot.ts
  skill.ts
  tool.ts
  knowledge.ts
  system.ts
  index.ts
```

该结构是后续编码建议，不属于本方案阶段的实现授权。

## 5. 基础类型语义

### 5.1 Envelope

统一 envelope 只承载安全元数据：

```text
contractVersion = v1alpha1
requestId
serverTime
testIdentityUsed
productionIdentityReady
data | error
```

规则：

- `testIdentityUsed=true` 时必须同时 `productionIdentityReady=false`；
- production 环境不得由浏览器自报 userId、role、tenant 或 permission；
- envelope 不返回 bearer、session token、credential reference、internal path、stack。

### 5.2 Revision / Cursor

统一概念：

```text
queryRevision
resourceRevision
policyRevision?
connectionRevision?
nextCursor?
```

规则：

- cursor opaque，带 query identity、sort key 和 revision proof；
- stale cursor 返回 typed `stale_cursor`，不静默重放第一页；
- `registryRevision`、`publishedRobotRevision`、`toolDefinitionRevision` 不能互相冒充；
- revision 是并发控制和事实版本，不是权限事实。

### 5.3 Command / Receipt

AAPI-0.1 只冻结形状，不开放 mutation：

```text
commandId
expectedRevision
receiptId
receiptState = accepted | rejected | unavailable | gated
safeSummary
```

真实 mutation 在 AAPI-1+ 或 TGM/Knowledge/Credential 独立批次；未接后端时页面不得展示“保存成功”“发布成功”
或“安装成功”。

## 6. Safe error 基线

| HTTP | code | 前端状态 | 规则 |
| --- | --- | --- | --- |
| 400 | `invalid_request` | error | strict schema 失败；不回显原始 body |
| 401 | `admin_session_required` | disabled/login shell | 未建立管理会话 |
| 403 | `permission_denied` | permissionDenied | 已识别但无权；不返回 role graph |
| 404 | `not_found` | empty/error | 资源不存在或 endpoint 未注册 |
| 409 | `revision_conflict` | partial/error | expectedRevision 不匹配 |
| 410 | `stale_cursor` | partial/error | cursor 对应 queryRevision 失效 |
| 422 | `business_rule_unavailable` | unavailable/gated | 后端能力未接入或规则不可执行 |
| 503 | `service_unavailable` | unavailable | dependency 缺失、生产未启用或 read model 不可用 |

未知错误只允许返回固定 `safeSummary` 和 correlation id，不得 `JSON.stringify(error)`，不得展示异常对象属性或 stack。

## 7. Projection 模块范围

| 模块 | AAPI-0.1 冻结 | 不冻结 |
| --- | --- | --- |
| 模型管理 | list/detail 只读字段层级；Credential 状态枚举 `configured/missing/unavailable` | Key 输入、测试连接、删除、设默认 |
| 机器人管理 | list/detail、draft/published lifecycle 字段形状、restriction summary | 创建、保存、发布、审核 |
| 技能管理 | list/detail、package validation summary 字段形状 | 上传解析、保存草稿、发布 |
| 工具管理 | source / policy / connection / credential / health 分层摘要 | HTTP/MCP 连接、启停、运行测试、安装 |
| 知识管理 | unconfigured/unavailable/gated projection | 上传、同步、索引、真实检索成功 |
| 系统管理 | users/audit/feedback read projection shape | 真实 RBAC、审计导出、反馈处理成功 |

所有模块必须支持：

```text
loading
empty
ready
unavailable
permissionDenied
error
disabled
partial
```

这些状态只表达展示和 API 可用性，不代表真实业务能力已经完成。

## 8. Robot / Tool cross-consumer binding

AAPI-0.1 必须消费同一组 cross-consumer canonical fixture，但 Admin 与 Desktop 输出不同 DTO。

已观察到的 fixture：

```text
packages/contracts/fixtures/cross-consumer/catalog-alignment-v1.json
```

AAPI-0.1 只校验共同语义：

- Robot/Tool stable identity；
- published revision 与 Desktop materialized revision 的 exact mapping；
- display name、description、source；
- `unrestricted / restricted_nonempty / restricted_empty`；
- Tool `readOnly` 和 `riskSummary`。

Admin-only 字段不得泄漏到 Desktop：

- lifecycle、review、publisher、policy、connection、credential、admin health；
- expectedRevision、commandId、Receipt。

Desktop-only 字段不得冒充 Admin 治理事实：

- runnable、availability、task selection facts、Local Core materialization status。

## 9. Future AdminAdapter binding

AFE-1.1 当前 `AdminAdapter` 只有：

```text
getCapability(capabilityKey): Promise<CapabilityProjection>
```

AAPI-0.1 只冻结未来扩展方向，不修改前端代码：

```text
getCapability()
listModels() / getModel()
listRobots() / getRobot()
listSkills() / getSkill()
listTools() / getTool()
listKnowledgeSources() / getKnowledgeSource()
listSystemUsers()
listAuditEvents()
listFeedbackItems()
```

规则：

- 页面只能通过 Adapter 获取业务数据；
- Adapter 只能消费 Admin API Projection，不直接消费 Desktop Local Contract；
- `FixtureAdminAdapter` 只能用于测试、视觉验收和显式 prototype/gated 场景；
- production 默认仍应失败关闭或 unavailable，直到 AAPI HTTP shell 和权限事实真实接入；
- 未接后端时操作必须禁用、隐藏或显示“待接入”。

## 10. 敏感信息边界

Admin API 和未来 Adapter 输出中禁止：

- API Key、Token、Secret、Credential Reference 字符串或 mask；
- bearer、cookie value、签名材料、private key handle；
- Endpoint、DNS pin、TLS 细节、internal path、workspace path；
- Tool Binding、Adapter Descriptor、environment variables；
- Skill 包脚本正文、可执行内容、完整文件树；
- Agent system prompt、完整 task transcript、模型私有思考；
- Provider 原始响应、stack trace、原始 exception object；
- audit 中的完整输入、文件内容、secret-like value。

Credential 只允许：

```text
configured | missing | unavailable
```

Fixture 只能使用固定 fake/sentinel 值，且 static scan 需要正反向注入证明不会漏检真实或疑似真实敏感值，也不会误伤产品文案和类型名称。

## 11. 后续编码文件范围

若 AAPI-0.1 获得单独编码授权，建议允许：

- `packages/contracts/src/admin-control/v1alpha1/**`；
- `packages/contracts/tests/admin-control-v1alpha1-*.test.ts`；
- `packages/contracts/fixtures/admin-control/**`；
- 必要 TS/Java conformance harness；
- docs evidence。

继续禁止：

- `apps/admin-console/**`；
- `apps/desktop/**`；
- `services/core/**`；
- `services/central-service/**`；
- Main、Preload、IPC、Renderer；
- database migration；
- root `package.json`、`pnpm-lock.yaml`、workspace config，除非共享窗口单独授权；
- 版本和工程日志，直至编码批次真实授权。

如果技术负责人决定 AAPI-0.1 直接落在 Central Java Contract/Controller，则必须先修订本文件，把文件边界从
Contract-only 改为 Central-specific，并单独评审。

## 12. 测试门禁

AAPI-0.1 编码授权后至少需要：

1. strict valid/invalid schema；
2. unknown field rejection；
3. envelope `testIdentityUsed/productionIdentityReady` 组合约束；
4. typed safe error mapping；
5. cursor shape、stale cursor、limit 边界；
6. expectedRevision/CAS/Receipt shape；
7. Robot/Tool cross-consumer fixture 共同语义；
8. Admin-only/Desktop-only 字段互不泄漏；
9. sensitive field 正向注入检出；
10. safe fixture / product terminology allowlist 反向不误报；
11. TS/Java canonical digest conformance；
12. root lint / architecture boundary；
13. workspace check；
14. Central online/offline 回归，如本批触碰 Central。

本方案阶段已完成的轻量核查：

```text
node -p "require('./package.json').version"
=> 0.0.0-dfi.3a.1

pnpm exec vitest run packages/contracts/tests/desktop-local-v1alpha2-catalog-contracts.test.ts services/core/tests/catalog-query-service.test.ts
=> 2 files / 10 tests PASS
```

## 13. 交付物

AAPI-0.1 评审通过后，后续编码批应交付：

- Admin Control v1alpha1 strict Contract；
- canonical fixture 与 digest evidence；
- safe error matrix；
- Robot/Tool alignment conformance；
- sensitive scan evidence；
- 文件边界零越界证明；
- 不关闭 AAPI-0.2～0.4、AFE Adapter、TGM、Knowledge Provider 或 production identity 的声明。

## 14. 工期估算

| 项目 | 估算 |
| --- | --- |
| Contract schema + fixtures | 1.0～1.5 日 |
| TS/Java conformance + digest | 1.0～1.5 日 |
| Robot/Tool alignment conformance | 0.5～1.0 日 |
| sensitive scan + architecture tests | 0.5～1.0 日 |
| evidence + QA 修订 | 0.5～1.0 日 |

总计：3.5～6 个集中工程日，不含独立 QA 与返工。

## 15. 未解决问题

1. DFI-3A.1 是否已完成独立 QA 并正式 `PASS/CLOSED`；
2. cross-consumer alignment v1 是否已由技术负责人接受；
3. AAPI-0 Revision 1 是否需要先修订 AFE-1.1 当前状态；
4. AAPI-0.1 首批编码是否只允许 Contract package，还是允许同时创建 Central Java mirror；
5. test-only admin principal 是 AAPI-0.1 只冻结字段，还是推迟到 AAPI-0.2 全部处理；
6. Admin API canonical digest 是否需要与 Central Java package 同批建立，还是先 TS-only freeze。

## 16. P0～P3 自检

| 等级 | 结论 |
| --- | --- |
| P0 | 0；未授权编码，未创建 Admin API production code |
| P1 | 0；未宣称 production identity、Admin API 或 Adapter ready |
| P2 | 0；已标出 DFI-3A.1 代码事实与文档状态差异 |
| P3 | 0；后续编码文件边界和未解决问题已显式列出 |

当前状态仍为：

```text
AAPI-0.1 DOCUMENT REVIEW PENDING / CODING GATED
```
