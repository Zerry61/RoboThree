# L3 Deep-Dive #3: Skill / Plugin / MCP 扩展生态

> 选定的 L3 机制 #3：扩展性的核心。Scope：DESIGN_ONLY。

## 0. 入口与索引

| 维度 | 值 |
| --- | --- |
| **源码位置** | `src/skills/`, `src/plugins/`, `src/services/mcp/`, `src/commands.ts` |
| **已读文件** | `src/skills/bundledSkills.ts`（7,497B）, `src/services/mcp/MCPConnectionManager.tsx`（1,897B）, `src/services/mcp/channelAllowlist.ts`（2,847B）, `src/services/mcp/channelNotification.ts`（10,326B）, `src/services/mcp/channelPermissions.ts`（8,970B）, `src/services/mcp/elicitationHandler.ts`（10,166B）, `src/services/mcp/InProcessTransport.ts`（1,772B）, `src/services/mcp/SdkControlTransport.ts`（4,209B）, `src/services/mcp/envExpansion.ts`（1,047B）；partial: `src/skills/loadSkillsDir.ts`（34,245B）, `src/skills/mcpSkillBuilders.ts`（1,627B）, `src/skills/mcpSkills.ts`（4,504B）, `src/plugins/builtinPlugins.ts`（4,980B） |
| **HEAD** | `feb76f11` |

## 1. Skill 抽象：`Command = Skill`

### 1.1 统一抽象：`BundledSkillDefinition`

```text
src/skills/bundledSkills.ts:15-41

export type BundledSkillDefinition = {
  name: string
  description: string
  aliases?: string[]
  whenToUse?: string
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  isEnabled?: () => boolean
  hooks?: HooksSettings
  context?: 'inline' | 'fork'              // inline = same session; fork = new session
  agent?: string                           // use which agent
  files?: Record<string, string>           // reference files extract to disk
  getPromptForCommand: (
    args: string,
    context: ToolUseContext,
  ) => Promise<ContentBlockParam[]>
}
```

**设计洞察**：
1. **`files: Record<string, string>`** —— skill 可携带 reference files（如品牌指南、模板），**lazy extract** 到 disk
2. **`context: 'inline' | 'fork'`** —— inline 在主 session 跑，fork 启动新 session（隔离上下文）
3. **`agent?: string`** —— 指定用哪个 agentType 执行（worker / general / research / ...）
4. **`hooks?: HooksSettings`** —— skill 级别的 PreToolUse/PostToolUse hook
5. **`disableModelInvocation`** —— 模型不可调用，只用户可调用（防止 skill 自我递归）
6. **`userInvocable`** —— UI 中是否对用户显示
7. **`getPromptForCommand`** —— 实际生成 prompt content blocks 的函数（懒加载 content）

### 1.2 三类 Skill 来源

```text
src/skills/bundledSkills.ts       # bundled/registry-based
src/skills/loadSkillsDir.ts       # file-based (34KB)
src/skills/mcpSkillBuilders.ts    # MCP-sourced
src/skills/mcpSkills.ts           # MCP-sourced
```

#### 1.2.1 Bundled Skill (registry-based)

```text
src/skills/bundledSkills.ts

// 程序注册 (programmatic registration)
const bundledSkills: Command[] = []

export function registerBundledSkill(definition: BundledSkillDefinition): void {
  // 1. 如果有 files，提取到 disk
  //    （O_NOFOLLOW | O_EXCL safety, see §2）
  // 2. wrap getPromptForCommand 时 prepend baseDir prefix
  // 3. push Command into bundledSkills
}

export function getBundledSkills(): Command[] { return [...bundledSkills] }
```

#### 1.2.2 File-Based Skill (loadSkillsDir)

`loadSkillsDir.ts`（34KB）—— **核心 loader**，扫描：
- `.claude/skills/`（pro 隐藏）
- `<cwd>/.claude/skills/`
- `<additionalDirectories>/.claude/skills/`

每个 skill 是 `SKILL.md` + 必备 frontmatter（`name`, `description`, `allowedTools`, ...） + 可选 `files/` 目录。

