# RoboThree 长期记忆产品需求文档

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | RoboThree 长期记忆产品需求文档 |
| 文档版本 | v1.6 Revision 1 |
| 文档状态 | REVIEW_DRAFT |
| 更新日期 | 2026-08-04 |
| 适用阶段 | 当前冻结 MVP 之后的首个产品增强能力 |
| 用户接受状态 | PENDING |

### 1.1 修订记录

| 版本 | 日期 | 修订说明 |
| --- | --- | --- |
| v1.4 | 2026-08-04 | 用户手动收缩回收站、软删除等过度设计 |
| v1.5 | 2026-08-04 | 首版收缩为 Personal Memory 闭环，移除 Project Memory、历史 Revision、TaskMemoryContextLock、MemoryRetrievalReceipt 和复杂检索设计 |
| v1.6 | 2026-08-04 | 首版保留 Personal / Project 两种类型，Project 只建立内部边界且不向用户展示；删除“使用长期记忆”和“Agent 自动记忆”设置 |
| v1.6 Revision 1 | 2026-08-04 | 关闭独立评审 P2：明确 `memory_content` 独立外发类别、Project 首版零写入入口；记录 Agent 静默保存为已确认产品决策 |

本文档是长期记忆的产品需求入口，只描述用户能力、产品边界和验收结果。Schema、事务、幂等、迁移和内部 Token 等实现细节由后续 ADR 与开发计划冻结。

---

## 2. 背景与问题

RoboThree 已具备 Session 消息持久化、Task 执行事实、Context Pipeline 和 Compaction 的基础能力，但尚未实现跨 Session 的长期记忆。

当前产品可以延续一个会话，却不能可靠满足：

- 用户明确要求“以后记住这个偏好”；
- 用户在新会话中继续使用已保存的个人事实或约束；
- Agent 自动保留用户明确表达且长期有效的信息；
- 用户查看、修正或删除 Agent 可能使用的个人长期记忆；
- 长期记忆进入外部 Model 时沿用明确的数据授权边界。

长期记忆必须与以下对象保持分离：

- Conversation：当前会话中的消息事实；
- Compaction：长会话的上下文压缩结果；
- Knowledge：企业或用户提供的知识资料；
- Skill：Agent 的操作方法和工作说明；
- Tool：可被调用的原子执行能力。

---

## 3. 产品定位与目标

### 3.1 产品定位

RoboThree 长期记忆首版是一套：

> 本地优先、同时区分 Personal 与 Project 类型、由 Personal Memory 先行形成用户闭环的轻量记忆能力。

它不是知识库、向量数据库、企业共享信息平台，也不是独立的 Memory 开发框架。

### 3.2 产品目标

1. 用户可以通过自然语言明确保存需要长期使用的信息；
2. Agent 可以自动提取普通、稳定的信息，并在保存后轻量通知用户；
3. 新 Session 可以使用已保存的 Personal Memory；
4. 用户可以在设置中查看、编辑或删除 Personal Memory；
5. Memory 只在模型调用时进入上下文，不污染 ConversationMessage；
6. 敏感内容不得被保存或通过 Memory 链路外发；
7. 第一版建立 Personal / Project 两种类型边界，但 Project Memory 不向用户展示，也不参与自动写入和上下文注入；
8. 第一版保持足够简单，为后续 Project Memory 产品化和高级检索保留扩展空间。

### 3.3 与当前 MVP 的关系

- 本 PRD 不静默修改当前冻结的 MVP 基线；
- 本 PRD 不自动解锁、阻塞或改期 DTP、CGF、Desktop 等现有阶段；
- 正式编码前必须完成长期记忆 ADR 和开发计划评审；
- 长期记忆不得反向修改已经关闭的 Task、Session、Model Gateway 和 Context Contract 历史版本。

---

## 4. 参考方案与取舍

### 4.1 参考事实

