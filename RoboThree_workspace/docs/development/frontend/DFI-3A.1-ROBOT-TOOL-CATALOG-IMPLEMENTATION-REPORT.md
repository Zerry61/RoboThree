# DFI-3A.1 Robot / Tool Catalog 实施报告

> 状态：**IMPLEMENTED / INDEPENDENT QA PENDING**  
> 日期：2026-08-24  
> 开发版本：`0.0.0-dfi.3a.1`  
> 负责人：Codex 5.6

## 1. 交付结论

DFI-3A.1 已完成 Desktop Local `v1alpha2` additive Robot / Tool Catalog Contract、Local Core 只读
Projection / Query、opaque cursor、完整 Registry/definition revision 校验及 cross-consumer canonical
fixture。本批未接 Main、Preload、Renderer 或 Admin API，因此不声明 Desktop 页面已经消费真实 Catalog。

本批允许声明：

```text
DFI3A1_CONTRACT_PROJECTION_CORE_QUERY_CONFORMANT
```

不得声明：

```text
DFI-3A PASS/CLOSED
Desktop Robot/Tool Catalog UI ready
Admin Robot/Tool API ready
Skill Runtime ready
Robot/Tool write governance ready
```

## 2. 实现范围

### 2.1 Contract

- 新增 strict list/get query、page、summary/detail、typed availability/reason 与 `r3cat1` opaque cursor；
- Robot 投影稳定 `robotId`、exact `configurationRevision`、来源、限制三态与 runnable 安全摘要；
- Tool 投影稳定 `toolId`、exact `capabilityRevision`、`registryRevision`、`readOnly`、风险事实与安全可用性；
- `restricted_empty` 与 `unrestricted` 保持不同语义；
- available/unknown 资源必须携带可信 exact revision；引用缺失且 revision 无法证明时不补造 revision；
- detail 不返回 Prompt、Binding、Adapter Descriptor、Credential Reference、Endpoint 或私有路径。

### 2.2 Core Query

- `RobotCatalogQueryService` 从 `TrustedAgentRepository` active definitions 与可信 Model facts 读取；
- `ToolCatalogQueryService` 从已验证 `RegistrySnapshot.agentVisibleCapabilities.tools` 读取；
- Registry、definition、binding、adapter descriptor revision 任一损坏时整体失败关闭；
- availability 缺失保持 `unknown`，disabled/revoked/credential/health 只能收窄；
- NFC/lowercase/code-point 稳定排序，query revision 绑定完整投影；
- HMAC cursor 绑定 catalog kind、query revision、最后排序名和稳定 id，集合漂移返回 typed stale cursor；
- response 上限为 256 KiB，query service 全程只读。

### 2.3 跨消费面对齐 Fixture

新增 `packages/contracts/fixtures/cross-consumer/catalog-alignment-v1.json`，覆盖：

- Robot / Tool stable identity；
- Admin revision 与 Desktop exact revision mapping；
- `unrestricted / restricted_nonempty / restricted_empty`；
- Tool `readOnly` 与 risk common semantics；
- Admin-only lifecycle/policy/connection/credential 字段不得进入 Desktop Projection。

该 Fixture 供后续 AAPI-0.1 conformance 消费，但 Admin 与 Desktop 不共享 DTO，也不存在运行时跨 Contract 依赖。

## 3. 文件边界

本批修改：

- `packages/contracts/src/desktop-local/v1alpha2/**` 与对应 Contract tests/fixture；
- `services/core/src/application/**`、只读 Port、memory/node Adapter、Core tests；
- 开发版本、专项 Harness、DTP-4 audit 版本基线与治理文档。

本批未修改：

- `apps/desktop/src/main/**`、`apps/desktop/src/preload/**`、`apps/desktop/src/renderer/**`；
- `apps/admin-console/**`；
- `services/central-service/**`、`services/document-worker/**`；
- migration、EIPC、STRM、DFI-4A、DFI-2B、DFI-3B、TGM、Knowledge Provider；
- 依赖版本与 `pnpm-lock.yaml`。

## 4. 开发者验证

### AFE-1.1 前置清理与共享依赖收口

- preflight 目录已删除，lockfile 标准重算 digest：
  `b7c6d0a7906001ef503a3c0365663153265aa601103779eeacbd10d1a7f5ade5`；
- frozen install：PASS；
- Admin 全部门禁：PASS（5 files / 14 tests）；
- Desktop Vue 3 build 与 tests：PASS（57 files / 226 tests）；
- 清理后的 root check：PASS（240 files / 1603 tests + 3 smoke）。

### DFI-3A.1

- `CI=true pnpm run harness:dfi3a.1`：PASS，5 files / 35 tests；
- `CI=true pnpm run audit:dtp4`：PASS；
- `CI=true pnpm run check`：PASS，242 files / 1613 tests + 3 smoke；
- Central online：初轮 390/391 后既有 `Cgf2a3DualNodeModelRecoveryIntegrationTest` readiness HTTP
  超时；该测试文件未被本批修改，随即单独从零复跑 2/2 PASS，资源清理后 online 全量从零复跑
  391/391 PASS；
- Central offline：391/391 PASS；
- 敏感形态扫描：0 命中；Architecture boundary checks：PASS；
- `pnpm-lock.yaml` digest 保持上述收口值且不含 `admin-console-preflight` importer。

## 5. 已知边界与下一步

- DFI-3A.1 只完成 Contract / Projection / Core Query；Main/Preload 接线属于仍 GATED 的 DFI-3A.2；
- Renderer 真实消费必须另立 Desktop Frontend 批次；当前机器人旧消费面和 Tool Mock 不在本批替换；
- AAPI-0.1、Admin 业务页面、Max/DFI-5 继续 GATED；
- production Enterprise Session 继续默认关闭，真实 SSO/RBAC 不属于当前版本。

下一步仅提交 Claude Code 独立 QA；未获用户接受前不关闭 DFI-3A.1，也不自动解锁 DFI-3A.2 或 AAPI-0.1。
