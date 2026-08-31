# WFW-2 Core Registry / Policy / Effect Recovery / Artifact Activation 详细实施方案

> Owner: Codex 5.6  
> Date: 2026-08-31  
> Status: `PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED`
> Upstream: `WFW-0 Revision 1.1 PASS/CLOSED`、`WFW-1 PASS/CLOSED`  
> Canonical capability: `tool.workspace.file.write_text`

## 0. 结论与控制口径

WFW-2 只把 WFW-1 已完成的私有 UTF-8 Text Writer 接入现有 Tool Runtime，关闭四个缺口：

1. Core Registry、TaskCapabilityLock 与模型 schema；
2. exact WorkspaceGrant、Policy 与 owned WFW Artifact replace authority；
3. 既有 EffectCoordinator 的 `query_then_retry` 恢复；
4. 成功 Observation 到既有 Artifact Index 的自动投影。

本批不修改 Renderer、Main、Preload 或 Desktop API，不宣称普通客户端闭环。Tool Activity、Artifact 面板、HTML/Markdown/Text 预览、真实 Electron E2E 与 Windows NTFS 门禁仍属于 WFW-3。

本批不是通用文件平台，不新增第二套 Registry、Policy、Effect、Artifact 或 Task 状态机，也不新增 `file.read / file.edit / file.delete`、目录创建、任意文件覆盖或跨 Workspace 写入。

```text
WFW-1: PASS/CLOSED — private writer only
WFW-2: PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED
WFW-3 / WFW-H1: GATED
```

## 1. 已核实的事实基础

### 1.1 WFW-1 已交付

- private capability `tool.workspace.file.write_text` 已存在；
- 已支持 `create_new / replace_existing`、exact prior SHA-256、private proof、file fsync、atomic publication 与一层 `.prev`；
- inspector 已返回 `not_found / safe_retry / recovered_success / unknown`；
- WFW-1 独立 QA 已由用户接受并 `PASS/CLOSED`；
- capability 尚未进入 Core Registry、Policy、Effect 或 Artifact；
- 无公共 Contract、Core migration、依赖或 lockfile 变化。

### 1.2 可直接复用的 Core 接缝

- `RegistryBuilder`、`CapabilityResolver`、`TaskCapabilityLockService`；
- `ToolExecutionService` 的 initial、pre-dispatch、post-confirmation authorization recheck；
- `AuthorizationEvaluator` 的 exact WorkspaceGrant `create / modify` 与 `routine_file`；
- `EffectCoordinator.query_then_retry` 的 retry/result/uncertain 状态机；
- single-flight `DocumentWorkerToolBackend` child process；
- `projectArtifactIndexForTask()` 的 Observation-derived Artifact；
- `resolveArtifactFileSource()` 的 Task selection + WorkspaceGrant source authority；
- internal-trial R2D 的 exact Tool entitlement/selection/lock。

### 1.3 必须解决、不得绕过的差异

1. existing Document descriptor 是 `idempotent_retry`，WFW 必须是 `query_then_retry`；
2. existing backend 只有一个 descriptor identity；
3. WFW inspector 尚无 NDJSON inspect 消息；
4. `ToolEffectExecutor.query()` 尚固定为 `unknown`；
5. Artifact projector 尚不识别 WFW；
6. Replace proof 必须由 Core 推导，模型与 Renderer 不能提供。

若必须增加公共 Contract、migration、依赖、新索引、新产品 API 或第二套恢复状态机，立即停手回评审。

## 2. Core 级用户流程

1. 用户要求 `agent.general` 创建 HTML、Markdown、JSON、CSS、CSV 或其他 UTF-8 文本；
2. 模型只见 `relativePath / content / mode / expectedPreviousSha256?`；
3. Runtime Selection 锁定 exact WFW definition、binding、descriptor；
4. Core 从 active WorkspaceGrant 派生 root 与 `create` authority；
5. existing Policy 处理 `routine_file + create`；
6. existing EffectCoordinator 持久化 exact Action，共享 Worker 执行；
7. success Observation 自动形成 Artifact；
8. 同一 durable Session 后续 replace 时，Core 推导唯一 terminal WFW Artifact head；
9. Core 注入 private proof，使用 `routine_file + modify`；
10. crash 后 inspect：可证明则恢复成功，可安全重试则重试，否则 `uncertain`。

