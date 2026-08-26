# PTX-2 Repair — Claude Code 独立复测报告（P1 回归修复验证）

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-1420-version-ptx.2-repair` |
| 验收对象 | PTX-2 Tool Activation — P1 回归修复复测 |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读复测） |
| 上游 | [ptx-2-claude-qa.md](./ptx-2-claude-qa.md)（首轮 RED，P1 未解决） |
| 修复声明 | 根因 = PPTX 模型可见 schema 过大 → catalog 膨胀 → `context.current_turn_too_large` → E2E 停在 user-only |

---

## 一、修复核实

| 修复项 | 核实 |
|---|---|
| PPTX 模型 schema 收敛 compact | ✅ [pptxWriteToolInputSchema](services/core/src/registry/document-tool-registry.ts) `presentation: PPTX_PRESENTATION_SCHEMA`，后者只含 `required:["title","slides"]` + 一段描述，**不再内联完整五元素 schema**；严格 PresentationSpecV1 校验留在 Worker 私有解析链路（`normalizePresentation` 全量校验不删） |
| target_exists 文案分流 | ✅ `payload.kind === "pptx_write" ? "PPTX target already exists" : "XLSX target already exists"`——PPTX 接入不再污染既有 XLSX create-new 失败文案 |

## 二、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | PTX focused（6 files / 46 tests） | **PASS 7 files / 49 tests**（含 pptx tests 计入） |
| 2 | **dwe3 + dtp3b 单独复跑（P1 根因直接验证）** | **PASS 2 files / 7 tests**——上一轮稳定失败的 Document Tool Desktop E2E 全过 |
| 3 | `CI=true pnpm run check`（非沙箱） | **PASS 251 files / 1678 tests + 3 smoke + Architecture boundary** |
| 4 | `pnpm run audit:dtp4` | **PASS** |
| 5 | 边界：Contracts/Desktop/Central/Admin 对 `tool.document.pptx.write`/`PresentationSpecV1`/`pptxgenjs` | **零命中** |
| 6 | `pnpm-lock.yaml` | 仍 `c47641ac…`（未变） |

---

## 三、发现

### P0 = 0，P1 = 0（首轮 P1 已关闭），P2 = 0，P3 = 0

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING（复测）
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

PTX-2 P1 回归已正确修复：根因确认（PPTX 模型 schema 过大导致 Agent catalog 膨胀 → `current_turn_too_large`
→ E2E 停在 user-only 轮次），修复方式正确（模型可见 schema 收敛为 compact 引用，严格 PresentationSpecV1
校验保留在 Worker 私有解析链路，不放松安全）；target_exists 文案按 XLSX/PPTX 分流，不污染既有语义。**首轮
稳定失败的 dwe3/dtp3b 单独复跑全绿**，完整 check 非沙箱 251/1678 + 3 smoke 全绿，边界零命中。

**PTX-2 可进入用户接受流程；接受后 PTX-3（Desktop E2E）、PTX-4（Visual Preview）仍 GATED，需单独授权。**

— Claude Code（独立 QA，只读复测）
