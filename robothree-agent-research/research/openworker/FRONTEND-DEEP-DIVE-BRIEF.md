# OpenWorker Frontend Deep Dive — 研究指令

> 由 claude-code 起草，发给另一个工作区执行。把本文发给负责此任务的 agent，让它按 §3 的深度要求产出。

---

## 1. 背景：已有成果和缺口

### 1.1 已有（不用重做）

`research/openworker/` 下已有 **12 份完整报告**（L3 Deep Dive，commit `f96ad4c8e`）：

| 文件 | 覆盖范围 |
| --- | --- |
| `index.md` | 研究索引 + 状态总览 |
| `project-overview.md` | 项目定位 + 技术栈 + MIT 许可证 |
| `source-map.md` | 完整源码地图（含前端文件清单） |
| `architecture.md` | 高层架构（Tauri + React + FastAPI） |
| `runtime-sequence.md` | 42 Hops E2E 调用链（WebSocket 事件流） |
| `robothree-fit-analysis.md` | ADOPT/ADAPT/DEFER/REJECT 五分类 |
| `open-questions.md` | 11 个未决问题 |
| `tool-system.md` | TurnEngine 工具执行 + 审批门控 |
| `permission-system.md` | 五模式权限引擎 + Inbox HITL |
| `skill-plugin-mcp.md` | Persona/Skill/MCP 组合能力系统 |
| `final-review.md` | 30/30 自检通过 |

### 1.2 缺口（本次要补的）

`final-review.md` §5 原文：

> Frontend (React/TypeScript) not deeply analyzed — UI architecture patterns not captured.

**现有 12 份报告对前端的了解仅限于：**
- `surfaces/gui/src/` 的文件名列表（`source-map.md` §3）
- 后端事件类型的名称（`runtime-sequence.md` H7-H42）
- 推断性的架构关系（WS 事件 → React 组件状态）

**不知道的（= 本次任务产出）：**
- 每个核心组件的渲染结构、props 接口、状态来源
- `streamGate.ts` 的事件 → 状态映射算法
- `api.ts` 的 WS + REST 客户端封装细节
- `itemsFromMessages.ts` 的消息 → UI item 变换逻辑
- `ApprovalCard.tsx` 的审批决策 UX
- `Composer.tsx` 的输入框能力（附件、语音等）
- Markdown 渲染的安全措施（`react-markdown` 配置、DOMPurify 存在性）
- 测试覆盖的实际范围

---

## 2. 源码位置

```text
sources/openworker/surfaces/gui/
├── package.json          # deps: react 18, react-markdown, pdfjs-dist, xlsx
│                          # devDeps: vitest, @playwright/test, tailwindcss 3, vite 5
├── src/
│   ├── App.tsx           # 1765 行 — 根组件（路由/布局/全局状态）
│   ├── main.tsx          # React 入口
│   ├── api.ts            # 1870 行 — REST + WebSocket 客户端
│   ├── streamGate.ts     # 41 行 — 流式事件路由
│   ├── itemsFromMessages.ts  # 101 行 — 消息→UI item 变换
│   ├── types.ts          # 139 行 — 全局类型定义
│   ├── tauri.ts          # Tauri 桥接
│   ├── theme.ts          # 主题
│   ├── humanize.ts       # 人性化工具函数
│   ├── attach.ts         # 附件处理
│   ├── useRoots.ts       # 工作目录 hook
│   ├── personaScope.ts   # Persona 作用域
│   ├── flags.ts          # Feature flags
│   ├── usage.ts          # 用量统计
│   ├── paths.ts          # 路径工具
│   ├── styles.css        # 全局样式
│   ├── tailwind.css      # Tailwind 入口
│   │
│   ├── components/
│   │   ├── Transcript.tsx        # 464 行 — 对话转录（核心渲染）
│   │   ├── Composer.tsx          # 813 行 — 消息输入框
│   │   ├── ApprovalCard.tsx      # 287 行 — 工具审批卡片
│   │   ├── InboxView.tsx         # 260 行 — 跨会话审批 Inbox
│   │   ├── Sidebar.tsx           # 会话侧栏
│   │   ├── Markdown.tsx          # Markdown 渲染（react-markdown）
│   │   ├── InboxItemCard.tsx     # Inbox 单项卡片
│   │   ├── DirectoryRequestCard.tsx  # 目录授权请求卡
│   │   ├── PlanCard.tsx          # 计划提案卡
│   │   ├── TodoPanel.tsx         # 任务清单面板
│   │   ├── PersonaView.tsx       # Persona 详情
│   │   ├── SettingsView.tsx      # 设置面板
│   │   ├── IntegrationsView.tsx  # 集成管理
│   │   ├── ScheduledView.tsx     # 自动化日程
│   │   ├── AuditView.tsx         # 审计日志
│   │   ├── GalleryModal.tsx      # Persona 市场
│   │   ├── Onboarding.tsx        # 新手引导
│   │   ├── Dropdown.tsx          # 通用下拉
│   │   ├── SelectMenu.tsx        # 通用选择菜单
│   │   ├── Toggle.tsx            # 通用开关
│   │   ├── Icon.tsx              # 通用图标
│   │   ├── FolderGate.tsx        # 目录访问守卫
│   │   ├── RootRow.tsx           # 工作根目录行
│   │   ├── WorkspaceTrustPrompt.tsx  # 工作区信任提示
│   │   ├── ModelChecklist.tsx    # 模型清单
│   │   └── connectors/           # 连接器 UI（Slack/Gmail/GitHub 等）
│   │
│   ├── connectors/               # 连接器注册 + 图标
│   └── providers/                # Provider 设置 + Logo
```

