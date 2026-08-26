# RoboThree ARH-3.3.2 Recovery、Usage 与 Compaction Matrix Development Plan

## 1. 文档状态

```text
状态：PASS/CLOSED
日期：2026-08-15
前置：ARH-3.3.0、ARH-3.3.1 PASS/CLOSED
ARH-3.3.2：PASS/CLOSED
0.0.0-arh.3.3.2-preflight-repair.1：PASS/CLOSED
0.0.0-arh.3.3.2-preflight-repair.2：PASS/CLOSED
ARH-3.3.3：IMPLEMENTED / DEVELOPER GATES PASS / READY_FOR_INDEPENDENT_QA
CTR-P3-001：独立测试可靠性维护项，不属于 ARH-3.3.2
```

本文件只冻结 ARH-3.3.2 的实现范围、真实进程拓扑、M1～M8 恢复分类、Usage/Compaction
隔离矩阵和验收门槛。文档评审 PASS 不自动授权编码；必须由用户接受本计划并单独授权
ARH-3.3.2。ARH-3.3.3 已完成开发者门禁并等待独立 QA。

> 2026-08-15 前置代码核查更正：评审时引用的“Usage Projection 先于 durable cursor”并非当时
> 生产代码事实；Assistant 与 Compaction 路径当时均先推进 cursor。用户已授权独立
> `0.0.0-arh.3.3.2-preflight-repair.1` 修复该 P1。Claude Code 已独立串行复跑专项、完整
> Workspace 与 Central online/offline，结论 `P0～P3=0`；用户已正式接受并关闭 repair.1，
> ARH-3.3.2 主 Harness 恢复开发。本更正不改写原评审历史。

> 2026-08-15 真实 Central 接缝核查新增 P1：Central 将 Usage 与 terminal 同事务提交，而 Core
> Assistant/Compaction 路径会在 `outputStartedAt` 已存在或 status 为 `completed` 时，于 durable
> Event 回放前直接退出，导致 M3/M4 的未消费 Usage 无法重放。已建立
> [repair.2 方案](./ARH-3.3.2-PREFLIGHT-REPAIR.2-DURABLE-USAGE-RECONCILIATION-PLAN.md)；
> 用户已明确授权 repair.2；修复只补偿 terminal 下未消费的 durable Usage/cursor，不恢复
> ephemeral output。Claude Code 独立 QA `P0～P3=0`，用户已正式接受并关闭 repair.2，主
> Harness 恢复开发。

## 2. 阶段目标

ARH-3.3.1 已证明两个 Core、双 Central JVM、共享 PostgreSQL、独立 SQLite、受控 Provider、
三 Session 与两 user/enterprise scope 可以同时存在且基础事实不串线。ARH-3.3.2 不再增加
新的运行时能力，而是把既有 ARH-2、ARH-3.1、ARH-3.2 和 CGF-2 recovery 事实放进同一
真实进程恢复矩阵，回答：

> 当 Central、Core、PostgreSQL 和 Compaction 分别在命名窗口中退出或暂时不可用时，
> terminal、Usage、Projection、Cache Context、Summary 与 raw tail 是否仍能从 durable facts
> 精确收敛，并保持 Session、attempt、authority 和 generation 隔离？

本批完成后仍不关闭 ARH-3.3；三轮 semantic seed、完整敏感扫描、长稳资源归零和阶段关闭
Evidence 属于 ARH-3.3.3。

## 3. 现有代码事实

### 3.1 已具备

1. `ModelInvocationRuntime.commitTerminal()` 已在 Central 单一事务中提交 Provider Usage Fact、
   `usage_recorded` durable Event、terminal Event、Outbox、Invocation terminal 和 lease 状态；
2. Central 已有双 JVM、共享 PostgreSQL、lease takeover、fencing、Provider Relay 与 Testcontainers
   pause/unpause 的进程外 Harness 基础；
