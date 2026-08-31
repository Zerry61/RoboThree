# DFI-4A.4.2 Personal Model CRUD / Credential Reveal / Durable Recovery 实施报告

## 0. 状态

- 版本：`0.0.0-dfi.4a.4.2`
- 日期：2026-08-29
- 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**
- Outcome：`DFI4A42_PERSONAL_MODEL_CRUD_REVEAL_RECOVERY_CONFORMANT`
- 边界：本批不代表 Personal Model production ready；正式签名 Helper、Renderer Personal Model UI、
  DFI-4A.4.3 与其他下游继续 `GATED/false`。

## 1. 用户授权与实施口径

本批依据已接受的 DFI-4A.4.2 计划和两次编码前停手裁决实施：

- create、`replace_secret` update、reveal 使用 STRM MessagePort + fd4/fd5；
- delete 使用 safe Core command，复用同一 durable Coordinator，并传入 zero Secret；
- 用户接受 A2 后，`reuse_existing` metadata-only update 同样使用 safe Core command + same Coordinator +
  zero Secret；
- 未扩写 frozen STRM v1，未建立第二套状态机，未新增 migration、依赖或 lockfile 变化。

编码中进一步确认：frozen STRM v1 create ticket 必须带 target configuration revision，而 Coordinator create
不能把它误当旧 revision。实现由 Core 在 durable prepare 后读取同一 operation 的
`targetConfigurationRevision` 放入 transport ticket，Broker 执行 create 时不把该 target revision重新解释为
expected old revision。该桥接不修改 frozen STRM v1，也不削弱 exact ticket binding。

## 2. 交付内容

### 2.1 Additive Contract 与安全表面

- 新增 exact package subpath
  `@robothree/contracts/desktop-local/personal-model-management/v1alpha2`；
- 提供 strict Compatibility/List/Detail/Create/Update/Delete/Reveal/Query、Receipt、Preparation、typed error；
- Desktop 提供八个 exact IPC channel、八条 Core private route 与八个 frozen sandboxed Preload method；
- mutation 方法恰为 3，reveal 方法恰为 1，generic dispatcher 为 0；
- Renderer consumer 仍为 0。

### 2.2 单一 durable 业务图

normal Core graph 现在共享同一 SQLite Personal Model persistence、production management authority、operation gate、
Coordinator / Recovery / Reveal、Command Service 与 Broker handler。`desktop-private-main.ts` 已安装真实 business
handler，不再固定返回 `credential_store_unavailable`。但正式签名 Helper binary 仍不存在，因此 Evidence 明确区分：

- `productionBusinessHandlerInstalled=true`；
- `productionBusinessHandlerReady=false`；
- `productionHelperAssetPresent=false`；
- `personalModelCrudReady=false`；
- `credentialRevealReady=false`。

### 2.3 Secret 分流与生命周期

- create / replace / reveal 的 Secret 只进入 Preload owned `Uint8Array`、MessagePort、fd4/fd5 Broker；
- reuse / delete 不打开 transport，调用同一 Coordinator 且 Secret 长度为 0；
- create ID、opaque Credential Ref、revision 与 canonical material 继续由 Core 生成；
- durable Receipt replay、material conflict、cleanup/manual/uncertain 语义沿用既有 Coordinator；
- Reveal 每次重检 authority/revision/binding，单并发、限频、deadline、无 durable viewed fact；
- Preload 对 owned bytes best-effort clear，不声称 zero-copy 或全部 structured clone 副本可清零。

## 3. Evidence 与门禁

`pnpm run harness:dfi4a4.2` 结果：

- 8 files / 59 tests PASS；exact Contract subpath 可导入；8 API / 8 IPC / 8 Core route；
- 80 次负向泄漏注入全部检出，正常四通道命中 0；
- 18 类资源全部为 non-negative safe integer 且最终为 0；前 16 类来自 immutable STRM-3 真实进程
  Evidence，Reveal attempt 与 operation lease 来自本批生命周期 runtime diagnostics；
- 父方案 QA-061～080 保持 `executed_by_strm3`，QA-081～100 标记
  `executed_by_dfi4a42`，其余 80 项继续 `retained_for_dfi4a4_stage_closure`；
- focused QA 96 项、父账本 120 项均连续；migration 仍止 26，lockfile digest 不变；
- historical STRM-3 / DFI-4A.4.1 Evidence 内层 digest 与文件 hash 均不漂移。

最终 Evidence 内层 digest 为
`sha256:f52e7a255374e70a920957ba7641f5643f73a39445946815e42d7261be87dc0e`。
QA-081～100 的 `ownerTest` 已逐项绑定具体测试文件，不使用聚合文件列表冒充 item-level evidence。

其余开发者门禁：

- `pnpm run typecheck`、`pnpm run audit:dtp4` 与本批改动文件聚焦 ESLint 均 PASS；
- Central online / offline 在 JDK 21 下均为 438 tests、0 failures、0 errors、0 skipped、BUILD SUCCESS；
- 首次 Node 24 单实例全量 Vitest 为 331/334 files、2208/2211 tests；修复本批引入的 Supervisor
  strict broker error 期望后，相关 3/3 focused tests PASS。剩余两处非 PASS 仅是 DFI-5.4.2 / DFI-5.4.3A
  历史版本快照断言，按既定治理保持只读，不为当前合法版本演进改写；
- root `lint/check` 当前仍被前端并行批的
  `apps/desktop/src/renderer/adapters/settings-adapter.ts rootRealPath` boundary 阻塞；该文件不属于本批，
  本批未越界修改，也不把聚焦 PASS 表述成全仓 clean PASS。

Evidence：[`artifacts/dfi4a42/evidence.json`](../../../artifacts/dfi4a42/evidence.json)

## 4. 诚实边界与后续

本批最高只确认工程 conformance。独立代码 QA `P0=0 / P1=0 / P2=0 / P3=0` 已由用户正式接受，
DFI-4A.4.2 现为 `PASS/CLOSED`。production signed Helper、business handler ready、CRUD/Reveal product
availability、Renderer Personal Model UI、DFI-4A.4.3、Enterprise identity、Admin v2、TGM、Knowledge Provider 与
Agent Lifecycle 继续 false/GATED；本次关闭不自动解锁任何下游。
