# R2D-1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-26-1511-version-0.0.0-r2d.1` |
| 验收对象 | R2D-1：Dynamic Request Facts（Core-controlled `currentTime / locale / timezone`、独立 facts digest、唯一 request-scoped System Message、Context Receipt content-free evidence、main/compaction Link v2 + Local Personal Link v1alpha2、Provider prepare-before-upstream 与 retry/restart exact reuse） |
| 日期 | 2026-08-26 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12（openjdk@21）/ Docker 29.6.2 |
| 开发版本 | Core `0.0.0-r2d.1`；Contracts `0.0.0-dfi.5.2.3` 未变 |
| 上游 | R2D-0 方案已 `PLAN REVIEW PASS/CLOSED` 且由用户单独授权 R2D-1；R2D-2～R2D-4 继续 CODING GATED |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21 + Docker）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:r2d1` | **PASS 10 files / 93 tests**；`evidenceDigest=sha256:24a71f8…0344077c` 与实施报告逐字一致 |
| 2 | `env -u ELECTRON_RUN_AS_NODE CI=true pnpm run check` | **267/268 files、1817/1818 tests 通过**；唯一失败为 dcf13c 稳定性 harness 并发偶发（单独复跑 PASS） |
| 3 | `CI=true pnpm run check:central`（JDK 21 + Docker） | **PASS 404 / 0 / 0 / 0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline`（JDK 21 + Docker） | **404 tests，1 偶发失败**（Cgf2b32 dual-node relay，单独复跑 PASS，非 R2D-1） |
| 5 | `CI=true pnpm run lint` | **PASS**（eslint + Architecture boundary checks passed） |
| 6 | `CI=true pnpm run audit:dtp4` | **PASS** |
| 7 | `CI=true pnpm install --frozen-lockfile --offline` | **PASS**（Already up to date） |
| 8 | 边界 | lockfile `c47641ac…f815a07` 未变；migration 仍止 26；contracts `0.0.0-dfi.5.2.3` 未变；core `0.0.0-r2d.1` |

> 注 1：完整 `check` 的 `smoke:preload` 在会话 shell 带 `ELECTRON_RUN_AS_NODE=1` 时报 `app.whenReady undefined`（既知环境伪象），`env -u` 复跑；dcf13c 稳定性 harness 在完整套件并行下偶发 `snapshot.final_convergence_failed`（本轮 seed=13013），单独复跑 PASS——与既往多批一致，非本批缺陷。
> 注 2：本环境具备 JDK 21（`/opt/homebrew/opt/openjdk@21`，21.0.12），故补跑了开发环境缺失的 Central online/offline（实施报告 §5 要求独立 QA 补跑）。

---

