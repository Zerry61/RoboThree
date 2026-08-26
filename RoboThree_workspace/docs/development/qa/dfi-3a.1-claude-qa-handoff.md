# DFI-3A.1 Claude Code 独立 QA Handoff

> 日期：2026-08-24  
> 授权人：用户  
> 准备人：Codex 5.6  
> 状态：**QA REQUESTED / REVIEW ONLY / NO CODING**

## 1. 授权原文

授权 Claude Code 对 DFI-3A.1 执行独立 QA；范围为 Contract/Core catalog query/cursor/fixture/boundary/全量门禁，只复核不编码，输出 PASS / PASS_WITH_REVISIONS / RED 和 P0～P3。

## 2. QA 对象

DFI-3A.1 Robot / Tool Catalog 当前代码事实：

- `packages/contracts/src/desktop-local/v1alpha2/catalog.ts`
- `packages/contracts/tests/desktop-local-v1alpha2-catalog-contracts.test.ts`
- `packages/contracts/fixtures/cross-consumer/catalog-alignment-v1.json`
- `services/core/src/ports/catalog-query.ts`
- `services/core/src/application/catalog-query-service.ts`
- `services/core/src/adapters/security/hmac-catalog-cursor-codec.ts`
- `services/core/src/adapters/memory/frozen-registry-snapshot-provider.ts`
- `services/core/tests/catalog-query-service.test.ts`
- 其他仅由 DFI-3A.1 引入或修改的测试、导出和 wiring 变更

以当前工作区事实为准；如实际文件清单不同，请在 QA 报告中列出差异。

## 3. 必须核查

1. `v1alpha2` additive，不改写 `v1alpha1`；
2. Robot/Tool catalog schema strict，unknown field rejection 生效；
3. list/get query、limit 1～100、page max 100、detail not_found 语义正确；
4. cursor opaque，带 query revision 与排序键证明，tamper/stale cursor 失败关闭；
5. Robot restriction 三态 `unrestricted / restricted_nonempty / restricted_empty` 不混淆；
6. availability `available / unavailable / unknown` 不伪装 healthy，缺失事实不默认 available；
7. disabled/revoked/credential/health/revision unavailable 只能收窄可用性；
8. Tool source/readOnly/riskSummary 只来自可信定义，不由 UI 或 id 猜测；
9. Projection 不泄漏 Endpoint、Credential、Binding、Adapter Descriptor、workspace path、system prompt、stack；
10. cross-consumer fixture 与 `CATALOG-PROJECTION-CROSS-CONSUMER-ALIGNMENT-v1.md` 的共同语义一致；
11. Admin-only 字段未进入 Desktop Contract，Desktop runnable/availability 未冒充 Admin governance；
12. 未越界修改 Admin Console、Central、Desktop Renderer、Main/Preload、IPC、migration、root 依赖或 lockfile。

## 4. 建议命令

```bash
node -p "require('./package.json').version"
rg -n "admin-control|AdminControl" packages services apps/admin-console/src -g '!**/dist/**' || true
CI=true pnpm exec vitest run packages/contracts/tests/desktop-local-v1alpha2-catalog-contracts.test.ts services/core/tests/catalog-query-service.test.ts
CI=true pnpm --filter @robothree/desktop build
CI=true pnpm exec vitest run apps/desktop/tests
CI=true pnpm run check
CI=true pnpm run check:central
CI=true pnpm run check:central:offline
```

若 sandbox 因 loopback、Core child、SQLite worker 或 Testcontainers 资源限制失败，需如实记录失败原因，并在允许的非沙箱/正式 QA 环境复跑同一命令。

## 5. 输出格式

```text
DFI-3A.1 Independent QA: PASS | PASS_WITH_REVISIONS | RED
P0=_
P1=_
P2=_
P3=_

Focused gates:
- ...

Full gates:
- ...

Findings:
- [P?] file:line 说明

Boundary:
- Contract/Core catalog query/cursor/fixture only: yes/no
- Renderer/Admin/Central/Main/Preload/IPC/migration/root dependency drift: yes/no

Conclusion:
- DFI3A1_CONFORMANT yes/no
- AAPI-0.1 first prerequisite closed yes/no
```

## 6. 禁止事项

- 不修改代码；
- 不修复测试；
- 不更新版本、CHANGELOG、DEVELOPMENT-LOG；
- 不进入 AAPI-0.1 编码；
- 不宣称 AAPI、Admin Adapter、TGM、Knowledge Provider 或 production identity ready。
