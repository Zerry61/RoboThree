# claude-code-best/claude-code — Research Index

## 项目识别快照

| 项目 | 值 |
| --- | --- |
| **GitHub** | `claude-code-best/claude-code` |
| **本地路径** | `sources/claude-code/` |
| **HEAD Commit** | `feb76f11bb794fb772e6882a418ab2409eb7823c` |
| **HEAD Date** | 2026-07-18 23:52:48 +0800 |
| **HEAD Message** | `feat(ink): auto compat mode for legacy pre-ConPTY Windows consoles (#1299)` |
| **Default branch** | `main` |
| **Repo size** | ~94 MB |
| **Stars** | 21,346 |
| **Created / Pushed** | 2026-03-31 / 2026-07-18 |
| **License (SPDX)** | `None` — 无 LICENSE 文件、无 SPDX Header、package.json 无 `license` 字段 |
| **Description (package.json)** | "Reverse-engineered Anthropic Claude Code CLI — interactive AI coding assistant in the terminal" |
| **Maintainer** | `claude-code-best <claude-code-best@proton.me>`（单维护者、Proton 邮箱） |
| **Homepage** | `https://ccb.agent-aura.top/` |
| **研究深度** | **Level 3** — 3 个机制专项深挖 |
| **研究日期** | 2026-07-19 |
| **质量等级** | DESIGN_ONLY / LICENSE_RISK（绝不复用源码，仅研究架构模式） |

## 重要前置警告（用户已确认）

1. **License 完全缺失**——`github API metadata.license = null`，`package.json` 无 `license`，仓库无 `LICENSE` 文件。
2. **自承 "Reverse-engineered Anthropic Claude Code CLI"**——`package.json description` 字面承认。
3. **源码中充满 Anthropic 内部术语**（已直接验证）：
   - `process.env.USER_TYPE === 'ant'` — 反编译产物里的 Anthropic 员工判定
   - `feature('COORDINATOR_MODE')` / `feature('ANT_…')` Bun feature-flag 内部代号
   - `tengu_*` Statsig gate 前缀（"天狗"是 Claude Code 内部代号）
   - `@anthropic/ink` workspace fork
   - 注释 "Ant-only: eliminated from external builds via feature flag"
   - 注释 "Harness-science L0 ablation baseline"
   - `DATADOG` + `firstPartyEventLogger` + Langfuse
4. **postinstall 跑 3 个并行脚本**：`scripts/run-parallel.mjs scripts/postinstall.cjs scripts/setup-chrome-mcp.mjs`——运行时风险面大，已决定 **Default-Deny**：不安装依赖、不运行项目、不运行测试。

## 结论（5 类）

