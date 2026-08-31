# DFI-5.4.0 Contract / Durable Resolution / Production Release Authority 前置聚焦确认

> 状态：**FOCUSED DIFFERENCE REVIEW PASS/CLOSED**
> 日期：2026-08-27
> 负责人：Codex 5.6
> 上游：[DFI-5.4 Desktop Max UI / Safe Preview / Production Cutover 详细实施方案](./DFI-5.4-DESKTOP-MAX-UI-PRODUCTION-CUTOVER-DEVELOPMENT-PLAN.md)
> 上游状态：DFI-5.4 计划评审 `PASS/CLOSED`
> 本文性质：docs-only 前置确认；不创建 Contract、Core、Main、Preload、Renderer、Provider release、测试或 Harness

## 0. 结论先行

DFI-5.4 的产品方向与分批顺序成立，但编码前不能只按父方案原文新增 Desktop SubmitTurn v1alpha4 和
coordination v1alpha5。聚焦代码核查发现两个必须先关闭的可编码性阻断：

1. 现有 `ReasoningModeLock v1alpha1` 只能表达 `default_passthrough`、`max_applied`、
   `max_unsupported_default` 与 `max_capability_unknown_default`，不能诚实表达“Preview 曾证明 supported，
   但 accept 时 support 已漂移”或“support 仍为 supported，但 exact Provider mapping admission 不可用”后按模型
   默认模式继续。若只扩 Desktop Receipt，会造成 UI Receipt、durable lock、Runtime Selection 与 Provider body
   四层事实不一致；
2. Local Personal release 的 `exactSubject` 含 Task Model lock、Adapter descriptor revision 与用户 Personal Model
   的 `personalExecutionDefinitionDigest`。它是运行时绑定到具体用户配置的 exact fact，不存在一个能预先覆盖所有
   用户 Endpoint/Model/Credential binding 的通用 exact release digest。

因此本文冻结以下边界：

- DFI-5.4 父方案的产品目标、真实 Desktop E2E、零 raw mapping 泄漏与 production 三态 gate 继续有效；
- 父方案 §3 的“只新增 Desktop v1alpha4 + coordination v1alpha5 即可承载 best-effort”改为**待聚焦复核的版本链**；
- 父方案 §4 的“编码前预先冻结一个通用 exact Local Personal release”改为“冻结 code-owned admission policy，
  再对具体 immutable Personal Model subject 确定性物化 exact release”；
- 在 durable version path 与首个 Provider release admission 都通过聚焦复核前，production release count、
  SubmitTurn Max route 与 Desktop Max UI 必须继续为 0/不可达；
- 用户已正式选择方案 A：先完成最小 Desktop v2 / R2D production consumption，禁止建立 legacy Runtime
  Selection 分支；
- Receipt summary 的 additive 扩展本身允许，但必须与 ReasoningModeLock v1alpha2、对应 Runtime Selection 与
  coordination additive version 同时演进。禁止只扩 Receipt，也禁止重新发明一组同义字段；
- DFI-5.4.0 当前正式 `PASS/CLOSED`；详细前置顺序由
  [方案 A 前置详细计划](./DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md) 控制，
  DFI-5.4.1 仍不自动解锁。

## 1. 既有字段与历史版本事实

### 1.1 Desktop v1alpha3 的 exact 字段

现有字段不是同名对象，必须逐层映射：

| 层 | 既有字段 | 冻结解释 |
| --- | --- | --- |
| Preview response | `maxSupport` / `maxSupportRevision` | Core 当前投影的三态支持事实 |
| SubmitTurn max request | `observedMaxSupport` / `observedMaxSupportRevision` | Renderer 提交其实际观察到的 exact revision |
| SubmitTurn Receipt | `requestedMode` / `resolvedMode` / `resolutionReason` | v1alpha3 已有 safe 结果摘要；不是 v1alpha4 新增整个 `resolutionReason` 字段 |
| Error | `reasoning_selection_stale` 等 | v1alpha3 的 stale + zero Task side effect 历史语义 |

DFI-5.4 v1alpha4 若继续推进，应在上述字段上 additive 扩展 `resolutionReason` 枚举及 durable evidence，而不是
重新发明一组同义字段。v1alpha1～v1alpha3 source、built artifacts、fixture 与 historical Harness 必须零漂移。

