# AAPI-0.4 Browser Security / Admin Adapter / Development-Test Integration 实施报告

> 日期：2026-08-27  
> 版本：Root/Admin Console `0.0.0-aapi.0.4`  
> 状态：**PASS/CLOSED**  
> 最高输出：`AAPI04_DEVELOPMENT_TEST_ADMIN_READ_INTEGRATION_CONFORMANT`

## 1. 实施结论

AAPI-0.4 已把 AAPI-0.3 的 test-only 只读 HTTP Shell 接入 Admin Browser 的独立 development/test entry：

```text
Vite integration build
  → Node loopback static/proxy child (127.0.0.1:41731)
  → Central ephemeral port
```

标准 `main.ts` 与 production build 仍强制使用 `UnavailableAdminAdapter`。本批没有开启 production identity/SSO、
production Admin Read HTTP、production Browser Security、mutation、TGM、Knowledge Provider 或 Agent Lifecycle。

## 2. Adapter 与页面接线

`AdminApiAdapter` 精确实现 12 个 GET operation：Model、Robot、Skill、Tool、Knowledge 的 list/detail 共 10 个，
加 Audit list 与 capability bootstrap。所有请求只使用 `/admin/v1alpha1/**` 相对路径，经
`@robothree/contracts/admin-control/v1alpha1` strict schema 校验；无 generic method/path/body dispatcher，
无 Browser bearer、Cookie、userId、role 或 capability 自报。

六模块页面已切换到真实只读 Projection。Model/Robot/Skill/Tool/Knowledge 分别提供 list/detail，Audit 提供
content-free list。页面只呈现安全摘要；Tool/Knowledge 的 authority 不完整时保留 `gated/unavailable`，不使用
Prototype/Fixture 补成功，不补 readOnly、risk、Provider 或 health 默认值。capability bootstrap 仅映射六项 read
capability 到 menu/route，operation alias 保持为空。

## 3. Browser Security 与运行拓扑

Node loopback child 只绑定 `127.0.0.1:41731`，只代理 `/admin/v1alpha1/**` 到 loopback Central；拒绝跨站 Origin、
cross-site Fetch Metadata、非 GET/HEAD、目标覆盖与路径穿越，并移除 Browser Authorization/Cookie。静态、API、
error 响应统一设置 CSP、`frame-ancestors 'none'`、`nosniff`、`no-referrer`、受限 Permissions Policy 与
`no-store`，不发送 CORS header。

production bundle 与 integration bundle 分离：production bundle 中 `/admin/v1alpha1` 与 Contract request header
均为 0；真实 Adapter 只存在于独立 integration entry。

## 4. 真实进程证据

`AdminBrowserIntegrationE2E` 启动真实 Spring Boot Central ephemeral port、真实 loopback proxy child，并从构建后
Admin 静态页面通过同源代理读取 capability API。证据确认 test identity 为 true、production identity 为 false、
安全头存在、CORS 与敏感值命中为 0。

聚合 Harness 结果：

```text
Admin tests: 10 files / 37 tests PASS
outcome: AAPI04_DEVELOPMENT_TEST_ADMIN_READ_INTEGRATION_CONFORMANT
exactAdapterMethodCount: 12
mutationMethodCount: 0
integrationTopology: vite_build_node_loopback_proxy_central_ephemeral
evidenceDigest: sha256:aa4348558bcd333ed1fa377be99da0f82a5bc940456db3762ebf340dbad02a71
```

## 5. 门禁

- Admin typecheck、negative typecheck（3 fixtures）、production/integration build、10 files / 37 tests：PASS；
- static/dependency scan、dev startup smoke、lint、Architecture boundary、`audit:dtp4`：PASS；
- `harness:aapi0.4`（真实 Central + built Admin + loopback proxy）：PASS；
- root `check`：284/284 files、1961/1961 tests、3 smoke：PASS；
- Central online/offline：均 424 tests、0 failure/error/skip、BUILD SUCCESS；
- frozen offline install：PASS；migration 仍止 26。

## 6. 依赖与 lockfile

唯一新增依赖为 Admin importer 的 `@robothree/contracts: workspace:*`，无新 registry package。lockfile 由 pnpm
11.11.0 标准重算，未手工编辑：

```text
before: sha256:c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07
after:  sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31
```

既有 R2D boundary 的合法 lockfile baseline 同步到新 digest；R2D 业务语义、Contract 与 migration 均未修改。

## 7. 诚实边界与后续状态

```text
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

Claude Code 独立 QA 为 `INDEPENDENT_QA_PASS`（P0～P3 全 0），用户已正式接受；AAPI-0.4 与 AAPI-0
Foundation conformance 均 `PASS/CLOSED`。该关闭不自动解锁 DFI-5.3、TGM、Knowledge Provider、Agent
Lifecycle 或 Desktop/Admin v2 consumption。

`packages/contracts/src/**` 协议 Schema 保持零修改；Contract 测试与 Java E2E 属本批门禁证据，不表述为
“完全没有 Contract/Java 测试文件变化”。QA 复跑生成的 `apps/admin-console/dist-integration/**` 已在关闭时清理，
该目录可由 `build:integration` 重建且不纳入交付；清理前后 lockfile digest 均为
`sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`。
