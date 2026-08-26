# CGF-2B.3.3 安全、资源与阶段收口开发计划

> 状态：**REPAIR.1 PASS/CLOSED / CGF-2B.3.3 PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED**  
> 日期：2026-08-02  
> 开发版本：`0.0.0-cgf.2b.3.3-repair.1`  
> 前置门槛：CGF-2B.3.1 repair.1/Foundation、CGF-2B.3.2 均
> `PASS/CLOSED`  
> 后续门槛：CGF-2C、Enterprise Integration 继续 `GATED`

> 授权：用户已接受文档评审结论并明确授权 B.3.3 编码。开发过程中，负向
> route 测试发现编码路径可越过校验并触发网络尝试，按 §9.3 转入显式
> `repair.1`，完成最小生产修复后恢复阶段收口。

## 1. 阶段目标

CGF-2B.3.3 是 Model Gateway Foundation 的安全和稳定性收口批次，不新增
产品能力。它复用 B.3.1 的双协议/自定义中转站能力和 B.3.2 的真实
Provider-backed 双 JVM 恢复链路，通过受控的破坏性故障验证以下结论：

1. 请求不能通过 URL、redirect、Header、Credential 或 Binding 漂移越过已锁定
   的调用边界；
2. Provider/Relay 在不同流式阶段断开、发送非法协议或超限数据时，Runtime 仍按
   既有七状态、单 durable terminal 和 evidence-based recovery 收敛；
3. 多轮 JVM、Relay 和数据库连接生命周期结束后，端口、连接、lease、subscriber、
   buffer、线程和子进程可证明回收；
4. 日志、Trace、测试输出和 QA evidence 不泄漏 Credential、Prompt、模型输出、
   canary 或完整 Endpoint；
5. CGF-2B 可以形成阶段结论，但不会自动解锁 Desktop 用户内容外发或企业内网
   集成。

本阶段属于基础设施与安全验证，不依赖新的 PRD 或 UX 稿。事实源为已接受的
ADR-015、ADR-015 补充修订 A、ADR-016、CGF-2 Plan 和 CGF-2B.3 Plan。

## 2. 复用边界

### 2.1 必须复用

- 正式 `ModelInvocationRuntime` 和 Provider-backed Execution Backend；
- Anthropic-compatible、OpenAI-compatible Adapter；
- `JdkModelAuthorizedHttpTransport` 与严格 Endpoint Policy；
- B.3.2 的两个独立 Central JVM、共享 PostgreSQL 16、独立进程外受控 Relay；
- `dispatch_decision`、lease/fencing、single durable terminal、durable cursor 和
  ephemeral delta 既有语义；
- 现有 Adapter Conformance、Transport Security 和 B.3.2 F1～F10 测试。

### 2.2 不建立第三套执行架构

B.3.3 不新增 Provider Runtime、通用 HTTP Client、统一 Gateway Adapter、
第二套 Recovery Coordinator 或测试专用 durable state machine。受控故障只能通过
test-only Relay/Controller 注入，生产链路仍是唯一被测对象。

### 2.3 不宣称 exactly-once

本批不改变既有外部副作用语义：

- dispatch 前的确定性校验失败可以进入 `failed`；
- dispatch 后只有可信证据能够确定 terminal；
- 无法判断外部执行结果时进入 `uncertain`；
- 不允许因 lease 到期、连接断开或节点接管而盲目重复 POST；
- cancel、deadline 与 provider terminal 继续竞争为一个 durable terminal。

## 3. 验收拓扑

```text
Harness Controller
├── Central JVM A（独立 PID / port / Hikari Pool）
├── Central JVM B（独立 PID / port / Hikari Pool）
├── PostgreSQL 16（共享 durable facts）
└── Controlled Relay（独立 PID）
    ├── Data Plane：模拟 Anthropic/OpenAI-compatible SSE
    └── Test Control Plane：注入故障并读取安全计数
```

要求：

- Central A/B 不共享 Java 对象、ApplicationContext、static 状态或连接池；
- Relay 控制面不得进入生产装配或生产 HTTP Surface；
- 所有端口使用随机 loopback 端口；
- Harness 不需要真实 Provider Key、外网或调用费用；
- `check:cgf2b2:direct-provider` 在没有重新获准资源时必须返回
  `RESOURCE_GATED` 且证明零网络调用。

