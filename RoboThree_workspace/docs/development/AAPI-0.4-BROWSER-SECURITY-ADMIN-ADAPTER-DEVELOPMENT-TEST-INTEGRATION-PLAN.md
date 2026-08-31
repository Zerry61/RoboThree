# AAPI-0.4 Browser Security / Admin Adapter / Development-Test Integration 详细实施方案

> 状态：**REVISION 1 / PASS/CLOSED**  
> 日期：2026-08-27  
> 负责人：Codex 5.6  
> 上游：AAPI-0 Revision 1、AAPI-0.1～AAPI-0.3 均 `PASS/CLOSED`  
> 前端基线：AFE-0 Browser Security、AFE-1.1 Admin Foundation、AFE-2/AFE-3A 页面壳  
> 身份策略：development/test 使用明确 test-only Principal；production identity/SSO 继续 deferred/false  
> 本批最高允许输出：`AAPI04_DEVELOPMENT_TEST_ADMIN_READ_INTEGRATION_CONFORMANT`

## Revision 1 聚焦修订

- 关闭独立文档复核发现的 P2 代理拓扑歧义：§0 决策 3、§4.1 与 §17 问题 2 统一以 §8.1 为唯一权威，
  固定为 `Vite integration build → Node loopback static/proxy child → Central ephemeral port`；
- 明确 Vite HMR/development proxy 不构成 Browser Security closure 证据，严格 CSP 只验证 integration build 的
  静态产物与真实 loopback response headers；
- 复核事实更正：`packages/contracts/src/admin-control/v1alpha1/**` 当前为 12 个文件，不是 8 个；
- 复核事实更正：现有 `fixture-admin-adapter.ts` 与 `unavailable-admin-adapter.ts` 均未使用 Zod schema，后续
  `AdminApiAdapter` 才通过 `@robothree/contracts/admin-control/v1alpha1` workspace subpath 引入 strict schema；
- 本次仅为 docs-only 精度收口，不构成编码授权，不修改依赖或 lockfile。

## 0. 结论摘要

AAPI-0.4 的职责是把 AAPI-0.3 已通过 QA 的 12 条 read-only GET，从“Central 可独立验证的 test-only HTTP
shell”推进到“Admin Browser 在 development/test 环境可真实验收的只读链路”。本批建立同源 Browser 边界、
严格 Contract Adapter、capability/route 投影、六类页面真实读取与真实进程联调，但不建立 production SSO，
不开放任何 mutation，也不把 test-only 身份或开发服务器安全头宣称为 production ready。

本方案冻结十四项决定：

1. Browser 只通过单一 `AdminApiAdapter` 调用相对路径 `/admin/v1alpha1/**`，页面和 presentation 禁止直接 `fetch`；
2. Adapter 精确暴露 12 个 read operation，不提供 generic `request(method, path, body)`；
3. development/test 使用 Vite integration build 产物，由 Node loopback static/proxy child 同源托管并转发到
   Central ephemeral port；Browser 只请求相对路径 `/admin/v1alpha1/**`，不获得 Central origin、端口或覆盖面；
4. test-only Principal 继续由 Central 服务端 composition 建立；Browser 不发送 userId、role、capability、Bearer 或 Secret；
5. 本批不伪造 production session Cookie。production HttpOnly/Secure/SameSite session 与真实 SSO 继续 deferred；
6. 因 mutation route count 为 0，本批不伪造 CSRF token；任何非 GET 动作在 Browser boundary 前失败关闭；
7. development/test HTML 与 API 响应必须具备 CSP、frame protection、no-store、nosniff、Referrer/Permissions Policy；
8. 不启用 CORS；Origin/Fetch Metadata 只接受 exact same-origin development/test topology；
9. 所有 success/error body 必须由 `admin-control.v1alpha1` strict schema 解析后才进入页面；未知字段失败关闭；
10. capability key 到 provisional menu/route alias 只允许单一显式表映射，Server 始终是最终授权者；
11. Model/Robot/Skill/Tool/Knowledge/Audit 页面消费真实 Projection；缺事实继续展示 partial/unavailable/gated；
12. Tool Prototype、System Users、Feedback 与所有 create/edit/publish/test/enable/export 入口继续 GATED；
13. 标准 `main.ts` 与 production build 强制使用 `UnavailableAdminAdapter`；真实联调只允许独立
    development/test integration entry，不得通过 `VITE_*`、URL query、LocalStorage 或 Cookie 切换；
14. 本批允许新增唯一 workspace dependency `@robothree/contracts: workspace:*`，按标准流程重算 lockfile；禁止新增外部依赖。

最高输出必须同时附带：

```text
AAPI04_DEVELOPMENT_TEST_ADMIN_READ_INTEGRATION_CONFORMANT
developmentTestReadIntegrationReady=true
testIdentityUsed=true
productionIdentityReady=false
productionAdminReadHttpReady=false
productionBrowserSecurityReady=false
productionAdminAdapterReady=false
mutationRouteCount=0
browserBearerStored=false
fixtureFallbackUsed=false
tgmReady=false
knowledgeProviderReady=false
agentLifecycleReady=false
```

不得输出 `ADMIN_CONSOLE_PRODUCTION_READY`、`PRODUCTION_SSO_READY`、`PRODUCTION_BROWSER_SECURITY_READY`、
`ADMIN_MUTATION_READY`、`RBAC_READY`、`TOOL_MANAGEMENT_READY` 或 `KNOWLEDGE_PROVIDER_READY`。

## 1. 当前代码事实与真实缺口

### 1.1 已关闭事实

