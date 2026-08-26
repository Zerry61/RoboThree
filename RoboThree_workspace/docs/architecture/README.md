# Architecture

系统架构、模块边界、运行时流程和安全模型。

## 文档

- [RoboThree 技术架构与技术选型说明 v1.0（DRAFT）](./ROBOTHREE-TECHNOLOGY-ARCHITECTURE-SELECTION-v1.0.md)：汇总 Desktop、Local Core、Worker、Central、Contract、Persistence、Model/Tool/Skill/Knowledge 的实际技术栈、选型理由、替代方案、风险和演进边界；明确区分已实现、已接受、拟议和后置状态。
- [RoboThree 关键节点记录](./KEY-NODES.md)：按时间记录已经确认、会约束后续设计和实现的阶段共识。
- [开源 Agent 架构借鉴映射](./RESEARCH-ADOPTION-MAP.md)：经本地研究交叉验证的 ADOPT/ADAPT/DEFER/REJECT/OWN 清单。
- [Kernel Alpha 方案](./KERNEL-ALPHA-PLAN.md)：不绑定业务场景的通用内核范围、执行路径和验收标准。
- [KA-0 开发计划](./KA-0-DEVELOPMENT-PLAN.md)：Kernel Framework First 的阶段、工程边界、性能与扩展性验收。
- [KAF-2 开发计划](./KAF-2-DEVELOPMENT-PLAN.md)：Event、Persistence、Command 幂等、Checkpoint、Outbox 与恢复的分批实现和验收门槛。
- [KAF-3 开发计划](./KAF-3-DEVELOPMENT-PLAN.md)：Capability 分层、不可变 Registry、Task 锁定、类型化 Adapter Port 与进程外 Echo 的分批实现和验收门槛。
- [KAF-4 开发计划](./KAF-4-DEVELOPMENT-PLAN.md)：固定授权、持久用户确认、有界并发、背压、类型化重试、性能与可靠性的三批实现计划。
- [KAF-5 开发计划（CLOSED）](./KAF-5-DEVELOPMENT-PLAN.md)：Conversation、Context、Compaction、最小 Agent Loop 与 Headless 验收计划；KAF-5.0～5.3 已全部独立 QA `PASS`。
- [Desktop/Central Foundation 架构收口基线](./DESKTOP-CENTRAL-FOUNDATION-ARCHITECTURE-BASELINE.md)：四项方案状态、对象所有权、P0/P2/P3 映射、DCF-0/CGF-0 边界和解阻塞顺序。
- [Desktop Client Foundation 开发计划](./DESKTOP-CLIENT-FOUNDATION-DEVELOPMENT-PLAN.md)：Desktop 安全壳、Fixture Chat、Task/确认、Skill Summary Catalog + Locked Body Materialization、个人 Model 和 E2E 分批门槛。
- [DCF-1.2 开发计划（CLOSED）](./DCF-1.2-DEVELOPMENT-PLAN.md)：正式 Core 私有 HTTP/SSE、Application Facade、Main Client、Preload 白名单、最小工作台、Scripted Model streaming 与 Snapshot/cursor 收敛的三批计划；1.2A～1.2C 已全部独立 QA `PASS/CLOSED`。
- [DCF-1.3 开发计划（CLOSED）](./DCF-1.3-DEVELOPMENT-PLAN.md)：Desktop/Core restart/recovery、SSE backpressure、slow consumer、资源回收、runtimeInstance 生命周期和 30～60 分钟长稳 Harness；1.3A～1.3C 已全部通过独立 QA 并由用户接受关闭。
- [DCF-2 开发计划（CLOSED）](./DCF-2-DEVELOPMENT-PLAN.md)：Task/Tool Activity Projection、Desktop 用户确认、Task Control、Snapshot + Durable Cursor 恢复和 uncertain 人工处理；DCF-2.0/2A/2B/2C 已通过独立 QA，现场体验已通过，DCF-2 正式关闭。
- [Central Gateway Foundation 开发计划](./CENTRAL-GATEWAY-FOUNDATION-DEVELOPMENT-PLAN.md)：Java 模块化单体、物化企业配置、企业 Model/Tool Gateway 和离线验收分批门槛。
- [Central Java Alignment-1 开发计划（CLOSED）](./CENTRAL-JAVA-ALIGNMENT-1-DEVELOPMENT-PLAN.md)：按 ADR-016 对齐受限 Lombok、GET/POST、Thin Controller、Bearer 安全边界、全局异常和 Micrometer/OpenTelemetry；Alignment-1A/1B 已通过独立 QA 并由用户接受关闭。
- [Central Java Alignment-2A 开发计划（CLOSED）](./CENTRAL-JAVA-ALIGNMENT-2A-DEVELOPMENT-PLAN.md)：MyBatis-Plus Persistence Adapter、版本化 SQL Script、V1～V5 Bridge、Manifest/Preflight 与生产持久化切换三批方案；2A.1～2A.3 已全部独立 QA `PASS/CLOSED`。
- [Central Java Alignment-2B 开发计划（PASS/CLOSED）](./CENTRAL-JAVA-ALIGNMENT-2B-DEVELOPMENT-PLAN.md)：Production Dependency Manifest、Fake/InMemory 失败关闭、liveness/readiness、双 JVM 双节点和故障恢复三批方案；2B.1、2B.2、2B.3 与 Alignment-2B 整体均已 `PASS/CLOSED`，CGF-2 继续 `GATED`。
- [CGF-2 Model Gateway Foundation 开发计划（IN PROGRESS）](./CGF-2-DEVELOPMENT-PLAN.md)：CGF-2.0、CGF-2A 与 CGF-2B 已全部 `PASS/CLOSED`；厂商直连和 Public Custom Relay 作为 Foundation 退出证据，企业内网 Relay Conformance 后移至 Enterprise Integration；ADR17-I1/I2/I3 与 ADR-017 Implementation Gate 已全部 `PASS/CLOSED`，CGF-2C 代码批次继续 `GATED`。
- [CGF-2B.1 双协议 Provider Stub 与安全传输开发计划（PASS/CLOSED）](./CGF-2B.1-DEVELOPMENT-PLAN.md)：基于 CGF-2A 已关闭事实补齐瞬态 Provider Request、流式 Sink、Credential 授权 Transport、Endpoint/HTTP 安全及 Anthropic/OpenAI 双协议 Stub Conformance；独立 QA P0～P3=0 且用户已接受。
- [CGF-2B.2 厂商直连 Runtime Bridge 与真实 Provider 验证计划（PASS/CLOSED）](./CGF-2B.2-DIRECT-PROVIDER-CONFORMANCE-PLAN.md)：Runtime Bridge、双协议 Stub Conformance 与真实 Harness 已实现；repair.2 已修复 blank content P1，Central 182 x2、Workspace 107/685、真实四场景与零泄漏独立 QA 均通过并由用户接受。
- [CGF-2B.3 企业中转站与双节点真实边界开发计划（PASS/CLOSED）](./CGF-2B.3-DEVELOPMENT-PLAN.md)：B.3.1 公网 Custom Relay、B.3.2 双 JVM Recovery 和 B.3.3 安全/协议/资源收口均已通过独立 QA 和用户接受；CGF-2B.3 与 CGF-2B 整体已关闭，企业内网 Relay Conformance 后移至 Enterprise Integration。
- [CGF-2B.3.2 双 JVM Relay Recovery 开发计划（PASS/CLOSED）](./CGF-2B.3.2-DEVELOPMENT-PLAN.md)：两个独立 Central Java PID、共享 PostgreSQL 16 和进程外受控 Relay 已验证 F1～F10、manual reconciliation、no duplicate POST、lease/fencing、单终态、durable cursor 与 Binding v1/v2，并通过独立 QA 和用户接受。
- [CGF-2.0 Model Gateway Contract 与威胁模型](./CGF-2.0-MODEL-GATEWAY-THREAT-MODEL.md)：冻结身份/权限、Credential、外发确认、幂等、durable/ephemeral、四类计时、lease/fencing、Provider 私有帧和 Production fail-closed 安全边界。
- [ADR-017：Agent Tool-Call Batch Completion、Cancellation 与 Recovery](../adr/017-agent-tool-call-batch-completion-cancellation-and-recovery.md)：冻结多 Tool Call no-orphan completion、用户取消与崩溃恢复分流、确认顺序、Retry 新 Run 和 CGF-2C 前置门槛。
- [ADR-017 Implementation Plan（PASS/CLOSED）](./ADR-017-IMPLEMENTATION-PLAN.md)：已完成 Assistant batch + disposition 原子 intent、Task Effect 双事务协调、取消/确认/Retry/recovery 三批实现和统一 18 场景 Conformance；I1/I2/I3 均已通过独立 QA 与用户接受，关闭后不自动授权 CGF-2C.1。
- [CGF-2C Development Plan（CONFIRMED / GATED）](./CGF-2C-DEVELOPMENT-PLAN.md)：规划 Model 外发专用 Confirmation Scope、Local Core Admission/HTTP Provider、Desktop 确认/Streaming/持久消息收敛及 Java/Node/Electron 联合恢复；业务场景和 Enterprise Integration 均不进入本阶段。
- [CGF-2C.1 具体实施方案（ACCEPTED / IN PROGRESS）](./CGF-2C.1-DEVELOPMENT-PLAN.md)：细化按 Task 锁定 Model Provider、Model 外发 Confirmation、Core Invocation Link、Central Thin HTTP/SSE、execution owner/被动订阅、canonical SSE strict consumer 和输出连续性恢复；Revision 1 已通过 Claude Code `P0～P3=0` 复核并由用户授权编码，C.2/C.3 仍保持门禁。
- [DCF-1 Contract、威胁模型与 Conformance 方案（CONFIRMED_WITH_SPECIFIED_REVISIONS）](./DCF-1-CONTRACT-THREAT-MODEL-AND-CONFORMANCE-PLAN.md)：正式 Desktop 字段级 Contract、localhost 安全边界、submitTurn、durable cursor 和 1.0～1.3 批次门槛；DCF-1.0～1.3 已全部关闭。
- [CGF-1 基础设施、身份与跨语言 Conformance 方案（CONFIRMED_WITH_SPECIFIED_REVISIONS）](./CGF-1-INFRASTRUCTURE-IDENTITY-AND-CONFORMANCE-PLAN.md)：PostgreSQL/Flyway、OA Identity、Device Challenge/Proof、跨语言 Schema、配置物化和两层激活；CGF-1.1 已 `CLOSED`，CGF-1.2 继续按单批方案门槛推进。
- [CGF-1.1 开发计划（CLOSED）](./CGF-1.1-DEVELOPMENT-PLAN.md)：Persistence、Identity/Device Trust、Token/Configuration、Recovery 四检查点均已独立 QA `PASS/CLOSED`。
- [CGF-1.2 开发计划（CLOSED）](./CGF-1.2-DEVELOPMENT-PLAN.md)：exact Package read、Token 多请求生命周期、Local Core 配置校验/独立 SQLite Storage Activation、状态 Projection、Java↔Node E2E 和崩溃矩阵；1.2A～1.2C 已全部关闭。
- [CGF-1.3 开发计划（CLOSED）](./CGF-1.3-DEVELOPMENT-PLAN.md)：企业 Registry Materializer、Controlled Core Restart、Runtime Activation、generation 引用安全、双 SQLite 恢复、GC blocker 和企业离线四状态；1.3A～1.3C 已全部通过独立 QA 并由用户接受关闭。
- [Desktop Local Runtime Contract v1alpha1（ACCEPTED）](./contracts/DESKTOP-LOCAL-RUNTIME-CONTRACT-v1alpha1.md)：Renderer/Main/Core 命令、查询、事件、cursor 与安全边界。
- [Desktop Local Runtime Contract v1alpha2](./contracts/DESKTOP-LOCAL-RUNTIME-CONTRACT-v1alpha2-PROPOSAL.md)：企业配置同步/激活状态 Projection、durable Event 和 v1alpha1 派生兼容语义；Schema/Fixture 已由 CGF-1.2A 实现，等待独立 QA。
- [Enterprise Gateway Contract v1alpha1（ACCEPTED）](./contracts/ENTERPRISE-GATEWAY-CONTRACT-v1alpha1.md)：Node/Java 配置、Model、Tool、Audit、离线和两层激活边界。
- [`contracts/enterprise-gateway/v1alpha1`](../../contracts/enterprise-gateway/v1alpha1/)：Enterprise Gateway 跨语言唯一 canonical OpenAPI 3.1、JSON Schema 2020-12、Fixture 与 digest 规则。
- [上游借鉴登记表](./UPSTREAM-ADOPTION-REGISTER.md)：逐模块记录固定上游、借鉴内容、复用方式、许可证和不照搬原因。
- [RoboThree MVP 功能范围与开发基线 v1.0](../product/ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md)：当前冻结的 MVP P0/P1、用户能力、开发顺序与验收边界。
- [RoboThree 产品与架构基线 v1.0](../product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md)：保留产品定位、核心概念、场景边界与关键技术约束；MVP 范围冲突时以上述功能基线为准。