| 机制 | 结论 | L3 章节 |
| --- | --- | --- |
| **Coordinator / Worker 多代理协议** | **ADOPT（设计模式）**：`<task-notification>` XML 协议 + Worker = AGENT_TOOL_NAME + SEND/TASK_STOP + 工具白名单（`ASYNC_AGENT_ALLOWED_TOOLS` − internal），可作为 RoboThree 多代理层协议起点 | [coordinator-deep-dive.md](coordinator-deep-dive.md) |
| **Query Reducer + DI Deps** | **ADOPT**：`QueryConfig`（immutable snapshot）+ `QueryDeps`（DI override for tests）+ `Transitions = Terminal ∪ Continue` 抽象，正中 RoboThree 的 LangGraph 风格；可以直接 `step(state, event, config)` 演化成纯 reducer | [coordinator-deep-dive.md §3](coordinator-deep-dive.md) |
| **Token Budget with Diminishing Returns** | **ADAPT**：单一常量 `COMPLETION_THRESHOLD = 0.9`、`DIMINISHING_THRESHOLD = 500`、3 次连续 + delta < 阈值才退出；机制简单但目标函数（避免无效 continue）可借鉴 | [coordinator-deep-dive.md §4](coordinator-deep-dive.md) |
| **Tool System（`Tool.ts` + `tools.ts` + `builtin-tools/*`）** | **ADAPT**：Tool 名常量 + `ToolUseContext` + 工具调用上下文对象 + 异步流式输出（`useCanUseTool`）；tool 名称模块化常量避免硬编码——值得借鉴 | [tool-system-deep-dive.md](tool-system-deep-dive.md) |
| **Hook Lifecycle（Stop → TaskCompleted → TeammateIdle）** | **ADAPT 严重**：`preventContinuation` flag、`hook_stopped_continuation` 附件、逐 hook `durationMs` 计时、AbortController 取消语义、并行执行并收集 blocking/non-blocking 错误——RoboThree 需要这种结构而非简单回调 | [coordinator-deep-dive.md §5](coordinator-deep-dive.md) |
| **Skill = Command 抽象（`getPromptForCommand`）** | **ADOPT 设计**：bundled/loaded 统一为 `Command { type:'prompt', allowedTools, skillRoot, files, hooks, context:'inline'\|'fork' }`——一个抽象覆盖 file-based + registry-based skill | [skill-plugin-mcp-deep-dive.md §1](skill-plugin-mcp-deep-dive.md) |
| **Skill 文件提取安全（O_NOFOLLOW \| O_EXCL）** | **ADOPT 直接**：0o700/0o600 mode + nonce dirname + 不 unlink+retry 防止 symlink 攻击——RoboThree 在 host FS 上加载插件时可直接复用此模式 | [skill-plugin-mcp-deep-dive.md §2](skill-plugin-mcp-deep-dive.md) |
| **plugin + mcp 双生态** | **NEEDS_MORE_EVIDENCE**：`builtinPlugins.ts` 仅 5KB，本次未深挖；`mcp-client` 90KB+ 子包未深挖 | [skill-plugin-mcp-deep-dive.md §3](skill-plugin-mcp-deep-dive.md) |

## 复用作边界（License 触发表 §5.1 命中）

✅ **可做**：研究架构模式、设计启发、协议对比、Hop Evidence 复盘
❌ **不可做**：把任何 src 内的 TypeScript 代码片段复制到 RoboThree / 任何下游
❌ **不可做**：复用 `bun.lock`、`vendor/` 音频捕获库
❌ **不可做**：fork 本仓库作为 RoboThree 子仓库
⚠️ **需 LEGAL_REVIEW_REQUIRED**：若要把 `O_NOFOLLOW\|O_EXCL` 安全模式借鉴到 RoboThree，需法律复核（本仓库不声明许可，借鉴 5 行安全性代码模式总体安全，但建议保留简短 "design inspired by Claude Code" 注释作为 pattern 来源）

详见 [license-review.md](license-review.md)。

## Required 产物（7）

| 文件 | 状态 |
| --- | --- |
| `index.md`（本文件） | ✅ 完成 |
| `project-overview.md` | ✅ 完成 |
| `source-map.md` | ✅ 完成 |
| `architecture.md` | ✅ 完成（含 Permission/Security 主段落） |
| `runtime-sequence.md` | ✅ 完成（Mermaid + Hop Evidence） |
| `robothree-fit-analysis.md` | ✅ 完成 |
| `open-questions.md` | ✅ 完成 |

## Level 3 Conditional 产物（3 个深挖机制）

| 机制 | 文件 | 状态 |
| --- | --- | --- |
| Coordinator/Worker/Query Reducer | `coordinator-deep-dive.md` | ✅ 完成 |
| Tool System（Tool.ts + builtin-tools） | `tool-system-deep-dive.md` | ✅ 完成 |
| Skill/Plugin/MCP | `skill-plugin-mcp-deep-dive.md` | ✅ 完成 |

## Advanced 产物（命中）

- `license-review.md` — License 完全缺失触发表 §5.1，**必出**
- `final-review.md` — Level 3 验收，**必出**

## 后续自检

- 12 项 Level 2 自检 → 见 [final-review.md §A](final-review.md)
- 30 项 Level 3 扩展自检 → 见 [final-review.md §B](final-review.md)
