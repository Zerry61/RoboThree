# DFE-3B — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-16-2239-version-dfe-3b` |
| 验收对象 | DFE-3B：右侧 Dock、工作空间文件占位、成果预览（Text/Markdown 结构化 + HTML sandbox） |
| 日期 | 2026-08-16 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / Electron 43 / Vite 8 / Vue 3.5 |
| 开发版本 | Desktop `0.0.0-dfe.3b`；Core/Contracts `0.0.0-dfi.1a`；Root/Central `0.0.0-arh.3.3.3-repair.1`；Document Worker `0.0.0-pdt.2` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 179 files / 1220 tests + 3 smoke（独立复跑） |

DFE-3B focused（7 files / 25 tests）已含于 check。

---

## 二、重点核查项（DFE 计划 §DFE-3B 交付 + APV 安全边界）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | HTML 预览 sandbox iframe | ✅ `TasksListPage.vue` 仅 1 处 `<iframe :src="previewUrl" sandbox="" referrerpolicy="no-referrer" title="HTML 成果预览">`，完全沙箱 + 不泄漏 referrer |
| 2 | Text/Markdown 结构化渲染 | ✅ 预览复用 `presentArtifactPreview` 的 `blocks`，按 `heading/paragraph/list_item/code/table` 用 Vue 文本插值 `{{ block.text }}` 渲染，**无 `innerHTML` / `v-html`**（静态扫描零命中） |
| 3 | pathless Artifact API | ✅ `tasks-adapter.ts` 的 `previewArtifact/startArtifactHtmlPreview/closeArtifactPreview/setArtifactLifecycle/openArtifactLocation/exportArtifact` 均只传 `artifactId` + preview mode / lifecycle flags，无路径字段 |
| 4 | 工作空间文件树占位 | ✅ `工作空间文件` 视图为 `<R3InlineNotice tone="warning" title="等待受控文件浏览接入">` 固定占位，不读目录、不接收路径，未抢跑 DFI-1B |
| 5 | relativePath 使用安全 | ✅ 仅作为 Core 已投影的 safe metadata 用于展示/按钮可用性（经 `presentArtifact` presentation 层），不接收路径 authority |
| 6 | 边界无漂移 | ✅ 未新增 IPC/Contract/Core/Main/Preload/Central/Document Worker/依赖/lockfile；破坏性操作（delete source/record、restore、trash）零命中；DFI workspace-browser 标识在 Renderer/Shared/Preload/Main 零命中 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFE-3B 正确实现右侧 Dock 与成果预览：HTML 预览复用 loopback sandbox iframe（`sandbox=""` +
`referrerpolicy="no-referrer"`）、Text/Markdown 预览走结构化 blocks（Vue 文本插值、无 innerHTML）、
Artifact 操作走 pathless 高层 API（只传 artifactId）、工作空间文件树保持固定占位未抢跑 DFI-1B。
`CI=true pnpm run check` 179 files / 1220 tests + 3 smoke 独立复跑通过，无生产边界漂移。

**DFE-3B 可进入用户接受流程。DFE-4～DFE-6 与 DFI-1B～DFI-4 保持 GATED。**

— Claude Code（独立 QA，只读）
