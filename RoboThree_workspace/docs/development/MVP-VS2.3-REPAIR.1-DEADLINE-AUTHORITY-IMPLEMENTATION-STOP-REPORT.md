# MVP-VS2.3 repair.1 — Deadline Authority 实施停手报告

> 状态：**IMPLEMENTATION STOP — USER REVIEW REQUIRED**  
> 日期：2026-08-30  
> 范围：VS2.3 repair.1 Active Agent Loop Startup Recovery

## 1. 结论

repair.1 已证明可以从既有 SQLite 事实唯一恢复 active Task/Run/Step、round、Assistant Message、已提交的
Tool Result、Runtime Selection digest 与 ModelRequest id/digest；但无法从现有 durable facts 唯一恢复原始
Gateway invocation 的 `deadlineAt`。

`DurableEnterpriseModelProvider` 在恢复时重新生成当前时间加五分钟的 deadline；Gateway accept digest 包含
`timeoutPolicy.providerRequestDeadlineAt`，因此新值与已落盘 `centralAcceptRequestDigest` 不一致，既有
Model invocation link 正确返回：

```text
model_invocation_link.conflict
```

这命中冻结方案 §9 停手条件“需要忽略 request/link digest 才能恢复”。本轮没有忽略 digest、没有重新
`accept(...)`、没有修改 frozen Contract/migration，也没有建立第二套状态机。

## 2. 已完成且通过的聚焦证明

- Core typecheck PASS；
- `agent-loop-coordinator.test.ts` + `vs2.3-active-agent-loop-startup-recovery.test.ts`：2 files / 15 tests PASS；
- Provider/durable loop 回归：3 files / 36 tests 中 32 PASS；另 4 项首次仅因 sandbox `listen EPERM`
  失败，在允许 loopback 的同一 Node 环境复跑 4/4 PASS；
- active recovery seed 对缺失、重复、output-started、round/assistant/digest 漂移保持 fail-closed；
- 失败 SQLite 只读核对确认：round-1 Tool Result 已提交、round-2 link 已 accept、`outputStartedAt` 与
  `messageCommittedAt` 均为空，Task 在错误恢复竞争后被安全标记 failed；
- 真实 Electron E2E 能到达第一轮 round-2 SSE subscription、SIGKILL、新 Core ready，但第二次 subscription
  因上述 link conflict 未建立，门禁保持 FAIL。

## 3. 为什么不能在当前授权内继续

当前授权只允许修改 starter/coordinator/bootstrap、focused tests 与 VS2 fixture。可靠恢复至少需要给
Provider/link 一个可重建的原始 timeout authority。可选方案均超出当前边界：

1. 在 internal Model invocation link 中 additive 持久化 `providerRequestDeadlineAt`，恢复时 exact reuse；
2. 把 deadline 纳入另一项现有 immutable invocation material，并由 link 保存其 digest/值；
3. 修改 Provider 的 prepared-link 输入与校验逻辑。

禁止采用的伪修复：

- 从 prepared-link exact comparison 删除 deadline 影响；
- 使用新 deadline 但沿用旧 digest；
- 对同一 round 再次 `accept(...)`；
- 通过 fixture 固定系统时间掩盖 production authority 缺失；
- 新建通用恢复表、恢复状态机或公开 Contract。

## 4. 建议的最小下一步

建议单独评审 **VS2.3 repair.2 Invocation Deadline Authority**，只允许：

- internal additive durable field `providerRequestDeadlineAt`；
- Provider 首次 prepare 写入、resume exact reuse；
- Memory/SQLite adapter 与 focused tests；
- migration 仍止 26、公开 Contract/依赖/lockfile 不变；
- 完成后恢复 repair.1，并复跑一次 accept / 两次 SSE subscription / 同 invocation 的真实 Electron E2E。

在用户接受本停手结论并单独授权 repair.2 前，不继续编码、不标记 repair.1 或 VS2.3 PASS/CLOSED。

详细方案见：[VS2.3 repair.2 Invocation Deadline Authority 聚焦实施方案](./MVP-VS2.3-REPAIR.2-INVOCATION-DEADLINE-AUTHORITY-PLAN.md)。
