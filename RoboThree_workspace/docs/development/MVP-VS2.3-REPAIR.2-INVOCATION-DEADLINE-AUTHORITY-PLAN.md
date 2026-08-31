# MVP-VS2.3 repair.2 — Invocation Deadline Authority 聚焦实施方案

> 状态：**PASS/CLOSED**  
> 日期：2026-08-30  
> 上游：VS2.1、VS2.2 `PASS/CLOSED`；VS2.3 计划 `PASS/CLOSED`；VS2.3 repair.1 `IMPLEMENTATION STOP`  
> 预计投入：0.25～0.5 个集中工程日  
> 触发事实：[VS2.3 repair.1 deadline authority 停手报告](./MVP-VS2.3-REPAIR.1-DEADLINE-AUTHORITY-IMPLEMENTATION-STOP-REPORT.md)

> 用户接受实施停手后选择方案 A：internal legacy 与 V2 strict record 均 additive 接受可选 deadline，historical
> 缺字段可读，active recovery 缺字段 fail-closed。该最小修订已实现并通过聚焦验证；旧停手事实与解决记录见
> [repair.2 实施停手报告](./MVP-VS2.3-REPAIR.2-LEGACY-LINK-AUTHORITY-IMPLEMENTATION-STOP-REPORT.md)。
> repair.2 已解除 deadline blocker；父 VS2.3 真实 E2E 随后在 PPTX 预览来源解析处触发新的独立停手条件，详见
> [PPTX 预览来源停手报告](./MVP-VS2.3-PPTX-PREVIEW-AUTHORITY-IMPLEMENTATION-STOP-REPORT.md)。
> 独立聚焦代码 QA `CODE_QA_PASS`（P0～P3 全 0）已由用户正式接受；本关闭仅适用于 repair.2 子批，父
> VS2.3 继续 paused。

## 0. 决策摘要

repair.2 只补一个已被真实 Electron E2E 证明缺失的 internal durable fact：
`providerRequestDeadlineAt`。

首次 Enterprise Model invocation prepare 时，把已经用于 Gateway accept request 的 exact deadline 写入既有
Model invocation link `record_json`；同一 invocation 恢复时，必须读取并复用该值，不得根据新 Core 的当前时间重新计算。

本批不新增产品能力，不改变用户可见 API，不创建新的恢复入口。完成后只解除 repair.1 的 deadline blocker，随后恢复
repair.1 并继续验证：

```text
one Gateway accept
two SSE subscriptions
same invocationId / clientRequestId / Assistant Message
zero duplicate Tool dispatch / Artifact / output bytes
```

## 1. 已确认的失败事实

真实 Electron E2E 已证明：

1. round-1 read Tool Result 已 durable `result_committed`；
2. round-2 Model invocation link 已 accepted；
3. `outputStartedAt`、`messageCommittedAt` 均为空；
4. 新 Core 能唯一恢复 Task/Run/Step/round、Assistant Message、prior Tool Results 与 ModelRequest id/digest；
5. Provider prepare 返回 `model_invocation_link.conflict`；
6. Gateway request digest 包含 `timeoutPolicy.providerRequestDeadlineAt`；
7. 当前 link 未保存该 deadline，新 Core 只能用当前时间重新计算，因此 exact digest 漂移。

这不是 SSE 实现问题，也不是 Renderer/Main/Preload 接口问题。

## 2. 冻结边界

### 2.1 允许修改

- `services/core/src/ports/model-invocation-link-persistence.ts`
- `services/core/src/application/model-invocation-link-digest.ts`
- `services/core/src/application/durable-enterprise-model-provider.ts`
- `services/core/src/adapters/memory/in-memory-model-invocation-link-persistence.ts`（仅必要适配）
- `services/core/src/adapters/sqlite/sqlite-model-invocation-link-persistence.ts`（仅 JSON record 行为与测试）
- 对应 focused tests
- repair.1 starter/coordinator/bootstrap WIP 的必要接续
- 既有 `scripts/run-mvp-vs2-electron.mjs`
- 实施报告与治理文档

### 2.2 明确禁止

- 不修改 `packages/contracts/src/**`；
- 不新增或修改 migration、表、列、索引；migration 继续止 26；
- 不新增依赖，不修改 lockfile；
- 不修改 Desktop Main/Preload/Renderer production API；
- 不新增 Gateway route、字段或公开协议；
- 不新增恢复表、恢复状态机、通用 Lifecycle framework；
- 不重写 historical Harness/Evidence；
- 不恢复 Personal Model、Admin mutation、TGM、Knowledge Provider 或 Agent Lifecycle；
- 不用 fixture clock 伪造 production deadline 一致。

## 3. G1 — Internal additive deadline fact

在现有 `ModelInvocationLinkV2` internal record 中增加可选字段：

```text
providerRequestDeadlineAt?: canonical UTC timestamp
```

选择 optional additive，而不是新增公开 Contract 或 migration：

- SQLite authority 已把完整 link 存入 `record_json`，无需新列；
- Memory adapter 同样保存完整对象；
- historical v2 link 没有该字段仍可读取；
- 新 prepare 路径必须写入该字段；
- startup recovery 遇到 accepted、未完成且缺该字段的历史 link，必须 typed/internal fail-closed，不猜测 deadline。

字段不得从 `recordDigest`、prepared-link exact comparison 或 JSON record 中删除。

## 4. G2 — 首次 prepare 与恢复 exact reuse

### 首次调用

