# grok-build — Research Index

## 项目标识

| 属性 | 值 |
| --- | --- |
| 项目 | grok-build |
| 仓库 | `xai-org/grok-build` |
| 研究 Commit | `98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce` |
| 研究深度 | **Level 3: 核心架构研究 + 三个机制深挖** |
| 分析日期 | 2026-07-18 |
| 分析者 | Claude (manual, no runtime execution) |

## 研究文件清单

| 文件 | 类型 | 状态 | 说明 |
| --- | --- | --- | --- |
| `index.md` | Required | ✅ | 本文件 |
| `project-overview.md` | Required | ✅ | 项目定位 + 技术栈 + License |
| `source-map.md` | Required | ✅ | Crate 目录地图 |
| `architecture.md` | Required | ✅ | 核心架构 + Permission/Security 分析（Level 3 增强） |
| `runtime-sequence.md` | Required | ✅ | 完整调用链（Level 3 补充 Tool 并发 + Subagent 权限继承） |
| `robothree-fit-analysis.md` | Required | ✅ | 五分类结论（Level 3 扩展） |
| `open-questions.md` | Required | ✅ | 未解答问题（Level 3 部分回答） |
| `LICENSE-NOTES.md` | Required | ✅ | License 审查记录 |
| `skill-trial-notes.md` | — | ✅ | Skill 试运行反馈（Level 3 补充） |
| `subagent-system.md` | Conditional | ✅ (Level 3 触发) | Subagent 权限继承深挖 |
| `tool-system.md` | Conditional | ✅ (Level 3 触发) | Tool Runtime 并发深挖 |
| `final-review.md` | Advanced | ✅ | Level 3 30 项完整自检 |

## Level 3 深挖机制选择依据

| 机制 | 优先级 | 选择理由 |
| --- | --- | --- |
| Subagent 权限继承边界 | HIGH | Level 2 open-questions #2 标记 HIGH；影响 RoboThree Subagent Runtime 安全模型 |
| Sampler retry/fallback | MEDIUM | Level 2 open-questions #1；影响 Sampler 设计；Level 3 部分回答 |
| Tool 执行并发控制 | MEDIUM | Level 2 已知但细节未确认；影响 Tool Runtime 并发策略 |

## Conditional 文件触发判定

| 文件 | 触发 | 理由 |
| --- | --- | --- |
| `tool-system.md` | **是** | Level 3 触发：Tool Runtime 并发 + auth retry + abort 跨机制，architecture.md 不够承载 |
| `subagent-system.md` | **是** | Level 3 触发：权限继承的精确边界（含 PermissionHandle Arc-shared 细节）需独立文件 |
| `permission-system.md` | **否** | Permission 已在 architecture.md §5 + Level 3 §"权限继承的精确边界" 覆盖 |
| `deployment-model.md` | **否** | Leader 模式已描述，不构成完整 deployment model |
| `security-review.md` | **否** | worktree ≠ sandbox 已区分；permission 已分析 |
| `model-system.md` | **否** | Sampler retry/backoff 已在 architecture.md §6.1 覆盖 |
| `context-system.md` | **否** | Context 不是 grok-build 核心创新点 |
| `session-state-memory.md` | **否** | JSONL 持久化已在 Level 2 描述，Memory crate 未深挖 |

## 研究历史

- 2026-07-18: Level 2 研究完成 (commit `98c3b24`)
- 2026-07-18: Level 3 三个机制深挖完成 (commit `98c3b24`)

## 下一步

- Level 3 已完成，未发现需要继续深挖的机制
- 其他 Level 3 候选: MCP server 完整生命周期、xai-grok-memory 实现、xai-codebase-graph 算法