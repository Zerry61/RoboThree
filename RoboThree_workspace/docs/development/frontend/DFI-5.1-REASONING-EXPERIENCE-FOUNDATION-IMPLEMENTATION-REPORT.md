# DFI-5.1 Reasoning Experience Foundation 实施报告

> 状态：**INDEPENDENT QA PASS / USER ACCEPTED / PASS/CLOSED**  
> 日期：2026-08-25  
> 负责人：Codex 5.6  
> 上游：DFI-5.0 `PLAN REVIEW PASS/CLOSED`  
> 下游：DFI-5.2～5.4、AAPI-0.3～0.4、TGM、Knowledge Provider 继续 `GATED`

## 1. 本批结论

DFI-5.1 已实现 safe Preview / Projection、独立 Experience Preference、migration 26 三张 STRICT 表、
owner 独立 HMAC namespace、CAS 与 durable Receipt。该批只建立“支持事实预览与偏好持久化基础”，没有把
Max 接入 Task、Model Protocol、Provider、Desktop Main/Preload/Renderer，也没有声明 Max 已对模型调用生效。

本批最高允许输出：

```text
DFI51_REASONING_EXPERIENCE_FOUNDATION_CONFORMANT
```

独立 QA 已完成并由用户正式接受，DFI-5.1 现为 `PASS/CLOSED`。该关闭不自动解锁 DFI-5.2～5.4。

## 2. 实现内容

### 2.1 Contract 与安全 Projection

- 新增 Core-private `@robothree/contracts/reasoning-mode/v1alpha1` 独立 subpath Profile，且不从 Contracts 根入口
  导出；Architecture boundary 禁止 Renderer/Preload 导入。Profile 精确绑定 model capability revision、Adapter descriptor
  revision、authority 与 Personal Model execution definition digest；只有 `supported` Profile 可以携带一个
  Provider-private Max strategy；
- 新增 Desktop Local `v1alpha3` Reasoning Mode Contract：Preview、Preference Query、CAS Update Command 与
  durable Receipt；
- Preview 只投影 `supported | unsupported | unknown`、support revision、安全原因、`default | max` 偏好、
  preference revision 和身份 readiness；不投影 raw effort、thinking budget、Provider 参数、strategy material、
  Credential 或 owner digest；
- test identity 与 production identity readiness 互斥，owner 不可信时 Preference 只返回 `default + unavailable`。

### 2.2 Owner authority 与独立 HMAC namespace

- 新增 `desktop_experience_owner_scope_namespaces`，使用 32～64 字节随机 key；
- owner identity 仅由 `enterpriseId + userId + deviceId` 在独立 domain
  `robothree.desktop-experience-preference-owner.v1` 下 HMAC 派生；
- namespace key 不进入 record JSON、Contract、Receipt、日志或 Projection；仅以独立 check digest 与 record
  digest 检测损坏；
- Runtime Active authority 必须与当前 `clientInstanceId` 精确匹配；rebind 后旧 client command fail-closed，
  但 clientInstanceId 不进入 durable owner identity；
- namespace 并发初始化只接受 durable single winner，调用方持有的 key 副本在派生完成后清零。

### 2.3 Experience Preference、CAS 与 durable Receipt

- `desktop_reasoning_mode_preferences` 保存每个 owner 的单一 `default | max` 偏好和严格单调 revision；
- `desktop_reasoning_mode_preference_receipts` 以 owner + commandId 唯一，保存 request digest、expected/committed
  revision、outcome 与 receipt digest；
- Preference 与 Receipt 在同一 `BEGIN IMMEDIATE` transaction 内提交；任一失败整体回滚；
- exact command replay 返回同一 Receipt；同 commandId 不同 request material 返回 typed conflict；
- stale CAS 与并发 contender 只有一个 winner，loser 不写第二条 Preference 或 Receipt；
- InMemory 与 SQLite Adapter 共用相同 domain validator 和 conformance 矩阵，load 时逐字段重算 digest。

