# MVP-RSL-2 Step 1 Contract / Dependency Freeze 报告

> 日期：2026-09-01  
> 状态：`STEP 1 RE-FREEZE PASS / FRONTEND PARALLEL START AUTHORIZED / BACKEND LIFECYCLE IMPLEMENTATION NOT STARTED`  
> 目标版本：`0.0.0-mvp.rsl.2`  
> 范围：共享 consumer Contract、方法集合、安全错误、Junrar dependency admission、既有 Runtime/WFW 接缝证明

## 0. 冻结结论

RSL-2 Revision 1.1 已由用户正式接受。本步骤完成了让 Desktop 与 Admin 可以并行开工所需的共享基线，但没有伪造尚未实现的后端成功路径。Desktop 首次消费时按停手规则发现 3 个 durable identity 缺口；Contract 负责人已做同一 v1alpha1 内的 consumer-driven 聚焦修订并重新冻结，没有新增方法或扩大产品范围。

已冻结：

- `@robothree/contracts/skill-lifecycle/v1alpha1` additive strict Contract；
- Desktop 11 个方法名、Admin 10 个方法名及其 exact request/response schema；
- `skill.manage` internal-trial 最小权限；
- 17 个 typed safe error code；
- Admin archive multipart 的 strict metadata；archive bytes 必须作为独立 bounded file part；
- Central `com.github.junrar:junrar:8.1.0` dependency admission；
- Central schema target 13 与 Core SQLite migration max 26 的独立 counter 边界。

尚未实现：Central v13 lifecycle/store、Core/Main/Preload/IPC、Desktop real Adapter、Admin real HTTP Adapter、真实联合 E2E。因此前端可以开始页面、pure presentation、Adapter 和 focused tests，但必须以真实接口不可用为 fail-closed 状态，不得用 Fake、LocalStorage 或 fixture success 冒充完成。

## 1. Shared Contract

### 1.1 唯一新增 subpath

```text
@robothree/contracts/skill-lifecycle/v1alpha1
```

版本常量：

```text
skill-lifecycle.v1alpha1
```

权限常量：

```text
skill.manage
```

所有 JSON object schema 均保持 `.strict()`。Renderer/Admin safe projection 不包含 Token、Endpoint、Credential、archive bytes、SKILL.md 原始正文、绝对路径、WorkspaceGrant、staging identity、模型输入/输出或内部异常。

### 1.2 Desktop 方法集合（exact 11）

| 方法 | 输入 schema | 输出 schema |
| --- | --- | --- |
| `getSkillLifecycleCompatibility` | `GetSkillLifecycleCompatibilityQuerySchema` | `SkillLifecycleCompatibilitySchema` |
| `listSkills` | `ListSkillsQuerySchema` | `SkillPageSchema` |
| `getSkill` | `GetSkillQuerySchema` | `SkillDetailSchema` |
| `createSkillDraftWorkspace` | `CreateSkillDraftWorkspaceCommandSchema` | `CreateSkillDraftWorkspaceReceiptSchema`（含 exact draft workspace identity） |
| `refreshSkillDraft` | `RefreshSkillDraftCommandSchema` | `SkillLifecycleMutationReceiptSchema` |
| `startSkillDraftTest` | `StartSkillDraftTestCommandSchema` | `SkillLifecycleMutationReceiptSchema` |
| `submitSkillDraft` | `SubmitSkillDraftCommandSchema` | `SubmitSkillDraftReceiptSchema`（含 exact submission identity） |
| `withdrawSkillSubmission` | `WithdrawSkillSubmissionCommandSchema` | `SkillLifecycleMutationReceiptSchema` |
| `installSkillRelease` | `InstallSkillReleaseCommandSchema` | `SkillLifecycleMutationReceiptSchema` |
| `uninstallSkillRelease` | `UninstallSkillReleaseCommandSchema` | `SkillLifecycleMutationReceiptSchema` |
| `querySkillOperation` | `QuerySkillOperationSchema` | `SkillOperationSchema` |

不得新增 generic `dispatchSkillCommand(type, payload)`，不得在前端猜测 submission/revision/operation identity。

### 1.2.1 Desktop consumer 聚焦 re-freeze

| 原缺口 | 冻结修订 | 负向约束 |
| --- | --- | --- |
| 创建后无法绑定 exact draft Workspace | `CreateSkillDraftWorkspaceReceiptSchema` 必含 `draftId/workspaceGrantId/displayName` | 缺任一字段 strict reject；不得把真实路径返回 Renderer |
| 刷新后无法安全撤回 | `SubmitSkillDraftReceiptSchema` 必含 `submissionId/submissionRevision`；`SkillDetail.submission` 持久投影 identity + state | 不使用页面内存或 LocalStorage 猜测；terminal state 仍按真实详情展示 |
| 卸载没有 expected installation revision | `SkillSummary/SkillDetail` 在 `installed=true` 时必含 `installationRevision` | installed=true 缺字段或 installed=false 携带字段均 reject；不得复用混合 `revision` |

