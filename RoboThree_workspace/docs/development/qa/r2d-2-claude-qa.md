# R2D-2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-26-1701-version-0.0.0-r2d.2` |
| 验收对象 | R2D-2：Agent Definition v1alpha2 + Model/Skill/Tool/Knowledge 四类 `unrestricted \| allowlist` strict union、portable exact refs、domain-separated v2 digest、单次 dispatch v1 compatibility interpreter（含 legacy single-model-ID 不伪造）、private exact subpath、production consumer count=0 |
| 日期 | 2026-08-26 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21）/ Docker 29.6.2 |
| 开发版本 | Root / Core / Contracts `0.0.0-r2d.2`；Desktop/Admin/Central/Document Worker 版本不变 |
| 上游 | R2D-0 方案 PASS/CLOSED、R2D-1 PASS/CLOSED、R2D-2 方案 PASS/CLOSED；本批由用户单独授权编码 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21 + Docker）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:r2d2` | **PASS 7 files / 72 tests**；`evidenceDigest=sha256:c90832ef…ac45063` 与实施报告逐字一致；`legacyMaterializedRefLeakCount=0`、`productionAgentV1Alpha2ConsumerCount=0`、`exactPrivateSubpathImportable=true`、7 项 production/downstream 状态全 false |
| 2 | `env -u ELECTRON_RUN_AS_NODE CI=true pnpm run check` | **270/271 files、1845/1846 tests 通过**；唯一失败为 dcf13c 稳定性 harness 并发偶发（单独复跑 PASS） |
| 3 | `CI=true pnpm run check:central`（JDK 21 + Docker） | **PASS 404 / 0 / 0 / 0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline`（JDK 21 + Docker） | **PASS 404 / 0 / 0 / 0 / BUILD SUCCESS**（本轮无 CGF-2B3.2 偶发） |
| 5 | `CI=true pnpm run lint` | **PASS**（eslint + Architecture boundary checks passed） |
| 6 | `CI=true pnpm run audit:dtp4` | **PASS** |
| 7 | `CI=true pnpm install --frozen-lockfile --offline` | **PASS**（Already up to date） |
| 8 | 边界 | lockfile `c47641ac…f815a07` 未变；migration 仍止 26 |

> 注：完整 `check` 的 `smoke:preload` 在会话 shell 带 `ELECTRON_RUN_AS_NODE=1` 时报 `app.whenReady undefined`（既知环境伪象），`env -u` 复跑；dcf13c 稳定性 harness 在完整套件并行下偶发 `snapshot.final_convergence_failed`，单独复跑 PASS——与既往多批一致，非本批缺陷。本轮 Central online/offline 双跑均 404/0/0/0（无 R2D-1 时的 CGF-2B3.2 偶发）。

---

