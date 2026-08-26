# AFE-1.0 P0-B Workspace Probe Report

状态：WORKSPACE PROBE REPORT / INDEPENDENT QA PENDING / CODING GATED  
输出结论：`P0B_WORKSPACE_CONFORMANT`  
日期：2026-08-24  
范围：仅验证 Admin Console Vue 2.7.16 preflight package 进入当前 pnpm workspace 后的依赖隔离、构建、类型检查、测试、静态扫描、root check 与 Desktop Vue 3 回归。  
非结论：本报告不输出 `AFE-1 READY`，不授权正式 `apps/admin-console/**`，不关闭后续产品页面、权限壳、真实 Adapter 或 Admin 工程落地决策。

## 1. 执行边界

| 项 | 结果 |
| --- | --- |
| 临时 workspace package | 已创建并保留：`apps/admin-console-preflight/**` |
| 正式 Admin 工程 | 未创建：不存在 `apps/admin-console/**` |
| root `package.json` | 未修改，digest 保持 `02b9e8db997a6d2c1e0f810be8c2fb05ab15a0a348ac9a8b3c882a7d0da24df9` |
| Desktop package | `apps/desktop/package.json` 未修改，digest 保持 `ec46dc077ca2ac3fd56d30fcc1372677f4a02338c140a7b27beae4ea9cae7385` |
| Desktop source/config | 未修改 |
| Core/Central/Contracts/migration/version/CHANGELOG/DEVELOPMENT-LOG | 未修改 |
| git evidence | 当前目录无可用 git repository，因此本报告使用文件存在性、digest 和命令结果作为证据 |
| QA 保留 | `apps/admin-console-preflight/**`、其 `dist/**` 与 package 内 `node_modules/**` 保留至独立 QA 完成，不提前清理 |

## 2. 精确版本矩阵

P0-B 仅执行 Primary matrix，未进入 fallback。

| 依赖 | 版本 |
| --- | --- |
| `vue` | `2.7.16` |
| `vue-router` | `3.6.5` |
| `@vitejs/plugin-vue2` | `2.3.4` |
| `@vue/test-utils` | `1.3.6` |
| `vite` | `6.4.3` |
| `vitest` | `4.1.10` |
| `typescript` | `5.9.3` |
| `vue-tsc` | `3.3.11` |
| `vue-template-compiler` | `2.7.16` |
| `happy-dom` | `20.11.2` |
| `@types/node` | `24.13.3` |

Package 名称：`@robothree/admin-console-preflight`。该名称仅用于 workspace preflight，不作为正式 Admin package 名称。

## 3. Workspace 特有问题与收敛

| 问题 | 表现 | 处理 | 结果 |
| --- | --- | --- | --- |
| Vue 2 template compiler peer 解析污染 | VTU 运行时最初出现 Vue package mismatch，`vue-template-compiler@2.7.16` 解析到 workspace 中的 Vue 3.5.40。 | 在 root `pnpm-workspace.yaml` 增加 `packageExtensions.vue-template-compiler@2.7.16.peerDependencies.vue: 2.7.16`。 | `@vue/test-utils@1.3.6`、`vue-template-compiler@2.7.16`、`vue@2.7.16` 绑定到同一 Vue 2 解析路径。 |
| esbuild build approval | workspace install/build 需要明确允许 esbuild postinstall。 | 在 root `pnpm-workspace.yaml` 保留 `onlyBuiltDependencies: [esbuild]`。 | frozen install、build、root check 通过。 |
| root Vitest 收集临时 Vue 2 tests | root `pnpm run check` 曾收集 `apps/admin-console-preflight/tests/*.test.ts`，使用 root Vue 3/Vite 8 配置运行 Vue 2 测试。 | 将 preflight 测试命名为 `*.preflight.ts`，并在 package `vitest.config.mjs` 中只 include `tests/**/*.preflight.ts`。 | package 自身测试仍运行，root Vitest 不再错误套用 Desktop/Root 配置。 |
| dev startup sandbox | 本地 sandbox 对 loopback 监听返回 `listen EPERM`。 | 按工具审批要求使用 elevated execution 复跑 dev smoke。 | 固定端口启动与释放验证通过。 |

## 4. 配置变更

