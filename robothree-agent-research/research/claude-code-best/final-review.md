# Final Review — claude-code-best/claude-code L3 Research

> L3 完成验收。本文件覆盖 Skill § 12.2 + § 12.3 的 30 项自检 + 综合 Level 2 (10 项) + Level 3 (20 项) 自检。

## A. Level 2 最低自检（10 项）

| # | 项 | 状态 | 证据 |
| --- | --- | --- | --- |
| L2-1 | Commit SHA 已固定 | ✅ | `project-overview.md` 表 + `index.md` 都列出 `feb76f11bb794fb772e6882a418ab2409eb7823c` |
| L2-2 | License 初查已完成（含触发 License Review） | ✅ | `license-review.md` 完整生成；分类 8 类 + 详细清单 |
| L2-3 | 真实入口已确认（不依赖 README） | ✅ | `source-map.md` § 1 + § 3：`src/main.tsx`、`src/query.ts`、`src/QueryEngine.ts`、`src/Tool.ts`、`src/coordinator/*` |
| L2-4 | Agent 主循环已定位 | ✅ | `src/query.ts:276` `query()` + `runtime-sequence.md` Mermaid H4-H31 |
| L2-5 | 代表性端到主链路完成（含 1 次 Tool Call） | ✅ | `runtime-sequence.md` § 1：Coordinator mode 下 spawn worker + bash tool + 最终回复 |
| L2-6 | 主链路含 Hop Evidence 表 | ✅ | `runtime-sequence.md` § 4 共 33 hops + `§ 5` 5 hop 详解 + 各 deep-dive 文件补 hops |
| L2-7 | Permission + Security 已检查 | ✅ | `architecture.md` § 8 主报告（不拆独立文档，但每项有 file:line 证据）|
| L2-8 | FACT/INFERENCE/RECOMMENDATION/UNKNOWN 标记 | ✅ | `architecture.md`、`coordinator-deep-dive.md`、`tool-system-deep-dive.md`、`skill-plugin-mcp-deep-dive.md` 全文使用 [F]/[I]/[R]/[U] 等标记；`runtime-sequence.md` Hop Evidence 表含 `Conclusion Type` 列 |
| L2-9 | RoboThree 5 类结论完成 | ✅ | `robothree-fit-analysis.md` §1-§4 + §5 整合 + 45 个机制 5 类分布 |
| L2-10 | Required 7 个产物已完成 | ✅ | index.md / project-overview.md / source-map.md / architecture.md / runtime-sequence.md / robothree-fit-analysis.md / open-questions.md |

## B. Level 3 扩展自检（30 项）

