# MVP-RSL-2 Skill Lifecycle End-to-End 详细实施方案

> 日期：2026-09-01
> 状态：`REVISION 1.1 / PLAN REVIEW PASS-CLOSED / STEP 1 RE-FREEZE PASS / FRONTEND PARALLEL START AUTHORIZED`
> 目标版本：`0.0.0-mvp.rsl.2`
> 性质：面向 PRD 的 Desktop + Core + Central + Admin 联合垂直产品批
> 编码授权：用户已授权 Step 1 共享 Contract/依赖冻结，并允许冻结后 Desktop 与 Admin 前端按 frozen interface 并行开工；Central/Core/Main/Preload 完整 lifecycle 实现仍按分步边界执行

---

## 0. 结论与控制边界

### 0.1 本批关闭的真实用户链

RSL-2 必须让普通 Desktop 用户和 Admin 完成两条最终汇合到同一发布与消费链的业务流程。

用户创建链：

```text
Desktop 填写技能名称、描述和主要功能
→ 创建真实 Skill Creator Task/Session 与受控草稿 Workspace
→ 内置技能创建助手通过既有 WFW 写入 SKILL.md，并按需写 references/scripts
→ 有效技能目录自动形成个人 Skill 草稿 revision
→ 创建者从“我创建的”运行 exact saved revision 测试
→ 当前 revision 测试通过后提交不可编辑审核版本
→ Admin 审核通过或拒绝
→ 通过后形成 immutable enterprise Skill release
→ Desktop 技能广场看到 release
→ 用户安装并校验到受控 Skill 目录
→ 新 Task 选择并锁定 exact Skill revision
→ SKILL.md 真实进入模型上下文
→ Core 重启后 exact Skill lock 与任务结果不漂移
```

Admin 直接上传链：

```text
Admin 上传 ZIP / RAR / TAR.GZ / TGZ
→ Central 安全解析且只识别一个 SKILL.md 逻辑根
→ 保存企业 Skill 草稿
→ Admin 只编辑展示标题、描述、企业版本和使用范围
→ 运行 exact package revision 测试
→ 显式发布同一种 immutable Skill release
→ Desktop 技能广场安装并用于新 Task
```

最高输出只能是：

```text
MVP_RSL2_SKILL_LIFECYCLE_E2E_CONFORMANT
```

该输出不代表 production identity、SSO/RBAC、任意脚本执行、自动依赖安装、TGM、Knowledge Provider、
Personal Model 或通用软件包平台 ready。

### 0.2 这是产品闭环，不是底座扩建

必须直接复用：

- 既有 SubmitTurn、Agent Loop、Runtime Selection、Entitlement 和 Capability Lock；
- `activeSkillRevisions` 与 locked Skill instruction materialization；
- 既有 Workbench Skill 选择与对话/任务/成果/恢复主链；
- WFW `tool.workspace.file.write_text` 的安全文本创建、replace、Artifact 与恢复语义；
- RSL-1 的 draft revision、exact test fact、submission、Admin review 和 release 设计模式；
- Central PostgreSQL、internal-trial Token、审计和 expected revision 模式；
- Main 持有 Workspace 真实路径、Renderer 只消费 safe projection 的既有边界。

不得新建第二套 Task、Agent Loop、Runtime Selection、Entitlement、审核引擎、Artifact 系统、通用包管理器、
通用文件平台或测试报告平台。

### 0.3 与机器人主线的关系

RSL-1 已关闭个人机器人草稿、测试、提交、Admin 审核、企业发布和 Desktop 消费主链。RSL-2 只实现 Skill
生命周期，并允许已发布机器人引用 exact published Skill revision；不得顺手加入 Admin 直接创建企业机器人、
机器人已发布更新/下架或 Agent Lifecycle generic platform。

### 0.4 Revision 1.1 聚焦修订

本修订吸收独立文档复核的有效风险，但不接受与现有拓扑冲突的实现建议：

- RAR reader 固定在 Central Java 边界，候选为 pure-JVM `com.github.junrar:junrar:8.1.0`；不得改为
  Renderer/Node 解析，不得使用 native binding、外部 `unrar/7z` 或系统 shell；
- Skill package 增加 MVP 内容白名单与依赖载荷拒绝规则，安装只产生 Skill 专用 filesystem installation manifest，
  不写 Core 配置表，不触发依赖、MCP 或脚本安装；
- Admin upload staging、Central canonical package store、Desktop installation 三个物理域严格隔离，不复用 Personal
  Model Credential/helper/SQLite/Contract；
- 发布同步沿用 RSL-1 已有方向：Core 通过 private authenticated Central client 主动 pull 可见 release 与 exact package，
  Admin 不反向 push 到 Core，Desktop Renderer 不直连 Admin/Central；
- 两条真实联合 E2E 串行执行，父 WFW-3 的 Windows NTFS deferred 状态只记录、不冒充通过，也不阻塞本批 macOS 产品链。

---

## 1. 权威需求与当前事实

### 1.1 PRD 冻结语义

RSL-2 必须遵守以下产品语义：

1. Desktop 技能分类固定为“技能广场 / 已安装 / 本地目录 / 我创建的”，不提供“全部”；
2. 卡片主要展示技能标题、技术名称、创建人或目录来源、技能描述，不显示虚假使用次数；
3. 创建技能第一阶段只有名称、描述、主要功能三个必填字段；
4. 第二阶段必须进入真实对话，自动发送首条用户消息，不要求重复输入；
5. Skill Creator 生成 `SKILL.md`，并仅在有内容时生成 `references/`、`scripts/`；
6. 创建对话不提供“运行测试”或“提交发布”，这些操作只在“我创建的”详情出现；
7. 测试只针对已保存 exact revision；修改后旧测试立即显示 stale；
8. 用户提交和 Admin 审核对象是 immutable package revision，不是可变目录；
9. Admin 上传包最大 200 MiB，包内任意深度只能存在一个可识别 `SKILL.md`；
10. Admin 可修改展示标题、展示描述、企业发布版本和使用范围，但不能改写技术名称、`SKILL.md`、文件清单或包事实；
11. 安装必须经过下载、身份/版本/摘要校验、安全解压和原子发布，失败不留下半安装目录；
12. 安装时不得执行 `scripts/`、不得运行包内程序、不得自动安装环境依赖；
13. 同名同版本安装幂等，同名不同版本不得静默覆盖；
14. 卸载只删除本机受控安装副本，不删除 Central release 或历史版本；
15. 本地 Skill 保留原始来源，用户显式选择后才进入任务，同名来源不得静默覆盖；
16. 新 Task 锁定 exact Skill revision；运行中任务不因发布、更新或卸载发生静默替换。