**推断路径**（基于前置模块 + DI 模式）：
```text
loadSkillsDir():
  1. walk dirs
  2. read SKILL.md frontmatter
  3. validate: name format, no path traversal in files/
  4. extract reference files to bundle dir (O_NOFOLLOW)
  5. wrap as Command → push to file-based registry
```

#### 1.2.3 MCP-Sourced Skill

```text
src/skills/mcpSkillBuilders.ts (1,627B) — generators
src/skills/mcpSkills.ts (4,504B) — MCP skills integration
```

**MCP Skill = 把 MCP server 暴露的工具包成 Skill**：

```text
MCP server exposes:
  resources/list    → "skill:remote-help"
  tools/list        → "skill:rpc-call"
  
→ mcpSkillBuilders generates:
  Command { name, description, getPromptForCommand(args, ctx) {
    // ctx.tools has mcp tools available
    // inject MCP call into prompt
  }}
```

### 1.3 `Command` 类型（推断）

基于 `src/Tool.ts:12`: `import type { Command } from './commands.js'`，推测：

```ts
type Command = {
  type: 'prompt' | 'local' | 'local-jsx'  // 共 3 种
  name: string
  description: string
  aliases?: string[]
  hasUserSpecifiedDescription?: boolean
  allowedTools: string[]
  argumentHint?: string
  whenToUse?: string
  model?: string
  disableModelInvocation: boolean
  userInvocable: boolean
  contentLength: number
  source: 'bundled' | 'plugin' | 'file' | 'mcp'
  loadedFrom: 'bundled' | 'plugin' | '<dir>'
  hooks?: HooksSettings
  skillRoot?: string                       // if files extracted
  context: 'inline' | 'fork'
  agent?: string
  isEnabled?: () => boolean
  isHidden: boolean
  progressMessage: string
  getPromptForCommand: (args, ctx) => Promise<ContentBlockParam[]>
}
```

**`type: 'prompt' | 'local' | 'local-jsx'`**——3 种 command：
- `prompt` — 纯 prompt 注入
- `local` — 跑 shell 命令
- `local-jsx` — 跑 JSX UI 组件

### 1.4 `bundledSkills` 重要的安全模式（**RoboThree 应直接借鉴**）

```text
src/skills/bundledSkills.ts:131-206

extractBundledSkillFiles(skillName, files):
  // 1. 计算 safe dir: getBundledSkillExtractDir(skillName)
  //    → getBundledSkillsRoot() 含 per-process nonce
  // 2. writeSkillFiles(dir, files):
  //    3. by parent grouping → mkdir parent {recursive, mode:0o700}
  //    4. safeWriteFile(p, content) per file
  // 5. 捕获错误 → 返回 null（skill 仍可用，只是不带 base dir）

resolveSkillFilePath(baseDir, relPath):
  // 1. normalize(relPath)
  // 2. 拒绝 绝对路径
  // 3. 拒绝 path 包含 '..' (POSIX) 或 '..' (forward slash)
  // 4. return join(baseDir, normalized)

writeSkillFiles(dir, files):
  // Group by parent so each subtree mkdir'd once
  byParent = Map<parent, [filePath, content][]>
  for [relPath, content] in Object.entries(files):
    target = resolveSkillFilePath(dir, relPath)
    parent = dirname(target)
    byParent.get(parent).push([target, content])
  await Promise.all([...byParent].map(async ([parent, entries]) => {
    await mkdir(parent, {recursive, mode:0o700})
    await Promise.all(entries.map(([p, c]) => safeWriteFile(p, c)))
  }))

const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
const SAFE_WRITE_FLAGS =
  process.platform === 'win32'
    ? 'wx'
    : fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | O_NOFOLLOW

async function safeWriteFile(p, content) {
  const fh = await open(p, SAFE_WRITE_FLAGS, 0o600)  // ← owner only
  try { await fh.writeFile(content, 'utf8') }
  finally { await fh.close() }
}

function prependBaseDir(blocks, baseDir) {
  prefix = `Base directory for this skill: ${baseDir}\n\n`
  if blocks[0].type === 'text':
    return [{ type:'text', text: prefix + blocks[0].text }, ...rest]
  return [{ type:'text', text: prefix }, ...rest]
}
```

