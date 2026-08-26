# RoboThree DCF-1.3 Desktop/Core Runtime Reliability 与阶段验收开发计划

> 决策状态：**CONFIRMED_WITH_SPECIFIED_REVISIONS**  
> 编码状态：**DCF-1.3A/1.3B/1.3C PASS/CLOSED；DCF-1.3 CLOSED**  
> 日期：2026-07-27  
> 适用阶段：Desktop Client Foundation 1.3  
> 建议版本：`0.0.0-dcf.1.3a`、`0.0.0-dcf.1.3b`、`0.0.0-dcf.1.3c`  
> 前置事实：DCF-1.2A～1.2C 与 DCF-1.2 已 `PASS/CLOSED`；CGF-1.3 保持 `GATED`

## 1. 顺序决策

RoboThree 采用以下阶段顺序：

```text
DCF-1.3 Desktop/Core Runtime Reliability
→ 独立 QA
→ 用户接受并关闭 DCF-1.3
→ 完成企业离线语义修订
→ 重新确认 CGF-1.3 方案
→ 用户明确授权 CGF-1.3A
```

原因是 CGF-1.3 的 Runtime Activation 需要受控 Local Core restart。受控重启必须
建立在稳定、可观测、可恢复的 Desktop/Core 生命周期之上，不能由企业配置激活
代码临时承担进程监督、SSE 重连、资源回收和运行代切换。

本计划只覆盖 DCF-1.3。DCF-1.3A/1.3B/1.3C 已通过独立 QA 并由用户接受关闭，
DCF-1.3 阶段正式关闭。CGF-1.3 继续 `GATED`，不因本阶段关闭而自动解锁。

## 2. 当前基线与真实缺口

DCF-1.2 已完成：

- Electron Main 启动正式 Local Core 子进程；
- 私有 loopback HTTP/SSE、短期 Bearer 和固定安全边界；
- 单一 Desktop SSE；
- `runtimeInstanceId`、250ms～10s jitter 退避和 durable cursor；
- Snapshot-first 重连、eventId 去重和四类 replay reset；
- ephemeral Assistant delta 与持久 Assistant Message 最终收敛；
- Core 单次异常退出后的最小恢复；
- 真实 Main/Core/SQLite 子进程 E2E。

DCF-1.3 需要补齐：

- 生命周期状态机在并发 start/stop/restart、启动失败和退出竞态下的确定语义；
- `runtimeInstanceId` 变化时旧连接、旧 token、旧临时投影和旧选择句柄的完整失效；
- SSE 服务端对 Node.js write backpressure、`drain` 和慢消费者的正式处理；
- reconnect、duplicate、cursor reset 与 Core 连续重启的组合矩阵；
- timer、listener、AbortController、socket、child process、SQLite 等资源回收基线；
- 30～60 分钟可重复的长时间稳定 Harness；
- 可供后续 CGF-1.3 使用、但不携带企业 generation 语义的可靠 Core
  lifecycle primitive。

## 3. 阶段目标

DCF-1.3 完成后必须证明：

1. 任意时刻最多存在一个受 Desktop 管理的 Local Core 实例；
2. Core 异常退出后按有界策略恢复，不形成 restart storm；
3. Desktop 或 Core 重启不会重复提交 Message、Task、Selection 或 durable Event；
4. `runtimeInstanceId` 变化时，旧运行代的 ephemeral 数据不能污染新运行代；
5. SSE 断开、慢消费者和 cursor 失效都能以 Snapshot + durable cursor 收敛；
6. 长时间运行与反复启停后，进程、端口、listener、timer 和订阅不持续增长；
7. graceful shutdown 完成后不残留受管理 Core、监听端口或活跃 SSE；
8. DCF-1.3 的 lifecycle 能力可作为 CGF-1.3 Controlled Core Restart 的稳定底座，
   但本阶段不实现企业 Registry Generation Activation。

## 4. 固定所有权与边界

### 4.1 Electron Main

Main 是 Desktop 侧唯一 Core lifecycle owner，负责：

- 启动、探测、停止和有界异常重启；
- 维护唯一 active Core connection；
- 持有启动 token、随机端口和 `clientInstanceId`；
- 建立唯一认证 SSE；
- Snapshot-first reconnect、backoff、cursor 和 runtime instance 切换；
- 将安全 Runtime Projection 发送给 Renderer；
- 关闭 Desktop 时回收子进程、订阅、timer 和 socket。

