# VS1.1 Backend Internal-Trial Token Provider + Enterprise HTTP Gateway — Claude Code 独立代码 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-29-1735-code-vs1.1-backend` |
| 验收对象 | VS1.1 后端子项：`internal-trial-only Enterprise Access Token Provider` + Token Session 回归 + Enterprise HTTP Gateway |
| 日期 | 2026-08-29 |
| 复核者 | Claude Code（独立 QA，仅只读，不修改任何业务代码/Contract/依赖/migration/lockfile） |
| 上游 | MVP-VERTICAL-SLICE-1 联合方案（`REVISION 1 / FOCUSED DIFFERENCE REVIEW PENDING / CODING GATED`）+ VS1.1 Frontend `0.0.0-mvp.vs1.frontend.1`（已 `PASS/CLOSED`）+ DFI-4A.4 Revision 2 / DFI-4A.4.1 / STRM-3 / DFI-4A.4.2（已 `PASS/CLOSED`） |
| 当前状态 | `IMPLEMENTED / DEVELOPER VERIFICATION PASS / INDEPENDENT QA PENDING`；**Provider 未接入 normal graph**（liveModels / Runtime Handle / Entitlement / Task Lock 由下一段处理） |

---

## 一、复核范围与方法

### 1.1 范围

仅复核 VS1.1 后端子项（internal-trial Token Provider + Session 回归 + Enterprise HTTP Gateway）的事实可证性 + 边界严格性 + 诚实字面一致性：

1. **Provider 6 项行为**：
   - 一次性读取并立即删除环境变量；
   - Token 仅保存在 Core 私有内存中；
   - 缺失 / 格式错误 / 过期 / TTL 不足 / audience/permission/scope 不匹配 → 全部 fail-closed；
   - 禁止续签或替换预签 Token；
   - JWS claims 仅用于构造本地 lease，不被当作认证结果；
   - Token 按授权只含 `model.use`，不能读取需要 `configuration.read` 的企业配置接口。
2. **范围边界**：未修改 Renderer / Main / Preload / Admin / Contract / migration / 依赖 / lockfile。
3. **诚实边界**：本批只交付 Provider 实现 + 7 个 typed fail-closed + 15 tests + 1 个 frozen 接口；**未接入 desktop normal graph**（不替换 `FailClosedModelProvider`，不挂入 `liveModels` / `RuntimeAdapterHandles` / Entitlement / Task Lock），接入由下一段完成。

**不**在本次复核范围：

- 不评估 liveModels / Runtime Handle / Entitlement / Task Lock 接入（用户声明下一段）；
- 不评估 VS1.1 前端（已 PASS/CLOSED）/ VS1.2 / VS1.3；
- 不修改任何业务代码、Contract、依赖、migration、lockfile；
- 不替代 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.x / R2D-P.x / PRA-x 既有独立 QA 结论；
- 不复跑历史 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.x / R2D-P.x / PRA-x harness（保持只读）。

### 1.2 方法

按 A~D 段顺序逐项只读对照：

- 实跑 `pnpm exec vitest run 3 个 focused test files`（Node v24.13.0, pnpm 11.11.0）；
- 实跑 `pnpm exec tsc -b services/core`；
- 实跑聚焦 ESLint（仅本批涉及 4 个文件）；
- 字面只读核对：`services/core/src/adapters/environment/internal-trial-enterprise-access-token-provider.ts`（257 行全文）+ `services/core/src/ports/enterprise-access-token-provider.ts`（接口定义）+ 3 个 test 文件；
- 实测 5 个 `package.json` 版本字面 + `pnpm-lock.yaml` digest + `services/core/src/adapters/sqlite/migrations.ts` 末项 `id`；
- 实测 4 个 historical evidence SHA256；
- 验证 `apps/desktop/resources/personal-credential-helper/` 目录不存在；
- 验证 Provider **未接入 desktop normal graph**（`create-desktop-private-runtime.ts` 字面仍 `new FailClosedModelProvider()`）。

---

