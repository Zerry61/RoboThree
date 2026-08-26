# DFI-4A.4.0 Production Composition Preflight 报告

> 状态：**PASS/CLOSED — PREFLIGHT CORRECTLY IDENTIFIED TWO BLOCKERS**  
> 日期：2026-08-22  
> 负责人：Codex 5.6  
> 开发版本：Root `0.0.0-dfi.4a.4.0`；Core/Desktop/Contracts 保持 `0.0.0-dfi.4a.3.3`  
> 结论：`BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION_AND_ELECTRON_MESSAGEPORT_TRANSFER`

用户已于 2026-08-22 接受独立复核结论并正式关闭 DFI-4A.4.0。这里的 `PASS/CLOSED` 表示 Preflight
正确识别并阻止了两个 production blocker，不表示 blocker 已关闭，也不表示 4A.4.1～4A.4.3 可编码。

## 1. 结论

DFI-4A.4.0 已完成只读 production composition 核查、Electron MessagePort 真实 Spike、Contract 兼容性
核查、helper packaging 核查和 migration 充分性核查。Preflight 没有开放生产接口，也没有使用 Fake
authority 把功能标记为 ready。

当前存在两个必须回文档评审的阻断项：

1. `BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION`：现有 Desktop production composition 无法从同一可信
   链路组合 Enterprise Access Token、Device Trust、Runtime Active enterprise/user/device scope、
   `personal_model.configure` entitlement 与 CGF-1.3 offline state；
2. `BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER`：Electron 43.2.0 的 Main API 只声明
   `MessagePortMain[]` transfer list。本机 sandboxed Preload ↔ Main 实测证明 port 双向控制握手成立，
   Preload 端 transferable `ArrayBuffer` 已 detach，但相应 byte frame 未抵达 Main。

因此：

- DFI-4A.4.1～4A.4.3 不得编码；
- production personal model feature 不得宣布 ready；
- 不允许用固定 `activeUserId`、OS 用户、Main/Renderer 自报、Fake authority 或普通 JSON Secret payload
  绕过阻断；
- 下一步只能先完成 identity composition 与敏感 Renderer↔Main transport 的文档修订和评审。

## 2. Production Authority 核查

### 2.1 已存在的基础

- `PersonalModelOwnerAuthorityResolver` 与 strict resolver 已存在；
- Runtime Activation durable facts 与 CGF-1.3 offline projection 已存在；
- `EnterpriseAccessTokenProvider` Port 已存在；
- DFI-4A.1～4A.3 已冻结 owner identity、状态 2/3、Credential、Provider 与 exact Task lock 语义。

### 2.2 缺失的 production composition

- `services/core/src/**` 没有 `EnterpriseAccessTokenProvider` 的 production implementation；
- `create-desktop-private-runtime.ts` 未组合 `RuntimeActivationPersistence`、Device Trust 或
  `personal_model.configure` entitlement；
- composition 仍含固定 `activeUserId`；
- 无法从当前 boot/runtime root 证明同一个 enterprise/user/device authority snapshot。

冻结结论：`BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION`。Central 暂时不可达不等于权限失效；修复不得
新建第二套离线租约、失联阈值或会话时钟。

## 3. Helper Packaging 核查

### 3.1 已验证

- Core 已有 canonical containment、regular-file/no-symlink、owner/mode、SHA-256 manifest、codesign
  designated requirement 与 Team ID 校验；
- native macOS helper 源码已存在；
- 无 verified descriptor 时 Credential mutation/reveal 按既有设计失败关闭。

### 3.2 尚未完成

- Desktop package 没有 production helper manifest / `extraResources` / `asarUnpack` 声明；
- boot message 没有 production helper descriptor；
- `desktop-private-main.ts` 的 production Broker handler 仍返回 `credential_store_unavailable`。

状态：`TRUST_PRIMITIVES_READY_PRODUCTION_PACKAGING_MISSING`。这是 DFI-4A.4.2 sensitive production
activation 的独立硬门槛；本 Preflight 不修改正式 installer、签名或公证流程。

## 4. MessagePort Spike

### 4.1 真实运行环境

- Electron `43.2.0`；
- hidden `BrowserWindow`；
- `sandbox=true`、`contextIsolation=true`、`nodeIntegration=false`、`webSecurity=true`；
- Main 从真实 event 派生 `webContents.id` 和 main frame；
- Main 建立 `MessageChannelMain`，只把一个 port 交给 Preload；
- Preload 使用随机 32-byte `Uint8Array`，不输出、记录或持久化 bytes。

### 4.2 已证明

