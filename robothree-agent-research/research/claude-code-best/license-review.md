# claude-code-best/claude-code — License Review

> 触发条件（Skill §5.1 升级为独立 license-review 的判定）：
> - ✅ **License 文件缺失或不明确**：仓库无 `LICENSE` 文件、无 SPDX 标识、`package.json` 无 `license` 字段。
> - ✅ **第三方嵌入代码较多**：`vendor/audio-capture-src`、`vendor/audio-capture`（仅仓库内 vendor 代码），但 `@ant/*`、`@claude-code-best/*` workspace 包内大概率有更多 Anthropic 内部代号痕迹。
> - ✅ **准备复用第三方代码** —— 用户要求做 L3 架构深挖，结构与设计模式对 RoboThree 有借鉴价值。

下文按 Skill §5.1 八级分类给出复用边界。

## 1. License 实情

| 维度 | 实际 | 证据 |
| --- | --- | --- |
| **仓库 LICENSE 文件** | ❌ 不存在 | `git ls-tree -l HEAD` 顶层无 `LICENSE*` |
| **package.json `license` 字段** | ❌ 不存在 | `package.json` 直接读 README |
| **GitHub API license** | `null` | `repos/.../claude-code-best/claude-code` 端点 |
| **SPDX 标识** | ❌ 无 | — |
| **README 中 license 声明** | ❌ 无 | `README.md` 15120B 未声明 |
| **提交者** | 单人（`claude-code-best <claude-code-best@proton.me>`） | git log + package.json author |
| **Self-description** | "Reverse-engineered Anthropic Claude Code CLI" | `package.json description` |
| **来源** | `github.com/claude-code-best/claude-code`（2026-03 创建，2026-07 仍频繁 push） | API |

## 2. 仓库内容合规分析

### 2.1 实质相同代码（基于命名/术语/特征）

仓库使用了大量 Anthropic 内部才能接触到的术语与代号：

| 类别 | 例子 | 文件位置 |
| --- | --- | --- |
| **Env keys（Anthropic 内部）** | `CLAUDE_CODE_*`（50+ 个）、`CLAUDE_JOB_DIR`、`CLAUDE_CODE_FORCE_INTERACTIVE`、`CLAUDE_CODE_REMOTE`、`CLAUDE_CODE_DISABLE_AUTO_MEMORY`、`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`、`CLAUDE_CODE_ABLATION_BASELINE`、`USER_TYPE`（用 `==='ant'` 判定） | 多文件 |
| **Statsig gate keys（"tengu" = Anthropic 内 CodeName）** | `tengu_scratch`、`tengu_streaming_tool_execution2`、`tengu_coordinator_mode_switched`、`tengu_pre_stop_hooks_cancelled`、`tengu_stop_hook_error` | `src/coordinator/coordinatorMode.ts:26`、`src/query/config.ts:33`、`src/query/stopHooks.ts:296,470` |
| **Bun `feature()` 内部代号** | `COORDINATOR_MODE`、`ACP`、`CHICAGO_MCP`、`ANT_*`、`POOR`、`BREAK_CACHE_COMMAND`、`ABLATION_BASELINE`、`HISTORY_SNIP`、`CONTEXT_COLLAPSE`、`REACTIVE_COMPACT`、`EXPERIMENTAL_SKILL_SEARCH`、`EXPERIMENTAL_SEARCH_EXTRA_TOOLS`、`OVERFLOW_TEST_TOOL`、`TEMPLATES`、`BG_SESSIONS`、`KAIROS`、`WORKFLOW_SCRIPTS`、`UDS_INBOX`、`KAIROS_GITHUB_WEBHOOKS`、`KAIROS_PUSH_NOTIFICATION`、`WEB_BROWSER_TOOL`、`MONITOR_TOOL`、`PROACTIVE`、`REVIEW_ARTIFACT`、`AGENT_TRIGGERS_REMOTE`、`TERMINAL_PANEL` | 多次 |
| **Workspace fork** | `@anthropic/ink`（自家 fork 的 Ink CLI） | `package.json workspaces` |
| **JSDoc 注释措辞** | "Ant-only: eliminated from external builds via feature flag"、"Harness-science L0 ablation baseline"、"Harness-science"（Anthropic 内实验平台代号） | 多次 |
| **Dashboard 类代号** | "Chicago MCP"、"Stuttgart"（未读但出现在 package.json 命名）、"AcpLink" | 多次 |

