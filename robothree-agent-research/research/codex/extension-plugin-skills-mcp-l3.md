# Deep Dive 3: Extension / Plugin / Skills / MCP 扩展体系

> L3 Mechanism #3 | commit `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7`
> Method: 静态源码分析（无运行时验证）

## 1. Executive Summary

Codex 有**四条并行扩展机制**，各自解决不同的扩展场景，这是它作为「OpenAI 参考实现」最有示范价值的部分：

| 机制 | 隔离边界 | 触发方式 | 典型用途 |
|---|---|---|---|
| **进程内 Extension**（`ext/extension-api`） | 同进程，trait 切面 | 编译期注册 / 运行时 contributor | Tool / Context / Turn / Approval 生命周期挂钩 |
| **Plugin**（`core-plugins` + `plugin`） | 独立 bundle，marketplace 分发 | 用户安装 | 第三方能力分发（含远程 bundle） |
| **Skill**（`skills`） | 声明式 SKILL.md | 显式 mention / 隐式选择 | 可复用的提示词+工具能力包 |
| **MCP**（`codex-mcp` + `mcp-server` + `rmcp-client`） | 独立进程 / 网络 | 配置的 server | 外部工具服务器；**Codex 本身也作为 MCP Server 暴露** |

关键结论：**Codex 不是「一个扩展接口打天下」，而是按「隔离成本 vs 集成深度」分成四档**。RoboThree 的 Skill Framework / Plugin Framework / MCP Host 三块应参考这个分层，而非强行统一。

## 2. 进程内 Extension：Contributor 切面模型

**[F]** [ext/extension-api/src/lib.rs](../../sources/codex/codex-rs/ext/extension-api/src/lib.rs) 导出 12 种 Contributor trait（`pub use contributors::*`），是进程内扩展的完整切面：

