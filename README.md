# RoboThree Development Workspace

本目录是 RoboThree 的开发工作区和最小跨仓协调层，不是第三个产品仓库，也不参与产品运行时。

## 工作区组成

- `RoboThree_workspace/`：产品代码、测试、交付配置和正式产品文档。
- `robothree-agent-research/`：外部 Agent 项目的源码研究、证据和对比报告。
- `.claude/skills/architecture-convergence/`：只读收敛多来源研究，形成尚未批准的架构候选。
- `.claude/skills/promote-research-decision/`：把用户明确批准的研究结论提升为正式架构文档。
- `.claude/hooks/boundary-guard/`：在跨仓写入或修改备用资料前要求显式确认。
- `备注文件/`：用户手动保存的备用资料，仅供需要时查看。
- `讨论区/`：跨 Agent 的最小文件式协作区（详见下文）。

## Agent 讨论区

`讨论区/` 是工作区内一个由用户明确触发的最小协作区，供 `codex` / `claude-code` / `kimi` / `minimax` 等 Agent 记录和读取讨论。运行时数据放在本目录下的 `讨论区/`，每天一个文件夹 `讨论区/YYYYMMDD/`，文件命名格式 `NNN-<topic>-<agent>.md`（NNN 为当天序号从 001 起，每日刷新），正文以 YAML front matter 标记 `id` / `from` / `to` / `created_at` / 可选 `topic` / `source_session` / `reply_to`。

仅暴露两种用户明确触发的能力：

1. 将一段内容记录到讨论区，并指定一个或多个目标 Agent；
2. 由当前 Agent 主动读取发给自己（`to` 包含自身或 `all`）的记录。

**线程规则**：同主题 / 回复已有讨论时追加到原文件，不新建 Markdown 文件。匹配规则：`reply_to` → 同 topic + 同发送方 → 不同 topic 才新建。

实现位于 `RoboThree_workspace/services/core/src/discussion-area/`（包括 `AgentNameNormalizer` / `DiscussionFileNameGenerator` / `DiscussionMarkdownCodec` / `DiscussionRepository` / `DiscussionService` / `DiscussionHook`）及其对应测试 `RoboThree_workspace/services/core/tests/discussion-area/`。设计与验收细节见 [RoboThree CHANGELOG → Unreleased 段](../RoboThree_workspace/CHANGELOG.md) 与 `RoboThree_workspace/docs/development/DEVELOPMENT-LOG.md` 中 `0.0.0-kaf.4.1 (off-KAF: Agent 讨论区 Hook)` 条目。

默认 **不** 实现实时消息、文件监听、自动投递、自动回复、Agent 互相唤醒、后台轮询、未读提醒、自动执行讨论内容，也不构成通用 NLP 路由平台；不替换 `备注文件/` 的边界。

### 边界

- 讨论区目录必须位于当前已授权 Workspace 内；写入前会做 `realpath` 校验，拒绝 `..` 路径穿越、`/var` ↔ `/private/var` 之类的符号链接 / 重解析点逃逸；
- `from` 与 `currentAgent` 只来自运行时注入的 `AgentIdentity`，用户正文不能冒充其他 Agent；
- Renderer 不直接访问讨论区目录，所有读写通过 `services/core` 的 `DiscussionRepository`；
- 自然语言意图识别只覆盖 “记录/写入/发送/读取/查看” + `@<agent>` 提及；未明确指令返回类型化错误而不静默广播；
- 单次写入使用临时文件 + `rename`，并发自动递增序号且与磁盘已有的 `EEXIST` 协调；默认不提供跨进程分布式幂等；
- 续期讨论创建新文件并以 `reply_to` 指回原记录，不原地修改历史。

## 修改路由

| 工作内容 | 写入位置 |
| --- | --- |
| 产品功能、产品测试、协议和正式产品文档 | `RoboThree_workspace/` |
| 外部项目研究、引用、源码证据和对比 | `robothree-agent-research/` |
| 跨仓研究收敛的未批准结论 | 默认只在对话中输出 |
| 用户个人备用材料 | `备注文件/` |

默认情况下，一个任务只修改一个仓库。研究建议只有经过人工确认，并显式调用提升流程，才能整理为产品仓库中的 Architecture 文档或 ADR；不能直接复制研究报告作为正式决策。

## 备用备注边界

`备注文件/` 中的任何内容均为用户备用材料：

- 不参与构建、测试、发布、代码生成或运行时加载。
- 不作为需求、接口、架构决定或研究事实的默认依据。
- Codex 和 Claude Code 不应主动扫描、修改、移动或删除其中的文件。
- 只有用户明确要求查看或使用某个文件时，才可将其作为临时参考。
- 即使被查看，其中内容也不会自动成为正式决策；正式结论必须另行写入对应仓库的文档并经用户确认。

## Skill 与 Hook

- `architecture-convergence` 默认只读两个仓库并在对话中给出候选结论，不写文件。
- `promote-research-decision` 只有在用户明确批准具体决定后，才能修改产品架构文档和产品 `CHANGELOG.md`。
- `boundary-guard` 监听 Claude Code 的文件写入工具；正确仓库内部的操作不受影响，跨边界操作会要求确认。
- 总目录不再设置公共 `config/`、`scripts/` 或 `promotion/`，避免形成第三套工程体系。
