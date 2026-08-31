# MVP Task Timeout 1 实施报告

## 结论

本批修复“真实模型持续输出但不结束，PPTX 任务长时间无终态”的生产超时链路。最高结论仅为
`MVP_TASK_TIMEOUT_REPAIR_IMPLEMENTED — USER_ACCEPTANCE_PENDING`，不代表公网 Provider 或 production identity ready。

## 实施范围

1. Central SSE 同时执行 idle timeout 与绝对 request deadline；持续收到片段不会延长绝对截止时间。
2. 企业模型 90 秒内必须建立响应；流建立后保留 30 秒有效 SSE idle 检查；有真实流式活动时，单次调用最多 15 分钟。
3. 企业 Agent Turn 首次接受时固定 30 分钟 durable hard deadline；后续模型轮次与 compaction 共用剩余预算。
4. Core production Starter 按 durable deadline 调度既有 `expire_deadline`；启动恢复先关闭已过期 Task。
5. Provider timeout 使用既有 `timed_out` 状态，Desktop 显示“任务执行超时，可重试”。
6. Interactive trial 关闭后验证 Task 终态与本轮 PPTX Artifact 文件，不再把关闭 Electron 当 PASS。

## 关键边界

- 没有新增公开 Contract、IPC、Preload API、migration、依赖、状态机或错误码。
- 没有记录 Token、Credential、模型正文、SSE 内容、Workspace 真实路径或 PPTX 内容。
- Local Personal timeout policy 保持冻结，只增加既有 Task outer deadline 的上界约束。
- 历史 Task 保留原 durable deadline；新企业 Task 使用 30 分钟 hard deadline。进展不能取消 hard limit，但不会再因固定
  5 分钟整体预算误杀大型 PPT；未建立响应由 90 秒 response-start timeout 关闭，流建立后没有活动则由 30 秒 idle
  timeout 快速关闭。
- 当前版本为 Root/Core/Central `0.0.0-mvp.task-timeout.1`；Desktop 超时提示位于并行演进后的
  `0.0.0-dfe.9-repair.11`，未回退前端版本。

## 验证

- Central absolute SSE：持续写入 frame、idle timeout 未触发时，overall deadline 精确返回
  `model_gateway.provider_request_timeout` 并关闭 reader。
- Central response-start：15 分钟 invocation budget 只允许 90 秒等待 HTTP response start；较短剩余预算保持原值。
- Central Provider adapter conformance：24 tests PASS。
- Core timeout policy + Desktop presentation：2 files / 7 tests PASS。
- VS1.1 enterprise Gateway / PPTX integration：1 file / 4 tests PASS。
- ARH durable loop regression：1 file / 3 tests PASS。
- Core/Desktop typecheck、focused ESLint、Central compile/test-compile PASS。

真实公网 Provider 冒烟需要用户的受控凭据与显式运行窗口，本批没有自动执行。
