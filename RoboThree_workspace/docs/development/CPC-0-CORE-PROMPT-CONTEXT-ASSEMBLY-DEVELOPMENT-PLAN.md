# CPC-0 Core Prompt / Context Assembly 详细实施总方案

> 状态：**REVISION 1.1 / PLAN REVIEW PASS/CLOSED / CPC-1～CPC-3 PASS/CLOSED / CPC 全线 PASS/CLOSED**  
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 上游：[Core Prompt 与上下文组装 Feature Spec v1.0 Revision 1](../product/CORE-PROMPT-AND-CONTEXT-FEATURE-SPEC-v1.0.md) 已完成聚焦差异复核，`PASS（P0～P3 全 0）`  
> 计划代号：`CPC`（Core Prompt / Context）  
> 本线最高输出：`CPC_CORE_PROMPT_MVP_CONFORMANT`  
> 当前结论：**CPC-1～CPC-3 与 CPC 全线已正式关闭；production activation 继续 disabled**

## 0. Revision 1 修订结论

### 0.1 修订原因

Revision 0 把以下三类不同工作同时计入“系统提示词”范围：

1. Platform Prompt、Task Boundary、Agent、Skill 的稳定组装；
2. Knowledge retrieval receipt/replay 与长期上下文来源；
3. Effect `uncertain` 人工核对、跨持久化恢复和 Desktop 产品入口。

这导致计划从“复用现有 Context Pipeline 完成系统提示词”扩张成一套新的 Context/Reconciliation 平台，形成
37～61 个集中工程日的过度估算。该范围划分不符合当前工程事实，也不符合 MVP 优先级。

Revision 1 纠正为：

- **系统提示词 MVP 复用既有 TaskRuntimeSelection、SubmitTurn bundle、Context Pipeline、ModelRequest、Agent Loop、
  Compaction 与 durable Provider；**
- 保留版本化 source model、单一 compiler、稳定 digest、可插拔 materializer 和 reference/dynamic 扩展位；
- 不为尚未生产接入的 Knowledge、Memory、文件、网页或人工核对提前建设持久化平台；
- 不新增 migration 27/28；
- 不触碰 DFI-5 Provider-private Max mapping；
- 工期调整为 **10～16 个集中工程日**。

### 0.2 Revision 对比

| 项目 | Revision 0 | Revision 1 |
| --- | --- | --- |
| 实施批次 | CPC-1～CPC-5 | CPC-1～CPC-3 |
| 工期 | 37～61 日 | **10～16 日** |
| 新 migration | 27、28 | **无** |
| Task Instruction Binding | 新表重复持久化 | 从既有 TaskRuntimeSelection + SubmitTurn bundle 确定性派生 |
| Provider 改造 | 多 Provider body mapping | 单一 provider-neutral System Message，复用现有消息映射 |
| Knowledge | retrieval receipt/loadExact 平台 | 只冻结 extension seam，生产实现继续 GATED |
| `uncertain` | 新 Command/Fact/Authority/恢复线 | 从 CPC 移出，另立 Agent/Tool Recovery 计划 |
| 真实进程矩阵 | I/K/R 全量大矩阵 | 聚焦系统提示词、Tool 后续轮、Compaction、restart |
| QA | 120 项 | **60 项聚焦矩阵** |

Revision 0 从未获得编码授权，不形成已承诺实现范围；Revision 1 取代 Revision 0，并由用户接受 Revision 1.1
聚焦差异复核结论后将 CPC-0 计划评审正式标记为 `PASS/CLOSED`。

### 0.3 Revision 1.1 聚焦收口

Revision 1.1 只关闭 Revision 1 独立复核的三个非阻断 P3，不改变三批范围或 60 项 QA；CPC-3 细化后工期同步修正为 3～5 日，总工期为 10～16 日：

1. 单条 `ModelInstructionMessage` 使用 bundle 级身份：
   - `sourceId = "core.instruction-bundle.v1"`；
   - `sourceRevision = assemblyRevision`；
   - `sourceDigest = instructionBundleDigest`；
2. CPC Core-private 类型只能进入 `services/core/**`，禁止进入 `packages/contracts/**` 或任何公共/private
   Contracts subpath；
3. CPC-1 只实现 Skill resolver Port 与 test-only fixture。没有 production Skill resolver 时：
   - 无 Skill Task 可以使用 Platform + Task Boundary + Agent 完整运行；
   - 带 Skill Task 必须 typed fail-closed；
   - 不得宣称 Skill Runtime ready。

