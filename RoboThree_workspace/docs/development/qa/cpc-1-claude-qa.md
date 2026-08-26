# CPC-1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-2330-version-0.0.0-cpc.1` |
| 验收对象 | CPC-1：Instruction Foundation（Platform Prompt v1 / TaskInstructionBindingV1 / 四层 source / 单一 Compiler / 预算预检 / feature 默认关闭） |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Core `0.0.0-cpc.1`；Contracts 保持 `0.0.0-dfi.5.2.3` 未变 |
| 上游 | CPC-0 Revision 1.1 `PASS`；DFI-5.2.x `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true VITEST_MAX_WORKERS=1 pnpm run harness:cpc1` | **PASS 4 files / 51 tests** |
| 2 | `CI=true pnpm run check`（lint + 260 files / 1751 tests + 3 smoke + Architecture boundary） | **PASS**；3 个 smoke 均 PASS（preload smoke 见下注） |
| 3 | `CI=true pnpm run typecheck` | **PASS**（`tsc -b` 0 error） |
| 4 | `CI=true pnpm run check:central`（JDK 21） | **PASS / BUILD SUCCESS** |
| 5 | `CI=true pnpm run check:central:offline`（JDK 21） | **PASS 404 tests / 0 fail / 0 err / 0 skip** |
| 6 | `CI=true pnpm install --frozen-lockfile --offline` | **PASS**（Already up to date） |
| 7 | `CI=true pnpm run audit:dtp4` | **PASS** |
| 8 | 边界：lockfile / migration / contracts | 仍 `c47641ac…` 未变；migration 仍止 26 无 27；contracts 版本未变 |

> 注：完整 `check` 中 `smoke:preload` 首跑因会话 shell 持有 `ELECTRON_RUN_AS_NODE=1`（electron 被当 node 执行）报
> `app.whenReady undefined`。这是既知环境伪象，非 CPC-1 缺陷；`env -u ELECTRON_RUN_AS_NODE` 复跑
> `{"status":"ready","sandbox":true,...}` 通过。此前多批（STRM/EIPC/DFI）均已在报告中记录同一环境因素。

---

## 二、重点核查项（对照 CPC-0 Revision 1.1 方案 + 实现报告声称）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | **Platform Prompt v1 逐字节一致** | ✅ 独立提取产品 Feature Spec §15 code block 与 [platform-prompt-source.ts](services/core/src/application/platform-prompt-source.ts) `PLATFORM_PROMPT_V1_CONTENT` 逐字节比对：**均 2554 chars，BYTE_IDENTICAL**（测试 cpc1 第 39 行亦读取同一 spec 文件断言） |
| 2 | **revision == content digest、loadExact fail-closed** | ✅ `PLATFORM_PROMPT_V1_REVISION = calculateInstructionContentDigest(content)`；`loadExact(未知 revision) → undefined`，`materializeExact → context.platform_prompt_unavailable`；revision 重算校验在 load 时执行 |
| 3 | **Binding 确定性派生、不新增表** | ✅ [instruction-bundle-domain.ts](services/core/src/application/instruction-bundle-domain.ts) `deriveTaskInstructionBindingV1` 只消费 readable `TaskRuntimeSelection` + `submitTurnBundleDigest`，用独立 domain `robothree.task-instruction-binding.v1\n` 计算 digest；不读 current pointer、不复制 Prompt；测试 10 次派生 digest 唯一 |
| 4 | **Task Boundary 只含 safe facts** | ✅ 只投影 workspace/tool/knowledge/skill 有无与数量；测试断言 content 不含 task/selection/lock id、workspace id、`/Users/`、Credential、Endpoint、`sha256:` |
| 5 | **Agent exact revision 一次编译** | ✅ `AgentInstructionMaterializer` 校验 `agent.revision===binding.agentRevision && agent.digest===binding.agentDigest`，drift → `context.agent_material_invalid`；不重新解释产品字段、不调 Admin/编译器 |
| 6 | **Skill resolver Port + fail-closed** | ✅ `LockedSkillInstructionResolver` 只导出 Port（无 production 实现）；无 resolver + 无 Skill → resolver call count=0；无 resolver + 有 Skill → `context.skill_material_unavailable`；digest/drift → `context.skill_material_invalid`；ordinal 30+index 保持锁定顺序 |
| 7 | **单一 canonical System Message** | ✅ [instruction-bundle-compiler.ts](services/core/src/application/instruction-bundle-compiler.ts) 输出一条 `ModelInstructionMessage(role=system)`；wrapper 用 canonical JSON 转义（测试验证伪造 wrapper 只能成为一项 advisory skill content，不能伪造 hard item）；identity 固定 `core.instruction-bundle.v1 / assemblyRevision / instructionBundleDigest`（即 Revision 1.1 P3-1 收口） |
| 8 | **四层顺序与 content-free descriptor** | ✅ `platform:0/hard → task_boundary:10/hard → agent:20/role → skill:30+/advisory`；descriptor 只保留 identity/revision/digest/ordinal/mode，不含 content；编译器 input 改变 → `context.instruction_source_invalid` |
| 9 | **预算预检 typed fail** | ✅ `LockedInstructionBudgetPreflight` 经 `TokenEstimator` Port + `ContextBudgetPolicy.decision()`；超限 → `context.locked_instructions_too_large`；不换模型、不跳过 Skill、不截断（测试用 estimator=6657 触发） |
| 10 | **feature 默认 disabled、未接 Agent Loop/Provider** | ✅ `CPC_INSTRUCTION_FOUNDATION_DEFAULT_ENABLED = false`；`CpcInstructionCompilerConstants`：dynamicFactsEnabled=false / referencesCompiledAsInstructions=false / developerRoleEnabled=false；边界测试独立断言 durable-agent-loop-starter 无 CPC 引用 |
| 11 | **production 消费者 = 0** | ✅ 独立 grep：services/core/src 中 `TaskInstructionBundleMaterializer` 生产消费者 0（仅 compiler 自身定义 + index 导出）；`implements LockedSkillInstructionResolver` 0 命中 |
| 12 | **未触碰边界** | ✅ contracts 无 cpc/instruction-bundle 文件、index.ts 无相关导出；Desktop/Admin 无 CPC 导入；Provider/context-assembler/context-reducer/compaction 文件 mtime 均在 CPC-1 编码前（Aug 12 / Aug 25 19:xx vs CPC 文件 22:4x）未改；无 migration 27 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 2（观察项，均非阻塞）