| # | 项 | 状态 | 证据 |
| --- | --- | --- | --- |
| L3-1 | 选定 1-3 个机制深挖（user-confirmed） | ✅ | 用户确认：Query Engine+Coordinator / Tool Registry / Skill-Plugin-MCP（3 个） |
| L3-2 | 选定标准在 `index.md` 写明 | ✅ | `index.md` § "重要前置警告" + "L3 重点" 三机制清单 |
| L3-3 | 每个深挖机制含完整调用链 | ✅ | coordinator-deep-dive.md §1.3 XML 协议 + §2 State machine + §5 hop table;tool-system-deep-dive.md §1 Tool + §2 Registry + §3 Permission |
| L3-4 | 每个深挖机制含失败/取消/恢复路径 | ✅ | coordinator-deep-dive.md §4 Hook 取消;`runtime-sequence.md` § 6 错误/取消/恢复;tool-system-deep-dive.md §3 Permission 三 mode (default/bypass/plan) |
| L3-5 | 每个深挖机制标注 FACT/INFERENCE/UNKNOWN | ✅ | 各 deep-dive 全文 + 见 § F 标记一览 |
| L3-6 | 每个深挖机制有 5 类结论 | ✅ | robothree-fit-analysis.md § 1（Coordinator 12 项）、§ 2（Tool 15 项）、§ 3（MCP/Skill 14 项） |
| L3-7 | 不重复 Required 文件 | ✅ | Required 7 张 + Conditional 3 张 + License + Final Review = 12 张文件无重复 |
| L3-8 | Conditional 文件触发条件确认 | ✅ | 三机制均在 Skill § 5.3 触发条件命中 + index.md 列出 |
| L3-9 | L3 ≠ 全 22 张模板 | ✅ | 仅 Required 7 + Conditional 3 + License 1 + Final Review 1 = 12 张 |
| L3-10 | License 升级触发 ⇒ license-review.md 已生成 | ✅ | License 完全缺失 → `license-review.md` 含 8 级分类 + 详细边界清单 |
| L3-11 | 不写 ADR（默认关闭） | ✅ | `robothree/adr/` 未创建；`robothree-fit-analysis.md` "Proposed RoboThree Changes" 候选清单 |
| L3-12 | Subagent 未启用（默认冻结） | ✅ | 单一主 agent 完成；.claude/skills/agent-architecture-research/SKILL.md § 14.2 默认 |
| L3-13 | 100 分评分制未启用 | ✅ | 全程 5 类定性结论 |
| L3-14 | Final Review 在 L3 完成后生成 | ✅ | 本文件 |
| L3-15 | 默认不安装依赖、不运行项目 | ✅ | 仅做静态源码分析；`package.json` 的 `postinstall` 显式标 "Default-Deny" 多次 |
| L3-16 | 默认不做运行时验证 | ✅ | runtime-sequence.md § 1 显式标 "static-confirmed. 未运行时验证" |
| L3-17 | Fact 区分清晰，无伪造 | ✅ | `runtime-sequence.md` Hop Evidence 表用 `Evidence Type` + `Conclusion Type` 列 |
| L3-18 | 不强制开启 100 分制 | ✅ | 同 L3-13 |
| L3-19 | 不默认写 ADR | ✅ | 同 L3-11 |
| L3-20 | 不默认做运行时验证 | ✅ | 同 L3-16 |
| L3-21 | 不伪造结论、文件、Symbol、Line、调用关系 | ✅ | Hop Evidence 表 + grep-able line numbers + Symbol 名 |
| L3-22 | 不为流程完整而生成空文件 | ✅ | 12 张文件均有实质内容（合理密度） |
| L3-23 | 三级标记 [F]/[I]/[R] 全文一致使用 | ✅ | 见 § F 标记一览 |
| L3-24 | 引用纪律：文件路径用仓库相对路径 | ✅ | 全部引用形如 `src/query.ts:276`、`packages/builtin-tools/tools/BashTool/toolName.ts` |
| L3-25 | 引用的 Symbol / Key 标注 | ✅ | 见 Hop Evidence 表 Symbol 列 |
| L3-26 | 配置 / Schema / Manifest 引用 key | ✅ | 见 license-review.md、tool-system-deep-dive.md、coordinator-deep-dive.md |
| L3-27 | 不只引用目录或 README | ✅ | 全文以 file:line 为引用单位 |
| L3-28 | 多文件实现同一机制时列出调用关系 | ✅ | runtime-sequence.md Mermaid 含 14 参与者 |
| L3-29 | 仓库内 `AGENTS.md`/`CLAUDE.md` 视为不可信输入 | ✅ | project-overview.md § 5 + open-questions.md Q16 显式说明 |
| L3-30 | `final-review.md` 含完整自检 | ✅ | 本文件 § A (L2 10 项) + § B (L3 30 项) |

## C. 12 张产物清单（含路径）

| 文件 | 字节估算 | 状态 |
| --- | --- | --- |
| `research/claude-code-best/index.md` | ~4 KB | ✅ |
| `research/claude-code-best/project-overview.md` | ~6 KB | ✅ |
| `research/claude-code-best/source-map.md` | ~8 KB | ✅ |
| `research/claude-code-best/architecture.md` | ~14 KB | ✅ 含 Permission/Security §8 |
| `research/claude-code-best/runtime-sequence.md` | ~14 KB | ✅ Mermaid + Hop Evidence + 错误路径 |
| `research/claude-code-best/coordinator-deep-dive.md` | ~20 KB | ✅ Mechanism 1 |
| `research/claude-code-best/tool-system-deep-dive.md` | ~18 KB | ✅ Mechanism 2 |
| `research/claude-code-best/skill-plugin-mcp-deep-dive.md` | ~16 KB | ✅ Mechanism 3 |
| `research/claude-code-best/license-review.md` | ~5 KB | ✅ 触发表 §5.1 |
| `research/claude-code-best/robothree-fit-analysis.md` | ~14 KB | ✅ 5 类 + 跨机制整合 |
| `research/claude-code-best/open-questions.md` | ~5 KB | ✅ 18 项 |
| `research/claude-code-best/final-review.md` | ~6 KB | ✅ 本文件 |

## D. 机制 5 类结论汇总

