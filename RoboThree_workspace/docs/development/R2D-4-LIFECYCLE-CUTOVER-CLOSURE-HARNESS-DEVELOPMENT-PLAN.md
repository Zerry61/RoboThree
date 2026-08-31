# R2D-4 Lifecycle / Cutover / Closure Harness 详细实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-27  
> 负责人：Codex 5.6  
> 计划代号：`R2D-4`  
> 上游：R2D-0～R2D-3 全部 `PASS/CLOSED`；CPC、DFI-5.2 全部 `PASS/CLOSED`  
> production gates：CPC activation=false；R2D gate=false；enterprise entitlement=false  
> 本批性质：closure-only；不构成 production activation 或下游解锁授权  
> 本批最高允许输出：`R2D_CORE_DELTA_CONFORMANT`

## 0. 结论摘要

R2D-1～R2D-3 已分别交付 Dynamic Request Facts、Agent Definition v1alpha2、可信资源交集、Runtime Selection
v1alpha3、coordination v1alpha4、code-owned `agent.general` 与首次 SubmitTurn durable acceptance。R2D-4 不再新增
产品能力，也不重新设计上述实现；它只负责用真实进程生命周期、兼容性、失败关闭、安全扫描和资源归零证据完成
R2D 工程线收口。

本批冻结以下十二项决定：

1. production `r2dCoreDeltaEnabled` 继续默认 false，不因 Harness 通过而开启；
2. production CPC activation 与 production enterprise entitlement 继续 false；
3. Harness 只能在 test-only composition 中显式启用 R2D/CPC，不能读取 env、CLI、Renderer 或 Main 自报；
4. 生命周期证据必须使用真实 Core child、真实 SQLite 文件、SIGKILL、新 PID 与同库 reopen；
5. 首次接受、`task_committed` barrier、Provider failure、restart 与 terminal replay 均复用 R2D-3.3 的 exact durable plan；
6. Agent、Entitlement、Preference、Registry、Tool Policy 与 Planner 在恢复阶段不得重新读取；
7. Agent v1/v2、Runtime Selection v1/v2/v3、coordination v1/v2/v3/v4 与 Invocation Link v1/v2 必须按显式
   `schemaVersion` 单次 dispatch；禁止“新版解析失败再尝试旧版”；
8. 历史 record 只读兼容，不 backfill、不改写 digest、不伪造新版事实；
9. Desktop v1alpha3 Receipt 的 `defaultModelId` 仅作为 exact resolved Model ID 的临时兼容投影，不是 Agent default
   authority；本批不删除，继续留给 Desktop/Admin v2 consumption；
10. 资源计数必须来自真实 diagnostics，不得使用常量 0、`?? 0` 或只相信 child 自报；
11. 泄漏扫描必须先证明 80 种 canary 注入均能检出，再证明正常四通道命中为 0；
12. 最终结论必须同时输出全部未就绪项为 false，不得输出 production ready、identity ready 或下游 ready。

本批估算保持 **1～2 个集中工程日**：复用 CPC-3、DFI-5.2.3 与 R2D-3.3 已验收的 Harness 原语，只新增
R2D 专属 process fixture、evidence validator、architecture/boundary tests 和治理报告。若编码发现必须修改 R2D
生产语义、公共 Contract 或 migration，必须立即停手回文档评审，不能用“Closure”名义扩展范围。

## 1. 目标、最高输出与诚实边界

### 1.1 本批目标

形成一份可独立复跑的 R2D closure evidence，证明：

- 首次 SubmitTurn 的 Agent、资源决策、锁、Runtime Selection、Authorization、ReasoningModeLock 与 Instruction
  Binding 能在真实 SQLite 上完整持久并恢复；
- `task_committed` 之前不存在 Provider resolve、DNS/socket/TLS、Invocation Link、Usage、Agent Loop 等上游副作用；
- crash、response loss、Provider failure、retry、restart 与 terminal replay 不重新选择 Agent/Model/Skill/Tool/Knowledge；
- Dynamic Request Facts 在同一 Invocation retry/restart 中精确复用，新 Invocation 才重新采样；
- 历史版本与新版 record 都由唯一显式版本分派读取，损坏或未知版本失败关闭；
- production gate 继续关闭，test-only closure 不进入 production dependency graph；
- 正常 evidence 无 Secret、绝对路径、原始 entitlement owner、完整 allowlist 或 Provider-private reasoning material；
- 所有真实 Core child、SQLite handle、timer、Provider request、lease 与 late callback 最终归零。

### 1.2 最高允许输出

全部门禁通过后，本批只能输出：

