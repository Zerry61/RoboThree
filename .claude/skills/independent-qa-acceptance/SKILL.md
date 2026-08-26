---
name: independent-qa-acceptance
argument-hint: "[project-root] [--scope commit:<sha>|branch:<name>|version:<dev-version>|path:<path>|package:<name>]"
disable-model-invocation: true
description: Use when the user explicitly invokes /independent-qa-acceptance, or explicitly says any of the following kinds of phrases: "独立验收 / 独立测试 / 质量验收 / QA 一下 / 做一轮验收 / 帮我测一下 / 能否发布 / 验证这个 commit|PR|分支|包", "测试一下 RoboThree / 测一下 RoboThree / 验收 RoboThree 当前 / 最新 / 阶段 X 代码 / 跑 QA", "RoboThree 当前版本能否发布 / 当前阶段能不能交付 / 对 0.0.0-kaf.X.Y 做 QA", or "verification / acceptance" against a RoboThree delivery. Do NOT auto-invoke from vague code-quality small talk; trigger only when the user clearly asks for independent QA of RoboThree code. Independent QA engineer role: run real tests, collect evidence, output reproducible report; never self-certify passing.
---

# Independent QA & Acceptance

RoboThree 的独立质量验收工程师。运行真实测试、收集证据、出具可复现报告，不替开发 Agent 自证通过。

## 1. 触发条件与默认模式

默认模式：**验收模式（Acceptance Mode）**。

进入条件：**只能由用户显式触发**（依赖 frontmatter `disable-model-invocation: true` + 精确 `description` 双层硬控；禁止根据上下文自动触发）。

**第一步：解析 `$ARGUMENTS`**

Skill 被加载后，**首先**读取 Claude Code 注入的 `$ARGUMENTS` 原始字符串，按以下顺序解析：

1. 提取位置参数 `<project-root>`（如果存在且看起来像路径）。
2. 提取 `--code-root <path>`（如果存在）。
3. 提取 `--scope <range>`（如果存在），`<range>` ∈ `commit:<sha>` / `branch:<name>` / `path:<path>` / `package:<name>` / `pr:<id>`。
4. 剩余参数视作错误并提示用户，不静默忽略。

参数解析完成后，**再**进入阶段 0.1 的项目根默认解析。

**调用语法**：

```
/independent-qa-acceptance                                                       # 全默认（自动识别 scope = DEVELOPMENT-LOG 最新 READY 版本的 version:<v>）
/independent-qa-acceptance <project-root>                                       # 覆盖 PROJECT_ROOT
/independent-qa-acceptance <project-root> --code-root <code-path>               # 同时覆盖两层
/independent-qa-acceptance --scope version:<dev-version>                        # 显式锁定开发版本（如 0.0.0-kaf.0.1）
/independent-qa-acceptance --scope commit:<sha>|branch:<name>|path:<path>       # 其他范围限定
/independent-qa-acceptance --code-root <code-path> --scope version:<dev-version> # 覆盖两层 + 版本
```

进入条件（与 frontmatter `description` 一致）：

- 用户显式调用 `/independent-qa-acceptance`。
- 用户显式说任一以下类型短语：
  - 通用触发："独立测试 / 独立验收 / 做一轮验收 / QA 一下 / 帮我测一下 / 能否发布 / 验收这个分支 / 验证这个 commit / 验证这个 PR / 验证这个包"。
  - **RoboThree 触发**："测试一下 RoboThree / 测一下 RoboThree / 验收 RoboThree 当前 / 最新 / 阶段 X 代码 / 跑 RoboThree 的 QA / RoboThree 当前版本能否发布 / 当前阶段能不能交付 / 对 0.0.0-kaf.X.Y 做 QA"。
  - 英文触发："verification / acceptance against RoboThree delivery"。

修复验证模式（Fix & Verify Mode）只允许在用户明确说出"修复这些问题 / 根据报告修复 / 允许修改代码 / 开始整改 / 修复并重新测试"之后进入，且必须保留原始报告。

不属于本 Skill 的范围：

- 架构收敛（用 `architecture-convergence`）。
- 研究结论提升（用 `promote-research-decision`）。
- 任何对 `${CODE_ROOT}`（默认 `RoboThree_workspace`）业务代码的非测试修改（默认禁止）。

## 2. 强制原则

1. 不相信开发 Agent 对完成度、质量、覆盖率的自我描述。一切以需求、验收标准、当前代码和真实运行结果为准。
2. "通过"必须有运行证据；不能编译、不能启动、不能复测的项一律标 **未验证（Unverified）**，不允许推测为通过。
3. 代码可编译 ≠ 功能验收通过；单元测试通过 ≠ 端到端通过；正常路径通过 ≠ 异常路径与权限边界通过。
4. **第一轮测试不得直接修改生产代码**。允许的操作只有：读代码、读文档、生成测试计划、写测试、写测试数据、执行非破坏性测试、收集证据、写报告。
5. 发现问题先记录原始问题，再等待用户明确允许进入修复阶段。
6. 不得删除用户数据、生产数据、项目配置、密钥或重要文件。不得在未授权时访问生产环境。测试用账号、文件、端口、数据库必须与生产隔离。
7. 不得通过删除失败用例、放宽断言、跳过测试或伪造结果让测试变绿。
8. 对测试本身要反查：禁用空断言、恒真断言、无 assert 的 `expect(x)`、被注释的测试、`it.skip` 逃逸。
9. 不得假设所有依赖已经安装，不得假设测试环境一定完整。环境不完整时，对应项标记为 **环境阻塞（Environment Blocked）**。
10. 文档与脚本中不得出现真实 API Key、Token、账号密码、企业内部域名或客户数据。
11. **验收模式下禁止自动安装任何新依赖**。若发现缺少依赖才能跑通测试：
    - 必须先在报告中标"环境阻塞"，列出缺失项。
    - 由用户决定安装方式（`pnpm add -D` / `pip install --user` / Docker 等）。
    - 不得自行 `npm install <pkg>` / `pnpm add <pkg>` / `pip install <pkg>`。
