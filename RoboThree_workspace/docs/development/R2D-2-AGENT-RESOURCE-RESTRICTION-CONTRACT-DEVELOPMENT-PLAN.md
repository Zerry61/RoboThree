# R2D-2 Agent Definition v1alpha2 与四类资源限制 Contract 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED；PASS/CLOSED**  
> 日期：2026-08-26  
> 负责人：Codex 5.6  
> 计划代号：`R2D-2`  
> 上游：R2D-0 `PASS/CLOSED`、R2D-1 `PASS/CLOSED`、PRD v1.6 Final Revision 15、Core Prompt / Context Feature Spec Revision 2、Model Experience Revision 4  
> 本方案最高输出：`R2D_AGENT_RESOURCE_RESTRICTION_CONFORMANT`  
> 当前结论：**R2D-2 独立 QA 已由用户正式接受并关闭；R2D-3 进入 docs-only 方案评审，R2D-4 继续 GATED**

## 0. 结论摘要

R2D-2 只建立一件基础能力：用一个新的、严格版本化的 Agent Definition 表达 Model、Skill、Tool、Knowledge
四类资源的“未增加 Agent 限制”与“只允许 exact allowlist”两种事实，并为现有 v1alpha1 Agent 提供不改写历史
记录的兼容解释。

本批不会计算当前用户真正可用的资源，不会创建 Task、锁、Runtime Selection，不会装配 code-owned
`agent.general`，也不会开放 Desktop/Admin 创建或编辑入口。四类限制只是 Agent 的不可变约束事实，实际可用范围仍须
在 R2D-3 中与可信 entitlement、Registry、Workspace、Task authorization 和资源状态求交集。

```text
Agent v1alpha2 restriction
  ∩ current subject legal-resource snapshot       // R2D-3
  ∩ registry / workspace / task authorization     // R2D-3
  ∩ explicit accepted selection                   // R2D-3
  -> exact Task locks / Runtime Selection v1alpha3 // R2D-3
```

本批实施后最高只能输出：

```text
R2D_AGENT_RESOURCE_RESTRICTION_CONFORMANT
```

并且必须同时声明：

```text
productionCpcActivationEnabled=false
productionEnterpriseEntitlementReady=false
agentLifecycleReady=false
runtimeSelectionV1Alpha3Ready=false
desktopV2ConsumptionReady=false
adminV2ConsumptionReady=false
knowledgeProviderReady=false
```

不得输出 `R2D_CORE_DELTA_CONFORMANT`、`PRODUCTION_READY` 或任何 production identity / entitlement ready 结论。

## 1. 目标、非目标与业务语义

### 1.1 目标

1. 新增 additive、Core-private 的 `AgentDefinitionRevisionV1Alpha2` Contract；
2. 为 Model、Skill、Tool、Knowledge 冻结四个 strict discriminated union；
3. 精确区分 `unrestricted`、非空 allowlist 和空 allowlist；
4. 冻结 portable exact reference，禁止把本机 materialization handle 写入 Agent revision；
5. 冻结 v1alpha2 canonical material、独立 digest domain、revision/digest 校验；
6. 提供单一、纯函数、无副作用的 v1alpha1 compatibility interpreter；
7. 保持 v1alpha1 schema、root export、digest corpus 和现有运行行为零漂移；
8. 为 R2D-3 的 entitlement intersection、Runtime Selection v1alpha3 和 built-in `agent.general` 提供稳定输入。

### 1.2 产品语义

| Contract 事实 | 业务含义 | 不代表 |
| --- | --- | --- |
| `{ mode: "unrestricted" }` | Agent 不再额外缩小该类资源 | 所有资源都能用、绕过权限、默认全选 |
| `{ mode: "allowlist", references: [...] }` | Agent 最多允许这些 exact 资源 | 这些资源当前可用、已授权或已安装 |
| Model `allowlist([])` | Agent 没有合法模型候选 | 可测试、可发布、可创建 Task |
| Skill `allowlist([])` | 明确禁止 Skill | Skill Runtime ready |
| Tool `allowlist([])` | 明确禁止 Tool | Tool 权限被改变或 Tool 被删除 |
| Knowledge `allowlist([])` | 明确禁止 Knowledge | Knowledge Provider ready |

### 1.3 非目标

