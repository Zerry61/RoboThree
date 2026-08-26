# Product

产品目标、需求、用户流程和验收标准。

## 文档

- [RoboThree MVP 功能范围与开发基线 v1.0](./ROBOTHREE-MVP-FUNCTIONAL-SCOPE-AND-DEVELOPMENT-BASELINE-v1.0.md)：保留已冻结的运行、权限、恢复、企业离线和 Runtime Activation 边界；前端一级导航、中文业务命名、页面归属和前端开发优先级以当前 v1.6 PRD 为准，涉及 Contract、Core/Central 行为和安全语义时继续服从本基线及已接受 ADR。
- [RoboThree MVP 产品需求文档 v1.6 Final Revision 15（前端开发基线）](./PRD-ROBOTHREE-MVP.md)：用户于 2026-08-26 增补定稿。新增机器人首次 `SubmitTurn` 原子锁定时点、Core 内置默认通用机器人、机器人模型限制开关、切换机器人后 Skill/Knowledge 清理且不恢复、草稿/测试/发布门槛、固定动态请求事实和个性化自定义指令的 MVP 边界；保留既有 Core Prompt Revision 1 与 CPC 阶段历史结论。
- [RoboThree 全局前端体验规范 v1.0 Revision 16](./FRONTEND-EXPERIENCE-SPEC-v1.0.md)：Desktop Client 与 Admin Console 的共同体验基线；同步 Desktop/Admin 机器人模型限制、后台稳定顺序、切换机器人清理不兼容 Skill/Knowledge、首次提交锁定时点和草稿/测试/发布交互门槛，并继续覆盖全局 `Max`、Admin、技能包、HTTP API 和 MCP 体验。
- [Workspace 与智能授权 Feature Spec v1.0](./WORKSPACE-AUTHORIZATION-FEATURE-SPEC-v1.0.md)：冻结新任务 Composer 的“手动复核/智能确认/任务内授权”三模式、Workspace 硬边界、任务级锁定、未接入只读状态、版本化 Contract/Core 门槛及端到端验收；产品语义已确认，真实编码仍 GATED。
- [Core Prompt 与上下文组装 Feature Spec v1.0 Revision 2](./CORE-PROMPT-AND-CONTEXT-FEATURE-SPEC-v1.0.md)：在 Revision 1 已通过技术复核的分层、Bundle、Compiler、Receipt 和恢复边界上，补充首次 `SubmitTurn` 原子锁定、Core 内置默认 Agent、固定 Dynamic Request Facts，以及个性化自定义指令不进入 MVP 生产上下文。Revision 1 的 `PASS` 和已经关闭的 CPC 历史不被改写；Revision 2 的技术差异已形成 [R2D-0 docs-only 详细方案](../development/R2D-0-PRODUCT-REVISION-2-CORE-DELTA-DEVELOPMENT-PLAN.md)，当前仍为 `DOCUMENT REVIEW PENDING / CODING GATED`，不构成任何编码授权。
- [CPC-0 Core Prompt / Context Assembly 详细实施总方案 Revision 1.1](../development/CPC-0-CORE-PROMPT-CONTEXT-ASSEMBLY-DEVELOPMENT-PLAN.md)：复用现有 TaskRuntimeSelection、SubmitTurn bundle、Context Pipeline 与 Agent Loop，冻结 Platform/Task Boundary/Agent/Skill 四层 source、单一 canonical System Message、预算/restart 一致性及 Skill/Reference/Dynamic 扩展接缝；三批估算 9～15 日，不新增 migration。Revision 1.1 计划已 `PASS/CLOSED`，CPC-1、CPC-2 已按各自验收关闭，CPC-3 仍按独立计划保持 GATED；Core Prompt Revision 2 的新增产品差异需单独复核，不倒改既有关闭记录。
- [Model Experience Feature Spec v1.0 Revision 4](./MODEL-EXPERIENCE-FEATURE-SPEC-v1.0.md)：冻结企业/个人模型来源、全局 `Max` 推理开关及其 Adapter 映射、默认降级和任务级请求/解析结果恢复，并补充机器人模型限制关闭/开启语义、用户合法模型交集、后台稳定顺序和首次 `SubmitTurn` 锁定时点；继续覆盖模型标识与显示名称、无测试连接、网络失败真实重试、企业模型为空时的个人模型显式选择、用户默认模型与机器人临时有效模型、删除和
  个人 Key 主动查看产品语义；MVP 不检测系统截图。真实 Credential 链路仍需 ADR-013 对应实现，保存后查看
  还需反向敏感通道架构增补；DFE-5A 与个人模型后端批次分别评审和授权，DFI-2B 不自动启动。
- [Tool 接入与管理 Feature Spec v1.0 Revision 5](./TOOL-MANAGEMENT-FEATURE-SPEC-v1.0.md)：冻结统一 Tool Runtime 及代码工具、HTTP API、MCP 三种来源。HTTP P0 支持单条 cURL；MCP P0 只连接远程服务，认证支持无需认证、访问令牌（Bearer Token）和 API Key，管理员在当前连接中直接填写密钥，不建设独立凭证库或选择器；不接受本地 Command/Arguments，读取能力可安全批量选择，写入/删除/外发能力须主动选择。真实 Catalog、Policy、Connection、密钥、解析、验证和健康仍按 TGM-0～TGM-5 分批评审和授权。
- [MVP 基线修订项 001：企业配置离线语义（CLOSED）](./MVP-BASELINE-REVISION-ITEM-001-ENTERPRISE-OFFLINE-SEMANTICS.md)：冻结企业在线、服务暂时不可用、企业会话失效和企业恢复四种状态，以及 `LocalExecutableEnterpriseCapability` 和禁止静默应用配置规则。
- [RoboThree 产品与架构基线 v1.0](./PRODUCT-ARCHITECTURE-BASELINE-v1.0.md)：保留产品定位、核心概念、场景边界与关键技术约束；其中与最新 MVP 功能范围冲突的部分，由上述功能开发基线覆盖。
- [RoboThree 长期记忆产品需求文档 v1.6 Revision 1](./PRD-LONG-TERM-MEMORY.md)：当前状态为 `REVIEW_DRAFT`；首版保留 Personal / Project 内部类型边界，但仅 Personal Memory 形成用户闭环，Project 首版没有生产写入、检索或注入入口；不自动修改 MVP 基线，正式编码前仍需后续 ADR 和开发计划评审。
