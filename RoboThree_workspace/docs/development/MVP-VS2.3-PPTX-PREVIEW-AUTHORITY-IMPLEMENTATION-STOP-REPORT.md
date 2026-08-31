# MVP-VS2.3 — PPTX Preview Source Authority 实施停手报告

> 状态：**RESOLVED BY VS2.3 repair.3 / HISTORICAL STOP RECORD**  
> 日期：2026-08-30  
> 触发条件：VS2.3 用户授权——真实 E2E 如需修改 Core/Main/Preload 生产逻辑，立即停手回评审

## 1. 已通过的真实链路

同一真实 Electron E2E 已完成：

- production Main/Preload/Renderer、真实 Core child、真实 SQLite 原库 reopen；
- Workbench 选择 durable DOCX attachment；
- round-1 模型请求与 DOCX read Tool Result；
- round-2 仅一次 Gateway accept，Core SIGKILL 后同 invocation 第二次 SSE subscription；
- 新 Core 使用 durable deadline 恢复，无第二次 accept、无重复 read Tool；
- PPTX write Tool 一次、round-3 最终模型轮次一次；
- Task 状态 `completed`，Assistant Message、PPTX Artifact、“读取资料 / 生成成果”两段业务步骤均可见。

## 2. 新阻塞事实

Task 页点击既有 PPTX HTML 预览入口后，iframe 未进入 ready。聚焦诊断确认：

- Task 仍为 `completed`；
- round-3=1；read/write Tool Activity 各 1；Artifact 与 Assistant Message 各 1；
- Artifact ID 满足既有 canonical 形式；
- 重启后的 Workspace authority 仍存在；
- 既有 Desktop safe API 返回 `task.not_found`；
- 失败发生在 Artifact source/preview 解析阶段，尚未进入成功的 HTML sandbox session。

## 3. 为什么停手

继续处理至少需要修改或重新定义 Core Artifact source authority、Main preview fallback/错误映射，或它们之间的生产接缝。
这些都不属于 repair.2 的 internal invocation-link 字段范围，也被 VS2.3 本轮授权明确禁止。

不得用以下方式绕过：

- 不把受控 Gateway 产物改成手工注册 Artifact 冒充真实 Tool Artifact；
- 不跳过预览按钮或直接注入 iframe；
- 不在 E2E driver 中直接读取真实路径；
- 不新增 test-only Core/Main/Preload production seam；
- 不把 `task.not_found` 改写成成功或用 fixture 结果宣称 E2E PASS。

## 4. 最小下一步建议

先对“Tool-generated Artifact 在 Core restart 后的 source authority 与 PPTX preview”做只读聚焦方案，范围只允许：

1. 证明 `resolveArtifactFileSource` 在重启前后所用的 exact task/workspace authority；
2. 若是既有 authority 丢失，只修复该单一恢复/解析接缝；
3. 若是 Main preview 对既有错误错误降级，只修复 exact routing；
4. 复用同一 VS2 Electron E2E，不新增 Contract、migration、依赖、状态机或新的产品能力。

用户完成聚焦评审并单独授权前，父 VS2.3 保持 paused；repair.2 可独立进入 QA，但不得据此关闭 VS2.3。

## 5. 解除记录

用户已接受 repair.3 聚焦方案并授权编码。focused proof 证明根因是 Core source authority 在 Tool payload 无
`workspaceGrantId` 时误用 legacy-only Runtime Selection loader；真实 Task 持久化的是 readable v1alpha4 selection。
repair.3 仅将该读取切换为既有 readable union loader，并补充 v1alpha4 restart focused regression。

同一真实 Electron E2E 已通过，`pptxPreviewReady=true`，没有修改 Main/Preload/Renderer production routing，亦未新增
Contract、migration、依赖、状态机、错误码或 Evidence schema。本报告作为历史停手事实保留，不覆盖当时失败记录。
