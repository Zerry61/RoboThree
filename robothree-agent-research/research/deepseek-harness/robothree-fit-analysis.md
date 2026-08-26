# DeepSeek Harness — RoboThree Fit Analysis

> 只对“真正影响 RoboThree 模块边界”的机制下五分类结论。证据引用见各 L3 文件与 architecture.md。

## 1. 五分类结论

### ADOPT（可直接借鉴并落地）

| 机制 | 理由 | 证据 | 适用边界 | 风险 | MVP 需要 |
|---|---|---|---|---|---|
| **Definition/Provider/Consumer 三角色 capability seam** | RoboThree 的 fs/shell/subprocess/llm/sandbox 天然应拆成“接口 + provider + 工具”三层，provider 可替换（本地/remote/external agent），consumer 无感 | fs/index.ts:86、shell/index.ts:65、sandbox/index.ts:158 | 只对“有多个实现、会整体替换”的能力；纯内部单实现模块不必套 | 三角色拆分有前期成本；抽象错误需重构 | 是 |
| **fail-closed 默认安全（sandbox + approval）** | RoboThree 安全模型应默认 deny：无 backend 拒绝而非降级、无 answerer 拒绝而非放行 | sandbox/index.ts:124-144、user-approval/index.ts:304-344 | 涉及进程/文件/网络/审批的路径；纯只读操作可豁免 | 过度 fail-closed 影响可用性 | 是 |
| **append-only session log + deriveMessages 投影** | 模型历史不单独存，从 log 派生；天然支持 fork/resume/replay/compaction/审计 | session/index.ts:726、session/types.ts:236 | 需要“可重放真相源”的 session/state 层 | schema 迁移成本（本项目 SESSION_FORMAT_VERSION=0 无迁移） | 是 |
| **“model-visible ⟺ logged” 运行时 invariant** | 任何进模型的内容必须能从 log 重建；保证可审计、可回放 | agent.ts:381-390、docs/architecture.md | 所有会进模型请求的输入路径 | 新增模型输入类型时必须同步加 session event | 是 |

### ADAPT（需改造后借鉴）

| 机制 | 理由 | 证据 | 需要改造 | 风险 | MVP 需要 |
|---|---|---|---|---|---|
| **Cordis 式插件架构（effect/DI/waterfall/scope 链）** | 思路可对齐（注册即 effect、卸载即 unwind、waterfall 扩展、per-agent scope），但**不必全盘引入 Cordis** | context.ts、fiber.ts、scope/index.ts | 抽取“生命周期 + 事件 + 作用域”语义到 RoboThree 自己的插件系统；是否 vendor Cordis 需另评估 | 全盘引入 DI/Proxy/declaration-merging 心智负担高 | 部分（生命周期+事件扩展面） |
| **waterfall 作为 loop 扩展面（pre-step/request/tools-*）** | 把“改循环”变“挂 listener”符合 RoboThree 分层原则 | agent.ts:234-441、tools/index.ts:152-175 | 定义 RoboThree 自己的 agent 扩展点命名与载荷；不需要 Cordis 的 `next()` 全兼容 | 瀑布语义需文档化，否则 listener 忘 `next()` 难排查 | 是 |
| **“策略即 log 事件 + fold 重放”** | 权限/sandbox/approval 状态用 append-only 事件替代独立 config store | session-mode.ts:52、user-approval/index.ts:112 | 定义 RoboThree 的 policy 事件词汇与 fold 规则 | fold 逻辑分散易漂移 | 是 |
| **turn/step 双层边界 + per-turn abort** | 清晰取消/恢复/checkpoint 单位 | agent.ts:246-330 | 与 RoboThree 现有 loop 语义对齐 | 引入额外状态机复杂度 | 是 |

### DEFER（推迟）

| 机制 | 理由 | 证据 | 何时重新评估 | MVP 需要 |
|---|---|---|---|---|
| **依赖感知的 epoch-based hot reload（fiber unload/reload）** | 运行时替换 provider 而不重启进程，但复杂度高，RoboThree 现阶段无需 | fiber.ts:597-696 | 需要“热插拔 Skill/Plugin 且不重启”时 | 否 |
| **100% 单文件覆盖率 + 每包 invariant.ts 工程纪律** | 工程质量极高但投入极大，属 DeepSeek 级别工程文化 | packages/AGENTS.md、package.json test:coverage | 团队规模与投入允许时 | 否 |
| **Code Mode（run_code 子分发 + Python SDK + native landlock runner）** | 多语言代码执行是深化能力，非 MVP 边界 | tools/index.ts code-mode、python/、native/ | 需要把 agent 作为 Python 代码运行时 | 否 |

