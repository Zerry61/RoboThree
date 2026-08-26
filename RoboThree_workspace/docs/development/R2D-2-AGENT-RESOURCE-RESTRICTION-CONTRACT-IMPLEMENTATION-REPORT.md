# R2D-2 Agent Definition v1alpha2 与四类资源限制 Contract 实施报告

> 日期：2026-08-26  
> 开发版本：Root / Core / Contracts `0.0.0-r2d.2`  
> 状态：**PASS/CLOSED**  
> 最高输出：`R2D_AGENT_RESOURCE_RESTRICTION_CONFORMANT`

## 1. 授权与范围

本批仅实现已评审通过并由用户单独授权的 R2D-2：新增 Agent Definition v1alpha2、Model / Skill / Tool /
Knowledge 四类资源限制 Contract、domain-separated canonical digest 与 v1alpha1 compatibility interpreter。
R2D-3～R2D-4、DFI-5.3 子批、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、Effect
Reconciliation、Agent Lifecycle 与 Desktop/Admin v2 consumption 均未解锁。

## 2. 实现结果

### 2.1 Agent Definition v1alpha2

- 新增 exact package subpath `@robothree/contracts/runtime-selection/agent-definition/v1alpha2`，不从
  Contracts root 或 `runtime-selection` root index 导出；
- 四类限制各自使用 strict discriminated union：`unrestricted` 禁止携带 references，`allowlist` 必须携带
  references，且 empty allowlist 与 unrestricted 保持不同语义；
- Model / Skill / Tool / Knowledge 分别使用 portable exact reference，执行 kind、digest identity、重复 ID、
  数量上限与未知字段校验；
- v2 顶层只承载 immutable Agent material、`managementClass` 与四类限制，不承载 owner、entitlement、
  Endpoint、Credential、Binding、路径、runtime handle 或 inactive draft selection。

### 2.2 Canonical digest 与兼容解释

- v2 使用独立 domain `robothree.agent-definition-revision.v1alpha2\n`，创建与 load-time revalidation 共用
  同一 strict material schema；references authored order 进入 digest，不被自动排序；
- `ReadableAgentDefinitionInterpreter` 先读取一次 `schemaVersion`，再单次 dispatch 到 v1alpha1 或
  v1alpha2 validator；unknown version 与损坏 v2 均失败关闭，不 fallback；
- v1 `allowModelOverride=true` 解释为 unrestricted；`false` 只保留诚实的
  `single_model_id`，不伪造 Model revision/digest；
- v1 Skill / Knowledge 使用逐字段显式投影，**不使用 spread**，仅保留 ID、revision、contentDigest，
  `materializedRef` 被确定性移除；Tool 同样只投影 portable exact fields。

### 2.3 生产边界

- production v1alpha2 consumer count=0；未接入 TrustedAgentRepository、Runtime Selection、SubmitTurn、
  Provider、route、Main、Preload、Renderer、Admin 或 Central；
- production CPC activation=false；production enterprise entitlement=false；
- 未新增 migration 27、依赖或 lockfile 变更；migration 仍止 26；
- R2D-3 / R2D-4 保持 GATED，未实现 entitlement intersection、Task locks、code-owned `agent.general` 或
  lifecycle closure。

## 3. 关键文件

- Contract：`packages/contracts/src/runtime-selection/agent-definition/v1alpha2/index.ts`；
- exact export：`packages/contracts/package.json`；
- Core helper：`services/core/src/application/agent-definition-v1alpha2.ts`、`services/core/src/index.ts`；
- tests：`packages/contracts/tests/r2d2-agent-definition-v1alpha2-contracts.test.ts`、
  `services/core/tests/r2d2-agent-definition-interpreter.test.ts`、
  `services/core/tests/r2d2-agent-definition-boundary.test.ts`；
- Harness：`scripts/run-r2d2-harness.mjs`；
- packaging baseline：`scripts/audit-dtp4-packaging.mjs` 与对应测试。

## 4. 开发者门禁

| 门禁 | 结果 |
| --- | --- |
| `pnpm run harness:r2d2` | **PASS 7 files / 72 tests**；`R2D_AGENT_RESOURCE_RESTRICTION_CONFORMANT` |
| built exact subpath import | **PASS**；由 Core consumer context 真实导入已构建 JS / declarations |
| `pnpm run lint` | **PASS**；Architecture boundary PASS |
| 非沙箱 `pnpm run check` | **PASS 271 files / 1846 tests + 3 smoke** |
| Central online / offline | **PASS 404/0/0/0 / 404/0/0/0**（JDK 21） |
| `pnpm run audit:dtp4` | **PASS** |
| frozen offline install | **PASS** |
| lockfile / migration | `c47641ac…f815a07` 未变；最大 migration id=26 |

专项 evidence：`qa-reports/r2d2-runs/2026-08-26T08-16-49-248Z/result.json`，
`evidenceDigest=sha256:c90832ef…ac45063`，`legacyMaterializedRefLeakCount=0`、
`productionAgentV1Alpha2ConsumerCount=0`，七项 production/downstream 状态均为 false。

沙箱内初次 root check 的失败集中在 `listen EPERM`、真实子进程与隔离 Keychain；同一代码在非沙箱环境原样
复跑 271/1846 + 3 smoke 全绿，因此归因为运行权限限制，不属于 R2D-2 产品缺陷。

## 5. 独立 QA 与用户接受

独立 QA 结论：`PASS（P0=0、P1=0、P2=0、P3=1，非 R2D-2、非阻断）`。用户已于 2026-08-26
正式接受并关闭 R2D-2。独立 QA 已复核：

1. v1 Skill / Knowledge 显式投影确实没有 spread，且 `materializedRef` 不进入 interpreted output；
2. exact package subpath 的已构建 JS 与 declaration 可被真实 consumer 导入，root export 未被扩宽；
3. v1 source/digest 与既有 TaskRuntimeSelection v1alpha2 零漂移；
4. production consumer count=0、migration 26 与 lockfile 边界真实成立；
5. 本批不被表述为 production entitlement、Agent lifecycle 或 Desktop/Admin v2 ready。

唯一 P3 为全仓 `dcf13c` stability harness 在并发负载下的既知偶发；focused 单独复跑 PASS，确认与 R2D-2
无代码关联，留待对应子系统处理。R2D-3 不因本批关闭自动获得编码授权。