**总规模**：~96 个 `.tsx`/`.ts` 源文件。React 18 + TypeScript 5.5 + TailwindCSS 3 + Vite 5。

---

## 3. 本次任务：必须完成的最低深度

### 3.1 Priority 1 — 必须逐文件读源码（共 10 个文件，~5700 行）

| # | 文件 | 行数 | 要回答的问题 |
| --- | --- | --- | --- |
| **P1.1** | `api.ts` | 1870 | WS 连接管理（重连/心跳/auth）、REST 端点列表、请求/响应类型。哪些是 `fetch` 调用的纯函数可以单独提取？ |
| **P1.2** | `streamGate.ts` | 41 | 事件路由算法。接收哪些事件类型？如何映射到 UI 状态？ |
| **P1.3** | `itemsFromMessages.ts` | 101 | 消息 → UI item 变换逻辑。输入类型和输出类型分别是什么？有没有纯数据变换可以独立提取？ |
| **P1.4** | `types.ts` | 139 | 全局类型定义。哪些类型和后端 `engine.py` 的 `Event` / `EventType` 是对齐的？ |
| **P1.5** | `App.tsx` | 1765 | 根组件的布局结构、状态管理（React state/context/外部库？）、路由结构 |
| **P1.6** | `Transcript.tsx` | 464 | 对话转录的渲染逻辑。如何区分 user/assistant/tool/system 消息？流式更新机制？ |
| **P1.7** | `Composer.tsx` | 813 | 输入框能力：附件、语音、@mention、Markdown 预览、发送逻辑。和 open-webui 的 Tiptap 比起来复杂度如何？ |
| **P1.8** | `ApprovalCard.tsx` | 287 | 审批 UI 的渲染结构。展示哪些元数据（工具名、参数、风险级别、路径范围）？提供哪些审批选项（once/always/deny）？ |
| **P1.9** | `InboxView.tsx` | 260 | 跨会话 Inbox 的列表渲染。如何区分 item type（approval/question/directory/plan）？如何处理已解决/待处理？ |
| **P1.10** | `Markdown.tsx` | — | `react-markdown` 配置。用了哪些插件？有无 DOMPurify？代码高亮方案？ |

### 3.2 Priority 2 — 结构确认 + 搜索验证（不逐行读，但要确认关键事实）

| 搜索目标 | 搜索关键词 | 要回答的问题 |
| --- | --- | --- |
| 状态管理 | `useState`, `useReducer`, `createContext`, `zustand`, `jotai`, `redux` | 用了什么状态管理？是 React 原生还是外部库？ |
| WebSocket 重连 | `reconnect`, `retry`, `onclose`, `onerror` | WS 重连策略是什么？有没有指数退避？ |
| Token/auth 存储 | `localStorage`, `sessionStorage`, `cookie`, `httpOnly`, `token` | Token 存在哪里？有没有 XSS 风险？ |
| DOMPurify / 安全 | `DOMPurify`, `sanitize`, `dangerouslySetInnerHTML`, `allow-scripts` | Markdown 渲染有没有净化？有没有 `dangerouslySetInnerHTML`？ |
| 错误边界 | `ErrorBoundary`, `componentDidCatch`, `error` | 有没有全局错误处理？ |
| 测试覆盖 | 所有 `*.test.ts` / `*.test.tsx` 文件 | 测试数量、框架（vitest/playwright）、覆盖的组件 |

