# WFW-2 Core Text Write Activation 实施报告

> 日期：2026-08-31  
> 版本：`0.0.0-wfw.2`  
> 状态：`PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED`

## 1. 交付结论

WFW-2 已把 WFW-1 的私有 `tool.workspace.file.write_text` 接入现有 Core Tool Runtime：

- 新增独立 Registry definition/binding/`query_then_retry` descriptor；
- `agent.general` 在 internal-trial entitlement 中获得 exact WFW ref，`agent.presentation` 仍只保留原四项 Document Tool；
- existing Document handle 与 WFW handle 共享同一 Document Worker child、PID、decoder、pending request、single-flight 与清理；
- Core 从 active WorkspaceGrant hydrate 真实 root，模型与 durable Artifact 均不接触 root；
- create 使用 `routine_file + create`，replace 使用 `routine_file + modify`，并要求同一 durable Session 唯一 terminal WFW Artifact head；
- private v1alpha2 additive inspect 接入既有 EffectCoordinator：`safe_retry` 精确转换为 existing `not_found`，`recovered_success` 形成稳定 Observation，`unknown` 保持 durable uncertain；
- 成功 Observation 自动投影为既有 html/markdown/text Artifact，不投影正文、root、grant、proof、临时路径或 `.prev` 第二 Artifact。

## 2. 关键实现约束

1. capability ID 与恢复 fault point 均复用 WFW-1 导出的权威常量/类型，没有复制第二套字符串或恢复状态机；
2. owned Artifact proof digest 只有一个 domain：`robothree.wfw-owned-artifact-proof.v1`；
3. proof 覆盖 Session、来源 Task/Observation/Artifact、capability revision、grant、normalized relative path、文件 SHA 与 lifecycle revision；
4. duplicate SHA、branch、非唯一 head、删除/sourceDeleted、lifecycle source mismatch、跨 Session、过期 SHA 均 fail-closed；
5. historical 缺 proof 不会降级为 destructive confirmation；模型提交私有字段会被 strict parser 拒绝；
6. WFW-3、WFW-H1、Renderer/Main/Preload/Desktop API、Windows NTFS、目录创建与更强 CAS 均未进入本批。

## 3. Developer 验证

- Node `v24.13.0` / pnpm `11.11.0`；
- WFW-2 focused：`4 files / 85 tests PASS`；
- WFW-2 + Document Worker/VS regression：`7 files / 101 tests PASS`；
- Document Worker full：`26 files / 222 tests PASS`；
- Root typecheck：PASS；
- focused ESLint：PASS；
- DTP-4 packaging audit + self-test：PASS（`1 file / 2 tests`）；
- `git diff --check`：PASS；
- lockfile SHA-256：`5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；
- Core migration：仍止 26；
- forbidden surface scan：Desktop Main/Preload/Renderer、public Contracts、Central 均为 0 个 WFW production reference。

全仓 `pnpm run lint` 仍被既有 Admin 生成 `.js` 文件的 34 个 `no-undef` 阻塞；错误全部位于 `apps/admin-console/**`，与本批 Core/Document Worker 改动零关联。WFW-2 涉及文件的 focused ESLint 已通过，不建立 WFW repair。

## 4. 版本与边界

- Root / Core / Document Worker：`0.0.0-wfw.2`；
- Desktop：保持 `0.0.0-mvp.rsl.1-repair.1`；
- Contracts / Admin：保持 `0.0.0-mvp.rsl.1`；
- 未新增 Contract、migration、依赖或 lockfile 变化；
- WFW-3、WFW-H1 与其他下游继续 `GATED`；
- 本批最高只确认 `WFW2_CORE_TEXT_WRITE_ACTIVATION_CONFORMANT`，不代表普通客户端可调用或 production ready。

独立 QA 初次复跑发现 VS1.1 旧测试仍固定四项 Tool；用户授权后仅同步该测试，使 `agent.general` 精确包含 WFW，
`agent.presentation` 仍保持原四项。聚焦 re-QA 最终为 `INDEPENDENT_QA_PASS`（P0/P1/P2=0，外部 P3 不归因），
用户已正式接受并关闭 WFW-2；该同步不建立 repair 批次。