| 参考项目 | 已验证事实 | RoboThree 取舍 |
| --- | --- | --- |
| Hermes | Memory 在 API 调用时注入，不修改持久化消息；读取和写入路径分离 | ADOPT：调用时注入，不复制进 Conversation |
| OpenWorker | 使用 SQLite 保存简单 Memory，并支持 remember、update、forget | ADAPT：采用简单本地 Store 和增删改，但首版不向模型暴露通用 Memory Tool |
| OpenClaw | Core 保留基础 Memory，高级语义搜索、Embedding 和 Memory Provider 通过扩展实现 | ADOPT：基础能力先行；DEFER：向量、Embedding 和插件化 Memory Backend |

### 4.2 第一版取舍

| 能力 | 决策 |
| --- | --- |
| Personal Memory | ADOPT |
| 用户自然语言记忆指令 | ADOPT |
| Agent 静默自动提取 | ADOPT |
| 本地 SQLite Canonical Store | ADOPT |
| 模型调用时有界注入 | ADOPT |
| 查看、编辑、直接删除 | ADOPT |
| Project Memory 类型与持久化边界 | ADAPT：首版建立内部边界，但不开放用户界面和运行时使用 |
| Project Memory 产品能力 | DEFER |
| 历史 Revision 与恢复 | DEFER |
| FTS、向量、Embedding、Rerank | DEFER |
| Memory Provider 插件体系 | DEFER |
| 通用 Memory Tool | DEFER |
| 回收站、软删除 | REJECT |
| 删除与“永久遗忘”两套入口 | REJECT |

---

## 5. 首版范围

### 5.1 首版包含

- Personal / Project 两种 Memory 类型及本地持久化边界；
- Personal Memory 用户闭环；
- 用户主动记忆；
- Agent 自动提取；
- 固定敏感数据 Gate；
- 基础去重和冲突拒绝；
- 跨 Session 使用；
- 模型调用时有界注入；
- Memory 管理页；
- 查看、编辑和直接删除；
- 会话内轻提示；
- 外部 Model 调用复用现有任务级数据授权；
- 最小来源展示。

### 5.2 首版不做

- Project Memory 的用户界面、自动写入、检索、注入和 Workspace 重绑；
- Workspace、团队或企业共享 Memory；
- Memory 向 Central Service 或其他设备同步；
- 跨设备同步和冲突合并；
- Memory 版本历史、历史恢复和 Last-Write-Wins；
- 回收站、软删除和删除恢复；
- 自动过期、生命周期状态机和定时清理；
- 批量删除和一键清空；
- 标签管理、复杂筛选和独立搜索页；
- FTS5、ICU、向量数据库、Embedding、Rerank；
- Memory Provider、Marketplace 和第三方 Memory Plugin；
- 向模型暴露通用 Memory CRUD Tool；
- Agent 从 Tool 输出、Knowledge 原文或文件正文自动生成长期记忆；
- 复杂 Policy Engine；
- 对已经发送到外部 Model 的内容作远程擦除承诺；
- 企业生产级 at-rest 加密和多用户身份合并。

---

## 6. 用户与核心场景

### 6.1 用户主动记忆

触发示例：

- “记住我更喜欢简洁的中文回复。”
- “以后生成报告统一使用 Markdown。”
- “记住我的默认工作时区是 Asia/Shanghai。”

流程：

```text
识别明确记忆指令
→ 提取待保存内容
→ 本地敏感数据检查
→ 去重和冲突检查
→ 保存 Personal Memory
→ 显示“已记下：X”
```

规则：

- 普通内容不弹逐条确认卡片；
- 首版不设计“选中消息保存为记忆”按钮；
- 无法稳定提取时不保存，并提示“未能识别要记住的内容”；
- 同一指令重放不得产生重复 Memory；
- 用户明确纠正已有 Memory 时更新当前条目；
- 用户主动记忆和 Agent 自动提取都必须经过敏感数据 Gate。

### 6.2 Agent 自动提取

Agent 可以在一个稳定回合结束或 Task 终态后，提取用户明确表达的：

