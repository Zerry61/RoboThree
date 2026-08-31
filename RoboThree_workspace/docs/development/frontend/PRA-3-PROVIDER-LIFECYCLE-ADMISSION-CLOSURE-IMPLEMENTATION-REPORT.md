# PRA-3 Provider Lifecycle / Admission Closure 实施报告

> 日期：2026-08-28  
> 开发版本：Root/Core `0.0.0-r2dp.3-pra.3`  
> 状态：**INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 最高输出：`PRA3_PROVIDER_LIFECYCLE_ADMISSION_CONFORMANT`

## 1. 实施结论

本批完成 exact OpenAI-compatible candidate 的 code-owned conformance/admission 基础，但没有安装 production
subject release：

- 保留 PRA-1 pending V1，新增 additive V2 `production_admitted` policy 与 readable single-dispatch；
- 新增 immutable conformance manifest，固定九类受控协议/生命周期向量与独立 digest；
- 新增 exact `gpt-5.2-2025-12-11` admitted policy source，DeepSeek 继续
  `requires_mapping_revision`；
- PRA-2 materializer 只有在 V2 policy、manifest、exact subject 与 Task lock 全量匹配后才能构造 module-private
  admitted result；
- controlled TLS/SSE/Tool continuation/lifecycle fixture 证明协议路径，不使用公网、真实 Secret 或付费调用；
- production bootstrap installed release count 与 production registry consumer count 都保持 0。

## 2. 关键实现

### 2.1 additive admitted policy

`ProviderReleaseAdmissionPolicyV2` 与 V1 并存；readable parser 只按 schemaVersion 单次 dispatch，未知版本
fail-closed。V2 exact policy 绑定 model snapshot、endpoint、adapter/projector/timeout identities 与 immutable manifest，
不会读取 current/latest alias。

### 2.2 immutable manifest 与 exact materialization

`provider-release-conformance-manifest.ts` 将 TLS、SSE、Usage、Tool continuation、timeout 与失败分类等九类向量
纳入独立 canonical material。`ExactSubjectBoundProviderReleaseMaterializer` 重算 policy/manifest/subject/Task lock
关系后才能返回 `production_admitted_materialized`；pending/admitted 仍由 module-private unique-symbol 类型证明隔离。

### 2.3 诚实 production 边界

code-owned admitted policy count 为 1，说明存在通过 conformance 的 exact release policy；它不等于当前用户 endpoint
可用，也不等于 release 已安装。bootstrap 没有 registry consumer，SubmitTurn Max 与 Desktop Max UI 继续不可达。

## 3. 主要文件

- `services/core/src/application/provider-release-conformance-manifest.ts`；
- `services/core/src/application/provider-release-admission-policy.ts`；
- `services/core/src/application/provider-release-admitted-source.ts`；
- `services/core/src/application/exact-subject-provider-release-materializer.ts`；
- PRA-3 policy/materializer/boundary tests、controlled lifecycle fixture、Harness 与 content-free Evidence。

未新增依赖，未修改 migration、Contracts、Central、Desktop UI 或 historical PRA/DFI Evidence。

## 4. 验证证据

| 门禁 | 结果 |
| --- | --- |
| `harness:pra3` | **PASS 6 files / 22 tests**；Evidence `sha256:ef0fb7a…a21e2b` |
| root `check` | **PASS 308 files / 2085 tests + 3 smoke + Architecture boundary** |
| Central online / offline | **PASS 438 / 438** |
| lint / `audit:dtp4` | **PASS** |
| frozen offline install | **PASS** |
| migration / lockfile | `26` / `sha256:5b15ae01…874f31`（不变） |

独立 QA 指出的 DTP-4 self-test 旧版本 fixture 已同步到本批 package 基线；focused self-test **1 file / 2 tests
PASS**，完整 root `check` 随后以最终退出码 0 重新通过 **308 files / 2085 tests + 3 smoke**。该修复仅维护
审计测试输入，不放宽 production audit，也不改变 PRA-3 代码或 Evidence。

Evidence 关键值：`conformanceVectorCount=9`、`codeOwnedAdmittedPolicyCount=1`、
`productionMaterializerCanAdmitExactSubject=true`、`productionBootstrapInstalledSubjectReleaseCount=0`、
`productionReleaseRegistryConsumerCount=0`、`productionSubmitTurnMaxReachable=false`、`desktopMaxUiReady=false`、
`deepSeekAdmitted=false`。

## 5. 当前边界

PRA-3 独立 QA 已通过并由用户正式接受，现为 `PASS/CLOSED`。该关闭不自动解锁 DFI-5.4.1；
DFI-5.4.1～5.4.3 及其他下游继续 `GATED`。
