# RoboThree CGF-2B.3.2 双 JVM Relay Recovery 开发计划

> 阶段：`CGF-2B.3.2 — Dual-JVM Relay Recovery Conformance`  
> 状态：**PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-02  
> 计划开发版本：`0.0.0-cgf.2b.3.2`  
> 前置状态：CGF-2B.3.1 repair.1 与 Foundation 已 `PASS/CLOSED`  
> 后续状态：CGF-2B.3.3、CGF-2C、Enterprise Integration 继续 `GATED`  
> 上位基线：ADR-015、ADR-015a、ADR-016、CGF-2 Plan、CGF-2B.3 Plan  
> 上游借鉴：AR-049、AR-051、AR-052、AR-053、AR-054；仅设计借鉴，不复制源码

## 1. 阶段目标

CGF-2B.3.2 不再验证“能否调用 Custom Relay”，该能力已由 B.3.1 关闭。本批只
验证：两个独立 Central Java 节点通过真实生产 Provider Adapter/HTTP Transport
访问一个测试专用、进程外受控 Relay 时，能否以 PostgreSQL durable facts、
lease 和 fencing 为唯一恢复依据安全收敛。

```text
Central Java PID A ─┐
                    ├─ shared PostgreSQL 16
Central Java PID B ─┘
        │
        └─ controlled out-of-process Relay
           real HTTP/SSE / random loopback port / test-only fault control
```

本批必须回答：

1. dispatch 前崩溃是否可以安全由另一节点继续；
2. dispatch decision 已持久化后是否会禁止盲目重复 POST；
3. Provider 结果不可查询时是否唯一收敛为 `uncertain`；
4. 旧 owner 的迟到结果是否被 fencing 拒绝；
5. cancel 与 terminal 竞争是否只有一个 durable terminal；
6. durable SSE 是否可跨节点恢复，ephemeral delta 是否保持不可重放；
7. 已运行 Invocation 是否继续使用原 Binding revision，而不是静默切换。

## 2. 与 B.3.1、B.3.3 的边界

### 2.1 直接复用 B.3.1

- `DIRECT_PROVIDER` / `CUSTOM_RELAY` 显式 Connection Mode；
- `upstreamModelId` 与 RoboThree `modelId` 分离；
- Anthropic/OpenAI-compatible Adapter；
- `ProviderBackedModelInvocationExecutionBackend`；
- Credential Resolver、Endpoint Policy、HTTP/SSE Transport；
- blank content、cumulative usage 与 zero-leak 回归；
- `MANUAL_RECONCILIATION` Custom Relay Binding。

### 2.2 本批新增

- CGF-2A.3 已用 Fake Backend 验证双 JVM、共享 PostgreSQL、lease/fencing
  和基础恢复协议；本批不重复该结论，而是把执行边界升级为真实
  `ProviderBackedModelInvocationExecutionBackend`、协议 Adapter、HTTP/SSE
  Transport 与独立进程外受控 Relay；
- 两个独立 Central Java PID + 共享 PostgreSQL 16；
- 一个独立进程外受控 Relay；
- test-only Relay fault-control protocol；
- Provider-backed 双节点 recovery Harness；
- Binding v1/v2 精确恢复矩阵；
- durable cursor 跨节点恢复与 ephemeral 非重放证据；
- dispatch 前/后、mid-stream、terminal-before-commit 等命名故障点。

### 2.3 留给 B.3.3

- 完整 malformed/oversize/redirect/per-request URL 负向矩阵；
- 多轮 Central/Relay PID 启停和资源归零；
- 全通道安全扫描的阶段收口；
- CGF-2B.3 与 CGF-2B 整体关闭结论。

## 3. 明确非目标

CGF-2B.3.2 不实现：