- 稳定偏好；
- 已确认事实；
- 已确认决策；
- 长期有效约束。

用户已确认：第一版 Agent 自动提取采用“通过本地 Gate 后静默保存、事后轻提示”的产品模式，不增加逐条确认卡片。

符合规则的普通内容默认静默保存，不阻塞 Assistant 回复。保存后显示：

> 我刚记下了 X。你可以在 Memory 设置中查看、编辑或删除。

Agent 不得自动保存：

- 推测、猜测或低置信度结论；
- Tool 输出、Knowledge 原文或文件正文；
- 短期任务状态、一次性请求和临时数字；
- 与当前 Memory 冲突的事实；
- 敏感数据 Gate 拒绝的内容；
- 不属于用户明确表达且长期有效的信息。

静默保存裁决链必须满足：

```text
LLM 生成结构化 Memory Candidate
→ Candidate 引用真实用户消息作为来源证据
→ Local Core 校验来源、类别、敏感数据、重复和冲突
→ 全部通过后写入 Personal Memory
→ 写入后轻提示
```

LLM 只能提出候选，不得直接写入 MemoryStore。具体 Candidate Contract、来源证据和并发控制由 ADR-018 冻结。

### 6.3 跨 Session 使用

当用户创建新 Session 时，Local Core 可以选择相关 Personal Memory 加入本轮 Model Context。第一版不提供关闭长期记忆注入的设置。

Memory 只影响本次 ModelRequest：

- 不修改原始用户消息；
- 不复制进 ConversationMessage；
- 不成为 Task、Event 或 Audit 的正文副本；
- 下一轮重新根据当前有效 Memory 构建上下文；
- 用户编辑或删除后，从下一轮调用开始生效。

### 6.4 查看、编辑和删除

用户可以在 Memory 管理页：

- 查看当前 Personal Memory；
- 查看来源类型、类别和更新时间；
- 编辑内容；
- 删除单条 Memory。

删除规则：

- 删除前使用 Desktop 本地确认弹窗明确提示“删除后不可恢复”；
- 本地删除确认不是 Task、Tool 或 Model 外发 Confirmation，不进入运行时审批体系；
- 确认后立即从 Memory Canonical Store 和相关检索数据中清除；
- 删除后不能从 Memory 页面恢复；
- 不进入回收站；
- 不保留软删除正文；
- 删除后的 Memory 不得进入后续 Model Context。

删除只保证 RoboThree Memory 域不再保存和使用该内容，不承诺删除：

- 用户原始 Session 中已经存在的消息；
- 已经授权发送到外部 Model 或 Relay 的远端副本；
- 已经生成并持久化的 Assistant Message；
- 用户自行复制、导出或保存的内容。

---

## 7. 写入与冲突规则

### 7.1 概念数据

第一版产品只要求每条 Memory 能表达：

```text
MemoryItem
├── 唯一标识
├── 类型：Personal | Project
├── 内容
├── 来源：用户主动 | Agent 自动
├── 类别：偏好 | 事实 | 决策 | 约束
├── 创建时间
├── 更新时间
└── 当前版本号
```

具体字段名、Schema 和迁移由后续 ADR 决定。

Project 类型在 v1.6 Revision 1 中没有创建、更新、删除、检索或注入入口。它只作为内部 Contract 枚举、隔离规则和持久化兼容边界存在；任何生产路径写入 Project Memory 都属于范围越界。

### 7.2 去重与冲突

- 同一用户、相同语义的 Memory 不重复创建；
- Agent 自动提取发现冲突时不得覆盖，提示“发现冲突，未更新”；
- 用户明确纠正时可以更新当前条目；
- 同一命令和相同内容应幂等；
- 同一命令但内容不同应返回冲突；
- 首版不保留可浏览或恢复的历史版本。

### 7.3 写入反馈