3. 前置核查发现 `DurableEnterpriseModelProvider` 原先在 Assistant 与 Compaction 两条路径中均
   先推进 durable cursor、再写 Core Usage Projection，存在崩溃后永久跳过 Projection 的 P1；
   `0.0.0-arh.3.3.2-preflight-repair.1` 已调整为 Projection 先提交、再原子推进 cursor/
   `outputStartedAt`，并以 Projection 前、Projection 后 cursor 前两类故障和 SQLite reopen
   回归证明；独立 QA 与用户接受均已完成，repair.1 已正式关闭；
4. Core migration 20 已持久化 invocation-level Usage Projection，Session aggregate 由这些事实
   确定性重建；
5. ARH-2 migrations 18/19、`CompactionExecutionBinding`、Compaction Model Link、first/rolling
   Summary、`ContextPreparationCoordinator` 与 W1～W7 恢复语义已在位；
6. ARH-3.2 已建立 exact Session cache context、immutable Cache Plan、C1～C10 和 Provider Usage
   事实；
7. ARH-3.3.1 已建立安全 Evidence schema、A1/A2/B1 deterministic topology 和受控子进程生命周期。

### 3.2 当前缺口

1. ARH-3.3.1 Core child 直接写入合成 Usage Projection，尚未通过真实 Central durable Event →
   `DurableEnterpriseModelProvider` → Core SQLite 链路；
2. 现有 Central 和 Core recovery Harness 分别运行，缺少同一 scenario identity 下的跨进程
   terminal/Usage/Projection 对账；
3. M1～M8 尚未在 ARH-3.3 拓扑中真实触发，3.3.1 Evidence 明确为
   `namedCrashWindows=[]`；
4. main、initial Compaction、rolling Compaction 虽各自有事实结构，但尚未在三 Session 拓扑中
   证明 link、attempt、Usage 与 Summary source range 不串线；
5. hit/miss/disabled/unsupported 与 missing Usage 尚未在相同 semantic request 下统一对账；
6. 3.3.1 只证明单次拓扑基础，不负责 3.3.3 的三轮 semantic seed 和最终阶段关闭证据。

## 4. 冻结原则

1. **Evidence-first**：只增加 test fixture、受控 child、Harness runner、测试侧 adapter/barrier、
   Conformance 和治理文档；不修改生产语义。唯一例外是用户单独授权的
   `0.0.0-arh.3.3.2-preflight-repair.1`，其验收完成后才恢复本批；
2. **真实进程死亡**：M1～M5、M7、M8 必须由父进程在命名 barrier 后终止目标 child/JVM；只用
   `throw` 不算进程级恢复证明；
3. **真实数据库恢复**：Central 使用共享 PostgreSQL 16，Core 使用各自 SQLite close/reopen；
   M6 使用隔离 Testcontainers PostgreSQL pause/unpause；
4. **status-first**：恢复方先读取 durable status/Event/cursor，再决定 replay、takeover 或失败关闭；
   不盲目重复 Provider 调用；
5. **不宣称 exactly-once**：只证明稳定 logical identity、幂等事实写入、单 terminal winner 和
   evidence-based recovery；
6. **单一事实源**：Central Provider Usage Fact 是企业模型 usage 权威；Core Projection 是可重建
   派生事实，不建立第二份费用真相；
7. **Summary 低权限**：Compaction Summary 仍是低权限派生 context，不作为授权、Tool Result、
   Receipt 或持久 Message；
8. **测试 barrier 不入生产**：新 barrier 只能存在于 `src/test`、`tests/fixtures` 或 Harness 私有
   进程协议；生产 Controller、Runtime、Port、Contract 不增加测试开关；
9. **不通过 retry 掩盖失败**：每个命名窗口最多执行计划内的确定性 recovery；不得用无界 retry
   把 `CTR-P3-001` 或真实产品失败跑绿；
10. **后续批次隔离**：ARH-3.3.2 不做三轮 semantic seed、最终长稳、阶段关闭声明或 3.3.3
    报告聚合。