- 不实现 Agent 草稿、保存、测试、发布、审核、删除或 owner lifecycle；
- 不实现 Desktop/Admin v2 DTO、页面、Adapter、IPC 或 HTTP API；
- 不实现用户/企业 entitlement source 或 stable ordinal；
- 不实现 Agent restriction 与 entitlement 的交集；
- 不实现 Model fallback、Skill/Knowledge accepted selection 或 Tool candidate policy；
- 不实现 TaskRuntimeSelection v1alpha3、coordination v1alpha4 或 Task bundle 变更；
- 不实现 production `BuiltInGeneralAgentSource` 或修正现有 scripted fixture；
- 不实现 Knowledge Provider、Memory、Effect Reconciliation、TGM 或 DFI-5.3；
- 不启用 production CPC、production enterprise entitlement 或任何新 route；
- 不新增 migration 27、依赖、数据库表或列。

### 1.4 草稿编辑态与 immutable revision 的边界

产品允许编辑器在关闭限制开关时保留尚未生效的选择，重新开启后恢复。这是未来 Agent draft/editor 的可变 UI 状态，
不是 runtime Agent revision 的事实。

R2D-2 的 immutable v1alpha2 只保存实际生效的 restriction：

- 开关关闭发布为 `unrestricted`，不携带隐藏的 inactive selections；
- 开关开启发布为 `allowlist`，携带 exact references；
- inactive draft selections 不进入 revision/digest，不得被 Core runtime 恢复或解释为权限；
- 将来 Admin/Desktop draft Contract 必须另行设计，不能复用本批 runtime DTO。

## 2. 既有事实与必须关闭的缺口

### 2.1 当前代码事实

1. root `AgentDefinitionRevisionSchema` 位于 `packages/contracts/src/runtime-selection/runtime-selection.ts`；
2. 其 `schemaVersion` 固定为 `v1alpha1`；
3. v1alpha1 使用 `defaultModelId + allowModelOverride`；
4. v1alpha1 的 Skill/Knowledge 使用带本机 `materializedRef` 的 `MaterializedResourceRevision`；
5. v1alpha1 的 Tool 使用 `CapabilityRevisionRef`；
6. `revision === digest`，Core 通过 canonical JSON 重算 material digest；
7. Contracts root `index.ts` 通过 runtime-selection root export 暴露 v1alpha1；
8. 现有 private `runtime-selection/v1alpha2` 只给 TaskRuntimeSelection 增加 ReasoningModeLock，与 Agent
   Definition v1alpha2 不是同一个版本 family；
9. `TrustedAgentRepository`、RuntimeSelection、Catalog、CPC compiler 等 production consumer 当前全部依赖
   v1alpha1；
10. migration 当前止于 26，Contracts 版本为 `0.0.0-dfi.5.2.3`。

### 2.2 缺口

| 编号 | 缺口 | R2D-2 关闭方式 |
| --- | --- | --- |
| G1 | 空数组无法区分 unrestricted 与明确禁止 | strict discriminated union |
| G2 | `allowModelOverride` 无法表达新产品语义 | v2 移除该字段，改为 model restriction |
| G3 | Agent 携带 default model，混入用户偏好 | v2 移除 `defaultModelId` |
| G4 | Skill/Knowledge ref 带本机 handle | portable exact ref 不含 `materializedRef` |
| G5 | v1 历史仍需可解释 | 单一 compatibility interpreter，不重写 v1 |
| G6 | public root 不能静默接受新版本 | v2 只从 exact private subpath 导出 |
| G7 | built-in 与 managed Agent 需可区分 | v2 加 `managementClass`，authority 执行留 R2D-3 |
| G8 | v2 digest 必须与历史 domain 隔离 | 新 domain-separated canonical digest |
| G9 | allowlist 顺序可能被误当选择优先级 | 顺序只做 immutable authored order，不是 fallback priority |
| G10 | draft inactive selections 可能污染 runtime | 明确排除出 immutable v2 material |

## 3. 版本与目录冻结

### 3.1 新 family 落点

新增精确目录：

```text
packages/contracts/src/runtime-selection/agent-definition/v1alpha2/
  index.ts
```

新增精确 package export：

```text
@robothree/contracts/runtime-selection/agent-definition/v1alpha2
```

不把 v2 export 加入：

- `packages/contracts/src/index.ts`；
- `packages/contracts/src/runtime-selection/index.ts`；
- `@robothree/contracts` root；
- 既有 `@robothree/contracts/runtime-selection/v1alpha2`。