## 二、关键事实核对（按方案 §4.2 受控内部试用身份）

### 2.1 A 段：Provider 6 项行为（用户声明）

✅ **全部字面命中**（实测 `internal-trial-enterprise-access-token-provider.ts` 257 行全文）：

#### A1. 一次性读取并立即删除环境变量（无 reread / no env re-scan / no leftover）

- 字面落点 `:108-110`：
  ```ts
  const compactToken = input.environment[variableName];
  delete input.environment[variableName];  // ← 立即删除
  if (compactToken === undefined || compactToken.length === 0) return undefined;
  ```
- 字面 `consume()` 静态方法（`:101-124`）是**唯一**入口；`acquire()`（`:126-131`）只读 `#lease` 实例字段，**不重新读取 env** ✅；
- 字面 `INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV = "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN"`（`:15-16`）；
- 测试字面断言 `:22, :25, :44, :49-51`：`expect(environment).not.toHaveProperty(INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV)` —— **真实测试 assert env var 已被删除** ✅。

#### A2. Token 仅保存在 Core 私有内存中（不写 SQLite / 不进 Renderer / 不进 URL / 不进 CLI 参数 / 不进 Task payload / 不进 Evidence / 不进日志）

- 字面落点 `:74-99`：`#lease` 字段 + `Object.freeze({...})`：
  ```ts
  readonly #lease: EnterpriseAccessTokenLease;
  ...
  this.#lease = Object.freeze({
    compactToken: input.compactToken,
    tokenId: input.claims.tokenId,
    audience: input.claims.audience,
    permissions: Object.freeze([...input.claims.permissions]),
    issuedAt: input.claims.issuedAt,
    expiresAt: input.claims.expiresAt,
    scope: Object.freeze({...}),
  });
  ```
- 字面接口注释（`enterprise-access-token-provider.ts:9-14`）："Sensitive bearer material. It is valid only in memory for the immediate transport request and must never enter logs, persistence, fixtures, or public Contracts." ✅；
- grep `InternalTrialEnterpriseAccessTokenProvider` 实际引用范围：仅本 adapter 文件 + 1 个 test 文件 —— **未挂入任何 SQLite / Renderer / Task payload 写入路径** ✅。

#### A3. 缺失 / 格式错误 / 过期 / TTL 不足 / audience/permission/scope 不匹配 → 全部 fail-closed

- **缺失**：`:110` `if (compactToken === undefined || compactToken.length === 0) return undefined` —— **consume 返回 undefined，acquire/assertCurrentSession 通过 typed error 失败** ✅；
- **格式错误**：`boundedCompactToken`（`:225-231`）长度 / 字符集严格校验 + `decodeClaims`（`:233-250`）JWS 三段 / base64url / JSON parse 严格校验 → 任何环节 fail-closed（`invalidToken()` 返回 `internal_trial_token_invalid`）✅；
- **过期**：`:200-205` 字面 `throw internal_trial_token_expired` ✅；
- **TTL 不足**：`:206-211` 字面 `throw internal_trial_token_ttl_insufficient` ✅；
- **audience mismatch**：`:166-170` 字面 `throw internal_trial_token_audience_mismatch` ✅；
- **permission missing**：`:157-162, :172-177` 字面 `throw internal_trial_token_permission_missing`（共 2 处）✅；
- **scope mismatch**：`:151-156, :178-184` 字面 `throw internal_trial_token_scope_mismatch`（共 2 处）✅；
- **7 个 typed error code 完整枚举**（`:57-64`）：
  ```ts
  "internal_trial_token_invalid"
  "internal_trial_token_expired"
  "internal_trial_token_ttl_insufficient"
  "internal_trial_token_audience_mismatch"
  "internal_trial_token_permission_missing"
  "internal_trial_token_scope_mismatch"
  "internal_trial_token_renewal_unavailable"
  ```

#### A4. 禁止续签或替换预签 Token（no refresh / no rotation）

