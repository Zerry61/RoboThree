# VS1.1 Backend Token Provider 修复 — Claude Code 聚焦 re-QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-29-1755-recode-vs1.1-backend-token-provider` |
| 验收对象 | **仅 2 项新增负向断言**：<br>① audience 必须严格 = `enterprise-model-gateway`（其他值立即 fail-closed）<br>② permissions 必须严格 = `["model.use"]`（多权限 / 其他权限值立即 fail-closed）<br>附带保证：拒绝时 env var 仍立即删除 |
| 日期 | 2026-08-29 |
| 复核者 | Claude Code（独立 QA，仅只读，不修改任何业务代码/Contract/依赖/migration/lockfile） |
| 上游 | VS1.1 Backend Token Provider 完整 QA 报告 [`vs1.1-backend-code-claude-qa.md`](vs1.1-backend-code-claude-qa.md)（`P0=0/P1=0/P2=0/P3=0` PASS — **基础事实基础不变**，仅补充 2 项新增负向断言的字面证据） |
| 当前状态 | **Provider 修复后 `2 files / 11 tests PASS`** + Core typecheck PASS + 聚焦 ESLint PASS |

---

## 一、聚焦 re-QA 范围与方法

### 1.1 范围（仅 2 项新增负向断言）

用户已确认："原报告中 'Provider 尚未接入 normal graph' 和 '版本暂未升级' 的判断是准确的，因为 VS1.1 还在开发中"。本次 re-QA **不复跑完整 QA**，**仅聚焦验证 2 项新增负向断言的字面落点**：

1. 字面 `INTERNAL_TRIAL_AUDIENCE = "enterprise-model-gateway"` frozen string + 严格相等断言；
2. 字面 `INTERNAL_TRIAL_PERMISSION = "model.use"` frozen string + `permissions.length === 1 && permissions[0] === "model.use"` 严格相等断言；
3. 拒绝路径（多权限 / 错误 audience）→ `consume()` throw typed error，**同时** env var 已 `delete`。

### 1.2 不变事实（基础事实基础继续生效）

- 上次 QA 报告 `P0=0/P1=0/P2=0/P3=0` 字面事实基础继续生效（Provider 类未改 schema、fail-closed 路径仍生效）；
- Provider 仍未接入 normal graph（`create-desktop-private-runtime.ts:431` 字面仍 `new FailClosedModelProvider()`）；
- Core 版本仍 `0.0.0-dfi.4a.4.2` 未 bump；
- lockfile digest / migration max=26 / 4 个 historical evidence SHA256 不变（不归因本批）；
- 不评估 liveModels / Runtime Handle / Entitlement / Task Lock（用户声明继续推进）。

### 1.3 方法

- 字面只读核对 `services/core/src/adapters/environment/internal-trial-enterprise-access-token-provider.ts`（修复后）；
- 字面只读核对 `services/core/tests/internal-trial-enterprise-access-token-provider.test.ts`（修复后）；
- 实跑 `pnpm exec vitest run 2 focused test files`（修复后 11 tests）；
- 实跑 `pnpm exec tsc -b services/core`；
- 实跑聚焦 ESLint（仅 3 个本批涉及文件）；
- 不复跑历史 STRM-3 / DFI-4A.4.1 / DFI-4A.4.2 / DFI-5.4.3 harness / 不复跑 Enterprise Gateway 测试 / 不复跑 settings-adapter.ts 边界。

---

## 二、聚焦 re-QA 关键事实核对

### 2.1 字面落点 1：audience 严格等于 `enterprise-model-gateway`

✅ **可独立落地**（实测 `internal-trial-enterprise-access-token-provider.ts` 修复后）：

- 字面 `:50` frozen string：
  ```ts
  const INTERNAL_TRIAL_AUDIENCE = "enterprise-model-gateway";
  ```
- 字面 `:249` 严格相等断言（在 `decodeClaims` 内，**先于 `#assertUsable` 与 provider 构造**）：
  ```ts
  if (claims.audience !== INTERNAL_TRIAL_AUDIENCE
    || claims.permissions.length !== 1
    || claims.permissions[0] !== INTERNAL_TRIAL_PERMISSION) {
    throw invalidToken();
  }
  ```
