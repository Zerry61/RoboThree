# RoboThree ARH-3.3.3 Unified Closure Evidence 与 Semantic Replay Stability Development Plan

## 1. 文档状态

```text
状态：repair.1、ARH-3.3.3、ARH-3.3、ARH-3 PASS/CLOSED
日期：2026-08-16
前置：ARH-3.3.0、ARH-3.3.1、ARH-3.3.2 PASS/CLOSED
ARH-3.3.3：PASS/CLOSED
0.0.0-arh.3.3.3-repair.1：INDEPENDENT QA PASS / USER ACCEPTED / CLOSED
ARH-3 / ARH-3.3：PASS/CLOSED
CTR-P3-001：独立测试可靠性维护项，不属于 ARH-3.3.3
```

本文件只冻结 ARH-3.3.3 的阶段关闭证据、三轮 semantic replay、长稳资源门槛、泄漏扫描和
独立 QA 范围。repair.1 已通过独立 QA 并由用户正式接受，ARH-3.3.3、ARH-3.3 与 ARH-3
已经依次关闭。

### 1.1 Revision 1 修订摘要

Claude Code 首轮评审结论为 `PASS（P0=0 / P1=0 / P2=2 / P3=2）`。用户已明确接受
“30 分钟且至少 5 个 lifecycle cycle”的新增阶段关闭门槛。本次 Revision 1 同时吸收：

1. 将真实资源诊断明确为 test-only `ResourceDiagnosticsAdapter`，禁止继续用硬编码 0 作为
   资源归零证据；
2. 量化每个 lifecycle cycle 必须产生的 durable fact 与恢复事实；
3. 补充父计划 36 项与 ARH-3.3.2 52 场景的包含映射；
4. QA 从至少 50 项增至至少 52 项；
5. 工期从 4～7 个工程工作日调整为 5～8 个工程工作日，真实资源诊断作为主要不确定性来源。

Revision 1 仍是 docs-only，不修改代码、测试、Contract、Schema/migration、依赖或版本。

### 1.2 repair.1 收口

Claude Code 独立 QA 在正式长稳第 26 个轻量 cycle 复现 `awaitFailpointBlocked` 时序超时，用户
接受 FAIL 并将其确认为当前阶段 P1，只授权 `0.0.0-arh.3.3.3-repair.1` 完成两项修复：

1. test-only failpoint 使用不可复用 `sessionId` 和单次 latch wait 形成确定性
   `configure → await-blocked → release` 握手；stale/mismatch 失败关闭，不再轮询全局 blocked
   状态；
2. 四通道泄漏扫描精确覆盖 process output、child log/trace、test/machine evidence、safe JSON/
   diagnostics，并对 canary、credential、provider endpoint、content body、absolute path 五类
   marker 检查 raw、Base64 与 URL-encoded 形态。

repair.1 不延长轮询、不自动重试、不删除 takeover，也不修改生产代码、公共 Contract、Schema/
migration、Kernel、Desktop、依赖或 lockfile。开发者正式 Harness 已从零通过三轮 semantic
replay、52/52 场景和 86 个轻量长稳 cycle，共 89 lifecycle cycles；四通道命中与八类资源余量
均为 0。该开发者结果当时只使 repair.1 进入独立 QA；后续独立 QA 与用户接受现已完成。

## 2. 阶段定位

ARH-3.3.1 已证明多 Session、双 Core、双 Central、共享 PostgreSQL、独立 SQLite 与企业/个人
authority 的基础隔离；ARH-3.3.2 已把 M1～M8、三类 invocation、五类 cache 状态、Usage、
Compaction 与双数据库恢复放入统一矩阵。

ARH-3.3.3 不再增加 Runtime 功能，只回答最后一个阶段关闭问题：

> 在全新进程、全新临时存储和相同 semantic seed 下，完整恢复矩阵连续真实执行时，最终 durable
> 事实、Projection、Summary view、Usage 与 cache identity 是否确定性收敛，且没有敏感信息泄漏、
> 资源增长或范围漂移？

