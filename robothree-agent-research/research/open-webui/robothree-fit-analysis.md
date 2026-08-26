# Open WebUI → RoboThree 适配分析（前端）

## 五分类结论汇总

| # | Mechanism | Verdict | MVP Needed | Confidence |
| --- | --- | --- | --- | --- |
| 1 | SvelteKit SPA + Svelte Store 状态管理 | ADAPT | Yes | HIGH |
| 2 | HTTP + WebSocket 双通道通信模型 | ADOPT | Yes | HIGH |
| 3 | Message History Tree (分支对话) | ADAPT | No (v2) | MEDIUM |
| 4 | Command Suggestion System (@/# triggers) | ADOPT | Yes | HIGH |
| 5 | Rich Text Input (Tiptap) | ADAPT | Yes | MEDIUM |
| 6 | Status Event 分步反馈 | ADOPT | Yes | HIGH |
| 7 | Skill = Prompt + Tools Bundle | ADAPT | No (v2) | MEDIUM |
| 8 | localStorage Token 存储 | REJECT | — | HIGH |
| 9 | eval() 服务端推送 JS 执行 | REJECT | — | HIGH |
| 10 | CORS `*` + CSP disabled 默认 | REJECT | — | HIGH |
| 11 | Pyodide WASM 客户端 Python 执行 | DEFER | No | LOW |
| 12 | 外置 Tool Server (MCP) 前端集成 | ADAPT | No (v2) | MEDIUM |
| 13 | TailwindCSS 组件化 UI 模式 | ADOPT | Yes | HIGH |
| 14 | Feature Flags from Backend Config | ADOPT | Yes | HIGH |

---

## 1. ADOPT — 可直接采纳的模式

### 1.1 HTTP + WebSocket 双通道通信模型

**理由**：Open WebUI 清晰地分离了 CRUD（HTTP REST）和实时流（Socket.IO），这种模式对 RoboThree 的 Agent Chat UI 非常适用。

**证据**：
- `src/lib/apis/` — 25 个 REST API 模块，全部 CRUD 走 HTTP [F]
- `src/routes/+layout.svelte` — Socket.IO 在 root layout 初始化 [F]
- `runtime-sequence.md` H4-H8 — 双通道协作 [I]

**适用边界**：适合所有需要实时流式响应的 Agent UI。
**风险**：需要维护两套连接管理逻辑（token refresh, reconnection）。
**MVP 建议**：**优先实施** — Chat UI 基础通信层。

### 1.2 Command Suggestion System (@/# triggers)

**理由**：MessageInput 中 `@model`、`/prompt`、`/skill` 的触发表模式，为 Agent 的 Tool/Skill/Model 选择提供了高效的 UX。

**证据**：
- `src/lib/components/chat/MessageInput/Commands/` — Models, Prompts, Skills, Knowledge 子目录 [F]
- `src/lib/components/chat/MessageInput/CommandSuggestionList.svelte` [F]
- Tiptap suggestion plugin 实现 [I]

**适用边界**：适合 Agent Chat UI 中需要上下文切换的场景。
**风险**：Tiptap 依赖引入额外包体积。
**MVP 建议**：**优先实施** — 输入框的上下文触发是 Chat UI 的核心交互。

### 1.3 Status Event 分步反馈

**理由**：后端通过 `status` 事件推送 "Searching web..."、"Executing tool..." 等中间步骤，前端以 StatusHistory 时间线展示，这是 Agent 执行过程透明化的关键 UX。

**证据**：
- `runtime-sequence.md` H6-H8a — status event 路径 [I]
- `src/lib/components/chat/Messages/ResponseMessage/StatusHistory.svelte` [F]
- `src/lib/components/chat/Messages/ResponseMessage/StatusHistory/StatusItem.svelte` [F]

**适用边界**：Agent 有多步工具调用/搜索/推理时需要。
**风险**：无。
**MVP 建议**：**优先实施** — Agent 执行可视化是最关键的 UX 差异化点。

### 1.4 TailwindCSS 组件化 UI 模式

**理由**：Open WebUI 的组件化程度极高（500+ `.svelte` 文件），共用组件规范（Modal, Dropdown, Tooltip 等），为 RoboThree 的组件库设计提供了参考。

**证据**：
- `src/lib/components/common/` — 20+ 通用组件 [F]
- 全组件采用 TailwindCSS utility classes [F]

**适用边界**：任何需要组件库的 Web 项目。
**风险**：无。
**MVP 建议**：**优先实施** — 组件库是 UI 开发基础。

### 1.5 Feature Flags from Backend Config

**理由**：`config.features` 对象从后端获取 feature flags，前端根据 flags 控制功能可见性，这是多租户/多部署场景的最佳实践。

**证据**：
- `src/lib/apis/index.ts` — `getBackendConfig()` [F]
- `stores.config` 包含 features 字段 [I]

**适用边界**：需要动态控制功能开关的 SaaS 产品。
**风险**：flags 延迟加载可能导致 UI 闪变。
**MVP 建议**：**优先实施** — 便于 MVP 阶段快速开关功能。

---

## 2. ADAPT — 需改造后采纳的模式

### 2.1 SvelteKit SPA + Svelte Store 状态管理

**理由**：Svelte Store 的 `$` auto-subscription 模式非常简洁，但单一 `stores/index.ts` 文件承载所有全局状态（~30 stores）缺乏模块化。RoboThree 应采纳 Store 模式，但按 Domain 拆分。

**证据**：
- `src/lib/stores/index.ts` — 全部 stores 定义 [F]
- Component `$storeName` reactive access pattern [I]

**改造方案**：
```
Open WebUI:  stores/index.ts (All 30+ stores)
RoboThree:   stores/
             ├── auth.ts      (user, config)
             ├── chat.ts      (chatId, chats, chatTitle, history)
             ├── ui.ts        (theme, mobile, showSidebar, showSettings)
             ├── models.ts    (models, tools, functions, skills)
             └── realtime.ts  (socket, activeUserIds)
```

**适用边界**：中等以上规模 Agent UI。
**风险**：Store 拆分后需要处理跨 Domain 依赖（如 chat store 需要 user store）。
**MVP 建议**：MVP 可以先单文件，v2 拆分。

### 2.2 Message History Tree (分支对话)

**理由**：Tree 结构天然支持分支对话和编辑历史，但增加了实现复杂度。

**证据**：
- `Chat.svelte` — history.messages (Record) + history.currentId (pointer) [I]
- `Messages.svelte` — 从 currentId 向上遍历 parentId 构建显示列表 [I]

**改造方案**：
```
MVP:     Linear Array (List) — 简单、够用
v2:      Tree Structure — 支持分支、编辑、regenerate from any point
```

**适用边界**：对话 UX 需要支持分支/编辑时。
**风险**：Tree 序列化到后端 API 需要额外设计。
**MVP 建议**：**MVP 不需要**，用简单 Array，v2 再引入。

### 2.3 Rich Text Input (Tiptap)

**理由**：Tiptap 提供强大的 RTE 能力（变量注入、命令建议、文件嵌入），但包体积大（~200KB gzipped），对 RoboThree 的 MVP 可能过重。

**证据**：
- `src/lib/components/common/RichTextInput.svelte` [F]
- `src/lib/components/common/RichTextInput/suggestions.ts` [F]
- `src/lib/components/common/RichTextInput/commands.ts` [F]

**改造方案**：
```
MVP:     Basic <textarea> with Markdown preview
v1.5:   Simple RTE (contenteditable + execCommand, or Slate.js)
v2:     Tiptap (if rich editing is core differentiator)
```

**适用边界**：Chat UI 需要富文本输入/变量注入/命令触发表时。
**风险**：Tiptap 的 Plugin/Suggestion API 有学习曲线。
**MVP 建议**：**MVP 用 textarea**，快速上线后再评估是否升级到 Tiptap。

### 2.4 Skill = Prompt + Tools Bundle

**理由**：Open WebUI 的 Skill 将 Prompt Template 和 Tool Set 打包为可复用单元，这种封装模式对 RoboThree 的 Agent Skill 设计有参考价值。

**证据**：
- `src/lib/components/chat/SkillsModal.svelte` [F]
- `src/lib/components/chat/MessageInput/Commands/Skills.svelte` [F]
- `src/lib/apis/skills/index.ts` [F]

**改造方案**：
```
Open WebUI: Skill = Prompt Template + Tool IDs + Model Preference
RoboThree:  Agent Skill = System Prompt + ToolSet + Permission Profile + Model Config
```

**适用边界**：RoboThree 的 Skill 需要比 Open WebUI 的多一个 Permission Profile 维度。
**风险**：Skills 的版本管理和共享机制需要额外设计。
**MVP 建议**：MVP 用硬编码的 System Prompt + Tool List，v2 引入可配置 Skill。

### 2.5 MCP Tool Server 前端集成

**理由**：Open WebUI 的前端 MCP 集成是薄层（仅连接管理 UI），实际 MCP 通信在 Backend。这种薄前端模式是正确的。

**证据**：
- `src/lib/components/AddToolServerModal.svelte` [F]
- `src/lib/apis/tools/index.ts` [F]
- 所有 MCP 通信走 Backend → MCP Client → MCP Server [I]

**改造方案**：
```
Open WebUI: Frontend → REST → Backend → MCP Client → MCP Server
RoboThree:  Frontend → REST/Gateway → Agent Runtime → MCP Host → MCP Client → MCP Server
```

**适用边界**：RoboThree 支持 MCP 时。
**风险**：无（薄前端模式本就是正确的）。
**MVP 建议**：MVP 不需要 MCP，v2 按需引入。

---

## 3. DEFER — 推迟（当前不需要，未来可评估）

### 3.1 Pyodide WASM 客户端 Python 执行

**理由**：客户端 Python 执行是差异化功能，但在 RoboThree MVP 阶段不是必要项。且 Pyodide 包体积大（~10MB+），需要评估性能影响。

**证据**：
- `src/lib/workers/pyodide.worker.ts` [F]

**推迟条件**：
- 触发：RoboThree 需要 "Agent 可执行 Python 代码" 功能时
- 替代：首选用服务端沙盒执行（更安全），仅在 "必须离线/低延迟" 时评估 Pyodide

**MVP 建议**：不需要。

---

## 4. REJECT — 不应采纳的反模式

### 4.1 localStorage Token 存储

**理由**：XSS-readable，是 Open WebUI 多个 CVE 的共同攻击目标。RoboThree 必须从 Day 1 使用 httpOnly cookie。

**证据**：
- CVE-2026-45303: XSS → localStorage.getItem('token') → account takeover [F]
- CVE-2025-64496: SSE injection → JS execution → token exfiltration [F]

**替代方案**：httpOnly, Secure, SameSite=Strict cookie + CSRF token。

**MVP 建议**：**Day 1 必须实施 httpOnly cookie**。

### 4.2 eval() 服务端推送 JS 执行

**理由**：`{type: "execute"}` 事件允许后端向前端推送并执行任意 JavaScript，这是一个灾难性的安全设计。即使有 origin 验证，仍将客户端暴露于服务端被攻破的风险。

**证据**：
- CVE-2025-64496: 利用 execute 事件实现 token exfiltration [F]

**替代方案**：
- 定义有限的操作指令集（如 `{type: "action", action: "scrollToBottom"}`）
- 任何代码执行必须在 WASM Worker sandbox 中进行
- 所有 execute 事件需要用户显式确认

**MVP 建议**：**永不实施主线程代码执行**。

### 4.3 CORS `*` + CSP Disabled 默认

**理由**：不安全的默认值。即使生产环境运维可以改为安全配置，默认不安全是糟糕的安全工程实践。

**证据**：
- `CORS_ALLOW_ORIGIN=*` warning on startup [F]
- CSP headers gated behind env vars [F]

**替代方案**：
- CORS: 默认只允许部署域名，需要 extra origins 时显式配置
- CSP: 默认启用严格 CSP（script-src 'self'），特殊需求可通过配置放松

**MVP 建议**：**Day 1 安全默认**。

---

## 5. NEEDS_MORE_EVIDENCE — 需要更多证据

### 5.1 Svelte 5 Runes 迁移状态

**问题**：Open WebUI v0.10.2 使用 Svelte 4 (writable stores) 还是 Svelte 5 (runes)？
**Why it matters**：影响 RoboThree 的框架版本选择。Svelte 5 的 `$state`/`$derived`/`$effect` runes 是重大 API 变化。
**How to close**：检查 `package.json` 中的 `svelte` 版本号（本地 clone 后可确认）。

### 5.2 Web Worker 数量与并发策略

**问题**：前端启动了哪些 Web Workers？Pyodide worker 和 Kokoro worker 是否同时存在？Worker 管理策略（pool? singleton?）是什么？
**How to close**：本地 clone 后检查 `src/lib/workers/` 目录和 worker 实例化代码。

### 5.3 测试覆盖率

**问题**：前端是否有测试？测试框架是 Vitest 还是 Playwright？测试覆盖率如何？
**How to close**：检查 `package.json` devDependencies 和 `*.test.ts` 文件分布。

### 5.4 SvelteKit SPA Mode 配置

**问题**：Open WebUI 是否使用 `adapter-static`？SSR 是否完全禁用（`fallback: 'index.html'`）？
**How to close**：检查 `svelte.config.js` 配置。

---

## Proposed RoboThree Changes

> 以下列出本研究认为可能影响 RoboThree 前端模块边界和技术栈的候选变更。**仅作为提议，未自动落地。**

### 技术栈建议

| Decision | Recommendation | Rationale |
| --- | --- | --- |
| **前端框架** | SvelteKit (SPA) 或 React (Next.js) | Open WebUI 的 Svelte 实现验证了可行性；React 生态更大但 bundle size 更重 |
| **CSS** | TailwindCSS | 已验证的生产力工具 |
| **状态管理** | Svelte Stores (Svelte) 或 Zustand (React) | 轻量级、无需 Redux |
| **实时通信** | Socket.IO 或 SSE | 根据后端技术栈选择 |
| **RTE** | textarea (MVP) → Tiptap (v2) | MVP 不用 RTE，降低复杂度 |
| **代码高亮** | CodeMirror 或 Shiki | 需代码展示/编辑场景 |

### 架构建议

| Decision | Recommendation | Rationale |
| --- | --- | --- |
| **API 层分离** | `src/lib/apis/` 模式 — 每个 Domain 一个模块 | 清晰的关注分离 |
| **Store 组织** | 按 Domain 拆分，不使用单文件 | Open WebUI 单文件策略不适合 >50 stores |
| **双通道通信** | HTTP REST (CRUD) + WebSocket/SSE (Real-time) | 验证过的模式 |
| **Feature Flags** | Backend config → UI 可见性控制 | 多部署/多租户刚需 |
| **消息模型** | Linear Array (MVP) → Tree (v2) | 快速上线优先 |

---

## Requires Human Approval

> 需要用户拍板才能推进 RoboThree 正式架构决策的项。默认状态：`PENDING_HUMAN_DECISION`。

| # | Decision | Status | Stake |
| --- | --- | --- | --- |
| 1 | **前端框架选型**: SvelteKit vs React/Next.js | `PENDING_HUMAN_DECISION` | 技术栈方向 + 团队技能 + 生态 |
| 2 | **Auth Token 存储**: httpOnly cookie vs localStorage | `PENDING_HUMAN_DECISION` | 安全默认 vs 实现复杂度 |
| 3 | **CSP 强制启用作为默认** | `PENDING_HUMAN_DECISION` | 安全策略 + 可能限制某些功能 |
| 4 | **MVP 阶段 RTE 是否引入 Tiptap** | `PENDING_HUMAN_DECISION` | bundle size + 开发时间 vs UX |
| 5 | **分支对话 Tree 模型是否 MVP 实现** | `PENDING_HUMAN_DECISION` | MVP 范围 + 开发成本 |
| 6 | **Skills 可配置化时间点** | `PENDING_HUMAN_DECISION` | MVP → v2 演进路线 |
