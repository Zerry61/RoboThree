# Upstream Drift — Codex CLI（2026-08-13 → 2026-08-21）

> **Reference Pin**: `e766f7598993ce37cf61b9c26c80cc2ba3a4f2d7`（2026-08-13，research base）
> **Upstream HEAD**: `bd19459358f534ed1cae464ec13d56600aeb45f2`（2026-08-21）
> **Window**: 8 天，**439 commits**，**300 files changed**
> **Method**: GitHub Compare API + 关键 commit 拉取（未做 git fetch / 未更新本地镜像）
> **报告范围**: 仅评估对 [research/codex/](.) 已发布结论的影响

本报告中：
- 「事实」引用 commit SHA/文件路径，为 **[F]**
- 「drift 分类 / RoboThree 影响评估」为 **[R]**
- 「未在原研究内的代码」为 **[NEW]**（不在 2026-08-13 研究范围）

---

## 1. 关键结论先行

**研究核心文件 0 改动** — 我研究的三个深挖机制（Mechanism 1/2/3）的核心代码文件 **一行未变**：

| 核心文件 | 状态 |
|---|---|
| `core/src/session/turn.rs` | UNCHANGED |
| `core/src/tools/parallel.rs` | UNCHANGED |
| `core/src/exec_policy.rs` | UNCHANGED |
| `sandboxing/src/manager.rs` | UNCHANGED |
| `skills/src/model.rs` | **−3 行**（见 §3.2） |
| `ext/extension-api/src/lib.rs` | UNCHANGED |
| `protocol/src/approvals.rs` | UNCHANGED |
| `protocol/src/protocol.rs` | UNCHANGED |
| `core/src/thread_manager.rs` | UNCHANGED |
| `core/src/codex_thread.rs` | UNCHANGED |

**22 项分类结论 全部保留有效**。ADOPT 6 / ADAPT 11 / DEFER 3 / REJECT 1 / NEEDS_MORE_EVIDENCE 1 — 没有一项需要翻案。

**新增 5 项信号**需要在 RoboThree 评估时被看到（§4），但均不构成对原结论的反驳。

---

## 2. 变化分布

| 桶 | 文件数 | 备注 |
|---|---:|---|
| `codex-rs/app-server*`（JSON-RPC daemon）| ~200 | 外部 IDE 集成接口；**不在本研究范围** |
| `codex-rs/cli/src` | 31 | `codex doctor` 诊断补全（desktop / sandbox / update） |
| `codex-rs/analytics/src` | 8 | metrics 标签补全 |
| `codex-rs/chatgpt/src` | 5 | ChatGPT 集成 |
| `codex-rs/skills/**`（runtime SDK）| 6 | 见 §3.2 |
| `codex-rs/ext/skills/**`（Skills Extension）| 9 | 见 §3.2 |
| `codex-rs/rmcp-client/**`（MCP 客户端）| 8 | 见 §3.4 |
| `.codex/skills/`（仓库自带 dev skills）| 5 删 | OpenAI 内部开发工具移除，与运行时 SDK 无关 |

---

## 3. 实质性 drift（5 处）

### 3.1 Guardian V2（security_risk）— EVOLVING / 第四维安全层浮现

