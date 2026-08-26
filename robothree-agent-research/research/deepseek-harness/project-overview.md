# DeepSeek Harness — Project Overview

## 1. 项目定位

DeepSeek Harness（`dsh`）是 DeepSeek AI 开发的开源 **agent harness（智能体框架）**，采用**一切皆插件**（everything is a plugin）架构，由 vendored 的 **Cordis** 框架驱动。

- `[F]` README 声明：`DeepSeek Harness (dsh) is an open-source agent harness developed by DeepSeek AI. It uses an architecture where everything is a plugin, and is powered by Cordis.`（[README.md:5](../../sources/deepseek-harness/README.md#L5)）
- `[F]` Cordis 的设计依据论文《A Programming Paradigm for Spatiotemporal Composability》（[README.md:7](../../sources/deepseek-harness/README.md#L7)）。
- `[F]` 状态为 **developer preview**，明确声明 `THERE WILL BE COMPATIBILITY-BREAKING CHANGES`（[README.md:11](../../sources/deepseek-harness/README.md#L11)）。
- `[I]` 这是一个真正的 Agent Harness（Agent Runtime + 插件框架），不是纯 LLM 客户端封装，符合本研究的适用项目类型（Agent Runtime / Plugin Framework / MCP Host / Worker）。

## 2. License Snapshot

- `[F]` MIT License，`Copyright (c) 2026 DeepSeek`（[LICENSE:1](../../sources/deepseek-harness/LICENSE#L1)）。
- `[F]` 第三方依赖及许可证披露于 `THIRD_PARTY_NOTICES.md`。
- `[F]` vendored 包（cordis / cosmokit / schemastery / timer 等）被 rescope 到 `@deepseek-ai/*` 命名空间并标记 `private: true`（[pnpm-workspace.yaml](../../sources/deepseek-harness/pnpm-workspace.yaml)）。
- `[I]` Cordis 上游为 [cordiverse/cordis](https://github.com/cordiverse/cordis)（MIT），DeepSeek 以 source-vendored 方式固定源码 + 本地修改日志（[vendor/README.md](../../sources/deepseek-harness/vendor/README.md)）。

> 复用分类：见 [LICENSE-NOTES.md](LICENSE-NOTES.md)。整体 **DESIGN_ONLY**（只参考接口与模式，不复制实现）；Cordis 框架本身若单独复用需按上游许可证复核（上游 Cordis 为 MIT，但 DeepSeek 版本存在本地修改）。

## 3. 技术栈

| 维度 | 值 | 证据 |
|---|---|---|
| 语言 | TypeScript（strict + noImplicitAny） | tsconfig.base.json |
| 包管理 | pnpm@11.7.0，workspace monorepo | [package.json](../../sources/deepseek-harness/package.json) `packageManager` |
| 模块体系 | 纯 ESM（`"type": "module"`） | 各 package.json + AGENTS.md 约定 |
| Node 引擎 | `^22.19.0 || >=24.0.0` | package.json `engines` |
| 构建 | `tsc -b`（Host/Client 双 aggregate）+ tsdown 打包 | package.json `build:lib:host/client` |
| 类型反射 | Typert（type-graph 生成器 + loader + registry） | packages/typert |
| 测试 | vitest（unit / snapshot / e2e / web-stress） | vitest.*.config.ts |
| Lint | oxlint + knip + jscpd（克隆检测）+ lefthook | .oxlintrc.json / knip.json |
| Schema 校验 | schemastery（vendored）+ standard-schema | vendor/schemastery |
| 附加运行时 | Python SDK（python/）、Landlock native runner（native/landlock-run） | python/ / native/ |

## 4. 版本与不可变引用

- `[F]` Commit SHA：`47f943859bef60e4160492346772ded9b24f765a`（`git rev-parse HEAD`）。
- `[F]` Branch：`master`；最后提交时间 2026-08-13 19:38:46 +0800。
- `[F]` 版本 `0.1.0-rc.5`（[package.json](../../sources/deepseek-harness/package.json) `version`）。
- `[F]` 尚无 tagged release（AGENTS.md：`Remove this section at the first tagged release`）。
- `[F]` `SESSION_FORMAT_VERSION = 0`，明确无兼容承诺：`no compatibility is implied, incompatible logs are rejected, and no migration is provided`（[types.ts:56](../../sources/deepseek-harness/packages/core/session/src/types.ts#L56)）。

## 5. 运行面

- `[F]` npm 方式：`npx @deepseek-ai/dsh web` → 启动 Web UI，默认 `http://127.0.0.1:3080`（README）。
- `[F]` 源码方式：`pnpm install && pnpm run build && pnpm dsh web`（README）。
- `[F]` `dsh` bin 入口：`"dsh": "node --import tsx/esm apps/cli/src/bin.ts"`（[package.json](../../sources/deepseek-harness/package.json) `scripts.dsh`）。
- `[F]` 模式：`web`（浏览器应用）、`headless`（一次性无服务器 runner）、`acp`（Agent Client Protocol 自动化 server）。
- `[F]` Profile：`web` 与 `headless` 作为模板；`dsh --profile web --dump-config` 查看实际启动的插件树。

## 6. 目录总览（一级）

| 目录 | 作用 | 证据 |
|---|---|---|
| `vendor/` | vendored Cordis 框架源码（cordis/cosmokit/schemastery/timer 等） | vendor/README.md |
| `packages/` | `@deepseek-ai/dsh-<pkg>` workspace（按 group/pkg 两层） | packages/README.md |
| `apps/` | `cli`（`dsh` bin）+ `web`（浏览器应用） | apps/cli、apps/web |
| `python/` | Python SDK + bundled runtime（sdk / sdk-runtime） | python/README.md |
| `native/` | Landlock native runner（`node-addon-landlock-run`） | native/README.md |
| `examples/` | 可运行 cordis.yml leaf（依赖解析成员，非构建目标） | examples/AGENTS.md |
| `docs/` | architecture + 生成 catalog + postmortem + cookbook | docs/architecture.md |
| `scripts/` | repo gates + 生成器（`verify-*` / `gen-*`） | scripts/ |
| `website/` | VitePress 文档站 | website/ |
| `.agents/` | Agent 工作流 + Agent Notes（不可信输入，不作证据） | .agents/ |

## 7. 关键包角色（core spine）

| 包 | 拥有 | `ctx` key | 证据 |
|---|---|---|---|
| `core/session` | append-only `SessionEvent` log + in-memory store | `ctx.sessions` | session/index.ts |
| `core/system-prompt` | prompt-section + tool-schema 组装 | `ctx.systemPrompt` | system-prompt/index.ts |
| `core/tools` | scoped tool registry + guarded 执行管线 | `ctx.tools` | tools/index.ts |
| `core/agent` | `Agent` 接口 + live registry + `agent/*` 事件 | `ctx.agents` | agent/* |
| `core/agent-loop` | 默认驱动 `ReactLoopAgent` | `ctx.agentLoop` | agent-loop/agent.ts |
| `core/scope` | per-agent scoped-registration primitive | 库，无 key | scope/index.ts |
| `llm/llm` | message/stream 词汇 + adapter seam | `ctx.llm` | llm/index.ts |

## 8. 与 RoboThree 研究的相关性

- `[R]` 本项目是**极少数把“插件框架”作为一等公民 agent harness 底层的参考实现**：整个 agent 循环、工具、模型、session 都通过统一插件机制组装，与 RoboThree 的 Skill/Plugin/Hook 三块能力边界直接相关。
- `[R]` “model-visible ⟺ logged” 的 session log 真相源模式，是 RoboThree session/state/memory 模块值得深度对齐的设计。
- `[R]` capability seam（Definition/Provider/Consumer）+ fail-closed 安全，直接服务 RoboThree「Security 单独建模」。