## 4. 负向矩阵 A：Binding 与出站安全

### 4.1 每请求 URL 注入

至少覆盖：

- absolute URL；
- `../` 或编码后的路径越界；
- query、fragment、userinfo；
- 非 HTTPS、超长 URL、未批准 host；
- loopback/private/link-local 等受限解析目标（仅测试模式的明确放行除外）。

预期：在 Provider POST 前失败关闭，返回既有 typed error；目标 Relay 的
`requestCount=0`，不得把非法输入拼接成请求地址。

### 4.2 Redirect

覆盖 `301/302/303/307/308`：

- Transport 必须保持 redirect `NEVER`；
- 统一收敛为 `model_gateway.provider_redirect_rejected`；
- redirect target 不得收到请求；
- Authorization/Credential 不得转发到第二目标。

### 4.3 Binding/Credential 漂移

覆盖当前实现能够表达的 missing、revision mismatch、digest drift、disabled、
revoked、permission/health 收窄和 Credential reference 不可解析场景。

预期：

- 只使用 Invocation 已锁定的 Connection/Binding revision；
- 不从请求正文接受 Endpoint 或 Credential；
- 不静默切换 protocol、Connection、Binding、Credential 或备用 Model；
- 被选 Binding 不可用时失败关闭或按既有恢复语义等待人工处理；
- 备用目标 `requestCount=0`。

### 4.4 Header 安全

验证 Host、Authorization、Content-Length、Content-Type、trace 以外的受控 Header
边界，拒绝 CR/LF、重复敏感 Header、超限 Header 和调用方自带 Credential。

## 5. 负向矩阵 B：真实流式协议与连接故障

### 5.1 协议失败

Anthropic-compatible 与 OpenAI-compatible 至少共同覆盖：

- 非 SSE Content-Type；
- malformed JSON / malformed SSE framing；
- incomplete EOF；
- oversized frame / headers / Tool arguments；
- UTF-8 非法或边界切帧；
- usage 回退或相互矛盾；
- 未知 terminal、重复 terminal、terminal 后迟到 delta；
- null、空字符串、纯空白和缺失 content 的既有回归。

协议确定性失败沿用现有 typed `failed` 映射；任何已可能到达 Provider 且无法确认
外部结果的场景不得伪造确定性失败。

### 5.2 连接失败窗口

受控 Relay 至少支持：

1. 接收请求前关闭；
2. 返回 headers 后、首 delta 前关闭；
3. SSE frame 中间 reset；
4. 首 delta 后 reset；
5. Provider terminal 已发送但连接未正常关闭；
6. 响应完成后 Central durable commit 窗口故障；
7. deadline；
8. cancel 与 terminal 竞争。

预期必须按实际证据区分 `failed`、`cancelled`、`timed_out`、`uncertain`，且每个
Invocation 最多一个 durable terminal。不得新增 Effect/Invocation 公共状态。

## 6. 资源生命周期矩阵

### 6.1 多轮执行

完整 Harness 至少执行：

- 5 轮 Central A/B 启停或 crash/restart；
- 5 轮 Relay 启停、reset 或 terminal 后断连；
- 每轮使用新的 Invocation、requestId 和 canary；
- 跨轮复用共享 PostgreSQL，只从 durable facts 恢复。

固定轮数用于发现泄漏趋势，不把长稳时间测试重新引入本批。

### 6.2 每轮资源断言

每轮和 Harness 最终都必须验证：

```text
本批启动的 Java/Relay Process Handle 已退出且 PID 不再存活
AND 已停止进程端口不可连接
AND Hikari active/awaiting connections = 0
AND 不再需要的 recovery lease = 0
AND SSE subscriber = 0
AND ephemeral buffer = 0
AND Relay active request = 0
AND child process descendants = 0
AND timer/thread 指标不随轮数无界增长
```

数据库连接短暂恢复、lease 正常 TTL 或 JVM shutdown hook 不能替代最终归零断言。