目标闭环：

```text
ARH-3.3.1 topology facts
        +
ARH-3.3.2 M1～M8 recovery matrix
        ↓
fresh isolated run × 3 with one semantic seed
        ↓
actual durable fact normalization + semantic digest equality
        ↓
extended stability + four-channel leak scan + resource zero
        ↓
Workspace / Central online / Central offline serial gates
        ↓
Independent QA actual rerun + user acceptance
        ↓
ARH-3.3 and ARH-3 may close
```

## 3. 当前代码事实与必须关闭的缺口

### 3.1 已有事实

1. `harness:arh3.3.1` 已形成多 Session topology、隔离计数和安全 Evidence；
2. `harness:arh3.3.2` 已串行执行 Core 79 tests、Central 27 tests，覆盖 M1～M8 和 52 个场景；
3. ARH-3.3.2 已证明 repair.1/repair.2 的 Projection-before-cursor 与 status-first durable Usage
   reconciliation 保持生效；
4. ARH-2.3 已具备真实 Core child、SQLite reopen、first/rolling Compaction 和 semantic seed
   归一化经验；
5. Central 已具备双 JVM、共享 PostgreSQL、Provider Relay、lease/fencing、pause/unpause 和资源
   收口 Harness；
6. 当前完整门禁为 Workspace 164 files / 1155 tests + 3 smoke，Central online/offline 各
   299 tests；
7. ARH-3.3.2 已由 Claude Code 独立 QA 验证，`P0～P3=0`，并由用户正式接受关闭。

### 3.2 现有 Evidence 的边界

ARH-3.3.2 的顶层 `normalizedTimelineDigest` 目前由矩阵 revision、测试文件、测试类、命名窗口与
scenario ID 计算。它可以证明：

- 执行的是同一组冻结矩阵；
- scenario 定义和测试选择没有静默漂移。

但它不能单独证明：

- 三次真实运行后的 durable terminal、Usage、Projection、Summary view 和 cache facts 相同；
- 不同进程调度下，最终业务事实仍确定性收敛；
- 连续运行没有资源增长或泄漏。

因此 ARH-3.3.3 必须严格分离：

```text
matrixDefinitionDigest
= 冻结矩阵、场景和实现选择的 digest

semanticResultDigest
= 每轮真实 durable 结果归一化后的 digest
```

不得用 `matrixDefinitionDigest`、历史报告 digest 或测试计数替代 `semanticResultDigest`。

### 3.3 实施前识别的缺口（现已关闭）

1. 尚无从每轮真实 durable facts 派生的统一、安全、可比较结果；
2. 尚未以全新进程和全新存储完整执行相同 semantic seed 三次；
3. 尚未证明三轮结果 digest、事实计数和终态分类一致；
4. 尚未执行面向 ARH-3 关闭的扩展稳定运行与逐轮资源基线比较；
5. 尚未把 stdout/stderr、进程日志、测试报告和最终 Evidence 纳入同一敏感扫描；
6. 尚无独立 QA 实际重跑的 ARH-3 阶段关闭报告。

## 4. 冻结原则

1. **Closure-only**：原则上只新增 Harness runner、test fixture、safe evidence adapter、测试、
   architecture guard 和治理记录，不增加生产功能；
2. **真实结果优先**：必须读取运行后 durable facts 或既有生产查询得到的安全 Projection，不能只
   比较 scenario ID、源码 marker 或测试数量；
3. **每轮全新隔离**：三轮必须使用新的 Core child、SQLite 文件、Central JVM、PostgreSQL schema/
   container 与 Provider process，不复用上一轮内存、连接或临时目录；
4. **同一 semantic seed**：只固定业务身份、Conversation/Model/Tool/Compaction 脚本、故障窗口、
   Usage/cache 脚本和决策序列；
5. **排除非语义字段**：墙钟、duration、PID、端口、临时路径、物理连接、线程/进程调度、requestId、
   transportRequestId 和随机 canary 不进入 semantic digest；
