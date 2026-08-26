# R2D-1 Dynamic Request Facts 实施报告

> 日期：2026-08-26  
> 开发版本：Root / Core `0.0.0-r2d.1`  
> 状态：**PASS/CLOSED**  
> 最高输出：`R2D_DYNAMIC_REQUEST_FACTS_CONFORMANT`

## 1. 授权与范围

本批承接已通过并由用户接受的 R2D-0 计划，只实现 R2D-1：为每个 main / compaction Model Invocation
提供由 Core 控制的当前时间、应用语言和操作系统时区，并把 exact facts 绑定到 Context Receipt、Model
Invocation Link 和 Provider 恢复路径。R2D-2～R2D-4、DFI-5.3、AAPI-0.3～0.4、TGM、Knowledge
Provider、Memory、Effect Reconciliation、Agent Lifecycle 与 Desktop/Admin v2 consumption 均未解锁。

## 2. 实现结果

### 2.1 Core-controlled facts

- 新增 strict `DynamicRequestFactsV1`：`currentTime` 只接受 canonical UTC millisecond，locale 必须为
  BCP 47 safe value，timezone 必须为 runtime 可验证的 IANA timezone；offset-only 值失败关闭；
- 当前单语言产品使用 code-owned `zh-CN` source；timezone 由 Core runtime 的 `Intl` source 读取，Renderer、
  Main、环境变量和用户输入均不是 authority；
- facts 使用独立 domain digest，并携带 invocation kind / stable subject；同一 durable Invocation 恢复时读取
  exact facts，新 Invocation 才重新采样；
- 缺失、损坏、subject 不匹配、drift 与预算超限均映射为 typed safe error。

### 2.2 单一 request-scoped System Message

- 新增单一 materializer，把稳定 CPC System Message 与 bounded Dynamic Facts block 合并为仍然恰好一条
  `ModelInstructionMessage`；
- Dynamic Facts block 明确标记为信息性、非授权事实，不授予 Tool、Workspace、Credential 或执行权限；
- `instructionBundleDigest` 保持稳定不变；另以独立 digest 绑定 stable bundle、facts 和 rendered bytes；
- Context Receipt / provenance 只保存 content-free evidence，不保存 Prompt 正文或敏感值。

### 2.3 Durable links 与恢复

- main / compaction 通用 Invocation Link 新增 Core-private readable `v2`；历史无 discriminator 的 v1
  记录继续按原 schema 读取；显式未知 version 失败关闭，不 fallback；
- Local Personal Invocation Link additive 升级为 `v1alpha2`，历史 `v1alpha1` digest/domain 不变；
- InMemory / SQLite / Local Personal adapters 对 facts 与 Context Receipt digest 做 exact compare，retry、
  Provider recreate 和 SQLite reopen 均复用原 durable winner；
- Enterprise 与 Local Personal Provider 都在任何上游 dispatch 前准备 durable link，并提供受控 facts loader；
- Agent Loop、Tool continuation 与 Compaction 复用同一 runtime 接缝；production bootstrap 未注入该 runtime，
  因此本批没有改变现有生产行为。

## 3. 边界确认

- production Dynamic Request Facts activation：`false`；
- production CPC activation：`false`；
- production enterprise entitlement：`false`；
- 未修改 public Contracts、Central production、Desktop Main/Preload/Renderer、Admin、Document Worker；
- 未新增依赖，未修改 `pnpm-lock.yaml`；
- migration 仍止 26，无 migration 27；
- 未实现 R2D-2 Agent restriction、R2D-3 selection/entitlement/`agent.general` 或 R2D-4 closure。

## 4. 主要文件

- facts / source ports：`services/core/src/application/dynamic-request-facts.ts`、
  `services/core/src/ports/application-locale.ts`、`operating-system-timezone.ts`；
- request-scoped message / Context：`request-scoped-system-message.ts`、`context-types.ts`、
  `context-assembler.ts`、`context-pipeline.ts`、`context-reducer.ts`、
  `model-context-provenance-classifier.ts`；
- lifecycle / Provider：`durable-agent-loop-starter.ts`、`model-backed-compaction-summarizer.ts`、
  `durable-enterprise-model-provider.ts`、`durable-local-personal-model-provider.ts`；
- durable schemas / adapters：main、compaction 与 Local Personal Invocation Link ports、digest helper、
  InMemory / SQLite adapters；
- tests / Harness：`r2d1-dynamic-request-facts.test.ts`、`r2d1-boundary.test.ts`、相关既有 Provider / Context /
  Link tests，以及 `scripts/run-r2d1-harness.mjs`。

## 5. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `pnpm run harness:r2d1` | **PASS 10 files / 93 tests**；`R2D_DYNAMIC_REQUEST_FACTS_CONFORMANT` |
| `pnpm run lint` | **PASS**；Architecture boundary PASS |
| 非沙箱 `pnpm run check` | **PASS 268 files / 1818 tests + 3 smoke** |
| `pnpm run audit:dtp4` | **PASS** |
| frozen offline install | **PASS** |
| lockfile / migration | `c47641ac…f815a07` 未变；最大 migration id=26 |
| Central online/offline | **当前开发环境缺 JDK 21，未执行；独立 QA 必须补跑** |

专项 evidence：`qa-reports/r2d1-runs/2026-08-26T06-53-29-602Z/result.json`，其
`evidenceDigest=sha256:24a71f8…0344077c`。

沙箱内第一次 root check 的 46 个失败全部集中在 `listen EPERM`、真实子进程与隔离 Keychain；同一代码在
非沙箱环境从零复跑 268/1818 + 3 smoke 全绿，不属于产品缺陷。安装恢复期间按 frozen lockfile 补齐本机 pnpm
store，最终 offline frozen install 通过且 lockfile digest 未变化。

## 6. 独立 QA 与用户接受

本节所列待复核项已由 Claude Code 使用 Node 24.13.0、JDK 21 与 Docker 完成独立复跑；结论为
`INDEPENDENT_QA_PASS`，P0=0、P1=0、P2=0、P3=1（CGF-2B3.2/Central timing 偶发，非 R2D-1、非阻断）。
用户已于 2026-08-26 正式接受该结论，R2D-1 标记为 `PASS/CLOSED`。production CPC activation 与
production enterprise entitlement 继续 false，R2D-2～R2D-4 未因关闭自动解锁。独立 QA 已逐行核对 facts
source authority、single-message materialization、three-link version dispatch、Provider prepare-before-upstream
与 recovery exact reuse，并补跑 Central online/offline；完整证据见
[R2D-1 Claude Code 独立 QA](./qa/r2d-1-claude-qa.md)。
