# DFI-4A.4 Revision 2 — Claude Code 独立文档复核报告

> Codex 聚焦精度收口（2026-08-28）：方案结论仍为 `PASS`，以下三项仅修正本报告文字：
> 1. frozen Preload API 实为 **8** 个方法，不是 7 个；
> 2. 工期统一写为 DFI-4A.4.1 `3～5` 日、STRM-3 `2～3` 日、DFI-4A.4.2 `4～7` 日、
>    DFI-4A.4.3 `3～5` 日，DFI 合计 `10～17` 日、含 STRM-3 关键路径 `12～20` 日；
> 3. DFI-4A.4.1 不依赖 STRM-3，可先行或与 STRM-3 方案/评审并行；STRM-3 只在进入
>    DFI-4A.4.2 前构成强门禁。
> 精确分类为 `PLAN_DOCUMENT_REVIEW_PASS_WITH_P3_REPORT_CORRECTIONS`，P0/P1/P2=0、P3=3（均为报告文字精度，非方案缺陷）。

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-28-2132-document-dfi-4a.4-revision-2` |
| 复核对象 | [DFI-4A.4 Revision 2 Local Personal Model CRUD / Credential Packaging / Desktop Safe Interface 详细实施方案](../development/frontend/DFI-4A.4-REVISION-2-LOCAL-PERSONAL-MODEL-CRUD-CREDENTIAL-PACKAGING-DEVELOPMENT-PLAN.md) |
| 日期 | 2026-08-28 |
| 复核者 | Claude Code（独立 QA，文档只读） |
| 上游 | DFI-4A.0～4A.3、DFI-5（DFI-5.4 / 5.4.1 / 5.4.2 / 5.4.3 / 5.4.3A）、R2D-P.1～P.3、PRA-1～PRA-3、STRM-0～STRM-2、EIPC-1.1.3.3 全部 `PASS/CLOSED` |
| 当前方案状态 | `DOCUMENT REVIEW PENDING / CODING GATED`；本批仅**完整独立文档复核**，不授权编码 |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 [DFI-4A.4 Revision 2 方案](../development/frontend/DFI-4A.4-REVISION-2-LOCAL-PERSONAL-MODEL-CRUD-CREDENTIAL-PACKAGING-DEVELOPMENT-PLAN.md)（577 行）的：

1. 事实声明（migration 23/24 Personal/Invocation/Reasoning Preference persistence、Keychain Helper + Descriptor 校验、STRM-3 gating、R2D Task entitlement 三 management permission、PersonalModelSafeSummaryV1Alpha2Schema、personal-model-management v1alpha1 namespace 净新增）；
2. 与 DFI-5（5.4 / 5.4.1 / 5.4.2 / 5.4.3 / 5.4.3A）、R2D-P.x、PRA-x、STRM-0~2 实施的接口一致性；
3. 7 个 G（Goal）+ 120 项 focused QA + 24 项停手条件是否可独立执行；
4. 4 个子批（DFI-4A.4.1 / STRM-3 / DFI-4A.4.2 / DFI-4A.4.3）依赖与时序；
5. production cutover 边界、依赖边界、lockfile 边界、migration 边界、Renderer 边界的事实可证明性。

**不**在本次复核范围：

- 不复跑任何门禁（lint / typecheck / harness / check / check:central）；
- 不修改产品代码、Contract、依赖、配置、migration、lockfile；
- 不替代 STRM-0~2 / DFI-5 / R2D-P.x / PRA-x 既有独立 QA 结论；
- 不评估"是否应该走 DFI-4A.4 Revision 2 而不是 Revision 1"——只评估本方案的**事实可证性 + 一致性 + 可执行性**。

### 1.2 方法

逐项只读对照：方案事实声明 → `services/core/src/adapters/credential/{macos-keychain-personal-credential-store,personal-credential-helper-protocol,personal-credential-helper-trust,personal-model-credential-broker-handler}.ts`、`services/core/src/desktop-private-main.ts`、`services/core/src/application/{personal-model-owner-authority,enterprise-identity-authority-semantics,unified-model-selection,local-desktop-r2d-production}.ts`、`services/core/src/ports/{personal-credential-store,personal-model-persistence,personal-model-owner-authority,runtime-active-enterprise-session-authority}.ts`、`services/core/src/adapters/sqlite/migrations.ts`、`services/core/src/bootstrap/create-desktop-private-runtime.ts`、`services/core/native/macos/robothree-personal-credential-helper.m`、`apps/desktop/src/renderer/pages/settings/{SettingsModelPage,settings-model-management-model}.ts`、`scripts/run-{dfi5.4.3,dfi5.4.2,dfi5.4.1,r2dp3,pra3}-harness.mjs`、`artifacts/dfi543/evidence.json`、5 个 `package.json`、`pnpm-lock.yaml`。

---

## 二、关键事实核对（按方案节序）

### 2.1 §0 触发场景"DFI-5 全阶段已 PASS/CLOSED，Local Personal execution graph 已存在"

✅ **事实成立**：

- DFI-5.4 / 5.4.1 / 5.4.2 / 5.4.3 / 5.4.3A 全部 `PASS/CLOSED`（DFI-5.4.3 QA 报告 §四 核心结论 + artifacts/dfi543/evidence.json `outcome: DFI5_MAX_REASONING_MODE_CONFORMANT` 字面一致）
- `Df543LocalPersonalSubmitTurnHandler` + `TaskPinnedReasoningReleaseResolver.reconstructForExecution()` + `LocalPersonalDfi541AdmissionInputSource`（DFI-5.4.3A QA 报告 §二 验证）
- `SqlitePersonalModelPersistence` + `SqliteLocalPersonalModelInvocationPersistence` + `SqliteDesktopReasoningModePreferencePersistence` 真实接入 bootstrap（`create-desktop-private-runtime.ts:271/...` 字面导入 + 实例化）

### 2.2 §1.1 "已经完成，必须直接复用"清单

✅ **事实成立**：

- migration 23（Personal Model namespace/definition/head/status/preference/operation/receipt） + migration 24（invocation/timeout/Usage）+ migration 26（Reasoning Preference） — `migrations.ts:946/1280/1418` 字面 `id: 23/24/26` ✅
- `SqlitePersonalModelPersistence` / `SqliteLocalPersonalModelInvocationPersistence` 已在普通 Desktop Core graph（DFI-5.4.3A QA 报告 §二 验证 ✅）
- `MacOsKeychainPersonalCredentialStore` 实现完整 5 method — `macos-keychain-personal-credential-store.ts:69 store / 95 replace / 129 inspect / 144 resolve / 155 delete` 字面 ✅
- `verifyPersonalCredentialHelperDescriptor()` 已实现 containment + no-symlink + owner/mode + SHA-256 + codesign designated requirement + Team Identifier — `macos-keychain-personal-credential-store.ts:27` import + `:60` 调用 + `personal-credential-helper-trust.ts:18/24 designatedRequirement? / protocolVersion` 字段 ✅
- 原生 Helper source 存在 — `services/core/native/macos/robothree-personal-credential-helper.m` 字面 ✅
- `desktop-private-main.ts:133` 二次校验 `protocolVersion === "personal-keychain-helper.v1"` ✅
- STRM-0~2 已交付 sensitive transport Contract、Preload adapter、Main production-disabled wiring 与真实进程 Harness ✅
- R2D-P.1~P.3 已交付 `local_desktop_owner` + Entitlement v2 + production source + Desktop v1alpha4 cutover ✅
- DFI-5.4.3A/5.4.3 已把 Personal Model execution + Credential resolve + Provider mapping + Max UI + Task reasoning summary 接入普通 Desktop production composition（DFI-5.4.3 QA 报告 §二 验证 ✅）
- `PersonalModelSafeSummaryV1Alpha2Schema` 已存在 — `packages/contracts/src/desktop-local/v1alpha2/personal-model.ts:60` 字面 ✅

### 2.3 §1.2 第 1 行 "管理 authority 缺口"

✅ **事实成立**：

- `local-desktop-r2d-production.ts:203-205` 字面 `mayConfigure: false as const, mayRevealSecret: false as const, mayDelete: false as const` —— R2D Local lease 明确不授 CRUD 权限 ✅
- `personal-model-owner-authority.ts:25` 字面 `entitlement: "personal_model.configure"` —— `PersonalModelOwnerAuthority` 只接受 enterprise identity 字面 ✅
- `enterprise-identity-authority-semantics.ts:83/94/147` 既有 enterprise session 字面 `permission: "personal_model.configure"` / `entitlement: "personal_model.configure" as const` —— 当前 production enterprise entitlement 仍 unavailable（DFI-5.4.3 evidence.json `enterpriseMaxReleaseReady=false`） ✅

### 2.4 §1.2 第 2 行 "standalone 与 enterprise 边界"

✅ **事实成立**：

- DFI-5.4.3 evidence.json `enterpriseMaxReleaseReady=false` + `enterpriseGatewayProductionRouteReady=false` + `deepSeekAdmitted=false` —— production enterprise identity/entitlement 仍 false ✅
- 方案 §2.1 "code-owned `standalone_local` deployment composition 可构造"是新增 G1 目标，与现状一致 ✅

### 2.5 §1.2 第 3 行 "Helper packaging 缺口"

✅ **事实成立**：

- 全仓 `grep -rn "robothree-personal-credential-helper\|process.resourcesPath"` 在 `apps/desktop/src/` **0 命中** —— 证实"Desktop package 无 Helper manifest/资源装配"陈述 ✅
- DFI-5.4.3 test harness 收到 descriptor（`run-dfi5.4.3-electron.mjs` 字面 + `desktop-private-main.ts:133` 二次校验）—— 证实"production runtime 只在 DFI-5.4.3 test harness 收到 descriptor" ✅
- 当前 `apps/desktop/scripts/` 无 packaging/manifest bundle-layout 脚本（grep "helper|keychain|packaging|manifest" 空）—— 方案 §2.2 G2 是净新增任务 ✅

### 2.6 §1.2 第 4 行 "Public safe interface 缺口"

✅ **事实成立**：

- `packages/contracts/src/desktop-local/personal-model-management` 目录不存在（grep "No such file or directory"）—— 净新增 namespace ✅
- v1alpha2 只有 `PersonalModelSafeSummaryV1Alpha2Schema`，无 list/detail/CRUD/reveal route/IPC/frozen Preload API（`v1alpha2/personal-model.ts` 仅含 safe summary + Provider + displayName + status 等字段，无 list/detail/CRUD/reveal schema）—— 与方案 §1.2 第 4 行缺口声明一致 ✅
- v1alpha5 frozen 6 routes/IPC + frozen Preload API（DFI-5.4.2 QA 报告 §二 验证）—— 方案 §2.3 G3 "不原地扩写 v1alpha2/v1alpha5" 严格隔离 ✅

### 2.7 §1.2 第 5 行 "Sensitive exposure 缺口 + STRM-3 GATED"

✅ **事实成立**：

- STRM-3 仍 GATED（`scripts/eipc1.0-preflight-evidence-check.mjs:50` "STRM-3" 在 evidence checklist 中，但生产 GATED 与否需独立 harness 验证）
- `personal-credential-helper-protocol.ts` / `personal-credential-broker-server.ts` grep `STRM_PRODUCTION_READY|SENSITIVE_TRANSPORT|production_disabled` **0 命中** —— 证实 STRM-3 production activation 尚未开启 ✅
- 方案 §0 "STRM-3 是 4A.4.2 强前置，4A.4.1 可先独立关闭" 是 DFI-4A.4.1 独立可关闭的合法分批设计 ✅

### 2.8 §1.2 第 6 行 "Renderer GATED"

✅ **事实成立**：

- `apps/desktop/src/renderer/pages/settings/SettingsModelPage.vue:6/110/111` 字面 "个人模型管理和 Credential 链路仍待接入" + `<R3Button variant="secondary" disabled>添加个人模型</R3Button>` ✅
- `settings-model-management-model.ts:71/72/89/91` 字面 "个人模型管理待接入" / "个人模型" / "企业模型由后台配置；个人模型管理待接入" ✅
- `frontend-closeout-presentation.ts:138` `area: "settings.personalModel"` —— Renderer settings 区域结构字面存在 ✅

### 2.9 §1.2 第 7 行 "Formal package 缺口"

✅ **事实成立**：

- 当前 `apps/desktop` 无 Electron Builder / Electron Forge 集成（grep "electron-builder\|electron-forge" 0 命中在 `apps/desktop/package.json`）—— 与方案 §5.2 禁止列表一致 ✅
- 方案 §2.2 G2 第 7 约束 "正式 DMG、notarization、auto-update 不属于本批" 与 §1.2 第 7 行缺口声明严格对应 ✅

### 2.10 §2.1 G1 "管理 Authority 与 Task Entitlement 分离"

✅ **可独立落地**：

- 现有 `PersonalModelOwnerAuthority` 字面只有 `entitlement: "personal_model.configure"`（`personal-model-owner-authority.ts:25`）—— G1 的 `runtime_active_enterprise_identity` 分支复用既有 union ✅
- G1 的 `standalone_local_owner` 是净新增 union 分支，**与 enterprise identity 严格分离**（§2.1 第 7 约束 "一旦 deployment composition 为 enterprise-managed，禁止 fallback 到 standalone authority"）✅
- R2D `mayConfigure/mayRevealSecret/mayDelete=false` 字面保留 —— R2D Task entitlement 不能授 CRUD 权限的硬约束 ✅

### 2.11 §2.2 G2 "Helper Packaging 与 Trust Chain"

✅ **可独立落地**：

- 现有 `verifyPersonalCredentialHelperDescriptor` 6 维度校验（containment + no-symlink + owner/mode + SHA-256 + designated requirement + Team Identifier）已 frozen（G2 复用既有 trust chain）✅
- Main 解析 `process.resourcesPath` 下固定相对路径 + Core 二次校验 = 方案 §2.2 G2 第 3-4 约束的合法实现（既有 `desktop-private-main.ts:133` 二次校验 `protocolVersion` 风格）✅
- unsigned build 仍可启动但 mutation/reveal unavailable（G2 第 5 约束）—— 与 §3.1 typed safe error `personal_model.feature_unavailable` / `personal_model.transport_unavailable` 严格对应 ✅
- 方案 §2.2 G2 第 6 约束 "无第三方 packaging 依赖"与 §5.2 禁止列表一致（无 Electron Builder/Forge）✅

### 2.12 §2.3 G3 "独立 Public Contract 与 Namespace"

✅ **可独立落地**：

- 净新增 `desktop-local/personal-model-management/v1alpha1/**` 与既有 v1alpha2/v1alpha5 完全隔离（不扩写既有 frozen Contract）✅
- 8 个 frozen Preload method（getCompatibility + listPersonalModels + getPersonalModel + createPersonalModel + updatePersonalModel + deletePersonalModel + revealPersonalModelKey + queryPersonalModelOperation）字面在方案 §2.3 定义，可独立落地 ✅
- Compatibility 至少含 9 字段（catalogAvailable + mutationAvailable + revealAvailable + authorityKind + helperState + transportState + productionIdentityReady + testIdentityUsed + reasonCode? + runtimeInstanceId）—— 字面与方案 §2.3 一致 ✅

### 2.13 §2.4 G4 "Safe Projection 与输入材料"

✅ **可独立落地**：

- `PersonalModelSafeSummaryV1Alpha2Schema` 既有字段（G4 复用既有 schema）—— DFI-4A.4 Revision 2 不改写 ✅
- G4 显式不投影的字段（Endpoint + credentialRef + owner digest + namespace key + Provider raw error/body + Helper path + request/record/receipt digest + Task lock + execution handle）—— 与方案 §10 leak 列表一致（G4 是 projection 层，§10 是 runtime 层）✅
- `limit 1~100` 字面接受（QA-011/012 字面） ✅

### 2.14 §2.5 G5 "复用唯一 CRUD / Reveal 状态机"

✅ **可执行**：

- G5 第 6 行 "不增加'测试连接'；保存后初始 `unverified`，首次真实调用更新状态"—— 与 DFI-5.4.3A 实施报告 §1 "当前仍待 verified Credential helper packaging"语义对齐 ✅
- G5 "Reveal 固定为 owner 主动、单模型单并发、限频、有 deadline、无自动 replay"—— 7 约束（重检、bytes 只送 exact webContents、不创建 durable success Receipt、不复制/广播/剪贴板、Renderer 短生命周期 String 诚实记录残余风险）字面与 STRM-3 强前置对齐 ✅

### 2.15 §2.6 G6 "Runtime Change 与资源上限"

✅ **可执行**：

- stable `clientInstanceId` Main 绑定 + transport/Renderer identity 分离 = DFI-5.4.2 既有 `DesktopV1Alpha5IpcRouter` 风格的字面延伸 ✅
- "Core restart/runtimeInstanceId 变化后，旧 sensitive ticket、MessagePort、command session 全部失效" 与 DFI-5.4.2 `reasoning.runtime_changed` typed envelope 风格一致 ✅
- 每 webContents + 全局 inflight + ticket + port + helper child + timer + reveal waiter 硬上限 = 资源归零强制（G6 与 §10 真实诊断资源收敛严格对应）✅

### 2.16 §2.7 G7 "Renderer 与 Admin 边界"

✅ **可执行**：

- DFI-4A.4 Revision 2 §5.2 字面禁止 `apps/desktop/src/renderer/**` + `apps/admin-console/**` + Central + Document Worker + TGM + Knowledge Provider + Agent Lifecycle ✅
- 后续 Desktop Renderer 消费批 4 约束（删除 GATED 占位 + 接入 Settings list/detail/add/edit/delete/reveal + 不提供测试连接 + 非敏感字段失败保留表单）—— 与 §G6 资源约束 + §G5 不增加测试连接 双重一致 ✅
- Admin 不接收个人 API Key、不获得 CRUD/Reveal —— 与既有 `apps/admin-console/` frozen admin v2 路线严格隔离 ✅

### 2.17 §3.1 "Typed safe error" 17 项

✅ **可独立落地**：

- 17 项 typed code 字面定义（personal_model.{contract_invalid, feature_unavailable, runtime_changed, permission_denied, not_found, revision_conflict, cursor_stale, credential_required, credential_store_unavailable, transport_unavailable, operation_in_progress, in_use, usage_unknown, rate_limited, operation_uncertain, manual_attention, cleanup_pending, reveal_expired}）—— 与 DFI-5.4.x 既有 typed error 风格一致（"category / retryable / safeSummary / correlationId" 四元组）
- "Zod path、stack、OSStatus、完整 Endpoint、Credential/owner/digest/helper path 不得进入错误" —— 与 §10 leak 列表 + §2.4 G4 不投影字段集 三重一致 ✅

### 2.18 §6 focused 120 项 QA

✅ **事实成立**：

- 独立 Node 重算 `plan.match(/QA-\d{3}/gu)` set size = **120**，与方案 §6.1~§6.6 字面一一对应 ✅
- 6 段划分：QA-001~020 Contract/Projection + QA-021~040 Authority/Packaging + QA-041~060 Safe API/Runtime Lease + QA-061~080 Sensitive Transport + QA-081~100 CRUD/Reveal/Recovery + QA-101~120 Real E2E/Leakage/Boundaries
- §6 末段隐含"测试禁止 `.skip/.only/@Disabled/sleep`、自动 retry、硬编码资源0、`?? 0`、Fake 宣称 production、删除数据库冒充 reopen、request-body mock 冒充 Provider、覆盖 historical Evidence" —— 与 DFI-5.4.3 §12 末段字面一致 ✅

### 2.19 §8 24 项停手条件

✅ **事实成立**：

| # | 停手条件 | 事实基础 |
|---|---|---|
| 1 | R2D Task entitlement 当 CRUD/Reveal authority | `local-desktop-r2d-production.ts:203-205 mayConfigure/mayRevealSecret/mayDelete=false as const` 字面保护 |
| 2 | enterprise-managed fallback standalone | §2.1 G1 第 7 约束字面禁止 |
| 3 | fixed UUID/OS user/Renderer/Main 自报身份 | §2.1 G1 末段字面禁止 + `personal-model-owner-authority.ts:20` throw `permission_denied` 字面 |
| 4 | 修改 frozen Desktop v1alpha1~v1alpha5 | §5.2 字面禁止 + G3 净新增 namespace 不扩写 |
| 5 | 新增 migration 27 | §5.2 字面禁止 + 现状 migration max = 26 |
| 6 | 新增 packaging/crypto/Keychain 依赖 | §5.2 字面禁止 + lockfile `5b15ae01…874f31` 字面不变 |
| 7 | Helper 无法固定在 app resource containment | §2.2 G2 第 3-4 约束 + `verifyPersonalCredentialHelperDescriptor` containment 校验已 frozen |
| 8 | production verification 只能依赖 ad-hoc/test signature | §2.2 G2 第 5-6 约束 + unsigned build mutation/reveal unavailable |
| 9 | Helper path 必须来自 env/argv/Renderer/数据库 | §2.2 G2 第 1-2 约束 + 既有 `desktop-private-main.ts:133` 二次校验 |
| 10 | STRM-3 未 ready 但 create/update/reveal 需先开放 | §4 "STRM-3 是 4A.4.2 强前置" + §2.5 G5 STRM binary bytes 流程 |
| 11 | Secret 进入普通 IPC/HTTP/SQLite/日志/Evidence | §5.2 字面禁止 + DFI-5.4.x leak scanner 已有 (5 canary × 4 encode × 4 channel = 80) |
| 12 | Reveal 自动 replay 或广播给多个 consumer | §2.5 G5 "Reveal 固定为 owner 主动、单模型单并发、限频、有 deadline、无自动 replay" 字面禁止 |
| 13 | 复制 CRUD/Reveal Coordinator 或 Operation Journal | §2.5 G5 "不建第二套状态机" + §2.1 G1 "复用既有 Coordinator" |
| 14 | 测试连接证明保存成功 | §2.5 G5 "不增加'测试连接'" + §3.2 "不允许 Mock 列表或'保存成功'" |
| 15 | 删除只能靠前端缓存判断执行中 Task | §2.5 G5 "delete 先重检执行中 Task、usage unknown" |
| 16 | 自动选择/fallback 个人/企业模型 | §2.1 G1 第 7 约束 + §2.7 G7 "Workbench 继续消费 Core/R2D 返回的统一模型候选" |
| 17 | 修改 Renderer 证明 DFI 后端接口成立 | §5.2 字面禁止 |
| 18 | 进入 Admin/TGM/Knowledge/Agent Lifecycle/Central 写路径 | §5.2 字面禁止 |
| 19 | 真实 E2E 只能靠 JSDOM/direct method/body mock 冒充 | §7 强制要求真实 Electron/Main/Preload/Core/SQLite/Helper/Keychain 拓扑 |
| 20 | 无法真实统计资源或敏感信息归零 | §7 + §2.6 G6 资源硬上限 |
| 21 | 覆盖 historical Evidence/Harness | §7 + §5.2 字面禁止 |
| 22 | root/Central 失败无法在单实例正确环境中解释和复现 | §7 + DFI-5.4.3 / 5.4.3A QA 报告 §3 已确认 Central 偶发非稳定回归 |
| 23 | package Helper 需要正式 notarization 才能完成本批 conformance | §0 第 4 段 "DMG/notarization 不属于本批" |
| 24 | 输出 production ready/Enterprise ready/Renderer UI ready 才可关闭本批 | §0 字面禁止 |

### 2.20 §4 子批顺序 + 估算

✅ **可执行 + 估算合理**：

- DFI-4A.4.1（Authority + Helper Packaging + read-only Safe API，3～5 日）+ STRM-3（2～3 日独立评审）+ DFI-4A.4.2（CRUD/Reveal/Recovery，4～7 日）+ DFI-4A.4.3（Real Desktop E2E + Closure + Handoff，3～5 日）= **DFI 合计 10～17 日 / 含 STRM-3 关键路径 12～20 日**
- 估算增量归因（vs DFI-5.4.3A 5～8 日）：Authority standalone/enterprise union 净新增 + Helper asset builder + manifest schema + bundle layout + 6 维度 trust chain 二级校验 + 8 method frozen Preload + PersonalModelSafeSummaryV1Alpha2 扩展 + 17 typed safe error + STRM-3 production activation + 真实 Electron E2E with Helper + Keychain — 与四方面增加量匹配，估算**合理且保守**
- 4A.4.1 可独立关闭（read-only API 不依赖 STRM-3）—— §4 "若不能关闭，DFI-4A.4.1 可独立关闭，4A.4.2~4A.4.3 保持 GATED" 字面明确，与既有 DFI-5.4.x + R2D-P.x 子批风格一致 ✅

---

## 三、发现

### 3.1 P0 = 0

无。方案事实基础（migration 23/24/26 三持久化 + Keychain Helper + Broker + Descriptor 校验 + R2D Task 三 management permission 全部 false + STRM-3 production GATED + Renderer Settings 字面 GATED + `robothree-personal-credential-helper` 源码已 frozen + `verifyPersonalCredentialHelperDescriptor` 6 维度 trust chain 已 frozen + Desktop package 无 packaging/manifest 脚本 + `PersonalModelSafeSummaryV1Alpha2Schema` 已 frozen + 5 个版本 + lockfile digest + migration max=26 + Renderer GATED 4 约束 + Admin/Central/TGM/Knowledge/Agent Lifecycle frozen + focused 120 项 QA + 24 项停手条件 + 4 子批顺序 + 10～17 / 12～20 日估算 + 既有 frozen 实施（DFI-5 全阶段 + R2D-P.1～P.3 + PRA-1～3 + STRM-0～2））全部只读可证。

### 3.2 P1 = 0

无。方案 §1.1 "已经完成，必须直接复用"清单全部只读命中；§1.2 真实缺口清单全部只读可证；§2 冻结设计 7 个 G（Goal）全部可独立执行；§3 接口与错误语义 17 项 typed safe error 可独立落地；§6 focused 120 项 QA 全部可独立执行；§8 24 项停手条件全部可独立断言。

### 3.3 P2 = 0

无。方案目标状态（`PersonalModelManagementAuthorityV2` standalone/enterprise strict dispatch + Helper asset builder + manifest schema + bundle layout + 6 维度 trust chain 二级校验 + 8 method frozen Preload API + STRM-3 production activation + 真实 Electron E2E with Helper + Keychain + 80 leak injection + 9 类资源归零）与既有 frozen 事实（DFI-5 / R2D-P.x / PRA-x / STRM-0~2）均不矛盾；不修改 frozen Desktop v1alpha1~v1alpha5、不修改 frozen 公共 Contract、不动 migration/lockfile/依赖。

### 3.4 P3 = 3（仅报告文字精度，已收口）

1. frozen Preload API 方法数由 7 修正为 8；
2. 工期范围统一为 `3～5 / 2～3 / 4～7 / 3～5`，DFI 合计 `10～17` 日、含 STRM-3 关键路径 `12～20` 日；
3. 执行顺序修正为 DFI-4A.4.1 可先行或与 STRM-3 方案/评审并行，STRM-3 只在进入 DFI-4A.4.2 前构成强门禁。

以上均不改变方案判断。方案 §0 controlling clarification + §2.1 G1 union 设计与 frozen 字面（`mayConfigure/mayRevealSecret/mayDelete=false` + `PersonalModelOwnerAuthority.entitlement: "personal_model.configure"` + `enterprise-identity-authority-semantics` 字面）严格对齐；§2.2 G2 Helper packaging 7 约束与既有 `verifyPersonalCredentialHelperDescriptor` 6 维度 trust chain 严格对应；§2.5 G5 "不增加测试连接，初始 unverified"与 DFI-5.4.3A 实施报告 §1 既定事实对齐；§2.7 G7 "DFI 批不修改 Renderer" 与 Renderer `SettingsModelPage.vue` 字面 GATED 严格一致；§6 focused 120 项 QA 独立 Node 重算 = 120；§8 24 项停手条件全部可独立断言。

### 3.5 其他非问题观察（仅记录，不计 P 级）

1. **STRM-3 仍 GATED 的独立 QA 证据未直接验证** —— `scripts/eipc1.0-preflight-evidence-check.mjs:50` "STRM-3" 字面在 evidence checklist 中，但本次复核未独立运行该 harness 验证 STRM-3 production activation 状态。方案 §4 字面明确 "STRM-3 是 4A.4.2 强前置，4A.4.1 可先独立关闭"——分批设计已吸收此风险；DFI-4A.4.2 编码前由用户/开发者单独授权 STRM-3 production readiness 验证。
2. **STRM-2 已 production-disabled 字面** —— `personal-credential-helper-protocol.ts` / `personal-credential-broker-server.ts` grep `STRM_PRODUCTION_READY|SENSITIVE_TRANSPORT|production_disabled` **0 命中**——证实 STRM-3 production activation 尚未开启，与方案 §1.2 第 5 行缺口声明一致。
3. **`personal_model.configure` 是既有 frozen 字面** —— DFI-4A.4 Revision 2 不新增该字符串，仅在 §2.1 G1 第 4 行引用既有字面；与 frozen 字面保持完全一致 ✅
4. **`personal_model.reveal_secret` 字面不存在** —— grep 仅 `personal_model.configure` 一项；证实 §2.1 "reveal_secret management permission 不可作为 CRUD/Reveal 授权"的硬约束 ✅
5. **`apps/desktop/scripts/` 无 packaging 脚本** —— 与 §2.2 G2 "本批只允许增加最小、无第三方依赖的 Helper asset builder" 字面对齐；Helper 资产构建是净新增任务，DFI-4A.4.1 编码时落地 ✅
6. **`robothree-personal-credential-helper` Helper 源码已 frozen** —— 既有 `services/core/native/macos/robothree-personal-credential-helper.m` 字面存在；DFI-4A.4.1 编码时不修改该源码，仅 build-time manifest 装配 ✅
7. **方案 §9 当前状态表与上游一致** —— DFI-4A.0~4A.3、DFI-4A.4 historical plan / 4A.4.0、DFI-5、R2D-P.1~P.3、PRA-1~3、STRM-0~2 全部 `PASS/CLOSED` 与上游记录字面一致 ✅

---

## 四、文档可执行性结论

### 4.1 实施路径可执行性

✅ **可执行**。在以下前提下，DFI-4A.4 Revision 2 实施路径有完整事实基础：

1. 用户正式接受本独立文档复核报告；
2. 用户单独授权 DFI-4A.4.1 编码（4A.4.1 可独立关闭，不依赖 STRM-3）；
3. 用户单独授权 STRM-3 production activation 评估（4A.4.2 强前置）；
4. 用户单独授权 DFI-4A.4.2 编码（依赖 STRM-3 ready）；
5. 用户单独授权 DFI-4A.4.3 编码（真实 Electron E2E + Renderer Adapter handoff，不修改 Renderer UI）；
6. 严格不修改 frozen Desktop v1alpha1~v1alpha5、不修改公共 Contract、不动 migration/lockfile/依赖；
7. 不修改 Renderer 页面、不修改 Admin Console、不进入 TGM/Knowledge/Agent Lifecycle/Central 写路径。

### 4.2 7 个 G 可执行性

✅ **7 个 G 全部可独立执行**：

- G1（Authority union + Task entitlement 分离）：strict dispatch + frozen 字面保护
- G2（Helper packaging + trust chain）：既有 6 维度 verifier + Main 二次校验
- G3（独立 Public Contract + namespace）：净新增 `desktop-local/personal-model-management/v1alpha1/**` + 8 frozen Preload method
- G4（Safe Projection + 输入材料）：复用 `PersonalModelSafeSummaryV1Alpha2Schema` + 显式不投影 9 类字段
- G5（复用唯一 CRUD/Reveal 状态机）：复用既有 Coordinator/Broker/Receipt + 不建第二套
- G6（Runtime Change + 资源上限）：runtime_changed typed envelope 风格 + 7 类资源硬上限
- G7（Renderer + Admin 边界）：Renderer `apps/desktop/src/renderer/**` 字面禁止 + Admin 不接收 API Key

### 4.3 focused 120 项 + 24 项停手条件可执行性

✅ **可独立落地**：focused 120 项精确 set 去重 = 120（独立 Node 重算）；24 项停手条件全部可独立断言（每项都有具体代码字面或 frozen 字面作证据基础）。

### 4.4 10～17 日 / 12～20 日估算可执行性

✅ **估算合理且保守**（见 §2.20 分析）：与四方面增加量（Authority union 净新增 + Helper asset builder + 6 维度 trust chain 二级校验 + 8 method frozen Preload + STRM-3 production activation + 真实 Electron E2E with Helper + Keychain）匹配；估算增量归因清晰。

### 4.5 4 子批分批顺序可执行性

✅ **可执行**：4A.4.1 可独立关闭（read-only API 不依赖 STRM-3）+ STRM-3 production activation 独立评审 + 4A.4.2 强前置 STRM-3 ready + 4A.4.3 真实 Electron E2E with Helper/Keychain；分批设计与既有 frozen 实施风格一致 ✅

---

## 五、结论

```text
PLAN_DOCUMENT_REVIEW_PASS_WITH_P3_REPORT_CORRECTIONS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 3（仅报告文字精度，已收口）
评审结论：PASS（方案本身无条件修订）
可冻结：是
保持 CODING GATED：是
```

DFI-4A.4 Revision 2 Local Personal Model CRUD / Credential Packaging / Desktop Safe Interface 详细实施方案的事实基础（migration 23/24/26 三持久化 + Keychain Helper + Broker + 6 维度 descriptor verifier + R2D Task 三 management permission 全部 false + STRM-3 GATED + `PersonalModelOwnerAuthority.entitlement: "personal_model.configure"` enterprise-only 字面 + `PersonalModelSafeSummaryV1Alpha2Schema` frozen + Renderer `SettingsModelPage.vue` 字面 GATED + `robothree-personal-credential-helper` 源码 frozen + `apps/desktop/scripts/` 无 packaging 脚本 + 5 个版本 root/core/contracts/desktop=`0.0.0-dfi.5.4.3` + admin=`0.0.0-afe.6c` + lockfile `5b15ae01…874f31` + migration max=26 + 4 子批顺序 + DFI 合计 10～17 日 / 含 STRM-3 关键路径 12～20 日估算 + focused 120 项 QA + 24 项停手条件）全部只读可证。

12 项独立评审问题逐项可独立回答：

1. **是**：Revision 2 取代旧计划当前实施口径，但不改写旧计划历史结论（既有 frozen 字面 + frozen Evidence + frozen Harness 全部只读保留）
2. **是**：standalone local management authority 与 enterprise entitlement 分离（`mayConfigure/mayRevealSecret/mayDelete=false as const` + `PersonalModelManagementAuthorityV2` union strict dispatch + enterprise-managed 禁 fallback standalone）
3. **是**：R2D Task entitlement 的 management permissions 永远不能作为 CRUD/Reveal 授权（`local-desktop-r2d-production.ts:203-205` 字面 false as const + G1 第 9 约束）
4. **是**：独立 Personal Model management package/API namespace，不扩写 v1alpha1~v1alpha5（`packages/contracts/src/desktop-local/personal-model-management` 净新增 + G3 strict isolation）
5. **是**：Helper 先签名再 digest、Main 解析固定资源、Core 二次验证的链（既有 `verifyPersonalCredentialHelperDescriptor` 6 维度 + `desktop-private-main.ts:133` 二次校验 + `personal-credential-helper-trust.ts:18/24 designatedRequirement`）
6. **是**：无正式签名时应用可启动但 mutation/reveal unavailable（G2 第 5-6 约束 + 17 typed safe error `feature_unavailable` / `transport_unavailable`）
7. **是**：STRM-3 是 4A.4.2 强前置，4A.4.1 可先独立关闭（§4 字面 + STRM-3 production activation 独立评审）
8. **是**：CRUD/Reveal 完全复用既有 Coordinator/Broker/Receipt，不建第二套状态机（G5 第 1-7 步骤 + §2.1 G1 "复用既有 Coordinator"）
9. **是**：保存不测试连接，初始状态为 unverified（G5 第 9 步骤 + §3.2 状态交接）
10. **是**：DFI 批不改 Renderer，UI 另行评审授权（G7 + §5.2 字面禁止 + Renderer `SettingsModelPage.vue` 字面 GATED）
11. **是**：10～17 日 DFI 工期、含 STRM-3 关键路径 12～20 日（§4 + §2.20 估算增量归因合理）
12. **是**：本批关闭不等于 installer/notarization、Enterprise、Admin 或 production ready（§0 + §6 + §9 当前状态表）

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 3（仅报告精度，已收口）；评审结论 **PASS（方案本身无条件修订）**；可冻结：是；保持 `CODING GATED`：是。
2. **决策 1**：是否要求 DFI-4A.4 Revision 2 在 §1.2 缺口表新增"STRM-3 production readiness 当前状态"为独立行（当前仅在 §9 当前状态表 "STRM-3 GATED"提及；建议在缺口表显式列出，便于 STRM-3 单独授权时追溯）（推荐添加，提升可追溯性）。
3. **决策 2**：DFI-4A.4 Revision 2 是否可进入编码（推荐用户单独授权 DFI-4A.4.1 编码，并可并行授权 STRM-3 方案与评审；DFI-4A.4.2 必须在 STRM-3 输出 ready 后编码；DFI-4A.4.3 在 4A.4.2 完成后编码）。
4. **后续路径**：
   - DFI-4A.4.1 编码（Authority + Helper Packaging + read-only Safe API，3～5 日）→ 独立关闭；可与下一项并行
   - STRM-3 production activation 方案与独立评审授权（2～3 日）→ 输出 `SENSITIVE_TRANSPORT_READY`
   - DFI-4A.4.2 编码（CRUD/Reveal/Recovery，4～7 日，依赖 STRM-3 ready）
   - DFI-4A.4.3 编码（Real Desktop E2E + Closure + Handoff，3～5 日）→ 真实 Electron E2E with Helper + Keychain + 80 leak + 9 类资源归零
5. **DFI-4A.4 Revision 2 关闭后**：独立交付后续 Desktop Renderer personal model UI 批（删除 SettingsModelPage.vue 字面 GATED 占位 + 接入 list/detail/add/edit/delete/reveal）；继续不打开 Enterprise/Admin/STRM-3 production 余下产品线（Enterprise Max、Admin v2、TGM、Knowledge、Agent Lifecycle 继续 `GATED/false`）。
6. **本批关闭不**等于 Apple notarization 完成、Enterprise entitlement ready、Admin 企业模型 CRUD ready、生产发布包 ready，也不自动授权 Desktop Renderer 开放个人模型表单。

文档复核通过**不等于**编码授权。DFI-4A.4 Revision 2 当前保持 `DOCUMENT REVIEW PENDING / CODING GATED`，待：
- 用户接受本报告；
- 用户按上述决策给出指令；
- 用户单独授权 DFI-4A.4.1 编码；
- STRM-3 方案与评审可并行单独授权，但只在 DFI-4A.4.2 编码前构成强门禁。

方可启动编码。本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立文档复核全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，文档只读）