后者是 TaskRuntimeSelection v1alpha2，不能被改成同时承载 Agent Definition v1alpha2 的杂合入口。

### 3.2 版本常量

```text
AGENT_DEFINITION_SCHEMA_VERSION_V1ALPHA2 = "v1alpha2"
```

Agent Definition family 的 `v1alpha2` 与 TaskRuntimeSelection family 的 `v1alpha2` 分属不同 schema family；
任何日志、测试或文件名必须带 family，不能只写“v1alpha2”。

### 3.3 root compatibility

- `AgentDefinitionRevisionSchema` 继续只接受 v1alpha1；
- `AgentDefinitionRevision` 类型继续只表示 v1alpha1；
- 不把 root schema 改成 union；
- 不用 optional 新字段让 v1 schema 暗中兼容 v2；
- 不修改 v1 文件字节、fixture、digest 公式或错误语义；
- v2 consumer 必须显式 import private subpath。

## 4. Agent Definition v1alpha2 Contract

### 4.1 顶层 material

```text
AgentDefinitionRevisionV1Alpha2Material
  schemaVersion = "v1alpha2"
  agentDefinitionId
  managementClass = "system_builtin" | "managed"
  name
  identity
  goal
  instructions
  modelRestriction
  skillRestriction
  toolRestriction
  knowledgeRestriction
  requiredModelCapabilities
  createdAt
```

最终 record：

```text
AgentDefinitionRevisionV1Alpha2
  ...material
  revision
  digest
```

强制约束：

1. 顶层和全部 nested object 均 `.strict()`；
2. `agentDefinitionId/name/identity/goal/instructions/requiredModelCapabilities/createdAt` 复用既有经过验证的
   v1 字段 schema，不重定义另一套长度或时间格式；
3. `revision === digest`；
4. `revision/digest` 必须等于 v2 material 的 domain-separated canonical digest；
5. v2 不含 `defaultModelId`、`allowModelOverride`、`materializedRef`、owner、entitlement、Endpoint、Credential、
   Workspace path、Provider mapping 或 runtime handle；
6. `managementClass` 只是 immutable classification；“谁能创建 system_builtin”由 R2D-3 的 source authority
   执行，schema 本身不冒充授权器。

### 4.2 四个显式 restriction schema

不实现可被任意调用者传入任意 schema 的动态 generic builder。Contract 对四类资源分别导出命名 schema：

```text
AgentModelRestrictionV1Alpha2
AgentSkillRestrictionV1Alpha2
AgentToolRestrictionV1Alpha2
AgentKnowledgeRestrictionV1Alpha2
```

每个都是：

```text
{ mode: "unrestricted" }
| { mode: "allowlist", references: ExactRef[] }
```

`unrestricted` variant 不允许 `references`；`allowlist` variant 必须带 `references`，允许空数组。禁止：

- `{ mode: "unrestricted", references: [] }`；
- `{ mode: "allowlist" }`；
- `null`、`undefined`、空字符串；
- `restricted: true/false`、`enabled: true/false`；
- 用 missing field 表示 unrestricted；
- 额外 metadata、inactive selections 或 UI 展开状态。

### 4.3 portable exact references

#### Model

```text
AgentModelRestrictionRefV1Alpha2
  modelId                  // CapabilityId，必须是 model.*
  revision                 // sha256
  digest                   // sha256
```

- `revision === digest`；
- 同一 allowlist 内 `modelId` 唯一；
- 最大 64 项。

#### Skill

```text
AgentSkillRestrictionRefV1Alpha2
  skillId                  // DesktopResourceId
  revision                 // sha256 immutable revision
  contentDigest            // sha256 content identity
```

- 同一 allowlist 内 `skillId` 唯一；
- 最大 64 项；
- 不含本机安装路径、materialized handle 或 package 解压目录。

#### Tool

```text
AgentToolRestrictionRefV1Alpha2
  capabilityId             // CapabilityId，必须是 tool.*
  capabilityRevision       // sha256
```

- 同一 allowlist 内 `capabilityId` 唯一；
- 最大 128 项；
- 不含 Binding、Adapter、Endpoint、Credential 或 input schema 正文。

#### Knowledge

```text
AgentKnowledgeRestrictionRefV1Alpha2
  knowledgeId              // DesktopResourceId
  revision                 // sha256 immutable revision
  contentDigest            // sha256 content identity
```

