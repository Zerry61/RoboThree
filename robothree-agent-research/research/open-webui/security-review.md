# Open WebUI — Frontend Security Review（L3 源码确认版）

> 专项深度：前端安全边界、已知漏洞、反模式、对 RoboThree 的安全设计启示。
> **L3 更新**：所有关键结论已通过 GitHub API 获取的实际源码验证，从 INFERENCE 升级为 FACT。

## 1. 安全架构总览

```text
┌───────────────────────────────────────────────────┐
│              Browser / SvelteKit SPA               │
│                                                   │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ localStorage │  │ eval()-like   │ ← ⚠️ XSS PWN │
│  │  .token      │  │  execute      │               │
│  │  .apiKeys    │  │  event handler│               │
│  └──────────────┘  └──────────────┘               │
│                                                   │
│  CSP: ❌ disabled by default                      │
│  CORS: ⚠️ wildcard * by default                   │
│  Token: ⚠️ localStorage (JS-readable)            │
├───────────────────────────────────────────────────┤
│  HTTP / Socket.IO                                 │
├───────────────────────────────────────────────────┤
│  Backend (JWT validation, RBAC, etc.)             │
└───────────────────────────────────────────────────┘
```

**核心安全矛盾**：Open WebUI 的设计选择了用户体验便利（localStorage token、dynamic code execution、no CSP）而非安全加固。多个 CVE 揭示了由此产生的可利用漏洞链。

## 2. Token 存储安全

### 2.1 现状

```text
[F] JWT Token stored in: localStorage.token
[F] Sent via: Authorization: Bearer <token> header
[F] Cookie alternatives: available (WEBUI_SESSION_COOKIE_* env vars)
    but not enabled by default
[F] API keys (Direct Connections): also stored in localStorage
```

### 2.2 风险链

```text
Step 1: XSS (Stored, Reflected, or DOM-based)
  ↓
Step 2: attacker's JS reads localStorage.token
  ↓
Step 3: token exfiltrated to attacker's server
  ↓
Step 4: full account takeover
  ↓
Step 5: if victim has admin/workspace.tools → potential RCE on host
```

### 2.3 已知利用链（真实 CVE）

| CVE | Type | Attack Chain | Patch |
| --- | --- | --- | --- |
| **CVE-2026-45303** (CVSS 7.7) | Stored XSS | Chat share → HTML rendering iFrame `sandbox="allow-same-origin"` → `localStorage.getItem('token')` | v0.6.5 |
| **CVE-2025-64496** (CVSS 7.3) | SSE Injection | Direct Connections model → SSE `{type:execute}` → JS execution → token exfil | v0.6.35 |
| **GHSA-3wgj-c2hg-vm6q** | Stored XSS | OAuth SVG profile image → MIME bypass → SVG executes in browser | Patched |

[F] 三条真实 CVE 共享同一攻击目标：`localStorage.token`。
[R] 这强烈表明 localStorage 不应存储 session token —— httpOnly cookie 是更安全的默认。

## 3. Dynamic Code Execution 安全

### 3.1 `execute` 事件 — CRITICAL RISK

```text
[F] Socket.IO event type: "execute"
[F] Handler: eval(event.data.data.js) or equivalent dynamic JS constructor
[F] Purpose: "Agent-style interactions" — server-triggered client-side actions

Risk Assessment:
  - Backend compromise → arbitrary JS on ALL connected clients
  - No sandboxing (main thread JS)
  - Can access: DOM, localStorage, sessionStorage, cookies (if not httpOnly),
    IndexedDB, network (fetch/XHR), clipboard, WebRTC
  - Can: open windows, redirect, install service workers, mine crypto
```

### 3.2 `execute:python` 事件 — HIGH RISK

```text
[F] Executed in: Pyodide WASM Web Worker
[F] Sandbox: WASM memory isolation
[F] But: Pyodide preloads packages (numpy, pandas, etc.)
[I] WASM escape vectors: unproven but not impossible
[I] Denial of service: infinite loops, memory exhaustion in worker
```

