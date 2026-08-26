# Open WebUI — 前端源码地图 (Source Map)

## 1. 顶层前端目录

```
src/
├── app.css                    # Global CSS (Tailwind utilities, typography)
├── app.d.ts                   # TypeScript ambient declarations
├── app.html                   # SvelteKit HTML shell
├── lib/
│   ├── apis/                  # 25 HTTP REST API 客户端模块
│   ├── components/            # ~500+ .svelte UI 组件
│   ├── i18n/                  # 17+ 语言翻译文件
│   ├── stores/                # 全局 Svelte writable stores (index.ts)
│   ├── types/                 # TypeScript type definitions
│   ├── utils/                 # 工具函数 (Markdown, CSP, audio, etc.)
│   └── workers/               # Web Workers (Pyodide, Kokoro TTS)
├── routes/                    # SvelteKit file-based routing (~30 routes)
└── static/                    # Static assets (images, fonts, swagger-ui)
```

## 2. 核心运行时入口

### 2.1 Root Layout — 全局初始化链

**File**: `src/routes/+layout.svelte`

启动时依次执行：

```text
onMount:
  1. applyTheme()                          — Theme from localStorage
  2. fetchConfig()                         — GET /api/config → stores.config
  3. setupSocket()                         — Socket.IO /ws/socket.io with JWT auth
  4. getSessionUser()                      — GET /api/auths/ → stores.user
  5. i18n.init()                           — Locale from localStorage/navigator
  6. heartbeat (every 30s)                 — Socket connection keepalive
  7. token expiry check (every 15s)        — JWT expiration monitor
  8. pyodide worker init                   — Persistent Python WASM worker
```

### 2.2 App Layout — 认证后 Shell

**File**: `src/routes/(app)/+layout.svelte`

认证检查 + 数据加载：

```text
onMount (auth check → redirect to /auth if no user):
  1. setUserSettings()      → stores.settings
  2. setModels()            → stores.models
  3. setToolServers()       → validate tool server connections
  4. setTools() / getTools()
  5. getPrompts()           → stores.prompts
  6. getKnowledgeBases()    → stores.knowledge
  7. getFunctions()         → stores.functions
  8. getAllTags()           → stores.tags
  9. setBanners()           → admin announcements
```

UI Shell 组件：

- `<Sidebar />` — 聊天列表、文件夹、搜索
- `<Navbar />` — 模型选择器、聊天标题
- `<SettingsModal />` — 多 Tab 用户设置
- `<ChangelogModal />` — 版本更新通知

### 2.3 聊天页面入口

| Route | File | Renders |
| --- | --- | --- |
| `/` (New Chat) | `src/routes/(app)/+page.svelte` | `<Chat />` (无 chatId) |
| `/c/[id]` (Existing) | `src/routes/(app)/c/[id]/+page.svelte` | `<Chat chatIdProp={$page.params.id} />` |

## 3. 组件层次（关键层级）

### 3.1 Chat 组件树

