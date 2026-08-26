# Open WebUI — Project Overview（前端）

## 1. 项目定位

| Field | Value |
| --- | --- |
| **Repository** | https://github.com/open-webui/open-webui |
| **Analyzed Commit** | `ecd48e2f718220a6400ecf49eafd4867a38feb10` |
| **Commit Date** | 2026-07-01 |
| **Version Tag** | v0.10.2 |
| **Default Branch** | `main` |
| **Primary Language** | TypeScript / Svelte (Frontend) + Python / FastAPI (Backend) |
| **Build System (Frontend)** | Vite 5.x |
| **Package Manager** | npm (inferred from `package.json`) |
| **Framework (Frontend)** | SvelteKit 2.x (SPA mode) + Svelte 4.x |
| **CSS Framework** | TailwindCSS 4.x |
| **Testing Framework** | Not identified in frontend tree (可能使用 Vitest 或 Playwright) |

## 2. 项目是什么

Open WebUI 是一个**自托管、功能丰富的 AI Chat 前端**，对标 ChatGPT Web UI。它提供：

- **多模型支持**：Ollama、OpenAI 兼容 API、Anthropic、Google Gemini 等。
- **完整 Chat UI**：流式响应、Markdown 渲染、代码高亮、Mermaid 图表、KaTeX 数学公式、文件上传、语音输入/输出。
- **知识库 / RAG**：文档上传、向量检索、上下文注入。
- **Tools & Functions**：Native Tool Calling、MCP Server 集成、外部 Tool Server。
- **Skills**：可复用的 Prompt + Tools 封装包。
- **Web Search**：联网搜索集成。
- **Code Execution**：通过 Pyodide（WASM）在浏览器端执行 Python。
- **Multi-User**：RBAC 权限模型、用户管理、频道/群组聊天。
- **Admin Panel**：用户管理、模型管理、分析仪表盘、系统设置。

## 3. 前端技术栈全貌

| Category | Technology | Version (inferred) | Role in Frontend |
| --- | --- | --- | --- |
| **Framework** | SvelteKit | 2.x | SPA routing, SSR/CSR hybrid |
| **UI Library** | Svelte | 4.x | Reactive component framework |
| **Language** | TypeScript | 5.x | Type-safe component & store definitions |
| **Build** | Vite | 5.x | Dev server, bundling, HMR |
| **CSS** | TailwindCSS | 4.x | Utility-first styling |
| **RTE** | Tiptap | 2.x | Rich text editor in MessageInput |
| **Realtime** | Socket.IO Client | 4.x | WebSocket bidirectional communication |
| **Math** | KaTeX | — | LaTeX math rendering |
| **Diagrams** | Mermaid | — | Text-to-diagram rendering |
| **Code Highlight** | CodeMirror / highlight.js | — | Syntax highlighting |
| **Pyodide** | Pyodide | 0.28.x | Browser-side Python execution (WASM) |
| **i18n** | i18next | 23.x | Internationalization (17+ languages) |
| **Markdown** | marked | — | Markdown parsing with custom extensions |
| **PDF** | pdfjs-dist | — | PDF preview in browser |
| **Excel** | xlsx | — | Excel file preview in browser |

## 4. License Snapshot

| Field | Value |
| --- | --- |
| **License** | BSD-3-Clause + Branding Protection Clause |
| **OSI Approved** | ❌ No（Branding Clause 违反 OSI 标准） |
| **Copyleft** | ❌ No |
| **Commercial Use** | ✅ Allowed（但移除品牌需 Enterprise License 或 < 50 用户） |
| **Code Reuse for RoboThree** | `DESIGN_ONLY` — 可参考设计模式，不可直接复用代码 |
| **License History** | MIT (2023) → BSD-3 (Jan 2025) → BSD-3 + Branding (v0.6.6+, Apr 2025) |
| **CLA Required** | ✅ Yes（v0.6.5 之后的新贡献） |
| **Pre-v0.6.5 Code** | Pure BSD-3-Clause（可 Fork，无品牌限制） |

**RoboThree 复用评级**：`DESIGN_ONLY`。Branding Protection Clause 与商业产品可能冲突；建议仅参考架构模式与接口设计，不直接使用代码。

## 5. 代码规模（前端）

| Metric | Value (Approx.) |
| --- | --- |
| **Total `.svelte` Files** | ~500+ |
| **Total `.ts` Files** | ~80+ |
| **API Modules** | 25 (`src/lib/apis/`) |
| **Route Pages** | ~30 (`src/routes/`) |
| **Stores** | ~30+ writable stores (`src/lib/stores/index.ts`) |
| **i18n Locales** | 17+ languages |

## 6. 关键入口

| Entry Point | File | Purpose |
| --- | --- | --- |
| **HTML Template** | `src/app.html` | SvelteKit app shell |
| **Global CSS** | `src/app.css` | Tailwind + global styles |
| **Root Layout** | `src/routes/+layout.svelte` | Auth, Socket.IO, i18n, theme, Pyodide init |
| **App Layout** | `src/routes/(app)/+layout.svelte` | Authenticated shell with sidebar, modals, shortcuts |
| **Main Chat Page** | `src/routes/(app)/+page.svelte` | New chat → renders `<Chat />` |
| **Existing Chat Page** | `src/routes/(app)/c/[id]/+page.svelte` | Existing chat → renders `<Chat chatIdProp={params.id} />` |
| **Auth Page** | `src/routes/auth/+page.svelte` | Login/signup |
| **Stores** | `src/lib/stores/index.ts` | All global Svelte writable stores |
| **API Index** | `src/lib/apis/index.ts` | Global API helpers (`getBackendConfig`, `getModels`) |

## 7. 与研究范围的关系

本次研究**仅覆盖前端**，不涉及：

- FastAPI 后端 (`backend/` 目录)
- 数据库 (SQLite/Postgres)
- Vector DB (Chroma/Qdrant)
- Redis Session Pool
- Docker 部署模型

前端架构对 RoboThree 的参考价值在于：

1. **Chat UI 组件化模式** — 可借鉴的组件 Tree 与 Svelte Store 状态管理模式。
2. **实时通信设计** — HTTP + WebSocket 双通道模型。
3. **消息历史树结构** — 分支对话的数据模型。
4. **Rich Text Input** — Tiptap 集成、Command suggestion 系统的设计。
5. **安全边界问题** — 从 Open WebUI 的 CVE 历史中学习前端安全反模式。
