# RoboThree Agent Architecture Research — 全局研究索引

## 已完成研究

| 项目 | 深度 | Commit | 日期 | 状态 | 核心结论 |
|------|------|--------|------|------|----------|
| [software-agent-sdk](software-agent-sdk/index.md) | Level 2 | `4fe5656` | 2026-07-18 | ✅ 完成 | **ADAPT** — Conversation 工厂 + Workspace 抽象 + Event Sourcing + Action/Observation 模式可适配 |
| [LangGraph](langgraph/index.md) | **Level 2 + 3 个 L3 深挖** | `49ae27c` | 2026-07-18 | ✅ 完成 | **ADAPT** — Superstep + Checkpoint + Reducer + Event Stream 4 大模式可适配；L3 深挖 Checkpoint Visibility / Interrupt-Resume / Channel Versioning 3 个核心机制 |
| [Grok Build](grok-build/index.md) | Level 2 | `98c3b24` | 2026-07-18 | ✅ 完成 | **ADAPT** ChatState Actor + ToolBridge + AccessKind→Decision 类型化权限；**DEFER** Leader 模式 + 3 套工具并存 |
| [Hermes Agent](hermes-agent/index.md) | Level 2 | `3d9be27` | 2026-07-18 | ✅ 完成 | **ADOPT** 3 层拦截(Scope→Plugin→Guardrail) + Checkpoint Preflight + Worker Backend 抽象；**REJECT** God Object(5k+ 行单文件) + 线程而非进程沙箱 |
| **[OpenClaw](openclaw/index.md)** | **Level 2 + L3（3 机制深挖）** | **`deccdb5`** | **2026-07-18** | **✅ 完成** | **ADAPT — Gateway Daemon + Channel Plugin + Node Host + Pairing + Plugin/Skill 生态；L3 深挖确认 Channel 四阶段协议(durable-before-ack+claim+lane+supersede)、Pairing 双层(channel+device bootstrap+profile)、Cron 重启 catch-up + reservation** |
| **[Open WebUI](open-webui/index.md)** | **专项 Level 2→3（前端）** | **`ecd48e2f`** | **2026-07-18** | **✅ 完成** | **ADOPT 双通道通信 + Command Suggestion + Status Events + 中断恢复；REJECT localStorage Token + new Function() 执行 + CORS `*`/CSP 默认关闭；L3 源码确认 22 种事件类型 + Tree 模型 + execute 无保护** |
| **[Daytona](daytona/index.md)** | **Level 3 — 12 维度深挖** | **`ec4c21b`** | **2026-07-18** | **✅ 完成** | **ADOPT Job Polling + Agent Injection + Record-Execute-Update Audit + Three-Plane Separation；REJECT Privileged Containers + AGPL** |
| **[claude-code-best/claude-code](claude-code-best/index.md)** | **Level 3 — 3 机制深挖** | **`feb76f11`** | **2026-07-19** | **✅ 完成** | **LICENSE_RISK / DESIGN_ONLY**：自承"Reverse-engineered Anthropic Claude Code CLI"、源码含 Anthropic 内部代号 → 严禁复制代码；ADOPT 仅设计骨架（QueryConfig+QueryDeps reducer / ToolUseContext / BundledSkillDefinition / `O_NOFOLLOW \| O_EXCL` 5 道防线 / `query():AsyncGenerator<…,Terminal>`）；REJECT `process.env.USER_TYPE==='ant'` / Computer-Use / Anthropic 内部命名 |
| **[Pi Agent](pi/index.md)** | **Level 3 — 3 机制深挖** | **`c9715af`** | **2026-07-21** | **✅ 完成** | **ADOPT 7 patterns（Turn Snapshots, 3 Dispatch Strategies, Deferral Pattern, Append-Only JSONL, 2-Stage Context Pipeline, Core Minimal Philosophy）；ADAPT 7 patterns（3-Layer API, Event Stream, Dual Queue, Unified ExtensionAPI, Tree Sessions, Declaration Merging, Compaction）；REJECT 2 patterns（No Built-in Permissions, Extension Same-Process Loading）；DEFER jiti Runtime Loading** |
| **[OpenWorker](openworker/index.md)** | **Level 3 — 3 机制深挖** | **`f96ad4c`** | **2026-07-30** | **✅ 完成** | **ADOPT Inbox HITL + Risk-Based Tool Classification + Catalog-Based Capability；ADAPT TurnEngine + Persona Manifest + Progressive Disclosure；DEFER Automation Scheduler + Multi-Root + Connector Relay；REJECT aisuite Provider + Desktop-Only Model** |
| **[OpenCode](opencode/index.md)** | **Level 3 — 3 机制深挖（归档版）** | **`73ee493`** | **2026-08-11** | **✅ 完成** | **MIT；ADOPT SQLite+Goose 三栈 + Provider Channel 抽象 + 串行 Tool Dispatch + DB-of-truth；ADAPT 95% Auto-Compact + Project Context Files + MCP 动态发现；DEFER 11+ Provider Adapter + Bash allowlist；REJECT Persistent Shell + Non-Interactive AutoApprove + 无 timeout Permission Channel + 字符串前缀 Path 校验；NEEDS_MORE_EVIDENCE imageURL Part 反序列化 bug** |
| **[Codex](codex/index.md)** | **Level 3 — 3 机制深挖** | **`e766f75`** | **2026-08-13** | **✅ 完成** | **Apache-2.0；ADOPT 四层粒度(Thread→Turn→Sampling→Tool) + 分级取消 + 三层安全模型(决策/隔离/升级) + 四档扩展分层 + Skill 隐式/显式区分；ADAPT 并发工具 RwLock 门 + allow/prompt/forbid 决策矩阵 + 事件流抽象 + 多后端沙箱(Seatbelt/Landlock/Bwrap)；DEFER ExecPolicyAmendment 自我放宽 + Plugin marketplace；REJECT Never+无沙箱直接 Allow；NEEDS_MORE_EVIDENCE LinuxSeccomp 命名偏差** |
| **[DeepSeek Harness](deepseek-harness/index.md)** | **Level 3 — 3 机制深挖** | **`47f9438`** | **2026-08-14** | **✅ 完成** | **MIT；一切皆插件(Cordis)；ADOPT Definition/Provider/Consumer 三角色 seam + fail-closed 默认安全(沙箱/审批) + append-only session log + model-visible⟺logged 不变量；ADAPT Cordis 式插件(effect/waterfall/scope 链) + 策略即 log 事件 fold + turn/step 双层边界；DEFER epoch hot-reload + Code Mode + 100% 覆盖率；REJECT 全盘 vendor Cordis declaration-merging + SESSION_FORMAT_VERSION=0 无迁移；NEEDS_MORE_EVIDENCE 多后端沙箱隔离强度** |
| **[CrewAI](crewai/index.md)** | **Level 3 — 3 机制深挖（Process / Memory / Tool & Agent-as-Tool）** | **`6388421`** | **2026-08-18** | **✅ 完成** | **MIT；uv workspace 6 包；ADOPT Process 枚举 first-class + Unified Memory 单一对象 + StorageBackend Protocol seam + Save Pool 串行化 + Composite Score 加权 + Confidence-based Routing + Scope/Slice 视图 + BaseTool 自动 schema 推导 + _TOOL_TYPE_REGISTRY 自动序列化 + ToolFailure 显式四元组 + BaseAgentTool 委派给 Agent + _claim_usage 原子限制 + result_as_answer + Event Bus 类型化订阅 + _enter_runtime_scope 嵌套隔离 + LiteAgent 轻量入口；ADAPT Manager LLM 间接调度 + ConditionalTask + Async Task + AgentTools 工厂 + ToolFailurePolicy 三档 + EncodingFlow/RecallFlow + Per-source Privacy + max_workers=1 串行化 + 错误转 error string + BaseAgentTool role 匹配 + Tool `_run` 默认同步 + LiteAgent vs Agent 差异；DEFER Consensual Process + Manager 必须零工具 + Embedding 升级策略 + Tool 集中注册 + IGNORE Policy + Async Task 并发数 + Manager 失败 retry；REJECT 中心化 Permission/Sandbox 缺失 + 无中心化 Cancel + Manager 抛 Exception + Tool 沙箱缺失；NEEDS_MORE_EVIDENCE Consensual 设计意图** |

## 待研究项目

- …（按需添加）

## 跨项目对比

| 文档 | 维度 | 日期 | 状态 |
|---|---|---|---|
| [Context Handling Comparison](comparisons/context-handling.md) | 上下文处理（Context Assembly / Injection / Persistence / Compaction / Memory / Prompt Cache / Turn Safety） | 2026-07-21 | ✅ 完成 — 6 项目全维度对比 |
| [Skill Format Compatibility](comparisons/skill-format-compatibility.md) | Skill 格式兼容策略（Definition Format / Field Mapping / Discovery / Loading / Execution / Governance） | 2026-07-22 | ✅ 完成 — 6 项目 Skill 字段并列对比 + Claude Code/AgentSkills → RoboThree Manifest 映射表 |

### 对比覆盖项目

| 项目 | 对比深度 |
|---|---|
| Hermes Agent | Level 2 |
| OpenHands Software Agent SDK | Level 2 |
| OpenClaw | L2 + L3 |
| Grok-build | Level 2 |
| Claude Code Best | Level 3 |
| Pi Agent | Level 3 |
| OpenCode | L2 + L3 |
