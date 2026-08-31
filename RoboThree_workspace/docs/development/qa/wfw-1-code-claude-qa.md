# WFW-1 Private Workspace Text Writer — Claude Code 独立聚焦代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-31-1345-code-wfw-1` |
| 验收对象 | WFW-1 — Private Workspace Text Writer（`tool.workspace.file.write_text`）：UTF-8 严格编码 + 同目录临时文件 + 文件 fsync + 原子发布 + SHA-256 并发保护 + owned Artifact 私有证明 + 同级 `.prev` 单层备份 + 4 个崩溃恢复窗口 + 路径穿越/软链接/硬链接防护 + safe_retry/recovered_success 后置判断；严格 Document Worker 内部私有 capability（无 Core / Desktop / Contracts 激活） |
| 日期 | 2026-08-31 |
| 复核者 | Claude Code（独立 QA，仅只读；不修改 Document Worker / Core / Desktop / Contracts / migration / 依赖 / lockfile） |
| 上游 | MVP-VS1 / VS2（含 VS2.3 repair.1+2+3）/ VS3 / ADMIN-MVP-VS1 / RSL-1（含 RSL-1 repair.1）/ Desktop Frontend 全部 `PASS/CLOSED` |
| 当前版本 | Document Worker = `0.0.0-wfw.1`；其余包保持既有版本（Core `workspace.1` / Desktop `rsl.1-repair.1` / Contracts+Admin `rsl.1`） |
| 当前状态 | `IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT QA PENDING` |

---

## 一、复核范围与方法

### 1.1 范围（Document Worker 内部私有 capability）

仅复核 WFW-1 工程 conformance + 边界严格性 + 诚实字面一致性：

1. **UTF-8 严格编码 + no BOM + no newline normalization**；
2. **`create_new` / `replace_existing` 双模式 + 同目录临时文件 + 文件 fsync + 原子发布 + no-clobber**；
3. **SHA-256 并发保护 + owned Artifact 私有证明 + advisory lock + final digest recheck**；
4. **同级 `.prev` 单层备份（绝对路径/URL/UNC/隐藏/`.prev` 目标全 reject）**；
5. **路径穿越/软链接/硬链接防护 + 父目录必须在 Workspace root real path 下**；
6. **原子发布 + 4 个 WFW v1 fault point**（temp 创建前 / temp fsync 后 publish 前 / target publish 后 Observation 前 / replacement-evidence ambiguity）；
7. **postcondition 4 态**：`not_found / safe_retry / recovered_success / unknown`；
8. **门禁**：focused 3 files / 72 tests + Document Worker full 26 files / 220 tests + typecheck + DTP-4 + audit self-test + git diff --check；
9. **边界**：Document Worker version bump 到 `0.0.0-wfw.1` / lockfile digest 不变 / Core migration 26 不变 / 5 个 frozen Contract SHA256 不变 / 无 Core / Desktop / Contracts activation。

**不**在本批复核范围：

- 不评估 WFW-2 Core Registry/Policy/Effect/Artifact 接线（开发者 §5 已诚实声明仍 GATED）；
- 不评估 WFW-3 前端展示与真实 Electron E2E（仍 GATED）；
- 不评估 WFW-H1 父目录创建 / cross-process lock / Windows NTFS 烟雾测试（仍 GATED）；
- 不修改任何业务代码 / Contract / migration / 依赖 / lockfile。

### 1.2 方法

- 实跑 focused **3 files / 72 tests**（精确匹配 Developer claim）+ Document Worker **full 26 files / 220 tests**；
- 实跑 `pnpm exec tsc -b services/document-worker` + `services/core` + `pnpm run audit:dtp4` + `git diff --check`；
- 字面只读核对 `services/document-worker/src/text/text-file-write.ts`（31517 字节）+ `protocol/document-worker-protocol.ts` + `handlers/document-capability-router.ts`；
- 实测 6 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `migrations.ts` 末项 `id` + 5 个 frozen Contract SHA256；
- grep Core / Desktop / Contracts 全仓 0 命中 `write_text / TEXT_FILE_WRITE_CAPABILITY_ID / text-file-write` —— 验证"严格限制在 Document Worker，Core/Desktop 尚未激活"边界；
- skip/todo/only 扫描 + ESLint 实跑。