- 企业内网 Relay、企业 CA/代理、CAS/RBAC 或生产 Secret Store；
- 真实厂商或公网 Provider 联网，不需要 API Key 或调用费用；
- 新 RecoveryMode、Relay status/query API 或幂等 proof；
- Provider exactly-once 声明；
- 自动 retry、自动 Binding/Protocol/Model fallback；
- 公共 Contract、PostgreSQL v0007 或生产 HTTP Route 变更；
- Desktop、Local Core、PRD、UX 或用户正文外发；
- CGF-2B.3.3、CGF-2C、ADR-017 实现或 Enterprise Integration。

## 4. 恢复语义

### 4.1 durable 事实所有权

PostgreSQL 继续是唯一权威事实源：

```text
Invocation status/revision
dispatch decision digest
durable event sequence/cursor
cancel/timeout intent
lease owner/epoch/expiry
recovery attempt/policy revision
audit outbox
```

进程 PID、线程、HTTP 连接、SSE parser、Relay request handle 和 ephemeral delta
不得进入公共 Contract 或 durable facts。

### 4.2 `running` 的含义不变

```text
running
= dispatch decision 已持久化
!= Relay 已收到请求
!= Relay 已开始生成
!= Relay 已完成或已计费
```

本批不得因为 Harness 能观察 Relay request count，就修改公共 `running` 语义或
增加新公共状态。

### 4.3 lease 与业务结果分离

- `leaseTtl` 只决定何时允许 takeover；
- lease 到期不直接产生 `uncertain`；
- 新 owner 必须读取 Invocation、dispatch decision、Binding、recovery mode 和
  当前 durable terminal 后再决策；
- takeover 使用数据库时间与 expected epoch CAS；
- 新 owner 取得更高 fencing epoch 后，旧 owner 的 renew、event、terminal 和
  cancel commit 必须失败关闭。

### 4.4 `MANUAL_RECONCILIATION`

B.3.2 的 Custom Relay Binding 固定使用 `MANUAL_RECONCILIATION`：

```text
accepted + no dispatch decision
→ 新 owner 可安全执行一次

running + dispatch decision persisted + no trusted remote evidence
→ takeover
→ no second Provider POST
→ durable uncertain
```

已观察到 ephemeral delta 不能视为可信 terminal，也不能作为自动 retry 的许可。
无法确认远端结果时不得伪造成 `failed` 或 `timed_out`。

### 4.5 Runtime 单写者

- Backend 只通过类型化 `Result` 报告结果；
- Backend、Adapter、Transport 和 Relay Harness 不得直接调用 Repository；
- `ModelInvocationRuntime` 是 durable terminal 和 durable event 的唯一提交者；
- `ephemeralPublisher.clear()` 继续是 best-effort 资源清理，不是 durable 事实；
- 事务提交失败不得由内存结果替代数据库事实。

## 5. 受控进程外 Relay

### 5.1 形态

新增 test-scope 独立 Relay 进程：

- 使用随机 loopback 端口；
- 实际接收协议 Adapter 发出的 HTTP POST；
- 以真实 SSE framing 返回合法响应；
- 有界 request body、response frame、stderr 和生命周期；
- `shell:false`，固定脚本/类入口，不接受任意命令；
- fault control 与生产请求端口/路径隔离；
- fault control 只使用公司 Java 基线允许的 GET/POST，且仅在 test scope 暴露；
- 不与 Central 共享 ApplicationContext、Repository、Runtime 或 Java 对象。
- 受控 Relay 只接受单连接 FIFO 请求，不模拟并发请求或请求重排；F7 的
  cancel/terminal 竞争由 Central Runtime 的 CAS 和 terminal 单写者规则收敛，
  不依赖 Relay 的并发行为。

### 5.2 Test-only fault modes

受控 Relay 至少支持：

```text
COMPLETE
BLOCK_BEFORE_FIRST_DELTA
BLOCK_AFTER_FIRST_DELTA
COMPLETE_THEN_HOLD_CONNECTION
RESET_CONNECTION
```

控制面只允许测试 Harness 设置模式、释放阻塞、读取有界 request count 和终止
进程。它不得进入生产 Profile、生产 Bean Manifest 或正式 Controller。

### 5.3 请求计数证据