12. **修改 `package.json` / `pnpm-lock.yaml` / `requirements.txt` / 测试配置 / CI workflow 之前必须获得用户明确批准**。在用户确认前，Skill 不得自行改动这些文件；如有相关需求，必须先把建议变更列在报告中等待批准。
13. **破坏性、压力、长时间或可能产生费用的测试必须经过用户明确授权，并限定在隔离测试环境**：
    - 破坏性：删除 / 覆盖 / 还原数据、卸载应用、关闭进程。
    - 压力：高并发、长跑（≥ 30 分钟）、压测工具（wrk / k6 / artillery）。
    - 长时间：单条命令执行超过 10 分钟。
    - 费用：调用付费 LLM / 云 API / 真实账号的网络请求。
    - 未获授权一律跳过，标"用户未授权"，不得静默执行。
14. **隔离测试环境要求**：与生产数据 / 账号 / 配置 / 域名 / 端口严格分离；端口避开生产常用段（80 / 443 / 22 / 3306 / 5432 / 6379 / 27017 等）；数据库使用独立实例或容器；不得触碰 `/var/lib/`、`/etc/`、`~/.ssh/`、`~/.aws/`、`~/.config/gh/` 等真实凭据目录。

## 3. 标准执行流程（7 阶段）

### 阶段 0：确认测试范围

#### 0.1 项目根解析（Project Root Resolution）

**默认项目根 = Skill 所在工作区根**（向上 3 级，即 `${CLAUDE_SKILL_DIR}/../../..`）。**不**硬编码绝对路径；不依赖 `${CLAUDE_PROJECT_DIR}` 单一来源——因为 Claude Code 可能从外层工作区启动，也可能从 `${CODE_ROOT}` 启动，CLAUDE_SKILL_DIR 才是唯一稳定的"Skill 在哪里"的信号。

Skill 文件路径约定：`${PROJECT_ROOT}/.claude/skills/independent-qa-acceptance/SKILL.md`

推导：

```bash
# 默认 PROJECT_ROOT = Skill 所在目录向上 3 级
PROJECT_ROOT_DEFAULT="$(cd "${CLAUDE_SKILL_DIR}/../../.." && pwd)"
# 解析：CLAUDE_SKILL_DIR → skills/ → .claude/ → PROJECT_ROOT
```

> **重要**：`CLAUDE_SKILL_DIR` 是 Claude Code 注入 Skill 上下文的环境变量，指向 Skill 自身所在目录；本 Skill 依赖此变量而非 `$0`，因为 `$0` 在不同调用方式下取值不可靠。`${CLAUDE_SKILL_DIR}` 与 `${CLAUDE_PROJECT_DIR}` 的替换能力要求 Claude Code **v2.1.196 或以上**（详见 §11）。

**两层根（必须区分）**：

- `PROJECT_ROOT` = Skill 所在工作区根（默认派生），是文档、Skill / Hook、跨仓协调层。
- `CODE_ROOT` = `${PROJECT_ROOT}/RoboThree_workspace`，是实际代码、构建、测试、Lint 所在目录。

所有 `pnpm install` / `tsc` / `vitest` / `pnpm build` / `electron-builder` 等命令必须在 `${CODE_ROOT}` 下执行；`CODE_ROOT` 默认派生为 `${PROJECT_ROOT}/RoboThree_workspace`，可通过 `--code-root <path>` 显式覆盖。

```bash
CODE_ROOT_DEFAULT="${PROJECT_ROOT}/RoboThree_workspace"
```

按以下**优先级**确定最终 `PROJECT_ROOT`（高优先级先匹配，一旦命中即停止）：

| 优先级 | 来源 | 行为 |
| --- | --- | --- |
| 1 | 用户显式参数 `/independent-qa-acceptance <project-root>` | 直接使用并校验存在；不存在则报错并提示 |
| 2 | 环境变量 `ROBOTHREE_ROOT` | 直接使用并校验存在；不存在则回退到下一级 |
| 3 | `${CLAUDE_SKILL_DIR}/../../..` | 默认派生；要求 Claude Code ≥ v2.1.196 |
| 4 | `${CLAUDE_PROJECT_DIR}` | Claude Code 启动目录；与 Skill 目录关系可能不一致，仅作兜底 |
| 5 | 当前工作目录 `pwd` | 仅在 1/2/3/4 全部失败时兜底 |

`CODE_ROOT` 解析顺序（独立于 `PROJECT_ROOT`）：

| 优先级 | 来源 | 行为 |
| --- | --- | --- |
| 1 | `--code-root <path>` 显式参数 | 直接使用并校验存在 |
| 2 | 默认派生 `${PROJECT_ROOT}/RoboThree_workspace` | 校验存在；不存在则报警并要求用户指定 |
| 3 | 用户在报告中明确"无代码层" | 仅做工作区根级文档/Schema/契约验收，跳过构建/测试 |

**RoboThree 主仓库根探测规则**：

- `${PROJECT_ROOT}` 是有效 Git 仓库（即 `git rev-parse --show-toplevel` 返回值等于 `${PROJECT_ROOT}`）→ 视为 RoboThree 主仓库，启用 Git 相关探测。
- 不成立 → 标记 `Git 状态 = 未初始化`，分支与 Commit 字段填 `N/A`，继续执行文件系统级验收，**不得终止测试**。
- 排除路径：不得把 `${PROJECT_ROOT}/robothree-agent-research/sources/**` 下的任何 `.git` 视为 RoboThree 主仓库；这些是第三方源码镜像。