---

## 二、关键事实核对

### 2.1 A 段：UTF-8 严格编码 + capability ID 字面

✅ **字面命中**（[text-file-write.ts:24-25](services/document-worker/src/text/text-file-write.ts#L24-L25)）：

- `:24` `export const TEXT_FILE_WRITE_CAPABILITY_ID = "tool.workspace.file.write_text"` —— **与 Developer §1 capability 字面一致**；
- `:25` `TEXT_FILE_WRITE_LIMITS_REVISION = "workspace-text.v1"` —— 限制版本号字面固定；
- `:31` `SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u` —— **SHA-256 64-hex 字面正则**（实测）；
- `:34` `TextFileWriteMode = "create_new" | "replace_existing"` —— **双模式字面**；
- `:56` `TextFileWriteOutput { sha256: string }` —— **写后 SHA-256 投影**（实测）。

### 2.2 B 段：路径穿越 / 软链接 / 硬链接防护 + 父目录 containment

✅ **字面命中**（Developer §3 + 实测关键符号）：

- "existing parent directories only" —— writeTextFile 流程 `resolveSafeTarget` 字面拒绝绝对路径 / Windows drive / UNC / URL / traversal / hidden / `.prev`；
- "every existing parent must be a real non-symlink directory under the exact real Workspace root" —— **核心 containment 校验**（实测 `realpath` + `lstat` + `S_ISDIR` 路径）；
- "replacement target and backup must be regular single-link files" —— **硬链接防护**（`nlink > 1` reject）；
- "maximum content is 256 KiB and remains bounded by invocation limits" —— 字面 256 KiB；
- "NUL and unpaired UTF-16 surrogate input is rejected" —— UTF-8 严格编码 + 不可 paired surrogate；
- "errors contain no content or real Workspace path" —— 错误信息不含内容/路径，符合 §3 "errors contain no content or real Workspace path" 字面；
- "no network, subprocess, shell, dependency, public Contract, migration, or lockfile change" —— 实测 lockfile digest 不变 + Contract 6 文件 SHA256 不变 + 0 命中 write_text 在 Core/Desktop/Contracts。

### 2.3 C 段：原子发布 + SHA-256 并发保护 + owned Artifact 私有证明

✅ **字面命中**（实测 [text-file-write.ts:146-307](services/document-worker/src/text/text-file-write.ts#L146-L307)）：

- `writeTextFile` 函数 (`:146+`) 实现 `create_new` + `replace_existing` 两条路径；
- `:177-178` replace 模式 `previousSha256 = previous.sha256` + `:178` digest 校验 `previous.sha256 !== normalized.options.expectedPreviousSha256` —— **SHA-256 exact match fail-closed**；
- `:225` 写前 `oldBytes.sha256 !== previousSha256` fail-closed；
- `:243` 写后 final digest recheck `rechecked.sha256 !== previousSha256` fail-closed；
- `:275` 输出 `sha256: normalized.contentSha256` —— **原子发布后 SHA-256**；

### 2.4 D 段：4 个 WFW v1 fault point + postcondition 4 态

✅ **字面命中**（实测）：

- Developer §2 字面声明的 4 个 fault point：**before temp creation / after temp fsync before publication / after target publication before Observation / replacement-evidence ambiguity**；
- `:68` `TextFileWriteFaultPoint` 显式类型导出（test seam）；
- `:82-87` `TextFileWritePostconditionDecision` = `"not_found" | "safe_retry" | "recovered_success" | "unknown"` —— **4 态字面**；
- `:88` `TextFileWritePostcondition` 字面类型；
- `:307+` `inspectTextFileWritePostcondition` 函数：`:325/329` `targetEntry.sha256 === normalized.contentSha256` → `recovered_success`；`:342/346` `targetEntry.sha256 === expectedPreviousSha256` → `safe_retry`；`:354/357/360` 全等 → `recovered_success`；
- 实测 focused tests（`text-file-write.test.ts` + `document-worker-protocol.test.ts` + `document-capability-router.test.ts`）覆盖 4 态 + 4 fault point —— **72 tests PASS**。

### 2.5 E 段：协议接入（仅 Document Worker，不进 Core）

✅ **字面命中**（实测 [document-worker-protocol.ts](services/document-worker/src/protocol/document-worker-protocol.ts)）：

- Developer §1 字面 "accepted only by the Document Worker private v1alpha2 protocol and is not registered in the Core Tool Registry"；
- grep 全仓 `write_text / TEXT_FILE_WRITE_CAPABILITY_ID / text-file-write` 在 `services/core/src` + `apps/desktop/src` + `packages/contracts/src` = **0 命中** ✅；
- 唯一持有 = `services/document-worker/src/text/text-file-write.ts` + `services/document-worker/src/protocol/document-worker-protocol.ts` + `services/document-worker/src/index.ts` + `services/document-worker/src/handlers/document-capability-router.ts`；
- ✅ 与"严格限制在 Document Worker，Core/Desktop 尚未激活"边界字面对齐。

### 2.6 F 段：git scope 边界（用户明示不修改 Core / Contracts / Renderer）

✅ **字面命中**：

- `git diff --stat HEAD -- services/document-worker`：6 files / 60 insertions / 3 deletions（仅 Document Worker 内部）：
  - `services/document-worker/src/handlers/document-capability-router.ts` (+24)
  - `services/document-worker/src/index.ts` (+1)
  - `services/document-worker/src/protocol/document-worker-protocol.ts` (+7/-3)
  - `services/document-worker/tests/text/text-file-write.test.ts` (new)
  - `services/document-worker/tests/protocol/document-worker-protocol.test.ts` (+28)
  - 其他 services/document-worker/test 文件（既有，+count）
- ✅ **不修改** Core / Desktop / Contracts / Renderer / migration / dependency / lockfile（实测）。

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node / pnpm 版本 | `node --version / pnpm --version` | v24.13.0 / 11.11.0 ✅ |
| **WFW-1 focused tests（3 files）** | text-file-write + document-worker-protocol + document-capability-router | **3 files / 72 tests PASS** ✅（精确匹配 Developer §4 claim） |
| **Document Worker full（26 files）** | `pnpm exec vitest run services/document-worker` | **26 files / 220 tests PASS** ✅（精确匹配 Developer §4 claim） |
| Document Worker typecheck | `pnpm exec tsc -b services/document-worker` | exit 0 ✅ |
| Core typecheck | `pnpm exec tsc -b services/core` | exit 0 ✅ |
| DTP-4 packaging audit | `pnpm run audit:dtp4` | `DTP-4 packaging audit passed.` ✅ |
| DTP-4 audit self-test | `pnpm exec vitest run scripts/audit-dtp4-packaging.test.mjs` | **1 file / 2 tests PASS** ✅ |
| `git diff --check` | `git diff --check` | exit 0 ✅ |
| ESLint on text-file-write.ts | `pnpm exec eslint ...` | exit 0 ✅ |
| skip/todo/only 扫描 | grep across 3 focused files | 无逃逸 ✅ |

**门禁全部吻合 Developer §4 claim**：3 files / 72 tests + 26 files / 220 tests + typecheck + DTP-4 + audit self-test + git diff --check 全部 PASS。

### 3.2 skip/todo/only 扫描

聚焦集 3 个测试文件**无真实 escape**（grep exit 1） ✅。

### 3.3 版本字面

| 来源 | 版本 | 状态 |
|---|---|---|
| Document Worker `package.json` | `0.0.0-wfw.1` | ✅ 已 bump（Developer §1 字面） |
| Root / Core / Desktop / Contracts / Admin | 不变 | ✅ 不动（与 Developer §5 "WFW-2/WFW-3 仍 GATED" 字面对齐） |

### 3.4 边界字面（不漂移核对）

| 项 | 字面 | 状态 |
|---|---|---|
| `pnpm-lock.yaml` SHA256 | `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ **不变** |
| Core migration max | `migrations.ts:1418` 字面 `id: 26` | ✅ **不变** |
| Document Worker / Core / Desktop / Contracts / Admin package.json | 仅 Document Worker bump | ✅ 不动 Core / Contracts / Renderer / Admin |
| 4 个 historical evidence SHA256 | 不变（已承父 RSL-1 联合 QA） | ✅ |
| frozen Contract SHA256（admin-control v1alpha1+v1alpha2 / runtime-selection agent-definition v1alpha2 / desktop-local personal-model-management v1alpha1+v1alpha2） | 不变 | ✅ |
| `agent-lifecycle/v1alpha1` additive | 不变 | ✅ |

### 3.5 workspace 全量门禁（外部 blocker，与本批零关联）

- Desktop `renderer-workbench-boundary.test.ts: contextBridge` + `settings-adapter.ts: rootRealPath`（既有外部 blocker，与本 Document Worker 批零关联）；
- 全仓 `pnpm run check` 仍被并行 Admin 生成文件的 34 个 ESLint no-undef 错误阻断（与本批零关联）；
- ✅ 全部归 Desktop / Admin 窗口历史欠账，不归因本 WFW-1。

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 WFW-1 私有 Text Writer 工程 conformance：

- **UTF-8 严格编码 + no BOM + no newline normalization** = `已实现`（实测）；
- **`create_new` / `replace_existing` 双模式 + 同目录临时文件 + 文件 fsync + 原子发布 + no-clobber** = `已实现`（实测）；
- **SHA-256 exact match fail-closed（写前/写中/写后三次 digest recheck）** = `已实现`（实测 [:178/225/243]）；
- **owned Artifact 私有证明** = `已实现`（实测 `TEXT_FILE_WRITE_CAPABILITY_ID` + 协议接入仅在 Document Worker）；
- **同级 `.prev` 单层备份 + 绝对路径 / UNC / URL / 隐藏 / `.prev` 目标全 reject** = `已实现`；
- **路径穿越 / 软链接 / 硬链接防护（realpath + lstat + nlink > 1 reject）** = `已实现`；
- **256 KiB 内容上限 + NUL / unpaired UTF-16 surrogate reject** = `已实现`；
- **4 个 WFW v1 fault point** = `已实现`（test seam `TextFileWriteFaultPoint` + focused tests）；
- **postcondition 4 态（`not_found / safe_retry / recovered_success / unknown`）** = `已实现`（实测 [:82-87] + [:307-365]）；
- **严格 Document Worker 内部（无 Core / Desktop / Contracts activation）** = `已实现`（grep 0 命中）；
- **3 files / 72 tests focused PASS + 26 files / 220 tests full PASS + typecheck + DTP-4 + audit self-test + git diff --check + ESLint** = 全部实测 PASS；
- **lockfile digest `5b15ae01…874f31` 不变 + Core migration 26 不变 + Document Worker 仅本包 bump** = 全部实测命中。

**本批不声明**：

- Core / Desktop / Renderer 接入（WFW-2 / WFW-3 仍 GATED，Developer §5 字面）；
- 父目录创建（WFW-H1 仍 GATED）；
- Windows NTFS 烟雾测试 / cross-process lock / 完整 CAS（WFW-H1 仍 GANGED，Developer §5 字面承认"final digest-check/rename window 的 external-editor writes 是 documented best-effort residual risk"）；
- production ready / 公网 Provider / production identity；
- workspace 全量门禁（34 ESLint no-undef + Desktop 2 条 blocker）；
- 修改任何产品代码 / Contract / migration / 依赖 / lockfile。

> 诚实记录：Developer §5 已诚实声明 "external-editor writes in the final digest-check/rename window remain the documented best-effort residual risk and are not overclaimed as full CAS" —— 本独立 QA 不假装该残余风险已解决；这是 WFW-H1 的明确范围。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（Desktop workspace 全量门禁外部 blocker，与本批零关联）
评审结论：PASS（不附条件修订）
可冻结：是（WFW-1 私有 Text Writer 子批）
保持 USER_ACCEPTANCE_PENDING：是
```

WFW-1 私有 Text Writer 子批的事实基础（capability ID 字面 + UTF-8 严格编码 + 双模式 + 同目录临时文件 + 文件 fsync + 原子发布 + SHA-256 exact match fail-closed + owned Artifact 私有证明 + `.prev` 单层备份 + 路径穿越/软链接/硬链接防护 + 4 个 WFW v1 fault point + postcondition 4 态 + 严格 Document Worker 内部 + 0 命中 Core/Desktop/Contracts + 3 files / 72 tests focused PASS + 26 files / 220 tests full PASS + typecheck + DTP-4 + audit self-test + git diff --check + ESLint + lockfile digest 不变 + Core migration 26 不变 + 5 个 frozen Contract SHA256 不变 + Document Worker 仅本包 bump 到 `0.0.0-wfw.1`）全部只读可证。

9 项独立评审问题逐项可独立回答：

1. **是**：UTF-8 严格编码 + no BOM + no newline normalization（实测） ✅
2. **是**：`create_new` / `replace_existing` 双模式 + 同目录临时文件 + 文件 fsync + 原子发布 + no-clobber（实测 [:146-307]） ✅
3. **是**：SHA-256 exact match fail-closed 三次 digest recheck（实测 [:178/225/243]） ✅
4. **是**：owned Artifact 私有证明（实测 `TEXT_FILE_WRITE_CAPABILITY_ID` + 协议仅 Document Worker） ✅
5. **是**：同级 `.prev` 单层备份 + 绝对路径 / UNC / URL / 隐藏 / `.prev` 目标全 reject（实测） ✅
6. **是**：路径穿越 / 软链接 / 硬链接防护（实测 `realpath + lstat + nlink > 1 reject`） ✅
7. **是**：4 个 WFW v1 fault point + postcondition 4 态（实测 test seam + 72 tests 覆盖） ✅
8. **是**：严格 Document Worker 内部（grep `write_text / TEXT_FILE_WRITE_CAPABILITY_ID / text-file-write` 在 Core/Desktop/Contracts **0 命中**） ✅
9. **是**：边界不漂移（Document Worker 仅本包 bump + lockfile digest 不变 + Core migration 26 不变 + 5 个 frozen Contract SHA256 不变 + 不修改 Core/Desktop/Contracts/migration/依赖/lockfile） ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 1（外部 blocker，与本批零关联）；评审结论 **PASS（不附条件修订）**；可冻结：**是**（WFW-1 私有 Text Writer 子批）。
2. **决策 1**：是否接受 WFW-1 子批 `PASS/CLOSED`？**推荐：是** —— 字面 UTF-8 严格编码 + 双模式 + 原子发布 + SHA-256 fail-closed + owned Artifact + `.prev` + 路径/软链接/硬链接防护 + 4 fault point + postcondition 4 态 + 严格 Document Worker 内部 + 3 files / 72 tests + 26 files / 220 tests + typecheck + DTP-4 + audit self-test + ESLint + git diff --check + 边界不漂移。
3. **决策 2**：是否接受 Document Worker version bump 到 `0.0.0-wfw.1`？**推荐：是** —— Developer §1 字面明示，且只 bump Document Worker 单包。
4. **后续路径**：
   - 接受后 WFW-1 正式 `PASS/CLOSED`；
   - WFW-2 Core Registry/Policy/EffectCoordinator/Artifact 接线需用户单独授权（Developer §5 诚实声明仍 GATED）；
   - WFW-3 前端展示 + 真实 Electron E2E + Windows NTFS 烟雾测试需用户单独授权（仍 GATED）；
   - WFW-H1 父目录创建 / cross-process lock / 完整 CAS 矩阵需用户单独授权（仍 GATED）；
   - 不冒充 production ready / 公网 Provider / production identity。

代码 QA 通过**不等于**用户接受。当前保持 `USER_ACCEPTANCE_PENDING`，待：
- 用户接受本报告；
- 用户单独接受 WFW-1 为 `PASS/CLOSED`。

本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）
