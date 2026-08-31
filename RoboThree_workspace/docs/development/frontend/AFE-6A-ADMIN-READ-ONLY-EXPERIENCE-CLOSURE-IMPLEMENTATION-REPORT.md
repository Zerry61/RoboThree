# AFE-6A Admin Read-only Experience Closure 实施报告

状态：PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED  
日期：2026-08-27  
负责人：Codex 5.6  
范围：`apps/admin-console/**`

## 1. 交付范围

AFE-6A 完成 Admin Console 六模块只读体验收口：Model、Robot、Skill、Tool、Knowledge、Audit 的真实只读投影展示、中文业务字段、状态语义、分页、详情、错误 fallback、响应式与可访问性基础行为统一收敛。

本批保持 read-only：不新增 mutation，不修改 Adapter Contract，不直接 `fetch`，不接 production identity、SSO、TGM、Knowledge Provider 或 Tool activation。

## 2. 实现摘要

- `apps/admin-console/package.json` 版本更新为 `0.0.0-afe.6a`。
- 扩展页面状态矩阵到 11 项：`loading`、`empty`、`ready`、`unavailable`、`permissionDenied`、`notFound`、`stale`、`error`、`disabled`、`partial`、`gated`。
- `read-only-inventory` presentation 统一六模块列表、详情、字段分组、状态 tone、非生产提示和安全错误文案。
- `ReadOnlyInventoryPage.vue` 与 `ReadOnlyInventoryDetail.vue` 使用统一 presentation 输出；分页 cursor 只保留在组件内存，stale cursor 后不复用旧 cursor。
- 删除 Tool Prototype 创建/策略路径相关 8 个文件，生产路由不再暴露 `/tools/new/api`、`/tools/new/mcp`、`/tools/:toolId/policy`。
- 补充只读页面、路由、presentation、敏感字段禁入、分页错误、状态矩阵和负向 typecheck 测试。

## 3. 安全边界

- production 默认路径仍为 `UnavailableAdminAdapter`；`AdminApiAdapter` 仅在 integration entry 使用。
- 页面和组件不直接调用 `fetch` 或 `XMLHttpRequest`。
- `Credential` 只展示 `已配置 / 未配置 / 暂不可用` 三态，不展示 reference、mask、last4 或裸值。
- 普通错误页面不 `JSON.stringify(error)`，不展示 stack、raw response、Token、API Key、Endpoint、Credential Reference、CapabilityLock 或 Audit raw payload。
- 测试身份 / 非生产环境提示在列表和详情页持续展示，不暗示 production 管理能力就绪。

## 4. 验证结果

- Admin typecheck：PASS。
- Admin typecheck:negative：PASS，负向 fixture 按 Type / missingField 失败。
- Admin build：PASS，82 modules。
- Admin build:integration：PASS，181 modules。
- Admin test：PASS，11 files / 41 tests。
- Admin scan:static：PASS，sourceViolations 0，positiveDetections 9，false positives 0。
- Admin scan:deps：PASS，Vue 2.7.16 / Router 3.6.5 / plugin-vue2 2.3.4 隔离成立。
- Admin smoke:dev：PASS。
- `pnpm run harness:aapi0.4`：PASS；evidenceDigest `sha256:aa4348558bcd333ed1fa377be99da0f82a5bc940456db3762ebf340dbad02a71` 与 AAPI-0.4 实施报告一致；12 个 exact Adapter methods，mutationMethodCount 0，9 项 readiness 全 false。
- `pnpm run check`：Claude Code 独立 QA 复跑 PASS，287 files / 1986 tests + 3 smoke + Architecture boundary。
- Desktop build：PASS。
- Desktop tests：PASS，58 files / 251 tests。

## 5. 文件边界

- AFE-6A 实现范围严格为 `apps/admin-console/**`。
- 未修改 Adapter Contract、Contracts schema、Desktop、Core、Central、Main、Preload、IPC、migration、root package、workspace 配置或 lockfile。
- lockfile digest 保持 `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。
- migration 上限仍为 26。

## 6. P 级结论

Claude Code 独立 QA：P0=0、P1=0、P2=0、P3=1。唯一 P3 为本地复跑结果描述不一致的观察项，实际独立复跑 `pnpm run check` 已全绿，不阻断。

用户已接受并关闭 AFE-6A；Admin Read-only Experience Closure 正式 `PASS/CLOSED`。

## 7. 后续边界

以下能力继续 `GATED`，不因 AFE-6A 关闭自动解锁：

- mutation
- Tool activation
- TGM
- Knowledge Provider
- production identity
- AAPI-0.5
- Desktop v2 consumption
- AFE-6B