## 5. 统一 Harness 拓扑

### 5.1 拓扑所有权

ARH-3.3.2 采用一个 test-only Java topology coordinator 作为进程生命周期所有者：

```text
ARH-3.3.2 Harness Runner (Node)
└── Java Topology Coordinator (JUnit / test source only)
    ├── PostgreSQL 16 Testcontainer
    ├── Central JVM A
    ├── Central JVM B
    ├── Controlled Provider / Relay Process
    ├── Core Child A + SQLite A
    └── Core Child B + SQLite B
```

选择 Java coordinator 的原因：现有双 JVM、Hikari Pool、共享 PostgreSQL、lease/fencing、容器
pause/unpause 和 test-profile Token Seed 都在 Java Harness 中。Coordinator 通过 test-only
NDJSON stdin/stdout 控制 Core child，不把 Access Token、端口、PID 或路径写入最终 Evidence。

Node runner 只负责：构建、调用指定测试类、解析唯一安全结果行、校验 Evidence schema、执行
敏感扫描并输出最终机器可读 Evidence。它不成为第二个 recovery coordinator。

### 5.2 Core child

ARH-3.3.2 新建独立 fixture，不改写 3.3.1 baseline fixture。Core child 必须使用：

- `DurableEnterpriseModelProvider`；
- `HttpEnterpriseModelGatewayClient`；
- `SqliteConversationPersistence`；
- `SqliteModelInvocationLinkPersistence` 与 Compaction Link；
- `SqliteProviderUsageProjectionPersistence`；
- `SqlitePromptCacheContextPersistence`；
- `ContextPreparationCoordinator`、`CompactionCoordinator` 和锁定的 execution binding。

测试侧只允许在 Persistence/HTTP Port 外包一层 barrier decorator；decorator 不改变 digest、
返回值、错误码或持久语义。

### 5.3 私有控制协议

私有 NDJSON 只允许：

```text
initialize / run_scenario / arm_barrier / release_barrier / stop
ready / barrier_reached / scenario_completed / resource_metrics / fatal
```

协议只存在于 test fixture，不进入公共 Contract。初始化材料通过 stdin 传递，禁止写入环境变量、
命令行参数、普通日志或最终 Evidence；所有 child stdout/stderr 有界捕获并参与 canary 扫描。

## 6. M1～M8 恢复矩阵

| 窗口 | 真实触发 | 重启后必须成立 | 禁止结论 |
| --- | --- | --- | --- |
| M1 | Provider 已返回 terminal；Central A 在 terminal transaction 前的 test backend barrier 被终止 | PostgreSQL 无 terminal/Usage/Event/Outbox 假事实；B 取得新 lease 后按既有 recovery mode 查询 Provider，再产生最多一个 winner | 不得假设 Provider 未执行，不得直接重发不可查询副作用 |
| M2 | Central terminal transaction 已提交；test-only HTTP wrapper 在响应返回前终止 A | B status-first 返回同一 terminal；Usage Fact、usage Event、terminal Event、Outbox 各精确一次 | 不得创建新 invocation/attempt 或第二 terminal |
| M3 | Core 已收到 `usage_recorded`；barrier 在 Projection delegate 前终止 Core | local cursor 未越过该 Event；重启后重放并写入一次 Projection | 不得把缺 Projection 当 usage=0 |
| M4 | Projection delegate 已提交；barrier 在 link cursor 推进前终止 Core | 同 Event 重放命中幂等；Projection/Session aggregate 不重复，cursor 最终推进 | 不得用进程内 Set 去重 |
| M5 | Central A 持有旧 lease；B takeover 后释放 A 的迟到提交 | B 成为唯一 terminal winner；A 只能写 `superseded_confirmed` 或收到 fencing conflict，不能覆盖 winner | 不得降低 fencing epoch 或放宽 CAS |
| M6 | 运行中 pause PostgreSQL Testcontainer 后再 unpause | 两 Central readiness 降级后恢复；原 invocation identity 不变，不静默换 Binding/Model；恢复后 status-first 收敛 | 不得自动创建新 invocation，不得把连接异常写成业务 terminal |
| M7 | Core SQLite 在 Projection/cache context/Conversation facts 已提交后关闭 Core child | 新 PID reopen 同一 SQLite；Session、link、Projection、cache context 与 active Compaction view digest 一致 | 不得从 UI/内存缓存重建权威事实 |
| M8 | rolling Summary 第二事务已提交；下一主 Model invocation 前终止 Core | 重启后 Summary + raw tail/source digest 稳定；主调用只创建一个 logical link，Assistant terminal 最多一次 | 不得重做已提交 Summary，不得把 Summary 提升为 system authority |