- 字面落点 `:137-144`：
  ```ts
  public async renew(_request: EnterpriseAccessTokenRenewalRequest): Promise<EnterpriseAccessTokenLease> {
    throw new InternalTrialEnterpriseAccessTokenError(
      "internal_trial_token_renewal_unavailable",
      "internal-trial token renewal is unavailable",
    );
  }
  ```
- 接口定义（`enterprise-access-token-provider.ts:42-50`）保留 `renew` 签名，但实现永远是 throw —— 与方案 §4.2 第 1 项"Token 仅消费一次，不刷新"严格对齐 ✅。

#### A5. JWS claims 仅用于构造本地 lease，不被当作认证结果

- 字面落点顶部 docstring（`:66-73`）：
  > "Internal-trial-only bearer source. The compact token is consumed once from the Core process environment and retained only in this in-memory adapter. **JWS claims are decoded only to construct the local request lease. They are not treated as authenticated authority: Central still verifies the compact token signature, issuance, expiry, permission and scope on every request.**"
- 字面落点 `:233-250`：`decodeClaims` 仅做 base64url + JSON parse + Zod strict schema check → 写入 `#lease`（本地内存对象），**不返回 claims 作为认证结论**；
- 字面 `#lease` 仅承载 `compactToken / tokenId / audience / permissions / issuedAt / expiresAt / scope` —— **没有 Central 签发的 server-side assertion** ✅。

#### A6. Token 按授权只含 `model.use`，不能读取需要 `configuration.read` 的企业配置接口

- 字面落点 `PermissionSchema`（`:20-27`）：声明 6 个枚举值 `configuration.read / model.use / tool.use / agent.use / skill.use / knowledge.use`；
- 字面权限校验逻辑（`:157-162, :172-177`）：`this.#lease.permissions.includes(requiredPermission)` 为 false → throw `internal_trial_token_permission_missing`；
- 字面测试断言（`internal-trial-enterprise-access-token-provider.test.ts:73-74`）：
  ```ts
  await expect(acquire({ requiredPermission: "configuration.read" }))
    .rejects.toMatchObject({ code: "internal_trial_token_permission_missing" });
  ```
- 字面 `http-enterprise-model-gateway-client.integration.test.ts:265` 字面 `permissions: ["model.use"]`（单 permission token）✅；
- 字面 `internal-trial-enterprise-access-token-provider.test.ts:35, :135` 字面 test token 仅 `permissions: ["model.use"]` —— **测试用 token 与用户声明"按授权只含 model.use"完全一致** ✅。

### 2.2 B 段：3 个 focused test 复跑结果

✅ **全部 PASS**（实测 2026-08-29 17:21:29）：

| 门禁 | 用户声明 | 实测 |
|---|---|---|
| `internal-trial-enterprise-access-token-provider.test.ts` | 5/5 PASS | **5 tests PASS**（`internal-trial-enterprise-access-token-provider.test.ts` 5 字面 expect 调用） ✅ |
| `enterprise-configuration-token-session.test.ts` | 5/5 PASS | **5 tests PASS** ✅ |
| `http-enterprise-model-gateway-client.integration.test.ts` | 5/5 PASS | **5 tests PASS** ✅ |
| 合计 | 15/15 PASS | **Test Files 3 passed (3) / Tests 15 passed (15) / Duration 1.54s** ✅ |

### 2.3 C 段：范围边界（用户声明）

✅ **全部只读命中**（实测）：

