# DFI-4A.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-21-1414-version-dfi-4a.1` |
| 验收对象 | DFI-4A.1：个人模型 Domain、Contract 与 Persistence Foundation |
| 日期 | 2026-08-21 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core/Contracts `0.0.0-dfi.4a.1`；Desktop `0.0.0-dfe.6a`；Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFI-4A.1 专项（contracts/domain/migration/conformance 4 个测试文件） | **PASS 4 files / 51 tests** |
| 2 | `CI=true pnpm run check`（完整） | **PASS 207 files / 1378 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 302/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS BUILD SUCCESS（302 tests）** |

---

## 二、重点核查项（方案 Revision 3.3 冻结项逐条 + 边界零漂移）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | migration 23 七张 STRICT 表 | ✅ [migrations.ts:946](services/core/src/adapters/sqlite/migrations.ts#L946) `id:23, name:dfi_4a1_personal_model_foundation`；七表全 `STRICT`，digest 字段全带 `sha256:` 前缀 + 71 长度 + hex CHECK；FK 完整（definitions→namespaces、heads→definitions、status_facts→definitions + 自引用 carry_forward） |
| 2 | `namespace_key_check_digest`（R3.3-P1-1） | ✅ `personal_model_owner_scope_namespaces` 表含 `namespace_key`（BLOB 32-64）+ `namespace_key_check_digest`（sha256 CHECK）+ partial unique index（active 唯一） |
| 3 | 聚合 Persistence（R3.3-P1-2） | ✅ [personal-model-persistence.ts](services/core/src/ports/personal-model-persistence.ts) `PersonalModelPersistence` 聚合 Port：`commitCreateOutcome`（definition+head+status+operation+receipt 五合一）/`commitUpdateOutcome`（+expectedHeadRevision CAS）/`commitDeleteOutcome`/`commitStatusOutcome`/`commitPreferenceOutcome`；禁止顺序调用多个 Repository 模拟 Transaction B |
| 4 | 不可变配置历史 | ✅ `personal_model_definitions` 不可变插入（PK 含 configuration_revision）；`personal_model_heads` 分离 current head + selection_state（active/delete_pending/tombstoned） |
| 5 | 不可变状态历史 | ✅ `personal_model_status_facts` 以 `(..., configuration_revision, status_revision)` 为主键追加；`status_origin`（initialized/carry_forward/provider_observation）+ `carried_from_*` 三来源字段 + CHECK（carry_forward 时三字段非空、否则全空） |
| 6 | credentialRef 预分配（R3.3-P1-1） | ✅ [personal-credential-store.ts](services/core/src/ports/personal-credential-store.ts) `store(operationId, credentialRef, secret)` —— ref 作为参数预生成，幂等写入；`credential_ref` 只进 Core 私有 definition/operation/Credential Port |
| 7 | inspect 联合类型（R3.3-P1-2） | ✅ `PersonalCredentialObservation` strict discriminated union：`absent`（仅 ref）/`unavailable`（ref+typed error）/`present`（ref+operation/revision/binding digest）；不得用可空字段伪装统一对象 |
| 8 | Endpoint canonicalization（R3.3-P2-1） | ✅ [personal-model-domain.ts:479](services/core/src/application/personal-model-domain.ts#L479) `%00/%2f/%5c` 大小写不敏感在 WHATWG parse 前拒绝 + `[@?#]` 拒绝 + parse 后 normalized hostname/path 再拒绝 null/C0/C1 control + path 段 `decodeURIComponent` 拒绝 `/` `\` + NFC normalize + `endpointIdentityDigest` 用 domain separator |
| 9 | digest 重算防 tamper | ✅ `validatePersonalModelOperation`/`validatePersonalModelCommandReceipt` 都重算 `recordDigest`/`receiptDigest` 并比对；`calculatePersonalModelRecordDigest` 用 domain separator |
| 10 | operationId === commandId | ✅ operation/receipt 主键均为 `commandId`，无独立 operation identity |
| 11 | 边界零漂移 | ✅ 本批改动 = `packages/contracts/desktop-local/v1alpha2` + `services/core`（application/ports/adapters/migrations）+ tests + 版本号；未改 Main/Preload/Renderer/central-service/document-worker；`pnpm-lock.yaml` 保持 Aug 16；未进入真实 Keychain/Provider/Desktop CRUD/Task lock/Agent Loop；两个非 personal-model 的 sqlite 集成测试改动为 migration 23 close/reopen 适配 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-4A.1 正确完成个人模型 Domain、Contract 与 Persistence Foundation：migration 23 七张 STRICT 表
（含 `namespace_key_check_digest` 损坏检测、不可变配置/状态历史、carry_forward 来源证明、FK/CHECK/UNIQUE
/partial unique index）；聚合式 `PersonalModelPersistence`（`commitXxxOutcome` 原子提交，杜绝半提交态）；
`credentialRef` 在 Transaction A 前预分配并只进 Core 私有层；`inspect()` strict 联合类型；Endpoint
canonicalization 拒绝 `%00`/null/C0/C1/path 穿越；digest 重算防 tamper。四项门禁独立串行复跑全绿
（专项 4/51、完整 check 207/1378 + 3 smoke、Central online/offline 302/302）。边界零漂移：未改
Main/Preload/Renderer/Central/Document Worker/lockfile，未进入真实 Keychain/Provider/Desktop CRUD/
Task lock/Agent Loop。

**DFI-4A.1 可进入用户接受流程。DFI-4A.2～4A.4、DFI-2B、DFI-3、DFE-6B、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