6. **不建立第二事实源**：Evidence 只读取既有 durable facts 并归一化，不新增生产累计表或测试专用
   生产字段；
7. **不重试掩盖失败**：单轮场景不得以自动 rerun 获得 PASS；三轮是独立证明，不是失败重试；
8. **生产缺陷立即停批**：若发现真实生产缺陷，ARH-3.3.3 停止，另立 repair 方案并等待用户授权；
9. **独立 QA 必须重跑**：开发者 Evidence、历史 digest 或报告不能替代 Claude Code 的实际执行；
10. **CTR-P3-001 隔离**：不在本批修复 Central 既有时序测试，也不得用无界 rerun 隐藏它；
11. **安全 Evidence**：正文、Prompt、Summary、Tool 参数/结果、Credential、Token、Endpoint、完整
    路径、PID、端口和 canary 不得进入最终 Evidence；
12. **无 PRD/UX 依赖**：本批不增加页面、交互、产品设置或用户可见状态。

## 5. Semantic seed 与归一化规则

### 5.1 固定内容

同一 seed 固定：

- enterprise/user/session/agent/model/binding/revision 的合成业务关系；
- A1/A2/B1 三 Session 和 `central_enterprise|local_personal` authority 分布；
- Conversation、Model、Tool、首次/rolling Compaction 脚本；
- M1～M8 故障窗口与用户确认/拒绝/取消决策；
- Provider Usage 和 hit/miss/disabled/unsupported/unknown 脚本；
- 期望 terminal、Usage、Projection、Summary source range 和 cache plan 数量。

### 5.2 明确排除

以下字段可以每轮不同，不得造成 semantic mismatch：

- `startedAt`、`completedAt`、duration 和数据库物理时间；
- PID、端口、临时目录、SQLite 文件名、container/JVM identity；
- requestId、transportRequestId、连接 ID 和调度顺序；
- 运行时随机 canary；
- 仅用于诊断的测试执行顺序。

### 5.3 结果归一化

每轮至少从真实 durable/queryable facts 派生：

```text
session terminal class counts
invocation kind + terminal class + authority counts
provider attempt winner/superseded counts
usage fact/projection/aggregate counts and normalized digests
cache context/plan/status counts and normalized digests
compaction record/source range/active view counts and normalized digests
durable event type/causation class counts and normalized timeline digest
M1～M8 recovery class outcomes
typed error code set
```

归一化必须：

1. 对无顺序语义的集合按稳定业务键排序；
2. 保留 durable sequence、source range 与因果顺序；
3. 将运行期随机 ID 映射为该轮内部稳定 ordinal，不把原值输出；
4. 对正文、Prompt、Summary、Tool Result 只使用既有安全 digest，不重读后写入 Evidence；
5. 使用 canonical JSON + SHA-256；
6. 对缺失 Provider Usage 保留 `unknown`，不得补 0；
7. 同时输出 `matrixDefinitionDigest` 与 `semanticResultDigest`，不得混用。

### 5.4 三轮一致性

三轮必须满足：

- `matrixDefinitionDigest` 一致；
- `semanticResultDigest` 一致；
- normalized timeline/view/source/usage/cache digest 一致；
- terminal、attempt、Usage、Projection、cache plan、Compaction 和 typed error 计数一致；
- 每轮场景全部 PASS；
- 每轮结束资源归零。

任何一轮失败或 semantic mismatch 都使 ARH-3.3.3 失败；不得丢弃失败轮再补跑一轮冒充三轮
一致。

## 6. Harness 结构

### 6.1 唯一入口

新增唯一阶段入口：

```text
pnpm run harness:arh3.3.3
```

入口负责：

1. clean/build 必要 test fixture；
2. 生成一个 semantic seed 与每轮不同的安全 canary；
3. 连续启动三轮 fresh topology；
4. 每轮真实执行 3.3.1 topology invariants 与 3.3.2 M1～M8 matrix；
5. 从该轮真实 durable facts 构建 private safe result；
6. 比较三轮 semantic result；
7. 执行扩展稳定循环与四通道扫描；
8. 输出唯一、机器可解析的最终 Evidence 行。

