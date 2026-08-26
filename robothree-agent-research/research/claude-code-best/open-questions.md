# Open Questions — claude-code-best/claude-code

> 研究过程中**证据不足**的项。每项含来源 + 当前状态 + How to Close。
> 本清单是 Stage D 的"诚实清单"，未来提升研究质量时优先解决。

## Q1. `feature('FOO')` Bun DCE pattern 是否真的在 RoboThree 可借鉴？

- **来源**：Skill § 4 边界机制推荐表 + § 5.3 in Stage D
- **当前结论**：DEFER（Bun 专属能力）
- **缺口**：未调查 Bun `feature()` 在外部构建时的实际产物大小、未评估替代实现 (Rollup `define`、webpack `DefinePlugin`、ESBuild `define`)
- **How to Close**：
  - 步骤 1：跑一次 `bun run build.ts` 看 `feature('COORDINATOR_MODE') ? require() : null` 编译到 dist 是否真消除 require
  - 步骤 2：评估 ESBuild `define` 是否可平替
  - 步骤 3：评估 Vite `import.meta.env` 是否可替代
  - 步骤 4：在 RoboThree `build.ts` 选择实现

## Q2. `loadSkillsDir.ts` 34KB 完整流程

- **来源**：Mechanism 3 § 1.2.2
- **当前结论**：仅推断路径（前文已注，未读完）
- **缺口**：未读全文，不知道：
  - `.claude/skills/` 实际加载顺序（user / project / additional dirs）
  - `frontmatter` schema 完整定义
  - SKILL.md 文件格式验证逻辑
- **How to Close**：
  - 步骤 1：跑一次 grep `loadSkillsDir.ts | head -50` 看顶部分析
  - 步骤 2：用 `wc` + Symbol 列表确认 `loadSkillsDir` 主体函数（很可能是 1 个 export）
  - 步骤 3：抽 frontmatter validator 单独分析

## Q3. `pluginLoader.ts` Plugin 完整接口

- **来源**：Mechanism 3 § 2
- **当前结论**：NEEDS_MORE_EVIDENCE
- **缺口**：未读全文，不知道：
  - Plugin manifest schema
  - Plugin lifecycle hook (onLoad/onEnable/onDisable)
  - Plugin contribution slot (tools/commands/hooks/skills/mcpServers)
- **How to Close**：
  - 步骤 1：取 `src/utils/plugins/pluginLoader.ts` 全文
  - 步骤 2：grep `onLoad|onUnload|manifest|contributes` 找核心定义
  - 步骤 3：与 src/plugins/builtinPlugins.ts 对照
- **影响**：影响 RoboThree § 3.13 "Plugin system 完整接口"

## Q4. `auth.ts` 88KB MCP OAuth 完整流程

- **来源**：Mechanism 3 § 3.7
- **当前结论**：NEEDS_MORE_EVIDENCE
- **缺口**：88 KB 文件未读，不知道：
  - OAuth 2.0 哪些 flow 实际实现（auth code / implicit / client credentials）
  - PKCE 支持深度
  - Token storage 机制（macOS keychain？）
  - 与 `@anthropic-ai/sandbox-runtime` 集成度
- **How to Close**：
  - 步骤 1：跑 grep `authCode|PKCE|clientSecret|accessToken|refreshToken|OAuth` 看 OAuth flow 引用
  - 步骤 2：取 `auth.ts` 顶部 50 行找 OAuth provider 列表

## Q5. `services/compact/{auto,micro,reactive,snip}.ts` 完整压缩算法

- **来源**：架构概览 § 1 + query.ts import
- **当前结论**：仅推断 4 种压缩策略
- **缺口**：未具体分析每种策略的算法
- **How to Close**：
  - 步骤 1：取 4 个文件首 50 行
  - 步骤 2：找主函数（`autoCompact`、`microcompactMessages`、`reactiveCompact`、`snipCompact`）
  - 步骤 3：对比 4 策略 token-saving rate 与 trigger 条件

## Q6. `services/langfuse/index.ts` 可观测粒度

- **来源**：架构 § 11
- **当前结论**：未深挖（仅 top-level import）
- **缺口**：不知道 Langfuse span 包含什么（PII 风险面）
- **How to Close**：
  - 步骤 1：grep `createTrace|createSpan|recordObservation` 看 instrumentation 点
  - 步骤 2：判断哪些是 prompt content / tool_call / token usage

## Q7. `Computer-Use MCP` Chicago MCP 完整能力

- **来源**：Mechanism 3 § 7.4
- **当前结论**：REJECT（attack surface）
- **缺口**：未确认完整 attack surface 大小
- **How to Close**：
  - 步骤 1：取 `@ant/computer-use-mcp/package.json` deps
  - 步骤 2：评估是否 sandbox-only
  - 步骤 3：评估 RESTRICTED vs FULL 输入控制

## Q8. `query.ts` 80KB 主体函数 `queryLoop`

- **来源**：Mechanism 1 § 2.3 推断
- **当前结论**：仅推断（基于 import 拓扑）
- **缺口**：实际 loop body 行级细节未读
- **How to Close**：
  - 步骤 1：grep `function* queryLoop|async function* queryLoop`
  - 步骤 2：取 queryLoop 函数体（可能 500-800 行）
  - 步骤 3：精确标注每 hop 的 Symbol