- 同一 allowlist 内 `knowledgeId` 唯一；
- 最大 64 项；
- 不含本机索引路径、原文、chunk、embedding 或 Provider handle。

Skill/Knowledge 的 ID family 不靠字符串前缀猜 authority；R2D-3 必须用可信 catalog kind 验证。Model/Tool 复用
现有 `CapabilityId` 的 kind 约束。

### 4.4 顺序语义

- Contract 保留 references 的 authored/backend stable order；
- 该顺序进入 material digest，roundtrip 不得重排；
- schema 不自动 sort，也不以对象 key、locale 或显示名称重排；
- Model fallback 优先级不来自该数组，R2D-3 只使用 entitlement snapshot 的 stable ordinal；
- Skill/Tool/Knowledge 顺序不授予优先级或额外权限；
- 同一 ID 的不同 revision 仍视为 duplicate ID，不能在同一 allowlist 并存后让 consumer 猜一个。

### 4.5 canonical digest

新独立 domain：

```text
robothree.agent-definition-revision.v1alpha2\n
```

计算材料：

```text
sha256CanonicalJson({
  domain: "robothree.agent-definition-revision.v1alpha2\n",
  material: AgentDefinitionRevisionV1Alpha2Material
})
```

规则：

1. material 先经 strict schema parse；
2. canonical JSON 使用既有 `JsonValueSchema` / `sha256CanonicalJson`；
3. digest 覆盖四类 mode、references exact fields 与数组顺序；
4. 不包含 `revision/digest` 自身；
5. 创建 helper 与验证 helper 必须使用同一个 material schema 和同一个 digest helper；
6. load-time 必须重算，不因内存来源或 fixture 跳过；
7. v1 digest helper 保持原样，不套用新 domain。

### 4.6 public API surface

private subpath 允许导出：

- 四类 exact ref schema/type；
- 四类 restriction schema/type；
- `AgentDefinitionRevisionV1Alpha2MaterialSchema`；
- `AgentDefinitionRevisionV1Alpha2Schema`；
- 对应静态类型与版本常量。

创建/验证 digest helper 放在 Core application，不从 public Contracts 导出业务 authority。

## 5. v1alpha1 Compatibility Interpreter

### 5.1 单一 interpreter

新增 Core application 纯函数：

```text
ReadableAgentDefinitionInterpreter.interpret(input)
  -> InterpretedAgentDefinitionRestrictions
```

输入只能是：

- 已通过 v1alpha1 strict parse + digest revalidation 的 exact Agent record；或
- 已通过 v1alpha2 strict parse + domain digest revalidation 的 exact Agent record。

禁止“先试 v2、失败后 fallback v1”。dispatch 固定为：

```text
read schemaVersion once
  v1alpha1 -> v1 validator
  v1alpha2 -> v2 validator
  other/missing unexpected -> typed fail
```

其中 v1alpha1 historical record 的 version 是既有必填字段，不为其补 discriminator 或 backfill。

### 5.2 v1 映射表

| v1alpha1 事实 | 兼容解释 |
| --- | --- |
| `allowModelOverride=true` | Model `{ mode:"unrestricted" }` |
| `allowModelOverride=false + defaultModelId` | Model 单项 allowlist，exact model revision 由可信 Model repository 在 R2D-3 决策时证明 |
| `skillReferences[]` | Skill allowlist，保留 ID/revision/contentDigest 与原顺序，丢弃 runtime-only `materializedRef` |
| `toolReferences[]` | Tool allowlist，保留 capabilityId/revision 与原顺序 |
| `knowledgeReferences[]` | Knowledge allowlist，保留 ID/revision/contentDigest 与原顺序，丢弃 runtime-only `materializedRef` |
| v1 无 managementClass | 解释为 `managed`；不猜 system_builtin |

v1 的 `defaultModelId` 只有 ID，没有 exact Model revision/digest。因此 R2D-2 interpreter 不伪造 hash：

- 输出 `legacyModelConstraint = { mode:"single_model_id", modelId }`；
- 不生成符合 v2 `AgentModelRestrictionRef` 的假对象；
- exact Model ref 的加载、验证与 selection 只在 R2D-3 发生；
- 无法加载 exact Model material 时 R2D-3 fail-closed，不能按 ID 猜当前版本。

