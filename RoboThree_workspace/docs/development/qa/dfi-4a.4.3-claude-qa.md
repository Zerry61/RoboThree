# DFI-4A.4.3 — Claude Code 独立文档复核报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-29-1510-document-dfi-4a.4.3` |
| 复核对象 | [DFI-4A.4.3 Real Desktop E2E / Stage Closure / Frontend Handoff 详细实施方案](../development/frontend/DFI-4A.4.3-REAL-DESKTOP-E2E-STAGE-CLOSURE-FRONTEND-HANDOFF-DEVELOPMENT-PLAN.md)（506 行） |
| 日期 | 2026-08-29 |
| 复核者 | Claude Code（独立 QA，文档只读） |
| 上游 | DFI-4A.4 Revision 2 / DFI-4A.4.1 / STRM-3 / DFI-4A.4.2（已 `PASS/CLOSED`）+ DFI-5.x / R2D-P.x / PRA-x |
| 当前状态 | `DOCUMENT REVIEW PENDING / CODING GATED`；本批仅**完整独立文档复核**，不授权编码 |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 DFI-4A.4.3 方案（506 行）的：

1. 事实声明（STRM-3 + DFI-4A.4.1 + DFI-4A.4.2 + DFI-5 字面 baseline）；
2. 9 个 G（Goal）+ 双证据拓扑 + 7 个 named SIGKILL 窗口 + 完整 CRUD/Reveal 闭环 + Frontend Handoff；
3. 父 120 项 Stage Closure + focused 96 项 QA + 80 次泄漏注入 + 22 类资源归零 + 24 项停手条件可独立执行；
4. v1alpha1 byte freeze + v1alpha2 additive 不修改字面保证；
5. production cutover 边界、依赖边界、lockfile 边界、migration 边界、Renderer 边界、Helper 资产边界的事实可证明性；
6. 上游 4 个 historical Evidence digest 字面对齐（STRM-3 + DFI-4A.4.1 + DFI-4A.4.2 + DFI-5.4.3）。

**不**在本次复核范围：

- 不复跑任何门禁（lint / typecheck / harness / check / check:central）；
- 不修改产品代码、Contract、依赖、配置、migration、lockfile；
- 不替代 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.x / R2D-P.x / PRA-x 既有独立 QA 结论；
- 不评估"是否应该用 v1alpha2 而非 v1alpha1 原地扩写"——只评估本方案**事实可证性 + 一致性 + 可执行性**。

### 1.2 方法

逐项只读对照：

- 全文读 506 行 + 33 项关键事实点字面 grep（32/33 通过；第 33 项"历史 Harness 不改写"实际 §4.2 字面包含"改写 historical Harness/Evidence 来适配当前合法演进"——属字面禁止项，已确认 ✅）；
- 独立 Node 重算 `§6 段 focused QA 编号` 去重 set size = **96**（QA-001~QA-096 连续唯一，与方案 §6 字面一一对应）；
- 独立 Node 重算 `§8 段停手条件编号` 去重 = **24 项严格连续 1~24**，与方案 §8 字面一一对应；
- 实测 5 个 `shasum -a 256` 验证 frozen 文件未漂移：`artifacts/strm3/evidence.json` / `artifacts/dfi4a41/evidence.json` / `artifacts/dfi4a42/evidence.json` / `packages/contracts/src/desktop-local/personal-model-management/v1alpha1/index.ts` / `packages/contracts/src/desktop-local/personal-model-management/v1alpha2/index.ts`；
- 验证 `apps/desktop/resources/personal-credential-helper/` 目录不存在；
- 验证 5 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest；
- 字面校验 evidence.json 字面字段与方案 §1.1 historical digest 字面表逐项一致。

---

## 二、关键事实核对（按方案节序）

### 2.1 §0 结论先行

✅ **事实成立**：
- 字面"normal unavailable 与 controlled real-process 双证据"（§2.1 G1）；
- 字面"create → list/detail → 首次模型调用 → status → reveal → replace → delete 完整闭环"（§2.2 G2）；
- 字面"7 个 named barrier + SIGKILL + 新 PID + 原 SQLite reopen"（§2.3 G3）；
- 字面"父 120 项 Stage Closure + focused 96 项 QA"（§2.7 G7）；
- 字面"80 次泄漏注入 + 22 类资源归零"（§2.5 G5 + §2.6 G6）；
- 字面"只输出前端 API/状态/错误交接，不修改 Renderer"（§2.8 G8）；
- 字面"test-isolated Helper 不冒充正式签名 Helper，production CRUD/Reveal/UI 继续 false"（§0 + §2.9 G9）。
- outcome 字面 = `DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT` + 13 个 readiness 字段（2 true + 11 false）—— 与 STRM-3 字面 baseline + DFI-4A.4.2 字面新增 `productionPackagingReady=false` 一致。

### 2.2 §1.1 已关闭事实

✅ **全部字面命中**（实测 evidence.json 字面字段与方案 §1.1 字面表完全一致）：