### 1.3 Admin 方法集合（exact 10）

| 方法 | 输入 schema | 输出 schema |
| --- | --- | --- |
| `listSkillSubmissions` | `ListSkillSubmissionsQuerySchema` | `SkillSubmissionPageSchema` |
| `getSkillSubmission` | `GetSkillSubmissionQuerySchema` | `SkillSubmissionDetailSchema` |
| `approveSkillSubmission` | `ApproveSkillSubmissionCommandSchema` | `SkillLifecycleMutationReceiptSchema` |
| `rejectSkillSubmission` | `RejectSkillSubmissionCommandSchema` | `SkillLifecycleMutationReceiptSchema` |
| `uploadEnterpriseSkillPackage` | `UploadEnterpriseSkillPackageCommandSchema` + 独立 multipart file part | `SkillLifecycleMutationReceiptSchema` |
| `getEnterpriseSkillDraft` | `GetEnterpriseSkillDraftQuerySchema` | `EnterpriseSkillDraftSchema` |
| `updateEnterpriseSkillDraftMetadata` | `UpdateEnterpriseSkillDraftMetadataCommandSchema` | `SkillLifecycleMutationReceiptSchema` |
| `startEnterpriseSkillDraftTest` | `StartEnterpriseSkillDraftTestCommandSchema` | `SkillLifecycleMutationReceiptSchema` |
| `queryEnterpriseSkillDraftTest` | `QueryEnterpriseSkillDraftTestSchema` | `SkillOperationSchema` |
| `publishEnterpriseSkillDraft` | `PublishEnterpriseSkillDraftCommandSchema` | `SkillLifecycleMutationReceiptSchema` |

Admin Browser 不解析 archive。`File`/stream 是浏览器到 Central upload adapter 的 transport part，不进入共享 JSON Contract，也不进入日志、错误或审计正文。

### 1.4 Typed safe errors（exact 17）

```text
skilllifecycle.invalid_request
skilllifecycle.unauthorized
skilllifecycle.not_found
skilllifecycle.revision_conflict
skilllifecycle.service_unavailable
skilllifecycle.skill_id_reserved
skilllifecycle.draft_incomplete
skilllifecycle.package_invalid
skilllifecycle.package_too_large
skilllifecycle.archive_unsupported
skilllifecycle.test_required
skilllifecycle.submission_conflict
skilllifecycle.release_conflict
skilllifecycle.installation_conflict
skilllifecycle.active_task_lock
skilllifecycle.local_source_changed
skilllifecycle.operation_failed
```

前端只能把这些 code 映射为安全业务文案。未知 code 统一显示“技能服务暂时不可用，请稍后重试”，不得展示 raw body、stack 或 transport exception。

## 2. 编码前接缝证明

### 2.1 Dynamic locked Skill injection 已存在

既有 `LockedSkillInstructionResolver.loadExact(reference)` 接受 portable/durable exact Skill reference；`TaskInstructionBundleMaterializer` 按 Runtime Selection 的 ordered Skill refs 逐项：

1. 加载 exact `id + revision + contentDigest`；
2. 重算 main body digest；
3. 任一 identity/digest 不一致即 `context.skill_material_invalid`；
4. 以 `sourceKind=skill`、advisory authority 注入唯一 instruction bundle；
5. 无 resolver 或 material 即 fail-closed，不跳过 locked Skill。

因此 RSL-2 只需实现可信 published/installed/local Skill resolver，不需要第二套 Agent Loop、Prompt pipeline 或 Skill Runtime。

### 2.2 WFW draft root 不需要暴露 mkdir Tool

WFW `tool.workspace.file.write_text` 已证明只写 existing parent，missing parent 必须拒绝。RSL-2 的受控 lifecycle service 将在创建草稿时创建随机、私有、已授权 draft root 与已知子目录；模型只获得该 WorkspaceGrant 和 WFW write capability，不获得通用 mkdir/delete/archive shell Tool。

这只证明现有接缝可承接需求；受控 draft service 本身仍属于后端实施，不在本冻结步骤中伪造。

### 2.3 Migration counter 隔离

- Core SQLite migration：继续止于 `26`；
- Central PostgreSQL deployment set：下一版本为 `B0013/U0013/manifest v13`；
- Step 1 没有新增任何 migration；
- Central v13 只在后续 lifecycle store 实施时创建，不能写入 Core SQLite migration chain。

## 3. Junrar 8.1.0 dependency admission

### 3.1 固定 artifact