**安全设计 5 道防线**：

1. **Per-process nonce dir**（`getBundledSkillsRoot()` 注释说明）—— attacker 无法预测路径
2. **0o700 dir mode + 0o600 file mode**——即使 `umask=0`，owner-only
3. **`O_NOFOLLOW | O_WRONLY | O_CREAT | O_EXCL`** —— 拒绝 symlink 攻击、拒绝 race
4. **No `unlink+retry` on EEXIST**（注释明示"我们故意不 unlink+retry —— unlink 会跟随 symlink"）—— 防 race 中 symlink swap
5. **`O_NOFOLLOW` 仅在 final component**（注释"O_NOFOLLOW only protects the final component"）—— 防 path-traversal 而非 intermediate symlink

```ts
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
```

`O_NOFOLLOW` 常量在 POSIX fs 是合法常量，Node 类型缺省时降级为 0（allow follow）。**安全模式可借鉴**。

**RoboThree 借鉴价值**：
- 类似场景：plugin 目录、skill 缓存、临时工作区
- 借鉴**设计骨架**（5 道防线）而**不照搬实现**
- 现代 Rust `O_NOFOLLOW` 同名常量已稳定；OCaml 有 `O_NOFOLLOW` flags
- 若 RoboThree 接受借鉴设计，建议法律复核（`SKILL.md` 引用了一行"inspired by Anthropic security model"即可）

### 1.5 注意事项

⚠️ **Feature Flag 行为不一致**：bundledSkills 是**常驻代码**（无 `feature()` gate），但 `bundled/` 子目录的注册是**在 feature flag 内执行**。这意味着 skill 系统**总是 loaded**，但具体 skill 按 feature gate 启用。

⚠️ **cache & dedup 问题**：`extractBundledSkillFiles` 用 closure-local memoization（`extractionPromise ??= extract...`），但**全局 nonce** 在 `getBundledSkillsRoot()` 内——多 worker 共享 dir（不好）。

## 2. Plugin System

### 2.1 Source Map

```text
src/plugins/
├── builtinPlugins.ts (5KB)        # 内置插件（少量）
├── bundled/                       # bundled 插件

src/utils/plugins/
├── pluginLoader.ts (推测 ~10KB)   # plugin load from disk
└── (others)
```

### 2.2 工作机制（推断）

```text
src/plugins/builtinPlugins.ts

// 内置 plugins
const builtinPlugins = [plugin1, plugin2, ...]

// 这些可能注册：
//   - extra tools
//   - extra slash commands
//   - extra hook handlers
//   - extra MCP server specs
```

`src/utils/plugins/pluginLoader.ts`（被 `QueryEngine.ts:69` import）：

```text
QueryEngine.ts:69: import { loadAllPluginsCacheOnly } from './utils/plugins/pluginLoader.js'
```

**推断语义**：
- `loadAllPluginsCacheOnly` —— "cache only" 表示**只读 cache 不主动 reload**
- 推断：插件在 entrypoints/init.ts 一次性加载并 cache，QueryEngine 不重 load

**Plugin 装载范围**（推断）：
- 用户级：`<HOME>/.claude/plugins/`
- 项目级：`<cwd>/.claude/plugins/`
- 内置：`@claude-code-best/builtin-plugins/*`

**Plugin 接口**（未读但推断自 MCP/Skill 模式）：

```ts
type Plugin = {
  name: string
  version: string
  // contribution slots:
  tools?: Tool[]
  commands?: Command[]
  hooks?: HooksSettings
  mcpServers?: MCPServerConfig[]
  skills?: BundledSkillDefinition[]
  // lifecycle:
  onLoad?(ctx): void
  onUnload?(): void
}
```

⚠️ **NEEDS_MORE_EVIDENCE**：本次未深挖 `pluginLoader.ts`。结论待补。

## 3. MCP 生态

### 3.1 规模

