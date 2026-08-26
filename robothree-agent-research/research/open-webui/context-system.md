# Open WebUI — Context System（前端视角）

## 1. 概述

Open WebUI 前端的 Context 系统负责在消息提交前组装完整的 LLM 请求上下文。前端不直接构建最终的 Prompt String（这由后端 Chat Completion Middleware Pipeline 完成），但前端负责**用户可见的上下文元素选择与附着**。

## 2. Prompt Variable Substitution

### 2.1 变量系统

`MessageInput.svelte` 内部使用 Tiptap RTE，支持用户在 Prompt 中嵌入变量：

```text
[F] 来源: Web Search 聚合 — MessageInput component 支持 variable substitution

{{CLIPBOARD}}    — 剪贴板内容
{{USER_NAME}}    — 当前用户名
{{CURRENT_DATE}} — 当前日期
{{CURRENT_TIME}} — 当前时间
{{MODEL}}        — 当前选中模型名
{{WEB_SEARCH_RESULTS}} — Web 搜索结果（若启用）
```

[I] 变量在提交前在前端展开，替换为实际值。

### 2.2 变量注入 vs Prompt 变量

```
[I] Two distinct mechanisms:
1. Template variables: {{VAR}} in user-authored text → expanded client-side
2. Backend-injected context: RAG results, web search, tool outputs → injected server-side
```

## 3. Context Element Attachment

### 3.1 可附加的上下文元素

用户在 MessageInput 中可以附加以下上下文：

| Element | UI Control | Attached To | Data Flow |
| --- | --- | --- | --- |
| **Files** | InputMenu → file upload / drag-drop | Message.files[] | Uploaded → server stores → chat payload references |
| **Knowledge Bases** | @ symbol → knowledge selector | Chat settings | Backend fetches RAG results at inference time |
| **Prompts** | / symbol → prompt selector | Message.content | Content is inserted into input |
| **Skills** | / symbol → skill selector | Chat settings | Skill prompt + tools attached to request |
| **Models** | @ symbol → model selector | Chat.models[] | Determines which models receive the request |
| **Notes** | InputMenu → note selector | Message.content | Note content inserted |
| **Web Search Toggle** | ChatControls | Request parameter | Backend enables web search |

### 3.2 Command Suggestion System

```text
[F] 目录: src/lib/components/chat/MessageInput/Commands/

Emojis.svelte       — :emoji_name: 选择器
Knowledge.svelte     — @knowledge_name 知识库选择
Models.svelte        — @model_name 模型选择
Prompts.svelte       — /prompt_name 提示词选择
Skills.svelte        — /skill_name Skill 选择
```

[I] 命令系统是上下文组装的"用户界面层"——用户在输入框中通过 `@` 和 `/` 触发上下文选择，Tiptap suggestion plugin 渲染下拉菜单。

## 4. Context Assembly Flow（消息提交时）

### 4.1 前端组装 → 后端注入 的边界

```text
Frontend Responsibility          Backend Responsibility
───────────────────────          ──────────────────────
• Prompt text (with variables)   • System Prompt template
• Selected models[]              • Knowledge base RAG context
• Attached files[]               • Conversation history (from DB)
• Tool toggles (on/off)          • Tool definitions
• Skill selection                • Web search results
• Advanced parameters            • Memory injection
  (temperature, top_p, etc.)    • Function/pipeline processing
```

[F] 前端构建的 payload 经 HTTP POST 发送到 `/api/chat/completions`（或 Pipeline endpoint）。
[I] 后端接收后进入 Chat Completion Middleware Pipeline，依次注入 System Prompt、RAG Context、Memory、Tool Definitions。

### 4.2 消息 Payload 结构（推断）

```typescript
// [I] Inferred from API interaction patterns
interface ChatCompletionPayload {
  model: string;
  messages: {role: string; content: string}[];
  stream: true;
  options?: {
    temperature: number;
    top_p: number;
    // ...
  };
  files?: {id: string; name: string}[];
  knowledge?: string[];       // knowledge base IDs
  tools?: string[];           // tool IDs to enable
  skills?: string[];          // skill IDs
  features?: {
    web_search: boolean;
    // ...
  };
}
```

## 5. 对话历史树（History Tree as Context）

### 5.1 数据结构

Open WebUI 的 `history` 使用 Tree 而非 Array：

```typescript
// [I] Inferred from event handler design
interface History {
  messages: Record<string, Message>;
  currentId: string; // pointer to current leaf node
}

interface Message {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  // ... content, model, statusHistory, etc.
}
```

### 5.2 分支对话序列化

```text
[I] 提交到后端的 messages[] 是 currentId 向上遍历 parentId 的线性路径：

function buildLinearHistory(history: History): Message[] {
  const chain: Message[] = [];
  let id = history.currentId;
  while (id) {
    chain.unshift(history.messages[id]);
    id = history.messages[id].parentId;
  }
  return chain;
}
```

[F] `Messages.svelte` 使用这种遍历构建 UI 显示列表。
[I] 分支（siblings）通过 childrenIds.length > 1 检测，UI 提供 prev/next sibling 导航。

### 5.3 Context Window Implications

```
[I] 当用户编辑一条历史消息并重新生成时：
1. 旧分支保留（childrenIds 数组新增 node）
2. 新分支从编辑后的节点出发
3. 只有新分支的内容被发送到后端 —— old branch messages excluded from context
4. 这意味着 "编辑 → 重新生成" 会改变 context window 的起止范围
```

## 6. Temporary Chat Context

```text
[F] Store: temporaryChatEnabled (writable boolean)
[I] Temporary chat 模式下，对话不会持久化到后端 DB
[I] 前端使用内存中的 history tree，会话结束即销毁
[F] 快捷键: Ctrl+Shift+T 开启临时聊天
```

## 7. 对 RoboThree 的 Context 设计启示

| Aspect | Open WebUI Pattern | RoboThree Implication |
| --- | --- | --- |
| **变量注入** | 客户端 `{{VARS}}` + 服务端 RAG/Memory 注入 | 可参考双层注入模型 |
| **命令建议** | Tiptap suggestion plugin + @/# triggers | 可借鉴触发表的 UX 模式 |
| **分支对话** | Tree 数据结构而非 List | 如果 RoboThree 需要分支对话，Tree 模型值得采纳 |
| **Temporary Chat** | 内存态、不持久化 | 对隐私模式/临时任务有价值 |
| **Context 边界** | 前端选参数 + 后端注入上下文 | 明确的前后端职责划分模式 |

## 8. Evidence Quality Note

| Evidence Level | Count | Notes |
| --- | --- | --- |
| FACT (API sourced) | 5 | File paths from GitHub API tree, command directories verified |
| INFERENCE | 8 | Payload structure, history tree implementation, data flow patterns |
| UNKNOWN | 2 | Backend pipeline injection details (out of scope) |