| 事实 | 当前状态 | AAPI-0.4 复用方式 |
| --- | --- | --- |
| `admin-control.v1alpha1` | AAPI-0.1 `PASS/CLOSED` | 作为唯一 Browser response/error schema；不复制 DTO |
| test-only Principal / Capability | AAPI-0.2 `PASS/CLOSED` | 身份与 capability 只由 Central 建立；envelope 持续标记 test-only |
| 12 GET / 0 mutation HTTP shell | AAPI-0.3 `PASS/CLOSED` | Adapter 精确映射 12 个 operation，不扩大 route |
| 六模块 authority inventory | AAPI-0.3 `PASS/CLOSED` | 页面诚实消费 partial/unavailable/gated，不补默认值 |
| Admin Vue 2.7 foundation | AFE 已有工程、路由、权限壳和八态页面状态 | 复用工程，不改技术栈、不新建第二个 Admin app |
| Browser 安全基线 | AFE-0 已冻结 | 本批只证明 development/test read-only topology；production 仍 false |

### 1.2 当前缺口

- `AdminAdapter` 只有 `getCapability()`，production 默认是 `UnavailableAdminAdapter`；
- `main.ts` 没有 integration bootstrap，也没有 capability 初始化或 test identity banner；
- Vite 没有 same-origin `/admin` proxy，也没有 Admin HTML security headers；
- Admin 页面仍是 unavailable shell 或 Prototype Fixture，未消费 AAPI-0.3 真实 Projection；
- 当前 provisional route alias（例如 `admin.models.route`）与服务端 read capability
  （例如 `admin.model.read`）没有单一明确映射；
- Browser 还没有 strict envelope/error parse、ETag/304、opaque cursor、abort/timeout 与 response size 边界；
- Central AAPI-0.3 只设置 `no-store`，development/test Browser Security headers、Origin/Fetch Metadata 策略尚未闭环；
- production SSO/session、production Admin Controller、正式 RBAC 和 production deployment security 未实现。

结论：AAPI-0.4 可以解除 Admin development/test 只读联调阻塞，但不能把该链路升级成 production ready。

## 2. 目标与非目标

### 2.1 目标

1. 建立 strict `AdminApiAdapter`、同源 transport 与 12 个 exact read methods；
2. 建立 development/test-only Browser bootstrap 与 production-disabled composition；
3. 建立 Central API + Admin HTML 的 development/test security header conformance；
4. 建立 capability → menu/route alias 的单一显式映射和 401/403 分流；
5. 把 Model/Robot/Skill/Tool/Knowledge/Audit 页面切到真实 read-only Projection；
6. 建立分页、详情、ETag/304、stale cursor、abort、timeout 和 safe error 页面状态；
7. 建立真实 Central child + Vite server + Admin Browser boundary 的 development/test integration harness；
8. 形成 Browser/Contract/security/leak/boundary 的完整证据。

### 2.2 非目标

- 不实现 production SSO、OIDC、SAML、组织、角色、tenant、RBAC 或 production Admin Principal；
- 不实现 POST/PUT/PATCH/DELETE，不实现新增、保存、发布、审核、启停、测试、同步、导出或删除；
- 不实现 production deployment、TLS termination、production cookie/session store 或 production CSRF；
- 不实现 TGM、Knowledge Provider、Agent Lifecycle、Skill Runtime、Memory 或 Effect Reconciliation；
- 不修改 Desktop、Core、Main、Preload、IPC、Document Worker 或 EIPC；
- 不修改 `admin-control.v1alpha1` schema/version；若现有 Contract 无法 strict 解析真实响应，停止回评审；
- 不返回或持久化 Credential、Token、Endpoint、Prompt、Binding、脚本正文、审计正文或本机路径；
- 不把 capability endpoint 的 test-only `ready` 解释为对应业务 mutation ready。

## 3. 两条状态线：development/test 可验收与 production-disabled

### 3.1 Central HTTP activation

| profile | property | test Principal / inventory / security filter | 结果 |
| --- | --- | --- | --- |
| production | 任意 | 任意 | Controller、mapping、test source、test Principal 均 0；请求 404 |
| development/test | false/缺失 | 任意 | Controller、mapping、filter 均 0；请求 404 |
| development/test | true | 任一缺失、重复或不合法 | HTTP ready 前启动失败关闭 |
| development/test | true | 每项恰好一个合法 test-only dependency | 12 GET 可用，mutation 0 |

production profile 中不得通过 property=true、环境变量、`@ConditionalOnMissingBean`、Fake fallback 或测试包扫描
重新启用 Controller。AAPI-0.4 可抽取通用 activation primitives，但若触碰 EIPC 已验收 helper，必须证明 EIPC
行为零漂移；优先在 `admincontrol` 边界内复用模式而非直接依赖 Enterprise Session 专属 Gate。

### 3.2 Admin Browser activation

| build/runtime | integration switch | Adapter | 页面行为 |
| --- | --- | --- | --- |
| 标准 `main.ts` / production build | 任意 | `UnavailableAdminAdapter` | 真实读取不可达，显示安全 unavailable |
| 标准 development entry | 任意 | `UnavailableAdminAdapter` | 不发 Admin API 网络请求 |
| 独立 development/test integration entry + valid proxy | 显式测试命令 | `AdminApiAdapter` | 可做 test-only read integration |
| integration entry + proxy/config invalid | 显式测试命令 | 无 Fixture fallback | bootstrap safe unavailable / harness fail |

约束：