- 用户主动保存成功后显示“已记下：X”；
- Agent 自动保存后显示“我刚记下了 X”；
- 冲突时显示“发现冲突，未更新”；
- 敏感内容被拒绝时只显示分类和“未保存”；
- 提示可以提供查看、编辑和删除入口；
- 不建设独立通知中心；
- Memory 管理页按更新时间展示当前条目，不建立第二份“最近写入”正文存储。

---

## 8. 敏感数据规则

### 8.1 固定拒绝范围

第一版不建设可配置 Policy Engine。以下内容在用户主动和 Agent 自动两条写入路径中均固定拒绝：

- Password、API Key、Access Token、Refresh Token、Private Key、Secret；
- 身份证件号、银行卡号、生物特征等高敏个人信息；
- 客户名单和批量个人数据；
- 批量财务数据、单条财务事实和合同金额；
- 能够直接访问企业系统、账号或设备的 Credential；
- 其他由版本化安全 Fixture 明确列入的高风险内容。

### 8.2 Gate 规则

- LLM 可以提出提取和分类建议，但不能决定最终写入；
- Agent 自动候选必须引用当前用户输入中的真实来源证据，不得引用 Assistant、Tool、Knowledge 或文件正文作为写入依据；
- 最终 Gate 位于 Local Core Application 层；
- 固定规则、结构规则和版本化 Fixture 是安全底座；
- 被拒绝的正文不得进入 Memory、Event、Audit、Trace、日志或 QA 证据；
- 拒绝提示不得回显完整敏感正文；
- 验收只声明受控测试语料中的零漏报，不宣称覆盖现实世界的任意输入。

---

## 9. 检索与上下文注入

### 9.1 首版检索

第一版采用本地、确定性、可测试的基础匹配，不建设独立检索平台。

规则：

- 只读取当前 Personal Memory；
- Project Memory 在第一版不参与选择和注入；
- 已删除的 Memory 不参与选择；
- 根据当前用户输入、Memory 类别和更新时间进行基础匹配；
- 用户主动保存的 Memory 在同等条件下优先于 Agent 自动保存的 Memory；
- 单轮最多注入 5 条；
- 总注入内容不超过 4KB；
- 超出预算时确定性截断；
- 最新用户输入、未完成 Tool Call 和当前 Task 事实的优先级高于 Memory；
- 第一版不向模型暴露 Memory Search 或 CRUD Tool。

具体匹配算法由 ADR 和受控 Fixture 冻结，但不得在首版引入向量、Embedding 或外部检索服务。

### 9.2 调用时注入

上下文装配顺序：

```text
读取当前有效 Personal Memory
→ 基础匹配与预算裁剪
→ 生成本轮 Memory Context Block
→ 加入当前 ModelRequest
→ 记录实际使用的 Memory ID
```

不建立首版 Task 级 Memory 候选集锁，也不建立独立 MemoryRetrievalReceipt。实际使用的 Memory ID 作为本轮 Model 调用的内部来源元数据记录，不保存 Memory 正文副本。

### 9.3 外部发送

- Memory 进入外部 Model Context 时，使用 `memory_content` 作为独立 canonical 数据类别，参与现有任务级外发确认；
- `memory_content` 通过 ADR-018 建立向后兼容的 Contract 版本扩展，不改写 CGF-2C.1 已通过的七类历史 Contract；
- Memory 片段不得伪装成 `user_text`、`knowledge_content` 或其他既有数据类别；
- 确认绑定当前 Task、实际 Model Target 和允许的数据范围；
- 同一 Task、Target 和数据范围内不重复确认；
- 更换 Model Target 或扩大数据范围时必须重新确认；
- Local Model 不触发外发确认，但仍可以展示 Memory 来源；
- 未授权或被敏感数据 Gate 拒绝的 Memory 不得进入 ModelRequest。

`memory_content` 的产品归属已经确定；具体 Schema 字段、兼容版本号和幂等实现由 ADR-018 冻结。

---

## 10. 用户控制与界面

### 10.1 个人长期记忆设置页

第一版设置页不提供“使用长期记忆”或“Agent 自动记忆”开关，只提供 Personal Memory 的查看和修改入口。

首版只包含：

