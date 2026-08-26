# DFE-6B Frontend Foundation Closeout Plan

> 状态：**PASS/CLOSED；DFE Frontend Experience Foundation PASS/CLOSED**  
> 日期：2026-08-21  
> 负责人：Codex 5.6  
> 范围：Desktop Renderer 五导航体验、状态矩阵、remaining Mock inventory 与 Frontend Foundation 收口方案  
> 非目标：不接新接口、不修改 Main/Preload/Core/Contracts/Central/SQLite migration；不关闭后端业务能力

## 1. 目标

DFE-6B 的目标是关闭 Desktop Frontend Experience Foundation，而不是关闭所有业务能力。

DFE-6B 方案冻结以下事项：

- 五个一级导航的最终视觉、键盘、焦点、ARIA 与窗口尺寸验收；
- Loading / Empty / Error / Disabled / Permission denied / Unavailable / Partial 状态矩阵；
- remaining Mock / Prototype / GATED inventory 的最终盘点、保留原因和删除门槛；
- 已被真实接口替换的 Mock 删除原则；
- `LegacyWorkbench.ts` 的隐藏、保留或删除决策门槛；
- DFE-6B 编码范围、测试矩阵、视觉截图基线和共享文件收口窗口。

DFE-6B 完成后只能声明：

```text
Frontend Experience Foundation PASS/CLOSED
```

不得声明以下能力完成：

- DFI-2B、DFI-3、DFI-4A.2～4A.4；
- Personal Model / Credential 全链路；
- Knowledge Provider / 真实检索；
- Agent / Skill 创建、测试、发布；
- TGM Tool 管理；
- OS Sandbox；
- formal installer / production package。

## 2. 页面与交互范围

### 2.1 一级导航范围

| 一级导航 | 路由 | 本批目标 |
| --- | --- | --- |
| 工作台 | `#/` | 验证真实 composer、选择器、recent 区块、GATED 授权说明的最终视觉与键盘顺序 |
| 任务 | `#/tasks` | 验证任务列表、详情、Artifact、工作空间文件树、确认卡片和控制按钮的一致状态 |
| 智能中心 | `#/intelligence` 及详情/创建路由 | 保持真实 agent summary 与 Mock skills/tools/creation 的清晰区分 |
| 知识中心 | `#/knowledge`、`#/knowledge/:knowledgeId` | 保持生产默认 gated/unconfigured，不展示 fixture 列表或真实检索成功 |
| 设置 | `#/settings/**` | 验证模型管理真实只读区和四个 GATED 二级页面共享导航、布局和禁用原因 |

### 2.2 本批不做

- 不新增 Contract、IPC、Preload API、Core service、Central API 或 SQLite migration；
- 不接 DFI-2B、DFI-3、DFI-4A.2～4A.4 的未来 Projection；
- 不接 TGM Tool catalog；
- 不接 Knowledge Provider；
- 不实现 Personal Model CRUD、Credential 输入、Key reveal 或默认模型保存；
- 不实现 Agent/Skill 真实保存、运行测试、发布或上传；
- 不把 Mock/Prototype/GATED 文案改写成真实业务成功；
- 不使用 LocalStorage 或本地数组冒充业务持久化。

## 3. 复用与新增组件清单

### 3.1 复用组件

- `DesktopShell.vue`
- `R3PageHeader`
- `R3Card`
- `R3InlineNotice`
- `R3EmptyState`
- `R3Skeleton`
- `R3StatusBadge`
- `R3Tag`
- `R3Button`
- `R3IconButton`
- `R3SearchField`
- `R3Select`
- `R3Modal`
- `SettingsSectionLayout.vue`
- `SettingsSectionNav.vue`
- `SettingsCapabilityGatePage.vue`

### 3.2 可新增的 Renderer-only 辅助模块

编码授权后，可在 `apps/desktop/src/renderer/**` 中新增纯展示/测试辅助模块：