### 1.2 已有可复用事实

- Desktop SubmitTurn v1alpha5 已接受 `selectedSkillIds`；
- Runtime Selection v1alpha4 已持有 `activeSkillRevisions`；
- Core `TaskInstructionBundleMaterializer` 已能把 locked Skill 正文注入 instruction bundle；
- 当前 normal graph 只注册 code-owned `skill.presentation-planning`，并从固定资源目录读取一个 `SKILL.md`；
- Desktop Workbench 已有 Skill 选择状态，但 Intelligence Center 的 Skill detail 当前明确为空，不是真实 Catalog；
- Admin `admin-control/v1alpha1` 只有 Skill list/detail 只读投影，页面也明确“不上传或解析技能包”；
- WFW 已能创建和安全替换 UTF-8 文本文件，但不提供通用目录创建；
- RSL-1 已提供可复用的 internal-trial actor、Token lease、draft revision、test fact、submission/review/release 模式；
- Central 当前 PostgreSQL schema deployment set 为 v12；Core SQLite migration 仍止 26。

### 1.3 当前真实缺口

当前尚不存在：

- 项目级/用户级 Skill 目录发现与来源冲突处理；
- Desktop Skill Catalog list/detail/install/uninstall 的真实 API；
- Skill Creator 的受控草稿 Workspace 和自动同步；
- Skill draft/revision/test/submission/release 的 Central source of truth；
- Admin Skill upload/parse/edit/test/review/publish 写链；
- immutable package blob、manifest 和客户端下载路由；
- 安装失败清理、幂等、更新冲突和 active Task uninstall 防护；
- 已发布/已安装 Skill 进入 normal graph 并被新 Task exact lock 的真实组合。

---

## 2. 用户、对象与单一状态模型

### 2.1 参与者

| 参与者 | 本批动作 | 权限边界 |
| --- | --- | --- |
| Desktop 创建者 | 创建、继续编辑、查看草稿、测试、提交 | internal-trial creator；不能自报 subject |
| Desktop 使用者 | 浏览广场、安装、卸载、发现本地 Skill、在新 Task 中选择 | 只能消费当前可见且可用的 exact revision |
| Admin 审核者 | 审核用户 submission，通过或拒绝 | 不得修改 immutable submission |
| Admin Skill 管理者 | 上传企业包、编辑展示信息、测试、发布 | 只能修改目录元数据，不能修改包内容 |
| Core/Main | 本地发现、受控安装、exact lock、Task 测试和运行 | 不成为企业 release source of truth |
| Central | draft/revision/test/submission/release/package metadata 权威 | PostgreSQL + content-addressed Skill package store |

### 2.2 业务事实

```text
SkillDraft             editable current pointer + source kind
SkillDraftRevision     immutable package + display metadata revision
SkillTestFact          exact draft revision 的 content-free 结果
SkillSubmission        immutable creator review package
SkillRelease           immutable enterprise published revision
SkillPackageBlob       content-addressed canonical package bytes
SkillInstallation      本机受控目录中的 exact release manifest（本地事实）
LocalSkillCandidate    项目/用户目录只读发现事实（本地事实）
```

不得把全部事实压成一个可随意跳转的 lifecycle 字段。

### 2.3 状态语义

- Draft source：`personal_creator | admin_upload`；
- Test：`untested | running | passed | failed | stale`；
- Submission：`pending_review | approved | rejected | withdrawn`；
- Release：本批只创建 `published` immutable revision；
- Installation operation：`accepted | running | succeeded | failed`，最终安装状态只从受控 manifest 和文件事实得出；
- Local candidate：`available | invalid | source_changed | conflicting`。

规则：

- 每次 package 内容或可发布元数据变化创建新的 draft revision；
- revision 改变后旧 test fact 自动 stale；
- 用户 submission immutable，Admin 不可编辑；
- Admin direct-upload 草稿测试通过后可由同一有权限 actor 显式发布，不伪装成用户 submission；
- release 永不原地覆盖；更新必须形成新 release revision；
- active/nonterminal Task 持有 exact Skill lock 时，卸载该 exact local revision必须 fail-closed；
- completed Task 的消息、成果和审计继续可读；卸载不重新执行历史 Task。

---

## 3. Skill Package 与目录规范

### 3.1 最小 `SKILL.md` 规范

RSL-2 新创建和新发布的 Skill 必须包含 YAML frontmatter：

```yaml
---
name: presentation-review
description: 检查演示文稿结构、事实和表达质量
---
```

约束：

- `name` 是稳定技术名称，只允许小写 ASCII、数字和单连字符，长度 3～64；
- `description` 为 1～500 字符；
- Markdown 正文必须非空，UTF-8、无 BOM、最大 128 KiB；
- frontmatter 以外的正文形成行为与规则；
- 包内版本声明允许缺失；缺失显示“未声明”，不算错误；
- 现有 code-owned Skill 保持兼容，不因本批强制改写历史文件。

### 3.2 逻辑根与文件规则

上传包可以有外层目录；系统以唯一 `SKILL.md` 所在目录为逻辑根。逻辑根内允许：

- `SKILL.md`；
- `references/**`；
- `scripts/**`；
- 与 Skill 直接相关的安全文本或资源文件。

RSL-2 MVP 只把 `SKILL.md` 主正文作为可注入 instruction；`references/**` 与 `scripts/**` 作为 inert package bytes 保存，
不会自动进入 Prompt、不会执行，也不会被注册为 Tool/MCP。以下依赖或运行时载荷即使位于允许目录中也必须拒绝整个包：

- `node_modules/`、`.venv/`、`venv/`、`vendor/` 等依赖树；
- `requirements*.txt`、`pyproject.toml`、`Pipfile*`、`package.json`、`package-lock.json`、`pnpm-lock.yaml`、
  `yarn.lock` 等依赖安装入口；
