# Evidence Standard

> 统一的证据块格式、证据等级、引用规范、置信度、交叉验证、失效条件。
> 所有 Phase 0 - Phase 14 的结论都必须使用本规范。

---

## 1. 证据块（Evidence Block）

每条重要结论一律使用以下结构：

```markdown
### Evidence

- Repository: <owner/repo>
- Branch: <branch>
- Commit: <full-sha>            # 至少记一次完整 SHA 在 analysis.json
- Short SHA: <short-sha>         # 行内引用用
- File: <repo-relative path>
- Lines: <start[-end] | single>
- Symbol: <Class | function | const | trait | interface>
- Caller: <symbol or path:line, optional>
- Callee: <symbol or path:line, optional>
- Evidence type: SOURCE | TEST | RUNTIME | CONFIG | SCHEMA | DOCUMENTATION
- Conclusion type: FACT | INFERENCE | RECOMMENDATION | UNKNOWN
- Confidence: HIGH | MEDIUM | LOW
- Observation: <一段直读源码/测试/运行结果的客观描述>
- Interpretation: <在该观察下做出的推断，前提条件>
- RoboThree implication: <对 RoboThree 的具体建议，ADOPT/ADAPT/DEFER/REJECT/NEEDS_MORE_EVIDENCE>

#### Cross-references

- <同结论在其它文件的位置，>= 2 个才算交叉验证>
```

每个 Phase 模板（如 `tools/tool-system.md`）允许在该模板顶部一次性声明 Repository / Branch / Commit，然后单条 Evidence 仅写 `File / Lines / Symbol / Caller / Callee`。

---

## 2. 证据等级

优先级如下（HIGH 最强）：

| 级别 | 适用 |
| --- | --- |
| **RUNTIME** | 实际运行结果：日志、curl、单元测试输出、Playwright 截图、性能 trace。 |
| **TEST** | 测试代码本身（但注意 mock 不是 production）。 |
| **SOURCE** | 核心源码。 |
| **CONFIG** | 配置文件、Schema、manifest。 |
| **SCHEMA** | 单独提出的 schema 文件（JSON Schema / Proto / Zod）。 |
| **DOCUMENTATION** | 官方文档、`docs/`、`docs/api.md`。 |

证据等级在每个 Evidence 块的 `Evidence type` 字段里单值标注。组合时另起新 Evidence 块。

---

## 3. 结论类型

| 结论类型 | 含义 | 反例 |
| --- | --- | --- |
| **FACT** | 可由源码 / 测试 / 配置 / 运行结果直接证明。 | "支持 Tool" 是 FACT 仅当 grep 到真实 tool registry 代码并 trace 到 dispatch。 |
| **INFERENCE** | 基于多个源码证据做出的合理推断。 | "看起来使用 stale-while-revalidate" 必须给出 logger 与 fetch 路径两处证据。 |
| **RECOMMENDATION** | 对 RoboThree 的建议。 | "建议 RoboThree 模块 X 引入 Y 模式"。 |
| **UNKNOWN** | 证据不足。 | 必须显式登记到 `open-questions.md`。 |

禁止：

- 把 INFERENCE 写成 FACT。
- 把 RECOMMENDATION 伪装成 FACT。
- 用 UNKNOWN 偷懒：必须说明需要什么证据才能变 INFERENCE 或 FACT。

---

## 4. 置信度

- **HIGH**：>= 2 个独立证据 + 关键调用路径已 trace。
- **MEDIUM**：1 个完整证据 + 间接支持。
- **LOW**：少量代码片段 + 没有 trace。

升级 / 降级规则：

- 测试覆盖该路径 → +1 档。
- 调用路径未完全 trace → -1 档。
- 跨文件跨越多个抽象层 → -1 档。
- 配置声明但运行时不读 → 置信度 LOW，结论改为 UNKNOWN。

---

## 5. 多证据交叉验证

