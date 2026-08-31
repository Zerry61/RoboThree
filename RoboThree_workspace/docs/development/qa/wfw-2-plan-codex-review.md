# WFW-2 详细实施方案 — Codex 文档复核报告

> Date: 2026-08-31  
> Reviewer: Codex 5.6（事实复核，docs-only）  
> Status: `PLAN_DOCUMENT_REVIEW_PASS — USER_ACCEPTANCE_PENDING`  
> P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0  
> Coding: `GATED`

## 1. 复核对象与边界

- [WFW-2 详细实施方案](../wfw/WFW-2-CORE-REGISTRY-POLICY-EFFECT-ARTIFACT-DEVELOPMENT-PLAN.md)
- [WFW Revision 1.1](../wfw/WFW-WORKSPACE-TEXT-FILE-WRITE-DEVELOPMENT-PLAN.md)
- `wfw-1-code-claude-qa.md`（用户已接受，WFW-1 `PASS/CLOSED`）

本轮只读核实代码接缝并修改方案/治理文档，没有实现 WFW-2，没有修改生产代码、Contract、migration、依赖或 lockfile。

## 2. 20 项事实核对

| # | 方案依赖事实 | 结果 |
| --- | --- | --- |
| 1 | WFW-1 writer、digest helper、四态 inspector 已存在 | PASS |
| 2 | WFW 尚未进入 Core/Desktop/Contracts activation | PASS |
| 3 | existing Document descriptor = `idempotent_retry` | PASS |
| 4 | EffectCoordinator 已支持 `query_then_retry` | PASS |
| 5 | ToolEffectExecutor query 当前固定 unknown | PASS |
| 6 | Runtime handles 按 descriptor ID 唯一 | PASS |
| 7 | current backend 只有一个 descriptor identity | PASS |
| 8 | Worker 当前协议只有 ready/invoke/result/error | PASS |
| 9 | Worker backend/runtime 已 single-flight | PASS |
| 10 | Registry/Task lock 可 additive 注册 | PASS |
| 11 | Policy 可表达 routine create/modify | PASS |
| 12 | currentContext 已覆盖多窗口授权复核 | PASS |
| 13 | Artifact 可从 Observation 自动投影 | PASS |
| 14 | Artifact source authority 可复用 readable selection | PASS |
| 15 | Artifact lifecycle 可判断 deleted/sourceDeleted | PASS |
| 16 | internal-trial entitlement 可携带 exact Tool refs | PASS |
| 17 | 全部 authority fact 可由 existing persistence 派生 | PASS |
| 18 | 无需公共 Contract 或 migration | PASS |
| 19 | descriptor handle identity 与 process ownership 可内部拆分 | PASS |
| 20 | Renderer/Electron/Windows 可继续独立留给 WFW-3 | PASS |

## 3. 架构评审

### 3.1 Registry 与 Worker 复用

PASS。方案没有把 existing Document descriptor 改为 `query_then_retry`。WFW 使用独立 descriptor，但只创建第二个 handle，不创建第二个 Worker process，避免历史 Tool lock/recovery 漂移和无效扩张。

### 3.2 Effect recovery

PASS。方案只为 ToolEffectExecutor 增加 optional query resolver；non-WFW 仍 unknown。WFW inspector 四态映射到 existing EffectQueryResult，不新增状态机，`unknown -> uncertain` 保持 fail-closed。

### 3.3 Replace authority

PASS。同一 durable Session 的 successful WFW Artifact revision graph 是无需新表即可证明 provenance 的最小集合。唯一 terminal head、lifecycle、grant、path、sha 全匹配后才 hydrate proof；重复摘要、分叉、删除或非 WFW 来源均拒绝。

### 3.4 Artifact activation

PASS。Artifact 继续从 Observation deterministic projection，不使用 manual registration，不创建新数据库事实；`.prev` 不暴露为第二 Artifact。

### 3.5 MVP 范围

PASS。方案没有引入通用文件平台、read/stat/delete、目录创建、Renderer API、Admin、TGM、Knowledge 或 Lifecycle。WFW-3/WFW-H1 明确继续 gated。

## 4. 可执行性

- 6 个步骤均有输入、输出与停手条件；
- QA-001～QA-048 连续唯一，覆盖 Registry、Policy、proof、recovery、Artifact 与边界；
- 20 项停手条件可通过 diff、schema、migration、lockfile、process count 和 focused tests 断言；
- real verification 使用 Core + SQLite + Document Worker child，不把 fixture smoke 当成 Electron 产品闭环；
- Desktop 和 Windows 验收未提前宣称 ready。

## 5. P 级结论

```text
P0 = 0
P1 = 0
P2 = 0
P3 = 0
```

没有阻断性架构缺口。方案已吸收代码事实揭示的两个实施精度点：

1. WFW 使用独立 descriptor，但共享同一 Worker child；
2. recovery 使用 additive private inspect，Core 不直接读取文件。

## 6. 建议接受流程

1. 用户审阅方案与本报告；
2. 确认方案 §15 的 8 项问题；
3. 接受后标记 WFW-2 计划评审 `PASS/CLOSED`；
4. 用户另行、单独授权 WFW-2 编码；
5. WFW-3、WFW-H1 与其他下游继续 `GATED`。

文档复核通过不等于编码授权。本报告没有授权修改 WFW-2 产品代码。
