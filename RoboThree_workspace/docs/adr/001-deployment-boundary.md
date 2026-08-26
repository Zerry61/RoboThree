# ADR-001：部署边界

> 状态：**ACCEPTED**  
> 日期：2026-07-19

## 决策

Kernel Alpha 采用 **All-in-One Local** 部署，但必须保持以下逻辑边界：

```text
Desktop UI
→ Local Core
→ Worker
→ Persistence
```

企业试点采用：

```text
Desktop Client
+ Local Worker
+ Central Enterprise Service
```

All-in-One Local 表示首期可随桌面应用统一安装和启动，不表示 UI、编排、执行与持久化可以混成一个无边界模块。

## 边界职责

| 边界 | 主要职责 |
| --- | --- |
| Desktop UI | 用户交互、状态展示、授权与审批入口 |
| Local Core | Session/Task/Run、Agent Loop、能力解析、策略执行和事件协调 |
| Worker | 文件、程序、Browser、Office 等具体副作用执行 |
| Persistence | Session、Task、Event、Checkpoint、Artifact 元数据和本地配置持久化 |
| Central Enterprise Service | 企业身份、能力注册、策略、审计与集中配置；不属于 Kernel Alpha 交付范围 |

## 约束

- Renderer 不直接访问文件系统、数据库、凭证和系统命令；
- Core 不加载未经审核的 Tool 实现，也不直接承载 Browser、Office 等具体执行能力；
- Worker 只接收当前任务明确授予的能力与资源范围；
- 本地接口从首期开始使用版本化 Contract，避免企业试点时重写边界；
- Kernel Alpha 不提前建设 Central Enterprise Service，只保留可替换接口与必要的 Fake。

## 后果

- 首期部署保持简单，同时保留企业形态的演进路径；
- 逻辑边界必须通过接口和依赖方向体现，而不能只存在于架构图；
- 是否将 Local Core、Worker 拆为独立操作系统进程，可按里程碑逐步实现，但安全边界不得被 Renderer 绕过。
