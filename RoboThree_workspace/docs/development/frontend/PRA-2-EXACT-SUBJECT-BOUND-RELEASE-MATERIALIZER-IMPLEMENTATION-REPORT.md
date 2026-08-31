# PRA-2 Exact Subject-bound Release Materializer 实施报告

> 日期：2026-08-28  
> 开发版本：Root/Core `0.0.0-r2dp.2-pra.2-repair.1`  
> 状态：**IMPLEMENTED / DEVELOPER GATES PASS / REPAIR.1 FOCUSED RE-QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 最高输出：`PRA2_EXACT_SUBJECT_RELEASE_MATERIALIZER_CONFORMANT`

## 1. 实施结论

本批完成纯函数、无 I/O 的 exact subject-bound Provider release materializer，但没有 admission 或安装 production
release：

- 将 PRA-1 code-owned policy 与 exact local subject、definition/head/status、safe Credential observation、Task lock、
  exact endpoint、adapter/projector/timeout identity 绑定；
- deterministic 派生 subject-bound Strategy/Profile/mapping/materialization identities；
- 复用 DFI-5.3 `createProviderReasoningMappingRelease()` 与三层非循环 digest；
- 返回 content-free safe envelope，不含 endpoint、model ID、Credential、raw directive 或 Secret；
- 当前 policy 仍为 `pending_conformance`、`productionAdmitted=false`，所以 production admitted materialized count、
  supported release count 与 registry consumer count 全部为 0；
- DeepSeek exclusion、DFI-5.3 historical Evidence/Harness 与 Provider body path 均未改变。

独立 QA 后的聚焦代码复核发现原实现只声明了 pending/rejected 两态，却被 QA 报告误写为三态。repair.1 已补齐
`production_admitted_materialized` 独立类型，并以 module-private `unique symbol` admission proof 使其在当前批次
不可构造：当前运行时仍只可能返回 pending/rejected，未来必须在同一 code-owned 模块新增 admitted policy/PRA-3
证明路径才能构造第三态。这样既落实方案 QA-047 的类型隔离，也没有把 production admission 提前打开。

## 2. Exact 校验顺序

`ExactSubjectBoundProviderReleaseMaterializer` 按固定顺序验证：

1. policy ID、snapshot model 与 admission 状态；
2. LDA/local owner namespace；
3. Personal Model definition/head/status exact revision/digest；
4. safe Credential observation present 且 binding digest 匹配（不 resolve Secret）；
5. Task capability lock exact subject；
6. canonical Chat Completions endpoint；
7. adapter contract、request projector 与 timeout policy identity；
8. deterministic IDs 与 DFI-5.3 release digest 全量重算。

任一 alias/current fallback、head drift、endpoint/identity mismatch 或 Credential absence 都返回 typed rejected，且
Secret resolution、DNS、socket、TLS、HTTP、durable prepare 与 Usage count 保持 0。

## 3. 单一 identity ownership

PRA-1 中 adapter contract 与 Local OpenAI projector revision 提升为 exported code-owned constants；PRA-1 candidate
继续消费同一常量，历史 PRA-1 evidence digest 保持 `sha256:f9aebbf3…15a66b`。PRA-2 不重算或另存一份
identity 公式，避免 policy 与 materializer 漂移。

## 4. 文件边界

主要生产变更：

- `services/core/src/application/exact-subject-provider-release-materializer.ts`；
- `services/core/src/application/provider-release-admission-policy.ts`；
- `services/core/src/index.ts` 的 Core-private export。

测试与门禁新增 PRA-2 focused tests、共享 boundary test、`run-pra2-harness.mjs` 与 content-free Evidence。
未修改 public Contracts、Desktop/Admin/Central、Provider Adapter/body、migration、依赖或 lockfile；未安装 release、
未接 bootstrap/SubmitTurn、未开启 PRA-3 或 DFI-5.4.x。

## 5. 验证证据

| 门禁 | 结果 |
| --- | --- |
| `harness:pra2` repair.1 | **PASS 5 files / 24 tests**；Evidence `sha256:1efc27e9…894eda`；`sealedOutcomeVariantCount=3` |
| 受影响 focused tests | **PASS 4 files / 43 tests**（与 R2D-P.2 共享） |
| root `check`（repair.1，宿主环境） | **PASS 301 files / 2070 tests + 3 smoke + Architecture boundary** |
| Central online / offline | **PASS 438 / 438** |
| lint / `audit:dtp4` | **PASS** |
| migration / lockfile | `26` / `sha256:5b15ae01…874f31`（不变） |

Evidence 关键值：`materializedAdmissionState=pending_conformance_materialized`、
`productionAdmittedMaterializedCount=0`、`productionSupportedReleaseCount=0`、
`productionReleaseRegistryConsumerCount=0`、`exactSubjectValidation=true`、
`deterministicMaterialization=true`、`secretResolutionCount=0`、`upstreamRequestCount=0`、
`pra3Unlocked=false`、`dfi541Unlocked=false`。

## 6. 当前边界

PRA-2 尚需独立 QA 和用户接受。当前 candidate 只是 PRA-3 lifecycle/conformance 的可验证输入，不是 production
admitted release。PRA-3、R2D-P.3、DFI-5.4.1～5.4.3 及其他下游继续 `GATED`。
