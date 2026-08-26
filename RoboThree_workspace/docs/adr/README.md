# Architecture Decision Records

对重要、长期且难以回退的技术决策建立 ADR。

## 状态说明

- `PROPOSED`：讨论草案，尚不约束生产实现；
- `ACCEPTED`：已确认，后续实现必须遵守；
- `SUPERSEDED`：已被新的 ADR 替代，保留历史。

## 已接受

- [ADR-001：部署边界](./001-deployment-boundary.md)
- [ADR-002：本地文件授权](./002-local-file-authorization.md)
- [ADR-003：Kernel Alpha 里程碑](./003-kernel-alpha-milestones.md)
- [ADR-004：Kernel Alpha 技术栈](./004-kernel-alpha-technology-stack.md)
- [ADR-005：Agent 状态与 Task/Run/Step 所有权](./005-agent-state-task-run-step.md)
- [ADR-006：MVP 固定授权、Tool 风险与 Desktop 用户确认](./006-permission-policy-data-approval.md)
- [ADR-007：Event、Checkpoint、幂等与副作用一致性](./007-event-checkpoint-side-effect-consistency.md)
- [ADR-008：Capability Registry 与 Adapter 边界](./008-capability-registry-and-adapter-boundary.md)
- [ADR-009：企业服务端 Java 与本地 Agent Node.js 技术边界](./009-enterprise-java-and-local-node-boundary.md)
- [ADR-010：Session、Context Assembly、Compaction 与 Memory 边界](./010-session-context-compaction-and-memory-boundary.md)
- [ADR-011：Agent Definition 与 Task Runtime Selection](./011-task-runtime-selection.md)
- [ADR-012：Submit Turn 跨 Session/Task 最小协调与恢复](./012-submit-turn-coordination.md)
- [ADR-013：Personal Credential Store 与受控 Broker 边界](./013-personal-credential-store-broker.md)
- [ADR-014：Enterprise OA Identity、Managed Device Trust 与 Client Credential](./014-enterprise-client-identity-and-credential-bootstrap.md)
- [ADR-015：Enterprise Model Invocation 与 Development Provider 边界](./015-enterprise-model-invocation-and-development-provider-boundary.md)
- [ADR-015 补充修订 A：厂商直连、自定义中转站与 Model Endpoint Binding](./015a-direct-provider-and-custom-relay-addendum.md)
- [ADR-016：Central Java Engineering Baseline](./016-central-java-engineering-baseline.md)
- [ADR-017：Agent Tool-Call Batch Completion、Cancellation 与 Recovery](./017-agent-tool-call-batch-completion-cancellation-and-recovery.md)

## 待接受增补

- [ADR-013 补充修订 A：个人 Credential Reveal 与 macOS Keychain 实现边界](./013a-personal-credential-reveal-and-macos-keychain-addendum.md) — PROPOSED；DFI-4A.0-repair.1 与 DFI-4A.0 已独立 QA、用户接受并正式关闭，DFI-4A.2 reveal 继续 GATED

`ACCEPTED` ADR 构成正式工程约束；`PROPOSED` ADR 仅用于收敛实现前的问题。