### 1.2 coordination v1alpha4 的真实来源

现有 submit-turn coordination v1alpha4 由 R2D-3.1 引入 Contract，并由 R2D-3.3 完成 durable acceptance / Task
bundle 接线；它不是 DFI-5.2 的历史版本。v1alpha4 绑定：

- Resource Entitlement Snapshot；
- Agent Resource Decision；
- Runtime Selection v1alpha3；
- Authorization / Execution / Task Bundle / Instruction Binding digests；
- Model/Tool/Reasoning lock identities；
- durable acceptance identity。

production `r2dCoreDeltaEnabled=false` 时，这些 R2D authority 不可伪造。DFI-5.4 不能仅为了复用“最高版本号”
而生成 fixture Entitlement/Decision 或打开 R2D gate。

### 1.3 durable lock 缺失的两个诚实 variant

若产品继续采用 best-effort 语义，至少需要能持久表达：

```text
max_support_changed_default
max_mapping_unavailable_default
```

两者都必须保留原始 `observedMaxSupport=supported`、原始 observation revision、accept 时的安全 resolution evidence
以及 exact Model lock。禁止把它们伪装为既有 `max_capability_unknown_default` 或
`max_unsupported_default`，因为那会改写用户实际观察到的事实。

## 2. 推荐的 additive Contract 形状

### 2.1 Desktop Local v1alpha4

v1alpha4 request 继续沿用 v1alpha3 的 observation 字段。Receipt 在既有 strict summary 上 additive 扩展：

```text
resolutionReason =
  requested_default
  | applied
  | unsupported
  | capability_unknown
  | support_changed_default
  | mapping_unavailable_default
```

建议增加 content-free 的 `reasoningResolutionRevision` / `reasoningResolutionDigest`，用于把 Receipt 与 durable
resolution exact 绑定；不得包含 Profile 原文、Strategy raw parameter、Endpoint、Credential reference、budget、
thinking 或 effort。

v1alpha4 的错误边界：

- Max-only support drift：可解析为 `support_changed_default`；
- exact mapping 在首次 accepted plan 前安全不可用：可解析为 `mapping_unavailable_default`；
- Model/Agent/Workspace/entitlement/authorization 不合法：沿用 typed reject；
- Profile、mapping、lock、record 或 digest 损坏：typed fail-closed；
- Credential、Endpoint 或网络失败发生于 durable Task commit 后：沿用 Provider/Invocation failure，不得改写为
  “模型默认模式已正常运行”。

### 2.2 ReasoningModeLock additive version

推荐新增 `ReasoningModeLock v1alpha2`，保留 v1alpha1 四个 strict variant，并新增上节两个 fallback variant。
每个新 variant 必须包含：

- exact Task / Model lock identity；
- 原始 supported observation + revision；
- safe resolution reason；
- accept-time resolution evidence revision/digest；
- `lockedAt`；
- 不得携带 raw mapping。

v1alpha1 helper、digest corpus 与所有 DFI-5.2/DFI-5.3 historical evidence 继续只读。

### 2.3 Runtime Selection / coordination 的版本分叉

当前存在两条事实链：

```text
Desktop legacy production path
  → Runtime Selection v1alpha2 + ReasoningModeLock v1alpha1
  → coordination v1alpha3

R2D test/conformance path
  → Runtime Selection v1alpha3 + ReasoningModeLock v1alpha1
  → coordination v1alpha4
```

DFI-5.4 必须在编码前选择且只选择一条：

#### 方案 A（推荐）：先完成 Desktop v2 / R2D production consumption

- Runtime Selection additive 新版从 R2D v1alpha3 演进并嵌入 ReasoningModeLock v1alpha2；
- coordination additive 新版从 v1alpha4 演进；
- 一个 durable resource plan 同时承载 Agent/Resource 与 Max resolution；
- 不产生临时 legacy 分支，后续维护成本最低。

代价：需要先单独评审并授权当前仍 GATED 的 Desktop v2 / R2D production consumption，不能由 DFI-5.4
静默打开。