## 7. 安全泄漏扫描

### 7.1 每次运行的唯一探针

每次 Harness 使用独立的：

- Credential canary；
- Prompt canary；
- Provider output canary；
- Endpoint/Authorization Header canary。

所有 canary 只存在于受控测试进程内存；不得写入正式 Fixture、开发日志或 QA
报告正文。

### 7.2 四通道扫描

自动扫描：

1. Central/Relay stdout 与 stderr；
2. 捕获的应用日志；
3. Trace exporter/test span；
4. 测试结果和 QA evidence。

除原文外，还应覆盖至少 Base64、URL encoding 和常见 Header 前缀组合，防止简单
编码绕过。扫描结果只记录命中数量，不记录敏感原文。

### 7.3 报告允许字段

只允许记录：

- scenario/status/typed error code；
- count、digest、duration；
- terminal writer、cursor/sequence；
- PID/port 的生命周期证明；
- connection/lease/subscriber/buffer/resource metrics；
- 泄漏扫描布尔值或命中数量。

禁止记录 Prompt、模型正文、delta、Tool 参数、Credential、Authorization、完整
Endpoint、完整本地路径或可逆的敏感编码。

## 8. 实现批次

CGF-2B.3.3 不再拆出新的业务子阶段，按一个开发版本完成：

### 8.1 Harness 扩展

- 在 B.3.2 受控 Relay 增加 test-only 协议/断流/redirect 故障模式；
- 建立安全和资源收口 Controller；
- 把现有 Adapter/Transport 单项测试纳入统一阶段入口；
- 补足五轮生命周期与资源指标；
- 新增四通道动态泄漏扫描。

### 8.2 阶段门禁

已新增：

```text
pnpm run check:cgf2b3:closure
```

它实际串联：

- B.3.1 双协议/Relay 回归；
- B.3.2 F1～F10 Provider-backed Recovery Harness；
- B.3.3 安全、协议、资源和泄漏矩阵；
- 架构边界与敏感字段静态扫描。

不得用历史 digest、开发者报告或已有 QA 文本替代真实执行。

## 9. 修改边界

### 9.1 默认允许

```text
services/central-service/src/test/java/com/robothree/central/modelgateway/**
services/central-service/src/test/java/com/robothree/central/architecture/**
scripts/run-cgf2b3-closure.mjs
package.json
docs/architecture/CGF-2B.3.3-DEVELOPMENT-PLAN.md
docs/architecture/CGF-2B.3-DEVELOPMENT-PLAN.md
docs/architecture/CGF-2-DEVELOPMENT-PLAN.md
docs/architecture/KEY-NODES.md
docs/development/DEVELOPMENT-LOG.md
docs/development/qa/**
qa-reports/**
README.md
CHANGELOG.md
```

### 9.2 默认禁止

```text
packages/contracts/**
services/core/**
apps/desktop/**
deploy/sql/postgresql/**
生产 Controller / HTTP Surface
ADR-017 / CGF-2C 实现
真实企业 Relay / CAS / RBAC / MDM / Secret Store 集成
```

### 9.3 生产缺陷处理

如果统一 Harness 发现生产代码 P0/P1，不得把修复静默混入 test-only 收口：

1. 停止 B.3.3 关闭流程；
2. 记录最小复现和影响面；
3. 建立 `0.0.0-cgf.2b.3.3-repair.N`；
4. 只做最小生产修复和对应回归；
5. 独立 QA 通过后再恢复阶段收口。

## 10. 明确非目标

- 不建设模型报备、Key 签发、聚合路由、运营或成本平台；
- 不新增 Model Admin UI；
- 不接入真实企业内网 Relay、企业 CA/代理、CAS/RBAC 或生产 Secret Store；
- 不新增第三种 Provider 协议；
- 不修改公共 Model Invocation Contract、PostgreSQL v0007 或公共七状态；
- 不建设自动模型 fallback、Binding failover、负载均衡或智能路由；
- 不实现 ADR-017、Tool Calling 或 Desktop 真实用户内容外发；
- 不宣称企业生产就绪或通用 exactly-once。

## 11. QA 建议范围

