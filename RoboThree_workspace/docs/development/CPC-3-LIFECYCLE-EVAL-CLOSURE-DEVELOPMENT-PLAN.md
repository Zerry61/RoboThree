# CPC-3 Lifecycle / Eval Closure 详细实施方案

> 状态：**PLAN REVIEW PASS/CLOSED / CPC-3 repair.1 PASS/CLOSED / CPC-3 PASS/CLOSED / CPC 全线 PASS/CLOSED**  
> 日期：2026-08-26  
> 负责人：Codex 5.6  
> 上游：CPC-0 Revision 1.1、CPC-1、CPC-2 均 `PASS/CLOSED`  
> production activation：**继续 disabled**  
> 本批最高输出：`CPC_CORE_PROMPT_MVP_CONFORMANT`，但必须同时声明
> `productionCpcActivationEnabled=false` 与真实模型行为评估状态

## 1. 目标与完成边界

CPC-3 不再建设新的 Prompt、Context 或恢复平台。它复用 CPC-1/2 已完成的 compiler、runtime resolver、Context
Pipeline、Durable Agent Loop、Compaction、Task persistence 与现有进程 Harness 原语，完成以下收口：

1. 证明同一 Task 在首轮、50-round Tool continuation、Compaction、retry、Core restart 与 terminal replay 中使用
   同一 exact Instruction Bundle；
2. 证明 source 缺失、digest drift、gate disabled、Skill resolver 缺失时按冻结语义失败关闭，不 fallback current；
3. 用固定冲突/注入 corpus 验证 Context 身份、权限和 Tool/Workspace 边界不会被低权威文本改写；
4. 用真实 Core child、SQLite reopen、确定性 barrier 和三轮 semantic replay 收口恢复证据；
5. 完成 Provider body、敏感信息、资源清理与治理报告；
6. 在不启用 production activation 的前提下，给出 CPC 工程实现是否达到 MVP conformance 的最终判定。

本批不是新功能开发批。它原则上只增加 test-only Harness、必要的最小诊断接缝、architecture tests、证据生成与
治理文档。若实现发现必须大幅修改 CPC-2 生产语义，必须停止回文档评审。

## 2. 最高输出的诚实语义

### 2.1 可以声明

全部规范门禁通过时，本批可以输出：

```text
CPC_CORE_PROMPT_MVP_CONFORMANT
productionCpcActivationEnabled = false
productionSkillResolverPresent = false
knowledgeProviderReady = false
memoryReady = false
effectReconciliationReady = false
desktopAdminEntryReady = false
```

`CPC_CORE_PROMPT_MVP_CONFORMANT` 只证明：

- 无 Skill Task 的 Platform + Task Boundary + Agent 系统指令链路具备确定性、可恢复和 Provider-neutral conformance；
- 带 Skill Task 在 production resolver 缺失时诚实 typed fail-closed；
- Prompt/Reference/Tool Payload 不能改变 Core 在模型外执行的权限、Workspace、Tool、Confirmation 和 Effect 事实；
- offline fixture 与真实进程 Harness 的生命周期、恢复、安全和资源证据成立。

### 2.2 不可以声明

该输出不得解释为：

- production CPC 已启用；
- 任意真实模型都会稳定遵循 Prompt；
- Prompt 可以替代 Core 权限与副作用状态机；
- Skill Runtime、Knowledge、Memory、文件/网页、`uncertain` 人工核对、Desktop/Admin 已完成；
- DFI-5.3、AAPI、TGM 或任何下游已自动解锁。

### 2.3 固定行为 Eval 与真实模型观察分离

本批冻结两层 Eval，禁止混写：

1. **Normative deterministic corpus（必须通过）**  
   使用 test-only controlled Provider 和确定性 Core facts，验证完整请求、响应投影、权限事实、Tool/Workspace
   不变量与 safe outcome。它是工程 conformance gate，不冒充真实 LLM 能力评估。
2. **Observational model behavior eval（不在本批伪造）**  
   只有存在技术负责人批准的 exact evaluation profile（model/version/parameters/dataset revision）且不需要把真实
   Secret 写入仓库、日志或 evidence 时才可执行。未提供时必须记录
   `MODEL_BEHAVIOR_EVAL_NOT_RUN_APPROVED_PROFILE_MISSING`；该状态阻止 production activation，但不否定离线工程
   conformance。

