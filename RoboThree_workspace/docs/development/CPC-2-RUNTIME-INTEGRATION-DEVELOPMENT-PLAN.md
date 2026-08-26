# CPC-2 Runtime Integration 详细实施方案

> 状态：**INDEPENDENT DOCUMENT REVIEW PASS / USER ACCEPTANCE PENDING / CODING GATED**  
> 日期：2026-08-26  
> 负责人：Codex 5.6  
> 上游：CPC-0 Revision 1.1 `PASS/CLOSED`；CPC-1 `PASS/CLOSED`  
> 本批最高输出：`CPC2_RUNTIME_INTEGRATION_CONFORMANT`  
> 当前约束：独立文档复核已通过；仍待用户正式接受，且未获单独编码授权

> 独立文档复核：**PASS（P0=0、P1=0、P2=0、P3=2，均非阻断）**。两个 P3 的 docs-only 收口已在
> §4.1、§6.2、Step 1 与 QA-022 写死；原复核计数保持如实记录，不因文档修订静默改为全 0。

## 1. 目标与完成边界

CPC-2 把 CPC-1 已冻结的 `TaskInstructionBindingV1`、四层 Instruction Source、单一 canonical
`ModelInstructionMessage` 和预算预检，接入既有 Runtime：

```text
exact executable SubmitTurn Task bundle
  -> one typed Task instruction runtime decision
  -> one TaskInstructionBundleMaterializer call
  -> one compiled ModelInstructionMessage(role=system)
  -> existing Context Pipeline / Reducer / Receipt
  -> existing reasoning-aware ModelRequest finalizer
  -> existing Agent Loop / Provider / durable deadline
```

本批完成后只允许声明：

```text
CPC2_RUNTIME_INTEGRATION_CONFORMANT
```

该结论证明 Runtime 接线、预算、Receipt、Provider-neutral 消息和恢复边界成立；不等于 CPC 全阶段关闭，也不等于
Skill Runtime、Knowledge、Memory、Effect Reconciliation 或任何 Desktop/Admin 功能 ready。CPC 最终
`CPC_CORE_PROMPT_MVP_CONFORMANT` 仍由 CPC-3 Lifecycle / Eval Closure 判定。

## 2. 当前代码事实与本批缺口

### 2.1 已有事实

1. `TaskInstructionBundleMaterializer` 已能从 exact readable Runtime Selection、
   `TaskSubmitTurnBinding.bundleDigest` 和 exact `AgentDefinitionRevision` 编译一条 System Message；
2. System Message identity 已冻结为：
   - `sourceId = "core.instruction-bundle.v1"`；
   - `sourceRevision = assemblyRevision`；
   - `sourceDigest = instructionBundleDigest`；
3. `ContextPipeline` 已具备 Assembler、Reducer、Budget Policy、ModelMessageConverter 与 Receipt；
4. `ReasoningAwareContextRequestFinalizer` 已保证 final Receipt 的 `modelRequestDigest` 等于最终 v1alpha2
   ModelRequest digest；
5. `DurableAgentLoopStarter` 的首轮、Tool 后续轮和 Context Compaction 后续请求都经过同一 `buildRequest` closure；
6. terminal assistant replay 已在 Provider resolve 前短路；
7. Compaction Summarizer 有独立 immutable hard prompt，不需要也不应继承 Task 的 Platform/Agent/Skill 指令；
8. Local Personal Provider 的 durable timeout fact、retry/restart exact deadline 已由 DFI-4A.3.1 repair.2 验收；
9. DFI-5.2 的 reasoning lock、ModelRequest v1alpha2 与 Compaction Binding v1alpha2 已验收。

### 2.2 真实缺口

1. `DurableAgentLoopStarter` 仍在运行时用字符串临时拼接 `identity + goal + instructions`；
2. Context Pipeline 只能接收旧 `MaterializedInstructionSource`，其 content digest 公式与 CPC bundle digest 不同，
   不能把 compiled message 强行伪装成旧 instruction；