WFW-2 不验收 Desktop 点击和预览；这些由 WFW-3 验收。

## 3. 总体设计

```text
Model Tool Call
  -> WFW Registry + TaskCapabilityLock
  -> Core parser / WorkspaceGrant / owned proof / authorization
  -> existing ToolExecutionService + EffectCoordinator(query_then_retry)
  -> WFW descriptor handle
  -> shared Document Worker child
       execute -> WFW-1 writer
       query   -> WFW-1 inspector
  -> durable Observation
  -> existing Artifact Index
```

## 4. G1 — Registry、Descriptor 与共享 Worker Handle

### 4.1 独立 Registry records

```text
capabilityId: tool.workspace.file.write_text
bindingId: binding.tool.workspace.file.write_text
adapterDescriptorId: adapter.tool.workspace-text-document-worker
runtimeBoundary: child_process
protocol: robothree-document-worker / private v1alpha2
effectRecoveryMode: query_then_retry
maxConcurrency: 1
```

模型 schema 严格为：

```text
required: relativePath, content
optional: mode, expectedPreviousSha256
additionalProperties: false
```

不得暴露 grant/root、Artifact/proof、idempotency/request digest、limits、approval、temp/lock/backup path。definition 只有 `routine_file`，`readOnlyHint=false`。

### 4.2 existing descriptor 保持冻结

现有 `adapter.tool.document-worker` 与 `idempotent_retry` 保持原样。WFW 使用独立 descriptor，避免 DOCX/XLSX/PDF/PPTX 历史锁与恢复语义漂移。

### 4.3 一个 child、两个 handles

不得启动第二个 Worker child。一个 process owner 暴露 existing Document handle 与 WFW handle；两个 wrapper 分别校验 exact descriptor ID/revision，但共享 PID、decoder、single-flight、pending request、lifecycle 与 cleanup。

### 4.4 entitlement 范围

- normal/internal-trial Registry 注册 WFW records；
- `agent.general` 获得 exact WFW ref；
- 其他机器人只有 existing immutable definition / entitlement 显式引用时才获得；
- 不自动给所有机器人、Catalog 或 `agent.presentation` 扩权；
- 不修改 Admin、Robot Lifecycle、Skill、Knowledge 或 TGM。

## 5. G2 — Parser、Hydration 与 Policy

### 5.1 strict parser

- `relativePath/content` 只接受 string；Worker 继续做权威 path/UTF-8/byte 校验；
- omitted mode => create；create 禁止 previous SHA；replace 要求 exact SHA；
- extra/private field 拒绝；
- Core 计算 UTF-8 `contentSha256`，Worker 独立复算。

### 5.2 durable Action 与 ephemeral root

业务字段外只持久化：

```text
workspaceGrantId
contentSha256
limitsRevision = workspace-text.v1
ownedArtifactProofDigest?  # replace only
```

`workspaceRoot` 只在 execute/query 时从 active grant hydrate，不进 durable Action、模型、Renderer、Observation、Artifact、日志或 safe error。

### 5.3 exact authorization

```text
create_new: exact grant + create + routine_file
replace_existing: exact grant + modify + routine_file + Core-derived proof
```

沿用 existing 三次 authorization recheck。replace 不默认每次确认，也不得把 missing proof 降级为 destructive confirmation；proof 不成立即拒绝且零写入。

### 5.4 idempotency 与 digest

```text
idempotencyKey = workspace-text:<taskId>:<toolCallId>
```

Core 复用 WFW-1 canonical helper，不复制算法。digest 覆盖 capability、key、grant、normalized path、mode、content SHA、previous SHA、proof digest 与 limits revision。

## 6. G3 — Owned WFW Artifact Replace Authority

Replace proof 只从当前 Task 所属同一 durable Session 的成功 WFW Observations 与自动 Artifact 推导。WFW v1 没有 text read，调用方必须仍在当前会话持有文本；不建立全局文件索引或跨 Session 编辑平台。

candidate 必须同时满足：

1. exact WFW capability；2. Observation succeeded；3. exact active grant；
4. normalized path 一致；5. output SHA = expected previous SHA；
6. Artifact source observation/capability 一致；7. lifecycle/source 未删除；
8. candidate 是 Session + grant + path 的唯一 terminal revision head。

