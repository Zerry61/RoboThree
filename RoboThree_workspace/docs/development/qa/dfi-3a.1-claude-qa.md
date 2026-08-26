# DFI-3A.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-24-2206-version-dfi.3a.1` |
| 验收对象 | DFI-3A.1：Robot / Tool Catalog（Contract、Projection、Core Query、cursor、cross-consumer fixture） |
| 日期 | 2026-08-24 |
| 验收者 | Claude Code（独立 QA，只读，按 handoff 执行） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root `0.0.0-dfi.3a.1`；Contracts/Core `0.0.0-dfi.3a.1` |
| 依据 | [dfi-3a.1-claude-qa-handoff.md](./dfi-3a.1-claude-qa-handoff.md)（用户授权，REVIEW ONLY / NO CODING） |

---

## 一、门禁复跑结果

### Focused gates

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run packages/contracts/tests/desktop-local-v1alpha2-catalog-contracts.test.ts services/core/tests/catalog-query-service.test.ts` | **PASS 2 files / 10 tests** |
| `pnpm --filter @robothree/desktop build` | **PASS** |
| `pnpm exec vitest run apps/desktop/tests` | **PASS 57 files / 226 tests** |

### Full gates

| 命令 | 结果 |
|---|---|
| `CI=true pnpm run check` | **PASS 242 files / 1613 tests + 3 smoke + Architecture boundary**（240→242 与 DFI-3A.1 新增 2 个测试文件一致） |
| `CI=true pnpm run check:central` | **PASS 391/0/0/0 / BUILD SUCCESS** |
| `CI=true pnpm run check:central:offline` | **PASS 391/0/0/0 / BUILD SUCCESS** |

---

## 二、十二项必须核查

| # | 核查项 | 结论 |
|---|---|---|
| 1 | v1alpha2 additive，不改写 v1alpha1 | ✅ `v1alpha1/catalog.ts` mtime Jul 24 未改；[catalog.ts](packages/contracts/src/desktop-local/v1alpha2/catalog.ts) 复用 v1alpha1 common（DisplayText/ResourceId/SafeSummary/Sha256Digest） |
| 2 | schema strict + unknown field rejection | ✅ 全部 schema `.strict()`；query service `safeParse` 失败 `catalog.invalid_query`；测试「rejects unknown fields」 |
| 3 | list/get + limit 1~100 + page max 100 + not_found | ✅ limit `.int().min(1).max(100)`、items `.max(100)`；get 缺失 → `catalog.robot_not_found`/`catalog.tool_not_found` |
| 4 | cursor opaque + query revision + tamper/stale 失败关闭 | ✅ [hmac-catalog-cursor-codec.ts](services/core/src/adapters/node/hmac-catalog-cursor-codec.ts) HMAC-SHA256 + `timingSafeEqual` + isProof 结构校验；`paginate` 绑定 kind+queryRevision+lastNormalizedName+lastStableId，不匹配/末尾 → `catalog.stale_cursor`；key ≥256-bit 且默认 random（跨 runtime 无效） |
| 5 | restriction 三态不混淆 | ✅ `unrestricted/restricted_nonempty/restricted_empty` enum；`restrictionFor` 空→`restricted_empty`；测试「keeps restricted_empty distinct」 |
| 6 | availability 不伪装 healthy | ✅ [catalog-query-service.ts](services/core/src/application/catalog-query-service.ts) `resolveToolAvailability`：resolveById 成功但 credential/health/disabled/revoked 任一不满足 → `unknown`；缺失 availability fact → `unknown`；`available` 才无 reason（Contract superRefine 强制） |
| 7 | 收窄语义 | ✅ `mapAvailabilityError` 只映射 credential/disabled/health/revoked 四类 + `state_subject_mismatch`→unknown；无扩大路径；registry snapshot 缺失→`catalog.registry_unavailable` |
| 8 | Tool source/readOnly/riskSummary 只来自可信定义 | ✅ source 取 `definition.source.trust`、readOnly 取 `readOnlyHint`、riskSummary 取 `risk.staticFacts`，不由 id/UI 猜测 |
| 9 | Projection 不泄漏敏感 | ✅ 字段级无 Endpoint/Credential/Binding/Adapter Descriptor/workspace path/system prompt/stack；测试「never accepts Binding/Endpoint/Credential fields」 |
| 10 | cross-consumer fixture 与对齐基线一致 | ✅ [catalog-alignment-v1.json](packages/contracts/fixtures/cross-consumer/catalog-alignment-v1.json) 覆盖 identity、publishedRobotRevision↔desktopConfigurationRevision exact mapping、displayName/description、四类三态、readOnly/riskSummary；测试「freezes the cross-consumer fixture」 |
| 11 | Admin-only 不进 Desktop / Desktop 不冒充 Admin | ✅ Desktop Contract 无 lifecycle/review/publisher/policy/connection/credential/admin health/expectedRevision/commandId/Receipt 字段 |
| 12 | 未越界 | ✅ Renderer/Admin/Central 未改；migration 未改；改动 13 文件全在允许范围（Contract v1alpha2 + Core application/ports/adapters/bootstrap + fixtures/tests） |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 1

#### P3-1：lockfile 变更记录（无依赖变更，版本升级连锁）

`pnpm-lock.yaml` digest 从 `052a0e74…` 变为 `b7c6d0a7…`（mtime Aug 24 20:26）。核实：Contracts/Core 的
dependencies 无新增（zod 4.4.3 与 workspace links 均为既有），无 catalog/hmac 新依赖包；变更为子包版本升级
`0.0.0-dfi.3a.1` 引发的 install 重写连锁，符合仓库「有效代码变更必须升级版本」规则。与 DFI-3A 方案 §8
「lockfile 禁改除非另行评审授权」存在字面偏差，如实记录，不构成实质越界。

#### 文件清单差异（handoff §2 要求列出）

handoff 列出的 cursor codec 路径为 `services/core/src/adapters/security/hmac-catalog-cursor-codec.ts`，实际为
`services/core/src/adapters/node/hmac-catalog-cursor-codec.ts`。其余文件清单与 handoff 一致。

---

## 四、结论（handoff 格式）

```text
DFI-3A.1 Independent QA: PASS
P0=0
P1=0
P2=0
P3=1

