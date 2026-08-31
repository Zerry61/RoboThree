# R2D-4 Lifecycle / Cutover / Closure Harness 实施报告

> 状态：`PASS/CLOSED`
>
> 日期：2026-08-27
>
> 版本：Root / Core `0.0.0-r2d.4`；Contracts 保持 `0.0.0-r2d.3.1`
>
> production gates：CPC activation=false；R2D gate=false；enterprise entitlement=false

## 1. 交付结论

R2D-4 已完成 closure-only 实现。本批没有新增生产业务能力，仅增加真实进程生命周期 fixture、聚合 Harness、
evidence validator 与 architecture/boundary tests，对 R2D-1～R2D-3 已关闭语义进行收口验证。

开发者门禁最高输出：

```text
R2D_CORE_DELTA_CONFORMANT
productionR2dGateEnabled=false
productionCpcActivationEnabled=false
productionEnterpriseEntitlementReady=false
agentLifecycleReady=false
desktopV2ConsumptionReady=false
adminV2ConsumptionReady=false
knowledgeProviderReady=false
memoryReady=false
effectReconciliationReady=false
dfi53Unlocked=false
```

这不是 production-ready 声明；production composition 继续显式关闭 R2D/CPC，且不存在 production
`TaskResourceEntitlementSource` 实现。

## 2. 关键证据

- 真实 Core child + 真实 SQLite：在 `accepted`、`message_appended`、Task bundle commit、`task_committed`、
  `completed` 五个 durable 窗口同步写入 named barrier 后真实 `SIGKILL`，父进程观察 ESRCH，再以新 PID 打开
  原 SQLite 文件恢复；不使用单进程 throw、删库重建、sleep 或自动 retry 冒充恢复；
- 恢复 authority read=0：Agent subject、Registry、Workspace/Auth、Preference、Capability Lock、Entitlement、
  Tool Policy 均不重新读取；恢复只消费 exact durable accepted plan；
- 三轮 semantic replay：三个 fresh PID 使用同一受控 `FakeClock` seed，得到唯一 semantic digest
  `sha256:7e4b0204a913c65cba9406cf695cce6f953a38553b70358333e88df4de8a0486`；
- 权威时间未被删除：`acceptedAt`、`createdAt`、`lockedAt`、`observedAt`、`committedAt` 五项均进入 semantic
  material；将 seed 漂移 1ms 会同时改变真实 accepted-plan digest 与 semantic digest；
- 安全与资源：四通道 × 五类 canary × 四种编码共 80 次负向注入均精确检出；正常 stdout/stderr/evidence/failure
  四通道命中均为 0；12 类资源计数全部来自真实 diagnostics 并在终态归零；
- 兼容与边界：Runtime Selection v1/v2/v3 使用显式 `schemaVersion` 单次 dispatch；Desktop v1alpha3 Receipt
  `defaultModelId` 仅投影 exact resolved Model ID，不读取或恢复 Agent default authority；migration 仍止 26。

## 3. 开发者门禁

```text
CI=true pnpm run harness:r2d4
PASS 18 files / 179 tests
outcome=R2D_CORE_DELTA_CONFORMANT
evidenceDigest=sha256:eb489f799870828afb8b19cc923efde24454c76cd518a1970fac0173a85ca9e0

env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check
PASS 283 files / 1958 tests + 3 smoke + Architecture boundary

CI=true pnpm run check:central
PASS 404 / 0 / 0 / 0 / BUILD SUCCESS

CI=true pnpm run check:central:offline
PASS 404 / 0 / 0 / 0 / BUILD SUCCESS

CI=true pnpm run audit:dtp4
PASS
```

首次 root check 在受限沙箱内因 loopback `listen EPERM` 与隔离 Keychain 权限统一失败；在保持 Node
24.13.0、同一命令、非沙箱环境从零复跑后 283/283 files、1958/1958 tests 全绿。没有通过局部测试 retry
掩盖业务失败。

门禁前 `pnpm` 自动尝试重建共享 `node_modules`，沙箱网络不可达且离线 store 缺少 tarball；随后仅按现有
lockfile 执行 frozen install 恢复依赖。未修改 lockfile，最终 digest 仍为
`sha256:c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07`。

## 4. 修改范围

- 新增 `scripts/r2d4-evidence.mjs`、`scripts/r2d4-evidence.test.mjs` 与 `scripts/run-r2d4-harness.mjs`；
- 新增 `services/core/tests/fixtures/r2d4-lifecycle-child.mjs`、
  `services/core/tests/r2d4-process-lifecycle.test.ts`、`services/core/tests/r2d4-boundary.test.ts`；
- 更新 Root/Core 版本、`harness:r2d4` 与 packaging audit 版本基线；
- 更新 R2D 计划状态及治理文档。

本批未修改 `services/core/src/**` 生产实现、Contracts、migration、Provider、Agent Loop、Desktop、Admin、
Central、Document Worker、依赖或 `pnpm-lock.yaml`。

## 5. 独立 QA 与用户接受

- Claude Code 独立 QA：`INDEPENDENT_QA_PASS`（P0=0、P1=0、P2=0、P3=0）；
- 用户已正式接受独立 QA，R2D-4 与 R2D 工程线 conformance 均 `PASS/CLOSED`；
- 本次关闭只确认 `R2D_CORE_DELTA_CONFORMANT`，production CPC/R2D/enterprise entitlement 继续 false，
  不自动解锁任何下游。

## 5. 下一步

当前只进入独立 QA。用户接受前不得将 R2D-4 或 R2D 全线标记 `PASS/CLOSED`，不得自动启用 production gate，
也不得解锁 DFI-5.3、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、Effect Reconciliation、Agent Lifecycle
或 Desktop/Admin v2 consumption。
