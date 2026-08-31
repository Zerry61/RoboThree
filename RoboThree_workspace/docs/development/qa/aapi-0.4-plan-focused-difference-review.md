# AAPI-0.4 方案聚焦差异复核修订记录

> 日期：2026-08-27  
> 原独立复核：Claude Code  
> Revision 1 文档修订与机械确认：Codex 5.6  
> 状态：**FOCUSED DIFFERENCE CONFIRMATION PASS / CODING GATED**

## 1. 修订结论

AAPI-0.4 原独立复核结论为 `PASS_WITH_REVISIONS`：`P0=0 / P1=0 / P2=1 / P3=0`。唯一 P2 是
development/test 代理拓扑在“Vite development proxy”与“Vite integration build + Node loopback
static/proxy”之间存在歧义，会导致严格 CSP 验收采用不同实现。

Revision 1 已按用户接受的聚焦差异结论完成机械修订，当前关闭映射为：

| 项 | Revision 1 关闭结果 |
| --- | --- |
| §0 决策 3 | 固定为 Vite integration build 产物由 Node loopback static/proxy child 同源托管并转发到 Central ephemeral port |
| §4.1 | 删除 Vite development proxy 表述，写死 `127.0.0.1:41731` loopback child 同时托管静态产物与 `/admin` proxy |
| §17 问题 2 | 与 §8.1/§17 问题 10 统一为 integration build + loopback static/proxy topology |
| §4.2 / §8.1 / §11 / QA-082 | 原本已采用正确拓扑，保持不变 |

§8.1 现在是唯一权威拓扑：

```text
Vite integration build (dedicated development/test entry)
  -> Node loopback static/proxy child on 127.0.0.1:41731
       -> static dist + security headers
       -> same-origin /admin proxy
            -> Central ephemeral port
```

Vite HMR 或 development proxy 不得作为 CSP、frame protection、no-store、Referrer-Policy、Permissions-Policy
的 closure 证据。

## 2. 原复核报告事实自纠

### 2.1 Contract 文件数

原报告把 `packages/contracts/src/admin-control/v1alpha1/**` 写成 8 个文件。实际为 12 个：

```text
capability.ts
common.ts
error.ts
index.ts
knowledge.ts
model.ts
pagination.ts
receipt.ts
robot.ts
skill.ts
system.ts
tool.ts
```

该数字修正不改变 AAPI-0.1 已冻结 Contract family 的结论。

### 2.2 Fixture / Zod 现状

现有 `apps/admin-console/src/adapters/fixture-admin-adapter.ts` 与
`apps/admin-console/src/adapters/unavailable-admin-adapter.ts` 只依赖本地 `AdminAdapter` / `CapabilityProjection`
类型，没有导入 Zod 或 `@robothree/contracts`，也没有 strict response schema validation。

Zod strict validation 是 AAPI-0.4 的未来实现要求：真实 `AdminApiAdapter` 必须通过
`@robothree/contracts/admin-control/v1alpha1` exact workspace subpath 引入 schema。它不是当前 Fixture 已具备的事实。

## 3. 聚焦差异确认

机械扫描必须满足：

```text
"Vite same-origin proxy" = 0
"Vite development proxy" = 0
"同源 Vite proxy" = 0
§8.1 authority topology references >= 1
Contract v1alpha1 file count = 12
fixture/unavailable Zod import count = 0
QA unique count = 96, last = QA-096
```

修订后结论：

```text
FOCUSED DIFFERENCE CONFIRMATION PASS
P0=0
P1=0
P2=0
P3=0
AAPI-0.4 CODING GATED
```

本确认不重新执行完整文档评审，也不构成编码授权。AAPI-0.4 只有在用户单独授权后才能创建 Adapter、测试、
Harness、依赖或 lockfile 变化；production identity/SSO/Admin Read HTTP/Browser Security/Admin Adapter、TGM、
Knowledge Provider、Agent Lifecycle 与 Desktop/Admin v2 consumption 继续 false/GATED。
