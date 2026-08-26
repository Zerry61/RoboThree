# DFI-4A.2.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-21-1612-version-dfi-4a.2.1` |
| 验收对象 | DFI-4A.2.1：Sensitive Transport + Keychain Adapter Foundation |
| 日期 | 2026-08-21 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core/Contracts `0.0.0-dfi.4a.2.1`；Desktop `0.0.0-dfe.6b`；Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFI-4A.2.1 Harness（contracts/sensitive-boundary/keychain/supervisor/boundary 5 个测试文件） | **PASS 5 files / 27 tests**（覆盖开发者 5/23） |
| 2 | `CI=true pnpm run check`（完整） | **PASS 212 files / 1402 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **PASS 302/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS BUILD SUCCESS（302 tests）** |

---

## 二、重点核查项（方案 §4 敏感通道 + 安全边界）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | fd4/fd5 双匿名管道，JSON 生命周期不变 | ✅ [core-private-supervisor.ts:395-404](apps/desktop/src/main/core-private-supervisor.ts#L395-L404) `serialization: "json"` **保持不变**，`stdio: ["ignore","ignore","pipe","ipc","pipe","pipe"]` 新增 fd4/fd5 两条 pipe；boot 消息 additive 增加 `sensitiveChannelInstanceId`，未改成熟 JSON 生命周期通道 |
| 2 | Private Contract 隔离 | ✅ [protocol.ts](packages/contracts/src/desktop-private/personal-credential-broker-v1/protocol.ts) 不从根入口导出；测试断言 Preload/Renderer 不含 private specifier |
| 3 | Secret 不进 header/不字符串化 | ✅ protocol 只含 `secretByteLength`，Secret 用独立 `Uint8Array` frame；sensitive-boundary 测试断言生产文件不含 `secret.toString(`/`secretBase64`/`secretHex` |
| 4 | 四 identity 锁定 + deadline + 有界并发 + 幂等 | ✅ [broker-server.ts:99-112](services/core/src/adapters/credential/personal-credential-broker-server.ts#L99-L112) channelInstanceId+clientInstanceId 校验、deadlineAt 超时拒绝、inflight≥4 或 transportRequestId 重复或 mutation 重复 → `credential_transport_busy` 拒绝 |
| 5 | Secret 生命周期 fill(0) | ✅ 请求 body（finally `body.fill(0)`）、handler 返回 Secret（`result.secret.fill(0)`）、响应 frame（write 后 `frame.fill(0)`）三处清零 |
| 6 | one-shot helper + trust check | ✅ [personal-credential-helper-trust.ts](services/core/src/adapters/credential/personal-credential-helper-trust.ts) digest（sha256 比对 manifestSha256）+ 签名校验（codesign verify）；adapter 默认 `verifyPersonalCredentialHelperDescriptor` |
| 7 | 生产 fail-closed | ✅ 无 verified production helper 时 typed fail-closed，不阻断 Core Ready（方案 §4.1）；不接 CRUD Coordinator/durable recovery/Reveal/Provider/Task lock/Preload/Renderer/公共 IPC |
| 8 | 敏感边界测试真实性 | ✅ sensitive-boundary 断言私有 Contract 不可达 root/Preload/Renderer、Secret 不字符串化、无 console 诊断、helper 不含 business identity（enterpriseId/userId/deviceId/personalModelId/endpoint/providerModelId/displayName）、4 通道泄漏扫描 + 负向注入证明 scanner 可检出 |
| 9 | 边界零漂移 | ✅ 本批改动 = `packages/contracts/desktop-private/personal-credential-broker-v1/**` + `services/core/src/adapters/credential/**` + `services/core/native/macos/helper.m` + `apps/desktop/src/main`（broker-client + supervisor 增 pipe）+ 测试；未改 Preload/Renderer/Central/Document Worker/migration；`pnpm-lock.yaml` 保持 Aug 16 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-4A.2.1 正确完成 Sensitive Transport + Keychain Adapter Foundation：fd4/fd5 双匿名二进制管道
（fd3 JSON 生命周期保持不变，`serialization: "json"` 未改 advanced）；四 identity（channel/client/command/
transport）锁定 + deadline + 有界并发 + mutation 互斥 + 幂等 + late-response 丢弃；Core-owned one-shot
macOS Keychain Helper + helper path/digest/signature trust check；无 verified production helper 时 typed
fail-closed 但不阻断 Core Ready；Secret 只走 `Uint8Array` frame、不字符串化、每处 fill(0)、不进 JSON/argv/
env/临时文件/日志/Renderer/Preload。四项门禁独立串行复跑全绿（Harness 5/27、完整 check 212/1402 + 3
smoke、Central online/offline 302/302）。边界零漂移：私有 Contract 隔离、未接 CRUD/durable recovery/
Reveal/Provider/Task lock/Preload/Renderer/公共 IPC，`pnpm-lock.yaml` 保持 Aug 16。

**DFI-4A.2.1 可进入用户接受流程。DFI-4A.2.2/2.3、DFI-4A.3/4A.4、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