独立 QA 至少逐项验证：

1. Node 24、Java 21、Docker/PostgreSQL 16 基线；
2. Central online/offline 完整门禁；
3. Workspace `pnpm run check`；
4. B.3.2 F1～F10 真实重跑；
5. 两个独立 Central JVM、独立 Relay PID 和共享 PostgreSQL 事实；
6. URL/route/endpoint 负向矩阵在 POST 前失败关闭；
7. 301/302/303/307/308 不跟随且 Credential 不转发；
8. Binding/Credential 漂移不静默 fallback；
9. 两协议 malformed/incomplete/oversize/UTF-8/usage/terminal 矩阵；
10. 八个连接故障窗口的 durable terminal 语义；
11. cancel/deadline/terminal 竞争单终态；
12. 至少五轮 Central 与五轮 Relay 生命周期实际执行；
13. PID、端口、Hikari、lease、subscriber、buffer、child process 最终归零；
14. 日志、Trace、测试输出、QA evidence 四通道动态扫描为零；
15. 报告不包含 Prompt、输出、Credential、Endpoint 或完整本地路径；
16. 公共 Contract、v0007、Controller、Desktop/Core 未变化；
17. `check:cgf2b2:direct-provider` 无获准资源时 `RESOURCE_GATED` 且零网络调用；
18. 无 CGF-2C、ADR-017 实现或 Enterprise Integration 超前开发。

## 12. 退出与后续门槛

```text
CGF-2B.3.1 PASS/CLOSED
AND CGF-2B.3.2 PASS/CLOSED
AND check:cgf2b3:closure 实际执行 PASS
AND Central online/offline + Workspace PASS
AND Claude Code 独立 QA 实际重跑完整 Harness
AND P0=0 / P1=0
AND 用户接受
```

满足上述条件后可以建议：

- CGF-2B.3.3 `PASS/CLOSED`；
- CGF-2B.3 整体 `PASS/CLOSED`；
- CGF-2B 整体 `PASS/CLOSED`。

repair.1、B.3.3、B.3 与 B 四个关闭结论均已由用户显式接受。CGF-2B 关闭不自动解锁
CGF-2C；进入 CGF-2C 仍需完成 ADR-017 前置实现门槛、CGF-2C 计划确认和用户明确
授权。Enterprise Integration 继续独立 `GATED`。

## 13. 工期

```text
集中工程工作量：2～3 个工程工作日
日历参考：4～7 天
```

工程工作日表示专注开发与自测投入，不等同于连续 8 小时机器运行，也不包含独立
QA 排队、问题返工、公司 IT、真实企业网络或资源等待。

## 14. 文档评审重点

请 Claude Code 和 MiniMax 重点确认：

1. B.3.3 是否严格复用 B.3.2 拓扑，没有建立第三套 Runtime；
2. dispatch 前确定性失败与 dispatch 后 `uncertain` 边界是否准确；
3. redirect、URL、Binding、Credential 和 silent failover 负向矩阵是否完整；
4. 五轮生命周期和资源归零指标是否足以作为 Foundation 收口门槛；
5. 四通道泄漏扫描是否覆盖 QA evidence 自身；
6. 生产缺陷是否必须通过 repair 批次显式处理；
7. CGF-2B 关闭与 CGF-2C/Enterprise Integration 是否继续保持独立门槛。

## 15. 实施与关闭结果

```text
版本：0.0.0-cgf.2b.3.3-repair.1
Closure：PASS / F1-F10 10/10 / security 10/10 / lifecycle 5
进程：10 Central + 5 Relay
资源：connection/lease/subscriber/buffer/request/child = 0
泄漏：0
Central online/offline：BUILD SUCCESS ×2
Workspace：107/685 + 3 smoke
Independent QA：P0=0 / P1=0 / P2=0 / P3=0
User Acceptance：ACCEPTED
```

最终状态：

```text
CGF-2B.3.3 repair.1：PASS/CLOSED
CGF-2B.3.3：PASS/CLOSED
CGF-2B.3：PASS/CLOSED
CGF-2B：PASS/CLOSED
CGF-2C：GATED
Enterprise Integration：GATED
```