这条差异是 v1 compatibility 的真实边界，不能为了让返回类型整齐而造 digest。

### 5.3 interpreter 输出

Core-private output 必须区分 source：

```text
InterpretedAgentDefinitionRestrictions
  sourceSchemaVersion = "v1alpha1" | "v1alpha2"
  exactAgentRef
  managementClass
  modelRestriction       // legacy single-ID variant or exact v2 restriction
  skillRestriction
  toolRestriction
  knowledgeRestriction
```

它不是新的 Agent revision，不带新 `revision/digest`，不写库，不进入 Receipt，不对外投影。

### 5.4 兼容硬边界

1. 不重写、backfill 或 republish v1 Agent；
2. 不改变历史 v1 Task recovery；历史 Task 继续读 durable Runtime Selection；
3. 不让 Renderer/Admin 获得 interpreter；
4. 不从 `agentDefinitionId`、name、Prompt、owner 或当前 registry 猜 schema version；
5. v2 损坏不得 fallback 为 v1；
6. current v1 Agent 更新不得替换 exact input revision；
7. interpreter 不读 entitlement、不调 Provider、不创建锁、不写库；
8. R2D-2 production consumer 数必须为 0，真正接入由 R2D-3 单独授权。

## 6. 错误、安全与敏感信息边界

### 6.1 typed internal errors

本批 Core helper 使用 sealed internal codes：

- `selection.agent_definition_version_unsupported`；
- `selection.agent_definition_invalid`；
- `selection.agent_definition_digest_mismatch`；
- `selection.agent_restriction_invalid`；
- `selection.agent_restriction_duplicate`；
- `selection.agent_restriction_reference_invalid`；
- `selection.legacy_agent_model_revision_unresolved`（只冻结，R2D-3 才可能实际返回）。

R2D-2 不新增 Desktop/Admin public error mapping。测试和实施报告只记录 code 与固定安全摘要，不输出完整 allowlist、
digest material、Prompt 正文或 Zod path dump。

### 6.2 敏感/内部字段禁止

Agent v2、interpreter output、fixture evidence 与日志不得包含：

- API Key、Token、Credential Reference 或 Secret-derived material；
- owner subject、enterprise entitlement 明细；
- Endpoint、Header、Provider raw reasoning mapping；
- Workspace absolute path、materializedRef、安装路径；
- Tool Binding、Adapter descriptor、完整 input schema；
- Knowledge 原文、chunk、embedding；
- inactive draft selections；
- Runtime PID、port、handle 或 transport nonce。

### 6.3 失败关闭

- unknown schema version：拒绝；
- strict parse 失败：拒绝；
- digest 不一致：拒绝；
- duplicate ID：拒绝；
- wrong capability kind：拒绝；
- v1 default model 无 exact revision：保留 legacy unresolved 事实，不伪造；
- production consumer 意外安装：architecture gate 失败；
- 任何失败不得 fallback `unrestricted` 或 current/latest Agent。

## 7. 文件所有权

### 7.1 编码批允许修改

- `packages/contracts/src/runtime-selection/agent-definition/v1alpha2/**`；
- `packages/contracts/package.json` 的一个 exact subpath export；
- `services/core/src/application/*agent-definition*` 或等价单一 interpreter/canonical helper；
- `packages/contracts/tests/*r2d2*`；
- `services/core/tests/*r2d2*`；
- `scripts/run-r2d2-harness.mjs`；
- root package 仅 additive `harness:r2d2` script；
- R2D-2 evidence、实施报告和治理文档；
- 版本文件仅在正式编码批按工程规则更新。

### 7.2 明确禁止修改

- `packages/contracts/src/runtime-selection/runtime-selection.ts`；
- `packages/contracts/src/runtime-selection/v1alpha2.ts`；
- `packages/contracts/src/runtime-selection/index.ts` 与 root `src/index.ts`；
- `TrustedAgentRepository`、RuntimeSelection、SubmitTurn Coordinator、Catalog、CPC production consumer；
- TaskRuntimeSelection v1alpha3、coordination v1alpha4；
- Desktop Renderer/Main/Preload/IPC 与 Admin Console；
- Central production service；
- Agent draft/test/publish/Admin CRUD；
- code-owned `agent.general` production source；
- DFI-5.3 Provider mapping；
- Knowledge Provider、Memory、Effect Reconciliation、TGM；
- migration 1～26、migration 27；
- dependencies 与 `pnpm-lock.yaml`；
- production CPC activation、enterprise entitlement activation。

