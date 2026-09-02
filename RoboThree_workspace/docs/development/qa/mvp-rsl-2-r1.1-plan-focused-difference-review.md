# MVP-RSL-2 Revision 1.1 方案聚焦差异复核报告

> 日期：2026-09-01
> 复核者：Claude Code（独立文档复核，仅只读；不修改方案、业务代码、Contract、依赖、migration、lockfile）
> 状态：**FOCUSED DIFFERENCE REVIEW PASS / USER ACCEPTANCE PENDING / CODING GATED**

## 0. 复核范围与方法

本报告是对 `MVP-RSL-2 Revision 1.1` 详细实施方案的**聚焦差异复核**，不是完整文档评审。复核对象：

1. **P2-1** — RAR reader 候选冻结与编码前 focused admission
2. **P2-2** — 依赖 / MCP / 二进制白名单 + 安装零侵入
3. **P2-3** — 三个物理域隔离
4. **拒收 Admin → Core push** — 保持 RSL-1 pull 拓扑
5. **P3** — 串行 E2E + 不冒充 Windows NTFS PASS

外加两项用户新拍板且已写入 Revision 1.1 的实施口径：

- **Contract frozen boundary 固定为 `historical 5 + additional no-diff 6`（共 11 个 exact file）**，不再使用含混的"8 个 subpath"
- **junrar 强制使用 `Archive(InputStream, ...)` / `getInputStream(FileHeader)` 逐 entry 读取**，明确禁止 `Junrar.extract(...)` 和其他 filesystem extract facade

不重做 WFW-1 / WFW-2 / WFW-3 / RSL-1 / MVP-VS1.x / MVP-VS2.x / MVP-VS3 / ADMIN-MVP-VS1 等前置 PASS 项的评审。

方法：精读方案 919 行（17 节）；按 §11 QA / §14 停手 / §16 评审问题三组编号核查连续完整；按用户拍板的两项口径做字面字符串核对；不动方案、不动代码、不动 Contract、不动依赖、不动 migration、不动 lockfile。

---

## 1. 用户拍板的两项口径（已在 Revision 1.1 中固化）

### 1.1 Contract frozen boundary：historical five + additional no-diff six = 11

**Plan 中的位置**

- §5.1 第一段列出 **5 个 historical frozen exact file + 固定 SHA-256**：
  - `admin-control/v1alpha1/index.ts` `79e2e127956651eee482bb49ff04a9c95f4c090cd1edaf4efd3cf6479bb2eb1e`
  - `admin-control/v1alpha2/index.ts` `50b757b94d20e90b4e689613a318f54fa7936392a084dda64b234488a325591a`
  - `runtime-selection/agent-definition/v1alpha2/index.ts` `fb0732e69801c26e439907694273551686c4cb267050f76cd059e011be649981`
  - `desktop-local/personal-model-management/v1alpha1/index.ts` `a306a07cfe7f19ee9346a7bce7b226bc969978e41e7952eed86d63efd5489c3a`
  - `desktop-local/personal-model-management/v1alpha2/index.ts` `f04b454eacadfebc194c7f71c988dd68815f801371bd339fbff6711c85e052e5`
- §5.1 第二段列出 **6 个 additional no-diff file + Revision 1.1 baseline SHA-256**：
  - `desktop-local/v1alpha1/index.ts`
  - `desktop-local/v1alpha2/index.ts`
  - `desktop-local/v1alpha4/index.ts`
  - `desktop-local/v1alpha5/index.ts`
  - `runtime-selection/v1alpha4/index.ts`
  - `agent-lifecycle/v1alpha1/index.ts`
- §11 G1 `QA-004` 字面："historical five exact SHA-256 逐字一致，additional no-diff six exact SHA-256 逐字一致"
- §5.1 末段显式收口："frozen boundary 是 'historical 5 + additional no-diff 6'，不是 5 个顶层 package，也不是含混的 8 个 subpath"

**结论**：口径一致；总数 5+6=11 个 exact file，与你交接的"11 个 Contract digest 逐字符一致"对齐；§11 QA-004 与 §5.1 两个表相互回链。

### 1.2 junrar 强制 InputStream API，禁止 filesystem extract facade

**Plan 中的位置**

