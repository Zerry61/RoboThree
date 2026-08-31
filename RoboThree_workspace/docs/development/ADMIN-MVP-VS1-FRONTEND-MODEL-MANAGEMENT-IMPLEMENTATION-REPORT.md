# Admin MVP VS1 Frontend Model Management Implementation Report

- 日期：2026-08-30
- 状态：`PASS/CLOSED — CODE_QA_PASS / USER ACCEPTED`（仅 ADMIN-MVP-VS1 Frontend 子批；联合 VS1 仍等待 AM1-B 后端与端到端 E2E）
- Admin package version：保持 `@robothree/admin-console@0.0.0-afe.6c`，未推进 package version，避免在本批 no-lockfile 边界下触发 lockfile 漂移。

## 范围

本批按 `ADMIN-MVP-VS1 Revision 1` 执行 Admin Console 前端模型管理接线：

- 扩展 Admin Adapter，保留 `admin-control/v1alpha1` 只读方法，同时新增 `admin-control/v1alpha2` managed model 读取与 5 个模型写方法。
- 实现模型列表、搜索、生命周期筛选、详情、新建、编辑、连接校验、启停和设为默认入口。
- 访问密钥只显示 `已配置 / 未配置`，创建与替换时只通过受控 Adapter 提交，不回显、不复制、不展示片段。
- revision conflict 后重读服务端最新 revision，不做静默覆盖。
- 删除、归档、恢复、供应商插件、用户范围、Robot/Skill/Tool/Knowledge mutation、TGM、production identity 仍不实现。

## 安全边界

- 页面不直接 `fetch`，业务数据和写命令只通过 `AdminAdapter`。
- production `main.ts` 仍安装 `UnavailableAdminAdapter`；真实 Adapter 只在受控 integration/internal-trial 入口安装。
- production bundle 静态扫描未暴露 `AdminApiAdapter`、`createAdminApiAdapter` 或 `/admin/v1alpha1`。
- 页面和测试不展示 `API Key`、`Credential Reference`、`Endpoint`、`Token`、`Bearer`、`CapabilityLock` 等禁入词。
- 错误展示只使用 safe summary；未知错误收敛为安全文案，不 stringify 原始异常或 stack。

## 主要文件

- `apps/admin-console/src/adapters/admin-adapter.ts`
- `apps/admin-console/src/adapters/admin-api-adapter.ts`
- `apps/admin-console/src/adapters/unavailable-admin-adapter.ts`
- `apps/admin-console/src/adapters/fixture-admin-adapter.ts`
- `apps/admin-console/src/app/router.ts`
- `apps/admin-console/src/pages/models/ModelsPage.vue`
- `apps/admin-console/src/pages/models/ModelDetailPage.vue`
- `apps/admin-console/src/pages/models/ModelFormPage.vue`
- `apps/admin-console/src/presentation/model-management-presentation.ts`
- `apps/admin-console/src/styles/base.css`
- `apps/admin-console/tests/adapter/admin-api-adapter.admin.ts`
- `apps/admin-console/tests/component/model-management-vs1.admin.ts`
- `apps/admin-console/tests/component/inventory-read-only.admin.ts`
- `apps/admin-console/tests/accessibility/accessibility.admin.ts`
- `apps/admin-console/tests/router/router.admin.ts`

## 验证结果

- `pnpm --filter @robothree/contracts build`：PASS
- `pnpm exec vitest run packages/contracts/tests/admin-control-v1alpha2-model-mutation-contracts.test.ts`：PASS，1 file / 7 tests
- `pnpm --filter @robothree/admin-console typecheck`：PASS
- `pnpm --filter @robothree/admin-console typecheck:negative`：PASS
- `pnpm --filter @robothree/admin-console build`：PASS，93 modules
- `pnpm --filter @robothree/admin-console build:integration`：PASS，197 modules
- `pnpm --filter @robothree/admin-console test`：PASS，13 files / 59 tests（非沙箱运行；沙箱下 loopback 监听返回 `EPERM`）
- `pnpm --filter @robothree/admin-console scan:static`：PASS，source/bundle/productionBundle violations 全 0，positive detections 9，false positives 0
- `pnpm --filter @robothree/admin-console scan:deps`：PASS，Vue 2.7.16 / Router 3.6.5 / VTU 1.3.6 / plugin-vue2 2.3.4
- `pnpm --filter @robothree/admin-console smoke:dev`：PASS（非沙箱运行；沙箱下 loopback 监听返回 `EPERM`）
- `pnpm --filter @robothree/desktop build`：PASS

## 未通过的 workspace 外部门禁

- `pnpm exec vitest run apps/desktop/tests`：FAIL（非沙箱复跑），67 files PASS / 1 file FAIL，唯一失败为既有 `apps/desktop/tests/renderer-workbench-boundary.test.ts` 命中 `apps/desktop/src/renderer/adapters/workbench-adapter.ts` 中的 `contextBridge` 文本，不在本批 Admin 修改范围。
- `pnpm run check`：FAIL，当前阻断为 `apps/desktop/src/renderer/adapters/settings-adapter.ts: rootRealPath must not enter Renderer/Preload safe views`，不在本批 Admin 修改范围。

上述失败未归因 Admin VS1 前端变更。Admin focused gates 已全部通过；workspace 全量门禁需对应 Desktop/Core 窗口收敛后复跑。

## P 级自检

- P0：0
- P1：0
- P2：0
- P3：1

P3-1：workspace 全量门禁存在非 Admin 范围的外部阻塞，需由对应 Desktop/Core 窗口清理后复跑。

## 独立 QA 与用户接受

- 独立 QA：Claude Code 报告结论为 `CODE_QA_PASS — USER_ACCEPTANCE_PENDING`，P0=0、P1=0、P2=0、P3=1；P3 为非
  Admin 范围外部 blocker，不附条件修订。
- 用户接受：用户于 2026-08-30 正式接受并关闭 ADMIN-MVP-VS1 Frontend 子批，确认该子批 `CODE_QA_PASS`。
- 边界：本关闭不代表联合 VS1 通过；AM1-B 后端与端到端 E2E 仍待完成，整体 VS1 不自动关闭。
