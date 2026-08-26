# DFI-5.2.2 Planner / Stale CAS / Task Bundle 精确物化实施报告

> 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 计划：[DFI-5.2.2 详细实施方案](./DFI-5.2.2-REASONING-PLANNER-TASK-BUNDLE-DEVELOPMENT-PLAN.md)  
> 本批最高输出：`DFI522_REASONING_TASK_BUNDLE_CONFORMANT`

## 1. 交付结论

本批已把 DFI-5.2.1 冻结的 SubmitTurn v1alpha3、ReasoningModeLock 与
TaskRuntimeSelection v1alpha2 接入 Core Application 和 Task Persistence：

```text
SubmitTurn v1alpha3（Application-only）
  -> exact Model / Tool locks
  -> task-locked Reasoning Profile subject
  -> default zero-load 或 max single-load CAS
  -> strict ReasoningModeLock
  -> TaskRuntimeSelection v1alpha2
  -> coordination v1alpha3 durable accept
  -> atomic Task bundle + authorization facts + binding
  -> safe v1alpha3 Receipt / exact recovery
```

本批没有注册 production SubmitTurn v1alpha3 route，没有接入 Main、Preload、Renderer、Admin、Provider raw
mapping、ModelRequest v1alpha2、Compaction Binding v1alpha2 或 Agent Loop reasoning 消费；上述能力仍由
DFI-5.2.3、DFI-5.3 与 DFI-5.4 分别负责。

## 2. 主要实现

### 2.1 单一 Planner 与 task-locked subject

- 新增 `ReasoningModeLockPlanner`，集中实现 default/max 真值表、Profile strict validation、support revision
  CAS 与四种 ReasoningModeLock materialization；
- 新增 `TaskLockedReasoningProfileSubjectResolver`，enterprise subject 只由已验证的 exact Model lock 派生，
  personal subject 还必须通过 active owner authority、owner namespace 与 `pmcfg1` MAC/
  `executionDefinitionDigest` 校验；
- 禁止由 modelId 前缀、Provider 名称、Renderer 参数或当前 Preference 猜测 authority/Profile；
- `default` 不读取 Profile；`max` 以一次 `loadExact()` 作为 support 线性化点，不进行第二次读取或 fallback。

### 2.2 stale / unavailable 零副作用

- `reasoning_selection_stale` 与 `reasoning_profile_unavailable` 均在 Message prepare、coordination accept、
  Task/lock/selection/authorization/binding/Receipt 写入和 Agent Loop 启动之前返回；
- 页面观察到的 supported/unsupported/unknown 与 exact support revision 使用严格 CAS；
- previously observed fact 漂移不静默降级为 default；Profile 损坏或 source 不可用不伪装成 unsupported。

### 2.3 Task bundle v1alpha2 原子物化

- `RuntimeSelectionService` 新增显式 v1alpha2 prepare 与 accepted-plan recovery 路径；
- `TaskPersistence` 新增 reasoning-aware bundle 方法，旧方法继续只接受 v1alpha1；
- InMemory/SQLite 使用同一 readable-union validator，原子写入 Task、Capability Locks、
  TaskRuntimeSelection v1alpha2、Authorization facts 与 SubmitTurn binding；
- load/replay 重新校验 JSON、indexed fields、selection digest、ReasoningModeLock、Model lock、
  authorization digest 和 capability lock IDs；
- v1alpha2 selection 继续存放于 migration 26 已有 JSON 容器，没有新增 migration 27。

### 2.4 Durable coordination 与恢复

- `SubmitTurnCoordinator.submitV1Alpha3()` 只在 Core Application seam 暴露，不进入 Desktop production facade；
- v1alpha3 accepted plan 持久化完整 ReasoningModeLock 与 planned selection digest；
- accepted 后恢复只读 durable plan，不重读 Preference、Profile current pointer，也不重生成 lock id/digest；
- v1/v2 原有提交和恢复路径继续使用 v1alpha1 Runtime Selection；
- DFI-5.2.3 前 v1alpha3 不启动 Agent Loop，避免半装配被误判为 production ready。

## 3. 可量化不变量

### 3.1 Profile load 计数