- MCP server/connection descriptor 或可被解释为自动注册 MCP 的 manifest；
- Mach-O、PE、ELF、动态库、字节码、设备镜像、自解压程序等预编译/可执行二进制。

未来若要允许依赖声明或执行 `scripts/`，必须进入独立 Tool/MCP/TGM 评审，不能由安装确认或提示安装绕过本批边界。

必须拒绝：

- 零个或多个可识别 `SKILL.md`；
- absolute path、`..` traversal、drive/UNC/URL path；
- symlink、hard-link、device、FIFO 或其他特殊节点；
- Unicode/case-fold 路径冲突、重复 entry、NUL、控制字符；
- 加密包、多卷包、嵌套 archive 自动展开；
- RAR SFX、自解压 stub 或任意 archive 内嵌可执行载荷；
- 单 entry 超 32 MiB、文件数超 4096、展开总量超 512 MiB、压缩比超 100:1；
- 上传原始包超过 200 MiB；
- 无法严格 UTF-8 解码的 `SKILL.md`。

### 3.3 Canonical package

Central 对 ZIP/RAR/TAR.GZ/TGZ 输入完成安全解析后，生成统一的 immutable canonical package：

- 逻辑根相对文件清单按 UTF-8 byte order 稳定排序；
- 每个文件记录 relative path、byte size、SHA-256；
- package digest 覆盖 manifest 与全部文件 digest；
- canonical bytes 与 manifest 存入 Skill 专用 content-addressed store；
- PostgreSQL 只保存 package key、digest、size 和业务关联，不保存路径或正文投影；
- 下载响应同时返回 expected package digest、release revision 和 content length。

这不是通用对象存储。Store 只接受 validated Skill package，不暴露任意 key/value API。

### 3.4 Archive dependency admission

JDK 可原生覆盖 ZIP/GZIP，但 RAR 和完整 TAR 安全解析需要专用 reader。RAR 的唯一候选先冻结为
`com.github.junrar:junrar:8.1.0`（pure-JVM，UnRAR License）；该候选仍必须在编码 Step 1 完成源码、许可证、传递依赖、
离线制品和 hostile-input focused proof，未通过则停手，不得自动换库。Central 不得直接调用其 filesystem extract facade，
只能逐个读取 header，在 RoboThree 自有 validator 先通过路径/类型/配额检查后写入 bounded staging sink。

编码 Step 1 必须：

1. 固化 candidate POM/JAR/source JAR SHA-256、UnRAR License 文本、传递依赖清单与 Central allowlist；
2. 必须通过 `Archive(InputStream, ...)` / `getInputStream(FileHeader)` 一类 InputStream/header API 逐项读取；不得调用
   `Junrar.extract(...)` 或其他 filesystem extract facade。证明只读解析、不执行 entry、不加载 JNI/native binary、
   不调用系统 shell，reader worker/thread 上限固定为 1；
3. 对每个 RAR entry 校验 header、声明 size、实际流式 byte count、CRC32 和最终 SHA-256；CRC/size 不一致即拒绝；
4. 在写入每个 chunk 前执行 per-entry、expanded-total、file-count、compression-ratio 与 wall-clock budget；不得先整包解压
   到 heap 后再校验；
5. 明确拒绝 encrypted、multi-volume、SFX、link/redirect、absolute/drive/UNC、traversal、duplicate/case-fold collision、
   nested archive 与超限 dictionary/resource request；
6. hostile fixture 必须包含 bomb、traversal、CRC mismatch、truncated header、重复 path 与资源上限，并记录 peak heap/RSS；
7. 把依赖加入 Central allowlist 和 offline build；Desktop 只消费 Central canonical ZIP，不实现 RAR/TAR reader；
8. Desktop canonical ZIP 解包使用一个明确的、锁定版本的 JS reader，并在 private Main/worker 边界运行。

如果 RAR 只能通过外部 `unrar/7z`、native executable 或不可审计许可实现，立即停手回评审，不得静默删掉 PRD 的
RAR 支持，也不得调用系统 shell 代替。若 `junrar:8.1.0` 的许可证、内存模型、CRC 或 hostile-input 行为不能满足上述
条件，也必须停手，不得用“格式不支持”把 RAR 从 P0 静默移除。

---

## 4. 本地目录与安装边界

### 4.1 固定目录角色

Main 私有边界管理以下逻辑目录；Renderer 只看到 display name/source，不看到真实路径：

```text
用户本地 Skill：     ~/.robothree/skills/local/<folder>/
已安装企业 Skill：   ~/.robothree/skills/installed/<skillId>/<releaseRevision>/
个人创建草稿：       ~/.robothree/skills/drafts/<draftId>/
安装临时区：         ~/.robothree/skills/.staging/<operationId>/
```

项目级 Skill 只在当前 active read/write WorkspaceGrant 的固定项目 Skill 子目录中发现。不得扫描整个用户目录、父目录、
Git 仓库外路径或未授权 Workspace。

### 4.2 Skill Creator Workspace

创建第一阶段成功后：

- Main 创建 exact draft root 与 0700 权限；
- Main 为该 root 创建专用 WorkspaceGrant；
- Renderer 只获得 draftId、workspaceGrantId 和 display name；
- 内置 `agent.skill-creator` 创建真实 Session/Task；
- 首条可见用户消息由三个字段稳定生成；
- WFW 只写 draft root 内相对路径，不获得通用目录创建能力；
- `references/`、`scripts/` 的父目录由 Skill draft service 按受控意图按需创建，不开放模型可调用 mkdir Tool。

Task completed 或 WFW Artifact 更新后，Skill draft synchronizer 扫描 exact draft root。只有严格有效的目录才形成新的
immutable draft revision；无效时保留会话与文件，并返回可继续修改的安全提示。

### 4.3 安装事务

安装顺序固定为：

1. 校验 release visibility 与 exact revision；
2. 下载到 operation staging；
3. 校验 response length 与 package SHA-256；
4. 私有 reader 校验 canonical manifest、entry digest 和路径；
5. 解压到 staging target；
6. 对所有文件做 stable read/digest 复核；
7. 写入 installation manifest 并 fsync；
8. 同父目录原子 rename 到 exact revision 目录；
9. 刷新 Skill Catalog；
10. 清理 staging。

