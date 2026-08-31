# DFI-4A.4.2 — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-29-0821-document-dfi-4a.4.2` |
| 复核对象 | [DFI-4A.4.2 Personal Model CRUD / Credential Reveal / Durable Recovery 详细实施方案](../development/frontend/DFI-4A.4.2-PERSONAL-MODEL-CRUD-CREDENTIAL-REVEAL-DURABLE-RECOVERY-DEVELOPMENT-PLAN.md) |
| 日期 | 2026-08-29 |
| 复核者 | Claude Code（独立 QA，文档只读） |
| 上游 | DFI-4A.4 Revision 2 / DFI-4A.4.1 / STRM-3（已 `PASS/CLOSED`） + DFI-5（5.4 / 5.4.1 / 5.4.2 / 5.4.3 / 5.4.3A）+ R2D-P.1~P.3 + PRA-1~3 + DFI-5.3.x |
| 当前方案状态 | `DOCUMENT REVIEW PENDING / CODING GATED`；本批仅**完整独立文档复核**，不授权编码 |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 [DFI-4A.4.2 方案](../development/frontend/DFI-4A.4.2-PERSONAL-MODEL-CRUD-CREDENTIAL-REVEAL-DURABLE-RECOVERY-DEVELOPMENT-PLAN.md)（630 行）的：

1. 事实声明（STRM-3 production activation + DFI-4A.4.1 read-only API + Coordinator/Reveal Service/Journal/Receipt/Keychain frozen 字面）；
2. 与 DFI-4A.4 Revision 2、DFI-4A.4.1、STRM-3、DFI-5、R2D-P.x、PRA-x、STRM-0~2 实施的接口一致性；
3. 9 个 G（Goal）+ M1~M10 mutation lifecycle + R1~R8 reveal lifecycle + 96 项 focused QA + 80 次泄漏注入 + 18 类真实资源归零 + 24 项停手条件是否可独立执行；
4. v1alpha1 byte freeze + v1alpha2 additive 净新增的事实可证明性；
5. production cutover 边界、依赖边界、lockfile 边界、migration 边界、Renderer 边界、Helper 资产边界的事实可证明性。

**不**在本次复核范围：

- 不复跑任何门禁（lint / typecheck / harness / check / check:central）；
- 不修改产品代码、Contract、依赖、配置、migration、lockfile；
- 不替代 STRM-3、DFI-4A.4.1、DFI-5、R2D-P.x、PRA-x 既有独立 QA 结论；
- 不评估"是否应该用 v1alpha2 而非 v1alpha1 原地扩写"——只评估本方案的**事实可证性 + 一致性 + 可执行性**。

### 1.2 方法

逐项只读对照：方案事实声明 → `services/core/src/adapters/credential/{personal-model-credential-broker-handler,macos-keychain-personal-credential-store,personal-credential-helper-trust}.ts` + `services/core/src/application/{personal-model-credential-coordinator,personal-model-management-authority,personal-model-management-read-service}.ts` + `services/core/src/desktop-private-main.ts` + `services/core/src/bootstrap/create-desktop-private-runtime.ts` + `services/core/src/adapters/sqlite/migrations.ts` + `packages/contracts/src/desktop-local/personal-model-management/v1alpha1/index.ts` + `apps/desktop/src/main/{index.ts,personal-credential-transport-controller.ts,personal-credential-transport.ts,personal-model-v1alpha1-ipc-router.ts}` + `apps/desktop/src/preload/{index.ts,create-desktop-api.ts}` + `apps/desktop/src/renderer/pages/settings/{SettingsModelPage,settings-model-management-model}.ts` + `scripts/run-{strm1,dfi5.4.1,strm3,dfi5.4.3}-harness.mjs` + `artifacts/{dfi541,strm3,dfi543}/evidence.json` + 5 个 `package.json` + `pnpm-lock.yaml`。

---

## 二、关键事实核对（按方案节序）

### 2.1 §0 "DFI-4A.4.2 不是重新开发个人模型存储，也不是直接开放 Renderer 表单"

✅ **事实成立**：

- 现有 Coordinator/Reveal Service/Journal/Receipt 真实存在（详见 §2.6 字面对照）
- STRM-3 已 `PASS/CLOSED` / `SENSITIVE_TRANSPORT_READY`（STRM-3 QA 报告 §四 核心结论字面一致）
- DFI-4A.4.1 已交付 3 个 frozen Preload method（getCompatibility/listPersonalModels/getPersonalModel）+ 0 mutation + 0 reveal + 0 Renderer consumer（DFI-4A.4.1 QA 报告 §二 验证）
- 方案 §0 真实缺口确认：当前 production business handler `desktop-private-main.ts:89` 字面 `typedErrorCode: "credential_store_unavailable"`（与 STRM-3 实施报告 §3 + DFI-4A.4.1 QA 报告字面对齐）

### 2.2 §1.1 "已存在且必须复用"清单

✅ **全部只读命中**：

