# AAPI-0.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-24-2230-version-aapi.0.1` |
| 验收对象 | AAPI-0.1：Admin Control Contract package / TS-only |
| 日期 | 2026-08-24 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 |
| 开发版本 | Root / Contracts `0.0.0-aapi.0.1` |
| 上游 | DFI-3A.1 `PASS/CLOSED`；cross-consumer alignment v1 已确认 |

---

## 一、门禁复跑结果

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm exec vitest run packages/contracts/tests/admin-control-v1alpha1-contracts.test.ts packages/contracts/tests/desktop-local-v1alpha2-catalog-contracts.test.ts services/core/tests/catalog-query-service.test.ts` | **PASS 3 files / 16 tests** |
| 2 | `CI=true pnpm run check`（root） | **PASS 243 files / 1619 tests + 3 smoke + Architecture boundary**（242→243、1613→1619 恰为 AAPI-0.1 新增 1 file / 6 tests） |
| 3 | `CI=true pnpm install --frozen-lockfile` | **PASS**（lockfile 未变） |

Central online/offline 未复跑：本批为 TS-only Contract package，未触碰 Central（边界核查确认 `services/central-service/**` 零改动）；上一批 DFI-3A.1 时 Central 391/391 已全绿。

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | TS-only 边界 | ✅ 13 个 TS 文件全在 `packages/contracts/src/admin-control/**`；**无 Central Java mirror**（grep 无 admin-control Java）；未改 Desktop/Core/Central/Main/Preload/IPC/migration/lockfile |
| 2 | envelope identity flags | ✅ 测试「keeps envelope identity flags strict and does not let test identity claim production readiness」——`testIdentityUsed=true` 时不得 `productionIdentityReady=true` |
| 3 | typed safe error + HTTP 映射 | ✅ 测试覆盖 fixed HTTP status 映射；未知错误只回 safeSummary |
| 4 | cursor/CAS/Receipt shape | ✅ 测试「freezes opaque cursor, expectedRevision and Receipt shape without opening mutation semantics」——只冻结形状不开放 mutation |
| 5 | module projection 敏感排除 | ✅ 测试「keeps module projections strict and excludes credential, endpoint and provider internals」 |
| 6 | cross-consumer 对齐 | ✅ 测试「aligns Robot and Tool common semantics with the cross-consumer canonical fixture」——Admin-side fixture 与 Desktop fixture 的 stable identity/exact revision/三态/readOnly/risk 对齐 |
| 7 | 测试断言真实性 | ✅ 6 个 it 均实读 schema/fixture 断言，无 skip/空断言 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

AAPI-0.1 正确完成 Admin Control Contract package / TS-only：`admin-control.v1alpha1` TS family（envelope/
typed error/opaque cursor/pagination/CAS/Receipt shape + Capability/Model/Robot/Skill/Tool/Knowledge/System
七个模块 projection schema）；test/prod identity flag 组合约束；Admin-side Robot/Tool cross-consumer fixture
与 Desktop fixture 共同语义对齐（不共享 DTO）；无 Central Java mirror、未开 mutation、未碰
Desktop/Core/Central/lockfile。门禁独立复跑全绿（focused 3/16、root check 243/1619 + 3 smoke + boundary、
frozen install）。

**AAPI-0.1 可进入用户接受流程；接受后不自动解锁 AAPI-0.2～0.4、AdminAdapter/AFE consumption、TGM、
Knowledge Provider 或 production identity。DFI-3A.2、DFI-5（Max）与全部后端下游保持 GATED。**

— Claude Code（独立 QA，只读）

---

## 附：收口增量复核（2026-08-24 第二轮）

收口后增量核实：

- **Admin-side fixture**（`fixtures/admin-control/v1alpha1/catalog-alignment-admin.json`）：与 Desktop
  cross-consumer fixture 共享共同语义（robotId/toolId、displayName/description、四类限制三态、readOnly/
  riskSummary、publishedRobotRevision 与 desktop fixture 的 exact revision 映射值一致）；Admin-only 字段
  （source/lifecycle/policyState/connectionState/credentialStatus/healthState 全部 unavailable）未泄漏到
  Desktop fixture ✅；
- **Subpath export 真实可用**：`@robothree/contracts/admin-control/v1alpha1` 从 contracts 包内解析成功
  （59 个导出）；`dist/admin-control/v1alpha1/index.js` 存在；
- 独立复跑：contracts build ✅、AAPI focused 6 tests ✅、lockfile 仍 `b7c6d0a7…` ✅；
- Central online/offline 本轮未复跑（环境无 JDK 21 + 本批 TS-only 未碰 Central/Java/migration；上一批
  DFI-3A.1 时 Central 391/391 已全绿），如实记录为未复跑而非通过。

新增 P3-1（不阻断）：focused 测试 import 用相对路径（`../src/index.js`），subpath export 的解析未进入
测试自动覆盖（仅靠手动 smoke）；若未来 exports 配置损坏，focused 测试不会发现。建议后续在 contracts
测试中增加一个 subpath 解析断言。

最终结论不变：**PASS（P0=0、P1=0、P2=0、P3=1）**，AAPI-0.1 可进入用户接受流程。

— Claude Code（独立 QA，只读）