失败必须清理 staging，不能出现“已安装”。同一 exact release 重复安装返回幂等成功。不同 release 已存在时要求显式
“安装新版本”，旧版本不被静默覆盖。

安装成功只在 exact installation directory 内写入 Skill 专用、content-free installation manifest，字段限于
`skillId/releaseRevision/packageDigest/manifestDigest/installedAt/sourceKind`。它由 Main/Core Skill Catalog 扫描读取，
不得写入通用 Core 配置、Personal Model SQLite、Credential store、Helper 配置或 runtime adapter 配置；包内任何
dependency/MCP/Tool 声明均不会触发提示安装、后台安装或注册动作。

### 4.4 卸载

- 系统/code-owned Skill 不允许卸载并返回明确原因；
- active/nonterminal Task exact lock 命中时拒绝卸载；
- 卸载只删除 exact installation directory 和 local installation manifest；
- Central release/package、用户草稿、本地源目录、历史 Task/Artifact 均不删除；
- 删除失败返回 failed，不从 UI 乐观移除；
- 卸载成功后新 Task 不再看到该 installed revision，技能广场仍可重新安装。

---

## 5. Contract 与 API 方案

### 5.1 一个 consumer-driven additive Contract

新增：

```text
@robothree/contracts/skill-lifecycle/v1alpha1
```

只承载本批真实消费者所需 strict schema。冻结口径分为两组，不再混用“五个文件”与“subpath 数量”：

历史 digest baseline 固定为以下 **5 个 exact file**，继续逐字节 SHA-256 不漂移：

| Exact file | Frozen SHA-256 |
| --- | --- |
| `admin-control/v1alpha1/index.ts` | `79e2e127956651eee482bb49ff04a9c95f4c090cd1edaf4efd3cf6479bb2eb1e` |
| `admin-control/v1alpha2/index.ts` | `50b757b94d20e90b4e689613a318f54fa7936392a084dda64b234488a325591a` |
| `runtime-selection/agent-definition/v1alpha2/index.ts` | `fb0732e69801c26e439907694273551686c4cb267050f76cd059e011be649981` |
| `desktop-local/personal-model-management/v1alpha1/index.ts` | `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a` |
| `desktop-local/personal-model-management/v1alpha2/index.ts` | `f04b454eacadfebc194c7f71c988dd68815f801371bd339fbff6711c85e052e5` |

RSL-2 另外冻结以下 **6 个 additional no-diff file**；独立 QA 逐文件计算当前 SHA-256 并要求零漂移，但它们不计入
“historical five”这个固定术语：

| Exact file | Revision 1.1 baseline SHA-256 |
| --- | --- |
| `desktop-local/v1alpha1/index.ts` | `37b51e3f49034a1c32eafbfc0dd2396e2fc30ff0c31efeb72c459dd730d6af1c` |
| `desktop-local/v1alpha2/index.ts` | `0ed5633c1bf71e244697bb96b3929a665d877e20bdc7c9d7b0dc25eb949000e9` |
| `desktop-local/v1alpha4/index.ts` | `92fcdb9ba765dc4eb344dc016a0fe74d63d2f9d80526444863c2739fec3ce742` |
| `desktop-local/v1alpha5/index.ts` | `640f86516c3a48998e0f123e0226ce10dc87108a4faed17e7263203dacb53d62` |
| `runtime-selection/v1alpha4/index.ts` | `700adb41c1fe8f966a660e75e09fe35299d2262350a374932b1ce5551ef76d0f` |
| `agent-lifecycle/v1alpha1/index.ts` | `52f02b7c327a55fcb669b0b097779c8ce273c2833c6546547830a4c2d82e7eae` |

因此 frozen boundary 是 “historical 5 + additional no-diff 6”，不是 5 个顶层 package，也不是含混的 8 个 subpath。

### 5.2 Desktop exact methods

Preload additive 方法固定为：

1. `getSkillLifecycleCompatibility`；
2. `listSkills`（scope 为 marketplace/installed/local/created）；
3. `getSkill`；
4. `createSkillDraftWorkspace`；
5. `refreshSkillDraft`；
6. `startSkillDraftTest`；
7. `submitSkillDraft`；
8. `withdrawSkillSubmission`；
9. `installSkillRelease`；
10. `uninstallSkillRelease`；
11. `querySkillOperation`。

不得提供通用 `dispatchSkillCommand(type,payload)`，不得返回 package bytes、SKILL.md 全文、绝对路径、Token、Endpoint、
staging path 或内部异常。已安装/本地详情需要展示 Markdown 时，必须走受控、大小受限的 safe text projection。

Desktop consumer identity 另冻结三项，不允许 Renderer 猜测或用 LocalStorage 补位：

- `createSkillDraftWorkspace` 返回专用 receipt，必须包含 `draftId + workspaceGrantId + displayName`；
- `submitSkillDraft` 返回 `submissionId + submissionRevision`，`SkillDetail.submission` 在重新进入详情后继续投影同一 durable identity；
- 任一 `installed=true` 的 list/detail projection 必须携带 `installationRevision`；`installed=false` 时禁止携带该字段。

`withdrawSkillSubmission` 只消费 `SkillDetail.submission` 的 exact identity；`uninstallSkillRelease` 只消费
`installationRevision`，不得把混合用途的 Skill `revision`、release revision 或 draft revision 猜作对应 expected revision。

### 5.3 Admin exact methods

Admin Adapter additive 方法固定为：

1. `listSkillSubmissions` / `getSkillSubmission`；
2. `approveSkillSubmission` / `rejectSkillSubmission`；
3. `uploadEnterpriseSkillPackage`；
4. `getEnterpriseSkillDraft` / `updateEnterpriseSkillDraftMetadata`；
5. `startEnterpriseSkillDraftTest` / `queryEnterpriseSkillDraftTest`；
6. `publishEnterpriseSkillDraft`。

Upload 使用 multipart 的受限 file part + strict metadata JSON；Browser 不解析 archive，不读取包内正文，不在日志输出文件名
以外的本地路径。所有 mutation 使用 exact expected revision 和 typed conflict。

