# source-map.md — OpenHands Software Agent SDK 源码地图

> Commit: `4fe565663af2b4f1130a6e0dac7566b002bfe9b4`

## 顶层目录

```
software-agent-sdk/
├── openhands-sdk/           # 核心 SDK
├── openhands-tools/         # 内置工具实现
├── openhands-workspace/     # 工作区后端
├── openhands-agent-server/  # Agent Server (FastAPI)
├── examples/                # 使用示例
├── tests/                   # 测试
├── scripts/                 # 构建/发布脚本
├── pyproject.toml           # uv workspace 配置
└── uv.lock                  # 依赖锁定
```

## openhands-sdk/ 详细地图

```
openhands-sdk/openhands/sdk/
├── __init__.py                    # 公共 API 导出（60+ 符号）
├── agent/
│   ├── __init__.py
│   ├── agent.py                   # ★ Agent 主循环（step/astep/init_state）
│   ├── base.py                    # ★ AgentBase 抽象（工具初始化、prompt、验证）
│   ├── response_dispatch.py       # LLM 响应分类与分发（TOOL_CALLS/CONTENT/EMPTY）
│   ├── parallel_executor.py       # 并行工具执行器
│   ├── critic_mixin.py            # Critic 混入（实验性）
│   ├── acp_agent.py               # ACP 协议 Agent
│   ├── acp_models.py              # ACP 数据模型
│   └── utils.py                   # LLM 消息准备/工具调用解析/参数修复
├── conversation/
│   ├── __init__.py
│   ├── base.py                    # ★ BaseConversation（公共接口 + 回调组合）
│   ├── conversation.py            # ★ Conversation 工厂（Local vs Remote）
│   ├── impl/
│   │   ├── local_conversation.py  # ★ LocalConversation（run/arun/send_message/fork）
│   │   └── remote_conversation.py # RemoteConversation（WebSocket 客户端）
│   ├── state.py                   # ★ ConversationState + ConversationExecutionStatus
│   ├── event_store.py             # EventLog（文件后端事件存储）
│   ├── events_list_base.py        # EventsListBase（惰性事件加载）
│   ├── stuck_detector.py          # StuckDetector（死循环检测）
│   ├── cancellation.py            # CancellationToken
│   ├── secret_registry.py         # 密钥注册表
│   ├── persistence_const.py       # 持久化常量
│   ├── fifo_lock.py               # FIFO 可重入锁
│   └── types.py                   # 类型定义
├── event/
│   ├── __init__.py
│   ├── base.py                    # ★ Event / LLMConvertibleEvent（事件基类+树结构）
│   ├── llm_convertible/
│   │   ├── action.py              # ActionEvent
│   │   ├── observation.py         # ObservationEvent
│   │   ├── message.py             # MessageEvent
│   │   ├── system.py              # SystemPromptEvent
│   │   └── reasoning_utils.py     # 推理工具
│   ├── types.py                   # EventID / SourceType
│   ├── condenser.py               # Condensation 事件
│   ├── conversation_error.py      # ConversationErrorEvent
│   ├── conversation_state.py      # ConversationStateUpdateEvent
│   ├── user_action.py             # UserRejectObservation / InterruptEvent
│   └── ...
├── tool/
│   ├── __init__.py
│   ├── schema.py                  # ★ Action / Observation 基类 + Schema 工具
│   ├── spec.py                    # Tool Spec（用户配置）
│   ├── tool.py                    # ★ ToolDefinition / ToolAnnotations / ExecutableTool
│   ├── registry.py                # 工具注册/解析/is_tool_usable
│   ├── defaults.py                # 默认工具名称
│   ├── builtins/                  # 内置工具（FinishTool, ThinkTool, VisionInspectTool）
│   └── client_tool.py             # ClientToolSpec（前端定义的工具）
├── llm/
│   ├── __init__.py
│   ├── llm.py                     # ★ LLM 配置模型 + LLMCallContext
│   ├── message.py                 # Message / TextContent / ImageContent
│   ├── llm_response.py            # LLMResponse
│   ├── auth/                      # 认证（OpenAI, Azure, 自定义）
│   ├── router/                    # LLM 路由（RouterLLM）
│   └── utils/                     # Token 计数 / 模型 spec
├── workspace/
│   ├── __init__.py
│   ├── base.py                    # ★ BaseWorkspace ABC
│   ├── local.py                   # ★ LocalWorkspace（直接文件系统）
│   ├── workspace.py               # Workspace 类型转换
│   ├── remote/                    # RemoteWorkspace / AsyncRemoteWorkspace
│   └── repo.py                    # Git repo 工具
├── context/
│   ├── agent_context.py           # ★ AgentContext（Skills、Secrets、Prompt 定制）
│   ├── condenser/                 # CondenserBase / LLMSummarizingCondenser
│   └── prompts/                   # Jinja2 系统提示模板 + Section Registry
├── subagent/
│   ├── __init__.py
│   ├── registry.py                # ★ Agent 注册/工厂（register_agent, get_agent_factory）
│   ├── load.py                    # 从文件系统发现 Agent 定义
│   └── schema.py                  # AgentDefinition / AgentDefinitionLevel
├── skills/                        # Skill 加载（从目录/项目/用户）
├── plugin/                        # ★ Plugin（Manifest + Skills + MCP + Hooks + Agents）
├── hooks/                         # Hook 系统（HookConfig / HookEventProcessor / create_hook_callback）
├── mcp/                           # MCP 客户端/工具/配置
├── marketplace/                   # 市场注册中心
├── security/
│   ├── analyzer.py                # ★ SecurityAnalyzerBase（安全风险分析器）
│   ├── confirmation_policy.py     # ConfirmationPolicyBase（确认策略）
│   └── risk.py                    # SecurityRisk 枚举
├── settings/                      # Agent 设置 Schema（AgentSettingsBase 等）
├── observability/                 # Laminar 可观测性
├── git/                           # Git 工具
├── secret/                        # 密钥源（StaticSecret / LookupSecret）
├── io/                            # FileStore / LocalFileStore
└── logger.py                      # 日志
```

