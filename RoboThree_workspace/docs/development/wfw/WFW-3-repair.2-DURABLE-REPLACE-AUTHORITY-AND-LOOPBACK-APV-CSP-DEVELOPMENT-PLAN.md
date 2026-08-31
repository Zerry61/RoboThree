# WFW-3 repair.2 — Durable Replace Authority / Loopback APV CSP 极小方案

> Owner: Codex 5.6  
> Date: 2026-08-31  
> Status: `PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED`  
> Upstream: `WFW-3 repair.1 PASS/CLOSED`；父 `WFW-3 PAUSED`  
> Canonical capability: `tool.workspace.file.write_text`

## 0. 结论与控制口径

repair.2 只修复父 WFW-3 真实 Electron E2E 已经独立确证的两项差异：

1. Replace ownership head 不能从模型可见 durable Step payload 读取私有 `workspaceGrantId`；必须从每个 source Task 的
   durable readable Runtime Selection 恢复 exact WorkspaceGrant authority；
2. Renderer 顶层 CSP 必须允许 existing Main-owned、tokenized、IPv4 loopback APV iframe 真正加载，同时保持 iframe
   与 APV-1C document 的全部 inert 安全边界。

本 repair 不新增文本写入、Artifact、WorkspaceGrant、预览或恢复能力，只校正两个既有接缝。方案通过不等于编码授权。

```text
WFW-3 repair.1: PASS/CLOSED
WFW-3 repair.2: PASS/CLOSED / INDEPENDENT QA PASS / USER ACCEPTED
Parent WFW-3: MACOS E2E PASS / WINDOWS NTFS GATE PENDING / NOT CLOSED
Windows local NTFS gate: PENDING
WFW-H1: GATED
```

### 0.1 最高允许结论

repair.2 最高只允许声明：

```text
WFW3_REPAIR2_DURABLE_REPLACE_AND_LOOPBACK_PREVIEW_CONFORMANT
```

它不关闭父 WFW-3，不代替 macOS 全流程 E2E 或 Windows 11 本地 NTFS 门禁，也不代表 production ready、强 CAS、
任意用户文件修改或通用文件平台 ready。

## 1. 已证事实

### 1.1 Replace authority 失败链

- `ensureDocumentToolStep` 有意只把模型可见 `modelPayload` 写入 durable Step；
- 当前 `deriveWorkspaceTextArtifactProof` 却用 `step.action.payload.workspaceGrantId` 过滤历史成功 WFW Step；
- 私有 grant 仅在执行时从当前 Task 的 readable Runtime Selection 取得，不存在于模型可见 payload；
- 因此合法 create Observation 被排除，head 集合为空，最终得到 `workspace_text.artifact_head_mismatch`；
- 实测当前文件 SHA-256 与 `expectedPreviousSha256` 完全一致，排除 stale content 与 fixture digest 错误。

### 1.2 APV iframe 失败链

- repair.1 已让 Main 为 Task-generated HTML 创建 existing `HtmlPreviewSandbox` session；
- preview URL 固定由 Main-owned server 生成，scheme/host 为 `http://127.0.0.1`，端口随机，path 含 session 与 token；
- Renderer document CSP 无 `frame-src`，因此继承 `default-src 'self'`；
- loopback APV 与 Renderer 非同源，Chromium 实测 `ERR_BLOCKED_BY_CSP`；
- 当前 E2E 只确认 iframe DOM 存在，不能证明预览文档完成真实加载。

## 2. 严格范围

### 2.1 允许修改

```text
services/core/src/application/workspace-text-artifact-authority.ts
services/core/tests/**（仅 WFW replace authority focused tests）
apps/desktop/src/renderer/index.html
apps/desktop/src/main/html-preview-sandbox.ts（仅 APV response `frame-ancestors` 的精确父级授权）
apps/desktop/tests/**（仅 CSP / iframe security focused tests）
scripts/run-mvp-vs2-electron.mjs（仅恢复同一 WFW-3 E2E 与 real-load assertion）
docs/development/wfw/**
README.md / CHANGELOG.md / docs/development/DEVELOPMENT-LOG.md
package.json / services/core/package.json / apps/desktop/package.json（仅编码通过后的开发版本同步）
scripts/audit-dtp4-packaging.test.mjs（仅版本期望同步，如实际需要）
```

