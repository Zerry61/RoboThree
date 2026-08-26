# RoboThree ARH-3.3 Multi-Session Isolation 与统一 Evidence Harness Development Plan

## 1. 文档状态

```text
状态：ARH-3.3 PASS/CLOSED
日期：2026-08-16
前置：ARH-3.0、ARH-3.1、ARH-3.2 PASS/CLOSED
ARH-3.3.0：PASS/CLOSED
ARH-3.3.1：PASS/CLOSED
ARH-3.3.2：PASS/CLOSED
ARH-3.3.3：PASS/CLOSED（repair.1 独立 QA PASS / USER ACCEPTED）
CTR-P3-001：独立测试可靠性维护项，不属于 ARH-3.3
```

本文件只冻结 ARH-3.3 的统一证据拓扑、场景矩阵、批次和验收门槛。文档评审本身不自动
授权编码；用户已逐批授权至 ARH-3.3.3。ARH-3.3.3 repair.1 已通过独立 QA并由用户接受，
本阶段已关闭。

## 2. 阶段定位与目标

ARH-3.1 已建立 durable Provider Usage Fact、attempt/fencing identity 和 Core Usage Projection；
ARH-3.2 已建立 exact Session cache scope、immutable Prompt Cache Plan、双协议 Provider
projection 与 C1～C10 恢复。ARH-3.3 不再建设新的 Usage、Cache 或 Agent Runtime 机制，只回答：

> 当多个 Session、用户、企业、执行 authority、Core 进程和 Central JVM 同时运行并经历崩溃时，
> ARH-3.1/3.2 的事实、上下文、Usage 和 cache identity 是否仍然严格隔离、可恢复且可审计？

目标闭环：

```text
3 concurrent Sessions / 2 user scopes / 2 enterprise scopes
        +
2 Core child processes / 2 Central JVMs / shared PostgreSQL
        +
isolated Core SQLite files / controlled Provider process
        ↓
Conversation + Context + Usage + Cache + Compaction isolation
        ↓
named crash recovery + deterministic Evidence + leak scan + resource zero
```

ARH-3.3 是 ARH-3 的关闭证明，不是新一轮 Core 功能开发。

## 3. 当前代码事实

### 3.1 已有可复用事实

1. `UsageAuthority=central_enterprise|local_personal` 已冻结；企业路径以 Central PostgreSQL 为
   durable 权威，个人路径首期只有 Core-private Port/Fake/Conformance；
2. Provider attempt identity 已绑定 authority、invocation、fencing epoch 与 attempt digest；
   terminal winner 和 `superseded_confirmed` 分离；
3. Core 已用 `InvocationUsageProjection` 持久化安全派生事实，并通过 `listBySession()` 确定性
   聚合 Session Usage；
4. Core 已通过 per-device、per-authority HMAC namespace 派生 opaque exact Session scope；
5. Central v1alpha2、v0009、Prompt Cache Context/Plan、四层 cache identity 与 Profile/
   Compatibility revision 已实现；
6. Anthropic-compatible 与 OpenAI-compatible typed Provider projection 已实现，Provider Usage 是
   cache hit/write 的唯一事实；
7. ARH-2 已证明首次/rolling Compaction、主调用/摘要调用 identity 与七个恢复窗口；
8. CGF-2/ARH-3.2 已有双 JVM、共享 PostgreSQL、lease/fencing、进程外 Provider 与资源归零 Fixture；
9. 完整门禁当前为 Workspace 163 files / 1132 tests + 3 smoke，Central online/offline 各 297 tests。

### 3.2 尚未统一证明的缺口

1. 现有 Usage、Cache、Compaction 和双 JVM Harness 分散，尚无同一业务拓扑的联合证据；
2. 尚未在三个并发 Session 中同时证明 Conversation/Context、Usage、cache key 和 Tool/Compaction
   事实不串线；
3. 尚未在同一用户不同 Session、不同用户、不同企业、不同 Binding/Revision 的组合中统一验证
   cache invalidation 与 isolation；
4. 尚未把 Central terminal、Core projection、SQLite reopen、PostgreSQL pause/unpause 和 takeover
   放入同一恢复矩阵；
5. `central_enterprise` 与 `local_personal` 已共用语义 Contract，但尚未在统一 Harness 中证明同一
   invocation 文本不会跨 authority 去重、共享 Usage 或 cache key；
6. ARH-3 尚缺一个只含 count/digest/status/resource metric 的机器可读关闭 Evidence。

## 4. 冻结原则