| 范围项 | 用户声明 | 实测 |
|---|---|---|
| 未修改 Renderer | ✅ | Renderer 文件无 `InternalTrialEnterpriseAccessTokenProvider` 引用 ✅ |
| 未修改 Main / Preload | ✅ | apps/desktop/src/main 与 apps/desktop/src/preload 无引用 ✅ |
| 未修改 Admin | ✅ | apps/admin-console 无引用 ✅ |
| 未修改 Contract | ✅ | packages/contracts 无引用 ✅ |
| 未修改 migration | ✅ | `services/core/src/adapters/sqlite/migrations.ts` 末项仍是 `id: 26`（实测） ✅ |
| 未修改依赖 | ✅ | lockfile digest `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31`（实测不变） ✅ |
| 未修改 lockfile | ✅ | 同上 ✅ |
| 实现位置 | `services/core/src/adapters/environment/internal-trial-enterprise-access-token-provider.ts` | ✅ 文件真实存在 257 行 ✅ |
| Test 位置 | `services/core/tests/internal-trial-enterprise-access-token-provider.test.ts` | ✅ 文件真实存在 139 行 ✅ |
| 接入点（**诚实边界**） | 由下一段接入 liveModels / Runtime Handle / Entitlement / Task Lock | **本批未接入**：`create-desktop-private-runtime.ts:431` 字面仍 `new FailClosedModelProvider()`（实测） |

### 2.4 D 段：边界字面（不归因 + 不漂移）

✅ **全部字面命中**（实测）：

| 边界项 | 字面 | 状态 |
|---|---|---|
| lockfile digest | `pnpm-lock.yaml` SHA256 = `5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31` | ✅ 不变 |
| migration max | `services/core/src/adapters/sqlite/migrations.ts:1418` 字面 `id: 26` | ✅ 不变 |
| production Helper binary | `apps/desktop/resources/personal-credential-helper/` 目录不存在 | ✅ 不冒充 production ready |
| frozen STRM-3 evidence.json | SHA256 = `64bff1d5b3432bdbb61ab141b8658e454e8e59d02860a04844972481ee31a817` | ✅ |
| frozen DFI-4A.4.1 evidence.json | SHA256 = `5efbe9268e195b4acb9318e69e65f1c1e81cc94ac5945e012a529fb2509d67d1` | ✅ |
| frozen DFI-4A.4.2 evidence.json | SHA256 = `91dbce4eb0331e4b153659dada18dd29c1dfc0be1da77d9084700a7156faceeb` | ✅ |
| frozen DFI-5.4.3 evidence.json | SHA256 = `6a11b1b2768276f58b263b9cd8a63f5096dbd735b51ef3b21e8910225e81cae3` | ✅ |

---

## 三、复跑结果汇总

### 3.1 必跑门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| Node 版本 | `node --version` | v24.13.0 ✅ |
| pnpm 版本 | `pnpm --version` | 11.11.0 ✅ |
| Token Provider focused tests | `pnpm exec vitest run services/core/tests/internal-trial-enterprise-access-token-provider.test.ts` | 5/5 PASS ✅ |
| Token Session 回归 | `pnpm exec vitest run services/core/tests/enterprise-configuration-token-session.test.ts` | 5/5 PASS ✅ |
| Enterprise HTTP Gateway | `pnpm exec vitest run services/core/tests/http-enterprise-model-gateway-client.integration.test.ts` | 5/5 PASS ✅ |
| 合计 | 3 files / 15 tests | **PASS**（Duration 1.54s） ✅ |
| Core typecheck | `pnpm exec tsc -b --pretty false services/core` | exit 0 ✅ |
| 聚焦 ESLint | `npx eslint services/core/src/adapters/environment/internal-trial-enterprise-access-token-provider.ts services/core/tests/{internal-trial-enterprise-access-token-provider,enterprise-configuration-token-session,http-enterprise-model-gateway-client.integration}.test.ts` | exit 0 ✅ |

### 3.2 字面只读核对（不计入门禁，仅事实校对）

