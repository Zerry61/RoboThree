# Open Questions — Codex CLI

> Commit `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7`。所有 UNKNOWN 项附 How to Close。
> 问题描述中的源码引用为 **[F]**（Fact）；「How to Close」为 **[R]**（Recommendation）。

## 1. 运行时行为（静态分析无法确认）

### Q1. 实际沙箱后端是否含 seccomp？
- **问题**：`SandboxType::LinuxSeccomp`（[manager.rs:35](../../sources/codex/codex-rs/sandboxing/src/manager.rs#L35)）命名暗示 seccomp，但后端实现是 Landlock + Bubblewrap。seccomp 是否也参与？
- **How to Close**：阅读 [linux-sandbox/src/main.rs](../../sources/codex/codex-rs/linux-sandbox/src/main.rs) 完整启动流程，或运行时 `strace` 确认系统调用过滤。

### Q2. 工具并发的实际并发度上限？
- **问题**：`FuturesOrdered` 语义明确（并发 poll），但同一 sampling 内是否有并发数上限？多工具同时写文件是否产生竞态？
- **How to Close**：运行时注入多个并发 tool call，观察执行时序；或读 `orchestrator.rs` 的并发控制。

### Q3. `wait_for_runtime_cancellation` 的优雅清理是否有超时？
- **问题**：[parallel.rs:188-198](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L188-L198) 等待 runtime 清理是否可能无限阻塞？
- **How to Close**：确认 dispatch task 内部是否有 timeout；运行时触发持久 shell 取消。

## 2. 设计推断待验证

### Q4. Step 与 Sampling 的精确边界
- **问题**：`StepContext` 是「一次 sampling 请求的请求视图」，但 mid-turn compaction 后是否重建 step？`next_step_context` 的复用逻辑（[turn.rs:314-336](../../sources/codex/codex-rs/core/src/session/turn.rs#L314-L336)）在压缩/steer 场景下的边界需更精确。
- **How to Close**：追踪 compaction + steer 场景下 `capture_step_context` 的调用路径。

### Q5. `.rules` 文件与 `config.toml` 的优先级细节
- **问题**：`load_exec_policy`（[exec_policy.rs:637](../../sources/codex/codex-rs/core/src/exec_policy.rs#L637)）按配置层叠加，但「项目层 .rules 覆盖用户层」的确切语义需确认。
- **How to Close**：读 config crate 的层定义 + `execpolicy` crate 的规则合并逻辑。

### Q6. Extension 与 Plugin 的信任边界
- **问题**：进程内 Extension（trait 注册）与 Plugin（marketplace bundle）是否共享同一信任模型？Extension 是否能执行任意代码？
- **How to Close**：读 `core-plugins/src/loader.rs` + `plugin/src/provider.rs` 的加载/沙箱逻辑。

## 3. RoboThree 映射未决项

### Q7. 四层粒度是否过度
- **问题**：RoboThree 的 MVP 是否需要完整的 Thread/Turn/Sampling/Step 四层，还是 Thread/Turn 两层足够？
- **How to Close**：与 Daytona 的 Job 模型、OpenCode 的三层模型交叉对比后决定（见 [comparisons/](../../comparisons/)）。

### Q8. 并发工具执行的「输出回喂顺序」语义
- **问题**：Codex 用 `FuturesOrdered` 保序，但 RoboThree 若并发执行，工具输出按什么顺序回喂模型？是否需要「按完成顺序」vs「按调用顺序」的策略开关（对齐 Pi 的「三 Dispatch 策略」）。
- **How to Close**：对比 Pi 的三策略（见 [pi/index.md](../pi/index.md)），决定 RoboThree 默认策略。

### Q9. 命令批准决策矩阵的启发式来源
- **问题**：Codex 的 `is_known_safe_command` / `is_dangerous_command` 启发式来自 `codex_shell_command` crate，RoboThree 需重实现。是否有更简单的 MVP 替代（如纯 allowlist）？
- **How to Close**：评估 `codex-shell-command` crate 的启发式复杂度，决定 MVP 用纯 allowlist 还是启发式。

## 4. 证据不足的结论

### Q10. 沙箱实际隔离强度
- **问题**：静态分析确认了沙箱抽象层，但 Landlock/Bwrap/Seatbelt 的实际隔离强度（能否逃逸、网络是否完全阻断）未实测。
- **How to Close**：在受限容器中运行时验证（需用户授权）。

### Q11. `Never` 模式的真实风险敞口
- **问题**：`AskForApproval::Never` + `Unrestricted` 直接 Allow 的风险是静态推断，未验证是否有其它兜底（如模型侧 safety）。
- **How to Close**：读 `safety.rs` / `guardian` 扩展是否有模型输出过滤兜底。

---

> 按 SKILL § 15.2：UNKNOWN 项写于此，不写空模板、不为「未发现」写大段说明。
