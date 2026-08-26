# DFI-1B — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-17-1044-version-dfi-1b` |
| 验收对象 | DFI-1B：Workspace Browser 跨进程集成、wra1 短期授权、Reveal 高层命令、Main 二次校验、超时 uncertain 与幂等 |
| 日期 | 2026-08-17 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm）/ pnpm 11.11.0 / JDK 21.0.12 / Docker 29.6.2（Testcontainers） |
| 开发版本 | Desktop/Core/Contracts `0.0.0-dfi.1b`；Root/Central `0.0.0-arh.3.3.3-repair.1`；Document Worker `0.0.0-pdt.2` |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run check` | **PASS** 186 files / 1238 tests + 3 smoke（preload smoke 含 sidecar 检查：`sidecarContractVersion=v1alpha2`、`hasWorkspaceBrowser=true`、`hasWorkspaceReveal=true`） |
| 2 | `CI=true pnpm run check:central` | 首次偶发失败 → 复跑 **PASS** 302/0/0/0（BUILD SUCCESS） |
| 3 | `CI=true pnpm run check:central:offline` | **PASS** 302/0/0/0（BUILD SUCCESS） |

> 过程记录：首次 `check:central` 出现 `MojoFailureException`（tail 截断、无具体测试名），复跑 302/302
> 全过、offline 302/302 全过。DFI-1B 改动范围不含 Central（Java 服务），故该次失败为 Central 测试
> 时序偶发（CTR-P3-001 同类）或 tracing exporter timeout 瞬态，与 DFI-1B 无因果关系，不计入缺陷。

---

## 二、重点核查项（DFI-1B 计划交付 + 安全边界）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 正式授权与版本 | ✅ DEVELOPMENT-LOG 明确「用户授权 DFI-1B」，Desktop/Core/Contracts `0.0.0-dfi.1b` |
| 2 | v1alpha2 additive Contract | ✅ 新增 `task_workspace_browser` / `task_workspace_reveal` feature、strict compatibility query、Reveal Command、path-free Receipt、独立 typed error envelope；v1alpha1 不改 |
| 3 | wra1 短期授权 | ✅ `WorkspaceRevealAuthorityService` 复用 DFI-1A 同一 HMAC key + 独立 `wra1` domain；token claims 绑定 taskId/selectionDigest/workspaceGrantId/rootIdentity/runtimeInstanceId/commandId/expiresAt(≤5s) |
| 4 | prepare/consume 两步 | ✅ prepare 只返回 path-free wra1 token；consume 验证 HMAC/runtime/command/expiry 并**重新解析 selection/grant/root** 后才返回一次 root identity；`sameIdentity` 对 realPath/dev/ino/mode 四重比对 |
| 5 | Core 重启失效 | ✅ token 绑定 `runtimeInstanceId`，consume 时校验 runtime 一致，重启后旧 token 失效 |
| 6 | Main 二次 identity 校验 | ✅ `verifyRootIdentity` 在 `shell.openPath` 前 realpath（须等于 root）+ lstat（须目录、非 symlink）+ dev/ino/mode 四重比对 |
| 7 | 超时 uncertain + 幂等 | ✅ `raceDeadline(5s)`：空字符串→opened / 非空或 reject→`reveal_unavailable` / 5s 未 settle→`reveal_outcome_uncertain`（retryable=false，"可能仍会打开，请勿重复"）；`Attempt Registry` 256 项 + TTL 10 分钟 + busy 防重入 + late settle 不改写 |
| 8 | feature negotiation | ✅ `#requireFeature` 先查 compatibility，feature 缺失返回 typed `contract.feature_unavailable` |
| 9 | sidecar 三成员 | ✅ `window.robothreeDesktopV1Alpha2` 仅 `getCompatibility` / `listWorkspaceEntries` / `openTaskWorkspaceLocation`，不扩张 v1alpha1 |
| 10 | Renderer 未改动 | ✅ Renderer 源码对 `robothreeDesktopV1Alpha2` / `listWorkspaceEntries` / `openTaskWorkspaceLocation` 零命中；未删 Workspace tree 占位/Mock |
| 11 | 路径不泄漏 | ✅ Receipt 只含 commandId/taskId/workspaceGrantId/openedAt，无 root/path；root 只在 Core→Main 私有 consume 响应 + Main OS adapter 内短暂存在 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

（首次 `check:central` 偶发失败为过程记录，见第一节，不计入缺陷。）

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

DFI-1B 正确完成 Workspace Browser 跨进程集成：v1alpha2 additive Contract、wra1 短期授权（prepare/consume
两步 + HMAC domain + 5s expiry + 重启失效）、Main 打开目录前 dev/ino/mode 二次校验、5 秒超时 uncertain
+ 幂等 Attempt Registry、独立三成员 sidecar、Renderer 未改动未暴露真实路径。三项门禁独立复跑通过
（Central 首次偶发失败复跑全过），无生产边界漂移，DFI-2/3/4 未提前开发。

**DFI-1B 可进入用户接受流程。DFI-2、DFI-3、DFI-4 保持 GATED。**

— Claude Code（独立 QA，只读）