### 6.2 复用边界

允许复用：

- ARH-3.3.1 Core child/topology fixture；
- ARH-3.3.2 Node runner、Java coordinator、M1～M8 与 safe evidence allowlist；
- ARH-2.3 canonical semantic normalization；
- CGF-2 双 JVM、Provider Relay、PostgreSQL pause/unpause 与资源诊断。

禁止：

- 只调用旧 Harness 三次并比较其静态矩阵 digest；
- 拼接三份历史 JSON 或 QA 报告；
- 为了生成 Evidence 直接写 Repository；
- 在生产 Controller/Runtime/Contract 增加测试字段或故障开关；
- 把单元测试 `throw` 当作进程死亡恢复证据。

### 6.3 Safe Result Adapter

如既有测试无法输出实际 durable result，可在 test scope 增加 typed Safe Result Adapter。它只能
输出 §5.3 的 count、class、digest 和 typed code，不得输出业务正文或内部凭据。

Adapter 必须：

- 从既有生产 query/Projection 或测试持有的 durable repository view 读取；
- 不改变状态；
- 对缺失、重复、digest drift 和不完整事实失败关闭；
- TS/Java 各自实现，若跨进程传输则使用 test-private strict schema；
- 不上升为公共 Contract，也不被 Renderer/Admin 消费。

## 7. 扩展稳定与资源门槛

### 7.1 正式稳定模式

用户已明确接受 ARH-3.3.3 增加以下阶段关闭稳定模式：

```text
minimum wall-clock duration：30 minutes
minimum complete lifecycle cycles：5
```

两项必须同时满足，不能通过缩短墙钟参数冒充正式长稳。单元测试可使用短模式验证 runner 本身，
但开发者阶段关闭与独立 QA 都必须实际运行正式模式。

每个 lifecycle cycle 至少包含：

- fresh Core A/Core B 与独立 SQLite；
- Central 双 JVM与共享 PostgreSQL；
- controlled Provider/Relay；
- 至少一条 main、initial Compaction、rolling Compaction 路径；
- 至少一个 Central takeover、一个 Core reopen 和一次 status-first reconciliation；
- 正常关闭与资源收口。

每个 cycle 必须从真实 durable/queryable facts 断言以下最小计数，不以“路径曾被调用”的日志或
marker 代替：

```text
mainTerminalCount >= 1
initialCompactionCommittedCount >= 1
rollingCompactionCommittedCount >= 1
centralTakeoverCount >= 1
coreReopenRecoveryCount >= 1
statusFirstReconciliationCount >= 1
```

上述计数只进入安全 Evidence，不输出 invocation、Session、进程或数据库原始 identity。

正式长稳不要求每个 cycle 都重复 M1～M8 全矩阵；M1～M8 已由三轮完整 semantic replay 实际执行。

### 7.2 资源断言

ARH-3.3.1/3.3.2 顶层 Evidence 中现有部分 `resourceMetrics=0` 是报告占位值，不能直接作为本批
阶段关闭证据。ARH-3.3.3 必须在 test scope 建立 `ResourceDiagnosticsAdapter`（名称可按现有
工程风格调整），从真实进程、连接池、lease、subscription、buffer、timer 和 handle 状态派生
资源指标。

该 Adapter：

- 只存在于 Harness/test fixture；
- 只能读取，不改变 Runtime、Repository 或连接池状态；
- 对不支持查询的指标失败关闭，不得默认返回 0；
- 不输出 PID、端口、路径、连接 ID 或业务内容；
- 必须有负向测试证明硬编码 0、缺失诊断与空断言不能通过；
- 不进入公共 Contract、生产 Port、Renderer、Admin 或审计事件。

每轮和最终必须验证：

```text
childProcessCount = 0
openLoopbackPortCount = 0
connectionCount = 0
recoveryLeaseCount = 0
subscriberCount = 0
bufferCount = 0
pendingTimerCount = 0
temporaryArtifactHandleCount = 0
```

其中：