```text
R2D_CORE_DELTA_CONFORMANT
productionR2dGateEnabled=false
productionCpcActivationEnabled=false
productionEnterpriseEntitlementReady=false
agentLifecycleReady=false
desktopV2ConsumptionReady=false
adminV2ConsumptionReady=false
knowledgeProviderReady=false
memoryReady=false
effectReconciliationReady=false
dfi53Unlocked=false
```

`R2D_CORE_DELTA_CONFORMANT` 只证明 R2D-1～R2D-3 的 Core 工程语义在受控 test-only authority 下具备确定性、
可恢复、兼容和安全 conformance。

### 1.3 明确不代表

- 不代表 production R2D route 已启用；
- 不代表 Enterprise SSO、RBAC、production identity 或 enterprise entitlement 已完成；
- 不代表真实 Agent 创建、草稿、测试、发布、审核或 Admin CRUD 已完成；
- 不代表 Desktop/Admin 已消费 Runtime Selection v1alpha3 或 Agent Definition v1alpha2；
- 不代表 Skill Runtime、Knowledge Provider、Memory 或 Effect Reconciliation 已完成；
- 不代表 DFI-5.3 Provider raw Max mapping、DFI-5.4 Desktop Max UI 或 TGM 已完成；
- 不代表 controlled Provider fixture 等价于真实公网 Provider 或真实模型行为评估；
- 不得输出 `PRODUCTION_READY`、`IDENTITY_COMPOSITION_READY`、`ENTERPRISE_ENTITLEMENT_READY` 或任何下游 ready。

## 2. 已验证工程事实与本批真实缺口

### 2.1 必须复用的已关闭事实

1. R2D-1 已完成 Core-controlled currentTime/locale/timezone、request-scoped 单一 System Message 与 Invocation Link
   exact recovery；
2. R2D-2 已完成 Agent Definition v1alpha2 四类 `unrestricted | allowlist`、portable refs、v1 interpreter 与
   private subpath；
3. R2D-3.1 已完成 Entitlement Snapshot、Agent Resource Decision、Runtime Selection v1alpha3 与 coordination
   v1alpha4；
4. R2D-3.2 已完成单一 Planner、可信 exact intersection、code-owned `agent.general` 与 scripted fixture 隔离；
5. R2D-3.3 已完成既有四阶段 coordination、Core-private 双 envelope、SQLite transaction、InMemory staged-state
   single-swap、exact recovery 与 `task_committed` barrier；
6. CPC 已完成单一 System Message、Instruction Bundle、Agent Loop/Tool/Compaction/restart 与 lifecycle closure；
7. DFI-5.2 已完成 ReasoningModeLock、ModelRequest/Compaction Binding v1alpha2 与真实进程 lifecycle harness；
8. migration 止于 26，lockfile 当前冻结 digest 为
   `sha256:c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07`；
9. production bootstrap 当前显式使用 `R2D3_CORE_DELTA_DEFAULT_ENABLED=false`；
10. production `TaskResourceEntitlementSource` 实现数为 0。

### 2.2 本批需要关闭的缺口

1. R2D-3.3 使用 deterministic fault injection 证明状态语义，但尚无 R2D 专属真实 child/SIGKILL/reopen 证据；
2. 尚无一次统一 Harness 同时覆盖首次接受、Task bundle、Dynamic Facts、Provider failure 与 terminal replay；
3. 尚无 Agent/selection/coordination/Invocation Link 多版本 single-dispatch 的统一 compatibility corpus；
4. 尚无 production gate=false、gate=true+依赖缺失启动失败、test-only enabled 三态的统一 architecture evidence；
5. 尚无 R2D 专属三轮 fresh-process semantic replay；
6. 尚无 R2D 四通道、多编码敏感信息扫描的负向可检出证明；
7. 尚无 R2D 专属 12 类真实资源归零 evidence；
8. 尚无把 R2D-1～R2D-3 所有专项 Harness、CPC、DFI-5.2 与全仓门禁汇总为单一 closure conclusion 的报告。

## 3. 架构决策冻结

### 3.1 G1：Closure-only，不新增生产能力

R2D-4 默认只允许修改 test、fixture、Harness、evidence、必要的最小 diagnostics seam 与治理文档。

若必须新增 diagnostics seam：

- 必须通过构造参数注入；
- production 默认 Noop；
- 不得改变业务分支、digest、持久化或错误码；
- 不得把 test-only adapter 导出到 production composition；
- 必须有 architecture test 证明 production graph 行为零漂移。

### 3.2 G2：production gate 与 test-only enablement 分离

三态必须分别验证：