| 路径 | `ReasoningProfileSource.loadExact()` 次数 |
| --- | ---: |
| default 首次 plan | 0 |
| max 首次 plan | 1 |
| accepted recovery | 0 |
| completed replay | 0 |

### 3.2 stale / unavailable durable side effects

测试对以下十类事实逐项断言为 0：Message intent、Conversation Message、coordination record、Task、
Capability Lock、Runtime Selection、Authorization fact、SubmitTurn binding、Receipt、Agent Loop / Provider call。

### 3.3 精确绑定

- coordination `plannedSelectionDigest` 等于物化后的 Runtime Selection digest；
- selection 内 ReasoningModeLock 与 Task、exact Model lock 双重绑定；
- authorization selection digest 等于 Runtime Selection digest；
- capability lock IDs 精确覆盖 Model/Tool locks，且不混入 Reasoning lock ID；
- Receipt safe summary 只包含 requested mode、resolution、安全原因与 lock id/digest，不暴露 Strategy、
  timeout ref、Profile material 或 Provider raw 参数。

## 4. 修改范围

### 4.1 生产代码

- `services/core/src/application/reasoning-mode-lock-planner.ts`
- `services/core/src/application/runtime-selection-service.ts`
- `services/core/src/application/submit-turn-coordinator.ts`
- `services/core/src/ports/task-persistence.ts`
- `services/core/src/ports/submit-turn-persistence.ts`
- `services/core/src/persistence/submit-turn-bundle-validation.ts`
- `services/core/src/persistence/task-authorization-selection-record.ts`
- `services/core/src/adapters/memory/in-memory-task-persistence.ts`
- `services/core/src/adapters/sqlite/sqlite-task-persistence.ts`
- `services/core/src/adapters/memory/in-memory-submit-turn-persistence.ts`
- `services/core/src/adapters/sqlite/sqlite-submit-turn-persistence.ts`
- `services/core/src/index.ts`

### 4.2 测试与治理

- `services/core/tests/submit-turn-coordinator.integration.test.ts`
- `services/core/package.json`
- 本实施报告、README、CHANGELOG、DEVELOPMENT-LOG 与 DFI-5.2.2 方案状态行。

共享工作区中同期存在的 PTX-4 `desktop-task-projection-service`、Desktop preview 与对应测试不是本批改动，
本批不接管、不回退，也不将其结果归入 DFI-5.2.2 focused evidence。

## 5. 开发者验证

- Core build：PASS；
- touched-file ESLint：PASS；
- 完整 lint + Architecture boundary：PASS；
- DFI-5.2.2 focused / DFI-5.2.1 / persistence / authorization 回归：12 files / 100 tests PASS；
- `submit-turn-coordinator.integration.test.ts`：28 tests PASS；
- 非沙箱完整 root check：PASS，255 files / 1710 tests + 3 smoke；
- frozen install：首次 offline 因本机 store 缺 `yaml@2.9.0` tarball 失败；按既有 lockfile 恢复 store 后，
  `pnpm install --frozen-lockfile --offline` PASS；
- Central online：PASS，404 tests / BUILD SUCCESS；
- Central offline：PASS，404 tests / BUILD SUCCESS；
- `pnpm-lock.yaml` digest 保持
  `c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07`。

## 6. 边界

- 未修改 Contracts、Desktop、Main、Preload、Renderer、Admin、Central、Document Worker；
- 未新增 migration 27、依赖或 lockfile 变更；
- 未提供 production Reasoning Profile source 或 Provider Strategy mapping；
- 未开放 production SubmitTurn v1alpha3 route；
- 未进入 DFI-5.2.3、DFI-5.3～5.4、AAPI-0.3～0.4、TGM 或 Knowledge Provider。

## 7. 下一步

Claude Code 独立 QA 已完成：P0=0、P1=0、P2=0、P3=0，完整 root check `255 files / 1710 tests +
3 smoke`、Central online/offline `404/404` 与 `audit:dtp4` 均 PASS；用户已正式接受，DFI-5.2.2
现为 `PASS/CLOSED`。该关闭不自动解锁 DFI-5.2.3 编码。

独立 QA 报告：
[dfi-5.2.2-claude-qa.md](../qa/dfi-5.2.2-claude-qa.md)。