## 1. 目标与成功边界

### 1.1 本期目标

把已经冻结的 Platform Prompt v1 与当前 Task 的 exact Agent、Task Boundary、可用 Skill material 编译为一个稳定、
可验证、可恢复的系统指令包，并通过现有 Context Pipeline 进入所有模型调用路径：

```text
existing TaskRuntimeSelection / SubmitTurn bundle
  -> exact Platform Prompt revision
  -> deterministic Task Boundary
  -> exact compiled Agent revision
  -> optional exact selected Skill material
  -> InstructionBundleDescriptorV1
  -> InstructionBundleCompilerV1
  -> one canonical ModelInstructionMessage
  -> existing Context Pipeline / budget / ModelRequest
  -> existing Provider Adapter / Agent Loop / Compaction
```

### 1.2 完成后可以声明

```text
CPC_CORE_PROMPT_MVP_CONFORMANT
```

该结论只证明：

- Platform、Task Boundary、Agent 和已能被可信 materializer 解析的 Skill 按冻结优先级进入系统提示词；
- 同一个 Task 的首次调用、Tool 后续轮、Compaction、retry/restart 使用同一锁定来源；
- 系统提示词不可被普通用户、Reference、Tool Payload 或 Provider Adapter 提升/改写；
- 超出模型上下文预算时失败关闭，不自动换模型或删除稳定指令；
- 为未来 Knowledge、Memory、文件、网页和动态事实保留清晰的低权威扩展接缝。

### 1.3 不代表以下能力完成

- Knowledge retrieval、chunk receipt/replay 或真实 Knowledge Provider；
- 长期 Memory、文件/网页新 Provider、CRM/RAG 平台；
- Agent/Skill 创建、保存、发布、Admin API 或 Renderer 编辑器；
- Effect `uncertain` 人工核对、production authority 或 Desktop UI；
- DFI-5.3/5.4、AAPI-0.3～0.4、TGM 或其他 GATED 计划自动解锁；
- Prompt 可以替代 Core 的 Tool Schema、Workspace Grant、Authorization、Confirmation、Effect 状态机或 Secret 边界。

## 2. 必须复用的既有工程事实

### 2.1 已完成的基础

1. `TaskRuntimeSelection` 已持久保存：
   - `platformPromptRevision`；
   - 完整 immutable Agent revision；
   - `activeSkillRevisions` 与 `knowledgeRevisions` exact ref/revision/contentDigest；
   - Model/Tool locks、Workspace Grant、Registry revision；
2. `task_runtime_selections.selection_json` 已支持 Core-private readable revision，不需要为指令绑定新建表；
3. `TaskSubmitTurnBinding.bundleDigest` 已覆盖 Task、Capability Locks 与完整 Runtime Selection；
4. `ContextAssembler` 已支持 instruction、selected Skill、Conversation、Tool Schema 与 Compaction Summary；
5. `ContextBudgetPolicy`、`ContextReducer`、`ModelMessageConverter` 与 `ContextAssemblyReceipt` 已存在；
6. `ModelInstructionMessage` 已支持带 source identity/revision/digest 的 `role=system` 消息；
7. `AgentDefinitionRevision` 已包含 `name/identity/goal/instructions/revision/digest`，运行期不需要再建 Agent compiler；
8. Durable Agent Loop、Tool continuation、Compaction、retry/restart 已能读取 exact Task bundle；
9. DFI-5.2 已证明 reasoning-aware final ModelRequest digest、Tool 后续轮与 restart 锁定一致；
10. Provider 已消费 provider-neutral ModelRequest；系统提示词不需要进入 Provider-private raw mapping。

### 2.2 当前真实缺口

1. Agent Loop 仍把 `identity + goal + instructions` 临时拼成单条 instruction；
2. `platformPromptRevision` 已锁定，但生产 composition 没有与该 revision 对应的 immutable Platform Prompt artifact；
3. 没有正式 Task Boundary materializer；
4. 没有单一 Instruction Bundle descriptor/compiler 与 assembly revision；
5. Skill context 只有内部类型/测试基础，尚未从 exact locked ref 建立可信生产 materializer；
6. 现有 instruction 排序是 `sourceKind + sourceId`，不是产品冻结的 Platform -> Task Boundary -> Agent -> Skill；
7. Context Receipt 尚未显式记录 instruction bundle digest/assembly revision；
8. 没有跨 main、Tool、Compaction、retry/restart 的系统提示词一致性 Harness；
9. Reference/dynamic facts 尚无生产来源，但这不应阻塞稳定系统提示词。

