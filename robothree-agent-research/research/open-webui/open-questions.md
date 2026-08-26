# Open WebUI — Open Questions（前端）

## 1. 源码验证类

### Q1: Svelte 版本确认

**Question**: Open WebUI v0.10.2 使用的是 Svelte 4 (writable stores) 还是 Svelte 5 (runes API)?
**Answer**: **[F] Svelte 5.53.10**，但代码使用 Svelte 4 兼容语法（`writable` from 'svelte/store'，`export let`，`$:` reactive）。尚未迁移到 runes API。
**Evidence**: `package.json` `"svelte": "^5.53.10"` + Chat.svelte 使用 `import { get, type Writable } from 'svelte/store'`
**Status**: ✅ CLOSED (L3)

### Q2: Chat.svelte 的完整 State 定义

**Question**: Chat.svelte 内部究竟定义了哪些 local state 变量？
**Answer**: **[F] 完整确认**。3453 行，95KB。核心 local state: `history`, `chat`, `tags`, `prompt`, `chatFiles`, `files`, `params`, `selectedModels`, `selectedToolIds`, `selectedSkillIds`, `selectedFilterIds`, `loading`, `generating`, `autoScroll`, `taskIds`, `chatTasks`, `webSearchEnabled`, `imageGenerationEnabled`, `codeInterpreterEnabled`, `pendingOAuthTools` 等。
**Evidence**: Chat.svelte L120-235 (完整 local state 定义)
**Status**: ✅ CLOSED (L3)

### Q3: Socket.IO event handler 的完整事件类型列表

**Question**: `chatEventHandler()` 一共处理了多少种事件类型？
**Answer**: **[F] 22 种事件类型**，完整列表见 `streaming-architecture.md` § 2.5。
**Evidence**: Chat.svelte L610-790 (chatEventHandler 完整源码)
**Status**: ✅ CLOSED (L3)

### Q4: Pyodide worker 的 preload 包列表

**Question**: Pyodide worker 预装了哪些 Python 包？
**Answer**: 未直接获取 `pyodide.worker.ts` 内容，但 `package.json` 确认 `"pyodide": "^0.28.2"` 和 `"@pyscript/core": "^0.4.32"` 依赖。
**Evidence**: package.json dependencies
**Status**: ⚠️ PARTIALLY CLOSED — 版本确认，具体 preload 包列表仍需本地验证

## 2. 架构决策类

### Q5: 为什么选择 Socket.IO 而非 SSE?

**Question**: 项目文档或讨论中是否有 Socket.IO vs SSE 的技术决策记录？
**Why matters**: 对 RoboThree 的实时通信技术选型有参考价值。
**Current evidence**: 无。Web Search 未发现相关的 ADR 或 discussion。
**How to close**: 搜索 GitHub Issues/Discussions 中 "SSE"、"Server-Sent Events"、"Socket.IO" 关键词的历史讨论。
**Status**: OPEN

### Q6: 为什么单一 Stores 文件而非模块化？

**Question**: 将 30+ stores 写在单个 `stores/index.ts` 是刻意设计还是历史惯性？是否有关于模块化的讨论？
**Why matters**: 评估状态管理架构演进路径。
**Current evidence**: 无相关讨论记录。
**How to close**: 搜索 GitHub Issues/Discussions 中 "stores"、"refactor"、"state management" 关键词。
**Status**: OPEN

### Q7: 前端测试策略

**Question**: Open WebUI 前端的测试框架、覆盖率和测试策略是什么？
**Answer**: **[F] Vitest + Cypress**。`package.json` 确认 `"vitest": "^1.6.1"` (unit) + `"cypress": "^13.15.0"` (E2E)。Script: `"test:frontend": "vitest --passWithNoTests"`。`--passWithNoTests` 暗示测试覆盖率可能很低。
**Evidence**: package.json devDependencies + scripts
**Status**: ✅ CLOSED (L3)

## 3. 安全相关

### Q8: v0.10.2 中 `execute` 事件是否仍存在？