### 5.4 Internal-trial identity

- 新增独立最小权限 `skill.manage` Token；
- 不扩大 `model.use`、`agent.manage` 或 Admin model permission；
- Desktop Main 采用 RSL-1 repair.1 的一次性 env consume + clearable Buffer restart lease；
- Token 只进入 Main/Core/Central trusted memory；
- Renderer、Preload API、IPC payload、SQLite、日志、Evidence、Artifact、package 和 safe error 中命中必须为 0；
- production identity/SSO/RBAC readiness 保持 false。

---

## 6. Central 数据与服务

### 6.1 PostgreSQL schema v13

本批 Central 唯一 schema version deployment set：

```text
B0013__skill_lifecycle.sql
U0013__skill_lifecycle_from_v0012.sql
postgresql-v0013.json + sha256 sidecar
```

核心表建议保持业务职责分离：

- `skill_drafts`；
- `skill_draft_revisions`；
- `skill_test_facts`；
- `skill_submissions`；
- `skill_releases`；
- `skill_package_blobs`；
- `skill_audit_events`。

Core SQLite migration 继续止 26。本地 installation/draft root 状态由受控 filesystem manifest 和现有 Task facts承担，
不得为 UI 状态新增第二套 Core lifecycle 表。

### 6.2 Test fact

测试必须复用真实 Task pipeline：

- 测试输入由创建者/Admin 显式提供；
- exact draft revision 被临时 materialize 为 locked Skill；
- 使用当前可用 Model 和 Skill 声明允许的既有 Tool；
- 不自动执行 `scripts/`，除非脚本通过未来独立 Tool 权限显式运行；
- Central 只保存 taskId、draftRevision、status、safeSummary、startedAt/completedAt 和 result digest；
- 不保存测试输入、Assistant 正文、模型 reasoning、Tool 参数、Workspace 路径或成果内容；
- 当前 revision 未 passed 时禁止 submit/publish。

### 6.3 Release 与 Catalog

- 用户 submission approve 与 Admin direct publish 都调用同一个 release writer；
- release 固化 technical name、package revision/digest、display metadata、usage scope、creator/source 和 publishedAt；
- Desktop marketplace 只返回当前 actor 可见 release；
- download 使用短期、单 release、只读授权；
- Core normal graph 只接入 installed/local/code-owned Skill，不把仅存在于 marketplace 但未安装的 release伪装成可运行；
- published release 更新不改变现有 Task lock。

### 6.4 Upload、Store 与同步拓扑

三个物理域不得混用：

1. Admin Browser 只把 archive 发送到 Central Skill Lifecycle upload endpoint；Browser 不解析、不解压；
2. Central 在服务私有、随机 operation staging 中流式校验，失败或请求结束后清理；不得使用 Personal Model Credential
   storage、Helper namespace、Desktop Workspace 或 Core SQLite；
3. 验证成功后只有 canonical Skill package 进入 `skill_package_blobs` 对应的 Skill 专用 content-addressed store；原始
   upload archive 不作为 release payload 长期保存；
4. Desktop Renderer 不直连 Admin/Central。Core 使用仅含 `skill.manage` 的 token，通过 exact read/catalog/download
   endpoints 和 private authenticated Central client 主动 pull actor-visible release page 与 exact package；
5. Main 只负责受控本地 staging、digest 校验和原子安装，Core 只登记/解析 safe Skill Catalog，不接收 Admin push；
6. `skill-lifecycle/v1alpha1` 是唯一新增 consumer-driven Contract；不得复用
   `desktop-local/personal-model-management/*` 或 `runtime-selection/agent-definition/*` 传输 Skill lifecycle。

因此本批没有 “Admin → Core push” 通道，也没有 Desktop → Admin 直连。发布后的可见性由 Core 显式 refresh/pull 获得，
与 RSL-1 `HttpAgentLifecycleClient.listPublished()` → in-memory source/catalog register 的既有方向一致。

---

## 7. Desktop 产品实现

### 7.1 技能目录

Intelligence Center Skill Tab 必须接真实 Adapter：

- 技能广场：可见且未安装的 enterprise release；
- 已安装：code-owned + installed release；
- 本地目录：当前 active Workspace 和用户 Skill 目录候选；
- 我创建的：当前 creator 的 Central draft。

四类数据不得用一个前端数组加标签伪造；Adapter 必须按 source authority 聚合并保留 exact revision/source。

### 7.2 详情与操作

- marketplace：展示四项主要信息、版本、创建人和“安装”；
- installed：展示目录/Markdown safe projection、版本和“卸载”；
- local：展示 Workspace display name、兼容性和“在任务中使用”；
- created：展示 current revision、test 状态、submission 状态、“运行测试”“提交发布”；
- operation 进行中禁重复操作；
- runtime changed、source changed、revision conflict 必须刷新真实状态；
- 不使用 LocalStorage、Fixture 或前端乐观状态代替服务成功。

### 7.3 创建助手

- 第一阶段保留三个字段和字段级错误；
- 点击下一步先创建 draft workspace，再创建真实 Session/Task；
- 自动发送稳定首条消息；
- 路由进入既有 Workbench，不复制对话 UI；
- 预选 exact code-owned `agent.skill-creator`，用户不能被静默切换为其他 Agent；
- 对话页不出现测试/提交按钮；
- 创建失败保留三个字段并提供真实重试；
- 第二阶段失败保留会话、消息和已写文件。

### 7.4 Workbench 消费

- 仅 available exact Skill 可被选择；
- selected Skill 消失时不静默替换；
- Task 创建后锁定 exact revision/content digest/materialized source；
- Skill 正文以独立 instruction section 进入模型上下文；
- Tool/Workspace/Network 权限仍由现有 authorization 控制，Skill 文本不能授予权限；
- safe progress 可显示“正在加载技能 / 技能已进入任务”，不得显示正文、路径或 internal digest。

---

## 8. Admin 产品实现

### 8.1 用户 submission 审核

复用 RSL-1 四状态审核模式：

- pending 可 approve/reject；
- exact expectedSubmissionRevision；
- immutable package facts；
- rejection reason 为安全业务文本；
- conflict 后刷新 list/detail；
- terminal submission 禁止重复操作。