Main 不负责：

- Task reducer、Task recovery 或 Message 事实；
- Prompt、Model、Tool 或 Agent Loop 决策；
- 企业 Registry 构建和 Runtime Activation；
- 从 PID、端口或运行时 Handle 推导业务状态。

### 4.2 Local Core

Local Core 是持久业务事实和 Desktop Projection 的唯一来源，负责：

- 每次成功 bootstrap 生成新的 `runtimeInstanceId`；
- 从 SQLite 恢复 Session、Message、Task 和 durable delivery；
- 只绑定 `127.0.0.1` 随机端口；
- 提供单一认证 SSE；
- 在 backpressure 下保证内存有界，并以持久事实支撑恢复；
- graceful shutdown 时停止接收新请求、关闭流、排空受控工作并释放数据库。

### 4.3 Preload 与 Renderer

Preload 继续只暴露固定业务 API；Renderer：

- 只显示 Main/Core 提供的 Projection；
- 可以丢弃未持久化的 streaming 临时文本；
- 必须以最新 Snapshot 和持久 Message 作为最终事实；
- 不持有 Core port、Bearer、SSE Client、PID、数据库或 lifecycle Handle；
- 不自行重启 Core，不建立第二套 reducer 或 recovery coordinator。

### 4.4 Kernel

DCF-1.3 不修改 Kernel reducer。KAF-2 Effect、Receipt、Outbox 和
CapabilityLock 语义保持不变。

Kernel reducer 必须保持纯函数，禁止导入：

- Electron；
- HTTP/SSE；
- `child_process`；
- lifecycle supervisor；
- `runtimeInstanceId`；
- restart state；
- SQLite Adapter；
- CGF Runtime Activation。

生命周期和恢复全部属于 Application/Adapter 层。

## 5. `runtimeInstanceId` 冻结语义

`runtimeInstanceId` 只表示一次 Local Core 启动实例：

- 由 Local Core bootstrap 生成；
- 每次新 Core 进程成功启动必须不同；
- 不是 PID、端口、`clientInstanceId`、Registry revision、Task ID 或
  Runtime Handle；
- 可以出现在 Control/Event Projection 中；
- 不作为 Task、Message、CapabilityLock 或 Registry 的持久业务事实；
- 进程退出后，与该实例绑定的 token、连接和未消费 `selectionHandle` 全部失效；
- 旧实例的 ephemeral delta、heartbeat 和 Runtime Notice 不得进入新实例的
  UI 临时投影；
- durable Event 仍按稳定 eventId/cursor 去重，并最终通过 Snapshot 收敛。

发现新的 `runtimeInstanceId` 时，Main 必须按以下顺序处理：

```text
停止转发旧实例 ephemeral Event
→ 清理旧 eventId 临时去重窗口和旧连接资源
→ 获取最新 Snapshot
→ 使用 Snapshot 返回的 cursor 重连
→ 回放可用 durable Event
→ 以持久 Message/Task Projection 收敛
```

不得把 `runtimeInstanceId` 变化误认为企业 Registry Generation 已激活。

## 6. DCF-1.3A：Restart、Recovery 与 Runtime Instance 生命周期

建议版本：`0.0.0-dcf.1.3a`

### 6.1 交付范围

- 明确且可测试的 Core lifecycle 状态：

```text
stopped
starting
ready
restarting
stopping
failed
```

不增加 `recovering`。Lifecycle State 只表示 Core 生命周期；Snapshot reconnect、
Projection rebuild 和 UI 收敛属于 Runtime Projection，不进入 Core lifecycle
state machine。

- 并发 `start/start`、`stop/stop`、`start/stop` 和 exit/restart 串行化；
- 启动超时、ready 前退出、ready 后异常退出和 shutdown 期间退出；
- Alpha 自动 restart 最多一次。固定失败链为：

```text
ready
→ Core 异常退出
→ restarting
→ restart budget 耗尽
→ failed
```

- `failed` 后不再自动 retry；恢复方式是用户关闭并重新启动 Desktop；
- Renderer 只显示 typed 文案：
  `Core 启动失败，已完成自动恢复尝试，请重新启动 RoboThree。`；
- 禁止无限自动重启、restart storm 和复杂恢复 workflow；
- 手动/受控 restart primitive 只表达“可靠地停止当前实例并启动新实例”，不携带
  企业 generation、PID、shell command 或任意启动参数；
