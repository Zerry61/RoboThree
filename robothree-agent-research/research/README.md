# research/

按开源项目组织的源码级研究报告。每篇报告对应 `schemas/project-analysis.schema.json` 的一个维度。

## 目录约定

```
research/
├── README.md                    # 本索引
├── _template/                   # 共用模板，禁止修改后被覆盖
│   ├── REPORT-TEMPLATE.md
│   ├── CITATION-FORMAT.md
│   └── LICENSE-TEMPLATE.md
├── grok-build/                  # 第一个研究对象
│   ├── analysis.json            # 完整结构化元数据
│   ├── architecture.md
│   ├── runtime-loop.md
│   ├── context-management.md
│   ├── tool-system.md
│   ├── permission-security.md
│   ├── key-source-files.md
│   ├── reusable-patterns.md
│   ├── risks-and-limitations.md
│   └── LICENSE-NOTES.md
├── hermes-agent/                # 第二个研究对象（待启动）
└── comparisons/
    ├── context-assembly.md
    ├── tool-dispatch.md
    ├── ...
```

## 当前状态

| 项目 | 状态 | 起始日期 | 完成日期 | Lead |
| --- | --- | --- | --- | --- |
| grok-build | ⏳ 待启动 | - | - | - |
| hermes-agent | ⏳ 待启动 | - | - | - |
| openclaw | ⏳ 待启动 | - | - | - |
| other-agents | ⏳ 待启动 | - | - | - |

## 报告命名约定

每个项目的 `*.md` 文件名必须和 `analysis.json.dimensions` 的 key 对齐：

- `positioning.md` ↔ `dimensions.positioning`
- `architecture.md` ↔ `dimensions.entry_point` + `dimensions.agent_loop` + 静态结构
- `runtime-loop.md` ↔ `dimensions.agent_loop` 的动态调用链追踪
- `context-management.md` ↔ `dimensions.context_assembly`
- `tool-system.md` ↔ `dimensions.tool_registry` + `dimensions.tool_dispatch`
- `permission-security.md` ↔ `dimensions.permission_system` + `dimensions.security_boundary`
- `key-source-files.md` ↔ `key_files`
- `reusable-patterns.md` ↔ `reusable_patterns`
- `risks-and-limitations.md` ↔ `risks`