若实现发现必须修改任一禁止项，立即停止，回到文档差异评审，不得扩大批次。

## 8. 实施步骤与工期

### Step 1：Contract 与 exact export（1～1.5 日）

- 新建 private v1alpha2 family；
- 四类 exact ref 与 restriction union；
- Agent material/record strict schema；
- package exact export；
- positive/negative Contract corpus。

### Step 2：canonical digest 与 interpreter（1～1.5 日）

- v2 domain-separated create/validate helper；
- single-dispatch interpreter；
- legacy single-model-ID 诚实 variant；
- v1/v2 conformance corpus；
- production consumer count=0 architecture proof。

### Step 3：zero-drift、Harness 与治理（1～2 日）

- v1 file/export/digest frozen corpus；
- private subpath consumer scan；
- sensitive/static boundary scan；
- focused `harness:r2d2`、完整门禁；
- evidence、实施报告与治理回链。

合计：**3～5 个集中工程日**。本批评审时曾将 R2D 总工期由 12～20 日细化为 12～21 日；R2D-3 后续详细
方案 Revision 1 改为复用既有 durable coordination 后，最新 R2D 总估算已修正为 **13～22 日**。本批仍只
包含 Contract + interpreter + zero-drift，不包含 R2D-3 的生产接入。

## 9. Conformance 与场景矩阵

### 9.1 Contract 场景 A1～A10

| 场景 | 输入 | 结果 |
| --- | --- | --- |
| A1 | 四类 unrestricted | strict parse 成功 |
| A2 | 四类 non-empty allowlist | exact roundtrip |
| A3 | 四类 empty allowlist | 保留 empty，绝不改 unrestricted |
| A4 | unrestricted 携带 references | strict reject |
| A5 | allowlist 缺 references | strict reject |
| A6 | duplicate ID / wrong kind | reject |
| A7 | Model revision != digest | reject |
| A8 | portable ref 携带 materializedRef | reject |
| A9 | unknown top-level field | reject |
| A10 | v2 携带 defaultModelId/allowModelOverride | reject |

### 9.2 Digest 场景 D1～D8

1. 相同 material 十次 digest 唯一；
2. 任一 mode 变化必须改变 digest；
3. 任一 exact ref field 变化必须改变 digest；
4. references 顺序变化必须改变 digest；
5. createdAt/required capabilities 变化必须改变 digest；
6. record digest tamper load-time fail；
7. v1 material 不使用 v2 domain；
8. InMemory/Test fixture 与 production helper 使用同一 validator。

### 9.3 Compatibility 场景 C1～C10

1. v1 override=true -> unrestricted；
2. v1 override=false -> legacy single model ID，不造 revision；
3. v1 Skill empty -> allowlist(empty)；
4. v1 Tool empty -> allowlist(empty)；
5. v1 Knowledge empty -> allowlist(empty)；
6. v1 materializedRef 被移除，不进入 portable output；
7. v1 source interpreted managementClass=managed；
8. v2 exact input 原样解释；
9. unknown version typed reject；
10. 损坏 v2 不 fallback v1。

### 9.4 Boundary 场景 B1～B8

1. root export 继续只指 v1；
2. existing TaskRuntimeSelection v1alpha2 subpath 零漂移；
3. Renderer/Preload/Admin private v2 import count=0；
4. production consumer count=0；
5. migration 最大 id=26；
6. lockfile digest 不变；
7. production CPC activation=false；
8. production enterprise entitlement=false。

## 10. QA 矩阵（84 项连续）

### 10.1 Schema 与版本（QA-001～QA-014）

1. QA-001：Agent v2 顶层 strict；
2. QA-002：schemaVersion 只接受 v1alpha2；
3. QA-003：managementClass 只接受 system_builtin/managed；
4. QA-004：四类 restriction 均为 discriminated union；
5. QA-005：unrestricted 禁止 references；
6. QA-006：allowlist 必须携带 references；
7. QA-007：allowlist empty 合法；
8. QA-008：null/missing/boolean 不能代替 mode；
9. QA-009：v2 拒绝 defaultModelId；
10. QA-010：v2 拒绝 allowModelOverride；
11. QA-011：v2 拒绝 owner/entitlement；
12. QA-012：v2 拒绝 Endpoint/Credential；
13. QA-013：v2 拒绝 runtime/materialized handle；
14. QA-014：root Agent schema 仍只接受 v1alpha1。