- 当前 Personal Memory 列表；
- Memory 内容；
- 来源类型；
- 类别；
- 更新时间；
- 编辑；
- 删除。

Project Memory 第一版不出现在设置页、Desktop Projection 或用户可见来源列表中。

首版不包含：

- Project/Workspace 切换；
- 标签体系；
- 复杂搜索和筛选；
- 历史版本；
- 回收站；
- 批量治理；
- 导入、导出和同步。

具体布局、交互和文案由 Desktop Memory UX Plan 确认。UX 未确认前不得进入 Renderer 正式开发。

### 10.2 来源展示

当本轮调用使用了 Memory 时，Desktop 至少提供：

- “本轮使用了 N 条记忆”的摘要；
- 展开后查看实际使用的 Memory；
- 实际 Model Target；
- 进入 Memory 管理页的入口。

来源展示从当前 MemoryStore 和本轮调用元数据派生，不复制 Memory 正文到 Task Event 或 Audit。

---

## 11. 存储与边界

### 11.1 Canonical Store

- Memory Canonical Store 位于 RoboThree 应用管理目录；
- 首版使用独立本地 SQLite 存储；
- Store 和内部 Contract 必须区分 Personal / Project 类型；
- Project Memory 第一版只建立类型、隔离和持久化兼容边界，不开放自动写入、检索和注入；
- 不写入 Workspace 的 `.robothree`、`.claude` 或其他项目目录；
- WorkspaceGrant 撤销和目录移动不得破坏 Personal Memory；
- Memory Store 不向 Central Service 自动同步。

### 11.2 用户隔离

Alpha 使用当前本机 RoboThree 用户配置作为 Personal Memory 所有者边界。企业身份、多用户 Namespace 和 Local/Enterprise 身份合并规则后置到 Enterprise Integration。

首版不得把不同本地用户配置或不同企业身份的 Memory 混合注入。

### 11.3 at-rest 边界

- Alpha 不宣传 Memory 已具备企业级 at-rest 加密；
- 首版依赖操作系统用户边界和 RoboThree 应用目录权限；
- 企业试点的加密、密钥管理、备份和恢复要求另行评审；
- 不因未来可能采用 FTS、SQLCipher 或其他方案而提前冻结技术路线。

---

## 12. 异常与降级

| 场景 | 产品行为 |
| --- | --- |
| Memory Store 不可用 | 当前 Model 调用不注入 Memory，显示 typed notice，不阻断不依赖 Memory 的普通任务 |
| 自动提取失败 | 不保存，不影响 Assistant 回复 |
| 敏感 Gate 拒绝 | 不保存，只展示分类和“未保存” |
| 检测到冲突 | 保留原 Memory，提示“发现冲突，未更新” |
| 注入超出预算 | 按确定性规则裁剪，不扩大上限 |
| Memory 在调用前被删除 | 本轮不注入该 Memory |
| 外部发送未获授权 | 不发送 Memory；按既有确认流程等待用户决定 |
| 来源详情暂时无法读取 | 只展示“记忆来源暂不可用”，不从 Event 或 Audit 恢复正文 |

---

## 13. 非功能要求

### 13.1 安全

- Memory 正文不得进入普通日志、Trace、Audit 和错误摘要；
- Credential、Token 和 Secret 的受控测试语料写入次数为 0；
- Renderer 不直接读取 SQLite；
- Memory 持久化和注入逻辑位于 Local Core Application/Adapter 边界；
- Kernel reducer 保持纯函数，不导入 Memory Persistence。

### 13.2 可靠性

- 写入、编辑和删除必须具备幂等与冲突处理；
- 应用重启后当前 Personal Memory 正确恢复；
- 自动提取失败不得改变 Assistant 回复和 Task 终态；
- 删除成功后，后续 ModelRequest 对该 Memory 的注入次数为 0。

### 13.3 性能与有界性

