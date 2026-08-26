# DFI-3A.2 Main / Preload Catalog 接线与阶段收口详细实施方案

> 状态：**REVISION 1 / DOCUMENT REVIEW PENDING / CODING GATED**  
> 日期：2026-08-24  
> 负责人：Codex 5.6  
> 上游：DFI-3A Revision 1、跨消费面对齐基线 v1、DFI-3A.1、AAPI-0.1、AAPI-0.2 均 `PASS/CLOSED`  
> 本轮只输出方案文档，不修改 Contract、Core、Main、Preload、Renderer、Admin、版本、依赖或 lockfile

## 0. 目标与结论边界

DFI-3A.2 负责把 DFI-3A.1 已实现的 Robot / Tool 只读 Catalog Query 接入现有 Desktop Local
`v1alpha2` 安全链路：

```text
Local Core Catalog Query
  → Core private HTTP
  → CorePrivateClient
  → Desktop Main IPC whitelist/router
  → sandboxed Preload sidecar
```

同时完成 Core restart、opaque cursor、client identity、晚到响应、响应边界和敏感字段的进程级 E2E，作为
DFI-3A 后端阶段收口。

本批实现并通过独立 QA 后，最多允许声明：

```text
DFI3A_ROBOT_TOOL_CATALOG_CONFORMANT
DFI3A_DESKTOP_SIDECAR_CONFORMANT
```

不得声明：

```text
Desktop Intelligence UI 已消费真实 Catalog
Admin Robot / Tool API ready
Robot / Tool 创建、编辑、发布或治理 ready
Skill Runtime ready
Knowledge Provider ready
Max reasoning mode ready
production identity ready
```

Renderer 的真实消费另立 Desktop Frontend 批次；本批不得为了“看起来可用”修改智能中心页面或删除
Skill / Knowledge 的既有 Mock / GATED 标识。

## 1. 当前代码事实

### 1.1 已存在并直接复用

1. `packages/contracts/src/desktop-local/v1alpha2/catalog.ts` 已冻结四类 strict Query 与四类安全结果：
   - `ListRobotCatalogQuery / RobotCatalogPage`；
   - `GetRobotCatalogQuery / RobotCatalogDetail`；
   - `ListToolCatalogQuery / ToolCatalogPage`；
   - `GetToolCatalogQuery / ToolCatalogDetail`。
2. `RobotCatalogQueryService` / `ToolCatalogQueryService` 已完成只读 Projection、稳定排序、默认 limit、
   256 KiB 响应上限、完整 Registry/revision 校验和 availability 只收窄；
3. `HmacCatalogCursorCodec` 已使用 runtime-local 256-bit key，cursor 前缀为 `r3cat1`，不暴露 Registry 内部结构；
4. `FrozenRegistrySnapshotProvider`、`InMemoryTrustedRuntimeCatalog`、`FrozenRuntimeSelectionContextProvider`、
   `ModelEligibilityEvaluator` 已能组合 DFI-3A.1 Query Service；
5. Core private HTTP 已有 tokenized loopback、Host/Origin/Authorization 校验、POST-only、redirect 拒绝、
   v1alpha2 workspace routes 的 16 KiB request 特判与 deadline 模式；v1alpha1 仍保留既有 1 MiB request
   基线，DFI-3A.2 不修改全局 request limit；
6. `CorePrivateClient` 已有 v1alpha2 safe envelope、2 MiB transport hard cap、typed result parser 与
   AbortSignal deadline；Catalog routes 后续只为四条新增方法配置 16 KiB request hard cap；
7. Main 已通过 `DesktopV1Alpha2IpcRouter` 和固定 `ipcMain.handle` 白名单接入 compatibility / workspace sidecar；
8. Preload 已通过 `createDesktopApiV1Alpha2()` 暴露冻结 API，而不是把 `ipcRenderer` 交给 Renderer；
9. `CorePrivateSupervisor` 已同时持有 Main↔Core 传输用的稳定 `clientInstanceId`、当前 `runtimeInstanceId` 与
   当前 `CorePrivateClient`，Core restart 后 runtime/client 会变化；Renderer Adapter 也各自生成调用方
   `clientInstanceId`，两类 id 当前不是同一身份，不能直接比较；