- 端口只输出计数，不输出实际端口；
- 子进程以退出与 descendant 不存在证明，不输出 PID；
- connection/lease 由现有 queryable test diagnostics 证明；
- subscriber/buffer/timer/handle 使用显式计数，不允许 `expect(true)` 空断言；
- 五轮资源峰值必须有界，最终值归零，不得只检查最后一次。

## 8. 四通道敏感扫描

每次正式运行生成唯一 canary，并扫描：

1. Parent/Core/Central/Provider 的 stdout 与 stderr；
2. 子进程日志与 trace 导出；
3. Surefire/Vitest/机器 Evidence/QA 报告；
4. Harness 生成的安全 JSON、临时导出和诊断文件。

扫描目标至少包括：

- unique canary；
- synthetic credential/token/secret marker；
- Provider endpoint/model route marker；
- 用户/Assistant/Tool/Summary 正文 marker；
- workspace/临时完整路径 marker。

最终只输出 `sensitiveOutputMatchCount=0` 和按通道的零计数，不输出被扫描值。业务 durable SQLite/
PostgreSQL 本身不是“禁止保存正文”的对象，但不得被复制进最终 Evidence 或 QA 报告。

## 9. 实施步骤

### Step 1：Actual Result Evidence Foundation

1. 建立 ARH-3.3.3 private Evidence schema 与 canonical normalizer；
2. 分离 `matrixDefinitionDigest` 和 `semanticResultDigest`；
3. 为 Node/Core 与 Java/Central 增加 test-only Safe Result Adapter；
4. 增加敏感字段 denylist、strict key allowlist 和 schema negative tests；
5. 用一轮 fresh topology 验证实际 facts 可稳定归一化；
6. 若读取实际 facts 需要生产语义修改，停止本批并提交 repair，不得穿透边界。

### Step 2：Three-run Semantic Replay

1. 以一个 semantic seed 连续执行三轮完整 topology + M1～M8；
2. 每轮使用全新进程、存储、连接与 canary；
3. 对比实际 terminal/Usage/Projection/cache/Compaction/timeline；
4. 增加 mismatch negative fixture，证明改变一项 durable 事实必然改变 digest；
5. 增加非语义差异 fixture，证明 PID/端口/时间/requestId 变化不会误报；
6. 禁止 runner 自动忽略失败轮或隐式补跑。

### Step 3：Stability、Leak Scan 与 Closure

1. 实际运行 30 分钟且至少 5 个 lifecycle cycle；
2. 逐 cycle 采集安全资源 metrics，验证有界且最终归零；
3. 执行四通道 canary/secret/path/body 扫描；
4. 串行执行 Workspace、Central online、Central offline 完整门禁；
5. 更新版本、CHANGELOG、DEVELOPMENT-LOG、README、KEY-NODES 和上游登记；
6. 提交 Claude Code 独立 QA；
7. 独立 QA 与用户接受前，不关闭 ARH-3.3.3、ARH-3.3 或 ARH-3。

## 10. QA 验收矩阵（至少 52 项）

### 10.1 Evidence 与归一化（1～12）

1. private Evidence schema strict 拒绝未知字段；
2. Evidence 不进入公共 Contract；
3. `matrixDefinitionDigest` 与 `semanticResultDigest` 分离；
4. semantic digest 来自真实 durable/queryable facts；
5. scenario ID/测试计数不能单独决定 semantic digest；
6. canonical object key 排序稳定；
7. 有顺序语义的 durable sequence 保序；
8. 无顺序集合按稳定业务 ordinal 排序；
9. PID/端口/时间/requestId 变化不改变 semantic digest；
10. terminal/Usage/cache/Summary 任一事实漂移改变 semantic digest；
11. missing Usage 保留 unknown；
12. 正文只以既有 digest 参与，不进入 Evidence。

### 10.2 三轮真实执行（13～26）

