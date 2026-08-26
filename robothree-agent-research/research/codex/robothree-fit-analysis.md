# RoboThree Fit Analysis — Codex CLI

> Commit `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7`。五分类：ADOPT / ADAPT / DEFER / REJECT / NEEDS_MORE_EVIDENCE。
> 分类结论均为 **[R]**（Recommendation）；每条「证据」引用为 **[F]**（Fact，源码路径可验证）。

## 1. 五分类结论总览

| # | 机制 | 分类 | MVP 需要 |
|---|---|---|---|
| 1 | Thread→Turn→Sampling→Tool 四层粒度 | **ADOPT** | ✅ |
| 2 | 分级取消（立即 kill / 优雅清理） | **ADOPT** | ✅ |
| 3 | `build_prompt` 单一 prompt 组装点 | **ADOPT** | ✅ |
| 4 | 三层安全模型（决策/隔离/升级） | **ADOPT** | ✅ |
| 5 | 四档扩展分层（隔离成本×集成深度） | **ADOPT** | ✅ |
| 6 | Skill 区分隐式/显式调用 | **ADOPT** | ✅ |
| 7 | 并发工具调度 RwLock 门 | **ADAPT** | 可选 |
| 8 | FuturesOrdered 边流边执行 | **ADAPT** | 可选 |
| 9 | turn-scoped sticky model session | **ADAPT** | 否 |
| 10 | 流式事件驱动 loop + Provider 事件协议 | **ADAPT** | ✅ |
| 11 | `render_decision_for_unmatched_command` 决策矩阵 | **ADAPT** | ✅ |
| 12 | `GranularApprovalConfig` 按来源开关 | **ADAPT** | 可选 |
| 13 | 多后端沙箱抽象（SandboxType + SandboxManager） | **ADAPT** | 可选 |
| 14 | 沙箱做成独立二进制 | **ADAPT** | 否 |
| 15 | Contributor 切面模型（先取 3 切面） | **ADAPT** | 可选 |
| 16 | Skill 依赖声明（SkillToolDependency） | **ADAPT** | 可选 |
| 17 | MCP 双向（Client+Server） | **ADAPT** | 否 |
| 18 | ExecPolicyAmendment 自我放宽 | **DEFER** | 否 |
| 19 | Plugin marketplace + 远程 bundle | **DEFER** | 否 |
| 20 | Extension 同进程 trait 注册 | **DEFER** | 否 |
| 21 | `Never` + 无沙箱直接 Allow | **REJECT** | — |
| 22 | 沙箱命名偏差（LinuxSeccomp→实际 Landlock/Bwrap） | **NEEDS_MORE_EVIDENCE** | — |

## 2. ADOPT（可直接采纳的设计骨架）