只记录：

```text
requestCount
requestDigest
status
duration
typed error code
```

不得记录 Prompt、输出、Header、Credential、完整 URL 或 canary。恢复动作不得
增加 `requestCount`：F2 在 HTTP 前退出时保持为 0；F3～F5 已被 Relay 接收时
保持为 1。Harness 内部观察只用于证明没有重复 POST，不得变成 Runtime 可见的
恢复依据。

## 6. 双 JVM Harness

### 6.1 进程与数据库真实性

- Node A、Node B 必须是两个独立 Java PID；
- 两节点使用不同随机端口和独立 Hikari Pool；
- 两节点只通过共享 PostgreSQL 16 协调；
- PostgreSQL 必须由 Testcontainers 实际启动，不允许 Docker 不可用时跳过并
  仍声明 PASS；
- Relay 必须是第三个独立进程边界；
- Harness 不依赖 sticky session 或共享 JVM static state。
- 每个场景结束都必须关闭 Central/Relay 进程并回收 PostgreSQL 连接；多轮启停、
  soak 和完整资源归零矩阵仍留给 B.3.3。

### 6.2 Test-only failpoint decorator

为精确覆盖 F2 与 F5，允许在 test scope 建立只包装真实
`ProviderBackedModelInvocationExecutionBackend` 的 failpoint decorator：

- `BEFORE_DELEGATE`：dispatch decision 提交后、真实 HTTP 调用前阻塞；
- `AFTER_DELEGATE`：真实 Adapter/Transport 已返回 Result、Runtime durable
  terminal 提交前阻塞；
- 非故障模式必须无条件委托真实 Provider-backed Backend；
- decorator 不得合成 Provider Result、调用 Repository 或修改 durable facts；
- decorator、控制端点和 failpoint enum 不得进入 `src/main` 或生产 Fat Jar。

F3/F4 仍通过进程外 Relay 阻塞真实 HTTP/SSE 后由 Harness 终止 Central 进程，
不得用 decorator 合成中途 Streaming。

### 6.3 精确 Binding 恢复

Harness 同时保留 Custom Relay Binding v1/v2：

- v1 Invocation 在 v2 成为当前选择后仍解析 v1；
- dispatch decision digest 必须精确匹配 v1；
- v1 的 endpoint、protocol、credential revision、connection mode 和
  `upstreamModelId` 不得由 v2 替换；
- v1 不可解析或发生漂移时失败关闭；
- 禁止 fallback 到 v2、direct-provider 或另一协议；
- 本批不实现旧 Binding GC。

### 6.4 durable/ephemeral 恢复

```text
Snapshot/status first
→ use opaque durable cursor
→ replay durable events only
→ do not replay old token delta
```

跨节点重连必须证明 durable sequence 单调、无重复 terminal。丢失的 ephemeral
delta 不得从日志、Relay 内存或测试控制面重建；如果 Central 已可信完成但 Local
缺少完整输出，仍沿用 ADR-015 的 `model_stream_resume_unavailable` 边界，不在
本批新建第二套消息恢复语义。

## 7. 命名故障矩阵

| 编号 | 故障点 | 必须结果 |
| --- | --- | --- |
| F1 | accepted 已提交，dispatch decision 前 Node A 退出 | Node B 安全执行；Relay 只收到一次 POST |
| F2 | running/dispatch decision 已提交，HTTP 调用前 Node A 退出 | takeover 后按 manual policy `uncertain`；Relay requestCount 保持 0 |
| F3 | Relay 收到请求、首个 delta 前 Node A 退出 | Node B `uncertain`；requestCount=1 |
| F4 | 首个 delta 后 Node A 退出 | ephemeral 不重放；Node B `uncertain`；requestCount=1 |
| F5 | Relay 已形成 terminal、Central durable commit 前 Node A 退出 | 无可信 query 时 `uncertain`；不得伪造 completed 或重发 |
| F6 | Node B takeover 后旧 Node A 迟到提交 | `model_gateway.fencing_epoch_conflict`；单 durable terminal |
| F7 | cancel 与 Provider terminal 并发 | `cancelled` 或可信 Provider terminal 二选一；terminal count=1 |
| F8 | durable SSE 在 Node A 断开后连接 Node B | cursor 单调续接；无重复 durable event；无历史 delta |
| F9 | v1 Invocation 运行期间当前 Binding 切换 v2 | v1 精确恢复；无 v2/direct fallback |
| F10 | v1 Binding 缺失或 digest 漂移 | typed fail-closed；不调用 Relay |