10. 既有 sensitive transport controller 已证明 Main 可从真实 IPC event 派生 `webContentsId`、
    main-frame routing id 与 navigation epoch；DFI-3A.2 只复用该身份派生模式，不复用敏感 transport 的
    Ticket、Secret session 或 readiness；
11. AAPI-0.1 只冻结 Admin 消费面的 TS Contract，不是 DFI-3A.2 的运行时依赖；两者只通过
    cross-consumer canonical fixture 对齐共同语义。

### 1.2 已关闭的 AAPI-0.2 事实

AAPI-0.2 已完成独立 QA 并由用户接受关闭，root version 当前为 `0.0.0-aapi.0.2`。其范围是
Central-private test-only Admin Principal / Capability Projection，不接 HTTP runtime、AdminAdapter、production
identity、Desktop Renderer 或 Desktop Local Catalog 接线。

- DFI-3A.2 不依赖 AAPI-0.2 runtime 代码；
- DFI-3A.2 不修改 `services/central-service/**` 或 Admin Control capability projection；
- AAPI-0.2 的 `PASS/CLOSED` 只关闭 test-only Admin capability projection，不解锁 AAPI-0.3～0.4、
  AdminAdapter/AFE consumption、TGM、Knowledge Provider 或 production identity；
- DFI-3A.2 的运行时事实仍以 DFI-3A.1 Desktop Local `v1alpha2` Catalog Contract/Core Query 为来源。

### 1.3 当前缺口

1. `DesktopApplicationFacade` 未注入 Robot / Tool Catalog Query；
2. Core private HTTP 没有 Robot / Tool list/detail routes；
3. v1alpha2 compatibility 只有粗粒度 `catalog`，无法证明 dedicated Robot / Tool Catalog sidecar 已完整安装；
4. `CorePrivateClient`、Main IPC whitelist/router、Preload sidecar 尚无四个 Catalog 方法；
5. 当前 v1alpha2 router 的 `resolveClient()` 模式不能证明异步响应返回时仍属于同一个 runtime；
6. 当前 router 没有把 Catalog Query 的 `clientInstanceId` 绑定到实际 IPC webContents/main-frame
   navigation epoch；
7. 尚无真实 Core child restart、旧 cursor、旧 runtime 晚到响应和资源归零的联合 E2E。

## 2. 冻结架构决策

### 2.1 Dedicated feature projection

在 `DesktopFeatureV1Alpha2Schema` additive 新增：

```text
robot_tool_catalog
```

规则：

- 既有 `catalog` 保留原语义，保证兼容性；不得把它静默解释为新 sidecar 已完成；
- 只有 Robot 与 Tool Query Service **同时**安装时才投影 `robot_tool_catalog`；
- 任一服务缺失时不投影该 feature，四条业务 route 均返回 `contract.feature_unavailable`；
- Main 每次业务调用都使用同一 captured runtime lease 读取 compatibility，不缓存 feature；
- Preload / Renderer 不自行推断 feature，也不把 route 存在等同于 capability ready。

选择单一 feature 而不是 Robot / Tool 两个 feature，是因为 DFI-3A 的关闭条件是两类 Catalog 一起完成，避免
出现只接通一半却被前端当成阶段完成的 partial production state。

### 2.2 路由、IPC 与 Preload API 冻结

| 层 | Robot list | Robot detail | Tool list | Tool detail |
| --- | --- | --- | --- | --- |
| Core private HTTP | `/v1alpha2/catalog/robots/list` | `/v1alpha2/catalog/robots/detail` | `/v1alpha2/catalog/tools/list` | `/v1alpha2/catalog/tools/detail` |
| Main IPC | `robothree:v1alpha2:list-robot-catalog` | `robothree:v1alpha2:get-robot-catalog` | `robothree:v1alpha2:list-tool-catalog` | `robothree:v1alpha2:get-tool-catalog` |
| Preload API | `listRobotCatalog()` | `getRobotCatalog()` | `listToolCatalog()` | `getToolCatalog()` |