| 状态 | 预期 |
| --- | --- |
| production gate=false | production bootstrap 保持 legacy/既有可达面；R2D v4 accepted plan 不装配；无 production entitlement source |
| gate=true + Planner/authority 缺失、重复或 test-only | HTTP/Desktop runtime ready 前失败关闭，不静默退回 legacy |
| test-only closure composition=true + 全 strict fixture | 仅 Harness 内运行，`testIdentityUsed=true`，不得投影 production ready |

禁止 env、CLI、Renderer、Main 或请求 payload 控制 R2D gate；禁止 `getIfAvailable(Fake::new)`、
`@ConditionalOnMissingBean` 或 fixed userId 补齐 production 依赖。

### 3.3 G3：真实进程拓扑

```text
parent harness
  -> spawn fresh Core child PID-A
      -> real SQLite file
      -> test-only R2D/CPC enabled composition
      -> strict Agent/Entitlement/Registry/Preference/Tool Policy adapters
      -> controlled local Provider/network fixture
      -> deterministic named barrier
  -> SIGKILL PID-A
  -> verify exact OS process exit
  -> spawn Core child PID-B
      -> reopen same SQLite file
      -> strict reload / recovery / semantic evidence
  -> terminal cleanup and parent-side resource verification
```

禁止单进程 `throw` 冒充 crash、删除数据库冒充 reopen、sleep 猜窗口、自动 retry 覆盖首次失败或只测试 InMemory。

### 3.4 G4：single-dispatch compatibility

每个 family 只允许一次读取 `schemaVersion` 并分派：

- Agent Definition：v1alpha1 / v1alpha2；
- Runtime Selection：v1alpha1 / v1alpha2 / v1alpha3；
- SubmitTurn coordination：v1alpha1 / v1alpha2 / v1alpha3 / v1alpha4；
- main/compaction Model Invocation Link：v1 / v2。

禁止：

- 新版 parse 失败后尝试旧版；
- 按 JSON 是否出现某字段猜版本；
- unknown version 当最新版本；
- 损坏 v1alpha3 selection fallback v1alpha2；
- v1 record 读取时生成伪 v2/v3 durable facts；
- 为通过测试重写历史 fixture digest。

### 3.5 G5：durable exact plan 是恢复唯一 authority

`accepted`、`message_appended`、`task_committed` 与 terminal replay 的恢复路径只能使用已持久化 exact plan、Task
bundle、Invocation Link 和 receipt。恢复阶段以下读取增量必须全部为 0：

- Agent current revision；
- Entitlement current snapshot；
- Experience Preference；
- Registry current ordering/snapshot；
- Workspace/Authorization current candidate；
- Tool candidate policy；
- Agent Resource Decision Planner；
- Reasoning Profile current pointer。

若 durable material 缺失、digest drift 或交叉绑定不一致，必须 typed fail-closed；不得重建新 plan。

### 3.6 G6：`task_committed` 是 Provider 前硬 barrier

在 Task bundle 完整 durable 且 coordination transition 成功到 `task_committed` 之前，以下计数必须全 0：

- Credential resolve；
- Provider resolve；
- DNS；
- socket；
- TLS；
- HTTP body write；
- Model Invocation Link prepare；
- Usage projection；
- Agent Loop start；
- Compaction start。

`task_committed` 只证明 Task 计划可执行，不代表 Provider 已调用或任务已完成。Agent Loop 仍只能在 coordination
`completed` 后启动，保持 R2D-3.3 已关闭顺序。

### 3.7 G7：Desktop `defaultModelId` 兼容投影不成为 authority

本批继续允许 Desktop v1alpha3 Receipt 把 exact `resolvedModelLock.capabilityId` 投影到 legacy 必填
`defaultModelId`，但必须验证：

- Runtime Selection v1alpha3 不含 `agentDefaultModelId`；
- Planner 不读取该 Receipt 字段；
- recovery 不读取该字段重选模型；
- 字段与 exact resolved Model 不一致时 fail-closed；
- evidence 明确标记 `desktopLegacyDefaultModelProjectionPresent=true`；
- `desktopV2ConsumptionReady=false`，移除责任保留给 Desktop/Admin v2 consumption 批。

### 3.8 G8：响应丢失与 at-least-once 诚实语义

- accepted response loss：客户端可用同 commandId 查询/重放原 durable winner，不产生第二 plan；
- `task_committed` response loss：恢复使用原 Task bundle，不重选资源；
- Provider 请求已被远端接受后进程崩溃：保持既有 at-least-once 语义，不声称 exactly-once；
- terminal commit 后 delivery 丢失：只重放 terminal result，Planner/Provider/Invocation prepare 全 0；
- 不新增 bearer、Provider response 或 raw request body replay journal。

