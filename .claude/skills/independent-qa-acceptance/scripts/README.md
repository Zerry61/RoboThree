# QA Helper Scripts

本目录用于存放 `independent-qa-acceptance` Skill 调用时使用的辅助脚本。

## 边界

- 脚本只服务于 **QA 流程**，不得被 `RoboThree_workspace/` 业务代码 import 或作为运行时依赖。
- 脚本默认只读访问项目文件，不修改产品业务代码，不修改生产配置。
- 脚本若涉及写操作（如 `qa-reports/`、`evidence/`），必须只写到本 Skill 或用户当前工作目录允许的位置。
- 不得在脚本中硬编码任何真实密钥、Token、内部域名、测试账号。

## 推荐脚本类型

下列脚本按"建议补充"列出，**当前不需要为凑目录而添加**。每条对应一个明确职责，按需补一个即可，不要批量空目录占位。

### 项目发现

- `discover-stack.sh` / `discover-stack.py`
  - 输入：仓库根路径。
  - 输出：技术栈摘要 JSON（语言、包管理、测试框架、构建工具、CI、文档）。
  - 触发：在 SKILL.md 阶段 1 调用。

### 测试执行

- `run-checks.sh`
  - 串行执行：lint → typecheck → unit test → build。
  - 每个子命令独立记录开始/结束时间与退出码。
  - 输出统一的 `evidence/checks.jsonl`。

- `run-e2e.sh`
  - 包装 Playwright / Spectron / `electron-playwright` 调用。
  - 输出 Trace 与视频到 `evidence/e2e/`。

### 安全扫描

- `security-scan.sh`
  - 串行执行：`pnpm audit` / `npm audit` / `pip-audit`、Semgrep、Bandit（按技术栈挑选）。
  - 输出统一 JSON 到 `evidence/security/`。

### 报告汇总

- `aggregate-report.py`
  - 输入：`evidence/*.jsonl`、`evidence/**/*.log`。
  - 输出：填充后的 `report-template.md` 草稿（仍需人工核对）。

### Electron 安装测试

- `electron-install-smoke.sh`
  - 调用 `electron-builder`，启动安装包后跑启动冒烟。
  - 输出 `evidence/install/`。

## 命名约定

- 文件名全小写、短横线分隔：`discover-stack.sh`、`run-checks.sh`。
- 扩展名按语言选择：`.sh` / `.bash` / `.py` / `.ts` / `.mjs`。
- 不要带版本号后缀（如 `run-checks-v2.sh`），使用 Git 记录版本。

## 最小自检

每个新增脚本必须满足：

1. **可执行**：通过 `shellcheck` / `ruff` / `eslint` / `tsc` 至少一项静态检查。
2. **幂等**：同一仓库多次执行结果一致（不得留下污染文件）。
3. **有 --help**：支持 `--help` 输出用法。
4. **失败可观察**：失败时 exit code ≠ 0 并写出可读错误。
5. **无破坏性**：默认参数下不得修改产品业务代码或删除任何文件。

## 调用方式

```bash
# 示例：项目发现
bash .claude/skills/independent-qa-acceptance/scripts/discover-stack.sh /path/to/repo

# 示例：构建与基础质量串联
bash .claude/skills/independent-qa-acceptance/scripts/run-checks.sh /path/to/repo

# 示例：安全扫描
bash .claude/skills/independent-qa-acceptance/scripts/security-scan.sh /path/to/repo
```

## 何时删除脚本

满足下列任一条件时，从本目录删除脚本并更新本 README：

- 已被项目内置工具取代（如 `pnpm test` 已覆盖 `run-checks.sh` 的功能）。
- 在超过 6 个月内未被任何 QA 报告引用。
- 因依赖过期无法在新环境运行且无人维护。