## 3. 冻结设计

### 3.1 复用现有 Task durable facts，不新增 Binding 表

逻辑上的 `TaskInstructionBindingV1` 是一个 **确定性派生视图**，不是新持久表：

```text
TaskInstructionBindingV1
  taskId
  runtimeSelectionId
  runtimeSelectionDigest
  submitTurnBundleDigest
  platformPromptRevision
  agentRevision / agentDigest
  orderedSkillRefs[]
  assemblyRevision
  bindingDigest
```

来源全部已经存在于 exact TaskRuntimeSelection 和 SubmitTurn bundle。`bindingDigest` 使用独立 domain：

```text
robothree.task-instruction-binding.v1\n
```

规则：

1. 每次加载都从同一 durable Task bundle 确定性派生；
2. 不读取 current/latest Agent、Skill 或 Platform pointer；
3. 不复制完整 Prompt 到 Task 表、日志或 Receipt；
4. exact source material 缺失或 digest 不符时失败关闭；
5. 同一 Task 重建出的 bindingDigest 必须相同；
6. 历史 Task 保留既有 legacy 行为，不自动 backfill；
7. CPC feature 只对启用后创建且来源可完整证明的新 Task 生效；
8. 如果实现证明仅靠既有 durable facts 无法恢复，必须停止回评审，不能直接新增 migration。

这既满足 Task 级锁定，也避免把已经存在的 Runtime Selection 再复制成第二套状态机。

### 3.2 版本化 Instruction Source Model

Core-private 类型：

```text
InstructionSourceV1
  sourceKind = platform | task_boundary | agent | skill
  sourceId
  sourceRevision
  sourceDigest
  ordinal
  authorityMode = hard | role | advisory
  content

InstructionBundleDescriptorV1
  assemblyRevision
  taskInstructionBindingDigest
  orderedSources[]  // content-free identity/revision/digest/ordinal/mode
  bundleDigest
```

固定顺序与权限：

| 顺序 | 来源 | 权限模式 | 当前是否生产可用 |
| ---: | --- | --- | --- |
| 0 | Platform Prompt | `hard` | 本批实现 immutable release artifact |
| 10 | Task Boundary | `hard` | 本批从 exact locked facts 确定性生成 |
| 20 | Agent | `role` | 复用已锁定 AgentDefinitionRevision |
| 30+ | selected Skill | `advisory` | 有可信 exact materializer 才进入；否则 typed unavailable |

source model 是扩展基础，但不把所有未来上下文伪装成 System Instruction：

- Knowledge、Memory、文件、网页和 Tool Payload 是 `reference`，永不进入该列表；
- currentTime/locale/timezone 是 `dynamic_fact`，永不进入 bundleDigest；
- 新 source kind 必须明确 authority mode、owner、revision、digest、预算和恢复语义后才能注册；
- 未注册 source kind 失败关闭，不按字符串名称猜测处理方式。

### 3.3 Platform Prompt artifact

新增单一 `PlatformPromptSource`：

```text
loadExact(platformPromptRevision)
  -> { sourceId, revision, contentDigest, content }
```

规则：

1. Platform Prompt v1 作为 Core release artifact 随代码发布；
2. production composition 的 `RuntimeSelectionContext.platformPromptRevision` 必须来自该 artifact，而不是固定假 digest；
3. `revision === contentDigest`，load 时重算；
4. artifact 不从 Renderer/Main/env/CLI/远程未验证文本读取；
5. 新 Prompt 产生新 revision，历史 revision 在兼容窗口内可 exact load；
6. 删除仍被非终态 Task 引用的 revision 必须失败；
7. Prompt 内容不进入普通日志或错误摘要。

### 3.4 Task Boundary

`TaskBoundaryInstructionMaterializer` 只消费：

- exact Runtime Selection；
- bundled Workspace/Authorization safe facts；
- Tool locks 的安全名称/风险摘要；
- Task identity 与既有产品约束。

它不包含绝对路径、Grant ID、Credential Reference、Endpoint、Adapter、raw digest、Token 或 Secret。Renderer/Main
传入的展示文本不是 authority。相同 Task bundle 必须产生相同内容和 digest。

### 3.5 Agent revision：复用既有一次编译结果

现有 `AgentDefinitionRevision` 已是运行期需要的编译结果。本计划只新增
`AgentInstructionMaterializer`，把 exact `identity/goal/instructions` 转为一个 `role` source：