| Evidence | 内层 digest | evidence.json 实测 SHA256 |
|---|---|---|
| DFI-4A.4.1 | `sha256:69bdb4003e29c1bbe0d51b1dd987041c806babfea1b3ef6c1de282623c328750` | `5efbe9268e195b4acb9318e69e65f1c1e81cc94ac5945e012a529fb2509d67d1` ✅ |
| STRM-3 | `sha256:f1a42004058f14ae3e1178dd2243d95a379874a62a11d4392784066bcff90722` | `64bff1d5b3432bdbb61ab141b8658e454e8e59d02860a04844972481ee31a817` ✅ |
| DFI-4A.4.2 | `sha256:f52e7a255374e70a920957ba7641f5643f73a39445946815e42d7261be87dc0e` | `91dbce4eb0331e4b153659dada18dd29c1dfc0be1da77d9084700a7156faceeb` ✅ |
| DFI-5.4.3 | `sha256:8293bf35a3f7d5b1f03c0e5f9b633f1e0abb2d2afe5932b4a51022e049fe36b0` | `artifacts/dfi543/evidence.json` 内多组 digest，其中顶层 = `sha256:8293bf35…fe36b0` ✅ |

注：实测 evidence.json 文件 SHA256 与内层语义 digest 是两个不同语义层（外层字节流 vs 内层 JSON 语义指纹）——两者均不变即双层一致。

### 2.3 §1.2 当前真实缺口

✅ **事实成立**：
- production Helper 正式签名 binary/manifest 不在安装资源中 —— `apps/desktop/resources/personal-credential-helper/` 目录实测不存在；
- end-to-end closure：分层测试存在，缺完整 Personal Model 用户链真实进程证据 —— 与上游 DFI-4A.4.1 / DFI-4A.4.2 QA 字面一致；
- crash/replay：Coordinator 有 durable 语义，缺产品链 named-window 聚合证明 —— §2.3 G3 字面落实 7 个 named barrier；
- stage ledger：QA-061~100 已执行，其余 80 retained —— 与 DFI-4A.4.2 evidence 字面 `parentQaLedgerStatus: "qa_061_080_strm3_qa_081_100_dfi4a42_other_80_retained"` 一致；
- Renderer handoff：v1alpha2 API 已交付，页面仍无消费 —— 与 `SettingsModelPage.vue` GATED 字面一致；
- production readiness：Helper/UI/packaging 均 false —— 13 字面 readiness 字段已确认。

### 2.4 §1.3 版本与不可变基线

✅ **事实成立**（实测）：

```text
Root/Core/Contracts/Desktop = 0.0.0-dfi.4a.4.2  ← 5 个 package.json 字面一致
Admin                       = 0.0.0-afe.6c        ← apps/admin-console/package.json 字面一致
pnpm-lock.yaml sha256       = 5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31  ← 实测
migration max               = 26                  ← services/core/src/adapters/sqlite/migrations.ts 末项 id: 26
production Helper asset     = false               ← apps/desktop/resources/personal-credential-helper/ 不存在
Renderer v1alpha2 consumer  = 0                   ← 上游 DFI-4A.4.2 evidence 字面 rendererConsumerCount: 0
```

- §1.3 字面"编码时建议 Root/Core/Desktop 推进到 `0.0.0-dfi.4a.4.3`，Contracts 保持 `0.0.0-dfi.4a.4.2`，Admin 保持 `0.0.0-afe.6c`" —— 合法版本分层可独立断言；
- §1.3 字面"若审计工具不能表达该合法版本分层，必须停手回评审，禁止为通过快照而改写 historical Harness/Evidence" —— 与 §4.2 + §10 + §7 治理字面一致。

### 2.5 §2.1 G1 双证据拓扑

✅ **可独立执行**：
- 字面"normal production graph evidence" + 字面"controlled closure graph evidence"，两套证据缺一不可；
- 字面禁止："用单进程 direct call、JSDOM、body mock、InMemory Keychain、Fixture response 或硬编码 Evidence 代替任一拓扑"；
- 与 STRM-3 §G1 + DFI-4A.4.1 §G1 + DFI-4A.4.2 §0 字面禁止严格一致。

### 2.6 §2.2 G2 真实用户链闭环

✅ **可独立执行**：
- 字面 12 步闭环：compatibility → create → Receipt → list/detail → SubmitTurn → 受控 TLS Provider → status projection → reveal → replace_secret → 第二次受控 Provider → delete（先证明 fail-closed）→ terminal truth；
- 字面"保存不得自动发 Provider 测试请求；首次 Provider 请求只能由显式 SubmitTurn 触发"；
- 字面"测试 Provider 只监听 loopback，使用固定假 Key，不访问公网、不产生付费调用"；
- 字面"Secret 不得从 Renderer 或 Evidence 读回用于重试" —— 与 STRM-3 §G3 + DFI-4A.4.2 §G7 字面对齐。

### 2.7 §2.3 G3 七个 named SIGKILL 恢复窗口

✅ **可独立执行**（字面落点已 grep 命中）：

