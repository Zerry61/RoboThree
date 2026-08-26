# Skill Trial Notes — grok-build Level 3

## Useful Rules

1. **Stage A → B → D 升级路径 + 三个 Conditional 触发** — Level 3 在已有 Level 2 baseline 上的扩展模式运行良好。
2. **复用 Required 文件 + 新增 Conditional** — 避免无意义重写是 Level 3 的关键原则。本次通过 `architecture.md §6.1`、`open-questions.md` "Resolved" 注释、`runtime-sequence.md` "Level 3 补充" 段落实现。
3. **每个机制独立成文（Conditional 文件）** — `subagent-system.md` 和 `tool-system.md` 各自承载一个机制的完整分析，互不干扰。
4. **`final-review.md` 的 30 项自检** — 强制结构化检查避免遗漏。

## Redundant Rules

1. **重复的 evidence 引用** — 在 Level 2 runtime-sequence.md 已经引用过 PermissionHandle，在 Level 3 subagent-system.md 又重复出现。但 Conditional 文件需要独立证据集，重复不可避免。
2. **Conditional 触发条件列表** — §5.3 列出了 11 个条件，本次 Level 3 触发 2 个，但仍要逐一评估其他 9 个，耗费时间。

## Missing Rules

1. **Level 3 完成后如何升级回 Level 2 baseline** — 当前 Skill 描述"复用 Required 文件"但没说如何在 baseline 文件中标注 "Level 3 enhanced"。本次使用 "（Level 3 增强）" 标签手动标注。
2. **Conditional 文件之间的引用规范** — `tool-system.md` 引用 `architecture.md` 是 OK 的，但如何在 Conditional 之间互相引用没有明确规则。本次在 runtime-sequence.md "Level 3 补充" 中用引用方式统一管理。
3. **PermissionHandle Arc<AtomicBool> 这种"看起来简单的设计但有微妙语义"** 的发现流程 — Skill 没有教如何发现跨 session 状态共享，本次通过 `grep "PermissionHandle"` 全仓搜索 + 单点溯源得到。

## Output Duplication

- `subagent-system.md §2` 与 `architecture.md §5 "权限继承的精确边界"` 内容高度重叠。本次的处理：在 architecture.md 中加简短摘要 + 完整链接到 subagent-system.md。
- `tool-system.md §1` 与 `runtime-sequence.md "Level 3 补充: Tool 并发执行"` 重叠。同样：subagent-system.md 是权威，runtime-sequence.md 是 Hop 引用。
- `architecture.md §6.1 Sampler Retry/Fallback` 是新加内容，与 tool-system.md / subagent-system.md 无重叠。

## Conditional Trigger Quality

本次判定：

- `subagent-system.md`: **触发** — PermissionHandle Arc-shared 设计 + 共享 vs 隔离表 + cleanup path 都需要独立文档
- `tool-system.md`: **触发** — 并发模型 + auth retry + interruptible wait tool 跨多文件 200+ 行代码

判定准确。

## Evidence Friction

1. **大函数中埋藏关键逻辑** — `execute_tool_calls()` 长达 3000 行，关键的 `FuturesUnordered` + `OnceCell<bool>` 在文件后段，需要多次滚动才能找到。
2. **macro 和 type alias 增加追踪难度** — `PermissionHandle::Actor { cmd_tx, yolo_state, .. }` 的字段分散在多个 match arm 中。
3. **clone() 掩盖共享状态** — `ctx.permission_handle.clone()` 看起来是普通 clone，实际因为 Arc-shared 字段实现了跨 session 共享。这是 Level 3 才发现的语义。
4. **SamplingError 多达 10+ variant** — `is_retryable()` 的 match 跨多行，需要逐项确认哪些是 retryable。

## Recommended Skill Changes

1. **增加"Conditional 文件互相引用规范"** — 明确权威文件 (master) vs 引用文件 (linker) 的角色分工。
2. **增加"Arc-shared 字段识别方法"** — 当字段类型是 `Arc<T>` 时，明确这是跨所有者共享状态，需要额外关注生命周期。
3. **为 Level 3 baseline 升级添加标签规范** — 在复用文件中明确标注 "Level X enhanced" 段或章节。
4. **简化 11 个 Conditional 触发条件的逐一评估** — 提供 "definitely-no" 快速判定，例如"没有 worker pool" → 直接 skip observability-reliability。
5. **final-review.md 模板应内嵌 30 项检查清单** — 当前 Skill §12.3 提到 30 项但没列具体内容，本次需自行设计。

## Final Assessment

Level 3 三个机制深挖顺利。复用 Level 2 baseline + 新增 Conditional + final-review 的模式清晰。Conditional 触发的判定精准——没有创建低质量文件。

主要摩擦：

- 大函数中关键逻辑分散（execute_tool_calls 3000 行）
- Arc-shared 字段的语义需要专门识别

整体: **Pass**。本次 Level 3 完成了用户指定的三个机制，并升级了 Level 2 的 ADOPT/ADAPT 结论。