3. Context Receipt 尚未记录 CPC binding、assembly、bundle 与 ordered source evidence；
4. Model provenance 目前只能通过 `system_instruction` / `selected_skill` 分散分类，尚不能从单条 bundle 识别
   `platform_agent_instructions` 与可选 `skill_content`；
5. Provider resolve 当前早于正式 CPC materialization，不满足“指令不完整时 Credential/DNS/socket 等为 0”；
6. production Runtime Selection 仍使用历史 legacy prompt revision；CPC feature 默认 disabled；
7. CPC-1 QA P3-1：materializer 首层 generic parse 会先于 typed wrapper 抛错，且存在一次冗余解析；
8. production Skill resolver 仍为 0，这是已知阶段边界，不在 CPC-2 伪造修复。

## 3. CPC-1 两个 P3 的处理

### 3.1 P3-1 强制收口：单次 typed parse

新增或收敛一个 Core-private typed parse boundary。Runtime materialization 路径只能执行一次
`parseReadableTaskRuntimeSelection`，其失败统一映射为：

```text
context.instruction_binding_invalid
```

实现约束：

1. `TaskInstructionBundleMaterializer.materialize()` 不得在 typed wrapper 之外先执行通用 parse；
2. `deriveTaskInstructionBindingV1`、Task Boundary 与后续 materializer 共享同一个已验证 selection；
3. 不允许“第一遍 generic parse、第二遍 typed parse”的双解析；
4. Zod message、stack、raw selection JSON 不进入 Task error、日志或 Receipt；
5. focused test 必须证明 malformed v1alpha1/v1alpha2 selection 都只返回 typed safe code，且 Provider resolve count=0。

### 3.2 P3-2 保持已知边界

本批不实现 production `LockedSkillInstructionResolver`：

- 无 Skill Task：可完成 CPC Runtime Integration；
- 带 Skill Task：`context.skill_material_unavailable`，不跳过 Skill、不回退到只有 Platform/Agent 的伪成功；
- test-only resolver 仅用于 conformance，production dependency graph count 必须为 0；
- 本批最高输出不得包含 `SKILL_RUNTIME_READY`。

## 4. Runtime Mode 与 Activation Gate

### 4.1 不静默迁移历史 Task

不新增 migration 27，不回填历史 Task。Runtime mode 由 durable Runtime Selection 已有
`platformPromptRevision` 精确判定：

当前已知 legacy marker 必须收敛为单一 code-owned 常量，不再在 composition 内联 `digest("9")`：

```ts
export const LEGACY_DESKTOP_PROMPT_REVISION =
  "sha256:9999999999999999999999999999999999999999999999999999999999999999" as const;
```

该值是现有 Desktop composition 的精确 durable marker，不代表 Platform Prompt 内容摘要。CPC-2 Step 1 只允许
将既有内联字面量替换为该常量并保持字节零漂移；若发现已有 Task 使用第二个 legacy marker，必须停止回文档评审，
不得加入宽松 alias、前缀匹配或创建时间猜测。

| Durable revision | Gate | 行为 |
| --- | --- | --- |
| `LEGACY_DESKTOP_PROMPT_REVISION` | false/true | 走既有 legacy instruction 行为，历史 Task 不改写 |
| `PLATFORM_PROMPT_V1_REVISION` | true | 走 CPC bundle path |
| `PLATFORM_PROMPT_V1_REVISION` | false | typed `context.instruction_runtime_unavailable`，不得 fallback legacy |
| 未知 revision | 任意 | typed `context.platform_prompt_unavailable` |

`platformPromptRevision` 只是 durable mode marker 和 exact source revision，不由 Renderer/Main/env/CLI 自报。

### 4.2 新 Task 的 revision 来源

Composition 必须使用同一个 code-owned activation decision：