全部方法只接受 DFI-3A.1 strict Query，返回 `RendererSafeResultV1Alpha2<T>`。禁止：

- 动态拼接 route/channel；
- generic `catalog(method, body)`；
- 把 Core URL、authorization token、Registry snapshot 或 raw error 暴露给 Preload/Renderer；
- Main/Preload 自己重新投影 Robot / Tool DTO；
- 使用 AAPI-0.1 Admin DTO 替代 Desktop DTO。

### 2.3 Runtime connection lease

Main 新增只读的 v1alpha2 connection lease 接缝，单次同步捕获：

```text
client
runtimeInstanceId
transportClientInstanceId
```

其中 `transportClientInstanceId` 只描述 Main↔Core transport，不等于 Query 内由 Renderer Adapter 生成的
`clientInstanceId`，不得拿两者做相等判断或 owner authority。

每次 Catalog 调用固定顺序：

1. Main 解析 strict Query；
2. 捕获一个 connection lease；
3. 使用 Main 从 IPC event 派生的 caller context 校验 Catalog `clientInstanceId` binding；
4. 使用 **同一个 lease.client** 查询 compatibility；
5. 校验 compatibility 的 `runtimeInstanceId === lease.runtimeInstanceId` 且包含 `robot_tool_catalog`；
6. 使用 **同一个 lease.client** 执行 Catalog Query；
7. 返回前再次由 Supervisor 权威判断 lease 是否仍是 current；
8. 若 Core restart、client 替换或 runtime id 改变，丢弃旧响应并返回 typed `catalog.runtime_changed`。

不得在步骤 4 与 6 之间重新 `resolveClient()`，否则 compatibility 与业务结果可能来自不同 Core runtime。
不得依靠 Renderer 传入 runtime id，也不得因为响应 schema 合法就接受旧 runtime 的晚到结果。

### 2.4 Catalog caller binding

Main 从实际 IPC event 派生 Catalog caller context：

```text
webContentsId
top-level main-frame identity
navigationEpoch
```

`CatalogClientBindingRegistry` 只在 Main 内把上述 context 与 Query `clientInstanceId` 做有界绑定：

- 同一 navigation epoch 的第一次合法 Catalog 调用建立绑定；
- 同 context 后续更换 `clientInstanceId` → `catalog.client_mismatch`；
- 已绑定 id 被另一 webContents/frame 重用 → `catalog.client_mismatch`；
- navigation、webContents destroyed、Main clear/shutdown 时立即删除；
- registry 上限固定 16，超限 fail-closed，不逐出 active binding；
- binding 不进入 Contract、Core、日志、持久层或业务 Projection；
- 它只证明“同一 Catalog 调用会话”，不证明企业身份、owner、entitlement 或 RBAC。

caller context 派生应复用 STRM 已验证的 `event.sender` / `event.senderFrame === event.sender.mainFrame` / navigation
epoch 模式，但不得导入或激活 Personal Credential Transport Controller；若需要抽取通用 Main helper，必须保持
STRM 行为零漂移并通过既有回归。

既有 compatibility/workspace API 的调用方语义保持不变；本批不得把 Catalog binding 扩张成整个 v1alpha2
或业务授权体系。未来 Renderer Catalog Adapter 可以继续使用自身稳定的随机 `clientInstanceId`，无需知道
Supervisor transport id。

### 2.5 Cursor 与 restart 语义

| 场景 | 冻结结果 |
| --- | --- |
| 同 runtime、同 queryRevision | 正常继续分页 |
| 同 runtime、Projection 集合变化 | `catalog.stale_cursor` |
| cursor 格式/HMAC 被篡改或无法通过当前 HMAC | `catalog.cursor_invalid` |
| 当前 runtime 的合法 Robot cursor 用于 Tool（或反向） | `catalog.stale_cursor` |
| Core restart 后提交旧 runtime cursor | `catalog.cursor_invalid` |
| 请求期间 Core restart | `catalog.runtime_changed`，旧响应不投影 |
| 同一合法 cursor 在同一未变化 runtime 重复提交 | 返回同一页，不把只读 retry 伪装为冲突 |