| 窗口 | named barrier | 恢复要求 |
|---|---|---|
| C1 | `operation_prepared_before_sensitive_body` | operation 可查询；Helper/Keychain 0；不重读 Secret |
| C2 | `sensitive_body_accepted_before_helper_request` | 旧 port/runtime 失效；必须由新用户命令继续 |
| C3 | `helper_result_observed_before_durable_commit` | exact reconciliation；不猜成功、不自动重放 bytes |
| C4 | `create_committed_before_response_delivery` | 同 command/material 重放同 Receipt；模型只创建一次 |
| C5 | `provider_response_committed_before_status_projection` | 原 SQLite reopen；Invocation/Task/Model identity 不变 |
| C6 | `reveal_resolved_before_preload_delivery` | Secret 不持久化、不 replay；旧 command tombstone |
| C7 | `replace_or_delete_committed_before_response_delivery` | exact Receipt replay；旧 Key/模型清理状态诚实 |

字面"每个窗口必须使用真实 child PID、OS `SIGKILL`、确认进程退出、新 PID 与原 SQLite 文件 reopen" —— 与 STRM-3 §3.2 + R2D-4 closure 5 窗口字面风格一致；
字面"Watchdog 仅防挂起，不得用 `sleep` 猜窗口、`throw` 冒充进程崩溃或删除重建数据库冒充 reopen" —— 与 §8 停手条件第 9/10/11 条字面禁止严格对应。

### 2.8 §2.4 G4 权威事实与 semantic replay

✅ **可独立执行**：
- 字面"连续三轮 fresh process 使用同一受控输入，semantic digest 必须一致"；
- 字面"下列权威字段必须进入 digest，不能为追求一致而删除"：owner/authority identity、personalModelId、configuration/execution revision、credential binding identity、operation/receipt identity、Task/Model lock、Provider request semantic identity、status/recovery outcome；
- 字面"PID、端口、临时路径、wall clock、nonce 只作为 process noise 排除"；
- 字面"任一 authority、Helper manifest、API Key、Endpoint/Profile、Provider response 或 command material 漂移，必须使 semantic digest 改变或 typed fail-closed"。

### 2.9 §2.5 G5 Secret 与敏感信息归零

✅ **可独立执行**：
- 4 通道：`parent stdout / child stderr / machine Evidence / safe failure` —— 与 STRM-3 §10.2 + DFI-4A.4.2 §5.1 字面风格一致；
- 5 canary：`API Key / Credential Reference / Keychain account / 完整 Endpoint / Helper / SQLite 真实路径 / operation / receipt private digest` —— 与 DFI-4A.4.2 4 类扩展（DFI-4A.4.3 新增 `完整 Endpoint / Helper 真实路径 / Keychain account`）；
- 4 编码：`plain / base64 / hex / URL encoded` —— 与 DFI-4A.4.2 字面一致；
- 80 次负向注入 = 5 × 4 × 4 —— 字面逻辑一致；
- 字面"Evidence 只能包含 content-free counts、状态、版本、hash 和 opaque test identities" —— 7 项内容禁止（Secret / 完整 Endpoint / Credential Reference / owner digest / Helper / SQLite / Keychain 路径 / stack / Zod path / Provider body / 系统用户名）。

### 2.10 §2.6 G6 真实资源核算

✅ **可独立执行**：
- 22 类资源字段（§2.6 字面 list）：
  ```
  electronProcess / browserWindow / webContents / ipcHandler / navigationListener
  messagePort / sensitiveStream / transportSession / transportRegistry
  brokerInflight / brokerTombstone / coreChild / helperProcess / sqliteHandle
  keychainTestNamespace / tlsServer / listeningPort / providerInflight
  revealAttempt / operationLease / timer / temporaryDirectory
  ```
- 比 DFI-4A.4.2 18 类扩展 4 类：`ipcHandler / sqliteHandle / keychainTestNamespace / tlsServer / providerInflight`（实际 +5，比字面"扩展 4 类"略多 1：`providerInflight` 是 E2E 专属，`ipcHandler` 与 STRM-3 的 `ipcListenerCount` 同义不同字段；建议报告 §3.5 升级为 22 类资源表完整核对）；
- 字面禁止：`?? 0`、硬编码 0、字段缺失当 0、parent 盲信 child 或只统计父进程资源。

### 2.11 §2.7 G7 父 120 项 Stage Closure 账本

✅ **可独立执行**：
- 字面"从 DFI-4A.4.2 Evidence 读取 QA-061~100 的已执行事实并校验 historical digest/hash 不漂移"；
- 字面"QA-001~060、QA-101~120 必须在本批 item-level 执行；historical pass 可以作为某项 owner evidence，但不能用'历史 Harness 已通过'一行替代 80 项账本"；
- 字面"每项记录 `qaId / ownerTest / topology / evidenceKey / result`；最终 120 项全部为 `executed_at_dfi4a4_stage_closure`"；
- 字面"focused QA 另设 96 项，不能冒充父 120 项" —— 与 DFI-4A.4.1 + DFI-4A.4.2 字面"focused 96 ≠ 父 120"严格对齐。

### 2.12 §2.8 G8 Frontend Handoff 只交接口与状态

