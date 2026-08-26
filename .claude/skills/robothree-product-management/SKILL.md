---
name: robothree-product-management
description: >-
  Use for RoboThree product-definition work: drafting or reviewing PRDs,
  defining prototype requirements, checking consistency across product
  requirements and architecture, designing acceptance criteria, or reviewing
  implementation evidence. Trigger for requests such as "完善这个功能需求",
  "看看这个 PRD 是否完整", "给设计师出原型需求", "分析架构影响",
  "写验收标准", or "根据证据出验收报告". Do not use for unrelated coding,
  generic PM advice, marketing, or commercial analysis.
---

# RoboThree 产品设计与验收

轻量级产品协作 Skill。三种模式，默认 Quick。

## 1. 三种工作模式

| 模式 | 触发 | 模板 |
| --- | --- | --- |
| **A. 功能补充与评审** | 完善 PRD / 评审需求 / 分析影响 | [`templates/feature-spec.md`](templates/feature-spec.md) |
| **B. 原型需求** | 原型需求 / 给设计师的需求 | [`templates/prototype-spec.md`](templates/prototype-spec.md) |
| **C. 验收设计与验收评审** | 写验收标准 / 汇总证据 / 出验收报告 | [`templates/acceptance.md`](templates/acceptance.md) |

多模式串行时按 A→B→C 顺序；仅关键决策（基线冲突、互斥方案、文件写入）暂停确认。

## 2. Quick 模式（默认）vs Full 模式

**Quick**：只输出必要章节；不强制矩阵、五态逐段标注、Evidence Manifest、完整追踪。

**Full**（用户明确要求"完整 PRD / 正式评审 / 正式验收"，或需求涉及 Contract 主版本变更、安全边界、高风险副作用、跨模块恢复时触发）：输出完整模板。

## 3. 适用范围 / 不适用范围

适用：Employee Workspace、Admin Console、Core Runtime/Tool/Skill/Agent Definition/Task/Policy/Approval/Event/Checkpoint 行为、Contract/Registry/ExecutionPlan/Worker/Artifact 需求澄清。

不适用：修改产品代码/Contract/ADR/开发日志/QA 报告；启动应用或执行测试（属于 [`independent-qa-acceptance`](../../independent-qa-acceptance/SKILL.md)）；业务增长/路线图/KPI；读取 `备注文件/`。

## 4. 工作原则

1. **以已确认事实为底**：回链到基线/KEY-NODES/ADR/Contract/CHANGELOG/DEVELOPMENT-LOG。无法回链标 `[OPEN]`。
2. **关键项分层标注**：需求来源、关键决策、推断、建议、待确认标注 `[FACT]/[DECISION]/[INFERENCE]/[PROPOSAL]/[OPEN]`；普通说明不要求。
3. **架构不变量检查**：对照 [`references/product-principles.md`](references/product-principles.md) source map。无意违反→`INVARIANT-VIOLATION`；主动变更→`BASELINE-CHANGE-PROPOSAL`。非冲突部分可继续。
4. **证据纪律**：证据定位支持文档 `path#heading`、代码 `path:line-line`、Contract `path#字段`、用户输入、截图、运行日志。无法定位标 `[OPEN]` 或 `[INFERENCE]`。
5. **产品名固定为 RoboThree**；不写 RoboWorker。

## 5. 使用前读取

按模式裁剪：

| 资料 | 路径 | A | B | C |
| --- | --- | --- | --- | --- |
| 工作区 README | `${PROJECT_ROOT}/README.md` | ✓ | ✓ | ✓ |
| 工程 README | `${CODE_ROOT}/README.md` | ✓ | ✓ | ✓ |
| 产品基线 | `docs/product/PRODUCT-ARCHITECTURE-BASELINE-v1.0.md` | ✓ | ✓ | — |
| KEY-NODES | `docs/architecture/KEY-NODES.md` | ✓ | — | ✓ |
| 已接受 ADR | `docs/adr/0*.md` (ACCEPTED) | ✓ | — | ✓ |
| Contract | `packages/contracts/src/**` | 按需 | — | ✓ |

## 6. 输入与澄清规则

最低输入：用户要解决的问题或已有材料。缺失信息默认标 `[OPEN]` 继续输出草稿。仅以下情况先澄清：存在互斥方案无法判断、会改变已确认安全边界、需写入文件但路径/版本不明、缺少信息导致验收结论失真。

## 7. 文件写入规则

默认不写文件，产物以 Markdown 回复呈现。用户明确要求时：写入 `RoboThree_workspace/docs/product/` 之下、不覆盖已有文件、写入前确认路径。

## 8. 与其他 Skill 的边界

- `architecture-convergence`：架构候选收敛 → 移交
- `promote-research-decision`：研究结论→正式文档 → 移交
- `independent-qa-acceptance`：启动应用/执行测试/收集运行证据 → 移交。本 Skill C 模式负责验收标准设计与证据汇总评审。

## 9. 完成前自检

- [ ] 已读取所需资料
- [ ] 关键事实/决策/推断/建议/待确认已标注
- [ ] 已对照 source map 不变量
- [ ] 未使用模糊措辞（"体验良好/功能正常/稳定可靠"）
- [ ] 未出现 RoboWorker；产品名统一 RoboThree
- [ ] 未修改产品代码/Contract/ADR/开发日志
- [ ] 未越权执行测试（C 模式）

## 10. 引用入口

| 主题 | 入口 |
| --- | --- |
| 产品原则 source map | [`references/product-principles.md`](references/product-principles.md) |
| 产品评审检查清单 | [`references/product-review-checklist.md`](references/product-review-checklist.md) |
| 验收规则（L1-L4 + 结论 + 缺陷等级） | [`references/acceptance-rules.md`](references/acceptance-rules.md) |
| 功能规格模板 | [`templates/feature-spec.md`](templates/feature-spec.md) |
| 原型规格模板 | [`templates/prototype-spec.md`](templates/prototype-spec.md) |
| 验收模板 | [`templates/acceptance.md`](templates/acceptance.md) |
| 端到端示例 | [`examples/end-to-end-example.md`](examples/end-to-end-example.md) |