## 二、重点核查项（对照 R2D-2 方案 §4-§10 + QA-001～QA-084）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | **private subpath 真实可导入** | ✅ [r2d2-agent-definition-boundary.test.ts:14-37](services/core/tests/r2d2-agent-definition-boundary.test.ts#L14) `await import("@robothree/contracts/runtime-selection/agent-definition/v1alpha2")` 读取构建产物；`package.json` 的 `"./runtime-selection/agent-definition/v1alpha2"` 精确指向 `./dist/runtime-selection/agent-definition/v1alpha2/index.{d.ts,js}`；root index 与 runtime-selection/index.ts 不含 `AgentDefinitionRevisionV1Alpha2/agent-definition/v1alpha2` |
| 2 | **Contracts 根 export 零扩宽** | ✅ [packages/contracts/src/index.ts](packages/contracts/src/index.ts) 无 `agent-definition/v1alpha2`；[packages/contracts/src/runtime-selection/index.ts](packages/contracts/src/runtime-selection/index.ts) 只 `export * from "./runtime-selection.js"` |
| 3 | **v1 source byte 冻结** | ✅ boundary test 对四个 frozen 文件做 sha256：runtime-selection.ts=`8fce0bfb…`、`index.ts=d11649dc…`、`root index.ts=73fd6ae5…`、`v1alpha2.ts=c8ecbed8…`，**全部逐字节一致**（这意味着 R2D-2 编码未触碰 TaskRuntimeSelection v1alpha2、未触碰 v1 Agent schema） |
| 4 | **v1 Agent canonical digest corpus 零漂移** | ✅ boundary test 用 `createAgentDefinitionRevision({schemaVersion:"v1alpha1", ...})` 合成 record，断言 `record.digest === "sha256:b6739b631318…0726a2479"`（pre-existing fixture digest 0 漂移） |
| 5 | **四类 strict discriminated union** | ✅ [agent-definition/v1alpha2/index.ts:89-107](packages/contracts/src/runtime-selection/agent-definition/v1alpha2/index.ts#L89) 四个 `z.discriminatedUnion("mode", [Unrestricted, Allowlist])`；unrestricted 不含 references；allowlist 必含 references；空数组合法 |
| 6 | **unrestricted 不携带 references / allowlist 不裸 / 空 allowlist ≠ unrestricted** | ✅ unrestricted schema `.strict()` 且只有 `mode` 字段（implicitly 拒 references）；allowlist schema `.strict()` + `references: z.array(...).max(N)`；四类资源分别命名 `AgentModel/Skill/Tool/KnowledgeRestrictionV1Alpha2` |
| 7 | **Model revision === digest、max 64** | ✅ Model ref [line 19-30](packages/contracts/src/runtime-selection/agent-definition/v1alpha2/index.ts#L19) `revision: Sha256DigestSchema`、`digest: Sha256DigestSchema` + `superRefine` 强制 `revision===digest`；allowlist `z.array(...).max(64)` |
| 8 | **Skill/Knowledge 三个 portable 字段** | ✅ Skill [line 32-36](packages/contracts/src/runtime-selection/agent-definition/v1alpha2/index.ts#L32) `{skillId, revision, contentDigest}`；Knowledge [line 43-47](packages/contracts/src/runtime-selection/agent-definition/v1alpha2/index.ts#L43) 同；均不含 `materializedRef` 字段；Tool [line 38-41](packages/contracts/src/runtime-selection/agent-definition/v1alpha2/index.ts#L38) `{capabilityId: tool.*, capabilityRevision}`（无 binding/adapter/endpoint） |
| 9 | **kind 约束** | ✅ Model `modelId.refine(v=>v.startsWith("model."))`；Tool `capabilityId.refine(v=>v.startsWith("tool."))`；Skill/Knowledge 使用 `DesktopResourceIdSchema`（kind 由 R2D-3 catalog 验证，方案 §4.3 明确） |
| 10 | **duplicate ID 拒绝** | ✅ 四个 allowlist `.superRefine` 调 `requireUniqueIds(references.map(...))` Set vs length 比对 |
| 11 | **未知字段拒绝** | ✅ 顶层 + 四类 ref + 四类 allowlist + unrestricted 全部 `.strict()`，自动拒绝额外字段 |
| 12 | **v2 拒绝 defaultModelId / allowModelOverride / materializedRef / owner / entitlement / Endpoint / Credential / runtime handle** | ✅ 顶层 fields 不含任何上述字段；schema .strict() 隐式拒绝新增字段；interpreter v1 投影时**不使用 spread**，逐字段显式 pick（Skill `skillId/revision/contentDigest`、Tool `capabilityId/capabilityRevision`、Knowledge `knowledgeId/revision/contentDigest`） |
| 13 | **v2 不冒充授权器** | ✅ `managementClass` 仅 `enum(["system_builtin","managed"])`，schema 自身不判断谁能创建 system_builtin（authority 由 R2D-3 决定） |
| 14 | **独立 digest domain** | ✅ [agent-definition-v1alpha2.ts:21-22](services/core/src/application/agent-definition-v1alpha2.ts#L21) `AGENT_DEFINITION_REVISION_V1ALPHA2_DIGEST_DOMAIN = "robothree.agent-definition-revision.v1alpha2\n"`；`calculateAgentDefinitionRevisionV1Alpha2Digest` 用 `{domain, material}` 包装，material 经 `MaterialSchema.parse` 后投 canonical JSON |
| 15 | **create/revalidate 共用 helper** | ✅ `createAgentDefinitionRevisionV1Alpha2` 和 `hasValidAgentDefinitionRevisionV1Alpha2` 都用 `MaterialSchema.parse` 喂 `calculateDigest`；load-time 强制重算 |
| 16 | **v1 helper 未套 v2 domain** | ✅ v1 digest helper 仍在既有 `runtime-selection-revisions.ts`（line 81 `AgentDefinitionRevisionSchema.parse` + 自有 sha256CanonicalJson），未引入 v2 domain |
| 17 | **interpreter 单次 dispatch** | ✅ [agent-definition-v1alpha2.ts:102-111](services/core/src/application/agent-definition-v1alpha2.ts#L102) `readSchemaVersion(input)` 一次 → `v1alpha1→interpretV1Alpha1`、`v1alpha2→interpretV1Alpha2`、其他 throw `AgentDefinitionCompatibilityError("selection.agent_definition_version_unsupported")`；无 fallback |
| 18 | **v1 Skill/Knowledge 逐字段显式投影** | ✅ [agent-definition-v1alpha2.ts:142-164](services/core/src/application/agent-definition-v1alpha2.ts#L142) Skill `parsed.skillReferences.map(reference => Object.freeze({skillId: reference.id, revision: reference.revision, contentDigest: reference.contentDigest}))`——**逐字段 pick**，不用 `{...reference}`；同理 Knowledge；`materializedRef` 因未在 pick 列表中**自动不进入** interpreted output |
| 19 | **v1 default model 不伪造 revision/digest** | ✅ [agent-definition-v1alpha2.ts:126-131](services/core/src/application/agent-definition-v1alpha2.ts#L126) `allowModelOverride=false` → `Object.freeze({mode:"single_model_id", modelId: parsed.defaultModelId})`；不构造符合 v2 `AgentModelRestrictionRef` 的假对象；legacy variant 经 `LegacySingleModelIdRestrictionSchemaVersion` 显式标注 v1alpha1 |
| 20 | **v1 override=true → unrestricted** | ✅ [agent-definition-v1alpha2.ts:126-128](services/core/src/application/agent-definition-v1alpha2.ts#L126) `parsed.allowModelOverride ? {mode:"unrestricted"} : ...` |
| 21 | **v1 managementClass → managed** | ✅ [agent-definition-v1alpha2.ts:140](services/core/src/application/agent-definition-v1alpha2.ts#L140) `managementClass: "managed"`（v1 不冒充 system_builtin） |
| 22 | **unknown version / 损坏 v2 typed fail** | ✅ [agent-definition-v1alpha2.ts:107-109](services/core/src/application/agent-definition-v1alpha2.ts#L107) unknown version 抛 `AgentDefinitionCompatibilityError("selection.agent_definition_version_unsupported")`；interpretV1Alpha2 parse 失败抛 `"selection.agent_definition_invalid"`；digest 不一致抛 `agent_definition_digest_mismatch`；不 fallback |
| 23 | **interpreter 零副作用** | ✅ 无 IO、无锁、无 entitlement 读、无 Provider 调用；输出 `Object.freeze` 包装的纯函数结果；`AGENT_DEFINITION_V1ALPHA2_PRODUCTION_CONSUMER_ENABLED=false` |
| 24 | **production v2 consumer count=0** | ✅ boundary test [line 78-94](services/core/tests/r2d2-agent-definition-boundary.test.ts#L78) allow-list 仅 `agent-definition-v1alpha2.ts` + `src/index.ts`，其余 `services/core/src` 任何文件出现 v2 符号即 fail；grep 全仓 `AgentDefinitionRevisionV1Alpha2\|agent-definition/v1alpha2\|ReadableAgentDefinitionInterpreter` 仅命中 2 个文件（impl + subpath 自身），即 0 个意外消费者 |
| 25 | **Renderer/Preload/Main/Admin/Central 零引用** | ✅ boundary test [line 96-111](services/core/tests/r2d2-agent-definition-boundary.test.ts#L96) 扫 `apps/desktop/src`、`apps/admin-console/src`、`services/central-service/src/main`，断言 `unexpectedConsumers.toEqual([])` |
| 26 | **migration 27 不存在 / lockfile 稳定** | ✅ boundary test [line 113-125](services/core/tests/r2d2-agent-definition-boundary.test.ts#L113) `Math.max(...ids)===26`、`migrations.ts` 不含 `id: 27,`、lockfile sha256 = `c47641ac…`；本环境独立验证：`sha256:c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07` |
| 27 | **不冒充 production ready** | ✅ 实施报告与 harness evidence 明确 7 项 downstream false + agentLifecycleReady/runtimeSelectionV1Alpha3Ready/desktopV2ConsumptionReady/adminV2ConsumptionReady/knowledgeProviderReady；本批不输出 `R2D_CORE_DELTA_CONFORMANT` 或 `PRODUCTION_READY` |
| 28 | **门禁清单** | ✅ harness:r2d2 7/72 + 中央 online 404 + offline 404 + lint + audit:dtp4 + frozen install 全 PASS（Central 不被本批修改 Java，方案 §11 末尾要求补跑——已补跑） |
| 29 | **测试反查** | ✅ 无 `.skip` / `@Disabled` / 自动 retry / 恒真 source scan / 硬编码 consumer count；test 断言 `legacyMaterializedRefLeakCount:0` 来自实测逐字段投影（不是 `===0` 恒真）；allowed-definitions 是 allow-list 而非 deny-list（positive contract） |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 1

**P3 — 完整 root check 在并发负载下命中 dcf13c stability harness 偶发失败（已既知、非 R2D-2、非阻断）**

- **现象**：完整 `check`（270/271 files，1845/1846 tests）唯一失败 `scripts/run-dcf13c-stability.test.mjs > DCF-1.3C stability Harness`，断言 `sqliteReopenCount:0`、状态 `fail`、errorCode `snapshot.final_convergence_failed`。
- **定位**：dcf13c 是 Core child + SQLite + SSE 稳定性 harness，**与 R2D-2（Contracts + Core interpreter + harness/测试）无代码关联**——R2D-2 仅新增 1 个 Contract subpath、1 个 interpreter、3 个测试文件、1 个 harness script；未触碰 dcf13c 任何 production/test 路径。Central offline 本轮未复现 CGF-2B3.2 偶发。
- **复现**：单测单独复跑 **PASS**，确认是 full-suite 并发负载下的 timing 敏感偶发，与既往多批（KAF-3.3 / CPC-3 / R2D-1）一致。方案 §11 末尾明确「CGF-2B3.2 timing 偶发若再次出现，必须独立归因并单测复跑，不能把自动 retry 写入 R2D-2 门禁掩盖」——本批未尝试 auto-retry。
- **影响**：不影响 R2D-2；本环境未发现 R2D-2 自身任何缺陷。
- **非阻断**：R2D-2 未触碰 dcf13c 任何路径。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（非 R2D-2、非阻断）
```

R2D-2 完成 Agent Definition v1alpha2 与四类资源限制 Contract 闭环：private subpath `@robothree/contracts/runtime-selection/agent-definition/v1alpha2` 真实可导入且根 export 零扩宽；四类 `unrestricted | allowlist` strict discriminated union 精确表达空列表语义；Model `{modelId, revision, digest}` + Skill/Knowledge 三字段 + Tool 两字段 portable 无本机 handle；`managementClass` 仅 enum 不冒充 source authority；v2 独立 digest domain `robothree.agent-definition-revision.v1alpha2\n`、create/revalidate 共用 helper、references authored order 进入 digest；v1 source byte 四个文件 sha256 完全冻结、v1 digest corpus 零漂移、TaskRuntimeSelection v1alpha2 零漂移；interpreter 单次 schemaVersion dispatch，v1 Skill/Knowledge 逐字段显式 pick（**无 spread**），`materializedRef` 命中 0；v1 default model 不伪造 v2 digest，只保留 legacy `single_model_id` 诚实变体；production v2 consumer count=0（仅 implementation file + index re-export 两个允许位）、Renderer/Preload/Main/Admin/Central 零引用、migration 26 + lockfile `c47641ac…` 不变。

门禁独立复跑：harness:r2d2 7/72 且 evidenceDigest 与实施报告逐字一致；完整 check 仅 dcf13c 并发偶发（单独复跑 PASS）；lint / Architecture boundary / audit:dtp4 / frozen offline install 全 PASS；Central online/offline **本轮均 404 / 0 / 0 / 0 / BUILD SUCCESS**，无偶发。production CPC activation 与 enterprise entitlement 继续 false；R2D-3～R2D-4 及全部下游继续 GATED。

唯一 P3 为 dcf13c stability harness 的既知并发偶发，非 R2D-2 缺陷、非阻断。**R2D-2 可进入用户接受流程；接受后 R2D-3～R2D-4、DFI-5.3、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、Effect Reconciliation、Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 GATED，不自动解锁。**

— Claude Code（独立 QA，只读）