F2 的“HTTP 调用前”只是 Harness 的故障注入位置，公共 durable facts 仍只能看到
`running + dispatch decision`。由于没有持久化的可信 transport-not-started proof，
恢复必须保守进入 `uncertain`；不得借测试内部知识绕过生产恢复语义。

## 8. 并发、取消与终态

- 同一 Invocation 同一时刻只有一个有效 lease owner；
- 两节点并发 takeover 只能一个 CAS 成功；
- stale epoch 的结果、cancel 和 renew 都必须拒绝；
- cancel intent 与 Provider Result 均通过 Runtime 提交；
- terminal Invocation 不得被恢复、取消或迟到结果复活；
- `uncertain` 是公共 terminal，不允许后台自动转成 completed/failed；
- 用户未来重试必须创建新 Invocation，本批不建设重试 UI 或新请求链路。

## 9. 修改边界

### 9.1 允许修改

```text
services/central-service/src/test/java/com/robothree/central/modelgateway/**
services/central-service/src/test/java/com/robothree/central/architecture/**
services/central-service/src/main/java/com/robothree/central/modelgateway/**
scripts/run-cgf2b3-dual-node-relay.mjs
package.json
services/central-service/pom.xml
README.md
CHANGELOG.md
docs/architecture/CGF-2B.3.2-DEVELOPMENT-PLAN.md
docs/architecture/CGF-2B.3-DEVELOPMENT-PLAN.md
docs/architecture/CGF-2-DEVELOPMENT-PLAN.md
docs/architecture/README.md
docs/architecture/UPSTREAM-ADOPTION-REGISTER.md
docs/architecture/KEY-NODES.md
docs/development/DEVELOPMENT-LOG.md
```

生产 `modelgateway/**` 只有在真实 Provider-backed 双节点 Harness 暴露既有恢复
接缝缺口时才允许做最小修复；若需要新公共状态、RecoveryMode、Port 或 durable
字段，立即停止并回到架构评审。

### 9.2 禁止修改

```text
contracts/enterprise-gateway/**
packages/contracts/**
services/core/**
apps/desktop/**
services/central-service/deploy/sql/postgresql/v0007_*.sql
既有 v0001～v0007 manifest/checksum
生产 Controller / 正式 HTTP Route
```

## 10. Architecture Guard

新增或扩展自动护栏，至少确保：

- test-only Relay/Controller/fault protocol 不进入 `src/main` 或生产 Fat Jar；
- 双节点 Harness 使用 `ProviderBackedModelInvocationExecutionBackend`，不替换为
  `ScriptedFakeModelInvocationBackend` 或 `HarnessModelInvocationBackend`；
- Backend/Adapter/Transport 不导入 Repository；
- Runtime 仍是 durable terminal 唯一提交者；
- 公共 Contract、OpenAPI、v0007、Desktop、Core 零修改；
- Production Dependency Manifest 不新增 test Bean；
- 不新增 WebSocket、GET/POST 之外方法或万能 execute Controller；
- 不引入企业内网、真实 Key、自动 fallback 或 Provider SDK。

## 11. 数据与安全

Harness 只使用固定 synthetic Prompt 和每次运行唯一 canary。应用日志、Trace、
stdout/stderr 和 QA evidence 必须自动扫描，禁止出现：

- Prompt、输出、delta 正文或 canary；
- Credential、Bearer、Header 或 opaque secret；
- 完整 Relay URL、完整本地路径；
- Provider 私有帧和完整异常响应；
- Runtime Handle、PID 与连接对象的持久化内容。

