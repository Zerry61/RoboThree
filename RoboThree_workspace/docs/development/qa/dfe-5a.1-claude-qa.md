# DFE-5A.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-19-2006-version-dfe-5a.1` |
| 验收对象 | DFE-5A.1：设置—模型管理基础体验（只读真实 Projection + 个人模型 GATED） |
| 日期 | 2026-08-19 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 |
| 开发版本 | Desktop `0.0.0-dfe.5a.1`；Core/Contracts `0.0.0-dfi.2a.3`；Root/Central `0.0.0-arh.3.3.3-repair.1`；Document Worker `0.0.0-pdt.2` |

> 环境说明：独立复跑前按上次教训清除了 QA shell 的 `ELECTRON_RUN_AS_NODE=1`（该变量会使 electron 以
> Node 模式运行、导致 preload smoke 误报）；Node 锁定 24.13.0。本次 check 无 loopback EPERM。

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFE-5A.1 focused（5 个 settings/router 测试文件） | **PASS 5 files / 16 tests** |
| 2 | `CI=true pnpm --filter @robothree/desktop build` | **PASS**（`SettingsModelPage` 产物正常生成） |
| 3 | `CI=true pnpm run lint`（eslint + Architecture boundary） | **PASS**，`Architecture boundary checks passed` |
| 4 | `CI=true pnpm run audit:dtp4` | **PASS**，`DTP-4 packaging audit passed` |
| 5 | `CI=true pnpm run check`（完整） | **PASS 194 files / 1294 tests + 3 smoke 全绿** |

---

## 二、重点核查项（方案 §1–§9 逐项 + 边界零漂移）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 路由 `/settings` → `/settings/models` | ✅ [router.ts](apps/desktop/src/renderer/app/router.ts) `redirect: "/settings/models"`，`/settings/models` 指向 `SettingsModelPage.vue`；无其他设置子页假路由 |
| 2 | SettingsAdapter 只包装 `listModels()` | ✅ [settings-adapter.ts](apps/desktop/src/renderer/adapters/settings-adapter.ts) 只经 `getDesktopApi().listModels({type:"list_models"})`；页面经 `inject(settingsAdapterKey, desktopSettingsAdapter)`，不直接调 `window.robothreeDesktop` |
| 3 | name 只作显示名，不伪装 Provider 标识 | ✅ `presentModelRow` 的 `displayName = model.name`，`modelId` 独立；`modelIdentifierExplanation()` 明确「不能用显示名称伪装 Provider 标识」；测试断言 `JSON.stringify(row)` 不含「模型标识」 |
| 4 | source 三值展示规则 | ✅ `enterprise→企业模型`、`personal→个人模型`（只读）、`official→平台基线模型`（不静默并入企业）；`presentModelManagement` 分区不混排 |
| 5 | 真实状态只映射 available/unavailableReason | ✅ `presentModelRow` 仅 `available ? 可用 : 不可用` + `unavailableReason`；八种详细状态 `presentDetailedModelStatus` 只进 Fixture/ViewModel，生产行不引用 |
| 6 | 个人模型区 GATED，无假录入 | ✅ `personalGate` 持续展示「待接入」+「不接收真实 API Key，不声明保存/删除/设默认结果」；禁用按钮（添加/查看 Key/设为默认/删除）原生 disabled + 旁边「禁用原因」持续可见；测试断言 `find("input").exists() === false`（无假录入表单） |
| 7 | 安全与敏感信息 | ✅ 静态扫描零命中：renderer 无真实 Key 形态 / LocalStorage / sessionStorage / indexedDB / fetch / ipcRenderer / contextBridge / innerHTML / workspaceRoot / rootRealPath；伪成功文案（保存成功/删除成功/已设为默认/Key 已查看）零命中 |
| 8 | 可访问性 | ✅ 原生 disabled + 待接入 R3Tag 持续可见 + R3InlineNotice 说明，不依赖 hover tooltip；未改公共 R3 组件 |
| 9 | 边界零漂移 | ✅ DFE-5A.1（mtime Aug 19 17:03+）仅改 `apps/desktop/src/renderer/**` + `apps/desktop/tests/**` + `apps/desktop/package.json`（版本 0.0.0-dfe.5a.1）；Main/Preload（Aug 18 21:00 = DFE-4B-repair.1）与 Core/Contracts（Aug 18 20:09 = DFI-2A.3）未被本批触碰；`pnpm-lock.yaml` 保持 Aug 16 |
| 10 | 测试断言真实性 | ✅ 5 个 focused 测试全部为真实断言（反查无空断言/恒真断言/`it.skip`/被注释）；覆盖路由 redirect、adapter 只经 listModels、name 显示名、official 分区、八状态 Fixture、empty/gated 文案、无测试连接、无伪成功、无 input、错误不泄露敏感字段 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFE-5A.1 正确完成「设置—模型管理基础体验」：`/settings` 固定重定向 `/settings/models`；SettingsAdapter
只包装现有 `listModels()`（无新增 IPC/Contract/Core 状态）；真实 ModelProjection 只读展示，`name` 仅作
显示名、`source=official` 统一展示「平台基线模型」且不并入企业模型；真实状态只映射粗粒度
available/unavailableReason，八种详细状态仅进 Fixture/ViewModel；个人模型区持续「待接入」，无真实 API
Key、无测试连接、无伪造保存/删除/设默认/查看 Key 成功，无假录入表单。五项门禁独立串行复跑全绿
（focused 5/16、build、lint+boundary、audit:dtp4、完整 check 194/1294 + 3 smoke）。边界零漂移：
未改 Main/Preload/IPC/Contracts/Core/Central/SQLite migration/Document Worker/pnpm-lock.yaml，未进入
DFI-2A.3/DFI-2B/DFI-4A。

**DFE-5A.1 可进入用户接受流程。DFE-5A.1 后续（真实个人模型 CRUD / Credential 链路）仍 GATED。**

— Claude Code（独立 QA，只读）
