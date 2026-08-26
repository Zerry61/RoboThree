# Deep Dive 2: Sandbox + Exec Policy (Approval) 安全边界

> L3 Mechanism #2 | commit `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7`
> Method: 静态源码分析（无运行时验证）

## 1. Executive Summary

Codex 的安全模型是**三层分离**的，这是它与几乎所有开源 Coding Agent 的最大差异：

1. **执行前决策层（exec policy）**：`AskForApproval` 策略 + `.rules` 规则文件 + 「危险命令 / 已知安全命令」启发式，对命令给出 `Allow` / `Prompt` / `Forbidden` 决策。
2. **沙箱隔离层（sandboxing）**：在 spawn 前 transform 进程，Linux 用 Landlock（无 root）+ Bubblewrap（用户命名空间），macOS 用 Seatbelt，Windows 用 Restricted Token。
3. **运行时升级层（approval）**：沙箱内失败 → 请求提升权限 → 用户批准 → 可选「amend execpolicy 让后续同类命令免批」。

关键结论：**Codex 的「安全」不是一道 if 判断，而是一个「决策 + 隔离 + 升级」的完整状态机**。RoboThree 若做「Security 单独建模」，这是最值得参考的样板。

## 2. 决策层：AskForApproval + Exec Policy

### 2.1 四模式审批策略

