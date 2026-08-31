# 后端 / Desktop / Admin 接口解阻优先级梳理

> 状态：**PASS/CLOSED / NO CODING AUTHORIZATION**  
> 日期：2026-08-27  
> 负责人：Codex 5.6  
> 上游：R2D conformance `PASS/CLOSED`、DFI-3A `PASS/CLOSED`、AAPI-0.1～0.2 `PASS/CLOSED`、
> DFE-7A `PASS/CLOSED`、AFE-3A `PASS/CLOSED`  
> production gates：CPC activation=false；R2D gate=false；enterprise entitlement=false

## 1. 结论摘要

当前两端并不是同一种“缺接口”：

- Desktop 的 Robot / Tool Catalog 已从 Core Query、Main IPC、Preload 到 Renderer 全链路真实接通；它当前主要缺
  R2D v2/v3 production composition、真实本地 entitlement、Agent 生命周期、Skill Catalog、Knowledge Provider
  和 Max Provider Mapping；
- Admin 已有 Vue 工程、页面基础、Admin Contract 和 test-only capability projection，但没有
  `/admin/v1alpha1` read-only HTTP runtime，也没有 Browser Admin Adapter。因此 Admin 当前最直接的阻塞是
  AAPI-0.3 与 AAPI-0.4；
- Tool 写管理、Robot 创建/发布、Skill 上传/发布和 Knowledge 检索都不是“补一个 Controller”即可完成，分别依赖
  TGM、Agent Lifecycle、Skill Runtime、Knowledge Provider，不应塞进 AAPI-0.3 冒充完整业务闭环。

因此推荐下一条关键路径为：

```text
AAPI-0.3 read-only Projection + HTTP shell
  -> AAPI-0.4 browser security + Admin Adapter E2E
  -> Local MVP Entitlement / R2D production composition 详细方案
  -> Desktop/Admin v2 consumption
  -> DFI-5.3 Provider Mapping + DFI-5.4 Desktop Max UI
  -> Agent Lifecycle / TGM / Skill Runtime / Knowledge Provider 分线推进
```

本文件只冻结优先级和阻塞关系，不授权任何编码。

> 2026-08-27 状态增量：AAPI-0 Foundation 与 DFI-5.3 已分别完成独立 QA、用户接受并 `PASS/CLOSED`。
> 当前新增 [DFI-5.4 Desktop Max UI / Safe Preview / Production Cutover 详细方案](./frontend/DFI-5.4-DESKTOP-MAX-UI-PRODUCTION-CUTOVER-DEVELOPMENT-PLAN.md)，
> 父方案评审与 [DFI-5.4.0 前置聚焦确认](./frontend/DFI-5.4.0-CONTRACT-RELEASE-AUTHORITY-PREFLIGHT-CONFIRMATION.md)
> 均已 `PASS/CLOSED`；用户选择方案 A，当前进入
> [最小 R2D production consumption / Provider Release Admission 详细计划](./frontend/DFI-5.4-SCHEME-A-R2D-PRODUCTION-PROVIDER-RELEASE-PREREQUISITE-PLAN.md)
> 文档评审。Desktop 最小 v2/R2D consumption 优先，Admin v2 继续 GATED；本状态不构成编码授权。

## 2. 当前真实接口盘点

### 2.1 Desktop 客户端

| 能力 | 当前后端/接口事实 | Renderer 状态 | 当前结论 |
| --- | --- | --- | --- |
| Robot Catalog list/detail | Core private route、Main IPC、Preload v1alpha2 已完成 | DFE-7A 已消费 `list/getRobotCatalog` | **已接通** |
| Tool Catalog list/detail | Core private route、Main IPC、Preload v1alpha2 已完成 | DFE-7A 已消费 `list/getToolCatalog` | **已接通** |
| Skill Catalog | 无 `listSkillCatalog/getSkillCatalog` | 只能 GATED | **后端缺失** |
| 旧版 Task/SubmitTurn | 既有 Desktop v1alpha1/v1alpha2 路径可用 | 工作台可运行 | **已存在，但非 R2D v3/v4** |
| R2D Agent/资源精确锁定 | Contract、Planner、durable acceptance 与 closure 已完成 | Desktop v2 consumption 未实现 | **production 不可达** |
| R2D production composition | `r2dCoreDeltaEnabled=false`，production `TaskResourceEntitlementSource` count=0 | 无法诚实启用 v2 | **关键后端阻塞** |
| Max reasoning | DFI-5.1～5.3 已完成 Preference/Task lock 与三类 Provider mapping conformance；production release/route 仍为 0 | DFI-5.4 UI 未实现 | **DFI-5.4 production cutover 与 UI 阻塞** |
| Agent 创建/编辑/发布 | 无 production Agent Lifecycle | 只能使用已有可信 Agent/Catalog | **后端业务线缺失** |
| Knowledge | 无真实 Knowledge Provider | 仅 GATED/Prototype | **后端业务线缺失** |

