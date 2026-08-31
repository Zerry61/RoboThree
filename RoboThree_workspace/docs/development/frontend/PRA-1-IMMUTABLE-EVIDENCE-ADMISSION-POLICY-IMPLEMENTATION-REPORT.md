# PRA-1 Immutable Evidence / Admission Policy 实施报告

> 日期：2026-08-28  
> 开发版本：Root/Core `0.0.0-r2dp.1-pra.1`  
> 状态：**PASS/CLOSED**  
> 最高输出：`PRA1_IMMUTABLE_EVIDENCE_ADMISSION_POLICY_CONFORMANT`

## 1. 实施结论

本批只冻结 Provider candidate 的 immutable evidence 与 admission policy，没有创建 production release：

- 新增 content-addressed evidence、policy 与 exclusion record；
- code-owned OpenAI 候选精确绑定 `gpt-5.2-2025-12-11`、Chat Completions、`xhigh`、exact adapter/projector/
  timeout identities；
- 候选状态保持 `pending_conformance`，`productionAdmitted=false`；
- DeepSeek 记录为 `requires_mapping_revision`，不会把新的 thinking/continuation 语义静默映射为 `xhigh`；
- production materializer 与 supported release count 均保持 0。

## 2. Immutable evidence 与 policy

`provider-release-admission-policy.ts` 冻结以下 code-owned canonical material：

- provider/API family；
- exact model snapshot allowlist；
- canonical endpoint identity rule；
- adapter descriptor 与 request projector revision；
- strongest sealed directive；
- default body omission、Usage、SSE terminal 与 Tool continuation 规则；
- timeout policy identity；
- official source URL、observed date 与 content-addressed claim digest；
- revocation/supersession rule，禁止 current/latest fallback。

OpenAI 候选依据官方 GPT-5.2 model 与 model guide 冻结：exact snapshot 为
`gpt-5.2-2025-12-11`，Chat Completions 使用 `reasoning_effort`，最强档包含 `xhigh`：

- <https://developers.openai.com/api/docs/models/gpt-5.2>
- <https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2>

网页只作为出处，release graph 只认仓库内 immutable material 与 digest。PRA-2/PRA-3 完成 exact subject-bound
materialization 与受控 conformance 前，不得把候选解释为可用 release。

## 3. DeepSeek 停手边界

DeepSeek exclusion record 明确记录现有 sealed projector 无法证明的两项：

1. 需要新增 directive/mapping revision；
2. Tool continuation 需要新的 Provider-private reasoning state。

因此 PRA-1 不添加 boolean/budget/token 字段，不修改 Gateway schema，不创建 JSON patch，也不把营销名称或 family
名称当作 supported 证据。任何新增映射能力必须另立 additive Provider mapping 批次并独立评审。

## 4. 文件边界

生产代码仅新增：

- `services/core/src/application/provider-release-admission-policy.ts`；
- `services/core/src/index.ts` 的 Core-private 导出。

测试与门禁新增 PRA-1 focused tests、共享 boundary test、`run-pra1-harness.mjs` 与 content-free Evidence。
未新增 release registry/materializer、Provider consumer、Secret、网络访问或公网测试；未修改 DFI-5.3 historical
Evidence/Harness、Contracts、Desktop/Admin、Central、migration、依赖或 lockfile。

## 5. 验证证据

| 门禁 | 结果 |
| --- | --- |
| `harness:pra1` | **PASS 5 files / 25 tests**；Evidence `sha256:f9aebbf3…15a66b` |
| 共享 focused tests | **PASS 3 files / 18 tests** |
| DFI-5.3.4 historical Harness | **PASS 19 TS files / 159 tests + 7 Java classes / 14 tests**；Evidence `sha256:bf89b2fd…3c3a08` |
| root `check`（宿主环境） | **PASS 298 files / 2057 tests + 3 smoke + Architecture boundary** |
| Central online / offline | **PASS 438 / 438** |
| lint / `audit:dtp4` / frozen offline install | **PASS** |
| migration / lockfile | `26` / `sha256:5b15ae01…874f31`（不变） |

关键 Evidence：`exactOpenAiCandidateCount=1`、`productionSupportedReleaseCount=0`、
`productionProviderReleaseMaterializerCount=0`、`productionLocalPersonalMaxReleaseCount=0`、
`productionSubmitTurnMaxReachable=false`、`desktopMaxUiReady=false`。

## 6. 下一步

独立 QA 与两轮报告精度修正已由用户正式接受，PRA-1 当前 `PASS/CLOSED`。该关闭不等于 OpenAI candidate
已 production admitted，也不自动授权 PRA-2/PRA-3 或 DFI-5.4.1～5.4.3。