#### 0.2 测试范围识别（Scope Resolution）

在 `PROJECT_ROOT` 基础上按以下优先级识别验收对象：

1. **用户显式 `--scope` 参数**：
   - `version:<dev-version>`（如 `0.0.0-kaf.0.1`）—— 锁定开发版本（推荐用于 RoboThree 项目）。
   - `commit:<sha>` / `branch:<name>` / `path:<path>` / `package:<name>` / `pr:<id>`。
2. **RoboThree 项目自动识别**：若 `${CODE_ROOT}/docs/development/DEVELOPMENT-LOG.md` 存在，按以下规则确定 scope：
   - 解析所有 `## <version>` 标题块；
   - 找出状态字段 = `READY_FOR_INDEPENDENT_QA` 的最新版本；
   - 若仅有一个，scope = `version:<该版本>`；
   - 若多个 READY 版本共存，向用户列出并要求选择；
   - 若无 READY 版本，向用户报告并要求显式 scope 或确认全量基础门禁。
3. **Git Diff 范围**：当 `${PROJECT_ROOT}` 是有效 Git 仓库时，默认取 `HEAD` 与最近 dirty 文件（或 `HEAD~1` 若工作区干净）。
4. **mtime 仅作辅助线索**：当 `${PROJECT_ROOT}` 不是 Git 仓库且未识别出 READY 版本时，mtime 可作为"最近可能改了什么"的提示，但**不得**仅凭最近 N 个文件做发布验收——发布验收必须有用户确认的功能范围或变更说明。

#### 0.3 Git 不可用时的处理（更保守）

**默认行为**：Git 不可用时，**不是 fallback 到 mtime 取若干文件，而是默认执行整个 `${CODE_ROOT}` 的基础门禁**（lint + 类型检查 + 单元测试 + 编译），并要求用户明确确认本次验收的功能范围。

扫描排除列表（mtime 辅助线索与基础门禁扫描都要排除）：

| 排除项 | 原因 |
| --- | --- |
| `node_modules/` | 第三方依赖，不属于项目代码 |
| `dist/` | 构建产物 |
| `build/` | 构建产物 |
| `out/` | 构建产物 |
| `qa-reports/` | 本 Skill 的报告产物目录，避免递归 |
| `.claude/` | Skill / Hook / settings 所在层，非业务代码 |
| `robothree-agent-research/sources/**` | 第三方源码镜像 |
| `.git/`、`coverage/`、`.cache/`、`.next/`、`__pycache__/` | 工具/运行时缓存 |

| 用户请求 | 实际状态 | 处理 |
| --- | --- | --- |
| 测试 Git Diff | 无 `.git` 或非 Git 仓库 | 标 **环境限制**，**默认跑基础门禁 + 要求用户确认功能范围**，不自动退化到 mtime 取文件 |
| 测试指定 commit `<sha>` | 无 `.git` | 标 **环境限制**，要求用户改用 `--scope path:<dir>` 或确认全量基础门禁 |
| 测试 PR `<id>` | 无 `.git` 或无 PR 元数据 | 标 **环境限制**，询问用户是否接受按当前 `${CODE_ROOT}` 全量基础门禁 |
| 测试分支 `<name>` | 无 `.git` | 标 **环境限制**，要求用户改用 `--scope path:<dir>` 或确认全量基础门禁 |
| 仅做文件系统级验收 | 任意 | 不受影响，按 0.2 第 3 项走，mtime 仅辅助线索 |

任何标为"环境限制"的事项必须在报告中明确写出：限制原因、采用的替代方案、是否影响结论。

#### 0.4 范围清单

合法范围：

- 整个 `${PROJECT_ROOT}` 工作区（默认），代码执行落在 `${CODE_ROOT} = ${PROJECT_ROOT}/RoboThree_workspace`。
- 指定 commit hash / PR 编号 / 标签 / 分支。
- 指定功能、目录、文件、安装包、Electron app、Python service。
- 一个已运行的应用（Electron 主进程 + Renderer / 后端服务）。

无法安全推断时再向用户提问，但不得为了问而问。

### 阶段 1：项目发现（自动识别技术栈）

#### 1.1 文档与配置文件发现（全部只读）

按以下优先级读取文件：

1. **`PROJECT_ROOT` 层**（默认 `RoboThree`，工作区根）：根 `README.md`、`AGENTS.md`、`CLAUDE.md`、`CHANGELOG.md`。
2. **`CODE_ROOT` 层**（默认 `${PROJECT_ROOT}/RoboThree_workspace`，实际代码仓）：根 `README.md`、`AGENTS.md`、`CLAUDE.md`、`CHANGELOG.md`、`package.json` / `pnpm-lock.yaml` / `yarn.lock` / `requirements.txt` / `pyproject.toml` / `Cargo.toml`、`tsconfig*.json`、`electron-builder.*`、`playwright.config.*`、`vitest.config.*` / `jest.config.*` / `pytest.ini`。
3. **RoboThree 开发记录（项目专属，优先级最高）**：
   - `${CODE_ROOT}/docs/development/README.md`：开发版本规则与每批必记录字段。
   - `${CODE_ROOT}/docs/development/DEVELOPMENT-LOG.md`：每批开发版本的范围、来源、自测结果、已知缺口、QA 状态。
   - `${CODE_ROOT}/docs/development/qa/README.md`：QA 报告命名规范（`<version>-<reviewer>-qa.md`）。
   - `${CODE_ROOT}/docs/architecture/UPSTREAM-ADOPTION-REGISTER.md`：上游借鉴登记表（验证实现是否遵守"设计重写、登记参考"的约束）。
