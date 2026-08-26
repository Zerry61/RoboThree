# RoboThree Workspace 与智能授权 Feature Spec

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | RoboThree Workspace 与智能授权 Feature Spec |
| 文档版本 | v1.0 |
| 更新日期 | 2026-08-16 |
| 文档状态 | **PRODUCT SEMANTICS FROZEN / CONTRACT AND CORE IMPLEMENTATION GATED** |
| 用户决策 | 智能授权是新任务输入框中的真实任务级选项，不是说明性摆设 |
| 适用范围 | Desktop 新任务 Composer、Task/Session、WorkspaceGrant、用户确认和 Core 授权决策 |
| 上位文档 | `PRD-ROBOTHREE-MVP.md`、`FRONTEND-EXPERIENCE-SPEC-v1.0.md` |
| 不直接定义 | 最终 Contract 文件名、数据库表、IPC channel、Core 类名和具体实现批次 |

---

## 2. 背景与结论

DFE-2A 已完成智能授权三模式的前端视觉，但当前 `submitTurn` v1alpha1 的
`TaskSelectionRequest` 没有授权模式字段，Core 也没有消费用户选择。可点击但不生效的选择器会误导
用户，因此在真实链路接通前只能展示带“待接入”标识的只读说明。

产品结论已经确认：

1. 智能授权最终必须是真实生效的任务级选择；
2. 当前临时只读状态只是发布过渡，不是最终产品形态；
3. WorkspaceGrant 决定文件访问硬边界，智能授权模式只决定该边界内的确认策略；
4. 前端不得静默丢弃用户选择，也不得自行模拟 Core 授权结果；
5. 接入真实选择器前，必须完成版本化 Contract、Core 策略、持久化恢复和端到端验收。

---

## 3. 核心概念

### 3.1 Workspace 授权范围

Workspace 授权范围由当前用户、`workspaceGrantId`、允许的文件操作和真实权限共同决定。它是所有
授权模式都不能突破的硬边界。

### 3.2 智能授权模式

智能授权模式是用户在创建任务时选择的确认偏好，用于决定已经通过固定权限、Workspace 和 Tool
风险校验的动作应直接执行、逐次确认，还是可以在当前任务的精确范围内复用确认。

### 3.3 有效授权决策

有效授权不得宽于以下交集：

```text
用户固定权限
∩ WorkspaceGrant
∩ Agent/Tool/Model 可用范围
∩ 企业与本机安全策略
∩ 当前任务智能授权模式
```

任一上游规则拒绝时，智能授权模式不得覆盖拒绝结果。

---

## 4. 三种模式

最终用户名称和产品语义固定如下：

| 用户名称 | 建议 Contract 值 | 行为 | 不可绕过边界 |
| --- | --- | --- | --- |
| 手动复核 | `manual_review` | Workspace 内普通读取可以直接执行；创建、修改及所有需要确认的风险动作逐次询问，确认结果不跨动作复用 | 不能扩大用户权限、Workspace 或 Tool 范围 |
| 智能确认（默认） | `smart_confirm` | Workspace 内普通读取、创建和修改直接执行；删除、批量覆盖、受保护资源、程序执行和外部发送逐次确认 | 目标、数据范围或风险事实变化时必须重新确认 |
| 任务内授权 | `task_scoped` | 普通 Workspace 操作直接执行；允许复用的动作首次确认后，可在当前任务、相同目标和相同数据范围内复用 | 不跨任务；删除、程序执行和权限拒绝始终不能自动放行；范围扩大必须重新确认 |

“工作区授权”不再作为模式名称。Workspace 是所有模式共同受限的授权范围，继续由项目空间选择器
和 WorkspaceGrant 表达；将其作为模式名称会混淆“访问范围”和“确认策略”。

### 4.1 动作矩阵