### 2.1 Thread→Turn→Sampling→Tool 四层粒度
- **理由**：Codex 用四个嵌套对象（Thread/Session/Turn/Step）表达运行时粒度，每层有明确职责与生命周期。这是 RoboThree Agent Runtime 的天然骨架。
- **证据**：[thread_manager.rs:216](../../sources/codex/codex-rs/core/src/thread_manager.rs#L216) `ThreadManager`、[codex_thread.rs:193](../../sources/codex/codex-rs/core/src/codex_thread.rs#L193) `CodexThread::submit`、[turn.rs:153](../../sources/codex/codex-rs/core/src/session/turn.rs#L153) `run_turn`、[step_context.rs](../../sources/codex/codex-rs/core/src/session/step_context.rs) `StepContext`。
- **边界**：适用于「多轮对话 + 工具调用」的交互式 agent；不适用于一次性批处理。
- **风险**：分层过细会增加复杂度；RoboThree 可先合并 Thread/Session。

### 2.2 分级取消（立即 kill / 优雅清理）
- **理由**：`wait_for_runtime_cancellation` 区分「立即 abort」与「等待 runtime 清理」，避免持久 shell/worker 取消时留孤儿进程。
- **证据**：[parallel.rs:182-217](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L182-L217)。
- **边界**：仅对「有进程/资源需清理」的工具（shell、exec、容器）有意义。
- **风险**：优雅清理可能阻塞取消；需 timeout 兜底。

### 2.3 三层安全模型（决策/隔离/升级）
- **理由**：Codex 的「执行前决策 + 沙箱隔离 + 运行时升级」是完整的 defense-in-depth，正是 RoboThree「Security 单独建模」所需的骨架。
- **证据**：[exec_policy.rs:726](../../sources/codex/codex-rs/core/src/exec_policy.rs#L726)、[sandboxing/src/manager.rs:267](../../sources/codex/codex-rs/sandboxing/src/manager.rs#L267)、[protocol/approvals.rs](../../sources/codex/codex-rs/protocol/src/approvals.rs)。
- **风险**：三层都做会重；MVP 可先做「决策层 + 基础隔离」。

### 2.4 四档扩展分层 + Skill 隐式/显式区分
- **理由**：按「隔离成本×集成深度」分成 Extension/Skill/Plugin/MCP 四档，避免「一个接口打天下」。Skill 区分 `allows_implicit_invocation` 直接服务 RoboThree 的 Skill 治理。
- **证据**：[skills/src/model.rs:23](../../sources/codex/codex-rs/skills/src/model.rs#L23)、[extension-api/src/lib.rs](../../sources/codex/codex-rs/ext/extension-api/src/lib.rs)。
- **风险**：四档全做会过度工程；MVP 先做 Skill + MCP 两档。

## 3. ADAPT（需改造后采纳）

### 3.1 并发工具调度 RwLock 门
- **理由**：「工具声明并发兼容性 + RwLock 表达并发组/串行屏障」是通用且优雅的模式。
- **证据**：[parallel.rs:153-157](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L153-L157)。
- **边界**：需 RoboThree 的工具模型支持「并发兼容性」声明。
- **风险**：工具输出回喂顺序需保证一致（Codex 用 FuturesOrdered 保序）。

### 3.2 render_decision_for_unmatched_command 决策矩阵
- **理由**：「危险 > 已知安全 > 沙箱兜底」的决策优先级，且「是否询问」与「沙箱是否兜底」耦合。
- **证据**：[exec_policy.rs:726-828](../../sources/codex/codex-rs/core/src/exec_policy.rs#L726-L828)。
- **边界**：启发式（危险/安全命令）需按 RoboThree 的命令分类重实现。

### 3.3 流式事件驱动 loop + Provider 事件协议
- **理由**：`ResponseEvent` 事件流抽象让 Runtime 与 UI 解耦。
- **证据**：[turn.rs:2219-2702](../../sources/codex/codex-rs/core/src/session/turn.rs#L2219-L2702)。
- **风险**：需定义 RoboThree 自己的事件协议，不可直接照搬 Responses API 事件。

## 4. DEFER（推迟）

### 4.1 ExecPolicyAmendment 自我放宽
- **理由**：用户批准后自动「amend 规则免批同类命令」有诱导放宽风险。
- **证据**：[exec_policy.rs:884-917](../../sources/codex/codex-rs/core/src/exec_policy.rs#L884-L917)。

### 4.2 Plugin marketplace + 远程 bundle
- **理由**：分发机制重（marketplace/upgrade/remote），MVP 不需要。

### 4.3 Extension 同进程 trait 注册
- **理由**：与 RoboThree 的 Worker 进程隔离模型可能冲突，需先定扩展边界。

## 5. REJECT（回避）

### 5.1 `Never` + 无沙箱直接 Allow
- **理由**：`AskForApproval::Never` 在 `Unrestricted` 环境对非危险命令直接 Allow（[exec_policy.rs:782-787](../../sources/codex/codex-rs/core/src/exec_policy.rs#L782-L787)），等于「完全信任模型 + 无兜底」，违反 default-deny 原则。
- **风险**：安全模型倒退。

## 6. NEEDS_MORE_EVIDENCE

### 6.1 沙箱命名偏差（`LinuxSeccomp` → 实际 Landlock/Bwrap）
- **理由**：`SandboxType::LinuxSeccomp` 的 metric tag 是 `"seccomp"`，但 Linux 后端实现是 Landlock + Bubblewrap（[sandboxing/src/landlock.rs](../../sources/codex/codex-rs/sandboxing/src/landlock.rs)、[sandboxing/src/bwrap.rs](../../sources/codex/codex-rs/sandboxing/src/bwrap.rs)）。
- **How to Close**：需运行时确认实际启用的沙箱后端（seccomp 是否也参与），或阅读 linux-sandbox 主二进制。

---

## Proposed RoboThree Changes

> 列出会影响 RoboThree 模块边界 / 技术栈 / 数据模型 / 安全模型 / 部署形态的候选变更。**仅作为提议，未自动落地。**

1. **Agent Runtime 引入四层粒度模型**（Thread / Turn / Sampling / Step）——影响 Runtime 模块边界。
2. **安全模型采用「决策 + 隔离 + 升级」三层**，取代单一 Permission gate——影响安全模型。
3. **工具调度引入「并发兼容性声明 + RwLock 并行门」**——影响 Tool Runtime 数据模型。
4. **取消模型引入「立即 kill / 优雅清理」分级**——影响 Tool Runtime / Worker。
5. **扩展体系按「隔离成本×集成深度」分四档**（Skill / Plugin / MCP / 进程内 Extension）——影响 Skill/Plugin/MCP 模块边界。
6. **Skill manifest 增加「隐式调用允许」字段**（对齐 `allows_implicit_invocation`）——影响 Skill 数据模型。
7. **命令批准采用 allow/prompt/forbid 决策矩阵 + 危险/安全启发式**——影响安全模型。
8. **沙箱做成可选独立二进制**（对齐 Daytona 进程分离）——影响部署形态。

## Requires Human Approval

> 需要用户拍板才能推进 RoboThree 正式架构决策的项。默认状态：`PENDING_HUMAN_DECISION`。

1. **四层粒度是否作为 RoboThree Runtime 官方模型**（或简化为三层）——`PENDING_HUMAN_DECISION`
2. **是否引入并发工具执行**（vs 串行，权衡一致性与吞吐）——`PENDING_HUMAN_DECISION`
3. **安全模型是否采用 Codex 三层**（决策/隔离/升级），尤其「沙箱独立二进制」是否进入 MVP——`PENDING_HUMAN_DECISION`
4. **扩展四档分层是否作为官方边界**（vs 先只做 Skill + MCP）——`PENDING_HUMAN_DECISION`
5. **命令批准决策矩阵是否纳入 RoboThree Permission 模块**——`PENDING_HUMAN_DECISION`
6. **分级取消是否作为 Tool Runtime 的强制契约**——`PENDING_HUMAN_DECISION`
