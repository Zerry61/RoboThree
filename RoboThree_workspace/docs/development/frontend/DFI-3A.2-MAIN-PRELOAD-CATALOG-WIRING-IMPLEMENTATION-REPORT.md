# DFI-3A.2 Main / Preload Catalog 接线实施报告

日期：2026-08-25  
负责人：Codex 5.6  
状态：PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED；DFI-3A PASS/CLOSED  
版本：Root / Contracts / Core / Desktop `0.0.0-dfi.3a.2`

## 1. 范围

本批按 Revision 1 授权实现 Desktop Local `v1alpha2` Robot / Tool Catalog 的 Main / Preload 接线：

- 新增 dedicated `robot_tool_catalog` compatibility feature；
- 新增四条 Core private HTTP Catalog route；
- 新增四个 `CorePrivateClient` typed method；
- 新增四个 Main IPC channel 与四个 sandboxed Preload API；
- Main `DesktopV1Alpha2IpcRouter` 使用 runtime connection lease，compatibility 与业务查询不跨 runtime 拼接；
- Catalog caller binding 绑定 `webContents` / main frame / navigation epoch，容量上限 16，mismatch 在 Core 调用前失败关闭；
- Catalog response 返回前 revalidate 当前 runtime lease，旧 runtime 晚到响应返回 `catalog.runtime_changed`；
- 新增 focused tests 与 process E2E，覆盖 Contract feature、HTTP route/request limit、Preload strict parsing、caller binding、capacity fail-closed、runtime mismatch/revalidation 和 Main -> Core child process 链路。

## 2. 边界

- 未修改 Renderer、Admin、Central 源码、migration、新依赖或 `pnpm-lock.yaml`；
- 未接 Renderer 消费，不新增 UI、导航、业务交互或 Admin API；
- 未建立 Central Java mirror；
- 未改变 DFI-3A.1 Catalog sort、queryRevision、cursor codec、availability 或 projection 算法；
- `pnpm-lock.yaml` digest 保持 `b7c6d0a7906001ef503a3c0365663153265aa601103779eeacbd10d1a7f5ade5`。

## 3. 修改文件清单

- `package.json`
- `packages/contracts/package.json`
- `packages/contracts/src/desktop-local/v1alpha2/control.ts`
- `packages/contracts/tests/desktop-local-v1alpha2-catalog-contracts.test.ts`
- `services/core/package.json`
- `services/core/src/application/desktop-application-facade.ts`
- `services/core/src/bootstrap/create-desktop-private-runtime.ts`
- `services/core/src/adapters/http/core-private-http-server.ts`
- `services/core/tests/core-private-http-v1alpha2.test.ts`
- `apps/desktop/package.json`
- `apps/desktop/src/shared/foundation-api.ts`
- `apps/desktop/src/main/core-private-client.ts`
- `apps/desktop/src/main/core-private-supervisor.ts`
- `apps/desktop/src/main/desktop-v1alpha2-ipc-router.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/preload-smoke.ts`
- `apps/desktop/src/preload/create-desktop-api.ts`
- `apps/desktop/tests/create-desktop-api-v1alpha2.test.ts`
- `apps/desktop/tests/desktop-v1alpha2-ipc-router.test.ts`
- `apps/desktop/tests/dfi3a2-catalog-process.e2e.test.ts`
- `scripts/audit-dtp4-packaging.mjs`
- `scripts/audit-dtp4-packaging.test.mjs`
- `CHANGELOG.md`
- `README.md`
- `docs/development/DEVELOPMENT-LOG.md`
- `docs/development/frontend/DFI-3A.2-MAIN-PRELOAD-CATALOG-WIRING-IMPLEMENTATION-REPORT.md`

## 4. 验证结果

Node：`24.13.0`  
JDK：`/opt/homebrew/opt/openjdk@21`, OpenJDK `21.0.12`

- `CI=true pnpm run harness:dfi3a.2`：PASS，6 files / 28 tests；
- `CI=true pnpm --filter @robothree/contracts build`：PASS；
- `CI=true pnpm --filter @robothree/core build`：PASS；
- `CI=true pnpm --filter @robothree/desktop build`：PASS；
- `CI=true pnpm exec vitest run packages/contracts/tests/desktop-local-v1alpha2-catalog-contracts.test.ts`：PASS，1 file / 5 tests；
- `CI=true pnpm exec vitest run services/core/tests/catalog-query-service.test.ts services/core/tests/core-private-http-v1alpha2.test.ts`：PASS，2 files / 10 tests；
- `CI=true pnpm exec vitest run apps/desktop/tests`：PASS，58 files / 233 tests；
- `CI=true pnpm run lint`：PASS，Architecture boundary checks passed；
- `CI=true pnpm run audit:dtp4`：PASS；
- `CI=true pnpm install --frozen-lockfile`：PASS；
- `CI=true pnpm run check`：PASS，244 files / 1630 tests + Core/Desktop/Preload smoke PASS；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CI=true pnpm run check:central`：PASS，404 tests / BUILD SUCCESS；
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CI=true pnpm run check:central:offline`：PASS，404 tests / BUILD SUCCESS。

说明：

- Core private HTTP、Desktop process E2E、root check 和 Central 门禁均在非沙箱环境复跑通过；受限沙箱会拦截 loopback、Spring Boot random port 或 Docker/Testcontainers socket；
- 一次并行执行 package build 时触发 pnpm dependency preparation 竞争，部分并行命令因 registry DNS 失败；随后使用串行 `CI=true pnpm install --frozen-lockfile --offline` 恢复，并按 §9 逐条串行复跑通过；
- `pnpm-lock.yaml` 未修改。

## 5. 自检

- P0：0
- P1：0
- P2：0
- P3：0

## 6. 独立 QA 与用户接受

- 独立 QA：PASS（P0=0、P1=0、P2=0、P3=1，不阻断）；
- P3：方案 §5.2 C1～C10 进程级 barrier 矩阵未完整落地，但 runtime lease、caller binding、cursor/restart 语义已由 focused、Core 和 process E2E 覆盖；
- 用户已正式接受并关闭 DFI-3A.2；
- DFI-3A 阶段整体 `PASS/CLOSED`；
- Renderer 消费、AdminAdapter/AFE consumption、AAPI-0.3～0.4、TGM、Knowledge Provider、production identity、Max/DFI-5 继续 GATED。