| 动作类别 | 手动复核 | 智能确认 | 任务内授权 |
| --- | --- | --- | --- |
| 授权 Workspace 内普通读取 | 直接执行 | 直接执行 | 直接执行 |
| 授权 Workspace 内普通创建、修改 | 每次确认 | 直接执行 | 直接执行 |
| 删除、批量覆盖、受保护资源 | 每次确认 | 每次确认 | 每次确认 |
| 程序或命令执行 | 每次确认 | 每次确认 | 每次确认 |
| 外部发送或模型外发 | 每次确认 | 每次确认 | 首次确认后仅在精确任务范围内复用 |
| Workspace 外访问或无权限 Tool | 拒绝 | 拒绝 | 拒绝 |
| 外部目标、数据范围或能力 revision 变化 | 重新确认或拒绝 | 重新确认或拒绝 | 重新确认或拒绝 |

是否属于普通创建/修改、受保护资源或允许复用的外发动作，由 Core 的类型化风险事实和策略决定，
前端不得根据文件名、按钮位置或 Tool 名称自行判断。

---

## 5. 生命周期

1. 用户在“新任务”输入框区域选择项目空间和智能授权模式；默认值为“智能确认”；
2. 首次提交时，Desktop 将 requested mode 与其他任务选择一起提交；
3. Core 校验权限、Workspace、能力和策略，形成 resolved mode；
4. requested mode 无法被满足时不得静默降级：提交失败并说明原因，或在提交前禁用该选项；
5. 任务创建成功后，resolved mode 与 Task/Runtime Selection 一起锁定；
6. 同一任务的后续对话继承该模式，MVP 不支持执行中切换；
7. 用户需要其他模式时创建新任务；后续如需支持任务中切换，必须单独补充状态迁移、既有确认失效和审计规则；
8. 应用重启、任务恢复、命令重放和重复提交必须使用同一 resolved mode 和策略 revision。

---

## 6. 前端交互

### 6.1 真实接入后的形态

- 控件位于新任务 Composer 的项目空间、机器人、模型等任务选择项附近；
- 使用单选控件或三段式选择器，提供明确名称、简短说明和当前选中态；
- 默认选择“智能确认”；
- 选择摘要必须包含智能授权模式；
- 提交中禁止重复切换；
- 任务创建后显示已锁定模式，不提供静默修改；
- 模式不可用时保留选项并展示禁用原因；
- 控件具有可读 Label、键盘操作、可见焦点和辅助技术选中状态。

### 6.2 真实链路接入前

- 三种模式只能作为只读说明卡片展示；
- 每个模式显示“待接入”，并明确“当前不改变任务执行”；
- 不展示默认选中态、可点击态、`aria-pressed` 或任何暗示选择已经保存的反馈；
- 提交摘要不得包含未真实提交的模式；
- 不允许用 LocalStorage、Renderer 状态或 Mock receipt 模拟生效。

---

## 7. Contract 与 Core 门槛

### 7.1 Contract

- 保持现有严格 `submitTurn` v1alpha1 不变；
- 通过评审后的新版本为 Task Selection 增加类型化 `authorizationPreference`，至少包含 requested mode；
- `SubmitTurnReceipt` 或等价 Projection 返回 resolved mode 和授权策略 revision；
- request digest、幂等重放和 Task/Runtime Selection identity 必须包含 resolved mode 及必要策略 revision；
- 新客户端不得向不支持该字段的旧 Contract 静默发送；需要版本协商或明确版本路由；
- 旧客户端未提供字段时，可以按兼容规则使用“智能确认”，但 Core 必须在结果中明确 resolved mode；
- 未知枚举、字段缺失冲突或策略 revision 不一致必须类型化失败，不能忽略字段后继续执行。

建议产品语义结构：

```text
authorizationPreference
├── requestedMode: manual_review | smart_confirm | task_scoped
└── schemaVersion

resolvedAuthorization
├── mode
├── policyRevision
└── source: user_selected | legacy_default
```

最终字段命名和所属 Contract 版本由 Contract/Architecture 评审冻结。

### 7.2 Core

- Core 是授权模式解析、风险分类和最终确认决策的唯一业务 owner；
- Core 先校验固定权限、Workspace、Tool/Model 可用性，再应用用户确认模式；
- “任务内授权”只能复用已有类型化 Confirmation Scope 能表达的精确范围；
- 删除、程序执行、Workspace 外访问、权限拒绝和范围扩大不能因模式而自动放行；
- resolved mode、策略 revision 和确认复用事实必须可恢复、可审计并保持幂等；
- 前端只消费 Core 结果，不复制风险分类或确认状态机。

