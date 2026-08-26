# Model System

> Phase 4 必交付。

## Metadata

- Project:
- Repository:
- Branch:
- Commit:
- Analyzed at:
- Analyzer:
- Phase: 4
- Confidence:

## Scope

> Model Provider 抽象、Chat / Responses / Custom 协议、Tool Calling 转换、Streaming、Retry / Backoff / Fallback、Token / Cost、Special Models、Local / OpenAI-compatible、Capability Negotiation、Error Normalization。

## Provider Inventory

| Provider | Protocol | Tool Support | Verified |
| --- | --- | --- | --- |

## Unified Interface

> `generate()` / `stream()` / `invoke()` 等。

## Schema Conversion

> OpenAI tools ↔ Anthropic tools ↔ Gemini function calling。

## Streaming

> 流协议、分块、Backpressure。

## Retry/Backoff/Fallback

- Retry:
- Backoff:
- Fallback Provider:
- Circuit Breaker:

## Token Usage

> 抓取点、记录字段、暴露方式。

## Cost

> 计算公式、来源（pricing 表或估算）。

## Special Models

- Planning model:
- Summarization model:
- Judging model:
- Routing model:
- Embedding model:

## Local Model

- Supported Runtimes:
- Quantization:
- GPU/CPU Constraints:

## OpenAI-compatible

- Endpoint Config:
- Tool Calling Compatibility:
- Streaming Compatibility:

## Multi-Model Strategy

> 路由、负载均衡、降级。

## Capability Negotiation

> 模型能力差异如何收敛。

## Provider Error Normalization

- Rate limit:
- Overloaded:
- Context too long:
- Tool schema invalid:

## Verified Facts

## Inferences

## Unknowns

## RoboThree Implications

> Model Gateway + Provider Adapter 设计。

## Evidence Index

## Last Updated