1. **Evidence-first**：ARH-3.3 原则上只新增 test fixture、Harness runner、architecture guard 和
   Evidence；不增加生产功能；
2. **生产缺陷不顺手修**：若 Harness 发现真实生产缺陷，ARH-3.3 对应批次停止，提交独立问题和
   repair 方案，经用户授权后修复；
3. **不建立第二事实源**：Harness 只读取既有 Conversation、Task、Usage、Cache Plan、Event 和
   Projection，不新增可变累计表或测试专用生产字段；
4. **Session 是最低共享边界**：同一用户不同 Session 也不得共享 dynamic context 或 exact cache
   key；
5. **authority 隔离**：相同 invocation ID 文本在企业/个人路径下必须具有不同 attempt identity、
   Usage fact namespace、Credential namespace 和 cache identity；
6. **Provider Usage 权威不变**：Harness 不估算 cache hit、节省 Token、费用或账单；
7. **单写者不变**：Runtime 仍是 durable terminal 唯一写入者；Harness 不直接修改 Repository；
8. **真实崩溃证据**：命名进程窗口必须通过子进程退出、SQLite reopen、双 JVM 或数据库暂停实际
   触发，不以单元测试 throw 冒充；
9. **安全 Evidence**：正文、Prompt、Tool 参数/结果、Summary、Credential、Endpoint、Token、
   完整路径、PID、端口不得进入最终 Evidence；
10. **ARH-3.3 不吸收 `CTR-P3-001`**：既有 Central 测试时序稳定性只在独立维护批次处理。

## 5. 受控拓扑

### 5.1 进程与存储

```text
Parent Harness Orchestrator
├── Core Child A
│   ├── Session A1：enterprise E1 / user U1
│   ├── Session A2：enterprise E1 / user U1
│   └── isolated Core SQLite A
├── Core Child B
│   ├── Session B1：enterprise E2 / user U2
│   ├── local_personal Fake invocation scope
│   └── isolated Core SQLite B
├── Central JVM A ─┐
├── Central JVM B ─┼── shared Testcontainers PostgreSQL 16
└── Controlled Provider Process
```

两个 Core child 使用不同本地 HMAC namespace，不能共享 SQLite 文件或内存对象。两个 Central
JVM 使用独立 PID、端口和 Hikari Pool，只共享 PostgreSQL。Provider 只提供受控脚本、Usage 与
故障 barrier，不持有 RoboThree durable terminal 权限。

### 5.2 稳定 semantic seed

同一 seed 只固定：

- enterprise/user/session/agent/model/binding/revision 的合成业务身份；
- Conversation、Model、Tool、Compaction 脚本；
- Usage 与 cache hit/miss/unsupported 脚本；
- 故障窗口和用户决策序列。

不固定墙钟、PID、端口、数据库物理连接、进程调度、requestId 或 transport requestId。最终比较
只使用 normalized timeline/view digest、事实计数、状态和资源指标。

## 6. 隔离矩阵

| 维度 | 场景 | 必须证明 |
| --- | --- | --- |
| 同 Session | A1 Turn 1 → Turn 2 | static source/profile 未变时 cache key 稳定，dynamic request digest 改变 |
| 同用户跨 Session | A1 ↔ A2 | Conversation、dynamic context、session scope、cache key、Usage Projection 不共享 |
| 跨用户/企业 | A1/A2 ↔ B1 | user/enterprise scope、Credential namespace、attempt、Usage、cache key 全隔离 |
| Binding/Revision | A1 合法切换 Binding 或 Agent/Skill/Tool revision | 新 key/lock，旧 Plan 与旧 Task 事实不变 |
| 主调用/摘要 | A1 initial + rolling Compaction | main/compaction Usage、link、request digest 和 terminal 不串线 |
| 企业/个人 | B1 enterprise 与 local_personal 使用相同 invocation 文本 | authority/attempt/cache/Usage 全隔离；个人路径不发送 Gateway sidecar |
| Provider 模式 | hit/miss/disabled/unsupported | semantic request 不因 cache 状态改变；缺失 Usage 保持 unknown |
| 重放 | 同 attempt 同/不同 digest | 同 digest 幂等，不同 digest conflict，旧事实不变 |

每个 Session 使用不同正文 canary；canary 只允许用于运行时负向断言，最终报告只输出
`sensitiveOutputMatchCount=0`，不得输出 canary 本身。

## 7. 命名恢复窗口