13. 三轮使用同一 semantic seed；
14. 三轮使用不同 canary；
15. 三轮 Core child 均为全新进程；
16. 三轮 SQLite 均为全新文件；
17. 三轮 Central JVM/连接池均重新建立；
18. 三轮 PostgreSQL state 不互相污染；
19. 三轮 Provider/Relay 均重新建立；
20. 每轮 M1～M8 全部实际执行；
21. 每轮 A1/A2/B1 隔离成立；
22. 每轮 main/initial/rolling invocation 隔离成立；
23. 每轮五类 cache 状态不伪造；
24. 三轮 normalized digests 全相等；
25. 三轮事实计数与终态分类全相等；
26. 失败轮不得被丢弃或自动补跑。

### 10.3 Stability 与资源（27～40）

27. 正式稳定模式实际运行至少 30 分钟；
28. 正式稳定模式至少完成 5 个 lifecycle cycle，且每个 cycle 的六类 durable/recovery 最小计数
    均满足 §7.1；
29. Core A/Core B child 最终归零；
30. Central JVM/Provider descendant 最终归零；
31. loopback port 全部关闭；
32. PostgreSQL/Hikari connection 归零或回到受控基线；
33. recovery lease 归零；
34. subscriber/buffer/timer/handle 归零；
35. 各 cycle 峰值有界且不单调增长；
36. 提前退出有 typed diagnosis，不伪报 timeout；
37. deadline/cancel 不产生第二 terminal；
38. 无空断言、无单纯 sleep 代替资源检查；
39. 资源指标由真实 test-only diagnostics 读取，缺失诊断失败关闭；
40. 硬编码 0、默认 0 或只检查最终常量不能通过资源门槛。

### 10.4 安全、回归与阶段关闭（41～52）

41. stdout/stderr 扫描为 0；
42. log/trace 扫描为 0；
43. Surefire/Vitest/QA report 扫描为 0；
44. Evidence/临时诊断扫描为 0；
45. Evidence 不含正文、Prompt、Summary、Tool Result；
46. Evidence 不含 Credential、Token、Endpoint、PID、端口、完整路径；
47. Workspace 完整门禁实际 PASS；
48. Central online 实际 PASS；
49. Central offline 实际 PASS；
50. ARH-0～3、ADR-017、ARH-1/2/3.1/3.2 回归无漂移；
51. 公共 Contract、Schema/migration、Kernel、Desktop、生产 recovery 无未授权修改；
52. `CTR-P3-001` 未被吸收或用无界 rerun 隐藏，ARH-3.3.3 未新增产品范围。

### 10.5 父计划场景映射

父计划要求“至少 36 场景”，ARH-3.3.2 已实现的 52 场景是该门槛的超集：

| 父计划范围 | 父计划编号 | ARH-3.3.2 / ARH-3.3.3 覆盖 |
| --- | --- | --- |
| Topology 与隔离 | 1～12 | A1/A2/B1、双 Core/双 Central、authority、Binding/revision、session/cache isolation |
| Usage、authority 与 Compaction | 13～24 | main/initial/rolling、attempt/fencing、Usage、cache status、local_personal isolation |
| Recovery、Evidence 与回归 | 25～36 | M1～M8、semantic replay、敏感扫描、资源归零和无范围漂移 |

ARH-3.3.3 不把“52”重新解释成另一套场景；它实际重跑同一 52 场景，并在其上增加三轮一致性、
长稳、真实资源诊断和阶段关闭断言。最终 Evidence 必须同时输出 `scenarioCount=52` 和父计划
`minimumParentScenarioCount=36` 的满足关系。

独立 QA 必须实际运行 `harness:arh3.3.3`、正式 30 分钟稳定模式及三项完整门禁。开发者报告、
历史 digest、旧 QA 或代码审查不能替代执行。

## 11. Evidence 输出

允许输出：

