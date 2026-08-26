# AFE-1.1 Admin Console Scaffold / Route Shell 实施报告

状态：PASS/CLOSED  
日期：2026-08-24  
负责人：Codex 5.6  
代码版本：Root `0.0.0-afe.1.1`；Admin package `@robothree/admin-console@0.0.0-afe.1.1`  
上游来源：AFE-1.1 方案复核 PASS，用户明确授权编码。  
最高结论：`AFE11_ADMIN_SCAFFOLD_ROUTE_SHELL_CONFORMANT`

## 1. 实现范围

本批创建正式 `apps/admin-console/**`，将已通过 P0-A/P0-B 的 Vue 2.7.16 Primary matrix 落到 workspace 内的正式 Admin package：

1. 新增独立 package `@robothree/admin-console`，使用 Vue `2.7.16`、Vue Router `3.6.5`、Vite `6.4.3`、Vitest `4.1.10`、VTU `1.3.6`、vue-tsc `3.3.11` 等精确依赖。
2. 新增 Admin Shell、TopBar、Sidebar、SystemSubNav、NavLink、RouterOutlet、PageState 和最小 UI shell。
3. 新增六项一级导航和系统管理三个二级路由骨架：模型管理、工具管理、机器人管理、技能管理、知识管理、系统管理；系统管理无独立概览页。
4. 新增 route meta、`implementationGate`、`CapabilityProjection`、provisional permission alias、permission shell 与 navigation presentation。
5. 新增 production-safe `UnavailableAdminAdapter`；`FixtureAdminAdapter` 仅存在为后续测试/视觉显式场景，不进入默认运行路径。
6. 新增 TypeScript strict、Vue 2.7 SFC typecheck、负向 typecheck harness、static scan、dependency scan、dev startup smoke 和 package-local Vitest 门禁。
7. `apps/admin-console-preflight/**` 在独立 QA 通过、用户接受并明确授权后已清理；lockfile 与全量回归已收口。

## 2. 明确未实现

1. 未实现真实登录、SSO、Session Lease、CSRF、真实 Admin API、Central Controller、Contract、Projection 或 migration。
2. 未实现模型、工具、机器人、技能、知识、系统管理的业务 CRUD。
3. 未上传技能包，不测试 Tool，不保存 Credential，不连接 Knowledge Provider。
4. 未共享 Desktop `.vue` 组件、Router、Store、Vue runtime、Renderer、Preload、IPC 或 Main Process。
5. 未用 Fixture 冒充 production 数据；未输出创建、保存、发布、安装、测试或同步成功。

## 3. 文件与边界

| 类别 | 结果 |
| --- | --- |
| 正式 Admin 工程 | 新增 `apps/admin-console/**` |
| Preflight 证据 | 已在用户授权后清理；证据保留于 QA/清理报告与 Development Log |
| Root package | 版本更新为 `0.0.0-afe.1.1` |
| Lockfile | `pnpm-lock.yaml` 更新，新增正式 Admin importer |
| Workspace config | `pnpm-workspace.yaml` 保持 P0-B 已验证的 esbuild approval 与 Vue 2 compiler peer extension |
| Desktop package | `apps/desktop/package.json` digest 未变 |
| Core/Central/Contracts/migration | 未修改 |
| Main/Preload/IPC | 未修改 |

当前 Admin 目录：

```text
apps/admin-console
apps/admin-console-preflight
```

## 4. 安全与敏感边界

1. 页面只展示壳层、待接入、暂不可用、权限不足或 prototype/gated 状态，不展示真实业务结果。
2. `src/pages/**` 静态扫描禁止出现 Provider、API Key、Credential Reference、Endpoint、Token 等页面展示文本。
3. 静态扫描覆盖真实或疑似真实 bearer、API key、private key、stack、内部路径、unsafe DOM、Desktop import、Vue 3 runtime import、direct fetch 和 fixture adapter production import。
4. 普通错误展示只使用 safe summary；未知错误不会 stringify 原始对象。
5. 权限壳将菜单可见性、路由访问、页面内操作权限分离，权限 alias 仍为 provisional，不写入 Contract。

