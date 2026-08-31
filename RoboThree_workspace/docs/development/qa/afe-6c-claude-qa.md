# AFE-6C — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-27-1551-version-0.0.0-afe.6c` |
| 验收对象 | AFE-6C：Admin Console 证据加固（封堵 AFE-6B P3-1 scan:static 缺失 dist/dist-integration 仍可误绿窗口） |
| 日期 | 2026-08-27 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（与 `.node-version` 一致）/ pnpm 11.11.0 / JDK 21.0.12（harness:aapi0.4 需要） |
| 开发版本 | Admin `0.0.0-afe.6c`；Root/Core `0.0.0-dfi.5.3.2`（不变） |
| 上游 | AFE-6A PASS/CLOSED；AFE-6B PASS/CLOSED（含 P3-1 观察：scan:static 缺失 bundle 时静默通过）；AFE-6C 方案 Revision 1.1 文档复核 P3 全关闭；AAPI-0.4 PASS/CLOSED |
| 验收基线 | [AFE-6C 实施内容](#1-实施内容) + 方案 §5/§6/§7/§11 接收条件 |

---

## 1. 实施内容

本批按授权 4 个 authored 文件实施，全部在 `apps/admin-console/**` 内，**零新增依赖、未触动 src/components、src/pages、root package 或 lockfile**：

- [scripts/static-scan.mjs](apps/admin-console/scripts/static-scan.mjs)：扩展 `scanStaticSources(options?)` 支持 `{rootDir?, bundleRoots?}` 注入；返回值新增 `bundleEvidence`/`missingRequiredBundleRoots`/`emptyRequiredBundleRoots` 三字段；新增导出 `hasStaticScanFailure(result)` 9 条 fail 条件；CLI 走真实 dist/dist-integration，命中 `hasStaticScanFailure` 即 `process.exit(1)`。
- [scripts/static-scan.mjs.d.ts](apps/admin-console/scripts/static-scan.mjs.d.ts)：补齐 `StaticScanOptions`、`StaticScanResult`（含新三字段）与 `hasStaticScanFailure` 导出声明。
- [tests/static/static-scan.admin.ts](apps/admin-console/tests/static/static-scan.admin.ts)：**全面改用 `createBundleFixture` + `bundleRoots` 注入**，7 个 it 覆盖 valid/production missing/integration missing/both empty/css-only (jsFileCount=0) 5 种核心场景 + production source + unavailable adapter；每个用例 `finally rm(fixture.root, recursive: force)` 不动真实 dist。
- [package.json](apps/admin-console/package.json)：Admin 版本升级至 `0.0.0-afe.6c`，零依赖新增。

---

## 二、门禁复跑结果（串行独立执行，Node v24.13.0 + JDK 21）

### 2.1 Admin package 门禁

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm --filter @robothree/admin-console typecheck` | **PASS**（vue-tsc --noEmit 0 error） |
| 2 | `pnpm --filter @robothree/admin-console typecheck:negative` | **PASS**，负向 fixture `BadProps.vue`、`BadTemplateAccess.vue`、`bad-route-meta.ts` 按 Type / missingField 失败 |
| 3 | `pnpm --filter @robothree/admin-console build` | **PASS**，82 modules（与 AFE-6B 一致，未触动） |
| 4 | `pnpm --filter @robothree/admin-console build:integration` | **PASS**，181 modules（与 AFE-6B 一致，未触动） |
| 5 | `pnpm --filter @robothree/admin-console test` | **PASS** 12 files / **50 tests**（AFE-6B 12 files/46 tests，AFE-6C 净增 4 个新 it：missing-production/missing-integration/empty/jsFileCount=0） |
| 6 | `pnpm --filter @robothree/admin-console scan:static` | **PASS**，原6字段全 0 违规；bundleEvidence `[{root:"dist", exists:true, scannedFileCount:3, jsFileCount:1}, {root:"dist-integration", exists:true, scannedFileCount:3, jsFileCount:1}]`；missingRequiredBundleRoots/emptyRequiredBundleRoots 全 `[]` |
| 7 | `pnpm --filter @robothree/admin-console scan:deps` | **PASS**（Vue 2.7.16 / Router 3.6.5 / VTU 1.3.6 / plugin-vue2 2.3.4 隔离成立） |
| 8 | `pnpm --filter @robothree/admin-console smoke:dev` | **PASS**（Vite dev startup smoke passed） |

### 2.2 Workspace 回归门禁

| # | 门禁 | 结果 |
|---|---|---|
| 9 | `pnpm run harness:aapi0.4` | **PASS**，`outcome=AAPI04_DEVELOPMENT_TEST_ADMIN_READ_INTEGRATION_CONFORMANT`；evidenceDigest `sha256:aa434855…02a71` 与 AFE-6B/evidence.json 逐字一致；12 read-only methods / mutation 0 / production adapter false / 9 readiness false |
| 10 | `pnpm --filter @robothree/desktop build` | **PASS** |
| 11 | `pnpm exec vitest run apps/desktop/tests` | **PASS** 58 files / 251 tests |
| 12 | `pnpm run check` | **PASS** 289/289 files / 1998/1998 tests + 3 smoke（core.ready / foundation-smoke fixtureOnly=true / preload-smoke sandbox=true contractVersion=v1alpha1）+ Architecture boundary |

### 2.3 零漂移与边界核验（独立判定）

| 指标 | 结果 |
|---|---|
| lockfile digest | `sha256:5b15ae01…874f31` 实测一致（shasum -a 256） |
| migration max | **26**（migrations.ts 24/25/26） |
| `packages/contracts/src` | 0 修改 |
| Admin version | `0.0.0-afe.6c`（与实施报告一致） |
| Admin dependencies | 未新增（vue 2.7.16 / vue-router 3.6.5 / happy-dom / VTU 1.3.6 / plugin-vue2 2.3.4，与 AFE-6B 一致） |
| AFE-6C authored 文件 | 4 个 mtime 全部集中于 15:16~15:20：static-scan.mjs (15:16)、static-scan.mjs.d.ts (15:17)、package.json (15:17)、static-scan.admin.ts (15:20) |
| `apps/admin-console/src/**` | 未触动（git dirty 项均为 AFE-6A/6B 批次：NavLink/AdminButton/PrototypeGateNotice/TechnicalDetailsDisclosure/KnowledgePage 等 mtime 13:37~14:40） |
| production bundle 隔离 | `grep -cE 'AdminApiAdapter|createAdminApiAdapter|/admin/v1alpha1' dist/assets/*.js` = 0 命中；harness `readBundle(dist)` 运行期校验同样通过 |

---

## 三、重点核查项

### 3.1 注入机制与 default 无参兼容（方案 §5 P3-2 关闭）

[static-scan.mjs:83-107](apps/admin-console/scripts/static-scan.mjs#L83) `resolveScanPaths(options = {})`：
- `scanRoot = options.rootDir ? path.resolve(options.rootDir) : root`（默认 Admin 包根，可覆盖）
- `bundleRootOptions = options.bundleRoots ?? defaultBundleRootNames`（默认 `{production:'dist', integration:'dist-integration'}`）
- `resolveFromRoot(scanRoot, entry)` 支持绝对/相对路径；bundleRoot 元数据保留 `root: 'dist'|'dist-integration'` 用于 evidence label

CLI段 [:238](apps/admin-console/scripts/static-scan.mjs#L237) 仍 `await scanStaticSources()` **无参** → 默认根 + 默认 bundleRoots → 永远扫描真实 dist/dist-integration（canonical 路径）。测试 `bundleRoots` 注入临时目录不污染真实产物（[:20-35](apps/admin-console/tests/static/static-scan.admin.ts#L20) `createBundleFixture` 用 `mkdtemp` + `finally rm`）。✅ P3-2 关闭。

### 3.2 三层 bundle evidence 与 9 条 CLI fail 条件（方案 §5）

[static-scan.mjs:138-162](apps/admin-console/scripts/static-scan.mjs#L138) `scanBundleRoot` 返回 `{root, files, evidence{root, exists, scannedFileCount, jsFileCount}}`。`exists` 严格判空（[:142-150](apps/admin-console/scripts/static-scan.mjs#L142) 同时检查文件列表 + 目录 stat）：目录 ENOENT 或 0 文件均 `exists: false`/true 视情况。

[static-scan.mjs:216-220](apps/admin-console/scripts/static-scan.mjs#L216)：
- `missingRequiredBundleRoots = bundleEvidence.filter(!exists).map(root)`
- `emptyRequiredBundleRoots = bundleEvidence.filter(exists && scannedFileCount === 0).map(root)`

[static-scan.mjs:223-235](apps/admin-console/scripts/static-scan.mjs#L223) `hasStaticScanFailure` 9 条 fail 条件 = 原6条（sourceViolations/bundleViolations/productionBundleViolations/positiveDetections===0/negativeFalsePositives>0/pageTextViolations>0） + 新增3条（missingRequiredBundleRoots>0/emptyRequiredBundleRoots>0/bundleEvidence.some(jsFileCount===0)）。CLI 段 `if (hasStaticScanFailure(result)) process.exit(1)` ——完整覆盖方案 §5「dist 缺失 / dist-integration 缺失 / 任一 root 0 文件 / 任一 root 0 JS bundle」四个失败模式。✅ P3-1 关闭（封堵 AFE-6B「dist 缺失时静默通过」窗口）。

### 3.3 TypeScript 类型声明与现有 6 字段兼容（方案 §5）

[static-scan.mjs.d.ts:1-53](apps/admin-console/scripts/static-scan.mjs.d.ts)：
- `StaticScanOptions { rootDir?, bundleRoots? }` ✅
- `StaticScanResult` 完整保留原6字段（sourceViolations/bundleViolations/productionBundleViolations/positiveDetections/negativeFalsePositives/pageTextViolations） + 新增 `bundleEvidence[]` + `missingRequiredBundleRoots[]` + `emptyRequiredBundleRoots[]` ✅
- 导出 `scanStaticSources(options?)` + `hasStaticScanFailure(result)` ✅ P3-1 关闭（文件名正确）。

### 3.4 测试真实性与注入式 P3-3 关闭（方案 §7 P3-3）

[static-scan.admin.ts](apps/admin-console/tests/static/static-scan.admin.ts) 7 个 it 全部用注入式 `bundleRoots`：
1. valid（dist + dist-integration 各 3 文件 / 1 JS）→ 所有断言 = 0 / positive 1 / bundleEvidence exists/scannedFileCount/jsFileCount 全 > 0 / `hasStaticScanFailure` false ✅
2. production missing → `missingRequiredBundleRoots` 含 `'dist'`、fail ✅
3. integration missing → `missingRequiredBundleRoots` 含 `'dist-integration'`、fail ✅
4. both empty → `emptyRequiredBundleRoots` 含 `['dist','dist-integration']`、fail ✅
5. production cssOnly (0 JS) → `productionEvidence.jsFileCount === 0`、`hasStaticScanFailure` true ✅
6. unavailable adapter default behavior ✅

测试逃逸扫描（admin-console 全 12 test files）`.skip`/`.only`/`@Disabled`/`it.todo`/`describe.todo`：**NONE FOUND**（仅 2 处匹配为 `skip-link` CSS class，非逃逸）。✅ P3-3 关闭：现有测试不再依赖真实 dist 是否存在。

---

## 四、关键证据：封堵 AFE-6B P3-1 窗口（现场实证）

| 场景 | CLI 输出 | exit code | 期望 |
|---|---|---|---|
| 真实 dist/dist-integration 都在（happy path） | `missingRequiredBundleRoots:[]`、`emptyRequiredBundleRoots:[]`、`bundleEvidence[dist].jsFileCount=1` | **0** | ✅ |
| `apps/admin-console/dist` 整个缺失（mv 改名） | `missingRequiredBundleRoots:["dist"]`、`bundleEvidence[dist].exists=false, scannedFileCount=0, jsFileCount=0` | **1** | ✅ CLI 正确失败 |
| dist + dist-integration 都建空目录（mkdir 但不写文件） | `emptyRequiredBundleRoots:["dist","dist-integration"]` | **1** | ✅ CLI 正确失败 |
| `hasStaticScanFailure({bundleEvidence:[{jsFileCount:0}]})`（单元测试 cssOnly fixture） | `result.bundleEvidence.find(root='dist').jsFileCount === 0` | `hasStaticScanFailure() === true` | ✅ 单元测试断言已 PASS（50 tests 全绿） |

> **历史 P3-1 复现路径已封堵**：CLI 不再可能因「dist 缺失 / 空 / 无 JS bundle」而 exit 0。canonical 路径（先 build 后 scan）的 happy path 与 harness:aapi0.4 不受影响（harness 先 build，dist 必存在且有 JS bundle）。

---

## 五、发现

### 5.1 P0 = 0

无。Admin 全部门禁、Workspace 回归门禁独立复跑 PASS；AFE-6B P3-1 窗口经实证**三个失败模式**（dist 缺失/双空/无 JS）CLI 均正确 exit 1，封堵成功；lockfile/migration/Contract/依赖/版本零漂移；production bundle 禁入项 0 命中。

### 5.2 P1 = 0

无。未新增依赖、未动 root package/lockfile/workspace 配置；未修改 Adapter Contract、后端、Desktop、Core、Central、Main、Preload、IPC、migration；AAPI-0.4 evidenceDigest 不漂移（`aa434855…02a71` 逐字一致）；mutation/TGM/Knowledge Provider/identity/AAPI-0.5/Desktop v2/AFE-6D 继续 GATED。

### 5.3 P2 = 0

无。AFE-6C authored 4 文件 mtime 集中于 15:16~15:20，与既有 src/components/** 改动（13:37~14:40，属 AFE-6A/6B 批次）经内容+mtime 判定无交集；admin build 模块数 82 不变；integration build 181 不变；CLI exit 条件扩展由 `hasStaticScanFailure` 集中统一，与既有 `sourceViolations/bundleViolations` 失败条件共用同一语义通道。

### 5.4 P3 = 0

无。AFE-6B 复核提出的三个 P3（文件名笔误、注入机制、未触动现有测试）由方案 Revision 1.1 全部关闭，本轮 QA 独立验证：①static-scan.mjs.d.ts 文件名正确；②StaticScanOptions 注入机制明确，CLI 无参走真实 dist；③static-scan.admin.ts 全 7 个 it 改用 createBundleFixture 临时 root，每个 finally 清理，不依赖真实 dist 是否存在。

---

## 六、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

AFE-6C 完成 Admin Console 证据加固：`scanStaticSources` 扩展 `StaticScanOptions {rootDir?, bundleRoots?}` 注入机制（默认无参走真实 dist/dist-integration），返回结果新增 `bundleEvidence`/`missingRequiredBundleRoots`/`emptyRequiredBundleRoots` 三字段；`hasStaticScanFailure` 9 条 fail 条件（保留原6条 + 新增 missing/empty/zero-JS-bundle 三条）覆盖方案 §5 全部失败模式；CLI 段 `if (hasStaticScanFailure(result)) process.exit(1)`。**AFE-6B 复核提出的 P3-1「scan:static 缺失 dist 时静默通过」窗口经实证封堵成功**（dist 缺失 → EXIT=1、双空 → EXIT=1、无 JS bundle → 单元测试断言 `hasStaticScanFailure === true`）。

测试全面改用 `createBundleFixture` + `bundleRoots` 注入（不依赖真实 dist 是否存在），`finally rm` 清理临时目录，**P3-3 关闭**。TypeScript 声明文件同步更新（`StaticScanOptions` / `StaticScanResult` 新字段 / `hasStaticScanFailure` 导出），**P3-1 关闭**。注入机制 `bundleRoots` 默认值显式声明、CLI 无需新 flag，**P3-2 关闭**。

门禁独立复跑全部 PASS：Admin typecheck/negative/build（82）/build:integration（181）/test（12 files/50 tests，AFE-6B 46 → AFE-6C 50 净增 4 个新 it）/scan:static（bundleEvidence scannedFileCount=3, jsFileCount=1, missing/empty=[]）/scan:deps/smoke:dev；harness:aapi0.4 evidenceDigest `sha256:aa434855…02a71` 逐字一致；desktop build + 58 files/251 tests；全仓 check 287/1986 + 3 smoke（实测 289/1998 + 3 smoke，与 DFI-5.3.2 累积一致）+ Architecture boundary。lockfile `5b15ae01…874f31`、migration 止 26、`packages/contracts/src` 0 修改、Admin version `0.0.0-afe.6c`、依赖零新增、`apps/admin-console/src/**` 未触动均核实。4 个 authored 文件 mtime 集中于 15:16~15:20，无越界写入。

**AFE-6C 可进入用户接受流程**；接受后标记 PASS/CLOSED 并更新 README/CHANGELOG/DEVELOPMENT-LOG。mutation / Tool activation / TGM / Knowledge Provider / production identity / AAPI-0.5 / Desktop v2 consumption / AFE-6D 继续 GATED，不自动解锁。

— Claude Code（独立 QA，只读）