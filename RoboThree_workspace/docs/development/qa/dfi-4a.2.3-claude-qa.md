# DFI-4A.2.3 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-21-2239-version-dfi-4a.2.3` |
| 验收对象 | DFI-4A.2.3：Owner Credential Reveal 与 Closure |
| 日期 | 2026-08-21 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core/Contracts `0.0.0-dfi.4a.2.3`；Desktop `0.0.0-dfe.6b`；Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFI-4A.2.3 Harness（reveal/coordinator/command/sensitive-boundary/keychain/broker-contracts 6 个测试文件） | **PASS 6 files / 53 tests** |
| 2 | `CI=true pnpm run check`（完整） | **PASS 217 files / 1444 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 302/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS BUILD SUCCESS（302 tests）** |

---

## 二、重点核查项（方案 §5-§8 + Addendum A 边界）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | Owner-only + 全量重校验 | ✅ reveal 前重新校验 Runtime Active owner/entitlement/Device Trust/active head revision/binding；测试断言「rejects stale revision and digest tampering before Keychain resolve」且 `resolveCount=0` |
| 2 | 禁止合并/fan-out/重放 | ✅ [reveal-service.ts:115-131](services/core/src/application/personal-model-credential-reveal-service.ts#L115-L131) 相同 commandId 已有 tombstone → `reveal_replay_forbidden`、有 active → `reveal_busy`（不合并 pending waiter）；测试断言「reveals exact active Credential once」+ 重放 `reveal_replay_forbidden` + `resolveCount=1` |
| 3 | 一次性 tombstone 不含 Secret | ✅ `Tombstone` 只有 requestDigest/terminal/expiresAt（93-97 行），无 Secret；TTL 10 分钟；测试断言 reveal 后无 durable receipt/operation（不持久化 reveal 事实） |
| 4 | 并发/频率/deadline 有界 | ✅ 同 owner/model 单并发、全局 ≤4（133-135 行）、60 秒 ≤5 次（137-139 行）、registry ≤256（141-143 行）；测试断言第 6 次 `reveal_rate_limited`、共享 operation gate 的 `reveal_busy`、deadline 过期清 Secret |
| 5 | 状态 2/3 | ✅ 状态 2（企业暂不可达但 Token/Trust 有效）允许 reveal、状态 3（会话失效）拒绝；测试断言「allows enterprise temporary unavailability but denies invalid session」 |
| 6 | V1/V2 + 全链路 Buffer 清理 | ✅ `uncertain` 终态（323-326 行）+ `secret.fill(0)`（335/340 行）+ namespaceKey.fill(0)（385-386 行）；[reveal-delivery.ts](apps/desktop/src/main/personal-credential-reveal-delivery.ts) 单一 consumer（不 fan-out/broadcast）+ `result.secret.fill(0)`/`working.fill(0)` + deadline uncertain |
| 7 | Main 私有单一 consumer | ✅ Main 只提供单一受控 consumer（不广播），不注册 `ipcMain.handle`、不接受 webContents/Renderer 输入（本批边界） |
| 8 | 测试断言真实性 | ✅ 反查无空断言/`it.skip`；覆盖 digest 不含 transport facts、无 durable reveal facts、重放禁止、状态 2/3、stale revision 在 Keychain 前拒绝、共享 gate、rate limit、deadline 清 Secret |
| 9 | 边界零漂移 | ✅ 本批改动 = `services/core/src/application`（reveal-service/gate/coordinator）+ `services/core/src/adapters/credential` + `apps/desktop/src/main`（broker-client/reveal-delivery）+ `contracts/desktop-private`；未接 Preload/Renderer/公共 IPC/Provider/Task lock/Agent Loop；未改 Central/Document Worker/migration 1-23；`pnpm-lock.yaml` 保持 Aug 16 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-4A.2.3 正确完成 Owner Credential Reveal 与 Closure：owner-only reveal 每次重新校验 Runtime Active
owner/entitlement/Device Trust/active head revision/binding；禁止合并 pending waiter、fan-out 与重放（一次性
tombstone 不含 Secret、TTL 10 分钟）；并发/频率/deadline 有界（同 owner/model 单并发、全局 ≤4、60 秒 ≤5、
registry ≤256）；状态 2 允许、状态 3 拒绝；V1/V2 一律 `uncertain` 不自动重放；Secret 经 fd4/fd5 二进制传输并
全链路 `fill(0)`（Main 单一 consumer + 七层 cleanup）。四项门禁独立串行复跑全绿（Harness 6/53、完整 check
217/1444 + 3 smoke、Central online/offline 302/302）。边界零漂移：未接 Preload/Renderer/公共 IPC/Provider/
Task lock/Agent Loop，`pnpm-lock.yaml` 保持 Aug 16。

**DFI-4A.2.3 可进入用户接受流程；接受后 DFI-4A.2 阶段关闭。DFI-4A.3/4A.4、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