报告只允许 count、digest、status、duration、typed error code 和 resource metrics。
PID 可以只用于证明进程独立与退出，不写入公共 Contract、数据库或长期审计。

## 12. 验证命令

计划新增：

```text
pnpm run check:cgf2b3:dual-node-relay
```

开发者和独立 QA 必须实际执行：

```text
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm run check
CI=true pnpm run check:cgf2b3:dual-node-relay
```

专项命令必须明确报告两个 Central PID、两个端口、两个 Hikari Pool、一个 Relay
PID、共享 PostgreSQL、F1～F10 结果、requestCount、durable terminal count、
cursor、fencing conflict 和资源指标。历史 digest、B.3.1 公网 Harness、Stub
Conformance 或 CGF-2A.3 Fake Backend Harness 不能替代本批实际执行。

## 13. 独立 QA 建议范围

1. Node 24、Java 21、Docker、PostgreSQL 16 环境实际重跑；
2. 两 Central PID、随机端口、独立 Hikari Pool、共享 PostgreSQL；
3. 第三个进程外 Relay 和真实 HTTP/SSE；
4. Provider-backed Runtime/Adapter/Transport 全链路，禁止 Fake Backend；
5. F1～F10 命名故障矩阵全部执行；
6. lease 到期只允许 takeover，不直接改状态；
7. manual recovery 不发送第二次 POST；
8. stale fencing、cancel/terminal race 与单 durable terminal；
9. durable cursor 跨节点续接、ephemeral delta 不重放；
10. Binding v1/v2 精确恢复与漂移失败关闭；
11. 日志、Trace、stdout/stderr、evidence 动态泄漏扫描；
12. Contract、v0007、Controller、Desktop、Core 和生产 Bean 边界不变；
13. Central online/offline 与 Workspace 全量回归；
14. P0/P1/P2/P3 分级；独立 QA PASS 后仍需用户接受。

## 14. 退出门槛

```text
CGF-2B.3.1 PASS/CLOSED
AND F1～F10 complete matrix PASS
AND two real Central JVMs + one out-of-process Relay PASS
AND no duplicate external POST for dispatched manual-recovery invocations
AND durable cursor/fencing/single-terminal PASS
AND full Central/Workspace regression PASS
AND independent QA P0=0 / P1=0
AND user acceptance
→ CGF-2B.3.2 PASS/CLOSED
```

即使 B.3.2 关闭，CGF-2B.3.3、CGF-2C 和 Enterprise Integration 仍保持
`GATED`，不得自动进入编码。

## 15. 工期与资源

集中工程工作量：**3～5 个工作日**。

本批资源只需要：

- Node 24、pnpm 11、Java 21；
- Docker Desktop；
- Testcontainers PostgreSQL 16；
- 本地 loopback 进程能力；
- 固定 synthetic 测试内容。

不需要真实 Provider Key、企业内网、模型调用费用、OA/CAS、MDM、RBAC 或 PRD。
日历时间不包含独立 QA、评审、返工或环境故障等待。

## 16. 文档评审重点

请 Claude Code 与 MiniMax 只做文档评审，不开始编码，并按 `P0/P1/P2/P3`
输出：

1. F1～F10 是否与 ADR-015 的 manual recovery 一致；
2. F2 是否正确拒绝借 test-only transport 知识进行重试；
3. 真实 Provider-backed 路径和受控 Relay 是否足以替代 Fake Harness；
4. Runtime durable terminal 单写者是否保持；
5. Binding v1/v2、no-fallback 与 requestCount 证据是否完整；
6. durable/ephemeral、cursor 和取消竞争是否清晰；
7. test-only 控制面是否不会进入生产装配；
8. 是否存在公共 Contract、v0007、Controller、Desktop/Core 范围漂移；
9. 验证命令、独立 QA 与 3～5 个工作日估算是否合理；
10. 是否出现需要用户先决策的 P0/P1。

