# DFI-5.4.3A Local Personal Production Graph 实施报告

> 状态：**INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 日期：2026-08-28  
> 实施者：Codex 5.6  
> 计划：[DFI-5.4.3A 聚焦实施方案](./DFI-5.4.3A-LOCAL-PERSONAL-PRODUCTION-GRAPH-DEVELOPMENT-PLAN.md)  
> 本批最高结论：`DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_CONFORMANT`

## 1. 实施结论

DFI-5.4.3A 已补齐 DFI-5.4.3 停手时确认缺失的 Local Personal production graph：正常 Desktop Core
现在使用真实 Personal Model / Invocation / Reasoning Preference SQLite persistence、Local Desktop subject authority、
R2D-P.2 production entitlement、PRA-3 admitted policy/materializer、task-pinned release reconstruction、
DFI-5.3 release-pinned mapping 与唯一 DFI541 durable SubmitTurn handler。

本批没有把测试能力伪装为产品能力。普通启动不注册 `agent.fixture.desktop-scripted`、
`model.desktop-scripted` 或 scripted Provider；这些能力只在显式 `dcf2c` / `legacy_test` 隔离图中可用。
当 verified Credential helper 或合法 Personal Model 尚不可用时，Core 可以启动，但 Max compatibility 诚实返回
`runtime_dependencies_unavailable`。当前 `productionCredentialRuntimeReady=false`，因此本结论不等于安装包已经
具备 Personal Model 创建、Secret 录入或 production Max ready。

## 2. 关键实现

### 2.1 真实 Local authority 与 persistence 生命周期

- Desktop bootstrap 在同一 database path 启停 `SqlitePersonalModelPersistence`、
  `SqliteLocalPersonalModelInvocationPersistence` 与
  `SqliteDesktopReasoningModePreferencePersistence`；
- production composition 消费 `LocalDesktopPersonalModelExecutionAuthorityProvider`，execution-only authority
  与 accepted subject proof、owner namespace、Personal Model definition/head/status exact 绑定；
- R2D acceptance lease 在成功和失败路径都确定性清零 namespace key 并删除，不能被 retry/recovery 二次消费；
- migration 继续止于 26，没有创建表、索引、cursor store 或 migration 27。

### 2.2 Exact admission 与 task-pinned release

- `LocalPersonalDfi541AdmissionInputSource` 只从 exact Personal Model facts、Credential observation 与 PRA policy
  形成 sealed admission input；
- `ExactSubjectBoundProviderReleaseMaterializer.reconstructForExecution()` 只读取 durable exact subject material，
  restart/replay 不重新读取 current head、current status 或 Credential；
- accepted materialization 与 runtime Profile source 共用
  `deriveExactSubjectProviderReleaseMaterial()`，不复制 digest 公式；
- `TaskPinnedReasoningReleaseResolver` 从 durable Task bundle 重建 release，缺失、漂移或 identity 不一致均 typed
  fail-closed，不切 current、不猜 model、不 fallback scripted。

### 2.3 唯一 durable SubmitTurn handler

- 新增唯一 `Dfi543LocalPersonalSubmitTurnHandler implements Dfi541SubmitTurnHandler`；
- 复用既有 `accepted → message_appended → task_committed → completed` coordination，不建立第二套状态机；
- Task、Model/Tool locks、Runtime Selection v1alpha4、Authorization、ReasoningModeLock v1alpha2、Instruction
  Binding 与 DFI541 bundle 在同一既有 transaction 原子提交；
- response loss / restart / replay 从 durable accepted plan 与 bundle 恢复，不重新选择 Agent、Model、Skill、Tool、
  Knowledge 或 reasoning release；
- Agent Loop 只在 durable `completed` 后启动，terminal replay 不重复启动。

### 2.4 Agent Loop / Provider cutover

- executable Task bundle readable union additive 支持 DFI541，InMemory/SQLite 均 single dispatch，损坏新版本不
  fallback legacy；
- Runtime Selection v1alpha4 在 Core-private resolver、request materializer、instruction runtime、compaction 与
  provenance 路径归一为单一 readable view；
- normal graph 的 `DurableAgentLoopStarter` 通过 exact Task locks 解析 Local Personal Provider，并复用 durable
  deadline、invocation link、Usage 与 release-pinned mapping；
- normal graph 默认 Provider 改为 `FailClosedModelProvider`，不存在 scripted fallback；
- `agent.general` 使用 code-owned v1alpha2 exact material作为唯一 production execution Agent；旧 scripted Agent
  使用独立 `agent.fixture.desktop-scripted` ID，只能由显式 fixture mode 启动。

### 2.5 Desktop bootstrap 与 readiness

- `DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_ENABLED=true` 只表示结构图已安装；
- Desktop v1alpha5 compatibility 同时检查真实 runtime readiness；verified helper 未就绪时返回
  `runtime_dependencies_unavailable`；
- `DFI541_MAX_CORE_DEFAULT_ENABLED=false`、历史 installed subject release count=0 等历史时点事实不被改写；
- production preinstalled user release count仍为0，release只允许在 exact Personal Model subject被首次接受时物化；
- Enterprise Gateway v1alpha3、DeepSeek、TGM、Knowledge Provider、Agent Lifecycle、DFI-4A.4 CRUD/Reveal、
  Admin v2 均未接入。

## 3. 历史 Fixture 兼容收口

清除普通生产图 fixture 后，历史 Document Tool / recovery E2E 不再隐式获得 scripted Agent/Model。为保持历史
测试语义且不污染产品图，本批新增内部显式 `legacy_test` fixture mode：