| 文件 | 变更目的 |
| --- | --- |
| `pnpm-workspace.yaml` | 增加 esbuild build approval 和 Vue 2 compiler peer 绑定，保证 workspace 安装与测试可重复。 |
| `pnpm-lock.yaml` | 记录 workspace preflight package 的精确依赖解析。 |
| `apps/admin-console-preflight/package.json` | 定义临时 preflight package、精确依赖、脚本和 Node engine。 |
| `apps/admin-console-preflight/tsconfig.json` | 启用 TypeScript strict 与 `vueCompilerOptions.target: 2.7`、`strictTemplates: true`。 |
| `apps/admin-console-preflight/tsconfig.negative.json` | 继承正向 tsconfig，仅 include 负向 fixture。 |
| `apps/admin-console-preflight/vite.config.mjs` | Vue 2 Vite build 配置。 |
| `apps/admin-console-preflight/vitest.config.mjs` | Package 内部 Vitest/VTU v1 配置，只收集 `*.preflight.ts`。 |
| `apps/admin-console-preflight/src/**` | 最小 Vue 2 SFC、Router 3、presentation、route meta、adapter 类型探针。 |
| `apps/admin-console-preflight/tests/*.preflight.ts` | Component、Router、strict type behavior、static isolation 测试。 |
| `apps/admin-console-preflight/fixtures/**` | 负向 SFC typecheck 与敏感扫描正反向 fixture。 |
| `apps/admin-console-preflight/scripts/**` | 负向 typecheck harness、dev startup smoke、static scan、dependency isolation scan。 |
| `apps/admin-console-preflight/dist/**` | Build 产物，保留供 QA 复核。 |
| `apps/admin-console-preflight/node_modules/**` | Package 局部 bin/link，保留供 QA 复核。 |

## 5. Typecheck 与 SFC 证据

| 命令 | 结果 |
| --- | --- |
| `CI=true pnpm --filter @robothree/admin-console-preflight typecheck` | EXIT 0 |
| `CI=true pnpm --filter @robothree/admin-console-preflight typecheck:negative` | EXIT 0 |

负向 harness 输出：

```text
Negative typecheck failed as expected.
Observed files: BadProps.vue, BadTemplateAccess.vue, bad-route-meta.ts
Observed diagnostics: Type, missingField
```

有效配置检查确认：

```json
{
  "vueCompilerOptions": {
    "target": 2.7,
    "strictTemplates": true
  },
  "negativeExtends": "./tsconfig.json",
  "vueTscVersion": "3.3.11"
}
```

结论：Vue 2.7 SFC typecheck 的正向与负向路径均生效，负向 harness 不是恒真。

## 6. Build / Test / Dev Smoke

| 命令 | 结果 |
| --- | --- |
| `CI=true pnpm --filter @robothree/admin-console-preflight build` | EXIT 0，Vite `6.4.3`，18 modules transformed，生成 `dist/index.html`、CSS、JS |
| `CI=true pnpm --filter @robothree/admin-console-preflight test` | EXIT 0，4 files / 9 tests passed |
| `CI=true pnpm --filter @robothree/admin-console-preflight smoke:dev` | EXIT 0，固定 loopback port 启动并释放 |

Dev smoke 首次在 sandbox 内因 `listen EPERM` 失败，已按审批规则使用 elevated execution 复跑通过。

## 7. Static Scan 与敏感信息边界

| 命令 | 结果 |
| --- | --- |
| `CI=true pnpm --filter @robothree/admin-console-preflight scan:static` | EXIT 0 |

扫描输出：

```json
{
  "sourceViolations": [],
  "positiveDetections": [
    {
      "file": "/Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace/apps/admin-console-preflight/fixtures/static-scan/positive/leaky-values.ts",
      "sensitiveCount": 4,
      "unsafeCount": 0
    }
  ],
  "negativeFalsePositives": []
}
```

结论：

1. Source 中未发现真实或疑似真实 `token`、`credential`、`apiKey`、`secret`、stack、内部路径泄漏。
2. 正向注入能被检出。
3. 产品文案、字段名称和固定 fake/sentinel allowlist 未造成误报。
4. 未使用 `innerHTML`、`v-html`、`eval` 或动态 Function 作为展示路径。

## 8. Dependency Isolation 与 Desktop Vue 3 回归

| 命令 | 结果 |
| --- | --- |
| `CI=true pnpm --filter @robothree/admin-console-preflight scan:deps` | EXIT 0 |
| `CI=true pnpm --filter @robothree/admin-console-preflight why vue` | EXIT 0，Found 1 version of vue，版本为 Vue 2.7.16 |
| `CI=true pnpm --filter @robothree/desktop why vue` | EXIT 0，Found 1 version of vue，版本为 Vue 3.5.40 |
| `CI=true pnpm --filter @robothree/desktop build` | EXIT 0 |
| `CI=true pnpm exec vitest run apps/desktop/tests` | EXIT 0，57 files / 226 tests passed |