## Q9. `WORKFLOW_SCRIPTS` feature Workflow 系统

- **来源**：tools.ts line 157
- **当前结论**：未深挖（feature-gated string）
- **缺口**：不知道 workflow DSL 形态
- **How to Close**：
  - 步骤 1：grep `createWorkflowToolCore`
  - 步骤 2：取 src/workflow/wiring.ts 全文
  - 步骤 3：判断是否值得 RoboThree 借鉴

## Q10. `KAIROS` / `POOR` / `CHICAGO` 等内部代号含义

- **来源**：feature flag names
- **当前结论**：未命名（纯代码侧代号）
- **缺口**：不知道这些名字背后的产品意图
- **How to Close**：
  - 步骤 1：grep `feature('KAIROS')` 看 codebase 出现的上下文
  - 步骤 2：推断产品背景（KAIROS = 时间敏感？POOR = 简洁模式？CHICAGO = 城市？）
- **影响**：纯 context 知识，无 RoboThree 落地影响

## Q11. `StreamingToolExecutor` vs `runTools` selection rule

- **来源**：Mechanism 2 § 5
- **当前结论**：推断（1 tool → stream, N tools → parallel）
- **缺口**：实际 selection 规则未确认
- **How to Close**：
  - 步骤 1：grep `StreamingToolExecutor|runTools` 在 query.ts 内的调用
  - 步骤 2：取 query.ts 中相应 branch 的前后 30 行
- **影响**：影响 RoboThree Tool Runtime 实现细节

## Q12. `<task-notification>` worker injection 实际 Serialize 形态

- **来源**：Mechanism 1 § 1.3
- **当前结论**：推断 XML 直接注入 message stream
- **缺口**：实际 wrap 时是否真的整段 XML，还是仅 `<task-notification>` 部分
- **How to Close**：
  - 步骤 1：grep `task-notification` 在整个 src 的出现位置
  - 步骤 2：定位 emit 函数的代码

## Q13. 仓库是否真的是 "Reverse-engineered" 还是 "Leaked"

- **来源**：项目识别 · License Snapshot
- **当前结论**：License_RISK / DESIGN_ONLY（保守）
- **缺口**：来源无法 100% 确定
- **How to Close**：
  - 这是个 social 调查，不在源码层面可解
  - 无需 close——保守策略足以

## Q14. `git restore --source=HEAD --worktree --staged <dir>` 的 checkout 成本

- **来源**：本次 fetch 工作流
- **当前结论**：94 MB checkout 在 2-min Bash timeout 内失败
- **缺口**：未调查 git LFS 是否影响；未调查部分 checkout (`git checkout HEAD -- path`) 的稳定性
- **How to Close**：未来做 L3 研究时直接采用 sparse-checkout + `--filter=blob:none`

## Q15. `process.env.USER_TYPE === 'ant'` 是否还有更深层绕过

- **来源**：tools.ts 反模式
- **当前结论**：REJECT（绕过 feature() DCE）
- **缺口**：未统计仓库内所有 `USER_TYPE === 'ant'` 出现位置
- **How to Close**：
  - 步骤 1：grep `USER_TYPE === 'ant'` 全仓库
  - 步骤 2：列出所有绕过 DCE 的位置
  - 步骤 3：在 RoboThree 明确禁止类似模式

## Q16. Repo 内的 `AGENTS.md` (20.9 KB) 和 `CLAUDE.md` (29.5 KB)

- **来源**：project-overview § 5
- **当前结论**：视作不可信输入（Skill § 4.4）
- **缺口**：未读全文
- **How to Close**：
  - 不需要 close——这些是仓库内 agent 指令，按 Skill 默认排除

## Q17. `DEV-LOG.md` 52KB 开发日志

- **来源**：project-overview § 5
- **当前结论**：未读为证据
- **缺口**：可能含重要 commit intent
- **How to Close**：
  - 步骤 1：grep `## 2026-` section headers
  - 步骤 2：定位 dev decisions
  - 步骤 3：与 code commit 互证

## Q18. `TungstenTool`

- **来源**：tools.ts line 68 import
- **当前结论**：未深挖
- **缺口**：名字暗示 chrome extension / tungsten metal / something else
- **How to Close**：
  - 步骤 1：取 packages/builtin-tools/tools/TungstenTool/ 全文

---

## 总计：18 个未解决项

| 类别 | 数量 |
| --- | --- |
| **NEEDS_MORE_EVIDENCE 影响 RoboThree 落地** | 6 (Q3, Q4, Q8, Q9, Q11, Q12) |
| **DEFER / 不影响 RoboThree** | 4 (Q10, Q14, Q16, Q17) |
| **安全 / 反模式识别** | 2 (Q1, Q15) |
| **上下文知识** | 2 (Q13, Q18) |
| **集成层（Langfuse/Computer-Use/Skill loader）** | 4 (Q2, Q5, Q6, Q7) |

**Next Step Recommendation**：
- 若 RoboThree 决定 v0.2+ 加 MCP 集成，则 Q4 + Q3 优先级高
- 若 RoboThree v0.1 需要完整 Skill 系统，则 Q2 优先级高
- Q5（4 种压缩策略对比）影响 Context 模块
- Q11（StreamingToolExecutor vs runTools 选择）影响 Tool Runtime 行为