- 新实例使用新 token、端口和 `runtimeInstanceId`；
- 旧 token、旧 Client、旧 SSE 和旧 `selectionHandle` 失败关闭；
- Desktop 重启后使用同一 SQLite 恢复持久事实；
- Core 重启时 Snapshot-first reconnect；
- runtime instance 变化后 ephemeral 投影清理；
- 启动失败和 restart budget 耗尽只输出有界、脱敏诊断；
- supervisor、reconnect controller 和 graceful shutdown Conformance。

### 6.2 命名故障矩阵

至少覆盖：

1. child 创建后、boot IPC 前失败；
2. boot IPC 后、数据库打开前失败；
3. 数据库打开后、HTTP ready 前失败；
4. ready 已发布、SSE 尚未连接时退出；
6. Assistant Message 已提交、durable delivery 尚未被 Main 接收时退出；
7. durable delivery 已提交、响应或 UI 投影前退出；
8. graceful shutdown 开始后 child 再次退出；
9. restart 启动中 Desktop 关闭；
10. 连续两次异常退出导致 restart budget 耗尽。

每个场景必须验证：

- 最多一个 active child；
- 无重复持久 Message/Task/delivery；
- 旧实例数据不进入新实例；
- 最终 Snapshot 正确；
- 端口、token 和 listener 得到回收；
- 失败可观测但不泄漏正文、路径、token 或数据库细节。

### 6.3 退出门槛

```text
异常 Core 退出
→ Main 进入 restarting
→ 旧实例资源失效
→ 新 Core 使用同一 SQLite 启动
→ runtimeInstanceId 变化
→ Snapshot-first 恢复
→ 最终 Message/Task 不重复
```

DCF-1.3A 独立 QA `PASS` 且用户接受后，才解锁 DCF-1.3B。

## 7. DCF-1.3B：Slow Consumer、Backpressure 与 Resource Cleanup

建议版本：`0.0.0-dcf.1.3b`

### 7.1 固定背压语义

SSE Server 必须检查 Node.js `response.write()` 返回值：

- 返回 `false` 后不得继续无界写入；
- `response.write() === false` 是进入 backpressure 等待的唯一触发条件；
- 触发后等待 `drain`，超过 30 秒仍未恢复才判定为 slow consumer；
- 不得使用“多久没有 Event”判断 slow consumer；
- durable delivery 保留在 SQLite，不复制到无界内存队列；
- 在 `drain` 前暂停 durable polling；
- heartbeat 可以跳过，不持久化、不推进 cursor；
- ephemeral delta 可以合并或丢弃，不能挤占 durable 恢复能力；
- slow consumer 恢复后继续从稳定 cursor 推进；
- 超过内部 slow-consumer deadline 仍未恢复时关闭连接，由 Main 执行
  Snapshot-first reconnect；
- 不承诺补发历史 token delta；
- 最终 Assistant Message 必须通过持久 Snapshot 收敛。

Alpha slow-consumer deadline 固定为 30 秒，必须可通过内部依赖注入缩短以
进行确定性测试；它不是公共 Contract 或产品 SLA。

Heartbeat 固定保持 15 秒，只负责 keep-alive，不参与 slow-consumer 判断、
backpressure 或 durable cursor 推进。

如果实现需要临时投递缓冲区，必须同时设置帧数和字节数硬上限，并证明达到任一
上限后仍优先保证 durable convergence。不得增加万能消息代理或第二套 Event Store。

### 7.2 慢消费者与重连矩阵

至少覆盖：

- `write() === false` 后 `drain` 正常恢复；
- `drain` 永不到达，超时断开；
- 慢消费者期间持续产生 ephemeral delta；
- 慢消费者期间产生 durable `message_committed`；
- SSE 断开与 Core restart 同时发生；
- duplicate durable Event；
- cursor 在保留窗口内重连；
- unknown、expired、old generation、cleaned cursor 的四类 reset；
- reconnect backoff 被 abort 时立即释放 timer；
- 连接恢复后只有一个 active SSE。

### 7.3 资源所有权

必须建立可测试的资源清单和显式 owner：