### 10.2 Exact refs 与限制语义（QA-015～QA-030）

15. QA-015：Model ref 必须 model kind；
16. QA-016：Model revision 必须等于 digest；
17. QA-017：Model ID duplicate 拒绝；
18. QA-018：Model 最大 64；
19. QA-019：Skill exact 三字段 roundtrip；
20. QA-020：Skill ID duplicate 拒绝；
21. QA-021：Skill 最大 64；
22. QA-022：Skill materializedRef 拒绝；
23. QA-023：Tool ref 必须 tool kind；
24. QA-024：Tool ID duplicate 拒绝；
25. QA-025：Tool 最大 128；
26. QA-026：Tool Binding/Adapter 字段拒绝；
27. QA-027：Knowledge exact 三字段 roundtrip；
28. QA-028：Knowledge ID duplicate 拒绝；
29. QA-029：Knowledge 最大 64；
30. QA-030：Knowledge materializedRef/原文字段拒绝。

### 10.3 Canonical material 与 digest（QA-031～QA-048）

31. QA-031：v2 material 同输入 digest 确定；
32. QA-032：v2 独立 domain 生效；
33. QA-033：revision==digest；
34. QA-034：load-time 重算；
35. QA-035：mode 漂移检出；
36. QA-036：reference ID 漂移检出；
37. QA-037：reference revision 漂移检出；
38. QA-038：contentDigest 漂移检出；
39. QA-039：array order 漂移检出；
40. QA-040：required capability 漂移检出；
41. QA-041：createdAt 漂移检出；
42. QA-042：digest 字段不进入自身 material；
43. QA-043：create/validate 共用 helper；
44. QA-044：fixture 不跳过 validator；
45. QA-045：v1 helper 未套 v2 domain；
46. QA-046：v1 frozen corpus digest 零漂移；
47. QA-047：v1 source file digest 零漂移；
48. QA-048：既有 TaskRuntimeSelection v1/v2 corpus 零漂移。

### 10.4 Compatibility interpreter（QA-049～QA-064）

49. QA-049：v1 override=true 解释 unrestricted；
50. QA-050：v1 override=false 保留 legacy single model ID；
51. QA-051：legacy interpreter 不造 Model revision/digest；
52. QA-052：v1 Skill non-empty 保序；
53. QA-053：v1 Skill empty 保持 empty allowlist；
54. QA-054：v1 Tool non-empty 保序；
55. QA-055：v1 Tool empty 保持 empty allowlist；
56. QA-056：v1 Knowledge non-empty 保序；
57. QA-057：v1 Knowledge empty 保持 empty allowlist；
58. QA-058：v1 materializedRef 不进入 interpreted portable restriction；
59. QA-059：v1 managementClass 只解释为 managed；
60. QA-060：v2 exact input 先做 digest revalidation；
61. QA-061：schemaVersion 单次 dispatch；
62. QA-062：unknown version typed reject；
63. QA-063：损坏 v2 不 fallback v1；
64. QA-064：interpreter 不写库、不读 entitlement、不创建 lock。

### 10.5 Architecture 与安全边界（QA-065～QA-076）

65. QA-065：package 仅新增 exact private export；
66. QA-066：Contracts root export 零漂移；
67. QA-067：runtime-selection root index 零漂移；
68. QA-068：TaskRuntimeSelection v1alpha2 private export 零漂移；
69. QA-069：Desktop Renderer import count=0；
70. QA-070：Main/Preload/IPC import count=0；
71. QA-071：Admin import count=0；
72. QA-072：Central production import count=0；
73. QA-073：R2D-2 production consumer count=0；
74. QA-074：fixture/Fake 不宣称 production ready；
75. QA-075：日志/evidence 无完整 allowlist/Secret/path；
76. QA-076：inactive draft selections 不进入 runtime material。

### 10.6 门禁与诚实输出（QA-077～QA-084）

77. QA-077：focused Contract tests 全绿；
78. QA-078：focused interpreter tests 全绿；
79. QA-079：`harness:r2d2` 输出唯一 conformance marker；
80. QA-080：完整 root check 全绿；
81. QA-081：Central online/offline 全绿；
82. QA-082：frozen offline install + audit 全绿；
83. QA-083：lockfile 不变、migration 止 26；
84. QA-084：七项 downstream false 且不输出 production ready。