`stale_cursor` 与 `cursor_invalid` 不合并：前者证明 cursor 合法但集合已漂移，后者不能证明来自当前 runtime。
Main / Preload 不自动删除 cursor 后静默重放第一页；未来 Renderer 必须显式刷新并从第一页重新查询。

Cursor key：

- 每个 Core runtime 只创建一个 `HmacCatalogCursorCodec`；
- Robot / Tool Query Service 共享该 codec，但 cursor proof 的 `kind` 防止跨目录复用；
- Core restart 生成新 key，旧 cursor 必须失效；
- key 不进 SQLite、Contract、日志、Evidence 或 Renderer；
- Core stop 时清理持有引用，不新增 cursor 持久化或 migration。

### 2.6 Typed error 映射

Core Facade 是 `CatalogQueryError` 到 Desktop safe error 的唯一业务映射边界：

| Core code | Desktop category | retryable | safe 语义 |
| --- | --- | --- | --- |
| `catalog.invalid_query` | `validation` | false | 请求无效 |
| `catalog.cursor_invalid` | `conflict` | false | 分页位置不属于当前运行实例，请刷新 |
| `catalog.stale_cursor` | `conflict` | false | 目录已变化，请刷新 |
| `catalog.robot_not_found` | `availability` | false | 机器人不存在或不再可见 |
| `catalog.tool_not_found` | `availability` | false | 工具不存在或不再可见 |
| `catalog.registry_unavailable` | `availability` | true | 当前目录不可用 |
| `catalog.integrity_violation` | `internal` | false | 可信目录完整性校验失败 |
| `catalog.response_too_large` | `internal` | false | 安全响应超过上限 |
| Main `catalog.client_mismatch` | `authorization` | false | 当前客户端身份不匹配 |
| Main `catalog.runtime_changed` | `conflict` | true | Core 已切换运行实例，请重新查询 |

要求：

- `safeSummary` 固定为用户语言，不含原始 exception/message/stack；
- correlationId 只取通过 strict Query 解析后的值；解析失败使用安全 fallback id；
- Main/Preload 只透传并再次 parse safe envelope，不根据字符串猜错因；
- 不新增 `not_found` category；not-found 由 typed code 表达，避免扩大公共错误体系。

### 2.7 无缓存、无自动重放

本批不在 Main、Preload 或 Renderer 添加 Catalog cache，不写 LocalStorage / SessionStorage / IndexedDB / SQLite。

- list/detail 均为只读即时查询；
- Query `queryId` 只用于观测与关联，不是 command idempotency key；
- Core restart、timeout、connection reset 时不自动 replay；
- future Renderer 可在明确用户刷新或页面 retry 动作后生成新 queryId；
- 不把 compatibility success 缓存成长期能力事实。

## 3. Core Composition 与 Private HTTP

### 3.1 Composition

`createDesktopPrivateRuntime()` 使用现有可信对象组合：

```text
FrozenRegistrySnapshotProvider(runtime.registry)
HmacCatalogCursorCodec(one runtime scoped instance)
RobotCatalogQueryService(
  agents=catalog,
  models=catalog,
  registries,
  contexts=selectionContexts,
  eligibility=ModelEligibilityEvaluator,
  cursors
)
ToolCatalogQueryService(registries, contexts, cursors)
```

两项服务以可选 Port 注入 `DesktopApplicationFacade`。Facade 只有在两项均存在时投影
`robot_tool_catalog`；禁止只注册 route、不安装真实 Query Service。

不得：

- 新建第二份 Registry Snapshot 或把 Admin Projection 作为事实源；
- 每次请求新建 cursor codec；
- 在 HTTP Controller 内复制 Projection；
- 修改 DFI-3A.1 的 stable sort、queryRevision 或 availability 算法来迁就接线；
- 接入 Central、production SSO 或 Admin API。

### 3.2 Facade

Facade additive 新增四个方法，分别 strict parse、feature check、调用对应 Query Port、parse 最终结果并映射 typed
error。调用前后检查 `AbortSignal`：若 HTTP client disconnect 或 deadline 已发生，不继续投影结果。