| 窗口 | 故障位置 | 恢复结论 |
| --- | --- | --- |
| M1 | Central terminal transaction 提交前进程退出 | 无 terminal/Usage 假事实；新 owner 按既有 recovery mode 接管 |
| M2 | Central terminal transaction 提交后响应丢失 | status-first 返回同 terminal/Usage；不重复 Event/Outbox/Fact |
| M3 | Core 收到 durable Usage Event、写 Projection 前退出 | cursor replay 后 Projection 精确写一次 |
| M4 | Core Projection 提交后 ACK/响应丢失 | 同 Event 重放不重复 Projection/Session aggregate |
| M5 | Central JVM A 失效、JVM B lease takeover | fencing 生效；stale owner 不能覆盖 winner |
| M6 | PostgreSQL pause/unpause | readiness 降级并恢复；不静默换 Binding、不制造新 invocation |
| M7 | Core SQLite close/reopen | Session/Usage/cache context/Compaction view 从 durable facts 收敛 |
| M8 | rolling Compaction Summary committed、下一主调用前退出 | 重启后 Summary + raw tail digest 稳定，主调用只提交一次 |

这些窗口复用现有生产故障点；ARH-3.3 不向生产代码新增测试开关。确需新 barrier 时，只能放在
test fixture/受控 child 进程中。

## 8. 批次拆分

### 8.1 ARH-3.3.0：方案冻结

本文件即 ARH-3.3.0。只修改文档、阶段状态和讨论记录，不修改代码、Contract、Schema、migration、
依赖、版本或测试基线。

退出：Claude Code 文档复核 `P0/P1=0`，用户接受并单独授权 ARH-3.3.1。

### 8.2 ARH-3.3.1：Multi-Session Topology Foundation

交付：

1. 进程外 Parent/Core A/Core B/Central A/Central B/Provider 拓扑；
2. 三 Session、两 user/enterprise scope 的 deterministic seed；
3. Conversation/Context/session scope/cache key/Usage Projection 基础隔离；
4. same-session cross-turn 稳定与 same-user cross-session 隔离；
5. enterprise/local_personal Port/Fake authority 隔离；
6. 有界启动、停止、提前退出诊断和第一版机器可读 Evidence。

禁止：实现 M1～M8 全恢复矩阵、真实个人 Provider、真实厂商 cache、ARH-3.3.2/3 超前。

### 8.3 ARH-3.3.2：Recovery、Usage 与 Compaction Matrix

详细实现边界见
[ARH-3.3.2 Recovery、Usage 与 Compaction Matrix Development Plan](./ARH-3.3.2-RECOVERY-USAGE-COMPACTION-MATRIX-DEVELOPMENT-PLAN.md)。

交付：

1. M1～M8 命名恢复窗口；
2. main/initial-compaction/rolling-compaction Usage 与 link 隔离；
3. same attempt replay、different attempt、stale owner/fencing；
4. PostgreSQL pause/unpause、双 JVM takeover、Core SQLite reopen；
5. hit/miss/disabled/unsupported 与 missing Usage 语义；
6. 重启前后 normalized timeline/view/source/cache/usage digest 稳定。

禁止：修改生产 recovery mode、exactly-once 宣称或把测试 retry 当恢复语义。

### 8.4 ARH-3.3.3：统一关闭 Evidence

交付：

1. 至少 36 场景统一 Harness；
2. 同一 semantic seed 完整执行至少 3 次，normalized digest 与事实计数一致；
3. 四通道敏感信息扫描；
4. child、port、subscriber、buffer、lease、connection、timer 等资源归零；
5. Workspace、Central online、Central offline 完整门禁；
6. ARH-0～3、ADR-017、ARH-1/2/3.1/3.2 回归与无范围漂移证明。

退出：独立 QA 实际重跑完整 Harness 与全部门禁、用户接受后，ARH-3.3 和 ARH-3 才可关闭。

## 9. QA 验收矩阵（至少 36 项）

### 9.1 Topology 与隔离（1～12）

1. 两个 Core child 为独立进程和独立 SQLite；
2. 两个 Central JVM 独立 PID/端口/Hikari Pool；
3. 两个 Central JVM 只共享 PostgreSQL；
4. Controlled Provider 为独立进程；
5. 三 Session 并发完成；
6. A1/A2 同用户跨 Session Conversation 不串线；
7. A1/A2 dynamic context 不共享；
8. A1/A2 exact session scope/cache key 不同；
9. A1/B1 跨 user/enterprise 隔离；
10. cross-binding/cross-revision 生成新 key，旧 Plan 不变；
11. 同 Session 跨 Turn static key 稳定；
12. 新/未知 affects-cache 字段导致 disabled/fail-closed。