- `pages/*/*-state-fixtures.ts`：仅供测试或 dev visual scenario 使用，生产默认不得 fallback 到 fixture；
- `presentation/frontend-closeout-presentation.ts`：状态文案、可访问性标签和 visual checklist 的纯函数；
- `app/route-closeout-model.ts`：生产 route inventory 与 stable route order 的纯函数。

不得新增：

- Main / Preload / IPC adapter；
- Core/Contract/Central 类型；
- 文件系统、网络、Credential 或 Provider 调用；
- 任何持久化层。

## 4. 数据源与 Mock 边界

| 区域 | 当前真实 Projection/API | Remaining Mock / GATED | DFE-6B 处理 |
| --- | --- | --- | --- |
| Workbench | `listWorkspaceGrants/listSessions/listAgents/listModels/listTasks/listArtifacts/submitTurn` | 授权三模式只读待接入说明；Knowledge 选择无真实 Provider | 保留 GATED 说明，验证不能选择未接入授权模式 |
| Tasks | `listSessions/listTasks/openSession/renameSession/deleteSession/controlTask/conversation_snapshot/task_detail/artifact_*` | 置顶为本次视图状态；持久置顶未定义 | 保留“本次视图置顶”说明，验证失败不写本地持久化 |
| Task workspace files | DFI-1B `v1alpha2` sidecar 已由 DFE-6A 接入 | 文件内容 read/edit、file-level open/reveal 继续禁止 | 验证固定占位已删除；feature missing 显示 Unavailable |
| Intelligence agents | `listAgents/listModels` | 机器人创建/头像上传/发布/统计 GATED | 保留明确 GATED 标识，不显示假保存成功 |
| Intelligence skills | 无真实 skill catalog | 静态 Mock skills | 保留 Prototype/GATED 标识；删除任何“已安装成功/测试通过”假事实 |
| Intelligence tools | 无 TGM catalog | 静态 Mock tools | 标记等待 TGM；`artifact.preview` 继续作为应用能力，不冒充模型 Tool |
| Knowledge | 生产默认 `GatedKnowledgeAdapter` | Fixture 仅测试/dev | 生产默认不显示搜索、详情入口或示例结果 |
| Settings models | `listModels` 粗粒度 projection | personal model CRUD/Key/default/effective model GATED | 真实行只用 `name/source/available/unavailableReason`，不伪装 provider model id |
| Settings P1 pages | 无真实 Adapter | `static_product_copy` gated pages | 保留禁用原因和未来依赖，不提供业务操作入口 |
| Design system | dev/test only | fixtures | 确保生产 route table 不包含 `#/__design-system` |
| Legacy wrapper | 旧真实 UI wrapper | 迁移兜底 | DFE-6B 编码前必须明确保留、隐藏或删除策略 |

## 5. 页面状态矩阵

| 页面组 | Loading | Empty | Error | Disabled | Permission denied | Unavailable | Partial |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Workbench | selector/sessions loading | no workspace/no recent item | adapter safe summary | submit disabled reasons | workspace grant denied | model unavailable | recent data partial |
| Tasks list | sessions/tasks loading | no tasks/filtered empty | adapter safe summary | delete/cancel disabled | not owner/authority absent if projected | API unavailable | sessions or tasks partial |
| Task detail | snapshot/detail loading | no messages/artifacts/files | control/preview safe summary | unavailable controls | confirmation/action denied if projected | artifact/workspace feature unavailable | preview/workspace partial |
| Intelligence | agents/models loading | filtered empty | adapter safe summary | create actions gated | fixture only | fixture only | fixture only |
| Knowledge | production gated has no fake loading | fixture empty only | fixture error only | no real actions | fixture only | gated/unconfigured | fixture only |
| Settings models | listModels loading | no enterprise/platform model | adapter safe summary | personal actions disabled | fixture only | coarse unavailableReason | not supported |
| Settings gated pages | not applicable in prod | static no data | not applicable | all business actions disabled | not real | capability gated | not real |