1. 运行期不重新解释产品字段；
2. 不调用 Admin/Agent 编辑器；
3. 不按当前 Agent pointer 替换历史 revision；
4. revision/digest 不一致失败关闭；
5. 未来 Agent 保存/发布入口必须在其独立计划中生成同一结构，不修改 CPC runtime compiler。

因此“Agent revision 一次编译”可落地，但不需要在系统提示词批次重做 Agent CRUD/compiler 平台。

### 3.6 Skill 扩展接缝

新增最小 `LockedSkillInstructionResolver` Port：

```text
loadExact({ skillId, revision, contentDigest, materializedRef })
  -> exact mainBody | unavailable
```

规则：

1. 按 Runtime Selection 原顺序加载；
2. 主正文是不可拆分 `advisory` source；
3. refs/scripts/examples/templates 不自动进入主正文，也不执行；
4. digest 不符、source 缺失、越权或不可证明时整次 fail-closed；
5. production resolver 未安装且 Task 没有 Skill 时正常运行；
6. production resolver 未安装但 Task 锁定 Skill 时返回 typed `context.skill_material_unavailable`；
7. test fixture 不得进入 production dependency graph；
8. 本计划不建设 Skill Runtime、Skill CRUD 或 Admin 管理页面。

因此在独立 Skill Runtime 接入前，`CPC_CORE_PROMPT_MVP_CONFORMANT` 的生产可用面明确为无 Skill Task；带 Skill
Task 的失败关闭是诚实能力边界，不是系统提示词静默降级。

### 3.7 单一 InstructionBundleCompiler

所有稳定 source 编译为 **一条** canonical `ModelInstructionMessage`：

```text
[RoboThree Instruction Bundle v1]
{"assemblyRevision":"...","items":[
  {"authorityMode":"hard","content":"...","ordinal":0,"sourceKind":"platform"},
  ...
]}
```

实际 JSON 使用现有 canonical JSON helper；上例仅展示形状。

规则：

1. `assemblyRevision` 覆盖 source ordering、wrapper、escaping 与 merge 规则；
2. content 作为 JSON string 标准转义，不能闭合/伪造外层 wrapper；
3. items 顺序为 Platform、Task Boundary、Agent、Skill locked ordinal；
4. bundle digest 覆盖 binding digest、assembly revision 与每项 exact digest；
5. compiler 是纯函数，不写库、不读取 current pointer、不调 Provider；
6. 输出沿用现有 `ModelInstructionMessage(role=system)`；
7. 不使用 Developer Role，不修改公共 Model Protocol；
8. Provider 只看到普通 provider-neutral System Message，不理解 source kind/mode；
9. `default_passthrough`/Max reasoning mapping 与 compiler 相互独立；
10. Compiler 输出进入最终 ModelRequest digest。

输出 message 的既有三项 identity 字段固定为：

```text
sourceId       = "core.instruction-bundle.v1"
sourceRevision = assemblyRevision
sourceDigest   = instructionBundleDigest
```

不得填 Platform source identity，也不得任选其中一个 Agent/Skill source 代表整个 Bundle。每项 source 的 exact
identity/revision/digest 继续由 descriptor 与 Context Receipt 记账。

使用单一 System Message 后，OpenAI-compatible、Anthropic-compatible、Local Personal 等 Provider 不需要各自复制
Prompt 组装规则，也避免与 DFI-5.3 争用 Provider-private body mapping 文件。

### 3.8 Dynamic Facts 与 Reference 的扩展位

Compiler input 预留两个独立区域：

```text
dynamicFacts: readonly DynamicContextFact[]
references: readonly ReferenceContextBlock[]
```

但 CPC MVP 的生产装配固定为：

```text
dynamicFacts = []
references = existing Context Pipeline data only
```

冻结边界：

- Dynamic Facts 不属于稳定 Bundle；未来启用 currentTime/locale/timezone 前必须先证明同 Invocation 的 durable/retry 语义；
- Reference 永不进入 System Message，只能作为低权威 data/message/artifact；
- Knowledge、Memory、文件、网页 Provider 各自负责 authority、revision、receipt、删除和恢复；
- 后续 Provider 只需产出 `ReferenceContextBlock`，不修改 InstructionBundleCompiler；
- 当前不创建空数据库表、不保存空 receipt、不用 Fixture 冒充业务成功。

这就是本期“可扩展性”的具体落点：**稳定的类型边界和编译接缝已经存在，但未实现的数据源不被伪装成 ready。**

