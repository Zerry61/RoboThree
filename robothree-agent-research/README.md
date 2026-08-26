# RoboThree Agent Architecture Research

> 不是 RoboThree 产品代码库，而是 **Agent Architecture Intelligence Base**。
> 通过源码级研究，为 RoboThree 的运行时、Worker、Skill、Memory、Tool、Subagent、Permission、多端架构提供可验证技术参考。

## 工程使命

1. 对开源 Agent 项目做**源码级**分析，而非 README 级总结。
2. 沉淀结构化**架构事实**与对 RoboThree 的**设计建议**。
3. 长期跟踪上游版本变化，更新研究报告。
4. 作为 RoboThree 正式开发阶段的**架构决策中心**。

## 目录结构

```
robothree-agent-research/
├── CLAUDE.md                 # Claude Code 在本工程内的工作守则
├── README.md                 # 本文件
├── sources/                  # 竞品源码镜像（占位，阶段二填充）
│   ├── grok-build/
│   ├── hermes-agent/
│   ├── openclaw/
│   └── other-agents/
├── research/                 # 研究报告
│   ├── _template/            # 报告模板与共用工具
│   ├── grok-build/
│   ├── hermes-agent/
│   └── comparisons/
├── robothree/                # RoboThree 设计文档
│   ├── target-architecture.md
│   ├── module-boundaries.md
│   ├── agent-runtime.md
│   ├── skill-system.md
│   ├── memory-system.md
│   ├── security-model.md
│   └── adr/
├── schemas/                  # 结构化研究报告规范
│   ├── project-analysis.schema.json
│   ├── module.schema.json
│   └── comparison.schema.json
├── scripts/                  # 自动化工具
│   ├── update-sources.sh
│   ├── generate-code-map.py
│   └── verify-citations.py
└── .claude/                  # Claude Code 配置（占位）
    ├── skills/
    ├── agents/
    └── commands/
```

## 当前阶段

**阶段一：基础设施搭建**

- [x] 目录骨架
- [x] `CLAUDE.md` 工作守则
- [x] `schemas/` 研究输出规范
- [x] `robothree/` 设计文档模板
- [x] `research/_template/` 报告模板
- [ ] Skill 与 Subagent（阶段二）
- [ ] 竞品库与具体分析（阶段二）

## 使用流程（规划）

```
启动 Claude Code
    │
    ▼
读取 CLAUDE.md
    │
    ▼
读取 schemas/ 下的研究规范
    │
    ▼
按 prompt 启动具体研究任务
    │
    ▼
产出 research/<project>/<dimension>.md
    │
    ▼
人工评审 + 搬入 robothree/adr/
```

## 研究对象（计划）

| 项目 | 主要研究价值 |
| --- | --- |
| Grok Build (xai-org) | Coding harness、上下文组装、工具分发、TUI |
| Hermes Agent (Nous Research) | 长期记忆、Skill 学习、远程运行、自我改进 |
| Claude Code 源码分析 | 权限、压缩、Hook、MCP、Subagent |
| OpenClaw | 多渠道入口、Gateway、个人 Agent 控制面 |

## 许可证

本工程本身的文档使用 MIT / CC-BY-4.0 双协议，引用上游代码片段时严格遵循各上游项目许可证，详见 `research/<project>/LICENSE-NOTES.md`。