| Artifact | SHA-256 |
| --- | --- |
| `junrar-8.1.0.jar` | `53c23cc8a11c932b7336d8109257c14b1d8981b789b0792fc3f78ac567b645e7` |
| `junrar-8.1.0-sources.jar` | `10b2b416774b8b3776a6dc138fe51202e83f2d9b4b7be7d1308a8dc51254234b` |
| `junrar-8.1.0.pom` | `8f02bbf85689f39598bff9bf79767eb74fe56e4651916a0e7e8baebf8976a83c` |

- upstream tag/commit：`8.1.0 / 57091f9ccd43661cf8f12c389917cc24950df707`；
- license：UnRAR License；只允许用于读取/处理 RAR，不得用于重建 RAR compression algorithm；
- artifact 内无 JNI、native、`.so`、`.dylib` 或 `.dll`；
- Maven 唯一声明的 runtime dependency 是 SLF4J API；工程 dependency management 将其收敛到已有 `2.0.18`，未引入第二个日志实现。

### 3.2 冻结调用方式

生产解析只能使用 `Archive(InputStream)`、逐 `FileHeader` 检查和同步 `extractFile(FileHeader, bounded OutputStream)`：

- 禁止 `Junrar.extract(...)` filesystem facade；
- 禁止外部 `unrar/7z`、shell、native binding；
- 不使用会建立额外线程的 `getInputStream(FileHeader)`；
- 写入任何 canonical staging 前先验证 path/type/declared size/duplicate policy；
- caller-owned bounded sink 同时计算实际 byte count、CRC32 与 SHA-256；
- encrypted、multi-volume、SFX、link、special node、traversal、collision、nested archive 和超预算全部 fail-closed。

### 3.3 实测 admission

JDK 21、Maven offline、`-Xmx128m` 下 5/5 PASS：

1. clean RAR header 与同步 bounded extraction；
2. parent traversal 在写入 entry bytes 前可识别；
3. broken header CRC 拒绝 extraction；
4. truncated encoded name 拒绝 archive construction；
5. 1 GiB dictionary claim 不触发 eager 1 GiB heap allocation，实际 3,200 bytes 在 5 秒预算内完成。

这只是 exact dependency admission，不等于完整 ZIP/RAR/TAR.GZ/TGZ package validator 已实现。

## 4. 前端开始条件与禁止项

### 4.1 Desktop 可立即开始

- Skill Catalog 四个固定 scope：技能广场、已安装、本地目录、我创建的；
- 创建第一阶段仅名称、描述、主要功能；
- 创建成功后进入真实 creator Task/Session；
- 草稿详情、测试、提交、撤回、安装、卸载、operation polling；
- Workbench 只消费可用 exact Skill revision，安装/服务不可用时 fail-closed。

### 4.2 Admin 可立即开始

- 用户 submission list/detail、批准、拒绝和 revision conflict reload；
- 企业包 upload、draft detail、展示元数据编辑、测试、发布；
- Browser 不解压、不预览原始 package bytes、不读取 SKILL.md 原文；
- upload progress 属 transport UI，不可伪装为服务端解析/测试/发布成功。

### 4.3 两端共同禁止

- Fake/LocalStorage/fixture success；
- generic lifecycle dispatcher；
- 猜测 ID/revision、乐观完成 install/publish；
- 展示 Token、Endpoint、绝对路径、WorkspaceGrant、package bytes、测试正文、模型输出、Tool 参数或 raw exception；
- 顺手实现 TGM、Knowledge、MCP、Personal Model、SSO/RBAC 或通用包管理器。

## 5. 门禁结果

| 门禁 | 结果 |
| --- | --- |
| Contract build | PASS |
| Contract focused | `1 file / 14 tests PASS`（含 3 个 consumer identity 缺口负向断言） |
| Contract focused ESLint | PASS |
| Junrar offline admission | `5 tests PASS / BUILD SUCCESS` |
| Junrar offline dependency tree | PASS |
| DTP-4 packaging audit + self-test | `PASS + 1 file / 2 tests PASS` |
| frozen historical five + no-diff six SHA-256 | 11/11 exact |
| lockfile SHA-256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` |
| Core migration max | `26` |
| `git diff --check` | PASS |

## 6. 当前执行状态

```text
RSL-2 PLAN REVIEW PASS/CLOSED
RSL-2 STEP 1 CONTRACT_AND_DEPENDENCY_RE_FREEZE PASS
DESKTOP FRONTEND PARALLEL START AUTHORIZED
ADMIN FRONTEND PARALLEL START AUTHORIZED
CENTRAL/CORE/MAIN/PRELOAD FULL LIFECYCLE IMPLEMENTATION NOT STARTED
RSL-2 PARENT NOT CLOSED
```
