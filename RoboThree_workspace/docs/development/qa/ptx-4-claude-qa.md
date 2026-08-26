# PTX-4 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-1810-version-ptx.4` |
| 验收对象 | PTX-4：PPTX Visual Preview Spike |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0（非沙箱） |
| 开发版本 | Root/Desktop `0.0.0-ptx.4`；Contracts `0.0.0-dfi.5.2.1`；Core `0.0.0-dfi.5.2.2`（并发 DFI 推进） |
| 上游 | PTX-0~PTX-3 `PASS/CLOSED` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0，非沙箱）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | PTX-4 focused（6 files / 47 tests） | **PASS**（desktop-task-projection + ptx4 E2E + ipc-router + task-detail-model + tasks-adapter + tasks-list-page） |
| 2 | `pnpm run check`（root，**非沙箱复跑**） | **PASS 255 files / 1710 tests + 1 偶发**（dcf13c 稳定性 Harness，**单独复跑 PASS**，既有进程级资源竞争，非 PTX-4 缺陷） |
| 3 | `pnpm run audit:dtp4` | **FAIL**（见 §二 P1-1，版本基线跨窗口错位） |
| 4 | 边界：lockfile | 仍 `c47641ac…` 未变 |

关键：用户报告「46 failed」是**其 shell 的 loopback/Keychain 权限**；我的非沙箱环境完整 check 仅 1 个既有偶发
（dcf13c 单独跑 PASS），**本质全绿**——PTX-4 的「ROOT CHECK BLOCKED」状态在非沙箱环境不成立。

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | PPTX OOXML baseline preview | ✅ [pptx-html-preview.ts](apps/desktop/src/main/pptx-html-preview.ts) `inflateRawSync` 解 PPTX ZIP，验证 `[Content_Types].xml`+`ppt/presentation.xml`，提取 `ppt/slides/slide*.xml` 解析 `<a:t>` 文本/`<a:tbl>` 表格/`<c:chart>` 图表/`<a:blip>` 图片，生成 SVG slide cards，192KB 上限 |
| 2 | 沙箱预览 | ✅ 走 APV-1C 既有 127.0.0.1 sandbox HTML Preview；preview 源码无 `http/https/fetch/child_process/PowerPoint/LibreOffice` 依赖（SVG xmlns 除外） |
| 3 | 诚实标注 | ✅ HTML 明确「This local preview is generated from the PPTX OOXML structure in a sandbox. It is not a PowerPoint renderer, so exact layout may differ.」——不冒充真实渲染器 |
| 4 | Task Detail 标记 | ✅ `canPreviewHtml: available && (artifact.kind === "html" || pptx)`；PPTX `canPreviewHtml=true`、text preview 仍 unsupported |
| 5 | Core artifact source resolver | ✅ 从 locked Runtime Selection 恢复 workspace authority 路径 |
| 6 | 范围边界 | ✅ 未改 Central/Admin/Document Worker/migration/依赖；lockfile 未变 |

---

## 三、发现

### PTX-4 本批：P0 = 0，P1 = 0，P2 = 0，P3 = 0

### P1-1（跨窗口版本错位，非 PTX-4 本体缺陷，需裁决）：`audit:dtp4` 版本基线被 DFI-5.2.2 并行窗口打破

`scripts/audit-dtp4-packaging.mjs` 期望 `coreVersion = "0.0.0-ptx.4"`，但当前
`services/core/package.json` 为 `0.0.0-dfi.5.2.2`（DFI-5.2.2 并行编码窗口推进）。PTX-4 窗口已把
Root/Desktop 推进到 `0.0.0-ptx.4`、Contracts 保持 `0.0.0-dfi.5.2.1`，与 audit 基线一致；唯独 core 被
DFI-5.2.2 并行推进到 `0.0.0-dfi.5.2.2`，导致 audit:dtp4 期望不匹配。

这不是 PTX-4 实现的缺陷（preview 代码正确、focused 全绿、完整 check 基本全绿），而是**共享工作区两个并行
窗口同时推进 core 版本导致的 audit 基线冲突**。需裁决：等 DFI-5.2.2 收口后统一 audit 基线，或由任一窗口
明确版本协调顺序。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING（附跨窗口版本错位 P1-1，需裁决后收口）
P0 = 0，P1 = 1（audit 基线跨窗口错位），P2 = 0，P3 = 0
```

PTX-4 正确完成 PPTX Visual Preview Spike：OOXML baseline 解析（文本/表格/图表/图片 → SVG slide cards，
192KB 上限），走既有 127.0.0.1 sandbox HTML Preview，无外呼无 PowerPoint/LibreOffice 依赖，诚实标注「非
PowerPoint 渲染器，布局可能不同」；Task Detail 标记 `canPreviewHtml=true`/text unsupported；Core artifact
source resolver 从 locked Runtime Selection 恢复 workspace authority。PTX-4 focused 全绿（6/47），**我的
非沙箱完整 check 255/1710 + 1 既有偶发（dcf13c 单独 PASS）本质全绿**——用户报告的「46 failed」是其 shell
权限限制，非 PTX-4 缺陷。唯一待裁决项 P1-1：audit:dtp4 版本基线被 DFI-5.2.2 并行窗口推进的 core 版本打破，
需跨窗口统一版本协调后 audit 恢复 PASS。

**PTX-4 本批可进入用户接受流程；接受后 `tool.document.pptx.write` 的 PTX 线（PTX-0~PTX-4）完整收口。
DFI-5.2.3、DFI-5.3~5.4、AAPI-0.3~0.4、TGM、Knowledge Provider 继续 GATED。**

— Claude Code（独立 QA，只读）