### 9.2 Usage、authority 与 Compaction（13～24）

13. main invocation Usage 按 Session 隔离；
14. initial Compaction Usage 与 main 分离；
15. rolling Compaction Usage 与 main/initial 分离；
16. Session aggregate 由 invocation facts 确定性重建；
17. same attempt same digest 幂等；
18. same attempt different digest conflict；
19. different attempt facts 分别保留；
20. stale owner 只能 `superseded_confirmed`；
21. enterprise/local_personal 同 invocation 文本不碰撞；
22. local_personal 不写 Central PostgreSQL、不发送 Gateway sidecar；
23. hit/miss/disabled/unsupported 不改变 semantic request；
24. missing Provider Usage 保持 unknown，不伪造 0。

### 9.3 Recovery、Evidence 与回归（25～36）

25. M1 terminal commit 前退出；
26. M2 terminal commit 后响应丢失；
27. M3 Core Projection 前退出；
28. M4 Core Projection 后响应丢失；
29. M5 双 JVM takeover/fencing；
30. M6 PostgreSQL pause/unpause；
31. M7 Core SQLite close/reopen；
32. M8 rolling Summary committed 后退出；
33. 同一 semantic seed 至少三轮 normalized digest/计数一致；
34. 四通道 canary/secret/path/body 扫描为 0；
35. 全部命名资源计数归零；
36. 公共 Contract、Schema/migration、Kernel、Desktop、生产 recovery 语义无漂移，ARH-3.3
    未吸收 `CTR-P3-001`。

独立 QA 必须实际执行 Harness；历史报告、digest 或开发者自测不能替代复跑。

## 10. Evidence 格式

允许输出：

```text
status / scenarioCount / passedScenarioCount
sessionCount / userScopeCount / enterpriseScopeCount
invocationCount / attemptCount / usageFactCount / projectionCount
cachePlanCount / compactionCount / durableTerminalCount
normalizedTimelineDigest / viewDigest / usageDigest / cacheDigest
namedCrashWindows[] / typedErrorCodes[]
resourceMetrics / duration / sensitiveOutputMatchCount
```

禁止输出：用户/Assistant 正文、Prompt、Tool 参数/结果、Summary、Skill/Knowledge/Workspace 内容、
API Key、Credential、Access Token、Endpoint、完整本地路径、PID、端口、Provider 原始响应或 canary。

## 11. 非目标

ARH-3.3 不实现：

- 新的生产 Usage、Cache、Compaction、Context 或 Agent Loop 机制；
- 真实个人 Model Provider、个人 API Key、本地个人 Usage 权威表或设置页面；
- 真实 Provider cache hit、计费、费用、账单或 SLA；
- 用户/Admin Usage 页面、缓存开关、报表或导出；
- 跨 Session、跨用户或跨企业 cache 共享；
- Redis/自建缓存服务、Provider 响应正文缓存；
- 自动模型路由、fallback、Binding 切换；
- Kernel reducer、Task 状态、ADR-017 Effect/Receipt 语义修改；
- Tool 并行、Subagent、多 Agent、长期 Memory、Knowledge RAG 或 Skill Runtime；
- `CTR-P3-001` 修复或任何其他无独立授权的维护工作。

## 12. PRD/UX 依赖

ARH-3.3 不依赖 PRD/UX。它不增加用户页面、交互、设置或业务能力，只验证已冻结运行时不变量。
未来 Usage/费用页面、用户可见缓存状态、预算告警和个人模型设置必须另有 PRD/Feature Spec。

## 13. 上游参考

只复用已登记的设计来源：

- AR-058：Codex/OpenCode 的 Usage replay 与 attempt accounting 研究；
- AR-059：Codex exact Session identity 与 Gateway sidecar 设计；
- AR-060：Prompt Cache Planner、四层 identity 与双 JVM恢复；
- AR-061：Anthropic/OpenAI Provider projection 与 C8～C10；
- RoboThree 自有 ARH-2、ADR-017、CGF-2 durable runtime。

采用类型预计为：

```text
DESIGN_ONLY + OWN_MULTI_SESSION_EVIDENCE + OWN_RECOVERY_HARNESS + OWN_CONFORMANCE
```

本 docs-only 批次不预占新的 AR 编号；实际形成新 Harness 后使用当时下一个可用编号登记。不复制
第三方源码、DTO、SQL、Prompt、Fixture 或 Provider SDK。