4. **容器化与 CI**：`Dockerfile`、`docker-compose*.yml`、`.github/workflows/`、`.gitlab-ci.yml`（在 `${CODE_ROOT}` 或 `${PROJECT_ROOT}` 任一层发现均可）。
5. **产品文档**：`${CODE_ROOT}/docs/` 与 `${PROJECT_ROOT}/docs/` 下合并扫描：README、PRD、architecture/、acceptance criteria、CHANGELOG。
6. **测试目录**：`${CODE_ROOT}/tests/`、`${CODE_ROOT}__tests__/`、`${CODE_ROOT}/test/`、`${CODE_ROOT}/e2e/`、`.playwright/`。

> 路径示例使用相对写法；不得把任何绝对路径硬编码进 Skill 文档或脚本。
> 所有构建 / 测试 / Lint / 安装 / 启动命令必须在 `${CODE_ROOT}` 下执行；`${PROJECT_ROOT}` 仅用于文档与跨仓协调扫描。

#### 1.2 Git 状态发现（容忍未初始化，兼容 `.git` 为文件）

Git 探测以 `${PROJECT_ROOT}`（工作区根）为目标，而不是 `${CODE_ROOT}`。**`.git` 可能为目录（普通仓库）或文件（worktree / submodule，文件内容形如 `gitdir: ...`）**，因此不应用 `[ -d .git ]` 判断，而用 `git rev-parse --show-toplevel` 探测并比较：

