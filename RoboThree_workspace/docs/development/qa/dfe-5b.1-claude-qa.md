# DFE-5B.1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-20-1012-version-dfe-5b.1` |
| 验收对象 | DFE-5B.1：知识中心基础体验（生产默认 Gated + Fixture 仅测试/开发） |
| 日期 | 2026-08-20 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 |
| 开发版本 | Desktop `0.0.0-dfe.5b.1`；Core/Contracts `0.0.0-dfi.2a.3`；Root/Central `0.0.0-arh.3.3.3-repair.1`；Document Worker `0.0.0-pdt.2` |

> 环境说明：独立复跑前按既有教训清除了 QA shell 的 `ELECTRON_RUN_AS_NODE=1`；Node 锁定 24.13.0。
> 本次 check 无 loopback EPERM（开发者的沙箱 loopback 限制未在我的环境复现）。

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | DFE-5B.1 focused（7 个 knowledge/router/design-system 测试） | **PASS 7 files / 31 tests** |
| 2 | `CI=true pnpm --filter @robothree/desktop build` | **PASS** |
| 3 | `CI=true pnpm run lint`（eslint + Architecture boundary） | **PASS**，`Architecture boundary checks passed` |
| 4 | `CI=true pnpm run audit:dtp4` | **PASS**，`DTP-4 packaging audit passed` |
| 5 | `CI=true pnpm run check`（完整） | **PASS 198 files / 1311 tests + 3 smoke 全绿** |

---

## 二、重点核查项（方案 §修订 4 项 + 边界零漂移）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 生产默认 `GatedKnowledgeAdapter` | ✅ [knowledge-adapter.ts](apps/desktop/src/renderer/adapters/knowledge-adapter.ts) `gatedKnowledgeAdapter` 返回 `state:"unconfigured_gated"` + `sources:[]`；页面 `inject(knowledgeAdapterKey, gatedKnowledgeAdapter)` 用其为默认；不调 `window.robothreeDesktop`、不 import Preload/IPC、不读 LocalStorage/文件 |
| 2 | 生产默认不展示 Fixture/搜索/详情/示例 | ✅ `presentKnowledgeCenter("unconfigured_gated")` 返回 `showSearch:false, showList:false`；页面 Gated 态渲染 `R3EmptyState`（「企业知识能力尚未配置」），无搜索框/列表/详情入口/示例结果卡片 |
| 3 | Fixture 仅测试/开发，持续标注 prototype/gated | ✅ `fixtureKnowledgeAdapter` 返回 `state:"ready"` + `knowledgeFixtureSources`，每个 source 与 sampleResult 均携带 `dataOrigin:"prototype"` + `capabilityState:"gated"`；页面卡片/详情持续展示「示例数据」「真实检索待接入」标签 |
| 4 | 状态语义冻结 | ✅ `Unconfigured/Gated` 为生产默认；`Empty/Unavailable/Permission denied/Partial` 仅 Fixture/Fake/组件测试（`presentKnowledgeCenter` 相关分支文案均明确「仅用于 Fixture 场景，不代表真实 Provider 状态」） |
| 5 | 安全 id 校验 + 不回显 route param | ✅ `isSafeKnowledgeId` 正则 `/^[a-z][a-z0-9-]{2,63}$/`；未匹配 id 走 `notFoundDetail`，不回显为知识源名称、不触发动态读取/Provider 请求/路径解析 |
| 6 | R3SearchField 补 accessibleLabel（optional） | ✅ [R3SearchField.vue](apps/desktop/src/renderer/components/ui/R3SearchField.vue) 新增 `accessibleLabel?: string`（默认 `"Search"`），`input` 绑定 `:aria-label`；**新增 optional prop，不改变现有默认行为**；`design-system-components.test.ts` 已补组件回归测试 |
| 7 | 安全与敏感信息 | ✅ 静态扫描零命中：knowledge 源码无 `window.robothreeDesktop`/`ipcRenderer`/`contextBridge`/`fetch`/LocalStorage/sessionStorage/indexedDB/`innerHTML`/`v-html`/providerEndpoint/workspaceRoot/rootRealPath/requestDigest/rawChunk/embedding/indexJob/syncJob；无真实检索成功语义（命中/召回/引用成功/已检索/同步完成/索引完成/上传成功） |
| 8 | 错误脱敏 | ✅ 页面 error 处理固定文案「知识中心暂不可用，请稍后重试。」，不 `JSON.stringify(error)`、不展示内部对象/Provider 响应/异常栈 |
| 9 | 边界零漂移 | ✅ 本批（Aug 20）仅改 `apps/desktop/src/renderer/**` + `apps/desktop/tests/**` + `apps/desktop/package.json`（版本 0.0.0-dfe.5b.1）；未改 Main/Preload/IPC/Contracts/Core/Central/SQLite migration/Document Worker；`pnpm-lock.yaml` 保持 Aug 16；未启动 DFI-2B/DFI-4A、未进入 DFE-6 |
| 10 | 测试断言真实性 | ✅ 7 个 focused 测试全部为真实断言（反查无空断言/恒真断言/`it.skip`/被注释）；覆盖 Gated 默认零条目、Fixture prototype/gated 标注、安全 id 拒绝、19 个敏感字段禁入、错误脱敏、aria-label、本地过滤 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFE-5B.1 正确完成「知识中心基础体验」：`#/knowledge` 与 `#/knowledge/:knowledgeId` 路由落地；生产默认
`GatedKnowledgeAdapter` 只返回 `unconfigured_gated` 与零知识条目，不展示 Fixture 列表、搜索框、详情入口
或示例结果；`FixtureKnowledgeAdapter` 仅测试/开发注入，每条数据持续标注 `dataOrigin=prototype` +
`capabilityState=gated`；`Unconfigured/Gated` 为生产默认，`Empty/Unavailable/Permission denied/Partial`
仅限 Fixture/Fake；`R3SearchField` 新增 optional `accessibleLabel`（向后兼容）并补组件回归测试；安全 id
校验 + 不回显 route param；无真实 Key/Credential/Token/workspace path/raw chunk/真实检索成功语义/HTML 注入。
五项门禁独立串行复跑全绿（focused 7/31、build、lint+boundary、audit:dtp4、完整 check 198/1311 + 3 smoke）。
边界零漂移：未改 Main/Preload/IPC/Contracts/Core/Central/SQLite migration/Document Worker/pnpm-lock.yaml，
未启动 DFI-2B/DFI-4A，未进入 DFE-6。

**DFE-5B.1 可进入用户接受流程。DFE-6 / DFI-2B / DFI-4A 保持 GATED。**

— Claude Code（独立 QA，只读）
