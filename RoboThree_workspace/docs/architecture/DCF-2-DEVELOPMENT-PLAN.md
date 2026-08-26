# DCF-2 Task、用户确认与恢复开发计划

## 1. 文档状态

```text
阶段：DCF-2
状态：PASS / CLOSED
DCF-2.0：PASS / CLOSED
DCF-2A：PASS / CLOSED
DCF-2B：PASS / CLOSED
DCF-2C：PASS / CLOSED
CGF-2：GATED
确认日期：2026-07-27
关闭日期：2026-07-28
```

本计划把 Desktop 从“可以创建任务并提交”推进到“用户可以理解、控制和恢复
真实任务”。DCF-2.0 已完成 Contract、Projection、威胁模型和 Conformance
实现，并经独立 QA 与用户接受正式关闭；DCF-2A、DCF-2B 已正式关闭。
DCF-2C 已完成恢复闭环与阶段 Harness，独立 QA 技术结论已经用户接受；用户
随后连续两次完成隔离现场演示，确认等待确认、重启恢复、真实 Process Echo、
Tool Activity 和最终持久结果均正常。DCF-2C 与 DCF-2 已正式关闭。

## 2. 阶段目标与边界

DCF-2 解决：

- Task、Run、Step 的产品级可见性；
- Tool Activity 产品级摘要；
- Desktop 用户确认；
- cancel、retry、continue 和补充输入；
- Snapshot + Durable Cursor 恢复；
- `uncertain` 的人工处理体验。

Local Core 是 Task、Confirmation 和 Recovery 的唯一事实源，负责 Task、Run、
Step、Action、Observation、Confirmation 与 Recovery。Desktop 只展示
Projection、提交高层 Command 和承载用户交互。

Renderer 禁止：

- 创建第二套 reducer 或推导 Task 状态；
- 解释 Effect、Receipt、Outbox 或 Checkpoint；
- 获取 CapabilityLock、PID、Credential 或 Runtime Handle。

Kernel reducer 保持纯函数；Desktop、Electron、HTTP/SSE 和恢复协调仍位于
Application/Adapter 层。

## 3. DCF-2.0：Contract、Projection、威胁模型与 Conformance

### 3.1 Projection

至少冻结：

- `TaskSummaryProjection`；
- `TaskDetailProjection`；
- `UserConfirmationProjection`；
- `ToolActivityProjection`。

Projection 只表达用户能力和产品状态，不暴露内部持久化或副作用对象。

### 3.2 高层 Command

至少冻结：

- `cancelTask`；
- `retryTask`；
- `continueTask`；
- `provideTaskInput`；
- `decideUserConfirmation`。

Desktop 只能提交用户意图。Local Core 校验 Task revision、当前状态、权限和
Confirmation 绑定关系。

### 3.3 Typed Error

至少覆盖：

- invalid task；
- invalid state；
- expired confirmation；
- duplicate decision；
- stale revision；
- permission denied。

错误必须可稳定映射为 UI 行为，不把内部异常、数据库行或敏感上下文直接返回
Renderer。

### 3.4 用户态 Task 状态

冻结初始顺序：

```text
准备中
排队中
执行中
等待输入
等待确认
正在恢复
成功
失败
已取消
已超时
需要人工处理
```

该 enum 允许 additive 扩展；禁止删除既有状态、改变既有语义或调整既有顺序。
未来需要细分时只能新增，不得把 durable Kernel TaskStatus 改造成 UI 状态机。

### 3.5 Confirmation 与 WorkspaceGrant

```text
WorkspaceGrant：是否允许访问某个范围
Confirmation：在既有权限范围内，这一次动作是否执行
```

普通确认不能绕过 WorkspaceGrant、用户权限或非法 Contract。

确认矩阵：

| 类别 | MVP 行为 |
| --- | --- |
| 授权 Workspace 内普通读取、分析 | 不逐次确认 |
| 任务授权范围内普通创建、修改 | 降低确认频率 |
| 高风险写、删除、程序执行、外部发送、高影响副作用 | 必须确认 |
| 越界访问、未授权资源、非法 Contract | 必须拒绝 |

### 3.6 Confirmation 幂等

复用 SubmitTurn 风格：

```text
confirmationId + requestDigest
```

- 相同 `confirmationId`、相同 digest：返回已有决定；
- 相同 `confirmationId`、不同 digest：typed conflict；
- 不建立第二套确认幂等体系。

Confirmation 决定必须与 Task、Run、Step 和不可变 ActionIntent 精确绑定，不能
修改 Core 已生成的 ActionIntent。

### 3.7 Retry 与迟到 Observation

Retry 总是创建新 Run。旧 Run 的迟到 Observation：

- 追加到旧 Run Event Log，保留历史事实；
- 不修改新 Run；
- 不覆盖 Active Run；
- 不改变当前 Task 结果。

### 3.8 `uncertain` 与 Tool Activity

`uncertain` 统一投影为“需要人工处理”，不得自动判断成功或失败。

允许展示 Task/Action 类型、目标摘要、时间、状态原因与下一步建议；禁止展示
原始 Tool 参数、Secret、完整请求正文或敏感文件内容。

Tool Activity 只展示 Tool 名称、操作类型、状态、时间和安全摘要；禁止展示
Credential、完整输入输出或内部 Effect 信息。

### 3.9 DCF-2.0 退出门槛

- Contract strict、JSON-safe 且保持兼容扩展边界；
- Projection 无内部运行时与敏感字段泄漏；
- 高层 Command 的 revision、状态、权限和幂等规则可测试；
- Confirmation 威胁模型覆盖重放、过期、错 Task/Action、重复和迟到决定；
- Contract/Projection Conformance 与架构边界测试通过；
- 独立 QA 无 P0/P1，并由用户接受后才解锁 DCF-2A。