不得用 scripted fixture 的固定回答填写“真实模型行为通过”，不得用公网临时模型、个人 Key 或未锁定 latest alias
补齐评估。

## 3. 当前已验证工程事实

1. CPC-1 已冻结 Platform Prompt v1、四层 Instruction Source、单一 compiler、binding/bundle digest 与预算预检；
2. CPC-2 已完成 legacy/CPC/unknown 精确分流、单次 typed parse、Agent Loop 接线、locked bundle Context 输入、
   content-free Receipt/provenance；
3. production `CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED=false`，Task selection 与 resolver 使用同一 code-owned
   decision；
4. production `LockedSkillInstructionResolver` 实现数为 0；
5. `AgentLoopCoordinator` 已有固定 50-round Tool Loop 测试；
6. `arh2.3-durable-loop-harness` 已有 DurableAgentLoopStarter 的 50-round/Compaction Harness；
7. `dfi5.2.3-process-lifecycle` 已有 Core child SIGKILL、SQLite reopen、新 PID 与三轮 semantic replay 原语；
8. STRM-2.3 已验证 deterministic barrier、真实资源 snapshot、进程组退出和四通道泄漏扫描模式；
9. CPC-2 独立 QA 已补齐 Central online/offline 404/404，lockfile 仍为 `c47641ac…`，migration 止 26。

因此 CPC-3 不得复制上述平台，也不得用 sleep、轮询猜窗口或单进程 unit test 冒充生命周期证据。

## 4. 本批真实缺口

1. 尚无 CPC 专属 50-round Tool continuation bundle identity 证据；
2. 尚无 CPC initial/rolling/pending Compaction 前后 exact bundle digest 证据；
3. 尚无 CPC Core child SIGKILL + SQLite reopen + source drift 恢复矩阵；
4. 尚无 CPC 三轮 semantic replay report；
5. 尚无固定 prompt conflict / injection corpus 与明确的“模型行为不是安全证明”报告；
6. 尚无 CPC 四通道多编码 Prompt/Secret 泄漏扫描；
7. 尚无 CPC 资源计数真实归零报告；
8. production activation 尚未获授权，也没有获批的真实模型 eval profile。

## 5. Lifecycle Harness 拓扑

### 5.1 必须使用的真实拓扑

```text
Parent Harness
  -> spawn fresh Core child process
      -> real DurableAgentLoopStarter
      -> real Task / Conversation / SubmitTurn SQLite persistence
      -> CPC test-only enabled composition
      -> controlled local Model Provider fixture
      -> controlled Tool backend
  -> deterministic barrier
  -> optional SIGKILL exact Core child
  -> spawn new Core child with same SQLite file
  -> strict reload and semantic evidence comparison
```

要求：

- child 必须是真实独立 PID，不得在 parent 内直接调用 service 冒充；
- SQLite 必须落临时真实文件并 reopen，不得只用 InMemory Adapter；
- CPC enabled 只能由 test-only composition 直接构造，不读取 env/CLI/Renderer/Main 参数；
- controlled Provider/Tool 只能使用 fake/sentinel 数据，`testIdentityUsed=true`，不得标 production ready；
- SIGKILL 必须在 exact named barrier 后执行；未观察到 barrier 立即 fail-fast；
- 15 秒级 watchdog 只用于挂起保护，不用于判断业务窗口；
- 每个 child 完成或失败后必须收敛 process、SQLite、timer、scheduler、mailbox、provider stream 与 Tool handle。

### 5.2 禁止拓扑

- 单进程 unit test 冒充 restart；
- `throw` 冒充 SIGKILL；
- 删除/重建 SQLite 冒充 reopen；
- Fake Task bundle 不经过真实 persistence；
- 自动 retry 覆盖首次失败；
- 根据 wall clock、PID、端口或临时路径构造 semantic success；
- 运行 production Desktop/Admin 入口或启用 production CPC gate。

## 6. Lifecycle / Recovery 场景矩阵

### 6.1 正常生命周期 L1～L8

