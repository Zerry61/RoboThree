# RoboThree Evaluation

> 把第三方架构映射到 RoboThree 模块的判断标准。
> 必须同时考虑产品价值、技术复杂度、安全、性能、成本、跨平台、本地/云边界、企业部署、可维护性、License、MVP 优先级、长期扩展性。

---

## 1. RoboThree 模块清单（v0.x）

当某机制需要落地时，按下面清单锚定：

```text
RoboThree Client
RoboThree Core
Agent Runtime
Worker Runtime
Local Worker
Cloud Worker
Remote Worker
Model Gateway
Tool Runtime
Tool Registry
Tool Permission
Context Engine
Session Manager
Memory Engine
Skill Engine
Plugin Engine
MCP Host
Subagent Runtime
Task Scheduler
Event Bus
Artifact System
UI Rendering Protocol
Workspace Manager
Sandbox
Observability
Identity and Access
Enterprise Control Plane
```

候选模块（暂未存在）：

```text
Compression Engine
Routing Engine
Embedding Pipeline
Prompt Cache
Background Agent Runtime
Cost Controller
Approval UX
Telemetry Collector
Multi-tenant Boundary
Data Loss Prevention
```

---

## 2. 五个判断结论

| 结论 | 标准 | RoboThree 行动 |
| --- | --- | --- |
| **ADOPT** | 模式成熟、风险可控、协议友好、产品价值高 | 直接复刻到对应模块 |
| **ADAPT** | 模式有价值但有 RoboThree 上下文差异 | 借鉴并按 RoboThree 调整 |
| **DEFER** | 有价值但当前阶段不需要 | 列入版本 backlog |
| **REJECT** | 与 RoboThree 价值观冲突或不可接受风险 | 不学 |
| **NEEDS_MORE_EVIDENCE** | 证据不足 | 列入 `open-questions.md` |

---

## 3. 判断权重

每条结论按下列权重综合打分（满分 100）：

| 维度 | 权重 |
| --- | --- |
| 产品价值 | 25 |
| 技术复杂度与可维护性 | 15 |
| 安全 | 15 |
| 性能与延迟 | 10 |
| 成本 | 10 |
| 跨平台 / 跨部署 | 10 |
| 企业部署可行性 | 5 |
| License | 5 |
| MVP 优先级 | 5 |

阈值（参考）：

- ≥ 75 → **ADOPT**
- 60 - 74 → **ADAPT**
- 40 - 59 → **DEFER**
- < 40 → **REJECT**
- 证据不足以打分 → **NEEDS_MORE_EVIDENCE**

---

## 4. 标准追问（每条机制必答）

每条 RoboThree 候选机制必须答：

1. RoboThree 是否需要？
2. 属于哪个模块？
3. 是否适合 Core / 客户端 / Gateway / Worker / Skill / Plugin / MCP / 独立 Service？
4. 是否需要重新设计？
5. 是否存在平台限制？
6. 是否存在安全风险？
7. 是否存在许可证风险？
8. MVP 是否需要？
9. 后续版本是否需要？
10. 是否需要新 ADR？

---

## 5. 落地方式选择

| 形式 | 适用 |
| --- | --- |
| **Core** | 无可替代、必有、所有客户端都要 |
| **Worker** | 工具执行、本地资源访问 |
| **Gateway** | 多源路由、计费、统一鉴权 |
| **Cloud Worker** | 重算、长时任务 |
| **Remote Worker** | 第三方提供的工具执行体 |
| **Client** | UI、UX、Editor 集成 |
| **Skill** | 用户级可选增强 |
| **Plugin** | 第三方开发者能力 |
| **MCP** | 跨厂商协议 |
| **独立 Service** | 大流量、强隔离需求 |

---

## 6. MVP / 后续版本优先级

| 等级 | 含义 |
| --- | --- |
| **P0** | MVP 必需 |
| **P1** | MVP 之后第一个迭代 |
| **P2** | 第二批迭代 |
| **P3** | 长期 |
| **X** | 不在 RoboThree 路线图（仅作参考） |

每条机制推荐值：

- `Priority: P0 / P1 / P2 / P3 / X`

---

## 7. ADR 触发条件

满足任一即新建 ADR：

- 改变 RoboThree 核心模块边界。
- 引入新的第三方依赖（且影响 License / 安全）。
- 删除 / 重写已有公共 API。
- 改变权限 / 安全默认（default-deny → default-allow 或反向）。
- 引入新的存储介质（如 Postgres / Vector DB）。
- 改变 Agent 主循环结构。
- 增加持久化网络行为。

ADR 模板见 `robothree/adr/0000-adr-template.md`。

---

## 8. 落地形式映射建议（工作机制）

| 机制类型 | RoboThree 默认落地 |
| --- | --- |
| Tool Execution | Tool Runtime + Worker |
| Tool Registry | Tool Registry + Manifest |
| Context Compression | Compression Engine (P1) |
| Skill | Skill Engine + Manifest |
| Plugin | Plugin Engine + Manifest |
| MCP | MCP Host |
| Subagent | Subagent Runtime + Worker |
| Memory | Memory Engine (Working + Long-term) |
| Permission | Tool Permission + Identity and Access |
| Sandbox | Sandbox (per-Worker) |
| Background Task | Task Scheduler + Worker |
| Long-running Agent | Background Agent Runtime |
| Remote Worker | Remote Worker + Control Plane |
| Multi-user | Identity and Access + Multi-tenant Boundary |
| Approval UX | Approval UX (Client) |
| Audit / Trace | Observability + Telemetry Collector |

---

## 9. 反模式清单（对 RoboThree 明确警告）

| 反模式 | 描述 |
| --- | --- |
| "支持 MCP" 但只是 import | 必须真接 MCP server 并 trace |
| "Multi-Agent" 仅 Prompt 切角色 | 必须独立 Session / ToolSet |
| "Skill" 仅是 Prompt | 必须 Manifest + 工具差异 |
| "Sandbox" 仅 chroot | 必须限制进程 / fs / net / signal |
| "Permission" 仅 UI 弹窗 | 必须 dispatcher 拦截 |
| "Remote Worker" 但同进程 | 必须 transport 分离 |
| "Memory" 仅 SQLite messages | 必须分层 + 跨会话 |
| "Context Cache" 仅 cache hit 数 | 必须真命中且对比延迟 |

---

## 10. 决策记录

`research/<project>/robothree-fit-analysis.md` 包含：

- 按机制列表给五条结论。
- 每条结论给 ADR ID（若有）。
- ADAPT 项细化改造方案。
- DEFER 项给触发条件。
- REJECT 项给反例。
- NEEDS_MORE_EVIDENCE 项给"如何关闭" 路径。

`research/<project>/risks-and-limitations.md` 列出 RoboThree 不要照搬的反模式。

`research/<project>/reusable-patterns.md` 列出可借鉴的具体模式（接口、算法、数据结构）。

---

## 11. 输出契约

每条结论在 RoboThree 适配表里写一行：

```markdown
| 机制 | 来源 Evidence | RoboThree 模块 | 结论 | ADR | 优先级 | License |
| --- | --- | --- | --- | --- | --- | --- |
```

便于多项目横向合并到全局 `research/index.md`。
