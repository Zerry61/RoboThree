# EIPC-0 Authority Semantics Foundation 报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-22  
> 负责人：Codex 5.6  
> 开发版本：`0.0.0-eipc.0`  
> 唯一允许结论：`AUTHORITY_SEMANTICS_FROZEN`

## 1. 结论

EIPC-0 已冻结 Enterprise Identity production Contract、owner/activation/current transport 三类身份、
session rebind、CGF-1.3 offline 状态 2/3、entitlement 交集、canonical digest 与跨语言 Conformance。

本批结论严格为：

```text
AUTHORITY_SEMANTICS_FROZEN
```

本批**不宣称** `IDENTITY_COMPOSITION_READY`，也没有关闭
`BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION`。当前 production composition 仍保留固定
`activeUserId`，尚无 production `EnterpriseAccessTokenProvider`、Device Trust Adapter 或 Runtime Active
authority composition。EIPC-1～EIPC-3 继续 GATED。

## 2. 冻结内容

### 2.1 Versioned Contract 与 canonical corpus

- 新增独立 `enterprise-identity-composition/v1alpha1` Contract family；
- 冻结 strict、非 Secret 的 session assertion、Device Trust decision、Runtime Active source、runtime-only
  session binding 与 authority snapshot；
- `OwnerIdentity = enterpriseId + userId + deviceId`，明确排除 `clientInstanceId`；
- activation client 与 current client 分离，Desktop/Core 重启只建立 runtime-only rebind，不改写 Runtime
  Activation generation；
- Compatibility 使用显式 `compatible | incompatible` 事实，不能凭 revision 存在默认可用；
- bearer、refresh credential、raw token id、device proof/private key、Credential Reference 均不进入 Contract；
- 新增 canonical JSON Schema、valid/invalid fixture、SHA-256 文件基线与 TS/Java 双端 Conformance。

### 2.2 Authority semantics

- entitlement 首期固定为 `personal_model.configure`；
- entitlement 必须同时满足 token permission、activated policy、explicit compatibility 与既有 offline 状态；
- Central 暂不可达且本地事实仍有效时投影 CGF-1.3 状态 2，可继续本地能力；
- token 过期、session invalid 或 Device Trust invalid 投影状态 3，不新增离线租约、设备失联阈值或第二套时钟；
- recovered update 不静默扩大权限；
- owner/session/Runtime Active scope drift、source digest tamper 与 current client mismatch 均失败关闭；
- `sourceFactsDigest` 排除评估墙钟，`snapshotDigest` 包含 `evaluatedAt`，分别证明稳定来源和单次评估。

### 2.3 Core-private boundary

- 新增 `RuntimeActiveEnterpriseSessionAuthorityProvider` Core-private Port，只冻结未来 production provider 的
  结果语义；
- 本批没有 production implementation、bootstrap composition 或 feature readiness；
- Main、Preload、Renderer 不导入 authority Contract/Port；
- migration 24 仍为最新，不新增 migration 25；
- 既有 Enterprise Gateway v1alpha1/v1alpha2 均未改写。当前 Gateway permission enum 不含
  `personal_model.configure`，因此 EIPC-1 必须先评审 additive Enterprise Gateway identity protocol
  revision，不能把本 Contract corpus 伪装成已上线 wire protocol。

## 3. 交付范围

- `packages/contracts/src/enterprise-identity-composition/**`；
- `contracts/enterprise-identity-composition/v1alpha1/**`；
- `services/core/src/application/enterprise-identity-authority-semantics.ts`；
- `services/core/src/ports/runtime-active-enterprise-session-authority.ts`；
- TS Contract/Core/boundary tests；
- Central test-only canonical Contract Conformance；
- `scripts/run-eipc0-harness.mjs` 与 root `harness:eipc0`。

## 4. 明确未实现

- production token/session、Device Trust 或 Device Signer Adapter；
- Core production authority composition、fixed `activeUserId` 替换或 Runtime Ready；
- 个人模型 safe/sensitive Desktop API、CRUD、Reveal、Provider 或 Agent Loop 变化；
- Renderer/Main/Preload 产品能力；
- STRM-0 或 sensitive Renderer↔Main transport；
- migration、依赖或 lockfile 变化。

## 5. 开发者验证

- 环境：Node `24.13.0`、pnpm `11.11.0`、JDK `21`；正式门禁严格串行；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run harness:eipc0`：
  PASS（Node **5 files / 40 tests**；Java **1 conformance class**；
  `outcome=AUTHORITY_SEMANTICS_FROZEN`；`productionIdentityReady=false`；敏感命中 0）；
- `CI=true pnpm run lint`：PASS，Architecture boundary checks passed；
- `CI=true VITEST_MAX_WORKERS=1 pnpm run check`：非沙箱串行 PASS（**229 files / 1522 tests +
  3 smoke**）；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central`：
  PASS（**307/0/0/0 / BUILD SUCCESS**）；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home CI=true pnpm run check:central:offline`：
  PASS（**307/0/0/0 / BUILD SUCCESS**）。

首次运行 Harness 时 package 版本变化触发 pnpm 重建 `node_modules`，受限网络导致安装未完成；随后用
`pnpm install --frozen-lockfile` 恢复既有依赖，下载数为 0，`pnpm-lock.yaml` 未修改。该过程不是产品或
测试失败。

完整 Workspace 首次在受限沙箱执行时，真实 loopback/子进程/Keychain 用例因 `listen EPERM` 与隔离
Keychain 不可用失败；在非沙箱环境按同一代码、同一单 Worker 配置从零串行复跑全绿，未修改测试或生产
代码规避。`pnpm-lock.yaml` mtime 仍为 `2026-08-16 18:50:57`。

## 6. 下一道门禁

1. 独立 QA 已 PASS 且用户已正式接受，EIPC-0 `PASS/CLOSED`；
2. 用户已单独授权 STRM-0，EIPC-1～EIPC-3 不因本批自动解锁；
3. `IDENTITY_COMPOSITION_READY` 只能由未来 EIPC-3 Unblock Audit 输出。