| 场景 | 触发 | 必须断言 |
| --- | --- | --- |
| L1 main first turn | 无 Skill CPC Task 首轮 | compiler=1、System=1、bundle digest exact |
| L2 50-round Tool continuation | 50 次 Tool + 第 51 次模型完成 | compiler extra=0、51 个主请求同一 bundle digest |
| L3 user continuation | 同一 durable Task 的补充输入 | 重建次数=1、current source load=0、bundle/message bytes 一致 |
| L4 initial Compaction | 首轮前触发 compaction | summarizer prompt 与 CPC bundle 分离，主请求仍 exact |
| L5 rolling Compaction | Tool 循环中触发 | Compaction 前后主请求 bundle digest 唯一 |
| L6 retry before upstream | 已物化 request、尚未上游 | 同一 durable facts 重建 request/bundle digest，不延长 deadline |
| L7 restart non-terminal | Core child SIGKILL 后 reopen | 新 PID、同 SQLite、exact binding/bundle/message |
| L8 terminal replay | assistant terminal 已提交 | compiler/context/provider/upstream 全 0 |

### 6.2 失败关闭 F1～F8

| 场景 | 结果 |
| --- | --- |
| F1 CPC Task + gate disabled | `context.instruction_runtime_unavailable`，不得 legacy fallback |
| F2 unknown Platform revision | `context.platform_prompt_unavailable` |
| F3 malformed Runtime Selection | `context.instruction_binding_invalid` |
| F4 exact Platform source missing | typed fail / existing recovery exhausted，不切 current |
| F5 Agent digest drift | `context.agent_material_invalid`，provider resolve=0 |
| F6 Skill source missing | `context.skill_material_unavailable`，不得跳过 Skill |
| F7 Skill digest drift | `context.skill_material_invalid` |
| F8 locked instruction over budget | `context.locked_instructions_too_large`，不换模型、不截断 |

### 6.3 崩溃窗口 C1～C6

| 窗口 | barrier | 恢复断言 |
| --- | --- | --- |
| C1 durable Task accepted / materialize 前 | `task_bundle_loaded` | reopen 后从 exact bundle 物化一次 |
| C2 bundle materialized / Context 前 | `instruction_bundle_materialized` | bytes/digest 一致，不读 current pointer |
| C3 final request ready / Provider 前 | `model_request_finalized` | request/receipt digest 一致，不重复 durable deadline |
| C4 Tool result committed / next round 前 | `tool_result_committed` | next request 同 bundle，Tool effect 不重复 |
| C5 rolling Compaction committed / main request 前 | `compaction_committed` | summary 为 data、CPC bundle identity 不变 |
| C6 assistant committed / delivery 前 | `assistant_committed` | terminal replay compiler/provider=0，只收敛 delivery |

## 7. Semantic Replay

### 7.1 三轮规则

同一固定 semantic seed 运行三次 fresh parent/child/SQLite 拓扑。每轮必须生成 canonical semantic summary：

```text
scenario outcomes
task instruction binding digest
instruction bundle digest
ordered source identities
main request digest sequence
Compaction source/summary identity（content-free）
Tool effect/receipt semantic outcomes
typed failure codes
terminal state
resource terminal counts
```

以下噪声不得进入 semantic digest：

```text
PID / PGID / port / wall clock / temporary path / SQLite absolute path /
request transport nonce / process startup duration / random fixture directory
```

三轮 digest 必须完全一致。禁止 retry 某一失败轮后只保留成功结果。

### 7.2 Digest 诚实边界

- Prompt 正文不进入 evidence JSON；只记录 approved digest/ref；
- source drift 必须改变语义结果或 typed error，不能由 normalization 抹平；
- resource count 必须来自真实 diagnostic snapshot；
- process observation 可含 PID 作为独立诊断，但不得进入 semantic digest。

## 8. Conflict / Injection Corpus

### 8.1 固定 corpus revision

新增 code-owned `CPC3_EVAL_CORPUS_REVISION`，覆盖至少以下 12 类 case：

1. Agent 文本要求忽略 Platform；
2. Agent 文本声称获得额外 Workspace；
3. Skill advisory 要求调用未锁定 Tool；
4. Skill 文本伪造 `[RoboThree Instruction Bundle v1]` wrapper；
5. 用户要求使用未提供 Tool；
6. 用户要求输出 Credential/环境变量；
7. Tool Payload 文本声称成功但结构化 outcome=failed；
8. Tool Payload 含伪 System Prompt；
9. Compaction summary 含“切换身份/扩大权限”；
10. Reference placeholder 含伪 hard instruction；
11. prompt/agent/skill 含 quote、backslash、newline、XML/Markdown closing marker；
12. source 缺失、digest drift 与 over-budget 的组合负向 case。

