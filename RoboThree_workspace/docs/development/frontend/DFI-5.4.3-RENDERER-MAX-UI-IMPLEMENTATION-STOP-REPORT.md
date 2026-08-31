# DFI-5.4.3 实施停手报告

> 日期：2026-08-28  
> 状态：**STOP ACCEPTED / DFI-5.4.3A PLAN REVIEW PASS/CLOSED / CODING AUTHORIZED**  
> 触发条件：详细方案 §16 停手条件 10
> 聚焦子批：[DFI-5.4.3A Local Personal Production Graph 聚焦实施方案](./DFI-5.4.3A-LOCAL-PERSONAL-PRODUCTION-GRAPH-DEVELOPMENT-PLAN.md)

用户已正式接受本停手结论，并授权先完成 DFI-5.4.3A docs-only 聚焦方案。本授权不恢复生产代码实施；聚焦方案
完成独立文档复核、用户接受和单独编码授权前，DFI-5.4.3A 继续 `CODING GATED`。

## 已完成且保持 fail-closed 的增量

- 新增 strict `desktop-local/task-reasoning/v1alpha1` Contract 与 exact package export；
- 新增 Core durable Task Reasoning Projection、一个 exact HTTP route、一个 Main IPC channel 与一个 frozen
  sandboxed Preload API；
- 新增 Renderer `ReasoningModeAdapter`、Workbench 单一 accessible Max switch、Safe Preview 状态、v1alpha5 Submit
  消费和 Receipt 持续摘要；
- Task detail 按 `taskId` 读取 durable safe reasoning summary，读取失败时不使用 Renderer 缓存伪造；
- 定向 Contract/Core/Renderer 测试 3 files / 10 tests PASS，Core 与 Desktop build PASS；
- production DFI/R2D/CPC/Enterprise gates 未被打开，historical Evidence 未改写。

## 必须停手的现有生产事实

1. `create-desktop-private-runtime.ts` 当前生产 composition 仍安装
   `agent.fixture.desktop-scripted` / `model.desktop-scripted`；
2. `SubmitTurnCoordinator` 在 `dfi541MaxEnabled=true` 时强制要求 `Dfi541SubmitTurnHandler`；
3. 当前 production source graph 中 `Dfi541SubmitTurnHandler` 实现数为 0；
4. `CompositePersonalModelRuntime`、`SqlitePersonalModelPersistence` 与 PRA-3 admitted materializer 尚未接入 Desktop
   production bootstrap；
5. 因此直接把 DFI-5.4.1 gate 改为 true，只能用 scripted Fixture / test identity 补齐 production graph，违反
   方案 §7.2、§7.4 与停手条件 10。

## 需要聚焦确认的最小修订

在继续 DFI-5.4.3 前，需把剩余 Step 3 拆成明确的 `DFI-5.4.3A Local Personal Production Graph`：

- 唯一 production `Dfi541SubmitTurnHandler`；
- Desktop bootstrap 接入真实 `SqlitePersonalModelPersistence`、Local Desktop subject authority、R2D-P.2
  entitlement source、PRA-3 policy/manifest/materializer 与 release-pinned mapper；
- 未配置真实 Personal Model 时 compatibility 诚实返回 `runtime_dependencies_unavailable`，不得 fallback Fixture；
- 完整图通过真实本地 TLS/SSE fixture 后，才允许 code-owned decision 打开；
- `agent.fixture.desktop-scripted` 继续只用于 fixture/demo graph，与 production graph 物理隔离。

该聚焦确认不修改已冻结 Contract 或 digest 公式，不新增 migration/依赖，也不扩张到 Enterprise、TGM、Knowledge
Provider、Agent Lifecycle、Admin v2 或 DFI-4A.4 CRUD。
