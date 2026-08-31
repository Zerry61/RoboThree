# MVP-VS1 Demo Readiness 可选演示辅助清单

> 状态：**SUPPORTING ONLY / USER-OWNED / NOT DEVELOPMENT MAINLINE**  
> 日期：2026-08-29  
> 前置结论：`MVP_VERTICAL_SLICE_1_E2E_CONFORMANT` 已 `PASS/CLOSED`  
> 目标：保留无密钥预检和可复用冒烟说明；不占用产品开发排期

> 2026-08-29 优先级更正：用户明确演示由用户自行安排。本文不再是当前主线，不要求三轮彩排、演示版本冻结或
> 实际 Provider 冒烟先于后续产品开发完成。当前产品主线转为 VS2 工作空间资料读取到成果的客户端垂直能力。

## 1. 本批只解决什么

本批不继续扩建平台底座，只把已关闭的 MVP-VS1 工程链变成可现场演示的内部试用链。完成标准只有四项：

1. 实际 Central 进程通过现有 OpenAI-compatible Adapter 调用一个真实模型；
2. 普通 Desktop 完成 Agent、Skill、Tool、PPTX 成果与重启恢复链；
3. 相同演示脚本连续三轮通过；
4. 冻结可复现的演示版本、启动命令、输入文本和失败处置说明。

本批不输出 production ready，不引入 SSO/RBAC、Admin mutation、Personal Model、TGM、Knowledge Provider、
Agent Lifecycle、正式签名安装包或 notarization。

## 2. 当前资源状态

2026-08-29 只读预检确认以下运行时资源尚未注入当前 shell：

- `ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY`；
- `ROBOTHREE_CGF2B2_DIRECT_PROVIDER_ENDPOINT`；
- `ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL`；
- `ROBOTHREE_CGF2B2_DIRECT_PROVIDER_MODEL_ID`。

因此今天可以完成无密钥实现、构建和受控回归，但不得伪报真实公网模型冒烟已经通过。真实密钥只允许在 Central
进程内存中使用，不进入 Desktop、Renderer、Preload、SQLite、日志、Evidence、Artifact 或仓库文件。

## 3. 后续任务

### DR-1：真实 Provider 资源预检与 Central 单链冒烟

复用现有 `check:cgf2b2:direct-provider`，不复制 Provider Adapter：

1. 缺少四项资源时输出 `RESOURCE_GATED`，不发起网络请求；
2. 资源齐全后，通过 Central 的 `OpenAiCompatibleModelProviderAdapter` 和授权 HTTP Transport 发起真实请求；
3. 验证正常流式输出、错误凭据拒绝、取消和 deadline；
4. 输出仅保留状态、计数、duration 与 digest，不输出 Key、Endpoint、Prompt 或模型正文。

退出条件：单链真实模型冒烟 `PASS`。该结果只证明 Central Provider Adapter 可用，不单独证明 Desktop 演示就绪。

### DR-2：实际 Central + Desktop 联合冒烟

新增一个 **internal-trial/test-only** Central 组合入口，复用现有 Controller、Runtime、Provider Adapter 和
in-memory/test persistence，不修改 production graph：

1. Central 子进程读取真实 Provider Key，Desktop 进程不得获得该 Key；
2. Central 在 loopback 临时端口暴露既有 Model Gateway HTTP/SSE Contract；
3. VS1 Electron E2E 支持显式 external-gateway 模式，默认仍使用确定性 fixture；
4. external-gateway 模式必须由调用者显式 opt-in，缺资源 fail-closed；
5. Desktop 使用预签 internal-trial Central Token，只授予 `model.use`；
6. 真实模型必须返回合法 PPTX Tool Call，第二轮返回可见完成摘要；
7. 生成非空 `项目汇报.pptx`，任务页显示回复、工具活动和成果；
8. `SIGKILL` Core 后从同一 SQLite 恢复，且不得重复提交或重复生成成果。

退出条件：实际 Central + 真实模型 + 真实 Electron 联合冒烟 `PASS`。

### DR-3：三轮演示彩排