| 资源 | Owner | 关闭条件 |
| --- | --- | --- |
| Local Core child | Electron Main supervisor | Desktop stop、restart 替换或启动失败 |
| loopback server/port | Local Core HTTP Adapter | graceful shutdown 或 boot failure |
| active SSE response | Local Core HTTP Adapter | client close、slow timeout 或 Core stop |
| reconnect loop/AbortController | Electron Main | Desktop stop 或 controller replacement |
| poll/heartbeat/backoff timer | 创建它的 Adapter | stream/controller close |
| ephemeral subscription/listener | SSE Adapter / Main | stream close 或 generation change |
| `EphemeralWorkspaceSelectionStore` | Local Core bootstrap/Application | resolve、cancel、Core stop 或 restart |
| SQLite connection | Local Core persistence owner | Core shutdown 或 bootstrap failure |
| bounded stderr collector | supervisor | child exit 或 supervisor stop |

验证不只依赖 `lsof` 或 `ps`。优先使用跨平台、可注入的资源计数和 Node
child/server/listener 状态；OS 命令只作为诊断证据。

`EphemeralWorkspaceSelectionStore` 必须保持：

- TTL ≤30 秒；
- resolve 后删除；
- cancel 后删除；
- Core stop 后删除；
- restart 后全部失效；
- 不进入 SQLite、Event、Audit 或 Renderer。

### 7.4 压力门槛

自动化至少运行：

- 100 次 SSE connect/disconnect；
- 25 次 Core restart；
- 20 次 supervisor start/stop；
- 10,000 个 synthetic ephemeral delta；
- 100 个 durable Event 与 cursor replay；
- durable-only 路径：不产生 ephemeral delta，只验证 `message_committed` 和
  `task_status_changed`；
- 慢消费者恢复、超时断开和 reconnect 各 20 轮。

每轮结束必须满足：

- active Core child ≤ 1；
- active Core server ≤ 1；
- active Desktop SSE ≤ 1；
- 受跟踪 timer、listener、subscription 和 AbortController 回到稳定基线；
- 无未处理 Promise rejection；
- 无持续增长的应用级队列；
- 报告 `dedupeSetSize`、`maxDedupeSize` 和 `cleanupCount`，并证明有界清理；
- SQLite close/reopen 后事实一致。

RSS/heap 的绝对值不作为跨机器硬 SLA；Harness 必须记录采样趋势，任何连续单调
增长都需要解释，资源 owner 计数和队列上限才是硬门槛。

### 7.5 退出门槛

DCF-1.3A 已关闭，背压/资源专项与全量门禁通过，独立 QA 无 P0/P1，用户接受后
才解锁 DCF-1.3C。

## 8. DCF-1.3C：长时间稳定 Harness 与阶段关闭

建议版本：`0.0.0-dcf.1.3c`

### 8.1 Harness 两种模式

当前状态：`DCF-1.3C：PASS / CLOSED`。开发者与 Claude Code 独立 QA 均已实际
执行 30 分钟和 60 分钟两种真实模式；独立 QA 完成 27/27 范围覆盖、
88 files / 555 tests，P0～P3=0，结论已由用户接受。

```text
标准门禁模式
→ 使用虚拟时钟/故障注入压缩完整语义矩阵
→ 进入 pnpm run check

长稳模式
→ 真实 child process、loopback、SSE、SQLite
→ 默认连续运行 30 分钟
→ 可配置扩展到 60 分钟
→ 独立 QA 必须实际重跑，不得用 digest 代替执行
```

30 分钟是 DCF-1.3 独立 QA 的最低长稳门槛；60 分钟作为阶段关闭前的扩展验证或
发布候选门槛。独立 QA 必须实际执行 30 分钟真实 Harness，并在 DCF-1.3 阶段
关闭验证时实际执行 60 分钟扩展 Harness。长稳 Harness 不应强制每次普通单元
测试等待 30～60 分钟。

禁止使用：

- digest 代替实际执行；
- 开发者历史报告代替独立执行；
- 单元测试推断长稳结果。

### 8.2 长稳工作负载

Harness 循环执行：

```text
启动 Desktop supervisor/Core
→ 建立唯一 SSE
→ 创建/加载 Session
→ submitTurn
→ 接收 ephemeral delta
→ 注入断线、慢消费或 Core exit
→ Snapshot-first reconnect
→ 校验 durable Message/Task
→ graceful stop
→ SQLite close/reopen
→ 下一轮
```

必须混合：

- 正常回合；
- SSE 断开；
- cursor replay/reset；
- Core 异常退出；
- Desktop supervisor 重启；
- 慢消费者恢复与超时；
- 启动失败；
- graceful shutdown；
- 持久提交后、UI 收敛前的崩溃。

### 8.3 Harness 报告