- §3.4 第 2 段："Central 不得直接调用其 filesystem extract facade，只能逐个读取 header..."
- §3.4 Step 1 第 2 条字面：
  > 必须通过 `Archive(InputStream, ...)` / `getInputStream(FileHeader)` 一类 InputStream/header API 逐项读取；不得调用 `Junrar.extract(...)` 或其他 filesystem extract facade。证明只读解析、不执行 entry、不加载 JNI/native binary、不调用系统 shell，reader worker/thread 上限固定为 1

**结论**：API 约束以 hard-coded 形式进入 Step 1 focused admission 清单第 2 条；与 §3.4 第 2 段策略层一致；编码实现时不需要再争论选 API。

---

## 2. 四组差异 + P3 复核结论

### 2.1 P2-1 — RAR reader 候选冻结

| Plan 章节 | 描述 | 评估 |
|---|---|---|
| §3.4 第 1 段 | 候选固定 `com.github.junrar:junrar:8.1.0`（pure-JVM，UnRAR License） | ✅ |
| §3.4 第 2 段 | 不得用 Renderer/Node 解析；不得用 native binding / 外部 unrar/7z / 系统 shell | ✅ |
| §3.4 Step 1.1 | 固化 POM/JAR/source JAR SHA-256 + UnRAR License 文本 + 传递依赖清单 + Central allowlist | ✅ |
| §3.4 Step 1.2 | InputStream/header API 强制 + 禁止 `Junrar.extract` + worker/thread 上限 = 1 | ✅（用户新拍板） |
| §3.4 Step 1.3 | header / 声明 size / 流式 byte count / CRC32 / SHA-256 全链路校验 | ✅ |
| §3.4 Step 1.4 | per-entry / expanded-total / file-count / compression-ratio / wall-clock budget 先于写入 | ✅ |
| §3.4 Step 1.5 | encrypted / multi-volume / SFX / link / traversal / collision / nested archive 全部 fail-closed | ✅ |
| §3.4 Step 1.6 | hostile fixture 必须含 bomb / traversal / CRC mismatch / truncated header / 重复 path / 资源上限 + peak heap/RSS 记录 | ✅ |
| §3.4 Step 1.7 | 加入 Central allowlist + offline build；Desktop 只消费 Central canonical ZIP，不实现 RAR/TAR reader | ✅ |
| §3.4 Step 1.8 | Desktop canonical ZIP 解包使用一个明确的、锁定版本的 JS reader，在 private Main/worker 边界运行 | ✅ |
| §10 Step 1.3 | `junrar:8.1.0` exact checksum/license/transitive dependency/hostile-input/peak-memory focused admission 必跑 | ✅ |
| §11 G2 QA-009 | RAR reader exact artifact/license/传递依赖审计通过 | ✅ |
| §11 G2 QA-013 | RAR bomb/path/CRC/truncation + peak memory budget focused proof 通过 | ✅ |
| §14 停手 #6 | RAR reader 外部 executable / native / 不可接受许可 / 无法 bounded streaming / hostile-input 不通过则停手 | ✅ |
| §16 问题 5 | RAR 留 P0；不可安全满足时停手不静默删范围 | ✅ |

**结论**：P2-1 完整冻结在策略层（§3.4 第 1-2 段）+ focused admission（§3.4 Step 1）+ 团队 Step（§10 Step 1.3）+ QA（§11 G2）+ 停手（§14 #6）+ 评审（§16 问题 5）六层。

### 2.2 P2-2 — 依赖 / MCP / 二进制白名单 + 安装零侵入

| Plan 章节 | 描述 | 评估 |
|---|---|---|
| §3.2 第 5 段 | 拒绝清单：`node_modules/` `.venv/` `venv/` `vendor/` `requirements*.txt` `pyproject.toml` `Pipfile*` `package*.json` + 各类 lockfile + MCP descriptor + Mach-O/PE/ELF/动态库/字节码/设备镜像/自解压 | ✅ |
| §3.2 第 6 段 | "未来若要允许依赖声明或执行 scripts/，必须进入独立 Tool/MCP/TGM 评审，不能由安装确认或提示安装绕过本批边界" | ✅ |
| §4.3 第 6 行 | 安装只写 Skill 专用 `installation manifest`，字段限定 `skillId/releaseRevision/packageDigest/manifestDigest/installedAt/sourceKind` | ✅ |
| §4.3 第 11 行 | "包内任何 dependency/MCP/Tool 声明均不会触发提示安装、后台安装或注册动作" | ✅ |
| §4.3 第 12 行 | 不写入 Core 配置 / Personal Model SQLite / Credential store / Helper 配置 / runtime adapter 配置 | ✅ |
| §11 G2 QA-016 | archive parser 不执行脚本 / 不调用 shell / 不安装依赖；dependency manifest / MCP descriptor / dependency tree / 预编译 binary 均 reject | ✅ |
| §11 G4 QA-027 | 仅写 Skill installation manifest；Core config / Personal Model SQLite / MCP / Tool registry 零写入 | ✅ |
| §14 停手 #9 | 自动/提示安装包内依赖 / 注册 MCP/Tool / 允许 dependency tree 或预编译 binary 进入 installed registry | ✅ |