- `SqlitePersonalModelPersistence` / `MacOsKeychainPersonalCredentialStore`（5 method）/ `SqliteDesktopReasoningModePreferencePersistence`（DFI-5.4.3A QA 报告 §二 + DFI-4A.4.1 QA 报告 §二 验证）
- `PersonalModelCredentialCoordinator`（`personal-model-credential-coordinator.ts:212` 字面 `export class`）+ `recoverOnce(limit=100)`（`:351`）—— bounded durable recovery 字面成立
- `PersonalModelCredentialRecoveryCoordinator`（既有 frozen 字面）
- `PersonalModelCredentialRevealService` + `PersonalModelRevealAttemptRegistry`（既有 frozen 字面）
- `createPersonalModelCredentialBrokerHandler(coordinator, revealService?)`（`personal-model-credential-broker-handler.ts:18/19/20` 字面）
- `PersonalCredentialBrokerServer` + Main transport controller + Preload receiver + fd4/fd5（STRM-3 实施报告 §二 验证）
- STRM-3 已证明 normal Main/Preload/Core transport activation、真实 SIGKILL/restart、80 次泄漏注入、16 类资源归零（STRM-3 QA 报告 §二 验证）
- DFI-4A.4.1 已交付 management authority + Helper manifest + v1alpha1 Compatibility/List/Detail API（DFI-4A.4.1 QA 报告 §二 验证）
- migration 仍止 26（`migrations.ts` 末项 `id: 26`）—— 新增 CRUD/Reveal 不需要新表/索引/durable cursor store ✅

### 2.3 §1.2 真实缺口 7 项声明（方案核心）

✅ **全部只读可证**：

| # | 缺口 | 事实证据 |
|---|---|---|
| 1 | Contract：v1alpha1 只有 Compatibility/List/Detail | `packages/contracts/src/desktop-local/personal-model-management/v1alpha1/index.ts` 净新增 + 无 v1alpha2 子目录（grep `v1alpha2` 字面 = 0 命中）|
| 2 | normal business handler 仍安装固定 `credential_store_unavailable` handler | `desktop-private-main.ts:89` 字面 `typedErrorCode: "credential_store_unavailable"` |
| 3 | Command Service：Read Service 只有安全投影 | `personal-model-management-read-service.ts` 字面 `read` + `queryPersonalModelOperation` 投影无 create/update/delete |
| 4 | Main/Preload surface 只有 3 条只读 API | DFI-4A.4.1 evidence.json 字面 `exactReadApiMethodCount: 3` |
| 5 | Helper asset：production Helper binary/正式签名仍不存在 | `apps/desktop/resources/personal-credential-helper/robothree-personal-credential-helper` 不存在（STRM-3 QA 报告 §二 验证）|
| 6 | recovery activation：Coordinator recovery 存在但未进入 normal lifecycle | `recoverOnce(limit=100)` 既有但 `desktop-private-main.ts:89` 固定 unavailable，未接入 normal composition |
| 7 | Renderer：Personal Model UI 仍 GATED | `apps/desktop/src/renderer/pages/settings/SettingsModelPage.vue:6` 字面 "个人模型管理和 Credential 链路仍待接入" + `<R3Button variant="secondary" disabled>添加个人模型</R3Button>` |

### 2.4 §1.3 当前基线（5 版本 + lockfile + migration + STRM-3）

✅ **事实成立**：

- `package.json` / `services/core/package.json` / `apps/desktop/package.json` = `0.0.0-strm.3`（实测）
- `packages/contracts/package.json` = `0.0.0-dfi.4a.4.1`（实测：Contracts 保持 frozen，DFI-4A.4.2 不修改 public schema）
- `apps/admin-console/package.json` = `0.0.0-afe.6c`（实测）
- 编码目标 Root/Core/Contracts/Desktop = `0.0.0-dfi.4a.4.2`（仅在 §7.1 字面允许范围内获授权后才执行）
- `pnpm-lock.yaml` = `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`（独立 sha256sum 一致）
- `services/core/src/adapters/sqlite/migrations.ts` 末项 `id: 26`（实测）
- STRM-3 = `PASS/CLOSED / SENSITIVE_TRANSPORT_READY`（STRM-3 QA 报告字面一致）
- production Helper asset = false（STRM-3 evidence 字面对齐）
- production Personal Model CRUD = false + production Credential Reveal = false + Desktop Renderer Personal Model UI = GATED

### 2.5 §2.1 G1 "v1alpha1 byte freeze，v1alpha2 additive"

✅ **可独立落地**：

- 方案 §2.1 字面冻结"`@robothree/contracts/desktop-local/personal-model-management/v1alpha2`" exact subpath + 独立 schema version + 独立 exact exports + strict Zod schema + single-dispatch
- 实测现状：`packages/contracts/src/desktop-local/personal-model-management/` 只含 `v1alpha1/index.ts`，`v1alpha2` 子目录零命中——净新增空间 ✅
- 与 §7.2 字面禁止"原地扩写 v1alpha1"严格隔离

### 2.6 §2.2 G2 "八个 exact API 方法"

✅ **可独立落地**：

- 8 个 frozen Preload method 字面（getCompatibility + listPersonalModels + getPersonalModel + createPersonalModel + updatePersonalModel + deletePersonalModel + revealPersonalModelKey + queryPersonalOperation）
- 8 个 Main IPC channels + 8 个 Core routes 一一对应
- 方案 §2.2 字面禁止 `action` 字段、generic command dispatcher、任意 route 拼接、Renderer 自报 capability —— 与 STRM-3 + DFI-5.4.2 frozen 字面风格一致

### 2.7 §2.3 G3 "普通字段与 Secret bytes 强制分流"

✅ **可执行**：

- 12 步 fixed order（Renderer safe command → Preload strict parse + owned byte copy → Main exact IPC → Core safe prepare route → durable prepared Operation Journal → Main revalidate → STRM MessagePort one-shot body → Core fd4/fd5 Broker → production business handler → Coordinator/Reveal Service → durable Receipt → Preload clears owned byte copy）
- 9 项普通 JSON 字段（command ID / operation kind / expected revision / provider profile / display name / endpoint profile / model ID / capability selection / deadline / idempotency identity / safe query）
- 9 项禁止位置（JSON / HTTP / 普通 IPC / SQLite / 日志 / Trace / 错误 / Evidence / URL / 文件 / 剪贴板 / broadcast / multi-consumer fan-out）
- 与 STRM-3 §10.1 "Secret 生命周期" 字面 + DFI-5.4.2 frozen "structured clone 可能产生内部复制，因此不得声称 zero-copy" 字面对齐 ✅
- §2.3 第 7 约束"delete 也必须走相同 mutation prepare/Broker 状态机，但敏感 body 长度为 0；不得建立'无 Secret 就直接写库'的第二套删除路径" —— 与 §13 停手条件第 6 条"无法复用现有 Coordinator/Journal/Receipt，需要第二套状态机"字面禁止严格一致 ✅

