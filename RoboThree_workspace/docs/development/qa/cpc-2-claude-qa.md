# CPC-2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-26-0900-version-0.0.0-cpc.2` |
| 验收对象 | CPC-2：Runtime Integration（legacy/CPC/unknown 分流、单次 typed parse、Agent Loop 接线、Context/Receipt/Provenance、budget、Provider-neutral） |
| 日期 | 2026-08-26 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core `0.0.0-cpc.2`；Contracts `0.0.0-dfi.5.2.3`、Desktop `0.0.0-dfe.7a` 均未变 |
| 上游 | CPC-0 Rev 1.1、CPC-1 `PASS/CLOSED`；本批由用户追认编码授权后交独立 QA |
| 说明 | 本批编码曾于 DFE-7A 窗口越界落盘，DEV-LOG `0.0.0-dfe.7a` 已记录 `QA BLOCKED BY UNAUTHORIZED CORE DRIFT`；用户裁决将 CPC-2 作为独立批次追认并交本 QA。本次为 CPC-2 自身独立验收，不构成 DFE-7A 关闭 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true VITEST_MAX_WORKERS=1 pnpm run harness:cpc2` | **PASS 8 files / 73 tests** |
| 2 | `CI=true pnpm run check`（`env -u ELECTRON_RUN_AS_NODE`） | **PASS 262 files / 1771 tests + 3 smoke + lint + Architecture boundary** |
| 3 | `CI=true pnpm run check:central`（JDK 21，本 QA 补跑） | **PASS 404 / 0 / 0 / 0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline`（JDK 21，本 QA 补跑） | **PASS 404 / 0 / 0 / 0 / BUILD SUCCESS** |
| 5 | `CI=true pnpm run audit:dtp4` | **PASS**（Core 版本基线 `0.0.0-cpc.2`） |
| 6 | `CI=true pnpm install --frozen-lockfile --offline` | **PASS**（Already up to date） |
| 7 | 边界：lockfile / migration / contracts / desktop | `c47641ac…` 未变；migration 仍止 26；contracts 版本未变；desktop `0.0.0-dfe.7a` 完好 |

> 注：完整 `check` 的 `smoke:preload` 在会话 shell 带 `ELECTRON_RUN_AS_NODE=1` 时报 `app.whenReady undefined`（既知环境伪象）；
> `env -u ELECTRON_RUN_AS_NODE` 复跑 262/1771 + 3 smoke 全绿。与既往多批一致，非本批缺陷。

---

## 二、重点核查项（对照 CPC-2 方案 + 实施报告声称）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | **legacy/CPC/unknown 精确分流** | ✅ [task-locked-instruction-runtime.ts](services/core/src/application/task-locked-instruction-runtime.ts)：`platformPromptRevision === LEGACY_DESKTOP_PROMPT_REVISION`（`sha256:999…9`，code-owned）→ legacy 原字节；`=== PLATFORM_PROMPT_V1_REVISION` → gate 检查；其余 → `context.platform_prompt_unavailable`；gate=false 且 CPC → `context.instruction_runtime_unavailable` |
| 2 | **P3-1 单次 typed parse（CPC-1 QA 收口项）** | ✅ 新增 `deriveTaskInstructionBindingV1FromValidatedSelection` 与 `TaskBoundaryInstructionMaterializer.materializeValidated`、`TaskInstructionBundleMaterializer.materializeValidated`，runtime 路径只经 `TaskLockedInstructionRuntimeResolver.resolve` 做一次 `parseReadableTaskRuntimeSelection`（try/catch → typed `instruction_binding_invalid`），下游全部使用已校验 selection，**无二次解析**；旧 `materialize/deriveTaskInstructionBindingV1` 保留为测试/兼容入口但不在 runtime 路径 |
| 3 | **terminal replay → instruction → Provider resolve 顺序** | ✅ durable-agent-loop-starter.ts 源码行序：`terminalAssistant`（L235）< `#instructionRuntime.resolve`（L247-251）< user Message 校验（L266）< Tool locks/唯一名（L273-288）< `#modelProviders?.resolve`（L289）；边界测试直接读取源文件断言顺序 |
| 4 | **同一 start 内 Tool/Compaction 后续轮复用 immutable material** | ✅ `instructionRuntime` 在 `buildRequest` closure 外解析一次（L247），每轮 `pipelineInput` 展开同一 material；materializer/compiler 不重复调用 |
| 5 | **Context Pipeline 专用 bundle 输入 + 互斥** | ✅ [context-assembler.ts](services/core/src/application/context-assembler.ts)：`lockedInstructionBundle` 与 legacy `instructions/selectedSkills` 同现 → throw；`collectLockedInstructionBundle` 重校验 binding/descriptor/message 精确 identity（task in snapshot、bindingDigest==descriptor.taskInstructionBindingDigest、assemblyRevision、role/system、sourceId、sourceDigest、单条 text） |
| 6 | **单一 System Message、legacy 零漂移** | ✅ converter 对 CPC instruction 使用 `instruction.message ??`（即 compiler 的 exact `ModelInstructionMessage`），legacy 走旧构造；Reducer 原样携带 instructions 不删不截断（context-reducer.ts L257）；测试断言 system 消息 == compiler output、Compaction summary 为 data 且仍只有一条 system |
| 7 | **Receipt content-free evidence** | ✅ `instructionBundleEvidence`（binding/assembly/bundle digests + orderedSources，无 content）；测试断言 evidence 不含“不要伪造成功”；`contextSourceDigest` 含 evidence；final receipt `modelRequestDigest === request.requestDigest` |
| 8 | **budget 双层 + policy equality** | ✅ context-pipeline 对 locked bundle 校验 `budgetPolicyDigest === budget.policyDigest` 且 `availableInputTokens === budget.availableInputTokens`；超限 `context.locked_instructions_too_large`；测试断言不同 policy 注入 → throw |
| 9 | **CPC error 固定安全摘要入 fail_run** | ✅ `cpcSafeSummary` 8 个 code 全映射固定中文摘要；category=validation、retryable=false；Zod path/source/digest/Prompt/stack 不进用户消息 |
| 10 | **Provenance 分类** | ✅ `platform_agent_instructions`；含 skill source 时加 `skill_content`；`dataScopeDigest` 覆盖 evidence；缺失/异常 → `model.external_scope_unclassifiable` |
| 11 | **production 默认 disabled + 单一 release decision** | ✅ `CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED=false`；bootstrap `platformPromptRevisionForNewTask(cpcInstructionRuntimeEnabled)` + resolver `enabled: cpcInstructionRuntimeEnabled` 同一 code-owned 常量；边界测试断言 bootstrap 不再有 `digest("9")` 占位 |
| 12 | **Skill fail-closed / Provider 零修改 / 边界** | ✅ production `implements LockedSkillInstructionResolver` 0；`services/core/src/adapters/https` 与 durable model provider 无 InstructionBundle/CPC 引用；contracts 无 cpc 文件、index 无相关导出；Desktop/Admin 无 CPC 导入；无 migration 27 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 2（观察项，均非阻塞）

