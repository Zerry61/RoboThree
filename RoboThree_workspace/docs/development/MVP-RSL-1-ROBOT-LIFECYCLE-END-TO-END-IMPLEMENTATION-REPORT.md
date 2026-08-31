# MVP-RSL-1 Robot Lifecycle End-to-End 实施报告

- 日期：2026-08-30
- 版本：`0.0.0-mvp.rsl.1`
- 状态：`IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT QA PENDING / USER ACCEPTANCE PENDING`
- 范围：Desktop 个人机器人草稿、真实 Task 测试、Admin 审核、企业发布、Desktop 消费与重启恢复

## 1. 交付结果

本批只关闭 PRD 中机器人生命周期的最短真实业务链：

1. 新增 consumer-driven `agent-lifecycle/v1alpha1` strict Contract，覆盖草稿、revision、测试事实、提交、审核、发布和安全错误；`agent.general` 保持 reserved，不能被用户草稿覆盖。
2. Central 使用 `B0012 / U0012 / postgresql-v0012 manifest` 同一 schema version deployment set 持久化草稿、测试事实、immutable submission、release 与 command receipt；Core SQLite migration 继续止 26。
3. Desktop 创建页通过 7 个 additive Preload 方法读取和修改当前用户草稿。头像只接受受控 PNG/JPEG；Knowledge 非空引用继续 fail-closed；本地 Skill 只参与个人测试，不进入企业发布包。
4. 草稿测试复用既有真实 SubmitTurn、Agent Loop、Runtime Selection、Model/Gateway HTTP-SSE 和 Task 持久化链路。Central 只接收 content-free 测试事实，不接收任务正文、模型输出或 Secret。
5. Admin Console 复用现有 internal-trial Admin Adapter 展示 pending submission 详情并执行 approve/reject；本批没有新增 Admin direct-create、已发布更新或下架能力。
6. 审核通过后，Central 发布 immutable Agent Package；Core 在 Catalog refresh 时读取已发布机器人，并继续复用既有 Entitlement、Task Lock 和 durable recovery，不建设第二套 Agent Runtime。
7. Main supervisor 对 `agent.manage` Token 采用用户接受的方案 A：从环境一次性读取并删除，仅以内存 `Buffer` lease 跨 Core restart 重新注入，Main 退出时 `fill(0)`；Token 不进入 Renderer、Preload API、IPC payload、SQLite、日志、Evidence 或 Artifact。

## 2. 真实用户闭环

联合 Electron E2E 已验证：

1. 用户在真实 Renderer 创建个人机器人并保存两版 revision；
2. 对 current saved revision 发起真实 Task 测试并得到通过事实；
3. 用户提交 immutable revision，Admin 通过真实 Central HTTP 审核并发布；
4. Desktop Catalog 刷新后出现已发布机器人，普通 Workbench 用它完成真实模型任务；
5. Task 保存 exact published Agent lock；Core `SIGKILL` 后用新 PID 和原 SQLite reopen，仍恢复同一 exact Agent lock；
6. Main 生命周期 Token 环境变量已删除，Renderer 无 `process` 能力，Electron 保持 sandbox、contextIsolation 和 nodeIntegration disabled。

开发者 E2E 最高输出为 `MVP_RSL1_ROBOT_LIFECYCLE_E2E_CONFORMANT`。在独立 QA 与用户接受前，不得标记 `PASS/CLOSED`。

## 3. 验证结果

- RSL-1 TypeScript focused：`9 files / 59 tests PASS`。
- Admin focused：`2 files / 9 tests PASS`。
- Central focused：Agent lifecycle PostgreSQL、Token authorizer、头像解码、HTTP error 与 Bearer filter 共 `15 tests PASS`。
- TypeScript：root build、root typecheck、RSL-1 聚焦 ESLint、DTP-4 packaging audit、`git diff --check` 全部 PASS。
- Central online：`454 tests / 0 failures / 0 errors / BUILD SUCCESS`。
- Central offline：`454 tests / 0 failures / 0 errors / BUILD SUCCESS`。
- 真实联合 Electron E2E：PASS；`realElectronMain / realRendererCreatorFlow / realMainIpc / realCoreChild / realSqliteReopen / realGatewayHttpSse / realCentralLifecycleHttp / realAdminReviewHttp` 均为 true，并验证两版 draft、测试 Task、审核发布、published Task、exact lock 和 Core `SIGKILL` 恢复。
- 版本：Root/Core/Contracts/Desktop/Admin 均为 `0.0.0-mvp.rsl.1`；Central 为 `0.0.0-mvp.rsl.1-SNAPSHOT`。
- lockfile：`sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`，无新 registry 依赖。
- migration：Core 仍止 26；Central target schema version 为 12。

## 4. Schema deployment set

- `B0012__agent_lifecycle.sql`：`sha256:6ad78503febe5670655253e47943fe2aa4bf288ea8a46674f390732aed69e7c8`
- `U0012__agent_lifecycle_from_v0011.sql`：`sha256:c9c870aa3e35ebf08c3a7911b6e3fc542a7c3a45d9957cd42515a709f290851b`
- `postgresql-v0012.json`：`sha256:23392af303cf6ec1e225dfe910acf5c1a1b6e9e5329dd9fec052852f8c389b60`

Fresh 与 v0011 upgrade 两个入口都指向 target schema version 12；Central 与 Core migration counter 相互独立。

## 5. 诚实边界与下一门禁

本批不包含：Admin 从空白创建企业机器人、已发布机器人更新/下架、Skill 生命周期、Knowledge Provider、TGM、Personal Model、production identity/SSO/RBAC、正式 Token 颁发或 production ready。

下一步是 Claude Code 独立代码 QA。独立 QA 应复跑 RSL-1 focused、Central v12 online/offline、真实联合 Electron E2E，并核对 Token 四通道零泄漏、Main Buffer 清零、Core migration 26、lockfile、deployment set digest 与所有下游 GATED 边界。未经用户接受，不自动解锁下一项产品任务。