## openhands-tools/ 详细地图

```
openhands-tools/openhands/tools/
├── terminal/              # ★ TerminalTool（bash 执行 + tmux 池 + 超时策略）
├── file_editor/           # ★ FileEditorTool（文件读写 + diff 编辑）
├── task_tracker/          # ★ TaskTrackerTool（任务跟踪）
├── delegate/              # ★ DelegateTool（Subagent 委托）
├── browser_use/           # BrowserTool（浏览器自动化）
├── apply_patch/           # ApplyPatchTool
├── grep/                  # GrepTool
├── glob/                  # GlobTool
├── planning_file_editor/  # PlanningFileEditorTool
├── workflow/              # WorkflowTool
├── task/                  # TaskTool
├── tom_consult/           # TomConsultTool
├── gemini/                # Gemini 兼容工具（edit/read_file/write_file/list_directory）
├── preset/                # 工具预设集（default/gemini/gpt5/planning）
└── utils/                 # 工具工具函数
```

## openhands-workspace/ 详细地图

```
openhands-workspace/openhands/workspace/
├── docker/
│   ├── workspace.py       # DockerWorkspace（容器内执行）
│   └── dev_workspace.py   # DevWorkspace（开发容器）
├── cloud/
│   └── workspace.py       # CloudWorkspace
├── apptainer/
│   └── workspace.py       # ApptainerWorkspace
├── remote_api/
│   └── workspace.py       # RemoteAPIWorkspace（Agent Server 远程工作区）
```

## openhands-agent-server/ 详细地图

```
openhands-agent-server/openhands/agent_server/
├── api.py                     # ★ FastAPI 应用工厂 + 全路由注册
├── __main__.py                # 入口：python -m openhands.agent_server
├── config.py                  # Config（环境变量解析）
├── conversation_service.py    # ★ ConversationService（创建/恢复/WebSocket/Webhook/Worktree）
├── conversation_router.py     # CRUD 路由
├── conversation_lease.py      # 会话租约管理
├── event_service.py           # ★ EventService（事件流 pub/sub）
├── event_router.py            # 事件流 SSE 路由
├── sockets.py                 # WebSocket 路由
├── models.py                  # Pydantic API 模型
├── pub_sub.py                 # PubSub 事件总线
├── bash_service.py            # Bash 事件服务
├── persistence/
│   ├── __init__.py
│   ├── store.py               # 文件持久化
│   └── models.py              # 持久化模型
├── skills_service.py          # Skill 管理服务
├── skills_router.py
├── hooks_service.py           # Hook 管理服务
├── hooks_router.py
├── plugins_service.py         # Plugin 管理服务
├── plugins_router.py
├── sub_agents_router.py       # Subagent 管理路由
├── tool_preload_service.py    # 工具预加载
├── tool_router.py
├── mcp_router.py / mcp_oauth_store.py
├── llm_router.py              # LLM 路由（switch_llm/profile）
├── settings_router.py
├── profiles_router.py         # LLM Profile 管理
├── agent_profiles_router.py   # Agent 配置 profile
├── workspace_router.py        # Workspace 文件路由
├── workspaces_router.py       # Workspace 管理路由
├── file_router.py / git_router.py / bash_router.py
├── vscode_router.py / vscode_service.py
├── desktop_router.py / desktop_service.py
├── openai/                    # OpenAI 兼容 API
├── auth_router.py             # 认证路由
├── init_router.py             # 延迟初始化
├── middleware.py              # CORS 中间件
├── dependencies.py            # FastAPI 依赖注入
├── models.py                  # 数据模型
├── docker/build.py            # Docker 镜像构建
├── env_parser.py              # 环境变量解析
├── logging_config.py          # 日志配置
└── utils.py
```

### 关键文件数量级

| 包 | .py 文件数量 |
| --- | --- |
| openhands-sdk | ~150 |
| openhands-tools | ~90 |
| openhands-workspace | ~10 |
| openhands-agent-server | ~50 |
