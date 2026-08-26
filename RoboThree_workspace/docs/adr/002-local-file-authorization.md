# ADR-002：本地文件授权

> 状态：**ACCEPTED**  
> 日期：2026-07-19
> 一致性修订：2026-07-22，运行时确认术语与 ADR-006 对齐

## 决策

RoboThree 默认只访问自身应用目录。用户业务文件必须通过 `FileGrant` 或 `WorkspaceGrant` 显式授权。

- `FileGrant`：授权一个或一组明确文件；
- `WorkspaceGrant`：授权一个明确根目录，以及没有越界的真实子目录；
- 高风险写操作、程序执行和外部发送需要额外权限或用户确认。

## 路径判定

Workspace 授权以规范化后的真实路径为准：

```text
requested path
→ normalize
→ resolve symlink / junction
→ compare with granted real root
→ evaluate operation permission
```

仅通过字符串前缀、相对路径或 UI 展示路径判断授权不成立。符号链接、目录联接、`..`、大小写差异和重解析点不得成为越界通道。

## 操作级权限

授权范围与操作权限分开判定。建议的最小操作集合为：

```text
read
create
modify
delete
move
execute
send_external
```

进入 Workspace 不自动获得全部操作权限。删除、批量覆盖、执行程序、向外部 Model/Tool/服务发送文件等操作，仍需经过 ADR-006 的固定授权、Tool 风险和必要 Desktop 用户确认。WorkspaceGrant 不自动授予 `send_external`。

## 执行约束

- Agent 和 Renderer 不直接读写业务文件；
- 文件 Action 必须经过 Schema 校验、Grant 判定、固定风险求值和必要用户确认后交给 Worker；
- Worker 只获得本次 `ExecutionContext` 所需的最小路径和操作权限；
- Grant 可撤销，撤销后尚未开始的 Action 不得继续执行；
- 授权、拒绝、撤销和高风险确认必须形成事件记录；
- 任意 Shell 与任意网络访问不由 WorkspaceGrant 隐式授予。

## 后果

- 本地优先不等于默认扫描用户磁盘；
- 文件能力可以复用于文档、代码、HTML、Office 等场景，而不会把场景逻辑写入 Core；
- 后续需要细化 Grant 有效期、持久授权体验和 Windows 特有路径测试矩阵。