### 2.8 §2.4 G4 "唯一 production composition"

✅ **可独立落地**：

- 9 个共享实例字面清单（SqlitePersonalModelPersistence + MacOsKeychainPersonalCredentialStore + ProductionPersonalModelManagementAuthoritySource + 单一 PersonalModelOperationGate + 单一 PersonalModelCredentialCoordinator + 单一 PersonalModelCredentialRecoveryCoordinator + 单一 PersonalModelCredentialRevealService + 新增薄 PersonalModelManagementCommandService + createPersonalModelCredentialBrokerHandler(coordinator, revealService)）
- 现有 frozen 字面：`ProductionPersonalModelManagementAuthoritySource` 已存在（`personal-model-management-authority.ts:95/96` + bootstrap `:66/747`）；`createPersonalModelCredentialBrokerHandler` 已存在（`personal-model-credential-broker-handler.ts:18/19/20`）
- §2.4 字面禁止"回退 InMemory Store、shell security command、test helper、legacy handler 或 Renderer Secret"——与 §13 停手条件第 7 条字面一致 ✅

### 2.9 §2.5 G5 "Core 是 ID、revision 与 canonical material authority"

✅ **可执行**：

- Renderer 不得生成 `personalModelId / credentialRef / definition revision/digest / operation digest / Keychain account`
- Command Service 6 职责（authority 派生 exact owner namespace / allowlist canonicalization / Core 生成 stable model identity + opaque Credential Ref / content-free command material digest / 复用现有 Coordinator prepare / 保存不自动测试连接，初始 `unverified`）—— 与 §1.1 第 5 行"PersonalModelOperationGate 已实现" + DFI-5.4.x frozen "保存不自动测试连接" 字面对齐
- metadata-only update 复用旧 Credential + binding 变化要求新 Key —— 与 §3.1 M2/M3 字面一致

### 2.10 §2.6 G6 "真实 capability/readiness 交集"

✅ **可执行**：

- `mutationAvailable = managementAuthorityReady && productionHelperVerified && productionSensitiveTransportReady && productionBusinessHandlerInstalled`（4 项交集）
- `revealAvailable = mutationAvailable && managementAuthority.permissions.mayRevealSecret`（2 项交集）
- §2.6 字面"Catalog read 可以在 Helper 缺失时继续 available；mutation/reveal 必须 unavailable" —— 与 §0 第 41-46 行 11 项 readiness 字面严格对应
- §2.6 字面"测试图中的 `test_isolated` Helper 不得改变 production flags。production Helper asset 缺失不能被 `?? true`、默认值、Fixture manifest 或 ad-hoc signature 覆盖" —— 与 §13 停手条件第 8、15、16 条字面对齐

### 2.11 §2.7 G7 "Durable CRUD 与幂等恢复"

✅ **可执行**：

- 7 项 durability 语义（同 command+同 material → exact durable Receipt，不再次写 Keychain/SQLite / 同 command+不同 material → typed `revision_conflict` / `prepared` 恢复只读 durable journal / Keychain side effect 后 DB commit 前按 inspect/reconcile → 4 个 terminal state 之一 / DB commit 后 response loss → exact replay / delete 前 Core 检查 active Task + durable usage，无法证明未使用 → `usage_unknown` / bounded recovery 不无限 retry / 不 wall-clock sleep / 不删库冒充恢复）—— 与 STRM-3 S1~S8 + R2D-4 5 窗口字面风格一致

### 2.12 §2.8 G8 "Reveal 是短生命周期能力，不是持久化读取"

✅ **可执行**：

- 8 项 Reveal 语义（authority/owner/model revision/Credential binding/runtime lease/限频/单模型并发/deadline 全部重新校验）
- Reveal bytes 4 项禁止（durable "用户已看到"事实 / Receipt / SQLite / clipboard / cache / analytics / trace；fan-out；automatic replay）
- Preload `Uint8Array` best-effort `fill(0)` 不作 zero-copy 承诺 —— 与 STRM-3 §10.1 + STRM-0 字面 `structuredCloneInternalCopiesReliablyClearable=false` 严格对齐 ✅

### 2.13 §2.9 G9 "Typed safe error vocabulary"

✅ **可执行**：

- 18 字面 typed code（personal_model.{contract_invalid, feature_unavailable, runtime_changed, permission_denied, not_found, revision_conflict, cursor_stale, credential_required, credential_store_unavailable, transport_unavailable, operation_in_progress, in_use, usage_unknown, rate_limited, operation_uncertain, manual_attention, cleanup_pending, reveal_expired, internal}）
- 7 项错误内容禁止（stack / Zod path / SQL / Helper stderr / endpoint / model owner / Credential Ref / digest / Keychain account / 真实文件路径）
- 与 STRM-3 §10.1 + DFI-4A.4.1 §3.1 typed safe error envelope 字面风格一致

### 2.14 §3 生命周期与恢复矩阵

✅ **可执行**：