| 文件 | 大小 | 角色 |
| --- | --- | --- |
| `src/services/mcp/client.ts` | 122,713 B | MCP 主客户端 |
| `src/services/mcp/auth.ts` | 88,873 B | OAuth/Token 认证 |
| `src/services/mcp/config.ts` | 51,258 B | MCP server 配置 |
| `src/services/mcp/channelNotification.ts` | 10,326 B | `notifications/permissions/decision-request` |
| `src/services/mcp/elicitationHandler.ts` | 10,166 B | MCP `-32042` URL elicitation |
| `src/services/mcp/channelPermissions.ts` | 8,970 B | channel 维度 permission rule |
| `src/services/mcp/SdkControlTransport.ts` | 4,209 B | SDK 控制 transport |
| `src/services/mcp/channelAllowlist.ts` | 2,847 B | channel 白名单 |
| `src/services/mcp/MCPConnectionManager.tsx` | 1,897 B | 连接管理 |
| `src/services/mcp/InProcessTransport.ts` | 1,772 B | 同进程 transport |
| `src/services/mcp/envExpansion.ts` | 1,047 B | env var expansion in MCP configs |
| `src/services/mcp/mcpStringUtils.ts` | (FAIL) | 字符串工具 |
| `src/services/mcp/headersHelper.ts` | (FAIL) | headers helper |
| `src/services/mcp/types.ts` | (未读) | 类型定义 |

**MCP 集成深度**：~310 KB 专门代码，是 Claude Code 第二大子系统（仅次于 query loop）。

### 3.2 Transport 类型

```text
InProcessTransport.ts (1.7KB)
  - 同进程 transport
  - 推测给 internal MCP server 用（如 RouterTool、CRS、computer-use-mcp）

SdkControlTransport.ts (4.2KB)
  - SDK 控制 bridge
  - 推测允许 SDK caller 拦截/redirect MCP messages
```

### 3.3 MCPConnectionManager

```text
src/services/mcp/MCPConnectionManager.tsx (1.9KB)

// connection lifecycle:
//   1. load MCP config (.mcp.json, settings)
//   2. spawn transport (stdio or http) per server
//   3. authenticate (auth.ts 88KB)
//   4. list tools/resources/prompts
//   5. expose via Tools in Options.mcpClients / mcpResources
//   6. handle notifications (permissions/decision-request, list_changed, etc.)
```

### 3.4 Channel-Based Permission

```text
src/services/mcp/
├── channelAllowlist.ts       (2.8KB) — which channels are allowed
├── channelPermissions.ts     (9KB)   — per-channel permission rules
└── channelNotification.ts    (10.3KB) — notifications/permissions/decision-request
```

**3 文件模式**：
- `channelAllowlist` — channel 注册允许
- `channelPermissions` — 每个 channel 的 allow/deny/ask rule
- `channelNotification` — channel 维度的 MCP `notifications/permissions/decision-request` 实现

**MCP 标准** 定义 `notifications/permissions/decision-request` 用于 server 主动询问 client permission 决策。本仓库在 MCP 标准之上加了 **channel 维度**（推测 channel = user/project/session 维度）。

**RoboThree 借鉴**：
- Channel 概念是 user-facing permission 维度补充（Row Level Security 类似）
- 借鉴设计不照搬实现

### 3.5 Elicitation Handler

```text
src/services/mcp/elicitationHandler.ts (10KB)
```

**MCP `-32042` URL elicitation** —— MCP 错误码 `-32042` 用于 server 请求 user input（e.g., OAuth URL）。

```text
handleElicitation(serverName, params: ElicitRequestURLParams, signal: AbortSignal)
  → Promise<ElicitResult>
```

- `ToolUseContext.handleElicitation` 作为 callback 注入（`Tool.ts:202-206`）
- REPL: queue-based UI path
- Print/SDK: `structuredIO.handleElicitation` 委托

### 3.6 envExpansion.ts

```text
src/services/mcp/envExpansion.ts (1KB)
```

`envExpansion` —— MCP config 中的 env var 展开（`${HOME}`、`${USER}` 等）。

### 3.7 auth.ts (88KB)

`auth.ts`（未深入读）是 MCP server OAuth/Token 认证的大模块。88KB 暗示支持：
- OAuth 2.0 Authorization Code + PKCE
- OAuth 2.1 + Dynamic Client Registration
- Custom token header
- Cookie 认证
- AWS Sigv4 (Bedrock MCP)
- GCP token (Vertex MCP)