Focused gates:
- catalog contracts + query service: 2 files / 10 tests PASS
- desktop build: PASS
- desktop tests: 57 files / 226 tests PASS

Full gates:
- root check: 242 files / 1613 tests + 3 smoke + Architecture boundary PASS
- central online: 391/0/0/0 PASS
- central offline: 391/0/0/0 PASS

Findings:
- [P3] pnpm-lock.yaml digest 052a0e74->b7c6d0a7：无依赖变更，为子包版本升级连锁，如实记录
- (note) cursor codec 实际路径 adapters/node/，handoff 写 adapters/security/

Boundary:
- Contract/Core catalog query/cursor/fixture only: yes
- Renderer/Admin/Central/Main/Preload/IPC/migration/root dependency drift: no（无漂移）

Conclusion:
- DFI3A1_CONFORMANT yes
- AAPI-0.1 first prerequisite closed yes（DFI-3A.1 独立 QA PASS 且 cross-consumer fixture 已冻结；以用户接受本结论为准）
```

DFI-3A.1 正确完成 Robot/Tool Catalog 第一层：v1alpha2 additive Contract（strict schema、opaque HMAC cursor、
限制三态、availability 三态、not_found/unknown 字段拒绝）；Core 只读 Query service（可信 Registry/Agent/Model
事实源、整体 integrity 失败关闭、availability 缺失不默认 healthy、只收窄不扩大、稳定排序 + query revision +
256 KiB 响应上限）；cross-consumer fixture 与对齐基线 v1 一致。门禁独立复跑全绿。改动 13 文件全在允许范围，
未越界 Renderer/Admin/Central/migration；P3-1 为 lockfile 版本升级连锁的如实记录。

按 handoff 禁止事项，本报告不更新 DEVELOPMENT-LOG / CHANGELOG / 版本；AAPI-0.1 编码仍未授权。

— Claude Code（独立 QA，只读）

---

## 附：收口增量复核（2026-08-24 第二轮，正式 QA 请求）

收口后状态与上轮 handoff QA 的差异核实：

- 专项扩为 `harness:dfi3a.1` = **5 files / 35 tests**：2 个新增（catalog contracts + query service，上轮已
  深入核查）+ 3 个既有回归（`desktop-local-v1alpha2-contracts` / `capability-resolver` / `registry-builder`）。
  独立复跑 PASS；
- 上轮 P3-1（lockfile 变更因果不明）关闭：实施报告 §4 明确 lockfile `b7c6d0a7…` 为 AFE-1.1 preflight
  清理批的「删除目录 + 标准重算」，且不含 `admin-console-preflight` importer；DFI-3A.1 自身未改依赖；
- AFE-1.1 正式 `PASS/CLOSED`；`apps/admin-console-preflight/**` 已删除，`apps/` 仅 admin-console + desktop；
- 独立复跑：`harness:dfi3a.1` 5/35 ✅、`audit:dtp4` ✅、root check 242/1613 + 3 smoke + boundary ✅、
  Central online/offline 391/391 ✅（报告记录的初轮 Cgf2a3 偶发超时，本轮一次通过）。

最终结论不变：**PASS（P0=0、P1=0、P2=0、P3=0）**，`DFI3A1_CONFORMANT` yes，AAPI-0.1 第一个前置关闭。

— Claude Code（独立 QA，只读）