### 2.4 migration 26

- additive 新增三张 `STRICT` 表：
  `desktop_experience_owner_scope_namespaces`、`desktop_reasoning_mode_preferences`、
  `desktop_reasoning_mode_preference_receipts`；
- active namespace 使用 partial unique index；Preference / Receipt 通过 composite owner FK 绑定 namespace；
- schema preflight 校验 required columns、STRICT、PK、FK、partial unique index；
- migration 1～25 不改写；25→26 与 historical reconstruction 已加入回归。

## 3. 文件边界

本批修改范围：

- `packages/contracts/src/reasoning-mode/**`；
- `packages/contracts/src/desktop-local/v1alpha3/**` 与受控 export；
- `services/core/src/application/**`、`ports/**`、`adapters/memory/**`、`adapters/sqlite/**`；
- migration 26、schema preflight、对应 tests；
- Contracts/Core 版本与既有 packaging audit 的精确版本基线；
- 本报告及治理摘要。

本批未修改 Root 版本、依赖或 lockfile，未进入 Central、Document Worker、Desktop Main/Preload/Renderer、
Admin、Task lock、SubmitTurn、Model Protocol、Provider mapping、Agent Loop、TGM 或 Knowledge Provider。

Root 保持并发 PTX-2 的 `0.0.0-ptx.2`；本批实际修改的 Contracts/Core 独立推进到
`0.0.0-dfi.5.1`，避免回退或冒领 PTX-2 的共享组件版本事实。

## 4. 开发者验证

已通过：

- DFI-5.1 focused + migration/historical regression：`8 files / 36 tests PASS`；
- Contracts/Core/root build：PASS；
- `pnpm run lint`：PASS，Architecture boundary PASS；
- 既有 `audit:dtp4` 在 DFI-5.1 Contracts/Core 精确版本基线上 PASS；
- `pnpm install --frozen-lockfile --offline`：PASS；本批未引入依赖，lockfile 未由本批修改，最终 digest 为
  `c47641ac78aa6ccd8cfbef139e0823fbe343615b5b3749f965a20a335f815a07`。

完整 `pnpm run check` 最终从零复跑：`251 files / 1678 tests + 3 smoke PASS`。此前两轮全套并发执行中，
既有 `DCF-1.3C stability Harness` 曾各有一次未观察到最终 SQLite reopen；同一 Harness 从零单独复跑
`1 file / 1 test PASS`，最终全套复跑也通过，因此作为环境时序注记保留，不构成当前门禁阻断。

Central online/offline 在开发者环境因缺少 JDK 21 未运行；独立 QA 已在 JDK 21.0.12 + Docker 环境串行补跑，
两项均为 `404/404 PASS`。

## 5. 独立 QA 与用户接受

独立 QA 结论：`PASS（P0=0、P1=0、P2=0、P3=0）`。独立复跑 focused、完整
`251 files / 1678 tests + 3 smoke + Architecture boundary`、Central online/offline `404/404` 与 lockfile
核验全部通过；用户已正式接受并关闭 DFI-5.1。

独立 QA 已核查：

1. Preview 是否只返回安全三态与 revision，Profile-private strategy 是否完全不可达；
2. owner namespace 是否真正独立、key corruption 是否启动/读取 fail-closed；
3. migration 26 三表 STRICT / FK / partial unique 与 migration 1～25 零漂移；
4. Preference + Receipt 是否同事务原子，CAS concurrent single winner；
5. exact replay 与 same command/different material conflict 是否严格；
6. owner unavailable、session rebind、test identity 是否都不冒充 production ready；
7. DFI-5.2～5.4 是否仍不可达，尤其 Task、Provider、Desktop UI 不得提前接线；
8. JDK 21 + Docker 下 Central online/offline 补跑，并关注既有 DCF-1.3C 并发收敛稳定性。