1. **P3（一致性，建议 CPC-2 顺手收口）**：`TaskInstructionBundleMaterializer.materialize()`（instruction-bundle-compiler.ts:239）先直接调用
   `parseReadableTaskRuntimeSelection`，该函数抛的是通用 `Error("TaskRuntimeSelection digest is invalid")`（runtime-selection-revisions.ts:132），
   随后 `deriveTaskInstructionBindingV1` 内部会再解析一次并被 try/catch 包装成 `context.instruction_binding_invalid`。结果仍是 fail-closed
   （上游 I/O 为 0），但首层解析失败时会以非 typed 错误外泄，且存在一次冗余解析。不影响冻结，CPC-2 接 Agent Loop 时统一为 typed 错误即可。

2. **P3（知悉即可）**：CPC-1 只建立 Skill resolver Port + test-only fixture，production Skill resolver 为 0。因此 feature 启用后，带锁定
   Skill 的 Task 会 fail-closed（`context.skill_material_unavailable`）。这与方案 §1.2/§3.6 如实一致，`CPC1_INSTRUCTION_FOUNDATION_CONFORMANT`
   的可用面 = 无 Skill Task（或已接入可信 resolver 的 Task）。不阻塞。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 2（观察项，均非阻塞）
```

CPC-1 正确完成 Instruction Foundation：Platform Prompt v1 与产品 Feature Spec **逐字节一致**且 revision == content digest；TaskInstructionBindingV1
从既有 durable Task facts 确定性派生、不新增表、不读 current pointer；四层 source（Platform/Boundary/Agent/Skill）顺序与 authority 固定，
Task Boundary 只投影安全事实、Agent 只消费 exact revision、Skill 无 production resolver 时有 Skill 必 typed fail-closed；单一 canonical
System Message 的 bundle-level identity 精确落实 Revision 1.1 的 P3 收口（`core.instruction-bundle.v1 / assemblyRevision / instructionBundleDigest`）；
预算预检超限 typed fail、不换模型不跳过 Skill 不截断；feature 默认 disabled，未接 Agent Loop/Provider/Context Receipt，production 消费者为 0。

门禁独立复跑全绿：harness:cpc1 4/51、完整 check 260/1751 + 3 smoke + typecheck + lint、Central online/offline（404/0/0/0）、frozen offline install、
audit:dtp4。边界零漂移：lockfile `c47641ac…` 未变、migration 仍止 26、contracts 版本未变、Provider/Agent Loop/context 文件未触碰、无 CPC-2 抢跑。

**CPC-1 可进入用户接受流程；接受后由用户单独授权 CPC-2（Runtime Integration），不自动解锁。CPC-2～CPC-3、DFI-5.3 子批、AAPI-0.3～0.4、
TGM、Knowledge Provider 继续 GATED。**

— Claude Code（独立 QA，只读）