**推论**（INFERENCE，置信 MEDIUM-HIGH）：

1. 本仓库**实质上等于 Anthropic Claude Code 内部源码的重新发布**（不是干净的 reimplementation）；命名完全一致、注释含内部代号、不存在第三方能产生这些代码的渠道。
2. 单人仓库 + Proton 邮箱 + Reverse-engineered claim，更像"反编译产物 + 包装为开源项目"以规避 Anthropic 商标。

### 2.2 已被本仓库"重命名"的迹象

仓库把 `@anthropic-ai/*` 改为了 `@claude-code-best/*` 和 `@ant/*`：
- `coordinatorMode.ts:8` `import { AGENT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/AgentTool/constants.js'`
- `tools.ts:3-4` `import { toolMatchesName } from './Tool.js'`、`import { AgentTool } from '@claude-code-best/builtin-tools/tools/AgentTool/AgentTool.js'`

但 `@claude-code-best/builtin-tools/tools/*` 目录内大概率仍是 Anthropic 原始实现（"reverse-engineered" claim 但实际未变）。

## 3. 复用八级分类（Skill § 4.5）

| 类别 | 适用项 | 说明 |
| --- | --- | --- |
| **`DIRECT_REUSE`** | ❌ 无 | 任何代码片段都不可直接复用 |
| **`ATTRIBUTION_REQUIRED`** | ❌ 无 | 不存在可"保留声明后复用"的安全片段 |
| **`DESIGN_ONLY`** | ✅ **架构模式、协议名称、API 接口签名** | 唯一安全类别（详见下表） |
| **`LEGAL_REVIEW_REQUIRED`** | ⚠️ `O_NOFOLLOW \| O_EXCL` 文件写入模式、`<task-notification>` XML 协议 message schema、`QueryConfig`/`QueryDeps` reducer 抽象 | 借鉴需要 RoboThree Legal 复核 |
| **`NOT_RECOMMENDED`** | ❌ `bun.lock`、`vendor/audio-capture*`、`scripts/postinstall.cjs`、`scripts/setup-chrome-mcp.mjs` | 推断源于 Anthropic 内部包，避免复用 |
| **`ORIGINAL_ONLY`** | ❌ 任何 .ts .tsx 源码 | "Reverse-engineered" claim 不能产生权利 |
| **`LICENSE_RISK`** | ⚠️ 整个仓库 | License 完全缺失 + 内含 Anthropic 内部代号 + 商标"Claude Code"被 rebrand 为 `ccb` |
| **`SECURITY_RISK`** | ⚠️ `postinstall` 脚本链、`@ant/computer-use-*` 子包运行时安全面 | 安装脚本会运行 `setup-chrome-mcp.mjs` |

### 3.1 `DESIGN_ONLY` 详细清单（仅可借鉴的设计模式）

以下**仅借鉴其设计概念**，不复用任何代码字面：

1. **Coordinator → Worker XML 协议**（`getCoordinatorSystemPrompt()` 的 5 段结构）
2. **ToolUseContext 单 context 设计**（30+ 字段全在一个 object，TypeScript 内置可选字段、`DeepImmutable<>` 包装权限子结构）
3. **QueryConfig + QueryDeps 的 reducer 抽象**（immutable snapshot + DI override）
4. **`feature('FOO')` DCE pattern** 的**概念**（不依赖 Bun 时需替换实现）
5. **Token Budget + Diminishing Returns 算法**（90% 阈值 + 3 次判停）
6. **Hook 三段式 Stop → TaskCompleted → TeammateIdle**（hook orchestration 设计）
7. **Skill = Command 抽象**（统一 bundled / loaded / mcp 三源为一个 abstract type）
8. **Skill 文件提取安全（O_NOFOLLOW）** 的**概念**（安全性原则，不复刻实现）
9. **Tool names 常量化** + `ASYNC_AGENT_ALLOWED_TOOLS` / `COORDINATOR_MODE_ALLOWED_TOOLS` 工具白名单
10. **Many Provider abstraction**（Anthropic + Bedrock + Vertex + Foundry 同进程可选）