```text
schemaVersion / status
semanticSeedDigest / matrixDefinitionDigest / semanticResultDigest
roundCount / lifecycleCycleCount / scenarioCount / passedScenarioCount
sessionCount / userScopeCount / enterpriseScopeCount
invocationKindCounts / terminalClassCounts / attemptClassCounts
usageFactCount / projectionCount / cachePlanCount / compactionCount
normalizedTimelineDigest / viewDigest / sourceDigest / usageDigest / cacheDigest
namedCrashWindows[] / typedErrorCodes[]
perRoundSemanticDigest[] / perRoundResourceMetrics[]
resourceMetrics / durationMs / sensitiveOutputMatchCount
```

`perRoundSemanticDigest[]` 只含 digest，不含原始业务 ID。`durationMs` 可以不同且不参与 semantic
一致性。

禁止输出：正文、Prompt、Tool 参数/结果、Summary、Skill/Knowledge/Workspace 内容、API Key、
Credential、Token、Endpoint、完整路径、PID、端口、Provider 原始响应、canary 或数据库转储。

## 12. 允许修改与禁止修改

### 12.1 允许范围

- `scripts/` 下 ARH-3.3.3 runner 与测试；
- `services/core/tests/**` 和 test fixture；
- `services/central-service/src/test/**`；
- 必要的 test-only private schema/adapter；
- package script 与实施版本；
- CHANGELOG、DEVELOPMENT-LOG、README、KEY-NODES、QA 与上游登记。

### 12.2 禁止范围

- 公共 Contracts、Desktop IPC、Renderer/Admin；
- Kernel reducer、Task 状态、ADR-017 Effect/Receipt；
- Core/Central 生产 Runtime、Provider、Cache、Compaction 或 recovery 语义；
- 新 Schema/migration、生产表、生产 Controller 或公开 API；
- 真实个人 Provider、真实企业 OA/MDM/Relay、真实费用与账单；
- PRD、UX、长期 Memory、Knowledge、Skill Runtime、并行 Tool/Subagent；
- `CTR-P3-001` 修复。

若实际证据无法在上述允许范围中取得，必须停止并向用户提交原因和最小 repair/范围修订，不能
静默扩大范围。

## 13. 失败分类

| 情况 | 分类 | 处理 |
| --- | --- | --- |
| 单轮 scenario 失败 | ARH-3.3.3 FAIL | 不自动补跑，保留安全诊断 |
| 三轮 semantic digest 不一致 | P1 候选 | 定位 durable 事实漂移；不关闭阶段 |
| 仅非语义字段不同 | normal | 归一化排除并由负向测试证明 |
| 资源不归零/持续增长 | P1/P2 候选 | 停止阶段关闭，提交最小修复方案 |
| Evidence 泄漏敏感字段 | P1 | 立即失败，删除不安全报告并修复 |
| 真实生产语义缺陷 | 独立 repair | ARH-3.3.3 暂停，等待用户授权 |
| 命中 CTR-P3-001 已知签名 | 独立维护项 | 不在本批修代码，但完整最终门禁仍需串行全绿后才能关闭 |

## 14. 工期

| 工作 | 集中工程工作量 |
| --- | --- |
| Actual Result Adapter + canonical normalization | 1～2 天 |
| 三轮 semantic replay 与负向矩阵 | 1～2 天 |
| test-only 真实资源诊断与负向门槛 | 1～2 天 |
| 30 分钟稳定模式与四通道扫描 | 1～2 天 |
| 回归、证据与治理收口 | 1 天 |
| 合计 | **5～8 工程工作日** |

父计划原估 1～2 天适用于聚合旧 Harness 结果。详细核查发现阶段关闭必须新增真实 durable result
归一化、三轮 fresh topology、正式稳定模式和真实资源诊断，因此调整为 5～8 个集中工程工作日。
其中资源诊断是主要不确定性来源；如任何指标只能通过生产改动取得，必须停批另立 repair。该估算
不含文档评审、独立 QA、Docker/资源等待和返工，不是日历交付承诺。

## 15. PRD/UX 依赖

本批不依赖 PRD/UX。它不定义用户可见 Usage、缓存状态、费用、设置或错误文案，只验证已冻结的
运行时隔离、恢复和证据不变量。

## 16. 上游与借鉴

只复用已登记来源：