- gate=false：新 Task 继续写入 exact `LEGACY_DESKTOP_PROMPT_REVISION`；
- gate=true：新 Task 写入 `PlatformPromptSource.currentRevision()`；
- Runtime Selection 与 Agent Loop 不得各自计算一份 gate；
- 已提交 Task 后不得因进程重启或全局 gate 改变而重写其 revision。

### 4.3 三态启动语义

| 状态 | 启动与运行行为 |
| --- | --- |
| `disabled` | CPC branch 不用于新 Task；legacy 行为保持；CPC durable Task 不得被降级执行 |
| `requested_but_incomplete` | materializer、Platform source、budget policy 或 resolver wiring 缺失/重复时在 Core HTTP ready 前失败 |
| `enabled` | 新 Task 锁定 Platform Prompt v1；无 Skill 正常，带 Skill 按 P3-2 typed fail-closed |

CPC-2 的 production release decision 仍保持 `disabled`；enabled composition 只用于本批 deterministic Harness。
CPC-3 只做 Lifecycle / Eval Closure，也不得把 production default 改为 enabled；任何未来 production activation
必须另有明确评审与用户授权。

禁止：

- `getIfAvailable(Fake::new)` 或测试 resolver 填补 production graph；
- env、CLI、Renderer、Main 参数绕过 code-owned release decision；
- gate=false 时对 CPC durable Task 静默使用 legacy instruction；
- 仅看 Agent ID、Task 创建时间或 schemaVersion 猜 mode。

## 5. 单一 Runtime Resolver 与执行顺序

新增 Core-private `TaskLockedInstructionRuntimeResolver`，职责仅为：

1. 读取已经加载并 strict validated 的 executable Task bundle；
2. 按 §4 判定 `legacy` / `cpc_v1` / typed unavailable；
3. CPC path 调用 `TaskInstructionBundleMaterializer` 恰好一次；
4. 输出 immutable runtime material：

```text
LegacyInstructionRuntimeMaterial
  mode = legacy
  message identity/content derived by the existing legacy behavior

CpcInstructionRuntimeMaterialV1
  mode = cpc_v1
  binding
  descriptor
  one ModelInstructionMessage
  estimatedInputTokens
  availableInputTokens
  budgetPolicyDigest
```

它不写库、不读 current pointer、不解析 Provider、不创建 Task/Message/Receipt，也不改变 timeout。

### 5.1 非终态调用顺序

`DurableAgentLoopStarter.#start()` 顺序冻结为：

1. load exact executable SubmitTurn Task bundle；
2. 校验 start identity、Task/runtime/session/message binding；
3. load exact Agent revision 并校验 digest；
4. load Session 与当前 durable messages；
5. load exact Model lock / reasoning lock；
6. 检查 terminal assistant replay；若成立直接 replay，instruction resolver/compiler/provider count 均为 0；
7. resolve exact instruction runtime material；
8. 校验 user Message、Tool locks 与唯一 Tool name；
9. only now resolve Task-locked Model Provider；
10. 建立 Task execution/Agent Loop；
11. 每轮 Context Pipeline 使用步骤 7 的同一 immutable material；
12. reasoning-aware finalizer 更新最终 request/receipt digest；
13. admission、timeout 与 Provider dispatch 继续走既有路径。

步骤 1～8 任一 CPC 错误时，以下计数必须为 0：

```text
providerResolve
credentialResolve
dns
socket
tls
httpBody
gatewayDispatch
durableInvocationPrepare
usageProjection
assistantMessageCommit
```

Task/Run 在 SubmitTurn accepted 后已经是 durable 事实，因此本批不虚假声明“Task/Message 全零”；失败必须使用既有
Task failure path 记录 safe typed error，不新增第二套失败状态机。

## 6. Context Pipeline Additive Integration

### 6.1 不把 CPC bundle 伪装成 legacy source

新增 Core-private `LockedInstructionBundleContextV1`：

```text
snapshotId
taskInstructionBindingDigest
assemblyRevision
instructionBundleDigest
budgetPolicyDigest
estimatedInputTokens
descriptor                // content-free source evidence
message                   // exact compiled ModelInstructionMessage
```

