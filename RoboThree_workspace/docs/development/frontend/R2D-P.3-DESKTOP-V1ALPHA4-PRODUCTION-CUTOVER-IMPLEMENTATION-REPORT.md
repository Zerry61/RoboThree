# R2D-P.3 Desktop Local v1alpha4 / Production Cutover 实施报告

> 日期：2026-08-28  
> 开发版本：Root/Core/Desktop/Contracts `0.0.0-r2dp.3-pra.3`  
> 状态：**INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 最高输出：`R2DP3_DESKTOP_V1ALPHA4_CUTOVER_CONFORMANT`

## 1. 实施结论

本批完成了 Desktop Local v1alpha4 的 additive production surface，并保持 production R2D activation 默认关闭：

- 新增 exact Contracts subpath、Core private route、Main IPC、sandboxed Preload API 与 Workbench adapter 接线；
- v1alpha4 只允许 `{ requestedMode: "default" }`，不承载 Max Preview、observed support 或 Provider raw 参数；
- v1alpha4 Receipt 显式投影安全字段，不含 `defaultModelId`，Renderer 不再把 Agent default 当 Model authority；
- Main→Core submit/query 使用 connection lease，协商 v1alpha4 后失败不回退 legacy；
- production activation 使用 code-owned decision，默认 `false`，不能由 env/CLI/Main/Renderer 打开；
- 真实 Electron Main、production sandboxed Preload、Main IPC、Core child 与 SQLite 文件拓扑验证默认关闭路径。

本批没有打开 production Max、Desktop Max UI、TGM、Knowledge Provider、Agent Lifecycle 或 Admin v2。

## 2. 关键实现

### 2.1 additive v1alpha4 与单线 API

`@robothree/contracts/desktop-local/v1alpha4` 是 exact package subpath，不扩宽 Contracts root。它提供
compatibility、submit 与 query 三个 exact API；legacy v1～v3 源文件与根导出保持冻结。Core facade/private HTTP、
Desktop Core client、Main router 与 Preload 使用同一 strict schema。

### 2.2 Receipt 与协商边界

Core 通过显式字段投影构造 v1alpha4 Receipt，删除 `defaultModelId` 与 reasoning 内部事实。Workbench 只有在
compatibility 返回 v1alpha4 available 后才走新 API；此后 typed error 不回 legacy。旧 runtime lease 的晚到响应
返回 `runtime_changed`，Core restart 后必须重新协商，新的 current lease 才能按 command ID 查询 durable Receipt。

### 2.3 production-disabled 真实拓扑

`desktop-v1alpha4-cutover.ts` 集中持有 code-owned release decisions，bootstrap 明确保持关闭。真实 E2E 启动
Electron Main、sandboxed/context-isolated Preload、Main IPC、Core child 与真实 SQLite 文件，验证 production feature
返回 `production_gate_disabled`。R2D 已关闭的 durable lifecycle Harness 继续承担 Task 崩溃恢复事实证明；本批没有
把 test-only enabled graph 伪装成 production ready。

## 3. 主要文件

- `packages/contracts/src/desktop-local/v1alpha4/**` 与 exact package export；
- `services/core/src/application/submit-turn-coordinator.ts`、Desktop facade/private HTTP v1alpha4 接线；
- `apps/desktop/src/main/desktop-v1alpha4-ipc-router.ts`、Core client 与 production composition；
- `apps/desktop/src/preload/**`、`apps/desktop/src/shared/foundation-api.ts`；
- Workbench adapter v1alpha4 negotiation；
- R2D-P.3 focused tests、真实 Electron runner、Harness 与 content-free Evidence。

未新增依赖，未修改 migration，未修改 Provider mapping/registry，未打开 Max UI 或其他下游。

## 4. 验证证据

环境：Node `v24.13.0`、pnpm `11.11.0`、JDK `21.0.12`。

| 门禁 | 结果 |
| --- | --- |
| `harness:r2dp3` | **PASS 8 files / 22 tests**；真实 Electron/Core/SQLite evidence；`sha256:7d85a493…2678bb` |
| root `check` | **PASS 308 files / 2085 tests + 3 smoke + Architecture boundary** |
| Central online / offline | **PASS 438 / 438** |
| lint / `audit:dtp4` | **PASS** |
| frozen offline install | **PASS** |
| migration / lockfile | `26` / `sha256:5b15ae01…874f31`（不变） |

独立 QA 发现 DTP-4 production audit 基线已随本批版本更新，但 self-test fixture 仍断言上一批版本。该测试维护
缺口已在本批内修复；focused self-test **1 file / 2 tests PASS**，随后完整 root `check` 以最终退出码 0
重新通过 **308 files / 2085 tests + 3 smoke**。未修改 audit 规则、依赖或 lockfile。

Evidence 关键值：`exactApiMethodCount=3`、`defaultOnlyReasoning=true`、`defaultModelIdLeakCount=0`、
`realElectronMain=true`、`productionSandboxedPreload=true`、`realMainIpc=true`、`realCoreChild=true`、
`realSqliteFile=true`、`productionR2dActivationEnabled=false`、`productionFeatureAvailable=false`。

## 5. 当前边界

R2D-P.3 独立 QA 已通过并由用户正式接受，现为 `PASS/CLOSED`。该关闭不自动解锁 DFI-5.4.1；
DFI-5.4.1～5.4.3、TGM、Knowledge Provider、Agent Lifecycle 与 Admin v2 继续 `GATED`。
