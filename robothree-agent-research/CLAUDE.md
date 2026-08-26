# CLAUDE.md — RoboThree Agent Architecture Research

Claude Code 在本工程中工作时，请遵守以下规则。

## 1. 工程定位

本工程不是 RoboThree 产品代码库，而是：

> **Agent Architecture Intelligence Base**
> 为 RoboThree 的架构、技术选型、模块边界、能力差距和 ADR 提供可验证、可复用、可对比的源码级研究。

未来正式开发 RoboThree Core 时，确认过的设计文档和 ADR 再被搬进正式仓库。

## 2. 当前阶段

**阶段一：研究基础设施搭建**

- ✅ 建立目录骨架
- ✅ 建立研究规范 (`schemas/`)
- ✅ 建立证据规范 (`research/_template/`)
- ✅ 建立 ADR 模板 (`robothree/adr/`)
- ✅ Claude Code Skill 已建立（[`.claude/skills/agent-architecture-research/SKILL.md`](.claude/skills/agent-architecture-research/SKILL.md)）
- ⏸ 竞品库（`sources/`、`research/<project>/`）暂不填充

## 3. 一级目录约定

| 目录 | 作用 | 当前状态 |
| --- | --- | --- |
| `sources/` | 竞品开源代码镜像与快照 | 空目录占位 |
| `research/` | 已完成的项目源码分析报告 | 模板已建立 |
| `robothree/` | RoboThree 设计文档与 ADR | 模板已建立 |
| `schemas/` | 结构化研究输出规范 | 已定义 |
| `scripts/` | 自动化工具（更新、校验、生成） | 脚本模板已建立 |
| `.claude/` | Claude Code 配置 | Skill 1 套已建立（30 文件）；Subagent / Command 占位未启用 |

## 4. 工作原则（强制）

1. **结论必须有源码证据**：每个核心架构结论必须包含仓库名、Commit SHA、文件路径、Symbol、行号。
2. **三级标记**：
   - `[F]` Fact — 直接源自源码、文档或运行输出。
   - `[I]` Inference — 基于源码做出的推断。
   - `[R]` Recommendation — 对 RoboThree 的设计建议。
3. **拒绝 README-only**：不能仅根据 README 写出核心架构结论。
4. **追溯调用链**：从程序入口追踪到模型调用 → 工具调用 → 状态更新 → 结果输出。
5. **分离设计与代码**：提取设计思想与接口模式，不直接复制实现。
6. **许可证检查**：每个被研究项目都必须在 `research/<project>/LICENSE-NOTES.md` 记录许可证。
7. **安全单独建模**：Security / Permission / Remote Execution 单独成文，不混在通用架构文里。

## 5. 命名约定

- 报告：`<dimension>.md`（如 `architecture.md`、`runtime-loop.md`）。
- 引用：`<project>@<short-sha>`（如 `grok-build@1f2e3a4`）。
- ADR：`<NNNN>-<kebab-title>.md`（如 `0001-agent-runtime-loop.md`）。
- 源码引用：`path/to/file.ts:LL` 或 `path/to/file.ts#L10-L30`。

## 6. Skill / Subagent / Command 状态

- **`agent-architecture-research` Skill**：✅ 已建立。详见 [`.claude/skills/agent-architecture-research/SKILL.md`](.claude/skills/agent-architecture-research/SKILL.md)，§ 3 定义研究深度、§ 5 定义 4-Stage 默认流程、§ 10 定义 Required / Conditional / Advanced 三层产物。
- **Subagent**（`source-mapper` / `runtime-tracer` / `security-reviewer` / `architecture-comparator` / `robothree-architect`）：⏸ 已冻结。完成 ≥ 2 个真实项目研究前不建立；拆分前必须有真实数据证明节省上下文比汇总成本更多。完整策略见 SKILL.md § 14.2。
- **Slash Command**（`/research` / `/compare` 等）：⏸ 未启动。暂不需要。

## 7. 禁止事项

- ❌ 不要把推断标记为事实。
- ❌ 不要在没有源码证据的情况下下架构判断。
- ❌ 不要直接复制上游代码到 `robothree/`。
- ❌ 不要在没有许可证审查的情况下复用上游代码片段。
- ❌ 不要把"竞品总结"写成不可证伪的散文。