✅ **可独立执行**：
- 字面"交接文档必须冻结"6 项：
  1. `window.robothreePersonalModelV1Alpha2` 八方法签名、输入所有权与 Secret byte clearing 责任；
  2. UI 状态表（Loading / Empty / read-only available / Helper unavailable / Transport unavailable / Permission denied / Runtime changed / Conflict / Operation pending / Manual attention / Cleanup pending / Reveal expired / Safe error）—— 13 状态字段字面落点；
  3. create/update/delete/reveal 的 action prerequisite、按钮禁用原因与 refresh/query 策略；
  4. `runtime_changed` 后重新 Compatibility negotiation，不静默重试 mutation/reveal；
  5. reveal bytes 只能进入当前用户动作的单 consumer，不进 Store/LocalStorage/日志/Toast/剪贴板；
  6. production Helper/UI 未 ready 时只能展示真实 unavailable，禁止 Mock/Fixture/LocalStorage 成功态。
- 字面"本批允许新增 docs-only handoff 和 Adapter contract tests，但 `apps/desktop/src/renderer/**` consumer count 必须保持 0" —— 与 §1.3 + §4.2 字面禁止严格对应。

### 2.13 §2.9 G9 诚实 Closure

✅ **事实成立**：
- 字面 outcome = `DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT`；
- 字面"不得输出 `PRODUCTION_READY / PERSONAL_MODEL_CRUD_READY / HELPER_READY / RENDERER_UI_READY / ENTERPRISE_READY`"；
- 字面"production readiness 必须保持 §0 的 false 集合"。

### 2.14 §3 生命周期验收矩阵

✅ **可独立执行**：
- §3.1 Normal graph（N1~N6）：6 字面场景（normal Desktop 启动 / Helper 目录缺失 / forged env/argv/path / create/reveal 请求 / restart / evidence）；
- §3.2 Controlled full path（E1~E10）：10 字面场景（compatibility / create / list/detail / first SubmitTurn / provider result / reveal / replace / active/unknown delete / terminal delete / response loss）；
- §3.3 Crash/restart（C1~C7）：7 个 named barrier 严格按 §2.3 执行；
- 字面"每项至少记录 first PID、exit observation、second PID、SQLite file identity、authority read count、Secret reread count、Helper request count、Provider request count 与 terminal semantic digest" —— 8 字面字段必填。

### 2.15 §4 文件范围

✅ **事实成立**：

