# DFI-3A.2 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-0950-version-dfi.3a.2` |
| 验收对象 | DFI-3A.2：Main / Preload Catalog 接线与阶段收口 |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root / Contracts / Core / Desktop `0.0.0-dfi.3a.2` |
| 上游 | DFI-3A.1 `PASS/CLOSED`；DFI-3A.2 Revision 1 方案复核 PASS |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:dfi3a.2` | **PASS 6 files / 28 tests**（catalog contracts + query service + http v1alpha2 + ipc-router + create-desktop-api + process e2e） |
| 2 | `CI=true pnpm run check`（root） | **PASS 244 files / 1630 tests + Core/Desktop/Preload smoke + Architecture boundary** |
| 3 | `CI=true pnpm run check:central` | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 4 | `CI=true pnpm run check:central:offline` | **PASS 404/0/0/0 / BUILD SUCCESS** |
| 5 | `CI=true pnpm install --frozen-lockfile` | **PASS**（lockfile 未变） |

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | feature additive | ✅ [control.ts](packages/contracts/src/desktop-local/v1alpha2/control.ts) `robot_tool_catalog` additive，`catalog` 保留；Facade 只在两 Query Service 同时安装时投影（`["robot_tool_catalog"]`），任一缺失 `contract.feature_unavailable` |
| 2 | 四层映射冻结 | ✅ Core route `/v1alpha2/catalog/{robots,tools}/{list,detail}`、Main IPC 四 channel、Preload API 四方法；HTTP 仅 POST + `MAX_V1ALPHA2_CATALOG_REQUEST_BYTES = 16*1024` + `5_000` deadline |
| 3 | runtime lease 八步 | ✅ [desktop-v1alpha2-ipc-router.ts](apps/desktop/src/main/desktop-v1alpha2-ipc-router.ts) `#catalog()`：caller binding → `#resolveConnection()` 单次 lease → `lease.client.compatibilityV1Alpha2` → runtimeId 精确匹配 + feature 检查 → `operation(lease.client, query)` → `#isCurrentConnection(lease)` revalidation；步骤间不重新 resolveClient |
| 4 | caller binding | ✅ `#catalogCallerContext` 从真实 event 派生（webContents/mainFrame/navigation epoch），senderFrame 非 mainFrame 返回 undefined；`#bindCatalogClient` 双向 map 上限 16，context/client 任一漂移 → `catalog.client_mismatch`；navigation/destroyed 即删 |
| 5 | supervisor lease 接缝 | ✅ `connectionLease()` 单次捕获（client + runtimeInstanceId + transportClientInstanceId），`isCurrentConnectionLease()` 逐字段比较 |
| 6 | runtime_changed / client_mismatch 语义 | ✅ router 单测覆盖：caller mismatch（Core 调用前，count=0）、compatibility runtime 与 lease 不一致、operation 完成后 lease revalidation 失败 → `catalog.runtime_changed`、binding 容量耗尽 fail-closed |
| 7 | 真实进程链 | ✅ [dfi3a2-catalog-process.e2e.test.ts](apps/desktop/tests/dfi3a2-catalog-process.e2e.test.ts) 用真实 `CorePrivateSupervisor` 启动真实 Core child（`desktop-private-main.js`），经真实 router + lease 走 robot/tool list roundtrip，非 fake supervisor |
| 8 | 测试断言真实性 | ✅ 反查无 `.skip`/`.only`/`@Disabled`/`@Ignore` |
| 9 | 边界零漂移 | ✅ 改动 = contracts control + Core facade/bootstrap/http + Desktop shared/main/preload + tests + scripts audit + 治理文档；未改 Renderer/Admin/Central 源码/migration；`pnpm-lock.yaml` 仍 `b7c6d0a7…` |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 1

#### P3-1：进程级 restart/cursor barrier 矩阵未完整落地（证据完整性）

方案 §5.2 冻结了 C1～C10 命名窗口，并要求 C6/C8「通过确定性 barrier 或受控 delay seam，禁止 sleep 猜窗口」。
实际交付：

- C1（正常 roundtrip）由真实进程 E2E 覆盖 ✅；
- C6（晚到响应 runtime_changed）/ C7（caller mismatch）/ C8（跨 runtime 拼接阻断）由 router **单元测试**覆盖
  （用 mocked `isCurrentConnection` 断言 revalidation）✅，非真实进程 barrier；
- C5（Core restart 后旧 cursor → invalid）由 Core 单测（per-runtime HMAC key）覆盖，非「真实 kill Core child
  后旧 cursor 失效」的进程级证据。

即：语义本身都有测试，但**「真实进程 kill/restart 后旧 cursor/旧响应失效」的确定性 barrier 证据**未按方案
§5.2 的进程级要求交付。6 个 focused 文件里没有独立的 barrier harness。此为证据完整性的 P3，不阻断——
runtime_changed/cursor 失效的核心逻辑都已被单元级验证，且真实进程 roundtrip 已证明链路成立。

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 1（不阻断）
```

DFI-3A.2 正确完成 Main / Preload Catalog 接线：`robot_tool_catalog` feature additive；Core 四条 private HTTP
route（POST/16 KiB/5s deadline）；Main 四 IPC channel + Preload 四 API；runtime connection lease 单次捕获、
compatibility 与业务查询不跨 runtime、返回前 `isCurrentConnection` revalidation；caller binding 有界（16）
双向 map、mismatch 在 Core 调用前失败关闭；`catalog.runtime_changed`/`catalog.client_mismatch` 语义正确。
真实进程 E2E 用真实 Supervisor + Core child 走通 robot/tool roundtrip。门禁独立复跑全绿（harness 6/28、
root check 244/1630 + 3 smoke、Central online/offline 404/404）。边界零漂移：未改 Renderer/Admin/Central
源码/migration，`pnpm-lock.yaml` 未变。P3-1（进程级 barrier 矩阵未完整落地）见 §三，不阻断。

**DFI-3A.2 可进入用户接受流程；接受后 DFI-3A 阶段整体关闭。Desktop Renderer 真实消费另立前端批次；
Max/DFI-5、AAPI-0.3～0.4、TGM、Knowledge Provider、production identity 继续 GATED。**

— Claude Code（独立 QA，只读）
