# DFI-4A.3.1 repair.2 Provider Timeout QA Report

日期：2026-08-25  
复核者：Codex 5.6  
对象：`0.0.0-dfi.4a.3.1-repair.2` Local Personal Provider Timeout Repair / audit baseline repair  
结论：**SUPERSEDED_BY_PTX_ALIGNMENT — NON_BLOCKING**

> 2026-08-25 后续澄清：本报告原先将 `pptxgenjs@4.0.1` 记为 PTX / Document Worker
> allowlist drift 阻断。经 PTX 授权链复核，`pptxgenjs@4.0.1` 属于已授权的 PTX-1 合法产物；
> Document Worker allowlist、DTP-4 packaging audit、README、CHANGELOG、DEV LOG 已同步。该旧判断不再
> 阻断 `0.0.0-dfi.4a.3.1-repair.2`，批次当前以独立 QA 与用户接受记录为准：`PASS/CLOSED`。

## 1. 结论

P0=0  
P1=0  
P2=0  
P3=0

功能性实现与核心门禁通过：timeout policy、four-phase timer、recognized progress、EOF / late reset 归因、
migration 25 Timeout Fact、restart/retry deadline 不延长、DFI-4A.3.3 recovery 回归、DTP-4 packaging
audit、Central online/offline 均通过。

此前阻断关闭的 `audit:dtp4` 版本基线已按用户授权修复：Root/Core 期望已同步为
`0.0.0-dfi.4a.3.1-repair.2`，Contracts/Desktop 继续锁定 `0.0.0-dfi.3a.2`。

本报告原先的 PTX / Document Worker 并发状态判断已被后续 PTX 授权链复核澄清并关闭：
`pptxgenjs@4.0.1` 是 PTX-1 授权窗口内的合法依赖，Document Worker allowlist 与 DTP-4 audit
基线已同步。该事项不属于 DFI-4A.3.1 repair.2 timeout 代码缺陷，且不再阻断本批关闭。

## 2. 复跑结果

- `CI=true pnpm run harness:dfi4a3.1-repair.2`：PASS，8 files / 53 tests；
- `CI=true pnpm install --frozen-lockfile`：PASS；
- `CI=true pnpm run audit:dtp4`：PASS；
- `CI=true pnpm exec vitest run scripts/audit-dtp4-packaging.test.mjs`：PASS，1 file / 2 tests；
- `CI=true pnpm run check`（非沙箱）：原复跑曾因 PTX allowlist 状态窗口 FAIL；
  后续 PTX-1 对齐后，DEV LOG / CHANGELOG 记录为 PASS，247 files / 1652 tests + 3 smoke；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CI=true pnpm run check:central`：PASS，404 tests / BUILD SUCCESS；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CI=true pnpm run check:central:offline`：PASS，404 tests / BUILD SUCCESS；
- `CI=true pnpm install --frozen-lockfile`：PASS。

原 `pnpm run check` 失败明细（已由 PTX-1 allowlist 对齐关闭）：

```text
services/document-worker/tests/harness/dtp-1-foundation-safety-scan.test.ts
services/document-worker/tests/harness/zero-network.test.ts

Expected dependencies:
  pdfjs-dist, xlsx

Received dependencies:
  pdfjs-dist, pptxgenjs, xlsx
```

## 3. Revision 1.1 P2 约束核查

- overall timer 使用 durable `invocationDeadlineAt - clock.now()` 计算剩余时长，未重新生成 `now + overall`；
- 本批无外部 timeout 配置入口；`selectedOverallTimeoutMs` 使用 policy `defaultOverallTimeoutMs = 900_000`，
  120,000～1,800,000 仅作为 strict validator 边界；
- `process.env` 只用于 test-only loopback / test-only timeout material guard，未作为生产 timeout 配置源；
- timeout/cancel/late reset 归因由 locked cause 优先，正常完整 EOF 缺 `[DONE]` 保持
  `personal_model.stream_terminal_missing`。

## 4. Findings

### Closed finding：PTX / Document Worker dependency allowlist alignment

本报告原先记录 `services/document-worker/package.json` 已包含：

```text
pptxgenjs: 4.0.1
```

后续复核确认该依赖来自 PTX-1 授权窗口，且 Document Worker 安全扫描 allowlist、DTP-4 audit
dependency expectation、README、CHANGELOG、DEV LOG 已同步。

影响：旧 P2 关闭，不再阻断 `0.0.0-dfi.4a.3.1-repair.2` 用户接受与关闭。

### Closed finding：DTP-4 packaging audit version baseline

已按用户授权同步：

```text
rootVersion 0.0.0-dfi.4a.3.1-repair.2
coreVersion 0.0.0-dfi.4a.3.1-repair.2
```

`audit:dtp4` 与 `scripts/audit-dtp4-packaging.test.mjs` 均已 PASS。

## 5. Boundary

- 本 QA 未修改生产代码；
- 本 QA 未授权或执行 DFI-5/Max、MiniMax terminal Profile、Renderer、Admin、Central、Desktop Main/Preload、
  public Contract、Credential、TGM、Knowledge Provider 或 PTX dependency allowlist；
- 本报告生成时 `pnpm-lock.yaml` digest 为
  `b7c6d0a7906001ef503a3c0365663153265aa601103779eeacbd10d1a7f5ade5`；后续 PTX-1 授权窗口已合法更新
  lockfile，并由 PTX-1 QA 单独归因。

## 6. Recommendation

PTX / Document Worker dependency allowlist 状态冲突已由 PTX-1 授权链复核关闭。`0.0.0-dfi.4a.3.1-repair.2`
已按独立 QA 与用户接受记录进入 `PASS/CLOSED`。
