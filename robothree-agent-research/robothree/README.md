# robothree/

RoboThree 的设计文档与 ADR 目录。

> ⚠️ 当前文件全部为占位模板（阶段一）。
> 在阶段二开始时,本目录将由 `robothree-architect` Subagent 根据已完成的 `research/<project>/` 报告填充。

## 目录约定

```
robothree/
├── README.md
├── target-architecture.md      # 顶层目标架构、组件图、术语表
├── module-boundaries.md        # 模块划分、依赖方向、边界接口
├── agent-runtime.md            # 主循环、状态机、调度策略
├── skill-system.md             # Skill 模型、加载、调度
├── memory-system.md            # Memory 分层、存储、检索
├── security-model.md           # 权限、沙箱、Secret、Prompt Injection
└── adr/                        # Architecture Decision Records
```

## 与 research/ 的关系

```
research/<project>/*.md      ── 提供事实与对比
        │
        ▼
robothree/*.md               ── 吸收事实后形成 RoboThree 取舍
        │
        ▼
robothree/adr/*.md           ── 关键决策的不可回退记录
```

## 编写约束

- 每篇 `robothree/*.md` 顶部必须列出对应的 `research/<project>/<file>.md` 来源。
- 关键决策必须升级为 ADR，不得只在散文中描述。
- 借用上游模式时必须配套 `LICENSE-NOTES.md` 审计。