Facade 不记录请求 body、cursor、完整 response 或原始错误。Catalog 本身无 Secret，但仍按 Renderer-safe 数据处理，
避免未来字段扩张后 private material 穿透。

### 3.3 HTTP

- 四条 route 仅允许 POST；
- 四条 Catalog route additive 使用 16 KiB request body 上限；
- 不修改既有全局 1 MiB private HTTP request 基线，不扩大或收缩 v1alpha1 routes；
- 既有 v1alpha2 workspace routes 继续保留自己的 16 KiB request 上限，不与 Catalog route 共享业务 parser；
- deadline 固定 5 秒；
- response 仍受 transport 2 MiB hard cap，同时 DFI-3A.1 service 保持更严格的 256 KiB 业务上限；
- `Cache-Control: no-store`、`X-Content-Type-Options: nosniff` 沿用 private JSON response 基线；
- client abort、server stop 后 listener/timer/request 引用归零；
- unknown route、unknown field、wrong method、wrong Host/Origin/token 均失败关闭。

## 4. Main 与 Preload 接线

### 4.1 CorePrivateClient

additive 新增四个 typed method，复用 `#postV1Alpha2()`：

- request 在网络前由 DFI-3A.1 Query Schema parse；
- response 在返回 Main 前由 Page/Detail Schema parse；
- deadline 5 秒；
- redirect、超限、空 body、invalid envelope 继续失败关闭；
- 不引入 generic parser、`any` cast 或 DTO clone builder。

### 4.2 DesktopV1Alpha2IpcRouter

Router 增加四个 exact switch case，并将连接依赖从单纯 `resolveClient()` 收敛为 connection lease seam。

Catalog Query 是只读操作，不使用 command Receipt，也不复用 workspace reveal 的 attempt cache。Router 可维护有界
inflight 诊断计数，但不得合并两个 queryId、不得缓存业务结果。

`clear()` / Main shutdown 必须：

- 标记所有 catalog lease 失效；
- 清理 inflight tracking；
- 使晚到 callback 只丢弃，不再向 Renderer 投影；
- 不等待旧 Core 响应阻塞应用退出。

### 4.3 IPC registration

- 四个 channel 由冻结 `DESKTOP_V1ALPHA2_IPC_CHANNELS` 常量注册；
- 不允许 `ipcMain.on` fire-and-forget；
- 不注册 wildcard / prefix dispatcher；
- Main 从 `CorePrivateSupervisor` 派生 client/runtime/transport identity，从 IPC event 派生 Catalog caller
  context；两者不混用；
- `ipcMain.handle` 的 event/webContents 只用于 Catalog 会话绑定，不成为 owner authority，本批也不引入权限语义；
- 未来 Renderer 消费只使用 Preload API，不直接 invoke channel。

### 4.4 Preload

`createDesktopApiV1Alpha2()` 与 `RoboThreeDesktopApiV1Alpha2` additive 新增四个方法：

- request strict parse；
- safe envelope + result strict parse；
- Object.freeze 保持；
- 不暴露 `ipcRenderer`、channel string、Core URL、runtime lease 或 cursor key；
- 不缓存、不转换、不补齐 displayName/availability；
- 不创建 Admin API 或 Credential 接缝。

## 5. Restart / Cursor / Security Process E2E

### 5.1 真实拓扑

Harness 必须覆盖：

```text
parent test process
  → Electron Main
  → CorePrivateSupervisor
  → real Core child
  → tokenized loopback private HTTP
  → Main v1alpha2 router
  → sandboxed Preload sidecar
```

不得用单进程 fake router、直接调用 Query Service 或抛异常代替 restart E2E。Unit/Component tests 可补充，但不能
冒充进程级证据。

### 5.2 命名窗口