Admin 页面只展示 package manifest 摘要、技术名称、展示信息、文件数量/总量、验证结果、测试结果和使用范围；默认不展示
全部文件正文，不下载并执行包。

### 8.2 Admin 直接上传

页面流程固定为：

```text
选择 archive
→ 上传与解析
→ 显示唯一 SKILL.md 逻辑根及只读包事实
→ 编辑展示标题/描述/企业版本/使用范围
→ 保存 draft revision
→ 运行测试
→ 显式发布
```

解析完成、保存草稿、测试通过和发布成功必须是四个独立结果，不能合并成一个“成功”。

---

## 9. 安全、审计与隐私

### 9.1 必须审计的业务事件

- draft created/revision saved；
- test started/passed/failed；
- submission created/withdrawn/approved/rejected；
- admin package uploaded/validated/invalid；
- release published/downloaded；
- install/uninstall accepted/succeeded/failed；
- Skill selected and exact revision locked for a Task。

审计只包含 actor ref、对象 ID/revision、action、result、safe reason、correlationId 和时间。禁止包正文、Prompt、测试正文、
模型回复、Tool arguments、Credential、Endpoint、绝对路径、Token、PID 或 stack。

### 9.2 下载与安装安全

- package download 必须 HTTPS/loopback trusted route；
- digest mismatch 立即失败并清 staging；
- release visibility 在下载和安装提交两个窗口复核；
- 安装后 stable read 验证；
- 不执行包内容；
- 不跟随链接；
- 不写 Workspace 之外；
- Renderer 不接触 package bytes 或真实路径。

---

## 10. 实施顺序与团队分工

### Step 1：Focused proof 与 Contract freeze

Codex：

- 证明现有 locked Skill injection 可支持 dynamic exact revision；
- 证明 WFW draft root 可在不开放 mkdir Tool 的情况下写 `SKILL.md/references/scripts`；
- 完成 archive reader dependency/license/离线构建评估；
- 对 `junrar:8.1.0` 完成 exact checksum/license/transitive dependency/hostile-input/peak-memory focused admission；
- 冻结 `skill-lifecycle/v1alpha1` strict schema、typed errors、method count 和 Token scope；
- 固定 Central v13 与 Core migration 26 的物理隔离。

Step 1 任一证明失败立即停手，不先写页面或空接口。

### Step 2：Central lifecycle + package authority

Codex：

- v13 deployment set；
- package validation/canonical store；
- draft/revision/test/submission/release；
- internal-trial `skill.manage`；
- user submission review 与 Admin direct-upload 共用 release writer；
- safe audit。

### Step 3：Core/Main discovery、draft、install 与 runtime consumption

Codex：

- user/project local discovery；
- exact draft WorkspaceGrant 和 synchronizer；
- package download/install/uninstall；
- Skill Catalog projection；
- installed/local exact Skill resolver；
- new Task exact lock、Core restart recovery 和 active Task uninstall guard。

### Step 4：Desktop Frontend

客户端前端：

- 四分类真实列表和详情；
- 第一阶段创建表单接真实 create flow；
- Workbench 创建助手路由/首条消息；
- created detail 的 test/submit/withdraw；
- marketplace install、installed uninstall；
- operation、conflict、runtime changed、invalid local source 的真实状态；
- 不实现任何 Fake/LocalStorage 成功路径。

### Step 5：Admin Frontend

Admin 前端：

- submission list/detail/approve/reject；
- direct upload、parse result、metadata edit、test、publish；
- exact revision conflict refresh；
- package facts 与展示信息明确分区；
- 不展示 Secret、路径、测试正文或包内执行入口。

### Step 6：联合 E2E 与收口

Codex 负责一个 real Central + real Electron + real Admin 联合 E2E；客户端/Admin 前端提供真实 UI driver selector 和
focused presentation tests。不得把各层 fixture PASS 替代联合闭环。

---

## 11. Focused QA（48 项）

### G1 Contract / identity（QA-001～008）

1. `QA-001`：`skill-lifecycle/v1alpha1` subpath 可独立 import，全部 object `.strict()`；
2. `QA-002`：Desktop 11 个 exact method，0 generic dispatcher；
3. `QA-003`：Admin exact methods 与 expected revision 完整；
4. `QA-004`：historical five exact SHA-256 逐字一致，additional no-diff six exact SHA-256 逐字一致；
5. `QA-005`：`skill.manage` 与 `model.use/agent.manage` 权限严格隔离；
6. `QA-006`：Token 从 env 一次性消费、restart lease 可清零；
7. `QA-007`：Token 在 Renderer/Preload payload/SQLite/log/Evidence/Artifact/package 0 命中；
8. `QA-008`：production identity/SSO/RBAC readiness 继续 false。

### G2 Package validation（QA-009～016）

9. `QA-009`：ZIP/RAR/TAR.GZ/TGZ 各一个合法 fixture 解析一致；RAR reader exact artifact/license/传递依赖审计通过；
10. `QA-010`：零/多个 SKILL.md 分别 typed reject；
11. `QA-011`：traversal/absolute/UNC/URL/symlink/hard-link/special entry reject；
12. `QA-012`：duplicate/case-fold/Unicode collision reject；
13. `QA-013`：size/file-count/ratio/encrypted/multivolume/SFX limits fail-closed；RAR bomb/path/CRC/truncation 与 peak
    memory budget focused proof 通过；
14. `QA-014`：canonical manifest/order/package digest deterministic；
15. `QA-015`：invalid UTF-8/BOM/frontmatter/name reject；
16. `QA-016`：archive parser 不执行脚本、不调用 shell、不安装依赖；dependency manifest、MCP descriptor、dependency
    tree 与预编译 binary 均 reject。

### G3 Lifecycle / Central（QA-017～024）

17. `QA-017`：Central B0013/U0013/manifest 同一 schema version set；
18. `QA-018`：Core migration max 26；
19. `QA-019`：save 创建 immutable revision 并推进 current pointer；
20. `QA-020`：revision 改变使旧 test stale；
21. `QA-021`：submit/publish 必须 current revision passed；
22. `QA-022`：submission immutable，approve/reject exact revision；
23. `QA-023`：user approve 与 admin direct publish 共用 release writer；
24. `QA-024`：release/package/audit 不含测试正文、模型正文、路径或 Secret；Skill package/store 与 Personal Model
    storage/Contract/Helper namespace 物理隔离。

