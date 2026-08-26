# DFI-4A.0-repair.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-20-2325-version-dfi-4a.0-repair.1` |
| 验收对象 | DFI-4A.0 repair.1：修复 Preflight 五项证据缺口（越界隔离后最终版） |
| 日期 | 2026-08-20 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 |
| 开发版本 | Docs+scripts only：未升级生产版本 |

> 环境说明：`preflight:dfi4a0` 在本 QA shell 内真实执行通过（真实临时 Keychain、xcrun clang 编译、
> node:https TLS、IPC fork）；check 无 loopback EPERM。Central online/offline 按 repair.1 计划 §11 正式门禁补跑
> （JDK 21 + Docker；首次因 prettier 扰动残留触发 depsStatusCheck install 失败，`pnpm install --frozen-lockfile`
> 恢复后重跑通过）。

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run preflight:dfi4a0` | **PASS**（evidence 完整） |
| 2 | `CI=true pnpm run lint`（eslint + Architecture boundary） | **PASS**，`Architecture boundary checks passed` |
| 3 | `CI=true pnpm run check`（完整） | **PASS 201 files / 1318 tests + 3 smoke 全绿** |
| 4 | `CI=true pnpm run check:central` | **PASS 302/0/0/0 / BUILD SUCCESS** |
| 5 | `CI=true pnpm run check:central:offline` | **PASS BUILD SUCCESS（302 tests）** |

---

## 二、修复核查（最终 evidence，全部真实触发）

### Keychain

| 项 | evidence | 真实触发方式 |
|---|---|---|
| 正向生命周期 | `lifecycleCycleCount:5` | store/resolve/replace/resolve/delete/not_found |
| locked | `lockFailClosed:true` | 锁定隔离 Keychain 后 resolve 失败关闭 |
| access_denied | `accessDeniedTriggered:true` | wrong-password 解锁隔离 Keychain，独立断言 |
| cancelled | `cancelledTriggered:true` + `cancelledItemCount:0` | parent 发 SIGTERM broker 中断 helper store（`controlledStoreCommand`），断言 cancelled + 无 item commit |
| corrupted | `corruptedTriggered:true` | 128 字节随机数据文件 + `probe_corrupted`，断言 corrupted |
| 异常退出恢复 | `abnormalExitRecovery:true` + `beforeMutationCrashCount:5` + `afterMutationCrashCount:5` | `crash_before_store` / `crash_after_store` failpoint + SIGKILL，重新 resolve 恢复事实 |
| duplicate conflict | `duplicateConflictTriggered:true` | 重复 store 断言 typed conflict |
| modern SecItem | `status:PASS` + `defaultKeychainTouched:false` + 完整 `store/resolve/replace/resolve/delete/not_found` | 真实 SecItem 生命周期到临时 keychain + `assertSecret` 验证，不再写默认登录 Keychain |

### IPC（诚实收窄）

- `decision: "existing_json_supervisor_ipc_is_not_sufficient_for_sensitive_buffer_payloads"`；
- 读真实 supervisor 源码确认 `serialization:"json"`，json probe 发送 Buffer → `invalid_request`；
- `desktop.core.shutdown` discriminator 保持隔离；`sensitiveBufferPreserved:false`；
- 结论：`requires_dedicated_sensitive_channel_or_supervisor_serialization_change`。

### Endpoint（真实 HTTPS）

- `node:https` + 一次性 CA/cert（`CN=spike.invalid` + SAN）+ `servername`/`ca`/Host 保持；
- `tlsSniPreserved:true` / `hostHeaderPreserved:true` / `remoteAddressRechecked:true` / `redirectNotFollowed:true`；
- 负向：`wrongCertificateRejected:true` / `wrongHostnameRejected:true`。

### 泄漏扫描（四通道 × 五编码）

- `channels`：parent_stdout / diagnostic_stderr / evidence_json / test_trace 各自 `matchCount:0`；
- `encodings`：raw / base64 / url / hex / secret-shape-pattern；
- `negativeProbeCount:16`（负向注入证明 scanner 能检出）。

---

## 三、边界零漂移

- 越界写入已隔离至 `/private/tmp/robothree-dfi4a0-repair1-quarantine-JIrwHS/`（含 late-concurrent 1～4）；
- 工作区本批仅改 `scripts/dfi4a0-keychain-helper.m` + `scripts/run-dfi4a0-preflight.mjs` + 治理文档；
- 生产代码（apps/services/packages）零改动；未改 Main/Preload/Contracts/Core/Central/Document Worker/migration；
- `pnpm-lock.yaml` 保持 Aug 16；无新增第三方依赖；未进入 DFI-4A.1～4A.4、DFI-2B、DFI-3、DFE-6。

---

## 四、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-4A.0-repair.1 最终版正确修复了五项证据缺口，且把上一轮中间态标 DEFERRED 的三项
（cancelled / corrupted / modern SecItem store-replace-delete）全部补齐为真实触发：cancelled 经 SIGTERM
broker 中断、corrupted 经随机数据文件、modern SecItem 经完整临时 Keychain 生命周期 + assertSecret 验证。
IPC 诚实证明生产 json supervisor 不能承载敏感 Buffer 并收窄为「需独立通道或改造 serialization」；
Endpoint 用真实 node:https 覆盖 SNI/Host/证书/remoteAddress/redirect + 负向证书/hostname；
泄漏扫描升级为四通道 × 五编码 + 16 次负向注入。三项门禁独立串行复跑全绿，边界零漂移（越界写入全部
进入 quarantine）。

**DFI-4A.0-repair.1 可进入用户接受流程；repair.1 关闭后 DFI-4A.0 阶段关闭，但不自动授权 DFI-4A.1。**

— Claude Code（独立 QA，只读）