## 4. Harness 组成与证据所有权

### 4.1 文件组成

计划新增：

- `services/core/tests/r2d4-lifecycle-closure.test.ts`：正常、失败、版本兼容矩阵；
- `services/core/tests/r2d4-process-lifecycle.test.ts`：真实 child/SIGKILL/SQLite reopen；
- `services/core/tests/r2d4-boundary.test.ts`：production gate、source graph、版本与禁止范围；
- `services/core/tests/fixtures/r2d4-lifecycle-child.mjs`：test-only child entry；
- `scripts/r2d4-evidence.mjs` 与对应测试：semantic summary、scanner、resource validator；
- `scripts/run-r2d4-harness.mjs`：唯一正式 focused Harness；
- `artifacts/r2d4/evidence.json`：可再生成的 content-free closure evidence；
- R2D-4 实施报告与治理回链。

允许复用 CPC-3 evidence/scanner 和 DFI-5.2.3 process helper；若抽取共享 test helper，必须保持 CPC/DFI Harness
输出零漂移，并复跑其专项门禁。

### 4.2 Evidence authority

parent 负责：

- child PID/退出信号；
- process group 与端口状态；
- stdout/stderr 捕获；
- SQLite 文件生命周期；
- evidence/failure artifact；
- canary 注入与四通道扫描。

child 负责输出严格、content-free 的业务 diagnostics；parent 必须校验类型、范围和跨场景一致性，不能原样相信。

## 5. Lifecycle 场景矩阵

### 5.1 首次接受 A1～A8

| 场景 | barrier | 必须断言 |
| --- | --- | --- |
| A1 | Agent load 前 | Task/Message/coordination/lock/Receipt 全 0 |
| A2 | Entitlement load 后、Planner 前 | crash 后无 durable acceptance；重试允许重新读取 current authority |
| A3 | exact plan 生成后、accepted prepare 前 | 无 durable winner；Provider/Invocation 全 0 |
| A4 | `accepted` committed | restart 读取原 accepted plan；current authority read 增量 0 |
| A5 | `message_appended` committed | reopen 不重复 append Message；继续原 plan |
| A6 | Task bundle transaction 内、commit 前 | SIGKILL 后 Task/locks/selection/auth/binding 全部不可见 |
| A7 | Task bundle commit 后、coordination transition 前 | reopen strict reload bundle，再完成原 `task_committed` transition |
| A8 | `task_committed` 后、completed/Loop 前 | Provider/Invocation/Loop 仍 0；恢复后只继续原流程 |

### 5.2 Dynamic Facts / Provider D1～D8

| 场景 | 必须断言 |
| --- | --- |
| D1 facts sample 前 crash | 无 Invocation Link / facts |
| D2 facts materialized、prepare 前 crash | 无 durable facts；同 subject 可重新开始 |
| D3 Link + facts committed、request build 前 crash | restart 复用 exact facts |
| D4 request finalized、Provider resolve 前 crash | exact request/facts/deadline，不重新采样 |
| D5 HTTP accepted、首进度前 crash | at-least-once 诚实；Agent/Model/resources/facts 不变 |
| D6 stream progress 后 crash | recovery 复用 original facts 与 durable deadline |
| D7 terminal commit 后 response loss | terminal replay 不重建 facts、不调 Provider |
| D8 new main round / compaction | 新 Invocation subject 才生成新 facts/digest，稳定 Task plan 不变 |

### 5.3 重放与漂移 R1～R8

| 场景 | 必须断言 |
| --- | --- |
| R1 current Agent revision 更新 | accepted Task 继续 exact old revision |
| R2 current Entitlement revision 更新 | accepted Task 不扩大/收窄资源 |
| R3 Preference 更新 | accepted Task 模型不变 |
| R4 Registry ordering 更新 | accepted Task stable selection 不变 |
| R5 Tool Policy 更新 | accepted Task Tool locks 不变 |
| R6 Provider network failure | retry 不重选 Agent/Model/Skill/Tool/Knowledge |
| R7 same commandId same material | 返回同一 durable winner，不产生第二 Task |
| R8 same commandId different material | typed conflict，不泄漏原 plan/nonce/allowlist |

## 6. Compatibility / Cutover 矩阵

### 6.1 C1～C12

