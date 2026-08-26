# robothree/adr/

> Architecture Decision Records。
> 关键决策必须升级为 ADR；散文式描述不可替代 ADR。

## 命名约定

```
<4 位编号>-<kebab-title>.md
```

示例：

- `0001-agent-runtime-loop.md`
- `0002-skill-vs-tool-boundary.md`
- `0003-memory-persistence-format.md`
- `0010-permission-system-default-deny.md`

## 编号规则

- 编号永不重用。
- 每新建一个 ADR，编号递增；可使用 `scripts/new-adr.sh` 自动取号（阶段二实现）。

## 状态机

| Status | 含义 |
| --- | --- |
| `Proposed` | 已起草，待评审 |
| `Accepted` | 已通过，未来 RoboThree 实现以此为准 |
| `Superseded by <NNNN>` | 被新决策替代 |
| `Rejected` | 评审未通过，不再重提 |

变更现状：在文件中追加一节 "Status History"，不要删旧内容。