### 3.9 Context Pipeline 与预算

1. `DurableAgentLoopStarter` 不再临时拼接 Agent instruction，统一调用 bundle materializer/compiler；
2. Context Pipeline 接收一条 compiled instruction source；
3. `ContextAssembler` 不再负责不同 instruction source 的业务排序；排序只存在于 compiler；
4. `ContextReducer` 继续不得删除或截断 System Instruction；
5. 预算不足时优先按既有规则裁剪旧 Conversation、Tool preview、Reference；
6. 稳定 instruction 本身超限时返回 typed `context.locked_instructions_too_large`；
7. 不自动换模型、不跳过 Skill、不缩写 Platform/Agent；
8. `ContextAssemblyReceipt` additive 记录 `assemblyRevision/instructionBundleDigest/taskInstructionBindingDigest`；
9. 最终 receipt 的 `modelRequestDigest` 继续由 reasoning-aware finalizer 精确覆盖；
10. Receipt 仍通过既有调用链使用，不为本批新增 persistence table。

### 3.10 全调用链一致性

以下路径必须使用同一 `TaskInstructionBundleResolver`：

- main 首轮；
- Tool Result 后续轮；
- 用户补充输入；
- retry；
- Core restart；
- initial Compaction；
- rolling Compaction；
- terminal replay。

Compaction summarizer 可以保留自身专用 hard prompt，但不得把 Knowledge/Tool payload 提升为 System；若 Compaction
需要原 Task 指令，只能引用同一个 compiled bundle digest。terminal replay 不重新调用 Provider。

### 3.11 Feature activation

新增 Core-private activation gate，默认关闭：

| 状态 | 行为 |
| --- | --- |
| false | 既有 Agent instruction 行为保持可用，CPC production graph 不安装。 |
| true + Platform source/Task Boundary/compiler 缺失或重复 | Core ready 前失败关闭。 |
| true + Task 无 Skill | Platform + Boundary + Agent 正常运行。 |
| true + Task 有 Skill但 resolver 不可用 | typed unavailable，不跳过 Skill。 |
| true + 完整依赖 | 启用 CPC 系统提示词。 |

禁止通过 Fake、test fixture、fixed source 或 `getIfAvailable(Fake::new)` 让 production feature 显示 ready。

## 4. 关键执行顺序

### 4.1 Task 首次调用

1. load existing executable SubmitTurn bundle；
2. strict validate Runtime Selection 与 bundle digest；
3. derive TaskInstructionBindingV1；
4. load exact Platform Prompt artifact；
5. materialize deterministic Task Boundary；
6. materialize exact Agent revision；
7. Task 有 Skill 时调用 exact Skill resolver；
8. verify all source digests；
9. build descriptor + bundle digest；
10. run locked instruction budget guard；
11. compile one canonical System Message；
12. enter existing Context Pipeline；
13. finalize reasoning-aware ModelRequest + Receipt；
14. only then resolve Provider/Credential/Endpoint and dispatch。

步骤 2～11 任一失败时，上游请求、Credential resolve、DNS/socket/TLS、Usage fact 均为 0。

### 4.2 Retry / restart

1. reload exact Task bundle；
2. derive the same binding digest；
3. exact load the same Platform/Agent/Skill revisions；
4. compile the same bundle digest；
5. rebuild ModelRequest；
6. require rebuilt digest to equal durable invocation/request digest；
7. mismatch -> recovery exhausted，不改用 current source；
8. Provider terminal 已存在 -> replay，compiler/Provider count=0。

### 4.3 Tool / Compaction

1. Tool 后续轮复用同一 bundle resolver；
2. Tool Payload 始终是 data，不进入 instruction compiler；
3. Compaction binding 必须指向同一 Runtime Selection digest；
4. Compaction 自身 hard prompt 与 Task bundle 分开计 digest；
5. Compaction 不读取 current Agent/Skill/Platform；
6. 任何路径发现 source drift 均失败关闭。

## 5. 串行实施批次

### CPC-1 Instruction Foundation（3～5 日）

范围：

- Platform Prompt v1 immutable release artifact 与 exact source；
- TaskInstructionBindingV1 确定性派生；
- InstructionSource/Descriptor/digest domains；
- Task Boundary materializer；
- Agent instruction materializer；
- LockedSkillInstructionResolver Port + test-only exact fixture；
- single InstructionBundleCompiler；
- locked instruction budget preflight；
- focused canonical/materialization conformance；
- feature 默认 disabled。