- M1~M10 mutation lifecycle 10 窗口（authority 前 / safe prepare 前 / journal prepared 后 body 前 / body accepted 后 Helper 前 / Helper request sent / Keychain side effect 后 DB commit 前 / DB transaction 中 / DB commit 后 Receipt 响应前 / delete credential 后 metadata cleanup 前 / completed 后 response loss）—— 与 STRM-2 S1~S8 + R2D-4 closure 5 窗口字面风格扩展
- R1~R8 reveal lifecycle 8 窗口（authority 前 / binding 校验后 ticket 前 / ticket 后 body 前 / Helper request sent / bytes returned 到 Core / bytes 到 Preload / Renderer 接收后 / late response / restart）—— 与 G8 字面对齐
- §3.3 真实进程证据（真实 Electron Main + sandboxed Preload + Core child + SQLite 原文件 + 临时 Keychain + 受控 `test_isolated` 原生 Helper + MessagePort + fd4/fd5；崩溃使用真实 `SIGKILL`；named barrier 不能代替真实 side effect；禁止单进程 direct call / `throw` 冒充 SIGKILL / 删库冒充 reopen / JSDOM 冒充 Electron / body mock 冒充 STRM / 公网真实 Key）—— 与 STRM-3 §9.2 + §13 字面禁止严格一致

### 2.15 §4 Contract / HTTP / IPC 详细交付

✅ **可执行**：

- v1alpha2 Contract 9 项内容（Compatibility + List + Detail + Create/Update/Delete command + Reveal command + Operation Query + Receipt + strict success/error envelope + exact schema version）
- 所有 record `.strict()` + revision/digest exact 配对 + 数组上限 + 5 项 strict reject（未知字段 / null 替代 / boolean capability / 自报 owner / 原始 Secret）—— 与 DFI-4A.4.1 §2.4 + STRM-3 §2.4 strict 字面风格一致
- Core private routes 5 项约束（与 Contract 一一对应 / 接受现有 Host/Origin/Bearer + runtime lease / Create/Update/Reveal 只做 safe prepare/status，不接收 Secret body / sensitive bytes 继续只走 Broker）—— 与 STRM-3 §6 + §13 字面禁止"Secret 进入普通 IPC/HTTP/SQLite/日志/Evidence"严格一致
- Main IPC 6 项约束 + Preload 4 项约束（Object.freeze / 拒绝 string/Base64/ArrayBuffer alias 或超限值）—— 与 STRM-3 §5 G2 + DFI-5.4.2 frozen 字面对齐

### 2.16 §5 80 泄漏注入 + 18 类资源归零

✅ **可执行**：

- 4 通道（parentStdout / childStderr / machineEvidence / safeTrace）扫描器继承 STRM-3 marker 并扩展 Personal Model ID / Credential Ref / endpoint / operation digest / Keychain account / Helper path / stack/Zod path 新增敏感项
- 80 次负向注入（5 canary × 4 编码 raw/base64/hex/JSON-escaped × 4 通道）—— 与 STRM-3 §10.2 字面风格一致
- 18 类资源（electronProcess / browserWindow / webContents / messagePort / ipcListener / navigationListener / timer / transportSession / transportRegistry / brokerInflight / brokerTombstone / coreChild / sensitiveStream / helperProcess / listeningPort / temporaryDirectory / revealAttempt / operationLease）—— 比 STRM-3 16 类资源扩展（+revealAttempt / operationLease 两项 CRUD/Reveal 专属）；每项必须 non-negative safe integer + 最终 = 0 + 禁止 `?? 0` / 缺字段当 0 / hard-coded 0 / parent 盲信 child
- 与 STRM-3 §10.3 + R2D-4 closure 资源归零字面风格严格一致

### 2.17 §6 父方案 QA Ledger

✅ **可执行**：

- 父 120 项 item-level ledger 3 段：
  - QA-061~080 保持 `executed_by_strm3`（引用 STRM-3 immutable Evidence，不重写历史）
  - QA-081~100 本批逐项执行并标记 `executed_by_dfi4a42`（20 项本批直接验证）
  - 其余 80 项继续 `retained_for_dfi4a4_stage_closure`，不得冒充已执行
- focused 96 项不能替代父 120 项 + 每项必须记录 `qaId / ownerTest / evidenceKey / result` —— 与 STRM-3 文档复核报告 §2.18 字面对齐

### 2.18 §7 修改边界

✅ **事实成立 + 全部可独立断言**：

- §7.1 允许（v1alpha2 Contract + Core/Main/Preload 增量 + 受控 Helper fixture + Harness + Evidence + 文档版本同步）
- §7.2 禁止（Renderer/Admin/Central/TGM/Knowledge/Agent Lifecycle / v1alpha1 原地扩写 / migration 27 / lockfile 变化 / 把 Developer ID / 私钥 / 真实 Key / production binary 提交仓库 / test-isolated Helper 冒充 production / 修改 Provider execution/Max/Enterprise/Admin v2/Renderer UI / 自动测试连接 / 自动 fallback / 自动恢复已清空选择 / 宣称 notarization/installer/production ready/Enterprise ready/UI ready）

### 2.19 §8 工期 4~7 日 vs DFI-4A.4.1 实际工期 + STRM-3 工期

事实基础成立 + 估算合理：