| 窗口 | 触发与断言 |
| --- | --- |
| C1 | 正常 list/detail，四 API strict roundtrip |
| C2 | page 1 后同 runtime page 2，顺序无重复无遗漏 |
| C3 | page 1 后可信 Projection drift，旧 cursor → `stale_cursor` |
| C4 | cursor bit flip → `cursor_invalid`；Robot cursor 用于 Tool → `stale_cursor` |
| C5 | page 1 后 controlled Core restart，旧 cursor → `cursor_invalid`，新第一页成功 |
| C6 | 业务请求已发出、Core restart 后旧响应晚到 → `runtime_changed`，旧数据不投影 |
| C7 | Catalog clientInstanceId 与当前 webContents/navigation binding 不匹配 → Core call count=0 |
| C8 | compatibility 与业务调用间 restart → 不允许跨 runtime 拼接结果 |
| C9 | timeout / abort / Main clear → callback、listener、timer、inflight 归零 |
| C10 | Main / Core 再次 ready 后 fresh query 正常，不自动使用旧 cursor |

其中 C6/C8 必须通过确定性 barrier 或测试注入的受控 delay seam，禁止依靠 sleep 猜窗口。

### 5.3 Semantic replay

同一可信 fixture 至少三轮 fresh process：

- Robot/Tool 业务 Projection semantic digest 一致；
- 同 runtime page 顺序一致；
- runtimeInstanceId、port、PID、authorization token、cursor HMAC 不进入 semantic digest；
- 不要求不同 runtime 的 cursor 字节一致；
- 任一轮失败不得自动重试覆盖。

## 6. 安全与敏感信息边界

### 6.1 Renderer-safe allowlist

允许：

- DFI-3A.1 已冻结的 stable id、exact revision、displayName、description、source、限制三态、
  availability、readOnly/risk、受控 input/output shape；
- opaque cursor；
- typed safe error。

禁止：

- API Key、Token、Credential Reference、Secret、Authorization header；
- Endpoint、userinfo、query/fragment、DNS/IP、Provider raw response；
- full Binding、Adapter Descriptor、adapter handle、process id、port、Core URL；
- system prompt、脚本正文、workspace root/path；
- Registry snapshot、HMAC key、runtime authorization token；
- Admin-only lifecycle/policy/connection/audit fields；
- stack、exception、SQLite path、环境变量。

### 6.2 Static scan

扫描必须区分产品文案、类型字段名与真实/疑似真实敏感值；允许固定 fake/sentinel allowlist。至少包含：

- Core route / Main / Preload / test evidence 四层输出；
- raw、Base64、base64url、hex、URL-encoded marker；
- scanner 正向注入必须能失败；
- `console.*`、`JSON.stringify(error)`、stack、innerHTML、eval、LocalStorage；
- Renderer/Admin 生产源码零修改；
- AAPI DTO 不进入 Desktop import graph。

## 7. 文件所有权与修改边界

编码若后续获授权，允许：

- `packages/contracts/src/desktop-local/v1alpha2/control.ts` 仅 additive feature；
- `services/core/src/application/desktop-application-facade.ts`；
- `services/core/src/bootstrap/create-desktop-private-runtime.ts`；
- `services/core/src/adapters/http/core-private-http-server.ts`；
- 必要的 Catalog Port/Adapter 小范围接缝；
- `apps/desktop/src/main/core-private-client.ts`；
- `apps/desktop/src/main/core-private-supervisor.ts` 的只读 connection lease 接缝；
- `apps/desktop/src/main/desktop-v1alpha2-ipc-router.ts` 与 `index.ts`；
- `apps/desktop/src/shared/foundation-api.ts`；
- `apps/desktop/src/preload/create-desktop-api.ts` 与 preload entry 类型接缝；
- 对应 `packages/contracts/tests/**`、`services/core/tests/**`、`apps/desktop/tests/**`；
- `scripts/**` 仅允许新增或修改 DFI-3A.2 专项 harness、process fixture 或 static scan 脚本，不得修改通用
  check、workspace、release、packaging、Central gate 或无关 audit 脚本；
- 实现冻结后的版本、README、CHANGELOG、DEVELOPMENT-LOG、audit 基线收口。

禁止：