- 单轮最多注入 5 条 Memory；
- 单轮 Memory Context 不超过 4KB；
- 在 500 条 Personal Memory 的受控数据集中，基础匹配与裁剪 P95 建议不超过 100ms；
- 性能测试必须记录设备、数据规模和冷暖缓存条件；
- 性能目标在 ADR Spike 后可以收紧，但不得静默放宽。

---

## 14. 验收标准

### 14.1 功能验收

- [ ] 用户输入“记住 X”后，普通内容通过 Gate 并保存；
- [ ] Agent 自动提取稳定信息后静默保存，不弹逐条确认卡片；
- [ ] 自动写入和反馈不阻塞 Assistant 回复；
- [ ] 新 Session 可以使用已保存的 Personal Memory；
- [ ] 用户可以查看、编辑和删除单条 Memory；
- [ ] 编辑后的内容从下一轮 Model 调用开始生效；
- [ ] 删除后的 Memory 无法从 Memory 页面恢复，并且后续注入次数为 0；
- [ ] 应用重启后 Personal Memory 正确恢复；
- [ ] 同一记忆指令重放不产生重复条目；
- [ ] Agent 检测到冲突时不覆盖当前 Memory；
- [ ] 设置页只展示 Personal Memory，不出现两个记忆开关；
- [ ] Project Memory 类型存在于内部 Contract 和持久化边界，但创建、更新、删除、用户界面、自动写入、检索和上下文注入均为 0；

### 14.2 上下文与来源验收

- [ ] Memory 只在 ModelRequest 装配时注入；
- [ ] ConversationMessage 不包含由 Memory Pipeline 复制的正文；
- [ ] 单轮 Memory 注入不超过 5 条和 4KB；
- [ ] 每次使用 Memory 的模型调用都能派生实际使用的 Memory ID；
- [ ] Desktop 能展示“本轮使用了 N 条记忆”和实际 Model Target；
- [ ] Task Event、Audit 和日志不保存 Memory 正文副本；
- [ ] 外部 Model 使用 Memory 时具有匹配的任务级确认；
- [ ] 所有外发 Memory 片段只归类为 `memory_content`，不得落入其他七类既有数据类别；
- [ ] 切换 Model Target 或扩大数据范围时重新确认。

### 14.3 安全验收

- [ ] Secret、Credential、Token、高敏 PII、客户名单和财务敏感信息在两条写入路径中被拒绝；
- [ ] 被拒绝的正文不进入 SQLite、Event、Audit、Trace、日志和 QA 证据；
- [ ] 拒绝提示不回显完整敏感正文；
- [ ] Tool 输出、Knowledge 原文、文件正文、推测内容和临时任务状态的 Agent 自动写入次数为 0；
- [ ] 不同本地用户配置或不同企业身份之间的 Memory 互注入次数为 0；
- [ ] MemoryStore 不在 Workspace 中创建或修改文件；
- [ ] 删除后 Memory Store 和检索数据中不存在该正文。

### 14.4 质量验收

- [ ] 受控正向 Fixture 中，明确相关 Memory 的选择命中率不低于 90%；
- [ ] 受控负向 Fixture 中，无关 Memory 的注入率不高于 10%；
- [ ] 500 条数据集下基础匹配与裁剪达到约定性能基线；
- [ ] 跨重启恢复当前 Memory 的正确率为 100%；
- [ ] 受控敏感语料漏报为 0。

---

## 15. 实施顺序与门槛

```text
用户接受本 PRD
→ ADR-018：Personal / Project Memory 类型、安全、持久化和上下文边界
→ Memory Foundation Development Plan
→ Personal Memory Core Vertical Slice
→ Headless Memory Harness
→ Desktop Memory UX Plan
→ Desktop Personal Memory Vertical Slice
→ 用户现场体验与独立 QA
```

ADR-010 Addendum A 继续负责短期 Context Compaction 产品化。它与 ADR-018 保持独立事务域、独立开发计划和独立 QA，不由本 PRD 合并成一个 Memory 系统。

