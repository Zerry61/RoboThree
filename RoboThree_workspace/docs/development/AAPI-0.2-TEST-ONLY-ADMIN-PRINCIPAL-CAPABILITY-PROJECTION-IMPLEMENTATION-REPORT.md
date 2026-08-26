# AAPI-0.2 Test-only Admin Principal / Capability Projection 实施报告

> 日期：2026-08-24  
> 状态：**IMPLEMENTED / DEVELOPER GATES PASS / INDEPENDENT QA PENDING**  
> 负责人：Codex 5.6  
> 授权：用户授权 AAPI-0.2 编码，允许触碰 `services/central-service/**` 中 Admin principal / capability projection 的 domain、application、configuration、test；允许补 `packages/contracts/tests/**` subpath export 自动断言  
> 版本：Root `0.0.0-aapi.0.2`

## 1. 实现范围

- 新增 Central-private Admin Control package：`com.robothree.central.admincontrol`；
- 新增 test-only 管理员 Principal provider，仅在 `development` / `test` profile 装配；
- 新增服务端 Capability Projection domain，固定表达 `testIdentityUsed=true` 与
  `productionIdentityReady=false`；
- 新增 provisional Admin capability key 集合与安全状态投影：read 能力为 `ready`，write/action 能力为
  `gated`；
- 新增 production graph guard：production profile 不装配 test-only provider/projection service，且出现任何
  Admin principal provider 时在 HTTP ready 前失败关闭；
- 补充 `@robothree/contracts/admin-control/v1alpha1` subpath export 自动解析断言，关闭 AAPI-0.1 的 P3 提醒。

## 2. 明确未实现

- 未接 HTTP runtime、Controller、Filter、AdminAdapter 或浏览器 Session；
- 未实现真实 SSO、OA、MDM、RBAC、组织、角色继承、group mapping 或 production Principal provider；
- 未修改 Admin 前端、Desktop、Core、Main、Preload、IPC、Renderer 或 migration；
- 未建立 Central Java mirror 的完整 Admin Control Contract family；
- 未实现模型、机器人、技能、工具、知识或系统管理 CRUD；
- 未伪造创建成功、保存成功、发布成功、安装成功、同步成功、测试连接成功或真实检索成功。

## 3. 文件边界

允许范围内新增/修改：

- `services/central-service/src/main/java/com/robothree/central/admincontrol/**`
- `services/central-service/src/test/java/com/robothree/central/admincontrol/**`
- `packages/contracts/tests/admin-control-v1alpha1-contracts.test.ts`
- root `package.json` 仅升级开发版本，无依赖变更
- `README.md`、`CHANGELOG.md`、`docs/development/DEVELOPMENT-LOG.md` 和本报告

禁止范围保持未修改：

- `apps/admin-console/**`
- `apps/desktop/**`
- `services/core/**`
- Electron Main、Preload、IPC、Renderer
- database migration
- root dependencies 与 `pnpm-lock.yaml`

## 4. 行为与安全结论

- test-only Principal 使用固定 sentinel id：`admintest_aapi02_fixed_sentinel`；
- Principal summary 和 Projection flag 必须一致；`testIdentityUsed=true` 与
  `productionIdentityReady=true` 的组合会失败关闭；
- Capability key 必须非空、唯一且字典序稳定；
- 所有 AAPI-0.2 capability source 均为 `test-only`，不得冒充 production；
- production profile 下不会 fallback 到 fake/test/development provider；
- projection、source 和测试覆盖均禁止 Secret、Token、Credential Reference、Endpoint、内部路径、stack、
  Prompt 或 Tool payload 进入展示/投影输出；
- 本批没有使用 OS user、浏览器输入、路由、菜单、LocalStorage、SessionStorage、cookie 或单条业务数据推断身份。

## 5. 开发者验证

| 命令 | 结果 |
| --- | --- |
| `CI=true pnpm --filter @robothree/contracts build` | PASS |
| `CI=true pnpm exec vitest run packages/contracts/tests/admin-control-v1alpha1-contracts.test.ts` | PASS；1 file / 7 tests |
| `CI=true pnpm run lint` | PASS；Architecture boundary checks passed |
| `JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./mvnw -q -Dtest=AdminCapabilityProjectionServiceTest,AdminCapabilityProjectionConfigurationTest,AdminControlBoundaryTest test` | PASS；3 classes / 13 tests |
| `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CI=true pnpm run check:central` | PASS；404 tests，0 failures，0 errors，0 skipped |
| `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CI=true pnpm run check:central:offline` | PASS；404 tests，0 failures，0 errors，0 skipped |
| `CI=true pnpm run check` | PASS；243 files / 1620 tests + 3 smoke，Architecture boundary PASS |

备注：

- 首次 sandbox `pnpm run check` 因本地端口、Keychain 和沙箱权限限制失败；同一命令在非沙箱正式环境复跑通过；
- Central online/offline 也需非沙箱执行，原因是测试需要 loopback 端口、JVM agent attach 和本机集成资源；
- `pnpm-lock.yaml` 未修改。

## 6. 当前结论

```text
AAPI02_TEST_ONLY_ADMIN_PRINCIPAL_CAPABILITY_PROJECTION_CONFORMANT
```

但以下仍保持关闭或 GATED：

- AAPI-0.3～0.4；
- Admin HTTP runtime；
- AdminAdapter / AFE consumption；
- production identity；
- true RBAC / enterprise SSO；
- TGM；
- Knowledge Provider；
- DFI-3A.2 Main/Preload Catalog 接线；
- Max/DFI-5。

AAPI-0.2 当前仅进入独立 QA 阶段，不得因开发者门禁通过自动标记 `PASS/CLOSED`。
