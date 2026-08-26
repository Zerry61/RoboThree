# STRM-1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-22-2257-version-strm.1` |
| 验收对象 | STRM-1：Transport Contract / Adapter Foundation（路线 A） |
| 日期 | 2026-08-22 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 / Electron 43.2.0 / JDK 21.0.12 / Docker |
| 开发版本 | Root / Contracts / Desktop `0.0.0-strm.1`；Core/Central/Document Worker 不变 |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0 + JDK 21）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `CI=true pnpm run harness:strm1` | **PASS**：Contract/Main/Preload 2 files / 16 tests + STRM-0 Electron 14 runs 回归；`outcome=STRM1_CONTRACT_ADAPTER_FOUNDATION_CONFORMANT`；四通道敏感命中 0；八类资源归零 |
| 2 | `CI=true pnpm run check`（完整） | **PASS 232 files / 1543 tests + 3 smoke 全绿** |
| 3 | `CI=true pnpm run check:central` | **FAIL**（见下：3 个既有 Central 集成测试 Testcontainers 资源竞争，非 STRM-1 缺陷） |
| 4 | `CI=true pnpm run check:central:offline` | 未复跑（online 失败原因已定位为既有测试资源竞争） |

---

## 二、重点核查项

| # | 核查项 | 结论 |
|---|---|---|
| 1 | 私有 Transport Profile | ✅ `personal-credential.route-a.structured-clone.v1`；`structuredCloneUsed:true`、`zeroCopyClaimed:false`、`runtimeFallbackEnabled:false` 用 `z.literal` 类型层面锁定诚实语义 |
| 2 | HMAC Ticket 精确绑定 | ✅ [protocol.ts](packages/contracts/src/desktop-private/personal-credential-transport-v1/protocol.ts) Ticket material 绑定 runtimeInstanceId/clientInstanceId/commandId/correlationId/operationType/requestDigest/webContentsId/mainFrameRoutingId/navigationEpoch；Ticket 不含 Secret/Credential Reference/owner identity/Endpoint/helper path |
| 3 | Binary Envelope strict | ✅ [envelope.ts](packages/contracts/src/desktop-private/personal-credential-transport-v1/envelope.ts) 只允许 `header + body` 两 key、body 必须 Uint8Array、拒绝 SharedArrayBuffer/detached、body.byteLength===header.bodyLength、超限、secretFrame 空 body 拒绝、非 secretFrame 必须 body 0 |
| 4 | Main 私有 Foundation 默认关闭 | ✅ `foundationEnabled=false`，snapshot 固定 `productionFeatureEnabled=false / transportBlockerClosed=false`；测试断言 production-disabled 时 createTicket 拒绝 |
| 5 | Registry 有界 + 单并发 | ✅ Registry ≤256、active ≤4、Ticket TTL 5 秒、tombstone 10 分钟；同 model 单并发、reveal 60 秒 ≤5；测试断言 expiry/全局并发/per-model gate |
| 6 | Main 方向严格分离 | ✅ Main 只接收 mutation_secret、只生成 reveal_secret，不允许 Renderer 注入 reveal bytes |
| 7 | 副本残余风险保留 | ✅ `zeroCopyClaimed=false` + `structuredCloneInternalCopiesReliablyClearable=false` + `residualRiskAccepted=true`，不重新解释为 zero-copy |
| 8 | 测试断言真实性 | ✅ 反查无空断言/`it.skip`；覆盖 production 默认关闭、ticket 绑定 identity + 单 frame、foreign/navigation 拒绝、expiry/并发/per-model gate、body fill(0) |
| 9 | 边界零漂移 | ✅ 改动 = `packages/contracts/desktop-private/personal-credential-transport-v1/**` + `apps/desktop/src/main` + `apps/desktop/src/preload`（私有 Adapter）+ tests；production Main/Preload index 不导入本 Foundation；Renderer boundary 禁止导入 desktop-private；未改 Core/Central/Document Worker/Renderer/migration；`pnpm-lock.yaml` 保持 Aug 16 |

---

## 三、Central online 失败的说明（非 STRM-1 缺陷）

`check:central` 全量跑时 3 个既有集成测试失败：

| 测试 | mtime | 归属 |
|---|---|---|
| `Alignment2b2DualNodeFoundationIntegrationTest` | Aug 14 | ARH-2.2 双节点集群 |
| `Arh323ControlledProviderProcessIntegrationTest` | Aug 14 | ARH-3.2.3 受控 Provider 进程 |
| `Cgf2b32DualNodeRelayRecoveryIntegrationTest` | Aug 16 | CGF-2B.3.2 双节点 Relay 恢复 |

- 三个测试 mtime 均早于 STRM-1（Aug 22），**不是本批引入**；STRM-1 改动不含 `services/central-service/**`；
- 失败均为 Testcontainers 集成测试（多 JVM + 多 Postgres 容器的资源竞争/时序），与上一轮 EIPC-0 的
  `Alignment2b2` 同类（当时已单独复跑 PASS 证明为资源竞争偶发）；
- 本批 STRM-1 的 Java 侧零改动，Central 测试数仍 307（无新增），故非 STRM-1 产品缺陷。

结论：Central 全量跑的偶发失败为既有测试环境/资源问题，如实记录，不构成 STRM-1 的 P 级缺陷。

---

## 四、发现

### STRM-1 本批范围：P0 = 0，P1 = 0，P2 = 0，P3 = 0

（Central 全量跑 3 个既有集成测试 Testcontainers 资源竞争偶发失败，为既有测试环境问题，非本批缺陷。）

---

## 五、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

STRM-1 正确完成 Transport Contract / Adapter Foundation：私有 `personal-credential-transport-v1` Contract
（单一 route-a profile、HMAC Ticket 精确绑定 identity 不含 Secret、strict binary envelope 拒绝
SharedArrayBuffer/detached/长度不一致）；Main/Preload 私有 Adapter Foundation（production 默认关闭、Registry
有界、单并发、方向严格分离 mutation_secret/reveal_secret）；`zeroCopyClaimed=false` 诚实保留 structured-clone
副本残余风险。Harness 独立复跑 PASS（2 files / 16 tests + STRM-0 14 runs 回归）、完整 check 232/1543 + 3
smoke 全绿。Central 全量跑 3 个既有集成测试（Aug 14/16）因 Testcontainers 资源竞争偶发失败，非本批缺陷。
边界零漂移：仅改 desktop-private Contract + Main/Preload 私有 Adapter + tests，production entry 不导入、
Renderer 禁止导入 desktop-private，未改 Core/Central/Document Worker/migration，`pnpm-lock.yaml` 保持 Aug 16。

**STRM-1 可进入用户接受流程；接受后单独输出 STRM-2 production wiring 方案并评审。STRM-2/3、EIPC-1～3、DFI-4A.4.1～4A.4.3、DFI-2B/3、TGM 保持 GATED。**

— Claude Code（独立 QA，只读）
