# DFI-4A.3 Provider Timeout Repair Revision 1.1 — Claude Code 聚焦差异复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| 复核对象 | DFI-4A.3 Provider Timeout Repair Revision 1.1（文档方案） |
| 方案文件 | [DFI-4A.3.1-REPAIR.2-PROVIDER-TIMEOUT-DEVELOPMENT-PLAN.md](../frontend/DFI-4A.3.1-REPAIR.2-PROVIDER-TIMEOUT-DEVELOPMENT-PLAN.md) |
| 复核类型 | 文档聚焦差异复核（不重做完整评审，不进入编码） |
| 日期 | 2026-08-25 |
| 复核者 | Claude Code（只读） |
| 候选开发版本 | `0.0.0-dfi.4a.3.1-repair.2` |

---

## 一、复核结论

```text
DFI-4A.3 Provider Timeout Repair Revision 1.1
DOCUMENT REVIEW PASS
P0=0 / P1=0 / P2=2 non-blocking / P3=0
USER ACCEPTANCE PENDING
CODING GATED
```

六项关闭映射全部成立，文档质量完整、自洽，96 项 QA 矩阵与 5～7 日估算合理。

---

## 二、六项关闭映射复核

| # | 关闭项 | 结论 | 依据 |
|---|---|---|---|
| 1 | Progress frame 与纯 `usage:null` | ✅ 成立 | §3.1 末句「同帧含任一 progress fact 即使带 `usage:null` 仍算进度」+ §3.2「纯 usage:null = 无任何 progress fact」，消解了 DeepSeek 空首帧歧义；QA 20/21/22 分别锁 content+null / reasoning+null / 纯 null |
| 2 | EOF/异常断流检测 | ✅ 成立 | §4.1 五条件把「正常 EOF」写死，主事实为 `IncomingMessage.complete` + iterator 完整性，明确 keep-alive 下不能只看 socket `end`；§4.2 terminationCause 优先级正确 |
| 3 | Policy 单一注入路径 | ✅ 成立 | §5 Composition 所有权 + immutable Policy + Factory 注入 + Durable Provider 校验 revision/digest，依赖方向单向无环；§5.2 `NODE_ENV !== test` 禁止 test-only policy 守住生产面 |
| 4 | Migration 25 原子 Timeout Fact | ✅ 成立 | §7 additive 独立表 + §7.2 聚合 prepare 单 transaction + §7.3 历史三态（terminal 可读 / pending 进 recovery_exhausted / 不补造）+ §7.4 半迁移 preflight |
| 5 | Deadline drift | ✅ 成立 | §6.2 十条定义完整，第 9 条「prepare/replay/restart 改变 startedAt/deadlineAt/source 即 drift」+ 末句「外层 deadline 短于 minimum 不误判越界」堵住最易踩坑的两点 |
| 6 | QA 49~51 terminal-missing 映射 | ✅ 成立 | §11.4 明确 49 → `stream_terminal_missing`、50 → 不是 idle、51 → 不是 network |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 2（non-blocking，作为最终实施约束），P3 = 0

**P2-1：overall timer 剩余时长必须按 `invocationDeadlineAt - clock.now()` 计算**

§2.1 / §6.1 / §8.2 三处对 overall timer 的表述语义自洽，但 §8.2「overall 在 DNS 前开始」易被实现成「DNS 前重新采样 `now + overall`」。最终实施约束：**timer 初始时长 = `invocationDeadlineAt - clock.now()`，禁止在 DNS 前重新生成 `now + overall`**。

**P2-2：本批无外部 timeout 配置入口**

§2.1 给出 120k～1800k 可配范围，但 §5.3 同时禁止 env/CLI/Renderer/Profile 覆盖。最终实施约束：**本批 `selectedOverallTimeoutMs` 固定为 `900_000`；120～1800 秒只是为未来配置源预留的 validator 校验边界，不是本批活跃配置入口**。

> 两项 P2 直接作为最终实施约束写入，不发起 Revision 1.2 或新一轮评审。

---

## 四、结论

Revision 1.1 方案正确完成了 Provider Timeout 的完整、可恢复修复设计：四阶段 timer 语义、单一 Policy 注入、
additive migration 25 Timeout Fact、termination cause 归因、错误分轨、健康状态不污染、96 项 QA 矩阵。

六项关闭映射全部成立，无条件 PASS。两个 P2 作为非阻断实施约束采纳。差异复核 PASS 不等于编码授权；
用户须正式接受 Revision 1.1 并单独授权 `0.0.0-dfi.4a.3.1-repair.2` 后，方可进入编码。

— Claude Code（协助开发 / 只读复核）
