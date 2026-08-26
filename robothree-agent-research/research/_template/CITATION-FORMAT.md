# 源码引用规范

任何架构结论都必须可追溯到具体源码。本规范定义统一的引用格式与置信度标记。

## 引用格式

### 行内引用

```
<project>@<short-sha>:path/to/file.ts:LL
<project>@<short-sha>:path/to/file.ts#L10-L30
```

示例：

- `grok-build@a1b2c3d:src/cli/index.ts:42`
- `hermes-agent@9f8e7d6:src/runtime/loop.ts#L100-L142`

### 完整 SHA

- 完整 SHA 仅在 `analysis.json` 的 `commit.sha` 字段中记录一次。
- 报告内一律使用 short SHA + 文件 + 行号。

## 置信度标记

- `[F]` Fact — 直接源自代码、文档、运行输出。给出 commit 与行号。
- `[I]` Inference — 基于源码做出的合理推断。给出推断依据，并说明在何种条件下该推断会被推翻。
- `[R]` Recommendation — 对 RoboThree 的设计建议。

## 引用纪律

1. **禁止 READMEness**：仅根据 README 给出的架构结论不可作为 `[F]`。
2. **过期失效处理**：报告引用某 commit 后，若上游有变更，必须用 `scripts/update-sources.sh` 跟踪并重新核对。
3. **许可证前置**：每次引用上游代码片段，先确认对应项目许可证。
4. **不要整段复制**：超过 20 行的代码片段必须给出原始仓库链接，并显著标注"引用自 upstream，非 RoboThree 代码"。

## evidence 字段约定

- 在 `schemas/project-analysis.schema.json` 里，`evidence` 必须为字符串数组，每项是 `path:line` 或 issue 链接。
- 不要写"详见 README.md"作为 evidence。
