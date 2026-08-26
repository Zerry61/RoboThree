# Open WebUI — Frontend Architecture Research Index

## Meta

| Field | Value |
| --- | --- |
| **Project** | Open WebUI |
| **Repository** | https://github.com/open-webui/open-webui |
| **Analyzed Commit** | `ecd48e2f718220a6400ecf49eafd4867a38feb10` (2026-07-01, v0.10.2) |
| **Research Date** | 2026-07-18 |
| **Research Depth** | 专项 Level 2 → **Level 3**（前端 Only） |
| **Analyzed By** | Claude Code agent-architecture-research Skill |
| **Focus Area** | Frontend (SvelteKit SPA) — 不含后端 FastAPI/Python |

## Research Status

| Stage | Status | Output Files |
| --- | --- | --- |
| Stage A: Project Identification | ✅ Complete | `index.md`, `project-overview.md`, `source-map.md` |
| Stage B: Core Runtime Path | ✅ Complete | `architecture.md`, `runtime-sequence.md` |
| Stage C: Conditional Deep Dive | ✅ Complete (4 dimensions) | `context-system.md`, `tool-system.md`, `skill-plugin-mcp.md`, `security-review.md` |
| Stage D: RoboThree Mapping | ✅ Complete | `robothree-fit-analysis.md`, `open-questions.md` |
| **L3 Deep Dive** | **✅ Complete (3 mechanisms)** | `streaming-architecture.md`, `message-tree-model.md`, `security-review.md` (updated), `final-review.md` |

## L3 选定机制与依据

| # | Mechanism | 选择依据 |
| --- | --- | --- |
| M1 | **实时流式通信与事件驱动渲染** | Agent Chat UI 核心运行时路径；L2 多数环节为 INFERENCE 需源码验证 |
| M2 | **消息历史树与分支对话模型** | Chat UI 核心数据模型；影响所有交互路径（分支、编辑、多模型） |
| M3 | **前端安全边界与动态执行** | 多个真实 CVE；`execute` 事件是灾难性安全设计；对 RoboThree 安全架构有直接影响 |

## Output Artifacts

| # | File | Type | Status |
| --- | --- | --- | --- |
| 1 | `index.md` | Required | ✅ |
| 2 | `project-overview.md` | Required | ✅ |
| 3 | `source-map.md` | Required | ✅ |
| 4 | `architecture.md` | Required | ✅ |
| 5 | `runtime-sequence.md` | Required | ✅ |
| 6 | `robothree-fit-analysis.md` | Required | ✅ (L3 updated) |
| 7 | `open-questions.md` | Required | ✅ (L3 updated) |
| 8 | `context-system.md` | Conditional | ✅ |
| 9 | `skill-plugin-mcp.md` | Conditional | ✅ |
| 10 | `security-review.md` | Conditional | ✅ (L3 source-confirmed) |
| 11 | `tool-system.md` | Conditional | ✅ |
| 12 | `streaming-architecture.md` | **L3 Deep Dive** | ✅ — 22 种事件类型完整列表 + 失败/取消/恢复路径 |
| 13 | `message-tree-model.md` | **L3 Deep Dive** | ✅ — Tree 操作源码确认 + 分支/多模型/修复机制 |
| 14 | `final-review.md` | **L3 Required** | ✅ — 30 项自检 |

## Key Findings Summary

1. **SvelteKit SPA 架构**：Open WebUI 前端是典型的 SvelteKit SPA，使用 Svelte 4 + TypeScript + TailwindCSS，组件化程度极高（500+ `.svelte` 文件）。
2. **双通道通信模型**：HTTP REST（`src/lib/apis/`）处理 CRUD，Socket.IO 处理实时流式响应、状态同步和服务器推送。
3. **中心化 Svelte Store 状态管理**：单一 `src/lib/stores/index.ts` 承载全部全局状态，无需 Redux/MobX 等外部状态管理库。
4. **消息历史树结构**：对话不是线性 List 而是 Tree（`parentId`/`childrenIds`），天然支持分支对话和编辑历史。
5. **服务端事件驱动架构**：后端通过 Socket.IO `events` 通道向前端推事件（`chat:message:delta`、`status`、`execute`、`notification` 等），前端 `chatEventHandler` 统一路由。
6. **前端安全存在已知缺陷**：Token 存 localStorage（XSS 可读）、默认 CORS `*`、CSP 默认关闭、历史上多个 XSS CVE（CVE-2026-45303, CVE-2025-64496）。

## Research Limitations

- **无法 Clone 仓库**：GitHub 网络不可达，所有源码证据来自 GitHub API (`api.github.com`) 和 Web Search 聚合内容。
- **无法本地验证**：未安装依赖、未运行项目、未执行测试。
- **证据等级**：所有证据标记为 "Web API" 来源（通过 GitHub REST API 获取的文件树与内容），非本地文件系统读取。
- **部分文件内容未获取**：仅获取了目录结构和关键文件，未逐文件读取全部 ~500 个 `.svelte` 组件源码。
