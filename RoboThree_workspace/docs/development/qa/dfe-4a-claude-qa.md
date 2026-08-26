# DFE-4A — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-16-2308-version-dfe-4a` |
| 验收对象 | DFE-4A：智能中心浏览与详情（机器人 / 技能 / 工具三类列表与详情） |
| 日期 | 2026-08-16 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / Electron 43 / Vite 8 / Vue 3.5 |
| 开发版本 | Desktop `0.0.0-dfe.4a`；Core/Contracts `0.0.0-dfi.1a`；Root/Central `0.0.0-arh.3.3.3-repair.1`；Document Worker `0.0.0-pdt.2` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 182 files / 1225 tests + 3 smoke（独立复跑） |

DFE-4A focused（5 files / 13 tests）已含于 check。

---

## 二、重点核查项（DFE 计划 §DFE-4A 交付 + 真实/Mock 分层 + 标签规范）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 机器人接真实、技能/工具用 Mock | ✅ `intelligence-adapter.ts` 只调用 `listAgents` / `listModels`，技能/工具返回 `mockSkills` / `mockTools`（明确标注 `sourceLabel: "Mock 目录"` / `"待 DFE-4B"`） |
| 2 | 无新增 IPC | ✅ adapter 仅两个 Renderer-safe 高层 API，无新增 channel/Contract/Core |
| 3 | 机器人卡片不显示状态标签 | ✅ 卡片字段为 source/skillCount/toolCount/createdByMe，无 status 字段、无 `R3StatusBadge` |
| 4 | 技能不显示旧分类标签 | ✅ `skillScopeTabs` = 技能广场 / 已安装 / 本地目录 / 我创建的，无"企业/部门/分类"标签 |
| 5 | 工具风险/生命周期用中性标签 | ✅ `<R3Tag tone="neutral">` 渲染 `riskLabel` / `lifecycleLabel`（列表 + 详情两处均为 neutral，非语义色） |
| 6 | Mock 明确标注 | ✅ 技能/工具详情页有 `<R3Tag tone="neutral">Catalog projection pending</R3Tag>` + `<R3InlineNotice tone="warning">目录接入边界</R3InlineNotice>` |
| 7 | 创建入口禁用 | ✅ `创建机器人` / `创建技能` 均为 `<R3Button disabled>`，描述明确"等待 DFE-4B 的独立授权" |
| 8 | `artifact.preview` 不冒充模型 Tool | ✅ `modelCallable: false`，描述"这是应用能力，不是模型可调用 Tool" |
| 9 | 边界无漂移 | ✅ `window.robothreeDesktop` 仅 4 处（intelligence/tasks/workbench adapter + legacy）；无 workspaceRoot/rootRealPath/selectionHandle/selectedPath；DFI workspace-browser 标识零命中 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFE-4A 正确实现智能中心浏览与详情：机器人接真实 `listAgents`、技能/工具用明确 Mock inventory（待真实
Catalog Projection 后按模块替换）、机器人卡片无状态标签、技能无旧分类标签、工具风险/生命周期用中性
标签、创建入口禁用留待 DFE-4B、`artifact.preview` 不冒充模型 Tool。`CI=true pnpm run check` 182 files /
1225 tests + 3 smoke 独立复跑通过，无生产边界漂移。

**DFE-4A 可进入用户接受流程。DFE-4B～DFE-6 与 DFI-1B～DFI-4 保持 GATED。**

— Claude Code（独立 QA，只读）