| 场景 | 断言 |
| --- | --- |
| C1 Agent v1 + selection v1 + coordination v1 | 历史 exact read/recovery，零 backfill |
| C2 Agent v1 + selection v2 + coordination v3 | DFI-5.2 历史 Reasoning lock 语义零漂移 |
| C3 Agent v2 + selection v3 + coordination v4 | R2D exact plan 正常恢复 |
| C4 v1 Agent interpreter | 生成 compatibility view，不生成伪 v2 revision |
| C5 unknown Agent schemaVersion | typed fail，不尝试 v1/v2 |
| C6 damaged selection v3 | typed fail，不 fallback v2/v1 |
| C7 damaged coordination v4 envelope | typed fail，不按 payload 猜旧版本 |
| C8 damaged Invocation Link v2 | Provider 前 fail，不 fallback v1 |
| C9 historical `agent.general` exact revision | code-owned source 可读，current revision 不覆盖历史 |
| C10 `agent.fixture.desktop-scripted` | 仅 test graph 可达，production count=0 |
| C11 legacy Desktop `defaultModelId` projection | 等于 exact resolved Model，只作兼容，不参与 authority |
| C12 gate=false / incomplete / test-only enabled | 三态分别符合 §3.2，不产生半启用状态 |

### 6.2 版本零漂移

Harness 必须记录并验证冻结 source/digest corpus：

- Agent v1/v2；
- Runtime Selection v1/v2/v3；
- coordination v1/v2/v3/v4；
- Model Invocation Link v1/v2；
- CPC Instruction Binding v1；
- DFI-5.2 ReasoningModeLock 与 ModelRequest v2。

本批不得原地修改 frozen source。若并行已授权批次合法改变基线，必须先更新基线归因并重新文档评审，禁止静默
替换 expected digest。

## 7. Semantic replay

同一固定 semantic seed 必须运行三次 fresh parent/child/SQLite 拓扑。每轮生成 canonical summary：

```text
scenario outcomes
accepted plan digest
entitlement snapshot digest
agent resource decision digest
runtime selection digest
reasoning mode lock id/digest
task instruction binding digest
dynamic facts digest sequence
model request digest sequence
coordination terminal state
typed failure codes
resource terminal counts
```

summary 必须排除：PID、PGID、端口、绝对路径、wall clock、transport nonce、temporary database path、随机 delivery
ID。受控 FakeClock/locale/timezone 仅用于 test-only semantic comparison；不得从 production Harness 读取 test facts。

三轮要求：

- 三个不同 child PID；
- 一个 semantic digest；
- source material 单字节 drift 必须改变 digest 或 typed fail；
- normalization 不得删除 Agent/resource/facts/selection 等权威差异；
- evidence 不含完整 Agent material、allowlist 或 raw prompt。

## 8. 敏感信息与泄漏扫描

### 8.1 四通道

- stdout；
- stderr；
- evidence JSON；
- failure artifact。

### 8.2 五类 canary

- credential/token canary；
- absolute workspace path；
- raw entitlement subject/owner；
- full Agent/resource allowlist；
- Provider-private reasoning parameter/value。

### 8.3 四种编码

- raw；
- base64；
- hex；
- URL encoding。

必须执行 `4 channels × 5 markers × 4 encodings = 80` 次负向注入，每次恰好检出预期 marker。正常运行四通道
总命中必须为 0。不得把字段名、产品文案或 fake/sentinel allowlist 误报为 Secret；allowlist 规则必须显式维护。

## 9. 真实资源归零

至少验证以下 12 类：

1. active Core child；
2. SQLite handles；
3. prepared Invocation Links；
4. pending coordination；
5. active capability locks；
6. active Agent resolution lease；
7. active entitlement snapshot lease；
8. active timeout schedulers；
9. active Provider/network requests；
10. active context materializers；
11. active compaction jobs；
12. late callbacks/delivery callbacks。

每项必须是非负安全整数，由真实 diagnostic 查询产生；所有 scenario 收尾最大值必须为 0。parent 还必须独立确认
child 已退出、端口已释放、SQLite 可重新独占打开。禁止 `value ?? 0`、硬编码 0 或把缺失字段解释为 0。

## 10. 文件所有权

### 10.1 允许修改

- `services/core/tests/**`；
- `scripts/run-r2d4-harness.mjs`、`scripts/r2d4-evidence*.mjs`；
- `package.json` 仅 additive 增加 `harness:r2d4` 与开发版本；
- `services/core/package.json` 仅开发版本；
- 必要的最小 Core diagnostics seam，须满足 §3.1；
- `docs/development/**`、`artifacts/r2d4/**`、`qa-reports/r2d4-runs/**`；
- `README.md`、`CHANGELOG.md` 与治理日志。

### 10.2 禁止修改