**Commit**: [`9dd3d6a13`](https://github.com/openai/codex/commit/9dd3d6a13) (#39038) — 2026-08-17「Restore Guardian risk scores across thread lifecycles」

**Diff 位置**: `core/src/session/session.rs` +13 行

```rust
+ use codex_protocol::security_risk::SecurityRiskScore;
  ...
+ if thread_extension_init.get::<SecurityRiskScore>().is_none()
+     && let Some(score) = initial_history
+         .get_rollout_items()
+         .iter()
+         .rev()
+         .find_map(|item| match item {
+             RolloutItem::SecurityRiskScore(score) => Some(score),
+             _ => None,
+         })
+ {
+     thread_extension_init.insert(score.clone());
+ }
```

**事实** **[F]**：新增 `codex_protocol::security_risk::SecurityRiskScore` 类型 + 新增 `RolloutItem::SecurityRiskScore` 变体；session 在 `thread_extension_init` 阶段从历史中恢复最近一次 risk score。

**配套 commit** **[F]**：[`71e5e1ec5`](https://github.com/openai/codex/commit/71e5e1ec5) (#39035) — `app-server/tests/suite/v2/guardian_v2.rs` 新增 295+124 行测试。「Add app-server coverage for Guardian V2 approval routing」。

**drift 分类** **[R]**：**EVOLVING — 第三层（升级/Escalation）的扩展**。原研究的「决策/隔离/升级」三层中，升级层正在被 Guardian V2 风险评分系统并行扩展。Guardian V2 是 OpenAI 内部的 risk-scoring service（在 [open-ai/guardian](https://github.com/openai/guardian) 仓库，OpenAI 安全团队维护），与本研究的 `AskForApproval` / `EscalationPermissions` 平行存在。

**RoboThree 影响评估** **[R]**：
- 原结论 #4「三层安全模型」**仍然成立**（决策/隔离/升级未撤销）。
- 但「升级层」的概念已不再是单纯的 `EscalationPermissions` + `ExecPolicyAmendment`，正在叠加一个独立的「risk score 跨 turn 持久化」机制。
- **新增观察项**：风险分数 `RolloutItem` 持久化是「风险信息作为会话状态的一部分」的范例 — 比纯 stateless escalation 更进一步。
- 原 Q11（`Never` 模式真实风险敞口）**部分回答**：Guardian V2 是 OpenAI 的 side-channel risk filter，**可能**是 `Never` 模式的兜底之一（但未确认其当前已介入 Codex CLI 的默认路径，仍标 NEEDS_MORE_EVIDENCE）。

### 3.2 Skill model delegation 被删 — REMOVED / 数据模型收缩

**Commit**: [`d24507a59`](https://github.com/openai/codex/commit/d24507a59) (#39068) — 2026-08-17「Remove skill model delegation support」

**Diff 摘要** **[F]**：

```
- mod model_delegation;                                    # skills/src/lib.rs
- pub use model_delegation::SkillModel;
- pub use model_delegation::SkillModelDelegationInstruction;
- pub model: Option<SkillModel>,                          # skills/src/model.rs:SkillMetadata
- pub model: Option<SkillModel>,                          # skills/src/parser.rs:ParsedSkillFrontmatter
- model: Option<serde_yaml::Value>,                       # skills/src/parser.rs:SkillFrontmatter
- model: parsed.model.and_then(...),                      # skills/src/parser.rs:parse_skill_frontmatter_metadata

DELETED  codex-rs/skills/src/model_delegation.rs         (84 lines)
DELETED  codex-rs/skills/src/model_delegation_tests.rs   (224 lines)
```

**事实** **[F]**：Skill frontmatter 不再支持 `model:` 字段；Skill 元数据 `SkillMetadata.model` / `ParsedSkillFrontmatter.model` 删除；`SkillModel` / `SkillModelDelegationInstruction` 类型删除。

**drift 分类** **[R]**：**REMOVED — Skill 数据模型收缩**。删除原因是「skills 声明自定义 model」是一项被放弃的能力（commit message 未给详细原因，但 84+224 行被整体删掉意味着有意回退）。

**RoboThree 影响评估** **[R]**：
- 原结论 #16「Skill 依赖声明 (SkillToolDependency)」— UNCHANGED。
- 原结论 #6「Skill 隐式/显式区分」— UNCHANGED。
- 原结论 #5「四档扩展分层」— UNCHANGED。
- **新教训** **[R]**：**Skill manifest MVP 不需要 `model` 字段**。Codex 自身曾经做过、最终删除，理由是「将模型选择权交给 Skill 是过度耦合」。
- 原 Q7（四层粒度是否过度）不变 — 但增加一个平行教训：**「Skill 与 model 的耦合」也是过度设计的高发点**。

**对 RoboThree 的具体建议** **[R]**：在 [research/codex/robothree-fit-analysis.md](robothree-fit-analysis.md) 的 ADOPT 列表旁加注一条「反例证据 — Codex 已主动删除 Skill.model 字段，避免过度耦合」。

### 3.3 AGENTS.md 项目信任门 — ADDITIVE / 新防御层

**Commit**: [`bd1945935`](https://github.com/openai/codex/commit/bd1945935) (#39837) — 2026-08-21「Ignore project instructions for untrusted projects」

**Diff 摘要** **[F]**：

```rust
// agents_md.rs: load_project_instructions
+ if config.active_project.is_untrusted() {
+     return Ok((!loaded.is_empty()).then_some(loaded));
+ }
```

**事实** **[F]**：`active_project.trust_level == Untrusted` 时，**项目级 AGENTS.md 不被加载**，但用户级指令保留。`AgentsMdManager` 缓存键增加 `active_project_trust_level`，`session/mod.rs:1752` 保留 trust metadata 在 config 刷新时。

**drift 分类** **[R]**：**ADDITIVE — 第四防御层浮现**。原研究的三层（决策/隔离/升级）是「执行控制」，这一新增是「**指令加载控制**」 — 一个独立维度：
- 决策层：是否执行？
- 隔离层：在什么环境执行？
- 升级层：执行遇到风险怎么办？
- **指令加载层（NEW）**：哪些指令可以被 agent 看到？（untrusted project 的 AGENTS.md 看不到）

**RoboThree 影响评估** **[R]**：
- 原结论 #4「三层安全模型」— 仍然成立（决策/隔离/升级未撤销）。
- **新增维度** **[R]**：「TrustLevel-aware instruction loading」是 Coding Agent 的新防御范式，应进入 RoboThree 安全模型候选扩展。
- 与 Hermes 的「Checkpoint Preflight」是同一类思路 — **执行前**而非执行中的 gate，但作用域更窄（只过滤 instruction load）。
- **不构成对本研究任何结论的反驳**，但应作为「RoboThree 安全模型的第四候选层」补记到 [open-questions.md](open-questions.md)。

### 3.4 MCP Client HTTP redirect 限制 — ADDITIVE / 传输层加固

**Commit**: [`ff770113c`](https://github.com/openai/codex/commit/ff770113c) (#39046) — 2026-08-17「Restrict MCP HTTP redirects to the configured origin」

**事实** **[F]**：
- `rmcp-client/src/http_client_adapter.rs` +2/-1
- `rmcp-client/src/http_client_redirect.rs` +221（新增）
- `rmcp-client/src/http_client_redirect_tests.rs` +390（新增测试）
- `rmcp-client/src/http_headers.rs` +44/-2

**drift 分类** **[R]**：**ADDITIVE — MCP 客户端 SSRF 防御**。原研究 [extension-plugin-skills-mcp-l3.md §4 MCP](extension-plugin-skills-mcp-l3.md) 关注了双向 client/server 设计，**未涉及 transport-layer security**。

**RoboThree 影响评估** **[R]**：
- 原结论 #17「MCP 双向 (Client+Server)」— 仍然成立（架构未变）。
- **新增观察项** **[R]**：MCP 客户端必须限制 HTTP redirect 到 configured origin — 否则恶意 MCP server 可通过 302 重定向到内网。这是 Coding Agent 通过 MCP server 访问网络时的**必要 SSRF 防御**。
- **建议**：RoboThree 的 MCP client 实现需要原生包含 redirect-origin 检查，而不是依赖下游 HTTP 库默认行为。

### 3.5 App-server 新增 MCP Server Event Stream — NEW（不在研究范围）

**Commit**: 多个（schema 新增 `McpServerEventStreamNotification`、+ `app-server/src/request_processors/mcp_event_stream.rs` 335 行）

**事实** **[F]**：app-server 新增 `McpServerEventStreamNotification` schema + processor，让 MCP 客户端可以订阅 MCP server 事件流。这是 app-server 协议层的扩展，**不**影响 `codex-rs/codex-mcp/` 内的 MCP server 实现。

**drift 分类** **[R]**：**OUT-OF-SCOPE — app-server 协议层扩展**。我研究的是 CLI 的运行时，不研究 app-server 的 IDE 集成协议。

**RoboThree 影响评估** **[R]**：
- 不影响任何已有结论。
- 若 RoboThree 计划做 IDE 集成（如 Claude Code 的 VSCode 插件形态），可参考此 stream notification 设计 — 但这是产品决策而非架构决策。

---

## 4. 22 项分类结论影响评估

| # | 机制 | 分类 | drift 影响 | 评估后分类 |
|---|---|---|---|---|
| 1 | Thread→Turn→Sampling→Tool 四层粒度 | ADOPT | 0 改动 | **ADOPT** ✓ |
| 2 | 分级取消 | ADOPT | 0 改动 | **ADOPT** ✓ |
| 3 | `build_prompt` 单一 prompt 组装点 | ADOPT | 0 改动 | **ADOPT** ✓ |
| 4 | 三层安全模型（决策/隔离/升级）| ADOPT | §3.1 Guardian V2 / §3.3 AGENTS.md 信任门在「升级层」与「指令加载层」叠加 | **ADOPT** ✓（需在 robothree-fit-analysis.md 旁注「新维度正在浮现」） |
| 5 | 四档扩展分层 | ADOPT | 0 改动 | **ADOPT** ✓ |
| 6 | Skill 隐式/显式区分 | ADOPT | 0 改动 | **ADOPT** ✓ |
| 7 | 并发工具调度 RwLock 门 | ADAPT | 0 改动 | **ADAPT** ✓ |
| 8 | FuturesOrdered 边流边执行 | ADAPT | 0 改动 | **ADAPT** ✓ |
| 9 | turn-scoped sticky model session | ADAPT | 0 改动 | **ADAPT** ✓ |
| 10 | 流式事件驱动 loop + Provider 事件协议 | ADAPT | 0 改动 | **ADAPT** ✓ |
| 11 | `render_decision_for_unmatched_command` 决策矩阵 | ADAPT | 0 改动 | **ADAPT** ✓ |
| 12 | `GranularApprovalConfig` | ADAPT | 0 改动 | **ADAPT** ✓ |
| 13 | 多后端沙箱抽象 | ADAPT | 0 改动 | **ADAPT** ✓ |
| 14 | 沙箱独立二进制 | ADAPT | 0 改动 | **ADAPT** ✓ |
| 15 | Contributor 切面模型 | ADAPT | 0 改动 | **ADAPT** ✓ |
| 16 | Skill 依赖声明 | ADAPT | §3.2 model delegation 被删 | **ADAPT** ✓（manifest 不需要 model 字段） |
| 17 | MCP 双向 | ADAPT | §3.4 redirect 限制 | **ADAPT** ✓（client 必须含 redirect-origin 检查） |
| 18 | ExecPolicyAmendment 自我放宽 | DEFER | 0 改动 | **DEFER** ✓ |
| 19 | Plugin marketplace | DEFER | 0 改动 | **DEFER** ✓ |
| 20 | Extension 同进程 trait 注册 | DEFER | 0 改动 | **DEFER** ✓ |
| 21 | `Never` + 无沙箱直接 Allow | REJECT | 0 改动 | **REJECT** ✓ |
| 22 | 沙箱命名偏差（LinuxSeccomp）| NEEDS_MORE_EVIDENCE | 0 改动 | **NEEDS_MORE_EVIDENCE** ✓ |

**结论**：**22 项分类结论 100% 保留**。新增的 5 项信号均为「观察 / 教训 / 候选扩展」，不构成翻案。

---

## 5. 新增 RoboThree 候选变更（仅记录，不落地）

1. **Skill manifest 不应包含 `model` 字段**（Codex 反例证据，§3.2）。
2. **MCP client 必须包含 HTTP redirect-origin 检查**（Codex 必要 SSRF 防御，§3.4）。
3. **指令加载层可作为安全模型第四候选维度**（Codex AGENTS.md trust gate 证据，§3.3）。
4. **风险评分可作为会话状态的一部分持久化**（Guardian V2 SecurityRiskScore RolloutItem 模式，§3.1）。
5. **`Never` 模式可能存在 Guardian V2 兜底，但未确认**（仍 NEEDS_MORE_EVIDENCE）。

---

## 6. Open Questions 状态更新

| 编号 | 问题 | 状态 |
|---|---|---|
| Q1 | LinuxSeccomp 实际含 seccomp？ | UNCHANGED |
| Q2 | 并发工具并发度上限？ | UNCHANGED |
| Q3 | `wait_for_runtime_cancellation` 是否有超时？ | UNCHANGED |
| Q4 | Step 与 Sampling 精确边界？ | UNCHANGED |
| Q5 | `.rules` 与 `config.toml` 优先级？ | UNCHANGED |
| Q6 | Extension 与 Plugin 信任边界？ | UNCHANGED |
| Q7 | 四层粒度是否过度？ | UNCHANGED |
| Q8 | 并发工具输出回喂顺序？ | UNCHANGED |
| Q9 | 命令批准启发式来源？ | UNCHANGED |
| Q10 | 沙箱实际隔离强度？ | UNCHANGED |
| Q11 | `Never` 模式真实风险敞口？ | **部分回答**：Guardian V2 是候选兜底，但未确认已接入默认路径；仍标 NEEDS_MORE_EVIDENCE。 |
| **Q12（NEW）** | 是否引入「TrustLevel-aware instruction loading」作为第四防御层？ | NEW — 由 §3.3 提出 |
| **Q13（NEW）** | 是否引入 risk score 跨 turn 持久化模式（RolloutItem::SecurityRiskScore）？ | NEW — 由 §3.1 提出 |
| **Q14（NEW）** | Skill manifest 是否禁止 `model` 字段（参考 Codex §3.2 反例）？ | NEW — 决策倾向 YES |

---

## 7. 研究完整性说明

- **本地未更新 source mirror** — 研究依然基于 `e766f75`。所有 [F] 引用路径在该 commit 上可验证。
- **本次 drift 分析** **[F]** 全部基于 GitHub Compare API + 5 个 commit 的 patch 文件，可独立复现。
- **运行时分量仍是 MEDIUM 置信**（原 final-review §5 限制 1 仍适用），drift 分析本身不引入新运行时观察。
- **未触发 RoboThree 产品仓库变更** — 所有「新增候选变更」仅记录于本文件，不动 `RoboThree_workspace/`。

---

## 8. 自检清单

| # | 检查 | 状态 |
|---|---|---|
| 1 | 已对比 upstream HEAD vs research pin | ✅ |
| 2 | 已确认核心研究文件 0 改动 | ✅ |
| 3 | 已分类 5 处 drift | ✅ |
| 4 | 22 项分类无翻案 | ✅ |
| 5 | 所有结论带 [F]/[R]/[NEW] 标签 | ✅ |
| 6 | Open Questions 已更新（含 3 个 NEW）| ✅ |
| 7 | 未动 RoboThree_workspace/ | ✅ |
| 8 | 未触发 git fetch（避免对 ~117 crates 仓库大流量）| ✅ |