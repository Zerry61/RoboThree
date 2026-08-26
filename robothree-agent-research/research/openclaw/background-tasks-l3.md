# OpenClaw — Background Tasks (L3 深挖)

> **深挖维度：A3 / 后台任务的持久化、重启恢复与并发控制**
> Commit: `deccdb5e57af6800d4f020ea2034166592a149ba`
> 入口：`src/cron/service.ts` + `src/cron/service/timer.ts` + `src/state/openclaw-state-schema.sql`

## 1. 核心结论摘要

**OpenClaw 的 Cron Service 是一个高度工程化的后台任务系统**，它解决了"重启丢任务"和"重启时崩溃"两个经典后台任务痛点。它的核心机制是：

1. **运行时元数据 + 配置完整存储于 SQLite**（不是 JSON 文件）
2. **重启后分批 catch-up**（avoid thundering herd）
3. **Agent jobs 延迟启动**（防 blocker gateway/channel 启动）
4. **AT trigger 单次执行保护**（`skipAtIfAlreadyRan`）
5. **Reservation system** 防任务并发重叠

## 2. Cron 调度模型

### 2.1 四种 schedule 类型

**[F]**（[types.ts:13-30](../../sources/openclaw/src/cron/types.ts#L13-L30)）：

```typescript
type CronSchedule =
  | { kind: "at"; at: string }                          // 一次性 (ISO timestamp)
  | { kind: "every"; everyMs: number; anchorMs?: number } // 周期性 (interval)
  | {
      kind: "cron";
      expr: string;                                     // Cron 表达式
      tz?: string;                                      // 时区
      staggerMs?: number;                               // 偏移窗口 (ms)
    }
  | {
      kind: "on-exit";
      command: string;                                  // event-driven
      cwd?: string;
    };
```

**[I]** **`on-exit` trigger** 是个有趣的扩展点——process supervisor 监听到 `command` 进程退出就触发。但这个进程在 agent turn 之外运行，不会被 per-turn 的 spawn-and-kill 终止。

### 2.2 Session Target 分级

**[F]**（[types.ts:34](../../sources/openclaw/src/cron/types.ts#L34)）：
```typescript
type CronSessionTarget =
  | "main"        // 加入主 session
  | "isolated"    // 完全独立 session（不影响用户对话）
  | "current"
  | `session:${string}`;  // 命名 session
```

**[F]** Wake mode（[types.ts:37](../../sources/openclaw/src/cron/types.ts#L37)）：
```typescript
type CronWakeMode = "next-heartbeat" | "now";
```

**[I]** "next-heartbeat" 表示 Job 等待用户下一次活跃再投递——适合"每天一次的提醒"避免打扰。

## 3. SQLite 存储与 schema

### 3.1 Job Schema（关键列）

**[F]**（[openclaw-state-schema.sql:1203-1280](../../sources/openclaw/src/state/openclaw-state-schema.sql#L1203-L1280)）：

```sql
CREATE TABLE IF NOT EXISTS cron_jobs (
  store_key TEXT NOT NULL,
  job_id TEXT NOT NULL,
  declaration_key TEXT,
  display_name TEXT,
  owner_agent_id TEXT,
  owner_session_key TEXT,
  name TEXT NOT NULL,
  schedule_kind TEXT NOT NULL,           -- at | every | cron | on-exit
  schedule_expr TEXT,
  schedule_tz TEXT,
  every_ms INTEGER,
  anchor_ms INTEGER,
  at TEXT,                              -- ISO timestamp for kind=at
  stagger_ms INTEGER,
  session_target TEXT NOT NULL,         -- main | isolated | current | session:...
  wake_mode TEXT NOT NULL,              -- next-heartbeat | now
  payload_kind TEXT NOT NULL,           -- agentTurn | systemEvent
  payload_message TEXT,
  payload_model TEXT,
  payload_fallbacks_json TEXT,
  ...
  delivery_mode TEXT,                   -- none | announce | webhook
  delivery_channel TEXT,
  delivery_to TEXT,
  delivery_thread_id TEXT,
  delivery_account_id TEXT,
  ...
  failure_alert_* : various,            -- alert strategy
  next_run_at_ms INTEGER,               -- 核心调度字段
  running_at_ms INTEGER,                -- reservation
  last_run_at_ms INTEGER,
  last_run_status TEXT,
  last_error TEXT,
  consecutive_errors INTEGER,
  consecutive_skipped INTEGER,
  job_json TEXT NOT NULL,               -- 完整 JSON 备份
  state_json TEXT NOT NULL DEFAULT '{}',
  runtime_updated_at_ms INTEGER,
  ...
  PRIMARY KEY (store_key, job_id)
) STRICT;
```

### 3.2 索引设计

**[F]**（[schema:1282-1294](../../sources/openclaw/src/state/openclaw-state-schema.sql#L1282-L1294)）：

```sql
CREATE INDEX IF NOT EXISTS idx_cron_jobs_store_updated
  ON cron_jobs(store_key, sort_order ASC, updated_at DESC, job_id);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_store_order
  ON cron_jobs(store_key, sort_order ASC, updated_at ASC, job_id);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled_next_run
  ON cron_jobs(store_key, enabled, next_run_at_ms, job_id)
  WHERE next_run_at_ms IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent_session
  ON cron_jobs(agent_id, session_key, updated_at DESC, job_id)
  WHERE agent_id IS NOT NULL OR session_key IS NOT NULL;
```

**[F]** **partial index on `enabled=true` 和 `next_run_at_ms IS NOT NULL`** —— 这是调度查询的优化核心。所有调度路径都使用 `SELECT … WHERE enabled=1 AND next_run_at_ms <= ?`。

### 3.3 存储读写

**[F]** Cron Store API（[store.ts:207](../../sources/openclaw/src/cron/store.ts#L207)）：

```typescript
export async function loadCronStore(storePath: string): Promise<CronStoreFile>;
export async function saveCronStore(storePath, store): Promise<void>;
```

**[F]** SQLite 优先 + JSON fallback（[store.ts:66-80](../../sources/openclaw/src/cron/store.ts#L66-L80)）：

```typescript
// Loads cron jobs plus config/runtime sidecars from the SQLite-backed store.
export async function loadCronJobsStoreWithConfigJobs(storePath: string)
  : Promise<LoadedCronStore> {
  const database = openOpenClawStateDatabase().db;
  const rows = loadCronRows(database, storeKey);
  if (rows.length > 0) {
    return loadedCronStoreFromRows(rows);
  }
  return { store: { version: 1, jobs: [] }, configJobs: [], ... };
}
```

**[F]** 配置无效行隔离（[store.ts:46-51](../../sources/openclaw/src/cron/store.ts#L46-L51)）：

```typescript
export function resolveCronQuarantinePath(storePath: string): string {
  if (storePath.endsWith(".json")) {
    return storePath.replace(/\.json$/, "-quarantine.json");
  }
  return `${storePath}-quarantine.json`;
}
```

**[I]** **quarantine 机制**：无效的 cron 配置行被隔离到 sidecar JSON 文件，不影响其他 jobs。

## 4. Restart Catch-up — 重启恢复核心

### 4.1 关键参数

**[F]**（[service/timer.ts:127-129](../../sources/openclaw/src/cron/service/timer.ts#L127-L129)）：

```typescript
const DEFAULT_MISSED_JOB_STAGGER_MS = 5_000;
const DEFAULT_MAX_MISSED_JOBS_PER_RESTART = 5;     // 关键限制！
const DEFAULT_STARTUP_DEFERRED_MISSED_AGENT_JOB_DELAY_MS = 2 * 60_000;
```

| 常量 | 默认值 | 作用 |
| --- | --- | --- |
| `DEFAULT_MISSED_JOB_STAGGER_MS` | 5s | 错过的 Job 之间的间隔 |
| `DEFAULT_MAX_MISSED_JOBS_PER_RESTART` | 5 | 单次重启最多立即执行 5 个 missed Job |
| `DEFAULT_STARTUP_DEFERRED_MISSED_AGENT_JOB_DELAY_MS` | 2 分钟 | Agent 任务在 gateway 启动后延迟 2 分钟执行 |

### 4.2 启动 Catchup 逻辑

**[F]**（[service/timer.ts:2011-2110](../../sources/openclaw/src/cron/service/timer.ts#L2011-L2110)）：

```typescript
export async function runMissedJobs(
  state: CronServiceState,
  opts?: { skipJobIds?: ReadonlySet<string>; deferAgentTurnJobs?: boolean },
): Promise<void> {
  if (state.stopped) return;
  const plan = await planStartupCatchup(state, opts);
  ...
}

async function planStartupCatchup(state, opts) {
  const maxImmediate = Math.max(
    0,
    state.deps.maxMissedJobsPerRestart ?? DEFAULT_MAX_MISSED_JOBS_PER_RESTART,
  );
  
  await locked(state, async () => {  // 互斥锁
    await ensureLoaded(state, { skipRecompute: true });
    const now = state.deps.nowMs();
    const missed = collectRunnableJobs(state, now, {
      skipJobIds: opts?.skipJobIds,
      skipAtIfAlreadyRan: true,                  // AT 任务只能跑一次
      allowCronMissedRunByLastRun: true,        // CRON 任务支持重跑
    });
    if (missed.length === 0) return { candidates: [], deferredJobs: [] };
    
    const sorted = missed.toSorted((a, b) => (a.state.nextRunAtMs ?? 0) - (b.state.nextRunAtMs ?? 0));
    
    // Agent jobs 可选延迟执行（防启动风暴）
    const deferredAgentJobs = opts?.deferAgentTurnJobs
      ? sorted.filter((job) => job.payload.kind === "agentTurn")
      : [];
    
    const startupCandidates = startupEligible.slice(0, maxImmediate);  // 取前 N 个
    const deferredOverflow = startupEligible.slice(maxImmediate);     // 剩下的 deferred
    
    // 应用 reservation
    const reservationRollbackSnapshot = snapshotStoreForRollback(state);
    for (const job of startupCandidates) {
      job.state.queuedAtMs = now;
    }
    await persistOrRestore(state, reservationRollbackSnapshot);  // 持久化 + 回滚快照
    
    return { candidates, deferredJobs };
  });
}
```

### 4.3 关键不变式

| 不变量 | 来源 |
| --- | --- |
| **启动期间最多 N 个 immediate job** | [timer.ts:2095](../../sources/openclaw/src/cron/service/timer.ts#L2095) |
| **Agent 任务强制延迟 2 分钟** | [timer.ts:2097-2101](../../sources/openclaw/src/cron/service/timer.ts#L2097-L2101) |
| **AT 任务在重启 catch-up 只跑一次** | [timer.ts:2078 `skipAtIfAlreadyRan: true`](../../sources/openclaw/src/cron/service/timer.ts#L2078) |
| **`MIN_REFIRE_GAP_MS = 2_000`** 防 spin-loop | [timer.ts:121](../../sources/openclaw/src/cron/service/timer.ts#L121) |
| **Catch-up 前先 `locked()`** | [timer.ts:2063](../../sources/openclaw/src/cron/service/timer.ts#L2063) |
| **`persistOrRestore(state, reservationRollbackSnapshot)`** — 失败回滚 | [timer.ts:2138](../../sources/openclaw/src/cron/service/timer.ts#L2138) |
| **执行后 `releaseStartupCatchupReservationsAfterFailure`** | [timer.ts:2024](../../sources/openclaw/src/cron/service/timer.ts#L2024) |

### 4.4 Finalization 错误处理

**[F]**（[timer.ts:2018-2041](../../sources/openclaw/src/cron/service/timer.ts#L2018-L2041)）：

```typescript
try {
  finalizedOutcomes = await applyStartupCatchupOutcomes(state, plan, execution.outcomes);
} catch (finalizationError) {
  if (execution.ok) {
    try {
      await releaseStartupCatchupReservationsAfterFailure(state, plan, execution.outcomes);
    } catch (cleanupError) {
      state.deps.log.warn(...);
    }
    throw finalizationError;
  }
  ...
}
```

**[I]** 这是典型的 **transaction rollback on error**：执行成功但 finalization 失败 → 释放 reservation；执行失败 → 同样释放 reservation。异常路径永不泄露 reservation。

## 5. Service 启动 / 停止 / 暂停

**[F]**（[service.ts:31-72](../../sources/openclaw/src/cron/service.ts#L31-L72)）：

```typescript
export class CronService implements CronServiceContract {
  private readonly state;
  private startInProgress = 0;
  private startState: { generation: number; promise: Promise<void> } | null = null;
  private lifecycleGeneration = 0;
  
  async start() {
    // generation guard: 不允许并发启动
    const generation = this.lifecycleGeneration;
    const pending = this.startState;
    if (pending) {
      try { await pending.promise; } catch (err) { ... }
      if (pending.generation === generation) return;
      await this.start();
      return;
    }
    const promise = this.startOnce(generation);
    this.startState = { generation, promise };
    try { await promise; } finally {
      if (this.startState?.promise === promise) this.startState = null;
    }
  }
  
  private async startOnce(generation: number) {
    this.startInProgress += 1;
    this.state.schedulerStarted = false;
    try {
      await ops.start(this.state);
      if (generation !== this.lifecycleGeneration) {
        ops.stop(this.state);  // 并发停止 → 自动 stop
        return;
      }
      this.state.schedulerStarted = !this.state.stopped;
    } finally { this.startInProgress -= 1; }
  }
  
  stop() {
    this.lifecycleGeneration += 1;
    ops.stop(this.state);
  }
}
```

**[I]** **generation counter + startState promise** 防止并发启动。`stop()` 单调增 `lifecycleGeneration`，下次 `start()` 检查时若不一致就 stop。

## 6. 与 RoboThree 的相关性

### ADOPT（直接采纳）

| 机制 | 理由 |
| --- | --- |
| **SQLite-only 持久化（无 JSON）** | 避免双写、一致性问题 |
| **Partial index `enabled + next_run_at_ms`** | 调度查询 O(log n) |
| **`MIN_REFIRE_GAP_MS` 防 spin-loop** | 简单但必须的安全护栏 |
| **`locked(state, fn)` 互斥锁** | 调度器单一线程模型 |
| **`persistOrRestore(state, snapshot)`** | 失败自动回滚 |
| **Generation counter 启动/停止** | 防并发 reentrant |
| **quarantine 隔离无效配置** | 不让一个错的任务毁掉整个调度器 |

### ADAPT（借鉴并适配）

| 机制 | 适配方案 |
| --- | --- |
| **`schedule.kind: 'on-exit'` trigger** | RoboThree MVP 不实现，等 Phase 2 需要 process supervision 时再添加 |
| **Restart catch-up 分批策略** | 采用 5 限制 + 5s stagger + 2min agent delay，但 RoboThree 可简化为"全部按 next_run_at_ms 顺序触发一次" |
| **`session_target: 'isolated'` 主从隔离** | 直接采用，后台任务用独立 session |
| **`wake_mode: 'next-heartbeat'`** | 简化实现：用 last_activity_ts + idle_threshold 检查 |
| **`payload.kind: 'agentTurn' | 'systemEvent'`** | 简化为单一 `kind: 'task'` type |
| **`payload_model + payload_fallbacks`** | Phase 1 不实现 model fallback；单一 model |

### DEFER（推迟）

| 机制 | 理由 |
| --- | --- |
| **Failure alert 整套（multi channel, cooldown, include_skipped）** | RoboThree MVP 只需"发送失败告警到指定 channel" |
| **`staggerMs` per-cron-expr 配置** | 全局 stagger 足够 |
| **`schedule.tz` 时区支持** | MVP 用 UTC，加固定 offset 即够 |
| **Delivery `{ mode: "webhook" }` 完整实现** | 仅实现 `announce`（chat 通知） |
| **`on-exit` event-driven trigger** | 非 MVP 必须 |

### REJECT（不采纳）

| 机制 | 理由 |
| --- | --- |
| **`clearOversizedKeys/LRU complex compaction`** | SQLite 默认足够，RoboThree 用 DB 默认即可 |

### NEEDS_MORE_EVIDENCE

| 机制 | 缺失证据 | How to Close |
| --- | --- | --- |
| **`releaseStartupCatchupReservationsAfterFailure` 的具体实现** | 未深挖 reservation idempotency 细节 | 继续读 [service/timer.ts](../../sources/openclaw/src/cron/service/timer.ts) |
| **`locked()` 实际使用的是 Kysely 锁还是 DB-level lock** | 影响多进程部署时能否安全并发 | 读 [service/locked.ts](../../sources/openclaw/src/cron/service/locked.ts) |
| **Job JSON schema 演进路径** | `job_json TEXT` 作为完整备份，但 schema 变更时如何 backfill？ | 重读 store/migration 代码 |

## 7. 工程含义

**[I]** 对 RoboThree 而言，这意味着真正的 Background Tasks 系统需要：

1. **调度必须有持久化层**——重启不丢任务
2. **调度必须有重启恢复策略**——避免启动期过载
3. **失败重试必须隔离**——不影响其他任务
4. **任务配置无效必须隔离**——不让一个坏配置毁掉整个队列
5. **任务执行必须有 reservation**——避免同一任务并发执行

**[R]** 对 RoboThree MVP 建议：

### 直接采纳
- **SQLite-only 持久化**（单一真相，避免双写）
- **持久化 + 运行时一致 schema**（不是 job_json 作为 truthful source）
- **partial index on `(enabled, next_run_at_ms)`**
- **`locked()` 锁**（单一调度线程模型）
- **`MIN_REFIRE_GAP_MS`** spin-loop 保护
- **quarantine 隔离**（让一个错误配置不毁整个系统）

### 简化但不丢核心
- **重启 catch-up 简化为单批 catch-up**（无 5 限制，但保留 stagger）
- **延期 AT jobs 跳过** —— 直接保留 AT jobs 不变
- **`isolated` session** —— 完全采用

### 推迟到 Phase 2
- **Model Fallback** —— MVP 单一 model
- **Failure alert 完整实现** —— MVP 仅发送失败告警
- **stagger + 时区 + webhook delivery** —— 用全局配置即可

### 不要做
- **`on-exit` event-driven trigger** —— 非 MVP 必须

**[R]** **RoboThree Cron MVP 阶段最小任务 Schema**：

```typescript
type CronJob = {
  id: string;
  schedule:
    | { kind: "at"; at: string }
    | { kind: "every"; everyMs: number }
    | { kind: "cron"; expr: string };
  session: { target: "isolated" | "main"; binding?: string };
  payload: {
    type: "message" | "task";
    content: string;
    model?: string;          // 仅 isolated 模式需要
  };
  delivery: { channel?: string; to?: string };
  state: {
    nextRunAtMs: number;
    lastRunAtMs?: number;
    lastRunStatus?: "ok" | "failed" | "skipped";
    lastError?: string;
    consecutiveErrors: number;
  };
  enabled: boolean;
  createdAtMs: number;
};
```