- `packages/contracts/**`；
- production Provider、Provider-private mapping 与 DFI-5.3；
- Desktop Renderer/Main/Preload/IPC；
- `apps/admin-console/**`；
- Central production service；
- Document Worker / PTX；
- migration 1～26 或新增 migration 27；
- dependencies 或 `pnpm-lock.yaml`；
- Agent Lifecycle、Admin CRUD、TGM、Knowledge Provider、Memory、Effect Reconciliation；
- production CPC/R2D/enterprise entitlement activation；
- 真实 Secret、真实企业身份或公网 Provider 调用。

发现必须修改任一禁止范围时，立即停止并回文档评审。

## 11. 实施步骤与工期

### Step 1：Closure evidence / compatibility corpus（0.25～0.5 日）

- 新增 strict evidence schema、semantic summary 与版本 corpus；
- 新增四通道 scanner 与 80 次 canary negative proof；
- 新增 production gate/source graph architecture tests。

### Step 2：真实进程 lifecycle / cutover（0.5～1 日）

- 复用既有 process helper 建 R2D child；
- 覆盖 A1～A8、D1～D8、R1～R8、C1～C12 的必要代表窗口；
- SIGKILL、新 PID、same SQLite reopen、authority read=0 与 barrier count=0；
- 三轮 semantic replay 与真实资源归零。

### Step 3：聚合 Harness / regression / report（0.25～0.5 日）

- 新增 `harness:r2d4`；
- 聚合 R2D-1～R2D-3.3、CPC、DFI-5.2 关键 Harness；
- 执行全仓、Central、frozen install、lockfile/migration/downstream 边界；
- 输出实施报告和 content-free evidence。

总计：**1～2 个集中工程日**。若真实进程复用需要修改既有生产生命周期语义，估算立即失效并触发停手条款。

## 12. QA 矩阵（96 项连续）

### 12.1 Gate / architecture（QA-001～QA-016）

1. QA-001：production R2D gate code-owned default=false；
2. QA-002：production CPC activation=false；
3. QA-003：production enterprise entitlement ready=false；
4. QA-004：production `TaskResourceEntitlementSource` implementation count=0；
5. QA-005：gate=false 不装配 v4 accepted plan；
6. QA-006：gate=true + Planner 缺失在 runtime ready 前失败；
7. QA-007：gate=true + duplicate dependency 在 runtime ready 前失败；
8. QA-008：gate=true + test-only dependency 不能进入 production graph；
9. QA-009：test-only enabled composition 标记 `testIdentityUsed=true`；
10. QA-010：env/CLI/Renderer/Main 不能控制 R2D gate；
11. QA-011：`agent.fixture.desktop-scripted` production consumer count=0；
12. QA-012：`agent.general` 不进入 Admin lifecycle projection；
13. QA-013：R2D-4 production source modification count=0，或仅有获准 Noop diagnostics seam；
14. QA-014：Contracts/Provider/Desktop/Admin/Central/Document Worker 零修改；
15. QA-015：migration 止 26；
16. QA-016：lockfile digest 不变且无新依赖。

### 12.2 Acceptance / atomicity（QA-017～QA-032）

17. QA-017：A1 Agent load 前 durable counts 全 0；
18. QA-018：A2 entitlement 后 crash 无 acceptance winner；
19. QA-019：A3 plan 后/prepare 前 crash 无 durable side effect；
20. QA-020：A4 accepted reopen exact plan；
21. QA-021：A5 message_appended 不重复 append；
22. QA-022：A6 SQLite transaction commit 前 SIGKILL 无半写入；
23. QA-023：A6 InMemory staged state 失败无 live pointer swap；
24. QA-024：A7 bundle commit 后 strict reload 完整；
25. QA-025：A7 coordination 恢复 transition 到同一 `task_committed` winner；
26. QA-026：A8 `task_committed` 后/complete 前 Provider、Invocation、Loop 全 0；
27. QA-027：Task/Checkpoint/Model locks/Tool locks/selection/auth/reasoning/binding 原子可见；
28. QA-028：coordination accepted plan 在所有 transition 中原样保留；
29. QA-029：envelope digest 随 record state 重算且 exact；
30. QA-030：same commandId same material 返回同一 Task/plan；
31. QA-031：same commandId different material typed conflict；
32. QA-032：Receipt identity 与 delivery identity 分离且不可互换。

### 12.3 Recovery / Provider barrier（QA-033～QA-048）