Core 用 `sha256 / previousSha256? / mode / path / grant / observation` 构造只读 revision graph，不新增表。同 path/sha 多候选、分叉、环、重复摘要歧义、newer revision、deleted、revoked grant、另一 Session、manual/non-WFW Artifact、模型提交 proof 均 fail-closed。Worker 仍做 target SHA 三次复核。

proof digest 使用 existing canonical JSON helper，覆盖：

```text
domain = robothree.wfw-owned-artifact-proof.v1
sessionId / sourceTaskId / sourceObservationId / artifactId
capabilityId + revision / workspaceGrantId / normalized path
sourceFileSha256 / artifactLifecycleRevision
```

proof digest 进入 private Action/request digest；proof material 不进入用户表面。

## 7. G4 — Private Inspect 与 Effect Recovery

### 7.1 additive private message

private v1alpha2 只 additive 增加：

```text
host -> worker: inspect_text_write_postcondition
worker -> host: text_write_postcondition
```

request 复用 persisted Action 的 exact identity、ephemeral root、path、options、limits、idempotency key、request digest。Worker 重新验证 digest 后调用 WFW-1 inspector。Inspect 只读，不写文件、不建 temp/lock/backup、不返回 content/real path。

existing invoke/result/error 不变。若无法 additive 落地，立即停手，另评审 private v1alpha3；不得临场 bump 公共/Desktop Contract。

### 7.2 窄化 query resolver

`ToolEffectExecutor` 增加 optional internal resolver：non-WFW 仍 `unknown`，exact WFW 才 inspect。EffectCoordinator 与 EffectQueryResult 不改。

| Worker decision | existing Effect result | 后续 |
| --- | --- | --- |
| not_found | not_found | retry |
| safe_retry | not_found | complete revalidation 后 retry |
| recovered_success | succeeded + recovered Observation | commit once |
| unknown | unknown | durable uncertain / no retry |

`safe_retry -> not_found` 只是在 Core adapter 中复用 existing coordinator。

### 7.3 recovered Observation

Worker 根据 persisted request 与 inspection facts返回：

```text
status=replayed
relativePath / mode / sha256 / byteSize / mediaType
previousSha256? / backupCreated / warnings=[]
```

Core 不读 content、不猜 media type、不复制 digest。Observation 使用 exact actionId 与 effectAttemptId 派生稳定 recovery identity，避免重复 Artifact。

### 7.4 四个窗口

1. temp 前：target missing/old -> safe retry；
2. temp fsync 后 publish 前：target missing/old -> safe retry；
3. publish 后 Observation commit 前：exact target（replace 还需 `.prev`）-> recovered success；
4. replace evidence 不一致：unknown -> uncertain，零自动重试、零 Artifact。

fault/barrier 只在 focused test Worker entry 或 EffectCoordinator test injector，不能进入 normal production path。

## 8. G5 — Artifact Activation

扩展 `projectArtifactIndexForTask()`，只对成功 WFW Observation 生成 Tool-generated Artifact。不调用 manual registration，不新增表/migration。

| extension | kind | mediaType |
| --- | --- | --- |
| `.html` / `.htm` | `html` | `text/html` |
| `.md` / `.markdown` | `markdown` | `text/markdown` |
| `.json` | `text` | `application/json` |
| `.css` | `text` | `text/css` |
| `.csv` | `text` | `text/csv` |
| other allowed text | `text` | Worker output media type |

Artifact 包含 source Observation、task/session、relative path、display name、kind/media、byte size、createdAt、available state，以及 bounded `fileSha256/writeMode/backupCreated` metadata。

`sourceDigest` 继续按 existing canonical Observation digest；文件 SHA 单独存在 metadata，不混用。不得投影 content、real root、`.prev` 第二 Artifact、temp/lock path、proof、effect identity 或 raw OS error。

Artifact ID 继续由 existing deterministic projector 派生。normal/recovered/restart projection 都只得到同一个 Artifact；uncertain/failed/cancelled/timed_out 为零 Artifact。WFW-2 只保证 Core projection/source authority，Renderer/APV 属于 WFW-3。

## 9. 实施步骤

### Step 1 — Focused proof

先证明：一个 process owner 可服务两个 exact handles；共用 PID/single-flight；descriptor recovery mode 分离；inspect 可 additive；non-WFW query 不变；WFW Observation 可 deterministic 投影。任何一项要求第二进程、公共协议、migration 或新状态机时停手。