`ContextPipelineInput` additive 增加 `lockedInstructionBundle`。规则：

1. CPC path 只能传 `lockedInstructionBundle`；
2. legacy path 继续使用现有 `instructions/selectedSkills`；
3. 同一次 pipeline input 同时出现两类 path 必须 typed fail-closed；
4. CPC message 必须与 descriptor/binding/assembly/bundle digest exact match；
5. `snapshotId` 必须等于当前 `TurnContextSnapshot.snapshotId`；
6. 不重新编译、不重新排序、不把 bundle 拆回多条 System Message。

### 6.2 Assembler / Reducer / Converter

- `ContextAssembler` 对 CPC bundle 只做 identity、snapshot 与 digest revalidation，生成一个 static
  `system_instruction` segment；
- `contextSourceDigest` additive 覆盖 bundle identity 与 content-free ordered source evidence；
- `ContextReducer` 始终原样携带 CPC System Message，不删除、不截断；
- `ModelMessageConverter` 先放 exact CPC message，再放 Compaction summary/Conversation，整次请求 System Message
  count 必须恰好为 1；
- Compaction summary 必须保持既有 `compaction_summary` data segment / ordinary message material，不得进入
  `instructionMessages`、不得映射为 `role=system`，也不得参与 `instructionBundleDigest`；它只允许改变
  context/request digest。该规则同时适用于 initial/rolling/pending compaction；
- legacy path 的 message bytes、contextSourceDigest 与 Receipt bytes 必须零漂移；不得把空 CPC 字段或 `null`
  写进 legacy canonical material。

### 6.3 Receipt Evidence

`ContextAssemblyReceipt` additive 增加可选 Core-private evidence：

```text
instructionBundleEvidence?:
  schemaVersion = v1
  taskInstructionBindingDigest
  assemblyRevision
  instructionBundleDigest
  orderedSources[]  // sourceKind/id/revision/digest/ordinal/authorityMode，禁止 content
```

同时强制：

1. materializer `budgetPolicyDigest === ContextPipeline receipt.policyDigest`；
2. bundle preflight 的 `availableInputTokens` 必须等于本轮 Context Budget decision；
3. final Receipt `modelRequestDigest` 必须等于最终 v1alpha1/v1alpha2 request digest；
4. reasoning finalizer 必须通过对象扩展保留全部 instruction evidence；
5. Receipt 不保存 Prompt/Agent/Skill 正文、Workspace path、Grant ID、Credential、Endpoint 或 raw Provider mapping。

### 6.4 Provenance 分类

`ModelContextProvenanceClassifier` 对一条 CPC segment 的分类规则冻结为：

- 每个合法 bundle 必含 Platform/Task Boundary/Agent，因此加入 `platform_agent_instructions`；
- descriptor 含任一 `sourceKind=skill` 时再加入 `skill_content`；
- 不因 Skill 名称、内容字符串或数量猜测分类；
- `dataScopeDigest` 覆盖 instruction bundle segment digest 与 content-free ordered source evidence；
- evidence 缺失、重复、顺序不合法或 receipt/message digest 不一致时
  `model.external_scope_unclassifiable`，Provider 上游为 0。

## 7. Budget 与失败语义

### 7.1 双层预算保护

1. CPC-1 preflight 先验证 locked System Message 本身不超过 available input；
2. Context Pipeline 再验证 System Message + Conversation + Tool Schema + Reference 的完整请求；
3. Reducer 只按既有规则缩减旧 Conversation 与有界 Tool preview；
4. System Message 不删除、不截断，Skill 主正文不部分保留；
5. locked instruction 单独超限：`context.locked_instructions_too_large`；
6. 完整 static context 超限：沿用 `context.static_context_too_large`，safe 文案修正为“系统指令或工具定义占用过多上下文”；
7. 不自动换模型、不提高 context window、不跳过 Skill、不把 Reference 提升为 instruction。