**[F]** [protocol.rs:906-930](../../sources/codex/codex-rs/protocol/src/protocol.rs#L906-L930) `AskForApproval` 枚举：

| 变体 | serde 名 | 语义 |
|---|---|---|
| `UnlessTrusted` | `"untrusted"` | 仅「已知安全且只读」命令自动批准，其余询问 |
| `OnRequest` | `"on-failure"`(alias)/默认 | 模型决定何时请求批准 |
| `Granular(GranularApprovalConfig)` | `"granular"` | 细粒度：`sandbox_approval`/`rules`/`skill_approval`/`request_permissions`/`mcp_elicitations` 各自开关 |
| `Never` | `"never"` | 从不询问，失败直接返回模型 |

**[F]** [protocol.rs:932-947](../../sources/codex/codex-rs/protocol/src/protocol.rs#L932-L947) `GranularApprovalConfig` 的五个布尔字段，是「按审批来源」的开关矩阵——这比「全局 on/off」精细得多。

### 2.2 决策核心：render_decision_for_unmatched_command

**[F]** [exec_policy.rs:726-828](../../sources/codex/codex-rs/core/src/exec_policy.rs#L726-L828) 是无规则命中命令的决策函数，是整张决策矩阵：

```text
render_decision_for_unmatched_command(command, context):
  dangerous_command_match = dangerous_command_match_for_origin(...)
  is_known_safe = is_known_safe_command(command)  // 只读命令白名单

  1. if is_known_safe && !used_complex_parsing
       && approval_policy == UnlessTrusted:
         return Allow                        // 只读安全命令 + untrusted → 放行

  2. if dangerous_command_match.is_some()      // 危险命令
       || no_sandbox_backend:
         return match approval_policy {
             Never → Forbidden,
             _     → Prompt                  // 危险/无沙箱 → 必须问（Never 则禁）
         }

  3. match approval_policy:                  // 普通命令
       Never → Allow                          // 靠沙箱兜底
       UnlessTrusted → Prompt                 // 不在安全名单 → 问
       OnRequest / Granular →
         match file_system_sandbox_kind:
           Unrestricted | ExternalSandbox → Allow   // 无沙箱环境「直接跑」
           Restricted →
             if requests_sandbox_override → Prompt  // 要突破沙箱 → 问
             else → Allow                           // 沙箱内 → 放行
```

**[I]** 这张决策矩阵的**设计思想**是 Codex 安全模型的核心：决策**优先级**为「危险命令 > 已知安全 > 沙箱环境兜底」，且「是否询问」与「沙箱是否在兜底」强耦合——有沙箱时放行非危险命令（信任沙箱），无沙箱时提升到询问。这是「defense-in-depth」而非「单点 gate」。

**[F]** 危险命令识别：`dangerous_command_match_for_origin`（[exec_policy.rs:706](../../sources/codex/codex-rs/core/src/exec_policy.rs#L706)）调用 `codex_shell_command::is_dangerous_command`；已知安全命令用 `is_known_safe_command`（[exec_policy.rs:736](../../sources/codex/codex-rs/core/src/exec_policy.rs#L736)）。

### 2.3 `.rules` 文件与 ExecPolicyManager

**[F]** `ExecPolicyManager`（[exec_policy.rs:276](../../sources/codex/codex-rs/core/src/exec_policy.rs#L276)）加载 `.rules` 文件（`load_exec_policy`，[exec_policy.rs:637](../../sources/codex/codex-rs/core/src/exec_policy.rs#L637)）。`load_exec_policy` 注释说明：按配置层优先级叠加 `*.rules`，高优先级层覆盖低优先级层的规则。`ExecPolicyError`（[exec_policy.rs:241](../../sources/codex/codex-rs/core/src/exec_policy.rs#L241)）承载拒绝原因。

**[I]** `.rules` 是**项目级可版本控制的批准策略**（类似 OpenCode 的 Bash allowlist，但更结构化：带 `allow`/`prompt`/`deny` + prefix 匹配）。

## 3. 隔离层：多后端沙箱

### 3.1 平台沙箱类型

**[F]** [sandboxing/src/manager.rs:35-74](../../sources/codex/codex-rs/sandboxing/src/manager.rs#L35-L74)：

```rust
pub enum SandboxType { None, MacosSeatbelt, LinuxSeccomp, WindowsRestrictedToken }

pub fn get_platform_sandbox(windows_sandbox_enabled) -> Option<SandboxType> {
    macos   → MacosSeatbelt
    linux   → LinuxSeccomp
    windows → windows_sandbox_enabled ? WindowsRestrictedToken : None
}
```

**[I]** 注意命名偏差：`LinuxSeccomp` 的 metric tag 是 `"seccomp"`，但实际 Linux 后端是 **Landlock**（[sandboxing/src/landlock.rs](../../sources/codex/codex-rs/sandboxing/src/landlock.rs)）与 **Bubblewrap**（[sandboxing/src/bwrap.rs](../../sources/codex/codex-rs/sandboxing/src/bwrap.rs)）——这是文档/命名层面的轻微不一致（[I] 推断）。

### 3.2 SandboxManager

**[F]** [sandboxing/src/manager.rs:267-452](../../sources/codex/codex-rs/sandboxing/src/manager.rs#L267-L452) `SandboxManager`：

| 方法 | 职责 |
|---|---|
| `select_initial` | 选择初始沙箱 |
| `should_sandbox` | 判断某命令是否应沙箱 |
| `transform` / `transform_for_direct_spawn` | 把「普通 spawn」transform 成「沙箱内 spawn」（注入 bwrap/landlock/seatbelt 参数） |
| `SandboxablePreference` | `Auto` / `Require` / `Forbid`（[manager.rs:54](../../sources/codex/codex-rs/sandboxing/src/manager.rs#L54)） |

**[F]** 沙箱 spawn 由 [spawn.rs](../../sources/codex/codex-rs/sandboxing/src/spawn.rs) `spawn_process` 执行；违反检测由 [violation.rs](../../sources/codex/codex-rs/sandboxing/src/violation.rs) 记录（`FileSystemSandboxViolation` / `NetworkSandboxViolation` / `SandboxViolationEvent`）。

### 3.3 独立沙箱二进制

**[F]** Linux 沙箱是**独立二进制**，而非 in-process 库：

- [linux-sandbox/src/main.rs](../../sources/codex/codex-rs/linux-sandbox/src/main.rs) — 沙箱入口，内部含 `bwrap` / `landlock` / `launcher` / `proxy_routing`。
- [bwrap/src/main.rs](../../sources/codex/codex-rs/bwrap/src/main.rs) — Bubblewrap 包装二进制。
- [process-hardening/src/lib.rs](../../sources/codex/codex-rs/process-hardening/src/lib.rs) — 进程加固。

**[I]** 「沙箱做成独立二进制 + 代理路由」的架构，意味着沙箱进程与 agent 主进程**进程级隔离**——即使 agent 主进程被攻破，沙箱策略仍由独立进程执行。这与 Daytona 的「Job 与 Control Plane 分离」同构，是 RoboThree Worker 沙箱可参考的模式。

## 4. 升级层：Escalation / Approval / Amendment

**[F]** [protocol/approvals.rs](../../sources/codex/codex-rs/protocol/src/approvals.rs) 定义升级流类型：

| 类型 | 职责 |
|---|---|
| `EscalationPermissions` | `AdditionalPermissionProfile`（合并）或 `ResolvedPermissionProfile`（替换） |
| `ExecPolicyAmendment` | 提议「允许以某前缀开头的命令」，让后续同类命令免批 |
| `ResolvedPermissionProfile` | 拦截子进程重跑时需要的完整权限 |

**[F]** `ExecPolicyAmendment` 的 serde 是 `transparent` 的 `Vec<String>`（[approvals.rs](../../sources/codex/codex-rs/protocol/src/approvals.rs)），即「命令前缀 token 序列」，可被写成 `prefix_rule(..., decision="allow")` 规则。`derive_*_amendment`（[exec_policy.rs:884-917](../../sources/codex/codex-rs/core/src/exec_policy.rs#L884-L917)）说明了「只有无规则命中才建议 amendment，避免与已有规则冲突」。

**[F]** 运行时批准由 [tools/approvals.rs](../../sources/codex/codex-rs/core/src/tools/approvals.rs)（664 行）与 [tools/network_approval.rs](../../sources/codex/codex-rs/core/src/tools/network_approval.rs)（1120 行）承载，网络批准单独成模块——对应「文件系统沙箱」与「网络沙箱」两类独立的违反检测。

## 5. 完整安全决策链（一次 shell_command 的路径）

```text
模型请求 shell_command
→ ToolRouter.dispatch → shell handler
→ exec_policy 决策 (Allow / Prompt / Forbidden)
   ├─ Forbidden → 错误回喂模型
   ├─ Prompt → request_permissions / approval UI → 用户决定
   └─ Allow → SandboxManager.transform(spawn) → 沙箱内执行
        ├─ 成功 → 返回 output
        └─ 沙箱违反/失败 → EscalationPermissions 提升请求
             → 用户批准 → 沙箱外重跑（可选 amend execpolicy）
```

## 6. 安全薄弱点（静态分析）

**[I]** 以下为静态推断的潜在风险，未经运行时验证：

1. **命名偏差**：`LinuxSeccomp` 实际用 Landlock/Bwrap，metric tag 与实现不一致（低风险，观测层）。
2. **`Never` + 无沙箱**：`AskForApproval::Never` 在 `Unrestricted` 环境下对非危险命令直接 `Allow`（[exec_policy.rs:782-787](../../sources/codex/codex-rs/core/src/exec_policy.rs#L782-L787)）——「完全信任模型 + 无沙箱兜底」是激进配置。
3. **ExecPolicyAmendment 自我放宽**：用户批准后可「amend 规则免批同类命令」，若被诱导则可能放宽过度（依赖用户判断）。
4. **Windows 沙箱可选**：`windows_sandbox_enabled` 关闭时 `get_platform_sandbox` 返回 `None`（[manager.rs:65-70](../../sources/codex/codex-rs/sandboxing/src/manager.rs#L65-L70)），决策函数对此有保守分支（[exec_policy.rs:750-760](../../sources/codex/codex-rs/core/src/exec_policy.rs#L750-L760)）。

**[F]** 网络批准（`network_approval.rs` 1120 行）与文件批准分离，说明 Codex 将「网络访问」视为独立的一等安全维度——多数 Agent 不区分。

## 7. 与其它框架对比

| 维度 | Codex | OpenCode | Daytona | Hermes |
|---|---|---|---|---|
| OS 沙箱 | **真沙箱**（Seatbelt/Landlock/Bwrap/RestrictedToken） | 无（仅 allowlist） | 容器（Privileged） | 线程（非进程） |
| 审批策略 | 4 模式 + granular 矩阵 | allowlist + auto-approve | — | 3 层拦截 |
| 决策模型 | allow/prompt/forbid + 危险/安全启发式 | 命令前缀匹配 | — | Scope→Plugin→Guardrail |
| 升级流 | Escalation + Amendment | 无 | — | — |
| 网络隔离 | 独立 network_approval | 无 | 容器网络 | — |

## 8. RoboThree 映射

| 机制 | 分类 | 理由 |
|---|---|---|
| 三层安全模型（决策/隔离/升级） | **ADOPT** | RoboThree「Security 单独建模」的骨架 |
| `render_decision_for_unmatched_command` 决策矩阵 | **ADAPT** | 危险>安全>沙箱兜底的优先级可直接借鉴 |
| `GranularApprovalConfig` 按来源开关 | **ADAPT** | 细粒度审批开关（sandbox/rules/skill/mcp）值得引入 |
| 多后端沙箱抽象（SandboxType + SandboxManager） | **ADAPT** | RoboThree 需按部署形态选后端；抽象接口可复用 |
| 沙箱做成独立二进制 | **ADAPT** | 与 Daytona 的进程分离同构，适合 Worker 场景 |
| ExecPolicyAmendment 自我放宽 | **DEFER** | 「用户批准→自动放宽规则」有安全风险，需谨慎设计 |
| `Never` + 无沙箱直接 Allow | **REJECT** | 完全信任模型且无兜底，违反 default-deny 原则 |

详细汇总见 [robothree-fit-analysis.md](robothree-fit-analysis.md)。