## 14. 工期

| 批次 | 集中工程工作量 |
| --- | --- |
| ARH-3.3.1 | 1～2 工程工作日 |
| ARH-3.3.2 | 5～9 工程工作日 |
| ARH-3.3.3 | 5～8 工程工作日 |
| 合计 | **11～19 工程工作日** |

ARH-3.3.2 的旧估算只适用于复用孤立测试并聚合结果。详细方案经过代码核实后，要求真实
Central durable Event → Core Projection、M1～M8 进程死亡与数据库恢复矩阵，因此调整为 5～9 个
集中工程工作日。ARH-3.3.3 详细核查又确认其必须补真实 durable result digest、三轮 fresh
topology、test-only 资源诊断以及 30 分钟/5 lifecycle 正式稳定门槛，因此从旧估算 1～2 天调整
为 5～8 天。该估算不含文档评审、独立 QA、资源等待和返工，不是日历交付承诺。

## 15. 文档评审问题

请 Claude Code 与 MiniMax 按 P0/P1/P2/P3 评审：

1. ARH-3.3 是否严格属于统一 Evidence，而非继续扩建 Core；
2. 两 Core/两 Central/共享 PostgreSQL/独立 SQLite/受控 Provider 拓扑是否最小且充分；
3. 三 Session、两 user/enterprise scope 是否足以证明 same-user cross-session 和 cross-enterprise
   隔离；
4. enterprise/local_personal authority 是否只做 Port/Fake Conformance 且不宣称个人模型已接通；
5. M1～M8 是否覆盖 terminal、Projection、takeover、数据库和 Compaction 关键窗口；
6. same-session key 稳定与 cross-session key 隔离是否同时成立；
7. Provider Usage、Session aggregate 与 cache hit/unknown 权威是否保持 ARH-3.1/3.2 不变量；
8. 分批门禁是否避免 ARH-3.3.1 一次承担全部复杂度；
9. 36 项 QA、三轮 semantic seed、泄漏与资源归零是否可执行；
10. `CTR-P3-001` 是否与本阶段完全隔离；
11. 是否需要修改公共 Contract、Schema/migration 或生产代码；如需要，是否应停止本阶段并另立
    repair；
12. 是否存在新的 P0/P1 或需要用户重新决策的范围。

## 16. 当前门禁

```text
ARH-3.0：PASS/CLOSED
ARH-3.1：PASS/CLOSED
ARH-3.2：PASS/CLOSED
ARH-3.3 detailed plan：PASS/CLOSED
ARH-3.3.1：PASS/CLOSED
ARH-3.3.2：PASS/CLOSED
ARH-3.3.3 plan：PASS/CLOSED
ARH-3.3.3 coding：PASS/CLOSED
CTR-P3-001：OPEN / NON-BLOCKING / OUT OF ARH-3.3 SCOPE
```

ARH-3.3.1、ARH-3.3.2 均已通过独立 QA并由用户正式接受关闭。ARH-3.3.3 的 P1 已由
`0.0.0-arh.3.3.3-repair.1` 关闭；独立 QA 串行从零复跑全部门禁并由用户接受，ARH-3.3 与
ARH-3 已正式关闭。后续正式 Harness 与 Central 门禁必须串行执行。

## 16. ARH-3.3.1 实施结果

- 新增两个独立 Core child、两份独立 Core SQLite 和一个受控进程外 Provider；运行期间串行执行
  Central 双 JVM共享 PostgreSQL、Prompt Cache Planner 与 Provider Process 专项；
- 固定 A1/A2/B1 三个 Session、两个 user/enterprise scope，证明同 Session 跨 Turn scope 稳定、
  同用户跨 Session 隔离，以及 Conversation、Usage Projection、Cache Context 不串线；
- `central_enterprise` 使用持久 Usage Projection；`local_personal` 只使用既有 Core-private
  Port/Fake，并证明 attempt identity、Gateway sidecar 与 Central Projection 均不复用；
- Evidence 只输出 count、digest、status、duration、resource metrics 与 typed error；正文、路径、
  PID、端口、凭据和 canary 均不得出现；
- 专项 `12/12` 场景和 Central 选定 `44` tests 通过；完整 Workspace `164 files / 1139 tests +
  3 smoke`、Central online `299/0/0/0` 已通过。M1～M8、Compaction 恢复矩阵和真实个人 Provider
  未实现，继续属于 ARH-3.3.2/3 或后续独立范围。