测试禁止 `.skip`、`.only`、`@Disabled`、sleep、自动 retry 覆盖失败、恒真 source scan、硬编码 consumer count
或 Fake 宣称 production。

## 11. 编码后门禁

```text
CI=true pnpm run harness:r2d2
CI=true pnpm run lint
env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline
```

专项 Harness 必须至少包含：

- Contract strict conformance；
- v2 digest create/revalidate；
- v1 compatibility interpreter；
- v1/root/private-export zero drift；
- production consumer graph 真实扫描；
- forbidden consumer/import scan；
- sensitive/static scan；
- downstream false evidence。

Central 即使本批不修改 Java 也不能省略；CGF-2B3.2 timing 偶发若再次出现，必须独立归因并单测复跑，不能把自动
retry 写入 R2D-2 门禁掩盖。

## 12. 交付物

编码批预期交付：

1. Agent Definition v1alpha2 private Contract；
2. 四类 strict restriction 与 portable exact refs；
3. v2 canonical create/validate helper；
4. v1alpha1 compatibility interpreter；
5. v1/root export/digest zero-drift corpus；
6. `harness:r2d2` 与 evidence；
7. 实施报告、版本与治理回链。

不交付 production route、Runtime Selection v1alpha3、entitlement、Agent lifecycle、Desktop/Admin 页面或
`agent.general` production source。

## 13. 停手条件

发现以下任一情况必须停止编码并回到文档评审：

1. 需要修改 root `AgentDefinitionRevisionSchema` 为 union；
2. 需要修改既有 v1alpha1 schema、digest 或 fixture；
3. 需要修改现有 TaskRuntimeSelection v1alpha2；
4. 需要在 v2 portable ref 中加入 `materializedRef` 或本机路径；
5. 需要给 v1 default model 伪造 revision/digest；
6. 需要用 allowlist 顺序作为 Model fallback authority；
7. 需要在 R2D-2 接入 production consumer/route；
8. 需要修改 TrustedAgentRepository 或 RuntimeSelection production flow；
9. 需要实现 entitlement、intersection、locks 或 Task durable create；
10. 需要实现 built-in `agent.general` source；
11. 需要修改 Desktop/Admin/Main/Preload/IPC/Central production；
12. 需要新增 migration 27、依赖或修改 lockfile；
13. 需要启用 production CPC/enterprise entitlement；
14. 无法用 single schemaVersion dispatch 区分 v1/v2；
15. root check 因并发窗口漂移且无法安全归因；
16. 需要使用真实 Secret、公网 Provider 或真实企业账号完成测试。

## 14. 文档评审问题

请独立评审重点回答：

1. private subpath 是否避免了 root v1 静默 widening？
2. 四类 `unrestricted | allowlist` 是否精确表达空列表语义？
3. draft inactive selections 是否被正确排除出 runtime revision？
4. Model/Skill/Tool/Knowledge exact ref 是否足够 portable 且无本机 handle？
5. v2 digest domain 与 v1 是否完全分离？
6. allowlist order 是否被明确禁止作为 Model fallback authority？
7. v1 default model 缺 exact revision 时的 legacy variant 是否诚实，未伪造 v2？
8. compatibility interpreter 是否保持单次 dispatch、零副作用、零 backfill？
9. `managementClass` 是否只冻结分类而未提前冒充 source authority？
10. production consumer count=0 是否能证明本批未抢跑 R2D-3？
11. 文件边界、84 项 QA 和 3～5 日估算是否合理？
12. 七项 downstream false 是否足以防止把 Contract conformance 误解为 production ready？

## 15. 当前状态

- R2D-0：`PASS/CLOSED`；
- R2D-1：`PASS/CLOSED`；
- R2D-2：`PASS/CLOSED`；
- R2D-3～R2D-4：`GATED`；
- DFI-5.3 子批、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、Effect Reconciliation、Agent Lifecycle、
  Desktop/Admin v2 consumption：`GATED`；
- production CPC activation：`false`；
- production enterprise entitlement：`false`。

R2D-2 已通过独立 QA 并由用户正式接受为 `PASS/CLOSED`。下一步只允许 R2D-3 详细方案评审；在独立文档复核
和用户明确授权前不得进入 R2D-3 编码。