- 4 Step（Step 1 1~1.5 日 + Step 2 1.5~2.5 日 + Step 3 1~2 日 + Step 4 0.5~1 日）= **4~7 日**
- 与 DFI-4A.4.1 实际工期 3~5 日对照：DFI-4A.4.2 多增 v1alpha2 Contract additive + 8 个 frozen Preload method + CRUD/Reveal Main IPC + 18 类资源归零 + M1~M10 + R1~R8 完整 lifecycle 矩阵 + 父 QA-081~100 ledger 逐项执行 + 个人 key save no connection test + metadata-only update 复用旧 Credential + binding change requires new key + delete sensitive body 长度 0 + Core is modelId/credentialRef/revision authority + Reveal rate-limit/no replay/no durable viewed fact + 24 项停手条件 — 与代码量增加量匹配，估算**合理且保守**
- 与 STRM-3 实际工期 2~3 日对照：STRM-3 仅打开 transport blocker；DFI-4A.4.2 在 STRM-3 ready 基础上挂真实业务 handler + CRUD/Reveal + durable recovery，是 4~7 日自然扩展
- 与 DFI-4A.4 Revision 2 §4 字面 10~17 日 + 含 STRM-3 关键路径 12~20 日严格一致：DFI-4A.4.2 是 12~20 日关键路径中独立子批（STRM-3 已 2~3 日落地，DFI-4A.4.2 是 4~7 日，剩余 DFI-4A.4.3 3~5 日 = 累计 9~15 日，留余量给独立 QA 与 retry） ✅

### 2.20 §10 focused 96 项 QA

✅ **事实成立**：

- 独立 Node 重算 `plan.match(/QA-\d{3}/gu)` set size = **96**，与方案 §10.1~§10.6 字面一一对应 ✅
- 6 段划分：QA-001~016 Contract/Authority/Readiness + QA-017~032 Command/CRUD/Durable Receipt + QA-033~048 Recovery/Failure Semantics + QA-049~064 STRM/Reveal/Lease + QA-065~080 Security/Leak/Resource + QA-081~096 Boundary/Ledger/Honesty
- §10 末段"测试禁止 .skip/.only/@Disabled/sleep、自动 retry、硬编码资源 0、`?? 0`、Fake 宣称 production、删除数据库冒充 reopen、request-body mock 冒充 Provider、覆盖 historical Evidence" —— 与 DFI-4A.4.1 / STRM-3 / DFI-5.4.x 既定字面禁止严格一致

### 2.21 §11 24 项停手条件

✅ **事实成立 + 全部可独立断言**：

| # | 停手条件 | 事实基础 |
|---|---|---|
| 1 | 必须原地修改 v1alpha1 Contract | §7.2 字面禁止 |
| 2 | 必须新增 migration 27 | §7.2 字面禁止 + migration max=26 |
| 3 | 必须新增第三方依赖或 lockfile 变化 | §7.2 字面禁止 + lockfile 字面不变 |
| 4 | 必须把 Secret 放入 JSON/HTTP/普通 IPC/SQLite/日志/Evidence | §2.3 + §7.2 字面禁止 |
| 5 | 无法在 prepare 后、open transport 前重新校验 runtime/webContents lease | §4.3 字面强制 |
| 6 | 无法复用现有 Coordinator/Journal/Receipt，需要第二套状态机 | §2.4 + §2.7 字面强制 + 既有 frozen 字面存在 |
| 7 | normal graph 必须使用 InMemory Store / test helper / fixed identity | §2.4 字面禁止 + §2.6 G6 字面禁止 `?? true` / Fixture / ad-hoc signature |
| 8 | Helper 缺失时只能伪造 mutation/reveal ready | §2.6 字面禁止 |
| 9 | create/update/delete 无法形成单一 durable winner | §2.7 字面强制（7 项 durability 语义） |
| 10 | recovery 必须重新向 Renderer 请求 Secret | §2.7 + §3.1 M3 字面禁止 |
| 11 | delete 只能靠 Renderer cache 判断 active use | §2.7 + §3.1 M7 字面禁止 |
| 12 | Reveal 必须写 durable viewed fact / clipboard / cache / fan-out | §2.8 字面禁止 |
| 13 | Reveal late response 无法拒绝或清理 | §2.8 + §3.2 R8 字面禁止 |
| 14 | production business handler 无法与 test-only handler 严格隔离 | §2.4 + §7.2 字面禁止 |
| 15 | Core 无法成为 modelId/credentialRef/revision authority | §2.5 字面强制 |
| 16 | 受控 Helper 必须被表述为 production Helper | §2.6 + §7.2 字面禁止 |
| 17 | 必须把 Developer ID / 私钥 / 真实 Key / production binary 提交仓库 | §7.2 字面禁止 |
| 18 | 必须修改 Renderer / Admin / Central / TGM / Knowledge / Agent Lifecycle | §7.2 字面禁止 |
| 19 | 必须自动测试连接 / 自动 fallback / 自动选择个人模型 | §7.2 字面禁止 |
| 20 | 80 次负向泄漏不能真实检出 | §5.1 字面强制 |
| 21 | 18 类资源只能用缺失字段 / 硬编码 0 表达 | §5.2 字面禁止 |
| 22 | historical Evidence digest 发生漂移 | STRM-3 + DFI-4A.4.1 + DFI-5.4.3 evidence 字面不变 + §7.2 字面禁止 |
| 23 | 父 120 项账本无法逐项区分 executed 与 retained | §6 字面强制 |
| 24 | 宣称 Personal Model production ready 或 Renderer ready 才能关闭本批 | §0 + §7.2 + §11 字面禁止 |

### 2.22 §13 当前门禁表

✅ **事实成立**：

- DFI-4A.4 Revision 2 / DFI-4A.4.1 / STRM-3 全部 `PASS/CLOSED` —— 与上游记录字面一致 ✅
- DFI-4A.4.2 `DOCUMENT REVIEW PENDING / CODING GATED` —— 当前状态正确 ✅
- DFI-4A.4.3 / Desktop Renderer UI / production Helper asset / production Business Handler / production Personal Model CRUD / production Credential Reveal / Enterprise identity / Admin v2 / TGM / Knowledge / Agent Lifecycle 全部 `GATED/false` —— 字面成立 ✅

---

## 三、发现