### 2.2 Admin Console

| 能力 | 当前事实 | 前端状态 | 当前结论 |
| --- | --- | --- | --- |
| Admin Contract | `admin-control.v1alpha1` 已冻结 Model/Robot/Skill/Tool/Knowledge/System safe Projection | 尚未导入真实 Adapter | **Contract ready** |
| Admin capability | test-only Principal + Capability Projection 已完成；production identity=false | 权限壳可消费 provisional capability | **测试事实 ready** |
| Admin HTTP API | 无 `/admin/v1alpha1` Controller/mapping/runtime | `UnavailableAdminAdapter` 为默认 | **直接阻塞** |
| Browser security/session | CSRF/Origin/CSP/no-store/conditional registration 尚未接线 | 不能真实 fetch | **直接阻塞** |
| Tool 页面 | AFE-3A Prototype/GATED 已关闭 | 无真实读写 Adapter | **页面 ready，数据未接** |
| Robot/Skill 页面 | 仍以 scaffold/壳为主 | AFE-3B/3C 未完成 | **页面与接口均待推进** |
| Model/Knowledge/System 页面 | 基础 route/page shell 已存在 | 无真实 API | **接口阻塞** |
| CRUD/mutation | Contract 只冻结通用 CAS/Receipt 形状；业务命令未实现 | 保存/发布/测试必须 disabled | **不属于 AAPI-0.3** |

## 3. 后端能力分层

### 3.1 已经完成，可直接被消费

- Desktop Robot/Tool Catalog v1alpha2；
- Desktop 既有 Model、Task、Artifact 与 Document Tool 路径；
- Admin Control v1alpha1 TS Contract；
- test-only Admin Principal / Capability Projection；
- R2D/CPC 的 Contract、Planner、持久化、恢复和 conformance 基础。

### 3.2 已实现底层，但 production 仍不可达

- CPC runtime：production activation=false；
- R2D v3/v4：production gate=false，且没有 production `TaskResourceEntitlementSource`；
- Max Task lock/Provider mapping：DFI-5.1～5.3 conformance 已完成；production release/SubmitTurn/UI 仍待 DFI-5.4；
- Enterprise Session：默认关闭，真实 SSO/identity 不在当前版本。

### 3.3 尚未实现的业务后端

- Admin read-only HTTP runtime 与 Browser Adapter；
- Agent Lifecycle（草稿、保存 revision、测试、发布、审核）；
- TGM Tool 创建/验证/启停/策略/健康；
- Skill Catalog 与 Skill Runtime/上传/解析/发布；
- Knowledge Provider、索引、同步、检索与引用；
- Memory、Effect Reconciliation。

## 4. 推荐优先级

### P0：AAPI-0.3 Read-only Projection Inventory + HTTP Shell

这是下一批最推荐的后端工作，因为它能一次解除 Admin 对 Model/Robot/Skill/Tool/Knowledge/Audit 只读事实的共同阻塞。

必须保持：

- 只读 list/detail/capability，不提前实现 CRUD；
- Robot/Tool 复用 cross-consumer alignment，但不共用 Desktop DTO；
- 不存在的 Skill/Knowledge/治理事实投影 `unavailable/gated`，不补 Fixture；
- test-only identity 持续输出 `testIdentityUsed=true`、`productionIdentityReady=false`；
- 不因 HTTP shell 存在而宣称 production Admin ready。

建议下一动作：先输出 AAPI-0.3 独立详细实施方案和差异复核，不自动编码。

### P1：AAPI-0.4 Browser Security + Conditional Registration + Admin Adapter E2E

AAPI-0.3 只有服务端接口，还不能单独解除浏览器消费阻塞。AAPI-0.4 必须紧随其后完成：

- property=false 时 Controller/mapping 为 0；
- requested-but-incomplete 在 HTTP ready 前失败关闭；
- development/test 身份继续由服务端 test-only Principal 建立，Browser 零 bearer/零自报身份；不伪造
  production session。Origin、Fetch Metadata、CSP、frame protection、no-store 与 mutation=0 必须闭环；
- production HttpOnly/Secure/SameSite session 与真实 CSRF 留待 production SSO/mutation 独立批，不作为当前
  MVP test-only read integration 前置，也不得因此宣称 production ready；
- Admin Vue Adapter 使用 frozen Contract，401/403/404/409/410/422/503 精确映射；
- Fixture 不作为失败 fallback。

完成 AAPI-0.3～0.4 后，Admin 才能进入真实 read-only Adapter consumption；真实 mutation 仍需各业务线。

### P1：Local MVP Entitlement / R2D Production Composition 详细方案

R2D conformance 关闭不等于 Desktop 新任务已经使用 R2D。当前 production entitlement source 为 0，因此
Desktop/Admin v2 consumption 不能先行宣称 ready。