### G4 Local discovery / install（QA-025～032）

25. `QA-025`：只扫描 user root 与 active Workspace fixed root；
26. `QA-026`：同名不同来源显示冲突且不静默覆盖；
27. `QA-027`：install 下载/digest/entry/stable-read/atomic publish 顺序固定；仅写 Skill installation manifest，Core
    config/Personal Model SQLite/MCP/Tool registry 零写入；
28. `QA-028`：任一失败 staging 归零且 UI 不显示 installed；
29. `QA-029`：exact release 重装幂等，不同 release 需显式更新；
30. `QA-030`：active Task lock 命中时 uninstall fail-closed；
31. `QA-031`：卸载不删除 Central release、draft 或历史 Task；
32. `QA-032`：Renderer response 不含 package bytes、root、path、grant 或 staging identity。

### G5 Desktop/Admin product（QA-033～040）

33. `QA-033`：四分类来自真实 Adapter，无“全部”与虚假计数；
34. `QA-034`：Skill detail 四项主要信息与 source-specific action 正确；
35. `QA-035`：三字段创建成功进入真实 Workbench 并自动发送首条消息；
36. `QA-036`：创建失败保留表单，第二阶段失败保留会话和文件；
37. `QA-037`：创建对话无 test/submit，created detail 才有；
38. `QA-038`：Admin parse/save/test/publish 四结果分离；
39. `QA-039`：Admin submission terminal/inflight/conflict guard 完整；
40. `QA-040`：页面无 Fake、LocalStorage、fixture success 或 raw technical leak。

### G6 Runtime / E2E（QA-041～048）

41. `QA-041`：new Task 锁定 exact Skill revision/content digest/source；
42. `QA-042`：SKILL.md 进入独立 instruction section；
43. `QA-043`：Skill 文本不能授予未锁定 Tool/Workspace/Network 权限；
44. `QA-044`：selected Skill 消失/变更时 fail-closed，不静默替换；
45. `QA-045`：Core restart 后 active Task exact Skill lock 不漂移；
46. `QA-046`：用户创建链真实 E2E 全步骤 PASS；
47. `QA-047`：Admin direct-upload → Central private staging/canonical store → Core pull → install → Task E2E PASS；
48. `QA-048`：Personal Model、TGM、Knowledge、generic Agent Lifecycle、SSO/RBAC 继续 GATED。

不建立 96/120 项关闭账本，不新增 Evidence schema。实施报告记录测试命令、实际数量和 content-free E2E 结果即可。

---

## 12. 联合真实 E2E

### 12.0 执行纪律

- 执行前先确认 WFW-1/WFW-2、WFW-3 macOS product E2E、RSL-1 和 ADMIN-MVP-VS1 的已接受事实仍可引用；
- WFW-3 Windows NTFS gate 当前为 deferred/not closed，只记录该状态，不将其冒充 PASS，也不作为 RSL-2 macOS 联合
  E2E 的前置阻塞；
- 两条 RSL-2 E2E 必须在同一机器串行执行：先用户创建链，完整 teardown/resource-zero 后再执行 Admin direct upload；
- 单条 E2E 总上限 15 分钟，Central/PostgreSQL/Electron 启动阶段分别有独立 180/180/60 秒上限；业务步骤必须各有
  typed deadline，禁止无限等待；
- 不允许自动 retry。只有在第一个业务 mutation 发生前确认是端口/进程启动失败，才允许清空 test-only 资源后人工重跑
  一次，并在实施报告同时保留首次失败与重跑原因；
- 共享端口、IPC、数据库、staging、Skill directory 与 Token lease 在两条场景之间必须归零或使用不同 test identity。

### 12.1 主场景：用户创建

必须在 fresh local-trial 环境执行：

1. 启动 PostgreSQL v13 Central、真实 Electron Main/Preload/Core 和 Admin；
2. Desktop 填写三个字段；
3. 创建 draft Workspace、Session、Skill Creator Task；
4. 真实 Gateway HTTP/SSE 返回 WFW Tool Call，生成带 marker 的 `SKILL.md`；
5. Task completed 后“我创建的”出现 exact draft revision；
6. 从详情运行真实 test Task，Central 记录 passed fact；
7. 提交 immutable submission；
8. Admin 打开真实 submission 并 approve；
9. Desktop 刷新技能广场并安装 exact release；
10. Workbench 显式选择已安装 Skill 创建新 Task；
11. Gateway request 中出现 exact Skill instruction marker，但日志/Evidence 不记录正文；
12. Task 完成并生成一个真实 WFW HTML/Markdown Artifact；
13. SIGKILL Core，原 SQLite reopen 后 exact Skill lock、消息、Task 和 Artifact 恢复；
14. Task terminal 后卸载成功，新 Task 不再可选，marketplace 可重新安装。

### 12.2 附加场景：Admin direct upload

1. Admin 上传一个合法 archive；
2. 解析结果显示 package facts；
3. 修改展示信息并保存；
4. 运行测试并通过；
5. 显式发布；
6. Desktop 安装并用于新 Task；
7. archive 中的 `scripts/` 从未执行。

### 12.3 E2E content-free 输出

允许记录：

- realElectronMain/Preload/Core/Central/Admin booleans；
- draft/revision/submission/release/install/task IDs 的不可逆或测试 identity；
- package/file count、total bytes、digest match boolean；
- test/task terminal status；
- Core PID changed、SQLite reopened；
- staging/resource cleanup counts。

禁止记录 Token、Credential、Endpoint Secret、SKILL.md 正文、用户输入、模型输出、Tool arguments、绝对路径或 package bytes。

---

## 13. 非功能要求

### 13.1 性能建议基线

- 100 个本地 Skill 的目录扫描 P95 < 1 秒；
- 10 MiB canonical package 安装 P95 < 5 秒（不含下载网络时间）；
- 200 MiB 上传/解析必须流式或 bounded，不允许整包多份驻留内存；
- Skill Catalog 首屏 50 项 P95 < 1 秒（local-trial 环境）；
- install/uninstall operation 可查询，不允许 UI 无限等待无终态。

