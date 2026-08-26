# CPC-2 Runtime Integration 实施报告

> 日期：2026-08-26  
> 版本：`@robothree/core@0.0.0-cpc.2`  
> 状态：**PASS/CLOSED**  
> 最高输出：`CPC2_RUNTIME_INTEGRATION_CONFORMANT`

## 1. 交付结论

CPC-2 已把 CPC-1 冻结的 Instruction Bundle 接入真实 Core Context Pipeline 与 Durable Agent Loop。历史 Task
继续按 exact legacy marker 走原字节语义；锁定 Platform Prompt v1 的 Task 只在 CPC runtime 明确 enabled 时执行，
否则 typed fail-closed。production release decision 继续默认 disabled，本批不宣称 CPC production ready。

## 2. 实现内容

### 2.1 Runtime decision 与单次 materialization

- 新增 code-owned `LEGACY_DESKTOP_PROMPT_REVISION` 与单一 release decision；新 Task 写入的 prompt revision 和
  Agent Loop 使用同一个 decision，不接受 Renderer、Main、env 或 CLI 自报；
- `TaskLockedInstructionRuntimeResolver` 对 legacy / CPC v1 / unknown revision 做精确分流；
- terminal assistant replay 在 resolver 前短路；非终态 Task 在 Provider resolve 前只物化一次 immutable bundle；
- CPC-1 P3-1 已收口：readable Runtime Selection 只 strict parse 一次，后续 materializer 使用 validated selection；
- CPC typed error 进入既有 `fail_run`，用户消息使用固定安全摘要，不投影 Zod path、source id、digest、Prompt 或 stack。

### 2.2 Context / Receipt / Provenance

- Context Pipeline 新增 `LockedInstructionBundleContextV1` 专用输入，禁止与 legacy instruction / selected Skill 混用；
- Assembler 验证 Task、snapshot、binding、descriptor、message 与 budget policy 的 exact identity；
- Converter 原样发送 compiler 生成的唯一 System Message；Reducer 不删除、不截断该 message；
- Receipt additive 记录 content-free binding / assembly / bundle / ordered source evidence；
- Provenance 将 instruction bundle 分类为 platform/agent instructions；存在锁定 Skill 时额外收窄为 `skill_content`；
- Compaction summary 保持 data/user message，不进入 instruction source，也不生成第二条 System Message。

### 2.3 Agent Loop 与边界

- main 首轮、Tool 后续轮与同一 start 内 Compaction 后主请求复用同一 runtime material；
- continuation/restart 从 exact durable bundle 重建，legacy Task 不 backfill CPC Receipt；
- user Message 与 Tool locks 在 Provider resolve 前完成校验；CPC materialization 失败时 Provider 与上游 I/O 不可达；
- production Skill resolver 仍为 0：无 Skill Task 可执行，带 Skill Task 返回
  `context.skill_material_unavailable`，不跳过 Skill；
- Provider-private adapters 未修改；DFI-5 reasoning finalizer、Usage、timeout、durable deadline 与 Secret 边界只做回归。

## 3. 明确未实现

- CPC production activation 仍默认 disabled；CPC-3 只做 Lifecycle / Eval Closure，也不自动启用 production；
- 未实现 production Skill Runtime、Knowledge Provider、Memory、Dynamic Facts 或 Effect Reconciliation；
- 未修改 public/private Contracts、Desktop、Admin、Central production、Document Worker 或 Provider-private mapping；
- 未新增 migration 27、依赖或 lockfile 变更；DFI-5.3 子批、AAPI-0.3～0.4 与 TGM 继续 GATED。

## 4. 门禁证据

| 门禁 | 结果 |
| --- | --- |
| `harness:cpc2` | PASS：8 files / 73 tests |
| 完整 `check`（非沙箱） | PASS：262 files / 1771 tests + 3 smoke + Architecture boundary |
| focused typecheck / lint | PASS |
| frozen offline install | PASS |
| `audit:dtp4` | PASS；Core 版本审计基线为 `0.0.0-cpc.2` |
| Central online / offline | 独立 QA 使用 JDK 21 补跑，均 PASS：404/0/0/0 / BUILD SUCCESS |
| lockfile | SHA-256 `c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07`，未变 |
| migration | 最大 id 26，无 27 |

沙箱内 root check 的 loopback、Core child 与隔离 Keychain 用例因 `listen EPERM` / Keychain 隔离失败；同一代码在
非沙箱环境从零复跑全部通过。该环境差异未被记为产品缺陷，也没有通过跳过测试或降低门禁掩盖。

## 5. 独立 QA 重点

1. terminal replay → instruction materialization → user/Tool validation → Provider resolve 的真实顺序；
2. CPC failure 的 fixed safe summary 与 Provider/upstream 零副作用；
3. single System Message、content-free Receipt evidence、Compaction summary data-only；
4. legacy bytes/digest 零漂移、CPC gate=false 不 fallback、unknown revision typed fail；
5. 使用 JDK 21 补跑 Central online/offline，并确认 migration 仍止 26、lockfile digest 未变。

## 6. 当前状态

```text
CPC-2 = PASS/CLOSED
CPC-3 = DOCUMENT REVIEW PENDING / CODING GATED
DFI-5.3 子批 / AAPI-0.3～0.4 / TGM / Knowledge Provider /
Memory / Effect Reconciliation / Desktop / Admin = GATED
```

独立 QA 报告见 [CPC-2 Claude Code 独立 QA](./qa/cpc-2-claude-qa.md)。用户已正式接受其结论并关闭 CPC-2；
production activation 继续 disabled，CPC-3 仍须先通过独立方案评审和单独编码授权。
