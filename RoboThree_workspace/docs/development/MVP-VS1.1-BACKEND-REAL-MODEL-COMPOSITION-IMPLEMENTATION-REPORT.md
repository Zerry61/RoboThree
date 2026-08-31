# MVP VS1.1 Backend Real Model Composition 实施报告

> 版本：`0.0.0-mvp.vs1.backend.1`  
> 状态：**PASS/CLOSED — INDEPENDENT QA PASS / USER ACCEPTED**  
> 范围：MVP-VERTICAL-SLICE-1 的 VS1.1 后端子项；不关闭 VS1.2、VS1.3 或整个 Vertical Slice。

## 1. 交付结果

普通 Core graph 现可在显式 internal-trial deployment 下完成一条真实企业 Model 链：

```text
Desktop/Core normal graph
  -> agent.general
  -> exact Model entitlement / Runtime Selection v1alpha4 / Capability Lock
  -> DurableEnterpriseModelProvider
  -> HttpEnterpriseModelGatewayClient
  -> Gateway v1alpha3 HTTP/SSE
  -> durable Assistant Message / SQLite restart restore
```

未配置 deployment 或 token 时仍使用 `FailClosedModelProvider`；不会回退到 scripted、Mock、LocalStorage 或
Personal Model fixture。

## 2. 实现明细

### 2.1 Internal-trial deployment authority

- `ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT` 只接受一个 strict、exact 的远程 Model graph；
- deployment 必须包含 `configurationRevision`、Model Definition、Binding、Adapter Descriptor 与 Registry Snapshot；
- Model 必须是 text input/output、streaming、`openai-compatible`，且 binding/descriptor revision 全量配对；
- deployment env 在 Core 启动时读取一次并立即删除；HTTP 只允许 loopback test，其他环境必须 HTTPS；
- 投影固定为 `managedByAdmin=false / adminMutationReady=false`。

### 2.2 Internal-trial token

- `ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN` 启动时读取一次并立即删除；
- audience 必须严格等于 `enterprise-model-gateway`；permissions 必须严格等于 `['model.use']`；
- token 仅保存在 Core adapter 私有内存，不进入 Renderer、CLI、SQLite、日志、Evidence 或 Artifact；
- 缺失、过期、scope 漂移、额外权限或续签请求全部 typed fail-closed。

### 2.3 Exact runtime composition

同一个 Model exact ref 已进入：

1. normal Desktop Model Catalog / `liveModels`；
2. Agent resource registry snapshot；
3. exact workspace/authorization permission facts；
4. Enterprise Entitlement；
5. Runtime Selection v1alpha4，并原子锁定 exact `configurationRevision`；
6. Model Capability Lock；
7. `RuntimeAdapterHandles`；
8. durable Model Invocation Link、Usage Projection 与 Prompt Cache Context persistence。

首次接受继续复用既有 R2D3/DFI541 durable acceptance 与 coordination 状态机，没有 legacy Runtime Selection 分支，
没有第二套任务状态机。

### 2.4 Default reasoning compatibility

Enterprise Provider 现在可读取 Runtime Selection v1alpha4 的 ReasoningModeLock v1alpha2。VS1.1 只支持
`default_passthrough`：Mapper 在任何 Profile/Mapping load 前返回 omit；没有安装 Max release，也没有把 default
伪装成 reasoning mapping。

## 3. 运行级证据

`vs1.1-internal-trial-enterprise-runtime.integration.test.ts` 使用 normal `createDesktopPrivateRuntime`、真实 loopback
HTTP/SSE Gateway、真实 SQLite 文件和 durable Agent Loop，完成：

1. 创建 Session；
2. `agent.general` 显式选择 deployment Model；
3. exact v1alpha4 selection / Model lock；
4. Gateway v1alpha3 POST、status GET、SSE events；
5. 流式 Assistant 文本写入 Conversation；
6. Core stop；
7. 使用同一 SQLite 文件重新创建 Core；
8. 原 Assistant Message 可恢复。

Focused regression：5 files / 21 tests PASS；Core typecheck PASS；本批 focused ESLint PASS；DTP-4 audit 与
self-test PASS；lockfile digest 仍为
`sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`；migration 仍止 26。

Central 在 JDK 21 环境独立串行复跑：online `438/0/0/0 / BUILD SUCCESS`，offline
`438/0/0/0 / BUILD SUCCESS`。沙箱内首次 online 运行因本机 socket 权限产生 `Operation not permitted`，在允许
本机临时端口与 PostgreSQL 的验收环境重跑后全绿，未修改 Central 产品代码。

全仓 `pnpm run check` 当前仍被并行 Desktop 前端批的
`settings-adapter.ts rootRealPath must not enter Renderer/Preload safe views` 边界失败阻断。单独 `pnpm run test`
还包含两类非本批产品失败：沙箱禁止 loopback/Keychain/TLS/真实子进程，以及 R2D/DFI 历史时点 boundary 对
VS1.1 已授权生产 consumer 增长的旧断言。历史 Harness/Evidence 保持只读，本批不通过改写历史快照伪造全仓 PASS；
完整联合 QA 仍须在固定 Node 24.13.0、允许本机进程与端口的环境执行。

## 4. 诚实边界

- 本报告只确认 VS1.1 后端 composition 已实现，不单独输出 `MVP_VERTICAL_SLICE_1_USABLE`；
- Core loopback test 验证真实 HTTP/SSE Gateway contract，Central → OpenAI-compatible provider 由 Central 门禁覆盖；
  完整跨进程 Desktop → Central → controlled upstream 仍须在 VS1 联合 QA 复跑；
- CPC Platform Prompt、`agent.presentation`、Skill、PPTX Tool Call 属 VS1.2，尚未由本批交付；
- Artifact 页面与真实 Electron restart closure 属 VS1.3；
- production SSO/RBAC、Admin mutation、Personal Model、TGM、Knowledge Provider、Agent Lifecycle 继续 GATED；
- internal-trial token 不是 public production identity，`publicProductionReady=false`、
  `productionIdentityReady=false`。

## 5. 下一步

按已授权的联合方案继续 VS1.2：启用 internal-trial CPC、增加唯一专项 `agent.presentation`、实现一个 exact
本地 Skill Resolver，并把 `tool.document.pptx.write` 进入同一次 entitlement/permission/lock 和真实 Model Tool Call。
VS1.1 后端独立 QA 已由用户接受并正式关闭。VS1.2、VS1.3 的联合编码授权继续有效，不再拆出新的 Foundation、
Contract 或逐接缝关闭批次。
