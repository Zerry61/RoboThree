# DFI-5.2.3 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-1900-version-dfi.5.2.3` |
| 验收对象 | DFI-5.2.3：ModelRequest / Compaction Binding v1alpha2 / Lifecycle Harness |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Contracts/Core `0.0.0-dfi.5.2.3`；Root/Desktop 保持 PTX-4 基线 |
| 上游 | DFI-5.2.1、DFI-5.2.2 `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:dfi5.2.3` | **PASS 11 files / 111 tests** |
| 2 | `CI=true pnpm run check`（root） | **PASS 258 files / 1723 tests + 3 smoke + Architecture boundary** |
| 3 | `CI=true pnpm run check:central` | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 5 | `CI=true pnpm run audit:dtp4` | **PASS** |
| 6 | 边界：lockfile / migration | 仍 `c47641ac…` 未变；migration 仍止 26 无 27 |

---

## 二、重点核查项（对照方案 + 我 QA 盯的三处）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | **receipt 原子 finalizer** | ✅ [task-reasoning-request-materializer.ts](services/core/src/application/task-reasoning-request-materializer.ts) `finalize()` 返回 `receipt: { ...input.receipt, modelRequestDigest: request.requestDigest }`——final receipt digest **精确等于** v2 request digest（方案 §2.5 G3 缺口正确关闭） |
| 2 | **v2 唯一 digest 公式** | ✅ [model-request-revisions.ts](services/core/src/application/model-request-revisions.ts) v1alpha2 digest = `sha256CanonicalJson(完整 parsed material)`（含 schemaVersion + reasoning），validate 时重算比对；不拼旧摘要字符串 |
| 3 | **唯一 Materializer** | ✅ main/Tool continuation/Compaction 共用 `TaskReasoningRequestMaterializer`；finalizer 只叠加 receipt 不复制 variant 判断 |
| 4 | **Provider 零上游** | ✅ [durable-local-personal-model-provider.ts](services/core/src/application/durable-local-personal-model-provider.ts) `requireLegacyModelRequestForUnmappedProvider(candidate)` 在「durable invocation preparation, credential resolution or any upstream I/O」之前拒绝 v1alpha2——typed `reasoning_protocol_unavailable`，非 schema parse error 冒充 |
| 5 | Compaction Binding v1alpha2 收窄 | ✅ additive binding 绑 Reasoning lock id/digest + protocol v1alpha2；只收窄 Compaction 调用参数身份不扩张 main authorization；InMemory/SQLite 共用 readable validator |
| 6 | executable bundle 单次 dispatch | ✅ 按 durable schemaVersion 单次 strict load；损坏 v2 不 fallback v1；历史 v1 legacy loader 读取 |
| 7 | 真实进程 Harness | ✅ 50-round Tool Loop/Compaction（51 次 v1alpha2 全复用同一 lock）+ Core child + SQLite reopen + SIGKILL 新 PID + deterministic barriers + 三轮 semantic digest 一致 |
| 8 | 未越界 | ✅ 未进 Provider raw mapping（`effort_level`/`thinking`/`strategyRef` 零命中）/Desktop/Admin；migration 仍 26 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-5.2.3 正确完成 ModelRequest / Compaction Binding v1alpha2 / Lifecycle Harness：ModelRequest v1alpha2
唯一 digest（schemaVersion + reasoning 进完整 canonical material）；Request + Context Receipt 原子 finalize
（final receipt digest 精确等于 v2 request digest）；main/Tool continuation/Compaction 复用同一
ReasoningModeLock（单一 materializer，不复制 variant 判断）；Compaction Binding v1alpha2 只收窄不扩张授权；
未映射 Provider 在 Credential resolve/DNS/socket/TLS/HTTP body/upstream 前返回 typed
`reasoning_protocol_unavailable`（非 schema parse error 冒充）；真实 Core child + SQLite reopen + SIGKILL +
deterministic barriers + 三轮语义重放 Harness；历史 v1 行为兼容。门禁独立复跑全绿（harness 11/111、完整
check 258/1723 + 3 smoke、Central online/offline 404/404、audit:dtp4）。边界零漂移：lockfile 未变、migration
仍止 26、未进 Provider raw mapping/Desktop/Admin。

**DFI-5.2.3 可进入用户接受流程；接受后 DFI-5.2 阶段整体关闭。DFI-5.3（Provider Mapping，第一次碰真实 Max
参数）、DFI-5.4（Desktop UI）、AAPI-0.3~0.4、TGM、Knowledge Provider 继续 GATED，需用户单独授权。**

— Claude Code（独立 QA，只读）