- 复杂结论必须 >= 2 个独立证据。
- "独立" 定义：文件不同 + Symbol 不同 + 作者意图不同（不是单纯 grep 多次）。
- 测试代码 + 源码 = 强证据。
- 源码 + 配置 + 文档 = 中等证据。
- 仅文档 = 不算证据。

---

## 6. 来源路径与 Symbol

- 文件路径：仓库相对路径（不带 `sources/<project>/` 前缀）。
- Symbol：必须给出函数 / 类 / 常量名 / trait / interface；如果只是行号，标 `anonymous`。
- 行号：仅对固定 Commit 有效，跨版本需重新核对。
- Caller / Callee：用 `<symbol>` 或 `path:line` 表示；多跳时省略中间节点。

---

## 7. 引用规范

**行内格式**：

```text
<owner>-<project>@<short-sha>:<path>:<line>
```

示例：

```text
robothree-research@grok-build@a1b2c3d:src/runtime/loop.ts:142
```

工程全局已有 `research/_template/CITATION-FORMAT.md` 与 `scripts/verify-citations.py`，二者结合使用。Skill 不创造新格式，但要求 Evidence 块同时包含结构化字段，比行内引用更严格。

---

## 8. 失效条件

- 上游代码变更后，旧行号可能偏移，必须重新 trace。
- 抽象层改名（`Foo → Bar`）后，Symbol 失效。
- 配置改了但代码未跟进 → 实际行为与文档不一致，以源码 / 运行结果为准。
- 测试覆盖为 mock 而非集成 → 不能作为 production 行为证据。
- 多个平台 / OS 实现不同 → 必须分别标注，不可合并。

---

## 9. 未知项处理（UNKNOWN）

每个 UNKNOWN 必须显式写：

```markdown
### Evidence

- Repository: <owner/repo>
- Commit: <sha>
- Conclusion type: UNKNOWN
- Confidence: LOW
- Observation: 没有找到 <X>
- Interpretation: 由于 <Y> 限制无法直接验证
- RoboThree implication: NEEDS_MORE_EVIDENCE

#### How to close

- 方案 A: 在 <file:line> 加日志 / 断点后重跑
- 方案 B: 阅读 <other-file> 反推
- 方案 C: 上游 issue 提问
```

`open-questions.md` 汇总所有 UNKNOWN，附研究动作。

---

## 10. 交叉引用与索引

每次研究结束后：

1. `analysis.json` 的每个维度包含 `evidence_path` 与 `confidence`。
2. 关键 FACT 在 `reusable-patterns.md`、`risks-and-limitations.md` 引用。
3. ADR 引用具体 Evidence 块 id（在文件里手动编号或锚点链接）。

---

## 11. 反模式清单（常见误判）

| 误判 | 反例 |
| --- | --- |
| "支持 MCP" 但只 import 包 | 验证 grep `mcp` + trace 到 Tool 注册 |
| "Memory 持久化" 但只在 SQLite 写消息 | 验证写入路径包含 memory schema 而非 message |
| "支持 Plugin" 但没有 manifest | 验证 manifest 字段、加载、卸载三件套 |
| "Sandbox" 但仅是 chroot | 验证 process / fs / net / signal 四项限制 |
| "Permission" 仅 UI 弹窗 | 验证 dispatcher 拦截点 |
| "Remote Worker" 但 UI 进程与工具同进程 | 验证 transport / IPC |
| "Multi-Agent" 仅 Prompt 切换 | 验证独立 Session / ToolSet / 进程 |
| "Realtime streaming" 但缺少 backpressure | 验证流控与 cancel |
| "Token optimization" 但无实测 | 验证有 benchmark 或 token stats |
| "OpenAI-compatible" 但 Tool Calling 不兼容 | 验证 tools schema 转换 |

---

## 12. 与工程既有规范的关系

- `research/_template/CITATION-FORMAT.md` 已经定义了 `[F]/[I]/[R]` 短标记与行内引用格式。
- 本规范的 Evidence 块是更严格的结构化形式；可由 `scripts/verify-citations.py` 与未来的 ADR / `analysis.json` 工具自动校验。
- 不破坏既有引用格式；二者并存。