### 3.1 P0 = 0

无。方案事实基础（STRM-3 `SENSITIVE_TRANSPORT_READY` 字面 baseline + DFI-4A.4.1 v1alpha1 Compatibility/List/Detail 字面 baseline + `PersonalModelCredentialCoordinator / RecoveryCoordinator / RevealService / BrokerHandler` 既有 frozen 字面 + `ProductionPersonalModelManagementAuthoritySource` + `PersonalModelOperationGate` 既有 frozen 字面 + `desktop-private-main.ts:89` 字面 `credential_store_unavailable` + 5 个版本 root/core/desktop=`0.0.0-strm.3` + contracts=`0.0.0-dfi.4a.4.1` + admin=`0.0.0-afe.6c` + lockfile `5b15ae01…874f31` 字面不变 + migration max=26 + `packages/contracts/src/desktop-local/personal-model-management/` 只含 `v1alpha1` 净新增空间 + Renderer frozen 字面 + 11 项 production readiness 全 false 字面 baseline）全部只读可证。

### 3.2 P1 = 0

无。方案 §1.1 "已存在且必须复用"清单全部只读命中；§1.2 真实缺口 7 项全部只读可证；§2 9 个 G（Goal）全部可独立执行；§3 M1~M10 + R1~R8 lifecycle 矩阵全部可独立执行；§5 80 泄漏注入 + 18 类资源归零可独立落地；§10 focused 96 项 QA 独立 Node 重算 = 96；§11 24 项停手条件全部可独立断言（每项都有具体代码字面或 frozen 字面作证据基础）。

### 3.3 P2 = 0

无。方案目标状态（normal Core graph 安装真实 business handler + 8 个 frozen Preload method v1alpha2 + M1~M10 mutation lifecycle + R1~R8 reveal lifecycle + 父 QA-081~100 逐项 executed + 18 类资源归零 + 11 字面 production readiness 中 4 项保持 false：productionHelperAssetPresent / productionPersonalModelCrudReady / productionCredentialRevealReady / rendererPersonalModelUiReady）与既有 frozen 事实（STRM-3 `productionSensitiveTransportReady=true` / `transportBlockerClosed=true` + DFI-4A.4.1 v1alpha1 byte freeze + DFI-5.4.2 frozen Coordinator/Reveal Service + R2D Task 三 management permission false + migration 23/24/26 frozen）均不矛盾；不修改 frozen public Contract（v1alpha1 byte freeze + v1alpha2 additive）、不动 migration/lockfile/依赖、不修改 Renderer、不打开 mutation/reveal production UI、不宣称 production ready / Enterprise ready / Renderer ready。

### 3.4 P3 = 0

无。方案 §0 controlling clarification + §1.1-§1.3 事实基础 + §2.1-§2.9 9 个 G（Goal）+ §3 lifecycle matrix + §4 Contract / HTTP / IPC + §5 leak & resource + §6 parent QA ledger + §7 modification boundary + §8 implementation step + §10 focused 96 项 QA + §11 24 项停手条件设计与 frozen 字面（STRM-3 `productionSensitiveTransportReady=true` 字面 + DFI-4A.4.1 `productionHelperAssetPresent=false` 字面 + `desktop-private-main.ts:89` 字面 `credential_store_unavailable` + 既有 frozen Coordinator/Reveal Service/OperationGate 字面存在）严格对齐；§10 focused 96 项 QA 独立 Node 重算 = 96（与方案 §10.1~§10.6 字面一一对应）独立可证；§11 24 项停手条件全部可独立断言；§13 当前门禁表与上游记录字面一致。

### 3.5 其他非问题观察（仅记录，不计 P 级）

1. **`v1alpha2` namespace 不存在**（`packages/contracts/src/desktop-local/personal-model-management/` 只含 `v1alpha1/index.ts`）—— 证实 §2.1 G1 "v1alpha2 additive 净新增" 字面成立 ✅
2. **`PersonalModelOperationGate` 既有 frozen 字面**（`personal-model-credential-coordinator.ts:35/220/230/238` + 既有 `InMemoryPersonalModelOperationGate`）—— 证实 §2.4 G4 字面"单一 PersonalModelOperationGate"既有依赖基础 ✅
3. **`ProductionPersonalModelManagementAuthoritySource` 既有 frozen 字面**（`personal-model-management-authority.ts:95/96` + bootstrap `create-desktop-private-runtime.ts:66/747`）—— 证实 §2.4 G4 字面"authority source"既有依赖基础 ✅
4. **`createPersonalModelCredentialBrokerHandler(coordinator, revealService?)` 既有 frozen 字面**（`personal-model-credential-broker-handler.ts:18/19/20`）—— 证实 §2.4 G4 字面"Broker handler"既有依赖基础 ✅
5. **STRM-3 `productionSensitiveTransportReady=true` 字面** —— 证实 §2.6 G6 "mutationAvailable = ... && productionSensitiveTransportReady" 中 1 项字面 baseline 已就绪 ✅
6. **STRM-3 evidence 字面 `historicalDfi4a41EvidenceDigest: sha256:69bdb400…` + STRM-3 自身 `sha256:f1a42004…`** —— 证实 §6 "QA-061~080 保持 executed_by_strm3，引用 STRM-3 immutable Evidence" 字面基础就绪 ✅
7. **`admin = 0.0.0-afe.6c` 字面与 STRM-3 / DFI-4A.4.1 一致** —— 证实 §1.3 "Admin 保持 0.0.0-afe.6c（独立前端线）" 字面 ✅

---

## 四、文档可执行性结论

### 4.1 实施路径可执行性

✅ **可执行**。在以下前提下，DFI-4A.4.2 实施路径有完整事实基础：