### Step 2 — Registry 与 selection

新增 `workspace-text-tool-registry.ts`；注册 exact records；合并 normal/internal-trial registry；只给 `agent.general` 和显式 entitlement 加 ref；测试非法扩权。

### Step 3 — Parser、authority、hydration

新增 WFW strict parser/execution builder；复用 active WorkspaceGrant；实现 Session-scoped proof resolver；hydrate root/proof；dispatch 前复核 grant 与 terminal head。

### Step 4 — Shared backend 与 inspect

封装一个 process owner、两个 handles；扩展 private inspect parser/router；注入 WFW query resolver；保持 existing Document execute behavior 不变。

### Step 5 — Artifact

扩展 projector/media mapping；proof resolver 复用同一 projector/ID 算法；lifecycle deleted/sourceDeleted 拒绝 replace。

### Step 6 — Real Core recovery integration

用真实 SQLite、Document Worker child 与 EffectCoordinator 验证：create、replace、publish 后 crash/reopen/recovered success、pre-publish safe retry、ambiguous uncertain、revoked grant、restart 无重复 Artifact。

### 9.1 允许修改

```text
services/core/src/registry/workspace-text-tool-registry.ts
services/core/src/application/workspace-text-*.ts
services/core/src/application/artifact-preview-projection.ts
services/core/src/adapters/document-worker/**
services/core/src/adapters/tool/tool-effect-executor.ts
services/core/src/bootstrap/create-desktop-private-runtime.ts
services/core/tests/wfw2-*.test.ts
services/document-worker/src/protocol/**     # additive private inspect only
services/document-worker/src/worker.ts       # inspect dispatch only
services/document-worker/src/handlers/**     # inspector routing only
services/document-worker/tests/**
governance/QA docs and version-only package bumps when authorized
```

### 9.2 禁止修改

```text
packages/contracts/**
apps/desktop/src/main/**
apps/desktop/src/preload/**
apps/desktop/src/renderer/**
services/central-service/**
Core/Central migrations
pnpm-lock.yaml or dependencies
historical WFW-1 QA/Evidence
```

## 10. Focused QA Matrix（48 项）

### G1 Registry / Lock / Entitlement（QA-001～QA-008）

- QA-001 exact capability ID；QA-002 strict four-field schema；
- QA-003 WFW descriptor query_then_retry；QA-004 existing descriptor idempotent_retry；
- QA-005 exact revisions enter lock；QA-006 agent.general receives ref；
- QA-007 non-entitled Agent no candidate；QA-008 two handles one process/PID/single-flight。

### G2 Parser / Workspace / Policy（QA-009～QA-016）

- QA-009 create parse/default；QA-010 replace requires exact SHA；
- QA-011 extra/private fields rejected；QA-012 active grant exact create；
- QA-013 owned replace exact modify；QA-014 revoked/changed grant rejected；
- QA-015 routine_file no mandatory prompt；QA-016 arbitrary target cannot downgrade to destructive confirmation。

### G3 Ownership Proof（QA-017～QA-024）

- QA-017 same Session terminal head accepted；QA-018 another Session rejected；
- QA-019 manual/non-WFW rejected；QA-020 deleted/sourceDeleted rejected；
- QA-021 newer revision invalidates old；QA-022 duplicate SHA/branch/cycle rejected；
- QA-023 model-supplied proof rejected；QA-024 proof digest covers exact authority facts。

### G4 Effect Query / Recovery（QA-025～QA-032）

- QA-025 inspect request digest exact；QA-026 create missing safe retry；
- QA-027 replace old target safe retry；QA-028 published target recovered/replayed；
- QA-029 target + `.prev` recovered；QA-030 ambiguous uncertain/no retry；
- QA-031 non-WFW query remains unknown；QA-032 one stable Observation/terminal EffectAttempt。

### G5 Artifact（QA-033～QA-040）

- QA-033 HTML mapping；QA-034 Markdown mapping；QA-035 JSON/CSS/CSV/text mapping；
- QA-036 source = durable WFW Observation；QA-037 `.prev` no Artifact；
- QA-038 non-success zero Artifact；QA-039 restart no duplicate；
- QA-040 proof resolver/UI projection share Artifact ID algorithm。