- Main→Preload `ready` 与 Preload→Main `preload-ready` 双向握手成立；
- exact webContents/main-frame identity 绑定成立；
- Preload 对 `ArrayBuffer` 执行 transfer 后 `byteLength===0`，sender ownership 已 detach；
- Spike 只输出布尔值和固定枚举，不输出 Secret、路径、PID、端口或原始 byte body。

### 4.3 未成立

- transferred byte frame 没有抵达 `MessagePortMain`；
- Electron 43.2.0 本地类型定义与官方 API 均把 Main 侧 transfer list 限定为 `MessagePortMain[]`，没有
  承诺 Main 侧 transferable `ArrayBuffer` ownership；
- 不能把“Preload 已 detach”误写成“Main 已安全接收”。

冻结结论：当前方案 §4.2 的“一次性 MessagePort + transferable ArrayBuffer 到 Main”不可编码。需要另行
比较并评审以下替代路线，不在本批静默选择：

1. one-shot MessagePort + bounded structured-clone `Uint8Array`，接受存在不可可靠清零的序列化副本；
2. 把敏感 consumer 移到能真实接收 transferable bytes 的隔离 renderer/utility 边界，再通过现有 fd4/fd5
   binary Broker 进入 Core；
3. 另建经过威胁模型和进程级 Harness 验证的敏感 transport。

任何替代方案都不得退化为普通 JSON IPC、Base64/hex String、argv/env/file、公共 Core HTTP 或持久化 Secret。

## 5. Contract 与 Persistence 结论

### 5.1 v1alpha2

- v1alpha2 feature negotiation 与 `PersonalModelSafeSummaryV1Alpha2` 已存在；
- v1alpha2 SubmitTurn 已有 `requestedModelId`；
- personal catalog/preference/mutation/reveal feature 与 preference mutation 尚未实现，符合本批
  preflight-only 边界；
- v1alpha1 未被个人模型能力改写。

状态：`ADDITIVE_V1ALPHA2_FEASIBLE_NOT_IMPLEMENTED`。

### 5.2 migration

- migration 23 已覆盖 owner namespace、immutable definition/head/status、preference、Operation Journal
  和 durable Receipt；
- migration 24 已覆盖 local personal invocation link 与 Usage facts；
- 当前 latest migration 为 24，不需要 migration 25。

状态：`MIGRATION_23_24_SUFFICIENT_NO_MIGRATION_25`。

## 6. 交付与边界

新增的代码仅为 Preflight/Harness：

- `scripts/run-dfi4a40-preflight.mjs`；
- `scripts/run-dfi4a40-messageport-electron.mjs`；
- `scripts/dfi4a40-messageport-preload.cjs`；
- root `preflight:dfi4a4.0` command。

未修改 Main/Preload/Renderer/Core/Contracts/Central/Document Worker 生产源码，未新增 migration 25，
未修改 migration 1～24、依赖或 `pnpm-lock.yaml`，未开放 Renderer API、个人模型 CRUD/reveal 或 feature ready。

## 7. 下一步

1. 评审 [Enterprise Identity Production Composition 修复方案](./DFI-4A.4.0-ENTERPRISE-IDENTITY-PRODUCTION-COMPOSITION-REPAIR-PLAN.md)；
2. 评审 [Sensitive Renderer↔Main Transport Revision 1](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-REVISION-1.md)
   与配套 [Threat Model](./DFI-4A.4.0-SENSITIVE-RENDERER-MAIN-TRANSPORT-THREAT-MODEL.md)；
4. helper packaging 作为 4A.4.2 前置门槛继续跟踪；
5. 两个阻断项完成、独立 QA 通过并由用户接受前，4A.4.1～4A.4.3 保持 GATED。

## 8. 开发者门禁

- `CI=true pnpm run preflight:dfi4a4.0`：`PREFLIGHT_COMPLETE_WITH_BLOCKERS`，两项 blocker 与
  本报告一致；
- `CI=true pnpm run lint`：PASS，Architecture boundary checks passed；
- `CI=true VITEST_MAX_WORKERS=1 pnpm run check`：非沙箱、严格串行 PASS，**226 files / 1496 tests +
  3 smoke**；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central`：
  PASS，**302/0/0/0 / BUILD SUCCESS**；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central:offline`：
  PASS，**302/0/0/0 / BUILD SUCCESS**。

首次 Workspace 在受限沙箱中运行时，所有需要监听 `127.0.0.1` 或使用隔离 macOS Keychain 的测试因
`listen EPERM` / Keychain unavailable 失败；同一代码在获准的非沙箱环境严格串行从零复跑全绿。
该过程不构成产品缺陷，也未通过跳过测试、延长超时或修改既有测试规避。
