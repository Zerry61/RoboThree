# Tool System

> Phase 6 必交付。

## Metadata

- Project:
- Repository:
- Branch:
- Commit:
- Analyzed at:
- Analyzer:
- Phase: 6
- Confidence:

## Scope

> Tool Interface、Schema、Registry、Discovery、Dispatch、Validation、Result Normalization、Error、Timeout、Cancel、Concurrency、Retry、Idempotency、Truncation、Large Result、Remote Tool、MCP Tool、Skill Tool、Plugin Tool、Permission、Lifecycle、Log、Trace、Cost、Approval。

## Tool Interface

> 协议 / 接口 / 类型。

## Schema

> JSON Schema / Zod / Pydantic。

## Registry

> 注册机制（`@tool` / `ToolRegistry.register()` / 配置文件）。

## Discovery

> 启动时 / 运行时动态发现。

## Dispatch

> 分发策略、并发、串行。

## Validation

> 参数校验、错误模式。

## Result Normalization

> 转成什么样结构给到模型。

## Error Format

> 错误如何出现在 Tool Result。

## Timeout

> 实现方式。

## Cancel

> AbortSignal 传播。

## Concurrency

> 多 Tool Call 是否并发。

## Retry

> 是否支持，policy。

## Idempotency

> 幂等键。

## Truncation

> 大结果截断。

## Large Results

> artifact / file / cache。

## Binary

> 二进制结果处理。

## Streaming

> 流式 Tool Result。

## UI Result

> 自定义组件。

## Remote Tool

> 跨进程 / 跨网络 Tool。

## MCP Tool

> 接入 MCP server。

## Built-in Tool

> 系统内置工具。

## User Tool

> 用户自定义。

## Plugin Tool

> 来自 plugin。

## Skill Tool

> 来自 skill。

## Permission

> Tool 层与 Permission 系统交互。

## Lifecycle

> 注册 / 启停 / 卸载。

## Log

> Tool 执行日志。

## Trace

> OpenTelemetry / 自有 Trace。

## Cost

> 调用成本估算与统计。

## Name Collision

> Tool 命名冲突如何处理。

## Version

> 工具版本控制。

## Dependency

> 工具依赖声明。

## Isolation

> 工具执行隔离。

## Cache

> Tool Result Cache。

## Approval

> User / Admin 审批流。

## Verified Facts

## Inferences

## Unknowns

## RoboThree Implications

> Tool Runtime + Tool Registry + Tool Permission 设计。

## Evidence Index

## Last Updated