- 标准 `main.ts` 不得 import、动态 import 或条件构造 `AdminApiAdapter`；
- 独立 integration entry 必须位于明确 test/development source graph，由专用命令和专用 Vite config/input 构建；
- production build input 只能包含标准 `index.html/main.ts`，architecture scan 必须证明 integration entry 不在产物图；
- Browser 只看到相对路径 `/admin/v1alpha1`，不看到 proxy target；
- proxy target 只能由 loopback test server 的非 `VITE_` 测试配置提供，并只接受
  `http://127.0.0.1:<ephemeral-port>`；
- 默认开发 Admin origin 固定 `http://127.0.0.1:41731`，禁止 `0.0.0.0`、LAN、任意 host 或公网 target；
- URL query/hash、LocalStorage、SessionStorage、Cookie、DOM attribute 均不得改变 activation。

### 3.3 身份与 Session 的诚实边界

AAPI-0.4 不创建“看起来像 production”的测试登录：

1. development/test Principal 由 Central 的 `DevelopmentAdminPrincipalProvider` 建立；
2. Browser 不发送 `Authorization`、userId、role、group、capability 或 identity header；
3. success envelope 必须满足 `testIdentityUsed=true` 且 `productionIdentityReady=false`；否则 Adapter fail-closed；
4. 页面固定展示“开发/测试身份，非生产账号”提示，不能隐藏或改成“已登录企业账号”；
5. 本批不签发 test bearer，也不为模拟 SSO 而创建假 HttpOnly session Cookie；
6. production SSO 未来必须使用服务端建立、Browser JS 不可读的 HttpOnly/Secure/SameSite 会话或等价机制，
   并单独完成 production Browser Security review；该事实持续 `false`。

## 4. Browser Security v1

### 4.1 Same-origin / Origin / Fetch Metadata

- Admin Browser 只请求相对路径；Vite integration build 的 `dist` 产物由 Node loopback child 在
  `http://127.0.0.1:41731` 提供静态托管，同一 child 将 `/admin` same-origin 转发到 Central ephemeral port；
- 不返回 `Access-Control-Allow-Origin`，不启用 wildcard/credentialed CORS；
- 若请求带 `Origin`，必须精确等于 `http://127.0.0.1:41731`；其他 Origin typed fail-closed；
- 若浏览器提供 `Sec-Fetch-Site`，只接受 `same-origin`；`cross-site`/`none` 不得进入业务 Controller；
- 只接受 GET/HEAD 浏览器读取；AAPI route 精确保持 GET，HEAD 不得被当作第 13 条业务 operation；
- Browser transport 固定 `credentials: "same-origin"`，但本批不得读取或写入任何身份 Cookie。

### 4.2 Security headers

Admin HTML 与 `/admin/v1alpha1/**` JSON/error/304 的 development/test 响应都必须验证：

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self';
  img-src 'self' data:;
  connect-src 'self';
  object-src 'none';
  base-uri 'none';
  form-action 'none';
  frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cache-Control: no-store