### 7.2 Typed safe error mapping

`DurableAgentLoopStarter` 必须显式识别 `CpcInstructionFoundationError`，用既有 `fail_run` 写入：

```text
category = validation
retryable = false
code = exact CPC code
message = fixed safe summary
```

新增 `context.instruction_runtime_unavailable` 只用于 durable CPC Task 在 runtime gate/依赖不可用时的诚实失败。
不得把内部 Zod path、sourceId、digest、Prompt 片段或 stack 当作用户消息。

## 8. Agent Loop、Tool、补充输入与 Recovery

### 8.1 Materialization 次数

| 路径 | materializer/compiler 次数 | 约束 |
| --- | ---: | --- |
| main 首轮 | 1 | 在 Provider resolve 前完成 |
| 同一 start 内 Tool 后续轮 | 0 额外 | 复用同一 immutable runtime material |
| 同一 start 内 initial/rolling compaction 后主请求 | 0 额外 | 仍复用同一 System Message |
| 用户补充输入形成新 continuation | 1 | 从同一 durable bundle 重建，相同 digest |
| retry/Core restart 非终态恢复 | 1 | exact facts 重建，相同 binding/bundle digest |
| terminal assistant replay | 0 | Provider/Context/compiler 全 0 |

任何后续轮不得读取 current Agent/Skill/Platform pointer。

### 8.2 Compaction 边界

Compaction Summarizer 继续只使用：

- `robothree.compaction_summarizer` 独立 hard prompt；
- 低权威 Conversation/历史 summary data；
- exact Runtime Selection/Model lock/reasoning lock/durable deadline。

CPC Task bundle **不发送给 Compaction Summarizer**，因此本批不修改 public/private
`CompactionExecutionBinding`，也不新增 instruction 字段或 migration。CPC 对 Compaction 的证明是：

1. initial/rolling Compaction 前后，主 Agent request 使用同一 instruction binding/bundle digest；
2. pending Compaction recovery 先从 exact Task bundle 重建并验证同一 CPC runtime material；
3. Compaction 自身 prompt digest 与 Task instruction bundle digest 始终分离；
4. Tool payload、summary 文本和 Reference 永不进入 CPC System Message。

如果实现发现必须修改 Compaction Contract 或持久表才能证明以上事实，必须停手回评审。

### 8.3 Recovery 分类

| 场景 | 结果 |
| --- | --- |
| exact sources 可重建 | binding/bundle/message bytes 必须一致，继续既有 recovery |
| Platform/Agent/Skill source 缺失或 digest drift | typed fail；若已有 durable invocation 不能证明 exact request，则进入既有 recovery exhausted 语义 |
| durable CPC Task 但 gate=false | `context.instruction_runtime_unavailable`，不执行 legacy fallback |
| legacy Task | 继续 legacy path，不 backfill CPC Receipt |
| terminal assistant 已提交 | replay；instruction/context/provider/upstream count=0 |

CPC-2 不新增 durable instruction 表，也不重新计算 Model Invocation deadline；Local Personal 继续读取 migration 25
exact timeout fact。

## 9. Provider-neutral 与 DFI-5 边界

### 9.1 Provider body-level conformance

使用已有受控本地 fixture 验证：

- Enterprise OpenAI-compatible body 只有一条 exact System Message；
- Enterprise Anthropic-compatible 的既有 system 映射完整承载同一 content，不分拆/重排 CPC source；
- Local Personal OpenAI-compatible body 只有一条 exact System Message；
- 用户消息、Tool Result、Tool Schema 保持原角色和位置；
- Prompt/Agent/Skill 正文不进入 URL/header/log/error/Usage/Receipt；
- 不使用公网、真实 API Key 或真实企业身份。

本批原则上不修改 Provider-private production 文件。若任一现有 Adapter 无法消费单一 provider-neutral System
Message，停止编码并提交差异方案，不在 Adapter 内复制 CPC compiler。

