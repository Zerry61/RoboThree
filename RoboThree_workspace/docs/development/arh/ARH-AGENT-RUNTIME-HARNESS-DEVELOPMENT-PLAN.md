# RoboThree Agent Runtime Harness Development Plan

## 1. 文档状态

```text
状态：CONFIRMED
确认日期：2026-08-12
当前批次：ARH-1、ARH-2、ARH-3.0、ARH-3.1、ARH-3.2 PASS/CLOSED
ARH-0：PASS/CLOSED
ARH-2.2：PASS/CLOSED
ARH-2.3：PASS/CLOSED
ARH-3：ARH-3.1/3.2/3.3.0/3.3.1/3.3.2 PASS/CLOSED；ARH-3.3.3 IMPLEMENTED / DEVELOPER GATES PASS / READY_FOR_INDEPENDENT_QA
```

本计划参考 OpenCode 归档版本 `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
的 Agent Loop、Provider stream、串行 Tool dispatch 和 context compaction 研究。只采用
运行时不变量和测试思路，不复制 Go 源码、DTO、Provider SDK、fixture 或协议字段。

## 2. 冻结边界

1. 不修改 Kernel reducer、Task / Run / Step 状态语义。
2. 不修改 ADR-017 Tool Call、Effect、Receipt、Observation 不变量。
3. Token delta 保持 ephemeral，不逐条写 SQLite。
4. 不新增公共 Model Contract 或 Provider 类型。
5. 保留现有 80% Context 阈值、输出预留和安全余量。
6. 同批 Tool Call 继续串行；Tool 并行调度继续延后。
7. ARH-2、ARH-3 必须分别经过方案复核和用户明确授权。

## 3. ARH-1：Provider Stream Conformance

### 3.1 目标

把 ModelProvider 从“事件可解析”提升为“事件顺序可证明”，并保证非法 Provider 流不能
制造 completed Assistant Message。

### 3.2 实现范围

- Core Application 层唯一 Provider stream 消费点接入内部顺序验证器；
- `started` 恰好一次且必须为首事件；
- `completed` / `failed` 只能有一个 terminal，terminal 后拒绝任何事件；
- 自然结束没有 terminal 时失败关闭；
- 拒绝空白 `text_delta`；
- 拒绝 Tool Call identity 重复或漂移；
- usage 非负由既有 schema 保证，并拒绝重复、回退与 terminal 后 usage；
- cancel 后迟到事件不能进入 timeline 或持久消息；
- Provider 异常映射为安全 typed failure，不透传内部异常正文；
- Central Anthropic-compatible / OpenAI-compatible Adapter 共用等价 Conformance。

terminal 在 Core validator 内暂存至上游流自然结束，避免先把 terminal 交给 Agent Loop、
随后才发现迟到非法事件。token delta 仍可实时向上游投影。

### 3.3 非目标

- Compaction orchestration；
- retry token accounting / persistent dedupe；
- Desktop 或 Admin 页面；
- 新 Provider；
- 新 Contract、迁移或 Kernel 状态。

### 3.4 退出门槛

- Fake、Agent Loop、Durable Enterprise Provider、Anthropic-compatible 和
  OpenAI-compatible 路径覆盖同一顺序不变量；
- Core 专项、Central online/offline、完整 `pnpm run check` 通过；
- Contract、Kernel、数据库迁移无修改；
- P0 / P1 = 0；
- Claude Code 已独立复跑 ARH-1 harness 3 files / 22 tests、完整 Workspace
  151 files / 1041 tests + 3 smoke、Central online/offline，结论
  `PASS（P0=0 / P1=0 / P2=0 / P3=0）`；用户已正式接受并关闭 ARH-1。

## 4. ARH-2：Automatic Compaction Orchestration

状态：`ARH-2.0/2.1/2.2/2.3 PASS/CLOSED；ARH-2 PASS/CLOSED`。

目标是接通生产路径的 over-budget -> durable compaction -> Summary + raw tail ->
重建 Snapshot -> 重新预算 -> Model invocation。一次 Model round 最多一次自动压缩。

Claude Code 评审 P3-1：必须补充 Tool Call / Result 不被 source range 拆分的单元不变量。

详细方案见
[ARH-2 Automatic Compaction Orchestration Development Plan](./ARH-2-AUTOMATIC-COMPACTION-ORCHESTRATION-DEVELOPMENT-PLAN.md)。
Revision 1 已通过文档复核并由用户确认；ARH-2.1、ARH-2.2、ARH-2.3 及 repair.1 均已通过
独立 QA，结论 `PASS（P0=0 / P1=0 / P2=0 / P3=0）`，并由用户正式接受关闭。ARH-2
整体已形成 Atomic Planning、Production Orchestration 与 Recovery Closure Harness 闭环。

## 5. ARH-3：Isolation、Accounting 与统一 Evidence

状态：`ARH-3.0/3.1/3.2/3.3.0/3.3.1/3.3.2 PASS/CLOSED；ARH-3.3.3 IMPLEMENTED /
DEVELOPER GATES PASS / READY_FOR_INDEPENDENT_QA`。

目标是补充多 Session 隔离、token accounting、retry 去重、Prompt Cache Planning 和机器可读
安全证据。Revision 2 参考 Codex 的 Session-scoped cache key、Turn-scoped Model Client
Session、请求兼容性穷尽比较、稳定前缀和持久 TokenCount replay，但采用更严格的 exact
Session cache scope，并保留 RoboThree durable Usage Fact、attempt/fencing 和双数据库恢复模型。
Revision 3 进一步把 Usage/Cache 语义从 Central 专用收敛为执行位置中立，以
`central_enterprise` / `local_personal` 两类 authority 复用同一事实、去重、Projection 和 Cache
Conformance；本阶段只实现企业路径，个人路径只冻结私有 Port/Fake，不提前建设真实个人模型。

Claude Code 评审 P3-2：优先在 durable enterprise model usage 事实写入口实现 retry 幂等，
不得用进程内 Set 冒充持久去重。

详细方案见
[ARH-3 Isolation、Usage Accounting 与 Prompt Cache Development Plan](./ARH-3-ISOLATION-ACCOUNTING-PROMPT-CACHE-DEVELOPMENT-PLAN.md)。
ARH-3.2 的字段级、事务级与三批门禁见
[ARH-3.2 Prompt Cache Planning Detailed Plan](./ARH-3.2-PROMPT-CACHE-PLANNING-DEVELOPMENT-PLAN.md)。
ARH-3 拆分为 ARH-3.1 Durable Usage Facts、ARH-3.2 Prompt Cache Planning 与
ARH-3.3 Multi-Session Evidence Harness。Revision 2 新增 cache scope/static prefix/transport
identity 三分离、Compatibility Fingerprint、Static Prefix Monotonicity 以及 Invocation/Session
Usage Projection。代码核实还确认 exact Session scope 需要最小 Gateway v1alpha2
`cacheContext` sidecar；公共 `ModelRequest` 不变，v1alpha1 缺少 sidecar 时 cache disabled。
用户已接受该 sidecar 的架构例外，字段级 Schema/Fixture 仍由 ARH-3.2 单独授权。Revision 3
差异复核已通过，用户已关闭 ARH-3.0；ARH-3.1 已通过 Claude Code 独立 QA 并由用户正式
接受关闭。ARH-3.2 Revision 1 已通过差异复核；ARH-3.2.1 已完成 Contract/exact Session Scope
Foundation、独立 QA 与用户接受并正式关闭。ARH-3.2.2 已完成实现、独立 QA 与用户接受并正式
关闭。ARH-3.2.3 Revision 1 已完成差异复核、实现、独立 QA 与用户接受，ARH-3.2 整体正式
关闭；`CTR-P3-001` 独立跟踪且不自动进入 ARH-3.3。ARH-3.3 详细方案已评审通过，3.3.1
已通过独立 QA并由用户关闭；3.3.2 也已通过独立 QA并由用户正式关闭。3.3.3 Unified Closure
Evidence 已完成开发者正式门禁，等待 Claude Code 独立 QA；ARH-3.3/ARH-3 仍未关闭。

## 6. 批次门禁

```text
计划确认
-> 用户单独授权
-> 编码与开发者自测
-> Claude Code 独立 QA
-> 用户接受关闭
-> 下一批才可解锁
```
