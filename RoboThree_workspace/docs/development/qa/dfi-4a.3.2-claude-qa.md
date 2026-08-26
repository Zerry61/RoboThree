# DFI-4A.3.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-22-1107-version-dfi-4a.3.2` |
| 验收对象 | DFI-4A.3.2：Unified Selection + Exact Task Lock + Composite Resolver |
| 日期 | 2026-08-22 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core/Contracts `0.0.0-dfi.4a.3.2`；Desktop `0.0.0-dfe.6b`；Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFI-4A.3.2 Harness（personal-lock/unified-selection/usage-guard/runtime-selection/task-persistence/provider 6 个测试文件） | **PASS 6 files / 69 tests** |
| 2 | `CI=true pnpm run check`（完整） | **PASS 223 files / 1475 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 302/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS BUILD SUCCESS（302 tests）** |

---

## 二、重点核查项（方案 G1-G6 + 选模 + 精确锁）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 统一候选 + 确定性选模 | ✅ [unified-model-selection.ts](services/core/src/application/unified-model-selection.ts) `CompositeTrustedModelCatalog` 候选按 modelId 排序；`ModelSelectionIntentResolver` selectionSource 四类（explicit/user_preference/agent_default/enterprise_first） |
| 2 | context window unknown 不伪造 | ✅ 个人模型 `contextWindow: { state: "unknown" }`（200 行）；测试断言「fails closed for unknown context window when a minimum is required」→ `model.context_window_unknown`；lock 的 `contextWindow` 为 undefined（不填假值） |
| 3 | requestedModelId 不静默改偏好 | ✅ explicit 选择 `selection(candidate, "explicit")` 无 preference 写动作；测试断言「keeps explicit selection Task-scoped and never turns it into a preference write」 |
| 4 | 标准 TaskCapabilityLock + pmcfg1 精确锁 | ✅ [personal-model-task-lock.ts](services/core/src/application/personal-model-task-lock.ts) `pmcfg1:` configurationRef 编码 executionDefinitionDigest（`writeDigest`/`readDigest`），capabilityRevision/adapterDescriptorRevision 绑定 exact definition/descriptor |
| 5 | 共享 Task bundle registryRevision | ✅ materializer 的 `registryRevision: input.registryRevision`（220 行）；测试断言 `lock.registryRevision === digest("a")` + `validateTaskCapabilityLockRevisions(lock)` 通过 |
| 6 | Composite Resolver 不 fallback | ✅ `CompositeTrustedModelCatalog` + `CompositeModelTaskLockPlanner` 依赖必须 atomically installed（runtime-selection-service 106-107 行）；不按 modelId 猜测来源、不静默 fallback |
| 7 | 非终态 Task 删除 + Credential cleanup usage guard | ✅ [personal-model-task-usage-guard.ts](services/core/src/adapters/personal-model-task-usage-guard.ts) 测试断言「blocks delete and Credential cleanup for an exact nonterminal personal lock」+「unknown for truncated/corrupt facts」 |
| 8 | 安全候选不含敏感字段 | ✅ 测试断言 candidate 序列化不含 canonicalEndpoint/providerModelId/credentialRef/ownerScopeDigest |
| 9 | 测试断言真实性 | ✅ 反查无空断言/`it.skip`；覆盖 explicit 不写偏好、durable preference revision 匹配、stale preference 不改写、Central 顺序 + explicit_selection_required、跨 authority 歧义、非终态 lock 阻止 delete |
| 10 | 边界零漂移 | ✅ 本批改动 = `services/core/src/application`（unified-selection/task-lock/composite-runtime）+ `adapters`（usage-guard/task-persistence 双实现）+ `ports/task-persistence`；未进 Agent Loop、Desktop API、DFI-4A.3.3；`pnpm-lock.yaml` 保持 Aug 16 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-4A.3.2 正确完成 Unified Selection + Exact Task Lock + Composite Resolver：企业/个人统一候选 +
确定性选模（selectionSource 四类）；个人模型 context window 保持 unknown、有 minimum 要求时 fail-closed；
`requestedModelId` 只证明本 Task 请求、不静默写长期偏好；个人模型物化为标准 `TaskCapabilityLock`
（`pmcfg1:` configurationRef 精确版本锁），`registryRevision` 复用 Task bundle 已锁定的企业 Snapshot
revision（不建第二套 generation）；lock-bound Composite Resolver 不按 modelId 猜测来源、不静默 fallback；
非终态 Task 的删除与 Credential cleanup 由 usage guard 保守失败关闭。四项门禁独立串行复跑全绿（Harness
6/69、完整 check 223/1475 + 3 smoke、Central online/offline 302/302）。边界零漂移：未进 Agent Loop、
Desktop API、DFI-4A.3.3，`pnpm-lock.yaml` 保持 Aug 16。

**DFI-4A.3.2 可进入用户接受流程。DFI-4A.3.3、DFI-4A.4、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
