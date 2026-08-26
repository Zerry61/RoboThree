---
name: pm-weekly-report
description: |
  Generate the RoboThree project weekly PM report in the business-language
  "领导汇报版" format. Use this skill when the user says "写周报" / "出本周周报" /
  "weekly report" / "周报出来", or when the Monday 08:30 Asia/Shanghai cron
  self-reminder fires. Output goes to `pm-briefing/周报/RoboThree PM 周报YYYYMMDD.md`
  plus a TL;DR + 关键节点 + 风险/待办 push to the conversation. Do NOT use this
  skill for: one-off PM reminders, single risk reports, requirement change notes,
  or technical-detail weekly reports (those stay in discussion area or memory directly).
---

# PM 周报（领导汇报版）

## Inputs to collect

无前置输入。所有数据从 RoboThree 工作区扫：

- `RoboThree_workspace/docs/development/DEVELOPMENT-LOG.md` — 顶部 100 行
- `RoboThree_workspace/docs/architecture/KEY-NODES.md` — 末尾 30 行
- `RoboThree_workspace/CHANGELOG.md` — Unreleased 段
- `RoboThree_workspace/docs/development/qa/` — 本周新增的 `*-claude-qa.md`
- `讨论区/` — 本周 `2026MMDD-*.md`
- `pm-briefing/关键事项记录/` — 本周新增文件（用 mtime 过滤）
- `pm-briefing/周报/` 最新一份 — 作为"上周未完待续"参考

工作区根目录为 `~/Desktop/RoboThree/`。如果 `RoboThree_workspace` 不在当前会话，跳过；用对话上下文 + memory 推断。

## Procedure

1. **确定当前周次** — 用本机时区 Asia/Shanghai 取当前 ISO 周（W31 = 7/27~8/2）。原因：用户用 ISO 周表达"本周/上周"。

2. **读上一份周报** — `pm-briefing/周报/` 取 mtime 最新的文件。提取：
   - 上一份"风险与待办"里的"待你拍板"项（如果当时没拍板，本周 follow up）
   - 上一份"关键事项记录"和"需求变更"作为时间线锚点
   原因：周报要前后连贯，不重复说过的事。

3. **扫本周新增证据** — 聚合到 4 类：
   - **关键节点**：KEY-NODES.md 末尾新加的 `KN-NNN` 段
   - **代码批次**：DEVELOPMENT-LOG.md 顶部 `## 0.0.0-*` 段
   - **讨论区动态**：本周新增的 `2026MMDD-*.md` 数量 + 谁发的
   - **关键事项**：`pm-briefing/关键事项记录/` 本周新增文件清单
   原因：4 节模板要的就是这 4 类信号源。

4. **按模板生成 6 节** — 严格按以下顺序：
   - **TL;DR**（≤3 句，业务语言；用 "TL;DR" 还是 "摘要" 看用户最近反馈——目前 memory 默认是 "TL;DR"）
   - **本周完成的关键任务**（3-5 个 bullet，每条 1-2 句业务价值）
   - **关键节点**（表格：阶段 | 含义 | 状态）
   - **风险与待办**（P0 立刻推对话；P1 24h 汇总；P2 周报统一列）
   - **本周关键事项记录**（PM 自己用**一句话**总结每条事项；**不放超链接**；若无直接跳过）
   - **本周需求变更**（列出本周新增/改动的需求；若无直接跳过）
   - **整体进度**（百分比 + 分块进度表 + 关键说明）
   原因：用户已确认 4 节模板 + 2 个可选小节是定稿，不要再加新章节。

5. **写文件** — 路径：`pm-briefing/周报/RoboThree PM 周报YYYYMMDD.md`（YYYYMMDD = 出报告当天）。
   原因：用户明确指定路径和命名（2026-07-24 用户改）。

6. **推对话** — 推 3 块给用户：
   - TL;DR 一句话
   - 关键节点表
   - 风险/待办（P0/P1 立刻标红；P2 列清单）
   原因：cron 触发时用户不一定点开文件，先在对话里给关键信息。

## 业务语言规则（强制）

不写技术词，用业务表达。映射表：

- KN-024 / KN-025 → "关键节点" 表里"阶段"列
- v1alpha1 / v1alpha2 → "接口规范 / 架构决策"
- 48/394 / 41/342 → "全过" / "整体通过"
- Electron / Spring Boot → "桌面端" / "后端"
- TL;DR / CI / localhost → 业务版中文表达（CI 改"自动测试流水线"或省略）
- BEGIN IMMEDIATE / T2 CAS / migration N → 全部省略

原因：用户要求"领导汇报版"——产品/老板能读，不是给工程同学看。

## Output contract

- **文件**：`pm-briefing/周报/RoboThree PM 周报YYYYMMDD.md`（4-8KB）
- **对话**：TL;DR + 关键节点表 + 风险/待办 3 块
- **不写**：README、CHANGELOG、修订记录、代码批次、文档变更、附录、PM 流程纠偏（领导汇报版不要这些）

## Failure handling

- 找不到 `RoboThree_workspace/`：用对话上下文 + memory 推断；如果连 memory 都没有，停下问用户
- 找不到 `pm-briefing/周报/` 上一份：跳过"上周未完待续"步骤
- 工作区无 git：用 mtime 替代（RoboThree 当前无 git 仓库）
- 关键文件存在但内容不可读：跳过该数据源，继续生成
- 用户明确说"先不出周报"：跳过步骤 5-6，只在对话里说"已记下"

## Examples

**触发**：周一 08:30 cron 触发 / 用户说"出本周周报"

**输入**：工作区已有 W30 baseline v2.4 在 `pm-briefing/周报/RoboThree PM 周报20260724.md`

**输出**：
- 文件：`pm-briefing/周报/RoboThree PM 周报20260727.md`（5-7KB）
- 对话：TL;DR + 关键节点表 + 风险/待办（P1 用 🟠 标红）