```

不得用 `<meta http-equiv>` 冒充服务端响应头。Browser Security closure 必须使用 Vite integration build 的静态
产物，由受控 loopback test server 提供 header 与 same-origin API proxy；Vite HMR/dev style injection 不得作为
CSP 成功证据。若构建产物仍依赖 inline style/script，停止回评审，不得加入 `'unsafe-inline'` 逃逸。
development/test header conformance 不等于 production deployment
header ready，最高输出继续 `productionBrowserSecurityReady=false`。

### 4.3 CSRF 与 mutation

- 当前服务端 mutation route count=0，Browser Adapter mutation method count=0；
- 本批不生成无实际 authority 的 CSRF token；
- 任何页面操作若试图 POST/PUT/PATCH/DELETE，必须在 Adapter/operation gate 前返回 typed gated，不发网络请求；
- Central 的非 GET 请求不得路由到 read Controller，也不得由 generic handler 解释；
- 未来 mutation 必须先完成真实 session + CSRF + Origin + command/CAS/Receipt 独立评审，不能复用本批 test identity
  直接打开。

### 4.4 XSS、重定向与敏感值

- 禁止 `v-html`、`innerHTML`、动态 script、`eval`、`new Function`；所有服务端文本按 Vue text interpolation；
- `fetch` 固定 `redirect: "error"`；3xx、HTML、非 JSON Content-Type 均视为 protocol failure；
- body 上限 1 MiB；超限在 JSON parse 前失败；错误日志不得记录 body、header、cursor、ETag 或内部 stack；
- URL 中不得出现 Token、Secret、Credential、Principal、capability set 或 raw query revision；cursor 只可作为既有
  `cursor` query 参数原样转发；
- 浏览器持久存储扫描必须证明 local/session storage、IndexedDB、cookie write 中无 bearer/response/cursor/ETag。

## 5. Admin Adapter v1

### 5.1 精确 12 方法

`AdminAdapter` 扩展为以下 exact read methods：

```text
getCurrentCapabilities()
listModels(query)          getModel(modelId)
listRobots(query)          getRobot(robotId)
listSkills(query)          getSkill(skillId)
listTools(query)           getTool(toolId)
listKnowledge(query)       getKnowledge(knowledgeId)
listAuditEvents(query)
```

禁止 generic `request(method, path, body)`、任意 URL、任意 module 字符串、mutation method 或 Browser 传 capability。
`UnavailableAdminAdapter` 与 test fixture 必须实现同一接口，但 fixture 仅在 test/Story/visual harness 显式注入，
不能成为 `AdminApiAdapter` 失败 fallback。

### 5.2 单一 Transport 顺序

每个请求固定执行：

1. parse Adapter input；
2. 根据 exact method 选择 code-owned relative route；
3. `queryId = crypto.randomUUID()`、`correlationId = crypto.randomUUID()`；
4. 设置 exact Contract/query/correlation headers；不设置 identity/capability/Authorization；
5. 若 exact in-memory ETag cache 存在则发送 `If-None-Match`；
6. 启动 30 秒 read deadline 与 caller AbortSignal；
7. same-origin GET，body 必须 absent；
8. 校验 status、Content-Type、Content-Length/actual bytes、ETag；
9. 200 时 strict parse envelope + exact data schema；304 时只允许复用同 route/query/identity epoch 的 validated cache；
10. 验证 identity flags；
11. 映射 typed Adapter result；
12. 清理 timer/listener，返回 immutable result。

request 不自动 retry；网络失败、stale cursor、503 或 response loss 都由页面明确触发重试。不得因为 GET 看似安全就
在 Browser 内无限重放或用上次成功数据伪装当前 ready。

### 5.3 Contract parsing

- 从 exact package subpath `@robothree/contracts/admin-control/v1alpha1` 导入 schema；
- Admin Console `package.json` 新增 `@robothree/contracts: workspace:*`，不复制 Contract、不用相对路径跨包导入；
- capabilities data 用现有 capability/page/envelope primitives 组合 strict local schema，不修改公共 Contract；
- Model/Robot/Skill/Tool/Knowledge/Audit 分别使用对应 Page/Detail schema；
- 304 无 body；200 无 body、unknown field、wrong contractVersion、错误 identity flags、非法 cursor/ETag 均 fail-closed；
- `queryRevision`、ETag、resource revision、capability set revision 保持不同类型和用途，不互相替代。

### 5.4 ETag 与 cursor

- ETag cache 只存在于当前 Adapter instance 内，按 exact method + resourceId/cursor/limit 键控，最多 32 项；
- cache 不写 LocalStorage/SessionStorage/IndexedDB，不跨 reload，不跨 identity epoch；
- 304 但无 exact validated cache → `admin.protocol_not_modified_without_cache`，不得返回空页面或旧任意记录；
- cursor 只能来自上一次 success page 的 `nextCursor`，Renderer 不生成、不解码、不修改；
- `stale_cursor` 显示“列表已变化，请从第一页刷新”，不得静默清 cursor 后自动重放；
- detail route 不使用 list cache 冒充 detail，list 不做 N+1 detail 请求。

### 5.5 Error / page state 映射

| HTTP / error | Adapter result | 页面状态 |
| --- | --- | --- |
| 400 `invalid_request` | protocol/request error | `error`，固定安全摘要 |
| 401 `admin_session_required` | identity unavailable | login shell / `unavailable`，明确 test integration 未建立 |
| 403 `permission_denied` | authenticated but denied | `permissionDenied` |
| 404 `not_found` | detail missing | direct detail not found |
| 409 `revision_conflict` | typed conflict | `error`，不自动 retry |
| 410 `stale_cursor` | typed stale | pagination stale，提示从第一页刷新 |
| 422 `business_rule_unavailable` | gated business fact | `unavailable` 或 `disabled` |
| 503 `service_unavailable/internal` | safe unavailable/error | 按 `retryable` 显示明确重试入口 |
| abort | `requestAborted` | route change 时静默清理；用户停留时不伪装成功 |
| local deadline/network/protocol | safe local error | `error`，不泄漏原异常 |

## 6. Capability、路由与操作壳

### 6.1 exact capability mapping

唯一 `AdminReadCapabilityRouteMapper` 冻结如下：

| Server capability | menu/route aliases | 页面 |
| --- | --- | --- |
| `admin.model.read` | `admin.models.menu` / `admin.models.route` | Model list/detail |
| `admin.robot.read` | `admin.robots.menu` / `admin.robots.route` | Robot list/detail |
| `admin.skill.read` | `admin.skills.menu` / `admin.skills.route` | Skill list/detail |
| `admin.tool.read` | `admin.tools.menu` / `admin.tools.route` | Tool list/detail |
| `admin.knowledge.read` | `admin.knowledge.menu` / `admin.knowledge.route` | Knowledge list/detail |
| `admin.system.audit.read` | `admin.system.audit.menu` / `admin.system.audit.route` | Audit list |

`admin.*.write`、audit export、users、feedback capability 即使出现在 test capability set，也不得映射为本批
operation/route ready，因为 AAPI-0.3 没有对应 read/mutation route。所有 operation alias 集合必须为空。

### 6.2 capability state 与权限语义

- capability endpoint 先用于建立 test identity 和导航体验，不能替代服务端逐请求授权；
- `ready/partial` 的 exact read capability 可开放对应 menu/route；页面仍按真实 module response 显示状态；
- `unavailable/gated` 不得映射为 permission denied；可显示安全 unavailable/gated 页面，但不显示可操作按钮；
- 401 与 403 只由 typed HTTP error 决定，不从列表为空、module unavailable 或 capability safeReason 文案推断；
- capability safeReason 只作安全展示，不作为分支逻辑；
- 任何 capability key 未在显式表中 → 不映射、不猜相近名称。

### 6.3 bootstrap 时序

1. 创建 Adapter；
2. `getCurrentCapabilities()`；
3. strict 验证 envelope 的 test-only identity flags；
4. 构建 immutable `PermissionProjection` 与 test identity banner；
5. 创建 Router/Vue app；
6. 页面按 route 发起 exact read；
7. bootstrap 失败时创建 safe unavailable shell，不注入 Fixture。

不允许先以 `authenticated=true` 挂载完整导航，再异步隐藏未授权入口；也不允许 capability refresh 后无界扩大当前
operation 权限。AAPI-0.4 的 capability projection 在当前页面会话内 immutable；刷新页面重新获取。

## 7. 六模块页面真实消费

### 7.1 公共 page query model

每个列表页面独立维护：

```text
initialLoading | ready | partial | empty | unavailable | permissionDenied | error
paginationIdle | paginationLoading | paginationStale | paginationError
items
nextCursor?
safeError?
```

详情独立维护：`loading | ready | partial | unavailable | permissionDenied | notFound | error`。列表、详情、分页、
其他模块互不覆盖；route change 必须 abort 旧请求并禁止晚到响应写入新页面。

### 7.2 模块行为

| 模块 | AAPI-0.4 页面行为 | 必须保留的诚实边界 |
| --- | --- | --- |
| Model | list/detail 展示 id、safe display/provider、lifecycle、credential status、capability summary | 不猜 default model/provider；缺字段显示 partial/unavailable |
| Robot | list/detail 展示 source/lifecycle/restriction summary 与安全摘要 | 不把 active ref 冒充发布/审核 ready，不展示 Prompt/Binding |
| Skill | list/detail 展示 package validation、revision 与安全摘要 | 不展示脚本正文/materializedRef，不宣称 Skill Runtime ready |
| Tool | 调真实 list/detail；当前 authority gated/unavailable 时展示真实状态 | 不再使用 `prototypeToolRows` 填生产列表；不补 readOnly/risk |
| Knowledge | 调真实 list/detail，显示 partial/gated/retrieval unavailable | 不宣称 Provider/同步/索引/检索 ready |
| Audit | 调真实 audit page，展示 content-free system events | 不冒充完整企业审计，不显示 Prompt/Tool args/文件内容 |

### 7.3 仍 GATED 的页面和操作

- Tool API/MCP create、Tool policy、连接测试、启停、删除；
- Robot/Skill/Knowledge/Model create/edit/test/publish；
- System Users、Feedback、Audit export；
- 任何“保存成功”“发布成功”“已接入”“连接健康”的假业务状态。

这些路由可以保留安全 Prototype/GATED 页面用于产品结构，但 navigation/operation projection 不得把它们变成
可用业务能力；生产 read 页面不得导入 Prototype Fixture。

## 8. Development/Test Integration Harness

### 8.1 真实拓扑

```text
Admin test runner
  -> fork Central child (development/test profile, property=true, fake/sentinel data only)
  -> wait exact HTTP-ready probe
  -> run Vite integration build (dedicated test/development entry)
  -> start built-in Node loopback static/proxy child on 127.0.0.1:41731
       static dist + security headers + same-origin /admin proxy -> Central ephemeral port
  -> request Admin HTML/security headers
  -> through Vite origin call all 12 /admin/v1alpha1 GET operations
  -> mount Vue pages with real AdminApiAdapter against the same topology
  -> terminate children
  -> prove ports/processes/timers/listeners released