## 4. DCF-2A：Task 列表、详情与 Tool Activity

交付：

- Session 下 Task 列表和 Task Detail；
- Run/Step 产品投影与状态时间线；
- Tool Activity 摘要；
- 失败、取消、超时和 `uncertain` 说明；
- Durable Event 增量刷新；
- SSE reconnect 后 Snapshot + durable cursor 收敛；
- 重复 Event 去重和乱序保护；
- Desktop 重启后的历史 Task 恢复。

退出门槛：

- UI 与 Core Snapshot 一致；
- reconnect 和 restart 后最终收敛；
- Event 不重复展示；
- `uncertain` 正确显示“需要人工处理”；
- 独立 QA PASS 并由用户接受。

## 5. DCF-2B：用户确认与任务控制

交付：

- Confirmation 卡片、风险、目标和确认后果；
- allow/reject；
- cancel、continue、retry、provide input；
- `waiting_user_confirmation` 持久化与崩溃恢复；
- 重复、迟到、过期和不匹配决定的 typed rejection；
- 确认后、分发前重新检查 disabled、revoked 和 health 等实时收窄状态。

退出门槛：

- 同一 Confirmation 只形成一个有效决定；
- 决定精确绑定 Task/Run/Step/ActionIntent；
- rejected/expired 决定不产生外部副作用；
- cancel/retry/continue 保持既有 reducer 不变量；
- 独立 QA PASS 并由用户接受。

## 6. DCF-2C：恢复闭环与阶段 Harness

恢复矩阵至少覆盖：

- running；
- waiting_input；
- waiting_user_confirmation；
- Desktop restart；
- Core restart；
- SSE reconnect；
- cancel-restart；
- decision-restart；
- retry-late-observation。

复用 DCF-1.3 Harness 的 lifecycle、reconnect、backpressure 和资源清理能力。
独立 QA 必须实际执行恢复矩阵，禁止以 digest 或历史报告替代。

阶段关闭还需要用户现场完成：

```text
创建 Session
→ 选择 Agent / Model / Workspace
→ 提交任务
→ 查看 Task / Tool Activity
→ 处理确认
→ 中断或重启
→ 恢复
→ 查看最终持久结果
```

为避免依赖未开发的通用本地 Tool，现场体验使用显式
`pnpm run demo:dcf2c` 入口。该入口使用独立 Electron userData 与 SQLite，
注册固定 DCF-2C Demo Agent、Scripted Model 和受控进程外 Echo Tool；Tool
输入由 Core 固定生成，不执行用户文本或 Shell。演示必须覆盖等待确认后重启、
同一确认恢复、允许后真实 Process Echo 完成，以及再次重启后最终消息不重复。
演示实现不得进入公共 Contract、Kernel、Preload 或 Renderer，也不得改变正常
Desktop 启动路径。现场步骤见
[DCF-2C 用户现场体验指南](../development/DCF-2C-USER-DEMO-GUIDE.md)。

DCF-2A、2B、2C 均独立 QA PASS 并由用户接受后，DCF-2 才能关闭。

## 7. 用户体验要求

| 状态 | 必须说明 |
| --- | --- |
| 等待输入 | 等待什么、用户需要提供什么、示例 |
| 等待确认 | 原因、风险、目标、确认后的行为 |
| 正在恢复 | 当前恢复阶段、是否需用户操作、超时处理 |
| 需要人工处理 | 原因、已完成内容、下一步建议 |

不得只显示笼统的“等待中”。

## 8. 上游借鉴与复用

- OpenHands：借鉴 Action/Observation 的用户可理解执行轨迹，不照搬服务形态；
- LangGraph：借鉴 interrupt/resume、checkpoint 与显式恢复，不绑定图运行时；
- OpenClaw：借鉴工具风险和本地用户确认边界，不引入完整插件体系；
- grok-build：借鉴 Tool Registry 与 Agent 可见 Tool Schema 分离；
- RoboThree KAF-1～5、DCF-1.1～1.3：直接复用 reducer、Effect/Receipt/Outbox、
  RuntimeSelection、CapabilityLock、durable cursor、lifecycle 和 Harness。

所有实现均为 RoboThree 自有代码，不复制第三方源码。

## 9. MVP 非目标

DCF-2 不实现：

- 企业 Task/Run/Step/Tool Action 审批、Approver 或审批中心；
- Policy Engine；
- Workflow Canvas；
- Multi-Agent 或 Subagent；
- Admin Console；
- 企业 Model 或企业 Tool Gateway；
- Task Template；
- Long Memory；
- 完整 Artifact 工作台；
- 复杂诊断中心或独立消息中心。

## 10. 执行顺序、工期与门槛

```text
DCF-2.0
→ Contract / Projection 独立 QA与用户接受
→ DCF-2A
→ 独立 QA 与用户接受
→ DCF-2B
→ 独立 QA 与用户接受
→ DCF-2C
→ 恢复 Harness、独立 QA 与用户现场验收
→ DCF-2 PASS / CLOSED
```

前一批未被用户接受，后一批保持 `GATED`。CGF-2 继续 `GATED`，不会因
DCF-2 确认或关闭自动解锁。

- 集中工程工作量：7～11 个工作日；
- PM 日历参考：12～20 天；
- 工作日表示约 8 小时集中工程投入，不等于日历日；
- QA、用户验收、Confirmation UX 和恢复矩阵形成 P2 schedule risk。

## 11. 当前结论

```text
DCF-2：PASS / CLOSED
DCF-2.0：PASS / CLOSED
DCF-2A：PASS / CLOSED
DCF-2B：PASS / CLOSED
DCF-2C：PASS / CLOSED
CGF-2：GATED
新 P0：0
新 P1：0
```