M1/M2 的 barrier 必须在 test-only Central application/controller wrapper；M3/M4 在 test-only
`ProviderUsageProjectionPersistence` decorator；M8 在 test-only Agent Loop/Context preparation
边界。禁止修改生产 `ModelInvocationRuntime`、`DurableEnterpriseModelProvider` 或 Kernel 以增加
故障点。

## 7. Usage 与 attempt 对账

### 7.1 三类调用

同一 A1 Session 至少形成：

1. main invocation；
2. initial Compaction invocation；
3. rolling Compaction invocation。

三类调用必须拥有不同 invocation link、clientRequestId、Provider attempt 与 Usage Event；同时
共享正确的 exact Session scope，但不得共享 purpose-bound admission 或 Compaction source range。

### 7.2 必须证明

- same attempt + same usage digest：幂等 replay，Fact/Projection 数量不增长；
- same attempt + different digest：typed conflict，旧事实不变；
- different attempt：分别保留；
- stale owner：只能产生 `superseded_confirmed`，不进入 Session winner aggregate；
- terminal winner：恰好一个 authority Fact 与一个 Core Projection；
- Session aggregate：只从 invocation-level winner Projection 确定性重建；
- A1/A2/B1：Fact、Projection、aggregate、attempt identity 均按 Session/user/enterprise 隔离；
- `central_enterprise` 与 `local_personal`：即使 semantic input 相同也不共享 attempt、Credential、
  cache context 或 Usage authority；本批个人路径仍只用 Port/Fake。

## 8. Cache 与 Provider Usage 状态

受控 Provider 对同一 semantic request 分别产生：

```text
cache_hit / cache_miss / cache_disabled / cache_unsupported / usage_missing
```

必须满足：

- semantic request digest 不因命中状态改变；
- hit/miss 只由 Provider Usage Fact 证明，不由 Plan 本地估算；
- disabled/unsupported 不发送未允许的 Provider cache 字段；
- missing Usage 保持 `unknown`，不得伪造为 0；
- cache status 不改变 terminal、Assistant Message 或 Tool 语义；
- exact Session、source lock、prefix、Profile/Binding revision 变化仍遵守 ARH-3.2 四层 identity；
- 本批不调用真实付费 Provider，也不声明生产 cache 命中率或节省金额。

## 9. Compaction 恢复

### 9.1 Initial + rolling

- initial：source range 必须是从 sequence 1 开始的旧完整原子前缀；
- rolling：摘要输入只包含 base Summary + raw extension，不重发已压缩原始前缀；
- 新 Record 仍证明 `1..newEligibleEndSequence` 的完整 immutable source range；
- Summary、raw tail、source digest、execution binding digest、Compaction link 和 Usage Projection
  在重启前后必须一致；
- Tool Call/Result、waiting confirmation 和 open atomic group 不得跨压缩边界。

### 9.2 M8 收敛

M8 只在 rolling Summary 已 durable commit、下一主调用尚未创建时触发。恢复顺序固定为：

```text
reopen SQLite
→ load active Compaction Record + exact ExecutionBinding
→ rebuild Summary + raw tail view
→ verify source/cache/usage digests
→ create or replay exactly one logical main invocation link
→ continue Agent Loop
```