**Question**: CVE-2025-64496 修复后，`{type: "execute"}` 事件是否被移除？
**Answer**: **[F] 仍然存在且未加任何保护**。Chat.svelte L752-765 使用 `new Function()` 执行 `data.code`，无用户确认、无来源验证、无沙盒。CVE-2025-64496 的修复可能仅针对 Direct Connections 的 origin 验证，而非 execute 事件本身。
**Evidence**: Chat.svelte L752-765 (完整源码)
**Status**: ✅ CLOSED (L3) — **结论：execute 事件仍是 CRITICAL 安全风险**

### Q9: iFrame sandbox 的当前配置

**Question**: v0.10.2 中 HTML 渲染 view 的 iFrame sandbox 属性是否已修改？是否修复了 `allow-same-origin` + `allow-scripts` 的组合问题？
**Why matters**: CVE-2026-45303 的修复验证。
**Current evidence**: CVE 记录显示在 v0.6.5 已修复，但具体修复方式未知。
**How to close**: 检查 HTML 渲染相关组件的 iFrame sandbox 属性。
**Status**: OPEN

## 4. 架构对齐类

### Q10: 前端 Message Tree 与后端 Chat DB 的映射

**Question**: 前端的 history Tree（parentId/childrenIds）如何映射到后端的数据库 schema？Tree 的哪些节点被持久化？
**Why matters**: 理解全栈数据模型一致性。
**Current evidence**: 仅了解前端 Tree 模型，后端 DB schema 未知（不在研究范围）。
**How to close**: 需要扩展到后端研究，检查数据库 migration 文件和 Chat API 的 request/response schema。
**Status**: OPEN (out of current scope)

### Q11: Direct Connections 的浏览器端实现

**Question**: Direct Connections 功能在前端的完整实现是什么？浏览器如何直接与 Ollama/OpenAI API 通信？
**Why matters**: 了解 Open WebUI 的隐私优先架构选择。
**Current evidence**: Web Search 显示 Direct Connections 存储 API keys 在 localStorage 并从浏览器直接调用模型 API。
**How to close**: 阅读 `src/lib/apis/ollama/index.ts` 和 `src/lib/apis/openai/index.ts`。
**Status**: OPEN

## 5. 研究流程说明

| Field | Value |
| --- | --- |
| **Total Open Questions** | 11 → **5 OPEN, 5 CLOSED, 1 PARTIALLY CLOSED** |
| **Closed by L3** | Q1 (Svelte 5), Q2 (Chat.svelte state), Q3 (22 event types), Q7 (Vitest+Cypress), Q8 (execute still exists) |
| **Partially Closed** | Q4 (Pyodide version confirmed, preload list pending) |
| **Still Open** | Q5 (Socket.IO vs SSE rationale), Q6 (single store file rationale), Q9 (iFrame sandbox current config), Q10 (DB mapping), Q11 (Direct Connections impl) |
| **Blockers for RoboThree** | 0 |
| **Requires backend study** | Q10 (DB mapping) |

## 6. How to Close — 行动计划

如果 GitHub 恢复可达，建议执行以下步骤关闭所有 OPEN 问题：

```bash
# 1. Clone repo
git clone https://github.com/open-webui/open-webui.git sources/open-webui
cd sources/open-webui
git checkout ecd48e2f718220a6400ecf49eafd4867a38feb10

# 2. Q1: Svelte version
cat package.json | grep '"svelte"'

# 3. Q2-Q3: Chat.svelte full analysis
cat src/lib/components/chat/Chat.svelte

# 4. Q4: Pyodide preload
cat src/lib/workers/pyodide.worker.ts

# 5. Q7: Tests
find src -name '*.test.*' -o -name '*.spec.*'
cat package.json | jq '.devDependencies | keys'

# 6. Q8-Q9: Execute events + iFrame sandbox
grep -r "execute" src/lib/components/chat/
grep -r "sandbox" src/lib/components/

# 7. Q11: Direct Connections
cat src/lib/apis/ollama/index.ts
cat src/lib/apis/openai/index.ts
```

当这些问题关闭后，`robothree-fit-analysis.md` 中的 `NEEDS_MORE_EVIDENCE` 项可以重新评估。