- 与原 QA 报告 §2.1 A3 `_audience_mismatch` 不同：原 `#assertRequest`（`:168`）是 request.audience vs lease.audience 校验；新增 `:249` 是 **consume 时 claims.audience vs `enterprise-model-gateway`** 字面强制冻结 —— **两道独立 audience 校验**，第一道 consume 时 frozen audience，第二道 request 时 runtime audience。

### 2.2 字面落点 2：permissions 严格等于 `["model.use"]`

✅ **可独立落地**：

- 字面 `:51` frozen string：
  ```ts
  const INTERNAL_TRIAL_PERMISSION = "model.use";
  ```
- 字面 `:249-251` 严格断言（同上）：
  ```ts
  if (claims.audience !== INTERNAL_TRIAL_AUDIENCE
    || claims.permissions.length !== 1          // ← 长度必须为 1（多权限/空权限均 fail-closed）
    || claims.permissions[0] !== INTERNAL_TRIAL_PERMISSION) {  // ← 唯一权限必须为 "model.use"
    throw invalidToken();
  }
  ```
- 与原 QA 报告 §2.1 A6 `_permission_missing` 不同：原 `#assertUsable` + `#assertRequest`（`:157-162, :172-177`）是 runtime 调用时 requiredPermission vs lease.permissions 校验；新增 `:249-251` 是 **consume 时 permissions 必须是且仅是 `["model.use"]`** 字面强制冻结 —— **两道独立 permissions 校验**，第一道 consume 时 frozen permissions list，第二道 runtime 时 requiredPermission。

### 2.3 字面落点 3：拒绝时 env var 仍立即删除

✅ **可独立落地**：

- 字面 `consume()`（`:108-126`）：
  ```ts
  const variableName = input.variableName
    ?? INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV;
  const compactToken = input.environment[variableName];
  delete input.environment[variableName];   // ← 第 111 行：先 delete
  if (compactToken === undefined || compactToken.length === 0) return undefined;
  
  try {
    const provider = new InternalTrialEnterpriseAccessTokenProvider({
      clock: input.clock,
      compactToken: boundedCompactToken(compactToken),
      claims: decodeClaims(compactToken),     // ← 第 118 行：decodeClaims 内部已执行 :249-251 严格断言
    });
    ...
  } catch (error) {
    if (error instanceof InternalTrialEnterpriseAccessTokenError) throw error;
    throw invalidToken();
  }
  ```
- 字面顺序：**`:111 delete` → `:118 decodeClaims` → `:249-251` 严格断言 → `:252 throw invalidToken()`** —— **env var 在任何 throw 之前已被删除**，与用户声明"即使拒绝，环境变量也立即删除"严格对齐 ✅。

### 2.4 test 字面证据（修复后 2 files / 11 tests）

✅ **字面命中**（实测 `internal-trial-enterprise-access-token-provider.test.ts`）：

| Test 名称 | 字面 | 验证目标 |
|---|---|---|
| `:20` `consumes the environment value once and returns an exact in-memory lease` | 正例 baseline `audience: "enterprise-model-gateway"` + `permissions: ["model.use"]` | 正例通过 |
| `:42` `deletes malformed bearer material without exposing it in the error` | 字面 `:46-49`：错误 token → `internal_trial_token_invalid` + `expect(environment).not.toHaveProperty(...)` | env 立即删除 ✅ |
| **`:57` `rejects a bearer with excess permission or the wrong audience at consumption`**（**新增负向断言**） | 字面 `:59-60`：`compactToken({ permissions: ["configuration.read", "model.use"] })` + `compactToken({ audience: "configuration-service" })` —— **两条负向 case**；字面 `:63-66`：`expect(...).toThrowError({ code: "internal_trial_token_invalid" })` + `expect(environment).not.toHaveProperty(...)` | **新增负向断言 + env 立即删除** ✅ |
| `:70` `fails closed for expiry, insufficient TTL, audience, permission and scope drift` | runtime 阶段 4 项 fail-closed 字面落点 | 原 runtime fail-closed 仍生效 ✅ |
| `:100` `does not renew or replace the pre-issued bearer` | 字面 throw `internal_trial_token_renewal_unavailable` | 续签禁止仍生效 ✅ |
| `:116` `returns undefined when the internal-trial token was not configured` | 字面 `if (compactToken === undefined || compactToken.length === 0) return undefined;` | 缺失返回 undefined ✅ |