### 9.2 DFI-5 零漂移

- default reasoning 继续完全省略 Provider raw reasoning 参数；
- v1alpha2 request 仍由唯一 reasoning finalizer 在 Context 之后生成；
- CPC Receipt evidence 必须在 finalizer 后保留；
- DFI-5.3 尚未完成时，production reasoning v1alpha2 Provider 继续按既有
  `reasoning_protocol_unavailable` 零上游失败关闭；
- CPC-2 不实现 Max raw mapping，不启用 SubmitTurn v1alpha3 或 Desktop Max UI。

### 9.3 Usage / Timeout / Secret 零漂移

- 不修改四阶段 timeout 数值、policy revision、migration 25 或 durable deadline；
- retry/restart 不重新获得 overall timeout；
- Provider 未返回 Usage 时仍不伪造 0；
- CPC error 不更新 Provider health 为 network failure；
- Secret、Credential Reference、Endpoint、raw Provider body 不进入 bundle/receipt/log/QA evidence。

## 10. 文件所有权

### 10.1 允许修改

```text
services/core/src/application/instruction-bundle-*.ts
services/core/src/application/context-*.ts
services/core/src/application/model-message-converter.ts
services/core/src/application/model-context-provenance-classifier.ts
services/core/src/application/durable-agent-loop-starter.ts
services/core/src/bootstrap/create-desktop-private-runtime.ts（仅 CPC activation/composition）
services/core/tests/**cpc2**
services/core/tests/**context**（仅 additive regression）
services/core/tests/**durable-loop**（仅必要接缝）
services/central-service/src/test/**（仅既有 Provider System Message regression；不得改 production）
scripts/run-cpc2-harness.mjs
package.json / services/core/package.json（仅编码授权后的版本与 script）
scripts/audit-dtp4-packaging.mjs（仅版本基线）
docs/development/**CPC**
docs/development/DEVELOPMENT-LOG.md
README.md
CHANGELOG.md
```

### 10.2 禁止修改

```text
packages/contracts/**
services/core/src/adapters/sqlite/migrations.ts
services/core/src/adapters/https/**
services/core/src/application/durable-*model-provider*.ts
services/central-service/src/main/**
apps/desktop/src/main/**
apps/desktop/src/preload/**
apps/desktop/src/renderer/**
apps/admin-console/**
services/document-worker/**
TGM / Knowledge Provider / Memory / Effect Reconciliation
DFI-5.3 Provider-private Profile/Strategy mapping
pnpm-lock.yaml
任何新依赖
```

若现有 Provider fixture 只能通过修改禁止范围才能验证，停止回文档评审。

## 11. 串行实施步骤与工期

### Step 1：Typed Runtime Decision / Activation（1～1.5 日）

- 收口 CPC-1 P3-1 单次 typed parse；
- 新增 runtime mode resolver 与 legacy/CPC/unknown 真值表；
- 将 composition 内联 `digest("9")` 收敛为 exact code-owned `LEGACY_DESKTOP_PROMPT_REVISION`，保持既有 Task
  durable bytes 零漂移；
- 同一 composition decision 写入新 Task prompt revision并驱动 Agent Loop；
- terminal replay 前置与 Provider resolve 后移；
- activation startup fail-closed tests。

### Step 2：Context / Receipt / Provenance（1.5～2 日）

- additive `LockedInstructionBundleContextV1`；
- Assembler/Reducer/Converter 单条 exact message 接线；
- Receipt ordered source evidence；
- budget policy equality、legacy byte/digest zero drift；
- provenance skill category 与 dataScopeDigest。

### Step 3：Loop / Compaction / Provider Regression（1.5～2.5 日）

- main/Tool/补充输入/retry/restart materialization count；
- initial/rolling/pending compaction 前后主请求一致；
- OpenAI/Anthropic/Local fixture；
- DFI-5、Usage、timeout、Secret 回归；
- implementation report、版本与全量门禁。