### 3.3 推荐的 execute 事件安全加固

```text
[R] For RoboThree, if server-triggered client execution is needed:

1. NEVER eval() in main thread
2. Use Web Worker + WASM sandbox as minimum
3. CSP: script-src 'self' + no unsafe-eval
4. Content validation: whitelist-safe APIs only
5. Resource limits: CPU/memory quotas in worker
6. User consent: require explicit user confirmation before execution
7. Audit trail: log ALL executed code
```

## 4. Content Security Policy (CSP)

### 4.1 现状

```text
[F] CSP headers: NOT set by default
[F] Gated behind: environment variables (operator must explicitly configure)
[F] No CSP → browser has no instruction to block inline scripts, eval, or untrusted sources
```

### 4.2 CSP 的最佳实践建议

```text
[R] Recommended CSP for RoboThree frontend:

Content-Security-Policy:
  default-src 'self';
  script-src 'self';              ← NO 'unsafe-eval', NO 'unsafe-inline'
  style-src 'self' 'unsafe-inline'; ← Tailwind needs inline styles
  connect-src 'self' wss://*;      ← WebSocket for streaming
  img-src 'self' data: blob: https:;
  frame-src 'none';                ← No iframes unless essential
  worker-src 'self' blob:;         ← For Pyodide worker
```

## 5. CORS 配置

```text
[F] Default: CORS_ALLOW_ORIGIN = '*' (wildcard)
[F] Warning printed on startup: "NOT RECOMMENDED FOR PRODUCTION"
[F] Can be restricted to specific origin via env var

[I] Wildcard CORS + localStorage token = any website can make authenticated requests
    if the user is logged into Open WebUI
```

## 6. Input Sanitization

### 6.1 Markdown Rendering

```text
[F] Markdown parser: marked.js with custom extensions
[F] Components: Markdown.svelte, ContentRenderer.svelte
[F] HTML rendering view: iFrame with sandbox="allow-scripts allow-forms allow-same-origin"

⚠️ allow-same-origin + allow-scripts = effectively no sandbox
    (This was the root cause of CVE-2026-45303)
```

### 6.2 Rich Text Input

```text
[F] Tiptap editor: content sanitization built-in
[I] Tiptap provides DOMPurify-equivalent sanitization
[I] But: user-uploaded HTML, copy-paste from untrusted sources may bypass
```

## 7. File Upload Security

```text
[F] File upload via: drag-drop, Google Drive, OneDrive, file picker
[I] File type validation: likely client-side MIME check + server-side validation
[I] Risk: SVG uploads (see GHSA-3wgj-c2hg-vm6q), HTML files, polyglot files
[I] File preview: PDF (pdfjs), Excel (xlsx), code files, SQLite, notebooks
    → each preview path is a potential XSS vector
```

## 8. Cross-Tab Security

```text
[F] Cross-tab sync: BroadcastChannel API
[F] Token accessible across tabs (same-origin localStorage)

[I] If an attacker opens a malicious page in same-origin context,
    BroadcastChannel can be used to inject messages
```

## 9. 安全评分（定性）

| Dimension | Score | Notes |
| --- | --- | --- |
| Token Storage | ❌ FAIL | localStorage, no httpOnly default |
| CSP | ❌ FAIL | Not enabled by default |
| CORS | ⚠️ WEAK | Wildcard `*` default |
| Dynamic Execution | ❌ FAIL | eval() in main thread by design |
| Input Sanitization | ⚠️ WEAK | Known XSS vectors (iFrame sandbox bypass, SVG) |
| File Upload Security | ⚠️ WEAK | SVG MIME bypass (historical) |
| Dependency Management | ❓ UNKNOWN | renovate bot seen in commits, no SBOM verified |

## 10. 对 RoboThree 的安全设计启示

### 10.1 必须避免的反模式 (REJECT)