### 3.2 `LEGAL_REVIEW_REQUIRED` 清单

借鉴前需 RoboThree 法务复核：

1. **`O_NOFOLLOW | O_EXCL` 文件写入模式**：约 5-10 行安全代码，借鉴**设计模式**（不照搬语句）安全；保留 `// inspired by Claude Code security model` 注释作为 pattern 来源
2. **`<task-notification>` XML schema**：MIME schema 部分可借鉴（XML 不是 copyrightable，但需注意使用字面命名）
3. **`QueryConfig`/`QueryDeps` 的字段设计**：纯 TS interface 设计，可借鉴

## 4. License 复用总结

| 类别 | 是否可用 | RoboThree 落地行动 |
| --- | --- | --- |
| 整仓库 fork | ❌ **禁止** | RoboThree 不 fork 本仓库 |
| 任何 `.ts/.tsx` 字面代码 copy | ❌ **禁止** | — |
| 架构模式 / interface 设计 / 算法描述 | ✅ `DESIGN_ONLY` | 写入 RoboThree 设计时**不引用此仓库为来源**，用 `Research Note` 或 `Architecture Inspiration` 标签 |
| 安全写入模式的概念 | ⚠️ `LEGAL_REVIEW_REQUIRED` | 借鉴前向 RoboThree Legal 提工单 |
| 内含 trademark "Claude Code" 命名 | ❌ **禁止** | RoboThree 不重用 "claude-code" 命名 |

## 5. RoboThree 工程建议

1. **新建 RoboThree 不引用本仓库**——研究报告作为公开 architecture inspiration，但不得在任何 RoboThree 正式文档中引用 GitHub URL。
2. **重写所有模式时使用 RoboThree 自家命名空间**——例如：
   - 不复用 `tengu_*` Statsig gate key
   - 不复用 `harness-science` 这类代号
   - 不复用 `process.env.CLAUDE_CODE_*` env key，改用 `ROBOTHREE_*`
3. **OCaml / TS / Rust 风格的 reducer 抽象**可借结构借命名（如 `QueryConfig → SessionConfig`、`QueryDeps → SessionDeps`）。
4. **ML3 coordinator 协议**——5 段 + XML 格式可借鉴结构（改为 JSON/Protobuf 更稳）。
5. **安全写入模式**——直接改写为 RoboThree 风格（O_NOFOLLOW 的设计思想 → 现代 Rust 已有 `O_NOFOLLOW` 同名常量，但须独立实现）。

## 6. 反向核查 checklist

- [ ] RoboThree 未 fork 本仓库 (`research/claude-code-best/INDEX.md` 仅作研究目录名)
- [ ] RoboThree 未在 commit message 中引用 `claude-code-best`
- [ ] RoboThree 设计文档未引用本仓库 URL（即便 inspiration）
- [ ] RoboThree 代码搜索：grep 应无 `tengu_`、`CLAUDE_CODE_*`、`@anthropic/ink`、`@ant/*` 等 Anthropic 内部代号
- [ ] RoboThree 自家命名（`ROBOTHREE_*` env / `RoboThree 命名空间`）已就绪

## 7. 结论（1 句话）

**License-Risk = HIGH**。**复用类别 = DESIGN_ONLY**。**严禁**复制任何代码字面到 RoboThree；**有条件**借鉴接口设计与算法模式；**严禁**复用 Anthropic 内部代号 / Statsig gate key / env key。