该方案必须区分：

- **Local MVP entitlement**：来自当前本地用户已合法配置、可信 Registry 与 Workspace authorization 的资源事实；
- **Enterprise entitlement**：继续 false，不接 SSO/RBAC，不得由本地事实冒充；
- production gate 只有在 Local source、Agent/Registry/Preference/Tool policy 等依赖完整且唯一时才允许显式开启；
- 旧 Task 保持旧版本读取，新 Task 才按明确 cutover 进入 v3/v4；
- Desktop receipt 中临时 `defaultModelId` 兼容投影在 v2 consumption 批移除。

这应形成独立计划与独立授权，不能作为 Desktop 前端“小接线”顺手完成。

### P2：Desktop/Admin v2 Consumption

前置条件：Local MVP Entitlement / R2D production composition 已通过。

- Desktop：提交首次 Turn 时消费 Agent Definition v1alpha2、Runtime Selection v1alpha3 与 coordination v1alpha4；
- Admin：只消费安全 Agent/Restriction Projection，不获得 Core-private lock/digest/material；
- 移除 Desktop/Admin 把 `defaultModelId` 当 Agent authority 的旧展示/选择逻辑；
- 不在 Renderer 解释 entitlement、交集或锁定规则。

### P2：DFI-5.3 Provider Mapping → DFI-5.4 Desktop Max UI

DFI-5.3 已 `PASS/CLOSED`，AAPI-0 Foundation、CPC 与 R2D conformance 也已关闭。DFI-5.4 父方案评审已关闭，
DFI-5.4.0 已关闭并选择方案 A；其关键前置已经拆成 Local Desktop Authority、R2D-P production consumption 与
独立 PRA Provider Release Admission，而不是直接开放 UI：

- 现有 v1alpha3 stale 与最新产品 best-effort fallback 不能由前端吞错，必须 additive 版本化；
- 至少一个 production Local Personal admission policy 与具体用户 subject-bound release 必须单独冻结，不能按模型名猜 supported；
- Desktop Local v1alpha4 先只承载 R2D production consumption 与 `default` reasoning；DFI-5.4.1 再以 v1alpha5
  单线演进承载 best-effort Max，禁止 legacy Runtime Selection 分支；
- DFI-5.4 各子批仍需逐批独立评审、授权、QA 与用户接受。

### P3：业务写链路

建议分别立项，不塞入 AAPI Foundation：

1. Agent Lifecycle：优先支持 Robot 草稿、保存 revision、测试已保存 revision、发布；
2. TGM：Tool 创建、连接验证、发现、启停、策略与健康；
3. Skill Runtime：Skill Catalog、包解析、验证、发布与运行；
4. Knowledge Provider：配置、同步、索引、检索、引用与权限；
5. Memory / Effect Reconciliation。

## 5. 前端可并行但不得冒充的工作

### Desktop

- 可继续使用已经真实接通的 Robot/Tool Catalog；
- 可做 v2 consumption 的页面/Adapter 方案和静态 mapping 评审；
- 不得在 production R2D gate=false 时显示“新资源锁定已生效”；
- 不得在 DFI-5.4 production release、route 与真实 E2E 关闭前显示“Max 已真实发送到 Provider”。

### Admin

- 可继续 AFE-3B/3C 页面结构、状态和安全 presentation；
- AAPI-0.4 前不得建立绕过 Admin Adapter 的页面级 `fetch`；
- AAPI-0.3 前不得用 Fixture 冒充真实 Robot/Skill/Model/Knowledge inventory；
- Tool/Robot/Skill mutation 在对应业务后端完成前必须保持 GATED。

## 6. 下一批建议与授权边界

推荐下一批只做：

```text
AAPI-0.3 Detailed Plan
Read-only Model / Robot / Skill / Tool / Knowledge / Audit Projection Inventory
+ /admin/v1alpha1 HTTP Shell
DOCUMENT REVIEW ONLY / CODING GATED
```

方案评审应重点确认：

1. 每个 Projection 的真实 authority 与 unavailable/gated fallback；
2. Robot/Tool cross-consumer alignment 的字段映射；
3. test-only identity envelope 和 Server-side capability enforcement；
4. cursor/queryRevision/ETag/error mapping；
5. 无 Credential、Prompt、Binding、Endpoint、workspace path、审计正文泄漏；
6. Controller 只读边界与 mutation route count=0；
7. AAPI-0.4 前 production/browser route 是否保持不可达或明确 test-only；
8. Central online/offline、TS/Java conformance 与 Admin fixture 对齐门禁。

用户已正式接受 AAPI-0.3 独立 QA并关闭该批。当前按优先级进入 AAPI-0.4 详细方案独立文档评审，仍不构成
编码授权；AAPI-0.4 关闭后也只解除 development/test read-only Admin 联调阻塞。
