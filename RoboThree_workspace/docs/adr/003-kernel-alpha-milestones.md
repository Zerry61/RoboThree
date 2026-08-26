# ADR-003：Kernel Alpha 里程碑

> 状态：**ACCEPTED**  
> 日期：2026-07-19

## 决策

Kernel Alpha 采用三个可独立运行、逐步扩展的垂直里程碑：

```text
KA-0：Chat + 模型调用 + 本地持久化
  ↓
KA-1：最小 Agent + Tool + 本地文件任务
  ↓
KA-2：HTML 生成 + localhost 预览 + Alpha 最终验收
```

每个阶段都必须形成可运行闭环，不以一次性完成全部平台抽象为前提。

## 实施顺序补充（2026-07-19）

KA-0 的产品验收结果不变，但内部实施采用 **Kernel Framework First，Chat Last**：

```text
KAF-0：工程与边界基线
KAF-1：Runtime Kernel
KAF-2：Event、Persistence 与恢复
KAF-3：Capability 与 Adapter
KAF-4：Policy、并发、可靠性与性能
KAF-5：Headless Framework 验收
  ↓
Electron Chat 薄客户端集成
```

Chat 不再作为第一批代码，也不得反向决定 Kernel 的状态、持久化和 Provider 结构。KAF 阶段必须使用 Fake Adapter 和 Headless Harness 持续形成可执行闭环，避免“框架优先”演变成未经验证的大平台建设。

详细范围和门槛见 [KA-0 开发计划](../architecture/KA-0-DEVELOPMENT-PLAN.md)。

## KA-0：最小交互闭环

交付：

- Electron + Vue Chat 界面；
- 可配置的 OpenAI-compatible 模型接入；
- 单轮与连续对话；
- Session、Message 和必要配置的 SQLite 持久化；
- 基础错误处理、取消和运行日志。

通过标准：应用重启后可恢复会话，模型调用不依赖 Renderer 直接持有凭证。

## KA-1：最小 Agent 执行闭环

交付：

- 最小 `AgentDefinition`；
- Task/Run/Step 与 Action/Observation；
- Tool 注册、解析和调用；
- `FileGrant` / `WorkspaceGrant`；
- 通过 Worker 完成本地文件读取、创建或修改任务；
- 最小 Policy、Event 与恢复能力。

通过标准：未经授权的路径无法触达 Worker；已授权文件任务可审计、可失败收敛，并能恢复必要状态。

## KA-2：通用成果闭环

交付：

- 使用 Agent + Tool 生成 HTML Artifact；
- Artifact 元数据与文件落盘；
- 受控 localhost 静态预览；
- 从自然语言目标到可查看成果的端到端验收；
- 完整演示正常、拒绝、失败和恢复路径。

HTML 是验证通用能力的验收载体，不在 Core 中建立“网页生成场景”分支。

## 里程碑规则

- 后一阶段不得以破坏前一阶段可运行性为代价；
- Contract 只随真实垂直链路逐步扩展；
- 每阶段必须有自动化测试和可重复的人工验收步骤；
- Framework First 阶段使用 Headless Harness 验证 Contract、状态、恢复和 Adapter，不等待 Chat 才做集成；
- KA-2 通过前，不扩展公开 Marketplace、完整企业控制面、Multi-Agent 或全套 Office Tool Pack。