### 3.3 产出格式

在 `research/openworker/` 下追加**一份**新文件：

```text
research/openworker/frontend-deep-dive.md
```

内容结构：

```markdown
# OpenWorker Frontend Deep Dive

> Commit: f96ad4c8e6865f0aec519681a3717b6bcdd81546
> Date: [研究日期]
> Depth: L3 前端专项（源码级，逐文件阅读）
> Based on: existing 12 research reports + sources/openworker/surfaces/gui/

## 1. 前端技术栈确认（package.json 核实）
[React 18 / TypeScript 5.5 / TailwindCSS 3 / Vite 5 / vitest + Playwright]

## 2. 核心文件逐文件分析
### 2.1 api.ts (1870 行)
[WS 连接管理 / REST 端点 / 认证机制 / 可提取的纯函数]
### 2.2 streamGate.ts
...
（每个 P1 文件一小节，包含：关键符号、核心算法、渲染结构、RoboThree 对应物）

## 3. 安全评估
[Token 存储方式 / Markdown 净化 / CSP / XSS 风险 / 与 open-webui 对比]

## 4. 测试覆盖评估
[测试数量 / 框架 / 覆盖范围 / 是否有边界测试]

## 5. RoboThree 复用评估
### 5.1 可直接移植的纯函数/类型
[文件名 + 函数名 + 行号 + 移植难度]
### 5.2 可参考的组件结构（不改写直接参考）
[组件名 + 关键设计决策 + 对 RoboThree 的启示]
### 5.3 不应采用的模式
[安全反模式 / 过度耦合 / 对 RoboThree 无意义的部分]
### 5.4 五分类
[ADOPT / ADAPT / DEFER / REJECT / NEEDS_MORE_EVIDENCE，每项必需至少一个 FACT 级别的源码证据]
```

## 4. 关键约束

1. **许可证**：MIT，可以直接复用代码。但必须保留版权声明（MIT 要求 attribution）。
2. **不要重做后端分析**：已有 12 份报告覆盖了 `coworker/` 全部。本次只读 `surfaces/gui/`。
3. **证据等级**：每一条结论必须标记 `[F]` / `[I]` / `[R]`，FACT 级别必须带文件路径 + 行号（如 `api.ts:234-256`）。
4. **对比 open-webui**：如果发现和已有 open-webui 前端调研（`research/open-webui/`，14 份报告）中的模式可对比，请指出。
5. **对比 RoboThree Desktop**：RoboThree 桌面端当前状态是 Electron + Vue 3 render function（`main.ts` 1001 行，986 行 CSS），8 个 presentation 纯函数模块。如果某个 OpenWorker 前端模式对 RoboThree 有直接启示，请明确指出对应的 RoboThree 文件/函数。
6. **使用 research skill**：工作区已配置 `agent-architecture-research` skill（见 `research/CLAUDE.md`），研究流程应遵循其 4-Stage 规范（已完成的 Stage A/B 可跳过，直接从 Stage C/D 的前端视角切入）。

## 5. RoboThree 最想回答的 6 个前端问题

| # | 问题 | 期望答案粒度 |
| --- | --- | --- |
| Q1 | `api.ts` 里 WebSocket 的消息格式和事件路由，跟 RoboThree 的 `DesktopRendererEvent`（16 种事件类型）比，有哪些值得引入的模式？ | 事件类型列表 + payload schema 对比 |
| Q2 | `ApprovalCard.tsx` 的多级审批 UX（once/always_tool/always_command/always_task/deny）的完整渲染结构 | 逐行分析 render 输出 |
| Q3 | Markdown 渲染安全措施：有没有 DOMPurify？`react-markdown` 的 `allowedElements` 配置？和 open-webui 的 marked.js + 自定义扩展方案对比优劣？ | 配置代码片段 + 安全评估 |
| Q4 | Token/auth 存储方式：是 httpOnly cookie（安全）还是 localStorage（不安全，open-webui 的教训）？ | 存储方式 + 源码证据 |
| Q5 | 哪些纯函数可以直接移植到 RoboThree？（如 `streamGate.ts` 41 行、`itemsFromMessages.ts` 101 行、`humanize.ts` 等） | 逐函数评估移植难度 |
| Q6 | 前端测试的数量和范围——对了解前端代码质量有参考价值 | 测试文件数 + 覆盖组件 |

---

claude-code