**NEEDS_MORE_EVIDENCE**：未深入读 auth.ts。

## 4. Skill + MCP 桥接

```text
src/skills/mcpSkillBuilders.ts (1.6KB)
src/skills/mcpSkills.ts (4.5KB)
```

**机制**：MCP server 暴露的 tools/resources/prompts 包装成 Skill，让用户用 `/<skill-name>` 调用 MCP 能力。

```ts
// mcpSkillBuilders.ts 推断：

buildSkillFromMcpServer(serverName, serverInfo, tools): Skill {
  return {
    name: `mcp:${serverName}`,
    description: serverInfo.description,
    allowedTools: tools.map(t => `mcp__${serverName}__${t.name}`),
    getPromptForCommand: async (args, ctx) => {
      // 注入 server 描述 + tools 描述 + args
      return [{ type: 'text', text: formatMcpServerPrompt(serverName, tools, args) }]
    }
  }
}
```

**RoboThree 借鉴**：
- MCP-sourced skill 桥接 = 把 MCP server 包成 user-invocable skill
- 名称采用 `mcp:<server>` namespace

## 5. 多 Provider 抽象 @ant/model-provider

```text
package @ant/model-provider:
  EMPTY_USAGE: NonNullableUsage
  NonNullableUsage<T>
  // (other types inferring)
```

**统一 4 provider 的 usage 累加**：
- Anthropic SDK 返回 `usage: { input_tokens, output_tokens, ... }` (optional)
- Bedrock SDK 返回不同 schema
- Vertex SDK 另一 schema
- Foundry SDK 又另一 schema

`NonNullableUsage` 抽象所有 field 为 non-nullable，便于 reducer 累加。`EMPTY_USAGE` 是初始 reset。

**RoboThree 借鉴**：
- 多 provider 抽象是必须的：openai / anthropic / bedrock / vertex schema 都不同
- `NonNullableUsage` 设计让 reducer 简单

## 6. Hop Evidence 摘要（skill / MCP）

| Hop | 描述 | File | Lines |
| --- | --- | --- | --- |
| S-H1 | Skill registry init | `src/skills/bundledSkills.ts:99` `bundledSkills.push(command)` | — |
| S-H2 | bundledSkills.ts registerBundledSkill | `src/skills/bundledSkills.ts:53` | — |
| S-H3 | extractBundledSkillFiles | `src/skills/bundledSkills.ts:131` | — |
| S-H4 | safeWriteFile O_NOFOLLOW | `src/skills/bundledSkills.ts:186` | — |
| S-H5 | resolveSkillFilePath | `src/skills/bundledSkills.ts:196` | — |
| S-H6 | loadSkillsDir (file) | `src/skills/loadSkillsDir.ts` 34KB | 全文（未读完） |
| S-H7 | mcpSkillBuilders | `src/skills/mcpSkillBuilders.ts` 1.6KB | 全文 |
| M-H1 | MCPConnectionManager init | `src/services/mcp/MCPConnectionManager.tsx` 1.9KB | — |
| M-H2 | auth flow | `src/services/mcp/auth.ts` 88KB | — |
| M-H3 | ChannelPermission check | `src/services/mcp/channelPermissions.ts` 9KB | — |
| M-H4 | notification dispatch | `src/services/mcp/channelNotification.ts` 10KB | — |
| M-H5 | elicitation handler | `src/services/mcp/elicitationHandler.ts` 10KB | — |
| M-H6 | InProcess transport | `src/services/mcp/InProcessTransport.ts` 1.7KB | — |
| M-H7 | SdkControl transport | `src/services/mcp/SdkControlTransport.ts` 4.2KB | — |

## 7. Security 维度

### 7.1 Skill 文件提取安全（已 §1.4 详述）

5 道防线机制 RoboThree **必须**借鉴（design-only），适用于任何"从 plugin/skill 写文件到 host FS"场景。

### 7.2 MCP Channel Permission

MCP 流程可能引入未授权 server（user install MCP server via `claude mcp add`），需要：
- Channel 维度 allowlist（决定哪些 channel 注册）
- Channel 维度 permission rule（每个 channel 的 allow/deny）
- Channel 维度的 ask rule（需用户确认）

