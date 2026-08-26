# RoboThree ARH-3.3.2 Preflight Repair.2 Durable Usage Reconciliation Plan

## 1. 文档状态

```text
状态：PASS/CLOSED
日期：2026-08-15
目标版本：0.0.0-arh.3.3.2-preflight-repair.2
前置：repair.1 PASS/CLOSED
ARH-3.3.2：AUTHORIZED / IN PROGRESS
ARH-3.3.3：GATED
```

本计划只修复真实 Central terminal 已提交后，Core 尚未消费的 durable Usage Event 无法重放的
恢复缺口。Claude Code 独立 QA 已通过，用户已正式接受并关闭本修复，ARH-3.3.2 主开发恢复。

## 2. 发现与影响

repair.1 已正确冻结 `Projection-before-cursor`，但专项 Fake Gateway 在重启后继续返回
`running`。ARH-3.3.2 接入真实 Central 代码事实后出现不同顺序：

1. Central `commitTerminal()` 在一个事务中依次写 Provider Usage Fact、`usage_recorded` Event、
   terminal Event、Outbox 与 terminal Invocation；
2. Core 在 M3/M4 崩溃后重新进入 `DurableEnterpriseModelProvider`；
3. Assistant 路径在读取 Central status 前，若 `outputStartedAt` 已存在就直接抛
   `ModelStreamResumeUnavailableError`；即使没有该字段，也会在 status 为 `completed` 时于订阅
   durable Event 之前直接抛出；
4. Compaction 路径具有相同的两个提前退出点；
5. Central SSE 本身能够从旧 durable cursor 回放 `usage_recorded` 与 terminal Event，但 Core
   当前没有到达该路径。

因此，真实 M3/M4 下 `Projection-before-cursor` 只能保证 cursor 没有越过 Usage，不能保证重启后
真的消费它。影响是企业 Usage Projection 和 Session aggregate 可能永久缺失；不得把缺失解释成
usage=0。Assistant/Compaction 输出本身仍不可恢复，本计划不改变这一事实。

## 3. 修复原则

1. **durable facts 与 ephemeral output 分离恢复**：输出不可恢复不代表 durable Usage 可以跳过；
2. **status-first**：只在 Central 已 terminal 且本地 link 尚未完成时执行有界 durable catch-up；
3. **Projection-before-cursor 保持不变**：`usage_recorded` 仍先幂等投影，再推进 cursor；
4. **不重建输出**：catch-up 不把历史 ephemeral delta 重新交给 Agent Loop，不创建 Assistant
   Message 或 Summary；
5. **不宣称 exactly-once**：只依赖 Usage Projection identity/digest 与 link CAS 幂等；
6. **失败关闭**：durable Event identity、sequence、digest 或 cursor 不合法时保持原错误，不猜测；
7. **最小范围**：不修改公共 Contract、Central、Schema/migration、Kernel、Desktop、依赖或
   lockfile。

## 4. 实施方案

### 4.1 Assistant 路径

将 `outputStartedAt` 的不可恢复判断移动到 status 读取之后。若 status 已 terminal：

```text
load exact link
→ load exact status
→ subscribe from persisted durable cursor
→ consume only durable usage_recorded / terminal facts
→ usage Projection before cursor
→ cursor converges to terminal durable cursor
→ completed: throw ModelStreamResumeUnavailableError
→ failed/cancelled/timed_out/uncertain: return existing typed terminal failure
```

若 status 仍非终态且 `outputStartedAt` 已存在，继续按现有语义立即失败关闭，不盲目接管别的节点
拥有的 ephemeral output。

### 4.2 Compaction 路径

采用同一 durable catch-up 规则，但：

- Usage 投影 identity 继续使用 `compactionJobId`；
- 不创建或提交不完整 Summary；
- terminal completed 后仍返回 `model_stream_resume_unavailable`，交给既有 Compaction recovery
  分类收敛为不可恢复输出；
- `summaryCommittedAt` 已存在时继续走既有 durable replay，不重复调用 Central。

### 4.3 内部实现边界

允许在 `DurableEnterpriseModelProvider` 内增加两个私有 helper，或一个由 Assistant/Compaction
共同调用的私有 durable reconciliation helper。不得新增公共 Port、Contract、状态或数据库字段。

## 5. 测试矩阵

至少覆盖：

1. Assistant M3：Projection 前崩溃，Central status 已 completed；重启后写入一个 Projection、
   cursor 到 terminal，随后明确输出不可恢复；
2. Assistant M4：Projection 已提交、cursor 前崩溃；重放幂等且 Projection 不重复；
3. Compaction M3/M4 等价两条；
4. status terminal 且没有 Usage Event：不得伪造 Projection；
5. status 非终态 + outputStartedAt：保持现有失败关闭，不改变 active execution ownership；
6. failed/cancelled/timed_out/uncertain 的 durable catch-up 与 typed terminal 语义不漂移；
7. wrong invocation、cursor/sequence gap、不同 digest conflict 全部失败关闭；
8. Gateway accept 不重复，Assistant Message/Summary 均不伪造；
9. SQLite close/reopen 后 Assistant 与 Compaction 均收敛；
10. repair.1 四项回归、完整 Workspace、Central online/offline 串行全绿。

repair.2 独立 QA PASS 且用户接受后，ARH-3.3.2 才能再次恢复 M1～M8 主 Harness。

## 6. 允许修改范围

```text
services/core/src/application/durable-enterprise-model-provider.ts
services/core/tests/durable-enterprise-model-provider.test.ts
package.json
services/core/package.json
README.md
CHANGELOG.md
docs/development/DEVELOPMENT-LOG.md
docs/architecture/KEY-NODES.md
docs/development/arh/**
```

禁止修改公共 Contract、Central 生产代码、Schema/migration、Kernel、Desktop、依赖和 lockfile。

## 7. 门禁

```bash
CI=true vitest run services/core/tests/durable-enterprise-model-provider.test.ts
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

## 8. 当前状态

Claude Code 已独立串行复跑专项 **27 tests**、完整 Workspace **164 files / 1155 tests**、
Central online/offline **299/0/0/0**，结论 `P0～P3=0`。用户已正式接受并关闭 repair.2，
ARH-3.3.2 主开发恢复；ARH-3.3.3 继续 `GATED`。