最高输出：`CPC1_INSTRUCTION_FOUNDATION_CONFORMANT`。

不包含 Agent/Skill CRUD、Knowledge/Memory、Provider 文件修改、Desktop/Admin、migration。

### CPC-2 Runtime Integration（4～6 日）

前置：CPC-1 独立 QA `PASS/CLOSED` 并由用户接受。

范围：

- DurableAgentLoopStarter 移除临时 Agent 拼接，接单一 bundle resolver；
- main/Tool/补充输入/Compaction/retry/restart 共用；
- Context Pipeline、预算、Reducer、Receipt additive integration；
- reasoning-aware final ModelRequest digest；
- existing Provider body-level System Message fixture；
- OpenAI-compatible/Anthropic-compatible/Local Personal 回归；
- Max default/max mapping、Usage、timeout、Secret 边界零漂移；
- activation gate 与 production graph 测试。

最高输出：`CPC2_RUNTIME_INTEGRATION_CONFORMANT`。

原则上不修改 Provider-private mapping 文件；若现有 Provider 无法正确消费单一 System Message，必须停手做差异评审。

### CPC-3 Lifecycle / Eval Closure（3～5 日）

前置：CPC-2 独立 QA `PASS/CLOSED` 并由用户接受。

范围：

- 首轮、50-round Tool continuation、initial/rolling Compaction；
- retry/restart exact bundle/digest；
- Core child SIGKILL + SQLite reopen（复用现有 Harness primitives）；
- 三轮 semantic replay；
- prompt conflict/injection behavior corpus；
- body-level omission、敏感扫描、资源归零；
- stage implementation report。

最高输出：`CPC_CORE_PROMPT_MVP_CONFORMANT`。

### 5.4 工期

| 批次 | 集中工程日 |
| --- | ---: |
| CPC-1 | 3～5 |
| CPC-2 | 4～6 |
| CPC-3 | 3～5 |
| 合计 | **10～16** |

估算包含 focused tests、root/Central 回归、Provider fixtures、restart Harness 和实施报告，不包含独立 QA/用户等待，
也不包含 Knowledge Provider、Memory、`uncertain` 核对或 Desktop/Admin 产品入口。

## 6. 后续可扩展路线

| 后续能力 | 复用本期接缝 | 后续独立责任 |
| --- | --- | --- |
| Skill Runtime | LockedSkillInstructionResolver | Skill 发布、物化、权限、删除与真实 Adapter |
| Knowledge | ReferenceContextBlock + locked Knowledge ref | retrieval policy、chunk receipt、loadExact、replay、Provider |
| Long-term Memory | ReferenceContextBlock | owner scope、写入、检索、删除、注入策略 |
| File/Web | ReferenceContextBlock | Workspace/网络权限、解析、引用、清理 |
| Dynamic time/locale | DynamicContextFact | trusted source、Invocation durability、retry/restart |
| Agent 编辑器 | AgentDefinitionRevision | 保存/发布 compiler、审核、revision 生命周期 |
| `uncertain` 人工核对 | existing Effect uncertain/waiting seam | Authority、Command/Fact、Agent Loop resume、Desktop UI |
| Provider 新协议 | one ModelInstructionMessage | Provider-private message mapping与fixtures |

扩展原则：未来能力通过明确 Port/Block 接入，不改写 Platform/Task/Agent/Skill 的优先级，不把 Reference 提升为
System，也不要求普通用户处理 digest、Binding、Adapter 或 Runtime 等技术字段。

## 7. 文件所有权

### 7.1 允许修改

```text
services/core/src/application/context-*.ts
services/core/src/application/durable-agent-loop-starter.ts
services/core/src/application/agent-loop-*.ts（仅必要接缝）
services/core/src/application/compaction-*.ts（仅必要接缝）
services/core/src/ports/*instruction*.ts
services/core/src/adapters/memory/*instruction*.ts
services/core/src/bootstrap/**（仅 activation/composition）
services/core/tests/**cpc**
services/core/tests/**context**
scripts/run-cpc*.mjs
docs/development/**CPC**
docs/development/DEVELOPMENT-LOG.md
README.md
CHANGELOG.md
package.json / services/core/package.json（仅获授权编码批版本与 script）
```

### 7.2 禁止修改