机器可读报告至少记录：

- 随机种子和 Harness 配置；
- 运行时长、循环数和故障次数；
- Core 启动/退出/restart 数；
- runtimeInstance 数和唯一性；
- reconnect、reset、duplicate、slow-consumer 数；
- durable Event、Snapshot 和最终 digest；
- 峰值/最终资源计数；
- 最终 active child/server/SSE；
- failed assertion 和安全错误码。

报告不得包含：

- 用户消息正文；
- Assistant Message 正文；
- Tool 参数；
- Skill 输出；
- Knowledge 内容；
- Prompt 正文；
- Token；
- Credential；
- 完整本地路径；
- SQLite 文件正文；
- PID 作为业务事实。

只允许记录：

- count；
- digest；
- status；
- duration；
- resource metrics；
- typed error code。

### 8.4 阶段退出门槛

必须同时满足：

1. DCF-1.3A、1.3B 已正式 `PASS/CLOSED`；
2. 标准全量门禁通过；
3. 30 分钟真实长稳 Harness 通过；
4. 60 分钟扩展 Harness 在阶段关闭验证时实际执行并通过；
5. 独立 QA 实际重跑完整 Harness；
6. P0=0、P1=0；
7. Development Log、QA 报告和证据目录完整回链；
8. 用户明确接受 DCF-1.3C 与 DCF-1.3 阶段。

DCF-1.3C 开发者自测或独立 QA `PASS` 都不能自动解锁 CGF-1.3。

## 9. Contract 与 Persistence 纪律

- 默认复用 Desktop Local Runtime Contract `v1alpha1`；
- lifecycle 状态、背压计数和 Harness 指标优先保持内部实现或安全 Projection；
- 不新增 PID、端口、token、Runtime Handle、RegistrySnapshot 或企业 generation
  到公共 Desktop Contract；
- 不新增 Task 状态；
- 不为 restart 建立通用 Workflow/Saga Engine；
- 本阶段预期不新增 SQLite 业务 migration；
- 如果实现确实需要 durable 字段，必须先说明所有权、恢复价值和前向 migration
  影响，再单独评审；
- 不改变 KAF-2/3 Effect、Receipt、Outbox 或 CapabilityLock 语义；
- 不把 `runtimeInstanceId` 持久化为 Task 或 Registry 事实。

## 10. 安全门槛

- 只绑定 loopback；
- 每个 Core 实例生成新的短期高熵 Bearer；
- token 不进入 argv、URL、Renderer、日志、Fixture 或 Harness 报告；
- 旧 token 和旧端口在 restart 后失效；
- Main 只启动固定 entry path，不接受 shell command 或任意参数；
- stderr 有界、脱敏；
- Host、Origin、Bearer、CSP 和 redirect 安全回归；
- malformed ready IPC、错误 runtime instance 和不兼容 Contract 失败关闭；
- 达到 restart budget 后进入可观测 `failed`，不无限重启；
- shutdown/restart 不放宽 WorkspaceGrant、TaskCapabilityLock 或 Model/Tool 权限。

## 11. 统一 QA 清单

独立 QA 至少逐项确认：

1. lifecycle 状态转换和并发单写者；
2. ready 前/后退出及 restart budget；
3. 新实例使用新 token、port、runtimeInstanceId；
4. 旧 token、SSE、selectionHandle 和 ephemeral Event 失效；
5. Desktop restart + SQLite close/reopen；
6. Snapshot-first 与最终持久 Message；
7. durable Event 去重和 cursor 单调；
8. 四类 replay reset；
9. `write() === false`、`drain` 和 slow timeout；
10. ephemeral 可丢弃、durable 不静默丢失；
11. 单一 Core child/server/SSE；
12. timer/listener/subscription/AbortController 回收；
13. graceful shutdown 无残留端口和 child；
14. 启动失败无半初始化资源；
15. 100 次 connect/disconnect 压力；
16. 25 次 restart 压力；
17. 10,000 ephemeral + 100 durable 压力；
18. durable-only `message_committed` / `task_status_changed`；
19. dedupeSet 三项指标有界；
20. 30 分钟真实长稳 Harness 实际执行；
21. 60 分钟扩展 Harness 在阶段关闭验证时实际执行；
22. Harness 报告只含允许字段，不含正文、路径、Token 或 Credential；
23. Renderer/Preload 边界未放宽；
24. Kernel reducer 未修改且保持纯函数；
25. DCF-1.0～1.2 与 KAF-0～5 全量回归；
26. 未实现企业 Runtime Activation 或 CGF-1.3；
27. P0=0、P1=0。

