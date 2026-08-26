# ADR-004：Kernel Alpha 技术栈

> 状态：**ACCEPTED**  
> 日期：2026-07-19

## 决策

RoboThree Kernel Alpha 采用：

```text
TypeScript Monorepo
├── Electron + Vue Desktop
├── Node.js Local Core
├── SQLite Local Persistence
└── Python / C# / 其他能力通过 Worker 或 Tool 接入
```

## 运行边界

```text
Electron Renderer
→ typed preload IPC
→ Electron Main / Local Core API
→ Node.js Local Core
→ Worker Protocol / Tool Adapter
→ Python、C#、本地进程或远程能力
```

Renderer 不直接访问：

- 文件系统；
- SQLite；
- MaaS/API 凭证；
- 系统命令；
- Worker 原生接口。

所有高权限操作必须通过受控 IPC 进入 Core，再经过授权、策略和 Worker 边界。

## 理由

- TypeScript 可共享 UI、Contract 和 Core 类型，降低 Alpha 阶段的跨语言协调成本；
- Electron + Vue 满足 Windows 桌面工作台和本地交互需求；
- Node.js 适合事件驱动的 Agent 编排、MCP 和本地服务集成；
- SQLite 为单机持久化、事务和迁移提供足够能力；
- Python、C# 仍可承载 AI/文档生态和 Windows Office 能力，但不侵入 Core。

## 约束

- Monorepo 不等于所有代码放入同一 package；
- Contract 必须进行运行时 Schema 校验，不能只依赖 TypeScript 静态类型；
- SQLite 访问集中在 Persistence Adapter，Renderer 和 Tool 不直接查询数据库；
- Worker/Tool 接口必须版本化并具备超时、取消和错误归一化；
- 未出现真实复用需求前，不拆分大量 package 或独立服务。

## 后果

- Python-first 与 Go-first Core 不作为 Kernel Alpha 路线；
- 企业中央服务的最终技术栈不由本 ADR 决定；
- Electron 打包、IPC 安全和 SQLite migration 从 KA-0 起就是工程基线，而不是上线前补项。

## 后续决策

企业中央服务技术栈已于 2026-07-21 由 [ADR-009](./009-enterprise-java-and-local-node-boundary.md) 补充确认：未来 Central Enterprise Service 和 Admin API 后端采用 Java，本地 Agent Runtime / Local Core 继续采用 Node.js。该决定不替代本 ADR 的 Kernel Alpha 技术栈。
