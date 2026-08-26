# STRM-0 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-22-2025-version-strm.0` |
| 验收对象 | STRM-0：Sensitive Renderer↔Main Transport Decision Spike（路线 A） |
| 日期 | 2026-08-22 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root `0.0.0-strm.0`；Core/Desktop/Contracts `0.0.0-eipc.0`；Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:strm0` | **PASS**：evidence 1 file / 5 tests + 真实 Electron **14 runs / 12 scenarios / 3 roundtrip replays**；`outcome=ROUTE_A_ACCEPTABLE`；四通道泄漏 0；80 次负向注入；八类资源归零 |
| 2 | `CI=true pnpm run check`（完整） | **PASS 230 files / 1527 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 307/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS BUILD SUCCESS（307 tests）** |

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 唯一路线决策 ROUTE_A_ACCEPTABLE | ✅ Harness 输出 `ROUTE_A_ACCEPTABLE`，只表示路线 A 满足进入 STRM-1 的技术门槛 |
| 2 | 不输出 SENSITIVE_TRANSPORT_READY | ✅ `productionSensitiveTransportReady:false` + `electronMessagePortBlockerClosed:false`，不关闭 blocker、不宣布 feature ready |
| 3 | structured-clone 双向交付 | ✅ mutation/reveal 双向交付成立，3 次 fresh Electron process roundtrip 重放 |
| 4 | 副本下界 2 + 诚实 | ✅ `observableApplicationCopyLowerBound:2` + `zeroCopyClaimed:false` + `structuredCloneInternalCopiesReliablyClearable:false` + `residualRiskRequiresExplicitAcceptance:true`——安全主张是「有界交付 + 最小暴露 + 可控对象清零」，不是 zero-copy、不是全内存清零证明 |
| 5 | 负向 fail-closed | ✅ 14 runs / 12 场景：foreign window 拒绝不取得 port、wrong identity 消费前拒绝、duplicate frame 单 winner、wrong brand/zero/max/max+1 length、navigation invalidation、Renderer crash、port close、deadline；terminal 后不重放 Secret、不启用 A/B/C runtime fallback |
| 6 | identity 由 Main 派生 | ✅ identity 由 Main 从真实 IPC event 派生 webContentsId + main-frame routing identity，不接受 Renderer 自报 |
| 7 | 泄漏与资源 | ✅ 四通道（parent stdout / child stderr / machine evidence / safe trace）match 全 0；80 次负向注入全部捕获；八类资源（window/port/timer/ipc listener/request/registry/child/helper）全 0 |
| 8 | 测试断言真实性 | ✅ 反查无空断言/`it.skip`；evidence 测试覆盖 4 通道+5 marker+80 负向、四通道全 0、digest 规范化、生产代码不含 Spike 痕迹、无 forbidden Secret fallback（Base64/hex/argv/env/file） |
| 9 | 边界零漂移 | ✅ 改动 = `scripts/run-strm0-harness.mjs` + `run-strm0-route-a-electron.mjs` + `strm0-evidence.mjs` + `strm0-route-a-preload.cjs`；未改生产 Main/Preload/Renderer/Core/Central；未新增 Contract/migration/依赖/生产接口；`pnpm-lock.yaml` 保持 Aug 16 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

STRM-0 正确完成 Sensitive Transport Decision Spike：路线 A（one-shot MessagePort + bounded structured-clone
`Uint8Array`）在 Electron 43.2.0 当前基线上双向交付成立，14 次真实 Electron 运行 / 12 场景 / 3 次 roundtrip 重放；
应用层可观察副本下界 2，`zeroCopyClaimed=false`、`structuredCloneInternalCopiesReliablyClearable=false`，诚实承认
结构化克隆内部副本不可可靠清零、残余风险需用户显式接受；负向矩阵完整（foreign window / wrong identity /
duplicate / brand / length / navigation / crash / port close / deadline 均 fail-closed）；四通道泄漏 0 + 80 次负向
注入 + 八类资源归零。唯一结论 `ROUTE_A_ACCEPTABLE`，**不输出 SENSITIVE_TRANSPORT_READY、不关闭
BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER**。四项门禁独立串行复跑全绿（Harness、完整 check 230/1527 +
3 smoke、Central online/offline 307/307）。边界零漂移：仅改 scripts Harness/fixture，未改生产代码，
`pnpm-lock.yaml` 保持 Aug 16。

**STRM-0 可进入用户接受流程；接受后单独授权 STRM-1。STRM-1～STRM-3、EIPC-1～EIPC-3、DFI-4A.4.1～4A.4.3、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