若 digest、Binding、Registry revision 或 source range 漂移，必须失败关闭；不得静默选择新模型、
新 Binding 或重新生成 Summary。

## 10. Evidence Contract

### 10.1 允许输出

```text
schemaVersion / status / scenarioCount / passedScenarioCount
sessionCount / userScopeCount / enterpriseScopeCount
invocationCount / attemptCount / usageFactCount / projectionCount
cachePlanCount / compactionCount / durableTerminalCount
normalizedTimelineDigest / viewDigest / sourceDigest / usageDigest / cacheDigest
namedCrashWindows[] / typedErrorCodes[]
resourceMetrics / durationMs / sensitiveOutputMatchCount
```

### 10.2 禁止输出

用户/Assistant 正文、Prompt、Tool 参数/结果、Summary、Skill/Knowledge/Workspace 内容、Provider
原始响应、API Key、Token、Credential、Endpoint、完整路径、PID、端口、数据库 URL、canary。

每个 M 窗口必须输出 scenario-local digest/count，再由 runner 归一化聚合。Digest 不能代替独立 QA
重跑，也不能把 wall-clock、PID、端口、requestId 或 transport requestId 纳入 semantic digest。

## 11. 预计修改范围

允许新增或修改：

```text
scripts/run-arh332-harness.mjs
services/core/tests/arh3.3.2-*.test.ts
services/core/tests/fixtures/arh332-*.mjs
services/central-service/src/test/java/**/Arh332*Test.java
services/central-service/src/test/java/**/Arh332*Harness*.java
package.json                         # 仅新增专项脚本与实施批次版本
services/core/package.json           # 实施批次版本
services/central-service/pom.xml      # 实施批次版本
docs/development/arh/**
docs/development/DEVELOPMENT-LOG.md
docs/architecture/KEY-NODES.md
docs/architecture/UPSTREAM-ADOPTION-REGISTER.md
README.md
CHANGELOG.md
```

禁止修改：

```text
packages/contracts/src/**
contracts/**
services/core/src/kernel/**
services/central-service/src/main/**
Core/Central schema 与 migration 1～21 / v0001～v0009
apps/desktop/**
生产依赖与 lockfile
```

如果真实 Harness 暴露生产缺陷，立即停止 ARH-3.3.2，记录独立 issue/repair 方案并等待用户授权；
不得借本批测试范围直接修改生产代码。

### 11.1 已授权前置修复例外

`0.0.0-arh.3.3.2-preflight-repair.1` 只允许修改
`services/core/src/application/durable-enterprise-model-provider.ts` 及其专项测试，把 Assistant /
Compaction `usage_recorded` 收敛为 Projection-before-cursor；公共 Contract、Schema/migration、
Kernel、Desktop、Central、依赖和 lockfile 必须保持不变。repair 独立 QA PASS 且用户接受后，
才恢复 Step 1～5。

## 12. 实施步骤

### Step 1：Topology 与 test-only control foundation

- 新增 ARH-3.3.2 Core child 与 Java topology coordinator；
- 冻结 test-only NDJSON control schema、bounded output 和提前退出诊断；
- 复用 3.3.1 deterministic topology，证明无 M 窗口时结果等价；
- 新增 architecture guard：test barrier、Harness Controller、canary 不得进入 production source。

### Step 2：Central M1/M2/M5/M6

- 接入 Provider Relay、terminal transaction、Usage Ledger、Event/Outbox 与双 JVM lease；
- 真实触发 M1/M2/M5；
- 在隔离 Testcontainers PostgreSQL 上触发 M6；
- 每个窗口完成 status-first、Fact/Event/Outbox/terminal 和 fencing 对账。

### Step 3：Core M3/M4/M7

- 让 Core child 通过真实 Gateway durable Event 消费 Usage；
- 用 test-only Projection decorator 触发 M3/M4；
- close/reopen SQLite 触发 M7；
- 验证 cursor、Projection、Session aggregate、cache context 与 Conversation facts 收敛。