### REJECT（回避）

| 机制 | 理由 | 证据 | 风险 | MVP 需要 |
|---|---|---|---|---|
| **全盘 vendor Cordis + declaration-merging 类型扩展** | Cordis 的 Proxy DI + `isolate`/`intercept` + TS declaration-merging（`Context`/`Events`/`SessionEventMap`）产生 `ts.Program` 冲突（本项目因此拆 Host/Client 双 aggregate），对 RoboThree 是过度工程 | development.md「TypeScript project layout」、context.ts | 类型系统与心智负担远超收益；与 RoboThree 现状不匹配 | 否 |
| **SESSION_FORMAT_VERSION=0 + 无迁移** | DeepSeek 明确“无兼容承诺、拒绝旧格式”，不适合作为 RoboThree 的持久化承诺 | session/types.ts:56 | 直接照搬会锁死未来升级 | 否 |

### NEEDS_MORE_EVIDENCE（证据不足）

| 机制 | 缺口 | How to close |
|---|---|---|
| 多后端 sandbox（Landlock/Seatbelt/bwrap/Windows-ACL）实际隔离强度 | 静态推断，未运行时验证 `enforcement: full/partial` 真实边界 | 在 Linux/macOS/Windows 各跑一次 denied 文件效果实测 |
| 工具并发实际并发度与取消时序 | `FuturesOrdered`/rolling pool 语义明确，上限与 abort 时序未实测 | 运行时埋点 + 取消压力测试 |
| `deriveMessages` 增量投影在大 log 下的性能 | 未基准 | 大 session 回放基准 |
| Cordis reflect（Proxy 拦截）在热路径的性能 | 未基准 | dispatch 吞吐基准 |

## 2. Proposed RoboThree Changes

> 列出会影响 RoboThree 模块边界 / 技术栈 / 数据模型 / 安全模型 / 部署形态的候选变更。**仅作为提议，未自动落地。**

1. **模块边界**：把 fs / shell / subprocess / llm 四块按“Definition/Provider/Consumer”三角色 seam 组织，provider 作为可替换单点。→ 影响 `robothree/` 的模块边界图。
2. **数据模型**：session/state 采用 append-only event log 作为真相源，模型历史由 `deriveMessages` 投影，而非独立存 message 列表。→ 影响 session/state/memory 数据模型。
3. **安全模型**：默认 fail-closed；权限 = 三个整值旋钮（permission preset + sandbox mode + approval policy），以 log 事件 fold 承载。→ 影响安全模型默认（default-deny）。
4. **扩展面**：引入 waterfall/serial 事件扩展点（agent pre-step/request/tools pre-execute/execute/post-execute），把“改循环”变为“挂 listener”。→ 影响 agent 主循环扩展设计。
5. **运行时 invariant**：确立“model-visible ⟺ logged”，任何模型可见输入必须有对应 session event。→ 影响运行时/审计契约。

## 3. Requires Human Approval

> 需要用户拍板才能推进 RoboThree 正式架构决策的项。默认状态：`PENDING_HUMAN_DECISION`。

| 决策项 | 说明 | 状态 |
|---|---|---|
| 是否引入 Cordis 或自建等价插件系统 | 决定 RoboThree 插件/Skill/Hook 的底层框架选型（vendor Cordis vs 抽取语义自建） | `PENDING_HUMAN_DECISION` |
| session 是否采用 append-only event log 为唯一真相源 | 影响持久化 schema 与迁移策略，是数据模型级决策 | `PENDING_HUMAN_DECISION` |
| 安全模型是否默认 fail-closed + 三整值旋钮 | 决定 RoboThree 权限模型是 default-deny 还是 default-allow | `PENDING_HUMAN_DECISION` |
| 是否建立“model-visible ⟺ logged”运行时 invariant | 影响所有模型输入路径的实现约束与审计成本 | `PENDING_HUMAN_DECISION` |

> 以上结论未写入 `robothree/` 或 `robothree/adr/`。ADR 默认关闭（见 SKILL § 14.3）；如需提升为正式架构决策，请走 `promote-research-decision`。