Rules:

- Production pages must not randomize fake `Permission denied`, `Unavailable`, `Error` or `Partial` states through query flags.
- Fixture states may be used in tests and dev visual scenarios only.
- Error rendering must use fixed safe summaries; never `JSON.stringify(error)`, stack traces or raw provider/Core payloads.
- Disabled controls need persistent visible reasons; do not rely only on hover tooltip.

## 6. Visual, Keyboard And Accessibility Acceptance

### 6.1 Window sizes

Formal acceptance sizes:

- `1180 x 760`
- `900 x 600`

Diagnostic-only size:

- `680 x 560`

`680 x 560` is used to catch regressions but is not an MVP supported window-size commitment.

### 6.2 Five-navigation checklist

| Area | Visual | Keyboard/focus | Accessibility |
| --- | --- | --- | --- |
| Shell/nav | selected nav obvious without color alone | Tab starts at app chrome/navigation and reaches page content | nav has clear label/current page |
| Workbench | dense but readable composer/selection/recent layout | selectors and submit reachable in order | disabled submit exposes reason |
| Tasks | list/detail split stable at 1180 and 900 widths | task row, filters, detail actions reachable | selected task has non-color state |
| Intelligence | agents/skills/tools distinguish real vs gated | cards, filters, details and back navigation reachable | GATED labels have readable names |
| Knowledge | production gated state does not look like empty success | no hidden fake search in gated default | page heading and notice available |
| Settings | second-level RouterLink nav consistent | `aria-current=page`, focus ring visible | disabled business actions have persistent reasons |

### 6.3 UI rules

- No horizontal overflow at `1180 x 760` or `900 x 600`;
- long model/tool/knowledge names wrap without overlapping controls;
- no nested cards unless rendering repeated items inside a bounded panel;
- status colors are not the only signal;
- skeleton/loading states do not resize the main layout dramatically;
- destructive actions keep existing confirmation semantics and do not add new destructive capabilities.

## 7. LegacyWorkbench Decision

DFE-6B coding must choose exactly one:

| Option | Meaning | Allowed if |
| --- | --- | --- |
| Hide from production navigation | Keep `#/legacy` as a maintenance/debug route but remove visible nav entry | Current Vue pages cover all user-facing P0 flows; QA still needs fallback route |
| Keep hidden maintenance entry | Keep route and document why | Some old flow is still unmatched but should not be primary UX |
| Delete wrapper | Remove `LegacyWorkbench.ts` and route | Route inventory proves no remaining user-facing dependency and tests cover replacement |

DFE-6B may not silently delete Legacy if any of these are unresolved:

- route coverage is incomplete;
- old flow still owns a production-only feature;
- QA needs it to diagnose migration regressions;
- deleting it would require Main/Preload/Core changes.

## 8. File Modification Scope

DFE-6B future coding may modify only:

- `apps/desktop/src/renderer/**`
- `apps/desktop/tests/**`

After Renderer code and tests freeze, an exclusive shared-file closeout window may update:

- `apps/desktop/package.json`
- `CHANGELOG.md`
- `docs/development/DEVELOPMENT-LOG.md`
- `README.md`
- `docs/development/frontend/**`

DFE-6B must not modify:

- `apps/desktop/src/main/**`
- `apps/desktop/src/preload/**`
- IPC definitions
- `packages/**`
- `services/**`
- `contracts/**`
- SQLite migrations
- root `package.json`
- root `tsconfig.json`
- `pnpm-lock.yaml`

## 9. Safety And Sensitive Information Checks

Static scans and tests must prove Renderer output does not include:

- `workspaceRoot`
- `rootRealPath`
- `selectedPath`
- full local file path
- WorkspaceGrant authority
- HMAC proof material
- `requestDigest`
- `credentialReference`
- API key or token value
- provider endpoint
- raw chunk / embedding / vector / observation payload
- stack trace or raw internal error object