只允许命中上述最小集合。实现前 focused proof 若证明某文件无需修改，则不得为了对称性修改。

### 2.2 明确禁止

- 不修改 public Contract、IPC channel、Preload method、Main preview routing 或 Document Worker protocol；
- 不新增 migration、依赖、lockfile 变化、durable fact、状态机、Artifact 字段、错误码或 Evidence schema；
- 不把 `workspaceGrantId` 写入模型可见 Step/Action、Tool Observation、Renderer、日志、Artifact 或 E2E 输出；
- 不允许模型、Renderer 或 Tool 参数提交 source Task、Artifact proof、grant identity 或 ownership claim；
- 不把 `taskId`、root、绝对路径、token、HTML 正文或 proof 暴露给 Renderer；
- 不使用 `frame-src *`、`http:`、`localhost`、任意远端 origin、`file:`、`data:` 或 `blob:` 作为宽泛授权；
- 不移除 iframe `sandbox=""`、`referrerpolicy="no-referrer"`；除 `frame-ancestors` 为实现既有 iframe 消费所需的
  精确父级授权外，不放宽 APV-1C response 的任何 content/resource CSP；
- 不以 DOM 节点存在、fixture HTML、Renderer `v-html` 或直读文件冒充真实加载成功；
- 不进入父目录创建、任意文件覆盖、强跨进程 CAS、WFW-H1 或其他产品线。

## 3. 差异 A — durable source-Task WorkspaceGrant authority

### Step A1 — focused proof 先固定真实模型

构造同一 durable Session 的最小事实：

1. source Task 使用 readable Runtime Selection，持有 exact `workspaceGrantId=A`；
2. source Task 有成功 WFW create Step/Observation 与 terminal Artifact，但模型可见 payload 不含 grant；
3. current Task 使用同一 exact grant A、同一 `relativePath` 与 exact previous SHA；
4. `deriveWorkspaceTextArtifactProof` 应返回由唯一 terminal head 派生的 proof；
5. source Task 使用 grant B、selection 缺失/不可读、路径不同、Artifact deleted、capability lock 缺失或 history ambiguous 时，
   必须继续 fail-closed。

测试必须直接断言 source Task 的 `loadReadableTaskRuntimeSelection(sourceTaskId)` 被调用；legacy-only loader 不得成为新路径。

### Step A2 — 最小 authority 修正

对每个候选 source Task：

1. 先识别 exact WFW succeeded Step；
2. 从该 source Task 的 durable readable Runtime Selection 取得 `workspaceGrantId`；
3. selection 缺失、无法读取或没有 grant 时，不得把该 Task 当作当前 grant 的候选；active replace 若因此无法形成唯一 head，
   继续以既有安全错误 fail-closed；
4. 只有 source selection 的 exact grant 等于 current exact grant，且模型可见 `relativePath` exact 相等时，才进入既有
   Artifact projection、lifecycle、capability lock 与 head-graph 检查；
5. proof material/digest domain 继续使用 `robothree.wfw-owned-artifact-proof.v1`，字段与计算规则不变。

不得把 grant 复制进 Step 来修复；不得将“同一路径”替代“同 grant + 同路径”；不得降低 unique terminal head、deleted、
source digest、capability lock 或 expected prior SHA 的任何检查。

## 4. 差异 B — loopback APV iframe CSP 与真实加载证明

### Step B1 — 安全策略 focused proof

先用静态与真实浏览器 focused proof 固定两侧策略。Renderer 父页面与 APV response 必须同时允许，单改一侧不算完成：