### G6 Boundaries / Regression（QA-041～QA-048）

- QA-041 no real path/content leak；QA-042 no direct final-target write outside Worker；
- QA-043 existing Worker protocol regression；QA-044 WFW-1 focused/full regression；
- QA-045 no Contract/migration/dependency/lockfile drift；QA-046 no second process/state machine；
- QA-047 no skip/todo/only/empty assertion；QA-048 WFW-3/WFW-H1/downstream remain GATED。

## 11. 门禁

```text
WFW-2 focused Core tests
WFW-1 focused: 3 files / 72 tests baseline
Document Worker full: 26 files / 220 tests baseline
Core Tool/Effect/Artifact focused regression
Core + Document Worker typecheck/build
DTP-4 packaging audit + audit self-test
focused ESLint
Core smoke
git diff --check
```

另执行真实 child-process + SQLite restart integration。Electron 与 Windows NTFS 不在 WFW-2 gate，不能用 fixture smoke 宣称产品闭环。全仓已知 Desktop workspace blocker 独立记录，不归因 WFW-2，也不能替代 focused PASS。

## 12. 停手条件（20 项）

出现任一项立即停手：

1. 需要公共 Contract；
2. 需要 migration、表或索引；
3. 需要依赖或 lockfile；
4. 需要第二个 Worker process/service；
5. 需要修改 existing descriptor/recovery mode；
6. 需要第二套 Effect/Task/Artifact 状态机；
7. 需要 Core/Main/Preload/Renderer 直接写文件；
8. 需要 Renderer 提交 root/Artifact/proof；
9. 需要把 arbitrary file 当 owned；
10. missing proof 需要降级确认；
11. 需要跨 Session/global index；
12. 需要 read/stat/delete/move/rename/directory Tool；
13. 需要 parent creation/power-loss；
14. 需要 unknown 自动重试或伪成功；
15. 需要 production barrier；
16. 需要泄露 content/real path/internal path；
17. 需要修改 WFW-1 publication 语义；
18. 需要 WFW-specific Desktop API/UI；
19. 需要自动给所有 Agents 扩权；
20. 需要解锁 Personal Model/Admin/TGM/Knowledge/Lifecycle/WFW-3/WFW-H1。

## 13. 诚实边界

WFW-2 最高只能确认：

```text
WFW2_CORE_TEXT_WRITE_ACTIVATION_CONFORMANT
```

不等于 `WFW_PRODUCT_READY / DESKTOP_TEXT_WRITE_READY / WINDOWS_NTFS_READY / POWER_LOSS_DURABLE / FULL_CAS_READY / GENERAL_FILE_PLATFORM_READY`。

外部编辑器最终 digest-check/rename 窗口仍是 best-effort。Artifact/SHA 只证明来源与版本，不能提供正文；Replace 调用方仍需在当前会话持有文本或经其他授权读取，WFW-2 不补建 text read。

## 14. 工期与交付

集中工程时间建议 1.5～2.5 日。较父方案增加 0.5～1 日，是因为代码事实证明 recovery 需要 additive private inspect 与共享 multi-descriptor handle，而非只加 Registry 记录。

交付：Registry records、shared process/two handles、strict parser/private hydration、Session-scoped proof resolver、private inspect/query resolver、Artifact projection、focused + real Core/Worker/SQLite recovery tests、实施报告与 QA handoff。

本计划通过评审不构成编码授权。用户正式接受并单独解锁 WFW-2 后才可编码。

## 15. 独立评审问题

1. 是否同意 WFW 独立 `query_then_retry` descriptor，existing Document descriptor 不变？
2. 是否同意两个 handles 共享一个 Worker child？
3. 是否同意 private v1alpha2 additive inspect，无法 additive 时立即停手？
4. 是否同意 Replace 限定同一 durable Session 的唯一 terminal WFW Artifact head？
5. 是否同意 missing/ambiguous/deleted/non-WFW proof 直接拒绝、不降级确认？
6. 是否同意 `safe_retry` 仅在 Core adapter 映射为 existing `not_found`？
7. 是否同意 WFW-2 自动投影 Artifact，Desktop/Electron/Windows 留给 WFW-3？
8. 是否确认不新增 Contract、migration、依赖、lockfile 或下游能力？