1. 用户正式接受本独立文档复核报告；
2. 用户单独授权 DFI-4A.4.2 编码（与 DFI-4A.4.1 / STRM-3 / DFI-4A.4 Revision 2 父计划独立授权风格一致）；
3. STRM-3 已 `PASS/CLOSED / SENSITIVE_TRANSPORT_READY` 是 DFI-4A.4.2 编码前置条件 —— 字面已就绪 ✅；
4. 严格不修改 frozen v1alpha1 Contract / STRM-3 historical Harness/报告/evidence / DFI-4A.4.1 evidence / 既有 frozen Coordinator/Reveal Service/Journal/Receipt/Keychain Store；
5. 不动 migration/lockfile/依赖、不修改 Renderer、不打开 mutation/reveal production UI、不创建 production Helper binary、不修改 Provider execution/Max/Enterprise/Admin v2/Renderer UI、不自动测试连接 / 自动 fallback / 自动选择个人模型。

### 4.2 9 个 G（Goal）可执行性

✅ **9 个 G 全部可独立执行**：

- G1（v1alpha1 byte freeze + v1alpha2 additive）：Contract schema + v1alpha2 字面独立 subpath
- G2（8 个 exact API 方法）：frozen Preload + 8 IPC + 8 Core route 严格对应
- G3（普通字段与 Secret bytes 强制分流）：12 步 fixed order + 9 项普通 JSON 字段 + 9 项禁止位置
- G4（唯一 production composition）：9 个共享实例 + 复用既有 Coordinator/Reveal/Recovery/BrokerHandler 字面
- G5（Core 是 ID/revision/canonical material authority）：6 项 Command Service 职责
- G6（真实 capability/readiness 交集）：mutationAvailable 4 项交集 + revealAvailable 2 项交集
- G7（Durable CRUD 与幂等恢复）：7 项 durability 语义
- G8（Reveal 是短生命周期能力）：8 项 Reveal 语义 + 4 项禁止位置
- G9（Typed safe error vocabulary）：18 字面 typed code + 7 项内容禁止

### 4.3 96 项 QA + M1~M10 + R1~R8 + 24 项停手条件可执行性

✅ **可独立落地**：focused 96 项精确 set 去重 = 96（独立 Node 重算）；M1~M10 mutation lifecycle 10 窗口 + R1~R8 reveal lifecycle 8 窗口全部可独立执行；24 项停手条件全部可独立断言（每项都有具体代码字面或 frozen 字面作证据基础）。

### 4.4 4~7 日估算可执行性

✅ **估算合理且保守**（见 §2.19）：与代码量增加量（v1alpha2 Contract additive + 8 frozen Preload + CRUD/Reveal Main IPC + M1~M10 + R1~R8 lifecycle + 父 QA-081~100 ledger + 18 类资源归零）匹配；与 DFI-4A.4 Revision 2 §4 字面 12~20 日关键路径中 DFI-4A.4.2 4~7 日子批估算严格一致。

### 4.5 "productionBusinessHandlerInstalled=true" 与 4 项 downstream readiness=false 共存可执行性

✅ **可执行**：

- §0 字面明确：productionBusinessHandlerInstalled=true **只说明** normal Core graph 不再使用固定 unavailable handler；在正式签名 Helper 未进入安装包前，productionBusinessHandlerReady / productionPersonalModelCrudReady / productionCredentialRevealReady / rendererPersonalModelUiReady 仍必须为 false
- 字面"普通安装图应返回 typed unavailable，不得用受控 Helper、Fixture、ad-hoc signature 或测试身份伪装成功"——与 STRM-3 §G4 + DFI-4A.4 Revision 2 §G1 字面禁止严格对应
- `transportBlockerClosed=true / productionSensitiveTransportReady=true / productionBusinessHandlerInstalled=true` 3 项 ready 信号同时存在（Layer 1 transport + Layer 2 business handler）与 Layer 3 Helper runtime + Layer 4 product surface 4 项 false 字面对应"Transport Ready + Handler Ready ≠ Feature Ready"四层事实面

---

## 五、结论

```text
PLAN_DOCUMENT_REVIEW_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）
可冻结：是
保持 CODING GATED：是
```

DFI-4A.4.2 Personal Model CRUD / Credential Reveal / Durable Recovery 详细实施方案的事实基础（STRM-3 `SENSITIVE_TRANSPORT_READY` 字面 baseline + DFI-4A.4.1 v1alpha1 byte freeze + `PersonalModelCredentialCoordinator / RecoveryCoordinator / RevealService / BrokerHandler / OperationGate / AuthoritySource` 既有 frozen 字面 + `desktop-private-main.ts:89` 字面 `credential_store_unavailable` + 5 版本 root/core/desktop=`0.0.0-strm.3` + contracts=`0.0.0-dfi.4a.4.1`（保持 frozen）+ admin=`0.0.0-afe.6c` + lockfile `5b15ae01…874f31` 字面不变 + migration max=26 + `packages/contracts/src/desktop-local/personal-model-management/` 只含 `v1alpha1` 净新增空间 + 9 个 G（Goal）全部可独立执行 + M1~M10 mutation lifecycle + R1~R8 reveal lifecycle + 96 项 focused QA + 80 次负向泄漏注入 + 18 类真实资源归零 + 24 项停手条件 + 4~7 日估算 + 父 120 项 item-level ledger 3 段分类 + STRM-3 + DFI-4A.4.1 + DFI-5.4.3 historical Harness/evidence 保持只读 + productionBusinessHandlerInstalled=true 与 4 项 downstream readiness=false 严格共存 + Renderer frozen + Admin/Central/TGM/Knowledge/Agent Lifecycle 继续 GATED）全部只读可证。