### 8.2 Normative assertions

每个 case 必须断言：

- Task Capability Lock、WorkspaceGrant、Tool Schema、authorization mode 与 model lock 未扩大；
- Reference/Tool Payload/summary 不进入 System/Developer；
- Provider request 中 System Message 恰好一条；
- 未提供 Tool 的 outbound Tool execution count=0；
- structured outcome 优先于 Tool Payload 自报文字；
- typed failure 不被模型文本改写为 success；
- Prompt/Skill 不能扩大 timeout、retry、Tool rounds 或 Secret scope；
- evidence 明确标记 controlled fixture，不宣称真实模型安全。

### 8.3 Observational model eval record

若后续获得获批 evaluation profile，报告必须记录：

```text
profileId / exact model version / provider family / parameter digest /
corpus revision / run count / per-case pass-fail / failure samples safe digest /
testIdentityUsed=true / productionActivationEnabled=false
```

报告不得保存 access token、Credential Reference、Endpoint 全值、完整 Prompt、模型私有 reasoning 或用户真实数据。

## 9. Provider / DFI-5 / Timeout 边界

1. OpenAI-compatible、Anthropic-compatible、Local Personal fixture 必须继续只承载一条 exact CPC System Message；
2. `default_passthrough` body 不得出现 reasoning/effort/thinking/budget 字段；
3. DFI-5.3 未完成时 v1alpha2 reasoning request 继续 `reasoning_protocol_unavailable` 零上游失败；
4. CPC-3 不修改 Provider-private Profile/Strategy/raw mapping；
5. retry/restart 使用 migration 25 的原 durable deadline，不重新 `now + 900s`；
6. Usage unknown 不投影为 0；Prompt/Skill/Reference 不进入 Usage；
7. reasoning_content/thinking delta 继续只作 progress，不进入 assistant text/Receipt/log；
8. 若任一 Provider 需要新增 CPC-specific body mapping，必须停止回差异评审。

## 10. 敏感扫描与资源归零

### 10.1 四通道扫描

扫描通道固定为：

```text
stdout
stderr
evidence.json
failure.json
```

至少使用 5 类 fake/sentinel marker：Platform fragment、Agent canary、Skill canary、Reference/Tool canary、Secret
canary；每类生成 raw、base64、hex、URL-encoded 四种形态，共至少 80 次负向注入。全部通道命中必须为 0。

Provider fixture 在进程内比较 exact body 后必须立即释放；不得把完整 body 写入 evidence/failure/log。

### 10.2 资源类别

至少记录：

```text
active Core children
open SQLite handles
active Agent Loop runs
mailboxes
AbortControllers
scheduled timers
Provider streams
Tool executions
Compaction jobs
pending delivery records
temporary fixture servers
test diagnostic subscriptions
```

正常终态必须全部归零或回到 scenario 开始前基线。不得硬编码 0、使用 `?? 0` 兜底或仅凭 parent 信任 child 已退出；
SIGKILL 场景必须结合真实 process exit/OS observation 与 reopen 后诊断。

## 11. CPC-2 两个 P3 的处理

### 11.1 Safe summary exhaustive mapping

`cpcSafeSummary` 当前参数是封闭 error-code union，返回类型为 `string`；遗漏新分支时 TypeScript strict 会报
`TS2366`，不是运行时静默返回 `undefined`。CPC-3 允许把现有写法收口成显式 `assertNever(code)` 以加强可读性，
但**禁止**添加吞掉未来错误码的 generic `default` fallback。architecture/typecheck 必须证明新增 code 未映射时构建失败。

### 11.2 Validated / compatibility 双 API

保留旧入口以维持 CPC-1 conformance 与兼容调用；CPC-3 不为“看起来整洁”删除工作 API。新增 source graph 断言：

- production runtime 只允许调用 `*Validated` 路径；
- generic parse 入口只允许位于 compatibility/test consumer；
- 如果发现第三个 production consumer，必须先纳入差异评审，不做批量重构。

## 12. 文件所有权