33. QA-033：恢复 Agent current load 增量=0；
34. QA-034：恢复 Entitlement current load 增量=0；
35. QA-035：恢复 Preference load 增量=0；
36. QA-036：恢复 Registry load 增量=0；
37. QA-037：恢复 Tool Policy load 增量=0；
38. QA-038：恢复 Planner invocation 增量=0；
39. QA-039：恢复 Reasoning Profile current load 增量=0；
40. QA-040：`task_committed` 前 Credential resolve=0；
41. QA-041：`task_committed` 前 DNS/socket/TLS/HTTP body write=0；
42. QA-042：`task_committed` 前 Invocation Link/Usage/Compaction=0；
43. QA-043：`task_committed` 前 Agent Loop=0；
44. QA-044：Provider network failure 不重选 Agent/Model；
45. QA-045：Provider network failure 不重选 Skill/Tool/Knowledge；
46. QA-046：retry/restart 复用 durable deadline；
47. QA-047：terminal replay Planner/materializer/Provider/upstream 全 0；
48. QA-048：response loss 不产生第二 plan 或第二 Task。

### 12.4 Dynamic facts / compatibility（QA-049～QA-064）

49. QA-049：D1 facts sample 前无 Link/facts；
50. QA-050：D2 prepare 前无 durable facts；
51. QA-051：D3 restart 复用 exact facts；
52. QA-052：D4 request/facts/deadline exact；
53. QA-053：D5 HTTP accepted 后崩溃保持 at-least-once 诚实；
54. QA-054：D6 stream progress 后恢复不重采样 facts；
55. QA-055：D7 terminal replay facts/Provider=0；
56. QA-056：D8 新 Invocation 才生成新 facts digest；
57. QA-057：Agent v1/v2 single dispatch；
58. QA-058：Runtime Selection v1/v2/v3 single dispatch；
59. QA-059：coordination v1/v2/v3/v4 single dispatch；
60. QA-060：Invocation Link v1/v2 single dispatch；
61. QA-061：unknown/damaged new version 不 fallback；
62. QA-062：historical record 不 backfill、不改 digest；
63. QA-063：legacy Desktop `defaultModelId` 精确等于 resolved Model 且不参与 authority；
64. QA-064：旧 Agent/selection/coordination/DFI/CPC digest corpus 零漂移。

### 12.5 Process / security / resources（QA-065～QA-080）

65. QA-065：child 为真实独立 PID；
66. QA-066：SIGKILL 由 parent 执行并观察 exact signal；
67. QA-067：recovery child 使用新 PID；
68. QA-068：recovery reopen 同一 SQLite 文件；
69. QA-069：barrier 使用命名 IPC，不使用 sleep 判断业务窗口；
70. QA-070：三轮 fresh process semantic digest 唯一；
71. QA-071：semantic seed 排除 PID/port/path/wall clock/nonce；
72. QA-072：source 单字节 drift 不被 normalization 掩盖；
73. QA-073：80 次负向 canary 注入全部恰好检出；
74. QA-074：正常 stdout 敏感命中 0；
75. QA-075：正常 stderr 敏感命中 0；
76. QA-076：正常 evidence 敏感命中 0；
77. QA-077：正常 failure artifact 敏感命中 0；
78. QA-078：12 类资源计数均来自真实 diagnostics；
79. QA-079：资源计数无硬编码 0、无 `?? 0`；
80. QA-080：child/port/SQLite/timer/request/late callback 全部归零。

### 12.6 Regression / honest closure（QA-081～QA-096）

81. QA-081：`harness:r2d1` PASS；
82. QA-082：`harness:r2d2` PASS；
83. QA-083：`harness:r2d3.1` PASS；
84. QA-084：`harness:r2d3.2` PASS；
85. QA-085：`harness:r2d3.3` PASS；
86. QA-086：CPC-1～CPC-3 focused Harness PASS；
87. QA-087：DFI-5.2.1～5.2.3 focused regression PASS；
88. QA-088：root `check` PASS；
89. QA-089：Central online PASS；
90. QA-090：Central offline PASS；
91. QA-091：frozen offline install PASS；
92. QA-092：lint / Architecture boundary / `audit:dtp4` PASS；
93. QA-093：evidence 输出 `R2D_CORE_DELTA_CONFORMANT`；
94. QA-094：production R2D/CPC/enterprise entitlement 三项仍 false；
95. QA-095：Agent Lifecycle/Desktop/Admin/Knowledge/Memory/Effect/DFI-5.3 ready 全 false；
96. QA-096：未输出 production ready、identity ready 或任何下游自动解锁结论。

测试禁止 `.skip`、`.only`、`@Disabled`、sleep 猜窗口、自动 retry 掩盖首次失败、硬编码资源 0、删除数据库冒充
reopen、Fake 宣称 production 或真实 Secret/公网调用。

## 13. 门禁命令

编码后至少执行：

```text
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r
node --version
CI=true pnpm run harness:r2d4
CI=true pnpm run lint
env -u ELECTRON_RUN_AS_NODE CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run audit:dtp4
CI=true pnpm install --frozen-lockfile --offline
shasum -a 256 pnpm-lock.yaml
```