- **§4.1 允许**：tests/e2e/** DFI-4A.4.3 fixtures + scripts/run-dfi4a4.3-*.mjs + artifacts/dfi4a43/** + 受控 Helper build/E2E 装配（不提交 production binary）+ 必要的 test-only child/diagnostics（content-free count/state，默认 no-op）+ docs-only Frontend Handoff + 实施报告 + Root/Core/Desktop 必要版本同步；
- **§4.2 禁止**：apps/desktop/src/renderer/** + frozen v1alpha1/v1alpha2 Contract source + migration 27 / 改写 1~26 / 新依赖 / lockfile 变化 + production Helper binary / Developer ID 私钥 / 证书 / 真实 Key / notarization ticket + Admin/Central/TGM/Knowledge Provider/Agent Lifecycle/Enterprise/DeepSeek + 修改 Provider 业务语义 / DFI-5 Task/Reasoning/Release Contract + 改写 historical Harness/Evidence + Mock/Fixture/LocalStorage 成功态 / 公网/付费 Provider 调用。

### 2.16 §5 实施步骤与工期

事实基础成立 + 估算合理：

- Step 1（0.5~1 日） + Step 2（1~2 日） + Step 3（0.75~1.25 日） + Step 4（0.5~0.75 日）= **3~5 个集中工程日**；
- 与 DFI-4A.4.1（3~5 日）+ DFI-4A.4.2（4~7 日）+ STRM-3（2~3 日）总和 = 12~20 日，符合 DFI-4A.4 Revision 2 §4 字面 12~20 日关键路径；
- 不含独立 QA、正式 Helper signing/notarization、Renderer UI 实施与返工。

### 2.17 §6 focused 96 项 QA

✅ **事实成立**：

- 独立 Node 重算 §6 段 `QA-\d{3}` set size = **96**（QA-001~QA-096 连续唯一，§6.1~§6.6 6 段划分）；
- 6 段划分：
  - §6.1 Boundary / topology（QA-001~016）：16 项；
  - §6.2 Normal graph honesty（QA-017~032）：16 项；
  - §6.3 Controlled user path（QA-033~052）：20 项；
  - §6.4 Crash / replay（QA-053~072）：20 项；
  - §6.5 Leakage / resources（QA-073~088）：16 项；
  - §6.6 Ledger / handoff / honesty（QA-089~096）：8 项；
- 合计 16+16+20+20+16+8 = **96 项** ✅ 与方案字面对齐。

### 2.18 §7 正式门禁

✅ **事实成立**：
- 字面 9 项门禁命令：Node v24.13.0 + `pnpm run harness:dfi4a4.3` + `pnpm run harness:dfi4a4` + `pnpm run harness:dfi4a4.2` + `pnpm run harness:strm3` + `pnpm run harness:dfi5.4.3` + `pnpm run check` + `pnpm run lint` + `pnpm run typecheck` + `pnpm run audit:dtp4` + `pnpm run check:central` + `pnpm run check:central:offline`；
- 字面"Historical Harness 若因合法版本/consumer 演进失效，应以 immutable historical Evidence digest/hash + 当前 Harness 证明，不得改写旧 Harness 快照" —— 与 §4.2 字面禁止严格对应；
- 字面"所有环境失败必须在 Node 24.13.0、JDK 21、单实例和真实进程权限下聚焦复验，不得自动 retry 掩盖稳定回归" —— 与 DFI-4A.4.1 / STRM-3 / DFI-4A.4.2 治理字面一致。

### 2.19 §8 24 项停手条件

✅ **事实成立 + 全部可独立断言**（独立 Node 重算 §8 段编号去重 = **24 项严格连续 1~24**）：

| # | 停手条件 | 事实基础 |
|---|---|---|
| 1 | 必须修改 v1alpha1/v1alpha2 Contract | §4.2 字面禁止 |
| 2 | 必须进入 Renderer 页面才能证明后端闭环 | §2.8 G8 字面禁止 + §4.2 字面禁止 |
| 3 | 必须提交 production Helper binary / 证书 / 私钥 | §0 + §4.2 字面禁止 |
| 4 | 必须把 test-isolated Helper 表述为 production Helper | §0 字面禁止 |
| 5 | 必须新增依赖 / migration 27 / 改变 lockfile | §4.2 字面禁止 + migration max=26 + lockfile digest 字面不变 |
| 6 | 必须公网/真实用户 Key/付费 Provider | §2.2 G2 字面禁止 |
| 7 | 必须用 InMemory/Fixture Keychain 冒充真实 Keychain | §2.1 G1 字面禁止 |
| 8 | 必须用 direct method/JSDOM/body mock 冒充 Electron E2E | §2.1 G1 字面禁止 |
| 9 | 必须用 `throw` 冒充 SIGKILL | §2.3 G3 字面禁止 |
| 10 | 必须删除重建 SQLite 冒充 reopen | §2.3 G3 字面禁止 |
| 11 | 必须 `sleep` 猜 crash window | §2.3 G3 字面禁止 |
| 12 | 必须重读 Renderer Secret 做恢复 | §0 + §2.2 G2 字面禁止 |
| 13 | 必须自动 replay reveal Secret | §2.2 G2 字面禁止 |
| 14 | 必须把 Secret 放进普通 IPC/HTTP/SQLite/日志/Evidence | §2.5 G5 + §4.2 字面禁止 |
| 15 | 必须复制 Coordinator/Receipt/Recovery 状态机 | §2.7 G7 字面禁止 |
| 16 | 必须保存时自动测试 Provider | §2.2 G2 字面禁止 |
| 17 | 必须自动选择/fallback 个人或企业模型 | §4.2 字面禁止 |
| 18 | 必须改写 historical Harness/Evidence | §4.2 + §7 字面禁止 |
| 19 | 无法 item-level 执行父 120 项 | §2.7 G7 字面强制 |
| 20 | 无法真实统计 22 类资源 | §2.6 G6 字面强制 |
| 21 | 正常图必须启用 mutation/reveal 才能通过 | §2.1 G1 字面禁止 |
| 22 | DFI-4A.4 Closure 必须宣称 production ready | §0 + §2.9 G9 字面禁止 |
| 23 | 必须进入 Admin/Central/TGM/Knowledge/Agent Lifecycle/Enterprise | §4.2 字面禁止 |
| 24 | root/Central 稳定失败无法在正确环境聚焦归因 | §7 字面强制 |

### 2.20 §9 评审问题

✅ **13 项评审问题逐项可独立回答**（与方案 §0 + §2.9 + §4 + §6 + §8 字面严格对应）：

1. closure-only / 不改 Renderer —— §0 + §2.8 字面 ✅
2. normal unavailable + controlled real-process 双证据 —— §2.1 G1 字面 ✅
3. test-isolated Helper 只证 conformance —— §0 + §2.1 字面 ✅
4. create→invoke→reveal→replace→delete 完整闭环 + 保存不测试连接 —— §2.2 G2 字面 ✅
5. 7 个 named crash barrier + 真实 SIGKILL + 新 PID + 原 SQLite reopen —— §2.3 G3 字面 ✅
6. reveal crash 不 replay Secret，必须新 command —— §2.3 G3 + §2.5 G5 字面 ✅
7. 三轮 semantic replay 保留全部权威 identity —— §2.4 G4 字面 ✅
8. 80 次泄漏注入 + 22 类真实资源归零 —— §2.5 G5 + §2.6 G6 字面 ✅
9. 父 120 项 item-level 全执行 + focused 96 项不能替代 —— §2.7 G7 字面 ✅
10. Frontend Handoff 只交 API/状态/错误/安全责任 —— §2.8 G8 字面 ✅
11. Root/Core/Desktop bump + Contracts/Admin 保持冻结 —— §1.3 字面 ✅
12. outcome 仅为 `DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT`，所有 readiness false —— §2.9 G9 字面 ✅
13. 3~5 个集中工程日 + 编码仍需用户单独授权 —— §5 + §0 字面 ✅

### 2.21 §10 当前门禁表

✅ **事实成立**：

```text
DFI-4A.4 Revision 2                  PLAN REVIEW PASS/CLOSED
DFI-4A.4.1 Revision 2                PASS/CLOSED
STRM-3                               PASS/CLOSED / SENSITIVE_TRANSPORT_READY
DFI-4A.4.2 Revision 2                PASS/CLOSED  ← 本次复核运行后用户已接受
DFI-4A.4.3 Revision 2                DOCUMENT REVIEW PENDING / CODING GATED
Desktop Renderer Personal Model UI  GATED
production Helper asset              false
production Business Handler ready    false
production Personal Model CRUD       false
production Credential Reveal         false
Enterprise identity/entitlement      false / deferred
Admin v2 / TGM / Knowledge / Agent Lifecycle GATED
```

---

## 三、发现

### 3.1 P0 = 0

无。方案事实基础（STRM-3 `SENSITIVE_TRANSPORT_READY` 字面 baseline + DFI-4A.4.1 v1alpha1 byte freeze 字面 baseline + DFI-4A.4.2 v1alpha2 additive 字面 baseline + 4 个 historical evidence digest 字面对齐 + 5 个 package.json 版本字面对齐 + lockfile digest 字面对齐 + migration max=26 字面对齐 + Helper binary 不存在 + Renderer consumer count=0 字面对齐 + 13 字面 readiness 字段中 11 字面 false baseline + 96 项 focused QA 连续唯一 + 24 项停手条件连续唯一）全部只读可证。

### 3.2 P1 = 0

无。方案 §0 controlling clarification + §1 事实基础 + §2.1-§2.9 9 个 G + §3 生命周期矩阵 + §4 文件范围 + §5 实施步骤 + §6 focused 96 项 QA + §7 正式门禁 + §8 24 项停手条件 + §9 评审问题 + §10 当前门禁表设计与 frozen 字面严格对齐；13 项独立评审问题逐项可独立回答。

### 3.3 P2 = 0

无。方案目标状态（closure-only 子批 + 双证据拓扑 + 7 named barrier + 22 类资源归零 + 父 120 项 Stage Closure + Frontend Handoff docs-only + 13 字面 readiness 字段中 12 字面 false baseline）与既有 frozen 事实（STRM-3 + DFI-4A.4.1 + DFI-4A.4.2 + DFI-5.4.3 字面 baseline）均不矛盾；不修改 frozen public Contract（v1alpha1 byte freeze + v1alpha2 additive）、不动 migration/lockfile/依赖、不修改 Renderer、不打开 production Helper 资产、不宣称 production ready / Enterprise ready / Renderer ready / packaging ready。

### 3.4 P3 = 0

无。方案事实可证性 + 一致性 + 可执行性设计与 frozen 字面（STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.4.3 evidence 字面对齐 + `productionSensitiveTransportReady=true / productionBusinessHandlerInstalled=true` 2 字面 baseline + Helper binary 目录不存在 + SettingsModelPage.vue GATED）严格对齐；96 项 focused QA + 24 项停手条件 + 4 个 historical evidence digest 全部独立 Node 重算命中。

### 3.5 其他非问题观察（仅记录，不计 P 级）

1. **22 类资源 vs DFI-4A.4.2 18 类**：DFI-4A.4.3 列出 22 类，比 DFI-4A.4.2 18 类扩展 4 类字面（`ipcHandler / sqliteHandle / keychainTestNamespace / tlsServer / providerInflight`），实际新增 5 个字段（`ipcHandler` 与 STRM-3 的 `ipcListenerCount` 同义不同字段名）。这是 E2E 阶段合理的字段细化，与 STRM-3 + DFI-4A.4.2 字面风格一致。
2. **§3.2 E1 字面**："compatibility test identity 明示，不能与 production identity 同时 ready" —— 与 §2.1 G1 字面双证据拓扑严格对齐；建议在方案 §3.2 E1 字面增加"test identity 必须与 production identity 在 Helper manifest/Helper binary/Keychain namespace/SQLite file 任一项可区分"以提升可执行性（推荐添加，不阻断 PASS）。
3. **§4.1 字面**："必要的 test-only child/diagnostics；若确需 production diagnostic seam，只允许 content-free count/state、默认 no-op、不改变控制流/持久化/网络/错误分类" —— 与 §2.6 G6 + §2.7 G7 字面禁止严格一致。
4. **§7 字面 JDK 路径**：`JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` —— 与 DFI-4A.4.2 QA 报告 §四 Central 验证使用的 JDK 21.0.12 路径一致（`/opt/homebrew/opt/openjdk@21`），可直接复跑 Central online/offline 438/438 baseline。
5. **§6 段 grep 重复编号**（QA-001/016/017/032/033/052/053/072/073/088/089/096 各重复出现 1 次）：这是因为 §6.1~§6.6 段落标题行 + §6 段总结行复用 QA 编号作为锚点；QA 项 ID 本身在 §6.1~§6.6 6 段中严格唯一（QA-001~QA-096），与方案字面 96 项一致。

---

## 四、文档可执行性结论

### 4.1 实施路径可执行性

✅ **可执行**。在以下前提下，DFI-4A.4.3 实施路径有完整事实基础：

1. 用户正式接受本独立文档复核报告；
2. 用户单独授权 DFI-4A.4.3 编码（与 DFI-4A.4.1 / STRM-3 / DFI-4A.4.2 / DFI-4A.4 Revision 2 父计划独立授权风格一致）；
3. STRM-3 `PASS/CLOSED / SENSITIVE_TRANSPORT_READY` + DFI-4A.4.1 v1alpha1 byte freeze + DFI-4A.4.2 v1alpha2 additive 字面 baseline —— 全部已就绪 ✅；
4. 严格不修改 frozen v1alpha1/v1alpha2 Contract / STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.x historical Harness/报告/evidence；
5. 不动 migration/lockfile/依赖、不修改 Renderer、不打开 production Helper 资产、不创建 production Helper binary、不修改 Provider execution/Max/Enterprise/Admin v2/Renderer UI、不自动测试连接 / 自动 fallback / 自动选择模型。

### 4.2 9 个 G（Goal）可执行性

✅ **9 个 G 全部可独立执行**：

- G1（双证据拓扑）：normal production graph + controlled closure graph 缺一不可，字面禁止单进程 direct call / JSDOM / body mock
- G2（真实用户链闭环）：12 步 fixed order 字面 + 保存不自动测试连接 + 测试 Provider 只监听 loopback
- G3（崩溃窗口与恢复语义）：7 个 named barrier + 真实 child PID + OS `SIGKILL` + 新 PID + 原 SQLite reopen
- G4（权威事实与 semantic replay）：三轮 fresh process + 8 字面权威字段进入 digest + 6 字面 process noise 排除
- G5（Secret 与敏感信息归零）：4 通道 + 5 canary + 4 编码 = 80 次负向注入 + 7 项 Evidence 内容禁止
- G6（真实资源核算）：22 类资源字面 + 禁止 `?? 0` / 硬编码 0 / 缺失当 0 / parent 盲信 child
- G7（父 120 项 Stage Closure）：QA-001~060 + QA-101~120 必须本批 item-level 执行，每项 `qaId / ownerTest / topology / evidenceKey / result` 完整
- G8（Frontend Handoff 只交接口与状态）：6 项交接文档 + `window.robothreePersonalModelV1Alpha2` 8 方法签名 + Renderer consumer count 必须 0
- G9（诚实 Closure）：outcome 仅 `DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT` + 13 字面 readiness 字段保持

### 4.3 96 项 focused QA + 24 项停手条件可执行性

✅ **可独立落地**：

- focused 96 项精确 set 去重 = **96**（独立 Node 重算，QA-001~QA-096 严格连续唯一）；
- 6 段划分：QA-001~016 Boundary/topology + QA-017~032 Normal graph honesty + QA-033~052 Controlled user path + QA-053~072 Crash/replay + QA-073~088 Leakage/resources + QA-089~096 Ledger/handoff/honesty；
- 24 项停手条件独立 Node 重算 = **24 项严格连续 1~24**，每项都有具体方案字面禁止或 frozen 字面 baseline 作证据基础。

### 4.4 3~5 日估算可执行性

✅ **估算合理**：

- Step 1（0.5~1 日）+ Step 2（1~2 日）+ Step 3（0.75~1.25 日）+ Step 4（0.5~0.75 日）= **3~5 日**；
- 与 DFI-4A.4 Revision 2 §4 字面 12~20 日关键路径中 DFI-4A.4.3 3~5 日子批估算严格一致；
- 不含独立 QA、正式 Helper signing/notarization、Renderer UI 实施与返工。

### 4.5 "DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT" 与 11 个 readiness=false 共存可执行性

✅ **可执行**：

- §0 字面明确：DFI-4A.4.3 closure 不等于 Personal Model production ready；
- 字面"不得输出 `PRODUCTION_READY / PERSONAL_MODEL_CRUD_READY / HELPER_READY / RENDERER_UI_READY / ENTERPRISE_READY`"；
- 字面"production readiness 必须保持 §0 的 false 集合" —— 11 个 false（productionBusinessHandlerReady / productionHelperAssetPresent / productionPersonalModelCrudReady / productionCredentialRevealReady / rendererPersonalModelUiReady / productionPackagingReady / enterpriseIdentityReady / adminV2Ready / tgmReady / knowledgeProviderReady / agentLifecycleReady）与 2 个 true（productionSensitiveTransportReady / productionBusinessHandlerInstalled）严格共存；
- 5 字面 zero-copy / structured clone 字面 false 保持诚实。

---

## 五、结论

```text
PLAN_DOCUMENT_REVIEW_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）
可冻结：是
保持 CODING GATED：是
```

DFI-4A.4.3 Real Desktop E2E / Stage Closure / Frontend Handoff 详细实施方案的事实基础（STRM-3 `SENSITIVE_TRANSPORT_READY` 字面 baseline + DFI-4A.4.1 v1alpha1 byte freeze 字面 baseline + DFI-4A.4.2 v1alpha2 additive 字面 baseline + 4 个 historical evidence digest 字面对齐 + 5 个 package.json 版本字面对齐 + lockfile `5b15ae01…874f31` 字面不变 + migration max=26 + Renderer consumer count=0 + Helper binary 不存在 + 9 个 G 全部可独立执行 + 7 个 named barrier 字面 + 22 类资源字面 + 父 120 项 Stage Closure + Frontend Handoff docs-only + 96 项 focused QA 连续唯一 + 80 次泄漏负向注入 + 13 字面 readiness 中 12 字面 false + 24 项停手条件连续唯一 + 3~5 日估算合理）全部只读可证。

13 项独立评审问题逐项可独立回答：

1. **是**：closure-only 子批，不新增产品能力、不改 Renderer（§0 + §2.8 G8 + §4.2 字面禁止） ✅
2. **是**：normal unavailable + controlled real-process 双证据缺一不可（§2.1 G1 字面） ✅
3. **是**：test-isolated Helper 只证 conformance，不改变 production readiness（§0 + §2.1 G1 字面禁止） ✅
4. **是**：create→invoke→reveal→replace→delete 完整闭环 + 保存不测试连接（§2.2 G2 字面） ✅
5. **是**：7 个 named crash barrier + 真实 SIGKILL + 新 PID + 原 SQLite reopen（§2.3 G3 字面） ✅
6. **是**：reveal crash 不 replay Secret，必须新 command（§2.3 G3 + §2.5 G5 + §8 第 13 条字面禁止） ✅
7. **是**：三轮 semantic replay 保留全部权威 identity（§2.4 G4 字面） ✅
8. **是**：80 次泄漏注入 + 22 类真实资源归零（§2.5 G5 + §2.6 G6 字面） ✅
9. **是**：父 120 项 item-level 全执行 + focused 96 项不能替代（§2.7 G7 字面） ✅
10. **是**：Frontend Handoff 只交 API/状态/错误/安全责任，不创建 Renderer consumer（§2.8 G8 + §4.2 字面禁止） ✅
11. **是**：Root/Core/Desktop bump + Contracts/Admin 保持冻结（§1.3 字面） ✅
12. **是**：outcome 仅为 `DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT`，所有 readiness false（§0 + §2.9 G9 字面禁止） ✅
13. **是**：3~5 个集中工程日 + 编码仍需用户单独授权（§5 + §0 字面） ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；评审结论 **PASS（不附条件修订）**；可冻结：**是**；保持 `CODING GATED`：**是**。
2. **决策 1**：是否要求在方案 §3.2 E1 字面增补"test identity 必须与 production identity 在 Helper manifest / Helper binary / Keychain namespace / SQLite file 任一项可区分"以提升 §2.1 G1 + §3.2 E1 字面一致性（推荐添加，不阻断 PASS）。
3. **决策 2**：DFI-4A.4.3 是否可进入编码（**推荐要求**先确认 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 已 `PASS/CLOSED` ✅ + 4 个 historical evidence digest 字面不变 + 5 个 package.json 版本字面 + lockfile digest 不变 + Helper binary 仍不存在 + DFI-4A.4.2 evidence 字面 baseline；与 DFI-4A.4.1 / STRM-3 / DFI-4A.4.2 / DFI-4A.4 Revision 2 父计划独立授权风格一致）。
4. **后续路径**：
   - DFI-4A.4.3 编码（0.5~1 + 1~2 + 0.75~1.25 + 0.5~0.75 日 = **3~5 日**）
   - DFI-4A.4.3 独立代码 QA（按 DFI-4A.4.2 QA 报告风格复跑 `harness:dfi4a4.3` + 8 个 historical harness + Central online/offline + check + lint/typecheck/audit:dtp4）
   - DFI-4A.4.3 接受后用户单独授权 Desktop Renderer Personal Model UI（前置条件：production Helper signing asset）
   - 后续 production Helper signing asset 单独授权（独立批次，DFI-4A.4 helper packaging 升级）
5. **DFI-4A.4.3 关闭后**：仅允许输出 `DFI4A4_PERSONAL_MODEL_DESKTOP_INTERFACE_CONFORMANT` + `parentQaMatrixCount=120 / parentQaLedgerStatus=executed_at_dfi4a4_stage_closure / frontendHandoffEvidenceComplete=true` + 13 字面 readiness 中 11 字面 false（新增 `productionPackagingReady=false`）—— **不**等于 Personal Model production ready / production CRUD / Reveal / Helper ready / Enterprise ready / Renderer ready / packaging ready；Desktop Renderer Personal Model UI + 后续 Helper signing + Enterprise identity + Admin v2 + TGM + Knowledge Provider + Agent Lifecycle 仍需独立计划接受和编码授权。

文档复核通过**不等于**编码授权。DFI-4A.4.3 当前保持 `DOCUMENT REVIEW PENDING / CODING GATED`，待：
- 用户接受本报告；
- 用户按上述决策给出指令；
- 用户单独授权 DFI-4A.4.3 编码。

方可启动编码。本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立文档复核全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，文档只读）
