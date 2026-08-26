# CPC-3 Lifecycle / Eval Closure 实施报告

> 日期：2026-08-26  
> 版本：`0.0.0-cpc.3-repair.1`  
> 状态：**PASS/CLOSED**  
> 最高输出：`CPC_CORE_PROMPT_MVP_CONFORMANT`  
> production activation：**disabled**

## 1. 交付结论

CPC-3 已使用 CPC-1/2 现有 compiler、runtime resolver、Context Pipeline、Durable Agent Loop、
Compaction 和 SQLite persistence 完成生命周期与安全收口。本批没有新建 Prompt/Context 平台，没有修改
生产 CPC 语义，也没有启用 production activation。

`CPC_CORE_PROMPT_MVP_CONFORMANT` 只表示工程 conformance 成立：无 Skill Task 的 exact Instruction Bundle 可以
在 main、Tool continuation、Compaction、retry、Core restart 与 terminal replay 中稳定重建；带 Skill Task
在 production resolver 缺失时仍 typed fail-closed。该结论不代表真实模型行为评估已通过。

## 2. 实现内容

### 2.1 Lifecycle 与失败矩阵

- 新增 CPC-3 lifecycle/eval 测试，使用真实 `TaskLockedInstructionRuntimeResolver`、
  `ContextPipeline`、`DurableAgentLoopStarter` 和 50-round Tool Loop；
- 验证 main 首轮 + 50 次 Tool continuation 的 51 个 ModelRequest 始终只含一条 exact System Message；
- initial/rolling Compaction summary 继续是 data segment，不提升为 System/Developer 指令；
- L1～L7、F1～F8 覆盖 continuation、retry、legacy、gate disabled、source missing/drift、Skill unavailable、
  budget 超限与 terminal replay；
- 12 类 normative conflict/injection corpus 验证低权威文本不能改写 Tool、Workspace、Authorization 和
  structured outcome。

### 2.2 真实进程恢复

- Parent 启动真实 Core child，child 使用真实 SQLite Task/Conversation persistence；
- C1～C6 分别在 `task_bundle_loaded`、`instruction_bundle_materialized`、
  `model_request_finalized`、`tool_result_committed`、`compaction_committed`、
  `assistant_committed` exact barrier 后 SIGKILL；
- 同一 SQLite 文件由新 PID reopen，不使用 `throw` 或单进程 fake 冒充崩溃；
- 三轮 fresh process semantic replay digest 一致，digest 排除 PID、端口、路径、墙钟和 transport nonce。

### 2.3 泄漏与资源证据

- 扫描 stdout、stderr、`evidence.json`、`failure.json` 四通道；
- 用 5 类 sentinel marker 的 raw/base64/hex/url 四编码完成 80 次负向注入证明；
- 12 类资源计数来自真实 child diagnostic 与 OS process observation，未使用硬编码终值或 `?? 0`；
- 所有四通道泄漏命中为 0，12 类终态资源均归零。

## 3. 证据结果

| 证据 | 结果 |
| --- | --- |
| CPC-3 focused | 9 files / 68 tests PASS |
| lifecycle | 7 类正向、8 类 typed failure；50 Tool rounds / 51 main requests |
| process recovery | C1～C6 六窗口，真实 SIGKILL + SQLite reopen + 新 PID |
| semantic replay | 3 轮一致，`sha256:e654fb70cc8a6e730003b64736ee03530f49148e5d92c0fe3e4670f9443ac168` |
| conflict corpus | revision `cpc3.normative-corpus.v1`，12 cases |
| 泄漏证明 | 4 通道命中 0，80 次负向注入全部可检出 |
| 资源 | 12 类真实终态计数全部为 0 |
| 真实模型观察 | `MODEL_BEHAVIOR_EVAL_NOT_RUN_APPROVED_PROFILE_MISSING` |

## 4. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `harness:cpc3` | PASS：9 files / 68 tests |
| `audit-dtp4-packaging.test` / `audit:dtp4` | PASS：1 file / 2 tests；packaging audit PASS |
| 完整 `check`（非沙箱） | PASS：266 files / 1794 tests + 3 smoke + Architecture boundary |
| Central online | PASS：404/0/0/0 / BUILD SUCCESS |
| Central offline | PASS：404/0/0/0 / BUILD SUCCESS |
| frozen offline install | PASS：使用本机完整 pnpm store，338 reused / 0 downloaded |
| lockfile | SHA-256 `c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07`，未变 |
| migration | 最大 id 26，无 27 |

沙箱内 root check 的 loopback 用例因 `listen EPERM` 失败，隔离 Keychain 也无法创建；同一代码在非沙箱
环境从零复跑全部通过。Central 首轮因 Docker daemon 未启动仅 3 个 Testcontainers 用例报环境错误；启动
Docker Desktop 后 online/offline 均从零 404/0/0/0 通过。本批未通过跳过测试或放宽断言掩盖这些环境差异。

## 5. 边界与未实现

- `productionCpcActivationEnabled=false`；
- `productionSkillResolverPresent=false`；
- `knowledgeProviderReady=false`、`memoryReady=false`、`effectReconciliationReady=false`；
- `desktopAdminEntryReady=false`、`dfi53Unlocked=false`；
- 未修改 public/private Contracts、Provider-private mapping、Desktop/Admin、Central production、Document Worker、
  migration、依赖或 `pnpm-lock.yaml`。

## 6. 当前状态

```text
CPC-3 repair.1 = PASS/CLOSED
CPC-3 = PASS/CLOSED
CPC 全线 = PASS/CLOSED
production CPC activation = disabled
DFI-5.3 子批 / AAPI-0.3～0.4 / TGM / Knowledge Provider /
Memory / Effect Reconciliation / Desktop / Admin = GATED
```

独立 re-QA 已通过且用户已正式接受。该关闭不自动启用 production CPC activation，也不解锁任何下游。

## 7. 独立 QA P2 repair.1

独立 QA 发现真实进程 fixture 曾对完整 `TaskSubmitTurnBinding` 再次计算摘要，而 production Agent Loop 使用
binding 已持有的 exact `bundleDigest`。repair.1 将 fixture 的 `submitTurnBundleDigest` 改为
`bundle.binding.bundleDigest`，使 TaskInstructionBinding 与 semantic replay 使用 production 同一事实。
修复后 focused Harness 仍为 9 files / 68 tests PASS，三轮 fresh process digest 更新为上表值；生命周期、
泄漏、资源与六项 false 结论不变；packaging audit、完整 check、frozen offline install 与 lockfile/migration
边界也已从 repair.1 基线复跑通过。独立 re-QA 为 P0～P3 全 0，用户已于 2026-08-26 正式接受并按
repair.1 → CPC-3 → CPC 全线的顺序关闭。

## 8. 用户接受后的最终状态

- `0.0.0-cpc.3-repair.1`：`PASS/CLOSED`；
- CPC-3：`PASS/CLOSED`；
- CPC 全线：`PASS/CLOSED`；
- production CPC activation：`disabled`；
- DFI-5.3 子批、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、Effect Reconciliation、
  Desktop/Admin：继续 `GATED`。