**RoboThree 借鉴**：MCP server registration 必须有 allowlist，permission 必须 per-server 可配置。

### 7.3 MCP Server OAuth 风险

`auth.ts` 88KB 暗示支持 OAuth 2.0 + 复杂流程。OAuth redirect 到 MCP server URL 是常见 attack vector——必须检查 state 参数、CSP headers。

### 7.4 Computer-Use MCP (Chicago MCP) 风险

```text
packages/@ant/computer-use-mcp     # Computer-Use MCP server
packages/@ant/computer-use-input   # Input bindings
packages/@ant/computer-use-swift   # Swift impl
```

**Computer Use**——控制 mouse/keyboard 模拟用户操作。攻击面：
- Clickjacking-like：如果模型被诱骗点击危险按钮
- Screen content leakage：MCP server 可能 screenshot 屏幕并外传

RoboThree **DEFER** Computer Use 类功能（直到 trusted execution model 完善）。

## 8. 对 RoboThree 的结论（5 类）

| 模式 | 类别 | 理由 |
| --- | --- | --- |
| **`Command = Skill` 统一抽象** | **ADOPT 设计** | bundled/loaded/mcp 三源一抽象 |
| **`BundledSkillDefinition.files: Record<string,string>` + lazy extract** | **ADOPT 设计** | reference files 是 skill 的关键能力 |
| **`context: 'inline' \| 'fork'` skill 上下文控制** | **ADOPT 直接** | 简单布尔值，借鉴简单 |
| **`agent?: string` 在 skill 中** | **ADOPT 设计** | 让 skill 选择 agent type |
| **O_NOFOLLOW \| O_EXCL 安全提取 5 道防线** | **ADOPT 设计骨架** | 借鉴 5 层防御模式，不照搬实现；建议 LEGAL_REVIEW_REQUIRED |
| **`prependBaseDir` skill 提示前缀** | **ADOPT 直接** | 简单 string prepend |
| **`disableModelInvocation` 防止自我递归** | **ADOPT 直接** | skill 安全必须项 |
| **`hooks?: HooksSettings` skill 级别 hook** | **ADOPT 直接** | skill 自带 hook |
| **MCP channel-based permission 3 文件模式** | **ADAPT 严重** | channel 概念可借鉴；具体实现依 RoboThree 自定 |
| **MCP `notifications/permissions/decision-request` 标准实现** | **ADAPT 严重** | 必须按 MCP 标准 |
| **MCP InProcessTransport** | **ADOPT 设计概念** | in-process MCP 给内部 server 用 |
| **MCP `elicitationHandler` -32042 处理** | **ADOPT 直接** | MCP 标准需实现 |
| **MCP `envExpansion` 配置展开** | **ADOPT 直接** | 简单功能 |
| **MCP OAuth / auth.ts 88KB** | **NEEDS_MORE_EVIDENCE** | 未深入读，需后续研究 |
| **MCP-sourced Skill 桥接（`mcpSkillBuilders`）** | **ADOPT 设计** | MCP → Skill 包装 |
| **Plugin interface** | **NEEDS_MORE_EVIDENCE** | 未深挖 pluginLoader |
| **`@ant/model-provider` 多 Provider 抽象** | **ADOPT 设计概念** | RoboThree 至少有 openai/anthropic 两个 |
| **`NonNullableUsage` reducer 友好** | **ADOPT 直接** | 简单通用 |
| **Computer-Use MCP / Chicago** | **REJECT** | attack surface 过大，RoboThree 不实现 |
| **`tengu_*` / `CLAUDE_CODE_*` 内代号** | **REJECT** | Anthropic 内部命名 |

## 9. 总结

✅ **`Command = Skill` 抽象 + 5 道防线安全模式 + MCP 标准化 + 多 Provider abstract** —— 4 个独立维度都 ADOPT/ADOPT/ADAPT。
⚠️ **MCP auth 88KB** —— NEEDS_MORE_EVIDENCE（未深入）。
❌ **Computer-Use** —— REJECT。

详见 [robothree-fit-analysis.md §Skill/Plugin/MCP](robothree-fit-analysis.md)。