该路线现已由用户正式选择。既有治理锚点为
[R2D-3 Runtime Selection / Entitlement / Atomic Acceptance](../R2D-3-RUNTIME-SELECTION-ENTITLEMENT-ATOMIC-ACCEPTANCE-DEVELOPMENT-PLAN.md)
与[后端 / Desktop / Admin 接口解阻优先级](../BACKEND-FRONTEND-INTERFACE-UNBLOCK-PRIORITY-2026-08-27.md)；
后续以[方案 A 前置详细计划](./DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md)为准。

#### 方案 B（不推荐）：从 legacy production path 建 additive 分支

- 新 Runtime Selection 版本从 v1alpha2 演进，仅升级 ReasoningModeLock；
- 新 coordination 版本从 v1alpha3 演进；
- production R2D gate 仍 false。

代价：版本号会形成两条语义分支，未来 R2D cutover 还需再做一次合流和双族 readable dispatch。只有在用户明确
要求 Max UI 优先于 R2D production consumption 时才考虑；不得由实现者自行选择。

禁止第三种做法：只升级 Desktop Receipt、把 durable lock 留在 v1alpha1，或创建不进 selection digest 的第二套
临时 Max lock。

## 3. Production Local Personal release authority

### 3.1 exact subject 不是通用常量

当前 `ReasoningProfileSubject` 的 Local Personal identity 包括：

```text
modelCapabilityId
modelCapabilityRevision
adapterDescriptorId
adapterDescriptorRevision
authority = local_personal
personalExecutionDefinitionDigest
```

其中 `personalExecutionDefinitionDigest` 绑定用户的 immutable Personal Model definition。一个 code-owned 常量
无法同时等于所有用户配置，因此父方案“冻结一个通用 exact subject/digest”不能直接实现。

### 3.2 冻结两层 authority

推荐分成两层，且禁止互相替代：

1. **Code-owned Provider Admission Policy**：冻结 Provider/API family、允许的 canonical endpoint identity 规则、
   provider model ID allowlist、Adapter descriptor revision、request projector revision、Profile/Strategy template、
   timeout policy、Usage/SSE/[DONE]/Tool continuation 规则及 immutable evidence manifest digest；
2. **Exact Subject-bound Release**：Core 在 Task Model lock 与 Personal Model definition 都通过完整性验证后，按上层
   policy 对具体 subject 确定性物化 Profile/Strategy/mapping release；物化结果的 revision/digest 进入 durable plan，
   retry/restart 不重算为 current policy。

Policy 不得读取或记录明文 Secret；exact release 不得从显示名称、自由文本 Provider 名、Renderer 自报或 Endpoint
字符串相似性猜测。

### 3.3 当前候选审计结论

截至 2026-08-27，本轮只使用 Provider 官方公开文档作设计核查，尚未形成 immutable repo evidence manifest：

| 候选 | 官方事实 | 与当前实现的差异 | 当前结论 |
| --- | --- | --- | --- |
| DeepSeek V4 Chat Completions | 官方 Thinking Mode 文档提供 `thinking.enabled` 与 `reasoning_effort`；API 参考列出 `low/high/max`，并说明兼容 `xhigh` 会映射到 `high` | 当前 sealed Local projector 仅允许 `high/xhigh`，没有 `max` 或 `thinking`；Tool continuation 还需保留官方要求的 reasoning content，而当前产品只把它当 progress | 不得作为首个 production Max release |
| OpenAI GPT-5.2 Chat Completions | 官方模型页列出 `none/low/medium/high/xhigh` 与 exact snapshot | 当前 Local Personal generic body/token-field、exact Endpoint/profile 与 subject-bound release 尚无本批 conformance | 候选，尚未 admitted |
| 其他 OpenAI-compatible 自定义模型 | 无本轮逐模型 immutable evidence | family/营销名称不证明支持 | `unknown` |

官方设计核查来源：

- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [DeepSeek Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion/)
- [OpenAI GPT-5.2 model](https://developers.openai.com/api/docs/models/gpt-5.2)
- [OpenAI reasoning effort guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2)

公开网页会变化，URL 本身不能充当 immutable release evidence。正式 admission 必须把允许使用的官方事实提炼成
content-addressed manifest，独立评审后进入 source graph。

### 3.4 首个 release 的进入条件

在以下条件全部成立前：

```text
productionSupportedReleaseCount = 0
max_reasoning_mode feature = absent
production SubmitTurn Max route = 0
Desktop production Max control = unavailable
```

进入条件：

1. 选定一个 exact Provider/API/model snapshot；
2. immutable evidence manifest 独立复核通过；
3. 当前 sealed projector 能表达最强模式，或先单独评审 Provider mapping additive revision；
4. default body omission、Max body mapping、Usage、SSE terminal、Tool continuation 与 timeout 都有真实受控 fixture；
5. policy → exact user subject materialization 的确定性、Secret 零泄漏与 restart exact reuse 有 Harness；
6. production composition 只有一个 release authority，缺失/重复/损坏在 route ready 前失败关闭。

## 4. 修订后的执行顺序

```text
DFI-5.4 父方案                       PLAN REVIEW PASS/CLOSED
  ↓
DFI-5.4.0 本前置确认                 PASS/CLOSED；方案 A 已选定
  ├─ 最小 R2D production consumption 独立方案、评审、授权、QA
  ├─ 选定首个 Provider candidate
  └─ 冻结 admission policy / exact subject materialization
  ↓
必要时 Provider mapping additive revision  单独方案、评审、授权、QA
  ↓
DFI-5.4.1 Contract/Core/release/gate  单独授权
  ↓
DFI-5.4.2 HTTP/Main/Preload            单独授权
  ↓
DFI-5.4.3 Renderer/E2E/closure         单独授权
```

任何 Provider mapping additive revision 都必须独立成批、独立评审、独立授权、独立 QA；不得在
DFI-5.4.1～5.4.3 内静默实现。

本前置确认通过前，不给出 DFI-5.4.1 的最终工期承诺。父方案 12～21 日仅保留为早期区间；若需要 Provider
mapping revision 或先完成 R2D production consumption，必须在对应方案中单独估算，不能藏进 UI 工期。

## 5. 聚焦 QA 矩阵（48 项）

### 5.1 既有字段与零漂移（QA-001～QA-012）

1. QA-001：Preview 使用 `maxSupport/maxSupportRevision`。
2. QA-002：SubmitTurn max request 使用 `observedMaxSupport/observedMaxSupportRevision`。
3. QA-003：v1alpha3 Receipt 已有 `resolutionReason`。
4. QA-004：v1alpha3 stale error 继续存在且语义零漂移。
5. QA-005：v1alpha1～v1alpha3 source hash 零漂移。
6. QA-006：ReasoningModeLock v1alpha1 四个 variant 零漂移。
7. QA-007：Runtime Selection v1alpha2 source/digest 零漂移。
8. QA-008：Runtime Selection v1alpha3 source/digest 零漂移。
9. QA-009：coordination v1alpha3 source/digest 零漂移。
10. QA-010：coordination v1alpha4 source/digest 零漂移。
11. QA-011：DFI-5.2/5.3 historical evidence 零漂移。
12. QA-012：根入口不静默扩为新 readable union。

### 5.2 best-effort durable 语义（QA-013～QA-024）

13. QA-013：`support_changed_default` 保留原 supported observation。
14. QA-014：`mapping_unavailable_default` 保留原 supported observation。
15. QA-015：两个 fallback 不冒充 unsupported/unknown。
16. QA-016：两个 fallback 都绑定 exact Model lock。
17. QA-017：两个 fallback 都有 content-free resolution digest。
18. QA-018：Desktop Receipt digest 等于 durable resolution digest。
19. QA-019：Task Runtime Selection digest 覆盖 exact final lock。
20. QA-020：coordination accepted plan 覆盖 exact final lock/digest。
21. QA-021：accepted 后 recovery 不读 current Profile/mapping。
22. QA-022：integrity failure 不降级。
23. QA-023：Model/Agent/authorization failure 不降级。
24. QA-024：Provider 网络失败不伪装为模型默认成功。

### 5.3 Release authority（QA-025～QA-036）

25. QA-025：code-owned policy 与 exact subject-bound release 分层。
26. QA-026：Personal execution digest 进入 exact subject。
27. QA-027：显示名称不能证明 supported。
28. QA-028：自由 Endpoint 文本不能证明 supported。
29. QA-029：Renderer/Main 不能提供 admission。
30. QA-030：policy evidence manifest content-addressed。
31. QA-031：公开 URL 不直接作为 immutable revision。
32. QA-032：最强模式能由 sealed projector exact 表达。
33. QA-033：default body reasoning 字段数为 0。
34. QA-034：Tool continuation 与 private reasoning 规则有证据。
35. QA-035：release 缺失/重复/损坏在 upstream 前失败关闭。
36. QA-036：retry/restart 复用 original release digest。

### 5.4 边界与治理（QA-037～QA-048）

37. QA-037：production release count 仍为 0。
38. QA-038：production SubmitTurn Max route count 仍为 0。
39. QA-039：Desktop production Max control 仍不可达。
40. QA-040：production CPC activation 仍 false。
41. QA-041：production R2D gate 仍 false，除非用户另行授权方案 A。
42. QA-042：production enterprise entitlement 仍 false。
43. QA-043：Contracts/Core/Main/Preload/Renderer 本轮零修改。
44. QA-044：migration 仍止 26。
45. QA-045：lockfile digest 不变。
46. QA-046：TGM/Knowledge Provider/Agent Lifecycle 继续 GATED。
47. QA-047：Desktop/Admin v2 consumption 继续 GATED，除非用户另行调整优先级。
48. QA-048：本前置确认不输出 `DFI5_MAX_REASONING_MODE_CONFORMANT`。

## 6. 聚焦评审问题

1. 是否接受 DFI-5.4 父方案评审关闭，但以本文作为 DFI-5.4.0 后续实施的 controlling addendum？
2. 是否确认现有 v1alpha1 lock 无法诚实表达两个新 fallback，禁止只扩 Receipt？
3. 是否接受新增 ReasoningModeLock v1alpha2，而不是复用 unsupported/unknown variant？
4. durable version path 是否选择推荐方案 A；若不提前解锁 R2D consumption，是否明确接受方案 B 的临时分支债务？
5. 是否接受 code-owned admission policy + runtime exact subject-bound release 两层 authority？
6. 是否确认当前没有 production Local Personal release candidate 已满足全部准入条件？
7. 是否同意 DeepSeek V4 在当前 projector/Tool continuation 缺口关闭前不得宣称 Max supported？
8. 是否接受 DFI-5.4.1 继续 GATED，待本确认和必要 Provider mapping revision 完成后再授权？

## 7. 停手条件

出现任一情况立即停止并回评审：

1. 需要原地改 v1alpha1～v1alpha3 Contract 或 historical digest；
2. 需要把新 fallback 填进旧 unsupported/unknown variant；
3. 需要创建不进 Task Runtime Selection digest 的第二套 Max lock；
4. 需要在 R2D gate false 时补造 Entitlement/Decision；
5. 无法选择单一 durable version path；
6. production release 只能按显示名、Endpoint 或营销文本猜测；
7. 最强 Provider 模式无法由 sealed projector 表达；
8. Tool continuation 需要保存 private reasoning，但安全边界未评审；
9. 需要真实用户 Secret 或公网付费调用才能完成基本 conformance；
10. 需要新增 migration、依赖或修改 lockfile；
11. Renderer/Main/Preload 必须接触 raw effort/thinking/budget；
12. production release count 仍为 0 却要求显示可用 Max；
13. 需要顺带解锁 TGM、Knowledge Provider、Agent Lifecycle 或 Admin mutation；
14. root check 因并发窗口漂移且不能安全归因。

## 8. 当前状态

```text
DFI-5.4 parent plan                PLAN REVIEW PASS/CLOSED
DFI-5.4.0                         FOCUSED DIFFERENCE REVIEW PASS/CLOSED
Scheme A prerequisite plan       DOCUMENT REVIEW PENDING / CODING GATED
DFI-5.4.1～DFI-5.4.3               GATED
productionSupportedReleaseCount  0
production SubmitTurn Max route  0
Desktop production Max UI        false
production CPC activation        false
production R2D gate              false
production enterprise entitlement false
TGM / Knowledge / Agent Lifecycle GATED
Desktop minimal R2D consumption  DOCUMENT REVIEW PENDING / CODING GATED
Admin v2 consumption             GATED
```