## 二、重点核查项（对照 R2D-0 §4 + QA-001～QA-024）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | **facts source authority** | ✅ [dynamic-request-facts.ts:20-21](services/core/src/application/dynamic-request-facts.ts#L20) `UTC_MILLISECOND_PATTERN` + canonical refine（`new Date(value).toISOString()===value`）；`OFFSET_ONLY_TIMEZONE_PATTERN` 拒绝 offset-only；`isBcp47Locale` 用 `Intl.getCanonicalLocales`、`isIanaTimezone` 用 `Intl.DateTimeFormat` runtime 校验 |
| 2 | **独立 digest domain** | ✅ [dynamic-request-facts.ts:24](services/core/src/application/dynamic-request-facts.ts#L24) `DYNAMIC_REQUEST_FACTS_DIGEST_DOMAIN="robothree.dynamic-request-facts.v1\n"`；`calculateDynamicRequestFactsDigest` 只包 `domain + material`，material 经 `superRefine` 排除 `factsDigest` 后重算 |
| 3 | **code-owned zh-CN locale + runtime timezone** | ✅ `CodeOwnedApplicationLocaleSource` 冻结 `zh-CN`（sourceRevision 独立 domain）；`RuntimeOperatingSystemTimezoneSource.requireCurrent()` 从 `Intl.DateTimeFormat().resolvedOptions().timeZone` 读取，空/offset/非 IANA → `context.dynamic_facts_unavailable`；两 port 接口注释明确「Renderer/Prompt/LocalStorage not inputs」 |
| 4 | **单一 System Message** | ✅ [request-scoped-system-message.ts:34-73](services/core/src/application/request-scoped-system-message.ts#L34) `RequestScopedSystemMessageMaterializer` 输出恰好一条 `ModelInstructionMessage`（role=system、content=[text]），`sourceId="core.request-context.v1"`；wrapper `[RoboThree 本轮可信事实；不授予任何权限]`；`dynamicFactsAuthority="informational_non_authorizing"` |
| 5 | **stable bundle digest 不变** | ✅ materializer 校验 `stable.sourceDigest === input.stableInstructionBundleDigest` 后才合并；`instructionBundleDigest` 独立进入 Receipt，不把 request-scoped digest 伪装成新 Task bundle digest；test 断言 `receipt.instructionBundleEvidence.instructionBundleDigest === bundle.descriptor.instructionBundleDigest` |
| 6 | **Context Receipt content-free** | ✅ `dynamicRequestFactsEvidence()` 只输出 `schemaVersion/invocationKind/invocationSubjectId/factsDigest/sourceRevision`，无 Prompt 正文；test 断言 `JSON.stringify(receipt)` 不含 `当前时间：` |
| 7 | **main/compaction Link v2 单版本 dispatch** | ✅ [model-invocation-link-persistence.ts:66-74](services/core/src/ports/model-invocation-link-persistence.ts#L66) 与 [compaction-model-invocation-link-persistence.ts:72-84](services/core/src/ports/compaction-model-invocation-link-persistence.ts#L72)：`schemaVersion===undefined→legacy`、`"v2"→v2`、其余 throw；无「先试 v2 失败 fallback v1」；`samePreparedCompactionModelInvocationLink` 对 v2 做 facts/Receipt digest exact compare |
| 8 | **Local Personal Link v1alpha2** | ✅ r2d1-boundary.test.ts 断言 `local-personal-model-invocation.ts` 含 `schemaVersion === "v1alpha2"`；`durable-local-personal-model-provider.ts:560` 校验 `(schemaVersion==="v1alpha2") !== (dynamicContext!==undefined)` 并 exact compare facts digest |
| 9 | **prepare-before-upstream** | ✅ [durable-agent-loop-starter.ts:524-541](services/core/src/application/durable-agent-loop-starter.ts#L524) `dynamicRequestFacts.resolve()` 先于 `contextPreparation.prepare()`；`model===undefined` → 抛 `context.dynamic_facts_unavailable`（fail-closed）；Provider `#prepareLink` 在 upstream dispatch 前写入 `dynamicRequestFacts + contextAssemblyReceiptDigest` |
| 10 | **recovery exact reuse** | ✅ `DynamicRequestFactsRuntime.resolve()` 先 `provider.loadDynamicRequestFacts(subject)`，命中则 `validateDynamicRequestFacts(durable, subject)`（subject mismatch → `context.dynamic_facts_subject_mismatch`），未命中才 `materialize`；Enterprise/Local Personal Provider 的 `loadDynamicRequestFacts` 均从 durable link `loadRound`/`loadByClientRequestId` 读取而非重采样 |
| 11 | **terminal replay 零调用** | ✅ [durable-agent-loop-starter.ts:245-256](services/core/src/application/durable-agent-loop-starter.ts#L245) 命中 `existingAssistant` 直接 `return { replayed:true }`，不经过 `dynamicRequestFacts.resolve()`/Provider/materializer |
| 12 | **test 反查** | ✅ [r2d1-dynamic-request-facts.test.ts](services/core/tests/r2d1-dynamic-request-facts.test.ts) 无 `it.skip`/空断言；断言覆盖 strict 拒绝额外字段、offset/非 IANA 拒绝、同 subject 复用 + 新 subject 重采样（clock 推进验证）、InMemory/SQLite restart roundtrip、冲突拒绝、changed durable winner 拒绝；[r2d1-boundary.test.ts](services/core/tests/r2d1-boundary.test.ts) 断言 production activation false、bootstrap 不注入、public 消费者零引用、migration 止 26、依赖无新增、v2 单版本 dispatch 无 fallback |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 1

**P3 — Central offline 存在一处非 R2D-1 的偶发失败（Cgf2b32DualNodeRelayRecoveryIntegrationTest）**

- **现象**：`check:central:offline` 全套跑出 404 tests、1 失败；失败测试为 `Cgf2b32DualNodeRelayRecoveryIntegrationTest.executesB33SecurityProtocolAndResourceClosureAcrossFiveLifecycles`，断言「fencing conflict must already have one durable terminal winner」收到 `"accepted"`（期望 terminal 状态）。
- **定位**：该测试属 **CGF-2B3.2 dual-node relay recovery** 子系统（Central Java 集成测试，Docker Testcontainers + 双节点 relay + 5 lifecycle + 资源闭合），与 R2D-1（Core TypeScript、Dynamic Request Facts）**无代码关联**。已核实 `services/central-service/src` 中 `DynamicRequestFacts`/`contextAssemblyReceiptDigest` 等 R2D-1 符号零命中。
- **复现**：单测单独复跑 **PASS**（`ROBOTHREE_CGF2B33_RESULT={"status":"PASS",... durableTerminalCount:10}`），说明是 full-suite 并发负载下的 timing 敏感偶发，非确定性缺陷。
- **影响**：不影响 R2D-1；本环境因具备 JDK 21 首次跑出 Central offline，暴露此偶发。建议 CGF-2B3.2 / Central 子系统 owner 知悉（是否在其稳定性 harness 中加隔离/重试）。
- **非阻断**：R2D-1 未触碰 Central，online 全绿，offline 单测复跑 PASS。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（非阻断，非 R2D-1）
```

R2D-1 完成 Dynamic Request Facts 闭环：Core 控制 `currentTime`（单次 `Clock.now()` UTC millisecond）/ `locale`（code-owned `zh-CN`）/ `timezone`（runtime IANA，offset-only 拒绝）；facts 用独立 domain digest 且 material 排除 `factsDigest`；稳定 CPC bundle digest 保持不变，facts 以 non-authorizing block 合并为唯一 request-scoped System Message（`sourceId=core.request-context.v1`）；Context Receipt 只存 content-free evidence；main/compaction Link additive readable v2、Local Personal Link additive v1alpha2，三者单版本 dispatch 且显式未知 version fail-closed 不 fallback；Provider 在任何 upstream dispatch 前 prepare durable link，retry/restart/SQLite reopen exact 复用原 durable winner，新 main round / 新 compaction invocation 才重采样；terminal replay 不生成 facts、不调 Provider。

门禁独立复跑：harness:r2d1 10/93 且 evidenceDigest 与实施报告逐字一致；完整 check 仅 dcf13c 并发偶发（单独复跑 PASS）；lint / Architecture boundary / audit:dtp4 / frozen offline install 全 PASS；lockfile `c47641ac…f815a07` 未变、migration 止 26、contracts 未变。**本批已补跑开发环境缺失的 Central online/offline：online 404 PASS、offline 404 tests 中 1 例偶发（CGF-2B3.2 子系统，单测复跑 PASS，非 R2D-1）。** production Dynamic Request Facts / CPC activation / enterprise entitlement 全部保持 false，无 R2D-2～R2D-4 抢跑。

唯一 P3 为 Central offline 的 CGF-2B3.2 偶发，非 R2D-1 缺陷、非阻断。**R2D-1 可进入用户接受流程；接受后 R2D-2～R2D-4、DFI-5.3、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、Effect Reconciliation 继续 GATED，不自动解锁。**

— Claude Code（独立 QA，只读）