1. **P3（防御性，建议 CPC-3 顺手收口）**：`cpcSafeSummary`（durable-agent-loop-starter.ts）的 switch 没有 `default` 分支——若未来新增 CPC error code 而未同步更新该 switch，函数将返回 `undefined`，破坏“固定安全摘要”契约。建议加一个兜底摘要。当前 8 个 code 全覆盖，无实际触发路径。

2. **P3（维护性，知悉即可）**：为修 P3-1 新增的 `*Validated` 系列入口与保留的旧 `materialize/deriveTaskInstructionBindingV1` 构成双 API。runtime 路径只用 validated 变体（正确），旧入口仅服务 CPC-1 测试与兼容调用。不阻塞；后续 CPC-3 或清理批次可统一收口。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 2（观察项，均非阻塞）
```

CPC-2 正确完成 Runtime Integration：legacy/CPC/unknown 由 durable `platformPromptRevision` 精确分流（legacy 走原字节、CPC gate=false typed fail、unknown typed fail）；CPC-1 QA P3-1 已真实收口（runtime 路径单次 typed parse，`deriveTaskInstructionBindingV1FromValidatedSelection` 不二次解析）；Agent Loop 在 terminal replay 后、Provider resolve 前单次物化，同一 start 的 Tool/Compaction 后续轮复用同一 immutable material；Context Pipeline 新增 locked bundle 专用输入并与 legacy 互斥，compiler 的 exact System Message 原样发送、Reducer 不删不截断、Receipt 记录 content-free evidence；Provenance 正确分类；CPC error 以固定安全摘要进入既有 fail_run；production 默认 disabled、单一 code-owned release decision；Skill resolver 为 0、Provider/Contracts/Desktop/Admin 零触碰。

门禁独立复跑全绿：harness:cpc2 8/73、完整 check 262/1771 + 3 smoke + lint + Architecture boundary、Central online/offline **404/0/0/0（本 QA 用 JDK 21 补跑，开发环境缺失项已闭环）**、audit:dtp4、frozen offline install。边界零漂移：lockfile `c47641ac…` 未变、migration 仍止 26、contracts 版本未变、desktop `0.0.0-dfe.7a` 完好、DFE-7A renderer 测试随完整 check 通过未受破坏。

**CPC-2 可进入用户接受流程；接受后由用户单独授权 CPC-3（Lifecycle/Eval Closure），production activation 仍保持 disabled。CPC-3、DFI-5.3 子批、AAPI-0.3～0.4、TGM、Knowledge Provider、Memory、Effect Reconciliation、Desktop/Admin 继续 GATED。DFE-7A 维持 `QA BLOCKED BY UNAUTHORIZED CORE DRIFT / NOT CLOSED`，由用户另行裁决是否关闭。**

— Claude Code（独立 QA，只读）