```
Chat.svelte (Orchestrator)
├── Navbar.svelte
│   ├── ModelSelector.svelte     — 模型选择
│   ├── ChatControls.svelte      — 控制选项
│   └── Tags.svelte              — 标签管理
├── Messages.svelte              — 消息列表
│   └── Message.svelte           — 类型路由 (User/Response/Multi)
│       ├── UserMessage.svelte   — 用户消息渲染
│       │   └── FileNav/         — 文件预览 (Code/PDF/Excel/Notebook/SQLite)
│       └── ResponseMessage.svelte — AI 回复渲染
│           ├── ContentRenderer.svelte — Markdown/KaTeX/Mermaid
│           │   ├── Markdown.svelte
│           │   │   ├── KatexRenderer.svelte
│           │   │   ├── CodeBlock.svelte
│           │   │   └── MarkdownInlineTokens/
│           │   ├── Citations.svelte
│           │   ├── CodeExecutions.svelte
│           │   └── StructuredOutputRenderer.svelte
│           ├── StatusHistory.svelte   — 工具执行状态
│           ├── FollowUps.svelte       — 推荐追问
│           ├── WebSearchResults.svelte
│           └── RateComment.svelte     — 反馈评分
├── MessageInput.svelte          — 输入区域
│   ├── RichTextInput.svelte     — Tiptap RTE
│   ├── InputMenu.svelte         — 文件/知识库/笔记
│   ├── CommandSuggestionList.svelte — @/#/ 命令建议
│   ├── CallOverlay.svelte       — 语音/视频通话
│   ├── VoiceRecording.svelte    — 语音输入
│   └── Controls.svelte          — 控制阀门
├── Suggestions.svelte           — 新对话建议
├── ChatPlaceholder.svelte       — 空状态占位
├── Artifacts.svelte             — 代码产物展示
├── PyodideFileNav.svelte        — Pyodide 文件系统
├── SkillsModal.svelte           — Skills 选择器
├── ToolServersModal.svelte      — 工具服务器管理
├── ShareChatModal.svelte        — 分享聊天
├── ShortcutsModal.svelte        — 快捷键帮助
└── TagChatModal.svelte          — 标签编辑
```

### 3.2 其他关键页面组件

| Feature | Layout | Page |
| --- | --- | --- |
| Workspace | `workspace/+layout.svelte` | Models, Prompts, Tools, Skills, Knowledge |
| Admin | `admin/+layout.svelte` | Users, Settings, Analytics, Evaluations, Functions |
| Playground | `playground/+layout.svelte` | Completions, Images |
| Channels | N/A | `channels/[id]/+page.svelte` (群组聊天) |
| Notes | `notes/+layout.svelte` | Notes CRUD |
| Calendar | N/A | `calendar/+page.svelte` |
| Automations | N/A | `automations/+page.svelte` |

## 4. API 客户端模块 (`src/lib/apis/`)

共 25 个 API 模块，每个对应一组后端 REST 端点。

| Module | File(s) | Primary Functions |
| --- | --- | --- |
| **Core** | `index.ts` | `getBackendConfig()`, `getModels()` |
| **Auth** | `auths/index.ts` | `getSessionUser()`, `userSignIn()`, `userSignOut()` |
| **Chats** | `chats/index.ts` | `getChatList()`, `newChat()`, `getChatById()`, `updateChatById()`, `deleteChatById()` |
| **Channels** | `channels/index.ts` | Channel CRUD, message sending |
| **Streaming** | `streaming/index.ts` | SSE/streaming helpers |
| **Models** | `models/index.ts` | Model CRUD |
| **Prompts** | `prompts/index.ts` | Prompt CRUD |
| **Knowledge** | `knowledge/index.ts` | Knowledge base management |
| **Tools** | `tools/index.ts` | Tool CRUD, tool server management |
| **Functions** | `functions/index.ts` | Custom function CRUD |
| **Skills** | `skills/index.ts` | Skills management |
| **Memories** | `memories/index.ts` | Memory/context management |
| **Files** | `files/index.ts` | File upload/download |
| **Folders** | `folders/index.ts` | Folder management |
| **Images** | `images/index.ts` | Image generation |
| **Audio** | `audio/index.ts` | TTS/STT |
| **Notes** | `notes/index.ts` | Notes CRUD |
| **Retrieval** | `retrieval/index.ts` | RAG retrieval queries |
| **Configs** | `configs/index.ts` | System configuration |
| **Users** | `users/index.ts` | Admin user management |
| **Groups** | `groups/index.ts` | Group management |
| **Tasks** | `tasks/index.ts` | Background task status |
| **Ollama** | `ollama/index.ts` | Direct Ollama API calls |
| **OpenAI** | `openai/index.ts` | Direct OpenAI API calls |
| **Evaluations** | `evaluations/index.ts` | Arena/Leaderboard |
| **Analytics** | `analytics/index.ts` | Usage analytics |
| **Utils** | `utils/index.ts` | Shared API helpers |
| **Terminal** | `terminal/index.ts` | Terminal server integration |

