# AAPI-0.3 Read-only Projection Inventory / HTTP Shell 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-27  
> 开发版本：Root `0.0.0-aapi.0.3`  
> 最高结论：`AAPI03_TEST_ONLY_READ_HTTP_SHELL_CONFORMANT`

> 用户接受：2026-08-27；production identity/Admin HTTP/Browser security 继续 false，Browser 联调进入
> AAPI-0.4 独立方案，不改变本报告的 test-only 结论。

## 1. 实施结论

AAPI-0.3 已完成 Central 侧六模块 read-only Projection inventory、服务端授权、query revision、稳定分页、
per-runtime HMAC cursor、ETag/304、typed safe error 与 `/admin/v1alpha1` test-only HTTP shell。

本批精确注册 12 条 GET route，mutation route 为 0。HTTP shell 仅在 `development|test` profile 且
`robothree.admin-api.test-read-shell-enabled=true` 时注册；property 为 false 时 Controller/mapping 为 0，
property 为 true 但显式 inventory composition 缺失时在 HTTP ready 前启动失败。production graph 中
Principal、Controller、mapping 与 test inventory source 均保持 0。

本批没有把缺失事实补成成功：Model、Robot、Skill、Tool、Knowledge 与 Audit 均按现有可信 authority
投影为 `partial | unavailable | gated`；未实现 production identity、production Admin HTTP、Browser security、
Admin Adapter、mutation、TGM、Knowledge Provider 或 Agent Lifecycle。

## 2. §3.2 Authority → Central Java Service / Port 精确映射

| 模块 | 方案 authority | 实际 Java Service / Port | 本批调用与投影 | 缺失事实处理 |
| --- | --- | --- | --- | --- |
| Model | active immutable configuration snapshot | `ConfigurationSnapshotRepository.findActive()`；随后 `ConfigurationIntegrityVerifier.verifySnapshot()` | 只读取通过完整 integrity verification 的 active snapshot 中可证明的 Model identity/revision/enabled/credential availability | snapshot 不存在或损坏即 unavailable/fail-closed；provider/default 等字段无 authority，known Model detail 返回 typed unavailable，不补默认值 |
| Robot | active immutable configuration snapshot | `ConfigurationSnapshotRepository.findActive()`；`ConfigurationIntegrityVerifier.verifySnapshot()` | 只读取 snapshot 中可证明的 Agent/Robot identity 与 exact revision reference | publish/review lifecycle 与完整 restriction 无 authority，模块保持 partial/known item unavailable，不冒充 ready |
| Skill | verified exact package referenced by active snapshot | `ConfigurationSnapshotRepository.findActive()`；`ConfigurationIntegrityVerifier.verifySnapshot()`；`ConfigurationIntegrityVerifier.findExactReferencedPackage()`，其内部复用既有 `PackageDocumentRepository.findPackage()` | 仅对 active snapshot exact reference 对应、通过 package integrity 校验的 manifest 投影 content-free summary | 不返回 Skill 正文或 `materializedRef`；lifecycle/runtime 无 authority，保持 partial/unavailable |
| Tool | TGM / trusted risk and read-only source | 当前没有可用 Central production Service/Port | 不创建 Tool success item | `readOnly`、`riskSummary` 与 TGM authority 缺失，整体 gated/unavailable；不填 false/unknown healthy |
| Knowledge | active immutable configuration snapshot 的 descriptor 事实 | `ConfigurationSnapshotRepository.findActive()`；`ConfigurationIntegrityVerifier.verifySnapshot()` | 仅投影 snapshot 能证明的 content-free identity/revision descriptor | Knowledge Provider / retrieval readiness 不存在，状态不得为 ready，明确 gated/partial |
| Audit | existing model invocation audit outbox | `ModelInvocationAuditOutboxRepository.findPending(100)` | 只读既有 pending content-free system event，投影 system actor 与有限结果状态 | 不冒充完整企业审计；无 actor/tenant/detail authority 的字段保持 unavailable/省略 |

以上映射只调用既有 read Port 和 application integrity verifier。没有新增 Repository 方法、查询、表、索引、
持久 cursor 或读取语义；没有修改 `Configuration`、Model Gateway、Audit 的既有写路径。

## 3. 主要实现

### 3.1 Projection domain 与 read service

- 新增 `AdminModule`、`AdminModuleAvailability`、`AdminInventoryItem`、`AdminModuleInventoryLease`；
- 新增 `AdminModuleInventorySource` 与 `AdminInventoryCatalog`，每次请求只捕获一次模块 lease；
- 新增 `AdminReadRequestAuthorizer`，先建立 AAPI-0.2 test-only Principal，再计算 capability 与模块 availability
  的最小权限；401/403/422/503 不混淆；