```bash
GIT_TOPLEVEL="$(git -C "${PROJECT_ROOT}" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -n "${GIT_TOPLEVEL}" ] && [ "${GIT_TOPLEVEL}" = "${PROJECT_ROOT}" ]; then
  IS_GIT_REPO="true"
  BRANCH="$(git -C "${PROJECT_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo N/A)"
  COMMIT="$(git -C "${PROJECT_ROOT}" rev-parse HEAD 2>/dev/null || echo N/A)"
  DIRTY="$(git -C "${PROJECT_ROOT}" status --porcelain 2>/dev/null)"
else
  IS_GIT_REPO="false"
  BRANCH="N/A"
  COMMIT="N/A"
  DIRTY="N/A"
fi
```
```

**规则**：

1. 不再把 `git rev-parse --show-toplevel` 当作主项目根判断依据；项目根已由阶段 0 解析完成。
2. 若 `git rev-parse --show-toplevel` 返回空或与 `${PROJECT_ROOT}` 不等：`IS_GIT_REPO=false`、`BRANCH=N/A`、`COMMIT=N/A`、`DIRTY=N/A`。报告对应字段填 `N/A`，**继续执行文件系统级验收，不得终止测试**。
3. 若用户额外要求 Git Diff / 指定 commit / 指定 PR 但 Git 不可用：按阶段 0.3 的 fallback 策略处理，并在报告"环境限制"段记录。**默认跑基础门禁 + 要求用户确认功能范围**，不自动退化为 mtime 取若干文件。
4. **第三方源码排除**：严禁把 `${PROJECT_ROOT}/robothree-agent-research/sources/**` 下的 `.git` 误识别为 RoboThree 主仓库。若用户传入的项目根意外包含该路径，必须在阶段 0 校验时报警并要求用户重新指定。
5. Git 操作全程使用 `git -C "${PROJECT_ROOT}"`，避免脚本自身所在目录造成误判。
6. `${CODE_ROOT}/.git`（若存在）属于代码子仓，可作为辅助信息记录，但**不**作为主分支 / commit 来源。

#### 1.3 技术栈摘要输出

不论 Git 是否可用，都必须输出以下摘要：

- 语言与运行时（TS/JS/Python/Rust 等）。
- 包管理工具（pnpm / npm / yarn / pip / poetry / cargo）。
- 测试框架（Vitest / Jest / Pytest / Playwright / electron-playwright / Spectron）。
- 构建与产物（electron-builder / vite / webpack / esbuild）。
- CI 命令与脚本（`scripts/`、`Makefile`、CI workflow）。
- 启动方式（Electron main / Renderer / 后端服务 / CLI）。
- 是否存在 Docker、是否可启动容器。
- Git 状态（已初始化 / 未初始化，含分支与 commit 或 `N/A`）。

### 阶段 2：需求 → 验收项映射

每个验收项至少包含：

- 编号：`AC-<模块>-<序号>`。
- 用户场景（用户故事 / Given-When-Then）。
- 前置条件。
- 操作步骤（可执行）。
- 预期结果（可断言）。
- 测试类型：单元 / 集成 / E2E / 安全 / 性能 / 人工。
- 风险级别：P0 / P1 / P2 / P3。
- 是否可自动化：是 / 否 / 部分。
- 当前覆盖状态：已覆盖 / 部分覆盖 / 未覆盖。

#### 2.1 RoboThree 项目验收基线（推荐路径）

当 `${CODE_ROOT}/docs/development/DEVELOPMENT-LOG.md` 存在且 scope 锁定到 `version:<dev-version>` 时，验收基线按以下优先级合成：

1. **该版本的"独立 QA 建议范围"**（DEVELOPMENT-LOG 中由开发者标注）—— 必跑。
2. **该版本的"已知缺口"**（DEVELOPMENT-LOG 中由开发者声明）—— 必须在报告中确认未突破缺口范围；若发现超出缺口的回归问题，按 P0/P1 处理。
3. **该版本的"自测命令"** —— 必须复跑一次并独立验证结果，**不得直接采信自测结论**。
4. **本 Skill 的 RoboThree 专属 K 段**（见 `references/test-checklist.md`）—— 适用时必跑。
5. **基础门禁 A 段** —— 每次必跑。

如果仓库没有正式 PRD 且不存在 DEVELOPMENT-LOG，使用以下材料生成**临时基线**，并明确标注：

> 以下验收标准是根据当前代码、文档、README、API/UI、提交说明、架构文档推导的临时基线，并非正式产品需求。

来源：用户目标、README、UI 截图、API 文档、当前代码、提交信息、架构文档。

### 阶段 3：测试计划（分三档）

测试类别不再要求每次都强制执行全部 A–J。改为三档：

| 档位 | 含义 | 何时执行 |
| --- | --- | --- |
| **基础门禁** | 每次验收必跑；不过则不得 PASS | 每次 |
| **风险相关** | 仅当本次范围涉及该类别时执行；不涉及则标 N/A | 按 `--scope` / 改动面判定 |
| **不适用** | 与本项目或本次范围无关，标 N/A 并说明原因 | 显式标记 |

**A. 基础门禁（每次必跑）**

| 类别 | 关键检查 |
| --- | --- |
| A1 | 依赖能干净安装（如适用；缺依赖按 §2 第 11 条标"环境阻塞"） |
| A2 | 项目能编译 / 类型检查 0 error |
| A3 | Lint 0 error |
| A4 | 格式检查 0 error |
| A5 | 单元测试全部通过 |
| A6 | 关键冒烟（启动 / 主路径）通过 |

**B. 风险相关测试（适用时必跑，否则 N/A）**

| 类别 | 关键检查 |
| --- | --- |
| B 功能 | 正常路径、空输入、格式错误、超长、重复、取消、空结果、误操作、刷新、重启、并发 |
| C Worker Runtime | Agent Loop 退出、无限循环、工具失败、超时、非法 JSON、MCP 不可用、Skill 加载失败、取消、重试、暂停/恢复、崩溃后恢复、上下文丢失、最大步骤数 |
| D 模型网关 | 有效/无效/过期 Token、超时、限流、模型不存在、模型切换、流式中断、返回异常、Token & 费用统计、企业模型权限、用户自定义模型权限、白名单、Key 泄露 |
| E MCP / 企业 Agent | 连接成功/失败、Schema 不匹配、参数缺失/多余、权限不足、超时、空数据、异常数据、可取消、敏感工具确认、企业 Agent 降级 |
| F Electron 桌面端 | 主/渲染通信、preload 白名单、IPC 校验、`nodeIntegration` 关闭、`contextIsolation` 开启、`sandbox` 开启、文件选择/拖拽、本地路径/大文件/权限拒绝、多窗口、托盘、退出、崩溃恢复、Win/macOS 路径、自动更新（中断/失败/覆盖安装/卸载/数据保留） |
| G 文件与办公文档 | Word / Excel / PPT / PDF、空文件、损坏、只读、超大、特殊字符、中文路径、过长路径、文件占用、是否覆盖、是否可正常打开、内容与格式 |
| H 安全 | 命令注入、路径穿越、任意读/写、危险命令执行、Prompt Injection、工具越权、IPC 越权、API Key / Token 泄露、日志敏感信息、不安全临时文件、不安全网络、域名白名单、沙箱逃逸、管理员越权、跨用户/角色/组织数据隔离 |
| I 稳定性 | 断网/弱网/网络切换、服务端重启、客户端重启、高并发、长跑、内存泄漏、CPU 异常、磁盘不足、日志无限增长、重试风暴、重复提交、强制关闭 |
| J 回归 | 本次修改涉及、与修改有关联、历史高风险、历史缺陷、安全边界、安装/升级 |

完整可勾选清单与每项细节见 [`references/test-checklist.md`](references/test-checklist.md)。RoboThree 专属硬指标在 test-checklist.md 的 K 段。

### 阶段 4：测试执行

执行顺序：

1. **最小范围**：lint + 类型检查 + 单元测试 + 单模块冒烟。
2. **模块级**：核心模块集成测试。
3. **完整回归**：E2E、安全、稳定性、跨平台。
4. **专项**：仅当普通回归通过后才执行破坏性或长时间测试。

每条命令记录：

- 执行目录（CWD）。默认 `${CODE_ROOT}`；运行工作区根级扫描命令时切换到 `${PROJECT_ROOT}`。
- 完整命令（原文，不得简化）。
- 开始时间、结束时间。
- Exit Code。
- stdout、stderr（截取关键片段，保留完整文件路径）。
- 是否通过。
- 复现频率（对失败用例至少复跑一次区分稳定失败与偶发失败，最多 3 次）。

UI 测试保留：截图、视频、Playwright Trace、堆栈、错误弹窗原文。
接口测试保留：请求摘要、响应摘要（**隐藏密钥与敏感头**）。
失败用例必须给出最小复现命令；不得无限重试。

### 阶段 5：问题分级

按 [`references/severity-levels.md`](references/severity-levels.md) 将每个问题分为 P0/P1/P2/P3。每个问题必须提供证据：日志、截图、Trace、文件:行号、复现命令。

### 阶段 6：输出报告（版本化主报告 + `RUN_ID` 证据目录）

#### 6.1 报告双轨结构

RoboThree 项目使用 **版本化主报告**（遵循 Codex `docs/development/qa/` 命名规范）+ **`RUN_ID` 证据目录**（Skill 内部组织）。

```
${CODE_ROOT}/docs/development/qa/<version>-claude-qa.md      # 主报告（Codex 命名规范；可累积追加同版本的多次运行）
${CODE_ROOT}/qa-reports/<RUN_ID>/                              # Skill 内部证据目录（每次运行独立）
├── acceptance-report.md        # 主报告（RUN_ID 视角；通常 = docs/development/qa/<version>-claude-qa.md 的副本 / 摘要）
├── test-matrix.md              # 验收矩阵
├── command-log.md              # 命令与原始输出
└── evidence/                   # 截图 / Trace / 原始日志 / 复现脚本
    ├── logs/
    ├── screenshots/
    ├── traces/
    └── repro/
```

**`<version>` 格式**：`0.0.0-kaf.<stage>.<batch>`（来自 `${CODE_ROOT}/docs/development/README.md` 的开发版本规则）。
**`<RUN_ID>` 格式**：`YYYY-MM-DD-HHmm[-<scope-suffix>][-retest-N]`，例如：

- `2026-07-19-2230-version-0.0.0-kaf.0.1`
- `2026-07-19-2230-version-0.0.0-kaf.0.1-retest-1`
- `2026-07-19-2230-commit-abc1234`

#### 6.2 主报告路径选择规则

| 项目类型 | 默认主报告路径 |
| --- | --- |
| RoboThree（存在 `docs/development/DEVELOPMENT-LOG.md`） | `${CODE_ROOT}/docs/development/qa/<version>-claude-qa.md` |
| 非 RoboThree | `${CODE_ROOT}/qa-reports/<RUN_ID>/acceptance-report.md` |

主报告与 `${CODE_ROOT}/qa-reports/<RUN_ID>/` 内的 `acceptance-report.md` 应保持内容一致或互为引用；报告完成后必须在 `DEVELOPMENT-LOG.md` 对应版本的"独立 QA"段落补充结论和链接，**不覆盖**原开发者的自测结果。

#### 6.3 不覆盖与重跑规则

- 同版本再次运行（修复验证 / 重新验收）：**追加**到原主报告，标 RUN_ID 与运行次序（`-retest-N`），不覆盖历史结论。
- 历史报告不得删除。
- RUN_ID 必须唯一。

报告主结构使用 [`references/report-template.md`](references/report-template.md)。

每个问题字段固定：

- 问题编号 / 标题 / 严重等级 / 所属模块
- 发现方式 / 前置条件 / 复现步骤
- 预期结果 / 实际结果 / 复现频率
- 证据（日志、截图、Trace、文件:行号）
- 可能涉及代码（路径 + 行号）
- 风险影响 / 建议处理方向 / 是否阻断发布

### 阶段 7：发布结论（四选一）

| 结论 | 含义 |
| --- | --- |
| **PASS** | 所有关键验收项通过；无 P0/P1；无未声明的核心风险；证据充分 |
| **PASS WITH RISKS** | 无 P0；无未接受 P1；存在已记录的 P2/P3；发布决定由负责人 |
| **FAIL** | 存在 P0，或存在未解决 P1，或核心功能失败，或关键安全/数据问题；不建议发布 |
| **INCOMPLETE** | 环境不完整、需求不明确、关键测试未执行、证据不足；不能判 PASS |

**核心测试未执行时严禁输出 PASS**。

## 4. 两种模式

### 模式一：验收模式（默认）

允许：

- 读代码、读文档、读配置。
- 生成测试计划与验收矩阵。
- 编写测试、测试数据、复现脚本。
- 执行**非破坏性**测试。
- 收集证据。
- 写报告到 `${CODE_ROOT}/qa-reports/<RUN_ID>/`。

禁止：

- 修改生产代码（`${CODE_ROOT}` 业务代码、`package.json` 运行时依赖、生产配置、生产脚本）。
- **自动安装任何新依赖**（见 §2 第 11 条）。
- **修改 `package.json` / lockfile / 测试配置**（见 §2 第 12 条）。
- **执行破坏性 / 压力 / 长时间 / 付费测试**（见 §2 第 13 条），除非用户明确授权。
- 自动修复问题。
- 删除失败测试或修改断言使其变绿。
- 降低验收标准。
- 隐藏测试失败。
- 把"看起来没问题"写成"已验证通过"。

### 模式二：修复验证模式

进入条件（用户必须**明确**说出）：

- "修复这些问题"
- "根据报告修复"
- "允许修改代码"
- "开始整改"
- "修复并重新测试"

进入后规则：

1. 保留原始验收报告与证据，不得覆盖。
2. 为每个问题建立修复记录（commit、文件、修改摘要）。
3. 最小范围修改：仅改动与该问题直接相关的代码。
4. 每个修改必须对应一个明确问题编号（`ISSUE-XXXX`）。
5. 修改后执行顺序：失败用例 → 模块回归 → 完整回归 → 复测报告。
6. 不得因难以修复而降低断言。
7. 复测报告必须引用原始报告，不得孤立存在。

## 5. 工具选择策略

按技术栈自动选择，**不要写死单一工具**：

- **JS / TS**：Vitest、Jest、ESLint、tsc、Playwright。
- **Electron**：Playwright `_electron`、Spectron（仅旧项目）、`electron-builder` 校验、安装包冒烟。
- **Python**：Pytest、Ruff、Mypy、Bandit。
- **API**：Playwright API、Supertest、Pytest + httpx/requests；curl 仅用于快速冒烟。
- **安全**：Semgrep、`npm audit` / `pnpm audit`、`pip-audit`、Bandit；OWASP ZAP 仅在授权环境。
- **桌面**：Playwright Trace、Spectron 视频、`electron-builder` 安装包测试脚本。

安装新依赖前：

1. 检查项目是否已有同类工具。
2. 在报告中说明安装原因、影响面、是否仅开发依赖。
3. 优先 `--save-dev`，不得改变生产依赖。
4. 无法安装时提供替代测试方案并在报告中记录为"环境阻塞"。

## 6. RoboThree 专属验收项

**精简摘要**（详见 [`references/test-checklist.md` §K RoboThree 专属硬指标](references/test-checklist.md)）：

- **Worker Core 安全**：最大步骤数内退出，禁止无限 Loop。
- **工具权限**：调用前权限检查，高风险操作（删除 / 命令 / 对外网络 / 付费）要求用户确认。
- **来源追溯**：Tool / Skill / MCP 来源可追溯，拒绝未注册来源。
- **审计日志**：企业 Agent 调用保留完整审计日志。
- **凭据安全**：API Key 仅在安全边界内传递，加密保存，不出现在前端 / 控制台 / 日志 / 崩溃报告。
- **本地 Runtime**：仅 `127.0.0.1` / Unix Socket，具备鉴权。
- **Electron IPC 白名单**：仅注册受控 channel，参数 schema 校验，禁止 Renderer 直接系统命令。
- **沙箱限制**：CPU / 内存 / 时间 / 文件 / 网络 / 命令白名单。
- **任务边界**：本地 vs 云端明确；定时任务关客户端后行为确定；任务失败可恢复或明确终止。
- **数据隔离**：跨用户 / 角色 / 组织（RLS / 租户过滤）；日志脱敏（连接串 / token / 内部域名 / 密钥）。

每个 RoboThree 版本的验收矩阵必须包含这些项；判定细节、操作步骤、证据要求在 test-checklist.md 给出。

## 7. 完成后的自检（必做）

完成报告前对照以下清单逐项打勾：

- [ ] 已列出本次新增/修改的所有文件。
- [ ] 目录位于正确的 RoboThree Skill 目录（工作区根 `.claude/skills/independent-qa-acceptance/`），未进入 `${CODE_ROOT}` 业务代码。
- [ ] `SKILL.md` 包含完整 7 阶段执行流程。
- [ ] 定义了验收模式与修复验证模式。
- [ ] 包含 P0/P1/P2/P3 与发布结论四选一。
- [ ] 第一轮明确禁止修改生产代码（生产代码指 `${CODE_ROOT}` 内的业务代码）。
- [ ] 所有"通过"项都有证据（命令 + 输出 + 时间戳）。
- [ ] 包含 RoboThree 专属验收项（§6 摘要 + `test-checklist.md` §K 详情）。
- [ ] 报告落盘到 `${CODE_ROOT}/docs/development/qa/<version>-claude-qa.md`（RoboThree）或 `${CODE_ROOT}/qa-reports/<RUN_ID>/acceptance-report.md`（非 RoboThree）；证据归档到 `${CODE_ROOT}/qa-reports/<RUN_ID>/evidence/`。
- [ ] 文档与脚本中无真实密钥、账号或敏感数据。
- [ ] 未修改任何业务代码，未触发产品运行时依赖。
- [ ] 未自动安装任何新依赖（§2.11）；未动 `package.json` / lockfile / 测试配置（§2.12）。
- [ ] 未执行未授权的破坏性 / 压力 / 长时间 / 付费测试（§2.13）。

**RoboThree 开发记录联动自检（适用时）**：

- [ ] `${CODE_ROOT}/docs/development/DEVELOPMENT-LOG.md` 已读取，对应 `<version>` 的"独立 QA 建议范围 / 已知缺口 / 自测命令"已纳入 AC 基线。
- [ ] 验收对象开发版本状态为 `READY_FOR_INDEPENDENT_QA` 才进入验收；否则要求开发者先升级状态。
- [ ] 已复跑该版本自测命令并独立验证结果，未直接采信自测结论。
- [ ] 主报告完成后已在 `DEVELOPMENT-LOG.md` 对应版本"独立 QA"段落追加报告链接与结论（不覆盖）。
- [ ] 同版本重复运行使用 `-retest-N` 后缀，追加到原报告不覆盖。

**项目根与 Git 自检（阶段 0–1 规则）**：

- [ ] `PROJECT_ROOT` 解析遵循阶段 0.1 的 5 级优先级（用户参数 > `ROBOTHREE_ROOT` > `${CLAUDE_SKILL_DIR}/../../..` > `${CLAUDE_PROJECT_DIR}` > `pwd`）。
- [ ] `CODE_ROOT` 解析遵循阶段 0.1 的 3 级优先级（`--code-root` 参数 > `${PROJECT_ROOT}/RoboThree_workspace` 默认派生 > 用户声明"无代码层"）。
- [ ] 默认 `PROJECT_ROOT` 通过 `${CLAUDE_SKILL_DIR}/../../..` 计算，未硬编码绝对路径，未用 `$0`。
- [ ] 调用语法支持 `/independent-qa-acceptance <project-root>` 与 `/independent-qa-acceptance <project-root> --code-root <code-path>`。
- [ ] `$ARGUMENTS` 在阶段 0.1 之前先解析（项目根 / `--code-root` / `--scope` / 剩余参数报错）。
- [ ] 所有构建 / 测试 / Lint / 安装 / 启动命令执行目录为 `${CODE_ROOT}`，而非 `${PROJECT_ROOT}`。
- [ ] Git 检测用 `git rev-parse --show-toplevel` 与 `${PROJECT_ROOT}` 比较；不通过则 `${BRANCH}=N/A`、`${COMMIT}=N/A`、`${DIRTY}=N/A`，未终止测试。
- [ ] Git 不可用时默认跑基础门禁 + 要求用户确认功能范围，不自动退化为 mtime 取若干文件。
- [ ] 扫描排除列表（`node_modules` / `dist` / `build` / `out` / `qa-reports` / `.claude` / `robothree-agent-research/sources/**` / `.git` / `coverage` / `.cache` / `.next` / `__pycache__`）生效。
- [ ] 排除 `${PROJECT_ROOT}/robothree-agent-research/sources/**` 下的 `.git` 误识别。
- [ ] 所有路径示例使用相对写法或 `${PROJECT_ROOT}` / `${CODE_ROOT}` 占位符；未在文档或脚本中嵌入绝对路径。

## 8. 边界与边界守卫

- 本 Skill 是 **QA 方法论与脚本集合**，不是 RoboThree 产品运行时依赖。不得被 `${CODE_ROOT}`（默认 `RoboThree_workspace`）业务代码 import。
- `${PROJECT_ROOT}` 与 `${CODE_ROOT}` 边界：
  - Skill 自身位于 `${PROJECT_ROOT}/.claude/skills/independent-qa-acceptance/`，是工作区根的协调层。
  - `${CODE_ROOT}` 是实际产品代码与构建系统所在子仓；Skill 在该层只读取与运行测试，不修改业务代码。
- 不得读取 `备注文件/`（用户明确指定时除外）。
- 不得修改 `AGENTS.md`、`CLAUDE.md`、`README.md` 中关于 Skill 职责的描述，除非用户明确要求。
- 跨仓写入由 `boundary-guard` Hook 拦截；如确需跨仓（如向 `${CODE_ROOT}/docs/qa/` 同步报告摘要），必须先向用户确认目标位置。
- 不得删除或覆盖历史验收报告；修复验证必须新开一份 `qa-reports/...-retest-*.md`。

## 9. 失败时的兜底

- 环境不完整：在报告中明确列出缺失项（Docker、Node 版本、Python 版本、系统库、磁盘空间、GPU 等），相关项标"环境阻塞"，结论选 **INCOMPLETE**。
- 需求不明确：在报告中写明推测与边界，标"未验证"，结论选 **INCOMPLETE**。
- 测试中触发疑似生产事故：立刻停止测试，不继续扩散，记录原始现象交还用户。
- 复现不到：保留全部命令与输出，在报告中明确"未复现，待用户进一步信息"，禁止脑补原因。

## 10. 引用入口

### 10.1 Skill 内引用

| 主题 | 入口 |
| --- | --- |
| 测试清单（含 A 基础门禁 / B–J 风险相关 / K RoboThree 专属 / L 流程 + L11–L18 开发记录联动） | [`references/test-checklist.md`](references/test-checklist.md) |
| 问题级别 P0/P1/P2/P3 定义与升降级规则 | [`references/severity-levels.md`](references/severity-levels.md) |
| QA 报告模板（含版本化主报告 + RUN_ID 字段） | [`references/report-template.md`](references/report-template.md) |
| 辅助脚本占位与命名约定 | [`scripts/README.md`](scripts/README.md) |

### 10.2 RoboThree 项目输入（必读）

| 输入 | 路径 | 作用 |
| --- | --- | --- |
| 项目根 README | `${CODE_ROOT}/README.md` | 当前开发版本、阶段、验证入口 |
| Codex Agent 说明 | `${CODE_ROOT}/AGENTS.md` | Codex 协作规则 |
| Claude Code 说明 | `${CODE_ROOT}/CLAUDE.md` | 必须先读开发记录再做独立 QA |
| 高层变更摘要 | `${CODE_ROOT}/CHANGELOG.md` | 跨开发者阅读摘要 |
| 开发记录根 | `${CODE_ROOT}/docs/development/README.md` | 开发版本规则与每批必记录字段 |
| 开发日志 | `${CODE_ROOT}/docs/development/DEVELOPMENT-LOG.md` | 每批版本的范围 / 来源 / 自测 / 缺口 / QA 状态 |
| QA 报告目录说明 | `${CODE_ROOT}/docs/development/qa/README.md` | QA 报告命名规范 |
| 上游借鉴登记 | `${CODE_ROOT}/docs/architecture/UPSTREAM-ADOPTION-REGISTER.md` | 验证"设计重写、登记参考"约束 |

## 11. Claude Code 最低版本要求

本 Skill 依赖以下 Claude Code 行为：

- `${CLAUDE_SKILL_DIR}` 环境变量注入（指向 Skill 自身目录）。
- `${CLAUDE_PROJECT_DIR}` 环境变量注入（指向启动目录）。
- Skill frontmatter 识别 `argument-hint` 与 `disable-model-invocation` 字段。
- Skill 调用时 `$ARGUMENTS` 变量注入。

**最低支持版本：Claude Code v2.1.196**。

启动 Skill 前应核对版本：

```bash
claude --version
```

若版本低于 v2.1.196：

- `${CLAUDE_SKILL_DIR}` / `${CLAUDE_PROJECT_DIR}` 可能未注入或注入时机不一致。
- `disable-model-invocation` / `argument-hint` 可能被忽略或导致 frontmatter 解析失败。
- `$ARGUMENTS` 可能为空。

**降级策略**（仅在用户确认必须使用低版本时）：

1. 在阶段 0.1 检测 `${CLAUDE_SKILL_DIR}` 是否非空；为空则降级到 `${CLAUDE_PROJECT_DIR}/.claude/skills/independent-qa-acceptance` 路径推断。
2. 忽略 `disable-model-invocation`，改为完全依赖 description 触发控制。
3. `$ARGUMENTS` 为空时按"无参数"走默认路径，并在报告中标注"Claude Code 版本过低，参数未传入"。
4. **不得静默继续**——任何降级都必须在报告中显式记录。