- `apps/desktop/src/renderer/**`；
- `apps/admin-console/**`；
- `services/central-service/**`、Admin API runtime；
- Desktop Local `v1alpha1` 破坏性修改；
- Registry/Agent/Tool 写链路、数据库 migration；
- Skill Runtime、Knowledge Provider、TGM；
- Personal Model/Credential、EIPC/STRM；
- Max / DFI-5 Contract、偏好、Task lock 或 Adapter 映射；
- 新依赖、root tsconfig、`pnpm-workspace.yaml`、`pnpm-lock.yaml`。

若实现发现必须修改禁止范围，立即停止并回到文档评审，不以“接线需要”为由扩大批次。

## 8. 测试矩阵

### 8.1 Contract / Core（1～18）

1. `robot_tool_catalog` feature additive 且 legacy features 零漂移；
2. Robot/Tool list/detail 四 Query strict parse；
3. unknown field、wrong type、limit 0/101 拒绝；
4. empty list；
5. detail not found typed error；
6. deterministic normalized-name + stable-id sort；
7. same-runtime page continuation；
8. queryRevision drift → stale；
9. HMAC tamper → invalid；
10. cross-kind cursor 拒绝；
11. runtime-scoped shared codec；
12. 256 KiB business response 上限；
13. Registry unavailable；
14. Registry/revision tamper 整体失败；
15. availability unknown 不伪装 healthy；
16. disabled/revoked/credential/health 只收窄；
17. AbortSignal pre/post query；
18. feature 只在两 Query Service 同时安装时出现。

### 8.2 HTTP / Client（19～34）

19. 四 route exact POST；
20. GET/PUT/unknown route 拒绝；
21. Host/Origin/token 错误拒绝；
22. 四条 Catalog route 16 KiB request limit，且 v1alpha1 全局 1 MiB request 基线零漂移；
23. 5 秒 deadline；
24. client disconnect abort；
25. response 2 MiB transport cap；
26. DFI 256 KiB cap 先于 transport cap；
27. redirect 拒绝；
28. empty/malformed envelope 拒绝；
29. Core error exact safe parse；
30. raw exception/stack 不进入 response；
31. compatibility feature 与 route composition 一致；
32. no-store/nosniff header；
33. server stop 后 timer/listener 归零；
34. Client 四 typed method 不使用 generic DTO builder。

### 8.3 Main / Preload（35～56）

35. 四 IPC channel exact whitelist；
36. dynamic/unknown channel 不可达；
37. Query 在 IPC 前 strict parse；
38. Result 在 Preload 返回前 strict parse；
39. Catalog clientInstanceId 与 webContents/navigation binding exact match；
40. mismatch 时 Core call count=0；
41. compatibility 与业务使用同一 lease.client；
42. compatibility runtime id exact match；
43. feature missing typed unavailable；
44. response 前 current lease revalidation；
45. old runtime late result 丢弃；
46. Router clear 使 lease/inflight 归零；
47. Main 不缓存 list/detail；
48. Main 不自动 replay；
49. Preload 不缓存、不补 Projection；
50. `ipcRenderer` 不暴露；
51. Core URL/token/runtime lease 不暴露；
52. API Object.freeze；
53. wrong result shape fail-closed；
54. typed safe error 保留；
55. Renderer 只看到 Desktop DTO；
56. AAPI/Admin DTO import graph 为 0。

### 8.4 Process restart / cursor（57～76）

57. 真实 Electron/Main/Supervisor/Core child/Preload 拓扑；
58. C1 四 API roundtrip；
59. C2 正常分页；
60. C3 same-runtime stale；
61. C4 tamper；
62. C4 cross-kind；
63. C5 Core restart old cursor invalid；
64. C5 fresh first page succeeds；
65. C6 old response late callback blocked；
66. C7 caller binding mismatch no Core call；
67. C8 compatibility/call cross-runtime blocked；
68. C9 request deadline cleanup；
69. C9 Main clear cleanup；
70. C10 recovery fresh query；
71. no automatic cursor reset/replay；
72. runtimeInstanceId changed；
73. transportClientInstanceId 在 Desktop session 稳定，但不与 Renderer clientInstanceId 混用；
74. three fresh process semantic replay；
75. semantic digest excludes PID/port/token/cursor signature；
76. failed round is not hidden by retry。