### Step 4：Compaction、Cache 与 M8

- 在 A1 实际触发 initial + rolling Compaction；
- 触发 M8 并恢复 Agent Loop；
- 完成 main/initial/rolling Usage、link、attempt、source/cache digest 对账；
- 完成 hit/miss/disabled/unsupported/missing Usage 矩阵。

### Step 5：Evidence 与治理收口

- 输出 ARH-3.3.2 安全机器 Evidence；
- 增加 canary/credential/body/path 四通道扫描和资源计数；
- 更新版本、CHANGELOG、Development Log、KEY-NODE 与上游登记；
- 运行开发者完整门禁，状态保持 `INDEPENDENT QA PENDING`。

## 13. QA 验收矩阵（52 项）

### 13.1 Topology 与边界（1～8）

1. 双 Core 独立进程/SQLite；2. 双 Central JVM独立进程/池；3. 只共享 PostgreSQL；
4. Provider 独立进程；5. A1/A2/B1 与两 scope；6. Core 使用真实 Gateway durable Event；
7. test barrier 在生产源码零命中；8. 3.3.1 baseline 全量回归。

### 13.2 M1～M8（9～24）

每个窗口两项：真实 barrier/进程死亡证据，以及重启后 durable facts/typed recovery 断言。

### 13.3 Usage 与 attempt（25～36）

25. main Usage；26. initial Compaction Usage；27. rolling Compaction Usage；28. 三类 link 隔离；
29. same attempt same digest；30. same attempt different digest；31. different attempts；
32. terminal winner；33. superseded confirmed；34. Session aggregate 重建；35. 三 Session 隔离；
36. enterprise/local_personal authority 隔离。

### 13.4 Cache、Compaction 与安全（37～46）

37. cache hit；38. miss；39. disabled；40. unsupported；41. missing Usage unknown；
42. semantic request 不变；43. first + rolling source range；44. Tool Call/Result 原子边界；
45. M8 Summary + raw tail digest；46. Binding/Registry drift fail-closed。

### 13.5 回归与资源（47～52）

47. Evidence allowlist；48. 四通道敏感扫描 0；49. child/connection/lease/subscriber/buffer/timer 归零；
50. Workspace 完整门禁；51. Central online/offline 串行门禁；52. 公共 Contract、Schema/migration、
Kernel、Desktop、生产 recovery 与 `CTR-P3-001` 边界无漂移。

独立 QA 必须实际重跑专项 Harness 和完整门禁；历史报告、开发者输出或 digest 不得替代执行。
M6 的容器 pause/unpause 只允许在隔离 Testcontainers PostgreSQL 中执行，并需在 QA 执行前确认
已获得该次故障测试授权。

## 14. 开发者验证命令

```bash
pnpm run harness:arh3.3.2
pnpm run check
pnpm run check:central
pnpm run check:central:offline
```

执行环境：Node `24.13.0`、pnpm `11.11.0`、Java 21、Docker/Testcontainers PostgreSQL 16。
online/offline 必须串行执行，不共享或并发覆盖 Surefire 报告目录。

## 15. 非目标

- 修改生产 recovery mode、Provider Adapter、事务边界、fencing 或 retry 策略；
- 新增公共 Contract、Schema/migration、生产依赖或第三方库；
- 真实个人 Provider、真实个人 Credential Store 或个人 Usage 权威表；
- 真实付费 Provider cache、费用、账单或运营报表；
- 跨 Session cache、跨用户/企业共享、自动 Model/Binding fallback；
- UI、PRD、Admin、Usage 页面、缓存设置；
- ARH-3.3.3 三轮 semantic seed、长稳关闭 Harness 和 ARH-3 阶段关闭；
- `CTR-P3-001` 修复。

## 16. PRD/UX 依赖

本批不依赖 PRD/UX，不增加用户页面、交互、设置或产品能力。任何 Usage/费用/缓存可视化必须
另行完成 PRD/Feature Spec，不得由 Harness 字段反向定义产品界面。

