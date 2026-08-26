# CPC-1 Instruction Foundation 实施报告

> 日期：2026-08-25  
> 版本：`@robothree/core@0.0.0-cpc.1`  
> 状态：**PASS/CLOSED**  
> 最高输出：`CPC1_INSTRUCTION_FOUNDATION_CONFORMANT`

## 1. 交付结论

CPC-1 已在既有 TaskRuntimeSelection、SubmitTurn bundle、ModelInstructionMessage 与 ContextBudgetPolicy 之上完成
Instruction Foundation。该批没有接入 Agent Loop 或 Provider，因此不宣称系统提示词已经进入真实模型调用；它冻结并
验证的是后续 CPC-2 唯一允许消费的指令来源、精确绑定、编译和预算边界。

## 2. 实现内容

### 2.1 Immutable Platform Prompt

- 将产品 Feature Spec 的 Platform Prompt v1 逐字节固化为 Core release artifact；
- revision 与 content digest 使用同一 domain-separated SHA-256 事实；
- `PlatformPromptSource.loadExact()` 只接受锁定 revision，未知或损坏 revision typed fail-closed；
- artifact 不读取 Renderer、Main、env、CLI 或远程文本。

### 2.2 TaskInstructionBindingV1

- 从 exact readable TaskRuntimeSelection 与 SubmitTurn bundle digest 确定性派生；
- 绑定 task/runtime selection、Platform revision、Agent revision/digest、Skill 原始顺序与 assembly revision；
- 使用独立 `robothree.task-instruction-binding.v1\n` digest domain；
- 不新增表、不复制 Prompt、不读取 current Agent/Skill/Platform pointer、不新增 migration 27。

### 2.3 四层 Instruction Source

- Platform：ordinal 0 / hard；
- Task Boundary：ordinal 10 / hard，只投影安全的 Workspace/Tool/Knowledge/Skill 有无与数量，不输出 Grant ID、路径、
  Credential、Endpoint、lock 或 digest；
- Agent：ordinal 20 / role，只消费 exact `AgentDefinitionRevision`，revision/digest 或 binding 不一致时失败；
- Skill：ordinal 30+ / advisory，按锁定顺序调用 `LockedSkillInstructionResolver`；无 production resolver 且 Task 有
  Skill 时返回 `context.skill_material_unavailable`，无 Skill 时调用次数为 0。

### 2.4 单一 Compiler 与预算预检

- `InstructionBundleCompilerV1` 只接受与 binding 完全一致的有序来源；
- canonical JSON wrapper 负责 quote、backslash、newline 与伪造 wrapper 内容的转义；
- 输出一条 `ModelInstructionMessage(role=system)`，identity 固定为
  `core.instruction-bundle.v1 / assemblyRevision / instructionBundleDigest`；
- descriptor 只保留 content-free source identity/revision/digest/ordinal/mode；
- `LockedInstructionBudgetPreflight` 通过已有 TokenEstimator Port 与 ContextBudgetPolicy 校验，超出 available input 返回
  `context.locked_instructions_too_large`，不换模型、不跳过 Skill、不截断稳定指令。

## 3. 明确未实现

- 未修改 `DurableAgentLoopStarter`、Context Receipt、Compaction 或 Provider；这些属于 CPC-2；
- 未安装 production Skill resolver；Skill Runtime 继续 GATED；
- 未实现 Knowledge Provider、Memory、Dynamic Facts、Effect Reconciliation；
- 未修改 public/private Contracts、Desktop Main/Preload/Renderer、Admin、Central 生产代码、Document Worker；
- 未新增依赖、未修改 `pnpm-lock.yaml`、migration 仍止于 26；
- DFI-5.3 仍为计划 `PASS/CLOSED / CODING GATED`，本批未触碰 Provider-private Max mapping。

## 4. 门禁证据

| 门禁 | 结果 |
| --- | --- |
| `harness:cpc1` | PASS：4 files / 51 tests |
| CPC-1 新增 focused | PASS：2 files / 28 tests |
| 完整 `check`（非沙箱） | PASS：260 files / 1751 tests + 3 smoke + Architecture boundary |
| Central online | PASS：404/0/0/0 |
| Central offline | 首跑既有 dual-node Relay 时序偶发 1 failure；从零复跑 PASS：404/0/0/0 |
| frozen offline install | PASS |
| `audit:dtp4` | PASS；Core 版本审计基线同步为 `0.0.0-cpc.1` |
| lockfile | SHA-256 `c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07`，未变 |
| migration | 最大 id 26，无 27 |

沙箱内完整 check 因禁止 `127.0.0.1` listen 与隔离 Keychain 产生 `EPERM` 环境失败；同一代码在非沙箱环境从零复跑
全部通过，不记为 CPC-1 缺陷。

## 5. 关键可复核事实

- Platform Prompt 常量与产品文档 code block 逐字节一致；
- 同一 durable Task facts 十次派生的 binding digest 唯一；
- 同一 compiler input 十次 instruction bundle digest 与 message bytes 唯一；
- wrapper 注入正文反序列化后仍只是一项 advisory Skill content，不能伪造 hard item；
- 无 Skill resolver 的无 Skill Task 可物化；有 Skill Task typed fail-closed；
- production graph 中 `TaskInstructionBundleMaterializer` 消费者为 0；
- production `LockedSkillInstructionResolver` 实现数为 0；
- Dynamic Facts、Reference-as-instruction 与 Developer Role 均保持 disabled。

## 6. 交付状态

```text
CPC-1 = PASS/CLOSED
CPC-2 = DOCUMENT REVIEW PENDING / CODING GATED
CPC-3 = GATED
Knowledge Provider / Memory / Effect Reconciliation / Desktop/Admin = GATED
DFI-5.3 = PLAN REVIEW PASS/CLOSED / CODING GATED
```

## 7. 独立 QA 与用户接受

Claude Code 独立 QA 结论为 `INDEPENDENT_QA_PASS`：P0=0、P1=0、P2=0、P3=2，两个 P3 均非阻断。
用户已正式接受并关闭 CPC-1：P3-1（首层 generic parse 与冗余解析）纳入 CPC-2 强制收口；P3-2（production
Skill resolver 为 0）保留为已知阶段边界。CPC-2 当前只进入详细方案评审，不自动编码。