### 2.5 复跑门禁（修复后）

✅ **全部 PASS**（实测 2026-08-29 17:28:59）：

| 门禁 | 用户声明 | 实测 |
|---|---|---|
| `pnpm exec vitest run 2 files` | 2 files / 11 tests PASS | **Test Files 2 passed (2) / Tests 11 passed (11) / Duration 132ms** ✅ |
| Core typecheck | PASS | exit 0（无输出） ✅ |
| 聚焦 ESLint | PASS | exit 0（无输出） ✅ |

---

## 三、聚焦 re-QA 结论

```text
FOCUSED_RE_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
评审结论：PASS（仅 2 项新增负向断言字面验证）
基础事实基础继续生效：上次完整 QA 报告 P0=0/P1=0/P2=0/P3=0 不变
可冻结：是（仅 VS1.1 Backend Token Provider 修复子项）
保持 INDEPENDENT QA PENDING：是
```

VS1.1 Backend Token Provider 修复的事实基础（`INTERNAL_TRIAL_AUDIENCE = "enterprise-model-gateway"` frozen string + `INTERNAL_TRIAL_PERMISSION = "model.use"` frozen string + `:249-251` 严格相等断言 + `:111 delete` 先于 `:252 throw` + test 字面 `:57` 新增负向断言 + test 字面 `:63-66` 同时断言 fail-closed + env 立即删除 + 2 files / 11 tests PASS + Core typecheck PASS + 聚焦 ESLint PASS）全部只读可证。

2 项新增负向断言字面证据：

1. **是**：audience 严格 = `enterprise-model-gateway` —— `:50` 字面 frozen string + `:249` 字面 `claims.audience !== INTERNAL_TRIAL_AUDIENCE` + test `:60` 字面 `audience: "configuration-service"` 负向用例 ✅
2. **是**：permissions 严格 = `["model.use"]` —— `:51` 字面 frozen string + `:250-251` 字面 `permissions.length !== 1 || permissions[0] !== INTERNAL_TRIAL_PERMISSION` + test `:59` 字面 `permissions: ["configuration.read", "model.use"]` 多权限负向用例 ✅
3. **是**（附带保证）：拒绝时 env var 仍立即删除 —— `:111` 字面 `delete input.environment[variableName]` 先于 `:252` 字面 `throw invalidToken()` + test `:66` 字面 `expect(environment).not.toHaveProperty(INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV)` ✅

---

## 四、不变事实确认（用户已确认准确）

✅ 用户已确认上次 QA 报告中两条诚实边界判断**准确**：

1. **Provider 尚未接入 normal graph**：`create-desktop-private-runtime.ts:431` 字面仍 `new FailClosedModelProvider()` —— Provider 类定义后未挂入 bootstrap / `liveModels` / `RuntimeAdapterHandles` / Entitlement / Task Lock；
2. **Core 版本暂未升级**：Core `package.json` 字面仍是 `0.0.0-dfi.4a.4.2`，与 VS1.1 前端 `0.0.0-mvp.vs1.frontend.1` 不对称。

VS1.1 仍在开发中，**Token Provider 不是独立开发批**，完整 VS1.1 编码授权仍然有效。

---

## 五、后续路径（用户已声明）

1. 用户接受本聚焦 re-QA 报告后，Token Provider 子项可以视为字面 closed（Provider 实现 + 7 个 typed fail-closed + 2 项新增 consume 时严格冻结）；
2. 用户继续接 `liveModels` / Registry / Entitlement / Runtime Handle / Task Lock；
3. 等真实文本链路完成后，再做**完整 VS1.1 Backend QA 和前后端联合验收**（不归因本次聚焦 re-QA）；
4. 完整 VS1.1 接受后用户单独授权 VS1.2 / VS1.3。

聚焦 re-QA 通过**不等于**用户接受，也不关闭 VS1.1 整体。Token Provider 修复子项当前保持 `INDEPENDENT QA PENDING`，待：
- 用户接受本报告；
- 用户继续推进接入段。

独立聚焦 re-QA 全程只读，未触发任何产品运行时依赖；仅落盘本 QA 报告供用户决策。

— Claude Code（独立 QA，代码只读）