```

禁止直接调 Java Service、单进程 mock fetch、MSW、Fixture Adapter、Vite HMR 或 Controller unit test冒充 Browser integration。
Component tests仍可用 explicit fixture 覆盖页面状态，但 closure evidence 必须来自真实 HTTP topology。

### 8.2 验收窗口

| 窗口 | 必须证明 |
| --- | --- |
| B1 | 标准 main/production build 无 AdminApiAdapter import/reachable path |
| B2 | 标准 development entry 网络调用数 0 |
| B3 | integration entry + property=false 时 404/safe unavailable，无 Fixture fallback |
| B4 | integration entry + incomplete dependencies 时 Central ready 前失败 |
| B5 | complete test topology 下 12 GET 可达、0 mutation |
| B6 | invalid Origin/cross-site metadata 在 Controller 前拒绝 |
| B7 | 200 strict envelope 与 test identity banner |
| B8 | 304 exact cache reuse；cache miss fail-closed |
| B9 | 401/403 分流不混淆 |
| B10 | 410 stale cursor 不静默 retry |
| B11 | route abort/late response 不污染新页面 |
| B12 | Central restart 后旧 ETag/cursor 不被任意复用 |
| B13 | Tool/Knowledge gated 不触发 Fixture success |
| B14 | shutdown 后 child/port/timer/listener 全归零 |

测试数据只允许 `test.*`、`fixture.*`、`fake-*`、sentinel allowlist；不得接收真实 Secret、企业账号或公网 Provider。

## 9. 敏感信息与 Threat Model

| 威胁 | 控制 |
| --- | --- |
| Browser 自报管理员身份 | 无 identity header/body；Server test Principal 是唯一 authority |
| test identity 被宣称 production | strict envelope invariant + 固定 banner + readiness false |
| 页面绕过 Adapter | architecture scan 禁 page/component/presentation `fetch` |
| Fixture 兜底成功 | production graph/import scan + failure matrix |
| 跨站读取 Admin JSON | same-origin proxy、无 CORS、Origin/Fetch Metadata gate |
| XSS 读取响应 | strict text rendering、CSP、无 `v-html`/dynamic script |
| 点击劫持 | `frame-ancestors 'none'` |
| 304 使用错误身份/查询缓存 | exact bounded memory key + identity epoch + cache miss fail |
| cursor 被前端伪造 | 只透传 server nextCursor；不 decode/synthesize |
| 错误泄漏内部事实 | strict safe error + body/header/log 四通道扫描 |
| read-only 被扩成 mutation | exact method/route count，operation aliases 0 |
| dev proxy 暴露公网 | server-only loopback validator，Browser 不见 target |
| production build误启测试链 | 独立 integration entry + production input/import graph scan |
| 无 authority 字段补默认值 | Contract mapper逐字段映射 + partial/unavailable tests |

负向泄漏至少覆盖 5 类 canary × 4 编码 × 4 通道（response、DOM、console、evidence）= 80 次检测；正常四通道
命中必须全 0。canary 至少含 Secret/Token、Credential/Endpoint、Prompt/Tool args、workspace path、internal digest/stack。

## 10. 文件所有权与允许边界

### 10.1 编码授权后允许

- `apps/admin-console/src/adapters/**`；
- `apps/admin-console/src/app/**` 中 bootstrap、permission/route availability 的必要修改；
- Model/Robot/Skill/Tool/Knowledge/Audit read-only 页面、presentation、公共 page-query component；
- `apps/admin-console/tests/**`、`scripts/**`、`vite.config.mjs`、`package.json`；
- `services/central-service/**/admincontrol/**` 中 development/test Browser security filter/header/configuration；
- AAPI-0.4 tests、Harness、Evidence、实施报告；
- root `package.json` 的专项 Harness/version 与 packaging audit 基线；
- `pnpm-lock.yaml` 仅因 Admin 新增 `@robothree/contracts: workspace:*` 按标准 pnpm 流程重算。

### 10.2 禁止

- 修改 `packages/contracts/src/**` 或 `admin-control.v1alpha1` version/schema；
- 新增外部 npm/Maven dependency；
- 修改 Desktop、Core、Main、Preload、IPC、Document Worker、EIPC production implementation；
- 修改 Central Configuration/Model Gateway/Audit 既有写路径或新增 Repository query；
- 新增 migration、表、索引、持久 session/cursor/cache；
- 实现 production SSO/Principal、TGM、Knowledge Provider、Agent Lifecycle、DFI-5.3 或 v2 consumption；
- 修改真实 Secret、连接公网 Provider、使用真实企业账号；
- 删除 Prototype 文件来伪装 mutation 已完成；只需隔离其 production read import。

### 10.3 Lockfile 收口

编码前记录 lockfile digest。新增 workspace dependency 后：

1. 修改 `apps/admin-console/package.json`，只增加 `@robothree/contracts: workspace:*`；
2. 使用项目 Node 24.13.0 / pnpm 11.11.0 标准重算 lockfile，禁止手工编辑；
3. 验证新增 importer 只解析 workspace contracts 和既有 zod，不出现新 registry package；
4. frozen offline install；
5. Admin 全部门禁、Contracts build/import、root check、Central online/offline；
6. 实施报告记录 before/after digest 与唯一变化原因。

## 11. 分步实施计划与工期

| Step | 内容 | 估算 | 完成条件 |
| --- | --- | ---: | --- |
| AAPI-0.4.1 | Browser Security、same-origin proxy、strict Transport/Contract Adapter、lockfile | 2～3 日 | security/transport/12-method conformance 全绿 |
| AAPI-0.4.2 | Capability bootstrap、permission mapping、六模块 read page integration | 3～4 日 | 页面真实 Projection、Fixture production import=0、operation=0 |
| AAPI-0.4.3 | 真实 Central + Vite integration build + loopback proxy、leak/boundary/closure Harness | 2～3 日 | 真实拓扑、96 QA、全仓门禁与诚实 evidence |

合计 **7～10 个集中工程日**。这是 Browser/API 联调与页面状态收口，不包含 SSO、production deploy、mutation
或业务后端。若页面真实消费由独立 AFE 窗口继续承担，则必须先把本方案拆成明确 handoff 并重新评审，不能让
AAPI-0.4 以只有 Transport 的半成品宣称 Admin 联调 ready。

## 12. QA 矩阵（96 项，连续）

### 12.1 Contract / Transport（QA-001～QA-016）

1. `QA-001` exact package subpath 构建产物真实可导入；
2. `QA-002` Admin 只新增 workspace Contract dependency；
3. `QA-003` 12 Adapter method 与 12 GET route 一一对应；
4. `QA-004` generic method/path/body dispatcher 为 0；
5. `QA-005` query/correlation UUID 每请求 fresh；
6. `QA-006` Contract header exact；
7. `QA-007` Browser identity/capability/Authorization header count=0；
8. `QA-008` GET body absent；
9. `QA-009` success envelope strict parse；
10. `QA-010` error envelope strict parse；
11. `QA-011` unknown field fail-closed；
12. `QA-012` wrong contract version fail-closed；
13. `QA-013` response byte limit 生效；
14. `QA-014` non-JSON/redirect fail-closed；
15. `QA-015` timer/Abort listener 请求后清理；
16. `QA-016` network/timeout 不泄原异常。

### 12.2 Cache / Cursor / Error（QA-017～QA-032）

17. `QA-017` ETag 仅 memory bounded cache；
18. `QA-018` cache key 覆盖 method/resource/cursor/limit/identity epoch；
19. `QA-019` 304 exact cache hit 返回 validated data；
20. `QA-020` 304 cache miss fail-closed；
21. `QA-021` reload 后 cache=0；
22. `QA-022` cursor 只来自 nextCursor；
23. `QA-023` Renderer cursor decode/synthesize count=0；
24. `QA-024` stale cursor 不自动 retry；
25. `QA-025` 400 映射 safe error；
26. `QA-026` 401 映射 login/session unavailable；
27. `QA-027` 403 映射 permissionDenied；
28. `QA-028` 404 映射 detail notFound；
29. `QA-029` 409 不自动 retry；
30. `QA-030` 410 映射 pagination stale；
31. `QA-031` 422 映射 unavailable/disabled；
32. `QA-032` 503 按 retryable 映射且不伪装 empty。

### 12.3 Browser Security / Activation（QA-033～QA-048）

33. `QA-033` 标准 main/production build AdminApiAdapter reachable count=0；
34. `QA-034` 标准 development entry Admin API network count=0；
35. `QA-035` production Central Controller/mapping/test source count=0；
36. `QA-036` dev/test property=false mapping=0/404；
37. `QA-037` incomplete test graph HTTP ready 前失败；
38. `QA-038` complete graph exact 12 GET / 0 mutation；
39. `QA-039` proxy target 仅 loopback；
40. `QA-040` Browser target override surface count=0；
41. `QA-041` CORS response header count=0；
42. `QA-042` invalid Origin fail-closed；
43. `QA-043` cross-site Fetch Metadata fail-closed；
44. `QA-044` CSP exact 且无 unsafe-inline/unsafe-eval；
45. `QA-045` frame/nosniff/referrer/permissions/no-store 全在；
46. `QA-046` security headers 覆盖 JSON/error/304/HTML；
47. `QA-047` Browser bearer/cookie/session storage count=0；
48. `QA-048` non-GET Adapter/upstream count=0。

### 12.4 Capability / Pages（QA-049～QA-064）

49. `QA-049` capability exact mapping 六行无额外 key；
50. `QA-050` unknown capability 不猜别名；
51. `QA-051` operation alias count=0；
52. `QA-052` test identity banner 固定可见；
53. `QA-053` invalid identity flags fail-closed；
54. `QA-054` capability bootstrap 前不挂载已授权导航；
55. `QA-055` Model list/detail 真实映射；
56. `QA-056` Robot list/detail 真实映射；
57. `QA-057` Skill list/detail 真实映射；
58. `QA-058` Tool gated/unavailable 无 Prototype fallback；
59. `QA-059` Knowledge state 不得冒充 ready；
60. `QA-060` Audit 仅 content-free system facts；
61. `QA-061` System Users/Feedback 不因 test capability 变 ready；
62. `QA-062` list/detail 不做 N+1；
63. `QA-063` list/detail/pagination/模块状态彼此独立；
64. `QA-064` route abort 后晚到响应不写新页面。

### 12.5 诚实 Projection / 敏感边界（QA-065～QA-080）

65. `QA-065` Model 缺 default/provider authority 不补默认值；
66. `QA-066` Robot active ref 不冒充 published/review ready；
67. `QA-067` Skill 不泄脚本/materializedRef；
68. `QA-068` Tool 不补 readOnly/risk/health；
69. `QA-069` Knowledge 不补 Provider/retrieval ready；
70. `QA-070` Audit 不泄 Task/Prompt/Tool args/file；
71. `QA-071` Credential 只投影安全三态；
72. `QA-072` revision/digest/internal binding 默认不进 DOM；
73. `QA-073` `v-html/innerHTML/eval/new Function` count=0；
74. `QA-074` page/component/presentation direct fetch count=0；
75. `QA-075` production read page Fixture import count=0；
76. `QA-076` 80 次负向编码注入全部检出；
77. `QA-077` response 正常泄漏命中=0；
78. `QA-078` DOM 正常泄漏命中=0；
79. `QA-079` console 正常泄漏命中=0；
80. `QA-080` evidence 正常泄漏命中=0。

### 12.6 Real-process / Closure（QA-081～QA-096）

81. `QA-081` 真实 Central child + ephemeral port；
82. `QA-082` 真实 Vite integration build + loopback static/proxy child 127.0.0.1:41731；
83. `QA-083` 12 operation 经 Vite origin 到 Central；
84. `QA-084` property=false 真实 topology 404；
85. `QA-085` Central restart 后旧 cursor typed stale；
86. `QA-086` response loss 不触发 Fixture/retry；
87. `QA-087` child/process/port/timer/listener 真实归零；
88. `QA-088` 资源计数来自 diagnostics，不用 `?? 0`/硬编码；
89. `QA-089` Admin build/typecheck/test/static/deps/smoke 全绿；
90. `QA-090` Contracts build + exact import 全绿；
91. `QA-091` root check 全绿；
92. `QA-092` Central online/offline 全绿；
93. `QA-093` lockfile 标准重算、frozen install、无新 registry package；
94. `QA-094` mutation/production SSO/TGM/Knowledge/Agent Lifecycle consumer count=0；
95. `QA-095` outcome 精确为 `AAPI04_DEVELOPMENT_TEST_ADMIN_READ_INTEGRATION_CONFORMANT`；
96. `QA-096` readiness flags 与 §0 完全一致，禁止 production-ready 声明。

测试禁止 `.skip`、`.only`、`@Disabled`、blocking `sleep`、自动 retry 掩盖、硬编码资源 0、Fixture 冒充真实
HTTP、测试账号冒充 production 或页面级 direct fetch。

## 13. 编码后门禁

```bash
export PATH="/Users/changzhengyi/.nvm/versions/node/v24.13.0/bin:$PATH"
hash -r

CI=true pnpm --filter @robothree/contracts build
CI=true pnpm --filter @robothree/admin-console typecheck
CI=true pnpm --filter @robothree/admin-console typecheck:negative
CI=true pnpm --filter @robothree/admin-console build
CI=true pnpm --filter @robothree/admin-console test
CI=true pnpm --filter @robothree/admin-console scan:static
CI=true pnpm --filter @robothree/admin-console scan:deps
CI=true pnpm --filter @robothree/admin-console smoke:dev
CI=true pnpm run harness:aapi0.4
CI=true pnpm run lint
CI=true pnpm run audit:dtp4
CI=true VITEST_MAX_WORKERS=1 pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
CI=true pnpm install --offline --frozen-lockfile
```

`smoke:dev` 与真实 integration harness 都必须在结束后证明进程和端口释放。若当前 shell 含
`ELECTRON_RUN_AS_NODE`，Desktop/preload smoke 按项目既有门禁用 `env -u ELECTRON_RUN_AS_NODE` 运行，不把环境
伪失败归入 AAPI-0.4。

## 14. 实施报告必须输出

1. 12 Adapter method → HTTP route → Contract schema → 页面 consumer 精确表；
2. capability key → provisional menu/route alias 精确表；
3. Central/Admin 双 activation 三态/四态运行证据；
4. CSP/Origin/Fetch Metadata/CORS/no-store 实际 header evidence；
5. success/error/304/cursor/ETag/abort/timeout 测试计数；
6. 六模块页面真实数据源、最高状态与缺失事实处理；
7. production read page Fixture import count 与 direct fetch count；
8. identity flags、test banner、Bearer/Cookie/storage count；
9. mutation method/route/upstream count；
10. 80 次泄漏负向注入与四通道正常命中；
11. before/after lockfile digest、importer 差异和 frozen install；
12. Admin、Contracts、root、Central online/offline 门禁；
13. 全部 readiness false 与最高允许 outcome；
14. 实际修改文件及共享工作区并发变化归因。

## 15. 停手条件

发生以下任一情况立即停止并回到文档评审：

1. `admin-control.v1alpha1` 无法 strict 表达 AAPI-0.3 响应；
2. 需要新增 mutation route、Contract version、migration、表、索引或 Repository query；
3. 需要 production SSO/session、真实企业账号或 Secret 才能验证；
4. 需要 CORS wildcard、`unsafe-inline`、`unsafe-eval` 或 Browser 暴露 Central target；
5. 需要 Browser 自报 identity/role/capability；
6. 需要 Fake/Prototype/LocalStorage 补齐业务成功；
7. 需要把 unavailable/gated 事实补成 readOnly=false、risk=low、healthy 或 ready；
8. 需要页面绕过 Adapter 直接 fetch；
9. 需要新外部 npm/Maven dependency；
10. 需要修改 Desktop/Core/Main/Preload/IPC/Document Worker；
11. 需要打开 TGM、Knowledge Provider、Agent Lifecycle、DFI-5.3 或 v2 consumption；
12. production build 能通过任意 runtime input 启用 test Adapter；
13. 304 无 exact cache 仍要返回成功；
14. stale cursor 只能通过 silent retry 掩盖；
15. Vite/Browser security 只能靠 meta tag 或测试 mock 证明；
16. root/central 门禁失败且无法安全归因或隔离；
17. lockfile 出现非预期 registry package；
18. development/test conformance 被要求写成 production ready。

## 16. 当前状态与后续顺序

```text
AAPI-0 Plan                    REVISION 1 / CONFORMANCE PASS/CLOSED
AAPI-0.1～AAPI-0.4             PASS/CLOSED
Production identity/SSO       DEFERRED / false
Production Admin Read HTTP    false
Production Browser Security   false
Admin mutation                GATED / route count 0
DFI-5.3                       PLAN PASS/CLOSED / CODING GATED
TGM                           GATED
Knowledge Provider            GATED
Agent Lifecycle               GATED
Desktop/Admin v2 consumption  GATED
```

本方案已完成评审、用户授权、编码、开发者门禁、独立 QA 与用户接受；AAPI-0.4 和 AAPI-0 Foundation
conformance 均正式 `PASS/CLOSED`。该关闭仅证明 development/test read integration，不代表 production Admin ready。实施事实见
[AAPI-0.4 实施报告](./AAPI-0.4-BROWSER-SECURITY-ADMIN-ADAPTER-DEVELOPMENT-TEST-INTEGRATION-IMPLEMENTATION-REPORT.md)。

## 17. 评审问题

1. 是否接受 test Principal 由服务端建立、Browser 零 bearer/零 identity header，且本批不伪造 session Cookie？
2. 是否接受 Vite integration build + Node loopback static/proxy child + Central ephemeral port，并保持无 CORS、
   exact loopback/Origin 的 development/test topology？
3. 是否接受 production build 始终 `UnavailableAdminAdapter`，SSO 不作为 test-only 联调前置？
4. 是否接受 12 exact Adapter methods、无 generic dispatcher、无 mutation？
5. 是否接受 capability 映射仅开放六类 read route，users/feedback/write/export 即使出现在 test set 也保持 GATED？
6. 是否接受 Tool/Knowledge 当前真实 gated/unavailable 页面，不允许 Prototype Fixture 兜底？
7. 是否接受 ETag 只做 bounded in-memory cache、stale cursor 不 silent retry？
8. 是否接受 CSP 禁 unsafe-inline/unsafe-eval；若现有 Vue/Vite 不满足则停手回评审？
9. 是否接受只新增 `@robothree/contracts: workspace:*` 并标准重算 lockfile，不新增外部依赖？
10. 是否接受 7～10 个集中工程日，以及真实 Central + Vite integration build + loopback static/proxy 是关闭本批的必需证据？