## 17. 上游与既有登记

复用：

- AR-057：ARH-2.2 automatic Compaction orchestration；
- AR-058：ARH-3.1 durable Usage facts 与 retry dedupe；
- AR-059～061：exact Session scope、Prompt Cache Planner、Provider projection；
- AR-062：ARH-3.3.1 Multi-Session Topology Foundation；
- ADR-017、CGF-2A/2B/2C 和 ARH-2.3 recovery Harness。

本 docs-only 计划不预占新 AR 编号；实施后用下一个可用编号登记。不得复制第三方源码、DTO、
Fixture、SQL、Prompt 或 Provider SDK。

## 18. 工期评估

| 工作 | 集中工程工作量 |
| --- | --- |
| test-only topology/control foundation | 1～2 天 |
| M1/M2/M5/M6 Central matrix | 1～2 天 |
| M3/M4/M7 Core matrix | 1～2 天 |
| M8 + Usage/Cache/Compaction 对账 | 1～2 天 |
| Evidence、回归与文档 | 1 天 |
| 合计 | **5～9 工程工作日** |

父计划原估 2～3 天只适用于复用孤立测试并聚合结果。代码核实后，本方案选择真实 Central durable
Event → Core Projection 和真实进程死亡，而不是简单拼接历史报告，因此调整为 5～9 个集中工程
工作日。该估算不含文档评审、独立 QA、资源等待与返工，不是日历交付承诺。

## 19. 文档评审问题

请 Claude Code 重点核实：

1. Java topology coordinator 是否是复用双 JVM/Testcontainers 基础的最小可行所有者；
2. M1/M2 的 barrier 是否真实位于 terminal transaction 两侧且不要求生产测试开关；
3. M3/M4 是否精确利用“Projection 写入先于 durable cursor 推进”的当前代码顺序；
4. M5/M6 是否复用既有 lease/fencing/readiness，不改变生产恢复语义；
5. M7/M8 是否覆盖 SQLite reopen 和 rolling Summary 后首次主调用；
6. main/initial/rolling Usage 与 link/attempt/source range 是否充分隔离；
7. hit/miss/disabled/unsupported/missing Usage 是否不伪造 Provider 事实；
8. 52 项 QA 是否覆盖父计划 13～32 项且没有提前实现 3.3.3；
9. 5～9 工程工作日是否符合真实跨语言进程 Harness 工作量；
10. 是否存在 P0/P1，或需要用户重新决策的 P2。

## 20. 当前门槛

```text
ARH-3.3.0：PASS/CLOSED
ARH-3.3.1：PASS/CLOSED
ARH-3.3.2 plan：PASS/CLOSED / USER CONFIRMED
ARH-3.3.2 coding：PASS/CLOSED
0.0.0-arh.3.3.2-preflight-repair.1：PASS/CLOSED
0.0.0-arh.3.3.2-preflight-repair.2：PASS/CLOSED
ARH-3.3.3 plan：PASS/CLOSED
ARH-3.3.3 coding：IMPLEMENTED / DEVELOPER GATES PASS / READY_FOR_INDEPENDENT_QA
CTR-P3-001：OPEN / NON-BLOCKING / OUT OF ARH-3.3.2 SCOPE
```

repair.1、repair.2 均已独立 QA PASS 并由用户正式接受关闭。ARH-3.3.2 专项 **52/52 场景**、
Core **79 tests**、Central **27 tests**、Workspace **164 files / 1155 tests + 3 smoke**、Central
online/offline **299/0/0/0** 已通过开发者门禁；Claude Code 独立 QA 已串行复跑同一门禁并确认
`P0～P3=0`，用户已正式接受并关闭 ARH-3.3.2。ARH-3.3.3 已完成开发者正式门禁，当前等待
独立 QA；独立 QA 与用户接受前 ARH-3.3/ARH-3 不关闭。