合计：**4～6 个集中工程日**。该估算沿用 CPC-0 已冻结总计划，不包含独立 QA 等待，也不包含 CPC-3 的 50-round、
真实 Core child SIGKILL、三轮 semantic replay 和完整 injection/eval corpus。

## 12. CPC-2 QA 矩阵（细化 CPC-0 QA-021～QA-040）

### QA-021：旧临时拼接移除

- CPC path 的 inline `identity/goal/instructions` 拼接调用数为 0；
- legacy path 仅由独立 legacy materializer 保留，不散落在 Agent Loop。

### QA-022：单一 System Message

- 首轮、Tool 后续轮、Compaction 后主请求均恰好一条；
- identity/content 与 CPC-1 compiler output byte-identical。
- Compaction summary 始终是 data segment / ordinary message，不进入 `instructionMessages`、不产生第二条
  System Message；summary 变化只能改变 context/request digest，不得改变 instruction bundle identity。

### QA-023：Reference / Tool Payload 隔离

- Tool Result、Compaction summary、Knowledge placeholder 均只在 data/message 层；
- wrapper 注入不能产生第二条 hard instruction。

### QA-024：Developer Role 禁用

- ModelRequest、Provider fixture、production graph 中 Developer Role count=0。

### QA-025：Receipt evidence

- binding/assembly/bundle/ordered source evidence 全部 exact；
- legacy Receipt 无空 CPC 字段且 digest 零漂移。

### QA-026：final request digest

- v1alpha1/v1alpha2 final Receipt digest 均等于最终 request digest；
- reasoning finalizer 不丢 CPC evidence。

### QA-027：Reducer 不删除

- Conversation reduction 与 bounded Tool preview 后 CPC message 仍存在。

### QA-028：Reducer 不截断

- CPC content bytes 与 compiler output 始终一致；不得 partial Skill。

### QA-029：locked instruction 超限

- typed `context.locked_instructions_too_large`；
- Task failure safe summary 无 Prompt/digest/stack。

### QA-030：失败前零上游

- §5.1 十项 side-effect count 全 0；
- malformed selection 的 P3-1 修复也满足同一断言。

### QA-031：不自动换模型

- 超限/缺 source/unknown revision 后 resolved model lock 不变且 provider resolve=0。

### QA-032：不跳过 Skill

- production resolver=0 的 Skill Task typed fail；
- no-Skill Task resolver call=0。

### QA-033：Dynamic Facts 空

- production materializer/compiler/context input 中 dynamic fact count=0。

### QA-034：Reference 不改变 bundle digest

- Conversation、Tool result、Compaction summary 改变 context/request digest，但 instructionBundleDigest 不变。

### QA-035：OpenAI-compatible body

- Enterprise fixture exact System Message；额外 CPC System count=0。

### QA-036：Anthropic-compatible body

- existing typed mapping exact承载单一 message；不复制 source ordering。

### QA-037：Local Personal body

- exact System Message；无 Credential/Endpoint/Secret 进入 evidence。

### QA-038：DFI-5 default 零漂移

- body-level reasoning omission 既有断言继续通过；CPC 不引入 raw reasoning 字段。

### QA-039：DFI-5 max lock 零漂移

- v1alpha2 reasoning finalization 与 CPC Receipt 共存；未映射 Provider 仍零上游 typed fail。

### QA-040：Usage / timeout / Secret 零漂移

- timeout policy/deadline/migration 25 digest 不变；
- Usage unknown 不伪造 0；
- 四通道敏感扫描命中 0。

附加 activation/lifecycle focused assertions：

1. known legacy + gate true 仍 legacy；
2. CPC revision + gate false 不 fallback；
3. unknown revision typed unavailable；
4. terminal replay materializer/provider count=0；
5. Tool continuation materializer extra count=0；
6. restart exact digest 一致；
7. startup requested-but-incomplete 在 HTTP ready 前失败；
8. production test resolver count=0。

## 13. 门禁

编码获授权后串行执行：