1. `DurableAgentLoopStarter` 生成本轮 invocation deadline；
2. deadline 进入 `ModelProviderInvocation.deadlineAt`；
3. `DurableEnterpriseModelProvider.#prepareLink(...)` 将同一个值写为
   `providerRequestDeadlineAt`；
4. Gateway converter 使用该同值生成 timeout policy 与 request digest。

### 恢复调用

1. repair.1 recovery seed 从 exact incomplete link 读取 `providerRequestDeadlineAt`；
2. active round 的 `buildInvocation` 复用该值；
3. Provider prepare 的所有 immutable facts必须与原 link exact match；
4. link 已有 `invocationId`，因此跳过 accept，执行 status + SSE subscription；
5. 不得修改 deadline、延长 deadline 或按重启时间重新计时。

若原 deadline 已过期，沿用既有 Gateway/timeout fail-closed 语义；repair.2 不发明续期规则。

## 5. G3 — Exact prepared-link comparison

`samePreparedModelInvocationLink(...)` 必须满足：

- 两侧都缺 deadline：仅保留 historical read/replay 兼容，不允许进入 repair.1 active recovery；
- 两侧都有 deadline：逐字相等；
- 一侧有、一侧无：conflict；
- deadline 不同：conflict；
- 其他既有字段比较规则零漂移。

严禁为通过 E2E 而从 comparison 删除 `centralAcceptRequestDigest`、deadline、ModelRequest digest、scope 或 dynamic facts。

## 6. G4 — 单次 dispatch 与字节级恢复证明

真实 E2E 必须同时断言：

- round-1 accept count = 1；
- round-2 accept count = 1；
- round-2 SSE subscription count = 2；
- round-3 accept count = 1；
- Gateway total accept count = 3；
- 两次 round-2 subscription 对应同一 invocationId/clientRequestId；
- 恢复后的完整 Provider 输出字节与 fixture 原始预期逐字相等；
- read Tool execution count = 1；
- PPTX write Tool execution count = 1；
- Artifact count = 1；
- SQLite reopen 后 Task/业务步骤/Artifact 可见。

不得把“同 clientRequestId 再 accept”表述为恢复成功。

## 7. 实施步骤

### Step 1 — Deadline record focused proof（0.1 日）

- 先写 Memory/SQLite round-trip；
- 验证 historical absent 可读取；
- 验证 new prepare 必须保存 exact deadline；
- 验证 missing/mismatch fail-closed。

### Step 2 — Provider prepare + repair.1 seed 接线（0.1～0.2 日）

- 首次 prepare 写 exact deadline；
- recovery seed 携带 exact deadline；
- active round buildInvocation 复用，不重新计算；
- 非 recovery 路径行为零漂移。

### Step 3 — 聚焦回归与真实 Electron E2E（0.1～0.2 日）

- Provider/link focused tests；
- repair.1 15 项 focused tests；
- VS2.1/VS2.2 focused regression；
- 同一真实 Electron E2E；
- typecheck、focused lint、DTP-4 audit、`git diff --check`。

## 8. 聚焦 QA（16 项）

1. QA-001：internal v2 schema additive 接受 canonical `providerRequestDeadlineAt`。
2. QA-002：historical v2 record 缺字段仍可读取。
3. QA-003：新 Enterprise main invocation prepare 写入 exact deadline。
4. QA-004：Memory adapter round-trip 不丢字段。
5. QA-005：SQLite `record_json` round-trip 不丢字段。
6. QA-006：record digest 覆盖 deadline。
7. QA-007：prepared comparison 的相同 deadline 通过。
8. QA-008：prepared comparison 的 deadline 漂移 conflict。
9. QA-009：prepared comparison 的一侧缺失 conflict。
10. QA-010：accepted active recovery 缺 deadline fail-closed。
11. QA-011：repair.1 seed 携带原始 deadline。
12. QA-012：active round buildInvocation 不调用 current-time deadline 计算。
13. QA-013：非 recovery invocation 仍按既有策略生成 deadline。
14. QA-014：round-2 一次 accept、两次 SSE subscription、同 invocation。
15. QA-015：输出字节、Tool dispatch、Artifact 全部无重复。
16. QA-016：Contract/migration/依赖/lockfile 与下游 GATED 边界不漂移。

## 9. 停手条件

出现任一项立即停止并回评审：

1. 必须新增 migration/列/表才能保存 deadline；
2. 必须修改公开 Contract 或 Gateway wire schema；
3. 必须修改 Desktop Main/Preload/Renderer production API；
4. 必须忽略 prepared-link exact comparison；
5. 必须再次 accept 同一 active round；
6. 现有 link 无法同时绑定 deadline 与 central accept digest；
7. 恢复需要 current Agent/Model/Skill/Tool/Workspace authority；
8. 必须新增通用状态机或重试框架；
9. E2E 只能通过固定 production clock 或删除权威字段；
10. 发现 partial output 已开始但仍需自动恢复。

## 10. 评审问题

1. 是否接受 repair.2 仅补 internal `providerRequestDeadlineAt`，不新增产品能力？
2. 是否接受使用既有 SQLite `record_json` additive 字段而不建 migration？
3. 是否接受 historical 缺字段可读取，但 accepted active recovery 必须 fail-closed？
4. 是否接受 deadline 到期不续期、不重新计算？
5. 是否接受 prepared-link comparison 必须把 deadline 纳入 exact identity？
6. 是否接受完成 repair.2 后恢复 repair.1，而不是另建恢复链？
7. 是否接受最高输出仍仅为 `MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT`？

文档评审通过不等于编码授权。用户单独接受并授权前，本批保持 `CODING GATED`。
