# QA Acceptance Report Template

> 模板。所有 `[占位符]` 必须在生成报告时替换为实际内容。不得保留占位符。
> 报告中所有密钥、Token、内部域名、客户数据必须脱敏（`***REDACTED***`）。
> 本报告为验收模式默认产物；修复验证模式请使用 `*-retest-*.md` 后缀，且 `RUN_ID` 必须带 `-retest-` 后缀。
> 所有路径使用相对 `${PROJECT_ROOT}` / `${CODE_ROOT}` 写法或对应占位符；不得硬编码绝对路径。
> 报告路径遵循 SKILL.md §6 双轨结构：
> - RoboThree 项目默认：`${CODE_ROOT}/docs/development/qa/<version>-claude-qa.md`（Codex 命名规范；同版本多次运行追加，不覆盖）
> - 非 RoboThree：`${CODE_ROOT}/qa-reports/<RUN_ID>/acceptance-report.md`

---

```markdown
# RoboThree QA Acceptance Report

| 项目 | 值 |
| --- | --- |
| RUN_ID | `YYYY-MM-DD-HHmm[-<scope-suffix>][-retest-N]` |
| 报告路径 | `${CODE_ROOT}/docs/development/qa/<version>-claude-qa.md` 或 `${CODE_ROOT}/qa-reports/<RUN_ID>/acceptance-report.md` |
| 验收模式 | 验收模式 / 修复验证模式 |
| 验收对象（dev version） | `<version>`（如 `0.0.0-kaf.0.1`），或 commit / branch / path / package |
| Contract Version | `<v1alpha1>` 等（从 DEVELOPMENT-LOG 读取） |
| 架构基线 | `<KN-XXX / ADR-XXX>`（从 DEVELOPMENT-LOG 读取） |
| 工作区根（PROJECT_ROOT）来源 | 用户参数 / ROBOTHREE_ROOT / `${CLAUDE_SKILL_DIR}/../../..` / `${CLAUDE_PROJECT_DIR}` / cwd |
| 工作区根（PROJECT_ROOT） | [解析后的绝对路径] |
| 代码仓根（CODE_ROOT）来源 | 用户 `--code-root` 参数 / Skill 默认派生 = `${PROJECT_ROOT}/RoboThree_workspace` / 用户声明"无代码层" |
| 代码仓根（CODE_ROOT） | [解析后的绝对路径] |
| Claude Code 版本 | [v2.1.196+ / < v2.1.196（低版本降级需记录）] |
| Git 状态 | 已初始化 / 未初始化 |
| Git 分支 | `<branch>` 或 `N/A` |
| Commit Hash | `<full sha>` 或 `N/A` |
| 工作区状态 | clean / dirty / N/A |
| 证据目录 | `${CODE_ROOT}/qa-reports/<RUN_ID>/evidence/` |
| 测试开始 | YYYY-MM-DD HH:MM (TZ) |
| 测试结束 | YYYY-MM-DD HH:MM (TZ) |
| 测试执行 | [Claude Code (Skill: independent-qa-acceptance, v0.x.y)] |
| 测试环境 | [OS / CPU / RAM / 磁盘 / Node / Python / Docker 版本] |
| 关联报告 | [复测/历史报告 RUN_ID，无则 N/A] |

## 1. 执行摘要

- 验收对象：`<version>` / commit / branch / path；来源（用户 `--scope` / DEVELOPMENT-LOG 自动识别）。
- 验收基线来源：DEVELOPMENT-LOG 的"独立 QA 建议范围 + 已知缺口 + 自测命令" + 本 Skill RoboThree K 段 + 基础门禁 A 段。
- PROJECT_ROOT 来源：[用户参数 / ROBOTHREE_ROOT / `${CLAUDE_SKILL_DIR}/../../..` / `${CLAUDE_PROJECT_DIR}` / cwd]
- CODE_ROOT 来源：[用户 `--code-root` 参数 / Skill 默认 = `${PROJECT_ROOT}/RoboThree_workspace` / 用户声明"无代码层"]
- Git 状态：[已初始化（分支 X / commit Y）/ 未初始化（默认跑基础门禁 + 用户确认功能范围）]
- 扫描排除列表生效：[node_modules / dist / build / out / qa-reports / .claude / robothree-agent-research/sources / .git / coverage / .cache / .next / __pycache__]
- 未测试范围：[明确说明不测试的部分与原因]
- 环境限制：[Git 不可用、缺工具、缺数据等]
- 自动装包：[未发生 / 已发生（列出包名 + 用户批准证据）]
- 修改 package.json / lockfile：[未发生 / 已发生（列出文件 + 用户批准证据）]
- 破坏性 / 压力 / 长时间 / 付费测试：[未执行 / 已执行（列出 + 用户授权证据 + 隔离环境说明）]
- 结论：**PASS / PASS WITH RISKS / FAIL / INCOMPLETE**
- 一句话结论：[用一句话说明本次是否可发布]
- 回链：`DEVELOPMENT-LOG.md` 中 `<version>` 的"独立 QA"段落已追加本报告链接与结论（必须）。
- 未测试范围：[明确说明不测试的部分与原因]
- 环境限制：[Git 不可用、缺工具、缺数据等]
- 结论：**PASS / PASS WITH RISKS / FAIL / INCOMPLETE**
- 一句话结论：[用一句话说明本次是否可发布]

## 2. 问题统计

| 等级 | 数量 | 已修复 | 未修复 | 已接受风险 |
| --- | --- | --- | --- | --- |
| P0 | 0 | 0 | 0 | 0 |
| P1 | 0 | 0 | 0 | 0 |
| P2 | 0 | 0 | 0 | 0 |
| P3 | 0 | 0 | 0 | 0 |

> 等级定义见 `references/severity-levels.md`。

## 3. 项目技术栈摘要

- 语言与运行时：
- 包管理工具：
- 测试框架：
- 构建工具：
- 容器化：
- 启动方式：
- 是否存在 PRD / 架构文档 / 验收标准：
- Git：[已初始化（含分支与 commit）/ 未初始化]

## 4. 验收基线

### 4.1 正式基线（如有）

- PRD：`[路径]`
- 架构：`[路径]`
- 验收标准：`[路径]`
- CHANGELOG：`[路径]`

### 4.2 临时基线（如无正式文档）

> 以下验收标准是根据当前代码、README、API/UI、提交说明、架构文档推导的临时基线，并非正式产品需求。

| AC 编号 | 用户场景 | 前置条件 | 操作步骤 | 预期结果 | 等级 | 自动化 |
| --- | --- | --- | --- | --- | --- | --- |
| AC-X-01 | ... | ... | ... | ... | P? | 是/否 |

## 5. 测试执行记录

每条命令记录：执行目录、完整命令、开始/结束时间、Exit Code、关键输出片段、通过与否、证据路径。

### 5.1 构建与基础质量

| 命令 | 时间 | Exit | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| `pnpm install --frozen-lockfile` | HH:MM-HH:MM | 0 | 通过 | `evidence/A1-install.log` |
| `pnpm typecheck` | ... | ... | ... | ... |
| `pnpm lint` | ... | ... | ... | ... |
| `pnpm test` | ... | ... | ... | ... |
| ... | | | | |

### 5.2 功能测试

[同上格式]

### 5.3 Worker Runtime / 模型网关 / MCP / 企业 Agent

[同上格式]

### 5.4 Electron 桌面端

[同上格式]

### 5.5 文件与办公文档

[同上格式]

### 5.6 安全

[同上格式]

### 5.7 稳定性

[同上格式]

### 5.8 回归

[同上格式]

## 6. 验收矩阵

按 `references/test-checklist.md` 勾选。每项给出"通过 / 失败 / 未验证 / 环境阻塞 / 不适用"五选一。

| 编号 | 项目 | 结论 | 证据 | 备注 |
| --- | --- | --- | --- | --- |
| A1 | 依赖安装 | 通过 | `evidence/A1-install.log` | |
| A2 | 编译 | 失败 | `evidence/A2-build.log` | 见 ISSUE-0001 |
| ... | | | | |

## 7. 问题清单

每条问题独立小节，按以下模板填充：

### ISSUE-XXXX

| 字段 | 值 |
| --- | --- |
| 标题 | [一句话标题] |
| 严重等级 | P0 / P1 / P2 / P3 |
| 所属模块 | [模块名] |
| 发现方式 | [执行测试 / 用户反馈 / 静态扫描 / 代码审查] |
| 风险影响 | [影响面 × 触发条件 × 后果] |

**前置条件**：[列出复现前置条件]

**复现步骤**：

1. ...
2. ...
3. ...

**预期结果**：...

**实际结果**：...

**复现频率**：[稳定复现 / 偶发 N/M 次 / 未复现]

**证据**：

- 日志：`evidence/issue-XXXX.log`
- 截图：`evidence/issue-XXXX.png`
- Trace：`evidence/issue-XXXX.zip`
- 可能涉及代码：`path/to/file.ts:123`

**建议处理方向**：[一句话修复建议，不在本报告内修复]

**是否阻断发布**：是 / 否

[复制以上模板用于每个 ISSUE]

## 8. 已接受风险（仅 PASS WITH RISKS 时填写）

| 编号 | 标题 | 等级 | 接受人 | 接受时间 | 接受条件 |
| --- | --- | --- | --- | --- | --- |
| ISSUE-XXXX | ... | P2 | <name> | YYYY-MM-DD | 在 vX.Y.Z 修复 |

## 9. 环境阻塞（仅 INCOMPLETE 时填写）

| 编号 | 缺失项 | 影响范围 | 建议 |
| --- | --- | --- | --- |
| ENV-1 | Docker 未安装 | 5.1 构建 | 启用 Docker 后重测 |
| ... | | | |

## 10. 未验证项

| 编号 | 项目 | 原因 | 建议 |
| --- | --- | --- | --- |
| UV-1 | E2E 完整流 | 环境缺少 staging 数据 | 准备数据后重测 |
| ... | | | |

## 11. 发布结论

| 维度 | 判断 |
| --- | --- |
| P0 是否存在 | 否 |
| 未解决 P1 是否存在 | 否 |
| 关键验收项是否全部通过 | 是 |
| 证据是否充分 | 是 |
| **最终结论** | **PASS / PASS WITH RISKS / FAIL / INCOMPLETE** |

## 12. 风险说明与后续建议

- 风险说明：[已记录的风险及其影响]
- 后续建议：[下一轮验收前需要补的测试、需要修复的问题、需要补的文档]
- 下一步：[用户应做的决定：发布 / 修复 / 补测 / 接受风险]

## 附录 A：证据清单

| 文件 | 内容 | 用途 |
| --- | --- | --- |
| `evidence/install.log` | 依赖安装日志 | A1 |
| `evidence/build.log` | 编译日志 | A2 |
| `evidence/unit-test.log` | 单元测试输出 | A6 |
| `evidence/e2e-*.zip` | Playwright Trace | F / B |
| `evidence/screenshots/` | UI 截图 | F / B |
| `evidence/security-*.json` | Semgrep / audit JSON | H |

## 附录 B：命令日志

详细原始命令与输出见 `qa-reports/YYYY-MM-DD-HHmm-command-log.md`。

## 附录 C：复现脚本

最小复现脚本放在 `evidence/repro/` 下，每个 ISSUE 一个文件：

- `evidence/repro/ISSUE-0001.sh` / `.py` / `.ts`

## 自检

- [ ] 报告编号、时间戳、分支、commit 齐全
- [ ] 项目技术栈摘要完整
- [ ] 所有"通过"项附证据
- [ ] 每个问题按 `severity-levels.md` 定级
- [ ] 发布结论与问题级别一致
- [ ] 证据文件全部归档
- [ ] 密钥、token、内部域名已脱敏
- [ ] 未修改任何业务代码
- [ ] 验收模式 = 验收模式，修复验证模式 = 修复验证模式（不混淆）
```

---

## 复测报告命名与差异

复测报告文件名必须带 `-retest-` 后缀，并在文档开头明确引用原始报告：

```
qa-reports/YYYY-MM-DD-HHmm-retest-acceptance-report.md
```

复测报告必须包含：

1. 原始报告编号与路径。
2. 修复清单（每个修复对应一个原始 ISSUE 编号 + commit hash）。
3. 重新执行的范围（只跑受影响的项）。
4. 重新执行后的问题统计。
5. 新结论。

**严禁覆盖原始报告。** 同一报告若需更新，写"补遗"附录，不改原文。