- 新增 `AdminReadProjectionService`，负责 strict list/detail Projection、稳定排序、分页、query revision、ETag 与 304；
- 新增 `AdminProjectionContractValidator`，在 Java 出口按 `admin-control.v1alpha1` 的字段集合逐层 fail-closed，
  并拒绝 Secret、Token、Credential、Endpoint、Prompt、Binding 与本机路径等敏感 material；
- detail 精确区分“不存在”与“已知但当前 authority 不足”：前者 404，后者 503。

### 3.2 Cursor / HTTP / activation

- `HmacAdminCursorCodec` 使用 per-runtime 随机 key，opaque cursor 绑定 module、query revision 与最后排序键；
  restart 后旧 cursor 返回 typed stale，不持久化、不由浏览器解析；
- `AdminReadHttpController` 精确提供 12 条 GET route，不提供 generic dispatcher 与 mutation；
- strict mapper 拒绝缺 Contract header、未知 query、GET body、非法 limit/cursor/path；
- `AdminReadHttpExceptionHandler` 只返回固定 safe error envelope，不暴露 stack、内部 exception 或 digest；
- `AdminReadHttpConfiguration` 与 Controller/handler 均受 development/test profile 和显式 property 约束；
- `AdminReadInventoryConfiguration` 在同一显式 gate 下把现有 snapshot/integrity/audit read authorities 组装为
  唯一 `AdminInventoryCatalog`；不使用 Fixture、`@ConditionalOnMissingBean` 或隐式 fallback；
- `AdminControlProductionGraphGuard` 扩展为同时拒绝 production Principal、test inventory source 与 Controller，
  即使其中某一类为空也继续检查其余类型，防止 early-return 漏检。

### 3.3 Cross-language conformance 与 evidence

- 新增 `aapi03-read-projections.json`，由 TS Contract 与 Java validator 双向读取；
- Contract focused tests 逐 schema 解析 Model/Robot/Skill/Tool/Knowledge/Audit fixture；
- Java focused tests 覆盖 authority honesty、projection、cursor/ETag、HTTP route、三态启动与 production exclusion；
- Harness 输出 12 GET / 0 mutation、production 三零、80 次负向泄漏注入与全部 readiness false，
  且 evidence digest 为 `sha256:ea6548a9aa00a23fc6aee9d1985c4e69cd29b4f18ec82f2979b05713ec2c36ec`。

## 4. 文件边界

本批修改范围：

- `services/central-service/src/main/java/com/robothree/central/admincontrol/**`；
- `services/central-service/src/test/java/com/robothree/central/admincontrol/**`；
- `packages/contracts/fixtures/admin-control/v1alpha1/**` 与既有 Contract conformance test；
- AAPI-0.3 harness/evidence、Root 版本与 packaging audit 基线；
- 本实施报告、计划状态、Development Log、README 与 CHANGELOG。

本批未修改：

- `apps/admin-console/**`、Desktop Renderer/Main/Preload/IPC；
- Core 业务代码、Document Worker、Central 既有 Configuration/Model Gateway/Audit 写路径；
- `admin-control.v1alpha1` schema/version；
- migration（仍止 26）、依赖或 `pnpm-lock.yaml`；
- AAPI-0.4、DFI-5.3、TGM、Knowledge Provider、Agent Lifecycle 或 Desktop/Admin v2 consumption。

共享工作区中已存在的 R2D 生产改动属于此前已关闭批次，不归入 AAPI-0.3。

## 5. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `harness:aapi0.3` | PASS：8 Java classes / 33 tests + 2 TS files / 10 tests；12 GET / 0 mutation；production Controller/mapping/source 0；80 次负向注入全部检出，四通道正常命中 0 |
| `pnpm run check` | PASS：284 files / 1961 tests + 3 smoke + Architecture boundary |
| `pnpm run check:central` | PASS：424/0/0/0 / BUILD SUCCESS |
| `pnpm run check:central:offline` | PASS：424/0/0/0 / BUILD SUCCESS |
| `pnpm run lint` / `pnpm run audit:dtp4` | PASS |
| frozen offline install | PASS |
| migration / lockfile | migration 止 26；lockfile digest `sha256:c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07` 未变 |

## 6. Readiness 与下一步

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

AAPI-0.3 独立 QA 已由用户接受并正式 `PASS/CLOSED`。AAPI-0.4 与 Admin Adapter 当前只进入详细方案评审，
仍 `CODING GATED`；production identity、production Admin Read HTTP 与 Browser security 继续 false。
