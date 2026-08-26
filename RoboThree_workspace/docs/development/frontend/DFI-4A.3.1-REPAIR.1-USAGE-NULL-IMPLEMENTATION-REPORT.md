# DFI-4A.3.1 repair.1：OpenAI-compatible SSE `usage: null` 修复报告

> 状态：IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING  
> 开发版本：`0.0.0-dfi.4a.3.1-repair.1`  
> 日期：2026-08-24

## 1. 问题

Local Personal OpenAI-compatible Provider 请求固定启用 `stream_options.include_usage=true`。真实兼容服务会在
普通内容帧返回 `usage: null`，仅在最终 Usage 帧返回对象。旧实现只排除 `undefined`，因此会把 `null` 传入
strict Usage mapper 并错误产生 `personal_model.usage_invalid`，导致流在首个内容帧失败。

## 2. 修复

- chunk 的 `usage` 为 `null` 或字段缺失：视为本帧无 Usage，继续处理；
- chunk 的 `usage` 为非空对象：继续执行原有 token 字段与 total 一致性校验；
- chunk 的 `usage` 为其他非空非法值：继续失败关闭；
- 不修改 `[DONE]`、finish reason、terminal、Tool Call 或 Model Stream Conformance 语义。

## 3. 回归覆盖

受控 TLS SSE fixture 现在覆盖：

1. blank content + `usage: null`；
2. private reasoning + `usage: null`，且不进入 canonical stream；
3. text delta + `usage: null`；
4. Tool Call fragment + `usage: null`；
5. 最终真实 Usage 对象 + finish reason；
6. `[DONE]` 后输出唯一 canonical completed terminal。

预期结果为 text、Tool Call、唯一真实 Usage 和 completed；不会因 `null` 产生失败，也不会伪造 0 token。

## 4. 验证

- `CI=true pnpm exec vitest run services/core/tests/local-personal-model-provider.test.ts`：PASS，1 file / 6 tests；
- `CI=true pnpm run harness:dfi4a3.1`：PASS，6 files / 30 tests；
- `CI=true pnpm run check`：PASS，243 files / 1620 tests + 3 smoke；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CI=true pnpm run check:central`：PASS，404 tests；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CI=true pnpm run check:central:offline`：PASS，404 tests；
- Architecture boundary PASS，`pnpm-lock.yaml` 未修改。

## 5. 明确不包含

MiniMax 缺少 `[DONE]` 是独立的 Provider terminal compatibility 问题。本修复不接受 EOF 作为全局成功终止，
避免真实网络截断被误判为正常完成；该问题须另立方案，基于脱敏真实帧和版本化 Provider Profile 决定策略。