- 只有测试显式传入时才注册 `agent.fixture.desktop-scripted`、`model.desktop-scripted` 与 scripted Provider；
- normal Desktop boot message不传此值，普通产品图不可达；
- 历史测试断言同步改用 fixture 的真实独立 ID，不再把 fixture称为 `agent.general`；
- DCF-2C 继续使用原有 `dcf2c` demo graph，两种 fixture mode均不构成 production readiness证据。

## 4. Evidence 与边界

`artifacts/dfi543a/evidence.json`：

- `outcome=DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_CONFORMANT`；
- focused QA matrix 96项，2 files / 9 tests；
- `structuralProductionGraphEnabled=true`；
- `uniqueProductionSubmitHandlerCount=1`；
- `productionTaskResourceEntitlementSourceCount=1`；
- `exactAdmittedPolicyCount=1`；
- `productionPreinstalledUserReleaseCount=0`；
- `normalGraphFixtureFallback=false`；
- `productionCredentialRuntimeReady=false`；
- 缺 verified helper 时 reason为 `runtime_dependencies_unavailable`；
- migration max=26；lockfile digest仍为
  `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；
- DFI-5.4.1/5.4.2、R2D-P.2/P.3、PRA-3、DFI-5.3.4 historical evidence digest均不漂移；
- Enterprise/DeepSeek/TGM/Knowledge/Agent Lifecycle/Admin v2 readiness继续false。

Evidence digest：

```text
sha256:321528d6af5ff7ed57ea26373f2061173e441d4df2f2bfa9457b856627a9a46a
```

## 5. 版本与文件边界

| 包 | 版本 |
| --- | --- |
| Root | `0.0.0-dfi.5.4.3a` |
| Core | `0.0.0-dfi.5.4.3a` |
| Desktop | `0.0.0-dfi.5.4.3a` |
| Contracts | `0.0.0-dfi.5.4.2`（未修改 public schema） |
| Admin | `0.0.0-afe.6c`（独立前端线） |

主要新增生产文件：

- `services/core/src/application/dfi543a-local-personal-production-graph.ts`
- `services/core/src/application/dfi543a-local-personal-release.ts`
- `services/core/src/application/dfi543a-local-personal-submit-turn-handler.ts`
- `services/core/src/application/fail-closed-model-provider.ts`

主要扩展文件：

- `services/core/src/bootstrap/create-desktop-private-runtime.ts`
- `services/core/src/application/r2d3-durable-acceptance{,-planner}.ts`
- `services/core/src/application/task-locked-model-provider-resolution.ts`
- `services/core/src/application/exact-subject-provider-release-materializer.ts`
- `services/core/src/application/durable-agent-loop-starter.ts`
- `services/core/src/ports/task-persistence.ts`
- InMemory / SQLite Task 与 SubmitTurn persistence

没有修改 `packages/contracts/src/**`、migration、依赖或 `pnpm-lock.yaml`。

## 6. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `pnpm run harness:dfi5.4.3a` | **PASS 2 files / 9 tests** |
| 五个滚动边界文件 | **PASS 5 files / 31 tests** |
| 受 production graph影响的真实进程回归 | **PASS 11 files / 20 tests** |
| `pnpm run typecheck` | **PASS** |
| `pnpm run lint` | **PASS** |
| `pnpm run audit:dtp4` | **PASS** |
| 单 worker全量 Vitest | **PASS 323 files / 2162 tests** |
| Core / Desktop / Preload smoke | **PASS / PASS / PASS** |
| Central offline（JDK 21） | **PASS 438 / 0 / 0 / 0** |
| Central online（JDK 21） | **436 / 438；CGF-2B3.2 两个已知双节点 timing偶发，非本批代码路径** |

普通并发 `pnpm run check` 的最终复跑为 322/323 files、2161/2162 tests，唯一失败是历史多批已记录的
`run-dcf13c-stability` `snapshot.final_convergence_failed`；同一测试在本轮单实例通过，随后单 worker全量
323/323、2162/2162与3 smoke全部通过。本报告不把并发偶发隐藏为成功，也不建立DFI repair批次；独立 QA
应在固定 Node 24.13.0 环境复跑并独立裁决。

Central online仅失败于既有 `Cgf2b32DualNodeRelayRecoveryIntegrationTest` 两个 timing窗口；DFI-5.4.3A
未修改 Central Java source graph，紧随其后的 offline同套438项全部通过。本项按既有CGF子系统环境P3记录，
不归因本批。

## 7. 独立 QA、用户接受与下一步

1. Claude Code独立代码QA及聚焦精度修订已完成，最终结论为
   `INDEPENDENT_QA_PASS`（P0=0/P1=0/P2=0/P3=1）；用户已正式接受，DFI-5.4.3A现为`PASS/CLOSED`；
2. historical DFI-5.4.2与R2D-4 Harness/Evidence继续保持只读，不为适配当前合法演进改写；Central online
   双节点时序偶发作为非阻断P3保留；
3. verified Credential helper packaging与Personal Model公共CRUD/Reveal仍未完成，真实用户当前仍会看到
   `runtime_dependencies_unavailable`；
4. DFI-5.4.3父批剩余Renderer Max UI、Safe Preview、真实Desktop E2E与DFI-5阶段Closure尚未恢复编码授权；
5. Enterprise/DeepSeek、TGM、Knowledge Provider、Agent Lifecycle、Admin v2继续`GATED`。