```text
CI=true pnpm exec eslint <touched files>
CI=true pnpm run lint
CI=true VITEST_MAX_WORKERS=1 pnpm run harness:cpc2
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm install --frozen-lockfile --offline
CI=true pnpm run audit:dtp4
```

静态边界同时要求：

- migration 最大 id 仍为 26；
- `pnpm-lock.yaml` 编码前后 digest 一致；
- public/private Contract digest 与 export 零漂移；
- Provider-private production、Desktop/Admin、Central production、Document Worker mtime/依赖图零触碰；
- `.skip/.only/@Disabled`、sleep 猜窗口、自动 retry 掩盖失败、硬编码资源 0 均为 0；
- production `LockedSkillInstructionResolver` 与 test fixture reachability 均为 0；
- DFI-5.3/5.4、AAPI-0.3～0.4、TGM、Knowledge/Memory/Effect 继续 GATED。

## 14. 停手条件

出现任一情况必须停止并回文档评审：

1. 需要新增 migration 27、表、列、索引或 durable instruction journal；
2. 需要修改 `packages/contracts/**` 或公共 Desktop/Admin API；
3. 需要修改 Provider-private production mapping 才能承载单一 System Message；
4. 需要把 CPC source 拆成 Provider-specific 多条 prompt；
5. 需要通过 current Agent/Skill/Platform pointer恢复历史 Task；
6. 需要对 CPC durable Task 在 gate=false 时 fallback legacy；
7. 需要跳过/截断 Skill 或自动换模型通过预算；
8. 需要把 Tool Payload、Compaction summary、Knowledge、Memory、文件或网页提升为 System/Developer；
9. 需要修改 Compaction Contract/persistence 才能证明主请求 bundle 一致；
10. 需要改变 DFI-5 reasoning mapping、Usage 或 timeout 数值；
11. 需要真实 Secret、公网 Provider 或 production enterprise identity 才能测试；
12. 需要新增依赖或修改 lockfile；
13. 其他窗口并行修改 Context/Agent Loop/Compaction 同一文件；
14. root/Central 门禁失败且无法安全归因。

## 15. 独立文档评审问题

1. 是否接受用 durable `platformPromptRevision` 区分 legacy/CPC Task，避免 migration 和历史 backfill？
2. 是否接受 CPC-2 production default 继续 disabled，CPC-3 也只验证 test-only activation，不自动启用 production？
3. 是否接受 CPC path materialize 在 terminal replay 后、Provider resolve 前恰好一次？
4. 是否接受 Context Pipeline 新增 bundle 专用输入，而不是伪装成 legacy content digest？
5. Receipt 的 content-free ordered source evidence 是否足以支持 provenance 与恢复核对？
6. Compaction Summarizer 不接 Task bundle、只证明 Compaction 前后主请求 bundle 一致，是否准确？
7. P3-1 单次 typed parse 与 P3-2 Skill fail-closed 边界是否完整？
8. Provider production 文件零修改、仅复跑/补 test-only fixture 是否接受？
9. 4～6 个集中工程日和 QA-021～040 细化矩阵是否合理？

## 16. 当前状态

```text
CPC-0 Revision 1.1 = PASS/CLOSED
CPC-1 = PASS/CLOSED
CPC-2 = PASS/CLOSED
CPC-3 = DOCUMENT REVIEW PENDING / CODING GATED
DFI-5.3 = PLAN REVIEW PASS/CLOSED / CODING GATED
AAPI-0.3～0.4 / TGM / Knowledge Provider / Memory /
Effect Reconciliation / Desktop / Admin = GATED
```

用户已正式接受 CPC-2 独立 QA 结论，CPC-2 当前为 `PASS/CLOSED`。独立 QA 已使用 JDK 21 补跑 Central
online/offline，均为 404/0/0/0 / BUILD SUCCESS。该关闭不启用 production CPC activation，也不自动授权
CPC-3 编码或解锁任何下游批次。