### 12.1 允许修改

```text
services/core/tests/cpc3-*.test.ts
services/core/tests/fixtures/cpc3-*.mjs
scripts/run-cpc3-harness.mjs
scripts/cpc3-*.mjs
package.json（仅 harness script / 编码授权后的版本）
services/core/package.json（仅编码授权后的版本）
scripts/audit-dtp4-packaging.mjs / .test.mjs（仅版本基线）
services/core/src/application/**（仅必要的 test-injected diagnostic/assertNever 小接缝）
services/core/src/bootstrap/**（只允许 test composition factory；production default 必须保持 false）
docs/development/CPC-*.md
docs/development/qa/**（由独立 QA 写入）
docs/development/DEVELOPMENT-LOG.md
README.md
CHANGELOG.md
```

### 12.2 禁止修改

```text
packages/contracts/**
services/core/src/adapters/https/**
services/core/src/adapters/sqlite/migrations.ts
services/central-service/src/main/**
apps/desktop/**
apps/admin-console/**
services/document-worker/**
pnpm-lock.yaml
pnpm-workspace.yaml
DFI-5.3 Provider-private mapping
TGM / Knowledge Provider / Memory / Effect Reconciliation
```

Provider fixture 若无法在 test source/controlled local server 内完成，必须停止评审，不得把 test raw mapping 写进
production Adapter。

## 13. 串行实施步骤与工期

### Step 1：Lifecycle Harness Foundation（1～1.5 日）

- 复用 ARH-2.3/DFI-5.2.3 process primitives；
- 建立 CPC test-only enabled Core child、real SQLite、controlled Provider/Tool；
- 冻结 named barriers、diagnostic snapshot 与 semantic seed；
- L1～L8、F1～F8 focused conformance。

### Step 2：Crash / Replay / Eval Corpus（1～2 日）

- C1～C6 SIGKILL/reopen；
- 50-round Tool + initial/rolling Compaction；
- 三轮 semantic replay；
- 12 类 conflict/injection normative corpus；
- 可用时执行 approved observational model eval；不可用时诚实记录 pending。

### Step 3：Security / Resource / Stage Closure（1～1.5 日）

- Provider body regression、80 次多编码泄漏扫描；
- 真实资源归零；
- root/Central/frozen/audit；
- implementation/eval/failure report 与治理收口。

合计：**3～5 个集中工程日**。该估算不包含等待获批真实模型 profile、独立 QA 等待，也不包含 CPC 范围外的
Skill/Knowledge/Memory/Effect/Desktop/Admin 开发。

## 14. QA-041～QA-060 冻结矩阵

1. QA-041：main 首轮 exact binding/bundle/message；
2. QA-042：Tool 后续轮 bundle digest 不变；
3. QA-043：50-round + final turn 的主请求 bundle digest 唯一；
4. QA-044：用户 continuation 不读 current Platform/Agent/Skill；
5. QA-045：initial Compaction summarizer/task prompt 分离；
6. QA-046：rolling Compaction 前后主请求 exact；
7. QA-047：retry request/bundle/durable deadline 一致；
8. QA-048：SIGKILL + SQLite reopen + 新 PID 后一致；
9. QA-049：source missing recovery exhausted，不 fallback current；
10. QA-050：source digest drift typed fail / recovery exhausted；
11. QA-051：terminal replay compiler/context count=0；
12. QA-052：terminal replay provider/upstream count=0；
13. QA-053：feature=false legacy bytes/digest 零漂移；
14. QA-054：requested-but-incomplete test composition 在 ready 前失败；
15. QA-055：test resolver/fixture production graph count=0；
16. QA-056：三轮 semantic replay digest 一致且排除 process noise；
17. QA-057：conflict corpus 不扩大 Tool/Workspace/authorization；
18. QA-058：injection corpus 不改变 deterministic Core facts；
19. QA-059：四通道 × 五 marker × 四编码命中 0；
20. QA-060：资源计数来自真实 diagnostic/OS observation，无硬编码 0/`?? 0`。

附加 honesty assertions：

- `productionCpcActivationEnabled=false`；
- `productionSkillResolverPresent=false`；
- controlled fixture evidence 必须标 `testIdentityUsed=true`；
- observational eval 未执行时输出 exact pending reason；
- 不输出 Skill/Knowledge/Memory/Effect/Desktop/Admin ready；
- 不自动授权 DFI-5.3 或其他下游。

