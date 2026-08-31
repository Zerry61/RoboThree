# DFI-5.3.1 Private Mapping Foundation 实施报告

> 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-27  
> 版本：Root/Core `0.0.0-dfi.5.3.1`；Contracts `0.0.0-r2d.3.1`  
> 负责人：Codex 5.6  
> 上游：DFI-5.3 计划与 DFI-5.3.1 Digest Ordering 聚焦修订均 `PASS/CLOSED`

## 1. 本批结论

DFI-5.3.1 已完成 Provider-private mapping 基础，但尚未接入任何真实 Provider Adapter。实现严格采用聚焦修订冻结的非循环顺序：

```text
Provider-private Strategy commitment
  -> strategyDigest
  -> existing safe ReasoningProfile helper
  -> profileRevision == profileDigest
  -> full private mapping material
  -> mappingRevision == mappingDigest
```

当前最高输出为：

```text
DFI531_PRIVATE_MAPPING_FOUNDATION_CONFORMANT
```

它只证明 private mapping 的发布、摘要、exact lookup 与 Task-locked preflight 基础成立，不表示 Provider body mapping、Enterprise Gateway v1alpha3、production SubmitTurn v1alpha3 或 Desktop Max UI 已就绪。

## 2. 实现内容

### 2.1 Provider-private Domain

- 新增 strict、sealed Provider-private 类型，覆盖：
  - `enterprise_openai`；
  - `enterprise_anthropic`；
  - `local_openai`；
  - OpenAI `high | xhigh` effort；
  - Anthropic bounded thinking budget；
  - exact timeout policy identity。
- Strategy commitment material 明确排除所有派生 Profile/mapping revision 与 digest。
- `createProviderReasoningMappingRelease()` 固定执行 Strategy digest → safe Profile → full mapping digest，不允许调用方回填摘要或自由组合。
- 发布与读取时均重算 Strategy、Profile、mapping 三层事实；任一 byte drift 返回 typed `reasoning_mapping_conflict`。

关键实现：

- `services/core/src/application/provider-reasoning-mapping-domain.ts`
- `services/core/src/ports/provider-reasoning-mapping-source.ts`

### 2.2 Release-pinned Registry

- 新增 immutable exact registry；constructor 会校验所有 release，并拒绝 duplicate mapping identity、duplicate Strategy release identity 与 duplicate mapping ID。
- 只支持 exact subject/Profile/Strategy lookup；不提供 current alias，也不做缺失后的 fallback。
- production bootstrap 本批不安装该 registry，内置 production release 数保持 0。

关键实现：

- `services/core/src/application/release-pinned-reasoning-mapping-registry.ts`

### 2.3 Task-locked Mapper

- 严格校验 ModelRequest v1alpha2、TaskRuntimeSelection v1alpha2、Model lock、ReasoningModeLock 与 invocation identity。
- `default_passthrough` 在 Profile/mapping load 前直接返回 `omit`，读取次数均为 0。
- `max_applied` 对 exact Profile 与 private mapping 各读取一次；校验 Provider family、exact subject、Profile/Strategy refs 与 timeout policy identity。
- 缺失返回 typed `reasoning_mapping_unavailable`；重复或 material/digest/identity/timeout 冲突返回 typed `reasoning_mapping_conflict`。
- Mapper 尚未注入 Local Personal/Enterprise Provider；因此本批不会发送 reasoning 参数或产生 Provider 上游请求。

关键实现：

- `services/core/src/application/task-locked-reasoning-provider-mapper.ts`

## 3. 测试与证据

### 3.1 聚焦 24 项与父矩阵

- 聚焦差异修订新增 24 项断言全部保留并通过；没有用父方案矩阵替代聚焦矩阵。
- 父方案 120 项定义由 Harness 直接读取冻结文档并验证首尾区段，`parentMatrixDefinitionCount=120`、
  `parentMatrixRetained=true`；其中属于 DFI-5.3.2～5.3.4 的项目保留到阶段收口执行，不伪报为本批已完成。
- 三个新增 focused test files 为 25 tests，其中 24 项对应聚焦冻结矩阵，另 1 项冻结 cross-file conformance fixture。

### 3.2 专项 Harness

```text
pnpm run harness:dfi5.3.1
PASS 8 files / 61 tests
outcome=DFI531_PRIVATE_MAPPING_FOUNDATION_CONFORMANT
evidenceDigest=sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841
```

关键 evidence：

- `focusedMatrixAssertionCount=24`
- `parentMatrixDefinitionCount=120`
- `parentMatrixRetained=true`
- `parentMatrixExecutionStatus=retained_for_dfi53_stage_closure`
- `exactProfileLoadCountForMax=1`
- `exactMappingLoadCountForMax=1`
- `defaultProfileLoadCount=0`
- `defaultMappingLoadCount=0`
- `mappingFailureUpstreamSideEffectCount=0`
- `productionMapperConsumerCount=0`
- `publicPrivateMappingLeakCount=0`
- `providerAdapterConnected=false`
- `enterpriseGatewayV1Alpha3Ready=false`
- `productionSubmitTurnV1Alpha3Reachable=false`
- `desktopMaxUiReady=false`
- `dfi532Unlocked=false`

证据文件：`artifacts/dfi531/evidence.json`。

### 3.3 全仓门禁

| 门禁 | 结果 |
| --- | --- |
| focused TypeScript tests | PASS 3 files / 25 tests |
| `pnpm run harness:dfi5.3.1` | PASS 8 files / 61 tests |
| `pnpm run check`（非沙箱） | PASS 287 files / 1986 tests + 3 smoke |
| `pnpm run audit:dtp4` | PASS |
| `pnpm install --offline --frozen-lockfile` | PASS |
| Central offline | PASS 424/0/0/0 |
| Central online | 首跑 422/424；既有 CGF-2B3.2 时序测试 2 项偶发；该 class 单独复跑 3/3 PASS |

Central online 首跑失败位于 `Cgf2b32DualNodeRelayRecoveryIntegrationTest` 的 failpoint/fencing timing，DFI-5.3.1 在 Central Java source graph 中无改动。首跑事实保留，不用自动重试伪装成一次全绿；对应 class 独立复跑已证明 3/3 通过，Central offline 随后完整 424/424 通过。

## 4. 边界核对

- `packages/contracts/src/**`：0 修改；
- migration：仍止 26，无 migration 27；
- dependency / `pnpm-lock.yaml`：本批 0 修改，digest 仍为 `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；
- Provider Adapter / Enterprise Gateway / Central / Desktop / Admin / Main / Preload / IPC：本批 0 接线；
- raw directive、private mapping material/digest：公共 Contract、Task Receipt、UI 与日志扫描命中 0；
- DFI-5.3.2～5.3.4、DFI-5.4 及其他下游继续 GATED。

## 5. 下一步

Claude Code 独立 QA 已通过并由用户正式接受，DFI-5.3.1 当前 `PASS/CLOSED`。父方案 120 项 QA 矩阵继续以
`retained_for_dfi53_stage_closure` 保留，不视为本批已全部执行。DFI-5.3.2 已进入独立文档评审，获得用户单独
编码授权前仍为 `CODING GATED`。