| Contributor | 挂钩点 |
|---|---|
| `ToolContributor` | 提供/注册工具 |
| `ToolLifecycleContributor` | 工具生命周期（on_tool_finish 等，见 [parallel.rs 测试](../../sources/codex/codex-rs/core/src/tools/parallel.rs#L639)） |
| `ContextContributor` | 上下文注入 |
| `TurnInputContributor` / `TurnItemContributor` / `TurnLifecycleContributor` | Turn 各阶段 |
| `ThreadLifecycleContributor` | Thread 生命周期 |
| `McpServerContributor` | MCP server 贡献 |
| `SkillInvocationContributor` | Skill 调用挂钩 |
| `ApprovalReviewContributor` | 批准审查挂钩 |
| `ConfigContributor` / `TokenUsageContributor` | 配置 / token 计量 |

**[F]** `ExtensionRegistry` / `ExtensionRegistryBuilder`（[extension-api/src/lib.rs:77-78](../../sources/codex/codex-rs/ext/extension-api/src/lib.rs#L77-L78)）+ `ExtensionData` / `ExtensionDataInit`（:80-81）是扩展的注册与状态容器。

**[F]** 这些 contributor 在 core 中被真实调用：如 `try_run_sampling_request` 中 `turn_store: Arc<ExtensionData>` 贯穿全流程，`handle_output_item_done` 的 `TurnItemContributorPolicy::Run(ctx.turn_store)`（[stream_events_utils.rs:332](../../sources/codex/codex-rs/core/src/stream_events_utils.rs#L332)）在 non-tool item 上运行 contributor。

**[I]** 这是一个「面向切面（AOP）」的扩展模型：扩展不实现「完整 Agent」，而是声明对某个生命周期的兴趣，由 core 在固定切点回调。这与 Hermes 的「3 层拦截」和 Pi 的「Extension API」同源，但 Codex 的切面粒度更细（12 种）。

## 3. Plugin：Marketplace 分发模型

**[F]** [core-plugins/src/manager.rs](../../sources/codex/codex-rs/core-plugins/src/manager.rs) `PluginsManager` 是插件管理核心；`ThreadManager.plugins_manager()`（[thread_manager.rs:647](../../sources/codex/codex-rs/core/src/thread_manager.rs#L647)）暴露它。

**[F]** [core-plugins](../../sources/codex/codex-rs/core-plugins) 的关键子模块：

| 模块 | 职责 |
|---|---|
| `marketplace.rs` + `marketplace_add.rs` / `marketplace_remove.rs` / `marketplace_upgrade.rs` / `marketplace_policy.rs` | 插件市场（安装/卸载/升级/策略） |
| `manifest.rs` | 插件 manifest |
| `loader.rs` | 插件加载 |
| `store.rs` | 已安装插件存储 |
| `remote.rs` + `remote_bundle.rs` + `remote_legacy.rs` + `remote_plugin_id_resolver.rs` | 远程插件 bundle |
| `provider.rs` | 插件 Provider |
| `agent_plugin_manifest.rs` | Agent 插件 manifest |

**[F]** [plugin/src/manifest.rs](../../sources/codex/codex-rs/plugin/src/manifest.rs) + [plugin/src/provider.rs](../../sources/codex/codex-rs/plugin/src/provider.rs) + [plugin/src/load_outcome.rs](../../sources/codex/codex-rs/plugin/src/load_outcome.rs) 定义插件的 manifest / provider / 加载结果。

**[I]** Plugin 与 Extension 的区别在**分发与信任边界**：Plugin 走 marketplace + 远程 bundle（第三方分发），Extension 是进程内编译注册（一等公民）。RoboThree 的 Plugin Framework 应对应 Plugin 模型（marketplace + manifest + 隔离加载），而非 Extension 模型。

## 4. Skills：声明式能力包

**[F]** [skills/src/model.rs](../../sources/codex/codex-rs/skills/src/model.rs) 定义 Skill 数据模型：

| 类型 | 职责 |
|---|---|
| `SkillMetadata` | host 文件系统上物化的 skill 元数据（含 `SKILL.md` 路径，:15） |
| `EnvironmentSkillMetadata` | 执行环境拥有的 URI-native skill |
| `SkillPolicy` / `SkillInterface` / `SkillDependencies` / `SkillToolDependency` | 策略 / 接口 / 依赖声明 |

**[F]** [skills](../../sources/codex/codex-rs/skills) 的关键子模块：`loading.rs`（加载）、`selection.rs`（选择）、`invocation.rs`（调用）、`mentions.rs`（提及）、`parser.rs`（解析）、`name_counts.rs`。

**[F]** `SkillMetadata` 的 `allows_implicit_invocation()`（[model.rs:23](../../sources/codex/codex-rs/skills/src/model.rs#L23)）区分「显式 mention」与「隐式自动调用」——这是 Codex Skill 与 Claude Code Skill 的重要差异点：**Codex 区分允许隐式调用的 skill 与仅显式 skill**。

**[F]** core 侧 [core/src/skills.rs](../../sources/codex/codex-rs/core/src/skills.rs) 有 `maybe_emit_implicit_skill_invocation` / `skills_load_input_from_config`；`build_skills_and_plugins`（[turn.rs:740](../../sources/codex/codex-rs/core/src/session/turn.rs#L740)）在每 turn 构建 skill 注入项。

**[I]** Codex 的 Skill 是**声明式（SKILL.md）+ 依赖声明（SkillDependencies/SkillToolDependency）**，与 Claude Code 的 Skill 格式（frontmatter + 指令）同源但更强调「工具依赖」的显式建模。这与 `comparisons/skill-format-compatibility.md` 的映射表直接相关。

## 5. MCP：既是 Client 也是 Server

**[F]** Codex 的 MCP 是**双向**的：

### 5.1 Client 侧（消费外部 MCP server）

| 模块 | 职责 |
|---|---|
| [codex-mcp/src/binding.rs](../../sources/codex/codex-rs/codex-mcp/src/binding.rs) | MCP 绑定 |
| [codex-mcp/src/catalog.rs](../../sources/codex/codex-rs/codex-mcp/src/catalog.rs) + `tool_catalog_cache.rs` | 工具目录缓存 |
| [codex-mcp/src/connection_manager.rs](../../sources/codex/codex-rs/codex-mcp/src/connection_manager.rs) | 连接管理 |
| [codex-mcp/src/elicitation.rs](../../sources/codex/codex-rs/codex-mcp/src/elicitation.rs) + `auth_elicitation.rs` | MCP elicitation（交互请求） |
| [rmcp-client](../../sources/codex/codex-rs/rmcp-client) | 传输层：`in_process_transport` / `stdio_server_launcher` / `executor_process_transport` / `streamable_http_retry` / `perform_oauth_login` |

**[F]** [rmcp-client/src/stdio_server_launcher.rs](../../sources/codex/codex-rs/rmcp-client/src/stdio_server_launcher.rs) + [in_process_transport.rs](../../sources/codex/codex-rs/rmcp-client/src/in_process_transport.rs) + [executor_process_transport.rs](../../sources/codex/codex-rs/rmcp-client/src/executor_process_transport.rs) 表明 Codex 支持 **stdio / in-process / executor-process / streamable-http + OAuth** 多种 MCP 传输。

**[F]** core 侧 [core/src/mcp.rs](../../sources/codex/codex-rs/core/src/mcp.rs) `McpManager` 管理 MCP 配置与能力投影；`mcp_tool_call.rs` / `mcp_tool_exposure.rs` / `mcp_tool_approval_templates.rs` 处理 MCP 工具的调用/暴露/批准。

### 5.2 Server 侧（把 Codex 暴露为 MCP）

**[F]** [mcp-server/src/main.rs](../../sources/codex/codex-rs/mcp-server/src/main.rs) 是独立 MCP server 入口；[codex_tool_runner.rs](../../sources/codex/codex-rs/mcp-server/src/codex_tool_runner.rs) 把 Codex 自身工具（shell/apply_patch 等）暴露为 MCP tool；[exec_approval.rs](../../sources/codex/codex-rs/mcp-server/src/exec_approval.rs) + [patch_approval.rs](../../sources/codex/codex-rs/mcp-server/src/patch_approval.rs) 在 server 侧承载 exec/patch 批准。

**[I]** 「Codex 同时是 MCP Client 和 MCP Server」是它的独特架构：既能消费第三方 MCP 工具，又能把自己的 coding 能力暴露给其它 MCP Host（如 IDE）。这意味着 Codex 的**工具层是 MCP 可导出的**——`McpServerContribution`（[extension-api](../../sources/codex/codex-rs/ext/extension-api/src/lib.rs#L42)）允许 extension 贡献 MCP server。

## 6. 四机制对比与选择矩阵

**[I]** 基于源码推断的四机制选择依据：

| 场景 | 选 Extension | 选 Plugin | 选 Skill | 选 MCP |
|---|---|---|---|---|
| 需深度挂钩 core 生命周期 | ✅ | — | — | — |
| 第三方分发 + 隔离 | — | ✅ | — | — |
| 可复用提示词+工具包（声明式） | — | — | ✅ | — |
| 跨进程/跨语言工具 | — | — | — | ✅ |

**[I]** 四种机制**不是冗余**，而是「隔离成本 vs 集成深度」的权衡谱系：Extension（最深集成、最弱隔离）→ Skill（声明式、中等）→ Plugin（分发、强隔离）→ MCP（跨进程、最弱集成但最强隔离）。

## 7. 与其它框架对比

| 维度 | Codex | OpenCode | Claude Code Best | Pi |
|---|---|---|---|---|
| 扩展机制数 | **4**（ext/plugin/skill/MCP） | 1（MCP + subagent） | Skill（bundled） | 1（Unified ExtensionAPI） |
| MCP 角色 | Client + **Server** | Client | — | — |
| Skill 隐式/显式 | **区分** `allows_implicit_invocation` | — | — | — |
| 插件分发 | marketplace + 远程 bundle | — | — | — |
| 扩展隔离 | 进程内（Extension）/ 跨进程（MCP/Plugin） | 同进程 | 同进程 | 同进程 |

## 8. RoboThree 映射

| 机制 | 分类 | 理由 |
|---|---|---|
| 四档扩展分层（隔离成本×集成深度） | **ADOPT** | RoboThree 的 Skill/Plugin/MCP 三块应保持分层，不强统一 |
| Contributor 切面模型（12 种） | **ADAPT** | 切面思想通用；12 种对 MVP 过多，先取 Tool/Context/Turn 三切面 |
| Skill 区分隐式/显式调用 | **ADOPT** | 直接对应 `comparisons/skill-format-compatibility.md` 的治理需求 |
| Skill 依赖声明（SkillToolDependency） | **ADAPT** | 显式工具依赖值得引入，但需与现有 manifest 对齐 |
| MCP 双向（Client+Server） | **ADAPT** | Codex 作为 MCP Server 导出自身工具是强设计；RoboThree 可先做 Client |
| Plugin marketplace + 远程 bundle | **DEFER** | 分发机制重，MVP 不需要；先做本地 plugin |
| Extension 同进程 trait 注册 | **DEFER** | 与 RoboThree 的 Worker 进程隔离模型冲突，需先定边界 |

详细汇总见 [robothree-fit-analysis.md](robothree-fit-analysis.md)。