## 12. 上游借鉴与自有边界

正式编码前必须在上游借鉴登记表新增 DCF-1.3 记录，至少复核：

- **OpenClaw**：本地 Gateway 生命周期、断线重连和进程边界；
- **OpenHands**：服务/运行时分离、恢复和运行时资源隔离；
- **LangGraph**：持久事实优先、重放和恢复 Conformance；
- **Electron 官方安全模型**：Main/Preload/Renderer、sandbox、context isolation。

借鉴的是成熟的生命周期、恢复和边界模式，不复制第三方源码。RoboThree 自有部分：

- Desktop Main ↔ Local Core 私有 Contract；
- Snapshot + durable cursor + ephemeral delta 收敛；
- `runtimeInstanceId` 与未来 Registry Generation 的严格分离；
- DCF-1.3 与 CGF-1.3 的阶段门槛。

## 13. 工作量估算

工程工作量按单一主工程师连续投入估算：

| 批次 | 集中工程工作日 | 主要工作 |
| --- | ---: | --- |
| DCF-1.3A | 2～3 | lifecycle 状态机、restart/recovery、运行代矩阵 |
| DCF-1.3B | 2～3 | SSE backpressure、慢消费者、资源清理与压力 |
| DCF-1.3C | 2～3 | 长稳 Harness、报告、完整回归和阶段收口 |
| 合计 | **6～9** | 不含独立 QA、返工和用户等待 |

“工程工作日”表示约一个工程师一天可完成的集中有效工程投入，不等于必须连续执行
8 小时，也不等于日历天。考虑独立 QA、长稳运行、评审和返工，PM 日历周期按
**10～16 天**预留。

该项在本计划内登记为 `P2 — SCHEDULE RISK`，不新建独立风险矩阵。PM 周报及
PM 风险台账由 MiniMax 独立维护，Codex 不写入。

原 DCF-1 Contract 文档中“DCF-1.3 1～2 天”只覆盖最小重启验收，未包含当前已
明确的 backpressure、资源基线和 30～60 分钟长稳矩阵，不再作为本阶段估算。

## 14. CGF-1.3 保持 GATED

CGF-1.3 的进入条件固定为以下交集：

```text
DCF-1.3 PASS/CLOSED
∩ 企业离线语义修订完成
∩ CGF-1.3 方案重新确认
∩ 用户明确授权 CGF-1.3A
```

CGF-1.3 后续仍必须保持：

1. Storage Activation 与 Runtime Activation 分离；
2. 新 Task 使用新 Registry Generation；
3. 已运行 Task 保持原 TaskRuntimeSelection 和 TaskCapabilityLock；
4. 配置变化不得影响正在执行的 Task；
5. Runtime Handle、PID 和连接实例不得进入持久锁；
6. 不静默替换 Binding、Model、Tool 或 Registry Generation。

DCF-1.3 不修改 Central Service、Enterprise Gateway Contract、企业配置 SQLite
或 CGF Runtime Activation 代码。

## 15. 非目标

DCF-1.3 不实现：

- CGF-1.3 Runtime Registry Activation；
- 企业配置同步或离线语义产品修订；
- 真实 Model/Credential；
- Task/Confirmation/Artifact 新 UI；
- Skill Reader、Knowledge Provider；
- Admin Console；
- Policy Engine；
- 多 Agent/Subagent；
- 长期 Memory；
- 自动模型路由；
- 通用进程编排平台、Saga 或 Workflow Engine；
- Windows/macOS 安装包、签名和自动更新。

## 16. 当前授权状态

```text
DCF-1.2：PASS / CLOSED
DCF-1.3：PASS / CLOSED
DCF-1.3A：PASS / CLOSED
DCF-1.3B：PASS / CLOSED
DCF-1.3C：PASS / CLOSED
CGF-1.3：GATED
```

用户已接受 DCF-1.3A/1.3B/1.3C 独立 QA并正式关闭三批，DCF-1.3 阶段正式
关闭。该结果只满足 CGF-1.3 四项进入条件中的 `DCF-1.3 PASS/CLOSED`；
企业离线语义修订、CGF-1.3 方案重新确认和用户明确授权 CGF-1.3A 仍未完成，
因此 CGF-1.3 继续 `GATED`。