```text
packages/contracts public/root export行为
packages/contracts 任意 private subpath
services/core/src/adapters/sqlite/migrations.ts
apps/desktop/src/main/**
apps/desktop/src/preload/**
apps/desktop/src/renderer/**
apps/admin-console/**
services/document-worker/**
services/central-service生产代码
Provider-private reasoning/Profile/Strategy mapping
TGM / Knowledge Provider / Long-term Memory生产实现
pnpm-lock.yaml
任何新依赖
```

若实现必须突破禁止范围，停止并回文档评审。

## 8. 60 项 QA 矩阵

### 8.1 Source / Binding / Compiler（QA-001～QA-020）

1. QA-001：Platform artifact revision 等于 content digest；
2. QA-002：未知 Platform revision typed unavailable；
3. QA-003：production selection context 使用真实 artifact revision；
4. QA-004：Binding 只从 existing durable facts 派生；
5. QA-005：同一 Task 十次 bindingDigest 一致；
6. QA-006：current Agent/Skill/Platform pointer 漂移不影响历史 Task；
7. QA-007：Agent revision/digest 不一致失败；
8. QA-008：Agent runtime compiler call count=0；
9. QA-009：Task Boundary 只含 safe locked facts；
10. QA-010：Task Boundary 无路径/Grant ID/Credential/Endpoint；
11. QA-011：无 Skill 时 resolver call count=0；
12. QA-012：有 Skill 且 resolver 缺失 typed unavailable；
13. QA-013：Skill exact revision/content digest；
14. QA-014：Skill 缺失或 drift 不跳过；
15. QA-015：Platform/Boundary/Agent/Skill 顺序固定；
16. QA-016：Skill locked ordinal 稳定；
17. QA-017：canonical wrapper quote/backslash/newline 正确转义；
18. QA-018：正文伪造 wrapper 不能逃逸；
19. QA-019：compiler 相同输入十次 digest 一致；
20. QA-020：bundle/receipt/log 不泄漏 Secret 或内部路径。

### 8.2 Context / Budget / Request（QA-021～QA-040）

21. QA-021：Agent Loop 不再临时拼接 Agent instruction；
22. QA-022：每轮只有一条 canonical System Message；
23. QA-023：Reference/Tool Payload 不能进入 System；
24. QA-024：MVP Developer Role count=0；
25. QA-025：Context Receipt 记录 assembly/binding/bundle digest；
26. QA-026：final receipt request digest 等于最终 ModelRequest digest；
27. QA-027：instruction 永不被 Reducer 删除；
28. QA-028：instruction 永不被 Reducer 截断；
29. QA-029：locked instruction 超限 typed fail；
30. QA-030：超限时 Provider/Credential/DNS/socket count=0；
31. QA-031：超限不自动换模型；
32. QA-032：超限不静默跳过 Skill；
33. QA-033：Dynamic Facts production input 为空；
34. QA-034：Reference extension 不能改变 bundleDigest；
35. QA-035：OpenAI-compatible body exact System Message；
36. QA-036：Anthropic-compatible body exact System Message；
37. QA-037：Local Personal body exact System Message；
38. QA-038：DFI-5 default omission 零漂移；
39. QA-039：DFI-5 max mapping 零漂移；
40. QA-040：Usage/timeout/Secret 行为零漂移。

### 8.3 Lifecycle / Recovery / Security（QA-041～QA-060）

41. QA-041：main 首轮使用 exact bundle；
42. QA-042：Tool 后续轮使用同一 bundle digest；
43. QA-043：50-round Tool Loop bundle digest 唯一；
44. QA-044：用户补充输入不重读 current source；
45. QA-045：initial Compaction binding exact；
46. QA-046：rolling Compaction binding exact；
47. QA-047：retry 重建 request digest 一致；
48. QA-048：restart 新 PID/SQLite reopen 后 digest 一致；
49. QA-049：source 缺失时 recovery exhausted，不 fallback current；
50. QA-050：source digest drift 时 recovery exhausted；
51. QA-051：Provider terminal replay compiler count=0；
52. QA-052：Provider terminal replay upstream count=0；
53. QA-053：feature=false legacy 行为零漂移；
54. QA-054：feature=true dependency missing 在 ready 前失败；
55. QA-055：test resolver production graph count=0；
56. QA-056：三轮 semantic replay digest 一致；
57. QA-057：prompt conflict corpus 无越权 Tool/Workspace 行为；
58. QA-058：prompt injection corpus 不改变确定性权限事实；
59. QA-059：四通道多编码敏感扫描为 0；
60. QA-060：资源计数来自真实 diagnostic，无硬编码 0/`?? 0`。

## 9. 门禁

每个获授权编码批串行执行：