Allowed product copy may mention words such as `API Key`, `Token`, `Credential`, `权限` or `身份`.
The scan must distinguish product copy from real secret-shaped values.

Forbidden runtime patterns:

- direct `window.robothreeDesktop*` calls inside pages;
- `ipcRenderer`, `fs`, `child_process`, `net`, `tls`, `http`, `https`, `sqlite` in Renderer;
- `localStorage` or local arrays as business persistence;
- `innerHTML`, `v-html`, `eval`, `new Function`;
- unmarked Mock fallback after real API failure.

## 10. Test And Visual Acceptance Plan

Focused tests:

- router stable route order, navKey and production route names;
- page-level state matrix for all five primary navs;
- DFE-6A workspace files regression: feature missing, stale cursor, symlink, reveal taskId-only;
- Settings nav and gated pages regression;
- Intelligence real/Mock separation;
- Knowledge production gated default and fixture-only search/detail;
- Workbench disabled reasons and authorization GATED copy;
- artifact preview pathless APIs and no sensitive DOM output;
- Legacy decision test based on chosen option.

Static boundary tests:

- no forbidden system modules in Renderer;
- no direct window Desktop API calls in page components;
- no sensitive field names or secret-shaped values in serialized DOM/snapshots;
- no unmarked fake success phrases for save, upload, sync, index, install, publish, provider connection or credential storage.

Visual/manual acceptance:

- capture or inspect `1180 x 760` and `900 x 600` for five primary navs;
- run `680 x 560` as diagnostic only;
- verify keyboard-only traversal for nav, filters, lists, detail panels and modals;
- verify focus restoration after modal close and route changes where applicable;
- verify no content overlap or horizontal scroll in official sizes.

Expected validation commands after future coding:

```sh
CI=true pnpm --filter @robothree/desktop build
CI=true pnpm exec vitest run apps/desktop/tests
CI=true pnpm run lint
CI=true pnpm run check
```

Central online/offline is not expected to change for DFE-6B, but independent QA may rerun it if shared boundaries are suspected.

## 11. Remaining Blockers Outside DFE-6B

DFE-6B cannot remove these GATED states:

- DFI-2B authorization policy/effective mode Projection;
- DFI-3 recovery/task-loop Projection changes;
- DFI-4A.2～4A.4 Personal Model/Credential/Provider/default model Projection;
- Knowledge Provider Feature Spec and real query Projection;
- Agent/Skill creation/publish/test Feature Spec and persistence;
- TGM Tool catalog/policy/health Projection;
- formal installer and OS Sandbox.

If coding uncovers any need for those capabilities, DFE-6B must stop that sub-area and request a separate plan/authorization.

## 12. Engineering Estimate

Estimated effort after coding authorization:

- route and state inventory tests: 0.5～0.75 day;
- five-navigation visual/keyboard pass: 0.75～1.25 days;
- remaining Mock inventory cleanup and labels: 0.5～1 day;
- Legacy decision implementation and regression: 0.5～1 day;
- full build/lint/check, screenshots and shared closeout: 0.5～0.75 day.

Total: **2.75～4.75 concentrated engineering days**.

This estimate excludes independent QA, user onsite acceptance, backend DFI/TGM work and product-spec rework.

## 13. Current State

```text
DFE-6A: PASS/CLOSED
DFE-6B: PASS/CLOSED
DFE-6: PASS/CLOSED
DFI-2B / DFI-3 / DFI-4A.2～4A.4: GATED
TGM-1+: GATED
```

DFE-6B coding, independent QA and user acceptance are complete. This closes only the Desktop
Frontend Experience Foundation. It does not unlock DFI, TGM, Personal Model/Credential, Knowledge
Provider, Agent/Skill creation, OS Sandbox or formal installer work.
