# DFI-5.4.1 Max Core Contract / Durable Cutover 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-28  
> 实施者：Codex 5.6  
> 计划：[DFI-5.4.1 详细实施方案](./DFI-5.4.1-MAX-CORE-CONTRACT-CUTOVER-DEVELOPMENT-PLAN.md)  
> 本批最高结论：`DFI541_MAX_CORE_CUTOVER_CONFORMANT`

## 1. 实施结论

DFI-5.4.1 已完成编码与开发者门禁。Core 现在具备一条 additive、严格版本化且可原子恢复的 Max 接受链：

```text
Desktop Local v1alpha5
  → ReasoningModeLock v1alpha2
  → TaskRuntimeSelection v1alpha4
  → SubmitTurn coordination v1alpha5
  → existing ModelRequest v1alpha2 / DFI-5.3 mapping
```

本批没有打开用户入口。production DFI-5.4.1、R2D、CPC 与 enterprise entitlement gate 继续为 `false`；
Core private v1alpha5 route、Main/Preload Max API、Desktop Max UI 与 production installed subject release 均为 `0`。
DFI-5.4.2～5.4.3 及其他下游继续 `GATED`。

## 2. 关键实现

### 2.1 Contract 版本链

- 新增 Desktop Local v1alpha5：严格的 `default | max` SubmitTurn reasoning preference、safe admission evidence、
  Receipt 与 typed error；
- 新增 ReasoningModeLock v1alpha2：六种 resolution，Max 成功态携带 exact resolution/admission evidence；
- 新增 Runtime Selection v1alpha4：把 ReasoningModeLock v1alpha2 精确绑定进 selection digest；
- 新增 coordination v1alpha5：绑定 Runtime Selection v1alpha4、ReasoningModeLock v1alpha2、authorization、
  instruction binding 与 safe admission evidence；
- 所有新 Contract 只通过 exact package subpath 导出；旧根入口和 v1alpha1～v1alpha4 source 语义保持不变。

### 2.2 Planner 与 Provider admission

- `default` 不读取 Profile 或 Provider release，生成 `default_passthrough`；
- `max` 只使用 Task 已锁定的 exact Model/Profile/Strategy/timeout material；
- 仅 `provider_release.policy_unavailable` 与 `provider_release.policy_not_admitted` 允许 best-effort fallback；
- 其余 subject、digest、mapping、timeout 或 materialization 冲突全部 typed fail-closed；
- PRA materializer 必须由调用方显式注入，production source graph 不安装 subject release，不把 admitted policy
  误当成 installed production release。

### 2.3 Durable acceptance 与原子提交

- 新增带独立 digest domain 的 acceptance plan、coordination envelope 与 task-bundle envelope；
- v1alpha5 coordination 必须由 durable envelope 承载，拒绝裸 record；
- InMemory adapter 使用 staged snapshot 后单一 pointer swap；
- SQLite adapter 复用现有 JSON 字段与 transaction，提交后 strict reload，并通过关闭/重开原数据库验证；
- recovery/replay 使用 durable exact plan，不重新选择 reasoning resolution 或 Provider release；
- 未新增 migration，数据库 migration 仍止于 26。

### 2.4 Production cutover 边界

- `DFI541_MAX_CORE_DEFAULT_ENABLED = false`；
- disabled 状态拒绝注入 graph；test-only complete graph 可验证；production activation 明确 fail-closed；
- 没有新增 HTTP route、Main IPC、Preload API、Renderer/UI 或 Central production 接线；
- 没有修改 Provider raw body mapping、timeout 数值、Tool round、权限、Secret 或 Usage 语义。

## 3. 主要文件

### 新增

- `packages/contracts/src/desktop-local/v1alpha5/**`
- `packages/contracts/src/reasoning-mode/v1alpha2/index.ts`
- `packages/contracts/src/runtime-selection/v1alpha4/index.ts`
- `packages/contracts/src/submit-turn-coordination/v1alpha5/index.ts`
- `services/core/src/application/reasoning-mode-lock-v1alpha2-domain.ts`
- `services/core/src/application/reasoning-mode-lock-planner-v1alpha2.ts`
- `services/core/src/application/dfi541-provider-release-admission.ts`
- `services/core/src/application/dfi541-durable-acceptance.ts`
- `services/core/src/application/dfi541-max-core-cutover.ts`
- `services/core/src/persistence/dfi541-task-bundle-validation.ts`
- `packages/contracts/tests/dfi5.4.1-max-core-contracts.test.ts`
- `services/core/tests/dfi5.4.1-*.test.ts`
- `scripts/run-dfi5.4.1-harness.mjs`
- `artifacts/dfi541/evidence.json`

### Additive 更新

- `packages/contracts/package.json`
- `services/core/src/application/runtime-selection-revisions.ts`
- `services/core/src/application/instruction-bundle-domain.ts`
- `services/core/src/ports/task-persistence.ts`
- `services/core/src/ports/submit-turn-persistence.ts`
- InMemory / SQLite Task 与 SubmitTurn persistence adapters
- Core readable SubmitTurn union、public Core index、版本与 DTP-4 audit baseline

## 4. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `pnpm run harness:dfi5.4.1` | **PASS 5 files / 37 tests** |
| `pnpm run check` | **PASS 313 files / 2122 tests + 3 smoke + Architecture boundary** |
| `pnpm run check:central` | **PASS 438 / 0 / 0 / 0 — BUILD SUCCESS** |
| `pnpm run check:central:offline` | **PASS 438 / 0 / 0 / 0 — BUILD SUCCESS** |
| `pnpm run typecheck` | **PASS** |
| `pnpm run lint` | **PASS** |
| `pnpm run audit:dtp4` | **PASS** |

Central 与真实进程 Harness 在受限 sandbox 内曾出现 loopback `listen EPERM`，并且默认 shell 未指向 JDK 21；
使用项目要求的 Node 24.13.0、JDK 21.0.12 与允许 loopback 的门禁环境复跑后全部通过。这是执行环境差异，
不是产品代码 fallback，也未为此修改实现。

## 5. Evidence 与基线

- outcome：`DFI541_MAX_CORE_CUTOVER_CONFORMANT`
- focused QA matrix：96 项连续唯一
- evidence digest：`sha256:165d1544a66ed12578271b490767fc5be1d513c2324355adf4da6a74e9735ed4`
- historical DFI-5.3.4 / R2D-P.3 / PRA-3 evidence digest：全部不漂移
- migration max：26
- `pnpm-lock.yaml`：`sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`
- 本批未新增依赖，lockfile digest 未改变。

## 6. 当前状态与下一步

当前状态为：

```text
PASS/CLOSED
```

独立 QA 已逐行核查并复跑全部门禁，两处报告精度问题也已完成 docs-only 修正。用户现已正式接受，
DFI-5.4.1 标记为 `PASS/CLOSED`；该关闭不自动授权或进入 DFI-5.4.2 编码。