```text
CI=true pnpm exec eslint <touched files>
CI=true pnpm run lint
CI=true VITEST_MAX_WORKERS=1 pnpm run harness:cpc<batch>
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm install --frozen-lockfile --offline
CI=true pnpm run audit:dtp4
```

并核实：

- migration 仍止于 26；
- `pnpm-lock.yaml` digest 与编码前一致；
- public Contract/root exports 零漂移；
- Provider、Desktop/Admin、Central production、Document Worker 边界扫描；
- `.skip/.only/@Disabled` 零命中；
- production Fake/test resolver 数量为 0；
- Claude Code 独立 QA 和用户接受前不标记 `PASS/CLOSED`。

## 10. 停手条件

出现任一情况必须停止并回文档评审：

1. 需要新增 migration 27 或改 migration 1～26；
2. 需要新增第二套 Task/Instruction lock 表；
3. 既有 Runtime Selection/SubmitTurn bundle 无法证明 exact binding；
4. 需要原地修改 public ModelRequest/Desktop/Admin Contract；
5. 需要修改 Provider-private Max/Profile/Strategy mapping；
6. 需要把 Reference/Tool Payload 提升为 System/Developer；
7. 需要在运行期重新编译或猜测 Agent revision；
8. Skill material 不可用但实现者想静默跳过；
9. instruction 超限但实现者想自动换模型或截断；
10. 需要真实 Knowledge/Memory/File/Web Provider；
11. 需要 Effect `uncertain` Command/Fact/Authority/UI；
12. 需要新增依赖或修改 lockfile；
13. 其他窗口并行修改相同 Context/Agent Loop/Compaction 文件；
14. root/Central 门禁失败且无法安全归因。

## 11. 独立文档评审问题

1. 是否接受 Revision 0 范围过大、Revision 1 取代它？
2. 是否接受复用 TaskRuntimeSelection + SubmitTurn bundle 派生 Binding，不新增表？
3. 是否接受单一 canonical System Message，从而不修改各 Provider Prompt mapping？
4. Platform/Task Boundary/Agent/Skill 四层是否保留了需要的基础和扩展性？
5. Skill resolver 缺失时 fail-closed、无 Skill 时正常运行是否合理？
6. Dynamic Facts/Knowledge/Memory/File/Web 只冻结 extension seam、生产实现另立计划是否接受？
7. `uncertain` 核对从 CPC 移出，另立 Agent/Tool Recovery 是否接受？
8. 是否接受无 migration、三批 10～16 日和 60 项 QA？
9. CPC-2 原则上不改 Provider-private 文件的边界是否接受？
10. CPC 全线只输出 `CPC_CORE_PROMPT_MVP_CONFORMANT` 是否准确？

## 12. 本轮状态

```text
CPC-0 Revision 1.1 = PLAN REVIEW PASS/CLOSED
CPC-1 = PASS/CLOSED
CPC-2 = PASS/CLOSED
CPC-3 repair.1 = PASS/CLOSED
CPC-3 = PASS/CLOSED
CPC 全线 = PASS/CLOSED
DFI-5.3 子批 / AAPI-0.3～0.4 / TGM / Knowledge Provider /
Memory / Effect Reconciliation / Desktop / Admin = GATED
```

CPC-1 经用户单独授权后已实现 Instruction Foundation，详见
[CPC-1 实施报告](./CPC-1-INSTRUCTION-FOUNDATION-IMPLEMENTATION-REPORT.md)，独立 QA P0～P2 全 0、P3=2 均非阻断，
并已由用户正式接受为 `PASS/CLOSED`。新增
[CPC-2 Runtime Integration 详细方案](./CPC-2-RUNTIME-INTEGRATION-DEVELOPMENT-PLAN.md)，独立文档复核为
`PASS（P0=0、P1=0、P2=0、P3=2，均非阻断）`，两个 P3 已在 CPC-2 实现与后续评审中收口，用户已正式接受并关闭 CPC-2。
[CPC-3 Lifecycle / Eval Closure 详细方案](./CPC-3-LIFECYCLE-EVAL-CLOSURE-DEVELOPMENT-PLAN.md)
已通过计划评审、实现、开发者门禁与独立 QA；repair.1 P2 修复经独立 re-QA P0～P3 全 0，用户已正式接受并
逐层关闭 repair.1、CPC-3 与 CPC 全线。Knowledge Provider、Memory、Effect Reconciliation、Desktop/Admin
仍未解锁，production CPC activation 继续 disabled。