---

## 8. 状态与异常

| 场景 | 用户体验 |
| --- | --- |
| Contract/Core 未接入 | 显示只读“待接入”说明，不可选择 |
| 选项被企业策略限制 | 选项禁用，并说明限制来源和可选模式 |
| Workspace 授权在提交前失效 | 阻止提交，要求重新选择或授权 Workspace |
| requested mode 不受支持 | 阻止提交，不静默改成其他模式 |
| 任务恢复 | 显示并继续使用持久化 resolved mode |
| 策略 revision 冲突 | 停止提交或恢复，刷新策略后由用户重新确认 |
| 确认被拒绝 | 当前动作停止，任务展示替代方案或允许取消 |
| 确认范围不再匹配 | 重新请求确认，不复用旧确认 |

---

## 9. 安全、审计与数据最小化

- 模式不是权限 Grant，不持有文件路径、凭证、Prompt 或任务正文；
- 审计记录用户、Task、requested/resolved mode、policy revision、确认结果和时间；
- 产品埋点可以记录模式枚举和是否触发确认，不记录任务正文、文件内容或外部发送正文；
- 管理员策略只能收紧用户模式，不得替用户完成本机风险确认；
- Renderer 不接触确认 digest、真实路径或内部授权 payload。

---

## 10. 明确不做

- 不提供跨任务或全局“永不询问”；
- 不允许模式扩大 RBAC、WorkspaceGrant 或 Tool 权限；
- 不允许自动放行删除、程序执行或 Workspace 外访问；
- MVP 不支持任务运行中切换模式；
- 不用前端 Mock、LocalStorage 或说明卡片代替真实授权事实；
- 不在本 Spec 中静默修改现有 v1alpha1 Contract、IPC 或数据库结构。

---

## 11. 验收标准

### 11.1 产品与前端

- [ ] 最终控件使用“手动复核/智能确认/任务内授权”，不再使用“工作区授权”作为模式名称；
- [ ] 未接入时只读展示“待接入”，无可点击或选中假象；
- [ ] 接入后用户选择进入提交请求和选择摘要，不被静默丢弃；
- [ ] 任务创建后模式锁定，后续对话和重启恢复保持一致；
- [ ] 禁用、失败和策略限制具有明确原因，核心操作可使用键盘完成。

### 11.2 Contract 与 Core

- [ ] v1alpha1 行为保持不变，新字段通过版本化 Contract 接入；
- [ ] requested mode、resolved mode 和 policy revision 可持久化、恢复和审计；
- [ ] 未知模式、版本不支持和策略冲突类型化失败，不静默忽略；
- [ ] Workspace 外访问和固定权限拒绝在三种模式下都失败关闭；
- [ ] 删除和程序执行在三种模式下都逐次确认；
- [ ] 手动复核下普通创建/修改逐次确认；智能确认和任务内授权下普通创建/修改可直接执行；
- [ ] 任务内授权的相同外部目标和数据范围可在首次确认后复用，目标、范围或 revision 变化时重新确认；
- [ ] 崩溃恢复、命令重放和重复提交不改变模式或重复扩大确认范围。

### 11.3 端到端

- [ ] 三个模式分别具有至少一个能够证明行为差异的真实 E2E；
- [ ] Desktop 选择、Contract 请求、Core resolved mode、Task 持久事实和用户确认行为一致；
- [ ] 应用重启后继续使用创建任务时的 resolved mode；
- [ ] Renderer 敏感字段和越界扫描通过；
- [ ] 独立 QA 确认不存在“可点击但不生效”或“选择被静默丢弃”。

---

## 12. 交付门槛

产品语义已冻结。真实编码前仍需：

1. Contract/Architecture 差异评审；
2. 版本化 Task Selection 与 Receipt/Projection 方案；
3. Core 授权策略、持久化、恢复和审计设计；
4. Desktop 真实选择器与未接入状态迁移方案；
5. 专项测试矩阵和独立 QA 计划；
6. 用户明确授权进入跨 Contract/Core/Desktop 实施批次。

