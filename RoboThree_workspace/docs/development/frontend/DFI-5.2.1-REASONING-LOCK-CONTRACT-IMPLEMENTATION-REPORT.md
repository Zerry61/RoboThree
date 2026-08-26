# DFI-5.2.1 Reasoning Lock Contract / Conformance 实施报告

> 状态：**PASS/CLOSED**  
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 上游：DFI-5.2 Revision 1 独立文档复核 `PASS`，用户正式接受并单独授权 DFI-5.2.1  
> 本批最高输出：`DFI521_REASONING_LOCK_CONTRACT_CONFORMANT`

## 1. 结论

DFI-5.2.1 已完成 ReasoningModeLock v1alpha1、TaskRuntimeSelection v1alpha2、Desktop SubmitTurn
v1alpha3 与 SubmitTurn coordination v1alpha3 的 canonical Contract、私有导出、digest helper 和
conformance。旧 Runtime Selection v1alpha1、SubmitTurn v1alpha1/v1alpha2 与 coordination
v1alpha1/v1alpha2 的根入口和读取语义保持不变。

本批只证明版本化 Contract、strict union、exact binding 与 canonical digest 成立；没有实现 Planner、
stale 真值表的业务执行、Task bundle/SQLite 接线、ModelRequest v1alpha2、Agent Loop、Provider Mapping、
Desktop UI 或 production SubmitTurn v1alpha3 route。

## 2. 实现

### 2.1 ReasoningModeLock v1alpha1

- 新增四种 strict discriminated variant：`default_passthrough`、`max_applied`、
  `max_unsupported_default`、`max_capability_unknown_default`；
- default 禁止 observed/Profile/Strategy 字段，fallback 禁止 Profile/Strategy/timeout，只有
  `max_applied` 可携带 exact Profile 与 Strategy/timeout ref；
- lock 绑定 Task、exact Model lock ID/digest 与 lockedAt；Reasoning lock ID 与 capability lock ID
  保持独立；
- Core canonical helper 使用独立 domain `robothree.reasoning-mode-lock.v1\n` 计算 digest，load/消费前可重算并
  校验 Task 与 Model lock binding。

### 2.2 Runtime Selection v1alpha2

- 新增 Core-private `@robothree/contracts/runtime-selection/v1alpha2` subpath；
- v1alpha2 完整复用 v1alpha1 selection material，并把一个 strict ReasoningModeLock 作为必填成员；
- schema 强制 lock.taskId、Model lock ID/digest 与 selection 完全一致，并拒绝 Reasoning lock ID 混入 capability
  lock IDs；
- 新增 v1alpha1/v1alpha2 readable union 与版本化 create/digest/parse helper；selection digest 覆盖完整
  ReasoningModeLock；
- Contracts 根入口的 `TaskRuntimeSelectionSchema` 继续只接受 v1alpha1。

### 2.3 Desktop SubmitTurn v1alpha3

- 新增 `reasoningPreference` strict union：default 不带 observed 字段；max 必带
  `supported|unsupported|unknown + observedMaxSupportRevision`；
- v1alpha3 Receipt 只返回 `requestedMode/resolvedMode/resolutionReason` 与 Reasoning lock ID/digest；
- Receipt schema 固定 default/applied/unsupported/capability_unknown 的安全组合，不返回 Profile、Strategy、
  timeout、budget 或 Provider raw mapping；
- 冻结四个 DFI-5 typed error code；本批未注册 production route。

### 2.4 coordination v1alpha3 与私有边界

- 新增 Core-private `@robothree/contracts/submit-turn-coordination/v1alpha3` subpath；
- durable record 保存完整 ReasoningModeLock 与 planned Runtime Selection digest，并校验 Task、Model lock、
  requested mode、observed support 与 planned digest exact binding；
- `capabilityLockIds` 继续只包含 Model/Tool capability locks；
- private schemas 不从 Contracts 根入口导出，Architecture boundary 与 conformance 扫描禁止 Preload、Renderer、
  Admin 导入；Desktop v1alpha3 公共入口只承载 safe SubmitTurn request/Receipt。

## 3. 文件与版本边界

- 修改 `packages/contracts/src/reasoning-mode/**`、`runtime-selection/v1alpha2.ts`、
  `desktop-local/v1alpha3/**`、`submit-turn-coordination/v1alpha3.ts` 与精确 package exports；
- 修改 Core canonical helper、Runtime Selection revision helper、对应 tests 与边界扫描；
- Root 保持并发 PTX-3 的 `0.0.0-ptx.3`，Contracts/Core 推进到 `0.0.0-dfi.5.2.1`；PTX-3 生产实现保留；
- 未修改 migration 1～26，未新增 migration 27；未修改 Desktop Main/Preload/Renderer、Admin、Central、
  Document Worker、依赖或 lockfile。

## 4. 开发者验证

- focused Contract/domain/legacy/audit：`7 files / 36 tests PASS`；
- Contracts build、Core build：PASS；
- touched-file ESLint：PASS；
- `pnpm run lint`：PASS，Architecture boundary checks passed；
- 完整 `CI=true VITEST_MAX_WORKERS=1 pnpm run check` 在具备 loopback/子进程/临时 Keychain 权限的环境：
  `254 files / 1699 tests + 3 smoke PASS`；
- 沙箱内首次完整门禁因 `listen EPERM 127.0.0.1` 与隔离 Keychain 权限导致既有集成测试失败；同一命令在正式
  权限环境从零复跑全绿，属于环境限制，不是产品缺陷；
- `pnpm install --frozen-lockfile --offline`：PASS；
- `pnpm run audit:dtp4`：PASS；
- lockfile 未修改，SHA-256 保持
  `c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07`；
- 当前开发者 shell 无 JDK 21，Central online/offline 未运行；独立 QA 需在 JDK 21 + Docker 环境串行补跑。

## 5. 当前边界与下一步

- 独立 QA 已复跑完整 root check `254 files / 1699 tests + 3 smoke` 与 Central online/offline `404/404`，
  核查四 variant strictness、domain-separated digest、v1alpha2 selection exact binding、v1alpha3 coordination
  binding、旧根导出零漂移和 private subpath 不可达，结论 P0～P3 全 0；
- 用户已正式接受独立 QA，DFI-5.2.1 为 `PASS/CLOSED`；
- DFI-5.2.2 当前只进入详细方案评审与 `CODING GATED`；DFI-5.2.3、DFI-5.3～5.4、AAPI-0.3～0.4、
  TGM 与 Knowledge Provider 继续 `GATED`；
- 不自动进入 Planner、Task persistence/recovery、ModelRequest、Provider Mapping 或 UI。