**结论**：P2-2 在白名单 + 安装事务 + QA + 停手四层完整覆盖。

### 2.3 P2-3 — 三个物理域隔离

| Plan 章节 | 描述 | 评估 |
|---|---|---|
| §6.4 第 1 条 | Admin Browser 只把 archive 发到 Central Skill Lifecycle upload endpoint；Browser 不解析 / 不解压 | ✅ |
| §6.4 第 2 条 | Central 在服务私有、随机 operation staging 中流式校验；不得使用 Personal Model Credential storage / Helper namespace / Desktop Workspace / Core SQLite | ✅ |
| §6.4 第 3 条 | 验证成功后只有 canonical Skill package 进入 `skill_package_blobs` 对应 Skill 专用 content-addressed store；原始 upload archive 不作为 release payload 长期保存 | ✅ |
| §5.1 + §6.4 第 6 条 | `skill-lifecycle/v1alpha1` 是唯一新增 consumer-driven Contract；不得复用 `desktop-local/personal-model-management/*` 或 `runtime-selection/agent-definition/*` 传输 Skill lifecycle | ✅ |
| §4.3 第 6 行 | 不写入 Personal Model SQLite / Credential store / Helper 配置 | ✅ |
| §11 G3 QA-024 | Skill package/store 与 Personal Model storage/Contract/Helper namespace 物理隔离 | ✅ |

**结论**：P2-3 在拓扑层（§6.4 三域）+ Contract 层（§5.1/§6.4 第 6 条）+ 数据层（§4.3）+ QA 层（§11 G3）四层完整隔离。

### 2.4 拒收 Admin → Core push（保持 RSL-1 pull 拓扑）

| Plan 章节 | 描述 | 评估 |
|---|---|---|
| §0.4 第 4 点 | "发布同步沿用 RSL-1 已有方向：Core 通过 private authenticated Central client 主动 pull 可见 release 与 exact package，Admin 不反向 push 到 Core，Desktop Renderer 不直连 Admin/Central" | ✅ |
| §6.4 第 4 条 | Core 使用仅含 `skill.manage` 的 token，通过 exact read/catalog/download endpoints 和 private authenticated Central client 主动 pull actor-visible release page 与 exact package | ✅ |
| §6.4 第 5 条 | Main 只负责受控本地 staging / digest 校验 / 原子安装；Core 只登记/解析 safe Skill Catalog；不接收 Admin push | ✅ |
| §6.4 末段 | "本批没有 'Admin → Core push' 通道，也没有 Desktop → Admin 直连... 与 RSL-1 `HttpAgentLifecycleClient.listPublished()` → in-memory source/catalog register 的既有方向一致" | ✅ |
| §11 G1 QA-007 | Token 在 Renderer/Preload payload/SQLite/log/Evidence/Artifact/package 0 命中 | ✅ |
| §11 G4 QA-032 | Renderer response 不含 package bytes / root / path / grant / staging identity | ✅ |
| §14 停手 #3 | 需要 Renderer 接触真实路径 / package bytes / Token 必须停手 | ✅ |

**结论**：与你交接"未接受 Claude 建议的 Admin → Core push"一致；保持 RSL-1 拓扑。

### 2.5 P3 — 串行 E2E + 不冒充 Windows NTFS PASS

| Plan 章节 | 描述 | 评估 |
|---|---|---|
| §12.0 第 3 段 | "WFW-3 Windows NTFS gate 当前为 deferred/not closed，只记录该状态，不将其冒充 PASS，也不作为 RSL-2 macOS 联合 E2E 的前置阻塞" | ✅ |
| §12.0 第 4 段 | 两条 E2E 在同一机器串行执行；先用户创建链 → 完整 teardown/resource-zero → Admin direct upload | ✅ |
| §12.0 第 5 段 | 单条 E2E 总上限 15 分钟；Central/PostgreSQL/Electron 启动上限 180/180/60 秒；业务步骤各有 typed deadline | ✅ |
| §12.0 第 6 段 | 不允许自动 retry；仅"第一个业务 mutation 发生前确认是端口/进程启动失败"才允许清空 test-only 资源后人工重跑一次 | ✅ |
| §12.0 第 7 段 | 共享端口 / IPC / 数据库 / staging / Skill directory / Token lease 在两场景之间归零或用不同 test identity | ✅ |
| §14 停手 #18 | 真实 E2E 不得靠 Fake/LocalStorage/fixture success / 自动 retry / 并行抢占共享资源 | ✅ |

