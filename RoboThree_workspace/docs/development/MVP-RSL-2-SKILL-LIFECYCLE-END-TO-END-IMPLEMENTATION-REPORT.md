# MVP-RSL-2 Skill Lifecycle End-to-End 实施报告

## 0. 结论

MVP-RSL-2 已按 Revision 1.1 和 Step 1 frozen Contract 完成编码、开发者验证、独立 QA 与用户接受。当前状态为：

```text
PASS/CLOSED / INDEPENDENT QA PASS_WITH_RISKS / USER ACCEPTED
```

本报告只确认两条 MVP 技能生命周期链已经真实接通并按用户决策关闭，不代表 production identity、
SSO/RBAC、通用包管理、MCP/HTTP Tool 管理、Knowledge Provider 或父 WFW-3 Windows NTFS 门禁已经完成。

## 1. 已完成的产品链路

### 1.1 Desktop 用户创建链

1. Desktop 通过 frozen `skill-lifecycle/v1alpha1` 创建受控草稿工作区；
2. `agent.skill-creator` 使用既有 Task、Agent Loop 与 WFW 写入合法 `SKILL.md`；
3. Main 校验并同步 exact draft revision，Renderer 不接触真实目录或 `workspaceGrantId`；
4. 真实 Task 测试完成后，Central 固化 content-free test fact；
5. 用户提交 exact revision，Admin 使用 expected revision 审核并发布 immutable release；
6. Desktop 安装 exact release，新 Task 通过既有 Runtime Selection、Capability Lock 与 instruction materializer 使用；
7. Core `SIGKILL` 后从同一 SQLite 恢复 exact installed Skill lock，Task 与 WFW Artifact 保持可读。

### 1.2 Admin 上传链

1. Admin 上传 ZIP/RAR/TAR.GZ/TGZ 到 Central 私有 staging；
2. Archive admission 阻断路径穿越、链接、特殊节点、重复路径、加密/分卷、嵌套包、依赖树、预编译 binary 和超限输入；
3. Admin 修改 metadata，并通过既有真实 Task pipeline 测试草稿；
4. Admin 发布 immutable release；
5. Desktop 从同一 lifecycle authority 安装 exact release，并在新 Task 中真实消费；
6. Core 重启后 exact release lock、Task terminal state 与 WFW Artifact 均保持。

安装过程不执行脚本、不安装依赖，也不把 Skill 包写入 Core 配置表或另建第二套 Runtime。

## 2. 关键实现

- 复用 Step 1 已冻结的 strict `@robothree/contracts/skill-lifecycle/v1alpha1`；Desktop 11 个方法、Admin 10 个方法保持
  frozen，create receipt、submission identity/revision、installation revision 均使用 durable exact identity；
- PostgreSQL B0013/U0013/manifest 作为同一 Central schema version deployment set，统一持久化 draft revision、
  test operation/fact、submission、release、package blob 与 command receipt；
- archive 解析使用已准入的 pure-JVM `junrar:8.1.0`，不 spawn 外部程序、不使用 native binding；
- Core HTTP lifecycle client、workspace draft synchronizer、installed runtime source 接入既有 Task/Agent Loop；
- Main 负责私有内存 Token lease、草稿工作区、安装、local discovery、Admin draft test 协调和 IPC routing；
- Preload 只暴露 frozen safe projection，Token、Credential、绝对路径、package bytes 与内部错误不进入 Renderer；
- Desktop 智能中心、创建页、详情页、技能广场和 Workbench，以及 Admin 上传、测试、审核、发布均接入真实 adapter；
- 服务不可用、身份缺失、revision conflict、安装状态不一致均 fail-closed，没有 Fake、LocalStorage 或 fixture success。

## 3. 实施中关闭的问题

1. **私有测试完成回执与 public Contract 不同**：Core HTTP client 以 private strict schema 接受
   `test_passed/test_failed`，没有扩写 frozen public Contract。