最终依赖扫描输出：

```json
{
  "vue": {
    "version": "2.7.16",
    "path": "/Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace/node_modules/.pnpm/vue@2.7.16/node_modules/vue/package.json"
  },
  "vueRouter": {
    "version": "3.6.5",
    "path": "/Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace/node_modules/.pnpm/vue-router@3.6.5_vue@2.7.16/node_modules/vue-router/package.json"
  },
  "vueTestUtils": {
    "version": "1.3.6",
    "path": "/Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace/node_modules/.pnpm/@vue+test-utils@1.3.6_vue-template-compiler@2.7.16_vue@2.7.16__vue@2.7.16/node_modules/@vue/test-utils/package.json"
  },
  "pluginVue2": {
    "version": "2.3.4",
    "path": "/Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace/node_modules/.pnpm/@vitejs+plugin-vue2@2.3.4_vite@6.4.3_@types+node@24.13.3_lightningcss@1.32.0_yaml@2.9.0__vue@2.7.16/node_modules/@vitejs/plugin-vue2/package.json"
  }
}
```

结论：Admin preflight 的 Vue 2 链路与 Desktop Vue 3 链路在 workspace 中保持隔离，未观察到 Desktop Vue runtime 被降级或混用。

## 9. Root Gate

| 命令 | 结果 |
| --- | --- |
| `CI=true pnpm install --frozen-lockfile` | EXIT 0 |
| `CI=true pnpm run check` | EXIT 0 |

Root check 关键输出：

```text
Architecture boundary checks passed.
Test Files  240 passed (240)
Tests       1603 passed (1603)
{"status":"ready","checkedAt":"2026-08-24T08:02:59.017Z","components":[]}
{"status":"ready","fixtureOnly":true}
{"status":"ready","sandbox":true,"preload":{"contractVersion":"v1alpha1","hasRuntimeStatus":true,"hasDesktopEvents":true,"sidecarContractVersion":"v1alpha2","hasWorkspaceBrowser":true,"hasWorkspaceReveal":true}}
```

## 10. Digest Evidence

| 文件 | 当前 digest | 说明 |
| --- | --- | --- |
| `package.json` | `02b9e8db997a6d2c1e0f810be8c2fb05ab15a0a348ac9a8b3c882a7d0da24df9` | 与 preflight 前一致 |
| `pnpm-lock.yaml` | `eff299c4f2db9a1409b3a0a13365fc62eda37451003eaddc0ea74ef1cf661626` | 因 workspace probe 依赖解析变更 |
| `pnpm-workspace.yaml` | `2b2e58f53ed0323612b3945a3ab0198018482d5f01f244c07fb8951b13e33f90` | 因 esbuild approval 与 Vue 2 peer extension 变更 |
| `apps/desktop/package.json` | `ec46dc077ca2ac3fd56d30fcc1372677f4a02338c140a7b27beae4ea9cae7385` | 与 preflight 前一致 |
| `apps/admin-console-preflight/package.json` | `6eebcd9688016f283093e89a41ce003712ca6546e86e17aea5fada17c0fb1031` | 新增临时 preflight package |

Admin 目录核对：

```text
apps/admin-console-preflight
```

不存在 `apps/admin-console/**`。

## 11. P0/P1/P2/P3 自检

| 等级 | 数量 | 说明 |
| --- | --- | --- |
| P0 | 0 | 未发现阻断项。 |
| P1 | 0 | 未发现高风险缺陷。 |
| P2 | 0 | workspace 特有问题已收敛并通过复跑。 |
| P3 | 0 | 无需在本报告中延后关闭的低风险项。 |

## 12. 仍然不关闭的事项

1. P0-B 只证明临时 Vue 2.7 Admin preflight package 能在当前 workspace 中与 Desktop Vue 3 共存。
2. P0-B 不代表正式 Admin Console 工程可以创建。
3. P0-B 不代表登录、权限、菜单、页面、组件、真实 Adapter、API、Credential、TGM、Knowledge Provider 或企业认证链路已经实现。
4. `apps/admin-console-preflight/**` 是临时 QA 证据，不得演变为正式 Admin 工程。
5. 清理 `apps/admin-console-preflight/**`、lockfile 与 workspace 配置前，需要独立 QA 完成和单独清理授权。

## 13. 后续建议

建议将本报告交 Claude Code 做独立复核。只有在 P0-B 独立 QA 通过并由技术负责人明确授权后，才能进入正式 Admin 工程 scaffold 的下一份方案或编码批次。