使用同一冻结输入连续执行三轮，每轮使用新的临时工作区，验收：

- Agent、Model、Skill 均可选择；
- 提交按钮可用且只提交一次；
- 两轮真实模型调用完成；
- PPTX 非空且可在成果面板识别；
- 回复、Tool 活动、Artifact 在重启后仍可见；
- 无 Token、Provider Key、Endpoint、Prompt 正文进入四类安全输出；
- 每轮结束后 Electron、Core、Central、端口和临时目录全部收敛。

三轮必须 `3/3 PASS`。失败不得自动回退到受控 fixture 后宣称彩排通过。

### DR-4：演示版本冻结与现场运行手册

冻结以下内容：

1. Root/Core/Desktop 的精确版本和源码快照标识；
2. Node 24.13.0、pnpm 11.11.0、JDK 21 与 Electron 版本；
3. 启动前资源检查、Central 启动、Desktop 启动和关闭命令；
4. 固定演示输入、预期页面路径和预期成果文件名；
5. `ELECTRON_RUN_AS_NODE` 必须由启动命令显式清除；
6. 现场失败时只允许重新启动同一冻结版本，不临场改代码；
7. 受控 fixture 只作为 UI 备用演示，必须明确标注，不得冒充真实模型链。

当前仓库没有 Electron Builder/Forge 和正式签名安装包流水线。后天演示默认采用冻结源码构建 + Electron 启动；若要
交付可分发安装包，需要另行授权打包依赖、签名和 notarization，不属于本批。

## 4. 执行顺序

| 顺序 | 工作 | 预计时间 | 是否需要真实资源 |
| --- | --- | ---: | --- |
| 1 | DR-1 预检与真实 Provider 单链冒烟 | 0.5 天 | 是 |
| 2 | DR-2 internal-trial Central/外部 Gateway 联合接线 | 0.5～1 天 | 实现阶段否，最终冒烟是 |
| 3 | DR-3 三轮演示彩排 | 0.5 天 | 是 |
| 4 | DR-4 版本冻结与现场手册 | 0.25 天 | 否 |

关键路径是 DR-2；DR-1 可先确认真实模型资源可用，DR-4 可在第一次联合冒烟通过后立即收口。

## 5. 硬边界

- 不修改 production identity/SSO/RBAC；
- 不把 Provider Key 或 Central Token写入文件；
- 不让 Renderer/Preload 读取环境变量；
- 不新增公共 Contract、migration 或业务依赖；
- 不启用 Personal Model、Admin mutation、TGM、Knowledge Provider 或 Agent Lifecycle；
- 不把 fixture 结果计入真实模型三轮彩排；
- 未完成 DR-1～DR-4 前，不输出 `MVP_VERTICAL_SLICE_1_USABLE` 或 `DEMO_READY`。

## 6. 最终状态口径

仅当 DR-1、DR-2、DR-3、DR-4 全部通过，才允许输出：

```text
MVP_VERTICAL_SLICE_1_USABLE
MVP_VS1_DEMO_READY
```

这两个状态仍只表示内部试用和现场演示就绪，不表示 production ready、正式安装包 ready 或公开发布 ready。

## 7. 2026-08-29 实施进度

- DR-1 资源预检：**实现完成**；Node/JDK/Electron 代码条件通过，真实 Provider 四项资源仍 `RESOURCE_GATED`；
- DR-2 external-gateway E2E 模式：**实现完成**；三个外部 Gateway 环境值一次性读取并立即删除，缺项、非法
  Origin、非法 Model ID 或 Token fail-closed；默认 controlled fixture 路径保持不变；
- DR-2 actual Central internal-trial 组合入口：**待实现**；
- DR-3 三轮真实模型彩排：**待真实资源**；
- DR-4 演示版本冻结与现场手册：**待首次联合冒烟通过后收口**。

默认受控 E2E 已在新增 external-gateway 模式后复跑通过：真实 Electron/Main/Core/SQLite、两轮 Gateway、45,540
字节 PPTX、Core `SIGKILL` 与恢复均保持 `PASS`，证明本轮加法改动没有破坏已关闭的 VS1 工程链。