## 5. 开发者验证

| 命令 | 结果 |
| --- | --- |
| `CI=true pnpm install --no-frozen-lockfile` | PASS；sandbox 因 registry DNS/fetch 失败，真实权限环境复跑成功 |
| `CI=true pnpm install --frozen-lockfile` | PASS |
| `CI=true pnpm --filter @robothree/admin-console typecheck` | PASS |
| `CI=true pnpm --filter @robothree/admin-console typecheck:negative` | PASS；观察到 `BadProps.vue`、`BadTemplateAccess.vue`、`bad-route-meta.ts` 和 `Type` / `missingField` diagnostics |
| `CI=true pnpm --filter @robothree/admin-console build` | PASS；Vite 61 modules，产物 `dist/index.html`、CSS、JS |
| `CI=true pnpm --filter @robothree/admin-console test` | PASS；5 files / 14 tests |
| `CI=true pnpm --filter @robothree/admin-console scan:static` | PASS；source violations 0，positive detections 1 file / 5 sensitive hits，negative false positives 0，page text violations 0 |
| `CI=true pnpm --filter @robothree/admin-console scan:deps` | PASS；Vue 2.7.16 / Router 3.6.5 / VTU 1.3.6 / plugin-vue2 2.3.4 |
| `CI=true pnpm --filter @robothree/admin-console smoke:dev` | PASS；sandbox loopback `EPERM` 后真实权限环境复跑通过 |
| `CI=true pnpm --filter @robothree/admin-console why vue` | PASS；Found 1 version of vue = 2.7.16 |
| `CI=true pnpm --filter @robothree/desktop why vue` | PASS；Found 1 version of vue = 3.5.40 |
| `CI=true pnpm --filter @robothree/desktop build` | PASS |
| `CI=true pnpm exec vitest run apps/desktop/tests` | PASS；57 files / 226 tests；sandbox loopback/Core 限制后真实权限环境复跑通过 |
| `CI=true pnpm run check` | PASS；Architecture boundary checks passed；root Vitest 240 files / 1603 tests；Core smoke、Desktop smoke、Preload smoke PASS |

## 6. Root Check 关键输出

```text
Architecture boundary checks passed.
Test Files  240 passed (240)
Tests       1603 passed (1603)
{"status":"ready","checkedAt":"2026-08-24T11:54:41.135Z","components":[]}
{"status":"ready","fixtureOnly":true}
{"status":"ready","sandbox":true,"preload":{"contractVersion":"v1alpha1","hasRuntimeStatus":true,"hasDesktopEvents":true,"sidecarContractVersion":"v1alpha2","hasWorkspaceBrowser":true,"hasWorkspaceReveal":true}}
```

## 7. 当前缺口与下一道门禁

1. `apps/admin-console-preflight/**` 已清理并完成 lockfile/frozen install/Admin/Desktop/root 回归；详见
   [AFE-1.1 Preflight 清理报告](./AFE-1.1-PREFLIGHT-CLEANUP-REPORT.md)。
2. Admin 真实 API Adapter、认证、权限 Projection、业务页面 CRUD、Credential、TGM、Knowledge Provider 继续 `GATED`。
3. 本批不关闭 production identity blocker，不影响 Core/Desktop/Preload/Main/IPC。
4. root Vitest 未误收集 Admin package-local `*.admin.ts` 测试；Admin 自身测试由 package gate 单独执行。

## 8. P0/P1/P2/P3 自检

| 等级 | 数量 | 说明 |
| --- | --- | --- |
| P0 | 0 | 未发现阻断项。 |
| P1 | 0 | 未发现高风险缺陷。 |
| P2 | 0 | 已覆盖 Vue 2/3 隔离、权限三层分离、Adapter-only、敏感扫描和 root gate。 |
| P3 | 0 | 暂无延后关闭项。 |
