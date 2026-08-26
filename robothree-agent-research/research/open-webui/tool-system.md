# Open WebUI — Tool System（前端视角）

## 1. 概述

Open WebUI 前端在 Tool 系统中承担三种角色：

1. **Tool 选择 UI** — 用户在 MessageInput 中选择启用哪些 Tools
2. **Tool 执行状态展示** — 通过 `status` 事件实时展示 Tool 执行进度
3. **浏览器端 Code Execution** — Pyodide (Python WASM) 和 `execute` (JavaScript 动态执行)

> 后端 Tool Registry / Dispatch / Timeout / Retry 等不在本次前端研究范围内。

## 2. Tool 选择 UI

### 2.1 控件位置

```text
[F] 目录: src/lib/components/chat/Controls/Controls.svelte
[F] 目录: src/lib/components/chat/Controls/Valves.svelte

MessageInput 区域包含两类 Tool 控制：
1. Controls.svelte — Tool 开关 (on/off toggles for each tool)
2. Valves.svelte   — Tool 参数调整 (sliders, toggles for tool config)
```

### 2.2 Tool 数据流

```text
[F] Store: tools (Writable<Tool[]>)
[F] API:   src/lib/apis/tools/index.ts

加载流程:
  (app)/+layout.svelte → setTools() → GET /api/tools → stores.tools

用户选择:
  Controls.svelte → toggle tool on/off → included in chat payload
```

## 3. Tool Execution 状态展示

### 3.1 Status Events（服务端推送）

Tool 执行期间，后端通过 Socket.IO 发送连续的 `status` 事件：

```typescript
// [I] Event payload structure from web search aggregation
{
  chat_id: string,
  message_id: string,
  data: {
    type: "status",
    data: {
      action: "tool_call" | "web_search" | "code_execution" | "rag",
      description: "Searching the web...",
      done: false
    }
  }
}
```

### 3.2 前端渲染路径

```text
Socket.IO 'events' channel
  → Chat.chatEventHandler()
    → case 'status':
        message.statusHistory.push(statusEvent)
  → ResponseMessage.svelte (reactive)
    → StatusHistory.svelte
      → StatusItem.svelte (icon + description + spinner/checkmark)
```

```text
[F] 目录: src/lib/components/chat/Messages/ResponseMessage/StatusHistory.svelte
[F] 目录: src/lib/components/chat/Messages/ResponseMessage/StatusHistory/StatusItem.svelte
```

### 3.3 StatusHistory UI

[I] Status 事件按时间顺序追加到 `message.statusHistory[]`，在 ResponseMessage 顶部或内容区渲染一条状态时间线：

```text
[spinner] 🔍 Searching the web...
[✓]      🔍 Found 5 results
[spinner] 🛠️ Executing tool: calculator
[✓]      🛠️ Tool returned: 42
[spinner] 💬 Generating response...
```

## 4. 浏览器端 Code Execution（高安全风险）

### 4.1 两条执行路径

Open WebUI 前端支持两类服务端触发的客户端代码执行：

| Type | Event | Execution Context | Security Boundary |
| --- | --- | --- | --- |
| **JavaScript** | `{type: "execute"}` | Browser main thread | ❌ NONE — can access DOM, localStorage, cookies |
| **Python** | `{type: "execute:python"}` | Pyodide Web Worker (WASM) | 🟡 Partial — WASM sandbox, but preloaded modules may have escape vectors |
| **External Tool** | `{type: "execute:tool"}` | External Tool Server HTTP call | 🟡 Depends on tool server isolation |

### 4.2 JavaScript Execute 路径（CRITICAL RISK）

```text
[F] 来源: CVE-2025-64496, CVE-2026-45303

Socket.IO event:
  {type: "execute", data: {js: "eval(localStorage.getItem('token'))"}}

Frontend handler:
  chatEventHandler → eval(event.data.data.js) or Function(event.data.data.js)()

Attack vector:
  1. Attacker controls a Direct Connection model server
  2. Model returns SSE with {type: "execute", "..."} payload
  3. Frontend dynamically executes the JS
  4. Token exfiltrated from localStorage → account takeover
```

[F] CVE-2025-64496 patched in v0.6.35 by adding origin validation to Direct Connections.
[I] The underlying mechanism (`execute` event handling) likely still exists for trusted backend scenarios.

### 4.3 Pyodide Python Execute 路径

```text
[F] Worker File: src/lib/workers/pyodide.worker.ts

Flow:
  Socket.IO → {type: "execute:python", data: {python: "import os; print(os.listdir())"}}
    → Chat.chatEventHandler()
      → pyodideWorker.postMessage({python: code})
        → Pyodide WASM runtime executes Python
          → Result through worker.onmessage
            → Sent back to backend via REST or Socket.IO emit
```

[F] Pyodide 运行在 Web Worker 中，有独立的 WASM 内存空间。
[I] 默认 Pyodide 不提供文件系统访问（除非通过 Emscripten FS 显式挂载）。
[I] 然而 Pyodide 有预装库（numpy, pandas 等），理论上存在 WASM escape 风险。

### 4.4 Tool Server Execution

```text
[F] Event: {type: "execute:tool", data: {tool_id, params}}

Flow:
  Socket.IO event
    → Chat.chatEventHandler()
      → HTTP POST to External Tool Server endpoint
        → Tool server processes request
          → Result returned to frontend
            → Frontend sends result back to backend
```

[I] 外部 Tool Server 是一个独立进程/容器，前端通过 HTTP 调用它。
[I] 这种模式让前端直接与外部服务通信，绕过了后端代理。

## 5. Tool Call 可视化

### 5.1 ToolCallDisplay 组件

```text
[F] File: src/lib/components/common/ToolCallDisplay.svelte

当 LLM 返回 tool_calls 时，ResponseMessage 中会渲染 ToolCallDisplay：
  - 显示被调用的 tool name
  - 显示参数摘要
  - 显示返回结果（可折叠）
```

### 5.2 Code Execution Modal

```text
[F] File: src/lib/components/chat/Messages/CodeExecutionModal.svelte

当 AI 生成代码块 + 用户点击执行时，弹出 CodeExecutionModal：
  - 显示完整代码
  - 选择执行引擎 (Pyodide / Terminal)
  - 显示 stdout/stderr 结果
```

## 6. 对 RoboThree 的 Tool 设计启示

| Aspect | Open WebUI | RoboThree Consideration |
| --- | --- | --- |
| **Status Events** | 服务端推送 Tool 执行步骤到前端 | 可借鉴的分步状态反馈模式 |
| **客户端执行** | execute:python 用 WASM sandbox | 如果 RoboThree 需要客户端执行，Pyodide 值得评估 |
| **execute 事件风险** | 服务端推送 JS 到前端执行 | ❌ REJECT — 应该用沙盒化 WASM 而非 eval() |
| **Tool Toggle UI** | Controls/Valves 分离（开关 vs 参数） | 可借鉴的 UI 模式 |
| **外置 Tool Server** | 前端直接 HTTP 调用外置 Tool Server | 需评估安全影响（绕过 API Gateway） |

## 7. Evidence Quality

| Evidence Level | Count |
| --- | --- |
| FACT | 6 (file paths from API tree, CVE records) |
| INFERENCE | 7 (event handler logic, data flow) |
| UNKNOWN | 1 (exact Pyodide preload module list) |