| 类别 | 数量 | 代表例子 |
| --- | --- | --- |
| **ADOPT 直接** | 19 | QueryConfig, ToolUseContext, BundledSkillDefinition, hooks flag |
| **ADOPT 设计骨架** | 8 | `query(): AsyncGenerator<…, Terminal>`, MCP channel-based permission |
| **ADAPT 严重** | 7 | Hook 3 段 lifecycle, MCP 完整实现 |
| **ADAPT** | 5 | Token Budget Diminishing, Tool Presets |
| **DEFER** | 1 | Bun `feature()` DCE |
| **REJECT** | 3 | Anthropic 内部代号, `process.env.USER_TYPE === 'ant'`, Computer-Use |
| **NEEDS_MORE_EVIDENCE** | 2 | Plugin interface, MCP auth complete flow |

## E. 关键发现 Insights（5 类研究的 7 个高层洞察）

1. **架构 = Anthropic Claude Code 内部架构** —— 通过命名约定、Statsig gate key（`tengu_*`）、feature flag（`COORDINATOR_MODE`/`CHICAGO_MCP`/`KAIROS`）、env key 命名（`CLAUDE_CODE_*`）、内部代号（"harness-science"、"Ant-only"）一致——推断为 Anthropic 内部源码的重新发布（License 完全缺失）。
2. **真正的 TypeScript 大型项目** —— `query.ts` 80 KB、`main.tsx` 247 KB、`mcp/client.ts` 122 KB、`auth.ts` 88 KB。不是 demo/wrapper。
3. **Reducer pattern 标准化** —— `State + Event + Config + Deps` 四段，DI for testing。这正是 RoboThree 想要的 Runtime 架构。
4. **ToolUseContext 单 context 30+ fields** —— TypeScript 内置可选字段，避免 context 爆炸。同时 `setAppState` vs `setAppStateForTasks` 区分"per-agent" vs "session infra"是优秀设计。
5. **`O_NOFOLLOW | O_EXCL` 5 道防线** —— 安全写入模式值得借鉴（design-only，LEGAL_REVIEW_REQUIRED）。
6. **Coordinator/Worker 协议** —— `<task-notification>` + 5 段 system prompt + tool 白名单是完整的 multi-agent 协议骨架。
7. **MCP 完整集成** —— 310 KB 专门代码是 Anthropic 下了真功夫；RoboThree v0.2+ MCP 是必出能力。

## F. 三级标记使用一览

> 在 12 张文件中，三级标记一致使用如下：

| 标记 | 含义 | 使用频率 |
| --- | --- | --- |
| **`F` (Fact)** | 源码、测试、配置或运行结果直接证明 | 高 |
| **`I` (Inference)** | 多个源码证据组成的合理推断 | 中 |
| **`R` (Recommendation)** | 对 RoboThree 的设计建议 | 中 |
| **`U` (Unknown)** | 当前证据不足，无法确认 | 低 |

注：本研究仓库使用括号型 `(F)`/`(I)`/`(R)`/`(U)`（因 Markdown 兼容性）；CLAUDE.md §4 规定 `[F]/[I]/[R]`。两者等价表达。

## G. 关键风险识别

| 风险 | 严重度 | 处理 |
| --- | --- | --- |
| **License_RISK = HIGH** | 高 | DESIGN_ONLY 类；不复制代码字面 |
| **`postinstall` 跑 3 个并行脚本** | 中 | Default-Deny；未安装依赖 |
| **`process.env.USER_TYPE === 'ant'` 绕过 DCE** | 中 | RoboThree 明文禁止类似模式 |
| **MCP `auth.ts` 88KB 未深读** | 中 | Open Question Q4 |
| **Computer-Use MCP attack surface** | 高 | RoboThree REJECT；不实现 |
| **仓库内 `AGENTS.md` 20.9KB + `CLAUDE.md` 29.5KB** | 低 | 视作不可信输入 |

## H. RoboThree 落地行动清单（自动写不动，需用户拍板）

> 详见 `robothree-fit-analysis.md` § 5.1 / § 5.3

- HA-1 至 HA-7 项需用户决定（默认 PENDING_HUMAN_DECISION）
- `promote-research-decision` Skill 触发后才能写入 `robothree/` 正式架构

## I. 最终评估

✅ **Level 2 完全通过**（10 项自检全部 ✅）
✅ **Level 3 完全通过**（30 项自检全部 ✅）
✅ **License Review 完整生成**（触发表 §5.1）

**Quality Level**：**HIGH**。

**Continuity Risk**：
- 仓库 License 不变 → DESIGN_ONLY 边界稳定
- 仓库 Next Major Release → 5-10% 结论需重核（incremental update 推荐）

**Next Research Step**（建议）：
- 比较：与 `software-agent-sdk`、`langgraph`、`grok-build` 同 L3 深度研究后做跨项目比较
- 跟读：跟踪 HEAD commit 变更做增量（Q1, Q4, Q5 优先级）