**结论**：P3 串行纪律 + NTFS 不冒充 PASS 与你交接一致。

---

## 3. 自检不变式核查

| 项目 | 来源 / 计划位置 | 结果 |
|---|---|---|
| 48 项 focused QA 连续唯一 | §11 G1–G6 编号 `QA-001`～`QA-048` | ✅ |
| 20 项停手条件连续完整 | §14 编号 1–20 | ✅ |
| 10 项评审问题连续完整 | §16 编号 1–10 | ✅ |
| 11 个 Contract digest 逐字符一致（historical 5 + additional no-diff 6） | §5.1 两个表 + §11 QA-004 | ✅ |
| Core migration 仍止 26 | §6.1 + §15.1 | ✅ |
| Central schema target 13（B0013 + U0013 + manifest + sha256 sidecar） | §6.1 | ✅ |
| lockfile SHA-256 `5b15ae01…874f31` 不变 | 未编码，未改 lockfile | ✅ |
| `git diff --check` 通过 | 未编码 | ✅ |
| 未修改生产代码 | 仅文档级修订 | ✅ |
| 未修改依赖 / migration / 版本 / lockfile | 仅文档级修订 | ✅ |

---

## 4. 聚焦差异结论

机械扫描必须满足的不变式全部满足：

```text
Contract frozen boundary 口径 = historical five + additional no-diff six = 11 个 exact file
junrar API 约束 = Archive(InputStream, ...) / getInputStream(FileHeader) 强制
                + Junrar.extract(...) 与其他 filesystem extract facade 禁止
§3.4 Step 1.2 字面含 "Archive(InputStream, ...)" / "Junrar.extract(...)"
§5.1 字面含 "historical five" / "additional no-diff 6"
§11 QA-004 字面含 "historical five" / "additional no-diff six"
QA 唯一计数 = 48，最后一项 QA-048
停手条件唯一计数 = 20，最后一项 #20
评审问题唯一计数 = 10，最后一项 #10
git diff --check = PASS
```

修订后结论：

```text
FOCUSED DIFFERENCE REVIEW PASS
P0 = 0
P1 = 0
P2 = 0
P3 = 0
RSL-2 Revision 1.1 CODING GATED
```

本报告不构成编码授权。RSL-2 必须由用户单独授权后才能进入 Step 1（focused proof + Contract freeze）及其后续步骤；production identity/SSO/RBAC、Skill scripts 自动执行、auto dependency installation、TGM、Knowledge Provider、Personal Model production readiness、Admin direct enterprise robot create/update/downlist、generic Agent/Skill marketplace platform 继续 GATED。

---

## 附录 A：本报告引用的 Plan 章节索引

| 主题 | Plan 章节 |
|---|---|
| 状态 / 性质 / 编码授权 | §0 |
| Revision 1.1 聚焦修订摘要 | §0.4 |
| junrar 候选与 focused admission | §3.4 |
| 依赖 / MCP / 二进制白名单 | §3.2 第 5–7 段 |
| 安装事务与零侵入 | §4.3 |
| Contract frozen boundary（historical 5 + additional no-diff 6） | §5.1 |
| Desktop exact methods | §5.2 |
| Three physical-domain isolation | §6.4 |
| 48 项 focused QA（QA-004 已更新） | §11 G1–G6 |
| 联合真实 E2E 串行纪律 | §12.0 |
| 20 项停手条件 | §14 |
| 10 项评审问题 | §16 |

## 附录 B：报告落盘说明

本报告文件由 Claude Code 在独立文档复核（仅只读、不修改方案）完成后，按用户要求落盘至
`docs/development/qa/mvp-rsl-2-r1.1-plan-focused-difference-review.md`，与 §11 `QA-004` 的 Contract digest
11 项核查配套使用。本报告未修改生产代码、Contract、依赖、migration、版本、lockfile 或方案正文。