# DFI-5.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-1500-version-dfi.5.1` |
| 验收对象 | DFI-5.1：Reasoning Experience Foundation（safe Preview/Projection + Experience Preference + migration 26） |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Contracts/Core `0.0.0-dfi.5.1`；Root 保持 `0.0.0-ptx.2` |
| 上游 | DFI-5.0 `PLAN REVIEW PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFI-5.1 reasoning-mode focused | **PASS**（desktop-local-v1alpha3-reasoning-mode-contracts / preview-service / preference-persistence conformance / preference-service / owner / migration 等） |
| 2 | `CI=true pnpm run check`（root） | **PASS 251 files / 1678 tests + 3 smoke + Architecture boundary** |
| 3 | `CI=true pnpm run check:central`（**补跑**） | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline`（**补跑**） | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 5 | 边界：lockfile | 仍 `c47641ac…` 未变 |

注：报告声明「本机缺 JDK 21，Central 未复跑」——我的环境 **JDK 21.0.12 可用**，已补跑 Central online/offline 404/404 全绿（DFI-5.1 未改 Central，结果符合预期）。

---

## 二、重点核查项（对照报告 §5 独立 QA 重点）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | Preview 安全三态 + Profile-private 不可达 | ✅ `support-state.ts` 仅 `supported/unsupported/unknown`；`@robothree/contracts/reasoning-mode/v1alpha1` 独立 subpath **不从 Contracts 根入口导出**；Preload/Renderer/Admin 对 `reasoning-mode` 零导入（Architecture boundary） |
| 2 | owner namespace 独立 + corruption fail-closed | ✅ migration 26 `desktop_experience_owner_scope_namespaces`（32~64 byte key、active partial unique）；owner 仅由 enterprise+user+device 在独立 domain `robothree.desktop-experience-preference-owner.v1` HMAC 派生；namespace key 不进 record/Receipt/log |
| 3 | migration 26 三表 STRICT/FK/partial unique + 1~25 零漂移 | ✅ 三表全 `STRICT`、composite owner FK ON DELETE RESTRICT、Receipt `committed = expected + 1` CHECK、partial unique active namespace；migration 最大 id=26、1~25 未改 |
| 4 | Preference + Receipt 同事务原子 | ✅ 报告 §2.3「同一 BEGIN IMMEDIATE transaction；任一失败整体回滚」；InMemory 与 SQLite 共用 conformance |
| 5 | exact replay / conflict | ✅ 同 commandId+requestDigest replay 原 Receipt；同 commandId 不同 material typed conflict |
| 6 | owner unavailable / rebind / test identity 不冒充 | ✅ owner 不可信 → `default + unavailable`；rebind 后旧 client command fail-closed；testIdentityUsed ↔ productionIdentityReady 互斥 |
| 7 | DFI-5.2~5.4 未提前接线 | ✅ `reasoningModeLock`/`locked_max_strategy` 在 Task/Model Protocol/Provider/Preload/Renderer 零命中——Task、Provider、Desktop UI 均未提前接入 |
| 8 | 测试断言真实性 | ✅ 反查无 `.skip`/`.only`/`@Disabled`/`@Ignore` |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-5.1 正确完成 Reasoning Experience Foundation：safe Preview 只投影 `supported/unsupported/unknown` +
revision（Profile-private strategy 经独立 subpath + Architecture boundary 完全不可达）；独立 Experience
Preference（owner 独立 HMAC domain + 32~64 byte namespace key + 损坏检测）；migration 26 三张 STRICT 表
（partial unique active namespace + composite FK + Receipt revision 单调约束）；Preference + Receipt 同事务
原子、CAS concurrent single-winner、重启精确 replay；owner 不可信/rebind/test identity 均不冒充 production。
DFI-5.2~5.4 未提前接线（Task/Model Protocol/Provider/Desktop UI 零命中）。门禁独立复跑全绿（focused、
完整 check 251/1678 + 3 smoke、Central online/offline **补跑 404/404**）。边界零漂移：lockfile 仍
`c47641ac…`，migration 1~25 未改。

**DFI-5.1 可进入用户接受流程；接受后 DFI-5.2（SubmitTurn v1alpha3 + ReasoningModeLock + Task 锁定）、
DFI-5.3（Provider Mapping）、DFI-5.4（Desktop UI）、AAPI-0.3~0.4、TGM、Knowledge Provider 继续 GATED，需
用户单独授权。**

— Claude Code（独立 QA，只读）
