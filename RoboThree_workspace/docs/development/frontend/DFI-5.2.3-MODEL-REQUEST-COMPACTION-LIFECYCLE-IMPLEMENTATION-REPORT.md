# DFI-5.2.3 ModelRequest / Compaction Binding v1alpha2 与 Lifecycle Harness 实施报告

> 状态：**IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING**  
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 计划评审：**PASS/CLOSED**  
> 本批最高输出：`DFI52_TASK_REASONING_LOCK_CONFORMANT`

## 1. 交付结论

本批已把 DFI-5.2.2 持久化的 `TaskRuntimeSelection v1alpha2 + ReasoningModeLock` 接入既有
Model Request、Agent Loop、Tool 后续轮、initial/rolling Compaction、retry/restart 与 terminal replay。
同一 Task 的所有模型请求由同一个 durable Reasoning lock 物化；Context receipt 与最终 v1alpha2 request
使用同一个 request digest；恢复不会重读 Preference/Profile 或生成新 lock。

本批不映射任何真实 Provider Max 参数，不开放 production SubmitTurn v1alpha3、Main/Preload/Renderer
接口，也不宣称 Max feature production ready。DFI-5.3～5.4 继续 `GATED`。

## 2. 实现内容

### 2.1 Model Protocol 与最终摘要

- 新增 Core-private `@robothree/contracts/model-protocol/v1alpha2`；只升级顶层 request envelope，复用
  v1alpha1 message/tool/artifact 子结构；
- `reasoning` 使用 strict `default_passthrough | locked_max_strategy` discriminated union；
- v1alpha2 request digest 由完整 v2 canonical material 唯一计算，包含 schema version 与 reasoning material；
- Contracts 根入口 `ModelRequestSchema` 继续只表示 v1alpha1，Desktop/Admin 不导入 private v2；
- `TaskReasoningRequestMaterializer` 是 main、Tool continuation 与 Compaction 的唯一 reasoning 物化器；
- `TaskReasoningRequestFinalizer` 原子返回最终 request 与 Context receipt，二者的
  `modelRequestDigest` 精确相等。

### 2.2 Task bundle、Agent Loop 与恢复

- Task persistence 增加 single-dispatch executable bundle loader：按 durable schema version 严格加载，
  损坏的 v2 不 fallback 为 v1；合法历史 v1 仍由 legacy loader 读取；
- `DurableAgentLoopStarter` 对 reasoning-aware bundle 的 main、Tool next round、continuation、Compaction
  复用同一 lock id/digest；terminal replay 不重建 request、不解析 Provider；
- coordination v1alpha3 accepted recovery 使用原 durable selection/lock，不重读 Preference/Profile；
- InMemory 与 SQLite 共用 readable runtime selection/binding validator，未新增 migration 27。

### 2.3 Compaction Binding v1alpha2

- additive v1alpha2 binding 绑定 Reasoning lock id/digest 与 ModelRequest protocol v1alpha2；
- binding 只收窄 Compaction 的调用参数身份，不扩大 main authorization；
- initial/rolling Compaction 使用与 main 相同的 reasoning materializer；
- readable v1/v2 union 保持历史 binding 可读，indexed columns 与既有持久层结构不变。

### 2.4 Provider 失败关闭

- local personal raw/durable Provider 与 enterprise durable Provider 在收到 v1alpha2 request 且尚无
  DFI-5.3 mapping 时，统一返回 typed `reasoning_protocol_unavailable`；
- 失败发生在 Credential resolve、DNS、socket/TLS、HTTP body、Gateway dispatch、invocation fact 与
  Usage projection 之前；测试中 local credential/DNS 与 enterprise link/Gateway 计数均为 0；
- 不以 schema parse error 冒充安全阻断，不静默忽略 reasoning material。

### 2.5 Lifecycle Harness

- 扩展真实 50-round Tool Loop/Compaction Harness：51 次模型轮次全部为 v1alpha2，始终复用同一个
  Reasoning lock；
- 新增真实 Core child + SQLite reopen + deterministic barrier + SIGKILL 场景；新 PID 读取原 binding、
  request digest 和 Reasoning lock；
- 同一 semantic seed 三轮 fresh process replay digest 一致，seed 排除 PID、端口、路径、墙钟和 transport
  nonce；
- 资源与进程事实来自真实 child/binding evidence，不使用 sleep、自动重试或硬编码资源 0。

## 3. 版本与边界

- Contracts：`0.0.0-dfi.5.2.3`；
- Core：`0.0.0-dfi.5.2.3`；
- Root/Desktop 保持共享 PTX-4 基线；Admin/Central/Document Worker 版本不变；
- migration 仍止于 26，无 migration 27；
- 未新增依赖，`pnpm-lock.yaml` 未修改；
- 未修改 Renderer、Main IPC、Preload API、Admin、Central production、Document Worker 或 Provider raw
  Max mapping。

## 4. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `CI=true VITEST_MAX_WORKERS=1 pnpm run harness:dfi5.2.3` | **PASS 11 files / 111 tests** |
| `CI=true pnpm run lint` | **PASS；Architecture boundary PASS** |
| `CI=true VITEST_MAX_WORKERS=1 pnpm run check` | **PASS 258 files / 1723 tests + 3 smoke** |
| `CI=true pnpm run check:central`（JDK 21） | **PASS 404/0/0/0** |
| `CI=true pnpm run check:central:offline`（JDK 21） | **PASS 404/0/0/0** |
| `CI=true pnpm install --frozen-lockfile --offline` | **PASS；workspace already up to date** |
| `CI=true pnpm run audit:dtp4` | **PASS** |

## 5. QA 状态与下游

- 开发者自检：P0=0、P1=0、P2=0、P3=0；
- 当前等待 Claude Code 独立 QA，尚未 `PASS/CLOSED`；
- DFI-5.3 Provider Mapping、DFI-5.4 Desktop UI、AAPI-0.3～0.4、TGM、Knowledge Provider 继续
  `GATED`，不得因本批门禁通过自动解锁。
