# skill-plugin-mcp.md — Skill / Plugin / Hook / MCP 系统

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 1. Skill 系统

### 1.1 Skill 模型

Skills 通过 `AgentContext.skills` 注入到 Agent 的系统提示中：

```python
class Skill:
    name: str                     # 唯一名称
    content: str                  # 技能内容（指令）
    type: str                     # "repo" | "knowledge" | "tool"
    trigger: list[str] | None     # 触发词（knowledge 类型）
    source: str                   # 来源标识
    is_agentskills_format: bool   # 是否 AgentSkills 格式
    disable_model_invocation: bool # 是否禁止模型直接调用
```

证据 — [agent_context.py](openhands-sdk/openhands/sdk/context/agent_context.py)

### 1.2 Skill 来源与加载

| 来源 | 加载函数 | 位置 |
| --- | --- | --- |
| 用户技能 | `load_user_skills()` | `~/.openhands/skills/` |
| 项目技能 | `load_project_skills()` | `<project>/.openhands/skills/` |
| 公共技能 | `load_public_skills()` | `<project>/.openhands/public-skills/` |
| 目录技能 | `load_skills_from_dir()` | 任意目录 |
| Plugin 技能 | `plugin.add_skills_to()` | Plugin 包内 |

### 1.3 Skill 激活机制

两种激活方式：

1. **知识触发**：knowledge 类型 Skill 在用户消息匹配 `trigger` 词时激活，内容作为 `extended_content` 注入到 MessageEvent。[F]
2. **AgentSkills 调用**：通过 `InvokeSkillTool` 让 Agent 显式调用 Skill。[F]

证据 — [local_conversation.py:1666-1691](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L1666-L1691)

### 1.4 动态上下文注入

`AgentContext.get_user_message_suffix()` 在每次用户消息时检查匹配的知识技能：
- 已激活的技能不会重复注入（`skip_skill_names`）
- 激活记录保存在 `ConversationState.activated_knowledge_skills`

## 2. Plugin 系统

### 2.1 Plugin 模型

Plugin 是一个自包含的扩展包，Manifest 格式：

```python
class Plugin:
    manifest: PluginManifest    # name, version, description
    skills: list[Skill]         # 技能贡献
    mcp_config: dict            # MCP 服务器配置
    hooks: HookConfig           # Hook 配置
    agents: list[AgentDefinition] # Agent 定义
```

证据 — [plugin/](openhands-sdk/openhands/sdk/plugin/)

### 2.2 Plugin 来源

```python
class PluginSource:
    source: str  # "github:owner/repo" | "git+https://..." | "/local/path"
    ref: str     # branch/tag/commit (或 ${SECRET_VAR} 引用)
    repo_path: str # monorepo 子路径
```

### 2.3 Plugin 加载与合并

Plugin 在 `_ensure_plugins_loaded()` 中惰性加载：

1. **Fetch**：从 Github / Git / 本地路径拉取 Plugin
2. **Resolve**：将 ref 解析为 commit SHA（确定性恢复）
3. **Load**：加载 `Plugin.load(path)` 读取 manifest
4. **Merge**：
   - Skills：按名称覆盖（后加载者胜）
   - MCP Config：按 key 覆盖（后加载者胜）
   - Hooks：全部连接（concat）
   - Agents：全部添加

5. **Ambient plugins**：自动发现已安装的 + 本地项目/用户的 plugins

证据 — [local_conversation.py:822-1114](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L822-L1114)

### 2.4 公开 Marketplace

- 默认 marketplace：`OpenHands/extensions`
- 自动加载 uv/deno 等包管理工具技能
- `MarketplaceRegistry` 管理注册和自动加载规则

## 3. Hook 系统

### 3.1 Hook 类型

```python
class HookConfig:
    session_start: list[HookSpec]   # 会话启动
    session_end: list[HookSpec]     # 会话结束
    pre_action: list[HookSpec]      # 工具执行前（可拦截）
    post_action: list[HookSpec]     # 工具执行后
    pre_user_message: list[HookSpec] # 用户消息前
    post_user_message: list[HookSpec] # 用户消息后
    stop: list[HookSpec]            # Agent 完成时（可拒绝停止）
```

### 3.2 Hook 执行

通过 `create_hook_callback()` 创建包装的事件回调链：

- Pre-action hooks 可以返回 `blocked_reason` 阻止工具执行
- Stop hooks 可以拒绝 Agent 的 FINISHED 状态，注入反馈使 Agent 继续
- Hook 持久化目录支持跨会话状态

证据 — [local_conversation.py:1099-1114](openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L1099-L1114)

### 3.3 Hook 与 Event Callback 集成

Hook 处理器包装原始的 `on_event` 回调：
```
raw_on_event = create_hook_callback(hook_config, ..., original_callback, ...)
on_event = _tree_stamping(_rules_injecting(raw_on_event))
```

## 4. MCP 系统

### 4.1 MCP 配置

Agent 通过 `mcp_config: dict[str, MCPServer]` 配置 MCP 服务器：

```python
class MCPServer:
    command: str       # 启动命令（如 "uvx"）
    args: list[str]    # 参数（如 ["mcp-server-fetch"]）
    env: dict[str, str] # 环境变量
```

证据 — [mcp/config.py](openhands-sdk/openhands/sdk/mcp/config.py)

### 4.2 MCP 工具集成

- `MCPClient` 连接 MCP 服务器，提供工具列表
- `MCPToolDefinition` 继承 `ToolDefinition`，使用 MCP `inputSchema`
- `create_mcp_tools()` 从 MCP 配置创建工具集合
- MCP 工具变量扩展：`${VAR}` 和 `${VAR:-default}` 语法支持

证据 — [mcp/tool.py](openhands-sdk/openhands/sdk/mcp/tool.py)

### 4.3 MCP 工具提供者

`MCPToolProvider` 协议定义 MCP 工具创建接口：
- `DefaultMCPToolProvider` — 标准 MCP 客户端实现
- 可在构造 Conversation 时替换

## 5. RoboThree 启示

| 机制 | 评价 | 建议 |
| --- | --- | --- |
| Skill 系统 | 轻量但有限（纯文本指令注入），缺少版本化和依赖管理 | ADAPT — 可借鉴触发机制，但需更强的 Skill 结构 |
| Plugin 系统 | 设计优雅：多来源 + 确定性解析 + 合并语义清晰 | ADOPT — 插件来源解析模式值得直接借鉴 |
| Hook 系统 | 完整的事件拦截链，stop hook 可拒绝 Agent 停止 | ADAPT — 事件拦截链设计 + 可拒绝停止的模式 |
| MCP 集成 | 完整的 MCP Client + Tool wrapping + 变量扩展 | ADOPT — MCP 工具包装模式可直接参考 |
