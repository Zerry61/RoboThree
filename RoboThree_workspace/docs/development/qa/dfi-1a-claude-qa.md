# DFI-1A — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-16-2236-version-dfi-1a` |
| 验收对象 | DFI-1A：Workspace Browser strict Contract、HMAC proof、单层有界目录读取、realpath containment、固定可见性策略 |
| 日期 | 2026-08-16 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / JDK 21.0.12 / Docker 29.6.2（Testcontainers） |
| 开发版本 | Core/Contracts `0.0.0-dfi.1a`；Root/Central `0.0.0-arh.3.3.3-repair.1`；Desktop `0.0.0-dfe.3a`；Document Worker `0.0.0-pdt.2` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 179 files / 1220 tests + 3 smoke（独立复跑；较 Codex 声称的 1218 多 2，为 DFE-3B 并行新增的 artifact ViewModel 测试） |
| 2 | `CI=true pnpm run check:central` | **PASS** 302/0/0/0（BUILD SUCCESS） |
| 3 | `CI=true pnpm run check:central:offline` | **PASS** 302/0/0/0（BUILD SUCCESS） |

DFI-1A focused（4 files / 19 tests）已含于 check。

---

## 二、重点核查项（DFI 计划 §7.1 DFI-1A 交付 + 安全边界）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 正式授权与版本 | ✅ DEVELOPMENT-LOG 明确「用户授权 DFI-1A」，Core/Contracts 版本 `0.0.0-dfi.1a`；上一轮 DFE-3A 的「未授权抢跑」已通过本批正式授权闭环 |
| 2 | Contract strict + 只接受 taskId | ✅ `ListWorkspaceEntriesQuerySchema` 的 `taskId` 为 `DesktopResourceIdSchema.refine(startsWith("task:"))`，`.strict()` 拒绝未知字段，Query 无 `workspaceGrantId` 字段 |
| 3 | HMAC opaque entry/cursor proof | ✅ `HmacWorkspaceBrowserProofCodec` 用 256-bit 随机 key（不持久化），HMAC-SHA-256 + `timingSafeEqual`；entry/cursor token 为 `prefix.payload.signature` |
| 4 | TaskRuntimeSelection 锁定授权校验 | ✅ `WorkspaceBrowserService.listEntries` 校验 selection 存在、`taskId` 匹配、`hasValidTaskRuntimeSelection`、`workspaceGrantId` 锁定、grant 存在且 active，任一失败 typed fail-closed |
| 5 | proof scope 绑定 | ✅ entry/cursor proof 校验 `taskId`/`selectionDigest`/`workspaceGrantId`/目录快照一致，proof 换 Task/换 selection/换 grant 全部拒绝 |
| 6 | realpath containment + TOCTOU | ✅ `NodeWorkspaceDirectoryReader` 用 `realpath` + `isWithin` 做 lexical containment，每个 entry 二次 `realpath`+`lstat` 复核（防 dirent→realpath 间被替换为 symlink），目录 before/after `dev`/`ino`/`mode` 复核（防列目录期间身份被替换） |
| 7 | symlink 禁止跟随 | ✅ Dirent `isSymbolicLink()` 直接投影为 `kind: symlink` 后 `continue`，不 realpath、不 lstat、不暴露 target；Contract superRefine 强制 symlink 必须 `unavailableReason` + 不可导航 |
| 8 | 单层 + 有界 | ✅ 单层 `opendir` 不递归；`MAX_INTERNAL_ENTRIES = 10_000` 硬上限；`limit 1..200`；`MAX_RESPONSE_BYTES = 256KB` |
| 9 | 固定可见性策略 | ✅ denylist `.DS_Store/.git/.hg/.svn/.pnpm/node_modules`，保留 `.claude/.robothree`；目录优先 + NFC 归一化 + 大小写不敏感稳定排序 |
| 10 | 分页漂移 + 重启失效 | ✅ cursor 校验 `snapshotDigest`（快照变化 → `cursor_stale`）；proof key 每实例随机，Core 重启后旧 proof 全部失效 |
| 11 | 路径攻击负向 | ✅ `validateRelativeDirectory` 拒绝 `../`、绝对路径、Windows drive、UNC、null byte、超长、`.`/`..` 段 |
| 12 | 边界无漂移 | ✅ 未改 private HTTP/Main/Preload/Renderer/IPC（属 DFI-1B）；未改 Kernel reducer/migration/持久事实/Central/Document Worker/依赖/lockfile |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

测试覆盖已独立核对，覆盖用户声明的全部关键场景：

- `node-workspace-directory-reader.integration.test.ts`：单层 + 不跟随内部/逃逸 symlink、`it.each(["../outside", "/private/tmp", "C:\\Windows", "\\\\server\\share", "a\0b"])` 路径攻击负向、取消 + 错误 path-free；
- `workspace-browser-service.test.ts`：篡改 proof 拒绝且不暴露 payload、精确 Task selection + 过滤稳定分页、精确目录 proof 导航、**Core 重启 proof 失效**、缺失/撤销/未锁定/无效 Task 权限失败关闭、**快照变化后 cursor 拒绝（分页漂移）**。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-1A 正确实现 Workspace Browser 的 Contract + Core 基础：strict v1alpha2 Contract 只接受
`task:` 前缀 taskId、HMAC opaque proof 绑定 Task/selection/Grant/快照且重启失效、单层有界目录读取、
realpath containment + lstat 复核防 TOCTOU、symlink 只投影不跟随、固定可见性策略、分页漂移与路径
攻击全覆盖。三项门禁独立串行复跑通过，无生产边界漂移。

**DFI-1A 可进入用户接受流程。DFI-1B、DFI-2、DFI-3、DFI-4 保持 GATED。**

— Claude Code（独立 QA，只读）