| 字面落点 | 内容 | 状态 |
|---|---|---|
| `:108-110` | `delete input.environment[variableName]` 一次性删除 | ✅ |
| `:74-99` | `#lease` 字段 + `Object.freeze({...})` Core 私有内存 | ✅ |
| `:200-211` | `internal_trial_token_expired` / `_ttl_insufficient` typed error | ✅ |
| `:166-184` | `_audience_mismatch` / `_permission_missing` / `_scope_mismatch` typed error | ✅ |
| `:137-144` | `renew()` 字面 throw `internal_trial_token_renewal_unavailable` | ✅ |
| `:66-73` | docstring 字面"Central still verifies the compact token signature, issuance, expiry, permission and scope on every request" | ✅ |
| `:20-27` | `PermissionSchema` 6 枚举 `configuration.read / model.use / tool.use / agent.use / skill.use / knowledge.use` | ✅ |
| `:157-162, :172-177` | `#assertUsable` 严格 `permissions.includes(requiredPermission)` fail-closed | ✅ |
| `:225-231` | `boundedCompactToken` 长度 + 字符集严格校验 | ✅ |
| `:233-250` | `decodeClaims` JWS 三段 + base64url + JSON parse + Zod strict schema | ✅ |
| `:101-124` | `consume()` 唯一 env 入口；返回 Provider 或 undefined | ✅ |
| `test:73-74` | 测试字面断言 `requiredPermission: "configuration.read"` → `_permission_missing` | ✅ |

### 3.3 既有 frozen 引用（不归因本批）

- **前端并行批 `settings-adapter.ts rootRealPath` 边界**：与本批无关，不归因。
- **Core `FailClosedModelProvider` 接入点**：本批**未替换** `create-desktop-private-runtime.ts:431` 字面 `new FailClosedModelProvider()` —— Provider 实现已交付，但**接入由下一段（liveModels / Runtime Handle / Entitlement / Task Lock）完成**。这是诚实边界，本 QA 不评估接入。
- **历史 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.4.3 harness**：保持只读，不归因本批。

---

## 四、诚实边界结论

✅ **字面诚实**。本批最高只确认 VS1.1 后端子项 `internal-trial Token Provider + Session 回归 + Enterprise HTTP Gateway` 工程 conformance：

- **Provider 6 项行为** = `已实现 + 15 tests PASS`（`consume()` 入口 + 7 个 typed fail-closed + no renew + JWS-claim-only-lease + `model.use`-only-permission 字面落点）；
- **范围边界** = `已遵守`（未修改 Renderer / Main / Preload / Admin / Contract / migration / 依赖 / lockfile）；
- **接入 normal graph** = `未接入`（`create-desktop-private-runtime.ts:431` 字面仍 `new FailClosedModelProvider()`，Provider 类定义后未挂入 bootstrap / `liveModels` / `RuntimeAdapterHandles` / Entitlement / Task Lock）—— 由用户声明的下一段完成。

VS1.1 后端子项字面声明：
- 本批只交付 Provider 实现 + 15 tests + 7 fail-closed typed error code；
- 不关闭 VS1.1 整体 —— liveModels / Runtime Handle / Entitlement / Task Lock 接入 + 真实纯文本回复 + 联合 E2E 仍未关闭；
- 不开启 Personal Model / Admin / TGM / Knowledge / Agent Lifecycle / production identity / publicProductionReady 等下游路线；
- Core 版本字面 `0.0.0-dfi.4a.4.2` 未 bump（VS1.1 前端 `0.0.0-mvp.vs1.frontend.1` 已独立 bump）；
- CHANGELOG.md / DEVELOPMENT-LOG.md 字面仅记录 VS1.1 前端条目，**未含本后端子项独立条目** —— 建议用户接受本 QA 后在下一段接入完成时合并记录（不归因本批）。

---

## 五、QA 结论

```text
CODE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（不附条件修订）
可冻结：是（仅 VS1.1 后端子项 Provider + Session + Gateway，不含接入）
保持 INDEPENDENT QA PENDING：是
```

VS1.1 Backend Internal-Trial Token Provider + Enterprise HTTP Gateway 后端子项的事实基础（`internal-trial-enterprise-access-token-provider.ts` 257 行字面覆盖 6 项行为 + 7 个 typed fail-closed + 3 files / 15 tests PASS + Core typecheck PASS + 聚焦 ESLint PASS + 范围边界未修改 Renderer/Main/Preload/Admin/Contract/migration/依赖/lockfile + lockfile digest 不变 + migration max=26 + Helper binary 目录不存在 + 4 个 historical evidence SHA256 不漂移 + Provider 未接入 normal graph 诚实字面）全部只读可证。

