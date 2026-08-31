# MVP Default Workspace / File Output 实施报告

## 1. 结果

本批修复两个用户可见问题：

1. 未选择工作区时，任务不再获得“禁止创建或修改文件”的空授权；Main 会把用户目录下的 `~/.robothree` 注册为真实
   `read_write` WorkspaceGrant，并把 grant ID 注入提交命令。
2. 用户选择工作区后，通用机器人不再因 tool candidate policy 被排除在 PPTX 工具之外；显式工作区保持最高优先级。

## 2. 实现边界

- 默认真实路径只在 privileged Main 与 Core private authority 中存在，不进入 Renderer、Preload API、日志或 Artifact；
- v1alpha1、v1alpha4、v1alpha5 SubmitTurn 复用同一个默认 grant provider；
- 默认目录只在缺少 `workspaceGrantId` 时启用；用户选择的 exact grant 不被覆盖；
- 只给 `agent.general` 和既有 `agent.presentation` 提供现有 Document Tool 候选；
- 不新增 Contract、migration、依赖、状态机、通用文件平台或下游能力。

## 3. 验证

- focused：`5 files / 14 tests PASS`；
- 通用机器人 + 显式工作区 + 真实 Gateway/Document Worker：非空 PPTX 写入 PASS；
- Desktop/Core TypeScript：PASS；
- Desktop production build：PASS；
- focused ESLint、DTP-4 audit、`git diff --check`：PASS。

## 4. 诚实边界

默认目录在第一次无显式工作区的任务提交时创建。附件选择仍要求显式工作区；HTML/网页写入 Tool 仍未实现。本批只解决
现有 Document Tool 的默认输出目录与通用机器人接线，不声明 production ready。
