# DFI-4A.2.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-21-1727-version-dfi-4a.2.2` |
| 验收对象 | DFI-4A.2.2：CRUD Coordinator 与 Durable Recovery |
| 日期 | 2026-08-21 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core/Contracts `0.0.0-dfi.4a.2.2`；Desktop `0.0.0-dfe.6b`；Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFI-4A.2.2 专项（command/coordinator/sensitive-boundary/keychain/broker-contracts 5 个测试文件） | **PASS 5 files / 44 tests** |
| 2 | `CI=true pnpm run check`（完整） | **PASS 214 files / 1430 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 302/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS BUILD SUCCESS（302 tests）** |

---

## 二、重点核查项（方案 §4 两阶段 + 恢复 + 安全边界）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | prepare/execute 两阶段分离 | ✅ [personal-model-credential-coordinator.ts](services/core/src/application/personal-model-credential-coordinator.ts) `prepare()` 不接收 Secret（输入无 secret 字段，写 Transaction A + beginCredentialOperation）；`executePrepared()` 才接收 Secret（Uint8Array，校验后 #converge Transaction B） |
| 2 | identity 匹配 + Secret presence 匹配 | ✅ `executePrepared` 校验 operationType/targetModelId/requestDigest/expectedConfigurationRevision 与 prepared operation 一致；`needsSecret`（create 或 update 换 ref）时 Secret 必须非空、否则必须空 |
| 3 | 幂等重放 + mutation 互斥 | ✅ `prepare`/`executePrepared` 都先查 Receipt/operation，同 commandId+requestDigest 返回 replayed、不同返回 conflict；mutationKey 互斥防并发 |
| 4 | C1~C4/U1~U3/D1~D3 恢复分类 | ✅ `#recoverOperation` 按 operationPhase + `inspect()` 分类：credential_step_observed→commitObserved、cleanup_pending→cleanupOldCredential、intent_committed 按 absent/present/unavailable 分类（C2 absent→manual_attention、C3 present→observeAndCommit、mismatch→binding conflict） |
| 5 | 保守 Credential 清理（U3） | ✅ `#converge` 的 delete 先 `#deletionGuard.evaluate`，guard 非 clear → `personal_model.in_use_or_usage_unknown` 不删除；测试断言「conservatively retains the old Credential」「never deletes while usage is unknown」 |
| 6 | Secret 不进 digest/SQLite/日志/公共 IPC | ✅ requestDigest 绑定非敏感事实（不含 Secret/hash/credentialRef）；测试断言 durable facts 不含 Secret 形状；`secret.fill(0)` 清空；未注册公共 IPC |
| 7 | credentialMutation 模式 | ✅ `reuse_existing`（仅 display name 等，inspect-only 不 resolve/store）+ `replace_secret`（Endpoint/Provider/protocol/Key 变化强制新 ref）；测试断言「requires a new Credential for upstream boundary change」 |
| 8 | 未新增 migration 24 | ✅ 沿用 migration 23 六表，未新增 migration 24 |
| 9 | 测试断言真实性 | ✅ 反查无空断言/`it.skip`；覆盖 create 幂等、Secret 不进 durable、identity conflict、display-name inspect-only + carry_forward、upstream 变化要求新 Credential、U3 保守保留旧 Credential、D1 usage unknown 不删除、状态 3 保留 delete 主权 |
| 10 | 边界零漂移 | ✅ 本批改动 = services/core/src/application（coordinator）+ tests；未进 Reveal/Provider/Task lock/Agent Loop/Preload/Renderer；未改 Central/Document Worker/migration 1-23；`pnpm-lock.yaml` 保持 Aug 16 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-4A.2.2 正确完成 CRUD Coordinator 与 Durable Recovery：`prepare()`（safe，不接 Secret，写 Transaction A）与
`executePrepared()`（sensitive，接 Secret，Transaction B）两阶段分离；identity + Secret presence 匹配；
C1～C4/U1～U3/D1～D3 恢复按 durable intent + `inspect()` + binding proof 分类收敛；delete 先
`deletionGuard` 评估、usage unknown 时保守失败关闭；`credentialMutation` 区分 `reuse_existing` 与
`replace_secret`（上游边界变化强制新 Credential）；Secret 不进 request digest/SQLite/日志/公共 IPC，每处
`fill(0)`。四项门禁独立串行复跑全绿（专项 5/44、完整 check 214/1430 + 3 smoke、Central online/offline
302/302）。边界零漂移：未新增 migration 24，未进 Reveal/Provider/Task lock/Agent Loop/Preload/Renderer，
`pnpm-lock.yaml` 保持 Aug 16。

**DFI-4A.2.2 可进入用户接受流程。DFI-4A.2.3、DFI-4A.3/4A.4、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
