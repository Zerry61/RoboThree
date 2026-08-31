# R2D-P.2 Production Source / Composition 实施报告

> 日期：2026-08-28  
> 开发版本：Root/Core `0.0.0-r2dp.2-pra.2`  
> 状态：**IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 最高输出：`R2DP2_PRODUCTION_SOURCE_COMPOSITION_CONFORMANT`

## 1. 实施结论

本批完成了默认不可达的 Local Desktop R2D production graph，但没有开启 production R2D consumption：

- 新增唯一 production `TaskResourceEntitlementSource`，以 LDA-1 `local_desktop_owner` 和一次性 acceptance lease
  读取真实 Personal Model、Registry、Workspace/Auth 与 Preference 事实；
- 新增 production `R2D3AcceptanceAuthority` 与 composition factory；
- Personal Model definition/head/status/Profile/Credential observation 在 captured lease 内 exact 校验，返回前再验证
  head 未漂移；
- Agent、Entitlement、Registry、Preference 与锁定事实共享同一 `acceptanceLeaseId`，Planner 无论成功或中途失败
  都确定性释放 lease；
- gate 保持 code-owned `false`；显式启用但依赖不完整时 fail-fast，完整 graph 只在受控测试中可构造；
- Skill/Knowledge entitlement 诚实为空，production Desktop v1alpha4、R2D-P.3 与 DFI-5.4.1 仍不可达。

Personal Model durable facts 当前不含可证明的数值 context window，因此 source 投影
`contextWindow={state:"unknown"}`，而不是补一个默认数字。只有 Agent 提出 minimum context window 时才按
fail-closed 处理；这保持了 unrestricted Agent 与真实本地模型目录的可组合性，同时不伪造模型能力。

## 2. 关键实现

### 2.1 一次性 subject proof 与 captured lease

`LocalDesktopR2DSubjectBindingAuthority` 将已验证的 runtime/client binding 与 acceptance lease ID 一起注册；
`LocalDesktopTaskResourceEntitlementSource` 只消费一次 proof，并把 namespace、exact definitions、Registry 与
Preference 放入 bounded in-memory lease。裸 digest、OS 用户名、Renderer 自报身份或 Fixture 均不能成为 authority。

`R2D3DurableAcceptancePlanner` 将 lease ID 贯穿 Entitlement、Registry、Workspace/Auth、Preference 与 capability
locks。新增可选的 `releaseAcceptanceLease` Port 清理钩子，保证 Tool Policy、Decision、Reasoning 或 Authorization
任一步失败时也不会遗留 namespace key/lease；成功路径与 lock materializer 的关闭保持幂等。

### 2.2 Personal Model 与资源投影

Personal Model registry facts 由 `materializePersonalModelRegistryFacts()` 单一 helper 派生，source 与 lock
materializer 不复制 revision/digest 公式。候选只包含：

- active head；
- exact definition/status/Profile；
- present 且 binding digest 匹配的 Credential observation；
- local owner exact authority；
- deterministic stable ordinal。

历史 enterprise-owned、漂移、缺 Credential 或不可验证记录不会被 local source 接管。Tool 只来自既有真实
Registry 与后续 Planner intersection；Skill/Knowledge 不伪装 ready。

### 2.3 Composition 与 activation 边界

`createLocalDesktopR2DProductionComposition()` 固定三态：

1. `enabled=false`：返回 disabled graph；
2. `enabled=true` 但依赖不完整：`selection.production_graph_incomplete`；
3. 受控测试传入完整依赖：构造 production source/authority/planner。

production bootstrap 没有消费该 factory，`R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED=false`，因此本批不会
改变现有 Desktop SubmitTurn 行为。

## 3. 文件边界

主要生产变更：

- `services/core/src/application/local-desktop-r2d-production.ts`；
- `services/core/src/application/personal-model-task-lock.ts`；
- `services/core/src/application/r2d3-durable-acceptance-planner.ts`；
- `services/core/src/application/agent-resource-decision-planner.ts`；
- `services/core/src/application/task-resource-entitlement.ts`；
- R2D acceptance/entitlement Port 与 Core-private export。

测试与门禁新增 R2D-P.2 focused tests、共享 boundary test、`run-r2dp2-harness.mjs` 与 content-free Evidence。
未修改 public Contracts、Desktop/Admin、Central、migration、依赖或 lockfile；未打开 production bootstrap、
R2D-P.3、PRA-3 或 DFI-5.4.x。

## 4. 验证证据

环境：Node `v24.13.0`、pnpm `11.11.0`、JDK `21.0.12`。

| 门禁 | 结果 |
| --- | --- |
| `harness:r2dp2` | **PASS 5 files / 48 tests**；Evidence `sha256:796f268f…dc8abf` |
| 受影响 focused tests | **PASS 4 files / 43 tests** |
| root `check`（宿主环境） | **PASS 301 files / 2069 tests + 3 smoke + Architecture boundary** |
| Central online / offline | **PASS 438 / 438** |
| lint / `audit:dtp4` | **PASS** |
| migration / lockfile | `26` / `sha256:5b15ae01…874f31`（不变） |

Evidence 关键值：`productionTaskResourceEntitlementSourceCount=1`、
`productionR2dConsumptionEnabled=false`、`subjectProofSingleUse=true`、`entitlementSchemaVersion=v2`、
`personalModelContextWindowState=unknown`、`skillEntitlementCount=0`、`knowledgeEntitlementCount=0`、
`desktopV2ConsumptionReady=false`、`r2dp3Unlocked=false`、`dfi541Unlocked=false`。

## 5. 当前边界

本批只证明 production source/composition 可实现且默认不可达。R2D-P.2 仍需独立 QA 和用户接受后才可
`PASS/CLOSED`。R2D-P.3、PRA-3、DFI-5.4.1～5.4.3、TGM、Knowledge Provider、Agent Lifecycle 与
Desktop/Admin v2 consumption 继续 `GATED`。