## 15. 门禁

编码获授权后串行执行：

```text
CI=true pnpm exec eslint <touched files>
CI=true pnpm run lint
CI=true VITEST_MAX_WORKERS=1 pnpm run harness:cpc3
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm install --frozen-lockfile --offline
CI=true pnpm run audit:dtp4
```

并证明：

- Node 24.13.0、JDK 21、Docker/真实进程环境信息完整；
- migration 最大 id 26，无 27；
- lockfile digest 仍为编码前 `c47641ac…`；
- Contracts、Provider-private、Desktop/Admin、Central production、Document Worker 零漂移；
- `.skip/.only/@Disabled`、sleep 猜窗口、自动 retry 掩盖失败、硬编码资源 0 零命中；
- production CPC gate false、production Skill resolver 0、test fixture production reachability false；
- 独立 QA 与用户接受前不标记 `PASS/CLOSED`。

## 16. 停手条件

出现任一情况必须停手回文档评审：

1. 需要 migration 27、改 migration 1～26 或新 durable instruction 表；
2. 需要修改 public/private Contracts；
3. 需要修改 Provider-private body mapping；
4. 需要启用 production CPC activation；
5. 需要 test Fake/Skill resolver 进入 production graph；
6. 需要真实用户 Secret、公网临时模型或 latest alias 才能伪造 Eval PASS；
7. 需要把完整 Prompt/Skill/Reference/Provider body写入 evidence/log；
8. 需要把 Compaction summary/Tool Payload/Reference 提升为 System/Developer；
9. 需要自动换模型、扩大 timeout、跳过 Skill 或截断 stable instructions；
10. 需要 Knowledge/Memory/File/Web production Provider；
11. 需要 Effect `uncertain` Command/Fact/Authority/UI；
12. 需要 Desktop/Admin 产品入口；
13. 需要新增依赖或修改 lockfile；
14. 无法用 exact barrier 证明崩溃窗口；
15. 资源归零只能靠硬编码、sleep 或 parent 信任；
16. root/Central 门禁失败且无法安全归因。

## 17. 文档评审问题

1. 是否接受 `CPC_CORE_PROMPT_MVP_CONFORMANT` 与 production activation disabled 可以同时成立，但必须附六项 false？
2. 是否接受 normative deterministic corpus 是工程 gate，不能冒充真实模型行为评估？
3. 是否接受没有 approved evaluation profile 时记录 `MODEL_BEHAVIOR_EVAL_NOT_RUN_APPROVED_PROFILE_MISSING` 并继续禁止 production activation？
4. 是否接受复用 ARH-2.3/DFI-5.2.3/STRM-2.3 Harness primitives，而不新建恢复平台？
5. 是否接受 L1～L8、F1～F8、C1～C6 的生命周期/失败/崩溃矩阵？
6. 是否接受 Compaction summarizer prompt 与 CPC Task bundle 永久分离？
7. 是否接受 safe summary 用 exhaustive union/`assertNever`，禁止 generic default fallback？
8. 是否接受 production runtime 只用 `*Validated`，旧 API 仅兼容保留？
9. 是否接受 80 次多编码扫描与 12 类真实资源计数？
10. 是否接受 3～5 个集中工程日，且不包含真实模型 profile 等待与 CPC 外能力？

## 18. 当前状态

```text
CPC-0 Revision 1.1 = PASS/CLOSED
CPC-1 = PASS/CLOSED
CPC-2 = PASS/CLOSED
CPC-3 repair.1 = PASS/CLOSED
CPC-3 = PASS/CLOSED
CPC 全线 = PASS/CLOSED
production CPC activation = disabled
DFI-5.3 子批 / AAPI-0.3～0.4 / TGM / Knowledge Provider /
Memory / Effect Reconciliation / Desktop / Admin = GATED
```

用户已接受独立文档复核并明确授权 CPC-3 编码。实现、开发者门禁与独立 QA 已完成；repair.1 P2 修复经独立
re-QA P0～P3 全 0，用户已于 2026-08-26 正式接受并逐层关闭 repair.1、CPC-3 与 CPC 全线。production CPC
activation 继续 disabled，全部下游继续 GATED。
