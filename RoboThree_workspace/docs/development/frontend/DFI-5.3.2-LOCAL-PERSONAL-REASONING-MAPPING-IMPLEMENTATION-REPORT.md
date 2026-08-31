# DFI-5.3.2 Local Personal Reasoning Mapping 实施报告

> 日期：2026-08-27  
> 开发版本：Root/Core `0.0.0-dfi.5.3.2`；Contracts `0.0.0-r2d.3.1`（不变）  
> 状态：**PASS/CLOSED**  
> 最高输出：`DFI532_LOCAL_PERSONAL_REASONING_MAPPING_CONFORMANT`

## 1. 实施结论

DFI-5.3.2 已把 DFI-5.2 锁定的 reasoning 决策接入 Local Personal
OpenAI-compatible Provider。接线严格分为两条路径：

- `default_passthrough` 及三类 fallback 只产生 sealed `omit` projection，request body 不出现
  `reasoning`、`effort`、`thinking`、`budget` 或 `enable_thinking`；
- `max_applied` 只按 Task 中 exact `ReasoningModeLock`、Capability lock、Profile revision、Strategy
  revision 与 immutable private mapping release 生成 sealed `reasoning_effort: high | xhigh`。

当前没有获批的 production Local Personal Max release，production supported release count 保持 0。因此本批
证明的是 Local 接线与失败关闭语义，不宣称任一真实个人模型已经 production Max ready。

## 2. Revision 2 exact subject 落地

`ReasoningProfileSubject` 使用以下分层事实：

| 事实 | authority |
| --- | --- |
| `modelCapabilityId` | exact Personal Model definition / Task Capability lock |
| `modelCapabilityRevision` | `TaskCapabilityLock.definitionSnapshot.revision` |
| Personal configuration binding | 已验证 definition + Personal lock `configurationRef` |
| `personalExecutionDefinitionDigest` | exact Personal execution definition |
| Adapter identity | exact adapter descriptor ID + revision |

Capability definition revision、Personal configuration revision、execution digest 与 Adapter revision 不互相替代。
这正是 Revision 2 修复的摘要域边界。

## 3. 主要实现

### 3.1 Local sealed projection 与 timeout identity

新增 `local-personal-reasoning-mapping.ts`：

- `LocalPersonalReasoningProjection` 只有 `omit` 和 `apply/local_openai/openai_reasoning_effort` 两个分支；
- `mappingRevision === mappingDigest`，raw Adapter 不能接收任意 JSON patch；
- 新增 code-owned `timeout.local-personal.model-invocation.v1`，revision/digest 与四阶段 timeout 数值复用既有
  `LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1`；
- raw Adapter 进行独立 defence-in-depth：重验 request、Runtime Selection v1alpha2、ReasoningModeLock、
  Strategy refs 与 timeout ref，不读取 current Profile 或 current mapping。

### 3.2 mapping-before-durable-prepare

`DurableLocalPersonalModelProvider` 的顺序固定为：

1. parse readable ModelRequest；
2. terminal/recovery replay exact lookup；
3. 非 terminal 的 v1alpha2 请求派生 exact subject 与 timeout identity；
4. `TaskLockedReasoningProviderMapper` exact load；
5. 转为 sealed Local projection；
6. 才允许 prepare durable Invocation Link；
7. raw Provider Adapter 独立校验并构造 body；
8. body 构造完成后才允许 Credential resolve / DNS / socket / TLS / HTTP。

映射缺失、重复、漂移或 timeout identity 冲突均在 durable prepare 与上游 I/O 前失败关闭。terminal replay 不重读
Profile/mapping，也不再次调用 raw Adapter。

### 3.3 body-level 映射

Local OpenAI-compatible serializer 采用 allowlist 构造：

- `omit`：与 legacy body 在 reasoning 字段外等价，reasoning 相关字段数为 0；
- `apply`：只增加一个 `reasoning_effort`，取值仅为 sealed `high | xhigh`；
- 不发送 `low`、`minimal`、`off` 或 boolean 参数模拟默认模式。

既有受控 loopback TLS/SSE/Usage/Tool fixture 与本批 exact body projector、durable mapping tests 一起进入专项
Harness；不访问公网、不使用用户 Secret，也不放宽 `[DONE]` 终态规则。

## 4. 文件边界

本批生产实现仅涉及：

- `services/core/src/application/local-personal-reasoning-mapping.ts`；
- `services/core/src/application/durable-local-personal-model-provider.ts`；
- `services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts`；
- `services/core/src/index.ts` 的 Core-private 导出。

测试/门禁涉及 DFI-5.3.2 两个测试文件、stage-aware DFI-5.3.1 boundary、专项 Harness、packaging version
baseline 与治理文档。未修改：

- `packages/contracts/src/**`；
- Enterprise Provider / Central Gateway；
- Desktop / Admin；
- SQLite migration（仍止 26）；
- 依赖与 `pnpm-lock.yaml`；
- DFI-5.3.3～5.3.4、DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle。

## 5. 验证证据

环境：Node `v24.13.0`、pnpm `11.11.0`、JDK `21.0.12`。

| 门禁 | 结果 |
| --- | --- |
| `pnpm run harness:dfi5.3.2` | PASS，8 files / 66 tests |
| DFI-5.3.2 evidence digest | `sha256:d8fcaa832b0aa689d6d939e143fc56e3cf3180b28f77f50c4f14e5e020ef60fb` |
| DFI-5.3.1 historical evidence | 保持 `sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841` |
| `pnpm run check`（非沙箱） | PASS，289 files / 1998 tests + 3 smoke |
| `pnpm run check:central` | PASS，424 / 0 / 0 / 0 |
| `pnpm run check:central:offline` | PASS，424 / 0 / 0 / 0 |
| `pnpm run lint` / Architecture boundary | PASS |
| `pnpm run audit:dtp4` | PASS |
| `pnpm install --frozen-lockfile --offline` | PASS |
| `git diff --check` | PASS |

专项 evidence 同时证明：

- default Profile/mapping load = `0/0`；
- max Profile/mapping load = `1/1`；
- terminal replay 新增 mapping load = 0；
- mapping failure durable prepare count = 0；
- authorized Local consumer = 1；unexpected/Enterprise/public leak = 0；
- production supported release count = 0；
- production SubmitTurn v1alpha3、Desktop Max UI 与 DFI-5.3.3 均未解锁；
- 本批 96 项矩阵连续，父方案 120 项继续标记
  `retained_for_dfi53_stage_closure`，不伪报为本批已全部执行。

`pnpm-lock.yaml` digest 保持
`sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。

## 6. 后续状态

独立 QA 已以 P0～P3 全 0 通过并由用户正式接受，DFI-5.3.2 当前 `PASS/CLOSED`。DFI-5.3.1 historical
evidence/Harness 保持只读，父方案 120 项矩阵继续保留至 DFI-5.3 阶段收口。DFI-5.3.3 当前仅进入详细方案
评审；DFI-5.3.4、DFI-5.4、TGM、Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption
继续 GATED。