2. **multipart 代理破坏 archive bytes**：联合 E2E driver 由字符串转发改为 byte-preserving `Buffer` 转发；生产
   admission 继续执行 CRC、路径与大小校验。
3. **草稿测试 material 抢占 installed release**：runtime source 使用 Admin test > installed release > creator draft >
   local candidate 的明确优先级，同时保留历史 exact material 供 durable recovery。
4. **Admin 测试完成与临时 material 清理存在短暂竞态**：E2E 等待真实 operation terminal、临时 material 清理和
   Core ready 后再发布/安装，不用 sleep 或自动 retry 掩盖失败。

## 4. 开发者验证

环境：Node `v24.13.0`、pnpm `11.11.0`、JDK `21.0.12.1`。

| 门禁 | 结果 |
| --- | --- |
| Contract/Core/Desktop RSL-2 focused | 12 files / 56 tests PASS |
| Admin focused | 2 files / 16 tests PASS |
| Central archive/lifecycle/token online | 3 classes / 17 tests PASS / BUILD SUCCESS |
| Central archive/lifecycle/token offline | 3 classes / 17 tests PASS / BUILD SUCCESS |
| Real Central + Electron E2E | 2 tests PASS / BUILD SUCCESS |
| Core/Desktop/Admin typecheck | PASS |
| Desktop/Admin build | PASS |
| focused ESLint | PASS |
| DTP-4 packaging audit + self-test | PASS |
| Core smoke | `core.ready` |
| `git diff --check` | PASS |

真实 E2E 串行执行，未用自动重试掩盖失败：

- `MVP_RSL2_SKILL_LIFECYCLE_E2E_CONFORMANT`：Desktop 创建、WFW、测试、提交、Admin 审核、发布、安装、使用与恢复；
- `MVP_RSL2_ADMIN_UPLOAD_SKILL_E2E_CONFORMANT`：Admin archive upload、metadata、真实 Task 测试、发布、安装、使用与恢复。

两条结果都验证真实 Electron Main、Renderer、IPC、Core child、SQLite reopen、Central lifecycle HTTP、Gateway HTTP/SSE、
WFW Artifact、`SIGKILL` 与安全 Electron 配置；输出只含 content-free facts。

## 5. 不漂移边界

- lockfile SHA-256：`5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；
- Core migration max：26；Central schema target：13；
- Root/Core/Desktop/Contracts/Admin：`0.0.0-mvp.rsl.2`；Central：`0.0.0-mvp.rsl.2-SNAPSHOT`；
- 未新增第二套 Task、Agent Loop、Runtime Selection、文件平台、包管理器或测试报告系统；
- 未解锁 Personal Model、TGM、Knowledge Provider、production identity/SSO/RBAC；
- 父 WFW-3 的 Windows 11 本地 NTFS 回归继续 deferred，不由 RSL-2 冒充关闭。

## 6. 独立 QA 与用户接受

Claude Code 已完成独立只读代码 QA，结论为 `PASS_WITH_RISKS`，P0=0/P1=0/P2=0/P3=4。P3 仅包含 Node 环境偏差、
Claude 环境缺少 PostgreSQL/Electron、预存 Admin 生成 JavaScript lint 噪声和 Vue ESLint plugin warning，不归因 RSL-2，
不建立 repair 批次。独立 QA 报告：
[RSL-2 Claude QA](./qa/0.0.0-mvp.rsl.2-skill-lifecycle-e2e-claude-qa.md)。

用户已正式接受并关闭 RSL-2，同时接受：

- `MVP_RSL2_SKILL_LIFECYCLE_E2E_CONFORMANT`；
- `MVP_RSL2_ADMIN_UPLOAD_SKILL_E2E_CONFORMANT`。

Claude 环境未独立复跑的两条真实 E2E，由开发环境既有 `2 tests / 0 failures / BUILD SUCCESS` 作为关闭证据接受。