第一版完成后，Project Memory 产品能力、企业身份、at-rest、关键词索引或向量检索分别重新评审，不因 Personal Memory 完成而自动解锁。

---

## 16. 风险与缓解

| 风险 | 影响 | 首版缓解 |
| --- | --- | --- |
| Agent 保存错误信息 | 后续回答受误导 | 只保存明确、稳定内容；冲突不覆盖；用户可编辑和删除 |
| 自动记忆打扰用户 | 降低体验 | 只提取明确、稳定内容；静默写入后提供可编辑、可删除的轻提示 |
| Memory 数量增长导致上下文膨胀 | Token 和延迟增加 | 最多 5 条、4KB 上限、确定性裁剪 |
| 敏感信息进入 Memory | 数据泄漏 | Local Core 固定 Gate、受控 Fixture、日志零正文 |
| 删除能力被过度宣传 | 用户误以为远端内容也被擦除 | 删除确认中明确 Memory 域边界 |
| 基础匹配质量不足 | 相关 Memory 未被使用 | 先用真实 Fixture 验证；需要时再评审 FTS 或向量检索 |
| Project Memory 成为用户不可见的隐形行为 | 用户无法理解或纠正 Agent 行为 | 第一版只建立类型和持久化边界，禁止自动写入、检索和注入 |

---

## 17. 后续版本候选

以下能力不属于 v1.6 首版承诺：

1. Project Memory 用户界面、自动写入、检索、注入与 Workspace 重绑；
2. 企业用户和设备身份隔离；
3. 团队共享 Memory；
4. FTS 关键词索引；
5. 向量、Embedding 和混合检索；
6. Memory Provider 与插件体系；
7. Memory 导入、导出和跨设备同步；
8. 批量治理和企业保留策略；
9. 企业级 at-rest、备份和恢复；
10. 用户明确授权的 Memory Tool。

后续能力必须基于首版真实使用数据重新立项，不作为当前架构的预建设范围。

---

## 18. 已确认决策与待确认状态

### 18.1 已确认产品决策

1. Agent 自动提取通过 Local Core Gate 后静默保存，不弹逐条确认卡片；
2. 首版内部支持 Personal / Project 两种类型，Personal 对用户开放，Project 只建立边界且不参与运行；
3. Project 类型第一版没有任何写入、检索、注入和用户界面入口；
4. 删除立即生效，不做回收站、软删除和历史恢复；
5. 不建设不可变 Revision 历史，只保留当前版本；
6. 不建设 TaskMemoryContextLock 和 MemoryRetrievalReceipt；
7. 首版使用基础本地匹配，FTS 和向量检索后置；
8. 第一版不提供“使用长期记忆”和“Agent 自动记忆”两个设置；
9. 设置页只展示并管理 Personal Memory，不展示 Project Memory；
10. Memory 外发使用独立 `memory_content` 数据类别，并复用现有任务级外发确认；
11. 不建设 Memory 专用审批模块；
12. Long-Term Memory 与 Compaction 分开开发和验收。

### 18.2 待确认状态

本轮产品决策已经收敛，但整份 PRD 尚未获得用户最终接受。

在用户明确接受前：

- 本文档状态保持 `REVIEW_DRAFT`；
- 不建立 ADR-018 的 ACCEPTED 状态；
- 不开始长期记忆正式编码；
- 不修改当前 MVP 基线。

---

## 19. 关联文档

- 《RoboThree MVP 功能范围与开发基线 v1.0》
- 《RoboThree 产品与架构基线 v1.0》
- ADR-010：Session、Context Assembly、Compaction 与 Memory 边界
- Hermes Session、State 与 Memory 研究
- OpenWorker Architecture 与 RoboThree Fit Analysis
- OpenClaw Session、State 与 Memory 研究

---

## 20. 接受记录

```text
当前状态：REVIEW_DRAFT
用户接受：PENDING
接受日期：PENDING
后续入口：ADR-018 → Memory Foundation Development Plan
```

— RoboThree 长期记忆 PRD v1.6 Revision 1 评审稿
