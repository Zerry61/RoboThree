# Open WebUI — Skill / Plugin / MCP（前端视角）

## 1. 概述

Open WebUI v0.10.2 前端支持三种可扩展能力机制：**Skills**、**Tools (含 MCP)** 和 **Functions**。

> 注意：Open WebUI 不使用 "Plugin" 术语。其扩展性通过 Skills（Prompt + Tools 封装包）、Tools（含外部 Tool Server 和 MCP Server）、Functions（自定义 Python 函数）实现。Hooks 在前端体现为键盘快捷键系统和事件处理，但无独立 Plugin Hook API。

## 2. Skills System

### 2.1 前端 Skills 组件

```text
[F] 目录: src/lib/components/chat/SkillsModal.svelte               — Skills 选择弹窗
[F] 目录: src/lib/components/chat/MessageInput/Commands/Skills.svelte — 输入框 /skill 命令
[F] API:   src/lib/apis/skills/index.ts                            — Skills REST API
[F] Routes: src/routes/(app)/workspace/skills/                     — Skills 管理页面
```

### 2.2 Skill 是什么（前端视角）

[I] 从组件结构推断，Skill 是一个打包了 **Prompt Template + Tool Set + Model Config** 的可复用单元：

```typescript
// [I] Inferred from UI components (SkillsModal, Skills command)
interface Skill {
  id: string;
  name: string;
  description: string;
  promptTemplate: string;     // System/context prompt
  tools: string[];            // Associated tool IDs
  model?: string;             // Preferred model
  icon?: string;              // Display icon
  isActive: boolean;
}
```

### 2.3 用户交互流

```text
方式 1: 输入框中 /skill_name 触发
  → CommandSuggestionList → Skills.svelte → 选择 Skill
    → Skill 的 prompt + tools 附加到消息 payload

方式 2: SkillsModal
  → 浏览/搜索所有 Skills → 点击启用
    → Skill 的 prompt template 注入到当前对话

方式 3: Workspace → Skills 管理页面
  → CRUD: 创建/编辑/删除 Skills
    → 配置 prompt template, 关联 tools, 设置 model preference
```

### 2.4 Skill 上下文注入

[I] 当用户选择 Skill 后，前端不直接拼接 Prompt。而是：

```text
Chat.sendMessage() payload:
  {
    skills: [skillId1, skillId2],  // Skill IDs attached to request
    // Backend resolves skill → prompt template + tools
  }
```

[I] 后端 Middleware Pipeline 在 Context Assembly 阶段注入 Skill 的 prompt template 和关联的 tool definitions。

## 3. Tools System

### 3.1 前端 Tools 组件

```text
[F] 目录: src/lib/components/chat/ToolServersModal.svelte    — 管理外部 Tool Servers
[F] 目录: src/lib/components/AddToolServerModal.svelte       — 添加 Tool Server
[F] 目录: src/lib/components/chat/Controls/Valves.svelte     — Tool 参数控制
[F] API:   src/lib/apis/tools/index.ts                        — Tools REST API
[F] Routes: src/routes/(app)/workspace/tools/                 — Tools 管理页面
```

### 3.2 Tool 类型

[I] 前端区分三种 Tool 来源：

| Type | Source | Frontend Role |
| --- | --- | --- |
| **Built-in Tools** | Backend native functions | Toggle on/off in Controls |
| **External Tool Server** | HTTP endpoint (OpenAPI/MCP) | Connection management (AddToolServerModal) |
| **MCP Tools** | MCP Server (via stdio/HTTP) | Connection management + tool discovery |

### 3.3 MCP 相关

```text
[I] 来源: v0.6.0 release notes — "MCP support"
[I] v0.10.2 已拥有成熟的 MCP Tool Server 集成

前端 MCP 相关功能:
  - AddToolServerModal: 添加 MCP Server endpoint
  - Tools 管理页面: 查看 MCP Server 提供的 tools
  - Controls/Valves: 控制 MCP tools 的启用/禁用
```

[I] 前端不直接与 MCP Server 通信。流程为：
```text
Frontend → REST API → Backend → MCP Client → MCP Server (via stdio or HTTP)
```

[I] 这与标准 MCP 架构一致：Host（Backend）→ Client → Server。前端仅作为 UI 控制层。

## 4. Functions System

### 4.1 前端 Functions 组件

```text
[F] API: src/lib/apis/functions/index.ts
[F] Routes (workspace): src/routes/(app)/workspace/functions/create/+page.svelte
[F] Routes (admin): src/routes/(app)/admin/functions/
[F] Components:
    src/lib/components/admin/Functions.svelte
    src/lib/components/admin/Functions/FunctionEditor.svelte
    src/lib/components/admin/Functions/FunctionMenu.svelte
    src/lib/components/admin/Functions/AddFunctionMenu.svelte
```

### 4.2 Function 是什么

[I] Functions 是用户自编写的 Python 代码片段，在 Chat Completion Pipeline 中作为中间件执行：

```text
Function 类型（推测）：
  1. Filter Functions — 修改输入/输出
  2. Action Functions — 执行特定操作
  3. Event Hooks — 在 Pipeline 特定阶段触发
```

[F] `FunctionEditor.svelte` 组件提供代码编辑器（CodeMirror），用于编写 Python 函数。

## 5. 扩展机制的架构对比

```text
┌──────────────────────────────────────────────────────────┐
│                     Svelte Frontend                       │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ Skills   │  │ Tools    │  │ Functions            │   │
│  │ (Prompt  │  │ (Toggles │  │ (Code Editor /      │   │
│  │  + Tools │  │  + MCP   │  │  Pipeline Config)   │   │
│  │  bundle) │  │  + Ext.) │  │                      │   │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘   │
│       │              │                   │               │
├───────┼──────────────┼───────────────────┼───────────────┤
│       ▼              ▼                   ▼               │
│  ┌───────────────────────────────────────────────────┐   │
│  │           FastAPI Backend (out of scope)           │   │
│  │  Skill Resolver, Tool Registry, Function Executor │   │
│  │  MCP Client, Pipeline Middleware                  │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

[F] 前端作为纯粹的 **配置与选择界面**，不参与实际的 Skill prompt 解析、Tool dispatch、Function 执行。

## 6. 对 RoboThree 的启示

| Mechanism | Open WebUI Pattern | RoboThree Implication |
| --- | --- | --- |
| **Skill 定义** | Prompt Template + Tool Set Bundle | ADAPT: Skills as composable prompt+tool packages |
| **Skill 触发** | 输入框 `/skill_name` 命令 | ADAPT: Tiptap-style command palette for triggering |
| **MCP 集成** | 前端仅做 UI 控制，实际通信走 Backend→MCP Client | ADOPT: 保持前端薄层，MCP 通信在 Agent Runtime 侧 |
| **Function Editor** | 浏览器端 CodeMirror 编辑 Python | DEFER: Code Editor 暂非 MVP 必需 |
| **Tool Toggle** | Controls/Valves 分离模式 | ADOPT: 简洁的开关 + 参数分离 UI |

## 7. Evidence Quality

| Evidence Level | Count |
| --- | --- |
| FACT (API tree) | 8 (directory structure, file paths) |
| INFERENCE | 7 (Skill data model, MCP flow, Function types) |
| UNKNOWN | 2 (exact Skill injection mechanism in backend pipeline, exact MCP implementation version) |