## 5. 全局 Stores (`src/lib/stores/index.ts`)

### 5.1 核心 Stores

| Store | Type | Purpose |
| --- | --- | --- |
| `user` | `Writable<SessionUser \| undefined>` | 当前认证用户 |
| `config` | `Writable<Config \| undefined>` | 后端配置 (feature flags, defaults) |
| `settings` | `Writable<Settings>` | 用户 UI 偏好 |
| `socket` | `Writable<Socket \| null>` | Socket.IO 客户端实例 |
| `models` | `Writable<Model[]>` | 可用 LLM 模型列表 |
| `chats` | `Writable<Chat[] \| null>` | 用户聊天列表 |
| `chatId` | `Writable<string>` | 当前活跃聊天 ID |
| `chatTitle` | `Writable<string>` | 当前聊天标题 |
| `showSidebar` | `Writable<boolean>` | 侧边栏可见性 |
| `showSettings` | `Writable<boolean>` | 设置弹窗可见性 |
| `mobile` | `Writable<boolean>` | 移动端检测 |
| `theme` | `Writable<string>` | UI 主题 (dark/light/oled) |
| `temporaryChatEnabled` | `Writable<boolean>` | 临时聊天模式 |

### 5.2 内容 Stores

| Store | Type | Purpose |
| --- | --- | --- |
| `prompts` | `Writable<Prompt[]>` | 用户自定义 Prompts |
| `tools` | `Writable<Tool[]>` | 可用 Tools |
| `functions` | `Writable<Function[]>` | 自定义 Functions |
| `knowledge` | `Writable<KnowledgeBase[]>` | 知识库列表 |
| `tags` | `Writable<Tag[]>` | 聊天标签 |

### 5.3 实时状态 Stores

| Store | Type | Purpose |
| --- | --- | --- |
| `activeUserIds` | `Writable<string[]>` | 在线用户 ID 列表 |
| `USAGE_POOL` | `Writable<object>` | 实时用量统计 |

### 5.4 访问模式

```typescript
// Component reactive access (auto-subscribe)
$: if ($user && $config?.features?.auth) { ... }

// Explicit get (outside component context)
import { get } from 'svelte/store';
const currentUser = get(user);

// Write
user.set(newUser);
user.update(u => ({ ...u, name: 'new' }));
```

## 6. 工具/Worker 模块

| Module | File | Purpose |
| --- | --- | --- |
| **Pyodide Worker** | `src/lib/workers/pyodide.worker.ts` | 浏览器端 Python 执行 (WASM) |
| **Kokoro Worker** | `src/lib/workers/kokoro.worker.ts` | 浏览器端 TTS (Kokoro model) |
| **CSP Utils** | `src/lib/utils/csp.ts` | Content Security Policy 管理 |
| **Markdown Extensions** | `src/lib/utils/marked/*.ts` | 自定义 marked.js 扩展 (citation, colon-fence, footnote, katex, mention, strikethrough) |
| **Audio Utils** | `src/lib/utils/audio.ts` | Web Audio API 录音/播放 |

## 7. 动态代码执行路径（安全问题相关）

前端存在两条代码执行路径（来自服务端事件）：

| Event Type | Handler | Execution Context |
| --- | --- | --- |
| `{type: "execute"}` | `chatEventHandler` → `eval()` / dynamic constructor | 浏览器主线程 JavaScript |
| `{type: "execute:python"}` | `chatEventHandler` → Pyodide Worker | Web Worker WASM sandbox |

这些路径是多个 CVE 的根源（CVE-2025-64496, CVE-2026-45303）。

## 8. 数据持久化策略

| Data | Storage | Lifetime |
| --- | --- | --- |
| JWT Token | `localStorage.token` | Until logout/expiry |
| Theme | `localStorage.theme` | Permanent |
| Locale | `localStorage.locale` | Permanent |
| API Keys (Direct Connections) | `localStorage` | Permanent |
| Chat History | Backend DB via REST API | Permanent |
| User Settings | Backend DB via REST API | Permanent |