- Renderer 顶层只允许 frame 加载 exact IPv4 loopback HTTP host family，即 `http://127.0.0.1:*`；
- 不允许公网 HTTP/HTTPS、`localhost`、IPv6、`file:`、`data:`、`blob:` 或任意通配 origin；
- Renderer 自身 `connect-src 'none'`、`object-src 'none'`、`base-uri 'none'`、`form-action 'none'` 保持；
- iframe 继续是 `sandbox=""` 与 `referrerpolicy="no-referrer"`；
- APV response 当前 `frame-ancestors 'none'` 与产品既有 iframe 消费互斥。打包 Desktop 通过 `loadFile(...)` 加载 Renderer，
  因此 repair.2 只允许把该项改为 exact scheme parent `frame-ancestors file:`，并必须由 packaged Electron real-load proof
  证明；不允许省略该 directive，也不允许 `*`、`http:`、`https:` 或远端 ancestor；
- APV response 的 `default-src 'none'`、`script-src 'none'`、`connect-src 'none'`、`img/media/font/style-src 'none'`、
  `object/base/form-action 'none'`、`nosniff` 与 `no-store` 全部保持。

若 Chromium/Electron 不接受 `frame-src http://127.0.0.1:*` + `frame-ancestors file:` 这一双向精确组合，立即停手重新评审；
不得通过移除 `frame-ancestors`、扩大为 `http:`/`*` 或改造 preview transport 继续编码。

### Step B2 — real-load assertion

同一真实 Electron WFW-3 driver 在点击 HTML Artifact 后必须从 iframe 的真实加载结果取证，而不是只找节点：

1. iframe `src` 是 Main 返回的 tokenized loopback URL；
2. frame 完成导航，实际 document URL 与该 URL exact 相等；
3. frame 内出现本轮 WFW 文件中的非敏感 sentinel 文本；
4. script、network、top navigation、Node 与 opener 仍不可用；
5. preview close、切换 Artifact、TTL/窗口退出后，session/server/timer/temporary directory 按既有规则清理。

E2E 输出只能记录 `htmlPreviewDocumentLoaded=true` 等 content-free 布尔量，不输出 preview token、正文、路径、grant 或 proof。

## 5. 恢复父 WFW-3 的顺序

repair.2 focused tests 通过后，才恢复同一个 `ROBOTHREE_WFW3_E2E=true` 真实 Electron driver：

1. default Workspace create `index.html`；
2. HTML iframe 真实加载；
3. 同 Session owned replace；
4. target/new、`.prev`/old、唯一 terminal Artifact head；
5. Core `SIGKILL`、原 SQLite reopen、无重复 Result/Artifact；
6. 重启后 HTML iframe 再次真实加载；
7. explicit Workspace create `notes.md` 且不回落 default；
8. Markdown safe preview、uncertain 呈现与资源归零。

macOS E2E 通过后，repair.2 可以进入独立代码 QA；但父 WFW-3 仍不得 `PASS/CLOSED`，直到真实 Windows 11 本地 NTFS
create/replace/`.prev`/Artifact/Core restart 门禁通过。

## 6. Focused QA（16 项）

### 6.1 Durable replace authority（QA-001～QA-008）

- QA-001 source WFW Step payload 不含 `workspaceGrantId` 仍可由 readable Runtime Selection 取得 authority；
- QA-002 source/current exact grant + relative path + prior SHA 形成唯一 proof；
- QA-003 source grant 不同 fail-closed；
- QA-004 source readable selection 缺失、不可读或无 grant fail-closed；
- QA-005 relative path 不同 fail-closed；
- QA-006 ambiguous/deleted/source-digest mismatch/capability-lock missing 保持 fail-closed；
- QA-007 proof digest domain/material 与 WFW-2 不漂移；
- QA-008 grant/task/root/proof/content 不进入模型可见 payload、Observation、Artifact 或日志。

### 6.2 Loopback preview security（QA-009～QA-016）

- QA-009 Renderer CSP 仅 additive 允许 `http://127.0.0.1:*` frame；
- QA-010 remote HTTP/HTTPS、localhost、IPv6、file/data/blob child frame 仍拒绝；APV ancestor 只接受 packaged `file:`；
- QA-011 iframe empty sandbox 与 no-referrer 保持；
- QA-012 APV-1C response 仅 `frame-ancestors 'none' → file:`，其余 CSP、tokenized route、TTL 与 cleanup 不漂移；
- QA-013 Task-generated HTML frame 完成真实 document load；
- QA-014 manual Workspace HTML 与重启恢复后的 HTML 均完成真实 load；
- QA-015 PPTX/Markdown/Text/non-HTML routing 零回归；
- QA-016 Contract/migration/依赖/lockfile 零漂移，父 WFW-3/Windows 状态不被误关。

