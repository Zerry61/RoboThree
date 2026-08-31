# DFI-4A.4.1 Authority / Helper Packaging / Read-only Safe API 实施报告

> 版本：`0.0.0-dfi.4a.4.1`  
> 日期：2026-08-28  
> 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 上游计划：[DFI-4A.4 Revision 2](./DFI-4A.4-REVISION-2-LOCAL-PERSONAL-MODEL-CRUD-CREDENTIAL-PACKAGING-DEVELOPMENT-PLAN.md)

## 1. 本批结论

DFI-4A.4.1 已完成 Personal Model 管理 authority、可验证 Helper packaging 基础和 Desktop 只读安全接口。
本批最高只声明：

```text
DFI4A41_AUTHORITY_HELPER_PACKAGING_READ_API_CONFORMANT
```

它不表示 CRUD、Credential Reveal、STRM-3、Renderer 个人模型页面、正式签名安装包或 Enterprise identity ready。

## 2. 已实现内容

### 2.1 管理 Authority

- 新增 Core-private `PersonalModelManagementAuthorityV2` strict readable union；
- `standalone_local_owner` 使用 code-owned local management policy，允许本机 owner 的管理语义，但不冒充企业
  `personal_model.configure` entitlement；
- `runtime_active_enterprise_identity` 只接受真实 enterprise authority；缺失时直接 unavailable，禁止回退本地身份；
- authority revision 使用独立 digest domain；namespace key 用完后清零；R2D Task entitlement 的管理权限仍保持
  false，不成为 CRUD/Reveal authority。

### 2.2 Helper Packaging 与 Trust Chain

- 新增无第三方依赖的 macOS Helper builder：编译 → Developer ID codesign → Team Identifier 核对 → 最终 digest →
  strict manifest；拒绝 ad-hoc signing；
- Helper 与 manifest 固定在 app Resources 的 `personal-credential-helper/`，运行时路径不读取 Renderer、env、argv
  或数据库；
- Main 只解析固定相对路径，拒绝 absolute escape、`..`、symlink 和非 regular file；
- Main 把 descriptor 交给 Core，Core 继续复用既有 containment、mode/owner、SHA-256、designated requirement 与
  Team Identifier 二次校验；
- 当前仓库没有正式 signing identity 生成的生产 Helper 资产，因此 Evidence 诚实记录
  `productionHelperAssetPresent=false`。应用和只读 Catalog 可运行，mutation/reveal 保持 unavailable。

### 2.3 Personal Model 只读安全接口

- 新增 exact package subpath：
  `@robothree/contracts/desktop-local/personal-model-management/v1alpha1`；
- Contract 只包含 Compatibility、List、Detail、safe projection/page/error envelope，不包含 create/update/delete/
  reveal；
- safe projection 只返回 display host、masked credential state、能力与状态摘要，不返回完整 Endpoint、Credential
  reference、owner/private digest、Helper path 或内部 binding；
- Core 新增 read service，复用既有 Personal Model persistence 与 Credential `inspect()`，不增加新表、查询语义或
  migration；
- 新增三条 exact Core private HTTP route、三条 Main IPC channel 与 frozen sandboxed Preload 三方法 API；
- Main router 固定 main-frame/webContents/client binding，限制 16 个 client binding，并在每次调用前重新验证
  runtime lease；navigation、renderer crash 与 window destroy 都会清理 binding；
- Renderer consumer count 仍为 0，本批没有修改任何 Renderer 页面或 Adapter。

## 3. 边界与诚实状态

| 项 | 结果 |
| --- | --- |
| Personal Model safe Catalog read | 已实现 |
| production signed Helper asset | `false` |
| sensitive transport / STRM-3 | `PASS/CLOSED / SENSITIVE_TRANSPORT_READY` |
| create/update/delete | `false / GATED` |
| Credential Reveal | `false / GATED` |
| Renderer Personal Model UI | `false / GATED` |
| Enterprise identity/entitlement | `false / deferred` |
| Admin v2 / TGM / Knowledge / Agent Lifecycle | `GATED` |
| migration | 仍止 26 |
| lockfile | `sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`，未变 |

父方案 120 项 QA 账本仍为 `retained_for_dfi4a4_stage_closure`，不能把本批 17 项 focused tests 解释为父阶段
已经全部执行。

## 4. 验证结果

环境：Node `v24.13.0`、pnpm `11.11.0`、JDK `21.0.12`。

| 门禁 | 结果 |
| --- | --- |
| `harness:dfi4a4.1` | PASS，4 files / 17 tests |
| exact Contract built subpath import | PASS |
| full TypeScript/Vitest | PASS，328 files / 2187 tests |
| Core/Desktop/Preload smoke | PASS / PASS / PASS |
| Central online | PASS，438/0/0/0 |
| Central offline | PASS，438/0/0/0 |
| typecheck | PASS |
| focused ESLint | PASS |
| `audit:dtp4` | PASS |
| full Architecture boundary | 被并行 Renderer 变更 `settings-adapter.ts` 中 `rootRealPath` 命中阻塞；本批未修改该文件 |

Evidence：[`artifacts/dfi4a41/evidence.json`](../../../artifacts/dfi4a41/evidence.json)，digest：
`sha256:69bdb4003e29c1bbe0d51b1dd987041c806babfea1b3ef6c1de282623c328750`。

## 5. 文件落点

- Contract：`packages/contracts/src/desktop-local/personal-model-management/v1alpha1/`；
- Core authority/read/API：`services/core/src/application/`、`services/core/src/adapters/http/` 与 Desktop runtime
  bootstrap；
- Helper packaging：`apps/desktop/scripts/build-personal-credential-helper.mjs`、
  `apps/desktop/src/main/personal-credential-helper-package.ts`；
- Main/Preload：`apps/desktop/src/main/personal-model-v1alpha1-ipc-router.ts`、shared API 与 Preload exposure；
- 测试/Harness/Evidence：4 个 focused test files、`scripts/run-dfi4a4.1-harness.mjs`、
  `artifacts/dfi4a41/evidence.json`。

## 6. 下一道门

独立 QA 结论 `PASS（P0=0 / P1=0 / P2=0 / P3=1）` 已由用户接受，DFI-4A.4.1 正式 `PASS/CLOSED`。
P3 仅保留为已收口的文档精度记录；历史 DFI-5.4.3 Harness/Evidence 保持只读，前端并行
`settings-adapter.ts rootRealPath` 不归因本批。后续 [STRM-3 详细方案](./STRM-3-SENSITIVE-TRANSPORT-PRODUCTION-ACTIVATION-UNBLOCK-AUDIT-DEVELOPMENT-PLAN.md)
已完成独立代码 QA、用户接受并正式 `PASS/CLOSED`。新增
[DFI-4A.4.2 CRUD / Reveal / Durable Recovery 详细方案](./DFI-4A.4.2-PERSONAL-MODEL-CRUD-CREDENTIAL-REVEAL-DURABLE-RECOVERY-DEVELOPMENT-PLAN.md)，
当前仅 `DOCUMENT REVIEW PENDING / CODING GATED`；DFI-4A.4.3 与 Renderer UI 继续 `GATED`。