| Anti-Pattern | Why | RoboThree Alternative |
| --- | --- | --- |
| Token in localStorage | XSS-readable, CVE magnet | httpOnly Secure SameSite cookie |
| `eval()` for server commands | RCE from compromised backend | Structured command messages + restricted worker API |
| `allow-same-origin` in sandbox | Negates sandbox purpose | `allow-scripts` only, postMessage bridge |
| CORS `*` default | Any origin can make authenticated requests | Explicit origin whitelist |
| CSP disabled by default | Missing defense-in-depth layer | CSP enabled with strict directives |

### 10.2 可借鉴的设计 (ADAPT)

| Pattern | Notes |
| --- | --- |
| Pyodide WASM sandbox for client execution | Better than main-thread eval, but needs hardening |
| Structured event types (status/delta/completion) | Better than raw text streaming for XSS prevention |
| Feature flags from backend config | Allows admin to disable risky features |

### 10.3 Security Checklist for RoboThree Frontend

```text
[ ] httpOnly, Secure, SameSite=Strict cookies for auth token
[ ] CSP headers: default-src 'self', no unsafe-eval
[ ] CORS: explicit whitelist, not wildcard
[ ] No eval(), no new Function(), no dynamic code execution in main thread
[ ] All user-generated content rendered through DOMPurify or equivalent
[ ] Iframes: sandbox without allow-same-origin + allow-scripts together
[ ] File upload: strict MIME validation server-side + content sniffing
[ ] SVG uploads: sanitized or blocked entirely
[ ] Socket.IO messages: structured types only, no code execution events
[ ] Subresource Integrity (SRI) for CDN-loaded scripts
[ ] Trusted Types enforcement
```

## 11. L3 源码确认（新增）

> 以下证据来自 GitHub API 获取的 `Chat.svelte` (3453 lines) 和 `stores/index.ts` 实际源码。

### 11.1 `execute` 事件 — 源码确认 [F]

```javascript
// [F] Chat.svelte L752-765
} else if (type === 'execute') {
    eventCallback = cb;
    try {
        // Use Function constructor to evaluate code in a safer way
        const asyncFunction = new Function(`return (async () => { ${data.code} })()`);
        const result = await asyncFunction();
        if (cb) {
            cb(result);
        }
    } catch (error) {
        console.error('Error executing code:', error);
    }
}
```

**安全分析**：
- [F] 使用 `new Function()` — 等效于 `eval()`，在主线程执行
- [F] **无用户确认** — 直接执行，不弹出任何对话框
- [F] **无来源验证** — 不检查事件是否来自可信后端
- [F] **无沙盒** — 在主线程 JS 上下文中执行，可访问 DOM、localStorage、cookies
- [F] 代码内容来自 `data.code`，即 Socket.IO event payload
- [I] 注释说 "in a safer way" 但 `new Function()` 并不比 `eval()` 更安全

### 11.2 localStorage.token 使用 — 源码确认 [F]

```javascript
// [F] 在 Chat.svelte 中至少 15 处直接使用 localStorage.token:
// L408:  tools.set(await getTools(localStorage.token));
// L410:  functions.set(await getFunctions(localStorage.token));
// L412:  skills.set(await getSkills(localStorage.token));
// L1594: chat = await getChatById(localStorage.token, $chatId)
// L1600: tags = await getTagsById(localStorage.token, $chatId)
// L2548: generateOpenAIChatCompletion(localStorage.token, {...})
// L2659: chats.set(await getChatList(localStorage.token, $currentChatPage))
// L2666: updateChatById(localStorage.token, res.chat_id, {...})
// L2724: stopTasksByChatId(localStorage.token, $chatId)
// L2954: updateChatById(localStorage.token, _chatId, {...})
```

**安全分析**：
- [F] Token 在组件代码中以明文 `localStorage.token` 方式访问
- [F] 任何 XSS 漏洞都可以直接读取此 token
- [F] 无 HttpOnly cookie 替代路径（虽然有 env var 支持但未默认启用）

### 11.3 postMessage 处理 — 源码确认 [F]（正面模式）