### 8.5 Security / Regression（77～96）

77. sensitive allowlist/denylist；
78. raw marker 负向注入；
79. Base64 marker 负向注入；
80. base64url marker 负向注入；
81. hex marker 负向注入；
82. URL-encoded marker 负向注入；
83. stdout/stderr/evidence/error 四通道 0 命中；
84. Admin-only 字段不进 Desktop；
85. cross-consumer canonical fixture 回归；
86. Robot restriction 三态回归；
87. Tool readOnly/risk 回归；
88. Renderer production source 零修改；
89. Skill Mock/GATED 零漂移；
90. Knowledge GATED 零漂移；
91. Admin Console 零修改；
92. Max/DFI-5 零实现；
93. migration id 零变化；
94. dependency/lockfile digest 零变化；
95. Architecture boundary scan；
96. 所有资源计数来自真实 snapshot，不硬编码 0。

## 9. 验证门禁

编码后至少串行执行：

```text
CI=true pnpm run harness:dfi3a.2
CI=true pnpm --filter @robothree/contracts build
CI=true pnpm --filter @robothree/core build
CI=true pnpm --filter @robothree/desktop build
CI=true pnpm exec vitest run packages/contracts/tests/desktop-local-v1alpha2-catalog-contracts.test.ts
CI=true pnpm exec vitest run services/core/tests/catalog-query-service.test.ts services/core/tests/core-private-http-v1alpha2.test.ts
CI=true pnpm exec vitest run apps/desktop/tests
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true pnpm install --frozen-lockfile
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

要求：

- 使用 `.node-version` 声明的 Node；Central 使用 JDK 21 与既有 Docker/Testcontainers 基线；
- process Harness 若 sandbox 无法启动 Electron/loopback，必须在非沙箱环境从零复跑并记录；
- 偶发 Central 失败必须如实记录，只能通过单测 + 全量从零复跑证明是否为既有环境竞争；
- 不允许因为本批不改 Central 就省略 online/offline；
- lockfile digest 必须与编码前基线一致。

## 10. 实施顺序、工期与停手点

DFI-3A.2 作为一个原子编码批交付，不把“只注册 route”或“只暴露 Preload API”的半成品标记为可验收：

| Step | 内容 | 估算 |
| --- | --- | --- |
| 1 | Compatibility feature、Core composition、Facade/HTTP | 2～3 日 |
| 2 | CorePrivateClient、runtime lease、Main router/IPC | 2～3 日 |
| 3 | Preload sidecar、strict parse 与 boundary tests | 1～2 日 |
| 4 | restart/cursor/security process E2E、门禁与收口 | 2～4 日 |

合计 **7～12 个集中工程日**，不含独立 QA、返工和用户现场验收。原父计划的 2～3 日只覆盖普通接线，未计入
runtime lease、真实 restart barrier、多编码泄漏扫描和全量 E2E，现以本方案估算为准。

编码停手点：

- runtime lease 不能在不改公共/禁止范围的情况下成立；
- 必须修改 Renderer 才能证明 sidecar；
- 必须持久化 cursor key；
- 必须引入新 migration/依赖；
- DFI-3A.1 Projection/Contract 存在需破坏性修改的缺口；
- process E2E 只能靠 sleep 或 fake supervisor 冒充。

出现任一项，停止编码并回文档评审。

## 11. 阶段关闭与后续顺序

DFI-3A.2 代码、门禁、独立 QA 和用户接受全部完成后：

```text
DFI-3A.1                     PASS/CLOSED
DFI-3A.2                     PASS/CLOSED
DFI-3A stage                 PASS/CLOSED
Desktop Renderer consumption GATED / NEXT SEPARATE FRONTEND BATCH
AAPI-0.3～0.4                GATED
Admin business pages         GATED
Max / DFI-5                  GATED / NEXT BACKEND CANDIDATE AFTER DFI-3A.2
TGM                          GATED
Knowledge Provider           GATED
```

本方案文档评审通过不等于编码授权。当前唯一允许动作是文档复核；不得自动创建 route、channel、API、测试或版本。