6 项独立评审问题逐项可独立回答：

1. **是**：一次性读取并立即删除环境变量 —— `:108-110` 字面 + test 字面 `expect(environment).not.toHaveProperty(...)` ✅
2. **是**：Token 仅保存在 Core 私有内存中 —— `:74-99` 字面 `#lease` 字段 + `Object.freeze` + 接口注释"must never enter logs, persistence, fixtures, or public Contracts" ✅
3. **是**：缺失 / 格式错误 / 过期 / TTL 不足 / audience/permission/scope 不匹配 → 全部 fail-closed —— 7 个 typed error code 字面落点 ✅
4. **是**：禁止续签或替换预签 Token —— `:137-144` 字面 `renew()` 永远 throw ✅
5. **是**：JWS claims 仅用于构造本地 lease，不被当作认证结果 —— `:66-73` docstring + `:233-250` decodeClaims 字面 ✅
6. **是**：Token 按授权只含 `model.use`，不能读取 `configuration.read` —— test 字面 `configuration.read` → `_permission_missing` ✅

---

## 六、建议接受流程

1. **用户审阅本报告**：P0 = 0 / P1 = 0 / P2 = 0 / P3 = 0；评审结论 **PASS（不附条件修订）**；可冻结：**是**（仅 VS1.1 后端子项 Provider + Session + Gateway，不含接入）；保持 `INDEPENDENT QA PENDING` → 待用户接受。
2. **决策 1**：是否要求在下一段接入时显式记录"Provider 替换 FailClosedModelProvider + `liveModels` 注入 + Runtime Handle + Entitlement + Task Lock"的接入字面（推荐：单独条目放在 DEVELOPMENT-LOG.md，避免与本批 Provider 实现混淆）。
3. **决策 2**：VS1.1 后端子项（Provider 实现 + Session + Gateway）是否可进入 `PASS/CLOSED`（**推荐要求**先确认本报告 6 项 Provider 行为字面落点 + 3 files / 15 tests harness 已实测 PASS + Core typecheck PASS + 聚焦 ESLint PASS + lockfile digest 不变 + 4 个 historical evidence SHA256 不漂移 + Provider 未接入 normal graph 诚实字面）。
4. **后续路径**（与用户声明一致）：
   - VS1.1 后端 Provider 子批接受后用户单独继续下一段接入：deployment-provided frozen Model/Registry facts 接入 `liveModels` + Runtime Handle + Entitlement + Task Lock；
   - 接入段接受后用户单独授权真实纯文本回复联合 E2E（仍属 VS1.1 整体）；
   - VS1.1 整体接受后用户单独授权 VS1.2（Platform/Agent/Skill/Tool + 真实 Model Tool Call）；
   - VS1.2 接受后用户单独授权 VS1.3（Artifact / restart E2E）；
   - 三阶段全关闭后输出唯一 outcome = `MVP_VERTICAL_SLICE_1_USABLE`，production identity / Personal Model / Admin / TGM / Knowledge / Agent Lifecycle 继续 GATED/false。
5. **VS1.1 后端 Provider 子批关闭后**：仅允许声明本子项工程 conformance（Provider 实现 + 15 tests + 7 typed fail-closed）；**不**宣称：
   - 真实企业 Model 组合已生效；
   - `internalTrialReady = true` / `MVP_VERTICAL_SLICE_1_USABLE`；
   - desktop normal graph 已消费 internal-trial profile；
   - liveModels 已包含 deployment-provided Model。

代码 QA 通过**不等于**用户接受。VS1.1 后端子项当前保持 `INDEPENDENT QA PENDING`，待：
- 用户接受本报告；
- 用户按上述决策给出指令；
- 用户单独接受 VS1.1 后端子项 Provider + Session + Gateway 为 `PASS/CLOSED`（仅本子项，不含接入）。

方可启动下一段接入（liveModels / Runtime Handle / Entitlement / Task Lock）。本报告未授权任何代码、依赖、配置、migration、lockfile、Harness 或 Evidence 修改。

独立代码 QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）