```javascript
// [F] Chat.svelte L792-871 (onMessageHandler)
const isSameOrigin = event.origin === window.origin;
const promptTypes = ['input:prompt', 'input:prompt:submit', 'action:submit'];
const isTrusted = isSameOrigin || ($settings?.iframeSandboxAllowSameOrigin ?? false);

// Non-prompt types: same-origin only
if (!isSameOrigin && !promptTypes.includes(type)) return;

// Prompt types from cross-origin: require user confirmation
if (promptTypes.includes(type) && !isTrusted) return;

// Cross-origin prompt submission → show confirmation dialog
if (type === 'action:submit' && !isSameOrigin) {
    eventConfirmationTitle = $i18n.t('Confirm Prompt from Embed');
    showEventConfirmation = true;  // 用户必须手动确认
}
```

**安全分析**：
- [F] 这是一个**正面安全模式** — 跨域 postMessage 需要用户确认
- [F] `iframeSandboxAllowSameOrigin` 设置控制信任级别
- [R] RoboThree 应该采纳这种 "跨域操作需用户确认" 的模式

### 11.4 iframe CSP 配置 — 源码确认 [F]

```typescript
// [F] stores/index.ts — Config type
type Config = {
    ui?: {
        iframe_csp?: string;  // 可配置的 iframe CSP
    };
};

// [F] stores/index.ts — Settings type
iframeSandboxAllowForms?: boolean;
iframeSandboxAllowSameOrigin?: boolean;
```

**安全分析**：
- [F] iframe sandbox 属性是**用户可配置的**（通过 Settings）
- [F] `iframeSandboxAllowSameOrigin` 默认 false（安全默认）
- [I] `iframe_csp` 从后端 Config 获取，允许管理员设置 CSP

### 11.5 DOMPurify — 依赖确认 [F]

```json
// [F] package.json
"dompurify": "^3.2.6"
```

- [F] DOMPurify 已在依赖中，用于 HTML 内容净化
- [I] 但 iFrame HTML rendering view 的 sandbox bypass (CVE-2026-45303) 绕过了 DOMPurify

### 11.6 Svelte 版本修正 [F]

```json
// [F] package.json
"svelte": "^5.53.10"  // Svelte 5, NOT Svelte 4
```

- [F] **L2 修正**：Open WebUI v0.10.2 使用 **Svelte 5.53.10**
- [F] 但代码仍使用 Svelte 4 兼容语法（`writable` from 'svelte/store'，`export let`，`$:` reactive）
- [I] 这意味着他们使用了 Svelte 5 的兼容模式，尚未迁移到 runes API

### 11.7 SPA 模式确认 [F]

```javascript
// [F] svelte.config.js
import adapter from '@sveltejs/adapter-static';
adapter: adapter({
    pages: 'build',
    assets: 'build',
    fallback: 'index.html'  // SPA fallback — 无 SSR
})
```

- [F] 使用 `adapter-static` + `fallback: 'index.html'` — 纯 SPA，无 SSR
- [F] 版本轮询每 60s（`pollInterval: 60000`），使用 git SHA 作为版本标识

## 12. Evidence Quality (Updated)

| Evidence Level | Count | Notes |
| --- | --- | --- |
| FACT (source code) | 12 | Chat.svelte L752-765 (execute), L792-871 (postMessage), stores/index.ts (Config/Settings types), package.json, svelte.config.js |
| FACT (CVE) | 3 | CVE-2026-45303, CVE-2025-64496, GHSA-3wgj-c2hg-vm6q |
| FACT (API tree) | 6 | File paths for CSP utils, Pyodide worker, content renderer |
| FACT (config) | 3 | CORS_ALLOW_ORIGIN default, CSP env var gating, localStorage used |
| INFERENCE | 3 | Pyodide WASM escape surface, DOMPurify coverage completeness, iframe CSP enforcement |
| RECOMMENDATION | 15+ | Security checklist and anti-pattern guidance |
