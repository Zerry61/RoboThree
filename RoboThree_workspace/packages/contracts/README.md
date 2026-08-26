# Contracts

Desktop、Core 及未来 Worker 之间的协议和共享类型。

本包只描述边界契约，不依赖任何应用或服务的内部实现。

## 当前内容

- `v1alpha1` Contract Version；
- Entity ID、Timestamp 和版本化 Envelope 基础；
- 归一化 `RuntimeError`；
- Core/Component Health；
- 最小 ModelRequest/ModelStreamEvent；
- Zod 运行时 Schema 与边界测试。
- AgentDefinitionRef 与 ExecutionPlanRevisionRef；
- Session、TaskRunState、RunState 与 StepState；
- JSON-safe Action 与类型化 Observation；
- start/retry/step/wait/resume/observation/complete/fail/cancel/deadline Command；
- TaskTransition 与结构不变量校验。
- canonical JSON 与 SHA-256 Digest Contract；
- TaskEvent、TaskCheckpoint、TaskHead 与 CommandReceipt；
- EffectAttempt、显式 Effect recovery mode 与 OutboxRecord；
- Event sequence、Checkpoint/state、Receipt/Transition 等持久化结构不变量。
- Desktop Local Runtime `v1alpha1` strict Contract：
  Control、Workspace、Session、Catalog、SubmitTurn、Task Projection、
  Durable/Ephemeral Event、Replay Reset 与 Error；
- Desktop valid/invalid Fixture corpus 和 Main/Core consumer Conformance。

Task/Run/Step 语义由 ADR-005 冻结，Event/Checkpoint/幂等与恢复语义由 ADR-007 冻结。KAF-2.3 已定义 `idempotent_retry`、`query_then_retry`、`manual_reconciliation` 三种恢复能力，并由 Core 验证 Effect 生命周期；完整 ExecutionPlan 和真实 Tool/MCP 专用 Action 仍按后续批次增量加入。

Enterprise Gateway 的跨语言 canonical Schema 不在本包内；唯一事实源位于仓库
根级 `contracts/enterprise-gateway/v1alpha1/`。本包不得形成第二套可编辑
Enterprise Schema。