QA ID 必须恰为 16 个、连续唯一，不扩为新关闭账本。

## 7. 必跑门禁

按项目声明的 Node 24.13.0 / pnpm 11.11.0 串行执行：

```text
repair.2 Core authority focused tests
repair.2 Desktop CSP/security focused tests
WFW-2 focused 4 files / 85 tests
WFW-2 combined regression 7 files / 101 tests
WFW-3 Renderer/Main focused tests
Document Worker full 26 files / 222 tests
Core/Desktop typecheck
Desktop preload + renderer production build
focused ESLint
pnpm run audit:dtp4
git diff --check
real macOS Electron WFW-3 E2E
```

历史 Evidence/QA 保持只读；本 repair 不建立 Evidence schema，也不以历史时点 harness 的版本硬编码替代当前 focused gate。

## 8. 停手条件（14 项）

出现任一情况立即停止 repair.2 编码并回到文档评审：

1. 必须修改 public Contract、IPC、Preload API 或 Main preview routing；
2. 必须新增 migration、依赖、lockfile 变化、durable fact、状态机或错误码；
3. 必须把 private grant 写入模型可见 Step/Action 或 Renderer；
4. 无法从 source Task readable Runtime Selection 取得 exact authority；
5. 必须接受 legacy-only selection 才能恢复 active replace；
6. 必须弱化 unique terminal head、Artifact lifecycle、source digest、capability lock 或 prior SHA；
7. 必须允许跨 Session、跨 grant 或跨 relative path replace；
8. 必须新增第二套 Artifact ownership proof 或改变 proof digest domain；
9. Renderer child CSP 必须扩大到 `*`、`http:`、remote origin、localhost、file/data/blob 才能加载；
10. 必须移除 iframe sandbox/no-referrer、移除 `frame-ancestors`，或把 APV ancestor 扩大到 `file:` 以外的 scheme；
11. 只能证明 iframe DOM 存在，无法证明真实 document load；
12. 必须使用 Renderer 文件直读、`v-html`、fixture success 或绕过 Main-owned tokenized route；
13. repair.2 会改变 PPTX/Markdown/Text/manual Artifact 的既有 routing；
14. macOS E2E 暴露第三个需要生产改动的新根因。

## 9. 独立评审问题

1. repair.2 是否严格只有 durable source authority 与 loopback CSP 两项差异？
2. grant authority 是否只来自 source Task durable readable Runtime Selection？
3. 模型可见 payload 是否继续不含 private grant/ownership proof？
4. ambiguous/deleted/different-grant/different-path 是否继续 fail-closed？
5. proof digest domain/material 是否保持 WFW-2 frozen 语义？
6. Renderer CSP 是否只允许 exact IPv4 loopback frame family，而非一般网络访问？
7. 双向 CSP 是否精确为 Renderer `frame-src http://127.0.0.1:*` 与 APV `frame-ancestors file:`，其余
   sandbox/CSP/token/TTL/cleanup 是否保持？
8. E2E 是否证明真实 document load，而不是 iframe DOM 存在？
9. public Contract/migration/依赖/lockfile 是否零变化？
10. repair.2 通过后是否只恢复父 E2E，而不跳过 Windows NTFS 门禁？

全部答案必须为“是”，方案才可冻结并等待用户单独编码授权。

## 10. 预计工时与下一步

- Core authority focused proof + 修正：0.3～0.5 日；
- Renderer CSP/security focused proof：0.2～0.4 日；
- 同一 macOS Electron E2E 恢复与实施报告：0.3～0.6 日；
- 合计：0.8～1.5 个集中工程日，不含独立 QA 与 Windows runner 排队。

计划评审、编码、独立代码 QA 与用户接受均已完成，repair.2 正式 `PASS/CLOSED`。独立 QA 的 176/179 数量差异为
测试集合超集精度记录，不建立 repair；外部 P3 不归因本批。父 WFW-3 仍须等待真实 Windows 11 本地 NTFS 门禁。
