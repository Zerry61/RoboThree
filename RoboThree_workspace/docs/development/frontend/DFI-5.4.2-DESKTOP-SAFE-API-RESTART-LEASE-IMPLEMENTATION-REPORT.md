# DFI-5.4.2 Desktop v1alpha5 Safe API / Restart Lease 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-28  
> 实施者：Codex 5.6  
> 计划：[DFI-5.4.2 详细实施方案](./DFI-5.4.2-DESKTOP-SAFE-API-RESTART-LEASE-DEVELOPMENT-PLAN.md)  
> 本批最高结论：`DFI542_DESKTOP_SAFE_API_CUTOVER_CONFORMANT`

> User acceptance（2026-08-28）：独立 QA 精度收口后 P0～P3 全 0，用户已正式接受并关闭 DFI-5.4.2。
> 本报告中的 conformance 只覆盖 Safe API / Restart Lease，不代表 Renderer Max UI 或 production Max ready。

## 1. 实施结论

DFI-5.4.2 已把 DFI-5.4.1 的 Max Core 能力安全送达 Desktop sandbox 边界：Core private HTTP、Main client、
Main IPC router 与 frozen Preload API 现在形成独立 Desktop Local v1alpha5 六方法链。每次业务调用只捕获一次
Core connection lease，并在返回 Renderer 前校验 runtime generation；Core 重启后，旧协商只能得到 typed
`reasoning.runtime_changed`，必须重新 compatibility negotiation。

本批没有创建 Renderer consumer 或 Max UI，也没有打开 production Max。六条 route 与六个 IPC channel 已安装，
但 production compatibility 仍返回 `production_gate_disabled`，全部业务调用 fail-closed。production installed
subject release 仍为 0；DFI-5.4.3 与其他下游继续 `GATED`。

## 2. 关键实现

### 2.1 Safe Contract 与 Core API

- v1alpha5 additive 补齐严格的 preference safe projection，只投影 requested mode、revision、persistence 与
  test/production identity readiness；owner/HMAC/Profile/Strategy/raw mapping 不进入 projection；
- Core facade 新增 compatibility、Preview、Preference get/update、SubmitTurn 与 status query 六个入口；
- Core private HTTP server 新增六条 exact route，继续要求 exact Host、Origin 与 Bearer，并分别限制 16 KiB
  control body、160 KiB SubmitTurn body与 bounded response；
- disabled graph 的 compatibility 诚实返回 unavailable，其他调用在 Preview/Preference/Planner/Provider 前
  typed fail-closed；enabled incomplete graph 在 composition 时 fail-fast。

### 2.2 Main restart lease 与 Preload

- `CorePrivateClient` 新增六个 exact v1alpha5 methods，严格解析 success/error envelope，使用 bounded timeout；
- Main router 使用 Renderer 原始 UUID 绑定 webContents，跨窗口复用拒绝、最多 16 个 binding、无 LRU 驱逐；
- compatibility 成功后记录 negotiated runtime instance；业务调用捕获单一 lease，调用后用同一 lease 做 current
  revalidation，禁止中途重新 resolve Core；
- navigation、render-process-gone、destroyed 与 window close 都清理 binding；
- Preload 暴露 frozen `window.robothreeDesktopV1Alpha5` 六方法 allowlist，Renderer 不接触 `ipcRenderer`、
  Core URL/token 或 transport channel string。

### 2.3 历史与边界迁移

- v1alpha4 三方法 Contract/API source byte-for-byte 不变；
- DFI-5.4.1 historical Evidence 文件与内层 digest 只读不漂移；
- DFI-5.4.1 的旧时点 boundary test 只收窄为 Renderer/Admin/Central/Document Worker 禁入，允许本批已授权的
  Desktop Main/Preload transition，不改 historical Evidence；
- Renderer v1alpha5 consumer count=0、Desktop Max UI=false、DFI-5.4.3 未解锁。

## 3. 主要文件

### Contract / Core

- `packages/contracts/src/desktop-local/v1alpha5/{reasoning-mode,error,submit-turn}.ts`
- `services/core/src/application/{desktop-application-facade,submit-turn-coordinator,reasoning-mode-preference-service}.ts`
- `services/core/src/adapters/http/core-private-http-server.ts`
- `services/core/src/bootstrap/create-desktop-private-runtime.ts`

### Desktop Main / Preload

- `apps/desktop/src/main/{core-private-client,desktop-v1alpha5-ipc-router,index}.ts`
- `apps/desktop/src/shared/foundation-api.ts`
- `apps/desktop/src/preload/{create-desktop-api,index}.ts`

### Test / Harness / Evidence

- `packages/contracts/tests/dfi5.4.2-desktop-safe-api-contracts.test.ts`
- `services/core/tests/dfi5.4.2-{safe-api,boundary}.test.ts`
- `apps/desktop/tests/{create-desktop-api-v1alpha5,desktop-v1alpha5-ipc-router}.test.ts`
- `scripts/run-dfi5.4.2-harness.mjs`
- `artifacts/dfi542/evidence.json`

## 4. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `pnpm run harness:dfi5.4.2` | **PASS 5 files / 21 tests** |
| `pnpm --filter @robothree/desktop build` | **PASS** |
| `pnpm run typecheck` | **PASS** |
| `pnpm run lint` | **PASS + Architecture boundary** |
| `pnpm run audit:dtp4` | **PASS** |
| `pnpm run check` | **PASS 318 files / 2143 tests + 3 smoke + Architecture boundary** |
| `pnpm run check:central` | **PASS 438 / 0 / 0 / 0 — BUILD SUCCESS** |
| `pnpm run check:central:offline` | **PASS 438 / 0 / 0 / 0 — BUILD SUCCESS** |

受限 sandbox 首次 root check 因 `listen EPERM 127.0.0.1` 与隔离 Keychain 权限产生环境伪失败；同一命令在项目
正式 Node 24.13.0、JDK 21.0.12 与正常本机权限下从零复跑后全部通过。未为环境差异增加 fallback 或放宽测试。

## 5. Evidence 与冻结基线

- outcome：`DFI542_DESKTOP_SAFE_API_CUTOVER_CONFORMANT`
- focused QA matrix：96 项连续唯一
- evidence digest：`sha256:e0abc2a01e1192e59be9afc91fe0b701909bc794d86f82f8ef2504ecb685a8d8`
- exact Core route / IPC channel / Preload API method：6 / 6 / 6
- negative leak injection detection：80；normal four-channel leak count：0
- DFI-5.4.1 historical evidence digest：`sha256:165d1544a66ed12578271b490767fc5be1d513c2324355adf4da6a74e9735ed4`
- migration max：26
- `pnpm-lock.yaml`：`sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`
- Root/Core/Contracts/Desktop：`0.0.0-dfi.5.4.2`；Admin：`0.0.0-afe.6c`
- 本批未新增依赖，lockfile digest 未改变。

## 6. 当前状态与下一步

```text
DFI-5.4.2  PASS/CLOSED
DFI-5.4.3  DOCUMENT REVIEW PENDING / CODING GATED
```

独立 QA 与用户接受已经完成。本批关闭不自动授权 DFI-5.4.3 编码，也不得把 route/API installed 解释为
production Max ready；下一步仅进入 DFI-5.4.3 独立文档复核。