`harness:r2d4` 必须直接聚合必要的 R2D/CPC/DFI focused regression；不能用实施报告中的历史数字代替实际复跑。
Central 环境偶发必须如实记录首次结果和可归因证据，不允许脚本自动 retry 掩盖。

## 14. 停手条件

出现任一项必须停止编码并回文档评审：

1. 必须修改 public Contract 或 root export；
2. 必须新增 migration 27 或改写 migration 1～26；
3. 必须修改 Provider-private DFI-5.3 mapping；
4. 必须启用 production CPC/R2D/enterprise entitlement；
5. 必须依赖真实企业 identity、真实 Secret 或公网 Provider；
6. 无法在同一 SQLite 文件上完成真实 child reopen；
7. 只能用 sleep/轮询猜 crash window；
8. 只能在单进程 InMemory 测试中证明原子/恢复；
9. 版本读取必须通过 fallback guessing 才能兼容；
10. 历史 record 必须 backfill 才能读取；
11. 资源计数无法从真实 diagnostics 获得；
12. scanner 无法证明负向注入可检出；
13. 发现 `task_committed` 前存在 Provider/Invocation/Loop 副作用；
14. 恢复必须重新读取 current Agent/Entitlement/Preference/Registry/Policy；
15. 必须删除 legacy Desktop `defaultModelId` 才能通过（应转入 Desktop/Admin v2 consumption）；
16. 需要进入 Agent Lifecycle、TGM、Knowledge、Memory、Effect 或 Admin CRUD；
17. root check 失败来自并行窗口且无法安全隔离或归因；
18. closure evidence 只能通过硬编码 false/0 或手工编辑生成。

## 15. 实施报告必须给出的证据

1. 实际修改文件清单及每项 ownership；
2. production file change count 与 diagnostics seam 说明；
3. A1～A8、D1～D8、R1～R8、C1～C12 outcome；
4. first accept 与 recovery 的 authority read counters；
5. `task_committed` 前十类副作用计数；
6. 三轮 process PID 与唯一 semantic digest；
7. 80 次负向注入检出数与四通道正常命中数；
8. 12 类真实资源终态计数及 parent 独立验证；
9. 全部 focused/root/Central/frozen/audit 命令和首次结果；
10. lockfile digest、migration max ID、package version；
11. legacy Desktop `defaultModelId` 兼容投影仍存在且不作为 authority 的证明；
12. 全部 false readiness flags 与未自动解锁清单。

## 16. 文档评审问题

请评审者明确回答：

1. Closure-only 范围是否足够严格，是否存在借 Harness 修改生产语义的入口；
2. production disabled / incomplete fail-fast / test-only enabled 三态是否可验证；
3. A/D/R/C 矩阵是否覆盖首次接受、Dynamic Facts、重放和多版本兼容；
4. `task_committed` 前十类零副作用边界是否完整；
5. accepted recovery 的 authority read=0 是否可由真实 counters 证明；
6. multi-family single-dispatch 是否阻止新版损坏 fallback legacy；
7. legacy Desktop `defaultModelId` 临时兼容边界是否诚实且未成为 authority；
8. process/SIGKILL/SQLite reopen/semantic replay 是否为真实拓扑；
9. 80 次扫描与 12 类资源归零是否非恒真；
10. `R2D_CORE_DELTA_CONFORMANT` 的 false flags 是否足以阻止 production-ready over-claim；
11. 1～2 日估算是否与复用既有 Harness 原语相符；
12. 是否存在必须先拆出独立 repair 或扩展批次的缺口。

## 17. 当前状态与下一步

```text
R2D-0 PLAN PASS/CLOSED
R2D-1 PASS/CLOSED
R2D-2 PASS/CLOSED
R2D-3.1 PASS/CLOSED
R2D-3.2 PASS/CLOSED
R2D-3.3 PASS/CLOSED
R2D-3 PASS/CLOSED
R2D-4 PASS/CLOSED
R2D CONFORMANCE PASS/CLOSED
```

R2D-4 独立 QA 已由用户正式接受，R2D-4 与 R2D 工程线 conformance 均为 `PASS/CLOSED`。该关闭只确认
`R2D_CORE_DELTA_CONFORMANT`，不得据此启用 production gate 或进入任何下游编码。

production CPC activation、production R2D gate、production
enterprise entitlement 继续 false。DFI-5.3、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、Effect
Reconciliation、Agent Lifecycle 与 Desktop/Admin v2 consumption 均继续 GATED，必须分别获得独立计划与编码授权。
