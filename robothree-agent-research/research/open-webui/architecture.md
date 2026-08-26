# Open WebUI — 前端 Architecture Overview

## 1. 架构总览

Open WebUI 前端采用 **SvelteKit SPA 三层架构**：

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Tier                     │
│  Svelte Components (500+), Svelte Stores, TailwindCSS    │
│  Chat UI, Admin, Workspace, Playground, Notes, Calendar  │
├─────────────────────────────────────────────────────────┤
│                    Communication Tier                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ HTTP REST     │  │ Socket.IO    │  │ Web Workers    │  │
│  │ (src/lib/apis)│  │ (WebSocket)  │  │ (Pyodide, TTS) │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    Backend (FastAPI)                     │
│  (Not covered — frontend study only)                    │
└─────────────────────────────────────────────────────────┘
```

**核心架构特征**：

1. **SPA 模式**：全部路由由 SvelteKit 客户端管理，无 SSR。
2. **双通道通信**：HTTP REST（CRUD）+ Socket.IO（实时流）。
3. **中心化状态**：单一 Store 文件管理所有全局状态。
4. **组件化 UI**：Chat → Messages → Message → ResponseMessage 层级递进。
5. **事件驱动渲染**：后端通过 Socket.IO 推事件，前端 `chatEventHandler` 路由到响应式数据更新。

## 2. 布局与路由架构

### 2.1 三层 Layout 级联

```text
Root Layout (+layout.svelte)
  ├── Global init: theme, config, socket, auth, i18n, pyodide worker
  │
  ├── (auth) Group           ← 登录/注册（无需认证）
  │   └── /auth
  │
  ├── (app) Group            ← 需认证页面
  │   ├── +layout.svelte     ← Auth gate + data loading + app shell (Sidebar/Navbar/Settings)
  │   │   ├── / (home)       ← New chat
  │   │   ├── /c/[id]        ← Existing chat
  │   │   ├── /admin/*       ← Admin panel (+layout.svelte)
  │   │   ├── /workspace/*   ← Workspace (+layout.svelte)
  │   │   ├── /playground/*  ← Playground (+layout.svelte)
  │   │   ├── /channels/[id] ← Group chat
  │   │   ├── /notes/*       ← Notes (+layout.svelte)
  │   │   ├── /calendar      ← Calendar
  │   │   └── /automations/* ← Automations
  │   │
  │   └── /s/[id]            ← Shared chat (public link)
  │
  └── /error                 ← Error page
```

### 2.2 认证关 (Auth Gate)

`(app)/+layout.svelte` 在 `onMount` 中检查 `$user`：

```text
[F] onMount → if !$user → redirect(307, '/auth')
[I] 这是客户端路由守卫模式，不依赖服务端 layout.server.ts
[F] Token persistence: localStorage.token → Authorization header
```

## 3. 状态管理架构

### 3.1 核心设计

Open WebUI 使用 **Svelte 原生 writable stores**，无需外部状态管理库：

```text
[F] 所有全局状态定义在单一文件: src/lib/stores/index.ts
[F] 约 30+ writable stores 覆盖 Backend Config, UI, Chat, Realtime, Content
[I] 这种 "Single Store File" 模式在中等规模项目中比 Redux 更简洁，但缺乏模块化
```

### 3.2 Store 分类

| Category | Key Stores | Data Source |
| --- | --- | --- |
| **Backend Config** | `config`, `user`, `models` | REST API on mount |
| **UI State** | `theme`, `mobile`, `showSidebar`, `showSettings` | localStorage / computed |
| **Chat State** | `chatId`, `chats`, `chatTitle`, `tags` | REST API + Socket.IO events |
| **Realtime** | `socket`, `activeUserIds`, `USAGE_POOL` | Socket.IO events |
| **Content** | `prompts`, `tools`, `functions`, `knowledge` | REST API on workspace load |

### 3.3 数据流模式

```text
User Action → Component
  ├── Direct store write: $chatId = newId
  ├── REST API call → update store on response
  │   └── e.g., submitPrompt() → fetch POST → socket.on('delta') → message.content += delta
  └── Socket.IO emit → server → socket.on('event') → update store
```

[I] Svelte 的 `$` auto-subscription 语法使得组件自动响应 store 变化，无需手动 subscribe/unsubscribe。

## 4. 通信架构

### 4.1 双通道模型

```
HTTP REST (src/lib/apis/)          Socket.IO (/ws/socket.io)
─────────────────────────          ─────────────────────────
• Chat CRUD                        • Streaming: chat:message:delta
• Model/Prompt/Tool CRUD           • Status: status (tool execution)
• Auth (login/signup/session)      • Commands: execute, execute:python
• File upload/download             • Citations: source, citation
• User settings                    • Notifications: notification
• Admin management                 • Confirmations: confirmation
• Knowledge base operations        • User presence: user-list
                                   • Chat metadata: chat:title, chat:tags
                                   • Completion: chat:completion
```

[F] 所有 REST 调用使用 native `fetch` API，Bearer token 认证。
[F] Socket.IO 连接在 `+layout.svelte` 初始化，reconnection 默认开启，heartbeat 每 30s。

### 4.2 流式响应路径

```text
User submits message
    → Chat.submitPrompt()
        → Chat.sendMessage()
            → HTTP POST /api/chat/completions (or Pipeline)
            → socket.on('events', chatEventHandler)
                → switch(event.data.type):
                    case 'chat:message:delta': history.messages[id].content += delta
                    case 'status': history.messages[id].statusHistory.push(...)
                    case 'chat:completion': mark done, save to DB
                    case 'source': history.messages[id].sources.push(...)
                    case 'execute': eval(event.data.data.js)  // ⚠️ Security risk
```

[F] Socket.IO `events` 是单一的 multiplex 通道，所有后端推送都通过它。

## 5. 组件架构

### 5.1 组件组织原则

| Directory | Pattern | Purpose |
| --- | --- | --- |
| `components/chat/` | Feature-specific | Chat UI 全功能组件 |
| `components/common/` | Reusable generic | 通用 UI primitives (Modal, Dropdown, Tooltip, etc.) |
| `components/admin/` | Admin-only | 管理后台专用 |
| `components/app/` | App shell | AppSidebar |
| `components/channel/` | Feature-specific | 频道/群组聊天 |
| `components/calendar/` | Feature-specific | 日历功能 |
| `components/automations/` | Feature-specific | 自动化功能 |

### 5.2 Chat.svelte — 核心 Orchestrator

`Chat.svelte` 是整个前端最关键的组件：

```text
[F] src/lib/components/chat/Chat.svelte

Props:     chatIdProp?: string
State:     history (message tree), selectedModels, files, prompt, loading, generating
Lifecycle: onMount → loadChat(chatId) or init new chat
Key fns:   submitPrompt(), sendMessage(), chatEventHandler()
```

**Local State** (非全局 Store，Chat 组件私有)：

| Variable | Type | Purpose |
| --- | --- | --- |
| `history` | `{messages: Record, currentId: string}` | 消息树结构 |
| `selectedModels` | `string[]` | 选中模型列表 |
| `files` | `File[]` | 待上传文件 |
| `loading` | `boolean` | 初始加载中 |
| `generating` | `boolean` | 流式生成中 |

[I] Chat.svelte 的 `history` 使用 Tree 而非 Array，这是 Open WebUI 相比其他 Chat UI 的显著特点。`parentId`/`childrenIds` 关系支持分支对话和编辑后重新生成。

### 5.3 Message History Tree

```typescript
// [I] Inferred from event handling patterns
interface History {
  messages: Record<string, Message>;
  currentId: string;  // leaf node in current branch
}

interface Message {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  models?: string[];
  statusHistory: StatusEvent[];
  sources: Citation[];
  files: File[];
  done: boolean;
  error: string | null;
}
```

[I] `Messages.svelte` 从 `currentId` 向上遍历 `parentId` 构建线性展示列表，实现分支对话的可视化。

## 6. 前端 Permission / Security 架构

> Level 2 要求必须覆盖 Permission 与 Security，本节写入主报告。

### 6.1 认证模型

```text
[F] JWT Token 存储在 localStorage.token
[F] 每次 API 请求在 Authorization header 携带 Bearer token
[F] Token 到期检查每 15s 执行一次
[F] 无 HttpOnly Cookie 保护 — JS 可以读取 token（XSS 风险）
```

### 6.2 前端权限模型

```text
[I] 前端通过 config.features 和 user.role 控制 UI 可见性
[F] Admin 路由通过 (app)/admin/+layout.svelte 实现客户端路由守卫
[I] 权限检查在前端是 UI 层面的（显示/隐藏），真正的授权在后端 API
[R] 前端权限仅作为 UX 优化，不能依赖其安全性
```

### 6.3 已知安全缺陷

| Issue | Detail | Impact |
| --- | --- | --- |
| **Token in localStorage** | JWT accessible to any JS on page | XSS → full account takeover |
| **CORS `*` default** | `CORS_ALLOW_ORIGIN=*` | Any origin can make requests |
| **CSP disabled by default** | No Content-Security-Policy header | No XSS mitigation |
| **Dynamic code execution** | `{type: "execute"}` events → `eval()`-like execution | RCE from compromised backend/model |
| **HTML rendering sandbox** | iFrame `sandbox="allow-same-origin"` | Bypassable (CVE-2026-45303) |
| **SSE code injection** | Direct Connections model servers can inject `execute` events | Account takeover (CVE-2025-64496) |
| **OAuth SVG injection** | SVG profile images without MIME validation | Stored XSS (GHSA-3wgj-c2hg-vm6q) |

### 6.4 安全事件类型（高风险）

前端处理以下来自 Socket.IO 的安全敏感事件类型：

| Event Type | Action | Risk Level |
| --- | --- | --- |
| `execute` | 在浏览器主线程执行任意 JS | 🔴 CRITICAL |
| `execute:python` | 在 Pyodide WASM worker 执行 Python | 🟡 HIGH |
| `execute:tool` | 调用外部 Tool Server | 🟡 HIGH |
| `confirmation` | 弹出确认对话框 | 🟢 LOW |
| `input` | 弹出输入对话框 | 🟢 LOW |
| `notification` | 显示 toast 通知 | 🟢 LOW |

[F] `execute` 事件允许后端发送任意 JS 到前端执行。这是有意设计用于 "agent-style interactions"，但若后端被攻破，前端完全暴露。

## 7. 架构决策记录（隐式）

以下是从源码结构中推断的隐含架构决策：

| Decision | Evidence | Type |
| --- | --- | --- |
| **选择 Svelte 而非 React/Vue** | 全部组件 .svelte, SvelteKit 路由 | [F] |
| **SPA 而非 SSR** | 无 +page.server.ts, 客户端 auth check | [I] |
| **Socket.IO 而非 SSE** | socket.io-client 依赖, events channel multiplex | [F] |
| **单一 Store 文件** | src/lib/stores/index.ts 承载全部 stores | [F] |
| **Tree 而非 List 的对话模型** | parentId/childrenIds 事件处理模式 | [I] |
| **Client-side Python execution** | Pyodide worker (pyodide.worker.ts) | [F] |
| **Tiptap 而非 contenteditable** | RichTextInput 使用 Tiptap | [F] |
| **Feature flag by backend config** | config.features 控制功能可见性 | [I] |

## 8. 稳健性考量

| Mechanism | Implementation | Evidence Type |
| --- | --- | --- |
| **Socket reconnection** | Socket.IO auto-reconnect (1s-5s backoff + jitter) | [F] |
| **Token refresh** | 15s interval check for token expiry | [F] |
| **Streaming throttling** | Messages.svelte: requestAnimationFrame throttle on list rebuild | [I] |
| **Dirty checking** | ResponseMessage: structuredClone + O(1) content/done comparison | [I] |
| **Heartbeat** | 30s interval socket ping | [F] |
| **Cross-tab sync** | BroadcastChannel API | [F] |
| **Error boundary** | Chat.svelte Error rendering in Messages | [I] |