- AR-057～AR-063：ARH-2/3、Codex/OpenCode evidence-driven Harness、Usage replay、exact
  Session scope、Prompt Cache Planner、Provider projection 与 ARH-3.3.1/2；
- ADR-017、CGF-2A/2B/2C 与 RoboThree 自有 durable recovery；
- DCF-1.3C 的“正式长稳必须实际执行、资源归零、报告不得泄漏”工程门槛。

采用类型预计为：

```text
DESIGN_ONLY + OWN_ACTUAL_RESULT_EVIDENCE + OWN_SEMANTIC_REPLAY + OWN_STABILITY_HARNESS
```

本 docs-only 批次不预占 AR 编号；编码完成后使用当时下一个可用编号登记。不复制第三方源码、
DTO、SQL、Prompt、Fixture 或 SDK。

## 17. 文档评审问题

Revision 1 请 Claude Code 按 P0/P1/P2/P3 做差异复核：

1. ARH-3.3.3 是否严格属于关闭 Evidence，而非继续扩建 Core；
2. 对现有 3.3.2 静态矩阵 digest 边界的判断是否准确；
3. `matrixDefinitionDigest` 与 `semanticResultDigest` 分离是否足以防止静态 digest 冒充结果；
4. Safe Result Adapter 是否能在 test-only 范围读取真实 durable facts且不建立第二事实源；
5. semantic seed 的包含/排除字段是否完整；
6. 三轮是否必须每轮 fresh topology 且完整执行 M1～M8；
7. 用户已接受的 30 分钟 + 至少 5 lifecycle cycles 是否已形成可执行硬门槛；
8. 四通道扫描与 Evidence allowlist 是否充分；
9. 资源指标是否可用真实断言证明，而不是空断言或 sleep；
10. `CTR-P3-001` 隔离与“最终完整门禁仍需全绿”是否一致；
11. 52 项 QA 与 52→36 映射是否覆盖 ARH-3.3 父计划的最终退出条件；
12. 5～8 工程工作日是否符合真实 result adapter、资源诊断、三轮和长稳工作量；
13. 是否需要修改公共 Contract、Schema/migration 或生产代码；若需要，是否应停批另立 repair；
14. 是否存在新的 P0/P1 或需要用户重新决策的 P2。

## 18. 当前门槛

```text
ARH-3.3.0：PASS/CLOSED
ARH-3.3.1：PASS/CLOSED
ARH-3.3.2：PASS/CLOSED
ARH-3.3.3 plan：PASS/CLOSED
ARH-3.3.3 independent QA：原批 FAIL ACCEPTED；repair.1 已关闭 P1
0.0.0-arh.3.3.3-repair.1：INDEPENDENT QA PASS / USER ACCEPTED / CLOSED
ARH-3.3.3 / ARH-3.3 / ARH-3：PASS/CLOSED
CTR-P3-001：OPEN / NON-BLOCKING / OUT OF ARH-3.3.3 SCOPE
```

Claude Code Revision 1 差异复核已 `PASS（P0=0 / P1=0 / P2=0 / P3=2）`；两项文档 P3 已
修正，用户随后明确接受并授权。原开发批次独立 QA 在第 26 个轻量 cycle 复现 P1；repair.1
已经确定性化 exact-session failpoint handshake 并补齐四通道扫描。repair.1 开发者正式门禁完成
3 轮完整 semantic replay 与 86 个轻量 stability cycle，共 89 个 lifecycle cycles；正式长稳超过
30 分钟，52/52 场景、digest、四通道扫描和真实资源归零全部通过。独立 QA 随后在
Node 24.13.0、Java 21 和 Docker 环境下串行从零重跑：三轮 semantic replay、92 个轻量长稳
cycle（36.6 分钟）、精确 takeover 10/10、Workspace 166 files / 1176 tests + 3 smoke、
Central online/offline 302/0/0/0 全部通过，四通道泄漏和八类资源余量均为 0。用户已正式接受。
后续正式 Harness 与 Central 门禁必须串行执行，digest 只能作为比较证据，不能代替实际运行。