### 13.2 可靠性

- package blob、draft revision、submission、release 均 immutable；
- staging 使用随机 operation root，成功后原子发布；
- Core/Main/Central restart 后 operation 要么可证明成功，要么 typed failed/uncertain，不乐观成功；
- local source change 在 Task accept 前和 materialize 前双窗口校验；
- audit failure 不得泄露业务正文，但关键 mutation 必须 fail-closed 或有明确 outbox 策略。

### 13.3 资源清理

联合 E2E 后至少归零：Electron process、BrowserWindow、webContents、IPC handler、Core child、Central test server、
PostgreSQL test instance、HTTP client、download stream、archive stream、package staging、draft temp、install temp、
listening port 和 pending operation。

---

## 14. 停手条件（20 项）

1. 需要第二套 Task/Agent Loop/Runtime Selection；
2. 需要 generic package/object store API；
3. 需要 Renderer 接触真实路径、package bytes 或 Token；
4. 需要把 WorkspaceGrant 写进模型可见 Step/Prompt；
5. 需要模型调用通用 mkdir/delete/archive shell Tool；
6. `junrar:8.1.0` 或替代 RAR reader 需要外部 executable、native binary、不可接受许可、无法 bounded streaming/CRC
   校验或 hostile-input proof 不通过；
7. archive reader 无法 fail-closed 处理 traversal/link/bomb/duplicate；
8. 需要执行 `scripts/` 才能把 Skill 标记为 installed 或 test passed；
9. 需要自动/提示安装包内依赖、注册 MCP/Tool，或允许 dependency tree/预编译 binary 进入 installed registry；
10. 需要修改 frozen Desktop/Admin/Agent Contract 而不是 additive subpath；
11. 需要修改 Core SQLite migration；
12. 需要 TGM、Knowledge Provider、Personal Model 或 SSO/RBAC 才能完成主链；
13. 同名来源只能靠前端覆盖解决；
14. install 失败会留下可发现半安装目录；
15. uninstall 会破坏 active Task exact lock；
16. submission 或 release 需要包含测试正文、模型输出或 Workspace 路径；
17. Skill 文本能绕过 Tool/Workspace/Network authorization；
18. 真实 E2E 必须用 Fake/LocalStorage/fixture success、自动 retry 或并行抢占共享资源才能通过；
19. 必须建立新 Evidence schema 或 96/120 项关闭账本；
20. 编码范围扩张到 Admin 机器人、Tool/MCP、Knowledge、TGM 或 generic lifecycle platform。

命中任一项必须停手、记录事实并回到用户评审，不得“先实现再解释”。

---

## 15. 版本、门禁与交付

### 15.1 版本策略

- Root/Core/Desktop/Contracts/Admin：`0.0.0-mvp.rsl.2`；
- Central：`0.0.0-mvp.rsl.2-SNAPSHOT`；
- Document Worker 仅在承接 private canonical ZIP inspect 时随批升级；若不修改则保持当前版本；
- Core migration max 26；
- Central schema target 13；
- archive dependency和 lockfile 变化必须只来自评审接受的 exact reader，不得顺手升级其他依赖。

### 15.2 必跑门禁

- Contract/Core/Desktop/Admin focused tests；
- Central archive/lifecycle online + offline；
- Document Worker full（若修改）；
- Core/Desktop/Admin typecheck；
- focused ESLint；
- DTP-4 packaging audit 与 self-test；
- `git diff --check`；
- 一个真实用户创建联合 E2E；
- 一个 Admin direct-upload 联合 E2E；
- frozen Contract/historical Evidence 只读不漂移检查。

### 15.3 交付物

- 本方案及独立文档复核；
- consumer-driven Contract；
- Central v13 schema/package/lifecycle；
- Core/Main discovery/install/runtime；
- Desktop 与 Admin 真实页面；
- focused tests、联合 E2E driver；
- 实施报告与独立代码 QA；
- 前端 handoff 只列真实 method/signature/state/error，不提供 Mock 数据。

---

## 16. 独立评审问题

1. 是否确认 RSL-2 同时关闭用户创建与 Admin direct-upload 两条 Skill 发布链？
2. 是否确认 Central 是企业 draft/revision/test/submission/release 权威，本地安装/目录发现仍是本机事实？
3. 是否确认只新增一个 `skill-lifecycle/v1alpha1` consumer-driven Contract，不修改 frozen Contract？
4. 是否确认 Skill Creator 使用真实 Task + WFW，并由受控 draft service 创建目录，不开放通用 mkdir Tool？
5. 是否确认 ZIP/RAR/TAR.GZ/TGZ 都属于 P0，RAR dependency 不可安全满足时必须停手而非静默删范围？
6. 是否确认安装不执行脚本、不安装依赖，Skill 文本也不能授予 Tool/Workspace/Network 权限？
7. 是否确认用户 submission 与 Admin direct publish 共用同一个 release writer？
8. 是否确认 active Task exact lock 命中时卸载必须拒绝？
9. 是否确认 48 项 focused QA + 两条联合场景足够，不建设新 Evidence schema 或关闭账本？
10. 是否确认本方案通过评审不等于编码授权，必须由用户再次单独授权 RSL-2？

---

## 17. 关闭后的诚实边界

RSL-2 关闭后可以确认：

```text
用户创建 Skill → 测试 → 提交 → Admin 审核 → 发布 → 安装 → 新 Task exact 使用
Admin 上传 Skill 包 → 校验 → 测试 → 发布 → Desktop 安装使用
本地 Skill 发现 → 显式选择 → exact lock → Core restart recovery
```

仍保持 GATED：

```text
production identity / SSO / RBAC
任意 Skill 脚本自动执行
自动 Python / Node / system dependency installation
TGM
Knowledge Provider
Personal Model production readiness
Admin direct enterprise robot create/update/downlist
generic Agent/Skill marketplace platform
```

本方案当前保持：

```text
PLAN REVIEW PASS/CLOSED / STEP 1 CONTRACT_AND_DEPENDENCY_RE_FREEZE PASS / FRONTEND PARALLEL START AUTHORIZED
```