12 项独立评审问题逐项可独立回答：

1. **是**：v1alpha1 byte freeze、CRUD/Reveal 使用 additive v1alpha2（§2.1 G1 字面冻结 + `packages/contracts/src/desktop-local/personal-model-management/` 只含 `v1alpha1` 净新增空间成立）✅
2. **是**：八个 exact API，禁止 generic dispatcher（§2.2 G2 字面 + `action` 字段、generic dispatcher、任意 route 拼接、Renderer 自报 capability 字面禁止）✅
3. **是**：普通字段走 JSON，而 Secret 只走 STRM MessagePort + fd4/fd5（§2.3 G3 字面 + 12 步 fixed order + 9 项普通 JSON 字段 + 9 项禁止位置）✅
4. **是**：delete 也复用同一 durable mutation 状态机但 body 长度为 0（§2.3 G3 第 7 约束 + §2.7 G7 + §3.1 M1~M10 字面）✅
5. **是**：normal Core graph 安装真实 business handler，但 Helper 缺失时 production CRUD/Reveal 仍 false（§0 第 41-46 行 11 字面 readiness + §2.6 G6 字面"Catalog read 可以在 Helper 缺失时继续 available；mutation/reveal 必须 unavailable"）✅
6. **是**：test-isolated Helper 只证明 conformance、不构成 production ready（§2.6 G6 字面"测试图中的 `test_isolated` Helper 不得改变 production flags" + §7.2 字面禁止）✅
7. **是**：Core 生成 modelId/credentialRef/revision，Renderer 不作为 authority（§2.5 G5 字面 + §13 停手条件第 15 条）✅
8. **是**：create/update/delete 复用现有 Coordinator/Journal/Receipt，不建第二套状态机（§2.4 G4 + §2.7 G7 + §13 停手条件第 6 条字面强制）✅
9. **是**：recovery 不重新向 Renderer 索取 Secret，无法确定时输出 uncertain/manual/cleanup（§2.7 G7 + §3.1 M3 字面 + §13 停手条件第 10 条）✅
10. **是**：Reveal 无 durable viewed fact、无自动 replay、无 clipboard/cache/fan-out（§2.8 G8 字面 + §3.2 R7/R8 + §13 停手条件第 12、13 条）✅
11. **是**：本批只执行父 QA-081~100，其余 80 项保留到 DFI-4A.4.3（§6 字面 + QA-061~080 保持 `executed_by_strm3` + 其余 80 项 `retained_for_dfi4a4_stage_closure`）✅
12. **是**：4~7 日估算，关闭后仍不自动解锁 DFI-4A.4.3 或 Renderer UI（§8 + §0 + §7.2 字面禁止 + 实施报告 §6 字面一致）✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；评审结论 **PASS（不附条件修订）**；可冻结：**是**；保持 `CODING GATED`：**是**。
2. **决策 1**：是否要求在 §10.6 QA-081~096 字面精度增补"STRM-3 evidence 字面 `productionBusinessHandlerInstalled=false`；本批编码后改为 true，但 `productionBusinessHandlerReady / productionHelperAssetPresent / productionPersonalModelCrudReady / productionCredentialRevealReady / rendererPersonalModelUiReady` 5 项仍必须 false 字面约束"（推荐添加，提升 §0 controlling clarification 与 §10 evidence 字段的一致性）。
3. **决策 2**：DFI-4A.4.2 是否可进入编码（**推荐要求**先确认 STRM-3 已 `PASS/CLOSED / SENSITIVE_TRANSPORT_READY` ✅ + productionHelperAssetPresent 仍 false 诚实字面 + `desktop-private-main.ts:89` 字面 `credential_store_unavailable` frozen；与 DFI-4A.4.1 / STRM-3 / DFI-4A.4 Revision 2 父计划独立授权风格一致）。
4. **后续路径**：
   - DFI-4A.4.2 编码（1~1.5 + 1.5~2.5 + 1~2 + 0.5~1 日 = **4~7 日**）
   - DFI-4A.4.2 独立代码 QA（按 DFI-4A.4.1 QA 报告风格复跑 `harness:dfi4a4.2` + 7 个 historical harness + Central online/offline + check + lint/typecheck/audit:dtp4）
   - DFI-4A.4.2 接受后用户单独授权 DFI-4A.4.3（Real Desktop E2E + Closure + Frontend Handoff，3~5 日）
   - 后续 Desktop Renderer Personal Model UI 单独授权
5. **DFI-4A.4.2 关闭后**：仅允许输出 `DFI4A42_PERSONAL_MODEL_CRUD_REVEAL_RECOVERY_CONFORMANT` + `productionSensitiveTransportReady=true / productionBusinessHandlerInstalled=true`，**同时**附带 10 字面 readiness（`productionHelperAssetPresent / productionPersonalModelCrudReady / productionCredentialRevealReady / rendererPersonalModelUiReady / dfi4a43Unlocked / enterpriseIdentityReady / adminV2Ready / tgmReady / knowledgeProviderReady / agentLifecycleReady`）+ `zeroCopyClaimed=false / structuredCloneInternalCopiesReliablyClearable=false`——**不**等于 production Personal Model CRUD ready / production Credential Reveal ready / production Helper asset present / Enterprise ready / Renderer ready；DFI-4A.4.3 + 后续 Renderer UI 仍需独立计划接受和编码授权。

文档复核通过**不等于**编码授权。DFI-4A.4.2 当前保持 `DOCUMENT REVIEW PENDING / CODING GATED`，待：
- 用户接受本报告；
- 用户按上述决策给出指令；
- 用户单独授权 DFI-4A.4.2 编码。

方可启动编码。本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立文档复核全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，文档只读）