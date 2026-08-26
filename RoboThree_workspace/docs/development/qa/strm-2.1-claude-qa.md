# STRM-2.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-23-0030-version-strm.2.1` |
| 验收对象 | STRM-2.1：Control Contract 与 Electron Lifecycle Wiring |
| 日期 | 2026-08-23 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root / Contracts / Desktop `0.0.0-strm.2.1`；Core/Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:strm2.1` | **PASS**：private Contract/lifecycle **4 files / 31 tests** + 真实 Electron **5 scenarios**（production_disabled / ready_cancel / hash_navigation / renderer_crash / foreign_window）+ STRM-0 Route A **14-run** 回归；`outcome=STRM21_CONTROL_LIFECYCLE_CONFORMANT`；敏感命中 0；八类资源归零 |
| 2 | `CI=true pnpm run check`（完整） | **PASS 234 files / 1558 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 307/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 307/0/0/0 / BUILD SUCCESS** |

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | Control Contract strict | ✅ [control.ts](packages/contracts/src/desktop-private/personal-credential-transport-v1/control.ts) `controlType = ready\|terminal_ack\|cancel`、`terminal = completed\|rejected\|cancelled\|timed_out\|uncertain`；terminal/error 严格组合校验（completed 禁 error、非 completed 必带对应 typed code、cancelled/timed_out/uncertain/rejected 各自锁定专属 code） |
| 2 | control 不含业务/Secret | ✅ `PersonalCredentialTransportControlMaterialSchema` 字段仅 protocol/profile/commandId/correlationId/controlType/terminal/typedErrorCode；测试断言 canonical 串不含 secret/credentialRef/ownerScopeDigest/endpoint/receipt |
| 3 | Port Offer exact-ticket-bound | ✅ `PortOfferSchema` superRefine 强制 readyControl/cancelControl 的 commandId/correlationId/profile 与 ticket 精确一致 |
| 4 | PreparedCommand Main-private | ✅ 字段仅 runtime/client/command/correlation/operationType/modelId/configuration/executionDigest?/requestDigest/deadline，**无 owner/entitlement/credentialRef/Endpoint/helper**；reveal 强制 executionDigest、mutation 禁止携带 |
| 5 | Main controller 不读业务事实 | ✅ [personal-credential-transport-controller.ts](apps/desktop/src/main/personal-credential-transport-controller.ts) 只做 identity 派生 + Ticket/port/terminal；不读 owner/entitlement/credentialRef/Endpoint/helper，不调 Keychain，不生成业务 Receipt |
| 6 | exact identity 由 Main 派生 | ✅ 从 `event.sender.id` + `senderFrame.routingId` + registration.epoch 派生，校验 `senderFrame === sender.mainFrame`；不接受 Renderer 自报 |
| 7 | STRM-2.1 无业务成功路径 | ✅ `#settle` 参数类型为 `Exclude<terminal, "completed">`，本批**无法产出 completed**；`terminal_ack` 在 `#handleControl` 中被显式 reject（STRM-2.2 才消费）；无 Broker dispatch、无 fd4/fd5 调用 |
| 8 | production entry 装配但关闭 | ✅ [main/index.ts](apps/desktop/src/main/index.ts) `foundationEnabled:false` + `attachWebContents`；[preload/index.ts](apps/desktop/src/preload/index.ts) `foundationEnabled:false` + `start()` + unload `close()`；**无 `ipcMain.handle` 可达 `openPreparedCommand`**（该 seam 仅 tests/Harness 调用），无 contextBridge 业务 API |
| 9 | Preload 不依赖 WebCrypto | ✅ Preload 只回送 Main 预签发的 ready/cancel control，不验证 control digest、不自造 crypto；Main 回送时重算 digest + `timingSafeEqual` constant-time 校验。本批仅限 non-secret lifecycle control，诚实记录（见 §三） |
| 10 | 资源清理 | ✅ 5 场景后 window/port/timer/ipc listener/request/registry/child/helper 全 0；`#closeSession` 清 timer、卸 listener、关 port；navigation/destroy/shutdown 统一 invalidate |
| 11 | 测试断言真实性 | ✅ 反查无 `.skip`/`.only`/`todo`/`xit`、无空断言/恒真断言；`toBe(true/false)` 均为实质断言；test「keeps the production Preload receiver private」直接读生产 entry 源码断言 `foundationEnabled:false` + 无 `exposeInMainWorld` credential API + Renderer boundary 不导入 receiver |
| 12 | 边界零漂移 | ✅ 改动 = `packages/contracts/src/desktop-private/personal-credential-transport-v1/**` + `apps/desktop/src/main`（index/controller/transport）+ `apps/desktop/src/preload`（index/receiver/transport）+ 专项 tests/Harness；未改 Core/Central/Document Worker/Renderer/migration；`pnpm-lock.yaml` 保持 Aug 16；migrations 最大 id 仍 24、无 migration 25 |

---

## 三、一处诚实设计注记（非缺陷）

STRM-2.1 发现 sandboxed Preload 不能把 `globalThis.crypto.subtle` 当作稳定可用能力。本批的取舍是：
Preload **不验证** control digest、只回送 Main 预签发的 ready/cancel control；digest 由 Main 在回收时重算并
constant-time 校验。这只适用于 **non-secret lifecycle control**，逻辑上等价于「one-shot MessagePort 是能力
边界，Main 是唯一签发/校验方」。

方案与报告均显式标注：**STRM-2.2 的 Secret frame digest 不得继承这一放宽**，必须沿用已评审的 Main-issued
non-secret proof 或另行提交替代设计，禁止编码时静默自造 crypto 或弱化 Secret frame 校验。此为正确的跨批
依赖警告，不是本批缺陷。

---

## 四、发现

### STRM-2.1 本批范围：P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

STRM-2.1 正确完成 Control/Lifecycle Wiring：private Contract additive 冻结 strict control/terminal/error 组合
与 Main-private PreparedCommand（不含 owner/entitlement/credentialRef/Endpoint/helper）；production Main
controller 从真实 event 派生 exact webContents/main-frame/navigation epoch、管理 one-shot MessagePort/deadline/
navigation/crash/destroy/shutdown，本批无法产出 `completed`、显式拒绝 `terminal_ack`（无 Broker dispatch）；
production Preload internal receiver 私有、不注册 contextBridge 业务 API；production entry 装配但
`foundationEnabled=false`、无 public IPC 可达 prepared-command seam。Harness 独立复跑 PASS（4 files / 31 tests
+ 5 Electron scenarios + STRM-0 14-run 回归）、完整 check 234/1558 + 3 smoke、Central online/offline 307/307
全绿。边界零漂移：仅改 desktop-private Contract + Main/Preload + tests/Harness，未改 Core/Central/Document
Worker/Renderer/migration，`pnpm-lock.yaml` 保持 Aug 16。

**STRM-2.1 可进入用户接受流程；接受后 STRM-2.2（Broker Dispatch 与 Directional Closure）仍需单独提交
方案/差异复核并获得用户明确编码授权，不由本批自动解锁。STRM-2.3、STRM-3、EIPC-1～3、DFI-4A.4.1～4A.4.3、
DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