用户已接受文档复核结论并明确授权 `CGF-2B.3.2` 编码；实现与开发者门禁已完成，
当前等待独立 QA，尚未关闭阶段。

## 17. 文档复核收口

2026-08-02，Claude Code 完成首轮技术评审和聚焦复核。首轮结论为
`P0=0 / P1=0 / P2=0 / P3=2`，两项 P3 已按本计划 §2.2 与 §5.1 吸收：

| 项目 | 收口位置 | 状态 |
| --- | --- | --- |
| P3-01：未明确区别 CGF-2A.3 Fake Backend Harness | §2.2 明确基础协议与真实 Provider-backed 边界的差异 | CLOSED |
| P3-02：受控 Relay 并发能力未冻结 | §5.1 固定单连接 FIFO，竞争由 Runtime CAS 收敛 | CLOSED |

聚焦复核结论：

```text
P0=0 / P1=0 / P2=0 / P3=0
DOCUMENT REVIEW COMPLETE
```

本次复核不改变以下事实：CGF-2B.3.1 只形成
`PUBLIC_CUSTOM_RELAY_CONFORMANCE_PASS`；企业内网 Relay Conformance 仍在
Enterprise Integration 中 `GATED`。项目层 PM 待办不进入本批技术范围或编码
门槛。

## 18. 实现与开发者验证

2026-08-02，用户明确授权进入 CGF-2B.3.2。版本
`0.0.0-cgf.2b.3.2` 已在 test scope 完成：

- 两个独立 Central Java PID、独立端口和独立 Hikari Pool，共享 PostgreSQL 16；
- 独立进程外受控 Relay，Provider 数据面为单连接 FIFO，控制面使用独立端口；
- 正式 `ModelInvocationRuntime`、
  `ProviderBackedModelInvocationExecutionBackend`、双协议 Adapter 与
  `JdkModelAuthorizedHttpTransport`；
- F1～F10 命名恢复矩阵、Binding V1/V2 精确锁定、durable cursor 跨节点续接、
  ephemeral delta 不重放、取消/终态竞争和 stale fencing；
- 专用 `check:cgf2b3:dual-node-relay` 一键门禁和 test/production 架构护栏。

开发者验证：

```text
check:cgf2b3:dual-node-relay
→ PASS / F1-F10 / two Central JVMs / one Relay process / shared PostgreSQL 16

CI=true check:central
→ 195 tests / 0 failures / 0 errors / 0 skipped

CI=true check:central:offline
→ 195 tests / 0 failures / 0 errors / 0 skipped

CI=true pnpm run check
→ Architecture PASS / 107 files / 685 tests / three smoke PASS
```

实现没有修改生产源码、公共 Contract、PostgreSQL v0007、Controller、Desktop
或 Local Core。Claude Code 已独立重跑全部门禁与 F1～F10，结论
`P0=0 / P1=0 / P2=0 / P3=0`；用户已正式接受独立 QA，CGF-2B.3.2
`PASS/CLOSED`。CGF-2B.3.3、CGF-2C 与 Enterprise Integration 继续 `GATED`。

## 19. 独立 QA 与用户验收

Claude Code 独立 QA 报告：

```text
docs/development/qa/0.0.0-cgf.2b.3.2-claude-qa.md
P0=0 / P1=0 / P2=0 / P3=0
F1～F10：10/10 PASS
Central online/offline：BUILD SUCCESS
Workspace：107 files / 685 tests + three smoke PASS
```

独立执行确认两个 Central PID、两个独立端口/Hikari Pool、共享 PostgreSQL 16、
第三个 Relay PID、`providerRequestCount=8`、`durableTerminalCount=10`、
`durableCursor=4`、`fencingConflictCount=1`，最终连接和有效 Recovery Lease 均为
0，动态泄漏扫描为 0。

2026-08-02，用户正式接受独立 QA，CGF-2B.3.2 关闭。该关闭不构成
CGF-2B.3.3、CGF-2C 或 Enterprise Integration 的编码授权。
