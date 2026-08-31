# ADMIN-MVP-VS1 联合实施报告

- 日期：2026-08-30
- 版本：`0.0.0-mvp.admin.vs1`
- 状态：`PASS/CLOSED — CODE_QA_PASS / USER ACCEPTED`
- 范围：internal-trial Admin 模型管理、Central Gateway 配置、Desktop 模型发现与真实任务消费

## 1. 本批交付结果

本批把已关闭的 Admin 前端子批接到真实后端链路，但只覆盖 MVP 所需的企业模型管理：

1. `admin-control/v1alpha2` additive Contract 提供 managed model 读取、五个精确 mutation command、strict receipt 和 typed safe error；冻结的 v1alpha1 不改写。
2. Central 通过 PostgreSQL v0011 持久化模型配置、默认模型、配置审计和 immutable Gateway binding；Credential 使用 AES-GCM 密文保存，不经 read projection、日志或 Evidence 返回。
3. Central 只在显式 internal-trial 配置完整时安装 Admin-managed Gateway source、Credential source、connection tester 和安全 discovery endpoint；默认生产图不自动启用。
4. Admin Console 完成列表、详情、新建、编辑、连接校验、启停和设为默认；Secret 只允许 retain/replace，永不 reveal。
5. Desktop Main 从 Central 安全 discovery endpoint 取得当前默认模型，并把 exact model id/revision/configuration revision 投影到现有 Core deployment、Catalog、Entitlement、Runtime Selection、Task Lock 和 Gateway HTTP/SSE 路径。
6. 启用模型前必须完成成功的连接校验；停用模型会阻止后续 discovery/新任务选择，既有 Task 的 immutable exact Gateway binding 仍可用于恢复，不重新解释为当前默认模型。

## 2. MVP 行为边界

- 只支持 `internal_trial` 与一个经批准的 OpenAI-compatible 模型类别。
- 当前 Desktop capability 使用既有 VS1 冻结的 128K context baseline；这不是新增通用 Provider capability 平台，也不代表所有模型共享该能力。
- 不实现 SSO/RBAC、production identity、用户/组织范围、模型删除、供应商插件、Robot/Skill/Tool/Knowledge mutation、TGM、Knowledge Provider 或 Agent Lifecycle。
- 受控 Electron E2E 证明 Admin discovery 到真实 Desktop/Core/Gateway HTTP/SSE/PPTX/重启恢复的产品链路；它不冒充公网 Provider、正式生产凭证或 production ready。

## 3. 验证结果

- v1alpha2 Contract：`1 file / 7 tests PASS`。
- Admin Console：`13 files / 59 tests PASS`；typecheck、integration build、static scan PASS。
- Central：Admin command/configuration/security focused tests PASS；embedded PostgreSQL v0011 schema `3/3 PASS`；online/offline 各 `446/0/0/0 / BUILD SUCCESS`。
- Core：Admin-managed deployment focused `1 file / 6 tests PASS`；Core/Desktop typecheck PASS。
- Electron：`e2e:admin-mvp-vs1` PASS，确认真实 Electron Main、Renderer、Main IPC、Core child、SQLite reopen、Gateway HTTP/SSE、专项 Agent/Skill、两轮 Gateway invocation、PPTX Artifact 与 Core `SIGKILL` 后恢复。
- 历史回归：原 `e2e:mvp-vs1` PASS，既有 deployment-configured VS1 路径未被 Admin discovery 模式替换。
- migration：Core 仍止 26；Central additive 到 v0011。
- lockfile：仅因 Admin 恢复既有 `@robothree/contracts: workspace:*` importer，从旧快照 `c47641ac…` 标准重算为
  `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；没有新增 registry 依赖。

## 4. QA 与关闭条件

Claude Code 独立联合代码 QA 结论为 `CODE_QA_PASS`，P0=0、P1=0、P2=0、P3=1；P3 仅为与本联合批零关联的 Desktop workspace 全量门禁历史 blocker。用户已于 2026-08-30 接受该结论并正式关闭 ADMIN-MVP-VS1，不建立 ADMIN repair 批次。

本次关闭只确认 internal-trial Admin 模型管理、Central 持久化、Desktop 模型消费和 exact-lock 恢复闭环，不代表 production ready。Production identity/SSO/RBAC、Personal Model、其他 Admin mutation、TGM、Knowledge Provider 与 Agent Lifecycle 继续 GATED，下一项 MVP 产品任务另行确认。
